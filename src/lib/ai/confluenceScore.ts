// Confluence scoring for educational analysis.
// Not financial advice. Not a trading signal.

export type PricePosition = "support" | "mid" | "resistance";

export interface ConfluenceScoreInput {
  /** Number of bullish timeframes out of 4 (0-4) */
  bullishTimeframes: number;
  /** Number of confirmed bullish patterns */
  patternCount: number;
  /** Price position relative to key levels */
  pricePosition: PricePosition;
  /** Current volume */
  currentVolume: number;
  /** Average volume over recent period */
  averageVolume: number;
  /** Whether RSI trend is bullish */
  rsiBullish: boolean;
  /** Whether MACD trend is bullish */
  macdBullish: boolean;
}

export interface ConfluenceScoreBreakdown {
  timeframes: number;
  patterns: number;
  keyLevel: number;
  volume: number;
  indicators: number;
}

export interface ConfluenceScoreResult {
  totalScore: number;
  breakdown: ConfluenceScoreBreakdown;
  verdict: "STRONG" | "MODERATE" | "WEAK";
  verdictText: string;
  confidence: number;
}

function scoreTimeframeAlignment(bullishTimeframes: number): number {
  switch (bullishTimeframes) {
    case 4:
      return 25;
    case 3:
      return 18;
    case 2:
      return 10;
    default:
      return 0;
  }
}

function scorePatternConfirmation(patternCount: number): number {
  if (patternCount >= 3) return 25;
  if (patternCount === 2) return 15;
  if (patternCount === 1) return 8;
  return 0;
}

function scoreKeyLevel(pricePosition: PricePosition): number {
  switch (pricePosition) {
    case "support":
      return 20;
    case "mid":
      return 10;
    default:
      return 0;
  }
}

function scoreVolume(currentVolume: number, averageVolume: number): number {
  if (averageVolume <= 0) return 0;
  if (currentVolume > averageVolume * 1.5) return 15;
  if (currentVolume >= averageVolume) return 8;
  return 0;
}

function scoreIndicators(rsiBullish: boolean, macdBullish: boolean): number {
  const bullish = Number(rsiBullish) + Number(macdBullish);
  if (bullish === 2) return 15;
  if (bullish === 1) return 8;
  return 0;
}

export function calculateConfluenceScore(
  input: ConfluenceScoreInput
): ConfluenceScoreResult {
  const timeframes = scoreTimeframeAlignment(input.bullishTimeframes);
  const patterns = scorePatternConfirmation(input.patternCount);
  const keyLevel = scoreKeyLevel(input.pricePosition);
  const volume = scoreVolume(input.currentVolume, input.averageVolume);
  const indicators = scoreIndicators(input.rsiBullish, input.macdBullish);

  const totalScore = timeframes + patterns + keyLevel + volume + indicators;

  let verdict: "STRONG" | "MODERATE" | "WEAK";
  let verdictText: string;

  if (totalScore >= 75) {
    verdict = "STRONG";
    verdictText = "High confluence setup detected";
  } else if (totalScore >= 50) {
    verdict = "MODERATE";
    verdictText = "Medium confluence, wait for confirmation";
  } else {
    verdict = "WEAK";
    verdictText = "Low confluence, avoid this setup";
  }

  const confidence = totalScore / 100;

  return {
    totalScore,
    breakdown: { timeframes, patterns, keyLevel, volume, indicators },
    verdict,
    verdictText,
    confidence,
  };
}
