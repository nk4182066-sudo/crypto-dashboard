"use client";

/**
 * Candlestick patterns are visual shapes formed by
 * 1-3 candles. They indicate potential market sentiment.
 * Educational analysis only. Not financial advice.
 */

import { useMemo } from "react";
import {
  isBullishEngulfing,
  isDoji,
  isHammer,
  isShootingStar,
  isBearishEngulfing,
  type DetectorCandle,
} from "@/src/lib/chart/candlestickDetector";

export interface CandlePattern {
  time: number;
  type: "Doji" | "Hammer" | "Shooting Star" | "Bullish Engulfing" | "Bearish Engulfing";
  /** Price the marker is anchored to (wick extreme for reversals, close for doji). */
  price: number;
  label: string;
  direction: "bullish" | "bearish" | "neutral";
}

export interface CandlePatternsProps {
  candles: DetectorCandle[];
  /** How many recent candles to scan. */
  lookback?: number;
  className?: string;
}

const COLORS = {
  bullish: "#26a69a",
  bearish: "#ef5350",
  neutral: "#71717a",
} as const;

/**
 * Scans the tail of the series and returns at most one pattern per candle.
 *
 * The geometry predicates are imported from the shared detector rather than
 * reimplemented, so this component and the main chart agree on what counts as
 * a Hammer. Only a five-shape subset is covered here, which is all the badge
 * row needs.
 */
export function detectPatterns(candles: DetectorCandle[], lookback = 50): CandlePattern[] {
  const bars = candles.filter(
    (candle) =>
      Number.isFinite(candle.time) &&
      candle.high >= candle.low &&
      candle.high >= Math.max(candle.open, candle.close) &&
      candle.low <= Math.min(candle.open, candle.close),
  );

  const found: CandlePattern[] = [];
  for (let index = Math.max(1, bars.length - lookback); index < bars.length; index += 1) {
    const current = bars[index];
    const previous = bars[index - 1];
    if (!current || !previous) continue;

    if (isBullishEngulfing(previous, current)) {
      found.push({ time: current.time, type: "Bullish Engulfing", price: current.high, label: "Bullish Engulfing", direction: "bullish" });
    } else if (isBearishEngulfing(previous, current)) {
      found.push({ time: current.time, type: "Bearish Engulfing", price: current.low, label: "Bearish Engulfing", direction: "bearish" });
    } else if (isHammer(current)) {
      found.push({ time: current.time, type: "Hammer", price: current.low, label: "Hammer", direction: "bullish" });
    } else if (isShootingStar(current)) {
      found.push({ time: current.time, type: "Shooting Star", price: current.high, label: "Shooting Star", direction: "bearish" });
    } else if (isDoji(current)) {
      found.push({ time: current.time, type: "Doji", price: current.close, label: "Doji", direction: "neutral" });
    }
  }
  return found.sort((a, b) => a.time - b.time);
}

/**
 * Compact badge row listing the patterns found in the most recent candles.
 *
 * This is a standalone readout rather than chart markers: the main chart already
 * draws its own series markers, and duplicating them here would re-introduce the
 * label noise the conviction filter was built to remove. To place these on a
 * chart instead, convert them with `toSeriesMarkers` and attach via
 * `createSeriesMarkers`.
 */
export default function CandlePatterns({ candles, lookback = 50, className }: CandlePatternsProps) {
  const patterns = useMemo(() => detectPatterns(candles, lookback), [candles, lookback]);

  if (patterns.length === 0) {
    return (
      <div className={className ?? "rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500"}>
        No clear candlestick patterns in the last {lookback} candles.
      </div>
    );
  }

  return (
    <ul className={className ?? "flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"}>
      {patterns.map((pattern) => (
        <li
          key={`${pattern.type}:${pattern.time}`}
          className="flex items-center gap-1.5 rounded-md bg-zinc-800/70 px-2 py-1 text-[11px] text-zinc-200"
          title={`${pattern.label} · ${pattern.direction}`}
        >
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: COLORS[pattern.direction] }}
          />
          {pattern.label}
        </li>
      ))}
    </ul>
  );
}