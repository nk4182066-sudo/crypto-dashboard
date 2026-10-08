import type { SignalLine, SignalLineKind } from "./levelLines";
import type { ChartShape, TrendlineKind } from "./patternDetector";

/**
 * Plain-language meaning for every line and shape the chart draws. Written for
 * a beginner: what the line *is*, not what it technically represents.
 */
export const LEVEL_EXPLANATIONS: Record<SignalLineKind, string> = {
  support: "Support — a price area where buyers stepped in before. Watch for price to bounce here.",
  resistance: "Resistance — a price area where sellers pushed back before. Price may struggle to pass it.",
  entry: "Entry — the price level the assistant considers a reasonable place to open a position.",
  stopLoss: "Stop loss (SL) — your exit level if the trade goes wrong. Place it here to cap the loss.",
  takeProfit: "Take profit (TP) — a target where you could take profit. Consider closing part of the position here.",
  reversal: "Reversal (REVERSE) — a level that, once broken, suggests the current move may be changing direction.",
};

export const TRENDLINE_EXPLANATIONS: Record<TrendlineKind, string> = {
  upper: "Upper trendline (yellow) — the ceiling traced through recent swing highs.",
  lower: "Lower trendline (pink) — the floor traced through recent swing lows.",
  middle: "Middle pivot (blue) — the average of the channel, used as a reference for 'fair' price.",
};

const SHAPE_EXPLANATIONS: Array<[RegExp, string]> = [
  [/ascending/i, "Ascending triangle — flat ceiling with rising support. Often precedes an upward breakout."],
  [/descending/i, "Descending triangle — flat floor with falling resistance. Often precedes a downward break."],
  [/symmetrical|symmetrical triangle/i, "Symmetrical triangle — both sides squeeze together. Wait for the break to learn the direction."],
  [/bull.?flag/i, "Bull flag — a sharp rise, then a short downward pause. Often continues upward after the pause."],
  [/bear.?flag/i, "Bear flag — a sharp drop, then a short upward pause. Often continues downward after the pause."],
  [/rising.?wedge/i, "Rising wedge — both sides rise, but resistance climbs faster. Momentum is fading."],
  [/falling.?wedge/i, "Falling wedge — both sides fall, but support holds better. Selling pressure is easing."],
  [/head and shoulders/i, "Head & shoulders — three peaks with a higher middle. A break of the neckline is bearish."],
  [/inverse head/i, "Inverse head & shoulders — three troughs with a lower middle. A break of the neckline is bullish."],
  [/double.?top/i, "Double top — price hit the same ceiling twice and failed. Often a bearish reversal."],
  [/double.?bottom/i, "Double bottom — price hit the same floor twice and held. Often a bullish reversal."],
  [/cup/i, "Cup & handle — a rounded dip that recovered, with a shallow pullback. Usually a bullish base."],
  [/channel/i, "Channel — price is moving between two roughly parallel boundaries."],
];

/** Best-effort plain-language description for a detected shape. */
export function explainShape(shape: Pick<ChartShape, "label" | "note">): string {
  const match = SHAPE_EXPLANATIONS.find(([pattern]) => pattern.test(shape.label));
  return match ? match[1] : shape.note;
}