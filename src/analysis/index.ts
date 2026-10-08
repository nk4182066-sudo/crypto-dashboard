import type { Candle, MarketAnalysis, RiskReport, TrendBias } from "./types";
import { buildIndicatorReport } from "./indicators";
import { analyzeStructure } from "./structure";
import { analyzeSmartMoney } from "./smartMoney";
import { buildVolumeProfile } from "./volume";
import { detectRegime } from "./regime";
import { detectChartPatterns } from "./patterns";
import { buildSetup, computeBias, type SetupContext } from "./setup";
import { kellyCriterion, positionSizing, riskOfRuin, analyzeDrawdown } from "./risk";
import { buildWhatToDo } from "./language";
import { analyzePriceAction } from "./priceAction";
import { analyzeOrderFlow } from "./orderFlow";
import { analyzeWyckoff } from "./wyckoff";
import { analyzeCycles } from "./cycle";
import { analyzeVolatility } from "./volatility";
import { analyzeTime } from "./timeAnalysis";
import { analyzeFibonacci } from "./fibonacci";
import { analyzeAssetClass } from "./assetClass";
import { analyzeQuant } from "./quant";
import { analyzePsychology } from "./psychology";
import type { TimeframeSnapshot } from "./confluence";

export interface AnalyzeOptions {
  symbol: string;
  market: "crypto" | "forex" | "stocks";
  timeframe: string;
  candles: Candle[];
  balance?: number;
  riskPercent?: number;
  winRate?: number | null;
}

/** Aggregates candles into larger fixed-time buckets (e.g. daily -> weekly). */
export function resample(candles: Candle[], bucketSeconds: number): Candle[] {
  const grouped = new Map<number, Candle>();
  for (const candle of candles) {
    const bucket = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const existing = grouped.get(bucket);
    if (existing) {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close;
      existing.volume += candle.volume;
    } else {
      grouped.set(bucket, { ...candle, time: bucket });
    }
  }
  return [...grouped.values()].sort((first, second) => first.time - second.time);
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function buildRiskReport(setup: MarketAnalysis["setup"], balance: number, riskPercent: number, winRate: number | null): RiskReport {
  const warnings: string[] = [];
  let sizing: RiskReport["positionSizing"] = null;
  let kelly: RiskReport["kelly"] = null;
  let ruin: RiskReport["riskOfRuin"] = null;

  if (setup.direction !== "wait" && setup.entryZone && setup.stopLoss !== null) {
    const size = positionSizing({
      balance,
      riskPercent,
      entry: setup.entryZone.mid,
      stopLoss: setup.stopLoss,
      takeProfit: setup.takeProfits[0]?.price ?? null,
    });
    sizing = size;
  }

  const assumedWinRate = winRate ?? clamp(0.35 + setup.qualityScore / 300, 0.35, 0.62);
  if (setup.rewardRisk) {
    kelly = kellyCriterion(assumedWinRate, setup.rewardRisk);
    ruin = riskOfRuin({ winRate: assumedWinRate, rewardRisk: setup.rewardRisk, riskPercentPerTrade: riskPercent, ruinDrawdownPercent: 50 });
  }

  if (riskPercent > 5) warnings.push("Risking more than 5% per trade is aggressive and raises the risk of ruin sharply.");
  if (sizing && balance > 0 && sizing.notional > balance * 10) warnings.push("Notional exposure is over 10x the account — spot sizing is assumed, not leverage.");
  if (assumedWinRate < 0.4) warnings.push("Assumed win rate is low; require a higher reward:risk before taking this setup.");

  return { positionSizing: sizing, kelly, riskOfRuin: ruin, drawdown: null, warnings };
}

export function analyzeMarket(options: AnalyzeOptions): MarketAnalysis {
  const { candles, symbol, market, timeframe } = options;
  const balance = options.balance ?? 10000;
  const riskPercent = options.riskPercent ?? 1;

  const price = candles.at(-1)?.close ?? 0;
  const indicators = buildIndicatorReport(candles);
  const structure = analyzeStructure(candles);
  const smartMoney = analyzeSmartMoney(candles);
  const volume = buildVolumeProfile(candles);
  const regime = detectRegime(candles);
  const chartPatterns = detectChartPatterns(candles);
  const priceAction = analyzePriceAction(candles);
  const orderFlow = analyzeOrderFlow(candles);
  const wyckoff = analyzeWyckoff(candles);
  const cycle = analyzeCycles(candles);
  const volatility = analyzeVolatility(candles, timeframe);
  const time = analyzeTime(candles);
  const fibonacci = analyzeFibonacci(candles);
  const assetClass = analyzeAssetClass(symbol, market);
  const quant = analyzeQuant(candles, timeframe);
  const psychology = analyzePsychology(candles);

  const bias: TrendBias = computeBias({ structure, indicators, regime });
  const context: SetupContext = { candles, atr14: indicators.atr14, price, structure, indicators, smartMoney, volume, regime };
  const setup = buildSetup(context, bias);
  const risk = buildRiskReport(setup, balance, riskPercent, options.winRate ?? null);

  const confidence = setup.direction === "wait" ? Math.round(setup.qualityScore * 0.6) : setup.qualityScore;
  const summary = `${symbol} on the ${timeframe} timeframe shows a ${bias.toLowerCase()} bias with a ${setup.direction === "wait" ? "no-trade" : setup.direction} setup at ${confidence}/100 confidence. ${regime.note}`;

  const whatToDo = buildWhatToDo({
    bias,
    direction: setup.direction,
    qualityScore: setup.qualityScore,
    entryLow: setup.entryZone?.low ?? null,
    entryHigh: setup.entryZone?.high ?? null,
    stop: setup.stopLoss,
    takeProfits: setup.takeProfits.map((tp) => ({ label: tp.label, price: tp.price })),
    regimeType: regime.type,
    aligned: false,
    riskCash: risk.positionSizing?.riskCash ?? null,
    riskPercent,
  });
  return {
    symbol,
    market,
    timeframe,
    generatedAt: new Date().toISOString(),
    price,
    structure,
    indicators,
    chartPatterns,
    smartMoney,
    volume,
    regime,
    risk,
    setup,
    priceAction,
    orderFlow,
    wyckoff,
    cycle,
    volatility,
    time,
    fibonacci,
    assetClass,
    quant,
    psychology,
    correlation: null,
    bias,
    confidence,
    summary,
    whatToDo,
  };
}

export function toSnapshot(analysis: MarketAnalysis, timeframe: TimeframeSnapshot["timeframe"]): TimeframeSnapshot {
  return {
    timeframe,
    bias: analysis.bias,
    confidence: analysis.confidence,
    price: analysis.price,
    regime: analysis.regime.type,
    setupDirection: analysis.setup.direction,
    qualityScore: analysis.setup.qualityScore,
  };
}

export { analyzeDrawdown };
