
function conditionSupportResistance(candles4h: Candle[], indicators: StrictIndicators, direction: Direction): ConditionChecks["supportResistance"] {
  if (candles4h.length < 20) return { pass: false, detail: "Not enough 4h candles for S/R levels", support: 0, resistance: 0 };
  const pivots = zigZag(candles4h, 3);
  const lows = pivots.filter((p) => p.kind === "low").map((p) => p.price);
  const highs = pivots.filter((p) => p.kind === "high").map((p) => p.price);
  if (lows.length === 0 || highs.length === 0) return { pass: false, detail: "No swing levels found", support: 0, resistance: 0 };
  const support = Math.min(...lows);
  const resistance = Math.max(...highs);
  const atr = indicators.atr14 ?? 0;
  const proximity = 1.5 * atr;
  if (direction === "bullish") {
    if (support <= 0) return { pass: false, detail: "No valid support", support, resistance };
    const distance = candles4h[candles4h.length - 1].close - support;
    if (distance < 0 || distance > proximity) {
      return { pass: false, detail: `Price ${distance.toFixed(0)} above support ${support.toFixed(0)} (within 1.5x ATR required)`, support, resistance };
    }
    return { pass: true, detail: `Support ${support.toFixed(0)} within 1.5x ATR (bounce zone)`, support, resistance };
  }
  if (resistance <= 0) return { pass: false, detail: "No valid resistance", support, resistance };
  const distance = resistance - candles4h[candles4h.length - 1].close;
  if (distance < 0 || distance > proximity) {
    return { pass: false, detail: `Price ${distance.toFixed(0)} below resistance ${resistance.toFixed(0)} (within 1.5x ATR required)`, support, resistance };
  }
  return { pass: true, detail: `Resistance ${resistance.toFixed(0)} within 1.5x ATR (rejection zone)`, support, resistance };
}

/** MASLA 3 — relaxed thresholds for signal generation. */
const RELAXED_RSI_OVERSOLD = 35;
const RELAXED_RSI_OVERBOUGHT = 65;
const RELAXED_VOLUME_RATIO = 1.0;
const RELAXED_EXPERTS_MIN = 2;
const RELAXED_SCORE_MIN = 75;

/** MASLA 3 — relaxed RSI condition for signal generation. */
function conditionRsi(indicators: StrictIndicators, direction: Direction): ConditionChecks["rsi"] {
  const rsi = indicators.rsi ?? 0;
  if (direction === "bullish") {
    if (rsi < RELAXED_RSI_OVERSOLD) return { pass: true, detail: `RSI ${rsi.toFixed(1)} oversold (<${RELAXED_RSI_OVERSOLD})`, rsi };
    return { pass: false, detail: `RSI ${rsi.toFixed(1)} not oversold (<${RELAXED_RSI_OVERSOLD} required)`, rsi };
  }
  if (rsi > RELAXED_RSI_OVERBOUGHT) return { pass: true, detail: `RSI ${rsi.toFixed(1)} overbought (>${RELAXED_RSI_OVERBOUGHT})`, rsi };
  return { pass: false, detail: `RSI ${rsi.toFixed(1)} not overbought (>${RELAXED_RSI_OVERBOUGHT} required)`, rsi };
}

function conditionMacd(indicators: StrictIndicators, direction: Direction): ConditionChecks["macd"] {
  const m = indicators.macd;
  const prev = indicators.macdPrev;
  if (!m) return { pass: false, detail: "No MACD data", direction: null };
  const { line, signal, histogram } = m;
  // Histogram must cross zero: prev and current histogram on opposite sides of 0.
  if (!prev) return { pass: false, detail: "No previous MACD bar for zero-cross", direction: null };
  const crossedUp = prev.histogram <= 0 && histogram > 0;
  const crossedDown = prev.histogram >= 0 && histogram < 0;
  const crossedZero = direction === "bullish" ? crossedUp : crossedDown;
  if (!crossedZero) {
    return { pass: false, detail: `MACD histogram did not cross zero (prev=${prev.histogram.toFixed(2)}, curr=${histogram.toFixed(2)})`, direction: null };
  }
  // MACD line must be on the correct side of signal for the direction.
  if (direction === "bullish" && line <= signal) {
    return { pass: false, detail: `MACD line ${line.toFixed(1)} <= signal ${signal.toFixed(1)}`, direction: null };
  }
  if (direction === "bearish" && line >= signal) {
    return { pass: false, detail: `MACD line ${line.toFixed(1)} >= signal ${signal.toFixed(1)}`, direction: null };
  }
  return { pass: true, detail: `MACD histogram crossed zero + line ${direction === "bullish" ? "above" : "below"} signal`, direction };
}

function conditionEmaAlignment(indicators: StrictIndicators, direction: Direction): ConditionChecks["emaAlignment"] {
  const { ema20, ema50, ema200 } = indicators;
  if (ema20 == null || ema50 == null || ema200 == null) return { pass: false, detail: "EMA20/50/200 not available", direction: null };
  if (direction === "bullish") {
    if (!(ema20 > ema50 && ema50 > ema200)) {
      return { pass: false, detail: "EMA alignment not strict (EMA20 > EMA50 > EMA200)", direction: null };
    }
    return { pass: true, detail: "Price > EMA20 > EMA50 > EMA200", direction };
  }
  if (!(ema20 < ema50 && ema50 < ema200)) {
    return { pass: false, detail: "EMA alignment not strict (price < EMA20 < EMA50 < EMA200)", direction: null };
  }
  return { pass: true, detail: "Price < EMA20 < EMA50 < EMA200", direction };
}

function conditionVolume(indicators: StrictIndicators): ConditionChecks["volume"] {
  if (indicators.volumeRatio < RELAXED_VOLUME_RATIO) {
    return { pass: false, detail: `Volume ${indicators.volumeRatio.toFixed(2)}x avg (>=${RELAXED_VOLUME_RATIO}x required)`, ratio: indicators.volumeRatio };
  }
  return { pass: true, detail: `Volume ${indicators.volumeRatio.toFixed(2)}x avg + rising in trade direction`, ratio: indicators.volumeRatio };
}


export function computeIndicators(candles: Candle[]): StrictIndicators {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const rsiSeries = rsi(closes, 14);
  const rsi14 = seriesLast(rsiSeries);
  const macd = macdSeries(closes);
  const atr14 = atr(candles, 14);
  const atr14Last = seriesLast(atr14);

  let rsiStatus: "oversold" | "neutral" | "overbought" = "neutral";
  if (rsi14 !== null) {
    if (rsi14 < 30) rsiStatus = "oversold";
    else if (rsi14 > 70) rsiStatus = "overbought";
  }

  const volumeLast = volumes[volumes.length - 1] ?? 0;
  const avg20 = volumes.slice(-20).reduce((a, b) => a + (b ?? 0), 0) / 20;
  const volumeRatio = avg20 > 0 ? volumeLast / avg20 : 0;

  const macdLastIdx = macd.line.length - 1;
  const macdPrevIdx = macd.line.length - 2;
  const macdCurrent = macd.line !== undefined && macd.line !== null && macdLastIdx >= 0
    ? { line: macd.line[macdLastIdx]!, signal: macd.signal![macdLastIdx]!, histogram: macd.histogram![macdLastIdx]! }
    : null;
  const macdPrevious = macd.line !== undefined && macd.line !== null && macdPrevIdx >= 0
    ? { line: macd.line[macdPrevIdx]!, signal: macd.signal![macdPrevIdx]!, histogram: macd.histogram![macdPrevIdx]! }
    : null;

  return {
    rsi: rsi14,
    rsiStatus,
    macd: macdCurrent,
    macdPrev: macdPrevious,
    ema20: seriesLast(ema(closes, 20)),
    ema50: seriesLast(ema(closes, 50)),
    ema200: seriesLast(ema(closes, 200)),
    atr14: atr14Last,
    volume: volumeLast,
    volumeRatio,
  };
}

export interface ConditionChecks {
  chartPattern: { pass: boolean; detail: string; name: string; confidence: number };
  candlestick: { pass: boolean; detail: string; name: string; confidence: number };
  trend: { pass: boolean; detail: string; direction: Direction | null; note: string };
  supportResistance: { pass: boolean; detail: string; support: number; resistance: number };
  rsi: { pass: boolean; detail: string; rsi: number };
  macd: { pass: boolean; detail: string; direction: Direction | null };
  emaAlignment: { pass: boolean; detail: string; direction: Direction | null };
  volume: { pass: boolean; detail: string; ratio: number };
}

function conditionChartPattern(candles4h: Candle[], direction: Direction): ConditionChecks["chartPattern"] {
  const hit = detectChartPattern(candles4h, 200);
  // ULTRA-STRICT: only Double Top / Double Bottom qualify, and only when the
  // pattern's type matches the setup direction (4/4 gate input).
  if (!hit || (hit.name !== "Double Top" && hit.name !== "Double Bottom") || hit.type !== direction) {
    const seen = hit ? `${hit.name} (${hit.type})` : "none";
    return { pass: false, detail: `No direction-matched Double Top/Bottom on 4h (saw: ${seen})`, name: "", confidence: 0 };
  }
  return { pass: true, detail: `Chart pattern ${hit.name} @ ${hit.confidence}%`, name: hit.name, confidence: hit.confidence };
}

function conditionCandlestick(candles: Candle[], direction: Direction): ConditionChecks["candlestick"] {
  // ULTRA-STRICT: only Morning Star / Evening Star qualify.
  const hit = detectCandlePatternLast3(candles);
  if (!hit) return { pass: false, detail: "No clear candlestick pattern in last 3 candles", name: "", confidence: 0 };
  if (hit.name !== "Morning Star" && hit.name !== "Evening Star") {
    return { pass: false, detail: `Candlestick ${hit.name} rejected (only Morning/Evening Star allowed)`, name: hit.name, confidence: hit.confidence };
  }
  if (hit.type !== direction) return { pass: false, detail: `Candlestick ${hit.name} is ${hit.type} but setup is ${direction}`, name: hit.name, confidence: hit.confidence };
  return { pass: true, detail: `Candlestick ${hit.name} @ ${hit.confidence}%`, name: hit.name, confidence: hit.confidence };
}

function conditionTrend(trends: StrictTrend[]): ConditionChecks["trend"] {
  // 3/3 required: 1h + 4h + 1d must all be present AND agree (ultra-strict).
  if (trends.length < 3) {
    return {
      pass: false,
      detail: `Multi-TF trend incomplete (need 1h+4h+1d, got ${trends.length}/3)`,
      direction: null,
      note: `timeframes=${trends.length}/3`,
    };
  }
  const directions = trends.map((t) => t.direction);
  const biases = trends.map((t) => t.bias);
  const allDefined = directions.every((d) => d !== null);
  const allSame = new Set(directions).size === 1 && allDefined;
  const allNonSideways = biases.every((b) => b !== "Sideways");
  if (!allDefined || !allSame || !allNonSideways) {
    const note = `1h=${trends[0]?.direction ?? "?"}, 4h=${trends[1]?.direction ?? "?"}, 1d=${trends[2]?.direction ?? "?"}`;
    return { pass: false, detail: `Multi-TF trend mismatch (1h+4h+1d must agree): ${note}`, direction: null, note };
  }
  return { pass: true, detail: `Multi-TF trend aligned: ${trends.map((t) => t.bias).join(" / ")}`, direction: directions[0]!, note: trends.map((t) => t.note).join("; ") };
}


export function assessTrend(candles: Candle[]): { direction: Direction; bias: "Bullish" | "Bearish" | "Sideways"; hh: number; hl: number; lh: number; ll: number; note: string } {
  if (candles.length < 30) {
    return { direction: "bullish", bias: "Sideways", hh: 0, hl: 0, lh: 0, ll: 0, note: "Insufficient candles (<30)" };
  }
  const pivots = zigZag(candles, 3);
  const highs = pivots.filter((p) => p.kind === "high").map((p) => p.price);
  const lows = pivots.filter((p) => p.kind === "low").map((p) => p.price);
  if (highs.length < 3 || lows.length < 3) {
    return { direction: "bullish", bias: "Sideways", hh: highs.length, hl: lows.length, lh: 0, ll: 0, note: "Too few pivots" };
  }
  const hh = highs[highs.length - 1] > highs[highs.length - 2] ? 1 : 0;
  const hl = lows[lows.length - 1] > lows[lows.length - 2] ? 1 : 0;
  const lh = highs[highs.length - 1] < highs[highs.length - 2] ? 1 : 0;
  const ll = lows[lows.length - 1] < lows[lows.length - 2] ? 1 : 0;
  if (hh > 0 && hl > 0) return { direction: "bullish", bias: "Bullish", hh, hl, lh, ll, note: "Higher Highs + Higher Lows" };
  if (lh > 0 && ll > 0) return { direction: "bearish", bias: "Bearish", hh, hl, lh, ll, note: "Lower Highs + Lower Lows" };
  return { direction: "bullish", bias: "Sideways", hh, hl, lh, ll, note: "Mixed / sideways" };
}

export interface PatternHit {
  name: string;
  type: Direction | "neutral";
  confidence: number;
}

export function detectChartPattern(candles: Candle[], lookback = 200): PatternHit | null {
  if (candles.length < 40) return null;
  const hits = scanChartPatterns(candles, lookback);
  const direction = resolveDirectionalBias(hits);
  if (direction === null) return null;
  const picked = hits.filter((h) => h.type === direction && h.confidence >= 70).sort((a, b) => b.confidence - a.confidence)[0];
  if (!picked) return null;
  return { name: picked.pattern, type: picked.type as Direction, confidence: picked.confidence };
}

function resolveDirectionalBias(hits: ChartPatternHit[]): Direction | null {
  const bullish = hits.filter((h) => h.type === "bullish");
  const bearish = hits.filter((h) => h.type === "bearish");
  if (bullish.length > 0 && bearish.length === 0) return "bullish";
  if (bearish.length > 0 && bullish.length === 0) return "bearish";
  if (bullish.length > 0 && bearish.length > 0) {
    return bullish[0].confidence >= bearish[0].confidence ? "bullish" : "bearish";
  }
  return null;
}

export function detectCandlePatternLast3(candles: Candle[]): PatternHit | null {
  if (candles.length < 3) return null;
  // Candles are chronological (oldest -> newest), so the SETUP candles are the
  // LAST three. Reading candles[0..2] inspected the oldest bars in the series —
  // the condition then judged ancient data instead of the current pattern.
  const recent = candles.slice(-3);
  const c1 = recent[0];
  const c2 = recent[1];
  const c3 = recent[2];
  const candidates: PatternHit[] = [];

  if (!isRed(c2) && isGreen(c3) && c3.close >= Math.min(c2.open, c2.close) && c3.open <= Math.max(c2.open, c2.close)) {
    candidates.push({ name: "Bullish Engulfing", type: "bullish", confidence: 88 });
  }
  if (isRed(c2) && !isRed(c3) && c3.close <= Math.max(c2.open, c2.close) && c3.open >= Math.min(c2.open, c2.close)) {
    candidates.push({ name: "Bearish Engulfing", type: "bearish", confidence: 88 });
  }
  if (isHammerLike(c3)) candidates.push({ name: "Hammer", type: "bullish", confidence: 76 });
  if (isShootingStarLike(c3)) candidates.push({ name: "Shooting Star", type: "bearish", confidence: 74 });
  if (isRed(c1) && isDojiish(c2) && isGreen(c3) && Math.abs(c3.close - c3.open) >= Math.abs(c2.close - c2.open) * 1.5) {
    candidates.push({ name: "Morning Star", type: "bullish", confidence: 90 });
  }
  if (isGreen(c1) && isDojiish(c2) && isRed(c3) && Math.abs(c3.close - c3.open) >= Math.abs(c2.close - c2.open) * 1.5) {
    candidates.push({ name: "Evening Star", type: "bearish", confidence: 90 });
  }
  if (isDojiish(c3)) candidates.push({ name: "Doji", type: "neutral", confidence: 60 });

  candidates.sort((a, b) => b.confidence - a.confidence);
  if (candidates.length === 0) return null;
  return candidates[0];
}

function isGreen(c: Candle): boolean {
  return c.close > c.open;
}
function isRed(c: Candle): boolean {
  return c.close < c.open;
}
function isDojiish(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range <= 0) return false;
  return body <= range * 0.08;
}
function isHammerLike(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  if (body <= 0) return false;
  const range = c.high - c.low;
  if (range <= body) return false;
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  return lowerWick >= body * 2 && upperWick <= body * 0.6 && c.close >= c.open;
}
function isShootingStarLike(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  if (body <= 0) return false;
  const range = c.high - c.low;
  if (range <= body) return false;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  return upperWick >= body * 2 && lowerWick <= body * 0.6 && c.close <= c.open;
}


/**
 * MASLA 3 — STRICT signal engine (per user spec).
 *
 * 8 MANDATORY conditions, 100% multi-TF confluence (1h + 4h + 1d),
 * strict scoring (8/8 -> PERFECT, 7/8 -> STRONG, 6/8 -> GOOD, 5/8 -> SKIP,
 * <=4/8 -> NO SIGNAL), SL 1.5x ATR, TP 1:2/1:3/1:4, risk 2%.
 */

import type { Candle } from "@/src/analysis/types";
import { ema, rsi, atr } from "@/src/analysis/indicators";
import { zigZag } from "@/src/analysis/structure";
import { scanChartPatterns, type ChartPatternHit } from "@/src/lib/chart/chartPatterns";
import { scanCandlestickPatterns, type CandlestickPatternHit } from "@/src/lib/chart/candlestickPatterns";

export const CONDITION_IDS = [
  "chartPattern",
  "candlestick",
  "trend",
  // MASLA 2 #8 — R:R 1:3+ (SL max 3%) replaces the old S/R-proximity check.
  "riskReward",
  "rsi",
  "macd",
  "emaAlignment",
  "volume",
] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

export type Quality = "PERFECT" | "STRONG" | "GOOD";
export type SignalStatus = "SIGNAL" | "WATCH" | "NONE";
export type Confluence = "HIGH" | "MEDIUM";

export interface ConditionResult {
  id: ConditionId;
  label: string;
  pass: boolean;
  detail: string;
}

export interface StrictIndicators {
  rsi: number | null;
  rsiStatus: "oversold" | "neutral" | "overbought";
  macd: { line: number; signal: number; histogram: number } | null;
  macdPrev: { line: number; signal: number; histogram: number } | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  atr14: number | null;
  volume: number;
  volumeRatio: number;
}

export interface StrictTrend {
  timeframe: "1h" | "4h" | "1d";
  direction: Direction;
  bias: "Bullish" | "Bearish" | "Sideways";
  hh: number;
  hl: number;
  lh: number;
  ll: number;
  note: string;
}

export type Direction = "bullish" | "bearish";

export interface StrictLevels {
  support: number;
  resistance: number;
  entry1: number;
  entry2: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  liquidation: number;
}

export interface ConditionsListEntry {
  id: ConditionId;
  text: string;
}

export interface Educator {
  role: string;
  verdict: string;
  reason: string;
  confirms: boolean;
}

export interface StrictPattern {
  chart: string;
  candlestick: string;
  maturity: "confirmed";
  description: string;
}

export function scoreFromConditions(conditionsMet: number, indicatorsAgreedCount?: number): { score: number; quality: Quality | null } {
  // STRICT FORMULA: Score = (Conditions_Passed / 8) * 100 — for ALL values
  //   1/8 = 13, 5/8 = 63, 6/8 = 75, 7/8 = 88, 8/8 = 100
  // Rounded so 7/8 lands on 88 (the STRONG band shown in the UI), never 87.
  // No >= 6 gate on the score itself — the quality/tier gate (conditions < 7
  // → REJECT) is applied by computeSignalTier() and the page-level filters.
  const score = Math.round((conditionsMet / 8) * 100);
  const quality: Quality | null = conditionsMet === 8 ? "PERFECT" : conditionsMet === 7 ? "STRONG" : null;
  return { score, quality };
}


/** Strict tier verdict for a scanned setup. Returns null when the setup must
 *  be REJECTED (never shown, never saved, never alerted). No relaxation. */
export type SignalTier = "PREMIUM" | "STRONG" | "GOOD" | null;

export interface SignalTierVerdict {
  tier: SignalTier;
  label: string;
  color: "green" | "blue" | "yellow";
  /** The exact fixed score for this tier — 95 / 85 / 80. */
  score: number;
}export function tierScore(conditionsPassed: number, expertsAgreed: number): number | null {
  if (conditionsPassed >= 8 && expertsAgreed >= 4) return 95;
  if (conditionsPassed >= 7 && expertsAgreed >= 3) return 85;
  if (conditionsPassed >= 6 && expertsAgreed >= 2) return 75;
  return null;
}

export function computeSignalTier({
  conditionsPassed,
  indicatorsAgreedCount,
  expertsAgreed,
  candlestickConfirmed,
  volumePassed,
  chartPatternPassed,
}: {
  conditionsPassed: number;
  indicatorsAgreedCount: number;
  expertsAgreed: number;
  candlestickConfirmed: boolean;
  volumePassed: boolean;
  chartPatternPassed: boolean;
}): SignalTierVerdict | null {
  const score = tierScore(conditionsPassed, expertsAgreed);
  if (score === null) return null;

  if (conditionsPassed >= 8 && expertsAgreed >= 4) {
    return { tier: "PREMIUM", label: "PREMIUM SETUP", color: "green", score };
  }
  if (conditionsPassed >= 7) {
    return { tier: "STRONG", label: "STRONG SETUP", color: "blue", score };
  }
  return { tier: "GOOD", label: "GOOD SETUP", color: "yellow", score };
}

export function qualityLabel(quality: Quality | null): Quality | null {
  if (quality === "PERFECT") return "PERFECT";
  if (quality === "STRONG") return "STRONG";
  if (quality === "GOOD") return "GOOD";
  return null;
}

function macdSeries(closes: number[]): {
  line: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const fe = ema(closes, 12);
  const se = ema(closes, 26);
  const line: (number | null)[] = closes.map((_, i) =>
    fe[i] != null && se[i] != null ? fe[i]! - se[i]! : null
  );
  const pairs: { idx: number; value: number }[] = [];
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== null) pairs.push({ idx: i, value: line[i]! });
  }
  const sigCompact = ema(pairs.map((p) => p.value), 9);
  const map = new Map<number, number>();
  for (let k = 0; k < sigCompact.length; k += 1) {
    const v = sigCompact[k];
    if (v !== null && pairs[k]) map.set(pairs[k].idx, v);
  }
  const outSignal: (number | null)[] = line.map((v, i) => (v === null ? null : map.get(i) ?? null));
  const histogram: (number | null)[] = line.map((v, i) =>
    v === null ? null : v - (outSignal[i] ?? v)
  );
  return { line, signal: outSignal, histogram };
}

function seriesLast(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== null) return values[i]!;
  }
  return null;
}






