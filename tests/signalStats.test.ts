/**
 * tests/signalStats.test.ts — the historical-performance maths.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { computeSignalStats, daysBetween, scoreTierKey, summarizeStats } from "@/src/lib/signalStats";

/** 2026-01-10T12:00:00Z — midday UTC on a fixed day. */
const NOW = Date.parse("2026-01-10T12:00:00Z");

function doc(overrides: Partial<Parameters<typeof computeSignalStats>[0][number]> = {}) {
  return {
    symbol: "BTC-USD",
    market: "crypto",
    dateKey: "2026-01-10",
    createdAt: NOW,
    status: "PENDING",
    score: 90,
    direction: "bullish",
    ...overrides,
  };
}

test("counts every outcome bucket", () => {
  const stats = computeSignalStats(
    [
      doc({ status: "WIN" }),
      doc({ status: "WIN" }),
      doc({ status: "LOSS" }),
      doc({ status: "EXPIRED" }),
      doc({ status: "PENDING" }),
    ],
    { now: NOW },
  );
  assert.equal(stats.total, 5);
  assert.equal(stats.wins, 2);
  assert.equal(stats.losses, 1);
  assert.equal(stats.expired, 1);
  assert.equal(stats.pending, 1);
});

test("the win rate only counts settled setups", () => {
  const stats = computeSignalStats(
    [doc({ status: "WIN" }), doc({ status: "WIN" }), doc({ status: "LOSS" }), doc({ status: "PENDING" })],
    { now: NOW },
  );
  assert.equal(stats.winRate, 66.7);
  // Expired is not part of the settled set, so the pessimistic view matches.
  assert.equal(stats.winRateWithExpired, 66.7);
});

test("counting expired as losses lowers the pessimistic win rate", () => {
  const stats = computeSignalStats(
    [doc({ status: "WIN" }), doc({ status: "LOSS" }), doc({ status: "EXPIRED" })],
    { now: NOW },
  );
  assert.equal(stats.winRate, 50);
  assert.equal(stats.winRateWithExpired, 33.3);
});

test("the local SUCCESS/FAILED vocabulary is understood", () => {
  const stats = computeSignalStats(
    [doc({ status: "SUCCESS" }), doc({ status: "FAILED" })],
    { now: NOW },
  );
  assert.equal(stats.wins, 1);
  assert.equal(stats.losses, 1);
  assert.equal(stats.winRate, 50);
});

test("the retention window drops older setups", () => {
  const stats = computeSignalStats(
    [doc({ dateKey: "2026-01-10" }), doc({ dateKey: "2025-01-01" })],
    { now: NOW, retentionDays: 30 },
  );
  assert.equal(stats.total, 1);
  assert.equal(stats.from, "2026-01-10");
  assert.equal(stats.to, "2026-01-10");
});

test("the market breakdown is keyed by market", () => {
  const stats = computeSignalStats(
    [
      doc({ market: "crypto", symbol: "BTC-USD", status: "WIN" }),
      doc({ market: "crypto", symbol: "ETH-USD", status: "LOSS" }),
      doc({ market: "metals", symbol: "GC=F", status: "WIN" }),
    ],
    { now: NOW },
  );
  const crypto = stats.byMarket.find((b) => b.key === "crypto");
  const metals = stats.byMarket.find((b) => b.key === "metals");
  assert.equal(crypto?.total, 2);
  assert.equal(crypto?.wins, 1);
  assert.equal(crypto?.losses, 1);
  assert.equal(metals?.wins, 1);
});

test("the symbol breakdown uses the canonical symbol per market", () => {
  const stats = computeSignalStats(
    [
      doc({ market: "metals", symbol: "GC=F" }),
      doc({ market: "metals", symbol: "XAU-USD" }),
    ],
    { now: NOW },
  );
  assert.equal(stats.bySymbol.length, 1);
  assert.equal(stats.bySymbol[0].key, "metals|GC");
  assert.equal(stats.bySymbol[0].total, 2);
});

test("the daily series is ordered oldest first", () => {
  const stats = computeSignalStats(
    [
      doc({ dateKey: "2026-01-09", status: "WIN" }),
      doc({ dateKey: "2026-01-07", status: "LOSS" }),
      doc({ dateKey: "2026-01-08", status: "WIN" }),
    ],
    { now: NOW },
  );
  assert.deepEqual(
    stats.daily.map((d) => d.dateKey),
    ["2026-01-07", "2026-01-08", "2026-01-09"],
  );
});

test("malformed documents are ignored", () => {
  const stats = computeSignalStats(
    [
      { symbol: "", market: "crypto", dateKey: "2026-01-10" } as never,
      { market: "crypto", dateKey: "2026-01-10" } as never,
      doc(),
    ],
    { now: NOW },
  );
  assert.equal(stats.total, 1);
});

test("an empty archive produces zeroes, not NaN", () => {
  const stats = computeSignalStats([], { now: NOW });
  assert.equal(stats.total, 0);
  assert.equal(stats.winRate, 0);
  assert.equal(stats.averageScore, 0);
  assert.equal(stats.from, null);
  assert.equal(stats.to, null);
});

test("score tiers follow the app's thresholds", () => {
  assert.equal(scoreTierKey(100), "premium");
  assert.equal(scoreTierKey(95), "premium");
  assert.equal(scoreTierKey(94), "strong");
  assert.equal(scoreTierKey(88), "strong");
  assert.equal(scoreTierKey(87), "good");
  assert.equal(scoreTierKey(85), "good");
  assert.equal(scoreTierKey(84), "below");
});

test("the average score only counts resolved setups", () => {
  const stats = computeSignalStats(
    [doc({ status: "WIN", score: 90 }), doc({ status: "LOSS", score: 80 }), doc({ status: "PENDING", score: 100 })],
    { now: NOW },
  );
  assert.equal(stats.averageScore, 85);
  assert.equal(stats.highestScore, 90);
  assert.equal(stats.lowestScore, 80);
});

test("daysBetween counts calendar days between two date keys", () => {
  assert.equal(daysBetween("2026-01-01", "2026-01-08"), 7);
  assert.equal(daysBetween("2026-01-08", "2026-01-01"), -7);
  assert.equal(daysBetween("2026-01-01", "2026-01-01"), 0);
});

test("the summary mentions the real numbers", () => {
  const stats = computeSignalStats(
    [doc({ status: "WIN" }), doc({ status: "LOSS" })],
    { now: NOW },
  );
  const summary = summarizeStats(stats);
  assert.match(summary.english, /2 setup\(s\)/);
  assert.match(summary.english, /50%/);
  assert.match(summary.urdu, /win rate/);
});

test("the summary of an empty archive says so", () => {
  const summary = summarizeStats(computeSignalStats([], { now: NOW }));
  assert.match(summary.english, /No historical setups/);
  assert.match(summary.urdu, /nahi hua/);
});
