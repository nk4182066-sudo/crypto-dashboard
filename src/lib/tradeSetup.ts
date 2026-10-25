/**
 * tradeSetup.ts — 7 USDT @ 20x money management (fixed ladder).
 *
 * Position: 7 USDT × 20x = $140 notional.
 * Risk: 1.5% of entry distance → ~$2.1 loss at SL.
 *
 * Math (exact per spec):
 *   entry1  = currentPrice
 *   entry2  = BUY ? entry1 × 0.995 : entry1 × 1.005   (0.5% scale-in)
 *   stopLoss = BUY ? entry2 × (1 − 0.015) : entry2 × (1 + 0.015)   (1.5% from entry2)
 *
 *   tp1 = BUY ? entry1 × 1.0375 : entry1 × 0.9625   (3.75% → 1:2.5 R:R → $5.25)
 *   tp2 = BUY ? entry1 × 1.0525 : entry1 × 0.9475   (5.25% → 1:3.5 R:R → $7.35)
 *   tp3 = BUY ? entry1 × 1.075  : entry1 × 0.925    (7.5%  → 1:5   R:R → $10.50)
 *
 * Educational analysis only — not financial advice.
 */

export type TradeDirection = "BUY" | "SELL";

export interface TradeSetupInput {
  /** Current market price (entry 1 / aggressive entry). */
  price: number;
  /** "BUY" for long, "SELL" for short. */
  direction: TradeDirection;
  /** Leverage multiplier (default 20). */
  leverage?: number;
  /** Collateral in USDT (default 7). */
  collateralUsdt?: number;
}

export interface TradeSetupOutput {
  entry1: number;
  entry2: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  /** Fixed per spec: "1:2.5 / 1:3.5 / 1:5". */
  riskRewardRatio: string;
  /** Human-readable expected profit strings. */
  expectedProfit: string;
  /** Human-readable expected loss string. */
  expectedLoss: string;
  /** Derived fields for UI rendering. */
  riskPercent: number;
  slPercent: number;
  tp1Percent: number;
  tp2Percent: number;
  tp3Percent: number;
  slLossPercent: number;   // margin % at SL (risk × leverage)
  tp1ProfitPercent: number; // margin % at TP1
  tp2ProfitPercent: number;
  tp3ProfitPercent: number;
  positionSizeUsdt: number; // collateral × leverage
  riskAmountUsdt: number;   // collateral × riskPercent
}

/** Build the complete trade plan from current price + direction. */
export function buildTradeSetup(input: TradeSetupInput): TradeSetupOutput {
  const {
    price,
    direction = "BUY",
    leverage = 20,
    collateralUsdt = 7,
  } = input;

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`[tradeSetup] Invalid price: ${price}`);
  }

  const isBuy = direction === "BUY";
  const sign = isBuy ? 1 : -1;

  // ── Entry 1 ──
  const entry1 = price;

  // ── Entry 2 (0.5% scale-in) ──
  const entry2 = entry1 * (1 + sign * 0.005);

  // ── Stop Loss (1.5% from entry2) ──
  const stopLoss = entry2 * (1 + sign * -0.015);

  // ── Take Profits (from entry1) ──
  const tp1 = entry1 * (1 + sign * 0.0375); // 3.75%
  const tp2 = entry1 * (1 + sign * 0.0525); // 5.25%
  const tp3 = entry1 * (1 + sign * 0.075);  // 7.5%

  // ── Derived percentages ──
  const riskPercent = 1.5; // fixed 1.5%
  const slPercent = riskPercent;
  const tp1Percent = 3.75;
  const tp2Percent = 5.25;
  const tp3Percent = 7.5;

  // ── Leverage-based P&L ──
  const positionSizeUsdt = collateralUsdt * leverage;
  const riskAmountUsdt = collateralUsdt * (riskPercent / 100);
  const slLossPercent = Math.round(riskPercent * leverage); // 1.5 × 20 = 30%
  const tp1ProfitPercent = Math.round(tp1Percent * leverage); // 3.75 × 20 = 75%
  const tp2ProfitPercent = Math.round(tp2Percent * leverage); // 5.25 × 20 = 105%
  const tp3ProfitPercent = Math.round(tp3Percent * leverage); // 7.5 × 20 = 150%

  return {
    entry1,
    entry2,
    stopLoss,
    tp1,
    tp2,
    tp3,
    riskRewardRatio: "1:2.5 / 1:3.5 / 1:5",
    expectedProfit:
      "$5.25 / $7.35 / $10.5 on 7 USDT 20x",
    expectedLoss: "$2.1 on 7 USDT 20x",
    riskPercent,
    slPercent,
    tp1Percent,
    tp2Percent,
    tp3Percent,
    slLossPercent,
    tp1ProfitPercent,
    tp2ProfitPercent,
    tp3ProfitPercent,
    positionSizeUsdt,
    riskAmountUsdt,
  };
}