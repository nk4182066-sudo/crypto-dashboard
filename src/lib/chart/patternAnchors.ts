/**
 * patternAnchors.ts — chart-pattern anchor points → lightweight-charts markers.
 *
 * The pattern detectors (src/lib/chart/detectPattern.ts) report their anchors
 * as `p1` / `p2` / `p3` plus a neckline price:
 *
 *   - Double Top / Double Bottom  → p1, p2 (the two equal pivots)
 *   - Triple Top / Triple Bottom  → p1, p2, p3 (the three equal pivots)
 *   - Head & Shoulders             → p1, p2 = the two shoulders, p3 = the head
 *   - Inverse Head & Shoulders     → p1, p2 = the two shoulders, p3 = the head
 *
 * `p3` is OPTIONAL, so a Double Top/Bottom payload (which never carries it)
 * keeps rendering exactly the two anchors it always did.
 *
 * The marker side (above / below the bar) is inferred from the neckline:
 * anchors that sit above the neckline are drawn above the bar (tops, heads,
 * shoulders), anchors below it are drawn below the bar (bottoms, feet).
 */
import type { SeriesMarker, UTCTimestamp } from "lightweight-charts";

/** One anchor of a detected chart pattern. */
export interface PatternAnchorPoint {
  time: number;
  price: number;
}

/**
 * The anchor payload carried by a detected chart pattern.
 * `p3` is optional (Triple Top/Bottom + Head & Shoulders supply it).
 */
export interface PatternAnchorPoints {
  p1: PatternAnchorPoint;
  p2: PatternAnchorPoint;
  p3?: PatternAnchorPoint;
  neckline: number;
}

/** Colour of the anchor circles (gold, matching the chart's pattern palette). */
export const PATTERN_ANCHOR_COLOR = "#FFD700";

/** Diameter of the anchor circles, in pixels. */
export const PATTERN_ANCHOR_SIZE = 13;

/** A structurally valid anchor: finite time and price. */
function isValidAnchor(point: PatternAnchorPoint | null | undefined): point is PatternAnchorPoint {
  return (
    point != null &&
    typeof point.time === "number" &&
    typeof point.price === "number" &&
    Number.isFinite(point.time) &&
    Number.isFinite(point.price)
  );
}

/**
 * Converts a detected pattern's anchors into `createSeriesMarkers` markers.
 *
 * - Missing / invalid anchors are SKIPPED (never rendered at 0,0).
 * - The result is ordered chronologically, which lightweight-charts requires.
 * - Returns an empty array when there is nothing valid to draw.
 */
export function toPatternAnchorMarkers(
  points: PatternAnchorPoints | null | undefined,
): SeriesMarker<UTCTimestamp>[] {
  if (!points) return [];

  const neckline = Number(points.neckline);
  if (!Number.isFinite(neckline)) return [];

  const anchors = [points.p1, points.p2, points.p3].filter(isValidAnchor);
  if (anchors.length === 0) return [];

  // Side of the neckline decides above/below. Majority wins so a payload with
  // an anchor exactly ON the neckline still resolves to a sensible side.
  const above = anchors.filter((anchor) => anchor.price > neckline).length;
  const below = anchors.filter((anchor) => anchor.price < neckline).length;
  const position: "aboveBar" | "belowBar" = above >= below ? "aboveBar" : "belowBar";

  return anchors
    .map((anchor) => ({
      time: anchor.time as UTCTimestamp,
      position,
      color: PATTERN_ANCHOR_COLOR,
      shape: "circle" as const,
      size: PATTERN_ANCHOR_SIZE,
      text: "",
    }))
    .sort((a, b) => Number(a.time) - Number(b.time));
}
