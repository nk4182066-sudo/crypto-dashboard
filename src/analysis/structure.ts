import type { Candle, StructureAnalysis, StructureEvent, SwingPoint, TrendBias } from "./types";

/** Detects pivot highs/lows using a symmetric lookback window. */
export function findSwings(candles: Candle[], lookback = 3): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];
  for (let index = lookback; index < candles.length - lookback; index += 1) {
    const candle = candles[index];
    let isHigh = true;
    let isLow = true;
    for (let offset = index - lookback; offset <= index + lookback; offset += 1) {
      if (offset === index) continue;
      if (candles[offset].high >= candle.high) isHigh = false;
      if (candles[offset].low <= candle.low) isLow = false;
    }
    if (isHigh) highs.push({ index, time: candle.time, price: candle.high, kind: "high" });
    if (isLow) lows.push({ index, time: candle.time, price: candle.low, kind: "low" });
  }
  return { highs, lows };
}

/** Alternating pivot sequence (ZigZag) used by harmonic and Elliott detectors. */
export function zigZag(candles: Candle[], lookback = 3): SwingPoint[] {
  const { highs, lows } = findSwings(candles, lookback);
  const merged = [...highs, ...lows].sort((first, second) => first.index - second.index);
  const pivots: SwingPoint[] = [];
  for (const point of merged) {
    const previous = pivots.at(-1);
    if (!previous) {
      pivots.push(point);
      continue;
    }
    if (previous.kind === point.kind) {
      const moreExtreme = point.kind === "high" ? point.price > previous.price : point.price < previous.price;
      if (moreExtreme) pivots[pivots.length - 1] = point;
    } else {
      pivots.push(point);
    }
  }
  return pivots;
}

export function analyzeStructure(candles: Candle[]): StructureAnalysis {
  const pivots = zigZag(candles, 3);
  const events: StructureEvent[] = [];
  let trend: TrendBias = "Sideways";

  const highs = pivots.filter((point) => point.kind === "high");
  const lows = pivots.filter((point) => point.kind === "low");

  for (let index = 1; index < pivots.length; index += 1) {
    const pivot = pivots[index];
    const priorHigh = highs.filter((point) => point.index < pivot.index).at(-1);
    const priorLow = lows.filter((point) => point.index < pivot.index).at(-1);
    if (!priorHigh || !priorLow) continue;

    if (pivot.price > priorHigh.price && pivot.kind === "high") {
      const previousHighs = highs.filter((point) => point.index < priorHigh.index);
      const wasDowntrend = previousHighs.length > 0 && previousHighs.at(-1)!.price > priorHigh.price;
      events.push({
        type: wasDowntrend ? "CHoCH" : "BOS",
        direction: "bullish",
        time: pivot.time,
        price: pivot.price,
        level: priorHigh.price,
        note: wasDowntrend ? "Bullish Change of Character — buyers took control." : "Bullish Break of Structure — uptrend continuation.",
      });
      trend = "Bullish";
    } else if (pivot.price < priorLow.price && pivot.kind === "low") {
      const previousLows = lows.filter((point) => point.index < priorLow.index);
      const wasUptrend = previousLows.length > 0 && previousLows.at(-1)!.price < priorLow.price;
      events.push({
        type: wasUptrend ? "CHoCH" : "BOS",
        direction: "bearish",
        time: pivot.time,
        price: pivot.price,
        level: priorLow.price,
        note: wasUptrend ? "Bearish Change of Character — sellers took control." : "Bearish Break of Structure — downtrend continuation.",
      });
      trend = "Bearish";
    }
  }

  const lastHigh = highs.at(-1) ?? null;
  const lastLow = lows.at(-1) ?? null;
  if (trend === "Sideways" && lastHigh && lastLow) {
    trend = lastHigh.index > lastLow.index ? "Bullish" : "Bearish";
  }

  return {
    trend,
    lastSwingHigh: lastHigh,
    lastSwingLow: lastLow,
    events: events.slice(-6),
  };
}
