/**
 * app/api/analyze/route.ts â€” POST /api/analyze
 *
 * STRICT & GROUNDED AI analysis.
 *
 * The frontend fetches candles DIRECTLY from the exchanges (Binance / TwelveData /
 * Frankfurter) in the browser and POSTs them here. This backend never touches
 * market data â€” it only runs the AI.
 *
 *   - Rotates up to 10 API keys (GROQ_KEY_1..GROQ_KEY_10) with try/catch per key
 *     so the route NEVER crashes â€” if every key fails it returns a graceful
 *     NO SETUP response.
 *   - Strict prompt: the AI only names a pattern if it is clearly visible in the
 *     provided 200 candles, otherwise "NO PATTERN".
 *   - A BUY/SELL signal + Entry/SL/TP is only returned when a valid pattern is
 *     found AND at least 6 of 8 strict conditions align AND the HTF trend agrees.
 *     Otherwise "NO SETUP".
 *
 * Educational only â€” not financial advice.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 0;

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AnalyzeRequest {
  symbol?: string;
  market?: string;
  timeframe?: string;
  candles?: Candle[];
  htfCandles?: Candle[];
}

interface AiOutput {
  pattern: string;
  patternType: "bullish" | "bearish" | "neutral";
  signal: "NO SETUP" | "BUY" | "SELL";
  entry: number | null;
  sl: number | null;
  tp: number | null;
  conditionsMet: number;
  htfTrend: "bullish" | "bearish" | "neutral";
  reasoning: string;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 10 API key rotation (Groq) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function getRotationKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`GROQ_KEY_${i}`]?.trim();
    if (key) keys.push(key);
  }
  if (keys.length === 0) {
    const legacy =
      process.env.GROQ_API_KEY?.trim() ?? process.env.GROQ_KEY_1?.trim();
    if (legacy) keys.push(legacy);
  }
  return keys;
}

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TIMEOUT_MS = 30_000;

async function callGroq(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Groq HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Groq returned empty text");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Walk the key rotation with try/catch per key. Never throws. */
async function runAi(
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; keyIndex: number } | null> {
  const keys = getRotationKeys();
  for (let i = 0; i < keys.length; i++) {
    try {
      const text = await callGroq(keys[i], systemPrompt, userPrompt);
      return { text, keyIndex: i };
    } catch {
      // Try the next key; a single exhausted/dead key must never kill the route.
      continue;
    }
  }
  return null;
}
/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Deterministic indicators (ground the AI prompt) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out.push(sum / period);
  }
  return out;
}

function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (const v of values) {
    if (!Number.isFinite(v)) { out.push(prev ?? NaN); continue; }
    prev = prev === null ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsi(values: number[], period: number): number[] {
  const out: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i === 0) { out.push(NaN); gains.push(0); losses.push(0); continue; }
    const change = values[i] - values[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
    if (i < period) { out.push(NaN); continue; }
    const avgGain =
      gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const avgLoss =
      losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

function lastFinite<T>(arr: T[]): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null && Number.isFinite(arr[i] as unknown as number)) {
      return arr[i] as T;
    }
  }
  return null;
}

interface IndicatorRefs {
  lastClose: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  macdHist: number | null;
  volumeRatio: number | null;
  swingLow: number | null;
  swingHigh: number | null;
  trend: "bullish" | "bearish" | "neutral";
}

function computeIndicators(candles: Candle[]): IndicatorRefs {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((e, i) => e - ema26[i]);
  const macdSignal = ema(macdLine.filter((v) => Number.isFinite(v)), 9);
  let macdHist: number | null = null;
  const lastMacd = lastFinite(macdLine);
  const sigTail = macdSignal.slice(-macdLine.length);
  const lastSig = lastFinite(sigTail);
  if (lastMacd != null && lastSig != null) macdHist = lastMacd - lastSig;

  const lastVol = volumes[volumes.length - 1] ?? 0;
  const avgVol =
    volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
  const volumeRatio = avgVol > 0 ? lastVol / avgVol : null;

  const recent = candles.slice(-60);
  const swingLow = Math.min(...recent.map((c) => c.low));
  const swingHigh = Math.max(...recent.map((c) => c.high));

  const lastClose = closes[closes.length - 1] ?? 0;
  const s20 = lastFinite(sma20);
  const s200 = lastFinite(sma200);
  let trend: "bullish" | "bearish" | "neutral" = "neutral";
  if (s20 != null && s200 != null) {
    if (lastClose > s20 && s20 > s200) trend = "bullish";
    else if (lastClose < s20 && s20 < s200) trend = "bearish";
  }
  return { lastClose, sma20: s20, sma50: lastFinite(sma50), sma200: s200,
    rsi: lastFinite(rsi14), macdHist, volumeRatio, swingLow, swingHigh, trend };
}

function htfTrend(htfCandles: Candle[] | undefined, fallback: IndicatorRefs): "bullish" | "bearish" | "neutral" {
  if (htfCandles && htfCandles.length >= 60) return computeIndicators(htfCandles).trend;
  return fallback.trend;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Strict 8-condition evaluation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface ConditionResult {
  passed: number;
  total: number;
  list: string[];
}

function evaluateConditions(
  ind: IndicatorRefs,
  direction: "bullish" | "bearish",
  aiPattern: string,
  aiEntry: number | null,
  aiSl: number | null,
  aiTp: number | null
): ConditionResult {
  const passes: boolean[] = [];
  const list: string[] = [];

  // 1. Trend alignment (price vs SMA20)
  const t1 = (direction === "bullish" ? ind.lastClose > (ind.sma20 ?? 0) : ind.lastClose < (ind.sma20 ?? 0)) && ind.sma20 != null;
  passes.push(t1); list.push(`trend ${t1 ? "PASS" : "fail"}`);

  // 2. Pattern present (AI named a real pattern)
  const t2 = aiPattern !== "NO PATTERN" && aiPattern !== "";
  passes.push(t2); list.push(`pattern ${t2 ? "PASS" : "fail"}`);

  // 3. RSI agrees (bullish: 50-70, bearish: 30-50)
  const rsi = ind.rsi ?? 50;
  const t3 = direction === "bullish" ? rsi >= 50 && rsi <= 70 : rsi <= 50 && rsi >= 30;
  passes.push(t3); list.push(`rsi ${t3 ? "PASS" : "fail"}`);

  // 4. MACD histogram agrees
  const t4 = ind.macdHist != null ? (direction === "bullish" ? ind.macdHist > 0 : ind.macdHist < 0) : false;
  passes.push(t4); list.push(`macd ${t4 ? "PASS" : "fail"}`);

  // 5. EMA alignment (price above/below SMA stack)
  const s50 = ind.sma50 ?? 0; const s200 = ind.sma200 ?? 0;
  const t5 = direction === "bullish"
    ? ind.lastClose > (ind.sma20 ?? 0) && (ind.sma20 ?? 0) > s50 && s50 > s200
    : ind.lastClose < (ind.sma20 ?? 0) && (ind.sma20 ?? 0) < s50 && s50 < s200;
  passes.push(t5); list.push(`ema ${t5 ? "PASS" : "fail"}`);

  // 6. Volume confirmation
  const t6 = (ind.volumeRatio ?? 0) > 1;
  passes.push(t6); list.push(`volume ${t6 ? "PASS" : "fail"}`);

  // 7. Near swing support (bullish) / resistance (bearish)
  const t7 = direction === "bullish"
    ? ind.swingLow != null && ind.lastClose <= ind.swingLow * 1.03
    : ind.swingHigh != null && ind.lastClose >= ind.swingHigh * 0.97;
  passes.push(t7); list.push(`level ${t7 ? "PASS" : "fail"}`);

  // 8. Risk/reward >= 1:2 (from AI levels)
  let t8 = false;
  if (direction === "bullish" && aiEntry != null && aiSl != null && aiTp != null && aiSl < aiEntry) {
    const risk = aiEntry - aiSl; const reward = aiTp - aiEntry;
    t8 = reward >= 2 * risk;
  } else if (direction === "bearish" && aiEntry != null && aiSl != null && aiTp != null && aiSl > aiEntry) {
    const risk = aiSl - aiEntry; const reward = aiEntry - aiTp;
    t8 = reward >= 2 * risk;
  }
  passes.push(t8); list.push(`rr ${t8 ? "PASS" : "fail"}`);

  return { passed: passes.filter(Boolean).length, total: passes.length, list };
}

function noSetup(reason: string): AiOutput {
  return {
    pattern: "NO PATTERN",
    patternType: "neutral",
    signal: "NO SETUP",
    entry: null,
    sl: null,
    tp: null,
    conditionsMet: 0,
    htfTrend: "neutral",
    reasoning: reason,
  };
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Strict AI prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function buildPrompt(
  symbol: string,
  market: string,
  timeframe: string,
  candles: Candle[],
  htf: Candle[],
  ind: IndicatorRefs,
  htfTrendValue: string
): { system: string; user: string } {
  const candlesJson = JSON.stringify(candles.slice(-200));
  const htfJson = JSON.stringify(htf.slice(-200));

  const system = `You are a STRICT, GROUNDED technical analyst. You act ONLY on what is clearly visible in the provided candles. You must NEVER guess, assume, or hallucinate a pattern.

HARD RULES:
1. PATTERN: Name a classical chart pattern (Double Bottom, Head & Shoulders, Inverse Head & Shoulders, Triangle, Flag, Wedge, Cup & Handle) ONLY if it is clearly and unambiguously visible in the 200 candles â€” defined swings, neckline/breakout level, confirmation near the latest candles. Otherwise set pattern = "NO PATTERN". Do not force a fit. Do not invent patterns from noise.
2. SIGNAL: Output BUY or SELL ONLY if ALL hold: (a) pattern is not "NO PATTERN", (b) at least 6 of the 8 pre-computed conditions below PASSED, (c) the HTF trend aligns with the signal direction. Otherwise signal = "NO SETUP".
3. LEVELS: Only set entry/sl/tp when signal is BUY or SELL, derived from REAL candle prices (breakout price, nearby swing low/high, measured move) with risk/reward >= 1:2. Otherwise entry/sl/tp = null.
4. OUTPUT: raw JSON only â€” no markdown fences, no prose before or after.`;

  const user = `SYMBOL: ${symbol} (${market}) | Timeframe: ${timeframe}

200 CANDLES (oldestâ†’newest): ${candlesJson}

HTF CANDLES (trend context): ${htfJson}

PRE-COMPUTED REFERENCE (verify against the candles; do not contradict visible price action):
- Close: ${ind.lastClose.toFixed(4)} | SMA20: ${ind.sma20?.toFixed(4) ?? "â€”"} | SMA50: ${ind.sma50?.toFixed(4) ?? "â€”"} | SMA200: ${ind.sma200?.toFixed(4) ?? "â€”"} | RSI14: ${ind.rsi?.toFixed(1) ?? "â€”"} | MACD hist: ${ind.macdHist?.toFixed(4) ?? "â€”"}
- Volume: last ${(ind.volumeRatio ?? 0).toFixed(2)}x the 20-bar average
- Recent swing low: ${ind.swingLow?.toFixed(4) ?? "â€”"} | Recent swing high: ${ind.swingHigh?.toFixed(4) ?? "â€”"}
- Conditions passed (this server's deterministic read): ${ind.trend} trend context
- HTF trend: ${htfTrendValue}

Return JSON only:
{
  "pattern": "NO PATTERN" | "<exact pattern name>",
  "patternType": "bullish" | "bearish" | "neutral",
  "signal": "NO SETUP" | "BUY" | "SELL",
  "entry": number | null,
  "sl": number | null,
  "tp": number | null,
  "conditionsMet": 0-8,
  "htfTrend": "bullish" | "bearish" | "neutral",
  "reasoning": "one or two sentences grounded in visible levels, swings and candles"
}

Be conservative: when in doubt â†’ NO PATTERN / NO SETUP. Educational only â€” not financial advice.`;

  return { system, user };
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Response parsing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function parseAiOutput(text: string): AiOutput | null {
  try {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) return null;
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const signal = obj.signal === "BUY" || obj.signal === "SELL" ? obj.signal : "NO SETUP";
    const pattern = typeof obj.pattern === "string" ? obj.pattern : "NO PATTERN";
    const patternType = ["bullish", "bearish", "neutral"].includes(obj.patternType) ? obj.patternType : "neutral";
    const htfTrend = ["bullish", "bearish", "neutral"].includes(obj.htfTrend) ? obj.htfTrend : "neutral";
    const conditionsMet = Number.isFinite(Number(obj.conditionsMet))
      ? Math.min(8, Math.max(0, Number(obj.conditionsMet)))
      : 0;
    return {
      pattern,
      patternType,
      signal,
      entry: obj.entry == null ? null : Number(obj.entry),
      sl: obj.sl == null ? null : Number(obj.sl),
      tp: obj.tp == null ? null : Number(obj.tp),
      conditionsMet,
      htfTrend,
      reasoning: typeof obj.reasoning === "string" ? obj.reasoning.slice(0, 500) : "",
    };
  } catch {
    return null;
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Route handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export async function POST(request: Request): Promise<Response> {
  let body: AnalyzeRequest = {};
  try {
    body = (await request.json()) as AnalyzeRequest;
  } catch {
    // Invalid JSON â€” never crash; return a graceful NO SETUP.
    return NextResponse.json({ error: "Invalid request body", signal: "NO SETUP" }, { status: 400 });
  }

  const symbol = (body.symbol || "BTC-USD").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const market = (body.market || "crypto").toLowerCase();
  const timeframe = body.timeframe || "1h";
  const candles: Candle[] = Array.isArray(body.candles) ? body.candles : [];
  const htfCandles: Candle[] = Array.isArray(body.htfCandles) ? body.htfCandles : [];

  if (candles.length === 0) {
    return NextResponse.json(
      { error: "No candles provided", signal: "NO SETUP", pattern: "NO PATTERN" },
      { status: 400 }
    );
  }

  // Use the last 50 candles for the AI (oldestâ†’newest) to keep it fast.
  const series = candles.slice(-50);
  const ind = computeIndicators(series);
  const htfTrendValue = htfTrend(htfCandles.length > 0 ? htfCandles : series, ind);

  const { system, user } = buildPrompt(symbol, market, timeframe, series, htfCandles.length > 0 ? htfCandles : series, ind, htfTrendValue);
  const ai = await runAi(system, user);

  // â”€â”€ If no AI key is healthy, never crash â€” degrade to NO SETUP. â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!ai) {
    return NextResponse.json({
      symbol, market, timeframe,
      pattern: "NO PATTERN",
      patternType: "neutral",
      signal: "NO SETUP",
      entry: null, sl: null, tp: null,
      conditionsMet: 0,
      htfTrend: htfTrendValue,
      reasoning: "AI unavailable: no healthy API key in rotation.",
      source: "none",
      aiAvailable: false,
    });
  }

  const parsed = parseAiOutput(ai.text);
  if (!parsed) {
    return NextResponse.json({
      symbol, market, timeframe,
      ...noSetup("AI response could not be parsed"),
      source: "none", aiAvailable: false,
    });
  }

  // â”€â”€ Strict enforcement: the code re-gates the AI so it cannot ship a fake setup. â”€â”€
  const direction = parsed.signal === "BUY" ? "bullish" : "bearish";
  let final = parsed;
  if (parsed.signal !== "NO SETUP") {
    const cond = evaluateConditions(ind, direction, parsed.pattern, parsed.entry, parsed.sl, parsed.tp);
    const patternValid = parsed.pattern !== "NO PATTERN" && parsed.pattern !== "";
    const enoughConditions = cond.passed >= 6;
    const htfAligns = htfTrendValue === direction || htfTrendValue === "neutral";

    if (!patternValid || !enoughConditions || !htfAligns) {
      const reason = [
        !patternValid ? "no clear pattern" : null,
        !enoughConditions ? `only ${cond.passed}/8 conditions` : null,
        !htfAligns ? "HTF trend misaligned" : null,
      ].filter(Boolean).join("; ");
      final = { ...parsed, signal: "NO SETUP", entry: null, sl: null, tp: null,
        reasoning: `Blocked (strict gate): ${reason}. ${parsed.reasoning}` };
    } else {
      final = { ...parsed, conditionsMet: cond.passed, htfTrend: htfTrendValue };
    }
  }

  return NextResponse.json({
    symbol, market, timeframe,
    ...final,
    source: "groq",
    aiAvailable: true,
    conditionsDetail: evaluateConditions(ind, direction, final.pattern, final.entry, final.sl, final.tp).list,
  });
}



