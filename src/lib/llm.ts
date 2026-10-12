/**
 * Features 4 and 6 — token efficiency and smart model selection.
 *
 * The previous implementation sent every cached call a ~6k-character
 * system prompt plus up to 240 raw OHLCV rows and a full analysis blob. This
 * module keeps a compact prompt per task tier and trims the market context so
 * only the fields the model actually needs are transmitted.
 *
 * Provider is Google Gemini; see `src/lib/gemini.ts`.
 */

import { GEMINI_MODEL } from "@/src/lib/gemini";

/**
 * Both tiers resolve to gemini-2.5-flash. That model is fast enough that a
 * second, slower fallback would only add latency, so the chain is kept as a
 * single entry to preserve the existing call sites.
 */
export const FAST_MODEL = GEMINI_MODEL;
export const STRONG_MODEL = GEMINI_MODEL;

/** Model chain: Gemini serves every tier through one ultra-fast model. */
export function modelChain(_tier: "fast" | "deep"): string[] {
  return [GEMINI_MODEL];
}

export type TaskTier = "fast" | "deep";

/**
 * Feature 6 — routes a request to the smaller/faster model when the task is
 * simple. Image analysis and explicit analysis keywords are always deep.
 */
export function selectTier(message: string, hasImage: boolean): TaskTier {
  if (hasImage) return "deep";

  const text = message.toLowerCase().trim();
  // Greetings and very short messages never need the larger model.
  if (text.length <= 24 && /^(hi|hello|hey|salam|assalam|ok|thanks|thank you|bye|good (morning|evening|night))\b/.test(text)) {
    return "fast";
  }

  const deepPattern = /\b(analy[sz]e|analysis|chart|pattern|indicators?|rsi|macd|support|resistance|setup|entry|stop ?loss|take ?profit|risk|position ?size|strategy|compare|explain why|forecast|outlook|portfolio|swing| scalp)\b/;
  if (deepPattern.test(text)) return "deep";

  return "fast";
}

/**
 * Feature 4 — compact system prompt for the fast tier. The deep tier keeps the
 * full analyst instructions because they enforce the honesty rules (no forced
 * patterns, one verdict, no invented prices).
 */
export function systemPromptFor(tier: TaskTier, deepPrompt: string, greeting: string): string {
  if (tier === "deep") return deepPrompt;
  return [
    `You are a professional trading analyst for crypto, forex, stocks, and metals.`,
    `Give honest, evidence-based answers. Never guarantee accuracy or profit.`,
    `Reply in the language the user used (English, Urdu, or Roman Urdu).`,
    `Answer only what was asked. For a direct greeting reply exactly: "${greeting}"`,
    `This is educational information, not personalized financial advice.`,
  ].join("\n");
}

/** Rounds to a fixed number of decimals so JSON payloads stay small. */
function round(value: unknown, decimals = 4): unknown {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface CompactCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface RawCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Feature 4 — trims OHLCV rows for the model: short keys, rounded prices, and a
 * cap on how many rows are sent. Keeps the most recent `limit` bars.
 */
export function compactCandles(candles: RawCandle[], limit = 60): CompactCandle[] {
  return candles.slice(-limit).map((candle) => ({
    t: candle.time,
    o: round(candle.open) as number,
    h: round(candle.high) as number,
    l: round(candle.low) as number,
    c: round(candle.close) as number,
    v: round(candle.volume ?? 0, 2) as number,
  }));
}

/**
 * Feature 4 — trims the market context to only the fields the model needs,
 * dropping verbose prose (notes, explanations) that inflates tokens without
 * improving the answer.
 */
export function compactMarketContext(context: Record<string, unknown>): Record<string, unknown> {
  const compact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null) continue;
    // Skip long natural-language blobs; keep structured numbers and short strings.
    if (typeof value === "string" && value.length > 160) continue;
    compact[key] = value;
  }
  return compact;
}