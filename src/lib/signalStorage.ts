/**
 * lib/signalStorage.ts ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â localStorage persistence for the /signals ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ /results pipeline.
 *
 * The Signals page calls `saveSignal()` for every setup scoring 88+ (see MIN_SCORE).
 * The Results page loads them with `getSignals()`, re-evaluates every PENDING record
 * against live price (`evaluateSignal`) and renders the full AÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢Z bilingual breakdown.
 *
 * Every record carries the complete trade plan (entries, stop loss, three targets,
 * support/resistance, trend, pattern, candlestick confirmation) plus a Roman Urdu +
 * English "why" and "lesson" narrative, so /results never has to re-derive anything.
 *
 * Legacy records written by the older `signalHistory` module are migrated in-place on
 * read, so nothing a user already tracked is lost.
 *
 * Educational analysis only ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â not financial advice.
 */

import { formatPrice } from "@/src/lib/formatPrice";

export type SignalStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";
/** Which level resolved the trade (TP1/TP2/TP3 = success, SL = failure). */
export type HitTarget = "TP1" | "TP2" | "TP3" | "SL" | null;
export type SignalDirection = "bullish" | "bearish" | "neutral";

/** localStorage key for the new store. */
export const SIGNAL_STORAGE_KEY = "signal-storage";
/** Older key written by src/lib/signalHistory.ts ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â read once for migration. */
export const LEGACY_SIGNAL_KEY = "signal-history";

/** Score floor for what the Signals/results PAGE SHOWS.
 * 75 = Tier 3 minimum allowed score (6/8 conditions + 4/4 experts).
 * Anything below 75 is REJECTED — never shown, never saved, never alerted.
 * No relaxation tier exists; a quiet market shows fewer cards instead of ghatiya fillers. */
export const MIN_SCORE = 75;
/**
 * Signals page LIST display floor. Same as MIN_SCORE (75 = the 6/8 floor) —
 * no relaxation, no fallback. If a market emits no Tier 3+ signals, the tab
 * shows the "Wait for high-quality setup" empty state instead of garbage cards.
 */
export const DISPLAY_MIN_SCORE = 75;
/** Max records kept; oldest are dropped when this is exceeded.
 *  300 ≈ a full 30-day history (route emits ≤15/market/day, 4 markets). */
export const MAX_SIGNALS = 300;
/** 30 days â€” a setup that resolves nothing in this window is EXPIRED (MASLA 5). */
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
/** Results page re-check interval (30 seconds, per spec). */
export const REFRESH_MS = 30 * 1000;

export interface StoredSignal {
  id: string;
  symbol: string;
  market: string;
  score: number;
  direction: SignalDirection;
  /** e.g. "Uptrend (Higher Highs / Higher Lows)" */
  trend: string;
  /** Chart/classical pattern name, e.g. "Double Bottom". */
  pattern: string;
  /** e.g. "Hammer (Bullish, 85%)" */
  candlestick: string;
  entry1: number;
  entry2: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  support: number;
  resistance: number;
  /** Epoch ms when the setup was recorded. */
  createdAt: number;
  status: SignalStatus;
  hitTarget: HitTarget;
  /** Price at save time / last evaluation. */
  currentPrice: number;
  /** Roman Urdu outcome narrative (regenerated on every evaluation). */
  whyUrdu: string;
  /** English outcome narrative (regenerated on every evaluation). */
  whyEnglish: string;
  /** Roman Urdu lesson. */
  lessonUrdu: string;
  /** English lesson. */
  lessonEnglish: string;
}

/** Input accepted by saveSignal() ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â exactly the trade-plan fields the Signals page has. */
export interface SignalSaveInput {
  symbol: string;
  market: string;
  score: number;
  direction: SignalDirection;
  trend: string;
  pattern: string;
  candlestick: string;
  entry1: number;
  entry2: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  support: number;
  resistance: number;
  currentPrice: number;
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Formatting helpers ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export function money(value: number): string {
  return formatPrice(value);
}

/** Candlestick cell stored like "Hammer (Bullish, 85%)" ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "Hammer". */
function candleName(candlestick: string): string {
  const trimmed = (candlestick || "").trim();
  if (!trimmed || /^neutral/i.test(trimmed)) return "No candlestick";
  const cut = trimmed.indexOf(" (");
  return cut > 0 ? trimmed.slice(0, cut) : trimmed;
}

/** "Uptrend (ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦)" ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "uptrend (ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦)". */
function lowerFirst(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function trendKind(trend: string): "up" | "down" | "side" {
  const t = (trend || "").toLowerCase();
  if (t.includes("up")) return "up";
  if (t.includes("down")) return "down";
  return "side";
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Narratives (Roman Urdu first, English second) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

/** "WHY IT SUCCEEDED / WHY IT FAILED / WHY IT IS PENDING" block. */
export function buildWhy(record: StoredSignal): { urdu: string; english: string } {
  const levels = levelClause(record);
  const kind = trendKind(record.trend);
  const trendUrdu = lowerFirst(record.trend);
  const trendEnglish = `${/^[aeiou]/i.test(lowerFirst(record.trend)) ? "an" : "a"} ${lowerFirst(record.trend)}`;
  const candleUrdu = /^neutral/i.test(record.candlestick)
    ? "Candlestick confirmation abhi nahi mili."
    : `${record.candlestick} candle ne confirmation di.`;
  const candleEnglish = /^neutral/i.test(record.candlestick)
    ? "There was no candlestick confirmation yet."
    : `The ${record.candlestick} candle confirmed the move.`;

  const headUrdu = `${record.symbol} ka trend ${trendUrdu} tha. ${record.pattern} pattern bana. ${candleUrdu} ${levels.urdu}`;
  const headEnglish = `${record.symbol} was in ${trendEnglish} market. The ${record.pattern} pattern formed. ${candleEnglish} ${levels.english}`;

  if (record.status === "SUCCESS") {
    const target = record.hitTarget && record.hitTarget !== "SL" ? record.hitTarget : "TP1";
    const value = target === "TP1" ? record.tp1 : target === "TP2" ? record.tp2 : record.tp3;
    return {
      urdu:
        `${headUrdu} Score ${record.score}/100 tha. ` +
        `Target ${target} (${money(value)}) hit ho gaya ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â current price ${money(record.currentPrice)}. Setup kaam kar gaya.`,
      english:
        `${headEnglish} Score was ${record.score}/100. ` +
        `Target ${target} (${money(value)}) was hit at a current price of ${money(record.currentPrice)}. The setup worked.`,
    };
  }

  if (record.status === "EXPIRED") {
    return {
      urdu:
        `${headUrdu} 30 din guzar gaye magar na target hit hua na stop loss - setup EXPIRED ho gaya. ` +
        `Aakhri price ${money(record.currentPrice)} tha. Time-bound setups wahin band karna chahiye.`,
      english:
        `${headEnglish} 30 days passed without the target or the stop loss being hit - the setup EXPIRED. ` +
        `The last price was ${money(record.currentPrice)}. Time-bound setups should be closed at that point.`,
    };
  }

  if (record.status === "FAILED") {
    const reasonUrdu =
      record.direction === "bearish"
        ? `Lekin market ne upar move karke resistance ${money(record.resistance)} break kar liya.`
        : kind === "side"
          ? `Lekin market ne neeche move karke support ${money(record.support)} break kar diya.`
          : `Lekin market ne plan ke against move kiya.`;
    const reasonEnglish =
      record.direction === "bearish"
        ? `But the market moved up and broke resistance at ${money(record.resistance)}.`
        : kind === "side"
          ? `But the market moved down and broke support at ${money(record.support)}.`
          : `But the market moved against the plan.`;
    return {
      urdu:
        `${headUrdu} ${reasonUrdu} Stop loss ${money(record.stopLoss)} hit ho gaya ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â current price ${money(record.currentPrice)}. ` +
        `Setup fail ho gaya (technical analysis is baar kaam nahi aayi).`,
      english:
        `${headEnglish} ${reasonEnglish} Stop loss ${money(record.stopLoss)} was hit at a current price of ${money(record.currentPrice)}. ` +
        `The setup failed (technical analysis did not work this time).`,
    };
  }

  return {
    urdu:
      `${headUrdu} Abhi na target hit hua hai na stop loss. Current price ${money(record.currentPrice)} hai ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ` +
      `setup PENDING hai aur live price par nazar rakhi ja rahi hai.`,
    english:
      `${headEnglish} Neither the target nor the stop loss has been hit yet. Current price is ${money(record.currentPrice)} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ` +
      `the setup is PENDING and the live price is being watched.`,
  };
}

/** "LESSON / SABAQ" block ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â same lesson in both languages, outcome aware. */
export function buildLesson(
  status: SignalStatus,
  pattern: string,
  candlestick: string
): { urdu: string; english: string } {
  const candle = candleName(candlestick);

  if (status === "SUCCESS") {
    return {
      urdu:
        `${pattern} + ${candle} confirmation = strong setup. Do entries (Entry 1 + Entry 2) se risk kam hoti hai. ` +
        `TP1 pe partial profit book karo, baaki ko trail karke TP2/TP3 tak le jao.`,
      english:
        `${pattern} + ${candle} confirmation = a strong setup. Two entries (Entry 1 + Entry 2) reduce risk. ` +
        `Book partial profit at TP1 and trail the rest toward TP2/TP3.`,
    };
  }

  if (status === "EXPIRED") {
    return {
      urdu:
        `Har setup ko time-bound rakhein. Agar 30 din mein na TP na SL touch ho to setup expire ho jata hai - ` +
        `ghabra kar plan nahi badalna chahiye, balke naya setup dhoondhna chahiye.`,
      english:
        `Keep every setup time-bound. If neither the TP nor the SL is touched within 30 days the setup expires - ` +
        `do not panic-change the plan; look for a fresh setup instead.`,
    };
  }

  if (status === "FAILED") {
    return {
      urdu:
        `Stop loss zaroori hai ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â wo hi capital ko bachata hai. Support/resistance break hone pe trade reverse karein. ` +
        `News events aur volume hamesha dekhein. Ek trade pe 1-2% se zyada risk na lein.`,
      english:
        `A stop loss is mandatory ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it protects capital. Reverse the trade when support/resistance breaks. ` +
        `Always watch news events and volume. Never risk more than 1-2% on a single trade.`,
    };
  }

  return {
    urdu:
      `Abhi target ya stop loss nahi hit hua. Plan mat badlein ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â sabar se live price ka intezaar karein. ` +
      `Natija aane ke baad hi asli seekh milti hai.`,
    english:
      `Neither the target nor the stop loss has been hit yet. Do not change the plan ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â wait patiently for the live price. ` +
      `The real lesson only comes after the result.`,
  };
}

function levelClause(record: Pick<StoredSignal, "direction" | "support" | "resistance">): {
  urdu: string;
  english: string;
} {
  if (record.direction === "bearish") {
    return {
      urdu: `Resistance ${money(record.resistance)} ne kaam kiya.`,
      english: `Resistance at ${money(record.resistance)} did its job.`,
    };
  }
  if (record.direction === "bullish") {
    return {
      urdu: `Support ${money(record.support)} pe hold hua.`,
      english: `Support held at ${money(record.support)}.`,
    };
  }
  return {
    urdu: `Price support ${money(record.support)} aur resistance ${money(record.resistance)} ke beech range mein rahi.`,
    english: `Price stayed in a range between support ${money(record.support)} and resistance ${money(record.resistance)}.`,
  };
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Persistence ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

/** Reads the stored list (newest first). Returns [] on any problem. */
export function getSignals(): StoredSignal[] {
  let list: StoredSignal[] = [];
  try {
    const raw = localStorage.getItem(SIGNAL_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed
          .filter((item): item is StoredSignal => {
            if (!item || typeof item !== "object") return false;
            const r = item as Partial<StoredSignal>;
            return typeof r.id === "string" && typeof r.symbol === "string" && typeof r.createdAt === "number";
          })
          .map(normalize);
      }
    }
  } catch {
    return [];
  }

  const merged = mergeLegacy(list);
  merged.sort((a, b) => b.createdAt - a.createdAt);
  return merged;
}

/** Persists the list, bounding it to the newest MAX_SIGNALS entries. */
export function saveSignals(list: StoredSignal[]): void {
  try {
    localStorage.setItem(SIGNAL_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SIGNALS)));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

/** Remove duplicate records, keeping only the newest per symbol. */
export function cleanDuplicates(): StoredSignal[] {
  const existing = getSignals();
  const seen = new Set<string>();
  const cleaned = existing.filter((r) => {
    const key = r.symbol.toUpperCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  saveSignals(cleaned);
  return cleaned;
}

/** Wipe all stored signals (Clear History). */
export function clearSignals(): void {
  try {
    localStorage.removeItem(SIGNAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Fill defaults for any field an older/partial record is missing. */
function normalize(raw: StoredSignal): StoredSignal {
  const status: SignalStatus =
    raw.status === "SUCCESS" || raw.status === "FAILED" || raw.status === "EXPIRED"
      ? raw.status
      : "PENDING";
  const hitTarget: HitTarget =
    raw.hitTarget === "TP1" || raw.hitTarget === "TP2" || raw.hitTarget === "TP3" || raw.hitTarget === "SL"
      ? raw.hitTarget
      : null;
  const record: StoredSignal = {
    ...raw,
    status,
    hitTarget,
    trend: raw.trend || "Sideways / Range",
    pattern: raw.pattern || "No clear pattern",
    candlestick: raw.candlestick || "Neutral (no confirmation)",
    entry1: Number(raw.entry1) || 0,
    entry2: Number(raw.entry2) || 0,
    stopLoss: Number(raw.stopLoss) || 0,
    tp1: Number(raw.tp1) || 0,
    tp2: Number(raw.tp2) || 0,
    tp3: Number(raw.tp3) || 0,
    support: Number(raw.support) || 0,
    resistance: Number(raw.resistance) || 0,
    currentPrice: Number(raw.currentPrice) || 0,
    score: Number(raw.score) || 0,
  };
  // Narratives were added later ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â build them when absent.
  if (!record.whyUrdu || !record.whyEnglish) {
    const why = buildWhy(record);
    record.whyUrdu = why.urdu;
    record.whyEnglish = why.english;
  }
  if (!record.lessonUrdu || !record.lessonEnglish) {
    const lesson = buildLesson(record.status, record.pattern, record.candlestick);
    record.lessonUrdu = lesson.urdu;
    record.lessonEnglish = lesson.english;
  }
  return record;
}

/**
 * Older builds stored a thinner record under "signal-history". Convert anything the
 * new store does not already have so previously tracked setups keep showing up.
 */
function mergeLegacy(current: StoredSignal[]): StoredSignal[] {
  let legacyRaw: string | null = null;
  try {
    legacyRaw = localStorage.getItem(LEGACY_SIGNAL_KEY);
  } catch {
    return current;
  }
  if (!legacyRaw) return current;

  let legacy: unknown;
  try {
    legacy = JSON.parse(legacyRaw);
  } catch {
    return current;
  }
  if (!Array.isArray(legacy)) return current;

  const known = new Set(current.map((r) => r.id));
  const migrated: StoredSignal[] = [];

  for (const item of legacy) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    const id = typeof l.id === "string" ? l.id : null;
    if (!id || known.has(id)) continue;

    const direction: SignalDirection =
      l.direction === "bearish" ? "bearish" : l.direction === "neutral" ? "neutral" : "bullish";
    const status: SignalStatus = l.status === "success" ? "SUCCESS" : l.status === "failed" ? "FAILED" : "PENDING";
    const entry = Number(l.entryPrice) || 0;
    const target = Number(l.targetPrice) || 0;

    const record: StoredSignal = {
      id,
      symbol: typeof l.symbol === "string" ? l.symbol : "UNKNOWN",
      market: typeof l.market === "string" ? l.market : "crypto",
      score: Number(l.score) || 0,
      direction,
      trend:
        direction === "bearish"
          ? "Downtrend (Lower Highs / Lower Lows)"
          : direction === "bullish"
            ? "Uptrend (Higher Highs / Higher Lows)"
            : "Sideways / Range",
      pattern: typeof l.pattern === "string" && l.pattern ? l.pattern : "No clear pattern",
      candlestick: "Neutral (no confirmation)",
      entry1: entry,
      entry2: entry,
      stopLoss: 0,
      tp1: target,
      tp2: 0,
      tp3: 0,
      support: Number(l.support) || 0,
      resistance: Number(l.resistance) || 0,
      createdAt: Number(l.date) || Date.now(),
      status,
      hitTarget: status === "SUCCESS" && target > 0 ? "TP1" : status === "FAILED" ? "SL" : null,
      currentPrice: entry,
      whyUrdu: typeof l.explanationUrdu === "string" ? l.explanationUrdu : "",
      whyEnglish: typeof l.explanationEnglish === "string" ? l.explanationEnglish : "",
      lessonUrdu: "",
      lessonEnglish: "",
    };

    const why =
      record.whyUrdu && record.whyEnglish ? { urdu: record.whyUrdu, english: record.whyEnglish } : buildWhy(record);
    const lesson = buildLesson(record.status, record.pattern, record.candlestick);
    migrated.push(
      normalize({
        ...record,
        whyUrdu: why.urdu,
        whyEnglish: why.english,
        lessonUrdu: lesson.urdu,
        lessonEnglish: lesson.english,
      })
    );
  }

  if (migrated.length === 0) return current;
  const merged = [...current, ...migrated];
  merged.sort((a, b) => b.createdAt - a.createdAt);
  // Persist so migration only ever runs once per legacy record (ids stay known).
  saveSignals(merged);
  return merged;
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Writing ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

/**
 * Save an 80+ score setup. STRONG de-dupe: at most one record per symbol in a
 * rolling 24h window, regardless of status ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â a coin saved today is skipped on the
 * next refresh instead of piling up duplicates. Older same-symbol records are
 * dropped when a fresh one is added. No-op below MIN_SCORE.
 */
export function saveSignal(input: SignalSaveInput): StoredSignal | null {
  if (!Number.isFinite(input.score) || input.score < MIN_SCORE) return null;
  if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0) return null;

  const existing = getSignals();

  // STRONG duplicate guard ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â one record per symbol per rolling 24h window,
  // regardless of status. Stops the same coin piling up (e.g. XRP saved 6x).
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const key = input.symbol.toUpperCase().trim();
  if (existing.some((r) => r.symbol.toUpperCase().trim() === key && r.createdAt > oneDayAgo)) {
    return null; // Same symbol already saved within 24 hours ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â skip.
  }

  // No record for this symbol within 24h, so add a fresh one and drop any older
  // record for the same symbol to keep at most one entry per coin.
  const kept = existing.filter((r) => r.symbol.toUpperCase().trim() !== key);

  const base: StoredSignal = {
    id: `${input.symbol}-${input.market}-${Date.now()}`,
    symbol: input.symbol,
    market: input.market,
    score: Math.round(input.score),
    direction: input.direction,
    trend: input.trend || "Sideways / Range",
    pattern: input.pattern || "No clear pattern",
    candlestick: input.candlestick || "Neutral (no confirmation)",
    entry1: input.entry1,
    entry2: input.entry2,
    stopLoss: input.stopLoss,
    tp1: input.tp1,
    tp2: input.tp2,
    tp3: input.tp3,
    support: input.support,
    resistance: input.resistance,
    createdAt: Date.now(),
    status: "PENDING",
    hitTarget: null,
    currentPrice: input.currentPrice,
    whyUrdu: "",
    whyEnglish: "",
    lessonUrdu: "",
    lessonEnglish: "",
  };

  const why = buildWhy(base);
  const lesson = buildLesson(base.status, base.pattern, base.candlestick);
  const record: StoredSignal = {
    ...base,
    whyUrdu: why.urdu,
    whyEnglish: why.english,
    lessonUrdu: lesson.urdu,
    lessonEnglish: lesson.english,
  };

  saveSignals([record, ...kept]);
  return record;
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Evaluation ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

function highestHit(record: StoredSignal, price: number, bearish: boolean): Exclude<HitTarget, "SL"> {
  const targets: Array<[Exclude<HitTarget, "SL" | null>, number]> = [
    ["TP1", record.tp1],
    ["TP2", record.tp2],
    ["TP3", record.tp3],
  ];
  const reached = targets.filter(([, v]) => Number.isFinite(v) && v > 0 && (bearish ? price <= v : price >= v));
  if (reached.length === 0) return null;
  // Most ambitious target already reached: lowest TP for a short, highest for a long.
  reached.sort((a, b) => (bearish ? a[1] - b[1] : b[1] - a[1]));
  return reached[0][0];
}

/**
 * Re-evaluate a PENDING record against the current price:
 *  - TP1/TP2/TP3 hit ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ SUCCESS (records which target was hit)
 *  - Stop loss hit   ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ FAILED (hitTarget = SL)
 *  - Otherwise       ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ still PENDING
 * Resolved records keep their status; currentPrice is always refreshed.
 */
export function evaluateSignal(record: StoredSignal, currentPrice: number): StoredSignal {
  const price = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : 0;

  // 30-day expiry (mirrors the server cron): a PENDING setup that resolves
  // nothing in 30 days becomes EXPIRED instead of staying pending forever.
  if (record.status === "PENDING" && record.createdAt > 0 && Date.now() - record.createdAt > THIRTY_DAYS_MS) {
    const expired: StoredSignal = { ...record, status: "EXPIRED", ...(price ? { currentPrice: price } : {}) };
    const why = buildWhy(expired);
    const lesson = buildLesson(expired.status, expired.pattern, expired.candlestick);
    return {
      ...expired,
      whyUrdu: why.urdu,
      whyEnglish: why.english,
      lessonUrdu: lesson.urdu,
      lessonEnglish: lesson.english,
    };
  }

  if (record.status !== "PENDING" || !price) {
    return price && price !== record.currentPrice ? { ...record, currentPrice: price } : record;
  }

  const bearish = record.direction === "bearish";
  const sl = record.stopLoss;
  const slHit = Number.isFinite(sl) && sl > 0 ? (bearish ? price >= sl : price <= sl) : false;
  const target = highestHit(record, price, bearish);

  let status: SignalStatus = "PENDING";
  let hitTarget: HitTarget = null;
  if (slHit) {
    status = "FAILED";
    hitTarget = "SL";
  } else if (target) {
    status = "SUCCESS";
    hitTarget = target;
  }

  const next: StoredSignal = { ...record, currentPrice: price, status, hitTarget };
  if (status === "PENDING") return next;

  // Regenerate both narratives so they describe the final outcome.
  const why = buildWhy(next);
  const lesson = buildLesson(next.status, next.pattern, next.candlestick);
  return {
    ...next,
    whyUrdu: why.urdu,
    whyEnglish: why.english,
    lessonUrdu: lesson.urdu,
    lessonEnglish: lesson.english,
  };
}

/**
 * Map a server/Firestore status ("WIN" | "LOSS" | "EXPIRED" | "PENDING") to the
 * local SignalStatus. Returns null for PENDING/unknown so the local evaluation
 * (or a not-yet-resolved state) is preserved.
 */
export function cloudStatusToLocal(cloud: string): SignalStatus | null {
  if (cloud === "WIN") return "SUCCESS";
  if (cloud === "LOSS") return "FAILED";
  if (cloud === "EXPIRED") return "EXPIRED";
  return null;
}

/** Choose the hit-target label from the cron value, else infer it from the plan. */
function pickHitTarget(raw: string | undefined, status: SignalStatus): HitTarget {
  if (raw === "TP1" || raw === "TP2" || raw === "TP3" || raw === "SL") return raw;
  if (status === "SUCCESS") return "TP1";
  if (status === "FAILED") return "SL";
  return null;
}

/**
 * Overlay a server-cron outcome onto a local record so the Results page shows
 * the SAME WIN/LOSS/EXPIRED the Firestore cron wrote â€” on every device, even
 * setups that resolved while this browser was closed. Only overrides records
 * still PENDING locally (never un-resolves a local win/loss). Regenerates both
 * narratives so the card explains the outcome.
 */
export function applyCloudOutcome(
  record: StoredSignal,
  cloud: { status: string; currentPrice?: number; hitTarget?: string }
): StoredSignal {
  const price =
    typeof cloud.currentPrice === "number" && cloud.currentPrice > 0 ? cloud.currentPrice : record.currentPrice;
  const local = cloudStatusToLocal(String(cloud.status));
  if (!local || record.status !== "PENDING") {
    return price !== record.currentPrice ? { ...record, currentPrice: price } : record;
  }
  const next: StoredSignal = {
    ...record,
    status: local,
    hitTarget: pickHitTarget(cloud.hitTarget, local),
    currentPrice: price,
  };
  const why = buildWhy(next);
  const lesson = buildLesson(next.status, next.pattern, next.candlestick);
  return {
    ...next,
    whyUrdu: why.urdu,
    whyEnglish: why.english,
    lessonUrdu: lesson.urdu,
    lessonEnglish: lesson.english,
  };
}


