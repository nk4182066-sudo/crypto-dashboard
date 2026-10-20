/**
 * lib/signalIdentity.ts — ONE canonical identity for every signal.
 *
 * Every layer (localStorage, Firestore, live pool, chat, stats) keys a signal
 * by the SAME tuple: market + canonical symbol + timeframe + dateKey.
 *
 * Why this exists:
 *  - Symbol-only keys collide across markets ("BTC" crypto vs "BTC" stock) and
 *    across notations ("BTC-USD" / "BTCUSDT" / "BTCUSD" are the same asset).
 *  - The metals universe stores Yahoo futures ("GC=F") while chat asks for
 *    "XAU-USD" — the same gold, two spellings.
 *  - A key without a date collapses every day into one record, so yesterday's
 *    setup overwrites today's.
 *
 * Pure and side-effect free — safe on the server, in the browser and in tests.
 */
import type { ScanMarket } from "@/src/scanner/universe";

/** Asia/Karachi (UTC+5) is the app's business day — every dateKey uses it. */
const KARACHI_OFFSET_MINUTES = 5 * 60;

/** DateKey (YYYY-MM-DD, Asia/Karachi) for an epoch-ms timestamp. */
export function signalDateKey(ms: number = Date.now()): string {
  const shifted = ms + KARACHI_OFFSET_MINUTES * 60 * 1000;
  return new Date(shifted).toISOString().slice(0, 10);
}

/**
 * Alias map for the metals market: the scanner trades Yahoo futures
 * ("GC=F") while users/chat ask for spot notations ("XAU-USD", "XAUUSD").
 *
 * Covers the whole metals universe: precious metals, industrial metals, the
 * energy contracts and the spot ETFs. The canonical key is always the Yahoo
 * futures ticker WITHOUT the "=F" suffix, so "GC=F" and "XAU-USD" are one
 * asset and can never be counted twice.
 */
const METAL_ALIASES: Record<string, string> = {
  // Precious metals
  XAU: "GC",
  GOLD: "GC",
  GC: "GC",
  XAG: "SI",
  SILVER: "SI",
  SI: "SI",
  XPT: "PL",
  PL: "PL",
  XPD: "PA",
  PA: "PA",
  // Industrial metals
  XLC: "HG",
  XCU: "HG",
  CU: "HG",
  HG: "HG",
  // Energy contracts (also live in the metals market in this app)
  USOIL: "CL",
  OIL: "CL",
  CL: "CL",
  WTI: "CL",
  NATGAS: "NG",
  NG: "NG",
  // Spot ETFs
  GLD: "GLD",
  SLV: "SLV",
  PPLT: "PPLT",
  PALL: "PALL",
  CPER: "CPER",
};

/** Strips the Yahoo suffix ("EURUSD=X", "GC=F") and every separator. */
function bareSymbol(symbol: string): string {
  let value = symbol.trim().toUpperCase();
  if (value.endsWith("=X") || value.endsWith("=F")) value = value.slice(0, -2);
  return value.replace(/[\s/_.-]/g, "");
}

/**
 * Canonical symbol for one asset, market-aware.
 *
 *  crypto  "BTC-USD" | "BTCUSDT" | "BTCUSD"  -> "BTC"
 *  forex   "EURUSD=X" | "EUR-USD" | "EUR/USD" -> "EURUSD"
 *  metals  "GC=F" | "XAU-USD" | "XAUUSD"      -> "GC"
 *  stocks  "AAPL"                            -> "AAPL"
 *
 * With an unknown market the function still returns a sane, stable key
 * (quote suffix stripped for non-forex notations).
 */
export function canonicalSymbol(symbol: string, market: string = ""): string {
  const bare = bareSymbol(symbol ?? "");
  if (!bare) return "";
  const m = market.trim().toLowerCase();

  if (m === "metals") {
    const body = bare.replace(/USDT$|USDC$|USD$/, "") || bare;
    return METAL_ALIASES[body] ?? body;
  }
  if (m === "forex") return bare;
  if (m === "stocks") return bare;
  // Crypto and unknown markets: drop the quote suffix.
  const body = bare.replace(/USDT$|USDC$|BUSD$|USD$/, "");
  return body || bare;
}

/** Market + canonical symbol — the "which asset" part of the identity. */
export function assetKey(symbol: string, market: string = ""): string {
  return `${market.trim().toLowerCase()}|${canonicalSymbol(symbol, market)}`;
}

/** Timeframe label, lower-cased, with a sane default. */
export function canonicalTimeframe(timeframe: string | undefined | null): string {
  const value = String(timeframe ?? "").trim().toLowerCase();
  return value || "1h";
}

export interface SignalIdentityInput {
  market?: string | null;
  symbol: string;
  timeframe?: string | null;
  /** Asia/Karachi date string; derived from createdAt when absent. */
  dateKey?: string | null;
  /** Epoch ms used to derive the dateKey when none is given. */
  createdAt?: number | null;
}

/**
 * The canonical identity string of one signal:
 * "market|symbol|timeframe|dateKey". Used for dedupe, merge and lookups.
 */
export function signalIdentity(input: SignalIdentityInput): string {
  const market = String(input.market ?? "").trim().toLowerCase();
  const symbol = canonicalSymbol(input.symbol, market);
  const timeframe = canonicalTimeframe(input.timeframe ?? undefined);
  const dateKey =
    (typeof input.dateKey === "string" && input.dateKey.trim() ? input.dateKey.trim() : "") ||
    signalDateKey(typeof input.createdAt === "number" && input.createdAt > 0 ? input.createdAt : Date.now());
  return `${market}|${symbol}|${timeframe}|${dateKey}`;
}

/**
 * Firestore-safe document id for one signal. Includes the dateKey so
 * yesterday's setup never overwrites today's.
 */
export function signalDocId(input: SignalIdentityInput): string {
  const safe = (value: string) => value.replace(/[/\\.#[\]]/g, "_");
  const identity = signalIdentity(input);
  return identity.split("|").map(safe).join("_");
}

/** Narrowing helper for the app's market union. */
export function isScanMarket(value: string): value is ScanMarket {
  return value === "crypto" || value === "forex" || value === "stocks" || value === "metals";
}
