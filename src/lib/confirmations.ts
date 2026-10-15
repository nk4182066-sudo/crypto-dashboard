// Confirmation engine — derives the 4 confirmation indicators (RSI, MACD, EMA,
// Volume) and the 4-educator expert panel from REAL candle/indicator data.
// Shared by the Trade (AI Analysis) box and the Signals page. Educational only.

import type { Candle } from "@/src/analysis/types";
import { ema, macd, rsi } from "@/src/analysis/indicators";

/** Signal direction an indicator/educator expresses. */
export type SignalSide = "bullish" | "bearish" | "neutral";

/** One confirmation indicator row. */
export interface ConfirmationIndicator {
  name: string;
  value: string;
  signalText: string;
  side: SignalSide;
  /** "confirm" ✅, "weak" ⚠️, "against" ❌. */
  icon: "confirm" | "weak" | "against";
  /** True when this indicator confirms the setup direction. */
  confirms: boolean;
}

/** Verdict of one AI educator. */
export interface EducatorVerdict {
  role: string;
  emoji: string;
  verdict: string;
  side: SignalSide;
  /** True when this educator agrees with the setup direction. */
  confirms: boolean;
}

/** Consensus rollup of the expert panel. */
export interface Consensus {
  agreed: number;
  total: number;
  label: "STRONG" | "MODERATE" | "WEAK" | "AVOID";
  color: "green" | "lightgreen" | "yellow" | "red";
  /** A signal may only be delivered when agreed >= 3. */
  deliver: boolean;
}

/** Last finite reading of an indicator series, or null. */
function lastValue(series: (number | null)[]): number | null {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index];
    if (value !== null && Number.isFinite(value)) return value;
  }
  return null;
}

/** Round to a sensible precision for display. */
function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface ConfirmationInput {
  candles: Candle[];
  price: number;
  direction: SignalSide;
  support: number;
  resistance: number;
  /** Highest-confidence chart pattern name, if any. */
  pattern?: string | null;
  /** Whether a breakout beyond support/resistance has happened. */
  breakout?: boolean;
  score?: number;
}

export interface ConfirmationReport {
  indicators: ConfirmationIndicator[];
  confirmed: number;
  total: number;
  educators: EducatorVerdict[];
  consensus: Consensus;
  /** Raw numbers, handy for guidance copy. */
  raw: {
    rsi: number | null;
    macdLine: number;
    macdSignal: number;
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    volumeRatio: number;
  };
}

/**
 * Builds the 4 confirmation indicators from real candles. Each indicator is
 * judged against the setup `direction` (a bullish setup confirms on bullish
 * reads, a bearish setup on bearish reads). Educational only.
 */
export function buildConfirmations(input: ConfirmationInput): ConfirmationReport {
  const { candles, price, direction } = input;
  const closes = candles.map((c) => c.close);

  // ── A) RSI (14) ────────────────────────────────────────────────────────
  const rsiValue = closes.length > 15 ? lastValue(rsi(closes, 14)) : null;
  let rsiInd: ConfirmationIndicator;
  if (rsiValue === null) {
    rsiInd = { name: "RSI (14)", value: "—", signalText: "No data", side: "neutral", icon: "weak", confirms: false };
  } else if (rsiValue < 30) {
    const side: SignalSide = "bullish";
    rsiInd = { name: "RSI (14)", value: round(rsiValue, 1).toString(), signalText: "Oversold", side, icon: "confirm", confirms: side === direction || direction === "neutral" };
  } else if (rsiValue > 70) {
    const side: SignalSide = "bearish";
    rsiInd = { name: "RSI (14)", value: round(rsiValue, 1).toString(), signalText: "Overbought", side, icon: "against", confirms: side === direction || direction === "neutral" };
  } else {
    rsiInd = { name: "RSI (14)", value: round(rsiValue, 1).toString(), signalText: "Neutral", side: "neutral", icon: "weak", confirms: false };
  }

  // ── B) MACD (12, 26, 9) ────────────────────────────────────────────────
  const macdValue = closes.length > 26 ? macd(closes) : null;
  let macdInd: ConfirmationIndicator;
  if (!macdValue) {
    macdInd = { name: "MACD", value: "—", signalText: "No data", side: "neutral", icon: "weak", confirms: false };
  } else {
    const crossover = macdValue.line > macdValue.signal;
    const side: SignalSide = crossover ? "bullish" : "bearish";
    macdInd = {
      name: "MACD",
      value: round(macdValue.line, 3).toString(),
      signalText: `${crossover ? "Bullish" : "Bearish"} Crossover (expanding)`,
      side,
      icon: side === direction || direction === "neutral" ? "confirm" : "against",
      confirms: side === direction || direction === "neutral",
    };
  }

  // ── C) EMA (20 / 50 / 200) ─────────────────────────────────────────────
  const ema20 = closes.length >= 20 ? lastValue(ema(closes, 20)) : null;
  const ema50 = closes.length >= 50 ? lastValue(ema(closes, 50)) : null;
  const ema200 = closes.length >= 200 ? lastValue(ema(closes, 200)) : null;
  let emaInd: ConfirmationIndicator;
  if (ema20 === null || ema50 === null) {
    emaInd = { name: "EMA (20/50/200)", value: "—", signalText: "No data", side: "neutral", icon: "weak", confirms: false };
  } else {
    const bullAligned = price > ema20 && ema20 > ema50 && (ema200 === null || ema50 > ema200);
    const bearAligned = price < ema20 && ema20 < ema50 && (ema200 === null || ema50 < ema200);
    const side: SignalSide = bullAligned ? "bullish" : bearAligned ? "bearish" : "neutral";
    emaInd = {
      name: "EMA (20/50/200)",
      value: `${round(ema20, 2)} / ${round(ema50, 2)}${ema200 ? ` / ${round(ema200, 2)}` : ""}`,
      signalText: side === "bullish" ? "Aligned Bullish" : side === "bearish" ? "Aligned Bearish" : "Mixed",
      side,
      icon: side === "neutral" ? "weak" : side === direction || direction === "neutral" ? "confirm" : "against",
      confirms: side !== "neutral" && (side === direction || direction === "neutral"),
    };
  }

  // ── D) Volume (vs 20-period average) ───────────────────────────────────
  const volWindow = candles.slice(-20);
  const avgVolume = volWindow.length > 0 ? volWindow.reduce((s, c) => s + (c.volume ?? 0), 0) / volWindow.length : 0;
  const latestVolume = candles.length > 0 ? candles[candles.length - 1]?.volume ?? 0 : 0;
  const volumeRatio = avgVolume > 0 ? latestVolume / avgVolume : 0;
  const volumeConfirms = volumeRatio >= 1.5;
  const volumeInd: ConfirmationIndicator = {
    name: "Volume",
    value: avgVolume > 0 ? `${Math.round(volumeRatio * 100)}% of avg` : "—",
    signalText: volumeRatio > 1.5 ? "Above Average" : volumeRatio >= 0.8 ? "Normal" : "Below Average",
    side: volumeConfirms ? direction === "bearish" ? "bearish" : "bullish" : "neutral",
    icon: volumeRatio > 1.5 ? "confirm" : volumeRatio >= 0.8 ? "weak" : "against",
    confirms: volumeConfirms,
  };

  const indicators = [rsiInd, macdInd, emaInd, volumeInd];
  const confirmed = indicators.filter((i) => i.confirms).length;

  return {
    indicators,
    confirmed,
    total: indicators.length,
    educators: [],
    consensus: consensusOf([]),
    raw: {
      rsi: rsiValue === null ? null : round(rsiValue, 1),
      macdLine: macdValue ? round(macdValue.line, 3) : 0,
      macdSignal: macdValue ? round(macdValue.signal, 3) : 0,
      ema20: ema20 === null ? null : round(ema20, 2),
      ema50: ema50 === null ? null : round(ema50, 2),
      ema200: ema200 === null ? null : round(ema200, 2),
      volumeRatio: round(volumeRatio, 2),
    },
  };
}

/** Roll up the 4 educators into a consensus label + delivery decision. */
export function consensusOf(educators: EducatorVerdict[]): Consensus {
  const total = educators.length;
  const agreed = educators.filter((e) => e.confirms).length;
  let label: Consensus["label"];
  let color: Consensus["color"];
  if (agreed >= 4) { label = "STRONG"; color = "green"; }
  else if (agreed === 3) { label = "MODERATE"; color = "lightgreen"; }
  else if (agreed === 2) { label = "WEAK"; color = "yellow"; }
  else { label = "AVOID"; color = "red"; }
  return { agreed, total, label, color, deliver: agreed >= 3 };
}

/**
 * Four AI educators, each with its own lens over the same real data:
 *  - 📈 Technical Analyst  → RSI + MACD agreement
 *  - 🛡️ Risk Manager       → distance to support / room to resistance
 *  - 🕯️ Pattern Guru       → candlestick / chart pattern quality
 *  - 📊 Trend Trader       → EMA stack + score
 * Feature 3 (expert panel). Educational only.
 */
export function buildEducators(report: ConfirmationReport, input: ConfirmationInput): {
  educators: EducatorVerdict[];
  consensus: Consensus;
} {
  const { direction, price, support, resistance, pattern, score = 0 } = input;
  const { raw } = report;
  const isBear = direction === "bearish";
  const agrees = (side: SignalSide): boolean =>
    side === "neutral" ? false : side === direction || direction === "neutral";

  // 📈 Technical Analyst — RSI side + MACD crossover side.
  const macdSide: SignalSide = raw.macdLine > raw.macdSignal ? "bullish" : "bearish";
  const rsiSide: SignalSide =
    raw.rsi === null ? "neutral" : raw.rsi >= 55 ? "bullish" : raw.rsi <= 45 ? "bearish" : "neutral";
  const techBull = (rsiSide === "bullish" ? 1 : 0) + (macdSide === "bullish" ? 1 : 0);
  const techSide: SignalSide = techBull === 2 ? "bullish" : techBull === 0 ? "bearish" : "neutral";
  const tech: EducatorVerdict = {
    role: "Technical Analyst",
    emoji: "📈",
    side: techSide,
    verdict:
      techSide === "neutral"
        ? `Mixed — RSI ${raw.rsi ?? "—"}, MACD ${macdSide}`
        : `${techSide === "bullish" ? "Bullish" : "Bearish"} — RSI ${raw.rsi ?? "—"}, MACD ${macdSide}`,
    confirms: agrees(techSide),
  };

  // 🛡️ Risk Manager — reward vs risk from current price to resistance/support.
  const roomUp = resistance > price ? ((resistance - price) / price) * 100 : 0;
  const roomDown = price > support ? ((price - support) / price) * 100 : 0;
  const rr = roomDown > 0 ? roomUp / roomDown : 0;
  const riskSide: SignalSide = rr >= 1.5 ? (isBear ? "bearish" : "bullish") : rr <= 0.67 ? (isBear ? "bullish" : "bearish") : "neutral";
  const risk: EducatorVerdict = {
    role: "Risk Manager",
    emoji: "🛡️",
    side: riskSide,
    verdict: `R:R ${rr.toFixed(2)} — room ${roomUp.toFixed(1)}% up / ${roomDown.toFixed(1)}% down`,
    confirms: agrees(riskSide),
  };

  // 🕯️ Pattern Guru — a detected pattern in the setup direction.
  const patternSide: SignalSide = !pattern
    ? "neutral"
    : /\b(bearish|double top|head and shoulders|shooting star|engulfing down)\b/i.test(pattern)
      ? "bearish"
      : /\b(bullish|double bottom|morning star|hammer|engulfing up)\b/i.test(pattern)
        ? "bullish"
        : direction; // direction-neutral patterns inherit the setup bias
  const patternGuru: EducatorVerdict = {
    role: "Pattern Guru",
    emoji: "🕯️",
    side: patternSide,
    verdict: pattern ? `${pattern} pattern detected` : "No clear pattern — flat",
    confirms: agrees(patternSide),
  };

  // 📊 Trend Trader — EMA alignment + overall score.
  const emaBull = raw.ema20 !== null && raw.ema50 !== null && price > raw.ema20 && raw.ema20 > raw.ema50;
  const emaBear = raw.ema20 !== null && raw.ema50 !== null && price < raw.ema20 && raw.ema20 < raw.ema50;
  const trendSide: SignalSide = emaBull ? "bullish" : emaBear ? "bearish" : "neutral";
  const trend: EducatorVerdict = {
    role: "Trend Trader",
    emoji: "📊",
    side: trendSide,
    verdict: `${trendSide === "neutral" ? "Mixed EMA stack" : `${trendSide === "bullish" ? "Above" : "Below"} EMA20/50`} · score ${score}`,
    confirms: agrees(trendSide),
  };

  const educators = [tech, risk, patternGuru, trend];
  // Engine-consensus cap — the panel can never claim more expert agreement than
  // the shared 8-condition score supports (fixes the Trade page showing
  // "0/100 · 4/4 Consensus STRONG" together). 75+ (= the 6/8 emission floor)
  // still allows a full 4/4; lower scores demote the weakest confirms (Trend
  // Trader first — its verdict already quotes the score) so the header badge,
  // the individual ticks and the score always tell ONE story.
  const cap = score >= 75 ? 4 : score >= 62 ? 3 : score >= 50 ? 2 : score >= 37 ? 1 : 0;
  let excess = educators.filter((entry) => entry.confirms).length - cap;
  for (const entry of [trend, patternGuru, risk, tech]) {
    if (excess <= 0) break;
    if (entry.confirms) {
      entry.confirms = false;
      excess -= 1;
    }
  }
  return { educators, consensus: consensusOf(educators) };
}

/** One expandable expert-guidance quote (Feature 4). */
export interface GuidanceQuote {
  id: string;
  title: string;
  emoji: string;
  urdu: string;
  english: string;
}

/** Minimal inputs the guidance copy needs (no candles — reusable on Signals). */
export interface GuidanceInput {
  direction: SignalSide;
  price: number;
  support: number;
  resistance: number;
  pattern?: string | null;
  breakout?: boolean;
  score?: number;
}

/** What buildGuidance reads from the confirmation report. */
export interface GuidanceSummary {
  confirmed: number;
  consensus: Consensus;
}

/**
 * Expert guidance — short, rule-based teaching quotes in Roman Urdu + English
 * chosen from the same real data. Educational only, never a buy/sell order.
 */
export function buildGuidance(summary: GuidanceSummary, input: GuidanceInput): GuidanceQuote[] {
  const { direction, score = 0, pattern, breakout } = input;
  const { confirmed, consensus } = summary;
  const quotes: GuidanceQuote[] = [];

  // 1) Consensus rule — only trade when 3/4+ experts agree.
  quotes.push({
    id: "consensus",
    title: "Expert Consensus Rule",
    emoji: "🧠",
    urdu: `Chaar experts mein se ${consensus.agreed}/4 agree kar rahe hain (${consensus.label}). Meri rule: 3/4 se kam ho to trade skip karo — ${consensus.deliver ? "abhi setup deliver karne layaq hai." : "abhi sirf watch karein."}`,
    english: `${consensus.agreed} of 4 experts agree (${consensus.label}). My rule: skip any setup below 3/4 — ${consensus.deliver ? "this setup is delivery-grade right now." : "watch only for now."}`,
  });

  // 2) Trend / direction teaching.
  quotes.push({
    id: "trend",
    title: "Trend Is Your Friend",
    emoji: "📈",
    urdu:
      direction === "bullish"
        ? "Trend upar hai, to sirf long setups dekhein — trend ke against jaana sabse mehnga sabak hota hai."
        : direction === "bearish"
          ? "Trend neeche hai, to short setups priority dein — bottom catching beginner ka sabse bara azaar hai."
          : "Market side-ways hai — yahan entry se pehle breakout ka wait karna behtar hai.",
    english:
      direction === "bullish"
        ? "The trend is up, so only long setups qualify — trading against trend is the costliest lesson."
        : direction === "bearish"
          ? "The trend is down, prioritize short setups — catching the falling knife is a beginner's trap."
          : "The market is ranging — wait for a breakout before entering anything here.",
  });

  // 3) Confirmation quality (the X/4 counter behind this panel).
  quotes.push({
    id: "confirmations",
    title: "Confirmation Stacking",
    emoji: "✅",
    urdu: `${confirmed}/4 confirmations (RSI, MACD, EMA, Volume) green hain. ${confirmed >= 3 ? "Teen ya zyada confirmations = confluence strong, size normal rakhein." : "Do ya kam = confluence kamzor hai, size chota rakhein ya wait karein."}`,
    english: `${confirmed}/4 confirmations (RSI, MACD, EMA, Volume) are green. ${confirmed >= 3 ? "Three or more = strong confluence, keep normal size." : "Two or less = weak confluence, size down or wait."}`,
  });

  // 4) Risk note — always present, ties to support/resistance.
  quotes.push({
    id: "risk",
    title: "Risk First",
    emoji: "🛡️",
    urdu: `Pehle khatra sochein, phir profit. Support $${input.support.toLocaleString("en-US")} ke neeche stop rakhein — agar woh toot jaye to setup fail hai, position chhod dein.`,
    english: `Think risk before reward. Keep the stop below support at $${input.support.toLocaleString("en-US")} — if it breaks, the setup failed, exit the position.`,
  });

  // 5) Pattern note when one exists (with breakout context).
  if (pattern) {
    quotes.push({
      id: "pattern",
      title: "Pattern Context",
      emoji: "🕯️",
      urdu: `${pattern} pattern ban raha hai${breakout ? " aur price ne level break kiya hai" : " lekin abhi breakout nahi hua"}. Pattern akela entry nahi — baqi confirmations ka wait karein.`,
      english: `${pattern} pattern is forming${breakout ? " and price has broken the level" : " but there is no breakout yet"}. A pattern alone is not an entry — wait for the other confirmations.`,
    });
  }

  // 6) Score discipline quote.
  quotes.push({
    id: "score",
    title: "Score Discipline",
    emoji: "🎯",
    urdu: `Score ${score}/100 hai. 85+ hone par hi setup strong mana jaye — ${score >= 85 ? "yeh range abhi hai, plan banayein." : "abhi 85 tak ka wait hai, jaldi na karein."}`,
    english: `Score is ${score}/100. Only 85+ counts as a strong setup — ${score >= 85 ? "we are in that range, make the plan." : "still waiting on 85, do not rush it."}`,
  });

  return quotes;
}
