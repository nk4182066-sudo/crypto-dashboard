"use client";

/**
 * Volume bars show trading activity.
 * Higher bars = more market activity at that time.
 * Educational visual only.
 */

import { useEffect, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

export interface VolumeCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolumeBarsProps {
  /** OHLCV candles, ordered oldest to newest. */
  candles: VolumeCandle[];
  /** Chart height in pixels. Defaults to 120 so it reads as a sub-panel. */
  height?: number;
  className?: string;
}

/**
 * Standalone volume histogram drawn beneath the main price chart.
 *
 * This renders its own lightweight-charts instance rather than sharing the
 * parent chart, so it stays independent of the price series. Time values are
 * reused verbatim from the input candles, which is what keeps the two charts on
 * the same time axis and lets a crosshair line up with the bars above it.
 */
export default function VolumeBars({ candles, height = 120, className }: VolumeBarsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      height,
      // Matches the surrounding dark UI; transparent keeps the panel seamless.
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: { visible: false },
      timeScale: {
        // Aligns the axis with the main chart's timestamps.
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        // Vertical line only, so it lines up with the candle it points at.
        horzLine: { visible: false },
        vertLine: { visible: true, labelVisible: true, color: "#52525b" },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // Recreated only when the height changes; data updates go through the
    // effect below so the chart instance (and its zoom state) is preserved.
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    // Bar height is proportional to volume relative to the busiest bar, which
    // keeps the shape meaningful across instruments and timeframes.
    const peak = candles.reduce((max, candle) => Math.max(max, candle.volume), 0);
    if (!Number.isFinite(peak) || peak <= 0) {
      series.setData([]);
      return;
    }

    series.setData(
      candles
        // Invalid rows would make setData throw and blank the whole panel.
        .filter((candle) => Number.isFinite(candle.volume) && Number.isFinite(candle.time))
        .map((candle) => ({
          time: candle.time as UTCTimestamp,
          value: candle.volume,
          color: candle.close > candle.open ? "#26a69a" : candle.close < candle.open ? "#ef5350" : "#71717a",
        })),
    );
  }, [candles]);

  return (
    <div
      ref={containerRef}
      className={className ?? "w-full"}
      style={{ height }}
      role="img"
      aria-label="Volume bars showing trading activity over time"
    />
  );
}