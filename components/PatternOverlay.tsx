"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";
import type { Anchor, ChartShape, ShapeLine, Trendline } from "@/src/lib/chart/patternDetector";

export interface PatternOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  trendlines: Trendline[];
  shapes: ChartShape[];
  visible?: boolean;
}

/** A point already converted to screen pixels. */
interface Point {
  x: number;
  y: number;
}

interface LineSpec {
  id: string;
  label: string;
  color: string;
  dashed: boolean;
}

interface FillSpec {
  color: string;
  label: string;
}

interface OverlayRender {
  lines: Point[][];
  fills: Point[][];
  spec: LineSpec[];
  fillSpec: FillSpec[];
}

function samePoints(a: Point[] | null, b: Point[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((point, index) => point.x === b[index].x && point.y === b[index].y);
}

function samePaths(a: Point[][] | null, b: Point[][]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((path, index) => samePoints(path, b[index]));
}

/**
 * Projects chart-space geometry onto the canvas using the chart's own
 * coordinate converters.
 *
 * Zoom and pan are tracked by subscribing to the visible logical range, the
 * size, and crosshair-free view changes; each event recomputes the projection.
 * A rAF guard keeps a drag from re-projecting more than once per frame.
 */
export default function PatternOverlay({ chart, series, trendlines, shapes, visible = true }: PatternOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef(0);
  const previousRef = useRef<{ lines: Point[][]; fills: Point[][] } | null>(null);
  const [render, setRender] = useState<OverlayRender>({
    lines: [],
    fills: [],
    spec: [],
    fillSpec: [],
  });

  const project = useMemo(() => {
    return (): { lines: Point[][]; fills: Point[][] } => {
      const empty = { lines: [] as Point[][], fills: [] as Point[][] };
      if (!chart || !series || !visible) return empty;
      const timeScale = chart.timeScale();

      const toPoint = (anchor: Anchor): Point | null => {
        const x = timeScale.timeToCoordinate(anchor.time as UTCTimestamp);
        const y = series.priceToCoordinate(anchor.price);
        // A null coordinate means the anchor is scrolled out of view.
        if (x === null || y === null) return null;
        return { x, y };
      };

      const projectPath = (points: Anchor[]): Point[] => {
        const mapped = points.map(toPoint).filter((point): point is Point => point !== null);
        return mapped;
      };

      const allLines: (Trendline | ShapeLine)[] = [
        ...trendlines,
        ...shapes.flatMap((shape) => shape.lines),
      ];

      return {
        lines: allLines.map((item) => projectPath(item.points as Anchor[])),
        fills: shapes.flatMap((shape) => shape.fills.map((path) => projectPath(path))),
      };
    };
  }, [chart, series, visible, trendlines, shapes]);

  // Re-project on zoom/pan, resize, and whenever the geometry itself changes.
  useEffect(() => {
    if (!chart || !series || !visible) {
      previousRef.current = null;
      setRender({ lines: [], fills: [], spec: [], fillSpec: [] });
      return;
    }

    const update = () => {
      frameRef.current = 0;
      const next = project();
      // Skip the React re-render when nothing actually moved — without this
      // every crosshair/pan tick would remount the whole overlay.
      const previous = previousRef.current;
      if (previous && samePaths(previous.lines, next.lines) && samePaths(previous.fills, next.fills)) return;
      previousRef.current = next;

      const lineSpecs = [...trendlines, ...shapes.flatMap((shape) => shape.lines)].map((item) => ({
        id: item.id,
        label: item.label,
        color: item.color,
        dashed: "style" in item && item.style === "dashed",
      }));
      const fillSpecs = shapes.map((shape) => ({ color: shape.color, label: shape.label }));

      setRender({
        lines: next.lines,
        fills: next.fills,
        spec: lineSpecs,
        fillSpec: fillSpecs,
      });
    };

    const schedule = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(update);
    };

    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(schedule);
    // Resize lives on the time scale too, and is what fires when the pane's
    // height changes in fullscreen.
    timeScale.subscribeSizeChange(schedule);
    update();

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(schedule);
      timeScale.unsubscribeSizeChange(schedule);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [chart, series, visible, project, trendlines, shapes]);

  if (!visible || (render.lines.length === 0 && render.fills.length === 0)) return null;

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-label="Chart pattern overlay"
      role="img"
    >
      {render.fills.map((points, index) => (
        <polygon
          key={`fill-${index}`}
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill={render.fillSpec[index]?.color ?? "#089981"}
          fillOpacity={0.1}
          stroke="none"
        />
      ))}
      {render.lines.map((points, index) => {
        if (points.length < 2) return null;
        const spec = render.spec[index];
        return (
          <polyline
            key={`line-${spec?.id ?? index}`}
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={spec?.color ?? "#4c8dff"}
            strokeWidth={2}
            strokeDasharray={spec?.dashed ? "6 4" : undefined}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}