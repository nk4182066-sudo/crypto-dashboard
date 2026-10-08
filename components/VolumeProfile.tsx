// Educational analysis only. Not financial advice.
import React from "react";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistogramBin {
  price: number;
  volume: number;
}

export interface VolumeProfileResult {
  poc: number; // Point of Control - highest volume level
  vah: number; // Value Area High
  val: number; // Value Area Low
  histogram: HistogramBin[];
}

interface VolumeProfileProps {
  candles: Candle[];
}

const BIN_COUNT = 20;
const VALUE_AREA_PCT = 0.7; // value area covers ~70% of total volume

function calculateProfile(candles: Candle[]): VolumeProfileResult | null {
  if (candles.length === 0) return null;

  const minPrice = Math.min(...candles.map((c) => c.low));
  const maxPrice = Math.max(...candles.map((c) => c.high));
  const binSize = (maxPrice - minPrice) / BIN_COUNT || 1;

  const volumes = new Array<number>(BIN_COUNT).fill(0);
  for (const candle of candles) {
    const index = Math.min(
      BIN_COUNT - 1,
      Math.max(0, Math.floor((candle.close - minPrice) / binSize))
    );
    volumes[index] += candle.volume;
  }

  const histogram: HistogramBin[] = volumes.map((volume, i) => ({
    price: minPrice + binSize * (i + 0.5),
    volume,
  }));

  // POC = bin with the highest volume
  let pocIndex = 0;
  for (let i = 1; i < BIN_COUNT; i++) {
    if (volumes[i] > volumes[pocIndex]) pocIndex = i;
  }

  // Value area: expand outward from POC until 70% of volume is covered
  const totalVolume = volumes.reduce((sum, v) => sum + v, 0);
  let covered = volumes[pocIndex];
  let low = pocIndex;
  let high = pocIndex;
  while (covered < totalVolume * VALUE_AREA_PCT && (low > 0 || high < BIN_COUNT - 1)) {
    const below = low > 0 ? volumes[low - 1] : -1;
    const above = high < BIN_COUNT - 1 ? volumes[high + 1] : -1;
    if (above >= below) {
      high++;
      covered += volumes[high];
    } else {
      low--;
      covered += volumes[low];
    }
  }

  return {
    poc: histogram[pocIndex].price,
    vah: minPrice + binSize * (high + 1),
    val: minPrice + binSize * low,
    histogram,
  };
}

const VolumeProfile: React.FC<VolumeProfileProps> = ({ candles }) => {
  const profile = React.useMemo(() => calculateProfile(candles), [candles]);

  // Part B will render the histogram visually; logic only for now.
  void profile;
  return null;
};

export { calculateProfile };
export default VolumeProfile;
