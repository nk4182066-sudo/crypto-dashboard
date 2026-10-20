/**
 * tests/signalStorage.test.ts — the local storage layer's outcome overlay.
 *
 * applyCloudOutcome is what the Results page calls for every cloud doc, so it
 * must follow the ONE merge policy: the cloud wins once it has resolved a
 * setup, and a PENDING cloud doc never downgrades a local resolution.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyCloudOutcome, cloudStatusToLocal, type StoredSignal } from "@/src/lib/signalStorage";

function record(overrides: Partial<StoredSignal> = {}): StoredSignal {
  return {
    id: "crypto_BTC_1h_2026-01-10",
    symbol: "BTC-USD",
    market: "crypto",
    score: 90,
    direction: "bullish",
    trend: "Uptrend",
    pattern: "Double Bottom",
    candlestick: "Bullish engulfing",
    entry1: 100,
    entry2: 99,
    stopLoss: 95,
    tp1: 110,
    tp2: 120,
    tp3: 130,
    support: 99,
    resistance: 110,
    createdAt: Date.parse("2026-01-10T12:00:00Z"),
    status: "PENDING",
    hitTarget: null,
    currentPrice: 100,
    whyUrdu: "",
    whyEnglish: "",
    lessonUrdu: "",
    lessonEnglish: "",
    ...overrides,
  };
}

test("cloudStatusToLocal maps the server vocabulary", () => {
  assert.equal(cloudStatusToLocal("WIN"), "SUCCESS");
  assert.equal(cloudStatusToLocal("LOSS"), "FAILED");
  assert.equal(cloudStatusToLocal("EXPIRED"), "EXPIRED");
  assert.equal(cloudStatusToLocal("PENDING"), null);
});

test("a cloud WIN upgrades a pending local record", () => {
  const next = applyCloudOutcome(record(), { status: "WIN", hitTarget: "TP2", currentPrice: 121 });
  assert.equal(next.status, "SUCCESS");
  assert.equal(next.hitTarget, "TP2");
  assert.equal(next.currentPrice, 121);
  // The narratives are regenerated so the card explains the outcome.
  assert.ok(next.whyUrdu.length > 0);
  assert.ok(next.lessonEnglish.length > 0);
});

test("a cloud LOSS downgrades a pending local record", () => {
  const next = applyCloudOutcome(record(), { status: "LOSS", hitTarget: "SL", currentPrice: 94 });
  assert.equal(next.status, "FAILED");
  assert.equal(next.hitTarget, "SL");
});

test("a PENDING cloud doc never downgrades a locally resolved record", () => {
  const local = record({ status: "SUCCESS", hitTarget: "TP1", currentPrice: 111 });
  const next = applyCloudOutcome(local, { status: "PENDING", currentPrice: 105 });
  assert.equal(next.status, "SUCCESS");
  assert.equal(next.hitTarget, "TP1");
  // The fresher cloud price is still carried along.
  assert.equal(next.currentPrice, 105);
});

test("a PENDING cloud doc leaves a pending record pending", () => {
  const local = record();
  const next = applyCloudOutcome(local, { status: "PENDING", currentPrice: 103 });
  assert.equal(next.status, "PENDING");
  assert.equal(next.hitTarget, null);
  assert.equal(next.currentPrice, 103);
});

test("an unchanged record is returned by reference (no re-render churn)", () => {
  const local = record();
  const next = applyCloudOutcome(local, { status: "PENDING" });
  assert.equal(next, local);
});

test("a cloud price of 0 keeps the local price", () => {
  const local = record();
  const next = applyCloudOutcome(local, { status: "PENDING", currentPrice: 0 });
  assert.equal(next.currentPrice, 100);
});
