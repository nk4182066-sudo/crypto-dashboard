import type { Candle, FairValueGap, LiquidityZone, OrderBlock, SmartMoneyReport, StopHunt } from "./types";
import { atr } from "./indicators";
import { findSwings } from "./structure";

/** Last opposing candle before a displacement move that breaks local structure. */
export function detectOrderBlocks(candles: Candle[]): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  const atrSeries = atr(candles, 14);
  for (let index = 2; index < candles.length - 1; index += 1) {
    const atrValue = atrSeries[index];
    if (atrValue === null || atrValue === 0) continue;
    const candle = candles[index];
    const bearish = candle.close < candle.open;
    const bullish = candle.close > candle.open;
    const lookahead = candles.slice(index + 1, index + 4);
    if (lookahead.length === 0) continue;

    if (bearish) {
      const displaced = lookahead.some((item) => item.close > candle.high);
      const strongMove = Math.max(...lookahead.map((item) => item.high)) - candle.low > atrValue * 0.6;
      if (displaced && strongMove) {
        blocks.push({
          direction: "bullish",
          low: candle.low,
          high: candle.high,
          time: candle.time,
          note: "Bullish order block: last down-candle before an up displacement.",
        });
      }
    } else if (bullish) {
      const displaced = lookahead.some((item) => item.close < candle.low);
      const strongMove = candle.high - Math.min(...lookahead.map((item) => item.low)) > atrValue * 0.6;
      if (displaced && strongMove) {
        blocks.push({
          direction: "bearish",
          low: candle.low,
          high: candle.high,
          time: candle.time,
          note: "Bearish order block: last up-candle before a down displacement.",
        });
      }
    }
  }
  return blocks.slice(-6).reverse();
}

/** Three-candle imbalance where price skipped a range (Fair Value Gap / Imbalance). */
export function detectFairValueGaps(candles: Candle[], limit = 6): FairValueGap[] {
  const gaps: FairValueGap[] = [];
  for (let index = 1; index < candles.length - 1; index += 1) {
    const previous = candles[index - 1];
    const next = candles[index + 1];
    if (previous.high < next.low) {
      gaps.push({ direction: "bullish", low: previous.high, high: next.low, time: candles[index].time, filled: false });
    } else if (previous.low > next.high) {
      gaps.push({ direction: "bearish", low: next.high, high: previous.low, time: candles[index].time, filled: false });
    }
  }
  const price = candles.at(-1)!.close;
  const marked = gaps.map((gap) => ({ ...gap, filled: price <= gap.high && price >= gap.low }));
  return marked.slice(-limit).reverse();
}

/** Clusters of equal swing highs/lows where stop liquidity is assumed to rest. */
export function detectLiquidityZones(candles: Candle[], tolerancePercent = 0.25): LiquidityZone[] {
  const { highs, lows } = findSwings(candles, 2);
  const build = (points: typeof highs, kind: LiquidityZone["kind"]): LiquidityZone[] => {
    const zones: LiquidityZone[] = [];
    const used = new Set<number>();
    for (let index = 0; index < points.length; index += 1) {
      if (used.has(index)) continue;
      const base = points[index];
      const cluster = [base];
      for (let inner = index + 1; inner < points.length; inner += 1) {
        if (used.has(inner)) continue;
        const diff = Math.abs(points[inner].price - base.price) / base.price * 100;
        if (diff <= tolerancePercent) {
          cluster.push(points[inner]);
          used.add(inner);
        }
      }
      if (cluster.length >= 2) {
        const latest = cluster.at(-1)!;
        const price = cluster.reduce((total, point) => total + point.price, 0) / cluster.length;
        const swept = kind === "equalHighs"
          ? candles.some((candle) => candle.time > latest.time && candle.high > price)
          : candles.some((candle) => candle.time > latest.time && candle.low < price);
        zones.push({ kind, price, touches: cluster.length, time: latest.time, swept });
      }
    }
    return zones;
  };
  const zones = [...build(highs, "equalHighs"), ...build(lows, "equalLows")];
  return zones.sort((first, second) => second.touches - first.touches).slice(0, 6);
}

/** Liquidity sweeps / stop hunts: price raids a pool of stops then closes back inside. */
export function detectStopHunts(candles: Candle[], zones: LiquidityZone[]): StopHunt[] {
  const hunts: StopHunt[] = [];
  for (const zone of zones) {
    if (!zone.swept) continue;
    const after = candles.filter((candle) => candle.time > zone.time);
    if (after.length === 0) continue;
    const isHighPool = zone.kind === "equalHighs";
    const raid = after.find((candle) => (isHighPool ? candle.high > zone.price : candle.low < zone.price));
    if (!raid) continue;
    const reclaimed = after.find((candle) => candle.time > raid.time && (isHighPool ? candle.close < zone.price : candle.close > zone.price));
    if (!reclaimed) continue;
    hunts.push({
      direction: isHighPool ? "bullish" : "bearish",
      level: zone.price,
      sweptTo: isHighPool ? raid.high : raid.low,
      time: raid.time,
      note: isHighPool
        ? "Equal-highs liquidity was taken (buy stops triggered) and price closed back below — a classic stop hunt above resistance before a possible drop."
        : "Equal-lows liquidity was taken (sell stops triggered) and price closed back above — a classic stop hunt below support before a possible rally.",
    });
  }
  return hunts.slice(-4).reverse();
}

export function analyzeSmartMoney(candles: Candle[]): SmartMoneyReport {
  const liquidityZones = detectLiquidityZones(candles);
  return {
    orderBlocks: detectOrderBlocks(candles),
    fairValueGaps: detectFairValueGaps(candles),
    liquidityZones,
    stopHunts: detectStopHunts(candles, liquidityZones),
  };
}
