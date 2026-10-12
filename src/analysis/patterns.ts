import type { Candle, ChartPatternReport, ClassicalPattern, ElliottReport, HarmonicMatch, SwingPoint } from "./types";
import { zigZag } from "./structure";

interface RatioSet {
  xab: number;
  abc: number;
  bcd: number;
  xad: number;
}

interface HarmonicRule {
  name: string;
  xab: [number, number];
  abc: [number, number];
  bcd: [number, number];
  xad: [number, number];
}

const harmonicRules: HarmonicRule[] = [
  { name: "Gartley", xab: [0.55, 0.68], abc: [0.382, 0.886], bcd: [1.13, 1.618], xad: [0.72, 0.85] },
  { name: "Bat", xab: [0.35, 0.55], abc: [0.382, 0.886], bcd: [1.6, 2.618], xad: [0.83, 0.94] },
  { name: "Butterfly", xab: [0.72, 0.85], abc: [0.382, 0.886], bcd: [1.6, 2.618], xad: [1.2, 1.65] },
  { name: "Crab", xab: [0.35, 0.68], abc: [0.382, 0.886], bcd: [2.2, 3.618], xad: [1.5, 1.72] },
];

function within(value: number, [low, high]: [number, number]) {
  return value >= low && value <= high;
}

function ruleScore(ratios: RatioSet, rule: HarmonicRule) {
  if (!within(ratios.xab, rule.xab) || !within(ratios.xad, rule.xad)) return 0;
  if (!within(ratios.abc, rule.abc)) return 0;
  const midpoint = (bounds: [number, number]) => (bounds[0] + bounds[1]) / 2;
  const closeness = (value: number, bounds: [number, number]) =>
    1 - Math.min(1, Math.abs(value - midpoint(bounds)) / ((bounds[1] - bounds[0]) / 2 || 1));
  const score = (closeness(ratios.xab, rule.xab) + closeness(ratios.abc, rule.abc) + closeness(ratios.xad, rule.xad)) / 3;
  return Math.round(score * 100);
}

/** Scans the most recent swing pivots for a completed XABCD harmonic pattern. */
export function detectHarmonics(candles: Candle[]): HarmonicMatch[] {
  const pivots = zigZag(candles, 3);
  const matches: HarmonicMatch[] = [];
  if (pivots.length < 5) return matches;
  const [x, a, b, c, d] = pivots.slice(-5);
  const xa = Math.abs(a.price - x.price);
  const ab = Math.abs(b.price - a.price);
  const bc = Math.abs(c.price - b.price);
  const ad = Math.abs(d.price - a.price);
  if (xa === 0 || ab === 0 || bc === 0) return matches;
  const ratios: RatioSet = {
    xab: ab / xa,
    abc: bc / ab,
    bcd: Math.abs(d.price - c.price) / bc,
    xad: ad / xa,
  };
  const direction = d.kind === "low" ? "bullish" : "bearish";
  for (const rule of harmonicRules) {
    const score = ruleScore(ratios, rule);
    if (score >= 55) {
      matches.push({
        name: `${direction === "bullish" ? "Bullish" : "Bearish"} ${rule.name}`,
        direction,
        completionPrice: d.price,
        points: [x, a, b, c, d].map((point) => ({ time: point.time, price: point.price })),
        ratios: {
          xab: Number(ratios.xab.toFixed(3)),
          abc: Number(ratios.abc.toFixed(3)),
          bcd: Number(ratios.bcd.toFixed(3)),
          xad: Number(ratios.xad.toFixed(3)),
        },
        score,
      });
    }
  }
  return matches.sort((first, second) => second.score - first.score).slice(0, 4);
}

/**
 * Heuristic Elliott Wave count. Labels the most recent alternating swings as an
 * impulse (1-2-3-4-5) or a correction (ABC) when the leg geometry allows it.
 */
export function detectElliott(candles: Candle[]): ElliottReport | null {
  const pivots = zigZag(candles, 3);
  if (pivots.length < 4) return null;
  const window = pivots.slice(-6);
  const start = candles.length >= 2 ? window[0] : null;
  if (!start) return null;
  const legs: number[] = [];
  for (let index = 1; index < window.length; index += 1) {
    legs.push(Math.abs(window[index].price - window[index - 1].price));
  }

  if (window.length >= 6 && legs.length >= 5) {
    const [w1, , w3, w4, w5] = legs;
    const impulseValid = w3 > w1 && w3 > w5 && w4 < w3;
    const labels = ["1", "2", "3", "4", "5"];
    const count = window.slice(0, 6).map((point, index) => ({ label: labels[index], time: point.time, price: point.price }));
    return {
      label: impulseValid ? "Impulse 1-2-3-4-5 (in progress)" : "Possible 5-wave sequence",
      count,
      note: impulseValid
        ? "Wave 3 is the longest leg and wave 4 did not overlap wave 1, which supports a valid impulse count."
        : "Leg geometry only loosely resembles an impulse; treat the count as low-confidence.",
    };
  }

  if (window.length >= 4 && legs.length >= 3) {
    const [wa, wb, wc] = legs;
    const valid = wc < wa && wb < wa * 0.9;
    return {
      label: "ABC correction",
      count: window.slice(0, 4).map((point, index) => ({ label: ["A", "B", "C", "D"][index], time: point.time, price: point.price })),
      note: valid
        ? "An A-B-C pullback is developing; wait for wave C exhaustion before the trend resumes."
        : "Only a partial correction is visible; the wave label is provisional.",
    };
  }

  return null;
}

export function detectChartPatterns(candles: Candle[]): ChartPatternReport {
  return { harmonics: detectHarmonics(candles), elliott: detectElliott(candles), classical: detectClassicalPatterns(candles) };
}

/** Heuristic classical chart patterns from alternating swing pivots. */
export function detectClassicalPatterns(candles: Candle[]): ClassicalPattern[] {
  const pivots = zigZag(candles, 3);
  const found: ClassicalPattern[] = [];
  if (pivots.length < 4) return found;

  const tolerance = (price: number, percent: number) => price * (percent / 100);
  const last = pivots.slice(-7);
  const highs = last.filter((point) => point.kind === "high");
  const lows = last.filter((point) => point.kind === "low");
  const points = (items: typeof last) => items.map((point) => ({ time: point.time, price: point.price }));

  if (highs.length >= 2) {
    const [first, second] = highs.slice(-2);
    const trough = lows.filter((point) => point.time > first.time && point.time < second.time).at(-1);
    if (Math.abs(first.price - second.price) <= tolerance(first.price, 1.5) && trough && first.price - trough.price > tolerance(first.price, 1)) {
      found.push({
        name: "Double Top",
        direction: "bearish",
        confidence: 70,
        neckline: trough.price,
        note: "Two rejects at the same high with a trough between them — a close below the neckline confirms the reversal.",
        points: points([first, trough, second]),
      });
    }
  }
  if (lows.length >= 2) {
    const [first, second] = lows.slice(-2);
    const peak = highs.filter((point) => point.time > first.time && point.time < second.time).at(-1);
    if (Math.abs(first.price - second.price) <= tolerance(first.price, 1.5) && peak && peak.price - first.price > tolerance(first.price, 1)) {
      found.push({
        name: "Double Bottom",
        direction: "bullish",
        confidence: 70,
        neckline: peak.price,
        note: "Two holds of the same low with a peak between them — a close above the neckline confirms the reversal.",
        points: points([first, peak, second]),
      });
    }
  }

  if (highs.length >= 3 && lows.length >= 2) {
    const [leftShoulder, head, rightShoulder] = highs.slice(-3);
    const neckLows = lows.filter((point) => point.time > leftShoulder.time && point.time < rightShoulder.time);
    if (head.price > leftShoulder.price && head.price > rightShoulder.price && neckLows.length >= 2 && Math.abs(leftShoulder.price - rightShoulder.price) <= tolerance(head.price, 3)) {
      const neckline = neckLows.reduce((total, point) => total + point.price, 0) / neckLows.length;
      found.push({
        name: "Head & Shoulders",
        direction: "bearish",
        confidence: 72,
        neckline,
        note: "Higher high (head) flanked by near-equal shoulders with a neckline — a close below it confirms the reversal.",
        points: points([leftShoulder, ...neckLows, head, rightShoulder]),
      });
    }
  }
  if (lows.length >= 3 && highs.length >= 2) {
    const [leftShoulder, head, rightShoulder] = lows.slice(-3);
    const neckHighs = highs.filter((point) => point.time > leftShoulder.time && point.time < rightShoulder.time);
    if (head.price < leftShoulder.price && head.price < rightShoulder.price && neckHighs.length >= 2 && Math.abs(leftShoulder.price - rightShoulder.price) <= tolerance(head.price, 3)) {
      const neckline = neckHighs.reduce((total, point) => total + point.price, 0) / neckHighs.length;
      found.push({
        name: "Inverse Head & Shoulders",
        direction: "bullish",
        confidence: 72,
        neckline,
        note: "Lower low (head) flanked by near-equal shoulders — a break of the neckline completes the reversal.",
        points: points([leftShoulder, ...neckHighs, head, rightShoulder]),
      });
    }
  }

  found.push(...detectSwingShapes(highs, lows, tolerance));
  return found.slice(0, 6);
}

/** Triangles, broadening and cup-with-handle built from swing highs/lows. */
function detectSwingShapes(
  highs: SwingPoint[],
  lows: SwingPoint[],
  tolerance: (price: number, percent: number) => number,
): ClassicalPattern[] {
  const found: ClassicalPattern[] = [];
  const points = (items: SwingPoint[]) => items.map((point) => ({ time: point.time, price: point.price }));

  if (highs.length >= 3 && lows.length >= 3) {
    const h = highs.slice(-3);
    const l = lows.slice(-3);
    const highsFalling = h[2].price < h[0].price;
    const highsFlat = Math.abs(h[2].price - h[0].price) <= tolerance(h[0].price, 1);
    const lowsRising = l[2].price > l[0].price;
    const lowsFlat = Math.abs(l[2].price - l[0].price) <= tolerance(l[0].price, 1);
    const lowsFalling = l[2].price < l[0].price;

    if (lowsRising && (highsFlat || highsFalling)) {
      found.push({
        name: highsFlat ? "Ascending Triangle" : "Symmetrical Triangle",
        direction: "bullish",
        confidence: 65,
        neckline: h[2].price,
        note: highsFlat
          ? "Flat resistance with higher lows — buyers keep stepping up; a break of the flat ceiling triggers the move."
          : "Converging swings with rising lows — pressure is building for an upside break.",
        points: points([...h, ...l]),
      });
    }
    if (highsFalling && (lowsFlat || lowsFalling)) {
      found.push({
        name: lowsFlat ? "Descending Triangle" : "Symmetrical Triangle",
        direction: "bearish",
        confidence: 65,
        neckline: l[2].price,
        note: lowsFlat
          ? "Flat support with lower highs — sellers keep pressing; a break of the floor triggers the move."
          : "Converging swings with falling highs — pressure is building for a downside break.",
        points: points([...h, ...l]),
      });
    }
    if (h[2].price > h[0].price && lowsFalling) {
      found.push({
        name: "Broadening Formation",
        direction: "neutral",
        confidence: 60,
        neckline: null,
        note: "Higher highs with lower lows — the market is expanding both ways (emotional, choppy). Trade the edges with tight risk.",
        points: points([...h, ...l]),
      });
    }

    // Diamond: expanding range first (second high above the first, second low below the first),
    // then contracting back toward the middle — four swing boundaries in total.
    if (highs.length >= 3 && lows.length >= 3) {
      const hd = highs.slice(-3);
      const ld = lows.slice(-3);
      const expanding = hd[1].price > hd[0].price && ld[1].price < ld[0].price;
      const contracting = hd[2].price < hd[1].price && ld[2].price > ld[1].price;
      const midHigh = (hd[1].price + hd[2].price) / 2;
      const midLow = (ld[1].price + ld[2].price) / 2;
      const body = midHigh - midLow;
      if (expanding && contracting && body > tolerance(midHigh, 1)) {
        found.push({
          name: "Diamond",
          direction: "neutral",
          confidence: 60,
          neckline: midHigh,
          note: "A widening range that narrows again forms a diamond. Volume usually dries up mid-pattern; trade the eventual break of the neckline or floor, not the middle.",
          points: points([...hd, ...ld]),
        });
      }
    }
  }

  if (highs.length >= 2 && lows.length >= 1) {
    const leftHigh = highs[0];
    const rightHigh = highs.at(-1)!;
    const cupLow = lows.reduce((lowest, point) => (point.price < lowest.price ? point : lowest), lows[0]);
    const depth = (leftHigh.price - cupLow.price) / leftHigh.price;
    if (Math.abs(leftHigh.price - rightHigh.price) <= tolerance(leftHigh.price, 4) && depth > 0.03 && depth < 0.35 && rightHigh.time > cupLow.time) {
      found.push({
        name: "Cup with Handle",
        direction: "bullish",
        confidence: 64,
        neckline: Math.max(leftHigh.price, rightHigh.price),
        note: "A rounded base has recovered to its prior high; a shallow handle pullback followed by a break of the rim confirms.",
        points: points([leftHigh, cupLow, rightHigh]),
      });
    }
  }

  found.push(...detectTerminalShapes(highs, lows));
  return found;
}

/** Three drives and wedge shapes — the last patterns in the classical set. */
function detectTerminalShapes(highs: SwingPoint[], lows: SwingPoint[]): ClassicalPattern[] {
  const found: ClassicalPattern[] = [];
  const points = (items: SwingPoint[]) => items.map((point) => ({ time: point.time, price: point.price }));

  if (highs.length >= 3) {
    const drives = highs.slice(-3);
    const rising = drives[1].price > drives[0].price && drives[2].price > drives[1].price;
    const leg1 = drives[1].price - drives[0].price;
    const leg2 = drives[2].price - drives[1].price;
    if (rising && leg1 > 0 && leg2 > 0 && leg2 / leg1 < 2.1 && leg2 / leg1 > 0.43) {
      found.push({
        name: "Three Drives",
        direction: "bearish",
        confidence: 58,
        neckline: null,
        note: "Three sequential higher drives of comparable size — the classic exhaustion pattern before a reversal.",
        points: points(drives),
      });
    }
  }

  if (highs.length >= 2 && lows.length >= 2) {
    const h = highs.slice(-2);
    const l = lows.slice(-2);
    if (h[1].price < h[0].price && l[1].price < l[0].price) {
      found.push({
        name: "Falling Wedge",
        direction: "bullish",
        confidence: 62,
        neckline: h[1].price,
        note: "Both boundaries slope down but are converging — selling pressure is losing force.",
        points: points([...h, ...l]),
      });
    }
    if (h[1].price > h[0].price && l[1].price > l[0].price) {
      found.push({
        name: "Rising Wedge",
        direction: "bearish",
        confidence: 62,
        neckline: l[1].price,
        note: "Both boundaries slope up but are converging — buying pressure is losing force.",
        points: points([...h, ...l]),
      });
    }
  }

  return found;
}
