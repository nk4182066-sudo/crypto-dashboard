"use client";

import { useEffect, useRef } from "react";
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

interface ChartLevel {
  kind: "support" | "resistance" | "entry" | "stopLoss" | "takeProfit";
  price: number;
  label?: string;
}

interface ChartPoint {
  time: number;
  price: number;
}

interface StructureMarker extends ChartPoint {
  kind: "higherHigh" | "lowerLow" | "reverse";
}

export interface IndicatorOverlay {
  id: "sma50" | "sma100" | "sma200" | "bollingerUpper" | "bollingerLower";
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
  levels?: ChartLevel[];
  trendline?: ChartPoint[];
  patternOutline?: ChartPoint[];
  patternName?: string;
  structureMarkers?: StructureMarker[];
  indicatorOverlays?: IndicatorOverlay[];
  drawingMode?: ChartDrawing["kind"] | null;
  drawings?: ChartDrawing[];
  onDrawingComplete?: (drawing: ChartDrawing) => void;
  hasMoreHistory?: boolean;
  loadingOlder?: boolean;
  onLoadOlderData?: () => void;
  height?: number;
}

export default function TradingChart({ data, chartKey = "", signals = [], levels = [], trendline = [], patternOutline = [], patternName = "", structureMarkers = [], indicatorOverlays = [], drawingMode = null, drawings = [], onDrawingComplete, hasMoreHistory = false, loadingOlder = false, onLoadOlderData = () => {}, height = 400 }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const trendlineSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const patternSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const overlaySeriesRef = useRef<{ id: IndicatorOverlay["id"]; series: ISeriesApi<'Line', Time> }[]>([]);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const previousDataRef = useRef<{ chartKey: string; data: CandleData[] } | null>(null);
  const loadOlderRef = useRef(onLoadOlderData);
  const historyStateRef = useRef({ hasMoreHistory, loadingOlder });
  const interactedRef = useRef(false);
  const pendingDrawingRef = useRef<{ x: number; y: number }[]>([]);

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
        background: { type: ColorType.Solid, color: '#18181b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
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
        borderColor: '#27272a',
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
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
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
      title: 'Chart pattern',
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    patternSeriesRef.current = patternSeries;

    const overlayColors: { id: IndicatorOverlay["id"]; color: string; title: string }[] = [
      { id: "sma50", color: "#fbbf24", title: "SMA 50" },
      { id: "sma100", color: "#22d3ee", title: "SMA 100" },
      { id: "sma200", color: "#f472b6", title: "SMA 200" },
      { id: "bollingerUpper", color: "#a3e635", title: "Bollinger upper" },
      { id: "bollingerLower", color: "#a3e635", title: "Bollinger lower" },
    ];
    overlaySeriesRef.current = overlayColors.map(({ id, color, title }) => ({
      id,
      series: chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        title,
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

    const previous = previousDataRef.current;
    const isNewChart = !previous || previous.chartKey !== chartKey;
    const visibleRange = !isNewChart ? chartRef.current?.timeScale().getVisibleLogicalRange() : null;
    const firstPreviousIndex = previous && !isNewChart
      ? data.findIndex((candle) => candle.time >= previous.data[0]?.time)
      : -1;
    const prependedCount = firstPreviousIndex > 0 ? firstPreviousIndex : 0;

    const candles = data.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    candlestickSeries.setData(candles);
    trendlineSeries.setData(trendline.map((point) => ({ time: point.time as UTCTimestamp, value: point.price })));
    patternSeries.applyOptions({ title: patternName || 'Chart pattern' });
    patternSeries.setData(patternOutline.map((point) => ({ time: point.time as UTCTimestamp, value: point.price })));
    overlaySeriesRef.current.forEach(({ id, series }) => {
      const overlay = indicatorOverlays.find((item) => item.id === id);
      series.setData((overlay?.points ?? []).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    });

    if (markersRef.current) {
      const signalMarkers: SeriesMarker<Time>[] = signals.map((signal) => ({
        time: signal.time as UTCTimestamp,
        position: signal.direction === "buy" ? "belowBar" : "aboveBar",
        color: signal.direction === "buy" ? "#22c55e" : "#ef4444",
        shape: signal.direction === "buy" ? "arrowUp" : "arrowDown",
        text: signal.direction.toUpperCase(),
      }));
      const structureMarkersForChart: SeriesMarker<Time>[] = structureMarkers.map((marker) => ({
        time: marker.time as UTCTimestamp,
        position: marker.kind === "lowerLow" ? "belowBar" : "aboveBar",
        color: marker.kind === "lowerLow" ? "#fb7185" : marker.kind === "reverse" ? "#f59e0b" : "#fbbf24",
        shape: "circle",
        text: marker.kind === "higherHigh" ? "HH" : marker.kind === "lowerLow" ? "LL" : "REV",
      }));
      const markers = [...signalMarkers, ...structureMarkersForChart].sort((first, second) => Number(first.time) - Number(second.time));
      markersRef.current.setMarkers(markers);
    }

    priceLinesRef.current.forEach((priceLine) => candlestickSeries.removePriceLine(priceLine));
    priceLinesRef.current = levels.map((level) => candlestickSeries.createPriceLine({
      price: level.price,
      color: level.kind === "support" || level.kind === "takeProfit" ? "#22c55e" : level.kind === "resistance" || level.kind === "stopLoss" ? "#ef4444" : "#38bdf8",
      lineWidth: 2,
      lineStyle: level.kind === "stopLoss" || level.kind === "takeProfit" ? LineStyle.Dashed : LineStyle.Solid,
      axisLabelVisible: true,
      axisLabelColor: level.kind === "support" || level.kind === "takeProfit" ? "#16a34a" : level.kind === "resistance" || level.kind === "stopLoss" ? "#dc2626" : "#0284c7",
      title: level.label ?? `${level.kind} ${level.price}`,
    }));

    if (data.length > 0 && chartRef.current && (isNewChart || !previous?.data.length || !visibleRange)) {
      chartRef.current.timeScale().fitContent();
      interactedRef.current = false;
    } else if (prependedCount > 0 && visibleRange && chartRef.current) {
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: visibleRange.from + prependedCount,
        to: visibleRange.to + prependedCount,
      });
    }
    previousDataRef.current = { chartKey, data };
  }, [data, chartKey, signals, levels, trendline, patternOutline, patternName, structureMarkers, indicatorOverlays]);

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
    </div>
  );
}