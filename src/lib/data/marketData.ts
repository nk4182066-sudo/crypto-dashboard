// ============================================================
// src/lib/data/marketData.ts â€” Unified symbol mapping & API layer
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
      signal: AbortSignal.timeout(15_000),
      ...options,
    });
    if (!res.ok) {
      console.error(`[DATA] ${label} HTTP ${res.status} for ${url.split("?")[0]}`);
      return null;
    }
    return res;
  } catch (e: any) {
    console.error(`[DATA] ${label} failed for ${url}: ${e?.message || e}`);
    return null;
  }
}

/** Convert "BTC-USD" or "BTC/USD" or "BTC-USDT" â†’ "BTCUSDT" (for Bitget/Bybit spot) */
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
      pair = `${base}${quote}`;
    }
  }
  return pair;
}

/** Normalize a symbol to its exchange pair and Yahoo symbol */
export function getSymbolPair(symbol: string, market: string): { exchangePair: string; yahooSymbol: string; description: string } {
  const base = symbol.split("-").join("").split("/").join("").toUpperCase().replace(/[^A-Z0-9.]/g, "");

  // FOREX: EURUSD â†’ EUR/USD for TwelveData, base=EUR quote=USD
  if (market === "forex" && /^[A-Z]{6}$/.test(base) && base.length === 6) {
    const left = base.slice(0, 3);
    const right = base.slice(3);
    return { exchangePair: `${left}${right}`, yahooSymbol: `${left}/${right}`, description: `${left}/${right}` };
  }

  // METALS
  const metalMap: Record<string, { exchangePair: string; yahooSymbol: string; description: string }> = {
    XAUUSD: { exchangePair: "PAXGUSDT", yahooSymbol: "GC=F", description: "Gold (PAXG)" },
    XAGUSD: { exchangePair: "XAGUSDT", yahooSymbol: "SI=F", description: "Silver (SI=F)" },
    XPTUSD: { exchangePair: "XPT/USD", yahooSymbol: "PL=F", description: "Platinum" },
    XPDUSD: { exchangePair: "XPD/USD", yahooSymbol: "PA=F", description: "Palladium" },
    XCUUSD: { exchangePair: "XCU/USD", yahooSymbol: "HG=F", description: "Copper" },
    XALUSD: { exchangePair: "XAL/USD", yahooSymbol: "ALI=F", description: "Aluminum" },
    XNIUSD: { exchangePair: "XNI/USD", yahooSymbol: "NIB.F", description: "Nickel" },
    XZNUSD: { exchangePair: "XZN/USD", yahooSymbol: "ZINC=F", description: "Zinc" },
  };


  if (metalMap[base]) {
    const m = metalMap[base];
    return { exchangePair: m.exchangePair, yahooSymbol: m.yahooSymbol, description: m.description };
  }

  // Stocks (AAPL, TSLA, etc.)
  if (/^[A-Z]{2,5}$/.test(base) && base.length <= 5) {
    return { exchangePair: base, yahooSymbol: base, description: base };
  }

  // Crypto (BTC-USD, ETH-USD, SOL-USD, etc.)
  const cryptoPair = base.replace(/USDT$/i, "").replace(/USD$/i, "").toUpperCase();
  const exchangePair = `${cryptoPair}USDT`;

  return {
    exchangePair,
    yahooSymbol: `crypto_${cryptoPair}`,
    description: exchangePair,
  };
}

// ──────────────────────────────────────────────────────────────────────
// 4. CRYPTO — CoinGecko primary + Bitget + Bybit fallback
// ──────────────────────────────────────────────────────────────────────
export async function fetchCryptoHistory(
  symbol: string,
  timeframe = "1h",
  limit = 200
): Promise<{ candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>; source: string }> {
  const coinIdMap: Record<string, string> = {
    "BTC-USD": "bitcoin",
    "ETH-USD": "ethereum",
    "SOL-USD": "solana",
    "ADA-USD": "cardano",
    "XRP-USD": "ripple",
    "DOGE-USD": "dogecoin",
    "AVAX-USD": "avalanche-2",
    "DOT-USD": "polkadot",
    "MATIC-USD": "polygon",
    "LINK-USD": "chainlink",
  };

  const normalizedSymbol = symbol.toUpperCase().replace("/", "-");
  const coinId = coinIdMap[normalizedSymbol] || normalizedSymbol.replace("-USD", "").toLowerCase();

  let candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let source = "none";

  // 1. Primary: CoinGecko (unblockable)
  {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=1`;
    const res = await fetchWithErrorLog(url, `coingecko-${coinId}`, {});
    if (res) {
      try {
        const j = await res.json();
        const rows = Array.isArray(j) ? j : [];
        candles = rows.map((k: any[]) => ({
          time: Number(k[0]),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: 0,
        })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite));
        if (candles.length > 0) {
          console.log(`[DATA] CoinGecko Success: ${symbol} Length: ${candles.length}`);
          return { candles, source: "coingecko" };
        }
        console.error(`[DATA] CoinGecko returned empty data for ${symbol} (${coinId})`);
      } catch (e: any) {
        console.error(`[DATA] CoinGecko parse failed for ${symbol} (${coinId}): ${e?.message || e}`);
      }
    }
  }

  // 2. Fallback: Bitget
  const pair = toExchangePair(symbol);
  {
    const url = `https://api.bitget.com/api/v2/spot/market/candles?symbol=${pair}&granularity=${timeframe}&limit=${limit}`;
    const res = await fetchWithErrorLog(url, `bitget`, {});
    if (res) {
      try {
        const data = await res.json();
        const rows = Array.isArray(data?.data) ? data.data : [];
        candles = rows.map((k: any[]) => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5] ?? 0) })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite));
        if (candles.length > 0) { console.log(`[DATA] bitget Success: ${symbol} (${pair}) Length: ${candles.length}`); return { candles, source: "bitget" }; }
        console.error(`[DATA] bitget returned empty data for ${symbol} (${pair})`);
      } catch (e: any) { console.error(`[DATA] bitget parse failed for ${symbol} (${pair}): ${e?.message || e}`); }
    }
  }

  // 3. Fallback: Bybit
  {
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${pair}&interval=60&limit=${limit}`;
    const res = await fetchWithErrorLog(url, `bybit`, {});
    if (res) {
      try {
        const j = await res.json();
        const rows = j?.result?.list ?? [];
        candles = rows.map((k: any[]) => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5] ?? 0) })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite)).reverse();
        if (candles.length > 0) { console.log(`[DATA] bybit Success: ${symbol} (${pair}) Length: ${candles.length}`); return { candles, source: "bybit" }; }
        console.error(`[DATA] bybit returned empty data for ${symbol} (${pair})`);
      } catch (e: any) { console.error(`[DATA] bybit parse failed for ${symbol} (${pair}): ${e?.message || e}`); }
    }
  }

  console.error(`[DATA] Crypto history failed for ${symbol} (${pair}) — all providers exhausted`);
  return { candles: [], source: "none" };
}

// ──────────────────────────────────────────────────────────────────────
// 5. METALS — TwelveData + Bybit fallback
// ──────────────────────────────────────────────────────────────────────
const METAL_TWELVEDATA_MAP: Record<string, string> = {
  XAUUSD: "XAU/USD",
  XAGUSD: "XAG/USD",
  XPTUSD: "XPT/USD",
  XPDUSD: "XPD/USD",
  XCUUSD: "XCU/USD",
  XALUSD: "XAL/USD",
  XNIUSD: "XNI/USD",
  XZNUSD: "XZN/USD",
};

export async function fetchMetalHistory(
  symbol: string,
  timeframe = "1h",
  limit = 200
): Promise<{ candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>; source: string }> {
  const tdSymbol = METAL_TWELVEDATA_MAP[symbol] || symbol;
  let candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let source = "none";

  const apiKey = process.env.TWELVEDATA_API_KEY?.trim();

  if (apiKey) {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${timeframe}&outputsize=${limit}&apikey=${apiKey}`;
    const res = await fetchWithErrorLog(url, `twelvedata`, {});
    if (res) {
      try {
        const j = await res.json();
        if (j?.status === "error" || !Array.isArray(j?.values)) {
          console.error(`[DATA] twelvedata error for ${symbol} (${tdSymbol}): ${j?.message || "unknown error"}`);
        } else {
          const data = j.values.map((v: any) => ({ time: new Date(v.datetime).getTime(), open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume ?? 0) })).filter((c: any) => Number.isFinite(c.close)).reverse();
          if (data.length > 0) { console.log(`[DATA] twelvedata Success: ${symbol} (${tdSymbol}) Length: ${data.length}`); return { candles: data, source: "twelvedata" }; }
          console.error(`[DATA] twelvedata returned empty data for ${symbol} (${tdSymbol})`);
        }
      } catch (e: any) { console.error(`[DATA] twelvedata parse failed for ${symbol} (${tdSymbol}): ${e?.message || e}`); }
    }
  } else {
    console.error(`[DATA] twelvedata skipped for ${symbol} — no API key`);
  }

  // If TwelveData fails, try Bybit for Gold PAXG and Silver XAGUSDT
  if (symbol === "XAUUSD" || symbol === "XAGUSD") {
    const bybitSymbol = symbol === "XAUUSD" ? "PAXGUSDT" : "XAGUSDT";
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=60&limit=${limit}`;
    const res = await fetchWithErrorLog(url, `bybit-${bybitSymbol}`, {});
    if (res) {
      try {
        const j = await res.json();
        const rows = j?.result?.list ?? [];
        candles = rows.map((k: any[]) => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5] ?? 0) })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite)).reverse();
        if (candles.length > 0) { console.log(`[DATA] bybit-${bybitSymbol} Success: ${symbol} Length: ${candles.length}`); return { candles, source: `bybit-${bybitSymbol}` }; }
        console.error(`[DATA] bybit-${bybitSymbol} returned empty data for ${symbol}`);
      } catch (e: any) { console.error(`[DATA] bybit-${bybitSymbol} parse failed for ${symbol}: ${e?.message || e}`); }
    }
  }

  console.error(`[DATA] Metal history failed for ${symbol} — all providers exhausted`);
  return { candles: [], source: "none" };
}


// ──────────────────────────────────────────────────────────────────────
// 6. FOREX — Frankfurter + TwelveData
// ──────────────────────────────────────────────────────────────────────
export async function fetchForexHistory(
  symbol: string,
  timeframe = "1h",
  limit = 200
): Promise<{ candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>; source: string }> {
  const base = symbol.slice(0, 3).toUpperCase();
  const quote = symbol.slice(3).toUpperCase();

  // Try Frankfurter first
  {
    const url = `https://api.frankfurter.app/latest?from=${base}&to=${quote}&amount=1`;
    const res = await fetchWithErrorLog(url, `frankfurter`, {});
    if (res) {
      try {
        const j = await res.json();
        console.log(`[DATA] frankfurter Success: ${symbol} (no history available)`);
        return { candles: [], source: "frankfurter" };
      } catch (e: any) { console.error(`[DATA] frankfurter parse failed for ${symbol}: ${e?.message || e}`); }
    }
  }

  // Try TwelveData for forex pairs
  const tdSymbol = `${base}/${quote}`;
  const apiKey = process.env.TWELVEDATA_API_KEY?.trim();
  if (apiKey) {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${timeframe}&outputsize=${limit}&apikey=${apiKey}`;
    const res = await fetchWithErrorLog(url, `twelvedata-forex`, {});
    if (res) {
      try {
        const j = await res.json();
        if (j?.status === "error") {
          console.error(`[DATA] twelvedata forex error for ${symbol}: ${j?.message || "unknown error"}`);
        } else if (Array.isArray(j?.values) && j.values.length > 0) {
          const data = j.values.map((v: any) => ({ time: new Date(v.datetime).getTime(), open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume ?? 0) })).filter((c: any) => Number.isFinite(c.close)).reverse();
          if (data.length > 0) { console.log(`[DATA] twelvedata forex Success: ${symbol} Length: ${data.length}`); return { candles: data, source: "twelvedata" }; }
        }
      } catch (e: any) { console.error(`[DATA] twelvedata forex parse failed for ${symbol}: ${e?.message || e}`); }
    }
  }

  console.error(`[DATA] Forex history failed for ${symbol} — all providers exhausted`);
  return { candles: [], source: "none" };
}

// ──────────────────────────────────────────────────────────────────────
// 7. STOCKS — TwelveData + Stooq
// ──────────────────────────────────────────────────────────────────────
export async function fetchStockHistory(
  symbol: string,
  timeframe = "1h",
  limit = 200
): Promise<{ candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>; source: string }> {
  const ticker = symbol.toUpperCase();
  let candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let source = "none";

  const apiKey = process.env.TWELVEDATA_API_KEY?.trim();

  if (apiKey) {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=${timeframe}&outputsize=${limit}&apikey=${apiKey}`;
    const res = await fetchWithErrorLog(url, `twelvedata-stock`, {});
    if (res) {
      try {
        const j = await res.json();
        if (j?.status === "error") {
          console.error(`[DATA] twelvedata stock error for ${symbol}: ${j?.message || "unknown error"}`);
        } else if (Array.isArray(j?.values) && j.values.length > 0) {
          const data = j.values.map((v: any) => ({ time: new Date(v.datetime).getTime(), open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume ?? 0) })).filter((c: any) => Number.isFinite(c.close)).reverse();
          if (data.length > 0) { console.log(`[DATA] twelvedata stock Success: ${symbol} Length: ${data.length}`); return { candles: data, source: "twelvedata" }; }
        }
      } catch (e: any) { console.error(`[DATA] twelvedata stock parse failed for ${symbol}: ${e?.message || e}`); }
    }
  } else {
    console.error(`[DATA] twelvedata stock skipped for ${symbol} — no API key`);
  }

  // Try Stooq as fallback
  {
    const url = `https://stooq.com/q/d/l/?s=${ticker.toLowerCase()}.us&i=d`;
    const res = await fetchWithErrorLog(url, `stooq`, {});
    if (res) {
      try {
        const text = await res.text();
        const lines = text.trim().split("\n").slice(1).slice(-100);
        const data = lines.map(l => { const [date, open, high, low, close] = l.split(","); return { time: Date.parse(date), open: parseFloat(open), high: parseFloat(high), low: parseFloat(low), close: parseFloat(close), volume: 0 }; }).filter(d => !isNaN(d.close));
        if (data.length > 0) { console.log(`[DATA] stooq Success: ${symbol} Length: ${data.length}`); return { candles: data, source: "stooq" }; }
      } catch (e: any) { console.error(`[DATA] stooq parse failed for ${symbol}: ${e?.message || e}`); }
    }
  }

  console.error(`[DATA] Stock history failed for ${symbol} — all providers exhausted`);
  return { candles: [], source: "none" };
}

// ──────────────────────────────────────────────────────────────────────
// 8. UNIFIED HISTORY FETCH (dispatches by market type)
// ──────────────────────────────────────────────────────────────────────
export async function fetchHistoryUnified(
  market: string,
  symbol: string,
  timeframe = "1h",
  limit = 200
): Promise<{ symbol: string; data: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>; source: string; count: number }> {
  const normalized = symbol.toUpperCase().replace(/-/g, "").replace(/\//g, "");

  try {
    if (market === "crypto") {
      const { candles, source } = await fetchCryptoHistory(normalized, timeframe, limit);
      return { symbol: normalized, data: candles, source, count: candles.length };
    }
    if (market === "metals") {
      const { candles, source } = await fetchMetalHistory(normalized, timeframe, limit);
      return { symbol: normalized, data: candles, source, count: candles.length };
    }
    if (market === "forex") {
      const { candles, source } = await fetchForexHistory(normalized, timeframe, limit);
      return { symbol: normalized, data: candles, source, count: candles.length };
    }
    if (market === "stocks") {
      const { candles, source } = await fetchStockHistory(normalized, timeframe, limit);
      return { symbol: normalized, data: candles, source, count: candles.length };
    }
    return { symbol: normalized, data: [], source: "none", count: 0 };
  } catch (e: any) {
    console.error(`[DATA] Unified fetch crashed for ${market}/${symbol}: ${e?.message || e}`);
    return { symbol: normalized, data: [], source: "none", count: 0 };
  }
}