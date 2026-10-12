import type { Candle, FootprintRow, OrderFlowReport } from "./types";

/**
 * Candle-based order-flow approximation. Real delta/footprint data needs a tick or
 * level-2 feed, so each candle's volume is split by close position in its range.
 */
function candleDelta(candle: Candle): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  const closePosition = (candle.close - candle.low) / range;
  const buyShare = 0.3 + closePosition * 0.6;
  return candle.volume * (buyShare * 2 - 1);
}

export function analyzeOrderFlow(candles: Candle[], binCount = 14): OrderFlowReport {
  const window = candles.slice(-120);
  if (window.length === 0) {
    return {
      candleDelta: 0,
      cumulativeDelta: 0,
      deltaTrend: "balanced",
      footprint: [],
      absorption: null,
      imbalance: null,
      note: "No candles available for order-flow estimation.",
    };
  }

  const deltas = window.map(candleDelta);
  const candleDeltaValue = deltas.at(-1) ?? 0;
  const cumulativeDelta = deltas.reduce((total, value) => total + value, 0);

  const third = Math.floor(deltas.length / 3) || 1;
  const recentDelta = deltas.slice(-third).reduce((total, value) => total + value, 0);
  const olderDelta = deltas.slice(-third * 2, -third).reduce((total, value) => total + value, 0);
  const deltaTrend: OrderFlowReport["deltaTrend"] =
    recentDelta > olderDelta * 1.15 ? "buyers" : recentDelta < olderDelta * 0.85 ? "sellers" : "balanced";

  const high = Math.max(...window.map((candle) => candle.high));
  const low = Math.min(...window.map((candle) => candle.low));
  const binSize = (high - low) / binCount || 1;
  const rows: FootprintRow[] = Array.from({ length: binCount }, (_, index) => ({
    price: low + binSize * (index + 0.5),
    buy: 0,
    sell: 0,
    delta: 0,
  }));
  for (const candle of window) {
    const index = Math.max(0, Math.min(binCount - 1, Math.floor((candle.close - low) / binSize)));
    const range = candle.high - candle.low;
    const closePosition = range > 0 ? (candle.close - candle.low) / range : 0.5;
    const buyShare = 0.3 + closePosition * 0.6;
    rows[index].buy += candle.volume * buyShare;
    rows[index].sell += candle.volume * (1 - buyShare);
  }
  for (const row of rows) row.delta = row.buy - row.sell;
  const footprint = [...rows].sort((first, second) => (second.buy + second.sell) - (first.buy + first.sell)).slice(0, 8);

  const averageVolume = window.reduce((total, candle) => total + candle.volume, 0) / window.length;
  const averageRange = window.reduce((total, candle) => total + (candle.high - candle.low), 0) / window.length;
  const lastCandle = window.at(-1)!;
  const absorption =
    lastCandle.volume > averageVolume * 1.8 && (lastCandle.high - lastCandle.low) < averageRange * 0.7
      ? `High volume (${(lastCandle.volume / averageVolume).toFixed(1)}x average) with a small range: passive orders are absorbing the aggression — expect a breakout attempt from this area.`
      : null;

  const strongest = [...rows].sort((first, second) => Math.abs(second.delta) - Math.abs(first.delta))[0];
  const imbalance =
    strongest && Math.abs(strongest.delta) > (strongest.buy + strongest.sell) * 0.45
      ? `Footprint imbalance at ${strongest.price.toFixed(strongest.price < 1 ? 6 : 2)}: ${strongest.delta > 0 ? "aggressive buying" : "aggressive selling"} (${Math.abs(strongest.delta).toFixed(0)} volume units).`
      : null;

  return {
    candleDelta: candleDeltaValue,
    cumulativeDelta,
    deltaTrend,
    footprint,
    absorption,
    imbalance,
    note: "Delta, footprint and absorption are approximated from OHLCV candles (volume split by close position). A real footprint chart needs tick or level-2 data.",
  };
}
