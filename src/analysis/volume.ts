import type { Candle, TrendBias, VolumeReport } from "./types";

/** Distributes each candle's volume across fixed price bins to build a volume profile. */
export function buildVolumeProfile(candles: Candle[], binCount = 24): VolumeReport {
  const window = candles.slice(-300);
  const price = candles.at(-1)?.close ?? 0;
  if (window.length === 0) {
    return { poc: price, valueAreaHigh: price, valueAreaLow: price, rows: [], vwap: null, vwapBias: "Sideways" };
  }

  const high = Math.max(...window.map((candle) => candle.high));
  const low = Math.min(...window.map((candle) => candle.low));
  const binSize = (high - low) / binCount || 1;
  const rows = Array.from({ length: binCount }, (_, index) => ({
    price: low + binSize * (index + 0.5),
    volume: 0,
    buy: 0,
    sell: 0,
  }));

  for (const candle of window) {
    const typical = (candle.high + candle.low + candle.close) / 3;
    const binIndex = Math.max(0, Math.min(binCount - 1, Math.floor((typical - low) / binSize)));
    const row = rows[binIndex];
    row.volume += candle.volume;
    if (candle.close >= candle.open) row.buy += candle.volume;
    else row.sell += candle.volume;
  }

  const pocRow = rows.reduce((best, row) => (row.volume > best.volume ? row : best), rows[0]);
  const totalVolume = rows.reduce((total, row) => total + row.volume, 0);
  const sorted = [...rows].sort((first, second) => second.volume - first.volume);
  let accumulated = 0;
  const valueArea: typeof rows = [];
  for (const row of sorted) {
    valueArea.push(row);
    accumulated += row.volume;
    if (accumulated >= totalVolume * 0.7) break;
  }
  const valuePrices = valueArea.map((row) => row.price);

  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (const candle of window) {
    const typical = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typical * candle.volume;
    cumulativeVolume += candle.volume;
  }
  const vwap = cumulativeVolume === 0 ? null : cumulativePV / cumulativeVolume;
  const vwapBias: TrendBias = vwap === null ? "Sideways" : price > vwap ? "Bullish" : price < vwap ? "Bearish" : "Sideways";

  return {
    poc: pocRow.price,
    valueAreaHigh: Math.max(...valuePrices),
    valueAreaLow: Math.min(...valuePrices),
    rows,
    vwap,
    vwapBias,
  };
}
