/**
 * Batch 4 — bilingual (Roman Urdu / English) text for the pattern detail pages.
 *
 * The pattern defs already carry the Roman Urdu "ye kya hai" / "matlab" lines;
 * this module mirrors them in English and adds the bilingual "kya karein"
 * actions so both detail pages can render [Roman Urdu] [English] tabs with a
 * shared localStorage preference. Educational only — not financial advice.
 */
import type { PatternType } from "@/src/lib/chart/candlestickPatterns";

/** Detail-page content language. Default is Roman Urdu. */
export type PatternDetailLanguage = "urdu" | "english";

/** localStorage key shared by both pattern detail pages. */
export const PATTERN_LANGUAGE_STORAGE_KEY = "pattern-detail-language";

/** The five three-candle formations, grouped separately in the library grid. */
export const multiCandlePatternNames: ReadonlySet<string> = new Set([
  "Three Inside Up/Down",
  "Three Outside Up/Down",
  "Abandoned Baby",
  "Tri-Star",
  "Stick Sandwich",
]);

/** English mirror of each candlestick pattern's "ye kya hai" + "matlab". */
export const candlestickEnglish: Record<string, { what: string; matlab: string }> = {
  // ── Bullish (10) ──
  Hammer: {
    what: "A candle with a long lower wick and a small body near the top — selling is exhausted.",
    matlab: "Buyers took control from below; the downtrend may pause here.",
  },
  "Inverted Hammer": {
    what: "A long upper wick with a small body at the bottom — buyers tried during a downtrend.",
    matlab: "An early recovery signal; stronger if the next candle closes green.",
  },
  "Bullish Engulfing": {
    what: "The new green candle completely engulfs the previous red candle's body.",
    matlab: "Strong buyer control; the chance of a reversal from below increases.",
  },
  "Morning Star": {
    what: "A large red candle, a small middle candle, then a strong green candle — a three-candle setup.",
    matlab: "Selling has finished; a classic bottom-reversal signal.",
  },
  "Three White Soldiers": {
    what: "Three consecutive large green candles, each closing higher than the previous one.",
    matlab: "Buying pressure is consistent; the trend may move up.",
  },
  "Piercing Line": {
    what: "After a red candle, the green candle recovers more than half of the previous body.",
    matlab: "Buyers struck back from below; a short-term reversal.",
  },
  "Bullish Harami": {
    what: "A small green body fits inside the previous large red candle.",
    matlab: "Selling has stopped; momentum may shift — wait for confirmation.",
  },
  "Tweezer Bottom": {
    what: "The lows of two candles stick at almost the same price.",
    matlab: "Buyers defended one support level twice.",
  },
  "Dragonfly Doji": {
    what: "Body at the top of the range with a long lower wick — all trading happened below.",
    matlab: "Buying came from below and selling failed — a bullish reversal.",
  },
  "Bullish Marubozu": {
    what: "A full green candle with no wicks — buyers were present the whole time.",
    matlab: "Strong buying conviction; the trend may continue or freshly start.",
  },
  // ── Bearish (10) ──
  "Shooting Star": {
    what: "A long upper wick with a small body below — selling hit from the top.",
    matlab: "Buyers lost at the top; the uptrend may pause here.",
  },
  "Hanging Man": {
    what: "A hammer-like shape but formed at the top of an uptrend.",
    matlab: "Selling is starting from the top; the trend may weaken.",
  },
  "Bearish Engulfing": {
    what: "The new red candle completely engulfs the previous green candle's body.",
    matlab: "Strong seller control; the uptrend can break.",
  },
  "Evening Star": {
    what: "A large green candle, a small middle candle, then a strong red candle — a three-candle setup.",
    matlab: "Buying has ended; a classic top-reversal signal.",
  },
  "Three Black Crows": {
    what: "Three consecutive large red candles, each closing lower than the previous one.",
    matlab: "Selling pressure is consistent; the trend may fall.",
  },
  "Dark Cloud Cover": {
    what: "After a green candle, the red candle closes below the middle of the previous body.",
    matlab: "Sellers struck back from the top; a reversal is possible.",
  },
  "Bearish Harami": {
    what: "A small red body fits inside the previous large green candle.",
    matlab: "Buying has stopped; a decline may follow.",
  },
  "Tweezer Top": {
    what: "The highs of two candles stall at almost the same price.",
    matlab: "Selling appeared twice at one resistance level.",
  },
  "Gravestone Doji": {
    what: "Body at the bottom of the range with a long upper wick — everything traded at the top.",
    matlab: "Selling erased the entire gain — a bearish reversal.",
  },
  "Bearish Marubozu": {
    what: "A full red candle with no wicks — sellers in complete control.",
    matlab: "Strong selling conviction; the trend continues down.",
  },
  // ── Neutral (5) ──
  Doji: {
    what: "Open and close are almost the same — neither side won.",
    matlab: "The market is undecided; a new decision is coming.",
  },
  "Spinning Top": {
    what: "A small body with range on both sides — the market spun like a top.",
    matlab: "Indecision; the previous trend has paused.",
  },
  "Long-Legged Doji": {
    what: "A doji-like body with long wicks on both sides.",
    matlab: "Big volatility but the close came back — a major twist.",
  },
  "Four Price Doji": {
    what: "High, low, open and close all at one price.",
    matlab: "Extreme illiquidity, almost no trading — such a candle is ignored.",
  },
  "High Wave": {
    what: "A small body with long wicks on both sides — pushed both ways.",
    matlab: "A heavy tug of war; no direction is certain.",
  },
  // ── Multi-candle (5) ──
  "Three Inside Up/Down": {
    what: "After the harami, the third candle confirms the real direction.",
    matlab: "The shift is confirmed — the trend can now go up or down.",
  },
  "Three Outside Up/Down": {
    what: "After the engulfing, the third candle breaks out and confirms the move.",
    matlab: "The engulfing is proven; the move should continue.",
  },
  "Abandoned Baby": {
    what: "The middle doji is left completely alone by a gap.",
    matlab: "Extreme exhaustion; a strong fast-reversal signal.",
  },
  "Tri-Star": {
    what: "Three dojis in a row, with the middle one at the most extreme point.",
    matlab: "The trend is exhausted; a reversal is expected.",
  },
  "Stick Sandwich": {
    what: "Two red candles close at the same price with a candle between them moving up.",
    matlab: "Support sits at that same close — a bounce may form.",
  },
};

/** English mirror of each chart pattern's "ye kya hai" plus bilingual "matlab". */
export const chartPatternEnglish: Record<string, { what: string; matlabUrdu: string; matlab: string }> = {
  // ── Reversal (10) ──
  "Head & Shoulders": {
    what: "Three peaks: the middle one is the tallest, both side peaks are roughly equal.",
    matlabUrdu: "Upar ka trend rukne wala — neckline toot gayi toh downtrend shuru.",
    matlab: "The uptrend is ending — a neckline break starts a downtrend.",
  },
  "Inverse Head & Shoulders": {
    what: "Inverse H&S: three lows, the middle one is the deepest, with an even neckline above.",
    matlabUrdu: "Neeche ka trend rukne wala — neckline ke upar breakout se uptrend.",
    matlab: "The downtrend is ending — a break above the neckline starts an uptrend.",
  },
  "Double Top": {
    what: "Two equal highs with a deep trough between — resistance rejected twice.",
    matlabUrdu: "Resistance ne do baar sell-off diya — top ban sakta hai.",
    matlab: "Resistance sold off twice — a top may be in place.",
  },
  "Double Bottom": {
    what: "Two equal lows with a peak between.",
    matlabUrdu: "Support do baar bounce — reversal umeed hai.",
    matlab: "Support tested twice, reversal expected.",
  },
  "Triple Top": {
    what: "Three equal highs — the third rejection from resistance.",
    matlabUrdu: "Teen baar resistance reject — girawat ka izhaar.",
    matlab: "Resistance rejected three times — sellers remain in control.",
  },
  "Triple Bottom": {
    what: "Three equal lows — support bounced three times.",
    matlabUrdu: "Teen baar support bounce — neeche se buying pakki.",
    matlab: "Support bounced three times — buyers keep defending it.",
  },
  "Rounding Top": {
    what: "Price slowly arcs up and then down — a gradual top.",
    matlabUrdu: "Momentum dheere dheere neeche — distribution chal rahi.",
    matlab: "Momentum fades slowly — distribution is underway.",
  },
  "Rounding Bottom": {
    what: "Price slowly curves down and then climbs — a gradual bottom.",
    matlabUrdu: "Selling dheere dheere khatam — accumulation ho rahi.",
    matlab: "Selling fades slowly — accumulation is underway.",
  },
  "Cup & Handle": {
    what: "A round cup-shaped dish and then a small handle — a shallow pullback before the breakout.",
    matlabUrdu: "Cup poori hone ke baad handle ka pullback — breakout se pehle reset.",
    matlab: "After the cup fills, the handle is a shallow pullback — a reset before the breakout.",
  },
  "Inverse Cup & Handle": {
    what: "An inverted cup — a rounded top, then a small pullback, then a decline.",
    matlabUrdu: "Ulta cup ke baad halka pullback — phir giraawat.",
    matlab: "After the inverted cup, a weak bounce — then a decline.",
  },
  // ── Continuation (12) ──
  "Ascending Triangle": {
    what: "Flat resistance above and rising lows below — the resistance will break one day.",
    matlabUrdu: "Flat resistance aur chadhti lows — buyers upar press kar rahe.",
    matlab: "Flat resistance plus higher lows — buyers keep pressing up.",
  },
  "Descending Triangle": {
    what: "Flat support below and falling highs above — the support will break one day.",
    matlabUrdu: "Flat support aur girti highs — sellers neeche daab rahe.",
    matlab: "Flat floor plus lower highs — sellers keep pressing down.",
  },
  "Symmetrical Triangle": {
    what: "Highs and lows are converging — the breakout can come from either side.",
    matlabUrdu: "Ranges sikud rahi — kisi bhi side breakout ho sakta hai.",
    matlab: "Ranges are narrowing — wait for the breakout leg.",
  },
  "Bull Flag": {
    what: "A sharp rise followed by a small downward channel — reset, then continuation.",
    matlabUrdu: "Tez chadhaai ka flag pullback — phir continuation.",
    matlab: "A flag pullback after a sharp rise — continuation follows.",
  },
  "Bear Flag": {
    what: "A sharp drop followed by a small upward channel — a weak rally, then continuation.",
    matlabUrdu: "Tez giraawat ka flag rally jhooti — phir continuation.",
    matlab: "A flag rally after a sharp drop is fake — continuation follows.",
  },
  Pennant: {
    what: "A pole followed by a small symmetrical triangle — consolidation, then another leg up.",
    matlabUrdu: "Pole ke baad chhota pennant — ruk kar phir chadhaai.",
    matlab: "A small pennant after the pole — a pause, then the next leg up.",
  },
  "Rising Wedge": {
    what: "Highs and lows are both rising but the range is narrowing — exhaustion.",
    matlabUrdu: "Chadhti ranges par thakan — aksar neeche toot-ta hai.",
    matlab: "A squeezing rising channel — often resolves to the downside.",
  },
  "Falling Wedge": {
    what: "Highs and lows are both falling but the range is narrowing — a bounce builds.",
    matlabUrdu: "Girti ranges par selling thak rahi — upar bounce ban sakta hai.",
    matlab: "A squeezing falling channel — often resolves to the upside.",
  },
  Rectangle: {
    what: "Price oscillates between flat resistance and flat support — range trading.",
    matlabUrdu: "Flat support aur resistance ke beech range — ek side tootne tak wait.",
    matlab: "Both sides flat — range until one boundary breaks.",
  },
  "Channel Up": {
    what: "Highs and lows are rising in parallel — a steady uptrend channel.",
    matlabUrdu: "Parallel chadhta channel — trend-following environment.",
    matlab: "A parallel rising channel — a trend-following environment.",
  },
  "Channel Down": {
    what: "Highs and lows are falling in parallel — a steady downtrend channel.",
    matlabUrdu: "Parallel girta channel — selling jaari.",
    matlab: "A parallel falling channel — a trend-following environment.",
  },
  Diamond: {
    what: "The range first expands and then contracts — a volatility whirlpool.",
    matlabUrdu: "Pehle ranges phailti phir sikudti — breakout direction decide karega.",
    matlab: "Expand-then-contract volatility — the breakout direction decides.",
  },
  // ── Harmonic (3) ──
  Gartley: {
    what: "XA up, B retraces to 0.618, D retraces to 0.786 — a classic buy.",
    matlabUrdu: "B 618 par wapas, D 786 par — classic bullish setup.",
    matlab: "B at 0.618 XA, D at 0.786 XA — a classic bullish Gartley.",
  },
  Butterfly: {
    what: "XA up, B at a deep 0.786, D extends below X — a reversal projection.",
    matlabUrdu: "D point X ke neeche jaake extension banata — reversal ka projection.",
    matlab: "Deep B retrace with D extending below X — a reversal projection.",
  },
  Bat: {
    what: "XA up, B pauses at 0.382–0.500, D reaches 0.886 — a precise buy.",
    matlabUrdu: "B 382-500 par rukta, D 886 tak — deep buy zone.",
    matlab: "Shallow B retrace, D at 0.886 XA — a deep buy zone.",
  },
};

/** Bilingual "kya karein" for candlestick detail pages. */
export function candlestickActionText(type: PatternType, lang: PatternDetailLanguage): string {
  if (type === "bullish") {
    return lang === "urdu"
      ? "Ek confirm green candle (higher close) ka wait karein, phir chhota risk ke saath soch samajh ke plan banayein. Stop-loss neeche rakhein. Educational only."
      : "Wait for a confirming green candle (a higher close), then plan carefully with small risk. Keep the stop-loss below. Educational only.";
  }
  if (type === "bearish") {
    return lang === "urdu"
      ? "Ek confirm red candle (lower close) ka wait karein. Upar ke levels par selling pressure badh sakta hai — risk manage karein. Educational only."
      : "Wait for a confirming red candle (a lower close). Selling pressure may increase at higher levels — manage risk. Educational only.";
  }
  return lang === "urdu"
    ? "Market confused hai. Direction pakki hone tak wait karein, abhi entry se bachein. Educational only."
    : "The market is confused. Wait for a clear direction; avoid entries for now. Educational only.";
}

/** Bilingual "kya karein" for chart pattern detail pages. */
export function chartPatternActionText(type: PatternType, lang: PatternDetailLanguage): string {
  if (type === "bullish") {
    return lang === "urdu"
      ? "Breakout ya neckline ke upar close hone ka confirmation dekhein, phir soch samajh ke plan banayein. Stop-loss support ke neeche rakhein. Educational only."
      : "Wait for a breakout or a close above the neckline as confirmation, then plan carefully. Keep the stop-loss below support. Educational only.";
  }
  if (type === "bearish") {
    return lang === "urdu"
      ? "Breakdown ya neckline ke neeche close hone ka confirmation dekhein. Risk manage karein, bara position na lein. Educational only."
      : "Wait for a breakdown or a close below the neckline as confirmation. Manage risk; do not take a large position. Educational only.";
  }
  return lang === "urdu"
    ? "Direction clear hone tak wait karein. Bina confirmation ke entry na lein. Educational only."
    : "Wait for a clear direction. Do not enter without confirmation. Educational only.";
}


