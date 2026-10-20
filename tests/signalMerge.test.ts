/**
 * tests/signalMerge.test.ts — the ONE merge policy for local + cloud outcomes.
 *
 * Rule under test: the cloud cron is authoritative, but a PENDING cloud doc
 * must never downgrade a locally resolved setup.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cloudIdentity,
  isResolvedStatus,
  mergeOutcome,
  normalizeOutcome,
} from "@/src/lib/signalMerge";

test("isResolvedStatus knows every settled vocabulary", () => {
  assert.equal(isResolvedStatus("WIN"), true);
  assert.equal(isResolvedStatus("LOSS"), true);
  assert.equal(isResolvedStatus("SUCCESS"), true);
  assert.equal(isResolvedStatus("FAILED"), true);
  assert.equal(isResolvedStatus("EXPIRED"), true);
  assert.equal(isResolvedStatus("PENDING"), false);
  assert.equal(isResolvedStatus(""), false);
});

test("normalizeOutcome maps the cloud vocabulary onto the local one", () => {
  assert.equal(normalizeOutcome("WIN"), "SUCCESS");
  assert.equal(normalizeOutcome("LOSS"), "FAILED");
  assert.equal(normalizeOutcome("EXPIRED"), "EXPIRED");
  assert.equal(normalizeOutcome("PENDING"), "PENDING");
});

test("a resolved cloud outcome wins over a pending local one", () => {
  const merged = mergeOutcome(
    { status: "PENDING", hitTarget: null, currentPrice: 100 },
    { status: "WIN", hitTarget: "TP2", currentPrice: 118 },
  );
  assert.equal(merged.status, "WIN");
  assert.equal(merged.hitTarget, "TP2");
  assert.equal(merged.currentPrice, 118);
});

test("a pending cloud outcome never downgrades a resolved local one", () => {
  const merged = mergeOutcome(
    { status: "SUCCESS", hitTarget: "TP1", currentPrice: 120 },
    { status: "PENDING", hitTarget: null, currentPrice: 118 },
  );
  assert.equal(merged.status, "SUCCESS");
  assert.equal(merged.hitTarget, "TP1");
  // The fresher cloud price is still carried along.
  assert.equal(merged.currentPrice, 118);
});

test("a cloud loss downgrades a pending local record", () => {
  const merged = mergeOutcome(
    { status: "PENDING", hitTarget: null, currentPrice: 100 },
    { status: "LOSS", hitTarget: "SL", currentPrice: 92 },
  );
  assert.equal(merged.status, "LOSS");
  assert.equal(merged.hitTarget, "SL");
});

test("when neither side resolved, the price refreshes but the status stays", () => {
  const merged = mergeOutcome(
    { status: "PENDING", hitTarget: null, currentPrice: 100 },
    { status: "PENDING", hitTarget: null, currentPrice: 105 },
  );
  assert.equal(merged.status, "PENDING");
  assert.equal(merged.currentPrice, 105);
});

test("a cloud price of 0 keeps the local price", () => {
  const merged = mergeOutcome(
    { status: "PENDING", hitTarget: null, currentPrice: 100 },
    { status: "PENDING", hitTarget: null, currentPrice: 0 },
  );
  assert.equal(merged.currentPrice, 100);
});

test("cloudIdentity matches across notations but not across markets", () => {
  const gold = cloudIdentity({ market: "metals", symbol: "GC=F", dateKey: "2026-01-01" });
  const goldSpot = cloudIdentity({ market: "metals", symbol: "XAU-USD", dateKey: "2026-01-01" });
  assert.equal(gold, goldSpot);

  const crypto = cloudIdentity({ market: "crypto", symbol: "BTC-USD", dateKey: "2026-01-01" });
  const cryptoAlt = cloudIdentity({ market: "crypto", symbol: "BTCUSDT", dateKey: "2026-01-01" });
  assert.equal(crypto, cryptoAlt);
  assert.notEqual(crypto, cloudIdentity({ market: "stocks", symbol: "BTC-USD", dateKey: "2026-01-01" }));
});

test("cloudIdentity uses createdAt when the dateKey is missing", () => {
  const withDate = cloudIdentity({
    market: "crypto",
    symbol: "BTC-USD",
    dateKey: "2026-01-02",
    createdAt: Date.parse("2026-01-01T20:00:00Z"),
  });
  const fromCreated = cloudIdentity({
    market: "crypto",
    symbol: "BTC-USD",
    createdAt: Date.parse("2026-01-01T20:00:00Z"),
  });
  assert.equal(withDate, fromCreated);
});
