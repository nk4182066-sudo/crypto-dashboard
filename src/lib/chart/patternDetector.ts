import type { Candle, SwingPoint } from "@/src/analysis/types";
import { zigZag } from "@/src/analysis/structure";

/** A point in chart space — the coordinate system every shape is authored in. */
export interface Anchor {
  time: number;
  price: number;
}

export type TrendlineKind = "upper" | "lower" | "middle";

export interface Trendline {
  id: string;
  kind: TrendlineKind;
  label: string;
  /** Colour per the Phase 4 spec: upper yellow, lower pink, middle blue. */
  color: string;
  points: [Anchor, Anchor];
  note: string;
}

export type ShapeKind =
  | "ascendingTriangle"
  | "descendingTriangle"
  | "symmetricalTriangle"
  | "bullFlag"
  | "bearFlag"
  | "risingWedge"
  | "fallingWedge"
  | "headAndShoulders"
  | "inverseHeadAndShoulders"
  | "doubleTop"
  | "doubleBottom"
  | "cupAndHandle";

export interface ShapeLine {
  id: string;
  label: string;
  points: [Anchor, Anchor];
  style: "solid" | "dashed";
  color: string;
}

export interface ChartShape {
  id: string;
  kind: ShapeKind;
  label: string;
  direction: "bullish" | "bearish" | "neutral";
  color: string;
  confidence: number;
  note: string;
  /** Closed outlines to shade, authored in chart space. */
  fills: Anchor[][];
  /** Boundary lines such as trendlines and necklines. */
  lines: ShapeLine[];
  /** First and last bar the pattern occupies. */
  span: { from: number; to: number };
}

const TRENDLINE_COLORS: Record<TrendlineKind, string> = {
  upper: "#f0b90b", // yellow
  lower: "#ff7eb6", // pink
  middle: "#4c8dff", // blue
};

const TRENDLINE_LABELS: Record<TrendlineKind, string> = {
  upper: "Upper trendline",
  lower: "Lower trendline",
  middle: "Middle / pivot",
};

function tolerance(price: number, percent = 1) {
  return Math.abs(price) * (percent / 100);
}

/** Least-squares fit of price against time, used to place the trendlines. */
function fitLine(points: Anchor[]) {
  const n = points.length;
  if (n < 2) return null;
  const sumT = points.reduce((total, point) => total + point.time, 0);
  const sumP = points.reduce((total, point) => total + point.price, 0);
  const sumTT = points.reduce((total, point) => total + point.time * point.time, 0);
  const sumTP = points.reduce((total, point) => total + point.time * point.price, 0);
  const denominator = n * sumTT - sumT * sumT;
  if (Math.abs(denominator) < 1e-9) return null;
  const slope = (n * sumTP - sumT * sumP) / denominator;
  const intercept = (sumP - slope * sumT) / n;
  return { slope, intercept, at: (time: number) => slope * time + intercept };
}

function anchor(point: SwingPoint): Anchor {
  return { time: point.time, price: point.price };
}

/**
 * Builds the upper, lower and middle (pivot) trendlines from the recent swing
 * extremes. The middle line is the mean of the upper and lower projections,
 * which is the usual "pivot" reference in a developing channel.
 */
export function calculateTrendlines(candles: Candle[], lookback = 3): Trendline[] {
  if (candles.length < lookback * 2 + 1) return [];
  const { highs, lows } = zigZag(candles, lookback).reduce(
    (acc, point) => {
      (point.kind === "high" ? acc.highs : acc.lows).push(point);
      return acc;
    },
    { highs: [] as SwingPoint[], lows: [] as SwingPoint[] }
  );

  // Only the most recent extremes matter for a live channel.
  const upperPoints = highs.slice(-3).map(anchor);
  const lowerPoints = lows.slice(-3).map(anchor);
  if (upperPoints.length < 2 || lowerPoints.length < 2) return [];

  const first = candles[0].time;
  const last = candles.at(-1)!.time;
  const upperFit = fitLine(upperPoints);
  const lowerFit = fitLine(lowerPoints);
  if (!upperFit || !lowerFit) return [];

  const spanUpper = Math.max(upperFit.at(last), Math.max(...upperPoints.map((point) => point.price)));
  const spanLower = Math.min(lowerFit.at(last), Math.min(...lowerPoints.map((point) => point.price)));
  const spanMiddle = (spanUpper + spanLower) / 2;

  const make = (kind: TrendlineKind, price: number): Trendline => ({
    id: `trendline-${kind}`,
    kind,
    label: TRENDLINE_LABELS[kind],
    color: TRENDLINE_COLORS[kind],
    points: [{ time: first, price }, { time: last, price }],
    note:
      kind === "upper"
        ? "Resistance ceiling traced through the most recent swing highs."
        : kind === "lower"
          ? "Support floor traced through the most recent swing lows."
          : "Mid-channel pivot — the mean of the upper and lower boundaries.",
  });

  return [make("upper", spanUpper), make("lower", spanLower), make("middle", spanMiddle)];
}

const SHAPE_COLORS = {
  bullish: "#089981",
  bearish: "#f23645",
  neutral: "#f0b90b",
} as const;

function shape(
  kind: ShapeKind,
  label: string,
  direction: "bullish" | "bearish" | "neutral",
  confidence: number,
  note: string,
  fills: Anchor[][],
  lines: ShapeLine[],
  span: { from: number; to: number }
): ChartShape {
  return {
    id: `${kind}:${span.from}:${span.to}`,
    kind,
    label,
    direction,
    color: SHAPE_COLORS[direction],
    confidence,
    note,
    fills,
    lines,
    span,
  };
}

/** Builds a line between two anchors. */
function line(
  id: string,
  label: string,
  from: Anchor,
  to: Anchor,
  style: "solid" | "dashed",
  color: string
): ShapeLine {
  return { id, label, points: [from, to], style, color };
}

/**
 * Triangles, flags and wedges are all "two converging boundaries" formations.
 * This shared builder classifies the last three same-kind pivots by how the
 * upper and lower boundaries behave.
 */
function detectConvergences(highs: SwingPoint[], lows: SwingPoint[]): ChartShape[] {
  const found: ChartShape[] = [];
  if (highs.length < 2 || lows.length < 2) return found;

  const upper = highs.slice(-2);
  const lower = lows.slice(-2);
  const upperSlope = upper[1].price - upper[0].price;
  const lowerSlope = lower[1].price - lower[0].price;
  const span = { from: Math.min(upper[0].time, lower[0].time), to: Math.max(upper[1].time, lower[1].time) };

  const converging = Math.abs(upperSlope) > 0 && Math.abs(lowerSlope) > 0
    && (upperSlope > 0) !== (lowerSlope > 0);
  const magnitudeRatio = Math.abs(upperSlope) / (Math.abs(lowerSlope) || 1);

  const upperLine = line("upper", "Upper", anchor(upper[0]), anchor(upper[1]), "solid", TRENDLINE_COLORS.upper);
  const lowerLine = line("lower", "Lower", anchor(lower[0]), anchor(lower[1]), "solid", TRENDLINE_COLORS.lower);

  // Triangles: flat boundary plus a rising/falling one.
  const upperFlat = Math.abs(upperSlope) <= tolerance(upper[1].price, 0.5);
  const lowerFlat = Math.abs(lowerSlope) <= tolerance(lower[1].price, 0.5);

  if (upperFlat && !lowerFlat && lowerSlope > 0) {
    found.push(shape("ascendingTriangle", "Ascending Triangle", "bullish", 68,
      "Flat resistance with rising support — buyers are pressing into a ceiling.",
      [[anchor(upper[0]), anchor(lower[0]), anchor(lower[1]), anchor(upper[1])]],
      [upperLine, lowerLine], span));
  } else if (lowerFlat && !upperFlat && upperSlope < 0) {
    found.push(shape("descendingTriangle", "Descending Triangle", "bearish", 68,
      "Flat support with falling resistance — sellers press a floor.",
      [[anchor(upper[0]), anchor(lower[0]), anchor(lower[1]), anchor(upper[1])]],
      [upperLine, lowerLine], span));
  } else if (converging && magnitudeRatio > 0.5 && magnitudeRatio < 2) {
    found.push(shape("symmetricalTriangle", "Symmetrical Triangle", "neutral", 64,
      "Both boundaries converge — direction is undecided until the break.",
      [[anchor(upper[0]), anchor(lower[0]), anchor(lower[1]), anchor(upper[1])]],
      [upperLine, lowerLine], span));
  }

  // Wedges: both boundaries slope the same way and are converging.
  if (upperSlope < 0 && lowerSlope < 0 && Math.abs(lowerSlope) > Math.abs(upperSlope) * 0.5) {
    found.push(shape("fallingWedge", "Falling Wedge", "bullish", 66,
      "Both boundaries fall but support holds better than resistance — selling pressure is fading.",
      [[anchor(upper[0]), anchor(lower[0]), anchor(lower[1]), anchor(upper[1])]],
      [upperLine, lowerLine], span));
  } else if (upperSlope > 0 && lowerSlope > 0 && Math.abs(upperSlope) > Math.abs(lowerSlope) * 0.5) {
    found.push(shape("risingWedge", "Rising Wedge", "bearish", 66,
      "Both boundaries rise but resistance climbs faster — buyers are losing control.",
      [[anchor(upper[0]), anchor(lower[0]), anchor(lower[1]), anchor(upper[1])]],
      [upperLine, lowerLine], span));
  }

  // Flags: a steep impulse followed by a tight counter-trend drift.
  if (highs.length >= 2 && lows.length >= 2) {
    const impulseUp = upper[1].price - lower[0].price;
    const drift = Math.abs(lower[1].price - lower[0].price) + Math.abs(upper[1].price - upper[0].price);
    if (impulseUp > 0 && drift < impulseUp * 0.45 && upperSlope < 0 && lowerSlope < 0) {
      const pole = { time: lower[0].time, price: lower[0].price };
      const end = { time: upper[1].time, price: upper[1].price };
      found.push(shape("bullFlag", "Bull Flag", "bullish", 62,
        "A sharp pole, then a tight downward drift on falling volume.",
        [[pole, anchor(lower[0]), anchor(lower[1]), anchor(upper[1]), end]],
        [line("flag-top", "Flag top", anchor(upper[0]), anchor(upper[1]), "solid", TRENDLINE_COLORS.upper),
         line("flag-bottom", "Flag bottom", anchor(lower[0]), anchor(lower[1]), "solid", TRENDLINE_COLORS.lower)],
        span));
    } else if (impulseUp < 0 && drift < Math.abs(impulseUp) * 0.45 && upperSlope > 0 && lowerSlope > 0) {
      const pole = { time: upper[0].time, price: upper[0].price };
      const end = { time: lower[1].time, price: lower[1].price };
      found.push(shape("bearFlag", "Bear Flag", "bearish", 62,
        "A sharp drop, then a tight upward drift on thinning volume.",
        [[pole, anchor(lower[0]), anchor(lower[1]), anchor(upper[1]), end]],
        [line("flag-top", "Flag top", anchor(upper[0]), anchor(upper[1]), "solid", TRENDLINE_COLORS.upper),
         line("flag-bottom", "Flag bottom", anchor(lower[0]), anchor(lower[1]), "solid", TRENDLINE_COLORS.lower)],
        span));
    }
  }

  return found;
}

/**
 * Reversal formations built from five alternating pivots.
 * Handles Head & Shoulders (and its inverse), Double Top / Bottom and
 * Cup & Handle.
 */
function detectReversals(pivots: SwingPoint[]): ChartShape[] {
  const found: ChartShape[] = [];
  const tol = (price: number) => tolerance(price, 1.2);

  // Double tops and bottoms are only three pivots (peak-trough-peak), so they
  // are scanned separately from the five-pivot Head & Shoulders family.
  // Only the most recent triple is considered: testing every historical triple
  // over-fires and reports contradictory patterns on the same move.
  if (pivots.length >= 3) {
    const left = pivots.at(-3)!;
    const middle = pivots.at(-2)!;
    const right = pivots.at(-1)!;
    const level = (left.price + right.price) / 2;
    const span = { from: left.time, to: right.time };
    // 0.6% keeps "similar" tight enough that an unrelated swing is not treated
    // as a matching second top/bottom.
    const matchTol = tolerance(level, 0.6);

    if (left.kind === "high" && middle.kind === "low" && right.kind === "high"
      && Math.abs(left.price - right.price) <= matchTol) {
      const neckline = line("neckline", "Neckline", anchor(middle), anchor(right), "dashed", "#f0b90b");
      found.push(shape("doubleTop", "Double Top", "bearish", 70,
        "Two tests of the same ceiling with a trough between them — resistance has held twice.",
        [[anchor(left), anchor(middle), anchor(right)]], [neckline], span));
    }
    if (left.kind === "low" && middle.kind === "high" && right.kind === "low"
      && Math.abs(left.price - right.price) <= matchTol) {
      const neckline = line("neckline", "Neckline", anchor(middle), anchor(right), "dashed", "#f0b90b");
      found.push(shape("doubleBottom", "Double Bottom", "bullish", 70,
        "Two tests of the same floor with a peak between them — support has held twice.",
        [[anchor(left), anchor(middle), anchor(right)]], [neckline], span));
    }
  }

  if (pivots.length < 5) return found;
  const window = pivots.slice(-5);
  const [a, b, c, d, e] = window;
  const span = { from: a.time, to: e.time };

  // Head & Shoulders: LS-H-RS with the head above both shoulders.
  if (a.kind === "high" && b.kind === "low" && c.kind === "high" && d.kind === "low" && e.kind === "high") {
    const shouldersLevel = (a.price + e.price) / 2;
    if (c.price > shouldersLevel + tol(c.price) && Math.abs(a.price - e.price) <= tol(shouldersLevel)) {
      const neckline = line("neckline", "Neckline", anchor(b), anchor(d), "dashed", "#f0b90b");
      found.push(shape("headAndShoulders", "Head & Shoulders", "bearish", 72,
        "Three peaks with a higher middle and a broken neckline — a bearish reversal.",
        [[anchor(a), anchor(b), anchor(c), anchor(d), anchor(e)]], [neckline], span));
    }
  }

  // Inverse Head & Shoulders mirrors the above.
  if (a.kind === "low" && b.kind === "high" && c.kind === "low" && d.kind === "high" && e.kind === "low") {
    const shouldersLevel = (a.price + e.price) / 2;
    if (c.price < shouldersLevel - tol(c.price) && Math.abs(a.price - e.price) <= tol(shouldersLevel)) {
      const neckline = line("neckline", "Neckline", anchor(b), anchor(d), "dashed", "#f0b90b");
      found.push(shape("inverseHeadAndShoulders", "Inverse Head & Shoulders", "bullish", 72,
        "Three troughs with a lower middle and a reclaimed neckline — a bullish reversal.",
        [[anchor(a), anchor(b), anchor(c), anchor(d), anchor(e)]], [neckline], span));
    }
  }

  // Cup & Handle needs seven pivots: rim, bowl, rim, handle dip, rim.
  if (pivots.length >= 7) {
    const cup = pivots.slice(-7);
    const [r1, s1, bottom, s2, r2, h, r3] = cup;
    if (r1.kind === "high" && bottom.kind === "low" && r2.kind === "high" && r3.kind === "high") {
      const rim = (r1.price + r2.price) / 2;
      const depth = (rim - bottom.price) / (rim || 1);
      const handleMid = (h.price + r2.price) / 2;
      const symmetric = Math.abs(r1.price - r2.price) <= tol(rim) && Math.abs((s1.price + s2.price) / 2 - rim) <= tol(rim);
      if (depth > 0.05 && depth < 0.4 && symmetric && handleMid > bottom.price && h.price < rim) {
        found.push(shape("cupAndHandle", "Cup & Handle", "bullish", 66,
          "A rounded base that recovered to its rim, with a shallow handle pullback.",
          [[anchor(r1), anchor(s1), anchor(bottom), anchor(s2), anchor(r2)]],
          [line("handle", "Handle", anchor(r2), anchor(h), "solid", "#f0b90b"),
           line("handle-end", "Handle end", anchor(h), anchor(r3), "solid", "#f0b90b")],
          { from: r1.time, to: r3.time }));
      }
    }
  }

  return found;
}

/**
 * Public entry point: pivots in, trendlines plus every recognised geometry out.
 */
export function detectChartPatterns(candles: Candle[], lookback = 3): {
  trendlines: Trendline[];
  shapes: ChartShape[];
} {
  const pivots = zigZag(candles, lookback);
  const highs = pivots.filter((point) => point.kind === "high");
  const lows = pivots.filter((point) => point.kind === "low");

  const shapes = [...detectConvergences(highs, lows), ...detectReversals(pivots)]
    // Later patterns are more relevant, and the cap keeps the overlay readable.
    .sort((first, second) => second.span.to - first.span.to)
    .slice(0, 6);

  return { trendlines: calculateTrendlines(candles, lookback), shapes };
}
