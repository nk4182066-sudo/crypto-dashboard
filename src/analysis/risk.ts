export interface PositionSizingInput {
  balance: number;
  riskPercent: number;
  entry: number;
  stopLoss: number;
  takeProfit?: number | null;
}

export interface PositionSizingResult {
  riskCash: number;
  stopDistance: number;
  positionSize: number;
  notional: number;
  riskReward: number | null;
}

export function positionSizing({ balance, riskPercent, entry, stopLoss, takeProfit = null }: PositionSizingInput): PositionSizingResult | null {
  const stopDistance = Math.abs(entry - stopLoss);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0 || balance <= 0) return null;
  const riskCash = balance * (riskPercent / 100);
  const positionSize = riskCash / stopDistance;
  const notional = positionSize * entry;
  const riskReward = takeProfit !== null && stopDistance > 0 ? Math.abs(takeProfit - entry) / stopDistance : null;
  return { riskCash, stopDistance, positionSize, notional, riskReward };
}

export interface KellyResult {
  fraction: number;
  half: number;
  edgePercent: number;
  note: string;
}

export function kellyCriterion(winRate: number, rewardRisk: number): KellyResult | null {
  if (winRate <= 0 || winRate >= 1 || rewardRisk <= 0) return null;
  const fraction = winRate - (1 - winRate) / rewardRisk;
  const edgePercent = (winRate * rewardRisk - (1 - winRate)) * 100;
  const note = fraction <= 0
    ? "Negative edge at these inputs — the formula says do not bet. Improve win rate or reward:risk first."
    : `Full Kelly suggests ${(fraction * 100).toFixed(1)}% of capital per trade. Most professionals use half-Kelly or less.`;
  return { fraction, half: fraction / 2, edgePercent, note };
}

function seededRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export interface RiskOfRuinInput {
  winRate: number;
  rewardRisk: number;
  riskPercentPerTrade: number;
  ruinDrawdownPercent: number;
  runs?: number;
  tradesPerRun?: number;
}

/** Monte Carlo estimate of the chance of hitting a ruin drawdown threshold. */
export function riskOfRuin({ winRate, rewardRisk, riskPercentPerTrade, ruinDrawdownPercent, runs = 2000, tradesPerRun = 300 }: RiskOfRuinInput) {
  if (winRate <= 0 || winRate >= 1 || rewardRisk <= 0 || riskPercentPerTrade <= 0) return null;
  const random = seededRandom(42);
  const risk = riskPercentPerTrade / 100;
  const ruinLevel = 1 - ruinDrawdownPercent / 100;
  let ruined = 0;
  for (let run = 0; run < runs; run += 1) {
    let equity = 1;
    let busted = false;
    for (let trade = 0; trade < tradesPerRun; trade += 1) {
      if (random() < winRate) equity += equity * risk * rewardRisk;
      else equity -= equity * risk;
      if (equity <= ruinLevel) {
        busted = true;
        break;
      }
    }
    if (busted) ruined += 1;
  }
  const probability = ruined / runs;
  const note = probability < 0.05
    ? "Risk of ruin is low at this size. Keep it here or smaller."
    : probability < 0.2
      ? "Moderate risk of ruin — reduce position size or risk per trade."
      : "High risk of ruin — this size will eventually blow the account. Cut risk immediately.";
  return { probability: Number(probability.toFixed(4)), note };
}

export interface DrawdownResult {
  maxDrawdownPercent: number;
  currentDrawdownPercent: number;
  note: string;
}

export function analyzeDrawdown(equityCurve: number[]): DrawdownResult | null {
  if (equityCurve.length < 2) return null;
  let peak = equityCurve[0];
  let maxDrawdown = 0;
  for (const equity of equityCurve) {
    peak = Math.max(peak, equity);
    const drawdown = peak === 0 ? 0 : ((peak - equity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  const last = equityCurve.at(-1)!;
  const currentDrawdown = peak === 0 ? 0 : ((peak - last) / peak) * 100;
  return {
    maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
    currentDrawdownPercent: Number(currentDrawdown.toFixed(2)),
    note: `Largest peak-to-trough fall was ${maxDrawdown.toFixed(1)}%. Size positions so a normal losing streak stays inside your comfort zone.`,
  };
}
