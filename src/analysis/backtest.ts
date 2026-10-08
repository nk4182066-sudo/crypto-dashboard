import type { Candle } from "./types";
import { atr, ema } from "./indicators";
import { analyzeStructure } from "./structure";

export interface BacktestTrade {
  side: "long" | "short";
  entry: number;
  exit: number;
  entryTime: number;
  exitTime: number;
  rMultiple: number;
  reason: string;
}

export interface BacktestSummary {
  strategy: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnlPercent: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  equityCurve: number[];
}

export interface BacktestOptions {
  riskPercent?: number;
  rewardRisk?: number;
  strategy?: "trend" | "structure";
}

/** Deterministic ATR-based backtest with fixed fractional risk per trade. */
export function runBacktest(candles: Candle[], options: BacktestOptions = {}): BacktestSummary | null {
  const { riskPercent = 1, rewardRisk = 2, strategy = "trend" } = options;
  if (candles.length < 60) return null;

  const closes = candles.map((candle) => candle.close);
  const fast = ema(closes, 50);
  const slow = ema(closes, 200);
  const atrSeries = atr(candles, 14);
  const structure = analyzeStructure(candles);
  const structureFlipTimes = new Map<number, "long" | "short">();
  for (const event of structure.events) {
    structureFlipTimes.set(event.time, event.direction === "bullish" ? "long" : "short");
  }

  const trades: BacktestTrade[] = [];
  const equityCurve: number[] = [1];
  let equity = 1;
  let position: { side: "long" | "short"; entry: number; stop: number; target: number; time: number } | null = null;

  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const atrValue = atrSeries[index];
    if (!position && atrValue) {
      const signal = strategy === "trend"
        ? fast[index] !== null && slow[index] !== null && fast[index - 1] !== null && slow[index - 1] !== null
          ? fast[index - 1]! <= slow[index - 1]! && fast[index]! > slow[index]! ? "long"
            : fast[index - 1]! >= slow[index - 1]! && fast[index]! < slow[index]! ? "short" : null
          : null
        : structureFlipTimes.get(candle.time) ?? null;
      if (signal) {
        const stopDistance = atrValue * 1.5;
        position = {
          side: signal,
          entry: candle.close,
          stop: signal === "long" ? candle.close - stopDistance : candle.close + stopDistance,
          target: signal === "long" ? candle.close + stopDistance * rewardRisk : candle.close - stopDistance * rewardRisk,
          time: candle.time,
        };
      }
    } else if (position) {
      const hitStop = position.side === "long" ? candle.low <= position.stop : candle.high >= position.stop;
      const hitTarget = position.side === "long" ? candle.high >= position.target : candle.low <= position.target;
      let exit: number | null = null;
      let reason = "";
      if (hitStop) {
        exit = position.stop;
        reason = "Stop loss";
      } else if (hitTarget) {
        exit = position.target;
        reason = "Target";
      }
      if (exit !== null) {
        const risk = Math.abs(position.entry - position.stop) || 1;
        const rMultiple = ((position.side === "long" ? exit - position.entry : position.entry - exit) / risk);
        equity *= 1 + rMultiple * (riskPercent / 100);
        trades.push({ side: position.side, entry: position.entry, exit, entryTime: position.time, exitTime: candle.time, rMultiple, reason });
        position = null;
      }
    }
    equityCurve.push(equity);
  }

  if (trades.length === 0) return null;
  const wins = trades.filter((trade) => trade.rMultiple > 0).length;
  const grossProfit = trades.filter((trade) => trade.rMultiple > 0).reduce((total, trade) => total + trade.rMultiple, 0);
  const grossLoss = Math.abs(trades.filter((trade) => trade.rMultiple < 0).reduce((total, trade) => total + trade.rMultiple, 0));
  let peak = equityCurve[0];
  let maxDrawdown = 0;
  for (const value of equityCurve) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, peak === 0 ? 0 : ((peak - value) / peak) * 100);
  }

  return {
    strategy: strategy === "trend" ? "EMA 50/200 trend following (ATR stop, 2R target)" : "Break-of-structure momentum (ATR stop, 2R target)",
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: Number(((wins / trades.length) * 100).toFixed(1)),
    netPnlPercent: Number(((equity - 1) * 100).toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
    profitFactor: grossLoss === 0 ? Number.POSITIVE_INFINITY : Number((grossProfit / grossLoss).toFixed(2)),
    equityCurve,
  };
}

/** Walk-forward split: tune-read on the first half, verify on the unseen second half. */
export function walkForward(candles: Candle[], options: BacktestOptions = {}) {
  if (candles.length < 120) return null;
  const midpoint = Math.floor(candles.length / 2);
  const inSample = runBacktest(candles.slice(0, midpoint), options);
  const outOfSample = runBacktest(candles.slice(midpoint), options);
  return { inSample, outOfSample };
}
