/**
 * tests/candleSeries.test.ts — the ONE candle-series policy shared by the
 * trade page and the chart component.
 *
 * Rules under test:
 *  - timestamps normalize to whole UNIX seconds (ms accepted, ISO strings ok),
 *  - invalid OHLC rows are dropped instead of poisoning the series,
 *  - duplicates collapse (last write wins),
 *  - the result is always ascending (lightweight-charts REQUIRES it),
 *  - live merges treat the fresh tick as authoritative,
 *  - history merges treat already-held bars as authoritative.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCandles,
  mergeCandles,
  normalizeTimestamp,
  type RawCandle,
  type SeriesCandle,
} from "@/src/lib/candleSeries";

test("normalizeTimestamp accepts seconds, ms, and ISO strings", () => {
  assert.equal(normalizeTimestamp(1730000000), 1730000000);
  assert.equal(normalizeTimestamp(1730000000000), 1730000000); // ms -> s
  assert.equal(normalizeTimestamp(" 2024-10-26T12:00:00Z "), 1729944000);
  assert.equal(normalizeTimestamp(0), null);
  assert.equal(normalizeTimestamp(-1), null);
  assert.equal(normalizeTimestamp("not a time"), null);
  assert.equal(normalizeTimestamp(""), null);
});

test("normalizeCandles sorts ascending, deduplicates, and drops invalid rows", () => {
  const raw: RawCandle[] = [
    // 12:00 Z
    { time: "2024-10-26T12:00:00Z", open: "1", high: "2", low: "0.5", close: "1.5", volume: "10" },
    // malformed close — dropped
    { time: "2024-10-26T13:00:00Z", open: "2", high: "3", low: "1", close: "NaN", volume: "5" },
    // 11:00 Z (comes first)
    { time: "2024-10-26T11:00:00Z", open: "0.5", high: "1", low: "0.4", close: "0.9", volume: "8" },
    // duplicate 13:00 Z — last write wins (close 2.5)
    { time: "2024-10-26T13:00:00Z", open: "2", high: "3", low: "1", close: "2.5", volume: "12" },
    // milliseconds for 12:00 Z — duplicates the ISO row above
    { time: 1729944000000, open: "1", high: "2", low: "0.5", close: "1.6", volume: "11" },
  ];

  const result = normalizeCandles(raw);

  assert.equal(result.length, 3);
  assert.equal(result[0].time, 1729940400); // 11:00
  assert.equal(result[1].time, 1729944000); // 12:00 (last write wins)
  assert.equal(result[1].close, 1.6); // ms row came last
  assert.equal(result[2].time, 1729947600); // 13:00
  assert.equal(result[2].close, 2.5); // duplicate closes with 2.5
});

test("normalizeCandles collapses a millisecond duplicate with a second-format one", () => {
  const raw: RawCandle[] = [
    { time: 1729944000000, open: "1", high: "2", low: "1", close: "1.5", volume: "7" },
    { time: "2024-10-26T12:00:00Z", open: "1.5", high: "2", low: "1", close: "1.8", volume: "9" },
  ];
  const result = normalizeCandles(raw);
  assert.equal(result.length, 1);
  assert.equal(result[0].time, 1729944000);
  assert.equal(result[0].close, 1.8); // last write wins
});

test("mergeCandles keeps order and merges without duplicates", () => {
  const base: SeriesCandle[] = [
    { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    { time: 300, open: 3, high: 4, low: 2, close: 3.5, volume: 30 },
  ];
  const incoming: SeriesCandle[] = [
    { time: 200, open: 2, high: 2.5, low: 1.5, close: 2.2, volume: 20 },
    { time: 400, open: 4, high: 5, low: 3, close: 4.5, volume: 40 },
  ];

  const merged = mergeCandles(base, incoming);
  assert.deepEqual(
    merged.map((c) => c.time),
    [100, 200, 300, 400]
  );
  assert.equal(merged.length, 4);
});

test("live merge: fresh tick wins on a shared timestamp", () => {
  const base: SeriesCandle[] = [
    { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    { time: 200, open: 2, high: 2.5, low: 1.5, close: 2.2, volume: 20 },
  ];
  const fresh: SeriesCandle[] = [
    { time: 200, open: 2, high: 2.5, low: 1.5, close: 2.25, volume: 20.5 },
  ];
  const merged = mergeCandles(base, fresh);
  assert.equal(merged.find((c) => c.time === 200)!.close, 2.25);
  // history untouched elsewhere
  assert.equal(merged.find((c) => c.time === 100)!.close, 1.5);
});

test("history merge: already-held bars win over a backfilled page", () => {
  // boundary case: a backfilled page returns a bar exactly at the oldest we
  // already hold (end_date inclusive + before-1 semantics must prevent this,
  // but if it happens we must NOT overwrite existing data)
  const existing: SeriesCandle[] = [
    { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  ];
  const backfilled: SeriesCandle[] = [
    { time: 100, open: 1, high: 2, low: 0.5, close: 9.9, volume: 10 }, // stale duplicate
    { time: 50, open: 0.5, high: 1, low: 0.4, close: 0.9, volume: 8 },
  ];
  const merged = mergeCandles(backfilled, existing);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((c) => c.time === 100)!.close, 1.5); // held value kept
  assert.equal(merged.find((c) => c.time === 50)!.close, 0.9);
});

test("mergeCandles never returns duplicates", () => {
  const base: SeriesCandle[] = [
    { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  ];
  const incoming: SeriesCandle[] = [
    { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    { time: 100, open: 1, high: 2, low: 0.5, close: 1.6, volume: 11 },
  ];
  const merged = mergeCandles(base, incoming);
  assert.equal(merged.length, 1);
});