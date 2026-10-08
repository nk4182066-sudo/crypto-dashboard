import { zigZag } from "@/src/analysis/structure";
import type { Candle, SwingPoint } from "@/src/analysis/types";

/* Basic Elliott Wave detection. Educational only.
   Complex patterns may not be accurate. */

export interface ElliottWave {
  label: string;
  time: number;
  price: number;
  type: "impulse" | "corrective";
}

export interface ElliottResult {
  waves: ElliottWave[];
  pattern: "impulse" | "corrective" | "none";
  confidence: number;
}

const point = (p: SwingPoint, label: string, type: "impulse" | "corrective"): ElliottWave =>
  ({ label, time: p.time, price: p.price, type });

/**
 * Validates a 6-pivot impulse (endpoints of waves 1-5) using simple rules:
 * wave 2 never breaches the wave-1 origin, wave 3 exceeds the wave-1 high,
 * wave 4 stays above the wave-1 top, and wave 3 at least matches wave 1's
 * length ("longest" bonus). Bullish impulses start on a low pivot, bearish on
 * a high. Direction math is folded into `dir` (+1 up / -1 down).
 */
function impulse(pivots: SwingPoint[], bullish: boolean): { waves: ElliottWave[]; confidence: number } | null {
  if (pivots.length < 6) return null;
  const [p0, p1, p2, p3, p4, p5] = pivots;
  if (bullish !== (p0.kind === "low")) return null; // zigZag pivots alternate kinds
  const dir = bullish ? 1 : -1;
  const mag1 = dir * (p1.price - p0.price); // wave 1 length
  const mag3 = dir * (p3.price - p2.price); // wave 3 length
  if (mag1 <= 0 || mag3 <= 0) return null; // wave 1 must move with the trend
  if (dir * (p2.price - p0.price) <= 0) return null; // wave 2 stays above origin
  if (dir * (p3.price - p1.price) <= 0) return null; // wave 3 > wave 1 high
  if (dir * (p4.price - p1.price) <= 0) return null; // wave 4 > wave 1 top
  if (dir * (p3.price - p4.price) <= 0) return null; // wave 4 retraces wave 3
  if (dir * (p5.price - p3.price) <= 0) return null; // wave 5 > wave 3 high
  return {
    waves: [
      point(p1, "1", "impulse"),
      point(p2, "2", "impulse"),
      point(p3, "3", "impulse"),
      point(p4, "4", "impulse"),
      point(p5, "5", "impulse"),
    ],
    confidence: mag3 >= mag1 ? 88 : 76,
  };
}

/** A-B-C tail after a completed impulse (needs 3 more pivots). */
function abcTail(pivots: SwingPoint[], bullish: boolean): ElliottWave[] | null {
  if (pivots.length < 9) return null;
  const [p5, a, b, c] = [pivots[5], pivots[6], pivots[7], pivots[8]];
  const dir = bullish ? 1 : -1;
  if (dir * (a.price - p5.price) >= 0) return null; // A moves against the impulse
  if (dir * (b.price - p5.price) >= 0) return null; // B stays inside the impulse range
  if (dir * (b.price - a.price) <= 0) return null; // B retraces A part-way
  if (dir * (c.price - a.price) >= 0) return null; // C pushes past A's end
  return [point(a, "A", "corrective"), point(b, "B", "corrective"), point(c, "C", "corrective")];
}

/** Standalone A-B-C correction from the last four pivots (start, A, B, C). */
function corrective(pivots: SwingPoint[]): ElliottWave[] | null {
  if (pivots.length < 4) return null;
  const [q0, q1, q2, q3] = pivots.slice(-4);
  // Down-correction after an up-drive: q0 high -> A low -> B lower high -> C lower low.
  if (q1.price < q0.price && q2.price < q0.price && q2.price > q1.price && q3.price < q1.price) {
    return [point(q1, "A", "corrective"), point(q2, "B", "corrective"), point(q3, "C", "corrective")];
  }
  // Up-correction after a down-drive: q0 low -> A high -> B higher low -> C higher high.
  if (q1.price > q0.price && q2.price > q0.price && q2.price < q1.price && q3.price > q1.price) {
    return [point(q1, "A", "corrective"), point(q2, "B", "corrective"), point(q3, "C", "corrective")];
  }
  return null;
}

/**
 * Scans ZigZag pivots of the recent window: slides a 6-pivot window to find
 * the most recent valid impulse (then its A-B-C tail when present), falling
 * back to a standalone A-B-C correction, else "none" with empty waves.
 */
export function detectElliottWaves(candles: Candle[], lookback = 150): ElliottResult {
  const pivots = zigZag(candles.slice(-lookback), 3);
  if (pivots.length < 4) return { waves: [], pattern: "none", confidence: 0 };
  for (let start = pivots.length - 6; start >= 0; start -= 1) {
    const window = pivots.slice(start, start + 6);
    for (const bullish of [true, false]) {
      const found = impulse(window, bullish);
      if (!found) continue;
      const abc = abcTail(pivots.slice(start), bullish);
      return { waves: [...found.waves, ...(abc ?? [])], pattern: "impulse", confidence: abc ? 92 : found.confidence };
    }
  }
  const corr = corrective(pivots);
  if (corr) return { waves: corr, pattern: "corrective", confidence: 62 };
  return { waves: [], pattern: "none", confidence: 0 };
}