"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  syncSignalLines,
  type SignalLine,
  type TrackedSignalLine,
} from "@/src/lib/chart/levelLines";
import {
  detectAndBuildMarkers,
  toSeriesMarkers,
  type DetectedPattern,
} from "@/src/lib/chart/candlestickDetector";
import { detectChartPatterns } from "@/src/lib/chart/patternDetector";
import { rsi } from "@/src/analysis/indicators";
import { parseAiChartAnalysis } from "@/src/lib/chart/aiChartParser";
import PatternOverlay from "@/components/PatternOverlay";
import ChartLegend from "@/components/ChartLegend";

export type { SignalLine, SignalLineKind } from "@/src/lib/chart/levelLines";
export type { DetectedPattern } from "@/src/lib/chart/candlestickDetector";

export interface KuCoinCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type KuCoinTimeframe = "15m" | "1h" | "4h" | "1D";

export interface KuCoinChartProps {
  data: KuCoinCandle[];
  symbol?: string;
  timeframe: KuCoinTimeframe;
  onTimeframeChange?: (timeframe: KuCoinTimeframe) => void;
  /** Seconds each candle spans; used to format the crosshair axis label. */
  timeframeSeconds?: number;
  height?: number;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  /** Horizontal levels (support/resistance/entry/SL/TP/reversal) to draw. */
  levels?: SignalLine[];
  /** Detected candle patterns to annotate. Detected internally when omitted. */
  patterns?: DetectedPattern[];
  /** Set false to hide pattern markers even when `patterns` is supplied. */
  showPatterns?: boolean;
  /** Draw trendlines and chart-pattern geometry over the candles. */
  showGeometry?: boolean;
  /** Raw AI analysis payload (JSON or a fenced string) to draw from. */
  aiAnalysis?: unknown;
  /** Real candle envelope used to reject out-of-range AI levels. */
  priceRange?: { min: number; max: number };
}

const TIMEFRAMES: KuCoinTimeframe[] = ["15m", "1h", "4h", "1D"];

const TIMEFRAME_SECONDS: Record<KuCoinTimeframe, number> = {
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1D": 24 * 60 * 60,
};

/** KuCoin-style dark palette. */
const THEME = {
  background: "#0d1117",
  grid: "#161b22",
  text: "#d1d4dc",
  muted: "#8b949e",
  up: "#089981",
  down: "#f23645",
  border: "#2b3139",
  crosshair: "#8b949e",
} as const;

const UP_FILL = "rgba(8, 153, 129, 0.5)";
const DOWN_FILL = "rgba(242, 54, 69, 0.5)";

interface TooltipRow {
  label: string;
  value: string;
  tone?: "up" | "down";
}

/** Enough precision for both BTC and sub-cent altcoins. */
function formatPrice(value: number): string {
  const magnitude = Math.abs(value);
  const digits = magnitude >= 1000 ? 2 : magnitude >= 1 ? 3 : magnitude >= 0.01 ? 5 : 8;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatVolume(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

/**
 * Intraday bars read better with a clock, daily bars with a full date. Fixed to
 * UTC so the label matches the exchange timestamps rather than shifting with the
 * viewer's machine.
 */
function formatAxisTime(time: number, timeframe: KuCoinTimeframe): string {
  const date = new Date(time * 1000);
  if (timeframe === "1D") {
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

export default function KuCoinChart({
  data,
  symbol = "",
  timeframe,
  onTimeframeChange,
  timeframeSeconds,
  height = 520,
  loading = false,
  error = "",
  onRetry,
  levels = [],
  patterns,
  showPatterns = true,
  showGeometry = true,
  aiAnalysis,
  priceRange,
}: KuCoinChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const signalLinesRef = useRef<TrackedSignalLine[]>([]);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  // Mirrors of the refs above, so the geometry overlay can re-render once the
  // chart instance exists.
  const [chartInstance, setChartInstance] = useState<IChartApi | null>(null);
  const [seriesInstance, setSeriesInstance] = useState<ISeriesApi<"Candlestick"> | null>(null);

  const [crosshair, setCrosshair] = useState<TooltipRow[] | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ left: number; top: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const candleSeconds = timeframeSeconds ?? TIMEFRAME_SECONDS[timeframe];

  // Series data is memoised on the incoming candles. Recomputing every render
  // would hand the chart a new array identity and force a full repaint.
  const { candles, volumes, latest } = useMemo(() => {
    const sorted = [...data]
      .filter((row) => [row.time, row.open, row.high, row.low, row.close].every(Number.isFinite))
      .sort((first, second) => first.time - second.time);

    return {
      candles: sorted.map((row) => ({
        time: row.time as UTCTimestamp,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
      })),
      volumes: sorted.map((row) => ({
        time: row.time as UTCTimestamp,
        value: Number.isFinite(row.volume) ? row.volume : 0,
        color: row.close >= row.open ? UP_FILL : DOWN_FILL,
      })),
      latest: sorted.at(-1) ?? null,
    };
  }, [data]);

  // Build the chart once. Price and volume sit in two panes sharing a single
  // time scale, so zoom and pan stay synchronised without manual syncing.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: THEME.background },
        textColor: THEME.text,
        fontFamily: "inherit",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: THEME.grid, style: LineStyle.Solid },
        horzLines: { color: THEME.grid, style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: THEME.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: THEME.up },
        horzLine: { color: THEME.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: THEME.up },
      },
      rightPriceScale: {
        borderColor: THEME.border,
        scaleMargins: { top: 0.08, bottom: 0.26 },
      },
      timeScale: {
        borderColor: THEME.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        minBarSpacing: 0.5,
        maxBarSpacing: 40,
        lockVisibleTimeRangeOnResize: true,
      },
      // Momentum-based panning so a flick keeps gliding briefly, which reads
      // more like a native trading terminal than a rigid 1:1 drag.
      kineticScroll: { touch: true, mouse: true },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
        axisDoubleClickReset: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: THEME.up,
      downColor: THEME.down,
      borderVisible: false,
      wickUpColor: THEME.up,
      wickDownColor: THEME.down,
      priceLineVisible: true,
      priceLineColor: THEME.muted,
      lastValueVisible: true,
    }, 0);

    // Pane 1 is volume. Its own price scale stays hidden and is squashed to the
    // bottom via scaleMargins so it never steals space from the candles.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    }, 1);

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      visible: false,
    });
    chart.panes()[1]?.setHeight(Math.round(height * 0.22));

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    // Mirrored into state so the overlay re-renders once the chart exists;
    // refs alone would not trigger a render.
    setChartInstance(chart);
    setSeriesInstance(candleSeries);

    // Pattern markers attach to the candle series. Created empty here and
    // filled by the detection effect once data arrives.
    markersRef.current = createSeriesMarkers(candleSeries, [], {
      // Keep markers inside the visible range instead of stretching the scale.
      zOrder: "normal",
    });

    return () => {
      // `chart.remove()` disposes the series and their price lines with it, so
      // the ref only needs clearing here.
      signalLinesRef.current = [];
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersRef.current = null;
      setChartInstance(null);
      setSeriesInstance(null);
    };
  }, [height]);

  // Push data into the series. Symbol/timeframe are in the deps so a change
  // reframes the visible range instead of inheriting the previous window.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const timeScale = chartRef.current?.timeScale();
    if (!candleSeries || !volumeSeries || !timeScale) return;

    candleSeries.setData(candles);
    volumeSeries.setData(volumes);

    if (candles.length === 0) return;
    if (candles.length > 120) {
      timeScale.setVisibleLogicalRange({ from: candles.length - 120, to: candles.length + 4 });
    } else {
      timeScale.fitContent();
    }
  }, [candles, volumes, symbol, timeframe]);
// Candlestick pattern markers. Detection is memoised on the candles, and the
  // marker array identity is stable so `setMarkers` is not re-run on every
  // unrelated re-render.
  //
  // RSI and the chart's own support/resistance levels are handed to the
  // detector so a pattern is only labelled when it appears where a reversal is
  // plausible, rather than on every candle that merely matches a shape.
  const candleRsi = useMemo(() => rsi(data.map((candle) => candle.close), 14), [data]);
  const detectedPatterns = useMemo(
    () => (patterns ?? detectAndBuildMarkers(data, {
      rsi: candleRsi,
      support: levels.filter((level) => level.kind === "support").map((level) => level.price),
      resistance: levels.filter((level) => level.kind === "resistance").map((level) => level.price),
    }).patterns),
    [patterns, data, candleRsi, levels]
  );
  const patternMarkers = useMemo(
    () => (showPatterns ? toSeriesMarkers(detectedPatterns) : []),
    [showPatterns, detectedPatterns]
  );

  useEffect(() => {
    markersRef.current?.setMarkers(patternMarkers);
  }, [patternMarkers]);

  // Trendlines + chart-pattern geometry, derived from the candles already
  // memoised above so detection only re-runs when the series actually changes.
  const geometry = useMemo(() => detectChartPatterns(data, 3), [data]);

  // Phase 5 — AI levels are merged with the caller-supplied ones. AI entries
  // come last so the legend reads support/resistance, then the trade plan.
  const aiParsed = useMemo(
    () => parseAiChartAnalysis(aiAnalysis, {
      range: priceRange,
      from: data[0]?.time ?? 0,
      to: data.at(-1)?.time ?? 0,
    }),
    [aiAnalysis, priceRange, data]
  );

  const mergedLevels = useMemo(() => {
    const existing = new Set(levels.map((level) => `${level.kind}:${level.price}`));
    return [...levels, ...aiParsed.lines.filter((level) => !existing.has(`${level.kind}:${level.price}`))];
  }, [levels, aiParsed.lines]);

  const mergedShapes = useMemo(
    () => [...geometry.shapes, ...aiParsed.shapes],
    [geometry.shapes, aiParsed.shapes]
  );

  // Horizontal signal lines. `levelsSignature` collapses the array to a string
  // so a parent re-render that rebuilds an identical array with the same
  // prices does not churn the chart; only genuine price changes resync.
  const levelsSignature = useMemo(
    () => mergedLevels.map((level) => `${level.kind}:${level.label ?? ""}:${level.price}:${level.color ?? ""}`).join("|"),
    [mergedLevels]
  );

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    const next = syncSignalLines(candleSeries, mergedLevels, signalLinesRef.current);
    signalLinesRef.current = next;
  }, [levelsSignature]);

  // Crosshair readout. Unsubscribing on cleanup stops a detached chart from
  // writing into state when the timeframe or series is replaced.
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;

    const handler = (param: MouseEventParams<Time>) => {
      const bar = param.seriesData.get(candleSeries) as
        | { open?: number; high?: number; low?: number; close?: number }
        | undefined;
      if (!bar || param.point === undefined) {
        setCrosshair(null);
        setHoverPoint(null);
        return;
      }
      const close = bar.close ?? 0;
      const open = bar.open ?? 0;
      setCrosshair([
        { label: "O", value: formatPrice(open), tone: open >= close ? "up" : "down" },
        { label: "H", value: formatPrice(bar.high ?? 0), tone: "up" },
        { label: "L", value: formatPrice(bar.low ?? 0), tone: "down" },
        { label: "C", value: formatPrice(close), tone: close >= open ? "up" : "down" },
      ]);
      setHoverPoint({ left: param.point.x, top: param.point.y });
    };

    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [candles, timeframe]);

  // Keep the volume pane proportioned when the window resizes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const onResize = () => chart.panes()[1]?.setHeight(Math.round(height * 0.22));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [height]);

  // Mirror the real fullscreen state so Escape — which the user can press
  // without touching our button — still updates the label correctly.
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const element = wrapperRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else await element.requestFullscreen();
    } catch (error) {
      // CSS-only full bleed so the button is never a dead control.
      console.error("Fullscreen request failed:", error);
      setIsFullscreen((current) => !current);
    }
  }, []);

  const isEmpty = candles.length === 0;
  const containerWidth = containerRef.current?.clientWidth ?? 0;
  // Flip the readout to the cursor's left near the right edge so it never
  // spills outside the chart bounds.
  const tooltipOnLeft = hoverPoint ? hoverPoint.left > containerWidth * 0.6 : false;

  return (
    <section
      ref={wrapperRef}
      className={`flex min-h-0 flex-col overflow-hidden bg-[#0d1117] ${isFullscreen ? "fixed inset-0 z-50 rounded-none" : "rounded-lg border border-zinc-800"}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#161b22] px-2 py-2">
        <div className="flex items-center gap-3">
          {symbol && <span className="text-sm font-semibold text-white">{symbol}</span>}
          <div className="flex items-center gap-1" role="group" aria-label="Chart timeframe">
            {TIMEFRAMES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onTimeframeChange?.(item)}
                aria-pressed={timeframe === item}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${timeframe === item ? "bg-[#089981] text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {latest && (
            <span className={`text-xs font-medium ${latest.close >= latest.open ? "text-[#089981]" : "text-[#f23645]"}`}>
              {formatPrice(latest.close)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            aria-label={isFullscreen ? "Exit full screen" : "Show chart full screen"}
          >
            {isFullscreen ? "Exit full" : "Full screen"}
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />
        <PatternOverlay
          chart={chartInstance}
          series={seriesInstance}
          trendlines={geometry.trendlines}
          shapes={mergedShapes}
          visible={showGeometry}
        />

        {crosshair && hoverPoint && (
          <div
            className="pointer-events-none absolute z-10 w-[190px] rounded border border-zinc-700 bg-[#0d1117]/95 p-2 text-[11px] shadow-lg"
            style={tooltipOnLeft
              ? { left: Math.max(4, hoverPoint.left - 200), top: Math.max(4, hoverPoint.top - 40) }
              : { left: Math.min(Math.max(0, containerWidth - 194), hoverPoint.left + 14), top: Math.max(4, hoverPoint.top - 40) }}
          >
            {crosshair.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-px">
                <span className="text-zinc-500">{row.label}</span>
                <span className={row.tone === "up" ? "text-[#089981]" : row.tone === "down" ? "text-[#f23645]" : "text-zinc-200"}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {loading && !isEmpty && (
          <div role="status" className="absolute left-3 top-3 rounded bg-zinc-900/90 px-2 py-1 text-[11px] text-zinc-300">
            Updating…
          </div>
        )}

        {loading && isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
            Loading chart data…
          </div>
        )}

        {!loading && error && isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-amber-300">{error}</p>
            {onRetry && (
              <button type="button" onClick={onRetry} className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800">
                Retry
              </button>
            )}
          </div>
        )}

        {!loading && !error && isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
            No candles available for this market.
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#161b22] px-3 py-1.5 text-[11px] text-zinc-500">
        <span>{isEmpty ? "—" : `${candles.length} candles · ${timeframe} · ${Math.round(candleSeconds / 60)}m bars`}</span>
        {latest && (
          <span className="flex items-center gap-3">
            <span>Vol {formatVolume(latest.volume)}</span>
            <span>{formatAxisTime(latest.time, timeframe)} UTC</span>
          </span>
        )}
        {showPatterns && detectedPatterns.length > 0 && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-zinc-600">
              {detectedPatterns.length} high-conviction trigger{detectedPatterns.length === 1 ? "" : "s"}
            </span>
            {detectedPatterns.slice(-3).map((pattern) => (
              <span
                key={`${pattern.name}:${pattern.time}`}
                title={pattern.trigger ? `${pattern.note} Trigger: ${pattern.trigger}` : pattern.note}
                className="flex items-center gap-1"
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: pattern.direction === "bullish" ? "#089981" : pattern.direction === "bearish" ? "#f23645" : "#8b949e" }}
                />
                {pattern.name}
                {pattern.trigger && <span className="text-zinc-600">({pattern.trigger})</span>}
              </span>
            ))}
          </span>
        )}
      </footer>

      <ChartLegend
        levels={mergedLevels}
        trendlines={geometry.trendlines}
        shapes={mergedShapes}
        candlePatterns={detectedPatterns}
        aiSummary={aiParsed.summary}
        trend={aiParsed.trend}
        verdict={aiParsed.verdict}
        rejected={aiParsed.rejected}
      />
    </section>
  );
}
