/**
 * Phase 6 — 15 reversal signals for the PatternLibrary UI.
 *
 * Price-action, structure and indicator-based warnings, each with a Roman
 * Urdu explainer plus what it means ("matlab") when it fires. Indicator
 * series (RSI, MACD, MAs, bands, stochastic) are computed once per scan and
 * handed to every detector through the context. Educational only — not advice.
 */
import { ema, rsi as rsiFn } from "@/src/analysis/indicators";
import type { Candle } from "@/src/analysis/types";

export type SignalDirection = "bullish" | "bearish" | "neutral";

/** One signal firing, shaped for chart markers and the library list. */
export interface ReversalSignalHit {
  signal: string;
  direction: SignalDirection;
  time: number;
  price: number;
  /** 0–100; higher = stronger confirmation. */
  strength: number;
}

/** Indicator series precomputed once; detectors only read them at index i. */
interface ScanCtx {
  c: Candle[]; cl: number[]; i: number;
  rsi: (number | null)[]; macdLine: (number | null)[];
  maF: (number | null)[]; maS: (number | null)[];
  bw: number[]; stochK: number[]; stochD: number[];
}

export interface ReversalSignalDef {
  signal: string;
  /** Display bias before data — dual-direction signals are neutral. */
  type: SignalDirection;
  romanUrdu: string;
  matlab: string;
  detect: (x: ScanCtx) => ReversalSignalHit | null;
}

const h = (signal: string, direction: SignalDirection, x: ScanCtx, strength: number): ReversalSignalHit =>
  ({ signal, direction, time: x.c[x.i].time, price: x.c[x.i].close, strength });
/** Index of the highest/lowest close in [from, to]. */
const argRange = (cl: number[], from: number, to: number, max: boolean) => { let best = from; for (let j = from; j <= to; j += 1) if (max ? cl[j] > cl[best] : cl[j] < cl[best]) best = j; return best; };
/** Up to 3 most recent local-min/max pivot indices in the window before i. */
const extremes = (c: Candle[], i: number, span: number, kind: "low" | "high") => { const out: number[] = []; for (let j = Math.max(1, i - span); j < i; j += 1) { const ok = kind === "low" ? c[j].low <= c[j - 1].low && c[j].low <= c[j + 1].low : c[j].high >= c[j - 1].high && c[j].high >= c[j + 1].high; if (ok) out.push(j); } return out.slice(-3); };
/** Bollinger bandwidth (upper-lower)/middle in percent, per bar. */
const bandwidths = (cl: number[], period = 20): number[] => cl.map((_, i) => { if (i < period - 1) return NaN; const w = cl.slice(i - period + 1, i + 1); const m = w.reduce((s, v) => s + v, 0) / period; const sd = Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / period); return m === 0 ? NaN : (200 * sd) / m; });
/** Stochastic %K with %D = 3-period average of %K. */
const stochSeries = (c: Candle[], period = 14, smooth = 3) => { const k: number[] = []; const d: number[] = []; for (let i = 0; i < c.length; i += 1) { if (i < period - 1) { k.push(50); d.push(50); continue; } const w = c.slice(i - period + 1, i + 1); const hh = Math.max(...w.map((b) => b.high)); const ll = Math.min(...w.map((b) => b.low)); const v = hh === ll ? 50 : ((c[i].close - ll) / (hh - ll)) * 100; k.push(v); const from = Math.max(0, k.length - smooth); d.push(k.slice(from).reduce((s, v2) => s + v2, 0) / (k.length - from)); } return { k, d }; };
/** Williams %R over `period` bars at index i (-100..0). */
const wrAt = (c: Candle[], i: number, period = 14) => { if (i < period - 1) return -50; const w = c.slice(i - period + 1, i + 1); const hh = Math.max(...w.map((b) => b.high)); const ll = Math.min(...w.map((b) => b.low)); return hh === ll ? -50 : (-100 * (hh - c[i].close)) / (hh - ll); };

/** All 15 reversal signals with Roman Urdu explainers and detectors. */
export const reversalSignalDefs: ReversalSignalDef[] = [
  {
    signal: "Key Reversal Bar", type: "neutral",
    romanUrdu: "Naya high/low banakar close pichli candle ke ulta — top par surprise.",
    matlab: "Ek taraf ka control toot gaya, short-term trend palat sakta hai.",
    detect: (x) => { const k = x.c[x.i]; const p = x.c[x.i - 1]; const w = x.c.slice(x.i - 11, x.i); const hh = Math.max(...w.map((b) => b.high)); const ll = Math.min(...w.map((b) => b.low)); if (k.high > hh && k.close < p.close && k.close < k.open) return h("Key Reversal Bar", "bearish", x, 82); if (k.low < ll && k.close > p.close && k.close > k.open) return h("Key Reversal Bar", "bullish", x, 82); return null },
  },
  {
    signal: "Island Reversal", type: "neutral",
    romanUrdu: "Ek candle gap se bilkul alag island ban gayi — purani direction chhod di.",
    matlab: "Purani position fail, naya direction ban chuka hai.",
    detect: (x) => { const a = x.c[x.i - 2]; const b = x.c[x.i - 1]; const k = x.c[x.i]; if (b.low > a.high && k.high < b.low) return h("Island Reversal", "bearish", x, 86); if (b.high < a.low && k.low > b.high) return h("Island Reversal", "bullish", x, 86); return null },
  },
  {
    signal: "V-Reversal", type: "neutral",
    romanUrdu: "Achanak giraawat aur turant barabar tez bounce — V jaisi shape.",
    matlab: "Panic jaldi absorb hua, buyers wapas aa gaye.",
    detect: (x) => { const w = x.c.slice(x.i - 6, x.i + 1); const cl = w.map((b) => b.close); const lo = Math.min(...cl); const hi = Math.max(...cl); const base = Math.abs(cl[0]) || 1; const last = cl[cl.length - 1]; const drop = cl[0] - lo; const rise = hi - cl[0]; if (drop / base >= 0.02 && last - lo >= drop * 0.6) return h("V-Reversal", "bullish", x, 76); if (rise / base >= 0.02 && hi - last >= rise * 0.6) return h("V-Reversal", "bearish", x, 76); return null },
  },
  {
    signal: "Failed Breakout", type: "neutral",
    romanUrdu: "Range ke bahar gaye par close andar wapas — breakout jhoota nikla.",
    matlab: "Trap: bahar wale phas gaye, price ulti taraf ja sakta hai.",
    detect: (x) => { const k = x.c[x.i]; const w = x.c.slice(x.i - 20, x.i); const hh = Math.max(...w.map((b) => b.high)); const ll = Math.min(...w.map((b) => b.low)); if (k.high > hh && k.close < hh) return h("Failed Breakout", "bearish", x, 84); if (k.low < ll && k.close > ll) return h("Failed Breakout", "bullish", x, 84); return null },
  },
  {
    signal: "Exhaustion Gap", type: "neutral",
    romanUrdu: "Lambi trend ke baad gap aaya — aakhri khwahish wala gap.",
    matlab: "Trend thak gaya, gap bhara toh reversal tay.",
    detect: (x) => { const a = x.c[x.i - 10]; const p = x.c[x.i - 1]; const k = x.c[x.i]; const base = Math.abs(a.close) || 1; const move = (p.close - a.close) / base; if (k.low > p.high && move > 0.05) return h("Exhaustion Gap", "bearish", x, 80); if (k.high < p.low && move < -0.05) return h("Exhaustion Gap", "bullish", x, 80); return null },
  },
  {
    signal: "Volume Climax", type: "neutral",
    romanUrdu: "Average se 2 guna volume extreme par — sabse badi wali candle.",
    matlab: "Purana crowd bah gaya, trend badalne ka chance.",
    detect: (x) => { const k = x.c[x.i]; const w = x.c.slice(x.i - 20, x.i); const avg = w.reduce((s, b) => s + b.volume, 0) / w.length; if (avg <= 0 || k.volume <= avg * 2) return null; const hh = Math.max(...w.map((b) => b.high)); const ll = Math.min(...w.map((b) => b.low)); const mid = (k.high + k.low) / 2; if (k.high >= hh && k.close < mid) return h("Volume Climax", "bearish", x, 78); if (k.low <= ll && k.close > mid) return h("Volume Climax", "bullish", x, 78); return null },
  },
  {
    signal: "RSI Divergence", type: "neutral",
    romanUrdu: "Price naya high/low par RSI wahi purana level nahi chhoo raha.",
    matlab: "Momentum toot chuka, price ka pura move jhoota hai.",
    detect: (x) => { const h1 = argRange(x.cl, x.i - 40, x.i - 21, true); const h2 = argRange(x.cl, x.i - 20, x.i, true); const l1 = argRange(x.cl, x.i - 40, x.i - 21, false); const l2 = argRange(x.cl, x.i - 20, x.i, false); const [rh1, rh2, rl1, rl2] = [x.rsi[h1], x.rsi[h2], x.rsi[l1], x.rsi[l2]]; if (rh1 !== null && rh2 !== null && x.cl[h2] > x.cl[h1] && rh2 < rh1) return h("RSI Divergence", "bearish", x, 84); if (rl1 !== null && rl2 !== null && x.cl[l2] < x.cl[l1] && rl2 > rl1) return h("RSI Divergence", "bullish", x, 84); return null },
  },
  {
    signal: "MACD Divergence", type: "neutral",
    romanUrdu: "Price ke saath MACD ki peaks barabar nahi ja rahi.",
    matlab: "Chhupi hui kamzori — trend andar se khatam ho raha hai.",
    detect: (x) => { const h1 = argRange(x.cl, x.i - 40, x.i - 21, true); const h2 = argRange(x.cl, x.i - 20, x.i, true); const l1 = argRange(x.cl, x.i - 40, x.i - 21, false); const l2 = argRange(x.cl, x.i - 20, x.i, false); const [mh1, mh2, ml1, ml2] = [x.macdLine[h1], x.macdLine[h2], x.macdLine[l1], x.macdLine[l2]]; if (mh1 !== null && mh2 !== null && x.cl[h2] > x.cl[h1] && mh2 < mh1) return h("MACD Divergence", "bearish", x, 84); if (ml1 !== null && ml2 !== null && x.cl[l2] < x.cl[l1] && ml2 > ml1) return h("MACD Divergence", "bullish", x, 84); return null },
  },
  {
    signal: "Support Break", type: "bearish",
    romanUrdu: "Recent support ke neeche close kar diya — floor toot gaya.",
    matlab: "Sellers ab free hain, neeche ka raasta khula hai.",
    detect: (x) => { const w = x.c.slice(x.i - 15, x.i); const sup = Math.min(...w.map((b) => b.low)); return x.c[x.i].close < sup ? h("Support Break", "bearish", x, 80) : null },
  },
  {
    signal: "Resistance Break", type: "bullish",
    romanUrdu: "Recent resistance ke upar close kar diya — chat toot gayi.",
    matlab: "Buyers ab free hain, upar ka raasta khula hai.",
    detect: (x) => { const w = x.c.slice(x.i - 15, x.i); const res = Math.max(...w.map((b) => b.high)); return x.c[x.i].close > res ? h("Resistance Break", "bullish", x, 80) : null },
  },
  {
    signal: "Trend Line Break", type: "neutral",
    romanUrdu: "Chadhti trendline ke neeche close — trend ki dor toot gayi.",
    matlab: "Purana rhythm khatam, naya move shuru ho sakta hai.",
    detect: (x) => { const k = x.c[x.i]; const lows = extremes(x.c, x.i, 30, "low"); if (lows.length >= 2) { const a = lows[0]; const b = lows[lows.length - 1]; const slope = (x.c[b].low - x.c[a].low) / (b - a); if (slope > 0 && k.close < x.c[a].low + slope * (x.i - a)) return h("Trend Line Break", "bearish", x, 76); } const highs = extremes(x.c, x.i, 30, "high"); if (highs.length >= 2) { const a = highs[0]; const b = highs[highs.length - 1]; const slope = (x.c[b].high - x.c[a].high) / (b - a); if (slope < 0 && k.close > x.c[a].high + slope * (x.i - a)) return h("Trend Line Break", "bullish", x, 76); } return null },
  },
  {
    signal: "MA Cross", type: "neutral",
    romanUrdu: "Tezi wali average (10) dheeri wali average (30) ko cross kar gayi.",
    matlab: "Naya momentum nayi taraf rukh kar raha hai.",
    detect: (x) => { const f = x.maF[x.i]; const s = x.maS[x.i]; const pf = x.maF[x.i - 1]; const ps = x.maS[x.i - 1]; if (f === null || s === null || pf === null || ps === null) return null; if (pf <= ps && f > s) return h("MA Cross", "bullish", x, 80); if (pf >= ps && f < s) return h("MA Cross", "bearish", x, 80); return null },
  },
  {
    signal: "Bollinger Squeeze", type: "neutral",
    romanUrdu: "Bollinger bands bahut sikud gaye — volatility minimum par.",
    matlab: "Barood bhar gaya, jo side break wahi tez move chalega.",
    detect: (x) => { const cur = x.bw[x.i]; if (Number.isNaN(cur)) return null; const w = x.bw.slice(Math.max(0, x.i - 40), x.i + 1).filter((v) => !Number.isNaN(v)); if (w.length < 10) return null; const sorted = [...w].sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)]; if (cur >= med * 0.6) return null; return h("Bollinger Squeeze", x.c[x.i].close >= x.c[x.i].open ? "bullish" : "bearish", x, 70) },
  },
  {
    signal: "Stochastic Cross", type: "neutral",
    romanUrdu: "Stochastic %K ne %D ko extreme zone mein cross kiya.",
    matlab: "Short-term momentum palat raha hai.",
    detect: (x) => { const k = x.stochK[x.i]; const d = x.stochD[x.i]; const pk = x.stochK[x.i - 1]; const pd = x.stochD[x.i - 1]; if (pk <= pd && k > d) return h("Stochastic Cross", "bullish", x, k < 50 ? 80 : 70); if (pk >= pd && k < d) return h("Stochastic Cross", "bearish", x, k > 50 ? 80 : 70); return null },
  },
  {
    signal: "Williams %R", type: "neutral",
    romanUrdu: "Williams %R oversold/overbought zone se bahar aa raha hai.",
    matlab: "Extreme se wapas aane ka early signal mil raha hai.",
    detect: (x) => { const w = wrAt(x.c, x.i); const pw = wrAt(x.c, x.i - 1); if (pw <= -80 && w > -80) return h("Williams %R", "bullish", x, 78); if (pw >= -20 && w < -20) return h("Williams %R", "bearish", x, 78); return null },
  },
];

/**
 * Scans the recent window bar-by-bar and returns every firing signal as
 * { signal, direction, time, price, strength }, ordered by time.
 */
export function scanReversalSignals(candles: Candle[], lookback = 150): ReversalSignalHit[] {
  const c = candles.slice(-lookback);
  if (c.length < 45) return [];
  const cl = c.map((b) => b.close);
  const rsiS = rsiFn(cl, 14);
  const fast = ema(cl, 12); const slow = ema(cl, 26);
  const macdLine = cl.map((_, i) => (fast[i] !== null && slow[i] !== null ? fast[i]! - slow[i]! : null));
  const maF = ema(cl, 10); const maS = ema(cl, 30);
  const bw = bandwidths(cl); const st = stochSeries(c);
  const hits: ReversalSignalHit[] = [];
  for (let i = 40; i < c.length; i += 1) {
    const x: ScanCtx = { c, cl, i, rsi: rsiS, macdLine, maF, maS, bw, stochK: st.k, stochD: st.d };
    for (const def of reversalSignalDefs) {
      const found = def.detect(x);
      if (found) hits.push(found);
    }
  }
  return hits;
}