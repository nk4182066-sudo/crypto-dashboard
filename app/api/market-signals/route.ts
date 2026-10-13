import { cached, cacheGet } from "@/src/lib/cache";
import { getCachedAnalysis, getCachedSnapshot, runScan, type ScanResult, type ScanSnapshot } from "@/src/scanner/scanner";
import { startScheduler } from "@/src/scanner/scheduler";
import { scanUniverse, type ScanMarket, type ScanTarget } from "@/src/scanner/universe";
import type { Candle } from "@/src/analysis/types";
import { detectCandlestickPattern, generateFullSignal } from "@/src/lib/signalGenerator";
import { evaluateSignal, type TradePlan } from "@/src/analysis/signalGate";
import { buildConfirmations, buildEducators, type ConfirmationIndicator, type Consensus, type EducatorVerdict } from "@/src/lib/confirmations";
import { persistSignals, type CloudDoc } from "@/src/lib/signalCloud";

export const dynamic = "force-dynamic";

startScheduler();

const validMarkets: ScanMarket[] = ["crypto", "forex", "stocks", "metals"];

/** How many extra all-coins symbols we scan per market (above the minimums). */
const DYNAMIC_LIMITS: Record<ScanMarket, number> = {
  crypto: 45,
  forex: 24,
  stocks: 28,
  metals: 6,
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
function toCloudDoc(signal: MarketSignal, timeframe: string): CloudDoc {
  const full = generateFullSignal({
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
    candlestick: signal.candlestickPattern
      ? { name: signal.candlestickPattern, confidence: signal.candlestickConfidence, type: signal.direction }
      : null,
  });
  const agreed = signal.experts?.consensus.agreed ?? null;
  const total = signal.experts?.consensus.total ?? 4;
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
  /** Candlestick confirmation confidence 0-100 (0 when none). */
  candlestickConfidence: number;
  /** Spec-compliant SL/TP plan (present only when the strict gate passes). */
  plan?: TradePlan;
  /** Why the strict gate rejected the signal (transparency), or null when it passed. */
  gateReason?: string | null;
  /** Feature 2 — real-data confirmation breakdown (RSI/MACD/EMA/Volume). */
  confirmations?: { indicators: ConfirmationIndicator[]; confirmed: number; total: number } | null;
  /** Feature 3 — the 4-educator panel + consensus (agreed >= 3 = delivery-grade). */
  experts?: { educators: EducatorVerdict[]; consensus: Consensus } | null;
}

// ------------------------------------------------------------------ frequency
// Strict quality > quantity. Cap how often signals are surfaced so we never
// flood the user. Limits are enforced per (symbol, 24h) and per market per day.
//
// Raised from 10/3 after the 0-signal bug: on serverless these in-memory caps
// reset per instance, and a warm instance whose scheduler already used the old
// 3/market quota returned 0 to the browser. 20/day, 8/market keeps a reliable
// 5-10 setups visible per tab (matches the "5-10 minimum" spec) with headroom.
const MAX_SIGNALS_PER_DAY = 20;
const MAX_SIGNALS_PER_MARKET_PER_DAY = 8;
const SYMBOL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface EmissionRecord {
  /** market:Symbol key -> last emitted epoch ms. */
  lastBySymbol: Map<string, number>;
  /** market -> count of signals emitted in the current UTC day. */
  countByMarketToday: Map<ScanMarket, number>;
  /** UTC day string the per-market counts belong to (resets at midnight). */
  dayStamp: string;
}

const emission: EmissionRecord = {
  lastBySymbol: new Map(),
  countByMarketToday: new Map(),
  dayStamp: "",
};

/** True when emitting a signal for this symbol+market stays within the caps. */
function withinFrequency(symbol: string, market: ScanMarket, now: number): boolean {
  const dayStamp = new Date(now).toISOString().slice(0, 10);
  if (emission.dayStamp !== dayStamp) {
    // New UTC day -> reset the per-market daily counters.
    emission.dayStamp = dayStamp;
    emission.countByMarketToday.clear();
  }

  const key = `${market}:${symbol}`;
  const last = emission.lastBySymbol.get(key);
  if (last !== undefined && now - last < SYMBOL_COOLDOWN_MS) return false;

  const marketCount = emission.countByMarketToday.get(market) ?? 0;
  if (marketCount >= MAX_SIGNALS_PER_MARKET_PER_DAY) return false;

  const total = [...emission.countByMarketToday.values()].reduce((a, b) => a + b, 0);
  if (total >= MAX_SIGNALS_PER_DAY) return false;

  return true;
}

/** Records that a signal was emitted (updates symbol cooldown + daily counts). */
function recordEmission(symbol: string, market: ScanMarket, now: number): void {
  const dayStamp = new Date(now).toISOString().slice(0, 10);
  emission.dayStamp = dayStamp;
  emission.lastBySymbol.set(`${market}:${symbol}`, now);
  emission.countByMarketToday.set(market, (emission.countByMarketToday.get(market) ?? 0) + 1);
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
  const now = Date.now();
  const emitted: MarketSignal[] = [];
  const ordered = [...merged.values()]
    .filter((item) => item.market === market)
    .sort((first, second) => second.confidence - first.confidence);

  // Debug counters (?debug=1) — surface where candidates get dropped live so a
  // 0-signal response is diagnosable instead of a silent empty array.
  const drops = {
    candidates: ordered.length,
    noDetail: 0,
    neutral: 0,
    gateFail: 0,
    gateNoPlan: 0,
    frequency: 0,
    emitted: 0,
  };

  for (const item of ordered) {
    const detail = getCachedAnalysis(item.symbol, item.market);
    if (!detail) {
      drops.noDetail += 1;
      continue;
    }

    const direction: MarketSignal["direction"] =
      item.direction === "buy" ? "bullish" : item.direction === "sell" ? "bearish" : "neutral";
    // The gate only emits directional setups; "wait" never becomes a signal.
    if (direction === "neutral") {
      drops.neutral += 1;
      continue;
    }

    // Defensive: only trust an array here — a stale/legacy non-array cache value
    // would otherwise crash the gate (candles.slice is not a function).
    const cachedCandles = cacheGet<Candle[]>(`scan:candles:${item.market}:${item.symbol}`);
    const candles: Candle[] = Array.isArray(cachedCandles) ? cachedCandles : [];
    const candleHit = detectCandlestickPattern(candles);

    const gate = evaluateSignal({
      analysis: detail,
      candles,
      candlestick: candleHit
        ? { name: candleHit.name, confidence: candleHit.confidence, type: candleHit.type }
        : null,
      score: item.confidence,
    });

    // Any failed check -> no signal (dropped entirely, not shown).
    if (!gate.pass) {
      drops.gateFail += 1;
      continue;
    }
    if (!gate.plan) {
      drops.gateNoPlan += 1;
      continue;
    }

    // Frequency caps: same symbol once per 24h, <=3 per market/day, <=10/day.
    if (!withinFrequency(item.symbol, item.market, now)) {
      drops.frequency += 1;
      continue;
    }
    drops.emitted += 1;

    const support = detail.structure.lastSwingLow?.price ?? null;
    const resistance = detail.structure.lastSwingHigh?.price ?? null;
    const classical = (detail.chartPatterns.classical ?? [])
      .filter((p) => p.confidence >= 85)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    // Features 2-3 — real-candle confirmations + expert panel for this setup.
    // Serializes into `confirmations` / `experts` below; degrade to null when
    // the candle cache is cold so the card still renders without them.
    const insightInput = {
      candles,
      price: item.price,
      direction,
      support: support ?? item.price,
      resistance: resistance ?? item.price,
      pattern: classical?.name ?? null,
      breakout: false,
      score: item.confidence,
    };
    let confirmations: MarketSignal["confirmations"] = null;
    let experts: MarketSignal["experts"] = null;
    if (candles.length >= 30) {
      try {
        const report = buildConfirmations(insightInput);
        const built = buildEducators(report, insightInput);
        confirmations = { indicators: report.indicators, confirmed: report.confirmed, total: report.total };
        experts = { educators: built.educators, consensus: built.consensus };
      } catch (error) {
        console.warn("[market-signals] confirmation build failed:", error);
      }
    }

    emitted.push({
      symbol: item.symbol,
      label: item.label,
      market: item.market,
      score: item.confidence,
      direction,
      bias: item.bias,
      price: item.price,
      pattern: classical?.name ?? null,
      support,
      resistance,
      watchLevel: direction === "bearish" ? resistance : support,
      reason: item.reason,
      analyzedAt: item.analyzedAt,
      chartPattern: classical?.name ?? null,
      chartPatternNote: classical?.note ?? null,
      candlestickPattern: candleHit?.name ?? null,
      candlestickConfidence: candleHit?.confidence ?? 0,
      plan: gate.plan,
      gateReason: null,
      confirmations,
      experts,
    });
    recordEmission(item.symbol, item.market, now);
  }

  // MASLA 2 — persist every emitted setup (Firestore `signals` collection) so
  // the Signals page survives reloads. Dedupe (same symbol+timeframe <4h →
  // skip) and the 4h auto-delete sweep live inside persistSignals(); failures
  // never break the response (localStorage backup still covers the page).
  // Wrapped defensively: toCloudDoc() → generateFullSignal() runs here and, if
  // it ever threw for one odd signal shape, it must not 500 the whole route —
  // persistence is best-effort, the emitted array is what matters.
  if (emitted.length > 0) {
    try {
      await persistSignals(emitted.map((signal) => toCloudDoc(signal, "1h")));
    } catch (error) {
      console.warn("[market-signals] persist step failed (non-fatal):", error);
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
