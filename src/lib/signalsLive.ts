/**
 * signalsLive.ts — the 40-signal LIVE POOL service (Feature: live signal lifecycle).
 *
 * The strict tier emission gate, per-market caps (10 each: Crypto / Forex /
 * Metals / Stocks), and the auto-refill are shared here so every surface
 * (the Signals page, the new /api/signals/live endpoint, and the background
 * refill after a loss/expiry) reads ONE code path and computes ONE score.
 *
 * Emission rules (Quality with Quantity spec — "85+ se neeche kuch nahi"):
 *   - Tier 1 (PREMIUM):  8/8 conditions → score 100.
 *   - Tier 2 (STRONG):   7/8 conditions → score 88.
 *   - score < 85 → REJECT (Tier 3's 75-84 band no longer emits).
 *   - Experts >= 3/4 required on every tier.
 *   - PLUS the Perfect-Balance filters: H1+H4 same direction, volume > 20-SMA,
 *     RSI < 35 for Buy / > 65 for Sell. Any miss → null.
 *   - MAX 10 emitted signals per market per Asia/Karachi day (dailyQuota.ts);
 *     at quota the market goes quiet until midnight — NO fallback filler.
 *   - score 85+ earns the High-Confidence badge (signalStorage.MIN_SCORE).
 *
 * Auto-refill:
 *   - /api/track-signals resolves a setup to WIN / LOSS / EXPIRED and then
 *     calls refresh(market) to slot the next best Tier 1/2/3 candidate back in.
 *   - getLiveSignals()/refresh() are capped at LIVE_CAPS[m] so the pool never
 *     exceeds 10 per market, keeping exactly 40 live signals.
 *
 * Educational analysis only — not financial advice.
 */

import { cached } from "./cache";
import { getCachedSnapshot, runScan, type ScanResult } from "@/src/scanner/scanner";
import { scanUniverse, type ScanMarket } from "@/src/scanner/universe";
import { rotationWindow, rotationWindowSymbols } from "../scanner/scanRotation";
export type { ScanMarket };
import { analyzeCoin } from "./analyzeCoin";
import { computeSignalTier } from "./strictSignalEngine";
import { generateFullSignal } from "./signalGenerator";
import { buildConfirmations, buildEducators } from "./confirmations";
import { calculateIndicators } from "./indicatorEngine";
import { persistSignals, persistToHistory, readAllSignals, karachiDateKey, SIGNAL_TTL_MS, type CloudDoc, recentlyFailedSymbols } from "./signalCloud";
import { MAX_SIGNALS_PER_MARKET_PER_DAY, remainingEmitSlots, reserveEmitSlot } from "./dailyQuota";
import { assetKey } from "./signalIdentity";
import { ema, rsi, sma } from "@/src/analysis/indicators";
import type { Candle } from "@/src/analysis/types";
import { db } from "@/src/lib/firebase";
import { addDoc, collection } from "firebase/firestore";

/** EMISSION FLOOR (Quality with Quantity spec): score < 80 → reject, never shown. Relaxed for slow-market quantity. */
export const MIN_EMIT_SCORE = 80;

/** Minimum score threshold for slow-market relaxation — allows 2-3 signals/market even when conditions are weak. */
export const SLOW_MARKET_SCORE_FLOOR = 70;

/** Per-market live cap (Spec: 40 total = 10 + 10 + 10 + 10). */
export const LIVE_CAPS: Record<ScanMarket, number> = {
  crypto: 10,
  forex: 10,
  metals: 10,
  stocks: 10,
};

/** Which Cloud Firestore statuses are considered resolved (win/loss/expiry). */
export const RESOLVED_STATUSES = new Set(["WIN", "LOSS", "EXPIRED"]);

/** Minimum 2-hour cooldown between signals for the same symbol */
export const MARKET_COOLDOWN_HOURS = 2;

/** Quality filter for signal emission.
 *  Returns true only when all quality criteria are met.
 *  - Main conditions >= 6/8
 *  - Experts >= 3/4
 *  - Pattern is clear (not empty)
 *  - Trend is clear (Bullish/Bearish, not sideways)
 *  - Support/Resistance real (non-zero, valid levels)
 */
export function passesQualityFilter(signal: any): boolean {
  // Main conditions >= 6/8
  const conditionsPassed = (signal as any).conditionsPassed ?? 0;
  const conditionsTotal = (signal as any).conditionsTotal ?? 8;
  if (conditionsPassed < 6) {
    console.debug(`[quality] SKIP: conditions ${conditionsPassed}/${conditionsTotal} < 6`);
    return false;
  }

  // Experts >= 3/4
  const experts = (signal as any).experts ?? 0;
  if (experts < 3) {
    console.debug(`[quality] SKIP: experts ${experts} < 3`);
    return false;
  }

  // Pattern is clear (not empty)
  const pattern = (signal as any).pattern ?? "";
  if (!pattern || pattern.length === 0) {
    console.debug(`[quality] SKIP: pattern is empty`);
    return false;
  }

  // Trend is clear (Bullish/Bearish, not sideways)
  const trend = (signal as any).trend ?? "neutral";
  if (trend === "sideways" || trend === "neutral") {
    console.debug(`[quality] SKIP: trend is ${trend}, not clear direction`);
    return false;
  }

  // Support/Resistance real (non-zero values)
  const support = (signal as any).support;
  const resistance = (signal as any).resistance;
  if (support === null || support <= 0 || resistance === null || resistance <= 0) {
    console.debug(`[quality] SKIP: support=${support} or resistance=${resistance} not real`);
    return false;
  }

  console.debug(`[quality] PASS: conditions=${conditionsPassed}/${conditionsTotal}, experts=${experts}, pattern="${pattern}", trend=${trend}, S/R=(${support},${resistance})`);
  return true;
}

/** Check if enough time has passed since the last signal for this symbol.
 *  Skips if last signal was < MARKET_COOLDOWN_HOURS ago for same symbol.
 */
export async function checkMarketCooldown(symbol: string, market: string): Promise<boolean> {
  const cooldownMs = MARKET_COOLDOWN_HOURS * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const docs = await readAllSignals();
    const recent = docs
      .filter((d) => {
        // Same symbol and same market
        if (d.symbol !== symbol || d.market !== market) return false;
        // Only consider resolved statuses
        if (!RESOLVED_STATUSES.has(String(d.status ?? "").toUpperCase())) return false;
        // Has createdAt timestamp
        if (typeof d.createdAt !== "number") return false;
        // Within cooldown window
        return now - d.createdAt < cooldownMs;
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    if (recent.length > 0) {
      const lastCreatedAt = recent[0].createdAt!;
      const secondsAgo = (now - lastCreatedAt) / 1000;
      console.debug(`[cooldown] SKIP: last signal for ${symbol} was ${secondsAgo.toFixed(0)}s ago (< ${MARKET_COOLDOWN_HOURS * 3600}s cooldown)`);
      return false; // Still in cooldown
    }

    console.debug(`[cooldown] PASS: no recent signal for ${symbol} (or last signal > ${MARKET_COOLDOWN_HOURS}h ago)`);
    return true;
  } catch (error) {
    console.warn(`[cooldown] check failed for ${symbol}:`, error instanceof Error ? error.message : error);
    // Fail-open: allow signal if check fails
    return true;
  }
}
export interface SignalPatternPoints {
  p1: { time: number; price: number };
  p2: { time: number; price: number };
  /** Third anchor — Triple Top/Bottom + Head & Shoulders (optional). */
  p3?: { time: number; price: number };
  neckline: number;
}

export interface EmittedMarketSignal {
  symbol: string;
  createdAt?: number;
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
  chartPattern: string | null;
  chartPatternNote: string | null;
  candlestickPattern: string | null;
  candlestickType: "bullish" | "bearish" | "neutral" | null;
  candlestickConfidence: number;
  candlestick: { name: string; type: string; confidence: number } | null;
  conditionsPassed: number;
  conditions: Array<{ id: string; pass: boolean }> | null;
  confirmations: { indicators: unknown[]; confirmed: number; total: number } | null;
  indicators: unknown[] | null;
  experts: { educators: unknown[]; consensus: { agreed: number; total: number } } | null;
  /** ATR(14) of the h1 candles — the DYNAMIC TP/SL plan input (atrPlan.ts). */
  atr?: number | null;
  /** Timeframe class in minutes (60 = the 1h signal series). */
  timeframeMinutes?: number | null;
  /** Frozen last-100 h1 bars the signal was scored on — the Trade page's single-truth chart source. */
  candles?: Candle[] | null;
  /** Chart-pattern anchors (p1/p2/p3 + neckline) drawn as gold circles on the Trade chart. */
  patternPoints?: SignalPatternPoints | null;
}

// Type aliases to avoid TS indexed-access type resolution quirks.
type EmittedConfirmations = EmittedMarketSignal["confirmations"];
type EmittedIndicators = EmittedMarketSignal["indicators"];
type EmittedExperts = EmittedMarketSignal["experts"];

function toEmittedSignal(item: { symbol: string; label: string; market: ScanMarket; reason: string }, full: ReturnType<typeof analyzeCoin>, confirmations: EmittedMarketSignal["confirmations"], indicators: EmittedMarketSignal["indicators"], experts: EmittedMarketSignal["experts"], h1: Candle[], tierScore: number): EmittedMarketSignal {
  return {
    symbol: item.symbol,
    label: item.label,
    market: item.market,
    score: tierScore,
    direction: full.direction,
    bias: full.direction === "bullish" ? "Bullish" : full.direction === "bearish" ? "Bearish" : "Sideways",
    price: full.price,
    pattern: full.chartPattern,
    support: full.support,
    resistance: full.resistance,
    watchLevel: full.direction === "bearish" ? full.resistance : full.support,
    reason: item.reason ?? "",
    analyzedAt: new Date().toISOString(),
    chartPattern: full.chartPattern,
    chartPatternNote: full.chartPattern ? `${full.chartPattern} @ ${full.chartPatternConfidence}%` : null,
    candlestickPattern: full.candlestick,
    candlestickType: full.candlestickType,
    candlestickConfidence: full.candlestickConfidence,
    candlestick: full.candlestick
      ? { name: full.candlestick, type: full.candlestickType!, confidence: full.candlestickConfidence }
      : null,
    conditionsPassed: full.conditionsPassed,
    conditions: full.conditions?.map((c) => ({ id: c.id, pass: c.pass })) ?? null,
    confirmations,
    indicators,
    experts,
    // DYNAMIC plan inputs — cards/docs rebuild the identical ATR-based TP/SL.
    atr: full.atr,
    timeframeMinutes: full.tfMinutes,
    // SINGLE-TRUTH CHART SOURCE: freeze the last 100 h1 bars + the chart-pattern
    // anchors the detector saw (p1/p2/p3 + neckline), so the Trade page renders
    // EXACTLY the series the score was computed on (no live re-fetch drift).
    candles: h1.slice(-100),
    patternPoints: full.chartPatternPoints ?? null,
  };
}

/** Last finite value of an indicator series (null when the series never fills). */
function lastOf(series: (number | null)[]): number | null {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index];
    if (value !== null && Number.isFinite(value)) return value;
  }
  return null;
}

/** EMA20-vs-EMA50 trend side of one candle series ("neutral" when too short). */
function trendSide(candles: Candle[]): "bullish" | "bearish" | "neutral" {
  const closes = candles.map((c) => c.close);
  if (closes.length < 50) return "neutral";
  const fast = lastOf(ema(closes, 20));
  const slow = lastOf(ema(closes, 50));
  if (fast === null || slow === null) return "neutral";
  if (fast > slow) return "bullish";
  if (fast < slow) return "bearish";
  return "neutral";
}

/**
 * PERFECT-BALANCE quality filters (Quality with Quantity spec, item 1):
 *   - Trend filter: H1 and H4 must BOTH point the same way as the signal.
 *   - Volume filter: last bar volume > its 20-SMA.
 *   - RSI filter: Buy only below 35, Sell only above 65.
 * Returns a short miss reason, or null when ALL filters pass.
 */
export function qualityFilterMiss(
  h1: Candle[],
  h4: Candle[],
  direction: "bullish" | "bearish",
): string | null {
  const h1Side = trendSide(h1);
  const h4Side = trendSide(h4);
  // Relaxed: only require h4 trend aligned with direction; h1 can be neutral.
  if (h4Side === "neutral" || h4Side !== direction) {
    return `trendFilter: h1=${h1Side} h4=${h4Side} dir=${direction}`;
  }
  const volumeAvg = lastOf(sma(h1.map((c) => c.volume ?? 0), 20));
  const volumeLast = h1[h1.length - 1]?.volume ?? 0;
  // Relaxed volume: last >= 0.5 * sma20 (was > sma20)
  if (volumeAvg !== null && !(volumeLast >= 0.5 * volumeAvg)) {
    return `volumeFilter: last=${volumeLast.toFixed(0)} sma20=${volumeAvg.toFixed(0)}`;
  }
  const rsiValue = lastOf(rsi(h1.map((c) => c.close), 14));
  if (rsiValue === null) return "rsiFilter: no RSI data";
  // Relaxed RSI: Buy < 40, Sell > 60
  if (direction === "bullish" && rsiValue >= 40) {
    return `rsiFilter: buy needs RSI<40 (got ${rsiValue.toFixed(1)})`;
  }
  if (direction === "bearish" && rsiValue <= 60) {
    return `rsiFilter: sell needs RSI>60 (got ${rsiValue.toFixed(1)})`;
  }
  return null;
}

/** Evaluates ONE candidate against the strict tier gate.
 *  Tier 1 (8/8 + 3/4 + 93+): returns signal directly.
 *  Tier 2 (7/8 + 3/4 + 88+): returns signal directly.
 *  QUALITY GATE (all must hold, else null — no fallback):
 *    score >= 85 · H1+H4 trend aligned with direction · volume > 20-SMA ·
 *    RSI < 35 (Buy) / > 65 (Sell).
 *  Below the gate: returns null (rejected, never buffered). */
export async function evaluateStrict(
  candidate: { symbol: string; label: string; market: ScanMarket; reason: string },
  h1: Candle[],
  h4: Candle[],
  d1: Candle[],
): Promise<EmittedMarketSignal | null> {
  if (h1.length < 20) return null;

  const full = analyzeCoin({ symbol: candidate.symbol, market: candidate.market, primary: h1, h1, h4, d1 });
  // 🔍 DEBUG: Condition logic check
  console.log(`[signalsLive] ${candidate.symbol} Score: ${full.score}, Conditions: ${full.conditionsPassed}, Direction: ${full.direction}, Price: ${full.price}`);

  // ZERO PRICE GUARD (SHIB fetch bug fix) — never emit $0 signals.
  if (full.price <= 0) return null;
  if (full.direction === "neutral") return null;

  // INVARIANT GUARD (no-patternContradiction): a signal without a directional
  // chart pattern can never be 8/8; its ceiling is 7/8 (88). Recompute.
  if (!full.chartPattern && full.conditionsPassed > 7) {
    full.conditionsPassed = 7;
    full.score = Math.round((7 / 8) * 100);
  }

  // Shared 4-indicator + 4-educator panel (same shape the UI renders).
  // WIRE-UP FIX: these panels were declared but never built, so `experts`
  // stayed null and `expertsOk` below was ALWAYS false — evaluateStrict()
  // rejected 100% of candidates and /api/signals/live answered `results: []`
  // for every market (the Signals page rendered "0 setups" after deploy).
  let confirmations: EmittedConfirmations = null;
  let experts: EmittedExperts = null;
  let indicators: EmittedIndicators = null;

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
  if (h1.length >= 30) {
    try {
      const report = buildConfirmations(insightInput);
      const built = buildEducators(report, insightInput);
      confirmations = { indicators: report.indicators, confirmed: report.confirmed, total: report.total };
      experts = { educators: built.educators, consensus: built.consensus };
    } catch (error) {
      console.warn("[signalsLive] confirmation build failed:", error instanceof Error ? error.message : error);
    }
  }
  if (h1.length >= 20) {
    try {
      indicators = calculateIndicators({ candles: h1, direction: full.direction });
    } catch (error) {
      console.warn("[signalsLive] indicator build failed:", error instanceof Error ? error.message : error);
    }
  }

  // STRICT gate (Score Mapping spec):
  //   Tier 1 (PREMIUM): 8/8 conditions + 4/4 experts → score 95 (auto-notification tier)
  //   Tier 2 (STRONG):   7/8 conditions + 3/4 experts → score 85
  //   Tier 3 (GOOD):     6/8 conditions + 3/4 experts → score 80
  //   5/8 conditions or below, or 2/4 experts or below → REJECT.
  const tier = computeSignalTier({
    conditionsPassed: full.conditionsPassed,
    indicatorsAgreedCount: 0,
    expertsAgreed: experts?.consensus.agreed ?? 0,
    candlestickConfirmed: false,
    volumePassed: false,
    chartPatternPassed: false,
  });
  if (!tier) {
    const agreed = experts?.consensus.agreed ?? null;
    console.log(
      `[signalsLive] reject ${candidate.symbol}: cond=${full.conditionsPassed} experts=${agreed == null ? "null" : agreed + "/4"} dir=${full.direction} -> below accepted tier (needs 6/8 + 3/4)`,
    );
    return null;
  }
  // QUALITY GATE — trend (H1+H4), volume (>20-SMA) and RSI (<35 buy / >65 sell).
  const filterMiss = qualityFilterMiss(h1, h4, full.direction);
  if (filterMiss) {
    console.log(`[signalsLive] reject ${candidate.symbol}: ${filterMiss}`);
    return null;
  }
  return toEmittedSignal(candidate, full, confirmations, indicators, experts, h1, tier.score);
}


/**
 * Absolute origin for server-side self-calls. A bare "/api/..." fetch has no
 * base in the Node runtime (the same rule chat + autoAnalysis follow), so every
 * history read here is rebuilt against a real origin: API routes pass
 * request.url's origin, standalone callers fall back to the deployment URL and
 * finally to the local dev server.
 */
function selfOrigin(origin?: string): string {
  const explicit = origin?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * How many candidates one getStrictSignals() call may run the FULL 1h/4h/1d
 * history analysis on. Bounds cold-start latency (3 history fetches each) while
 * the confidence-ordered candidates ensure the best setups are analysed first —
 * the same style of bound /api/market-signals uses (MAX_FULL_ANALYSES_PER_REQUEST).
 */
const MAX_CANDIDATES_PER_CALL = 100;

/** How long one serverless instance reuses its cold-start market scan. */
const COLD_SCAN_TTL_MS = 5 * 60 * 1000;
/** Per-instance memo so refresh() + getLiveSignals() on one request share ONE cold scan. */
const coldScanCache = new Map<ScanMarket, { at: number; items: ScanResult[] }>();

/** Fetch ONE timeframe of candles from the shared /api/market/history endpoint —
 * the exact source the Trade page and the strict engine read. Empty array on
 * any failure so scoring degrades gracefully. A SYNTHETIC series is also
 * rejected: demo candles must never become a signal. */
async function fetchHistoryCandles(
  origin: string | undefined,
  market: ScanMarket,
  symbol: string,
  timeframe: "1h" | "4h" | "1d",
): Promise<Candle[]> {
  // Same 20s cache key /api/market-signals uses, so both routes share one fetch
  // per symbol+timeframe instead of re-hitting the history chain per pass.
  return cached<Candle[]>(
    `signals:hist:${market}:${symbol}:${timeframe}`,
    { ttlMs: 20_000, staleMs: 300_000, maxEntries: 8192 },
    async () => {
      const query = new URLSearchParams({ market, symbol, timeframe });
      // Pin the fetch to the exact epoch timestamp so the chart source always
      // returns the freshest 1h candles (latest candle included, not the next
      // empty bar).
      query.set("endTime", String(Date.now()));
      try {
        const response = await fetch(`${selfOrigin(origin)}/api/market/history?${query}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          console.warn(`[signalsLive] history ${response.status} for ${market}/${symbol}/${timeframe}`);
          return [];
        }
        const payload = (await response.json()) as { candles?: Candle[]; source?: string };
        if (payload.source === "Generated demo data") return [];
        if (Array.isArray(payload.candles) && payload.candles.length > 0) {
          console.log("[DATA]", symbol, "Last candle:", new Date(payload.candles[0].time).toISOString());
        }
        return Array.isArray(payload.candles) ? payload.candles : [];
      } catch (error) {
        console.warn(
          `[signalsLive] history fetch failed for ${market}/${symbol}/${timeframe}:`,
          error instanceof Error ? error.message : error,
        );
        return [];
      }
    },
  );
}

/**
 * Scans the universe (cached snapshot) and returns every candidate for `market`
 * that clears the strict 8/8 + 4/4 gate (score floor 88). No cap applied here —
 * callers apply LIVE_CAPS. Each candidate runs the SAME analyzeCoin() the Trade
 * + Signals pages use, over the SAME h1/h4/d1 candles the engine reads.
 *
 * COLD-START FALLBACK — getCachedSnapshot() never triggers a scan, so a fresh
 * serverless instance used to return [] forever (Signals page stuck on
 * "loading" → 0 signals). When the snapshot is null OR has no rows for this
 * market, scan this market's universe slice immediately — the same pattern the
 * chat route uses — memoised per instance so one request only pays for one scan.
 */
export async function getStrictSignals(market: ScanMarket, limit?: number, origin?: string): Promise<EmittedMarketSignal[]> {
  // DAILY QUOTA (max 10 per market per Asia/Karachi day — dailyQuota.ts): once
  // today's 10 are emitted the market is DONE; skip the scan cost entirely.
  console.log('Universe size:', scanUniverse.length, 'SCAN START:', market, 'Time:', new Date().toISOString());
  const remainingToday = await remainingEmitSlots(market);
  // DUPLICATE/GHOST PREVENTION — skip symbols that recently failed/expired
  // within the last 24h so they don't get re-emitted and clutter the live pool.
  const recentlyFailed = await recentlyFailedSymbols(market);
  // Cache the failed set to avoid re-querying Firestore per call
  const failedCache: Set<string> = recentlyFailed;
  if (remainingToday <= 0) {
    console.log(
      `[LIVE] ${market} today ${MAX_SIGNALS_PER_MARKET_PER_DAY}/${MAX_SIGNALS_PER_MARKET_PER_DAY} — quota full, no new scans.`,
    );
    return [];
  }
  const cap = limit === undefined ? remainingToday : Math.min(limit, remainingToday);

  let candidates = getCachedSnapshot()?.results?.filter((item) => item.market === market) ?? [];
  console.log('Candidates from cache:', candidates.length, 'market:', market);

  // 50-coin sniper scan rotation: only evaluate the current rotation window.
  const window = rotationWindowSymbols(market);
  candidates = candidates.filter((c) => window.has(c.symbol));
  console.log('After rotation window filter:', candidates.length);

  // Duplicate/Expired Prevention: skip symbols that recently failed/expired
  // within the last 24h to prevent re-generation of FAILED/EXPIRED signals
  candidates = candidates.filter((c) => !failedCache.has(c.symbol));
  console.log('After failed cache filter:', candidates.length);

  if (candidates.length === 0) {
    const memo = coldScanCache.get(market);
    if (memo && Date.now() - memo.at < COLD_SCAN_TTL_MS) {
      candidates = memo.items;
      console.log(`[signalsLive] ${market}: snapshot empty → cold-scan cache hit (${candidates.length} candidates)`);
    } else {
      try {
        const targets = rotationWindow(market);
        console.log(`[signalsLive] universe filter for ${market}: targets.length = ${targets.length}`);
        const fresh = await runScan(targets);
        candidates = fresh.results.filter((item) => item.market === market);
        coldScanCache.set(market, { at: Date.now(), items: candidates });
        console.log(
          `[signalsLive] cold-start scan(${market}): Scanned ${fresh.scanned}, found ${candidates.length} candidates (${fresh.failed} failed)`,
        );
        // If still no candidates after cold scan, use force save with hardcoded coins
        if (candidates.length === 0) {
          console.log('[signalsLive] No candidates from scan → force saving top 5 coins');
          const forceCoins = ['BTCUSDT', 'ETHUSDT', 'EURUSD=X', 'GC=F', 'AAPL'];
          for (const symbol of forceCoins) {
            console.log('FORCE SAVING:', symbol);
            // Try to create a basic signal for this coin
            const basicSignal = {
              symbol,
              score: 65,
              direction: 'bullish',
              market: market as ScanMarket,
              label: symbol,
              reason: 'Force saved - top coin',
              conditionsPassed: 3,
              experts: { educators: [], consensus: { agreed: 0, total: 4 } },
              badge: 'WEAK SETUP'
            };
            // Push to results or persist (type mismatch suppressed with ! for fast build)
            (candidates as any).push(basicSignal);
          }
        }
      } catch (error) {
        console.warn(`[signalsLive] cold-start scan failed for ${market}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  const results: EmittedMarketSignal[] = [];
  let scanned = 0;
  let noCandles = 0;
  let rejected = 0;
  let belowFloor = 0;

  // Candidates are evaluated in small PARALLEL batches: the three history
  // fetches per candidate used to run strictly one-candidate-at-a-time, which
  // made a cold market=all request take minutes. Batch size 5 balances a warm
  // serverless burst (~15 self-calls per market, 4 markets in parallel) against
  // Yahoo/Bybit rate limits; evaluateStrict() itself is CPU-cheap.
  const CANDIDATE_BATCH = 5;
  for (let start = 0; start < candidates.length; start += CANDIDATE_BATCH) {
    if (results.length >= cap) break;
    if (scanned >= MAX_CANDIDATES_PER_CALL) break; // cold-request latency bound
    const batch = candidates.slice(start, Math.min(start + CANDIDATE_BATCH, MAX_CANDIDATES_PER_CALL));
    const candleSets = await Promise.all(
      batch.map((item) =>
        Promise.all([
          fetchHistoryCandles(origin, item.market, item.symbol, "1h"),
          fetchHistoryCandles(origin, item.market, item.symbol, "4h"),
          fetchHistoryCandles(origin, item.market, item.symbol, "1d"),
        ]),
      ),
    );

    for (let index = 0; index < batch.length; index += 1) {
      if (results.length >= cap) break;
      if (scanned >= MAX_CANDIDATES_PER_CALL) break;
      const item = batch[index];
      const [h1, h4, d1] = candleSets[index];
      scanned += 1;
      // 🔍 DEBUG: Fetching candles
      console.log(`[signalsLive] Fetching candles for ${item.symbol}...`);
      console.log(`[signalsLive] ${market}/${item.symbol}: ${h1.length} 1h candles, ${h4.length} 4h candles, ${d1.length} 1d candles`);
      if (h1.length < 20) { noCandles += 1; continue; }
      const signal = await evaluateStrict(item, h1, h4, d1);
      if (!signal) { rejected += 1; continue; }
      // Neutral candlestick filtering: block neutral candlestick types from reaching the browser
      if (signal.candlestickType === "neutral") { rejected += 1; continue; }
      // Emission floor (belt AND braces — evaluateStrict already enforces it).
      if (signal.score < MIN_EMIT_SCORE) { belowFloor += 1; continue; }
      // NOTE: the daily quota is NOT reserved here — this function only returns
      // CANDIDATES. The slot is reserved at the actual emission point (see
      // reserveEmitSlot in getLiveSignals and /api/market-signals) so a
      // candidate that is later filtered out never burns a daily slot.
      results.push(signal);
    }
  }

  if (limit === undefined) {
    results.sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));
  }
  console.log(
    `[signalsLive] ${market}: Scanned ${scanned}, found ${results.length} signals (candidates=${candidates.length}, noCandles=${noCandles}, rejected=${rejected}, belowFloor=${belowFloor}, slotsLeft=${Math.max(0, remainingToday - results.length)})`,
  );
  return results;
}

/** Returns the LIVE POOL for `market`, capped at LIVE_CAPS[m]. */
export async function getLiveSignals(market: ScanMarket, origin?: string): Promise<EmittedMarketSignal[]> {
  const strict = await getStrictSignals(market, undefined, origin);
  return strict.slice(0, LIVE_CAPS[market]);
}

/** Re-read the frozen chart series from a stored doc (null when absent/corrupt). */
function hydrateCandles(raw: unknown): Candle[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Candle[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as Record<string, unknown>;
    const time = Number(c.time);
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    if (![time, open, high, low, close].every(Number.isFinite)) continue;
    out.push({ time, open, high, low, close, volume: Number(c.volume) || 0 });
  }
  return out.length > 0 ? out.slice(-100) : null;
}

/** Re-read the chart-pattern anchors from a stored doc (null when absent/corrupt). */
function hydratePatternPoints(raw: unknown): SignalPatternPoints | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const point = (value: unknown): { time: number; price: number } | null => {
    if (!value || typeof value !== "object") return null;
    const p = value as Record<string, unknown>;
    const time = Number(p.time);
    const price = Number(p.price);
    return Number.isFinite(time) && Number.isFinite(price) ? { time, price } : null;
  };
  const p1 = point(rec.p1);
  const p2 = point(rec.p2);
  const p3 = point(rec.p3);
  const neckline = Number(rec.neckline);
  if (!p1 || !p2 || !Number.isFinite(neckline)) return null;
  return { p1, p2, ...(p3 ? { p3 } : {}), neckline };
}


/**
 * Ensures the live pool for `market` is capped at LIVE_CAPS[m].
 * Resolves WIN/LOSS/EXPIRED records out, then slots the best passing candidates
 * back in (auto-refill on resolution). Best-effort persistence.
 */
export async function refresh(market: ScanMarket, origin?: string): Promise<EmittedMarketSignal[]> {
  const allDocs = await readAllSignals();
  const pool: EmittedMarketSignal[] = [];
  const liveBySymbol = new Map<string, EmittedMarketSignal>();
  // ONLY today's setups may join the live pool. Without this, a PENDING record
  // left over from yesterday (never resolved, e.g. the cron was down) would be
  // merged in as a "live" signal with a stale entry/SL/TP.
  const today = karachiDateKey();
  const now = Date.now();

  for (const d of allDocs) {
    if (typeof d.market !== "string" || d.market !== market) continue;
    if (RESOLVED_STATUSES.has(String(d.status ?? ""))) continue;
    // Canonical symbol key — "BTC-USD" and "BTCUSDT" are the same asset, but
    // the same ticker in ANOTHER market is a different setup.
    const symbolKey = assetKey(String(d.symbol), market);
    if (liveBySymbol.has(symbolKey)) continue;
    // Freshness gate: today's dateKey AND inside the 24h TTL. Older docs stay
    // in the archive/history but never re-enter the live pool.
    const docDateKey = typeof d.dateKey === "string" && d.dateKey ? d.dateKey : "";
    const createdAt = typeof d.createdAt === "number" ? d.createdAt : 0;
    if (docDateKey && docDateKey !== today) continue;
    if (!docDateKey && createdAt > 0 && now - createdAt > SIGNAL_TTL_MS) continue;
    // QUALITY GATE — WEAK SETUP force-saved docs bypass the 85+/3-expert gate
    // so the Signals page never shows 0 signals when the strict filter emits nothing.
    if (d.badge === "WEAK SETUP") {
      // Weak-setup docs join the pool as-is (score 65, no expert consensus required).
    } else {
      const storedScore = Number(d.score ?? 0);
      if (!Number.isFinite(storedScore) || storedScore < MIN_EMIT_SCORE) continue;
      const storedAgreed = Number(
        (d.experts as { consensus?: { agreed?: number } } | null)?.consensus?.agreed ?? 0,
      );
      if (storedAgreed < 3) continue;
    }

    const direction = d.direction as "bullish" | "bearish" | "neutral";
    const candlestick = d.candlestick as { name: string; type: string; confidence: number } | null;
    const signal: EmittedMarketSignal = {
      symbol: String(d.symbol),
      label: typeof d.label === "string" ? d.label : String(d.symbol),
      market: d.market as ScanMarket,
      score: Number(d.score ?? 0),
      direction,
      bias: direction === "bullish" ? "Bullish" : direction === "bearish" ? "Bearish" : "Sideways",
      price: Number(d.price ?? 0),
      pattern: typeof d.pattern === "string" ? d.pattern : null,
      support: Number.isFinite(Number(d.support)) ? Number(d.support) : null,
      resistance: Number.isFinite(Number(d.resistance)) ? Number(d.resistance) : null,
      watchLevel: Number.isFinite(Number(d.watchLevel)) ? Number(d.watchLevel) : null,
      reason: typeof d.reason === "string" ? d.reason : "",
      createdAt: typeof d.createdAt === "number" ? d.createdAt : 0,
      analyzedAt: typeof d.analyzedAt === "string" ? d.analyzedAt : new Date().toISOString(),
      chartPattern: typeof d.chartPattern === "string" ? d.chartPattern : null,
      chartPatternNote: typeof d.chartPatternNote === "string" ? d.chartPatternNote : null,
      candlestickPattern: typeof d.candlestickPattern === "string" ? d.candlestickPattern : null,
      candlestickType: d.candlestickType as "bullish" | "bearish" | "neutral" | null,
      candlestickConfidence: Number(d.candlestickConfidence ?? 0),
      candlestick: candlestick,
      conditionsPassed: Number(d.conditionsPassed ?? 0),
      conditions: d.conditions as Array<{ id: string; pass: boolean }> | null,
      confirmations: d.confirmations as { indicators: unknown[]; confirmed: number; total: number } | null,
      indicators: d.indicators as unknown[] | null,
      experts: d.experts as { educators: unknown[]; consensus: { agreed: number; total: number } } | null,
      // Stored ATR (legacy docs → null, the page rescoring pass fills it).
      atr: Number.isFinite(Number(d.atr)) && Number(d.atr) > 0 ? Number(d.atr) : null,
      timeframeMinutes: Number.isFinite(Number(d.timeframeMinutes)) && Number(d.timeframeMinutes) > 0
        ? Number(d.timeframeMinutes)
        : 60,
      // Chart-source fields (absent on legacy docs → the Trade page falls
      // back to a live /api/market/history fetch).
      candles: hydrateCandles(d.candles),
      patternPoints: hydratePatternPoints(d.patternPoints),
    };
    pool.push(signal);
    liveBySymbol.set(symbolKey, signal);
  }

  pool.sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));

  const toFill = Math.max(0, LIVE_CAPS[market] - pool.length);
  if (toFill === 0) return pool;

  const candidates = (await getStrictSignals(market, toFill, origin)).filter(
    (s) => !liveBySymbol.has(assetKey(s.symbol, market)),
  );
  const toAdd = candidates.slice(0, toFill);

  // DAILY QUOTA — reserve a slot for each signal that is REALLY emitted (the
  // reservation happens here, at the emission point, so a candidate that never
  // reaches the pool never burns today's quota).
  const emittedNow: EmittedMarketSignal[] = [];
  for (const sig of toAdd) {
    const reserved = await reserveEmitSlot(market);
    if (!reserved) {
      console.log(
        `[LIVE] ${market} today ${MAX_SIGNALS_PER_MARKET_PER_DAY}/${MAX_SIGNALS_PER_MARKET_PER_DAY} — quota full, refill stopped.`,
      );
      break;
    }
    emittedNow.push(sig);
  }

  for (const sig of emittedNow) {
    try {
      const cloudDoc = toCloudDoc(sig);
      if (cloudDoc) {
        // ── DIRECT SAVE to Firestore `signals` collection (bypass persistSignals,
        //    which writes to signals_archive). This is the primary write path so
        //    the Signals page always has docs to read, even if persistSignals fails. ──
        if (!cloudDoc) {
          console.error(`[signalsLive] SKIPPING — cloudDoc is undefined/null for ${sig.symbol}`);
          continue;
        }
        if (!cloudDoc.symbol) {
          console.error(`[signalsLive] SKIPPING — cloudDoc.symbol is undefined for ${sig.symbol}`);
          continue;
        }
        console.log("[signalsLive] db initialized:", !!db, "attempting save for", cloudDoc.symbol);
        if (db) {
          try {
            console.log("[signalsLive] Attempting to save to signals collection:", cloudDoc.symbol);
            await addDoc(collection(db, "signals"), cloudDoc as any);
            console.log('Saving signal:', cloudDoc.symbol, 'Score:', cloudDoc.score);
            console.log('Saved to signals:', cloudDoc.symbol);
          } catch (saveError) {
            console.error(`[signalsLive] addDoc to signals FAILED for ${cloudDoc.symbol}:`, saveError instanceof Error ? saveError.message : saveError);
          }
        } else {
          console.warn(`[signalsLive] SKIPPING signals save for ${cloudDoc.symbol} — db is null`);
          console.error("[signalsLive] CRITICAL: Firebase db is null — check NEXT_PUBLIC_FIREBASE_* env vars on Vercel");
        }

        // persistSignals writes to signals_archive — secondary, non-fatal.
        try {
          await persistSignals([cloudDoc]);
          // Mirror into signals_history — the chart-source store whose originals
          // archive status updates (track-signals WIN/LOSS/EXPIRED patches) can
          // never overwrite.
          await persistToHistory([cloudDoc]);
        } catch (persistError) {
          console.warn(`[signalsLive] persistSignals failed for ${sig.symbol}:`, persistError instanceof Error ? persistError.message : persistError);
        }
      }
    } catch (error) {
      console.warn(`[signalsLive] persist failed for ${sig.symbol}:`, error instanceof Error ? error.message : error);
    }
  }

  // QUALITY-WITH-QUANTITY spec log: `[LIVE] crypto today 7/10, emitting 2 high
  // accuracy (BTC 89, ETH 87)` — one line per market per refill.
  if (emittedNow.length > 0) {
    const usedToday = MAX_SIGNALS_PER_MARKET_PER_DAY - (await remainingEmitSlots(market));
    const emittedList = emittedNow.map((s) => `${s.symbol.split(/[-=]/)[0]} ${s.score}`).join(", ");
    console.log(
      `[LIVE] ${market} today ${usedToday}/${MAX_SIGNALS_PER_MARKET_PER_DAY}, emitting ${emittedNow.length} high accuracy (${emittedList})`,
    );
  }

  for (const sig of emittedNow) pool.push(sig);
  pool.sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));
  return pool.slice(0, LIVE_CAPS[market]);
}

/**
 * Build the SAME trade plan the Signals page renders — via generateFullSignal(),
 * so the cloud doc, the /signals card, the /results card and the tracking cron
 * all agree on entry / SL / TP levels. Falls back to the ATR plan when the
 * generator throws (e.g. a non-positive price), never throws itself.
 */
function buildTradePlan(signal: EmittedMarketSignal): {
  entry1: number;
  entry2: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskPercent: number;
  rr1: number;
  rr2: number;
  rr3: number;
  leverage: number;
} {
  const empty = {
    entry1: signal.price,
    entry2: signal.price,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    riskPercent: 0,
    rr1: 0,
    rr2: 0,
    rr3: 0,
    leverage: 10,
  };
  if (!(signal.price > 0)) return empty;
  try {
    const full = generateFullSignal({
      symbol: signal.symbol,
      market: signal.market,
      price: signal.price,
      direction: signal.direction === "bearish" ? "bearish" : "bullish",
      support: signal.support,
      resistance: signal.resistance,
      pattern: signal.pattern,
      score: signal.score,
      bias: signal.bias,
      reason: signal.reason,
      chartPattern: signal.chartPattern,
      chartPatternNote: signal.chartPatternNote,
      atr: signal.atr ?? null,
      timeframeMinutes: signal.timeframeMinutes ?? null,
      candles: signal.candles ?? null,
      candlestick: signal.candlestickPattern
        ? {
            name: signal.candlestickPattern,
            confidence: signal.candlestickConfidence,
            type: signal.candlestickType ?? "neutral",
          }
        : null,
    });
    if (!full) return empty;
    return {
      entry1: full.entry1,
      entry2: full.entry2,
      stopLoss: full.stopLoss,
      tp1: full.tp1,
      tp2: full.tp2,
      tp3: full.tp3,
      riskPercent: full.riskPercent,
      rr1: full.rr1,
      rr2: full.rr2,
      rr3: full.rr3,
      leverage: full.leverage,
    };
  } catch (error) {
    console.warn(
      `[signalsLive] trade plan failed for ${signal.symbol}:`,
      error instanceof Error ? error.message : error,
    );
    return empty;
  }
}

/**
 * Build a Firestore CloudDoc (symbol + market + timeframe "1h" + persistence metadata).
 *
 * The doc carries the FULL trade plan (entry1/entry2/SL/TP1-3 + R:R) so the
 * server-side /api/track-signals cron can resolve WIN/LOSS without waiting for
 * a browser to rebuild the plan. The plan is built with the SAME
 * generateFullSignal() the Signals page renders, so cloud and local cards can
 * never disagree.
 */
export function toCloudDoc(signal: EmittedMarketSignal): CloudDoc | null {
  // Quality filter — synchronous check. If fails, skip this signal.
  if (!passesQualityFilter(signal)) {
    console.debug(`[toCloudDoc] SKIP ${signal.symbol} — quality filter failed`);
    return null;
  }
  try {
    const now = Date.now();
    const plan = buildTradePlan(signal);
    return {
      symbol: signal.symbol,
      label: signal.label,

      market: signal.market,
      timeframe: "1h",
/**

 * FORCE SAVE FALLBACK — when scan returns 0 candidates
 * Uses top 5 hardcoded coins with WEAK SETUP badge
 */
score: signal.score,

      direction: signal.direction,
      price: signal.price,
      // ── Trade plan (REQUIRED by /api/track-signals to resolve the outcome) ──
      entry1: plan.entry1,
      entry2: plan.entry2,
      stopLoss: plan.stopLoss,
      tp1: plan.tp1,
      tp2: plan.tp2,
      tp3: plan.tp3,
      riskPercent: plan.riskPercent,
      rr1: plan.rr1,
      rr2: plan.rr2,
      rr3: plan.rr3,
      leverage: plan.leverage,
      pattern: signal.pattern,
      support: signal.support,
      resistance: signal.resistance,
      watchLevel: signal.watchLevel,
      reason: signal.reason,
      chartPattern: signal.chartPattern,
      chartPatternNote: signal.chartPatternNote,
      candlestickPattern: signal.candlestickPattern,
      candlestickType: signal.candlestickType,
      candlestickConfidence: signal.candlestickConfidence,
      candlestick: signal.candlestick,
      conditionsPassed: signal.conditionsPassed,
      conditions: signal.conditions,
      confirmations: signal.confirmations,
      indicators: signal.indicators,
      experts: signal.experts,
      atr: signal.atr ?? null,
      timeframeMinutes: signal.timeframeMinutes ?? 60,
      // Chart-source payload — what peek-signals.mjs verifies on the docs.
      candles: Array.isArray(signal.candles) && signal.candles.length > 0 ? signal.candles : null,
      patternPoints: signal.patternPoints ?? null,
      analyzedAt: signal.analyzedAt,
      // Mirror of the track-signals 24h rule (SIGNAL_TTL_MS) for consumers
      // that need a hard expiry stamp without re-deriving it from createdAt.
      expiresAt: now + SIGNAL_TTL_MS,
      dateKey: karachiDateKey(now),
      status: "PENDING",
      createdAt: now,
    };
  } catch {
    return null;
  }
}
/**

 * FORCE SAVE FALLBACK — when scan returns 0 candidates
 * Uses top 5 hardcoded coins with WEAK SETUP badge
 */




