// Write the complete marketData.ts file in parts
const fs = require('fs');

// Part 1: Header and utility functions
const part1 = `
// ============================================================
// src/lib/data/marketData.ts - Unified symbol mapping & API layer
// ============================================================
// Comprehensive symbol mapping for ALL asset classes:
//   - CRYPTO (Bitget + Bybit)
//   - METALS (TwelveData + Bybit)
//   - FOREX (Frankfurter + TwelveData)
//   - STOCKS (TwelveData + Stooq)
//
// All API calls are wrapped in try/catch. A 500ms delay between calls
// prevents rate-limiting. Every failure is logged with the symbol and API name.

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithErrorLog(
  url: string,
  label: string,
  options?: RequestInit
): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30_000),
      ...options,
    });
    if (!res.ok) {
      console.error("[DATA] " + label + " HTTP " + res.status + " for " + url.split("?")[0]);
      return null;
    }
    return res;
  } catch (e: any) {
    console.error("[DATA] " + label + " failed for " + url + ": " + (e?.message || e));
    return null;
  }
}

/** Convert "BTC-USD" or "BTC/USD" or "BTC-USDT" -> "BTCUSDT" (for Bitget/Bybit spot) */
export function toExchangePair(symbol: string): string {
  const clean = symbol.replace(/[^A-Za-z0-9]/g, "");
  let pair = clean;
  if (/USDT$/.test(pair)) {
    // Already has USDT
  } else if (/USD$/.test(pair) && !/USDC$/.test(pair)) {
    pair = pair.replace(/USD$/, "USDT");
  } else if (pair.endsWith("=X")) {
    pair = pair.replace(/=X$/, "");
  } else if (/^[A-Z]{6}$/.test(pair)) {
    if (!/USDT$/.test(pair) && !/USDC$/.test(pair) && !/PAXG$/.test(pair) && !/XAG$/.test(pair)) {
      const base = pair.slice(0, 3);
      const quote = pair.slice(3);
      pair = base + quote;
    }
  }
  return pair;
}
`.trim();

fs.writeFileSync('src/lib/data/marketData.ts', part1, 'utf8');
console.log('Part 1 written');
