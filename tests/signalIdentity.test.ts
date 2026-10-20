/**
 * tests/signalIdentity.test.ts — the canonical identity rules.
 *
 * These are the guarantees every other layer relies on:
 *   - one asset, one key (notation-independent)
 *   - one market, one key (market-aware)
 *   - one day, one key (date-aware → yesterday never overwrites today)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assetKey,
  canonicalSymbol,
  canonicalTimeframe,
  signalDateKey,
  signalDocId,
  signalIdentity,
} from "@/src/lib/signalIdentity";

test("crypto notations collapse to one canonical symbol", () => {
  assert.equal(canonicalSymbol("BTC-USD", "crypto"), "BTC");
  assert.equal(canonicalSymbol("BTCUSDT", "crypto"), "BTC");
  assert.equal(canonicalSymbol("BTCUSD", "crypto"), "BTC");
  assert.equal(canonicalSymbol("btc-usd", "crypto"), "BTC");
  assert.equal(assetKey("BTC-USD", "crypto"), assetKey("BTCUSDT", "crypto"));
});

test("forex keeps the six-letter pair", () => {
  assert.equal(canonicalSymbol("EURUSD=X", "forex"), "EURUSD");
  assert.equal(canonicalSymbol("EUR-USD", "forex"), "EURUSD");
  assert.equal(canonicalSymbol("EUR/USD", "forex"), "EURUSD");
});

test("metals aliases map spot notations onto the futures symbol", () => {
  assert.equal(canonicalSymbol("XAU-USD", "metals"), "GC");
  assert.equal(canonicalSymbol("GC=F", "metals"), "GC");
  assert.equal(canonicalSymbol("XAUUSD", "metals"), "GC");
  assert.equal(canonicalSymbol("XAGUSD", "metals"), "SI");
  assert.equal(assetKey("XAU-USD", "metals"), assetKey("GC=F", "metals"));
});

test("the metals universe aliases cover oil, gas and the spot ETFs", () => {
  assert.equal(canonicalSymbol("CL=F", "metals"), "CL");
  assert.equal(canonicalSymbol("USOIL", "metals"), "CL");
  assert.equal(canonicalSymbol("NG=F", "metals"), "NG");
  assert.equal(canonicalSymbol("NATGAS", "metals"), "NG");
  assert.equal(canonicalSymbol("XCUUSD", "metals"), "HG");
  assert.equal(canonicalSymbol("HG=F", "metals"), "HG");
  // ETFs keep their own ticker — they are a different instrument.
  assert.equal(canonicalSymbol("GLD", "metals"), "GLD");
  assert.notEqual(assetKey("GLD", "metals"), assetKey("GC=F", "metals"));
});

test("stocks keep their ticker", () => {
  assert.equal(canonicalSymbol("AAPL", "stocks"), "AAPL");
});

test("the same ticker in two markets never collides", () => {
  assert.notEqual(assetKey("ABC", "crypto"), assetKey("ABC", "stocks"));
  assert.notEqual(
    signalIdentity({ market: "crypto", symbol: "ABC", dateKey: "2026-01-01" }),
    signalIdentity({ market: "stocks", symbol: "ABC", dateKey: "2026-01-01" }),
  );
});

test("the identity includes the date, so days never collide", () => {
  const today = signalIdentity({ market: "crypto", symbol: "BTC-USD", dateKey: "2026-01-01" });
  const yesterday = signalIdentity({ market: "crypto", symbol: "BTC-USD", dateKey: "2025-12-31" });
  assert.notEqual(today, yesterday);
  assert.equal(today, "crypto|BTC|1h|2026-01-01");
});

test("signalDateKey uses the Asia/Karachi business day", () => {
  // 2026-01-01T20:00:00Z is already 2026-01-02 in Karachi (UTC+5).
  assert.equal(signalDateKey(Date.parse("2026-01-01T20:00:00Z")), "2026-01-02");
  // 2026-01-01T18:00:00Z is still 2026-01-01 in Karachi (23:00 PKT).
  assert.equal(signalDateKey(Date.parse("2026-01-01T18:00:00Z")), "2026-01-01");
});

test("signalDocId is Firestore-safe and carries the date", () => {
  const id = signalDocId({ market: "crypto", symbol: "BTC-USD", timeframe: "1h", dateKey: "2026-01-01" });
  assert.equal(id, "crypto_BTC_1h_2026-01-01");
  assert.ok(!/[/\\.#[\]]/.test(id), "doc id must not contain Firestore-illegal characters");
});

test("signalDocId falls back to createdAt when no dateKey is given", () => {
  const id = signalDocId({
    market: "metals",
    symbol: "XAU-USD",
    timeframe: "1h",
    createdAt: Date.parse("2026-01-01T20:00:00Z"),
  });
  assert.equal(id, "metals_GC_1h_2026-01-02");
});

test("canonicalTimeframe defaults to 1h and lower-cases", () => {
  assert.equal(canonicalTimeframe(undefined), "1h");
  assert.equal(canonicalTimeframe(""), "1h");
  assert.equal(canonicalTimeframe("4H"), "4h");
});
