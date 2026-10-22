/**
 * tests/patternAnchors.test.ts — chart-pattern anchor propagation.
 *
 * Rules under test:
 *  - Double Top/Bottom carry p1/p2 only (no p3) — backwards compatible.
 *  - Triple Top/Bottom carry p1/p2/p3.
 *  - Head & Shoulders (and inverse) carry p1/p2 = shoulders, p3 = head.
 *  - The detector NEVER invents a pattern: no match → pattern null.
 *  - Marker conversion skips invalid anchors and orders chronologically.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { detectSwingChartPattern } from "@/src/lib/chart/detectPattern";
import { toPatternAnchorMarkers } from "@/src/lib/chart/patternAnchors";
import type { Candle } from "@/src/analysis/types";

const HOUR = 3600;
const BASE_TIME = 1_700_000_000;
/** Wick size, so every turning point is a strict local extreme. */
const WICK = 0.2;
/** Bars per leg — must exceed the 5-bar pivot window. */
const LEG = 6;

/**
 * Builds a candle series from a list of turning points. Each leg spans `LEG`
 * bars, so every turning point becomes a strict local extreme inside the
 * 5-bar left/right pivot window the swing detector uses.
 */
function candlesFromTurns(turns: number[], leg = LEG): Candle[] {
  const closes: number[] = [];
  for (let i = 0; i < turns.length - 1; i += 1) {
    const from = turns[i];
    const to = turns[i + 1];
    for (let k = 0; k < leg; k += 1) {
      closes.push(from + ((to - from) * k) / leg);
    }
  }
  closes.push(turns[turns.length - 1]);
  return closes.map((close, index) => ({
    time: BASE_TIME + index * HOUR,
    open: close,
    high: close + WICK,
    low: close - WICK,
    close,
    volume: 100,
  }));
}


// ─────────────────────────────────────────────────────────────────────────────
// DETECTION
// ─────────────────────────────────────────────────────────────────────────────

test("Double Top detection reports exactly two anchors (p1/p2, no p3)", () => {
  // Two equal highs at 110 with a trough at 100 between them, price closing
  // back below the 105 level afterwards.
  const result = detectSwingChartPattern(candlesFromTurns([100, 110, 100, 110, 96]));
  assert.ok(result, "a Double Top should be detected");
  assert.equal(result.pattern, "Double Top");
  assert.ok(result.points, "Double Top must carry anchor points");
  assert.ok(result.points.p1, "p1 must exist");
  assert.ok(result.points.p2, "p2 must exist");
  assert.equal(result.points.p3, undefined, "Double Top must NOT carry p3");
  assert.ok(Number.isFinite(result.points.neckline), "neckline must be finite");
  assert.ok(
    result.points.p1.price > result.points.neckline,
    "Double Top anchors sit above the neckline",
  );
});

test("Triple Top detection reports three anchors (p1/p2/p3)", () => {
  const result = detectSwingChartPattern(
    candlesFromTurns([100, 110, 100, 110, 100, 110, 96]),
  );
  assert.ok(result, "a Triple Top should be detected");
  assert.equal(result.pattern, "Triple Top");
  assert.ok(result.points, "Triple Top must carry anchor points");
  assert.ok(result.points.p1, "p1 must exist");
  assert.ok(result.points.p2, "p2 must exist");
  assert.ok(result.points.p3, "p3 must exist");
  assert.ok(
    result.points.p1.time < result.points.p2.time &&
      result.points.p2.time < result.points.p3.time,
    "Triple Top anchors must be in chronological order",
  );
  assert.ok(
    Number.isFinite(result.points.p3.price) && Number.isFinite(result.points.p3.time),
    "p3 must carry finite time and price",
  );
});

test("Head & Shoulders detection reports p1/p2 = shoulders and p3 = head", () => {
  // Left shoulder 110, head 115, right shoulder 110, neckline troughs at 100.
  const result = detectSwingChartPattern(
    candlesFromTurns([100, 110, 100, 115, 100, 110, 96]),
  );
  assert.ok(result, "a Head & Shoulders should be detected");
  assert.equal(result.pattern, "Head & Shoulders");
  assert.ok(result.points, "Head & Shoulders must carry anchor points");
  assert.ok(result.points.p1, "p1 (left shoulder) must exist");
  assert.ok(result.points.p2, "p2 (right shoulder) must exist");
  assert.ok(result.points.p3, "p3 (head) must exist");
  assert.ok(
    result.points.p3.price > result.points.p1.price &&
      result.points.p3.price > result.points.p2.price,
    "the head must sit above both shoulders",
  );
  assert.ok(
    result.points.p1.time < result.points.p3.time &&
      result.points.p3.time < result.points.p2.time,
    "shoulders and head must be in chronological order",
  );
});

test("Inverse Head & Shoulders reports p1/p2 = shoulders and p3 = head", () => {
  // Left shoulder 100, head 95, right shoulder 100, neckline peaks at 110.
  const result = detectSwingChartPattern(
    candlesFromTurns([110, 100, 110, 95, 110, 100, 114]),
  );
  assert.ok(result, "an Inverse Head & Shoulders should be detected");
  assert.equal(result.pattern, "Inverse Head & Shoulders");
  assert.ok(result.points, "Inverse Head & Shoulders must carry anchor points");
  assert.ok(result.points.p3, "p3 (head) must exist");
  assert.ok(
    result.points.p3.price < result.points.p1.price &&
      result.points.p3.price < result.points.p2.price,
    "the head must sit below both shoulders",
  );
});

test("Double Bottom detection reports exactly two anchors (p1/p2, no p3)", () => {
  const result = detectSwingChartPattern(
    candlesFromTurns([100, 110, 100, 110, 100, 112]),
  );
  assert.ok(result, "a Double Bottom should be detected");
  assert.equal(result.pattern, "Double Bottom");
  assert.ok(result.points, "Double Bottom must carry anchor points");
  assert.equal(result.points.p3, undefined, "Double Bottom must NOT carry p3");
  assert.ok(
    result.points.p1.price < result.points.neckline,
    "Double Bottom anchors sit below the neckline",
  );
});

test("Triple Bottom detection reports three anchors (p1/p2/p3)", () => {
  const result = detectSwingChartPattern(
    candlesFromTurns([110, 100, 110, 100, 110, 100, 112]),
  );
  assert.ok(result, "a Triple Bottom should be detected");
  assert.equal(result.pattern, "Triple Bottom");
  assert.ok(result.points, "Triple Bottom must carry anchor points");
  assert.ok(result.points.p3, "p3 must exist");
  assert.ok(
    result.points.p1.price < result.points.neckline,
    "Triple Bottom anchors sit below the neckline",
  );
});

test("the detector never invents a pattern on a flat series", () => {
  const flat = candlesFromTurns([100, 100, 100, 100, 100]);
  assert.equal(detectSwingChartPattern(flat), null, "a flat series must produce no swing pattern");
});

// ─────────────────────────────────────────────────────────────────────────────
// MARKER CONVERSION
// ─────────────────────────────────────────────────────────────────────────────

test("marker conversion draws one circle per anchor", () => {
  const markers = toPatternAnchorMarkers({
    p1: { time: 100, price: 110 },
    p2: { time: 200, price: 110 },
    p3: { time: 150, price: 111 },
    neckline: 100,
  });
  assert.equal(markers.length, 3, "all three anchors must produce a marker");
  assert.equal(markers[0].position, "aboveBar", "anchors above the neckline sit above the bar");
  assert.equal(markers[0].shape, "circle");
  assert.equal(markers[0].color, "#FFD700");
  assert.deepEqual(
    markers.map((marker) => Number(marker.time)),
    [100, 150, 200],
    "markers must be ordered chronologically",
  );
});

test("marker conversion keeps Double Top/Bottom compatible (two anchors)", () => {
  const markers = toPatternAnchorMarkers({
    p1: { time: 100, price: 110 },
    p2: { time: 200, price: 110 },
    neckline: 100,
  });
  assert.equal(markers.length, 2, "no p3 means exactly two markers");
  assert.equal(markers[0].position, "aboveBar");
});

test("marker conversion places below-neckline anchors below the bar", () => {
  const markers = toPatternAnchorMarkers({
    p1: { time: 100, price: 90 },
    p2: { time: 200, price: 90 },
    neckline: 100,
  });
  assert.equal(markers.length, 2);
  assert.equal(markers[0].position, "belowBar", "anchors below the neckline sit below the bar");
});

test("marker conversion skips missing or invalid anchors", () => {
  const markers = toPatternAnchorMarkers({
    p1: { time: 100, price: 110 },
    p2: { time: Number.NaN, price: 110 },
    p3: { time: 300, price: 111 },
    neckline: 100,
  });
  assert.equal(markers.length, 2, "the invalid anchor must be skipped");
  assert.deepEqual(
    markers.map((marker) => Number(marker.time)),
    [100, 300],
  );
});

test("marker conversion returns an empty list for absent or broken payloads", () => {
  assert.deepEqual(toPatternAnchorMarkers(null), []);
  assert.deepEqual(toPatternAnchorMarkers(undefined), []);
  assert.deepEqual(
    toPatternAnchorMarkers({
      p1: { time: 1, price: 2 },
      p2: { time: 2, price: 3 },
      neckline: Number.NaN,
    }),
    [],
    "a broken neckline yields no markers",
  );
});

