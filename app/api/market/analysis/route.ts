import { cached } from "@/src/lib/cache";
import { callGemini as callGeminiModel, GEMINI_MODEL } from "@/src/lib/gemini";
import { compactCandles, compactMarketContext } from "@/src/lib/llm";
import { rsi } from "@/src/analysis/indicators";
import { detectCandlestickPatterns as detectPatterns } from "@/src/lib/chart/candlestickDetector";

interface CandleInput {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DetectedChartPattern {
  name: string;
  points: { time: number; price: number }[];
}

function simpleMovingAverage(values: number[], period: number) {
  if (values.length < period) return null;
  const recent = values.slice(-period);
  return recent.reduce((total, value) => total + value, 0) / period;
}

function exponentialMovingAverage(values: number[], period: number) {
  const result: (number | null)[] = Array(values.length).fill(null);
  if (values.length < period) return result;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
  result[period - 1] = current;
  for (let index = period; index < values.length; index += 1) {
    current = (values[index] - current) * multiplier + current;
    result[index] = current;
  }
  return result;
}

function calculateIndicators(candles: CandleInput[]) {
  const closes = candles.map((candle) => candle.close);
  const changes = closes.slice(1).map((close, index) => close - closes[index]);
  const recentChanges = changes.slice(-14);
  const averageGain = recentChanges.reduce((total, change) => total + Math.max(0, change), 0) / Math.max(1, recentChanges.length);
  const averageLoss = recentChanges.reduce((total, change) => total + Math.max(0, -change), 0) / Math.max(1, recentChanges.length);
  const rsi = recentChanges.length < 14 ? null : averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  const fastEma = exponentialMovingAverage(closes, 12);
  const slowEma = exponentialMovingAverage(closes, 26);
  const macdValues = closes.flatMap((_, index) => fastEma[index] !== null && slowEma[index] !== null ? [fastEma[index]! - slowEma[index]!] : []);
  const macdSignalValues = exponentialMovingAverage(macdValues, 9);
  const macd = macdValues.at(-1) ?? null;
  const macdSignal = macdSignalValues.at(-1) ?? null;

  const bollingerWindow = closes.slice(-20);
  const bollingerMiddle = simpleMovingAverage(closes, 20);
  const bollingerDeviation = bollingerMiddle === null
    ? null
    : Math.sqrt(bollingerWindow.reduce((total, close) => total + (close - bollingerMiddle) ** 2, 0) / bollingerWindow.length);
  const range = candles.slice(-120);
  const rangeHigh = Math.max(...range.map((candle) => candle.high));
  const rangeLow = Math.min(...range.map((candle) => candle.low));
  const rangeSize = rangeHigh - rangeLow;

  return {
    rsi14: rsi,
    macd: macd === null || macdSignal === null ? null : { line: macd, signal: macdSignal, histogram: macd - macdSignal },
    movingAverages: {
      sma20: simpleMovingAverage(closes, 20),
      sma50: simpleMovingAverage(closes, 50),
      sma100: simpleMovingAverage(closes, 100),
      sma200: simpleMovingAverage(closes, 200),
    },
    bollingerBands: bollingerMiddle === null || bollingerDeviation === null
      ? null
      : { upper: bollingerMiddle + 2 * bollingerDeviation, middle: bollingerMiddle, lower: bollingerMiddle - 2 * bollingerDeviation },
    fibonacci: rangeSize > 0
      ? { high: rangeHigh, low: rangeLow, retracement: [0.236, 0.382, 0.5, 0.618, 0.786].map((ratio) => ({ ratio, price: rangeHigh - rangeSize * ratio })) }
      : null,
    range: { low: Math.min(...candles.map((candle) => candle.low)), high: Math.max(...candles.map((candle) => candle.high)) },
  };
}

/**
 * High-conviction candlestick detection for the AI context payload.
 *
 * This used to be a second, looser copy of the detector living in the route,
 * which meant the model saw every matching candle as a "setup". It now delegates
 * to the shared, filtered detector so the API and the chart agree on what counts.
 */
function detectCandlestickPatterns(candles: CandleInput[]) {
  const indicators = rsi(candles.map((candle) => candle.close), 14);
  return detectPatterns(candles, { rsi: indicators }).map((pattern) => ({
    time: pattern.time,
    name: pattern.name,
    direction: pattern.direction,
    price: pattern.price,
    trigger: pattern.trigger,
  }));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function validateChartPatterns(value: unknown, candles: CandleInput[]): DetectedChartPattern[] {
  if (!Array.isArray(value)) return [];
  const candlesByTime = new Map(candles.map((candle) => [candle.time, candle]));
  return value.slice(0, 12).flatMap((candidate): DetectedChartPattern[] => {
    if (!isRecord(candidate) || typeof candidate.name !== "string" || !Array.isArray(candidate.points)) return [];
    const name = candidate.name.trim().slice(0, 48);
    if (!/head|shoulder|triangle|double|triple|flag|wedge|cup|handle|channel|rectangle|range/i.test(name)) return [];
    const points = candidate.points.flatMap((point) => {
      if (!isRecord(point) || typeof point.time !== "number" || typeof point.price !== "number" || !Number.isFinite(point.price)) return [];
      const candle = candlesByTime.get(point.time);
      return candle && point.price >= candle.low && point.price <= candle.high ? [{ time: point.time, price: point.price }] : [];
    });
    if (points.length < 3 || points.length > 8 || points.some((point, index) => index > 0 && point.time <= points[index - 1].time)) return [];
    return [{ name, points }];
  });
}

const priceLevels = (value: unknown, minimum: number, maximum: number) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price) && price >= minimum && price <= maximum)
    .filter((price, index, prices) => prices.findIndex((candidate) => Math.abs(candidate - price) <= Math.abs(price) * 0.001) === index)
    .slice(0, 3);
};

export async function POST(request: Request) {
  try {
    const { symbol, timeframe, candles: inputCandles, language } = await request.json();
    if (typeof symbol !== "string" || typeof timeframe !== "string" || !Array.isArray(inputCandles)) {
      return Response.json({ error: "Symbol, timeframe, and candle data are required." }, { status: 400 });
    }

    const candles = inputCandles.slice(-250).filter((value: unknown): value is CandleInput =>
      isRecord(value)
      && typeof value.time === "number"
      && typeof value.open === "number"
      && typeof value.high === "number"
      && typeof value.low === "number"
      && typeof value.close === "number"
      && typeof value.volume === "number"
      && [value.time, value.open, value.high, value.low, value.close, value.volume].every(Number.isFinite)
      && value.high >= value.low
    );

    if (candles.length < 20) {
      return Response.json({ error: "At least 20 valid candles are needed for analysis." }, { status: 400 });
    }

    // Provider: Google Gemini. Falls back to the deterministic indicator path
    // below when no key is configured or the call fails, so a missing key
    // degrades chart quality instead of breaking the page.
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());

    const minimum = Math.min(...candles.map((candle) => candle.low));
    const maximum = Math.max(...candles.map((candle) => candle.high));
    const indicators = calculateIndicators(candles);
    const candlestickPatterns = detectCandlestickPatterns(candles);
    // Feature 4 — round prices and shorten keys before sending to the model.
    // 60 rows at full float precision dominated the prompt budget.
    const modelCandles = compactCandles(candles, 60).map((c) => [c.t, c.o, c.h, c.l, c.c, c.v]);
    const candleTimes = new Set(candles.slice(-40).map((candle) => candle.time));
    const compactIndicators = compactMarketContext(indicators as unknown as Record<string, unknown>);

    // Gemini takes one `systemInstruction` (both former system messages are
    // concatenated into it) plus `contents` turns of `{role, parts}`.
    const signalSystemInstruction = `You are a cautious, beginner-friendly technical analyst. Analyze only the supplied live ${timeframe} candles and calculated indicators for ${symbol}. Candle rows are [unix time, open, high, low, close, volume]. Reply in simple ${typeof language === "string" ? language : "English"}. Return JSON only: {"support":[number],"resistance":[number],"signals":[{"direction":"buy|sell","time":unix_seconds_from_input,"price":number,"reason":"short reason"}],"patterns":[{"name":"Head & Shoulders|Triangle|Double Top|Double Bottom|Triple Top|Triple Bottom|Flag|Wedge|Cup & Handle|Channel|Rectangle","points":[{"time":unix_seconds_from_input,"price":number}]}],"pattern":"short summary of confirmed patterns or none","candlestickPatterns":["Doji|Hammer|Shooting Star|Bullish Engulfing|Bearish Engulfing|Morning Star|Evening Star"],"trend":"Bullish|Bearish|Sideways","verdict":"Setup Detected|Wait|Low Confluence - Wait","explanation":"evidence-based explanation","setup":{"direction":"buy|sell|wait","qualityScore":0,"entry":null,"stopLoss":null,"takeProfit":null,"reason":"plain-language reason"}}. Return every clearly confirmed chart pattern, at most four, each with 3-8 chronological anchors using exact timestamps and prices from the supplied candles. Never force a pattern. Discuss trend, support/resistance, chart and candle patterns, RSI/MACD/moving-average alignment using only supplied evidence. Latest OHLC-detected candle candidates, including timestamps and prices, are ${JSON.stringify(candlestickPatterns)}; include only candidates consistent with the candles. Choose up to three meaningful support and resistance levels inside the candle range. Return setups only when clearly confirmed at exact timestamps/prices from recent candles. Approve a setup only with a qualitative score of at least 80/100, coherent entry/stop/target, and reward:risk of at least 1.5:1; this score is not a win probability. Never claim a fixed profit probability. If evidence is incomplete or mixed, return verdict Wait and null prices; if it invalidates a setup, return Low Confluence - Wait. Never invent levels.

Return every distinct clearly confirmed pattern, up to twelve, and name each occurrence: Head & Shoulders, Inverse Head & Shoulders, Double Top, Double Bottom, Triple Top, Triple Bottom, Ascending Triangle, Descending Triangle, Symmetrical Triangle, Bull Flag, Bear Flag, Bull Pennant, Bear Pennant, Rising Wedge, Falling Wedge, Cup & Handle, Channel, or Rectangle. Name subtypes only when their geometry is supported. For Head & Shoulders, return five chronological pivots in this order: left shoulder, left neckline pivot, head, right neckline pivot, right shoulder.
          Use exact supplied candle prices/times only; do not force patterns.`;

    const signalContents = [
      {
        role: "user" as const,
        // Feature 4 — send only the trimmed indicator payload.
        parts: [{ text: JSON.stringify({ symbol, timeframe, candles: modelCandles, indicators: compactIndicators, candlestickPatterns }) }],
      },
    ];

    // Feature 2 — cache the Gemini signal call.
    // A failed call throws so a transient error is never cached as a result.
    const signalCacheKey = `signals:gemini:${GEMINI_MODEL}:${JSON.stringify(signalContents)}`;
    const response = await cached<{ ok: boolean; status: number; text: string }>(
      signalCacheKey,
      { ttlMs: 10 * 60 * 1000, staleMs: 60 * 60 * 1000 },
      async () => {
        const text = await callGeminiModel({
            systemInstruction: signalSystemInstruction,
            contents: signalContents,
            maxOutputTokens: 2600,
            temperature: 0.1,
            responseMimeType: "application/json",
          });
          return { ok: true, status: 200, text };
      },
    ).catch(() => ({ ok: false, status: 502, text: "Groq signal request failed." }));

    if (!response.ok) {
      const providerError = response.text;
      console.error("Groq market-signal request rejected:", response.status, providerError.slice(0, 500));
      const fallbackTrend = indicators.movingAverages.sma50 !== null && indicators.movingAverages.sma200 !== null
        ? indicators.movingAverages.sma50 > indicators.movingAverages.sma200 ? "Bullish" : indicators.movingAverages.sma50 < indicators.movingAverages.sma200 ? "Bearish" : "Sideways"
        : candles.at(-1)!.close >= indicators.movingAverages.sma20! ? "Bullish" : "Bearish";
      const recent = candles.slice(-120);
      return Response.json({
        levels: {
          support: [Math.min(...recent.map((candle) => candle.low))],
          resistance: [Math.max(...recent.map((candle) => candle.high))],
        },
        signals: [],
        indicators,
        candlestickPatterns,
        patterns: [],
        pattern: "Not clear",
        trend: fallbackTrend,
        verdict: "Wait",
        explanation: `AI analysis is unavailable (HTTP ${response.status}); these are deterministic indicators only. No trade is approved.`,
        tradePlan: {
          direction: "wait",
          qualityScore: null,
          entry: null,
          stopLoss: null,
          takeProfit: null,
          rewardRisk: null,
          reason: "AI analysis is unavailable; do not trade from the indicator-only fallback.",
        },
      });
    }

    const result: unknown = JSON.parse(response.text);
    const content = isRecord(result) && Array.isArray(result.choices) && isRecord(result.choices[0]) && isRecord(result.choices[0].message)
      ? result.choices[0].message.content
      : null;
    let parsedCandidate: unknown = {};
    if (typeof content === "string") {
      try {
        parsedCandidate = JSON.parse(content);
      } catch {
        parsedCandidate = {};
      }
    }
    const parsed = isRecord(parsedCandidate) ? parsedCandidate : {};
    const chartPatterns = validateChartPatterns(parsed.patterns, candles);

    const signals = Array.isArray(parsed.signals)
      ? parsed.signals.flatMap((signal) => {
          if (!isRecord(signal) || (signal.direction !== "buy" && signal.direction !== "sell") || typeof signal.time !== "number" || !candleTimes.has(signal.time)) return [];
          const candle = candles.find((item) => item.time === signal.time);
          const price = signal.price;
          if (!candle || typeof price !== "number" || !Number.isFinite(price) || price < candle.low || price > candle.high) return [];
          return [{
            direction: signal.direction,
            time: signal.time,
            price,
            reason: typeof signal.reason === "string" ? signal.reason.slice(0, 120) : "AI technical analysis",
          }];
        }).slice(0, 1)
      : [];

    const rawSetup = isRecord(parsed.setup) ? parsed.setup : {};
    const qualityScore = typeof rawSetup.qualityScore === "number" && Number.isFinite(rawSetup.qualityScore)
      ? Math.max(0, Math.min(100, rawSetup.qualityScore))
      : 0;
    const direction = rawSetup.direction === "buy" || rawSetup.direction === "sell" ? rawSetup.direction : "wait";
    const entry = typeof rawSetup.entry === "number" ? rawSetup.entry : null;
    const stopLoss = typeof rawSetup.stopLoss === "number" ? rawSetup.stopLoss : null;
    const takeProfit = typeof rawSetup.takeProfit === "number" ? rawSetup.takeProfit : null;
    const validDirection = direction === "buy"
      ? stopLoss !== null && entry !== null && takeProfit !== null && stopLoss < entry && entry < takeProfit
      : direction === "sell"
        ? stopLoss !== null && entry !== null && takeProfit !== null && stopLoss > entry && entry > takeProfit
        : false;
    const risk = entry !== null && stopLoss !== null ? Math.abs(entry - stopLoss) : 0;
    const reward = entry !== null && takeProfit !== null ? Math.abs(takeProfit - entry) : 0;
    const insideRange = [entry, stopLoss, takeProfit].every((price) => price !== null && price >= minimum && price <= maximum);
    const tradeAllowed = direction !== "wait" && qualityScore >= 80 && validDirection && insideRange && risk > 0 && reward / risk >= 1.5;
    const tradePlan = {
      direction: tradeAllowed ? direction : "wait",
      qualityScore: qualityScore || null,
      entry: tradeAllowed ? entry : null,
      stopLoss: tradeAllowed ? stopLoss : null,
      takeProfit: tradeAllowed ? takeProfit : null,
      rewardRisk: tradeAllowed ? reward / risk : null,
      reason: typeof rawSetup.reason === "string" ? rawSetup.reason.slice(0, 240) : "The available evidence does not support a safe, clearly defined setup.",
    };

    return Response.json({
      levels: {
        support: priceLevels(parsed.support, minimum, maximum),
        resistance: priceLevels(parsed.resistance, minimum, maximum),
      },
      signals: tradeAllowed ? signals.filter((signal) => signal.direction === direction) : [],
      indicators,
      candlestickPatterns,
      patterns: chartPatterns,
      pattern: chartPatterns.length ? chartPatterns.map((pattern) => pattern.name).join(" · ") : typeof parsed.pattern === "string" ? parsed.pattern.slice(0, 120) : "Not clear",
      trend: parsed.trend === "Bullish" || parsed.trend === "Bearish" || parsed.trend === "Sideways"
        ? parsed.trend
        : indicators.movingAverages.sma50 !== null && indicators.movingAverages.sma200 !== null
          ? indicators.movingAverages.sma50 > indicators.movingAverages.sma200 ? "Bullish" : indicators.movingAverages.sma50 < indicators.movingAverages.sma200 ? "Bearish" : "Sideways"
          : "Sideways",
      verdict: tradeAllowed ? "Setup Detected" : parsed.verdict === "Low Confluence - Wait" ? "Low Confluence - Wait" : "Wait",
      explanation: typeof parsed.explanation === "string" ? parsed.explanation.slice(0, 700) : "",
      tradePlan,
    });
  } catch (error) {
    console.error("Error analyzing market candles:", error);
    return Response.json({ error: "Unable to analyze chart candles." }, { status: 502 });
  }
}
