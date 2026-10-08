// Educational analysis only. Not financial advice.
import React from "react";

export interface Zone {
  type: "demand" | "supply";
  priceHigh: number;
  priceLow: number;
  strength: number; // 0..1
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SmartMoneyZonesProps {
  candles: Candle[];
  currentPrice: number;
}

// Detects consolidation areas in the last 50 candles.
// Tight ranges below current price -> Demand Zone, above -> Supply Zone.
function detectZones(candles: Candle[], currentPrice: number): Zone[] {
  const recent = candles.slice(-50);
  const zones: Zone[] = [];
  const windowSize = 10;
  const maxRangePct = 1; // consolidation = range within 1% of window low

  for (let i = 0; i + windowSize <= recent.length; i += windowSize) {
    const window = recent.slice(i, i + windowSize);
    const priceHigh = Math.max(...window.map((c) => c.high));
    const priceLow = Math.min(...window.map((c) => c.low));
    const rangePct = ((priceHigh - priceLow) / priceLow) * 100;

    if (rangePct > maxRangePct) continue; // not consolidation
    if (priceHigh >= currentPrice && priceLow <= currentPrice) continue; // overlaps price

    const type: Zone["type"] = priceHigh < currentPrice ? "demand" : "supply";
    const strength = Math.max(0, Math.min(1, 1 - rangePct / maxRangePct));

    zones.push({ type, priceHigh, priceLow, strength });
  }

  return zones;
}

const SmartMoneyZones: React.FC<SmartMoneyZonesProps> = ({
  candles,
  currentPrice,
}) => {
  const zones = React.useMemo(
    () => detectZones(candles, currentPrice),
    [candles, currentPrice]
  );

  // Part B will render the zones visually. Skeleton only for now.
  return null;
};

export { detectZones };
export default SmartMoneyZones;
