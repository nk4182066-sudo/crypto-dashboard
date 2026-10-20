import { LIVE_CAPS } from "@/src/lib/signalsLive";
import { cached, cacheGet } from "@/src/lib/cache";
import { getCachedSnapshot, runScan, type ScanResult, type ScanSnapshot } from "@/src/scanner/scanner";
import { startScheduler } from "@/src/scanner/scheduler";
import { scanUniverse, type ScanMarket, type ScanTarget } from "@/src/scanner/universe";
import type { Candle } from "@/src/analysis/types";
import { generateFullSignal } from "@/src/lib/signalGenerator";
import { buildConfirmations, buildEducators, type ConfirmationIndicator, type Consensus, type EducatorVerdict } from "@/src/lib/confirmations";
import { calculateIndicators, indicatorsAgreed, type IndicatorRow } from "@/src/lib/indicatorEngine";
import { persistSignals, persistToHistory, type CloudDoc } from "@/src/lib/signalCloud";
import { analyzeCoin, type ConditionLine } from "@/src/lib/analyzeCoin";
import { computeSignalTier, type SignalTier } from "@/src/lib/strictSignalEngine";

export const dynamic = "force-dynamic";

startScheduler();

const validMarkets: ScanMarket[] = ["crypto", "forex", "stocks", "metals"];

/** How many extra all-coins symbols we scan per market (above the minimums). */
// Per-market scan pool = static universe + these extras, capped so a cold
// serverless instance always returns a full page (crypto 50 / forex 30 /
// stocks 30 / metals 10 = 120 candidates, 24 history-fetch budget per request).
const DYNAMIC_LIMITS: Record<ScanMarket, number> = {
  crypto: 12,
  forex: 14,
  stocks: 8,
  metals: 4,
};

/** One coin row from /api/market/all-coins (only the fields we need). */
interface AllCoinsCoin {
  symbol: string;
  label?: string;
  market?: string;
  quoteVolume?: number;
}

/**
 * Flattens an emitted setup into the Firestore document (MASLA 2 spec fields):
 * entry1/entry2, stopLoss, TP1-3, trend, reasoning, timeframe, consensus "X/4"
 * and the 4 educators — plus the full MarketSignal payload so the Signals page
 * can rebuild the exact card from the cloud document.
 */
function toCloudDoc(signal: MarketSignal, timeframe: string): CloudDoc | null {
  let full: ReturnType<typeof generateFullSignal>;
  try {
    full = generateFullSignal({
      symbol: signal.symbol,
      market: signal.market,
      price: signal.price,
      direction: signal.direction,
      support: signal.support,
      resistance: signal.resistance,
      pattern: signal.pattern,
      score: signal.score,
      bias: signal.bias,
      reason: signal.reason,
      chartPattern: signal.chartPattern,
      chartPatternNote: signal.chartPatternNote,
      // DYNAMIC ATR plan — the SAME volatility + timeframe the emitting
      // analyzeCoin() run used, so stored TP/SL equal the card and chart.
      atr: signal.atr,
      timeframeMinutes: signal.timeframeMinutes,
      candlestick: signal.candlestick
        ? {
            name: signal.candlestickPattern!,
            confidence: signal.candlestickConfidence,
            // Derive type from the pattern name so a bullish Morning Star is
            // never mislabeled "Bearish" just because the setup direction is
            // bearish. Falls back to signal.direction only when the name is
            // unknown.
            type:
              signal.candlestickType ??
              (/\b(bearish|double top|head and shoulders|shooting star|engulfing down)\b/i.test(
                signal.candlestickPattern ?? ""
              )
                ? "bearish"
                : /\b(bullish|double bottom|morning star|hammer|engulfing up)\b/i.test(
                  signal.candlestickPattern ?? ""
                )
                  ? "bullish"
                  : "neutral"),
          }
        : null,
    });
  } catch (error) {
    console.warn(`[toCloudDoc] REJECT signal ${signal.symbol}:`, error);
    return null;
  }
  const agreed = signal.experts?.consensus.agreed ?? null;
  const total = signal.experts?.consensus.total ?? 4;
  if (!full) return null;
  return {
    ...signal,
    timeframe,
    trend: full.trend,
    entry1: full.entry1,
    entry2: full.entry2,
    stopLoss: full.stopLoss,
    tp1: full.tp1,
    tp2: full.tp2,
    tp3: full.tp3,
    reasoning: signal.reason,
    consensus: agreed === null ? null : `${agreed}/${total}`,
    createdAt: Date.now(),
  };
  return null;
}

/** One enriched analysis card for the Signals page. Educational only. */
export interface MarketSignal {
  symbol: string;
  label: string;
  market: ScanMarket;
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  bias: "Bullish" | "Bearish" | "Sideways";
  price: number;
  pattern: string | null;
  support: number | null;
  resistance: number | null;
  watchLevel: number | null;
  reason: string;
  analyzedAt: string;
  /** Detected classical chart pattern name (e.g. "Double Bottom"), or null. */
  chartPattern: string | null;
  /** Short note for the chart pattern, or null. */
  chartPatternNote: string | null;
  /** Detected candlestick confirmation name (e.g. "Hammer"), or null. */
  candlestickPattern: string | null;
  candlestickType: "bullish" | "bearish" | "neutral" | null;
  /** Detected candlestick confirmation object (name/type/confidence together). */
  candlestick?: { name: string | null; type: "bullish" | "bearish" | "neutral"; confidence: number } | null;
  /** Candlestick confirmation confidence 0-100 (0 when none). */
  candlestickConfidence: number;
  /** MASLA 1/2 — shared analyzeCoin() condition breakdown so the card shows
   *  the exact "X/8 Conditions Passed" both pages compute. */
  conditionsPassed?: number;
  conditions?: ConditionLine[] | null;
  /** Feature 2 — real-data confirmation breakdown (RSI/MACD/EMA/Volume). */
  confirmations?: { indicators: ConfirmationIndicator[]; confirmed: number; total: number } | null;
  /** KAAM 4 — the full 10-indicator institutional panel (value/status/side each). */
  indicators?: IndicatorRow[] | null;
  /** Feature 3 — the 4-educator panel + consensus (agreed >= 3 = delivery-grade). */
  experts?: { educators: EducatorVerdict[]; consensus: Consensus } | null;
/** STRICT tier — PREMIUM / STRONG / GOOD / null (rejected). Never null on an emitted card. */
  tier: SignalTier;
  /** ATR(14) of the emitting 1h candles — drives the DYNAMIC TP/SL plan the
   *  card, stored doc and Trade chart all share (atrPlan.ts). */
  atr?: number | null;
  /** Timeframe class of the emitting candles in minutes (60 for signals). */
  timeframeMinutes?: number | null;
}

// ------------------------------------------------------------------ response cap
// Strict quality > quantity. Return at most N setups per market on every
// request so the list stays stable and we never flood the user.
//
// This used to be an in-memory per-symbol cooldown + daily counter, but those
// live on the serverless instance — a warm instance that had already emitted
// returned 0 on the next request, flip-flopping the page between N and 0.
// 10-20 signals per market per day is the daily target (15 is the sweet spot).
// The response is now capped by count only; duplicate-suppression across
// refreshes is handled by persistSignals()'s 4h per-symbol guard (which reads
// Firestore, shared across instances), so the browser always gets a full list.
const MAX_SIGNALS_PER_MARKET_PER_DAY = 15;

/**
 * How many candidates per request may pull the full 1h/4h/1d history for the
 * deep shared analysis. Bounds cold-request latency (3 fetches each) while the
 * confidence-ordered candidates ensure the best setups are analysed first.
 */
const MAX_FULL_ANALYSES_PER_REQUEST = 24;

/**
 * MASLA 1 — fetch candles from /api/market/history, the EXACT endpoint the
 * Trade page reads (Binance → Yahoo → synthetic chain for crypto, Yahoo for
 * everything else). Scoring these candles — instead of the scanner's separate
 * Yahoo cache — is what guarantees "same coin = same score" on both pages.
 * Short TTL keeps parity with the Trade page's 30s polling cadence.
 */
async function fetchHistoryCandles(
  origin: string,
  market: string,
  symbol: string,
  timeframe: string,
): Promise<Candle[]> {
  return cached<Candle[]>(
    `signals:hist:${market}:${symbol}:${timeframe}`,
    { ttlMs: 20_000, staleMs: 300_000, maxEntries: 8192 },
    async () => {
      try {
        const query = new URLSearchParams({ market, symbol, timeframe });
        const response = await fetch(`${origin}/api/market/history?${query}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) return [];
        const payload = (await response.json()) as { candles?: Candle[] };
        return Array.isArray(payload.candles) ? payload.candles : [];
      } catch {
        return [];
      }
    },
  );
}

/**
 * Maps an all-coins symbol to the Yahoo chart symbol the scanner reads:
 * Binance "BTCUSDT" -> "BTC-USD", "EUR/USD" -> "EURUSD=X", spot metals fall
 * back to the most liquid futures contract, stocks pass through as-is.
 * Returns null when the symbol cannot be scanned.
 */
function toProviderSymbol(symbol: string, market: ScanMarket): string | null {
  if (market === "crypto") {
    return symbol.endsWith("USDT") && symbol.length > 4 ? `${symbol.slice(0, -4)}-USD` : null;
  }
  if (market === "metals") {
    if (symbol.startsWith("XAU")) return "GC=F";
    if (symbol.startsWith("XAG")) return "SI=F";
    if (symbol.startsWith("XPT")) return "PL=F";
    if (symbol.startsWith("XPD")) return "PA=F";
    if (symbol.startsWith("XLC") || symbol.startsWith("XCU")) return "HG=F";
    return null;
  }
  if (market === "forex") return `${symbol.replace(/[/-]/g, "")}=X`;
  return symbol;
}

/** Builds the extra scan targets from the all-coins API (cached 10 minutes). */
async function loadDynamicTargets(origin: string): Promise<ScanTarget[]> {
  return cached(
    "signals:all-coins-targets",
    { ttlMs: 10 * 60 * 1000, staleMs: 30 * 60 * 1000, maxEntries: 4 },
    async () => {
      const response = await fetch(`${origin}/api/market/all-coins`, {
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`all-coins returned ${response.status}`);
      const payload = (await response.json()) as { coins?: AllCoinsCoin[] };
      const coins = Array.isArray(payload.coins) ? payload.coins : [];

      const buckets: Record<ScanMarket, AllCoinsCoin[]> = { crypto: [], forex: [], stocks: [], metals: [] };
      for (const coin of coins) {
        const market: string | undefined = coin.market;
        // Futures duplicate the spot pairs — skip them so one symbol = one scan.
        if (!market || market === "futures" || !(market in buckets)) continue;
        buckets[market as ScanMarket].push(coin);
      }
      // Most liquid crypto first; the static lists are already curated.
      buckets.crypto.sort((first, second) => (second.quoteVolume ?? 0) - (first.quoteVolume ?? 0));

      const targets: ScanTarget[] = [];
      const seen = new Set<string>();
      for (const market of validMarkets) {
        for (const coin of buckets[market].slice(0, DYNAMIC_LIMITS[market])) {
          const symbol = toProviderSymbol(coin.symbol, market);
          if (!symbol) continue;
          const key = `${market}:${symbol}`;
          if (seen.has(key)) continue;
          seen.add(key);
          targets.push({ symbol, market, label: coin.label ?? coin.symbol });
        }
      }
      return targets;
    }
  );
}


/**
 * Market signals endpoint. Scans every coin the all-coins API knows about
 * (plus the static universe), merges with the scanner's ranked snapshot, and
 * returns the requested market sorted by score (highest first). Failures
 * degrade to whatever is cached — never an empty tab.
 * Educational analysis only — not financial advice.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = (searchParams.get("market") ?? "crypto") as ScanMarket;
  if (!validMarkets.includes(market)) {
    return Response.json({ error: "Unsupported market." }, { status: 400 });
  }

  const snapshot: ScanSnapshot | null = getCachedSnapshot();

  // Extra targets from the all-coins API — a provider hiccup must not break
  // the tab, so we simply fall back to the static universe only.
  let dynamicTargets: ScanTarget[] = [];
  try {
    dynamicTargets = await loadDynamicTargets(new URL(request.url).origin);
  } catch (error) {
    console.warn("[market-signals] all-coins targets unavailable:", error);
  }

  const keyOf = (item: { symbol: string; market: ScanMarket }) => `${item.market}:${item.symbol}`;
  const known = new Set((snapshot?.results ?? []).map(keyOf));

  // Cold process (no snapshot yet) -> scan the static universe in the same
  // pass, so the first request still returns full market coverage.
  const wanted = new Map<string, ScanTarget>();
  if (!snapshot) {
    for (const target of scanUniverse) wanted.set(keyOf(target), target);
  }
  for (const target of dynamicTargets) wanted.set(keyOf(target), target);
  const missing = [...wanted.values()].filter((target) => !known.has(keyOf(target)));

  // One shared, cached scan pass: concurrent requests and rapid tab switches
  // reuse the same work instead of hammering the provider.
  //
  // maxEntries raised from 2: cacheSet() evicts the ENTIRE global in-process
  // store down to this number, so the old value of 2 destroyed every per-symbol
  // analysis detail runScan() had just written — getCachedAnalysis() then
  // returned null for all candidates and the page showed 0 signals on a cold
  // serverless instance. Kept high enough that the scan results coexist with
  // the detail/candlestick entries they depend on.
  const extra: ScanResult[] = missing.length
    ? await cached<ScanResult[]>(
        "signals:extra-scan",
        { ttlMs: 5 * 60 * 1000, staleMs: 15 * 60 * 1000, maxEntries: 1016 },
        async () => (await runScan(missing)).results
      )
    : [];

  const merged = new Map<string, ScanResult>();
  for (const item of extra) merged.set(keyOf(item), item);
  for (const item of snapshot?.results ?? []) merged.set(keyOf(item), item);

  // ------------------------------------------------------------------ strict gate
  // Every candidate runs the 8-check gate. Only gate-passing, in-frequency
  // signals are emitted. Anything else is dropped — the UI then shows
  // "No clear setup. Wait karein." Strict quality > quantity.
  const emitted: MarketSignal[] = [];
  const ordered = [...merged.values()]
    .filter((item) => item.market === market)
    .sort((first, second) => second.confidence - first.confidence);

  // Audit — candidate pool per market + per-request emission cap.
  console.log(`[signals ${market}] ${ordered.length} candidates, cap ${MAX_SIGNALS_PER_MARKET_PER_DAY}`);

  type Candidate = (typeof ordered)[number];

  /** One emitted card — shared by the strict tier path. */
  function emitSignal(
    item: Candidate,
    full: ReturnType<typeof analyzeCoin>,
    confirmations: MarketSignal["confirmations"],
    indicatorRows: IndicatorRow[] | null,
    experts: MarketSignal["experts"],
  tier: SignalTier
  ): MarketSignal {
    const direction = full.direction;
    return {
      symbol: item.symbol,
      label: item.label,
      market: item.market,
      tier,
      // MASLA 3 — score = (conditions_passed / 8) * 100 straight from the
      // shared engine (8/8=100, 7/8=88, 6/8=75): identical on Trade + Signals.
      score: full.score,
      direction,
      bias: direction === "bullish" ? "Bullish" : "Bearish",
      price: full.price,
      pattern: full.chartPattern,
      support: full.support,
      resistance: full.resistance,
      watchLevel: direction === "bearish" ? full.resistance : full.support,
      reason: item.reason,
      analyzedAt: new Date().toISOString(),
      chartPattern: full.chartPattern,
      chartPatternNote: full.chartPattern
        ? `${full.chartPattern} @ ${full.chartPatternConfidence}%`
        : null,
      candlestickPattern: full.candlestick,
      candlestickType: full.candlestickType,
      candlestickConfidence: full.candlestickConfidence,
      candlestick: full.candlestick
        ? { name: full.candlestick, type: full.candlestickType!, confidence: full.candlestickConfidence }
        : null,
      conditionsPassed: full.conditionsPassed,
      conditions: full.conditions,
      confirmations,
      indicators: indicatorRows,
      experts,
      // DYNAMIC plan volatility — cards/docs rebuild the exact same TP/SL.
      atr: full.atr,
      timeframeMinutes: full.tfMinutes,
    };
  }

  // Debug counters (?debug=1) — surface where candidates get dropped live so a
  // 0-signal response is diagnosable instead of a silent empty array.
  const drops = {
    candidates: ordered.length,
    noCandles: 0,
    neutral: 0,
    prelim: 0,
    fetchBudget: 0,
    conditions: 0,
    experts: 0,
    indicators: 0,
    frequency: 0,
    emitted: 0,
    conditionDetails: [] as Array<{ symbol: string; conditionsPassed: number; failed: string[] }>,
  };

  // MASLA 1 — origin for the shared /api/market/history calls (the exact
  // endpoint the Trade page reads for its candles and its score).
  const origin = new URL(request.url).origin;
  let fullAnalysesLeft = MAX_FULL_ANALYSES_PER_REQUEST;

  for (const item of ordered) {
    // ── Cheap pre-filter on the scanner's own cached candles (no network).
    // Only candidates that could realistically clear 8/8 pay for history
    // fetches. The defensive array check stays: a stale/legacy non-array
    // cache value must never crash the route (candles.slice is not a function).
    const cachedCandles = cacheGet<Candle[]>(`scan:candles:${item.market}:${item.symbol}`);
    const scanCandles: Candle[] = Array.isArray(cachedCandles) ? cachedCandles : [];
    if (scanCandles.length < 20) {
      drops.noCandles += 1;
      continue;
    }
    const prelim = analyzeCoin({ symbol: item.symbol, market: item.market, primary: scanCandles });
    // Only the neutral scan ("wait") is skipped here — the DEEP gate below
    // (8/8 conditions + 4/4 experts + 8/10 indicators) alone decides emission,
    // and MAX_FULL_ANALYSES_PER_REQUEST bounds how many history fetches that
    // deep pass may cost per request.
    if (prelim.direction === "neutral") {
      drops.neutral += 1;
      continue;
    }

    // Per-market cap (Spec: Crypto 7 / Forex 7 / Metals 4 / Stocks 2), so the
    // live feed never exceeds the configured category size.
    if (emitted.length >= LIVE_CAPS[market]) {
      drops.frequency += 1;
      continue;
    }
    if (fullAnalysesLeft <= 0) {
      drops.fetchBudget += 1;
      continue;
    }

    // ── MASLA 1 — the SAME /api/market/history candles + the SAME
    // analyzeCoin() the Trade page runs, so both pages score identically.
    const [h1, h4, d1] = await Promise.all([
      fetchHistoryCandles(origin, item.market, item.symbol, "1h"),
      fetchHistoryCandles(origin, item.market, item.symbol, "4h"),
      fetchHistoryCandles(origin, item.market, item.symbol, "1d"),
    ]);
    if (h1.length < 30) {
      drops.noCandles += 1;
      continue;
    }
    fullAnalysesLeft -= 1;

    const full = analyzeCoin({
      symbol: item.symbol,
      market: item.market,
      primary: h1,
      h1,
      h4,
      d1,
    });
    // ZERO PRICE GUARD — never persist signals with $0 prices (SHIB fetch bug fix)
    if (full.price <= 0) {
      console.warn(`[market-signals] REJECT ${item.symbol}: price ${full.price} <= 0`);
      continue;
    }
    if (full.direction === "neutral") {
      drops.neutral += 1;
      continue;
    }

    // Audit log — passing setups only (7/8+). Score 88 at 7/8; the page shows
    // the exact same X/8 conditions for Trade + Signals.
    if (full.conditionsPassed >= 7) {
      console.log(`[signals] ${item.symbol}: ${full.conditionsPassed}/8 conditions, Score ${full.score} → SIGNAL`);
    }

    // ── INVARIANT GUARD (masla 3 / no-pattern contradiction) ──
    // The chart-pattern condition is condition #1 of 8. A signal that failed it
    // (no directional chart pattern) can never legitimately pass 8/8; its ceiling
    // is 7/8. score is derived from conditionsPassed in analyzeCoin(), so this is
    // normally unreachable — but a stale/legacy build that inflated the score must
    // not surface on the page as "8/8 with No pattern". Recompute score from the
    // authoritative count and drop anything still implying a pattern it lacks.
    if (!full.chartPattern && full.conditionsPassed > 7) {
      full.conditionsPassed = 7;
      full.score = Math.round((7 / 8) * 100);
    }
    if (!full.chartPattern && full.score > 87) {
      full.score = Math.round((7 / 8) * 100);
    }

    // ── Emission gate — show GOOD setups (≥6/8 = 75). The multi-TF direction is
    // Strict emission gate (spec: "100% clear" = 8/8). The multi-TF direction
    // is anchored on the primary chart TF (see analyzeCoin), so chart + trend
    // always match; the honest condition count still prices in a disagreeing
    // higher TF via the `trend` condition. 8/8 PASSes only when all 8
    // conditions hold AND the 4/4 expert panel agrees fully. Anything below
    // 8/8 is a near miss and only ships via the relaxation flush when the
    // strict pass is empty. The no-pattern invariant still caps a pattern-less
    // signal at 7/8.
        // ── STRICT TIER EMISSION GATE ──
    // No relaxation, no fallback, no near-miss buffer. A setup is emitted
    // only when it clears one of the three hard tiers (PREMIUM/STRONG/GOOD).
    // Anything below Tier 3 is REJECTED — the market tab shows the
    // "Wait for high-quality setup" empty state instead of garbage cards.

    const insightInput = {
      candles: h1,
      price: full.price,
      direction: full.direction,
      support: full.support ?? full.price,
      resistance: full.resistance ?? full.price,
      pattern: full.chartPattern,
      breakout: false,
      score: full.score,
    };
    let confirmations: MarketSignal["confirmations"] = null;
    let experts: MarketSignal["experts"] = null;
    let indicatorRows: IndicatorRow[] | null = null;
    if (h1.length >= 30) {
      try {
        const report = buildConfirmations(insightInput);
        const built = buildEducators(report, insightInput);
        confirmations = { indicators: report.indicators, confirmed: report.confirmed, total: report.total };
        experts = { educators: built.educators, consensus: built.consensus };
      } catch (error) {
        console.warn("[market-signals] confirmation build failed:", error);
      }
    }
    if (h1.length >= 20) {
      try {
        indicatorRows = calculateIndicators({ candles: h1, direction: full.direction });
      } catch (error) {
        console.warn("[market-signals] indicator build failed:", error);
        indicatorRows = null;
      }
    }

    // ── Strict tier computation from all available data ────────────────────
    const indicatorsAgreedCount = indicatorRows ? indicatorsAgreed(indicatorRows) : 0;
    const expertsAgreed = experts?.consensus.agreed ?? 0;
    const candlestickConfirmed = full.candlestickType !== "neutral" && (full.candlestickConfidence ?? 0) >= 70;
    const volumeCondition = full.conditions?.find((c) => c.id === "volume");
    const volumePassed = volumeCondition?.pass ?? false;
    const chartPatternCondition = full.conditions?.find((c) => c.id === "chartPattern");
    const chartPatternPassed = chartPatternCondition?.pass ?? false;

    const tierVerdict = computeSignalTier({
      conditionsPassed: full.conditionsPassed,
      indicatorsAgreedCount,
      expertsAgreed,
      candlestickConfirmed,
      volumePassed,
      chartPatternPassed,
    });

    // REJECT — below Tier 3, never emit
    if (!tierVerdict) {
      if (!candlestickConfirmed || !volumePassed || !chartPatternPassed) drops.conditions += 1;
      else if (expertsAgreed < 3) drops.experts += 1;
      else if (indicatorsAgreedCount <= 7) drops.indicators += 1;
      continue;
    }

    drops.emitted += 1;
    emitted.push(emitSignal(item, full, confirmations, indicatorRows, experts, tierVerdict.tier));
  }

  // MASLA 2 — persist every emitted setup (Firestore `signals` collection) so
  // the Signals page survives reloads. Dedupe (same symbol+timeframe <4h →
  // skip) and the 4h auto-delete sweep live inside persistSignals(); failures
  // never break the response (localStorage backup still covers the page).
  // Wrapped defensively: toCloudDoc() → generateFullSignal() runs here and, if
  // it ever threw for one odd signal shape, it must not 500 the whole route —
  // persistence is best-effort, the emitted array is what matters.
  const cloudDocs = emitted.map((signal) => toCloudDoc(signal, "1h")).filter((doc): doc is CloudDoc => doc !== null);
  if (cloudDocs.length > 0) {
    try {
      await persistSignals(cloudDocs);
    } catch (error) {
      console.warn("[market-signals] persist step failed (non-fatal):", error);
    }
    // Mirror into signals_history too, so the emission record survives archive
    // status patches. Best-effort like the archive write above.
    try {
      await persistToHistory(cloudDocs);
    } catch (error) {
      console.warn("[market-signals] history persist failed (non-fatal):", error);
    }
  }

  const wantsDebug = searchParams.get("debug") === "1";
  return Response.json(
    {
      generatedAt: snapshot?.generatedAt ?? new Date().toISOString(),
      market,
      results: emitted,
      ...(wantsDebug ? { drops, snapshotFound: Boolean(snapshot), merged: merged.size } : {}),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
