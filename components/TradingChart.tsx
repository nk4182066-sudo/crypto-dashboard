"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineStyle,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IPriceLine,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import ChartAnalysisOverlay from "@/components/ChartAnalysisOverlay";
import { generateChartMarkers, type ChartMarkerBundle } from "@/src/lib/chartMarkers";
import { getChartAnalysis, type ChartAnalysis } from "@/src/lib/autoChartAnalysis";

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartSignal {
  direction: "buy" | "sell";
  time: number;
  price: number;
  reason: string;
}

export interface ChartLevel {
  kind: "support" | "resistance" | "entry" | "stopLoss" | "takeProfit" | "fibonacci";
  price: number;
  label?: string;
  /** Overrides the default line style for this kind (dashed for S/R watch levels). */
  lineStyle?: "solid" | "dashed";
}

/** A single arrow marker (e.g. a buy-point) drawn on the candlestick series. */
export interface ChartArrowMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
}

interface CandlePatternMarker {
  time: number;
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  price: number;
}

interface ChartPoint {
  time: number;
  price: number;
}

interface ChartPatternOutline {
  name: string;
  points: ChartPoint[];
  color?: string;
}

interface StructureMarker extends ChartPoint {
  kind: "higherHigh" | "lowerLow" | "reverse";
}

export interface IndicatorOverlay {
  id: "sma20" | "sma50" | "sma100" | "sma200" | "bollingerUpper" | "bollingerMiddle" | "bollingerLower";
  points: { time: number; value: number }[];
}

export interface ChartDrawing {
  id: string;
  kind: "horizontal" | "trendline" | "fibonacci";
  points: { x: number; y: number }[];
}

interface TradingChartProps {
  data: CandleData[];
  chartKey?: string;
  signals?: ChartSignal[];
  candlePatterns?: CandlePatternMarker[];
  levels?: ChartLevel[];
  trendline?: ChartPoint[];
  trendDirection?: "Bullish" | "Bearish" | "Sideways";
  patternOutline?: ChartPoint[];
  patternOutlines?: ChartPatternOutline[];
  patternName?: string;
  structureMarkers?: StructureMarker[];
  indicatorOverlays?: IndicatorOverlay[];
  drawingMode?: ChartDrawing["kind"] | null;
  drawings?: ChartDrawing[];
  onDrawingComplete?: (drawing: ChartDrawing) => void;
  hasMoreHistory?: boolean;
  loadingOlder?: boolean;
  onLoadOlderData?: () => void;
  /** Explicit arrow markers (buy/sell points) drawn on the series. */
  arrowMarkers?: ChartArrowMarker[];
  height?: number;
  /** Fetch and show auto analysis on symbol change (default on). */
  autoAnalyze?: boolean;
  market?: string;
}

export default function TradingChart({ data, chartKey = "", signals = [], candlePatterns = [], levels = [], trendline = [], trendDirection = "Sideways", patternOutline = [], patternOutlines = [], patternName = "", structureMarkers = [], indicatorOverlays = [], drawingMode = null, drawings = [], onDrawingComplete, hasMoreHistory = false, loadingOlder = false, onLoadOlderData = () => {}, arrowMarkers = [], height = 400, autoAnalyze = true, market = "crypto" }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const trendlineSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const patternSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const extraPatternSeriesRef = useRef<ISeriesApi<'Line', Time>[]>([]);
  const overlaySeriesRef = useRef<{ id: IndicatorOverlay["id"]; series: ISeriesApi<'Line', Time> }[]>([]);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const previousDataRef = useRef<{ chartKey: string; data: CandleData[] } | null>(null);
  const loadOlderRef = useRef(onLoadOlderData);
  const historyStateRef = useRef({ hasMoreHistory, loadingOlder });
  const interactedRef = useRef(false);
  const pendingDrawingRef = useRef<{ x: number; y: number }[]>([]);

  // chartKey format is "SYMBOL:timeframe" — derive the symbol.
  const symbol = chartKey.split(":")[0] ?? "";
  useEffect(() => {
    loadOlderRef.current = onLoadOlderData;
    historyStateRef.current = { hasMoreHistory, loadingOlder };
  }, [onLoadOlderData, hasMoreHistory, loadingOlder]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0e11' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#1d2633' },
        horzLines: { color: '#1d2633' },
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: '#94a3b8',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: '#94a3b8',
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: '#2b3139',
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      timeScale: {
        borderColor: '#2b3139',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceLineVisible: true,
    });

    candlestickSeriesRef.current = candlestickSeries;
    markersRef.current = createSeriesMarkers(candlestickSeries, []);

    const trendlineSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      title: 'Trend line',
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    trendlineSeriesRef.current = trendlineSeries;

    const patternSeries = chart.addSeries(LineSeries, {
      color: '#a78bfa',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      title: '',
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    patternSeriesRef.current = patternSeries;

    const overlayColors: { id: IndicatorOverlay["id"]; color: string }[] = [
      { id: "sma20", color: "#fb923c" },
      { id: "sma50", color: "#fbbf24" },
      { id: "sma100", color: "#22d3ee" },
      { id: "sma200", color: "#f472b6" },
      { id: "bollingerUpper", color: "#a3e635" },
      { id: "bollingerMiddle", color: "#84cc16" },
      { id: "bollingerLower", color: "#a3e635" },
    ];
    overlaySeriesRef.current = overlayColors.map(({ id, color }) => ({
      id,
      series: chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      }),
    }));

    const markInteraction = () => {
      interactedRef.current = true;
    };
    const container = chartContainerRef.current;
    let pointerStartX: number | null = null;
    let touchStartX: number | null = null;
    const loadOlderIfAvailable = () => {
      if (historyStateRef.current.hasMoreHistory && !historyStateRef.current.loadingOlder) {
        loadOlderRef.current();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerStartX = event.clientX;
      markInteraction();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pointerStartX !== null && event.clientX - pointerStartX > 24) loadOlderIfAvailable();
      pointerStartX = null;
    };
    const onTouchStart = (event: TouchEvent) => {
      touchStartX = event.changedTouches[0]?.clientX ?? null;
      markInteraction();
    };
    const onTouchEnd = (event: TouchEvent) => {
      const touchEndX = event.changedTouches[0]?.clientX;
      if (touchStartX !== null && touchEndX !== undefined && touchEndX - touchStartX > 24) loadOlderIfAvailable();
      touchStartX = null;
    };
    const onWheel = (event: WheelEvent) => {
      markInteraction();
      if (event.deltaX < -20 || (event.ctrlKey && event.deltaY > 0)) loadOlderIfAvailable();
    };
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: true });

    const onVisibleRangeChange = (range: { from: number; to: number } | null) => {
      if (interactedRef.current && range && range.from <= 20 && historyStateRef.current.hasMoreHistory && !historyStateRef.current.loadingOlder) {
        loadOlderRef.current();
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("wheel", onWheel);
      candlestickSeriesRef.current = null;
      trendlineSeriesRef.current = null;
      patternSeriesRef.current = null;
      extraPatternSeriesRef.current = [];
      chart.remove();
      chartRef.current = null;
      markersRef.current = null;
      overlaySeriesRef.current = [];
      priceLinesRef.current = [];
    };
  }, [height]);

  useEffect(() => {
    const candlestickSeries = candlestickSeriesRef.current;
    const trendlineSeries = trendlineSeriesRef.current;
    const patternSeries = patternSeriesRef.current;
    if (!candlestickSeries || !trendlineSeries || !patternSeries) return;

    const trendColor = trendDirection === "Bullish" ? "#22c55e" : trendDirection === "Bearish" ? "#ef4444" : "#a1a1aa";
    trendlineSeries.applyOptions({ color: trendColor, title: `${trendDirection} trend line` });

    const previous = previousDataRef.current;
    const isNewChart = !previous || previous.chartKey !== chartKey;
    const visibleRange = !isNewChart ? chartRef.current?.timeScale().getVisibleLogicalRange() : null;
    const firstPreviousIndex = previous && !isNewChart
      ? data.findIndex((candle) => candle.time >= previous.data[0]?.time)
      : -1;
    const prependedCount = firstPreviousIndex > 0 ? firstPreviousIndex : 0;

    const candlePatternsByTime = new Map(candlePatterns.map((pattern) => [pattern.time, pattern]));
    const candles = data.map((candle) => {
      const pattern = candlePatternsByTime.get(candle.time);
      const color = pattern?.direction === "bullish" ? "#2dd4bf" : pattern?.direction === "bearish" ? "#fb7185" : pattern ? "#fbbf24" : undefined;
      return {
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        ...(color ? { color, borderColor: color, wickColor: color } : {}),
      };
    });

    candlestickSeries.setData(candles);
    trendlineSeries.setData(trendline.map((point) => ({ time: point.time as UTCTimestamp, value: point.price })));
    // Pattern markers & outlines are intentionally disabled (Requirement 4):
    // only the candlestick + support/resistance price lines are drawn.

    overlaySeriesRef.current.forEach(({ id, series }) => {
      const overlay = indicatorOverlays.find((item) => item.id === id);
      series.setData((overlay?.points ?? []).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    });

    // Chart draws only candlesticks + support/resistance price lines (no auto-analysis overlay).
    priceLinesRef.current.forEach((priceLine) => candlestickSeries.removePriceLine(priceLine));
    priceLinesRef.current = levels.map((level) => candlestickSeries.createPriceLine({
      price: level.price,
      color: level.kind === "entry" ? "#3b82f6" : level.kind === "support" || level.kind === "takeProfit" ? "#22c55e" : level.kind === "resistance" || level.kind === "stopLoss" ? "#ef4444" : "#facc15",
      lineWidth: 2,
      lineStyle: level.lineStyle
        ? level.lineStyle === "dashed" ? LineStyle.Dashed : LineStyle.Solid
        : level.kind === "stopLoss" || level.kind === "takeProfit" || level.kind === "fibonacci" ? LineStyle.Dashed : LineStyle.Solid,
      axisLabelVisible: true,
      axisLabelColor: level.kind === "entry" ? "#2563eb" : level.kind === "support" || level.kind === "takeProfit" ? "#16a34a" : level.kind === "resistance" || level.kind === "stopLoss" ? "#dc2626" : "#ca8a04",
      title: level.label ?? `${level.kind} ${level.price}`,
    }));

    // Explicit arrow markers (buy/sell points) supplied by the caller.
    if (markersRef.current) {
      const arrowSeriesMarkers: SeriesMarker<Time>[] = arrowMarkers.map((marker) => ({
        time: marker.time as UTCTimestamp,
        position: marker.position,
        color: marker.color,
        shape: marker.shape,
        text: marker.text,
      }));
      markersRef.current.setMarkers(arrowSeriesMarkers);
    }

    if (data.length > 0 && chartRef.current && (isNewChart || !previous?.data.length || !visibleRange)) {
      if (data.length > 140) {
        chartRef.current.timeScale().setVisibleLogicalRange({ from: data.length - 140, to: data.length - 1 });
      } else {
        chartRef.current.timeScale().fitContent();
      }
      interactedRef.current = false;
    } else if (prependedCount > 0 && visibleRange && chartRef.current) {
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: visibleRange.from + prependedCount,
        to: visibleRange.to + prependedCount,
      });
    }
    previousDataRef.current = { chartKey, data };
  }, [data, chartKey, signals, candlePatterns, levels, trendline, trendDirection, patternOutline, patternOutlines, patternName, structureMarkers, indicatorOverlays, arrowMarkers]);

  const handleDrawingClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!drawingMode || !onDrawingComplete) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(1000, ((event.clientX - bounds.left) / bounds.width) * 1000)),
      y: Math.max(0, Math.min(1000, ((event.clientY - bounds.top) / bounds.height) * 1000)),
    };
    const points = [...pendingDrawingRef.current, point];
    const neededPoints = drawingMode === "horizontal" ? 1 : 2;
    if (points.length >= neededPoints) {
      onDrawingComplete({ id: crypto.randomUUID(), kind: drawingMode, points: points.slice(0, neededPoints) });
      pendingDrawingRef.current = [];
    } else {
      pendingDrawingRef.current = points;
    }
  };

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={chartContainerRef} className="h-full min-h-0 w-full" style={{ height: "100%" }} />
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-label={drawingMode ? `Click chart to draw ${drawingMode}` : "Chart drawings"}
        className={`absolute inset-0 h-full w-full ${drawingMode ? "cursor-crosshair" : "pointer-events-none"}`}
        onClick={handleDrawingClick}
      >
        {drawings.map((drawing) => {
          const first = drawing.points[0];
          const second = drawing.points[1];
          if (!first) return null;
          if (drawing.kind === "horizontal") {
            return <line key={drawing.id} x1="0" y1={first.y} x2="1000" y2={first.y} stroke="#fb923c" strokeWidth="2" strokeDasharray="9 6" />;
          }
          if (!second) return null;
          if (drawing.kind === "trendline") {
            return <line key={drawing.id} x1={first.x} y1={first.y} x2={second.x} y2={second.y} stroke="#fb923c" strokeWidth="2" />;
          }
          const top = Math.min(first.y, second.y);
          const bottom = Math.max(first.y, second.y);
          return <g key={drawing.id}>
            {[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((ratio) => {
              const y = top + (bottom - top) * ratio;
              return <g key={ratio}>
                <line x1={Math.min(first.x, second.x)} y1={y} x2={Math.max(first.x, second.x)} y2={y} stroke="#facc15" strokeWidth="1" strokeDasharray="5 4" />
                <text x={Math.min(first.x, second.x) + 4} y={y - 3} fill="#fde68a" fontSize="16">{(ratio * 100).toFixed(1)}%</text>
              </g>;
            })}
          </g>;
        })}
      </svg>
      {loadingOlder && <div className="absolute left-2 top-2 rounded bg-zinc-950/90 px-2 py-1 text-xs text-zinc-300" role="status">Loading older candles...</div>}
      {/* Analysis panel: no overlay on the chart; rendered below the chart in the page (Requirement 3). */}
    </div>
  );
}