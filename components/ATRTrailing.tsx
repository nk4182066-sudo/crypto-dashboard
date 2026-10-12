// Educational tool for learning risk management.
// Not financial advice.
import React from "react";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ATRTrailingProps {
  candles: Candle[];
  currentPrice: number;
  direction: "long" | "short";
}

export interface ATRTrailingResult {
  atr: number;
  trailingSL: number;
  distance: number;
  distancePercent: number;
}

const ATR_PERIOD = 14;
const MULTIPLIER = 2;

function calculateATR(candles: Candle[], period = ATR_PERIOD): number {
  if (candles.length < 2) return 0;
  const window = candles.slice(-(period + 1));
  const trs: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const prevClose = window[i - 1].close;
    trs.push(
      Math.max(
        window[i].high - window[i].low,
        Math.abs(window[i].high - prevClose),
        Math.abs(window[i].low - prevClose)
      )
    );
  }
  return trs.reduce((sum, tr) => sum + tr, 0) / (trs.length || 1);
}

function compute(
  candles: Candle[],
  currentPrice: number,
  direction: "long" | "short"
): ATRTrailingResult {
  if (candles.length === 0) {
    return { atr: 0, trailingSL: 0, distance: currentPrice, distancePercent: 100 };
  }
  const atr = calculateATR(candles);
  const window = candles.slice(-ATR_PERIOD);
  const trailingSL =
    direction === "long"
      ? Math.max(...window.map((c) => c.high)) - atr * MULTIPLIER
      : Math.min(...window.map((c) => c.low)) + atr * MULTIPLIER;
  const distance = Math.abs(currentPrice - trailingSL);
  const distancePercent = currentPrice > 0 ? (distance / currentPrice) * 100 : 0;
  return { atr, trailingSL, distance, distancePercent };
}

const ATRTrailing: React.FC<ATRTrailingProps> = ({
  candles,
  currentPrice,
  direction,
}) => {
  const result = React.useMemo(
    () => compute(candles, currentPrice, direction),
    [candles, currentPrice, direction]
  );
  const isLong = direction === "long";

  return (
    <section
      aria-label="ATR trailing stop-loss"
      className="border border-zinc-800 bg-zinc-950/60 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">ATR Trailing SL</h3>
        <span className="text-xs text-zinc-500">
          {isLong ? "Long" : "Short"} · ATR {ATR_PERIOD} × {MULTIPLIER}
        </span>
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-zinc-400">Current ATR</dt>
          <dd className="text-white">{result.atr.toFixed(4)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-400">Trailing SL</dt>
          <dd className={isLong ? "text-emerald-400" : "text-red-400"}>
            {result.trailingSL.toFixed(4)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-400">Distance</dt>
          <dd className="text-zinc-200">{result.distance.toFixed(4)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-400">Distance %</dt>
          <dd className="text-amber-300">{result.distancePercent.toFixed(2)}%</dd>
        </div>
      </dl>
    </section>
  );
};

export { calculateATR };
export default ATRTrailing;
