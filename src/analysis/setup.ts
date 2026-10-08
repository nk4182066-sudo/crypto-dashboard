import type {
  Candle,
  IndicatorReport,
  MarketAnalysis,
  RegimeReport,
  SetupReport,
  SmartMoneyReport,
  StructureAnalysis,
  TrendBias,
  VolumeReport,
} from "./types";

export interface SetupContext {
  candles: Candle[];
  atr14: number | null;
  price: number;
  structure: StructureAnalysis;
  indicators: IndicatorReport;
  smartMoney: SmartMoneyReport;
  volume: VolumeReport;
  regime: RegimeReport;
}

function priceZone(low: number, high: number, label: string) {
  return { low: Math.min(low, high), high: Math.max(low, high), mid: (low + high) / 2, label };
}

function confluenceScore(context: SetupContext, bias: TrendBias): number {
  let score = 40;
  const { indicators, structure, smartMoney, volume, regime } = context;
  if (bias === "Bullish") {
    if (indicators.macd && indicators.macd.histogram > 0) score += 8;
    if (indicators.rsi14 !== null && indicators.rsi14 > 50 && indicators.rsi14 < 75) score += 6;
    if (indicators.ichimoku?.cloudBias === "Bullish") score += 8;
    if (indicators.supertrend?.direction === "up") score += 8;
    if (indicators.movingAverages.sma50 !== null && context.price > indicators.movingAverages.sma50) score += 6;
    if (structure.trend === "Bullish") score += 8;
    if (volume.vwapBias === "Bullish") score += 6;
    if (smartMoney.orderBlocks.some((block) => block.direction === "bullish")) score += 8;
  } else if (bias === "Bearish") {
    if (indicators.macd && indicators.macd.histogram < 0) score += 8;
    if (indicators.rsi14 !== null && indicators.rsi14 < 50 && indicators.rsi14 > 25) score += 6;
    if (indicators.ichimoku?.cloudBias === "Bearish") score += 8;
    if (indicators.supertrend?.direction === "down") score += 8;
    if (indicators.movingAverages.sma50 !== null && context.price < indicators.movingAverages.sma50) score += 6;
    if (structure.trend === "Bearish") score += 8;
    if (volume.vwapBias === "Bearish") score += 6;
    if (smartMoney.orderBlocks.some((block) => block.direction === "bearish")) score += 8;
  }
  if (regime.type === "Trending") score += 6;
  if (regime.volatility === "High") score -= 6;
  return Math.max(0, Math.min(100, score));
}

export function buildSetup(context: SetupContext, bias: TrendBias): SetupReport {
  const { candles, atr14, price, smartMoney, structure } = context;
  const atr = atr14 ?? price * 0.01;
  const recent = candles.slice(-60);
  const rangeHigh = recent.length ? Math.max(...recent.map((candle) => candle.high)) : price;
  const rangeLow = recent.length ? Math.min(...recent.map((candle) => candle.low)) : price;

  if (bias === "Sideways") {
    return {
      direction: "wait",
      qualityScore: confluenceScore(context, bias),
      entryZone: null,
      stopLoss: null,
      takeProfits: [],
      scalingIn: ["No entries while the market is ranging without a clear edge."],
      scalingOut: ["Wait for a Break of Structure or Change of Character before sizing in."],
      breakEven: "Not applicable until a trade is valid.",
      trailingStop: "Not applicable while waiting.",
      rewardRisk: null,
      reason: "Structure and trend evidence disagree, so no high-probability entry is defined.",
    };
  }

  const bullish = bias === "Bullish";
  const direction: SetupReport["direction"] = bullish ? "buy" : "sell";

  const blocks = smartMoney.orderBlocks.filter((block) => block.direction === (bullish ? "bullish" : "bearish"));
  const gap = smartMoney.fairValueGaps.find((item) => item.direction === (bullish ? "bullish" : "bearish") && !item.filled);
  const anchor = bullish
    ? blocks.at(-1)?.high ?? gap?.low ?? structure.lastSwingLow?.price ?? price - atr
    : blocks.at(-1)?.low ?? gap?.high ?? structure.lastSwingHigh?.price ?? price + atr;
  const band = atr * 0.5;
  const entry = priceZone(anchor - band, anchor + band, bullish ? "Demand zone (buy the dip)" : "Supply zone (sell the rally)");

  const stop = bullish
    ? Math.min(entry.low, structure.lastSwingLow?.price ?? entry.low) - atr * 0.6
    : Math.max(entry.high, structure.lastSwingHigh?.price ?? entry.high) + atr * 0.6;
  const risk = Math.abs(entry.mid - stop) || atr;

  const targetAt = (rMultiple: number) => (bullish ? entry.mid + risk * rMultiple : entry.mid - risk * rMultiple);
  const structureTarget = bullish ? rangeHigh : rangeLow;
  const tp1 = bullish ? Math.min(targetAt(1), structureTarget) : Math.max(targetAt(1), structureTarget);
  const takeProfits = [
    { label: "TP1", price: tp1, portionPercent: 40, rewardRisk: Math.abs(tp1 - entry.mid) / risk },
    { label: "TP2", price: targetAt(2), portionPercent: 35, rewardRisk: 2 },
    { label: "TP3", price: targetAt(3), portionPercent: 25, rewardRisk: 3 },
  ];

  const rewardRisk = takeProfits[0].rewardRisk;
  const qualityScore = confluenceScore(context, bias);
  const digit = atr < 1 ? 6 : 2;

  return {
    direction,
    qualityScore,
    entryZone: entry,
    stopLoss: stop,
    takeProfits,
    scalingIn: [
      `Enter 50% of the planned size inside the ${entry.label.toLowerCase()}.`,
      "Add the other 50% only if price holds the zone and prints a rejection candle.",
    ],
    scalingOut: [
      "Take 40% off at TP1 and move the stop to break-even.",
      "Take 35% off at TP2 and trail the remainder.",
      "Let the final 25% run to TP3 or until the trailing stop is hit.",
    ],
    breakEven: "After TP1 fills, move the stop loss to your entry price so the trade can no longer lose.",
    trailingStop: `Trail the stop behind price by about 2 x ATR (${(atr * 2).toFixed(digit)}). On a ${bullish ? "long" : "short"}, trail below the ${bullish ? "lows" : "highs"}.`,
    rewardRisk: Number(rewardRisk.toFixed(2)),
    reason: `A ${bullish ? "bullish" : "bearish"} structure with a defined invalidation zone offers roughly ${rewardRisk.toFixed(1)}R to the first target.`,
  };
}

export function computeBias(analysis: Pick<MarketAnalysis, "structure" | "indicators" | "regime">): TrendBias {
  let bull = 0;
  let bear = 0;
  if (analysis.structure.trend === "Bullish") bull += 3;
  if (analysis.structure.trend === "Bearish") bear += 3;
  const { ichimoku, supertrend, macd, movingAverages, adx } = analysis.indicators;
  if (ichimoku?.cloudBias === "Bullish") bull += 2;
  if (ichimoku?.cloudBias === "Bearish") bear += 2;
  if (supertrend?.direction === "up") bull += 2;
  if (supertrend?.direction === "down") bear += 2;
  if (macd && macd.histogram > 0) bull += 1;
  if (macd && macd.histogram < 0) bear += 1;
  if (movingAverages.sma50 !== null && movingAverages.sma200 !== null) {
    if (movingAverages.sma50 > movingAverages.sma200) bull += 1;
    else if (movingAverages.sma50 < movingAverages.sma200) bear += 1;
  }
  if (analysis.regime.cycle === "Bull") bull += 1;
  if (analysis.regime.cycle === "Bear") bear += 1;
  if (adx && adx.adx < 18) return "Sideways";
  if (Math.abs(bull - bear) <= 1) return "Sideways";
  return bull > bear ? "Bullish" : "Bearish";
}
