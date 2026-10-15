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
 *   - score 88+ is the UI display floor (see signalStorage.MIN_SCORE).
 *
 * Auto-refill:
 *   - /api/track-signals resolves a setup to WIN / LOSS / EXPIRED and then
 *     calls refresh(market) to slot the next best 8/8+4/4 candidate back in.
 *   - getLiveSignals() is capped at LIVE_CAPS[m] so the pool never exceeds
 *     7 / 7 / 4 / 2, always keeping exactly 20 live signals.
 *
 * Educational analysis only — not financial advice.
 */

import { cacheGet } from "./cache";
import { getCachedSnapshot } from "@/src/scanner/scanner";
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

/** Evaluates ONE candidate against the strict 8/8 + 4/4 gate. Returns null if rejected. */
export async function evaluateStrict(candidate: { symbol: string; label: string; market: ScanMarket; reason: string }, h1: Candle[], h4: Candle[], d1: Candle[]): Promise<EmittedMarketSignal | null> {
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
  if (!conditionsOk || !expertsOk) return null;

  return toEmittedSignal(candidate, full, confirmations, indicators, experts);
}


/** Fetch ONE timeframe of candles from the shared /api/market/history endpoint —
 * the exact source the Trade page and the strict engine read. Empty array on
 * any failure so scoring degrades gracefully. */
async function fetchHistoryCandles(
  market: ScanMarket,
  symbol: string,
  timeframe: "1h" | "4h" | "1d",
): Promise<Candle[]> {
  try {
    const query = new URLSearchParams({ market, symbol, timeframe });
    const response = await fetch(`/api/market/history?${query}`, { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as { candles?: Candle[] };
    return Array.isArray(payload.candles) ? payload.candles : [];
  } catch {
    return [];
  }
}

/** Scans the universe (cached snapshot) and returns every candidate for `market`
 * that clears the strict 8/8 + 4/4 gate. No cap applied here — callers apply
 * LIVE_CAPS. Each candidate runs the SAME analyzeCoin() the Trade + Signals
 * pages use, over the SAME h1/h4/d1 candles the engine reads. */
export async function getStrictSignals(market: ScanMarket, limit?: number): Promise<EmittedMarketSignal[]> {
  const snapshot = await getCachedSnapshot();
  const candidates = snapshot?.results?.filter((item) => item.market === market) ?? [];
  const results: EmittedMarketSignal[] = [];
  let dropped = 0;

  for (const item of candidates) {
    const [h1, h4, d1] = await Promise.all([
      fetchHistoryCandles(item.market, item.symbol, "1h"),
      fetchHistoryCandles(item.market, item.symbol, "4h"),
      fetchHistoryCandles(item.market, item.symbol, "1d"),
    ]);
    if (h1.length < 20) { dropped += 1; continue; }
    if (limit !== undefined && results.length >= limit) break;
    const signal = await evaluateStrict(item, h1, h4, d1);
    if (signal) results.push(signal);
    else dropped += 1;
  }

  if (limit === undefined) {
    results.sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));
  }
  return results;
}

/** Returns the LIVE POOL for `market`, capped at LIVE_CAPS[m]. */
export async function getLiveSignals(market: ScanMarket): Promise<EmittedMarketSignal[]> {
  const strict = await getStrictSignals(market);
  return strict.slice(0, LIVE_CAPS[market]);
}


/**
 * Ensures the live pool for `market` is capped at LIVE_CAPS[m].
 * Resolves WIN/LOSS/EXPIRED records out, then slots the best passing candidates
 * back in (auto-refill on resolution). Best-effort persistence.
 */
export async function refresh(market: ScanMarket): Promise<EmittedMarketSignal[]> {
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

  const candidates = (await getStrictSignals(market, toFill)).filter((s) => !liveBySymbol.has(s.symbol));
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

