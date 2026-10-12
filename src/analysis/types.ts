export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SeriesPoint {
  time: number;
  value: number;
}

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  kind: "high" | "low";
}

export type Language = "English" | "Urdu" | "Roman Urdu";

export type TrendBias = "Bullish" | "Bearish" | "Sideways";

export type TimeframeKey = "15m" | "1h" | "4h" | "1d" | "1w";

export interface PriceZone {
  low: number;
  high: number;
  mid: number;
  label: string;
}

export interface MarketAnalysis {
  symbol: string;
  market: "crypto" | "forex" | "stocks";
  timeframe: string;
  generatedAt: string;
  price: number;
  structure: StructureAnalysis;
  indicators: IndicatorReport;
  chartPatterns: ChartPatternReport;
  smartMoney: SmartMoneyReport;
  volume: VolumeReport;
  regime: RegimeReport;
  risk: RiskReport;
  setup: SetupReport;
  priceAction: PriceActionReport;
  orderFlow: OrderFlowReport;
  wyckoff: WyckoffReport;
  cycle: CycleReport;
  volatility: VolatilityReport;
  time: TimeReport;
  fibonacci: FibonacciReport;
  assetClass: AssetClassReport;
  quant: QuantReport;
  psychology: PsychologyReport;
  correlation: CorrelationReport | null;
  bias: TrendBias;
  confidence: number;
  summary: string;
  whatToDo: Record<Language, WhatToDoStep[]>;
}

export interface StructureAnalysis {
  trend: TrendBias;
  lastSwingHigh: SwingPoint | null;
  lastSwingLow: SwingPoint | null;
  events: StructureEvent[];
}

export interface StructureEvent {
  type: "BOS" | "CHoCH";
  direction: "bullish" | "bearish";
  time: number;
  price: number;
  level: number;
  note: string;
}

export interface IndicatorReport {
  rsi14: number | null;
  macd: { line: number; signal: number; histogram: number } | null;
  stochasticRsi: { k: number; d: number } | null;
  atr14: number | null;
  atrPercent: number | null;
  adx: { adx: number; plusDI: number; minusDI: number } | null;
  obv: number | null;
  obvTrend: TrendBias;
  cmf: number | null;
  ichimoku: IchimokuReport | null;
  supertrend: { value: number; direction: "up" | "down" } | null;
  parabolicSar: { value: number; direction: "up" | "down" } | null;
  pivotPoints: PivotReport | null;
  bollinger: { upper: number; middle: number; lower: number; widthPercent: number } | null;
  movingAverages: { sma20: number | null; sma50: number | null; sma200: number | null; ema21: number | null };
}

export interface IchimokuReport {
  tenkan: number | null;
  kijun: number | null;
  senkouA: number | null;
  senkouB: number | null;
  chikou: number | null;
  cloudBias: TrendBias;
}

export interface PivotReport {
  method: "classic" | "fibonacci";
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface ChartPatternReport {
  harmonics: HarmonicMatch[];
  elliott: ElliottReport | null;
  classical: ClassicalPattern[];
}

export interface ClassicalPattern {
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  neckline: number | null;
  note: string;
  points: { time: number; price: number }[];
}

export interface HarmonicMatch {
  name: string;
  direction: "bullish" | "bearish";
  completionPrice: number;
  points: { time: number; price: number }[];
  ratios: { xab: number; abc: number; bcd: number; xad: number };
  score: number;
}

export interface ElliottReport {
  label: string;
  count: { label: string; time: number; price: number }[];
  note: string;
}

export interface SmartMoneyReport {
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  liquidityZones: LiquidityZone[];
  stopHunts: StopHunt[];
}

/** Liquidity sweep / stop hunt: price raids a pool of stops and closes back inside. */
export interface StopHunt {
  direction: "bullish" | "bearish";
  level: number;
  sweptTo: number;
  time: number;
  note: string;
}

export interface OrderBlock {
  direction: "bullish" | "bearish";
  low: number;
  high: number;
  time: number;
  note: string;
}

export interface FairValueGap {
  direction: "bullish" | "bearish";
  low: number;
  high: number;
  time: number;
  filled: boolean;
}

export interface LiquidityZone {
  kind: "equalHighs" | "equalLows";
  price: number;
  touches: number;
  time: number;
  swept: boolean;
}

export interface VolumeReport {
  poc: number;
  valueAreaHigh: number;
  valueAreaLow: number;
  rows: { price: number; volume: number; buy: number; sell: number }[];
  vwap: number | null;
  vwapBias: TrendBias;
}

export interface RegimeReport {
  type: "Trending" | "Ranging";
  volatility: "High" | "Normal" | "Low";
  cycle: "Bull" | "Bear" | "Neutral";
  efficiencyRatio: number;
  note: string;
}

export interface RiskReport {
  positionSizing: {
    riskCash: number;
    stopDistance: number;
    positionSize: number;
    notional: number;
    riskReward: number | null;
  } | null;
  kelly: { fraction: number; half: number; edgePercent: number; note: string } | null;
  riskOfRuin: { probability: number; note: string } | null;
  drawdown: { maxDrawdownPercent: number; currentDrawdownPercent: number; note: string } | null;
  warnings: string[];
}

export interface SetupReport {
  direction: "buy" | "sell" | "wait";
  qualityScore: number;
  entryZone: PriceZone | null;
  stopLoss: number | null;
  takeProfits: { label: string; price: number; portionPercent: number; rewardRisk: number }[];
  scalingIn: string[];
  scalingOut: string[];
  breakEven: string;
  trailingStop: string;
  rewardRisk: number | null;
  reason: string;
}

export interface WhatToDoStep {
  step: number;
  action: string;
  detail: string;
}

export interface CandlePatternSignal {
  time: number;
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  strength: number;
  explanation: string;
}

export interface PriceActionReport {
  signals: CandlePatternSignal[];
  wick: { upperRatio: number; lowerRatio: number; bodyRatio: number; reading: string };
  psychology: string;
  pressure: number;
}

export interface FootprintRow {
  price: number;
  buy: number;
  sell: number;
  delta: number;
}

export interface OrderFlowReport {
  candleDelta: number;
  cumulativeDelta: number;
  deltaTrend: "buyers" | "sellers" | "balanced";
  footprint: FootprintRow[];
  absorption: string | null;
  imbalance: string | null;
  note: string;
}

export interface WyckoffReport {
  phase: "Accumulation" | "Markup" | "Distribution" | "Markdown" | "Neutral";
  powerOf3: { accumulation: number; manipulation: number; distribution: number };
  note: string;
}

export interface CycleReport {
  bitcoin: {
    lastHalving: string;
    nextHalving: string;
    daysToNext: number;
    progress: number;
    phase: string;
  } | null;
  fourYear: { day: number; percent: number; phase: string };
  seasonality: {
    month: number;
    monthName: string;
    historicalReturn: number | null;
    bestMonth: string;
    worstMonth: string;
    weekdayBias: string;
  };
  note: string;
}

export interface CorrelationPair {
  key: string;
  correlation: number;
  beta: number;
  /** Which of the five asset classes this benchmark represents. */
  assetClass: AssetClassKey;
  note: string;
}

/** The five tracked cross-market classes. */
export type AssetClassKey = "crypto" | "forex" | "stocks" | "commodities" | "metals";

/** A global macro driver and how it is currently pushing the market. */
export interface MacroIndicator {
  key: string;
  label: string;
  /** "headwind" tightens conditions, "tailwind" eases them, "neutral" is flat. */
  stance: "tailwind" | "headwind" | "neutral";
  /** Change over the measured window, in percent. Null when not measurable. */
  changePercent: number | null;
  note: string;
}

export interface CorrelationReport {
  pairs: CorrelationPair[];
  /** Cross-market coverage actually measured. */
  coverage: AssetClassKey[];
  macro: MacroIndicator[];
  note: string;
}

export interface VolatilityReport {
  realizedPercent: number;
  annualizedPercent: number;
  percentile: number;
  bollingerSqueeze: boolean;
  squeezeNote: string;
  vixProxy: number;
  regime: "Expansion" | "Compression" | "Normal";
  note: string;
}

export interface TimeReport {
  utcHour: number;
  session: string;
  killZone: boolean;
  killZoneName: string;
  openingRange: { high: number; low: number; status: "Above" | "Below" | "Inside" } | null;
  bestHour: number | null;
  worstHour: number | null;
  note: string;
}

export interface FibonacciLevel {
  label: string;
  ratio: number;
  price: number;
}

export interface FibonacciReport {
  swingHigh: number;
  swingLow: number;
  trend: TrendBias;
  retracement: FibonacciLevel[];
  extension: FibonacciLevel[];
  fan: FibonacciLevel[];
  goldenPocket: { low: number; high: number };
  note: string;
}

export interface AssetClassReport {
  assetClass: "Crypto" | "Forex" | "Stocks" | "Commodities" | "Bonds";
  hours: string;
  volatilityProfile: string;
  primaryDriver: string;
  note: string;
}

export interface QuantReport {
  sharpe: number | null;
  sortino: number | null;
  expectancyPercent: number | null;
  maxDrawdownPercent: number;
  profitFactor: number | null;
  monteCarlo: { p5: number; p50: number; p95: number } | null;
  note: string;
}

export interface PsychologyFlag {
  score: number;
  active: boolean;
  evidence: string;
}

export interface PsychologyReport {
  fomo: PsychologyFlag;
  capitulation: PsychologyFlag;
  euphoria: PsychologyFlag;
  discipline: string[];
  note: string;
}

/** A dated historical market episode used as a structural reference point. */
export interface HistoricalEpoch {
  id: string;
  label: string;
  market: "crypto" | "stocks" | "forex";
  kind: "Bull run" | "Crash" | "Macro";
  start: string;
  peak: string;
  trough: string;
  /** Peak-to-trough decline in percent (positive number) for crash episodes. */
  drawdownPercent: number;
  /** Peak-to-peak gain in percent for bull-run episodes. */
  gainPercent: number;
  durationDays: number;
  trigger: string;
  /** What actually happened next, so the module can compare rather than predict. */
  aftermath: string;
  /** The single most transferable lesson. */
  lesson: string;
}

/** How the live market lines up with one stored epoch. */
export interface EpochMatch {
  epoch: HistoricalEpoch;
  similarity: number;
  shared: string[];
  differing: string[];
  note: string;
}

export interface HistoricalContextReport {
  assetClass: string;
  epochs: HistoricalEpoch[];
  matches: EpochMatch[];
  /** Position inside the current multi-year cycle, 0-100. */
  cyclePosition: number;
  cycleLabel: string;
  repetition: {
    detected: boolean;
    similarity: number;
    summary: string;
  };
  lessons: string[];
  note: string;
}
