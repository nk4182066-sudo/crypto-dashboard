interface CandleInput {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
    movingAverages: { sma20: simpleMovingAverage(closes, 20), sma50: simpleMovingAverage(closes, 50) },
    bollingerBands: bollingerMiddle === null || bollingerDeviation === null
      ? null
      : { upper: bollingerMiddle + 2 * bollingerDeviation, middle: bollingerMiddle, lower: bollingerMiddle - 2 * bollingerDeviation },
    fibonacci: rangeSize > 0
      ? { high: rangeHigh, low: rangeLow, retracement: [0.236, 0.382, 0.5, 0.618, 0.786].map((ratio) => ({ ratio, price: rangeHigh - rangeSize * ratio })) }
      : null,
    range: { low: Math.min(...candles.map((candle) => candle.low)), high: Math.max(...candles.map((candle) => candle.high)) },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const priceLevels = (value: unknown, minimum: number, maximum: number) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price) && price >= minimum && price <= maximum)
    .filter((price, index, prices) => prices.findIndex((candidate) => Math.abs(candidate - price) <= Math.abs(price) * 0.001) === index)
    .slice(0, 1);
};

export async function POST(request: Request) {
  try {
    const { symbol, timeframe, candles: inputCandles, language } = await request.json();
    if (typeof symbol !== "string" || typeof timeframe !== "string" || !Array.isArray(inputCandles)) {
      return Response.json({ error: "Symbol, timeframe, and candle data are required." }, { status: 400 });
    }

    const candles = inputCandles.slice(-150).filter((value: unknown): value is CandleInput =>
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

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Groq API key not configured." }, { status: 503 });
    }

    const minimum = Math.min(...candles.map((candle) => candle.low));
    const maximum = Math.max(...candles.map((candle) => candle.high));
    const indicators = calculateIndicators(candles);
    const candleTimes = new Set(candles.slice(-40).map((candle) => candle.time));
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `You are a cautious, beginner-friendly technical analyst. Analyze only the supplied ${timeframe} candles and indicators for ${symbol}. Explain any jargon in simple ${typeof language === "string" ? language : "English"}. Return JSON only: {"support":[number],"resistance":[number],"signals":[{"direction":"buy|sell","time":unix_seconds_from_input,"price":number,"reason":"short reason"}],"pattern":"recognized pattern or none","explanation":"simple evidence-based explanation","setup":{"direction":"buy|sell|wait","qualityScore":0,"entry":null,"stopLoss":null,"takeProfit":null,"reason":"plain-language reason"}}. Choose up to three meaningful support and resistance prices inside the supplied candle range. Return signals only for clear setups, at exact timestamps from the most recent 40 candles, with prices inside those bars; otherwise return no signals. Only return a buy/sell setup if its evidence-based setup-quality score is at least 80/100, its entry/stop/target are technically coherent, and reward:risk is at least 1.5:1. This score is a qualitative evidence score, not a win probability. Never claim an 80% chance of profit or a fixed 20% reversal probability. If evidence is uncertain or indicators conflict, use direction wait and null prices. Never invent levels.`,
          },
          {
            role: "user",
            content: JSON.stringify({ symbol, timeframe, candles, indicators }),
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1600,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      return Response.json({ error: `Groq analysis failed with status ${response.status}.` }, { status: 502 });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    let parsedCandidate: unknown = {};
    if (typeof content === "string") {
      try {
        parsedCandidate = JSON.parse(content);
      } catch {
        parsedCandidate = {};
      }
    }
    const parsed = isRecord(parsedCandidate) ? parsedCandidate : {};

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
            reason: typeof signal.reason === "string" ? signal.reason.slice(0, 120) : "AI technical signal",
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
      pattern: typeof parsed.pattern === "string" ? parsed.pattern.slice(0, 120) : "Not clear",
      explanation: typeof parsed.explanation === "string" ? parsed.explanation.slice(0, 700) : "",
      tradePlan,
    });
  } catch (error) {
    console.error("Error analyzing market candles:", error);
    return Response.json({ error: "Unable to analyze chart candles." }, { status: 502 });
  }
}