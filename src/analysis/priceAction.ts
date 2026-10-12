import type { Candle, CandlePatternSignal, PriceActionReport } from "./types";

function body(candle: Candle) {
  return Math.abs(candle.close - candle.open);
}

function span(candle: Candle) {
  return Math.max(candle.high - candle.low, Number.EPSILON);
}

function upperWick(candle: Candle) {
  return candle.high - Math.max(candle.open, candle.close);
}

function lowerWick(candle: Candle) {
  return Math.min(candle.open, candle.close) - candle.low;
}

function isBull(candle: Candle) {
  return candle.close > candle.open;
}

/** Reads a single candle (and its predecessor) for classical candlestick psychology. */
function readCandle(candle: Candle, previous: Candle | undefined, averageVolume: number): CandlePatternSignal | null {
  const size = body(candle);
  const range = span(candle);
  const upper = upperWick(candle);
  const lower = lowerWick(candle);
  const bull = isBull(candle);
  const push = (name: string, direction: CandlePatternSignal["direction"], strength: number, explanation: string): CandlePatternSignal => ({
    time: candle.time,
    name,
    direction,
    strength: Math.max(1, Math.min(100, Math.round(strength))),
    explanation,
  });

  if (previous) {
    const priorBody = body(previous);
    const engulfing = size > priorBody && priorBody > 0 &&
      ((bull && candle.close > previous.open && candle.open < previous.close && !isBull(previous)) ||
        (!bull && candle.close < previous.open && candle.open > previous.close && isBull(previous)));
    if (engulfing) {
      return push(
        bull ? "Bullish Engulfing" : "Bearish Engulfing",
        bull ? "bullish" : "bearish",
        (size / range) * 100,
        bull
          ? "Buyers overwhelmed the previous selling candle and closed above its open — a momentum shift attempt."
          : "Sellers overwhelmed the previous buying candle and closed below its open — supply is taking control.",
      );
    }
  }

  if (lower > size * 2 && lower > range * 0.55) {
    return push(bull ? "Hammer / Bullish Pin Bar" : "Bullish rejection wick", "bullish", (lower / range) * 100,
      "Price was pushed sharply lower and reclaimed most of the range — sellers were absorbed by buyers at the lows.");
  }
  if (upper > size * 2 && upper > range * 0.55) {
    return push(bull ? "Bearish rejection wick" : "Shooting Star / Bearish Pin Bar", "bearish", (upper / range) * 100,
      "Price spiked higher and closed back down — buyers were exhausted and liquidity was taken above the highs.");
  }
  if (size < range * 0.1 && range > 0) {
    return push("Doji (indecision)", "neutral", 40,
      "Open and close are almost equal: neither side won the candle. Expect a decision candle next.");
  }
  if (size > range * 0.9 && averageVolume > 0 && candle.volume > averageVolume * 1.3) {
    return push(bull ? "Bullish Marubozu" : "Bearish Marubozu", bull ? "bullish" : "bearish", 80,
      "A full-body candle closing at its extreme on above-average volume — controlled, one-sided flow.");
  }
  return null;
}

export function analyzePriceAction(candles: Candle[]): PriceActionReport {
  const recent = candles.slice(-40);
  const averageVolume = recent.length
    ? recent.reduce((total, candle) => total + candle.volume, 0) / recent.length
    : 0;

  const signals: CandlePatternSignal[] = [];
  for (let index = Math.max(1, recent.length - 12); index < recent.length; index += 1) {
    const signal = readCandle(recent[index], recent[index - 1], averageVolume);
    if (signal) signals.push(signal);
  }
  signals.reverse();

  const last = candles.at(-1);
  const prior = candles.at(-2);
  const wick = last
    ? {
      upperRatio: upperWick(last) / span(last),
      lowerRatio: lowerWick(last) / span(last),
      bodyRatio: body(last) / span(last),
      reading: "",
    }
    : { upperRatio: 0, lowerRatio: 0, bodyRatio: 0, reading: "No candles available." };

  if (last && wick.reading === "") {
    wick.reading = wick.lowerRatio > 0.5
      ? "The latest candle is dominated by a lower wick — sellers failed to hold the lows (bullish rejection)."
      : wick.upperRatio > 0.5
        ? "The latest candle is dominated by an upper wick — buyers failed to hold the highs (bearish rejection)."
        : wick.bodyRatio > 0.7
          ? `The latest candle closed ${isBull(last) ? "near its high" : "near its low"} with a large body — one-sided control.`
          : "The latest candle has balanced wicks and body — no clear rejection.";
  }

  let pressure = 0;
  for (const signal of signals.slice(0, 8)) {
    if (signal.direction === "bullish") pressure += signal.strength;
    else if (signal.direction === "bearish") pressure -= signal.strength;
  }
  pressure = Math.max(-100, Math.min(100, Math.round(pressure / 2)));

  const bulls = recent.filter((candle) => isBull(candle)).length;
  const lastBody = last ? body(last) : 0;
  const priorBody = prior ? body(prior) : lastBody;
  const expanding = lastBody > priorBody;
  const psychology = recent.length === 0
    ? "No candle history to read."
    : `${bulls} of the last ${recent.length} candles closed higher. The latest body is ${expanding ? "expanding" : "shrinking"}, which reads as ${expanding && isBull(last!) ? "growing buying pressure" : expanding && !isBull(last!) ? "growing selling pressure" : "fading momentum"}. Wick rejection, body size and where the candle closes tell you who is in control before the level breaks.`;

  return { signals: signals.slice(0, 8), wick, psychology, pressure };
}
