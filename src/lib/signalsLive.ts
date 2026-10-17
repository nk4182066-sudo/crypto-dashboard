/**
 * signalsLive.ts — the 20-signal LIVE POOL service (Feature: live signal lifecycle).
 *
 * The strict 8/8 + 4/4 emission gate, per-market caps (Crypto 7 / Forex 7 /
 * Metals 4 / Stocks 2), and the auto-refill are shared here so every surface
 * (the Signals page, the new /api/signals/live endpoint, and the background
 * refill after a loss/expiry) reads ONE code path and computes ONE score.
 *
 * Emission rules (strict, per spec):
 *   - conditionsOk >= 8  → 8/8 (PERFECT, score 100).
 *   - expertsOk = agreed >= 4 && total === 4  → 4/4 expert consensus.
 *   - score 88+ earns the High-Confidence badge (signalStorage.MIN_SCORE);
 *     the page list renders from DISPLAY_MIN_SCORE (75).
 *   - FALLBACK (spec: "agar 0 signals hain to conditions relax karo"): when a
 *     market's strict pass is empty, getStrictSignals() flushes its best
 *     >=5/8 + >=3/4 near misses (same policy /api/market-signals ships) so the
 *     tab is never silently empty — strict always wins when it fires.
 *
 * Auto-refill:
 *   - /api/track-signals resolves a setup to WIN / LOSS / EXPIRED and then
 *     calls refresh(market) to slot the next best 8/8+4/4 candidate back in.
 *   - getLiveSignals() is capped at LIVE_CAPS[m] so the pool never exceeds
 *     7 / 7 / 4 / 2, always keeping exactly 20 live signals.
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
import { persistSignals, readAllSignals, type CloudDoc } from "./signalCloud";
import type { Candle } from "@/src/analysis/types";

/** Per-market live cap (Spec: 20 total = 7 + 7 + 4 + 2). */
export const LIVE_CAPS: Record<ScanMarket, number> = {
  crypto: 7,
  forex: 7,
  metals: 4,
  stocks: 2,
};

/** Which Cloud Firestore statuses are considered resolved (win/loss/expiry). */
export const RESOLVED_STATUSES = new Set(["WIN", "LOSS", "EXPIRED"]);

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
}

function toEmittedSignal(item: { symbol: string; label: string; market: ScanMarket; reason: string }, full: ReturnType<typeof analyzeCoin>, confirmations: EmittedMarketSignal["confirmations"], indicators: EmittedMarketSignal["indicators"], experts: EmittedMarketSignal["experts"]): EmittedMarketSignal {
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
  };
}

/** A strict-gate near miss captured for the relaxation flush (spec: "agar 0
 * signals hain to conditions relax karo"). Same policy /api/market-signals
 * ships — used ONLY when the strict 8/8 + 4/4 pass produces nothing. */
export interface StrictNearMiss {
  item: { symbol: string; label: string; market: ScanMarket; reason: string };
  full: ReturnType<typeof analyzeCoin>;
  confirmations: EmittedMarketSignal["confirmations"];
  indicators: EmittedMarketSignal["indicators"];
  experts: EmittedMarketSignal["experts"];
}

/** Evaluates ONE candidate against the strict 8/8 + 4/4 gate. Returns null if
 * rejected; qualifying near misses (>=5/8 conditions + >=3/4 experts) are also
 * pushed into `nearMisses` (when provided) for the Tier-2 relaxation flush, and
 * weaker misses (>=4/8 conditions + >=2/4 experts) into `weakMisses` for the
 * Tier-3 last-resort flush. */
export async function evaluateStrict(
  candidate: { symbol: string; label: string; market: ScanMarket; reason: string },
  h1: Candle[],
  h4: Candle[],
  d1: Candle[],
  nearMisses?: StrictNearMiss[],
  weakMisses?: StrictNearMiss[],
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

  const conditionsOk = full.conditionsPassed >= 8;

  // Shared 4-indicator + 4-educator panel (same shape the UI renders).
  let confirmations: EmittedMarketSignal["confirmations"] = null;
  let experts: EmittedMarketSignal["experts"] = null;
  let indicators: EmittedMarketSignal["indicators"] = null;

  if (h1.length >= 30) {
    try {
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
      const report = buildConfirmations(insightInput);
      const built = buildEducators(report, insightInput);
      confirmations = { indicators: report.indicators, confirmed: report.confirmed, total: report.total };
      experts = { educators: built.educators, consensus: built.consensus };
    } catch (error) {
      console.warn(`[signalsLive] confirmation build failed for ${candidate.symbol}:`, error instanceof Error ? error.message : error);
    }
  }
  if (h1.length >= 20) {
    try {
      indicators = calculateIndicators({ candles: h1, direction: full.direction });
    } catch (error) {
      console.warn(`[signalsLive] indicator build failed for ${candidate.symbol}:`, error instanceof Error ? error.message : error);
      indicators = null;
    }
  }

  // STRICT 4/4 expert gate (spec: "Strict 8/8 + 4/4").
  const expertsOk = experts !== null && experts.consensus.total === 4 && experts.consensus.agreed >= 4;
  if (!conditionsOk || !expertsOk) {
    // Near-miss audit — shows HOW CLOSE a candidate got, so a 0-signal response
    // is explainable ("28 candidates were 7/8, none 8/8") instead of a black box.
    if (full.conditionsPassed >= 6 || (experts?.consensus.agreed ?? 0) >= 3) {
      console.log(
        `[signalsLive] near-miss ${candidate.symbol}: ${full.conditionsPassed}/8 conditions` +
          `, experts ${experts?.consensus.agreed ?? 0}/${experts?.consensus.total ?? 0}` +
          `, indicators ${confirmations?.confirmed ?? 0}/${confirmations?.total ?? 0}` +
          `, dir=${full.direction}, score=${full.score}`,
      );
    }
    // Relaxation buffers — the SAME >=5/8 + >=3/4 bar /api/market-signals keeps
    // (Tier 2), plus a weaker >=4/8 + >=2/4 bar (Tier 3, last resort). Strict
    // 8/8 + 4/4 always wins; the flushes only fill slots strict left empty.
    if (nearMisses && full.conditionsPassed >= 5 && experts !== null && experts.consensus.total === 4 && experts.consensus.agreed >= 3) {
      nearMisses.push({ item: candidate, full, confirmations, indicators, experts });
    }
    if (weakMisses && full.conditionsPassed >= 4 && experts !== null && experts.consensus.total === 4 && experts.consensus.agreed >= 2) {
      weakMisses.push({ item: candidate, full, confirmations, indicators, experts });
    }
    return null;
  }

  return toEmittedSignal(candidate, full, confirmations, indicators, experts);
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
const MAX_CANDIDATES_PER_CALL = 30;

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
  const nearMisses: StrictNearMiss[] = [];
  const weakMisses: StrictNearMiss[] = [];
  let scanned = 0;
  let noCandles = 0;
  let rejected = 0;
  let belowFloor = 0;
  let relaxed = 0;

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
      const signal = await evaluateStrict(item, h1, h4, d1, nearMisses, weakMisses);
      if (!signal) { rejected += 1; continue; }
      // 88+ emission floor (8/8 = 100; the no-pattern guard caps a card at 7/8 = 88).
      if (signal.score < 88) { belowFloor += 1; continue; }
      results.push(signal);
    }
  }

  // TIERED RELAXATION FLUSH — strict 8/8 + 4/4 (Tier 1) always wins; whatever
  // slots it leaves are filled Tier 2 first (>=5/8 conditions + >=3/4 experts),
  // then Tier 3 last-resort (>=4/8 + >=2/4) so a market tab is never blank.
  // Cards keep their REAL condition count and honest score.
  const relaxCap = limit ?? LIVE_CAPS[market];
  const flush = (buffer: StrictNearMiss[]) => {
    buffer.sort(
      (a, b) =>
        b.full.conditionsPassed - a.full.conditionsPassed ||
        (b.experts?.consensus.agreed ?? 0) - (a.experts?.consensus.agreed ?? 0) ||
        b.full.score - a.full.score,
    );
    for (const near of buffer) {
      if (results.length >= relaxCap) break;
      results.push(toEmittedSignal(near.item, near.full, near.confirmations, near.indicators, near.experts));
      relaxed += 1;
    }
  };
  if (results.length < relaxCap && nearMisses.length > 0) flush(nearMisses);
  if (results.length < relaxCap && weakMisses.length > 0) flush(weakMisses);
  if (relaxed > 0) {
    console.log(`[signalsLive] ${market}: relaxed ${relaxed} signal(s) to reach ${results.length}/${relaxCap} (Tier2=${nearMisses.length}, Tier3=${weakMisses.length})`);
  }

  if (limit === undefined) {
    results.sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));
  }
  console.log(
    `[signalsLive] ${market}: Scanned ${scanned}, found ${results.length} signals` +
      ` (candidates=${candidates.length}, noCandles=${noCandles}, rejected=${rejected}, belowFloor=${belowFloor}, relaxed=${relaxed})`,
  );
  return results;
}

/** Returns the LIVE POOL for `market`, capped at LIVE_CAPS[m]. */
export async function getLiveSignals(market: ScanMarket, origin?: string): Promise<EmittedMarketSignal[]> {
  const strict = await getStrictSignals(market, undefined, origin);
  return strict.slice(0, LIVE_CAPS[market]);
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
      if (cloudDoc) await persistSignals([cloudDoc]);
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
      status: "PENDING",
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}

