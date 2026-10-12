/**
 * Phase 6 — candlestick pattern catalogue for the PatternLibrary UI.
 *
 * 30 shapes (bullish / bearish / neutral / three-candle), each with a Roman
 * Urdu explainer plus a detector over the app's standard OHLC bars. Single-bar
 * geometry is reused from ./candlestickDetector so the marker layer and this
 * catalogue never disagree on what counts as a Hammer. Dual-direction patterns
 * override `type` per hit. Educational analysis only — not financial advice.
 */
import {
  isBearishEngulfing,
  isBullishEngulfing,
  isDoji,
  isEveningStar,
  isHammer,
  isMorningStar,
  isShootingStar,
  isThreeBlackCrows,
  isThreeWhiteSoldiers,
  type DetectorCandle,
} from "@/src/lib/chart/candlestickDetector";

export type PatternType = "bullish" | "bearish" | "neutral";

/** One detection, shaped for chart markers and the library list. */
export interface CandlestickPatternHit {
  pattern: string;
  type: PatternType;
  time: number;
  price: number;
  /** 0–100; higher = geometry plus context matched more strongly. */
  confidence: number;
}

/** Context handed to every detector: k/p/q are the current, previous and third-back bars. */
interface DetectCtx {
  c: DetectorCandle[];
  i: number;
  k: DetectorCandle;
  p: DetectorCandle;
  q: DetectorCandle;
}

type DetectResult = number | { type: PatternType; confidence: number } | null;

export interface CandlestickPatternDef {
  name: string;
  type: PatternType;
  /** One line: "ye kya hai". */
  romanUrdu: string;
  /** One line: "matlab kya hai". */
  matlab: string;
  /** Returns confidence, a type override for dual-direction patterns, or null. */
  detect: (x: DetectCtx) => DetectResult;
}

const body = (k: DetectorCandle) => Math.abs(k.close - k.open);
const span = (k: DetectorCandle) => k.high - k.low;
const upW = (k: DetectorCandle) => k.high - Math.max(k.open, k.close);
const loW = (k: DetectorCandle) => Math.min(k.open, k.close) - k.low;
const isGreen = (k: DetectorCandle) => k.close > k.open;
const isRed = (k: DetectorCandle) => k.close < k.open;
const midOf = (k: DetectorCandle) => (k.open + k.close) / 2;
const tiny = (k: DetectorCandle) => span(k) > 0 && body(k) <= span(k) * 0.1;
/** Two prices count as "equal" within 0.15% — tweezer and sandwich matching. */
const eq = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1e-12) * 0.0015;
/** Context: net close move over the three bars before the completion bar. */
const fell = (x: DetectCtx) => x.i >= 3 && x.c[x.i - 1].close < x.c[x.i - 3].close;
const rose = (x: DetectCtx) => x.i >= 3 && x.c[x.i - 1].close > x.c[x.i - 3].close;

/** All 30 patterns with their Roman Urdu explainers and detectors. */
export const candlestickPatternDefs: CandlestickPatternDef[] = [
  // ── Bullish (10) ──
  {
    name: "Hammer", type: "bullish",
    romanUrdu: "Neeche lambi range upar choti body wali candle — selling thak chuki hai.",
    matlab: "Buyers ne neeche se control liya, downtrend yahan ruk sakta hai.",
    detect: (x) => (isHammer(x.k) && fell(x) ? 85 : null),
  },
  {
    name: "Inverted Hammer", type: "bullish",
    romanUrdu: "Upar lambi range neeche choti body — downtrend mein buyers ne try kiya.",
    matlab: "Recovery ka early signal hai, agla green candle confirm kare to theek.",
    detect: (x) => (isShootingStar(x.k) && fell(x) ? 78 : null),
  },
  {
    name: "Bullish Engulfing", type: "bullish",
    romanUrdu: "Pichli red candle ki body nayi green candle ne poori nigal li.",
    matlab: "Buyers ka strong control, neeche se reversal ka chance barhta hai.",
    detect: (x) => (isBullishEngulfing(x.p, x.k) && fell(x) ? 88 : null),
  },
  {
    name: "Morning Star", type: "bullish",
    romanUrdu: "Badi red, phir choti beech wali, phir strong green — teen candle ka setup.",
    matlab: "Selling khatam ho gayi, bottom reversal ka classic signal hai.",
    detect: (x) => (isMorningStar(x.q, x.p, x.k) && fell(x) ? 90 : null),
  },
  {
    name: "Three White Soldiers", type: "bullish",
    romanUrdu: "Teen lagatar badi green candles, har ek pichli se upar close hui.",
    matlab: "Buying pressure consistent hai, trend upar ja sakta hai.",
    detect: (x) => (isThreeWhiteSoldiers(x.q, x.p, x.k) ? 85 : null),
  },
  {
    name: "Piercing Line", type: "bullish",
    romanUrdu: "Red ke baad green ne aadhi pichli body tak wapas kaat liya.",
    matlab: "Buyers ne neeche se wapas strike kiya, short-term reversal hai.",
    detect: (x) => (isRed(x.p) && isGreen(x.k) && x.k.open < midOf(x.p) && x.k.close > midOf(x.p) && x.k.close < x.p.open ? 82 : null),
  },
  {
    name: "Bullish Harami", type: "bullish",
    romanUrdu: "Badi red candle ke andar choti green body semait kar aa gayi.",
    matlab: "Selling ruki, momentum shift ho sakta hai — confirm ka wait karo.",
    detect: (x) => (isRed(x.p) && body(x.k) <= body(x.p) * 0.6 && Math.min(x.k.open, x.k.close) >= x.p.close && Math.max(x.k.open, x.k.close) <= x.p.open && fell(x) ? 76 : null),
  },
  {
    name: "Tweezer Bottom", type: "bullish",
    romanUrdu: "Do candles ka low lagbhag ek hi price par chipak gaya.",
    matlab: "Neeche ek support par buyers ne do baar price sambhali.",
    detect: (x) => (eq(x.k.low, x.p.low) && isRed(x.p) && fell(x) ? 72 : null),
  },
  {
    name: "Dragonfly Doji", type: "bullish",
    romanUrdu: "Body upar ke sire par, lambi neeche range — saara trading neeche hua.",
    matlab: "Neeche se buying aayi, selling fail — bullish reversal hai.",
    detect: (x) => (span(x.k) > 0 && body(x.k) <= span(x.k) * 0.05 && loW(x.k) >= span(x.k) * 0.7 && upW(x.k) <= span(x.k) * 0.12 && fell(x) ? 72 : null),
  },
  {
    name: "Bullish Marubozu", type: "bullish",
    romanUrdu: "Puri green candle bina ranges ke — buyers poore time mein rahe.",
    matlab: "Strong buying conviction, trend ya to continue ya naya start.",
    detect: (x) => (isGreen(x.k) && span(x.k) > 0 && body(x.k) >= span(x.k) * 0.9 ? 78 : null),
  },
  // ── Bearish (10) ──
  {
    name: "Shooting Star", type: "bearish",
    romanUrdu: "Upar lambi range neeche choti body — upar se selling ne maar di.",
    matlab: "Buyers upar haar gaye, uptrend yahan ruk sakta hai.",
    detect: (x) => (isShootingStar(x.k) && rose(x) ? 85 : null),
  },
  {
    name: "Hanging Man", type: "bearish",
    romanUrdu: "Hammer jaisi shape lekin uptrend ke top par bani.",
    matlab: "Upar se selling shuru ho rahi, trend weak ho sakta hai.",
    detect: (x) => (isHammer(x.k) && rose(x) ? 78 : null),
  },
  {
    name: "Bearish Engulfing", type: "bearish",
    romanUrdu: "Pichli green candle ki body nayi red candle ne poori nigal li.",
    matlab: "Sellers ka strong control, uptrend toot sakta hai.",
    detect: (x) => (isBearishEngulfing(x.p, x.k) && rose(x) ? 88 : null),
  },
  {
    name: "Evening Star", type: "bearish",
    romanUrdu: "Badi green, phir choti beech wali, phir strong red — teen candle ka setup.",
    matlab: "Buying khatam, top reversal ka classic signal hai.",
    detect: (x) => (isEveningStar(x.q, x.p, x.k) && rose(x) ? 90 : null),
  },
  {
    name: "Three Black Crows", type: "bearish",
    romanUrdu: "Teen lagatar badi red candles, har ek pichli se neeche close hui.",
    matlab: "Selling pressure consistent hai, trend neeche ja sakta hai.",
    detect: (x) => (isThreeBlackCrows(x.q, x.p, x.k) ? 85 : null),
  },
  {
    name: "Dark Cloud Cover", type: "bearish",
    romanUrdu: "Green ke baad red ne aadhi pichli body ke neeche aake close kiya.",
    matlab: "Upar se sellers ne wapas waar kiya, reversal ka chance hai.",
    detect: (x) => (isGreen(x.p) && isRed(x.k) && x.k.open > midOf(x.p) && x.k.close < midOf(x.p) && x.k.close > x.p.open ? 82 : null),
  },
  {
    name: "Bearish Harami", type: "bearish",
    romanUrdu: "Badi green candle ke andar choti red body semait kar aa gayi.",
    matlab: "Buying ruki, ab girawat aa sakti hai.",
    detect: (x) => (isGreen(x.p) && body(x.k) <= body(x.p) * 0.6 && Math.min(x.k.open, x.k.close) >= x.p.open && Math.max(x.k.open, x.k.close) <= x.p.close && rose(x) ? 76 : null),
  },
  {
    name: "Tweezer Top", type: "bearish",
    romanUrdu: "Do candles ka high lagbhag ek hi price par atak gaya.",
    matlab: "Upar ek resistance par selling do baar mili.",
    detect: (x) => (eq(x.k.high, x.p.high) && isGreen(x.p) && rose(x) ? 72 : null),
  },
  {
    name: "Gravestone Doji", type: "bearish",
    romanUrdu: "Body neeche ke sire par, lambi upar range — sabse upar trade hua tha.",
    matlab: "Upar se selling ne poora gain mita diya — bearish reversal hai.",
    detect: (x) => (span(x.k) > 0 && body(x.k) <= span(x.k) * 0.05 && upW(x.k) >= span(x.k) * 0.7 && loW(x.k) <= span(x.k) * 0.12 && rose(x) ? 72 : null),
  },
  {
    name: "Bearish Marubozu", type: "bearish",
    romanUrdu: "Puri red candle bina ranges ke — sellers poore control mein.",
    matlab: "Strong selling conviction, trend neeche continue.",
    detect: (x) => (isRed(x.k) && span(x.k) > 0 && body(x.k) >= span(x.k) * 0.9 ? 78 : null),
  },
  // ── Neutral (5) ──
  {
    name: "Doji", type: "neutral",
    romanUrdu: "Open aur close lagbhag same — na buyers jeete na sellers.",
    matlab: "Market confused hai, naya decision hone wala hai.",
    detect: (x) => (isDoji(x.k) ? 60 : null),
  },
  {
    name: "Spinning Top", type: "neutral",
    romanUrdu: "Choti body aur dono taraf range — chhudi si ghumi market.",
    matlab: "Indecision hai, pura trend ruk chuka hai.",
    detect: (x) => (span(x.k) > 0 && body(x.k) >= span(x.k) * 0.1 && body(x.k) <= span(x.k) * 0.35 && upW(x.k) >= body(x.k) && loW(x.k) >= body(x.k) ? 60 : null),
  },
  {
    name: "Long-Legged Doji", type: "neutral",
    romanUrdu: "Doji jaisi body par dono taraf lambi ranges khinchi hui.",
    matlab: "Bhari volatility thi par closing wapas aayi — bada twist.",
    detect: (x) => (span(x.k) > 0 && body(x.k) <= span(x.k) * 0.05 && upW(x.k) >= span(x.k) * 0.3 && loW(x.k) >= span(x.k) * 0.3 ? 65 : null),
  },
  {
    name: "Four Price Doji", type: "neutral",
    romanUrdu: "High, low, open, close — sab ek hi price par band.",
    matlab: "Extreme illiquidity, trading hi nahi hui — aisi candle ignore.",
    detect: (x) => (span(x.k) === 0 ? 55 : null),
  },
  {
    name: "High Wave", type: "neutral",
    romanUrdu: "Choti body aur dono taraf lambi ranges — dono taraf dhakka.",
    matlab: "Bahut tug of war, koi direction pakki nahi.",
    detect: (x) => (span(x.k) > 0 && body(x.k) <= span(x.k) * 0.3 && upW(x.k) >= span(x.k) * 0.35 && loW(x.k) >= span(x.k) * 0.35 ? 65 : null),
  },
  // ── Three-candle (5) — dual-direction patterns override `type` per hit ──
  {
    name: "Three Inside Up/Down", type: "neutral",
    romanUrdu: "Harami banne ke baad teesri candle ne asli direction confirm kar di.",
    matlab: "Shift confirm hua — trend ab upar ya neeche ja sakta hai.",
    detect: (x) => (isRed(x.q) && body(x.p) < body(x.q) &&
      Math.min(x.p.open, x.p.close) >= x.q.close && Math.max(x.p.open, x.p.close) <= x.q.open &&
      isGreen(x.k) && x.k.close > x.q.open ? { type: "bullish", confidence: 84 } :
      isGreen(x.q) && body(x.p) < body(x.q) &&
      Math.min(x.p.open, x.p.close) >= x.q.open && Math.max(x.p.open, x.p.close) <= x.q.close &&
      isRed(x.k) && x.k.close < x.q.open ? { type: "bearish", confidence: 84 } : null),
  },
  {
    name: "Three Outside Up/Down", type: "neutral",
    romanUrdu: "Engulfing banne ke baad teesri candle ne breakout karke confirm kiya.",
    matlab: "Engulfing saabit hui, move aage continue hoga.",
    detect: (x) => (isBullishEngulfing(x.q, x.p) && isGreen(x.k) && x.k.close > Math.max(x.p.high, x.p.open) ?
      { type: "bullish", confidence: 84 } :
      isBearishEngulfing(x.q, x.p) && isRed(x.k) && x.k.close < Math.min(x.p.low, x.p.open) ?
      { type: "bearish", confidence: 84 } : null),
  },
  {
    name: "Abandoned Baby", type: "neutral",
    romanUrdu: "Beech wali doji gap ke saath bilkul alag chhod di gayi.",
    matlab: "Exhaustion extreme, tez reversal ka strong signal hai.",
    detect: (x) => (isRed(x.q) && tiny(x.p) && x.p.high < x.q.low && isGreen(x.k) && x.k.low > x.p.high ?
      { type: "bullish", confidence: 92 } :
      isGreen(x.q) && tiny(x.p) && x.p.low > x.q.high && isRed(x.k) && x.k.high < x.p.low ?
      { type: "bearish", confidence: 92 } : null),
  },
  {
    name: "Tri-Star", type: "neutral",
    romanUrdu: "Teen dojis lagatar, beech wali sabse extreme par bani.",
    matlab: "Trend thak chuka hai, reversal ka intezaar hai.",
    detect: (x) => (isDoji(x.q) && isDoji(x.p) && isDoji(x.k) && x.p.low < x.q.low && x.k.low > x.p.low ?
      { type: "bullish", confidence: 80 } :
      isDoji(x.q) && isDoji(x.p) && isDoji(x.k) && x.p.high > x.q.high && x.k.high < x.p.high ?
      { type: "bearish", confidence: 80 } : null),
  },
  {
    name: "Stick Sandwich", type: "bullish",
    romanUrdu: "Do red candles ek hi price par band, beech wali upar chali gayi.",
    matlab: "Ussi close par support hai — neeche se bounce ban sakta hai.",
    detect: (x) => (isRed(x.q) && isRed(x.k) && eq(x.q.close, x.k.close) && x.p.close > x.q.close && fell(x) ? 78 : null),
  },
];

/**
 * Scans the tail of the series and returns every hit as
 * { pattern, type, time, price, confidence }, ordered by time.
 */
export function scanCandlestickPatterns(candles: DetectorCandle[], lookback = 120): CandlestickPatternHit[] {
  const hits: CandlestickPatternHit[] = [];
  const start = Math.max(2, candles.length - lookback);
  for (let i = start; i < candles.length; i += 1) {
    const k = candles[i];
    const p = candles[i - 1];
    const q = candles[i - 2];
    if (![k.time, k.open, k.high, k.low, k.close].every(Number.isFinite) || k.high < k.low) continue;
    const x: DetectCtx = { c: candles, i, k, p, q };
    for (const def of candlestickPatternDefs) {
      const raw = def.detect(x);
      if (raw === null) continue;
      const type = typeof raw === "number" ? def.type : raw.type;
      const confidence = typeof raw === "number" ? raw : raw.confidence;
      const price = type === "bullish" ? k.low : type === "bearish" ? k.high : k.close;
      hits.push({ pattern: def.name, type, time: k.time, price, confidence });
    }
  }
  return hits;
}