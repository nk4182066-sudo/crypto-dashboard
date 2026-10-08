import type { Candle, VolatilityReport } from "./types";
import { atr, bollinger } from "./indicators";

const PERIODS_PER_YEAR: Record<string, number> = {
  "15m": 35040,
  "1h": 8760,
  "4h": 2190,
  "1d": 365,
  "1w": 52,
};

export function analyzeVolatility(candles: Candle[], timeframe: string): VolatilityReport {
  const window = candles.slice(-200);
  if (window.length < 20) {
    return {
      realizedPercent: 0,
      annualizedPercent: 0,
      percentile: 50,
      bollingerSqueeze: false,
      squeezeNote: "Not enough candles for a volatility reading.",
      vixProxy: 0,
      regime: "Normal",
      note: "Not enough candles for a volatility reading.",
    };
  }

  const returns: number[] = [];
  for (let index = 1; index < window.length; index += 1) {
    returns.push((window[index].close - window[index - 1].close) / window[index - 1].close);
  }
  const mean = returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance = returns.reduce((total, value) => total + (value - mean) ** 2, 0) / returns.length;
  const realizedPercent = Math.sqrt(variance) * 100;
  const periodsPerYear = PERIODS_PER_YEAR[timeframe] ?? 8760;
  const annualizedPercent = realizedPercent * Math.sqrt(periodsPerYear);

  const rolling: number[] = [];
  const step = Math.max(1, Math.floor(returns.length / 60));
  for (let start = 0; start + step <= returns.length; start += step) {
    const slice = returns.slice(start, start + step);
    const sliceMean = slice.reduce((total, value) => total + value, 0) / slice.length;
    rolling.push(Math.sqrt(slice.reduce((total, value) => total + (value - sliceMean) ** 2, 0) / slice.length) * 100);
  }
  const sorted = [...rolling].sort((first, second) => first - second);
  const percentile = sorted.length
    ? Math.round((sorted.filter((value) => value <= realizedPercent).length / sorted.length) * 100)
    : 50;

  const bands = bollinger(window.map((candle) => candle.close), 20, 2);
  const widthHistory: number[] = [];
  for (let index = 30; index <= window.length; index += 1) {
    const slice = window.slice(index - 30, index);
    const closes = slice.map((candle) => candle.close);
    const band = bollinger(closes, 20, 2);
    if (band) widthHistory.push(band.widthPercent);
  }
  const currentWidth = bands?.widthPercent ?? 0;
  const sortedWidths = [...widthHistory].sort((first, second) => first - second);
  const widthPercentile = sortedWidths.length
    ? sortedWidths.filter((value) => value <= currentWidth).length / sortedWidths.length
    : 0.5;
  const bollingerSqueeze = widthPercentile <= 0.25;
  const squeezeNote = !bands
    ? "Bollinger bands unavailable."
    : bollingerSqueeze
      ? `Band width is in the bottom ${Math.round(widthPercentile * 100)}% of the last ${widthHistory.length} readings — volatility is compressed and a expansion move is statistically overdue.`
      : `Band width sits at the ${Math.round(widthPercentile * 100)}th percentile — volatility is ${widthPercentile > 0.75 ? "already expanded" : "normal"} (Bollinger Bands 20, 2).`;

  const recentAtr = atr(window, 14).filter((value): value is number => value !== null).at(-1) ?? 0;
  const vixProxy = window.at(-1) && window.at(-1)!.close > 0
    ? (recentAtr / window.at(-1)!.close) * Math.sqrt(periodsPerYear) * 100
    : 0;

  const regime: VolatilityReport["regime"] = percentile >= 75 ? "Expansion" : percentile <= 25 ? "Compression" : "Normal";
  const note = `Realized volatility is ${realizedPercent.toFixed(3)}% per candle (${annualizedPercent.toFixed(1)}% annualized), at the ${percentile}th percentile of the loaded window. Regime: ${regime}.`;

  return {
    realizedPercent: Number(realizedPercent.toFixed(4)),
    annualizedPercent: Number(annualizedPercent.toFixed(2)),
    percentile,
    bollingerSqueeze,
    squeezeNote,
    vixProxy: Number(vixProxy.toFixed(1)),
    regime,
    note,
  };
}
