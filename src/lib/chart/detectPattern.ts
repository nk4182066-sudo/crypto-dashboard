/**
 * detectPattern.ts — REAL OHLC-based pattern detection. No hardcoded or
 * invented pattern strings, ever.
 *
 * Two independent detectors feed the scoring engine:
 *   - detectCandlestickPattern(): 2/3-bar geometry from pure OHLC
 *     (Morning Star, Evening Star, Engulfing, Hammer, Shooting Star, Doji).
 *     Directions are FIXED per pattern: Morning Star is always bullish,
 *     Evening Star is always bearish — never derived from setup bias.
 *   - detectSwingChartPattern(): classical shapes from ZigZag swing pivots
 *     computed with a 5-bar left / 5-bar right window (Triple/Double Top,
 *     Triple/Double Bottom, Head & Shoulders + inverse), with threshold
 *     matching on the swing highs/lows and a neckline check for H&S.
 *
 * detectPattern() is the unified entry: candlestick first, then swing chart
 * patterns; when nothing qualifies it returns pattern=null with the note
 * "No clear pattern detected." — callers must render that verbatim instead
 * of inventing a pattern.
 *
 * Educational analysis only — not financial advice.
 */
import type { Candle } from "@/src/analysis/types";
import { zigZag } from "@/src/analysis/structure";
import {
  isBearishEngulfing,
  isBullishEngulfing,
  isDoji,
  isEveningStar,
  isHammer,
  isMorningStar,
  isShootingStar,
  type DetectorCandle,
} from "@/src/lib/chart/candlestickDetector";

export type PatternDirection = "bullish" | "bearish" | "neutral";

export interface PatternResult {
  /** Pattern name, or null when nothing qualifies. */
  pattern: string | null;
  /** Direction derived from the pattern geometry — never from setup bias. */
  type: PatternDirection;
  /** Confidence 0-100. */
  confidence: number;
  /** Short rationale. */
  note: string;
  /** Anchor points for chart markers (Double Top/Bottom pivots + neckline). */
  points?: { p1: { time: number; price: number }; p2: { time: number; price: number }; p3?: { time: number; price: number }; neckline: number };
}

/** One ZigZag swing pivot. */
interface Swing {
  time: number;
  price: number;
  kind: "high" | "low";
}

/** Swing-detection window: 5 bars left, 5 bars right (per spec). */
const SWING_WINDOW = 5;
/** Only structures whose final pivot sits in the last N candles count. */
const RECENT_PIVOTS = 70;
/** Equal-threshold matching for double tops/bottoms (percent of price). */
const DOUBLE_EQ_PCT = 1.5;
/** Equal-threshold matching for triple tops/bottoms (percent of price). */
const TRIPLE_EQ_PCT = 2;
/** Equal-threshold matching for H&S shoulders (percent of price). */
const SHOULDER_EQ_PCT = 2.5;
/** Equal-threshold matching for the H&S neckline (percent of price). */
const NECKLINE_EQ_PCT = 4;
/** Valleys/peaks must stand at least 0.3% of price away from the level (a
 *  real pullback, not two pivots that merely kissed by rounding). */
const MIN_DEPTH_PCT = 0.003;
/** The head must stand at least 0.2% of price above/below the shoulders. */
const HEAD_PROMINENCE_PCT = 0.002;
/** Minimum confidence before a pattern is reported to callers. */
const MIN_CONFIDENCE = 70;

/** Two prices count as "equal" within pct% of the larger one. */
function eqP(a: number, b: number, pct: number): boolean {
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1e-12) * (pct / 100);
}

/**
 * A formation is only real when `low` sits at least MIN_DEPTH_PCT below
 * `high` — rejects two pivots that "match" only because they never left the
 * same rounding-noise band.
 */
function validDepth(high: number, low: number): boolean {
  return high > 0 && high - low >= high * MIN_DEPTH_PCT;
}

function toDetectorCandles(candles: Candle[]): DetectorCandle[] {
  return candles.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

/**
 * Detect the most recent 2/3-bar candlestick pattern from pure OHLC geometry.
 * Returns null when the last candles match nothing — never a guess.
 *
 * Every reversal shape also needs the prior move (fell/rose) that it is
 * supposedly reversing; the geometry detectors from candlestickDetector.ts
 * supply the bar shape, this function supplies the context.
 *
 * Priority follows conviction: three-bar reversals (90) → engulfing (88) →
 * single-bar rejections (76/74) → doji (60, neutral).
 */
export function detectCandlestickPattern(candles: Candle[]): PatternResult | null {
  if (!Array.isArray(candles) || candles.length < 3) return null;
  const bars = toDetectorCandles(candles);
  const n = bars.length;
  const c3 = bars[n - 3];
  const c2 = bars[n - 2];
  const c1 = bars[n - 1];
  // Context: net close move over the bars BEFORE the completion bar. A hammer
  // in the middle of a rally or an engulfing against the prior move is not a
  // reversal — the catalogue detectors apply the same fell/rose guard.
  const fell = n >= 4 && bars[n - 2].close < bars[n - 4].close;
  const rose = n >= 4 && bars[n - 2].close > bars[n - 4].close;

  // Morning Star — ALWAYS bullish: long red bar, indecisive star, strong
  // green bar closing above the midpoint of the first bar.
  if (fell && isMorningStar(c3, c2, c1)) {
    return {
      pattern: "Morning Star",
      type: "bullish",
      confidence: 90,
      note: "3-bar bullish reversal: long red, indecisive middle, strong green above the first bar's midpoint.",
    };
  }

  // Evening Star — ALWAYS bearish: long green bar, indecisive star, strong
  // red bar closing below the midpoint of the first bar.
  if (rose && isEveningStar(c3, c2, c1)) {
    return {
      pattern: "Evening Star",
      type: "bearish",
      confidence: 90,
      note: "3-bar bearish reversal: long green, indecisive middle, strong red below the first bar's midpoint.",
    };
  }

  // Bullish Engulfing — ALWAYS bullish: green body fully covers the prior red body.
  if (fell && isBullishEngulfing(c2, c1)) {
    return {
      pattern: "Bullish Engulfing",
      type: "bullish",
      confidence: 88,
      note: "2-bar bullish engulfing: green body fully covers the prior red body.",
    };
  }

  // Bearish Engulfing — ALWAYS bearish: red body fully covers the prior green body.
  if (rose && isBearishEngulfing(c2, c1)) {
    return {
      pattern: "Bearish Engulfing",
      type: "bearish",
      confidence: 88,
      note: "2-bar bearish engulfing: red body fully covers the prior green body.",
    };
  }

  // Hammer — ALWAYS bullish: small body at the top of the range, dominant lower wick.
  if (fell && isHammer(c1)) {
    return {
      pattern: "Hammer",
      type: "bullish",
      confidence: 76,
      note: "Bullish hammer: small body, long lower wick — sellers pushed lower and buyers reclaimed the bar.",
    };
  }

  // Shooting Star — ALWAYS bearish: small body at the bottom, dominant upper wick.
  if (rose && isShootingStar(c1)) {
    return {
      pattern: "Shooting Star",
      type: "bearish",
      confidence: 74,
      note: "Bearish shooting star: small body, long upper wick — buyers pushed higher and sellers reclaimed the bar.",
    };
  }

  // Doji — neutral indecision (reported but never directional).
  if (isDoji(c1)) {
    return {
      pattern: "Doji",
      type: "neutral",
      confidence: 60,
      note: "Doji: open ≈ close — buyers and sellers are balanced, market undecided.",
    };
  }

  return null;
}

/** ── Swing (chart) pattern detection — ZigZag pivots, 5-left/5-right ─────── */

/** All pivots of the window, newest last. */
function swingsOf(candles: Candle[]): Swing[] {
  const pivots = zigZag(candles, SWING_WINDOW);
  return pivots.map((p) => ({ time: p.time, price: p.price, kind: p.kind }));
}

/**
 * Triple Top: the last three swing highs sit within TRIPLE_EQ_PCT of each
 * other, the intervening swing lows pulled back a real depth below the level,
 * and price has since closed back below the highs.
 */
function detectTripleTop(swings: Swing[], close: number): PatternResult | null {
  const highs = swings.filter((s) => s.kind === "high");
  if (highs.length < 3) return null;
  const last3 = highs.slice(-3);
  const [a, b, c] = last3;
  if (!eqP(a.price, b.price, TRIPLE_EQ_PCT) || !eqP(b.price, c.price, TRIPLE_EQ_PCT)) return null;
  const level = (a.price + b.price + c.price) / 3;
  const idxA = swings.indexOf(a);
  const idxC = swings.indexOf(c);
  const between = swings.slice(idxA + 1, idxC).filter((s) => s.kind === "low");
  if (between.length === 0) return null;
  const neckline = Math.min(...between.map((s) => s.price));
  if (!validDepth(level, neckline)) return null;
  if (close >= level) return null;
  return {
    pattern: "Triple Top",
    type: "bearish",
    confidence: 86,
    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },
    note: `Three equal swing highs within ${TRIPLE_EQ_PCT}% — resistance rejected price three times, close back below the level.`,
  };
}

/** Triple Bottom — mirror of Triple Top across the horizontal axis. */
function detectTripleBottom(swings: Swing[], close: number): PatternResult | null {
  const lows = swings.filter((s) => s.kind === "low");
  if (lows.length < 3) return null;
  const last3 = lows.slice(-3);
  const [a, b, c] = last3;
  if (!eqP(a.price, b.price, TRIPLE_EQ_PCT) || !eqP(b.price, c.price, TRIPLE_EQ_PCT)) return null;
  const level = (a.price + b.price + c.price) / 3;
  const idxA = swings.indexOf(a);
  const idxC = swings.indexOf(c);
  const between = swings.slice(idxA + 1, idxC).filter((s) => s.kind === "high");
  if (between.length === 0) return null;
  const neckline = Math.max(...between.map((s) => s.price));
  if (!validDepth(neckline, level)) return null;
  if (close <= level) return null;
  return {
    pattern: "Triple Bottom",
    type: "bullish",
    confidence: 86,
    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },
    note: `Three equal swing lows within ${TRIPLE_EQ_PCT}% — support held three times, close back above the level.`,
  };
}

/** Double Top: two equal swing highs (M shape) with a real pullback between. */
function detectDoubleTop(swings: Swing[], close: number): PatternResult | null {
  const highs = swings.filter((s) => s.kind === "high");
  if (highs.length < 2) return null;
  const last2 = highs.slice(-2);
  const [a, b] = last2;
  if (!eqP(a.price, b.price, DOUBLE_EQ_PCT)) return null;
  const level = (a.price + b.price) / 2;
  const idxA = swings.indexOf(a);
  const idxB = swings.indexOf(b);
  const between = swings.slice(idxA + 1, idxB).filter((s) => s.kind === "low");
  if (between.length === 0) return null;
  const neckline = Math.min(...between.map((s) => s.price));
  if (!validDepth(level, neckline)) return null;
  if (close >= level) return null;
  return {
    pattern: "Double Top",
    type: "bearish",
    confidence: 80,
    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, neckline },
    note: `Two equal swing highs within ${DOUBLE_EQ_PCT}% — M shape, price closed back below the resistance line.`,
  };
}

/** Double Bottom — mirror (W shape). */
function detectDoubleBottom(swings: Swing[], close: number): PatternResult | null {
  const lows = swings.filter((s) => s.kind === "low");
  if (lows.length < 2) return null;
  const last2 = lows.slice(-2);
  const [a, b] = last2;
  if (!eqP(a.price, b.price, DOUBLE_EQ_PCT)) return null;
  const level = (a.price + b.price) / 2;
  const idxA = swings.indexOf(a);
  const idxB = swings.indexOf(b);
  const between = swings.slice(idxA + 1, idxB).filter((s) => s.kind === "high");
  if (between.length === 0) return null;
  const neckline = Math.max(...between.map((s) => s.price));
  if (!validDepth(neckline, level)) return null;
  if (close <= level) return null;
  return {
    pattern: "Double Bottom",
    type: "bullish",
    confidence: 80,
    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, neckline },
    note: `Two equal swing lows within ${DOUBLE_EQ_PCT}% — W shape, price closed back above the support line.`,
  };
}

/**
 * Head & Shoulders: three swing highs where the head is higher than both
 * shoulders by at least HEAD_PROMINENCE_PCT, the shoulders match within
 * SHOULDER_EQ_PCT, the two intervening swing lows (the neckline) match within
 * NECKLINE_EQ_PCT, and the latest close has broken below that neckline.
 */
function detectHeadAndShoulders(swings: Swing[], close: number): PatternResult | null {
  const highs = swings.filter((s) => s.kind === "high");
  if (highs.length < 3) return null;
  const last3 = highs.slice(-3);
  const [ls, head, rs] = last3;
  // The head must exceed BOTH shoulders by at least HEAD_PROMINENCE_PCT.
  if (
    head.price < ls.price * (1 + HEAD_PROMINENCE_PCT) ||
    head.price < rs.price * (1 + HEAD_PROMINENCE_PCT)
  ) return null;
  if (!eqP(ls.price, rs.price, SHOULDER_EQ_PCT)) return null;
  const idxL = swings.indexOf(ls);
  const idxR = swings.indexOf(rs);
  const lows = swings.slice(idxL + 1, idxR).filter((s) => s.kind === "low");
  if (lows.length < 2) return null;
  const n1 = lows[0];
  const n2 = lows[lows.length - 1];
  if (!n1 || !n2 || !eqP(n1.price, n2.price, NECKLINE_EQ_PCT)) return null;
  const neckline = (n1.price + n2.price) / 2;
  if (close >= neckline) return null;
  return {
    pattern: "Head & Shoulders",
    type: "bearish",
    confidence: 84,
    note: `Head above matched shoulders (${SHOULDER_EQ_PCT}%), neckline matched within ${NECKLINE_EQ_PCT}% and price closed below it — bearish reversal.`,
  };
}

/** Inverse Head & Shoulders — mirror: head lower than both shoulders, close above neckline. */
function detectInverseHeadAndShoulders(swings: Swing[], close: number): PatternResult | null {
  const lows = swings.filter((s) => s.kind === "low");
  if (lows.length < 3) return null;
  const last3 = lows.slice(-3);
  const [ls, head, rs] = last3;
  // The head must sit BELOW both shoulders by at least HEAD_PROMINENCE_PCT.
  if (
    head.price > ls.price * (1 - HEAD_PROMINENCE_PCT) ||
    head.price > rs.price * (1 - HEAD_PROMINENCE_PCT)
  ) return null;
  if (!eqP(ls.price, rs.price, SHOULDER_EQ_PCT)) return null;
  const idxL = swings.indexOf(ls);
  const idxR = swings.indexOf(rs);
  const highs = swings.slice(idxL + 1, idxR).filter((s) => s.kind === "high");
  if (highs.length < 2) return null;
  const n1 = highs[0];
  const n2 = highs[highs.length - 1];
  if (!n1 || !n2 || !eqP(n1.price, n2.price, NECKLINE_EQ_PCT)) return null;
  const neckline = (n1.price + n2.price) / 2;
  if (close <= neckline) return null;
  return {
    pattern: "Inverse Head & Shoulders",
    type: "bullish",
    confidence: 84,
    note: `Head below matched shoulders (${SHOULDER_EQ_PCT}%), neckline matched within ${NECKLINE_EQ_PCT}% and price closed above it — bullish reversal.`,
  };
}

/**
 * Detect a classical swing pattern from ZigZag pivots (5-left/5-right) over
 * the RECENT_PIVOTS tail only, so an ancient structure is never reported as
 * the current pattern. Returns null when nothing qualifies.
 */
export function detectSwingChartPattern(candles: Candle[]): PatternResult | null {
  if (!Array.isArray(candles) || candles.length < SWING_WINDOW * 4) return null;
  const recent = candles.slice(-160);
  const close = recent[recent.length - 1].close;
  const all = swingsOf(recent);
  // Keep only structures whose final pivot sits in the recent tail.
  const cutoff = recent[Math.max(0, recent.length - RECENT_PIVOTS)].time;
  const swings = all.filter((s) => s.time >= cutoff);
  if (swings.length < 3) return null;

  return (
    detectTripleTop(swings, close) ??
    detectTripleBottom(swings, close) ??
    detectHeadAndShoulders(swings, close) ??
    detectInverseHeadAndShoulders(swings, close) ??
    detectDoubleTop(swings, close) ??
    detectDoubleBottom(swings, close)
  );
}

/**
 * Unified detection: the most recent candlestick pattern first (it describes
 * the current bar), otherwise the most recent swing chart pattern, otherwise
 * pattern=null with "No clear pattern detected." — the caller must render
 * that message instead of inventing a pattern.
 *
 * Sub-70 candlestick hits (Doji, neutral) are kept only when no directional
 * pattern exists, because the scoring engine treats them as context, never
 * as confirmation.
 */
export function detectPattern(candles: Candle[]): PatternResult {
  if (!Array.isArray(candles) || candles.length < 10) {
    return {
      pattern: null,
      type: "neutral",
      confidence: 0,
      note: "No clear pattern detected — not enough candles.",
    };
  }

  const candlestick = detectCandlestickPattern(candles);
  if (candlestick && candlestick.confidence >= MIN_CONFIDENCE) {
    return candlestick;
  }

  const swing = detectSwingChartPattern(candles);
  if (swing && swing.confidence >= MIN_CONFIDENCE) {
    return swing;
  }

  if (candlestick) {
    return candlestick;
  }

  return {
    pattern: null,
    type: "neutral",
    confidence: 0,
    note: "No clear pattern detected.",
  };
}



