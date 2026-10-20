/**
 * signalsLive.ts — the 40-signal LIVE POOL service (Feature: live signal lifecycle).
 *
 * The strict tier emission gate, per-market caps (10 each: Crypto / Forex /
 * Metals / Stocks), and the auto-refill are shared here so every surface
 * (the Signals page, the new /api/signals/live endpoint, and the background
 * refill after a loss/expiry) reads ONE code path and computes ONE score.
 *
 * Emission rules (spec: quality floor = 6/8 — "6/8 se neeche kuch nahi"):
 *   - Tier 1 (PREMIUM):  8/8 conditions + 3/4 experts → score 93-100.
 *   - Tier 2 (STRONG):   7/8 conditions + 3/4 experts → score 88-92.
 *   - Tier 3 (GOOD):     6/8 conditions + 3/4 experts → score 75-84.
 *   - Below Tier 3 (<6/8 OR <3/4 experts) → REJECT. There is NO relaxation
 *     flush and no near-miss filler — a quiet market simply shows fewer
 *     signals rather than ghatiya cards ("40 se kam, magar saaf").
 *   - score 85+ earns the High-Confidence badge (signalStorage.MIN_SCORE);
 *     the page list renders from DISPLAY_MIN_SCORE (75 = the 6/8 floor).
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
export type { ScanMarket };
import { analyzeCoin } from "./analyzeCoin";
import { buildConfirmations, buildEducators } from "./confirmations";
import { calculateIndicators } from "./indicatorEngine";
import { persistSignals, persistToHistory, readAllSignals, karachiDateKey, SIGNAL_TTL_MS, type CloudDoc } from "./signalCloud";
import type { Candle } from "@/src/analysis/types";

/** Per-market live cap (Spec: 40 total = 10 + 10 + 10 + 10). */
export const LIVE_CAPS: Record<ScanMarket, number> = {
  crypto: 10,
  forex: 10,
  metals: 10,
  stocks: 10,
};

/** Which Cloud Firestore statuses are considered resolved (win/loss/expiry). */
export const RESOLVED_STATUSES = new Set(["WIN", "LOSS", "EXPIRED"]);

/** Double Top/Bottom anchors (p1/p2 + neckline) — mirrors detectPattern's `PatternResult.points`. */
export interface SignalPatternPoints {
  p1: { time: number; price: number };
  p2: { time: number; price: number };
  neckline: number;
}

export interface EmittedMarketSignal {
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
  /** Double Top/Bottom anchors (p1/p2 + neckline) drawn as yellow circles on the Trade chart. */
  patternPoints?: SignalPatternPoints | null;
}

// Type aliases to avoid TS indexed-access type resolution quirks.
type EmittedConfirmations = EmittedMarketSignal["confirmations"];
type EmittedIndicators = EmittedMarketSignal["indicators"];
type EmittedExperts = EmittedMarketSignal["experts"];

function toEmittedSignal(item: { symbol: string; label: string; market: ScanMarket; reason: string }, full: ReturnType<typeof analyzeCoin>, confirmations: EmittedMarketSignal["confirmations"], indicators: EmittedMarketSignal["indicators"], experts: EmittedMarketSignal["experts"], h1: Candle[]): EmittedMarketSignal {
  return {
    symbol: item.symbol,
    label: item.label,
    market: item.market,
    score: full.score,
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
    // SINGLE-TRUTH CHART SOURCE: freeze the last 100 h1 bars + the Double
    // Top/Bottom anchors the detector saw, so the Trade page renders EXACTLY
    // the series the score was computed on (no live re-fetch drift).
    candles: h1.slice(-100),
    patternPoints: full.chartPatternPoints ?? null,
  };
}

/** Evaluates ONE candidate against the strict tier gate.
 *  Tier 1 (8/8 + 3/4 + 93+): returns signal directly.
 *  Tier 2 (7/8 + 3/4 + 88+): returns signal directly.
 *  Tier 3 (6/8 + 3/4 + 75+): returns signal directly — the quality floor.
 *  Below Tier 3 (<6/8 OR <3/4 experts): returns null (rejected, never buffered). */
export async function evaluateStrict(
  candidate: { symbol: string; label: string; market: ScanMarket; reason: string },
  h1: Candle[],
  h4: Candle[],
  d1: Candle[],
): Promise<EmittedMarketSignal | null> {
  if (h1.length < 20) return null;

  const full = analyzeCoin({ symbol: candidate.symbol, market: candidate.market, primary: h1, h1, h4, d1 });

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

  // STRICT gate with exact tier hierarchy (quality floor = 6/8, nothing below):
  //   Tier 1 (PREMIUM):  8/8 conditions → score 100
  //   Tier 2 (STRONG):   7/8 conditions → score 87
  //   Tier 3 (GOOD):     6/8 conditions → score 75
  //   Floor: conditions >= 6/8 AND experts >= 3/4 (delivery-grade consensus).
  //   Below 6/8 OR <3/4 experts → REJECT (not shown, not buffered,
  //   not flushed as filler — a quiet market shows fewer signals instead).
  const conditionsOk = full.conditionsPassed >= 6;
  // Experts gate: the panel must exist with at least 3/4 consensus — the
  // committed delivery-grade floor (unanimity 4/4 was an uncommitted over-
  // tighten that drove emission to 0). Null experts reject, so we never emit
  // an unverifiable card.
  const expertsOk = experts !== null && experts.consensus.agreed >= 3;
  if (!conditionsOk || !expertsOk) {
    // Below the Tier 3 minimum → reject. No near-miss buffering, no flush.
    console.log(
      `[signalsLive] reject ${candidate.symbol}: cond=${full.conditionsPassed} score=${full.score} dir=${full.direction} experts=${experts ? `${(experts as { consensus: { agreed: number; total: number } }).consensus.agreed}/${(experts as { consensus: { agreed: number; total: number } }).consensus.total}` : "null"} h1=${h1.length} failed=[${(full.conditions ?? []).filter((c) => !c.pass).map((c) => c.id).join(",")}]`,
    );
    return null;
  }
  return toEmittedSignal(candidate, full, confirmations, indicators, experts, h1);
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
  let candidates = getCachedSnapshot()?.results?.filter((item) => item.market === market) ?? [];

  if (candidates.length === 0) {
    const memo = coldScanCache.get(market);
    if (memo && Date.now() - memo.at < COLD_SCAN_TTL_MS) {
      candidates = memo.items;
      console.log(`[signalsLive] ${market}: snapshot empty → cold-scan cache hit (${candidates.length} candidates)`);
    } else {
      try {
        const targets = scanUniverse.filter((target) => target.market === market);
        const fresh = await runScan(targets);
        candidates = fresh.results.filter((item) => item.market === market);
        coldScanCache.set(market, { at: Date.now(), items: candidates });
        console.log(
          `[signalsLive] cold-start scan(${market}): Scanned ${fresh.scanned}, found ${candidates.length} candidates (${fresh.failed} failed)`,
        );
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
    if (limit !== undefined && results.length >= limit) break;
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
      if (limit !== undefined && results.length >= limit) break;
      if (scanned >= MAX_CANDIDATES_PER_CALL) break;
      const item = batch[index];
      const [h1, h4, d1] = candleSets[index];
      scanned += 1;
      if (h1.length < 20) { noCandles += 1; continue; }
      const signal = await evaluateStrict(item, h1, h4, d1);
      if (!signal) { rejected += 1; continue; }
      // Tier 3 emission floor: the 6/8 quality floor (score 75+). Any signal
      // that passes a quality tier lands here with its REAL condition count
      // and honest score — signals below 6/8 never reach this point.
      if (signal.score < 75) { belowFloor += 1; continue; }
      results.push(signal);
    }
  }

  if (limit === undefined) {
    results.sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));
  }
  console.log(
    `[signalsLive] ${market}: Scanned ${scanned}, found ${results.length} signals (candidates=${candidates.length}, noCandles=${noCandles}, rejected=${rejected}, belowFloor=${belowFloor})`,
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

/** Re-read the Double Top/Bottom anchors from a stored doc (null when absent/corrupt). */
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
  const neckline = Number(rec.neckline);
  if (!p1 || !p2 || !Number.isFinite(neckline)) return null;
  return { p1, p2, neckline };
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

  for (const d of allDocs) {
    if (typeof d.market !== "string" || d.market !== market) continue;
    if (RESOLVED_STATUSES.has(String(d.status ?? ""))) continue;
    if (liveBySymbol.has(String(d.symbol))) continue;

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
    liveBySymbol.set(signal.symbol, signal);
  }

  pool.sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));

  const toFill = Math.max(0, LIVE_CAPS[market] - pool.length);
  if (toFill === 0) return pool;

  const candidates = (await getStrictSignals(market, toFill, origin)).filter((s) => !liveBySymbol.has(s.symbol));
  const toAdd = candidates.slice(0, toFill);

  for (const sig of toAdd) {
    try {
      const cloudDoc = toCloudDoc(sig);
      if (cloudDoc) {
        await persistSignals([cloudDoc]);
        // Mirror into signals_history — the chart-source store whose originals
        // archive status updates (track-signals WIN/LOSS/EXPIRED patches) can
        // never overwrite.
        await persistToHistory([cloudDoc]);
      }
    } catch (error) {
      console.warn(`[signalsLive] persist failed for ${sig.symbol}:`, error instanceof Error ? error.message : error);
    }
  }

  for (const sig of toAdd) pool.push(sig);
  pool.sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));
  return pool.slice(0, LIVE_CAPS[market]);
}

/** Build a Firestore CloudDoc (symbol + market + timeframe "1h" + persistence metadata). */
export function toCloudDoc(signal: EmittedMarketSignal): CloudDoc | null {
  try {
    return {
      symbol: signal.symbol,
      label: signal.label,
      market: signal.market,
      timeframe: "1h",
      score: signal.score,
      direction: signal.direction,
      price: signal.price,
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
      // Mirror of the track-signals 30-day rule (SIGNAL_TTL_MS) for consumers
      // that need a hard expiry stamp without re-deriving it from createdAt.
      expiresAt: Date.now() + SIGNAL_TTL_MS,
      dateKey: karachiDateKey(),
      status: "PENDING",
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}



