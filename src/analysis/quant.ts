import type { Candle, QuantReport } from "./types";

const PERIODS_PER_YEAR: Record<string, number> = {
  "15m": 35040,
  "1h": 8760,
  "4h": 2190,
  "1d": 365,
  "1w": 52,
};

/** Deterministic pseudo-random generator so Monte Carlo output is reproducible. */
function seededRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function analyzeQuant(candles: Candle[], timeframe: string): QuantReport {
  const window = candles.slice(-250);
  if (window.length < 30) {
    return {
      sharpe: null,
      sortino: null,
      expectancyPercent: null,
      maxDrawdownPercent: 0,
      profitFactor: null,
      monteCarlo: null,
      note: "Not enough candles for quantitative statistics.",
    };
  }

  const returns: number[] = [];
  for (let index = 1; index < window.length; index += 1) {
    if (window[index - 1].close === 0) continue;
    returns.push((window[index].close - window[index - 1].close) / window[index - 1].close);
  }
  const periodsPerYear = PERIODS_PER_YEAR[timeframe] ?? 8760;
  const mean = returns.reduce((total, value) => total + value, 0) / returns.length;
  const downside = returns.filter((value) => value < 0);
  const upside = returns.filter((value) => value > 0);

  const std = Math.sqrt(returns.reduce((total, value) => total + (value - mean) ** 2, 0) / returns.length);
  const downsideDeviation = Math.sqrt(downside.reduce((total, value) => total + value ** 2, 0) / Math.max(1, returns.length));
  const sharpe = std > 0 ? Number(((mean / std) * Math.sqrt(periodsPerYear)).toFixed(2)) : null;
  const sortino = downsideDeviation > 0 ? Number(((mean / downsideDeviation) * Math.sqrt(periodsPerYear)).toFixed(2)) : null;

  const averageWin = upside.length ? upside.reduce((total, value) => total + value, 0) / upside.length : 0;
  const averageLoss = downside.length ? Math.abs(downside.reduce((total, value) => total + value, 0) / downside.length) : 0;
  const winRate = returns.length ? upside.length / returns.length : 0;
  const expectancyPercent = Number(((winRate * averageWin - (1 - winRate) * averageLoss) * 100).toFixed(4));

  let equity = 1;
  let peak = 1;
  let maxDrawdownPercent = 0;
  const grossProfit = upside.reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(downside.reduce((total, value) => total + value, 0));
  for (const value of returns) {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, ((peak - equity) / peak) * 100);
  }
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : null;

  const random = seededRandom(42);
  const finals: number[] = [];
  const paths = 400;
  const steps = Math.min(120, returns.length);
  for (let path = 0; path < paths; path += 1) {
    let value = 1;
    for (let step = 0; step < steps; step += 1) {
      const pick = returns[Math.floor(random() * returns.length)];
      value *= 1 + pick;
    }
    finals.push(value);
  }
  finals.sort((first, second) => first - second);
  const at = (fraction: number) => Number(((finals[Math.floor(finals.length * fraction)] - 1) * 100).toFixed(2));
  const monteCarlo = { p5: at(0.05), p50: at(0.5), p95: at(0.95) };

  const note = `Statistics over the last ${returns.length} candles: expectancy ${expectancyPercent}% per candle, Sharpe ${sharpe ?? "—"}, Sortino ${sortino ?? "—"} annualized. Monte Carlo reshuffles these returns ${paths}× — the 5th–95th percentile band shows realistic outcome spread, not a forecast.`;

  return { sharpe, sortino, expectancyPercent, maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)), profitFactor, monteCarlo, note };
}
