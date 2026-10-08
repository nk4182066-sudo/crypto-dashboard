// Pattern filtering for high-confidence analysis only.
// Educational purpose.

/** Anything with a name and a 0–100 confidence score (matches CandlestickPatternHit). */
export interface ConfidencePattern {
  pattern: string;
  confidence: number;
}

/** Minimum confidence to be considered high-confidence. */
const HIGH_CONFIDENCE = 75;

/** getStrongestPattern needs strictly more than this. */
const STRONGEST_CONFIDENCE = 80;

const BULLISH_NAMES = ["hammer", "bullish engulfing", "morning star", "three white soldiers", "piercing line"];
const BEARISH_NAMES = ["shooting star", "bearish engulfing", "evening star", "three black crows", "dark cloud cover"];
const REVERSAL_NAMES = ["doji", "spinning top", "high wave", "key reversal"];

/** Drop anything below 75% and sort strongest first. */
export function filterHighConfidencePatterns<T extends ConfidencePattern>(
  patterns: readonly T[],
): T[] {
  return patterns
    .filter((hit) => hit.confidence >= HIGH_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence);
}

/** Single strongest pattern, only when it beats 80%. */
export function getStrongestPattern<T extends ConfidencePattern>(
  patterns: readonly T[],
): T | null {
  const sorted = [...patterns].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0];
  return best && best.confidence > STRONGEST_CONFIDENCE ? best : null;
}

const matches = (hit: ConfidencePattern, names: readonly string[]): boolean =>
  names.some((name) => hit.pattern.toLowerCase().includes(name));

/**
 * Group patterns into bullish / bearish / reversal buckets and return the
 * full display payload: high-confidence list, categories, and strongest pick.
 */
export function categorizePatterns<T extends ConfidencePattern>(patterns: readonly T[]): {
  highConfidence: T[];
  bullish: T[];
  bearish: T[];
  reversal: T[];
  strongest: T | null;
} {
  const highConfidence = filterHighConfidencePatterns(patterns);
  return {
    highConfidence,
    bullish: highConfidence.filter((hit) => matches(hit, BULLISH_NAMES)),
    bearish: highConfidence.filter((hit) => matches(hit, BEARISH_NAMES)),
    reversal: highConfidence.filter((hit) => matches(hit, REVERSAL_NAMES)),
    strongest: getStrongestPattern(highConfidence),
  };
}
