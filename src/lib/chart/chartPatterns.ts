/**
 * Phase 6 — chart pattern catalogue (25 patterns) for the PatternLibrary UI.
 * Reversal, continuation and basic harmonic shapes detected from alternating
 * ZigZag swing pivots. Each def carries a Roman Urdu explainer plus the swing
 * points it needs, so the library card can teach the shape before detection
 * fires. Educational analysis only — not financial advice.
 */
import { zigZag } from "@/src/analysis/structure";
import type { Candle, SwingPoint } from "@/src/analysis/types";

export type PatternType = "bullish" | "bearish" | "neutral";
export type PatternCategory = "reversal" | "continuation" | "harmonic";

/** One detected pattern, shaped for the library list and chart overlays. */
export interface ChartPatternHit {
  pattern: string; type: PatternType; category: PatternCategory;
  time: number; price: number; confidence: number;
  note: string;
}

interface DetectCtx { pivots: SwingPoint[]; i: number; }

export interface ChartPatternDef {
  name: string; type: PatternType; category: PatternCategory;
  /** Ek line mein ye kya hai (Roman Urdu). */
  romanUrdu: string;
  /** Kis swing points ki zaroorat hai detection ke liye. */
  pointsNeeded: string;
  detect: (x: DetectCtx) => ChartPatternHit | null;
}

const tail = (x: DetectCtx, n: number) => x.pivots.slice(Math.max(0, x.i - n + 1), x.i + 1);
const peaks = (ps: SwingPoint[]) => ps.filter((p) => p.kind === "high");
const valleys = (ps: SwingPoint[]) => ps.filter((p) => p.kind === "low");
const eqP = (a: number, b: number, pct = 1.5) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1e-12) * (pct / 100);
const rng = (ps: SwingPoint[]) => (ps.length ? Math.max(...ps.map((p) => p.price)) - Math.min(...ps.map((p) => p.price)) : 0);
const last = (x: DetectCtx) => x.pivots[x.i];
const hit = (pattern: string, type: PatternType, category: PatternCategory, x: DetectCtx, confidence: number, note: string): ChartPatternHit =>
  ({ pattern, type, category, time: last(x).time, price: last(x).price, confidence, note });
/** Last 6 pivots with their peaks/valleys split; null when the window is short. */
const w6 = (x: DetectCtx) => { const ps = tail(x, 6); return ps.length === 6 ? { ps, hs: peaks(ps), vs: valleys(ps) } : null; };

/** All 25 chart patterns with Roman Urdu explainers and pivot-based detectors. */
export const chartPatternDefs: ChartPatternDef[] = [
  // ── Reversal (10) ──
  {
    name: "Head & Shoulders", type: "bearish", category: "reversal",
    romanUrdu: "Teen peaks: beech wali sabse badi, dono side wali lagbhag barabar.", pointsNeeded: "3 highs + 2 lows (5 pivots), last pivot high",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[4].kind !== "high") return null; const pk = [ps[0], ps[2], ps[4]]; const vl = [ps[1], ps[3]]; return eqP(pk[0].price, pk[2].price, 2.5) && pk[1].price > pk[0].price && pk[1].price > pk[2].price && eqP(vl[0].price, vl[1].price, 4) ? hit("Head & Shoulders", "bearish", "reversal", x, 85, "Left shoulder, higher head, right shoulder — neckline break = downtrend.") : null },
  },
  {
    name: "Inverse Head & Shoulders", type: "bullish", category: "reversal",
    romanUrdu: "Ulta H&S: teen lows, beech wali sabse neeche, upar neckline barabar.", pointsNeeded: "3 lows + 2 highs (5 pivots), last pivot low",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[4].kind !== "low") return null; const vl = [ps[0], ps[2], ps[4]]; const pk = [ps[1], ps[3]]; return eqP(vl[0].price, vl[2].price, 2.5) && vl[1].price < vl[0].price && vl[1].price < vl[2].price && eqP(pk[0].price, pk[1].price, 4) ? hit("Inverse Head & Shoulders", "bullish", "reversal", x, 85, "Shoulder-head-shoulder upside down — neckline break = uptrend.") : null },
  },
  {
    name: "Double Top", type: "bearish", category: "reversal",
    romanUrdu: "Do barabar highs, beech mein gehri valley — resistance do baar reject.", pointsNeeded: "2 highs + 1 deeper low between (last pivot high)",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[4].kind !== "high") return null; const a = ps[0].price; const b = ps[4].price; const vl = Math.min(ps[1].price, ps[3].price); const range = Math.max(a, b) - vl; return eqP(a, b, 2) && vl <= Math.min(a, b) - range * 0.3 ? hit("Double Top", "bearish", "reversal", x, 82, "Two equal highs with a deep trough — resistance confirmed twice.") : null },
  },
  {
    name: "Double Bottom", type: "bullish", category: "reversal",
    romanUrdu: "Do barabar lows, beech mein unchi peak — support do baar bounce.", pointsNeeded: "2 lows + 1 higher high between (last pivot low)",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[4].kind !== "low") return null; const a = ps[0].price; const b = ps[4].price; const pk = Math.max(ps[1].price, ps[3].price); const range = pk - Math.min(a, b); return eqP(a, b, 2) && pk >= Math.max(a, b) + range * 0.3 ? hit("Double Bottom", "bullish", "reversal", x, 82, "Two equal lows with a peak between — support confirmed twice.") : null },
  },
  {
    name: "Triple Top", type: "bearish", category: "reversal",
    romanUrdu: "Teen barabar highs — teen baar resistance ne sell-off diya.", pointsNeeded: "3 equal highs + 2 deeper lows (last pivot high)",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[4].kind !== "high") return null; const pk = [ps[0].price, ps[2].price, ps[4].price]; const vl = Math.min(ps[1].price, ps[3].price); const range = Math.max(...pk) - vl; return eqP(pk[0], pk[1], 2) && eqP(pk[1], pk[2], 2) && vl <= Math.min(...pk) - range * 0.3 ? hit("Triple Top", "bearish", "reversal", x, 86, "Three equal highs — resistance ne teesri baar reject kiya.") : null },
  },
  {
    name: "Triple Bottom", type: "bullish", category: "reversal",
    romanUrdu: "Teen barabar lows — teen baar support ne bounce diya.", pointsNeeded: "3 equal lows + 2 lower highs between (last pivot low)",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[4].kind !== "low") return null; const vl = [ps[0].price, ps[2].price, ps[4].price]; const pk = Math.max(ps[1].price, ps[3].price); const range = pk - Math.min(...vl); return eqP(vl[0], vl[1], 2) && eqP(vl[1], vl[2], 2) && pk >= Math.max(...vl) + range * 0.3 ? hit("Triple Bottom", "bullish", "reversal", x, 86, "Three equal lows — support ne teesri baar defend kiya.") : null },
  },
  {
    name: "Rounding Top", type: "bearish", category: "reversal",
    romanUrdu: "Price aahista aahista golai ke saath upar ja phir neeche — dheere top.", pointsNeeded: "3 peaks + 3 valleys arc shape (7 pivots)",
    detect: (x) => { const ps = tail(x, 7); const hs = peaks(ps).slice(-3); const vs = valleys(ps).slice(-3); if (hs.length < 3 || vs.length < 3) return null; const [a, b, c] = [hs[0].price, hs[1].price, hs[2].price]; return b > a && b > c && eqP(a, c, 5) ? hit("Rounding Top", "bearish", "reversal", x, 74, "Rounded arc over the highs — momentum shifting down slowly.") : null },
  },
  {
    name: "Rounding Bottom", type: "bullish", category: "reversal",
    romanUrdu: "Price golai ke saath neeche ja phir upar chadhi — dheere bottom.", pointsNeeded: "3 valleys + 3 peaks arc shape (7 pivots)",
    detect: (x) => { const ps = tail(x, 7); const hs = peaks(ps).slice(-3); const vs = valleys(ps).slice(-3); if (hs.length < 3 || vs.length < 3) return null; const [a, b, c] = [vs[0].price, vs[1].price, vs[2].price]; return b < a && b < c && eqP(a, c, 5) ? hit("Rounding Bottom", "bullish", "reversal", x, 74, "Rounded basin over the lows — accumulation completing.") : null },
  },
  {
    name: "Cup & Handle", type: "bullish", category: "reversal",
    romanUrdu: "Gol cup jaisi dish aur phir chhota handle — breakout se pehle halka pullback.", pointsNeeded: "2 rim highs + cup low + shallow handle low (5 pivots)",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[4].kind !== "high") return null; const depth = Math.min(ps[0].price, ps[2].price) - ps[1].price; const handle = ps[3].price - ps[1].price; return depth > 0 && handle >= depth * 0.25 && handle <= depth * 0.6 && eqP(ps[0].price, ps[2].price, 3) && ps[4].price >= Math.min(ps[0].price, ps[2].price) * 0.99 ? hit("Cup & Handle", "bullish", "reversal", x, 82, "U-shaped cup with a shallow handle — breakout above the rim.") : null },
  },
  {
    name: "Inverse Cup & Handle", type: "bearish", category: "reversal",
    romanUrdu: "Ulta cup — upar se gol dish aur phir chhota pullback, phir giraawat.", pointsNeeded: "2 rim lows + cup peak + shallow handle high (5 pivots)",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[4].kind !== "low") return null; const depth = ps[1].price - Math.max(ps[0].price, ps[2].price); const handle = ps[1].price - ps[3].price; return depth > 0 && handle >= depth * 0.25 && handle <= depth * 0.6 && eqP(ps[0].price, ps[2].price, 3) && ps[4].price <= Math.max(ps[0].price, ps[2].price) * 1.01 ? hit("Inverse Cup & Handle", "bearish", "reversal", x, 82, "Inverted U with a weak bounce — breakdown below the rim.") : null },
  },
  // ── Continuation (12) ──
  {
    name: "Ascending Triangle", type: "bullish", category: "continuation",
    romanUrdu: "Upar flat resistance aur neeche chadhti lows — ek din resistance tootega.", pointsNeeded: "3 flat highs + 3 rising lows (6 pivots)",
    detect: (x) => { const w = w6(x); if (!w || w.hs.length < 3 || w.vs.length < 3) return null; const h = w.hs.slice(-3).map((p) => p.price); const v = w.vs.slice(-3).map((p) => p.price); return eqP(h[0], h[1], 1.5) && eqP(h[1], h[2], 1.5) && v[0] < v[1] && v[1] < v[2] ? hit("Ascending Triangle", "bullish", "continuation", x, 80, "Flat resistance plus higher lows — buyers pressing up.") : null },
  },
  {
    name: "Descending Triangle", type: "bearish", category: "continuation",
    romanUrdu: "Neeche flat support aur upar girti highs — support ek din tootega.", pointsNeeded: "3 flat lows + 3 falling highs (6 pivots)",
    detect: (x) => { const w = w6(x); if (!w || w.hs.length < 3 || w.vs.length < 3) return null; const h = w.hs.slice(-3).map((p) => p.price); const v = w.vs.slice(-3).map((p) => p.price); return eqP(v[0], v[1], 1.5) && eqP(v[1], v[2], 1.5) && h[0] > h[1] && h[1] > h[2] ? hit("Descending Triangle", "bearish", "continuation", x, 80, "Flat floor plus lower highs — sellers pressing down.") : null },
  },
  {
    name: "Symmetrical Triangle", type: "neutral", category: "continuation",
    romanUrdu: "Dono taraf se ranges mil rahi hain — breakout kisi bhi side ho sakta hai.", pointsNeeded: "3 falling highs + 3 rising lows, narrowing (6 pivots)",
    detect: (x) => { const w = w6(x); if (!w || w.hs.length < 3 || w.vs.length < 3) return null; const h = w.hs.slice(-3).map((p) => p.price); const v = w.vs.slice(-3).map((p) => p.price); return h[0] > h[1] && h[1] > h[2] && v[0] < v[1] && v[1] < v[2] && h[2] - v[2] <= (h[0] - v[0]) * 0.8 ? hit("Symmetrical Triangle", "neutral", "continuation", x, 78, "Converging highs and lows — wait for the breakout leg.") : null },
  },
  {
    name: "Bull Flag", type: "bullish", category: "continuation",
    romanUrdu: "Tez chadhaai ke baad chhota channel neeche — reset phir continuation.", pointsNeeded: "Impulse up + 4-pivot down-sloping channel (6 pivots)",
    detect: (x) => { const ps = tail(x, 6); if (ps.length < 6 || ps[0].kind !== "low") return null; const impulse = ps[1].price - ps[0].price; return impulse > 0 && ps[2].price >= ps[0].price + impulse * 0.35 && ps[3].price < ps[1].price && ps[5].price < ps[3].price && ps[4].price >= ps[2].price - impulse * 0.15 ? hit("Bull Flag", "bullish", "continuation", x, 78, "Sharp pole then a drifting flag — trend usually resumes up.") : null },
  },
  {
    name: "Bear Flag", type: "bearish", category: "continuation",
    romanUrdu: "Tez giraawat ke baad chhota channel upar — rally jhooti, phir continuation.", pointsNeeded: "Impulse down + 4-pivot up-sloping channel (6 pivots)",
    detect: (x) => { const ps = tail(x, 6); if (ps.length < 6 || ps[0].kind !== "high") return null; const impulse = ps[0].price - ps[1].price; return impulse > 0 && ps[2].price <= ps[0].price - impulse * 0.35 && ps[3].price > ps[1].price && ps[5].price > ps[3].price && ps[4].price <= ps[2].price + impulse * 0.15 ? hit("Bear Flag", "bearish", "continuation", x, 78, "Sharp drop then a drifting flag — trend usually resumes down.") : null },
  },
  {
    name: "Pennant", type: "bullish", category: "continuation",
    romanUrdu: "Pole ke baad chhota simetrical triangle — consolidation phir chadhaai.", pointsNeeded: "Pole up + 4-pivot converging pennant (6 pivots)",
    detect: (x) => { const ps = tail(x, 6); if (ps.length < 6 || ps[0].kind !== "low") return null; const impulse = ps[1].price - ps[0].price; return impulse > 0 && ps[3].price < ps[1].price && ps[2].price >= ps[0].price + impulse * 0.35 && ps[4].price > ps[2].price && ps[3].price - ps[4].price <= impulse * 0.5 ? hit("Pennant", "bullish", "continuation", x, 76, "Pole plus small converging pennant — continuation after pause.") : null },
  },
  {
    name: "Rising Wedge", type: "bearish", category: "continuation",
    romanUrdu: "Highs aur lows dono chadh rahe par ranges sikud rahi hain — thakan.", pointsNeeded: "3 rising highs + 3 faster-rising lows, narrowing (6 pivots)",
    detect: (x) => { const w = w6(x); if (!w || w.hs.length < 3 || w.vs.length < 3) return null; const h = w.hs.slice(-3).map((p) => p.price); const v = w.vs.slice(-3).map((p) => p.price); return h[0] < h[1] && h[1] < h[2] && v[0] < v[1] && v[1] < v[2] && h[2] - v[2] <= (h[0] - v[0]) * 0.75 ? hit("Rising Wedge", "bearish", "continuation", x, 78, "Squeezing upward channel — often resolves to the downside.") : null },
  },
  {
    name: "Falling Wedge", type: "bullish", category: "continuation",
    romanUrdu: "Highs aur lows dono gir rahe par ranges sikud rahi hain — bounce.", pointsNeeded: "3 falling highs + 3 faster-falling lows, narrowing (6 pivots)",
    detect: (x) => { const w = w6(x); if (!w || w.hs.length < 3 || w.vs.length < 3) return null; const h = w.hs.slice(-3).map((p) => p.price); const v = w.vs.slice(-3).map((p) => p.price); return h[0] > h[1] && h[1] > h[2] && v[0] > v[1] && v[1] > v[2] && h[2] - v[2] <= (h[0] - v[0]) * 0.75 ? hit("Falling Wedge", "bullish", "continuation", x, 78, "Squeezing downward channel — often resolves to the upside.") : null },
  },
  {
    name: "Rectangle", type: "neutral", category: "continuation",
    romanUrdu: "Price flat resistance aur flat support ke beech aata jaata — range trading.", pointsNeeded: "3 flat highs + 3 flat lows (6 pivots)",
    detect: (x) => { const w = w6(x); if (!w || w.hs.length < 3 || w.vs.length < 3) return null; const h = w.hs.slice(-3).map((p) => p.price); const v = w.vs.slice(-3).map((p) => p.price); return eqP(h[0], h[1], 1.5) && eqP(h[1], h[2], 1.5) && eqP(v[0], v[1], 1.5) && eqP(v[1], v[2], 1.5) ? hit("Rectangle", "neutral", "continuation", x, 75, "Both sides flat — range until one boundary breaks.") : null },
  },
  {
    name: "Channel Up", type: "bullish", category: "continuation",
    romanUrdu: "Highs aur lows parallel chadh rahe hain — seedha uptrend channel.", pointsNeeded: "3 rising highs + 3 parallel rising lows (6 pivots)",
    detect: (x) => { const w = w6(x); if (!w || w.hs.length < 3 || w.vs.length < 3) return null; const h = w.hs.slice(-3).map((p) => p.price); const v = w.vs.slice(-3).map((p) => p.price); return h[0] < h[1] && h[1] < h[2] && v[0] < v[1] && v[1] < v[2] && eqP(h[2] - h[0], v[2] - v[0], 35) ? hit("Channel Up", "bullish", "continuation", x, 74, "Parallel rising channel — trend-following environment.") : null },
  },
  {
    name: "Channel Down", type: "bearish", category: "continuation",
    romanUrdu: "Highs aur lows parallel gir rahe hain — seedha downtrend channel.", pointsNeeded: "3 falling highs + 3 parallel falling lows (6 pivots)",
    detect: (x) => { const w = w6(x); if (!w || w.hs.length < 3 || w.vs.length < 3) return null; const h = w.hs.slice(-3).map((p) => p.price); const v = w.vs.slice(-3).map((p) => p.price); return h[0] > h[1] && h[1] > h[2] && v[0] > v[1] && v[1] > v[2] && eqP(h[0] - h[2], v[0] - v[2], 35) ? hit("Channel Down", "bearish", "continuation", x, 74, "Parallel falling channel — trend-following environment.") : null },
  },
  {
    name: "Diamond", type: "neutral", category: "continuation",
    romanUrdu: "Pehle ranges phailti hain phir sikudti hain — volatility ka whirlpool.", pointsNeeded: "5 pivots: expanding then contracting range",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5) return null; const s0 = rng(ps.slice(0, 3)); const s1 = rng(ps.slice(1, 4)); const s2 = rng(ps.slice(2, 5)); return s1 > s0 && s1 > s2 ? hit("Diamond", "neutral", "continuation", x, 70, "Expand-then-contract volatility — breakout direction decides.") : null },
  },
  // ── Harmonic (3, basic XABCD ratio checks) ──
  {
    name: "Gartley", type: "bullish", category: "harmonic",
    romanUrdu: "XA upar, B ne 618 par wapas liya, D ne 786 tak retracement kiya — classic buy.", pointsNeeded: "5 pivots X-A-B-C-D (start at low X)",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[0].kind !== "low" || ps[1].kind !== "high") return null; const XA = ps[1].price - ps[0].price; const BC = ps[3].price - ps[2].price; if (XA <= 0 || BC <= 0) return null; const ab = (ps[1].price - ps[2].price) / XA; const dxa = (ps[1].price - ps[4].price) / XA; const cd = (ps[3].price - ps[4].price) / BC; return ab >= 0.5 && ab <= 0.8 && dxa >= 0.72 && dxa <= 0.86 && cd >= 1.1 && cd <= 1.7 ? hit("Gartley", "bullish", "harmonic", x, 80, "B at 0.618 XA, D at 0.786 XA — classic bullish Gartley.") : null },
  },
  {
    name: "Butterfly", type: "bullish", category: "harmonic",
    romanUrdu: "XA upar, B gehra 786 par, D X ke neeche jaake extension banata hai.", pointsNeeded: "5 pivots X-A-B-C-D (start at low X, D below X)",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[0].kind !== "low" || ps[1].kind !== "high") return null; const XA = ps[1].price - ps[0].price; if (XA <= 0) return null; const ab = (ps[1].price - ps[2].price) / XA; return ab >= 0.7 && ab <= 0.86 && ps[4].price < ps[0].price ? hit("Butterfly", "bullish", "harmonic", x, 78, "Deep B retrace with D extending below X — reversal projection.") : null },
  },
  {
    name: "Bat", type: "bullish", category: "harmonic",
    romanUrdu: "XA upar, B halka 382-500 par rukta hai, D 886 tak aata hai — precise buy.", pointsNeeded: "5 pivots X-A-B-C-D (start at low X)",
    detect: (x) => { const ps = tail(x, 5); if (ps.length < 5 || ps[0].kind !== "low" || ps[1].kind !== "high") return null; const XA = ps[1].price - ps[0].price; if (XA <= 0) return null; const ab = (ps[1].price - ps[2].price) / XA; const dxa = (ps[1].price - ps[4].price) / XA; return ab >= 0.3 && ab <= 0.52 && dxa >= 0.8 && dxa <= 0.96 ? hit("Bat", "bullish", "harmonic", x, 78, "Shallow B retrace, D at 0.886 XA — deep buy zone.") : null },
  },
];

/**
 * Runs every def over the ZigZag pivots of the recent window and returns each
 * completed pattern as { pattern, type, category, time, price, confidence }.
 */
export function scanChartPatterns(candles: Candle[], lookback = 150): ChartPatternHit[] {
  const recent = candles.slice(-lookback);
  if (recent.length < 40) return [];
  const pivots = zigZag(recent, 3);
  const hits: ChartPatternHit[] = [];
  for (let i = 4; i < pivots.length; i += 1) {
    const x: DetectCtx = { pivots, i };
    for (const def of chartPatternDefs) {
      const found = def.detect(x);
      if (found) hits.push(found);
    }
  }
  return hits;
}