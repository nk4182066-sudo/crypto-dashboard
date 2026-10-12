import type { CandlestickData, SeriesMarker, UTCTimestamp } from "lightweight-charts";

/** A single OHLCV bar, matching the shape the rest of the app already uses. */
export interface DetectorCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type CandlePatternDirection = "bullish" | "bearish" | "neutral";

export interface DetectedPattern {
  /** Human-readable name, e.g. "Bullish Engulfing". */
  name: string;
  direction: CandlePatternDirection;
  /** Timestamp of the bar the pattern completes on. */
  time: number;
  price: number;
  /** Short rationale shown alongside the marker text. */
  note: string;
  /** Why this pattern survived the high-conviction filter, for the legend. */
  trigger?: string;
}

/**
 * Context the high-conviction filter needs. Every field is optional so callers
 * that only have raw candles still get the (weaker) structural filters.
 */
export interface ConvictionContext {
  /** Explicit support prices. */
  support?: number[];
  /** Explicit resistance prices. */
  resistance?: number[];
  /** Per-candle RSI in the same order as the candles passed to the detector. */
  rsi?: Array<number | null | undefined>;
  /** Overbought threshold, default 70. */
  overbought?: number;
  /** Oversold threshold, default 30. */
  oversold?: number;
  /** How close a candle must sit to a level, as a fraction of the level. */
  levelTolerance?: number;
}

/** Body and wick measurements derived from one candle. */
interface Anatomy {
  candle: DetectorCandle;
  body: number;
  range: number;
  upperWick: number;
  lowerWick: number;
  bullish: boolean;
  bearish: boolean;
}

/** Tolerance for "equal" comparisons, scaled to the candle's own range. */
const EPSILON_RATIO = 0.02;
/**
 * Absolute slack added to every range-relative tolerance. Without it a body
 * that is *exactly* on the threshold can fail because of binary rounding
 * (e.g. 100.2 - 100 = 0.20000000000000284 > 0.2).
 */
const EPSILON_FLOOR = 1e-9;

/** Range-relative tolerance with a floor, so exact-threshold bars still match. */
function tolerance(range: number) {
  return range * EPSILON_RATIO + EPSILON_FLOOR;
}

function anatomy(candle: DetectorCandle): Anatomy {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  return {
    candle,
    body,
    range,
    upperWick: candle.high - Math.max(candle.open, candle.close),
    lowerWick: Math.min(candle.open, candle.close) - candle.low,
    bullish: candle.close > candle.open,
    bearish: candle.close < candle.open,
  };
}

function isValid(candle: DetectorCandle): boolean {
  return [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    && candle.high >= candle.low
    && candle.high >= Math.max(candle.open, candle.close)
    && candle.low <= Math.min(candle.open, candle.close);
}

/**
 * A doji is an indecision bar: the body is negligible against the full range
 * and at least one wick is clearly visible, which separates it from a flat
 * low-volatility bar.
 */
export function isDoji(candle: DetectorCandle): boolean {
  const a = anatomy(candle);
  if (a.range <= 0) return false;
  const epsilon = tolerance(a.range);
  const tinyBody = a.body <= epsilon;
  const hasWick = a.upperWick > epsilon || a.lowerWick > epsilon;
  return tinyBody && hasWick;
}

/**
 * Engulfing needs an opposite-coloured prior bar whose body the current body
 * fully covers. Requiring the current body to open past the prior close (bullish)
 * or prior open (bearish) keeps it from firing on a partial overlap.
 */
export function isBullishEngulfing(previous: DetectorCandle, current: DetectorCandle): boolean {
  const p = anatomy(previous);
  const c = anatomy(current);
  if (p.range <= 0 || c.range <= 0) return false;
  if (!p.bearish || !c.bullish) return false;
  if (c.body <= p.body) return false;
  return c.candle.close >= p.candle.open && c.candle.open <= p.candle.close;
}

export function isBearishEngulfing(previous: DetectorCandle, current: DetectorCandle): boolean {
  const p = anatomy(previous);
  const c = anatomy(current);
  if (p.range <= 0 || c.range <= 0) return false;
  if (!p.bullish || !c.bearish) return false;
  if (c.body <= p.body) return false;
  return c.candle.close <= p.candle.open && c.candle.open >= p.candle.close;
}

/**
 * Hammer (bullish) and shooting star (bearish) share one geometry: a small
 * body near one end of the range with a dominant wick on the opposite side.
 */
export function isHammer(candle: DetectorCandle): boolean {
  const a = anatomy(candle);
  if (a.range <= 0) return false;
  const epsilon = tolerance(a.range);
  if (a.body > a.range * 0.35) return false;
  if (a.body <= epsilon) return false; // doji is handled separately
  return a.lowerWick >= a.body * 2 && a.upperWick <= a.body;
}

export function isShootingStar(candle: DetectorCandle): boolean {
  const a = anatomy(candle);
  if (a.range <= 0) return false;
  const epsilon = tolerance(a.range);
  if (a.body > a.range * 0.35) return false;
  if (a.body <= epsilon) return false;
  return a.upperWick >= a.body * 2 && a.lowerWick <= a.body;
}

/**
 * Morning/evening star is a three-bar reversal: a small-bodied "gap" bar
 * sandwiched between a long bar and a strong confirming bar that closes well
 * past the first bar's midpoint.
 */
export function isMorningStar(first: DetectorCandle, middle: DetectorCandle, last: DetectorCandle): boolean {
  const a = anatomy(first);
  const b = anatomy(middle);
  const c = anatomy(last);
  if (a.range <= 0 || b.range <= 0 || c.range <= 0) return false;
  if (!a.bearish || !c.bullish) return false;
  if (a.body < b.body) return false;
  if (b.body > b.range * 0.35) return false; // the star itself must be indecisive
  const midpoint = (a.candle.open + a.candle.close) / 2;
  return c.candle.close > midpoint && c.body > b.body;
}

export function isEveningStar(first: DetectorCandle, middle: DetectorCandle, last: DetectorCandle): boolean {
  const a = anatomy(first);
  const b = anatomy(middle);
  const c = anatomy(last);
  if (a.range <= 0 || b.range <= 0 || c.range <= 0) return false;
  if (!a.bullish || !c.bearish) return false;
  if (a.body < b.body) return false;
  if (b.body > b.range * 0.35) return false;
  const midpoint = (a.candle.open + a.candle.close) / 2;
  return c.candle.close < midpoint && c.body > b.body;
}

/** True when every one of the three bars is a strong candle of the same colour. */
function threeBarRun(
  first: Anatomy,
  middle: Anatomy,
  last: Anatomy,
  bullish: boolean
): boolean {
  const bars = [first, middle, last];
  if (bars.some((bar) => bar.range <= 0)) return false;
  // All three must be the expected colour with a body worth trading.
  if (!bars.every((bar) => (bullish ? bar.bullish : bar.bearish))) return false;
  const minBody = Math.min(...bars.map((bar) => bar.range * 0.55));
  if (!bars.every((bar) => bar.body >= minBody)) return false;
  // Each candle must close within the prior body — genuine, stair-step progress.
  const rising = bullish
    ? last.candle.close > middle.candle.close && middle.candle.close > first.candle.close
    : last.candle.close < middle.candle.close && middle.candle.close < first.candle.close;
  if (!rising) return false;
  return bars.every((bar, index) => {
    const prior = index === 0 ? null : bars[index - 1];
    if (!prior) return true;
    return bullish
      ? bar.candle.open >= prior.candle.close - prior.range * 0.1
      : bar.candle.open <= prior.candle.close + prior.range * 0.1;
  });
}

export function isThreeWhiteSoldiers(first: DetectorCandle, middle: DetectorCandle, last: DetectorCandle): boolean {
  return threeBarRun(anatomy(first), anatomy(middle), anatomy(last), true);
}

export function isThreeBlackCrows(first: DetectorCandle, middle: DetectorCandle, last: DetectorCandle): boolean {
  return threeBarRun(anatomy(first), anatomy(middle), anatomy(last), false);
}

/**
 * High-conviction filtering.
 *
 * Raw geometry alone labels roughly a third of all candles, which reads as
 * noise rather than signal. A candlestick only means something at a location
 * where a reversal is actually plausible, so a detection is kept only when it
 * sits at one of those locations:
 *
 *   1. touching a real support / resistance level,
 *   2. RSI at an extreme (< oversold or > overbought), or
 *   3. exhausting a genuine directional trend (reversal patterns that end a
 *      real run of higher-highs / lower-lows).
 *
 * Patterns forming in the middle of a range with no level and no momentum
 * extreme are dropped.
 */

/** Lookback used for the structural swing checks. */
const SWING_LOOKBACK = 3;
/** Minimum run of consecutive higher highs (or lower lows) to count as a trend. */
const TREND_RUN_MIN = 3;
/** Default distance from a level, as a fraction of that level, that counts as "at" it. */
const DEFAULT_LEVEL_TOLERANCE = 0.01;

/** Average true range over the trailing window; used to scale level tolerance. */
function averageTrueRange(bars: DetectorCandle[], endIndex: number): number {
  const start = Math.max(1, endIndex - SWING_LOOKBACK - 1);
  let total = 0;
  let count = 0;
  for (let index = start; index <= endIndex; index += 1) {
    const previous = bars[index - 1];
    const current = bars[index];
    if (!previous || !current) continue;
    total += Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );
    count += 1;
  }
  return count ? total / count : 0;
}

/**
 * Structural levels from recent swing pivots, used when the caller supplies no
 * explicit levels.
 *
 * Pivots are clustered into price bands and a band only becomes a level when it
 * is touched more than once. Without that clustering, a 40-bar window yields a
 * pivot every few bars and almost any candle would land "at" one of them, which
 * defeats the whole filter.
 */
function deriveStructuralLevels(
  bars: DetectorCandle[],
): { support: number[]; resistance: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let index = 1; index < bars.length - 1; index += 1) {
    const bar = bars[index];
    const previous = bars[index - 1];
    const next = bars[index + 1];
    if (!bar || !previous || !next) continue;
    if (bar.high > previous.high && bar.high >= next.high) highs.push(bar.high);
    if (bar.low < previous.low && bar.low <= next.low) lows.push(bar.low);
  }
  return {
    support: clusterIntoLevels(lows),
    resistance: clusterIntoLevels(highs),
  };
}

/** A level needs at least this many touches to count as a level, not a wick. */
const MIN_LEVEL_TOUCHES = 2;

/**
 * Groups nearby prices into a single representative level, keeping only groups
 * with at least `MIN_LEVEL_TOUCHES` members.
 *
 * The cluster width is a small percentage of the price itself, never a fraction
 * of the whole data span: on a 1000-bar series the span is huge, so a
 * span-based width would merge every pivot into one meaningless mega-level that
 * half the chart "touches".
 */
function clusterIntoLevels(prices: number[]): number[] {
  if (!prices.length) return [];
  const sorted = [...prices].sort((a, b) => a - b);

  const levels: number[] = [];
  let group: number[] = [sorted[0]];
  for (let index = 1; index < sorted.length; index += 1) {
    // Width relative to the price, so gold and micro-cap tokens behave alike.
    const width = Math.max(sorted[index] * 0.002, sorted[index - 1] * 0.002);
    if (sorted[index] - sorted[index - 1] <= width) {
      group.push(sorted[index]);
    } else {
      if (group.length >= MIN_LEVEL_TOUCHES) levels.push(group.reduce((sum, value) => sum + value, 0) / group.length);
      group = [sorted[index]];
    }
  }
  if (group.length >= MIN_LEVEL_TOUCHES) levels.push(group.reduce((sum, value) => sum + value, 0) / group.length);
  return levels;
}

/**
 * True when the bar ends a directional run: at least `TREND_RUN_MIN` successive
 * higher highs (bullish) or lower lows (bearish). This is what separates a
 * Morning Star ending a real decline from a three-bar wobble inside a range.
 */
function hasTrendRun(bars: DetectorCandle[], endIndex: number, direction: CandlePatternDirection): boolean {
  if (direction === "neutral") return false;
  const bullish = direction === "bullish";
  const start = Math.max(0, endIndex - TREND_RUN_MIN);
  if (endIndex - start + 1 < TREND_RUN_MIN) return false;

  let run = 0;
  for (let index = endIndex; index > start; index -= 1) {
    const current = bars[index];
    const previous = bars[index - 1];
    if (!current || !previous) break;
    const confirmed = bullish ? current.high > previous.high : current.low < previous.low;
    if (!confirmed) break;
    run += 1;
  }
  return run >= TREND_RUN_MIN;
}

/**
 * Decides whether a detected pattern is worth labelling.
 * Returns the trigger description when it qualifies, or null when it does not.
 */
export function evaluateConviction(
  bars: DetectorCandle[],
  index: number,
  pattern: DetectedPattern,
  context: ConvictionContext = {},
  structuralLevels?: { support: number[]; resistance: number[] },
): string | null {
  const bar = bars[index];
  if (!bar) return null;

  const oversold = context.oversold ?? 30;
  const overbought = context.overbought ?? 70;

  // ---- Rule 1: at a support / resistance level ---------------------------
  const explicit = [
    ...(context.support ?? []).map((price) => ({ price, kind: "support" as const })),
    ...(context.resistance ?? []).map((price) => ({ price, kind: "resistance" as const })),
  ].filter((entry) => Number.isFinite(entry.price) && entry.price > 0);

  // Levels are derived once for the whole series and reused, so a level means
  // the same thing at every bar instead of drifting with the local window.
  const structural = structuralLevels ?? deriveStructuralLevels(bars);
  const levels = explicit.length
    ? explicit
    : [
        ...structural.support.map((price) => ({ price, kind: "support" as const })),
        ...structural.resistance.map((price) => ({ price, kind: "resistance" as const })),
      ];

  const atr = averageTrueRange(bars, index);
  for (const level of levels) {
    // A bullish reversal only means something at support, and a bearish one at
    // resistance. Without this pairing, "hammer at resistance" would be labelled
    // as a buy signal, which is exactly the misleading output to avoid.
    if (pattern.direction === "bullish" && level.kind !== "support") continue;
    if (pattern.direction === "bearish" && level.kind !== "resistance") continue;

    // "At" a level means the bar actually trades into it. A generous band turns
    // every candle into a "confluence", so the band stays tight: the smaller of
    // a small percentage of the level and a modest slice of ATR.
    const tolerance = context.levelTolerance ?? DEFAULT_LEVEL_TOLERANCE;
    const band = Math.min(level.price * tolerance, atr * 0.35);
    if (band <= 0) continue;
    // Support is reached by the low, resistance by the high, and the bar must
    // close back on the correct side of it (a rejection, not a break).
    const touched = level.kind === "support"
      ? bar.low <= level.price + band && bar.close > level.price
      : bar.high >= level.price - band && bar.close < level.price;
    if (touched) {
      return `${level.kind === "support" ? "Support" : "Resistance"} rejection at ${level.price.toPrecision(6)}`;
    }
  }

  // ---- Rule 2: RSI extreme ----------------------------------------------
  // Only a directional pattern is meaningful at an extreme; a doji at RSI 70 is
  // not a signal, so neutral patterns deliberately fail this test.
  const rsi = context.rsi?.[index];
  if (typeof rsi === "number" && Number.isFinite(rsi)) {
    if (rsi <= oversold && pattern.direction === "bullish") {
      return `RSI ${rsi.toFixed(1)} oversold (<= ${oversold})`;
    }
    if (rsi >= overbought && pattern.direction === "bearish") {
      return `RSI ${rsi.toFixed(1)} overbought (>= ${overbought})`;
    }
  }

  // ---- Rule 3: only genuine trend exhaustion survives --------------------
  // A reversal pattern is allowed when it ends a real directional run. Without
  // this, patterns in the middle of a sideways range would survive on geometry
  // alone, which is exactly the noise this filter exists to remove.
  if (hasTrendRun(bars, index, pattern.direction)) {
    return `Trend exhaustion after ${pattern.direction === "bullish" ? "higher-high" : "lower-low"} run`;
  }

  return null;
}

/**
 * Walks the series once and returns every pattern that passes the
 * high-conviction filter.
 *
 * Multi-bar patterns are checked before single-bar ones so that, say, a
 * hammer inside a three-candle sequence is not reported twice. Results are
 * ordered by time, which `createSeriesMarkers` requires.
 */
export function detectCandlestickPatterns(
  candles: DetectorCandle[],
  context: ConvictionContext = {},
): DetectedPattern[] {
  const bars = candles.filter(isValid);
  const candidates: DetectedPattern[] = [];

  for (let index = 0; index < bars.length; index += 1) {
    const current = bars[index];
    const previous = index > 0 ? bars[index - 1] : null;
    const secondPrevious = index > 1 ? bars[index - 2] : null;

    let matched = false;

    if (secondPrevious && previous) {
      if (isThreeWhiteSoldiers(secondPrevious, previous, current)) {
        candidates.push({ name: "Three White Soldiers", direction: "bullish", time: current.time, price: current.high, note: "Three consecutive strong bullish candles; momentum buyers in control." });
        matched = true;
      } else if (isThreeBlackCrows(secondPrevious, previous, current)) {
        candidates.push({ name: "Three Black Crows", direction: "bearish", time: current.time, price: current.low, note: "Three consecutive strong bearish candles; sellers in control." });
        matched = true;
      } else if (isMorningStar(secondPrevious, previous, current)) {
        candidates.push({ name: "Morning Star", direction: "bullish", time: current.time, price: current.high, note: "Downtrend exhaustion followed by a strong bullish reversal candle." });
        matched = true;
      } else if (isEveningStar(secondPrevious, previous, current)) {
        candidates.push({ name: "Evening Star", direction: "bearish", time: current.time, price: current.low, note: "Uptrend exhaustion followed by a strong bearish reversal candle." });
        matched = true;
      }
    }

    if (!matched && previous) {
      if (isBullishEngulfing(previous, current)) {
        candidates.push({ name: "Bullish Engulfing", direction: "bullish", time: current.time, price: current.high, note: "Bullish candle fully engulfs the prior bearish body." });
        matched = true;
      } else if (isBearishEngulfing(previous, current)) {
        candidates.push({ name: "Bearish Engulfing", direction: "bearish", time: current.time, price: current.low, note: "Bearish candle fully engulfs the prior bullish body." });
        matched = true;
      }
    }

    if (!matched) {
      if (isHammer(current)) {
        candidates.push({ name: "Hammer", direction: "bullish", time: current.time, price: current.low, note: "Long lower wick shows buyers rejected lower prices." });
      } else if (isShootingStar(current)) {
        candidates.push({ name: "Shooting Star", direction: "bearish", time: current.time, price: current.high, note: "Long upper wick shows sellers rejected higher prices." });
      } else if (isDoji(current)) {
        // A doji is indecision rather than a directional signal, so it is
        // neutral and draws in grey.
        candidates.push({ name: "Doji", direction: "neutral", time: current.time, price: current.close, note: "Open and close nearly equal; the market is undecided." });
      }
    }
  }

  // ---- High-conviction filter -------------------------------------------
  // Geometry is only half a signal; a pattern also has to sit somewhere a
  // reversal is plausible. Candidates that fail are dropped rather than drawn
  // faintly, so the chart shows a short, meaningful list instead of a wall of
  // labels.
  const qualified: DetectedPattern[] = [];
  // Derived once and shared by every candidate, so a level means the same thing
  // at every bar instead of drifting with the local window.
  const structuralLevels = deriveStructuralLevels(bars);
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (!bar) continue;
    for (const candidate of candidates) {
      if (candidate.time !== bar.time) continue;
      const trigger = evaluateConviction(bars, index, candidate, context, structuralLevels);
      if (trigger) qualified.push({ ...candidate, trigger });
    }
  }

  return suppressAdjacent(qualified).sort((first, second) => first.time - second.time);
}

/**
 * Drops a qualifying pattern when the immediately following candle qualifies
 * too. Two triggers on consecutive bars are one event drawn twice, and keeping
 * only the first keeps the strongest (the earliest confirmation).
 */
function suppressAdjacent(patterns: DetectedPattern[]): DetectedPattern[] {
  const kept: DetectedPattern[] = [];
  let lastTime: number | null = null;
  for (const pattern of patterns) {
    if (lastTime !== null && pattern.time === lastTime) continue;
    kept.push(pattern);
    lastTime = pattern.time;
  }
  return kept;
}

const MARKER_COLORS = {
  bullish: "#089981",
  bearish: "#f23645",
  neutral: "#8b949e",
} as const;

/**
 * Converts detections into the shape `createSeriesMarkers` expects: green
 * markers above bullish bars, red markers below bearish bars, and a neutral
 * grey for indecision bars.
 *
 * Only patterns that passed the conviction filter reach this function, so the
 * on-chart text stays sparse. The trigger reason is appended so a label
 * explains itself ("Hammer · Support confluence at 85000") instead of making
 * the reader cross-reference the chart.
 */
export function toSeriesMarkers(patterns: DetectedPattern[]): SeriesMarker<UTCTimestamp>[] {
  return patterns.map((pattern) => ({
    time: pattern.time as UTCTimestamp,
    // Bullish patterns sit above the bar, bearish below, so labels never cover
    // the candle body they describe.
    position: pattern.direction === "bullish" ? "aboveBar" : pattern.direction === "bearish" ? "belowBar" : "aboveBar",
    color: MARKER_COLORS[pattern.direction],
    shape: pattern.direction === "bearish" ? "arrowDown" : "arrowUp",
    text: pattern.trigger ? `${pattern.name} · ${pattern.trigger}` : pattern.name,
    id: `${pattern.name}:${pattern.time}`,
  })) as SeriesMarker<UTCTimestamp>[];
}

/** Convenience wrapper: detect, then convert to markers in one call. */
export function detectAndBuildMarkers(
  candles: DetectorCandle[],
  context: ConvictionContext = {},
): {
  patterns: DetectedPattern[];
  markers: SeriesMarker<UTCTimestamp>[];
} {
  const patterns = detectCandlestickPatterns(candles, context);
  return { patterns, markers: toSeriesMarkers(patterns) };
}
