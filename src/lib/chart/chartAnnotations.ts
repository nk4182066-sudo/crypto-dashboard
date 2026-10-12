// Chart annotations for educational display.
// Not financial advice.

import type { DetectorCandle } from "@/src/lib/chart/candlestickDetector";
import type { CandlestickPatternHit } from "@/src/lib/chart/candlestickPatterns";
import type { SignalLine } from "@/src/lib/chart/levelLines";

export type AnnotationColor = "green" | "red" | "yellow" | "white";
export type AnnotationType = "pattern" | "level" | "candle";
export type AnnotationPosition = "above" | "below";

export interface ChartAnnotation {
  time: number;
  price: number;
  label: string;
  type: AnnotationType;
  color: AnnotationColor;
  position: AnnotationPosition;
}

/** Only patterns strictly above this confidence earn a chart label. */
const MIN_CONFIDENCE = 70;

/** Most recent hits only — a wall of labels would bury the candles. */
const MAX_PATTERN_LABELS = 10;

const fmtPrice = (price: number): string =>
  price.toLocaleString("en-US", { maximumFractionDigits: price >= 100 ? 2 : 4 });

/**
 * One pattern label. Bullish sits below the candle in green, bearish above in
 * red, and neutral single-candle readings (Doji etc.) are yellow "candle" notes.
 * Returns null when the confidence bar is not cleared.
 */
function patternAnnotation(
  hit: CandlestickPatternHit,
  byTime: Map<number, DetectorCandle>,
): ChartAnnotation | null {
  if (hit.confidence <= MIN_CONFIDENCE) return null;
  const candle = byTime.get(hit.time);
  const bullish = hit.type === "bullish";
  const bearish = hit.type === "bearish";
  return {
    time: hit.time,
    price: candle ? (bullish ? candle.low : candle.high) : hit.price,
    label: hit.pattern,
    type: bullish || bearish ? "pattern" : "candle",
    color: bullish ? "green" : bearish ? "red" : "yellow",
    position: bullish ? "below" : "above",
  };
}

/** Horizontal support/resistance label pinned to the newest candle's time. */
function levelAnnotation(line: SignalLine, lastTime: number): ChartAnnotation | null {
  const isSupport = line.kind === "support";
  const isResistance = line.kind === "resistance";
  if ((!isSupport && !isResistance) || !Number.isFinite(line.price)) return null;
  return {
    time: lastTime,
    price: line.price,
    label: `${isSupport ? "Support" : "Resistance"} $${fmtPrice(line.price)}`,
    type: "level",
    color: isSupport ? "green" : "red",
    position: isSupport ? "below" : "above",
  };
}

/**
 * Builds the annotation list for chart display: high-confidence candlestick
 * patterns plus support/resistance levels, ordered by time.
 */
export function generateAnnotations(
  candles: readonly DetectorCandle[],
  patterns: readonly CandlestickPatternHit[],
  levels: readonly SignalLine[],
): ChartAnnotation[] {
  const lastTime = candles.at(-1)?.time;
  const byTime = new Map(candles.map((candle) => [candle.time, candle]));

  const patternNotes = patterns
    .slice(-MAX_PATTERN_LABELS)
    .map((hit) => patternAnnotation(hit, byTime))
    .filter((note): note is ChartAnnotation => note !== null);

  const levelNotes =
    lastTime === undefined
      ? []
      : levels
          .map((line) => levelAnnotation(line, lastTime))
          .filter((note): note is ChartAnnotation => note !== null);

  return [...patternNotes, ...levelNotes].sort((a, b) => a.time - b.time);
}
