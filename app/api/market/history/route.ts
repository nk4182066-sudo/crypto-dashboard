import { cached } from "@/src/lib/cache";
import { fetchTwelveDataHistory } from "@/src/lib/data/twelveData";
import Biquote from "biquote";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const bq = new Biquote();

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface YahooChartResult {
  timestamp?: number[];
  indicators?: {
    quote?: {
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }[];
  };
  meta?: {
    currency?: string;
    regularMarketPrice?: number;
    regularMarketTime?: number;
    chartPreviousClose?: number;
  };
}

const intervalOptions = {
  "1m": { yahoo: "1m", initialDays: 1, chunkDays: 1, maximumDays: 7 },
  "5m": { yahoo: "5m", initialDays: 2, chunkDays: 2, maximumDays: 30 },
  "15m": { yahoo: "15m", initialDays: 7, chunkDays: 7, maximumDays: 60 },
  "1h": { yahoo: "1h", initialDays: 60, chunkDays: 30, maximumDays: 730 },
  "4h": { yahoo: "1h", initialDays: 90, chunkDays: 30, maximumDays: 730 },
  "1d": { yahoo: "1d", initialDays: 30, chunkDays: 365, maximumDays: 36500 },
  max: { yahoo: "1d", initialDays: 0, chunkDays: 365, maximumDays: 36500 },
} as const;

function intervalSecondsFor(timeframe: string): number {
  switch (timeframe) {
    case "1m": return 60;
    case "5m": return 5 * 60;
    case "15m": return 15 * 60;
    case "1h": return 60 * 60;
    case "4h": return 4 * 60 * 60;
    case "1d":
    case "max": return 24 * 60 * 60;
    default: return 60 * 60;
  }
}

function aggregateFourHourCandles(candles: Candle[]): Candle[] {
  const bucketSeconds = 4 * 60 * 60;
  const grouped = new Map<number, Candle>();
  for (const candle of candles) {
    const bucketTime = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const existing = grouped.get(bucketTime);
    if (existing) {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close;
      existing.volume += candle.volume;
    } else {
      grouped.set(bucketTime, { ...candle, time: bucketTime });
    }
  }
  return [...grouped.values()].sort((a, b) => a.time - b.time);
}

// ── Bybit OHLCV (secondary crypto feed — real volume, kept as fallback) ──
// MASLA 12: Binance's api.binance.com answers HTTP 451 on Vercel's US edge, which
// silently dropped crypto volume to 0 (the "Volume 0.00x" bug that capped every
// signal at 7/8). The route now calls Binance through the geo-safe
// data-api.binance.vision spot mirror first; Bybit stays in the chain as another
// real-volume source (observed 403/slow-fail from Vercel's US region, so its
// timeout is capped low to keep the route snappy).
interface BybitHistoryResponse {
  retCode: number;
  result?: { list?: string[][] };
}

function bybitInterval(timeframe: string): string | null {
  switch (timeframe) {
    case "1m": return "1";
    case "5m": return "5";
    case "15m": return "15";
    case "1h": return "60";
    case "4h": return "240";
    case "1d":
    case "max": return "D";
    default: return null;
  }
}

async function fetchBybitHistory(
  symbol: string,
  timeframe: string,
  quoteOnly: boolean,
  now: number
) {
  const baseSymbol = symbol.replace(/-USD$/, "").replace(/USDT$/, "");
  const interval = bybitInterval(timeframe);
  if (!/^[A-Z0-9]{1,15}$/.test(baseSymbol) || !interval) return null;
  const pair = `${baseSymbol}USDT`;

  const url = new URL("https://api.bybit.com/v5/market/kline");
  url.searchParams.set("category", "linear");
  url.searchParams.set("symbol", pair);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", quoteOnly ? "1" : "500");

  let payload: BybitHistoryResponse | null = null;
  try {
    // 5s cap: healthy Bybit answers in <1s; a US-side 403/drop must not stall the route.
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    payload = (await response.json()) as BybitHistoryResponse;
  } catch {
    return null;
  }
  if (!payload || payload.retCode !== 0) return null;

  const rows = payload.result?.list ?? [];
  // Bybit returns newest-first; reverse to chronological and map to our Candle.
  const candles: Candle[] = rows
    .map((row): Candle | null => {
      if (!Array.isArray(row) || row.length < 6) return null;
      const values = [row[0], row[1], row[2], row[3], row[4], row[5]].map(Number);
      if (!values.every(Number.isFinite)) return null;
      return {
        time: Math.floor(values[0] / 1000),
        open: values[1], high: values[2], low: values[3],
        close: values[4], volume: values[5],
      };
    })
    .filter((c): c is Candle => c !== null)
    .reverse();

  if (candles.length === 0) return null;
  const latest = candles[candles.length - 1];
  return {
    candles: quoteOnly ? [] : candles,
    hasMore: false,
    quote: {
      price: latest.close,
      previousClose: null,
      timestamp: latest.time,
      currency: "USDT",
    },
    source: "Bybit",
  };
}

async function fetchBinanceHistory(
  symbol: string,
  timeframe: string,
  before: number | null,
  quoteOnly: boolean,
  now: number
) {
  const baseSymbol = symbol.replace(/-USD$/, "").replace(/USDT$/, "");
  // BTC-USD -> BTCUSDT: Binance only lists *USDT spot pairs. Forex/stocks
  // never reach here (handled by Yahoo / Frankfurter in the GET handler).
  const intervals: Record<string, string> = {
    "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d", max: "1d",
  };
  const interval = quoteOnly ? "1m" : intervals[timeframe];
  if (!/^[A-Z0-9]{1,15}$/.test(baseSymbol) || !interval) return null;

  const pair = `${baseSymbol}USDT`;
  const collected: Candle[] = [];
  let endTime = before === null ? now * 1000 : before * 1000 - 1;
  const pageCount = timeframe === "max" && !quoteOnly && before === null ? 40 : 1;

  // data-api.binance.vision = Binance's official public SPOT mirror. Unlike
  // api.binance.com (HTTP 451 from Vercel's US edge) it is not geo-blocked, and
  // it serves the exact same /api/v3/klines payload — proven in all-coins.
  const klineHost = "https://data-api.binance.vision";

  for (let page = 0; page < pageCount; page += 1) {
    const url = new URL(`${klineHost}/api/v3/klines`);
    url.searchParams.set("symbol", pair);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", quoteOnly ? "1" : "1000");
    url.searchParams.set("endTime", String(endTime));

    const rows = await cached(
      `binance:${url.toString()}`,
      // Live: short TTL so 5s/30s client polls get fresh candles, with a long
      // stale window as a graceful fallback if Binance throttles us.
      { ttlMs: quoteOnly ? 4000 : 15000, staleMs: 900000 },
      async () => {
        try {
          // 10s hard timeout so a stalled Binance call can't hang the request.
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(url, { cache: "no-store", signal: controller.signal });
          clearTimeout(timer);
          if (!response.ok) return null;
          return response.json() as Promise<unknown>;
        } catch {
          return null;
        }
      }
    );

    if (!Array.isArray(rows) || rows.length === 0) break;
    const candles = rows.flatMap((row): Candle[] => {
      if (!Array.isArray(row) || row.length < 6) return [];
      const [time, open, high, low, close, volume] = row;
      const values = [time, open, high, low, close, volume].map(Number);
      if (!values.every(Number.isFinite)) return [];
      return [{
        time: Math.floor(values[0] / 1000),
        open: values[1], high: values[2], low: values[3],
        close: values[4], volume: values[5],
      }];
    });
    if (candles.length === 0) break;
    collected.unshift(...candles);
    if (quoteOnly || timeframe !== "max" || before !== null || rows.length < 1000) break;
    endTime = candles[0].time * 1000 - 1;
  }

  if (collected.length === 0) return null;
  const latest = collected[collected.length - 1];
  return {
    candles: quoteOnly ? [] : collected,
    // Pagination flag driving the client's "load older history" backfill.
    hasMore: !quoteOnly && timeframe !== "max" && collected.length === 1000,
    quote: {
      price: before === null ? latest.close : null,
      previousClose: null,
      timestamp: latest.time,
      currency: "USDT",
    },
    source: "Binance",
  };
}

async function fetchFrankfurterHistory(
  symbol: string,
  timeframe: string,
  now: number
) {
  const [base, quote] = symbol.split("-");
  if (!base || !quote || base === quote) return null;
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote)) return null;

  const days = timeframe === "max" ? 3650 : timeframe === "1d" ? 365 : 120;
  const start = new Date((now - days * 86400) * 1000).toISOString().slice(0, 10);
  const end = new Date(now * 1000).toISOString().slice(0, 10);
  const url = new URL(`https://api.frankfurter.app/${start}..${end}`);
  url.searchParams.set("from", base);
  url.searchParams.set("to", quote);

  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const payload = (await response.json()) as { rates?: Record<string, Record<string, unknown>> };
    const rates = payload.rates;
    if (!rates) return null;

    const candles: Candle[] = [];
    let previousClose: number | null = null;
    for (const date of Object.keys(rates).sort()) {
      const value = rates[date]?.[quote];
      const close = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(close) || close <= 0) continue;
      const open = previousClose ?? close;
      const time = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
      candles.push({
        time, open,
        high: Math.max(open, close),
        low: Math.min(open, close),
        close, volume: 0,
      });
      previousClose = close;
    }

    if (candles.length < 2) return null;
    const latest = candles[candles.length - 1];
    return {
      candles,
      quote: {
        price: latest.close,
        previousClose: candles[candles.length - 2]?.close ?? null,
        timestamp: latest.time,
        currency: "USD",
      },
    };
  } catch {
    return null;
  }
}

function buildFallbackCandles(symbol: string, timeframe: string, now: number, count = 180): Candle[] {
  let seed = 2166136261;
  for (let i = 0; i < symbol.length; i += 1) {
    seed ^= symbol.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const secondsPerCandle = intervalSecondsFor(timeframe);
  const base =
    symbol.includes("BTC") ? 86000 :
    symbol.includes("ETH") ? 3400 :
    symbol.includes("SOL") ? 175 :
    symbol.includes("XRP") ? 0.52 :
    symbol.includes("EUR") ? 1.08 :
    symbol.includes("GBP") ? 1.27 :
    symbol.includes("JPY") ? 155 :
    symbol.includes("XAU") || symbol.includes("GOLD") ? 2400 :
    symbol.includes("XAG") || symbol.includes("SILVER") ? 28 :
    symbol.includes("OIL") ? 78 : 100;
  const volatility = base * 0.012;
  const end = Math.floor(now / secondsPerCandle) * secondsPerCandle;

  const candles: Candle[] = [];
  let close = base;
  for (let index = 0; index < count; index += 1) {
    const open = close;
    close = Math.max(base * 0.05, open + (random() - 0.485) * volatility);
    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    candles.push({
      time: end - (count - 1 - index) * secondsPerCandle,
      open,
      high: bodyHigh + random() * volatility * 0.6,
      low: Math.max(base * 0.01, bodyLow - random() * volatility * 0.6),
      close,
      volume: Math.round((0.6 + random() * 0.8) * volatility * 1000),
    });
  }
  return candles;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase() ?? "";
  const market = searchParams.get("market") ?? "";

  // BULLETPROOF: Stop crypto from EVER reaching biquote.
  // Must run before any other logic — case-insensitive to catch "Crypto"/"CRYPTO" etc.
  if (market.toLowerCase() === "crypto") {
    return new Response(
      JSON.stringify({ error: "Crypto must use scanner — biquote disabled for crypto" }),
      { status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }

  const timeframe = searchParams.get("timeframe") ?? "1h";
  const quoteOnly = searchParams.get("quoteOnly") === "1";
  const interval = intervalOptions[timeframe as keyof typeof intervalOptions];
  const beforeValue = Number(searchParams.get("before"));
  const before = Number.isFinite(beforeValue) && beforeValue > 0 ? beforeValue : null;

  // Optional exact end timestamp from signal/analysis callers (`endTime`).
  // A caller that pins `endTime` wants the freshest possible window; otherwise
  // fall back to the default `before ?? now + 60` semantics.
  const endTime = Number(searchParams.get("endTime"));
  const endTimeValid = Number.isFinite(endTime) && endTime > 0 ? endTime : null;
  const now = Math.floor(Date.now() / 1000);

  // ---- Source chain -------------------------------------------------------
  // crypto : Binance vision mirror (no key, geo-safe) -> Bybit -> Yahoo -> generated
  // forex  : Frankfurter (daily, no key) -> Yahoo -> generated
  // stocks : Yahoo -> generated           (metals share this path)
  // A valid symbol never gets an empty or error body, which is what keeps the
  // client off "Loading chart data...".
  const synthetic = () => {
    const candles = buildFallbackCandles(symbol, timeframe, now);
    const latest = candles[candles.length - 1];
    return {
      candles: quoteOnly ? [] : candles,
      hasMore: false,
      quote: {
        price: latest.close,
        previousClose: candles[candles.length - 2]?.close ?? null,
        timestamp: latest.time,
        currency: "USD",
      },
      source: "Generated demo data",
      degraded: true,
    };
  };

  // ---- TwelveData (spec A/B): PRIMARY real source for forex/stocks/metals/oil.
  // Crypto is deliberately excluded — Binance remains the ONLY crypto source.
  // Falls through to Frankfurter/Yahoo below whenever TwelveData is
  // unconfigured, rate-limited or has no data for the symbol.
  if (market !== "crypto") {
    const twelve = await fetchTwelveDataHistory(symbol, timeframe, quoteOnly, before, now);
    if (twelve && (quoteOnly || twelve.candles.length > 0)) {
      return Response.json(twelve, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
  }

  if (market === "crypto") {
    // Binance first — reached through the geo-safe data-api.binance.vision spot
    // mirror (api.binance.com answers HTTP 451 on Vercel's US edge; the Bybit
    // path can 403/slow-fail there too, which left the chain on Yahoo Finance
    // whose 1h candles carry volume=0 — the "Volume 0.00x" bug, MASLA 12).
    const binance = await fetchBinanceHistory(symbol, timeframe, before, quoteOnly, now);
    if (binance && (quoteOnly || binance.candles.length > 0)) {
      return Response.json(binance, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    // Bybit stays in the chain as a second real-volume feed (fast from local/Asia).
    const bybit = await fetchBybitHistory(symbol, timeframe, quoteOnly, now);
    if (bybit && (quoteOnly || bybit.candles.length > 0)) {
      return Response.json(bybit, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
  } else if (market === "forex" && (timeframe === "1d" || timeframe === "max")) {
    // Frankfurter publishes once per day, so it only answers daily series.
    const frankfurter = await fetchFrankfurterHistory(symbol, timeframe, now);
    if (frankfurter && frankfurter.candles.length > 1) {
      return Response.json({
        candles: quoteOnly ? [] : frankfurter.candles,
        hasMore: false,
        quote: frankfurter.quote,
        source: "Frankfurter (ECB)",
      }, { headers: { "Cache-Control": "no-store" } });
    }
  }

  // BULLETPROOF: Stop crypto from EVER reaching biquote.
  // Must run before any other logic — case-insensitive to catch "Crypto"/"CRYPTO" etc.
  if (market.toLowerCase() === "crypto") {
    return new Response(
      JSON.stringify({ error: "Crypto must use scanner — biquote disabled for crypto" }),
      { status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }

  // Yahoo Finance blocks Vercel IPs — switch to biquote (MetaTrader 5 feed, no API key)
  // for Forex, Stocks, and Metals only.
  console.log(`[DATA] Yahoo blocked, using biquote for ${market}/${symbol}`);
  try {
    const bars = await bq.ohlc(symbol, { interval: timeframe as any, limit: 500 });

    // Validate timestamps — reject 1970-01-01 epoch-zero candles
    let validCandles: Candle[] = [];
    for (const bar of bars) {
      const t = Date.parse(bar.openTime);
      if (!Number.isFinite(t) || t === 0 || new Date(t).getFullYear() < 2020) continue;
      validCandles.push({
        time: Math.floor(t / 1000),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    }

    if (validCandles.length === 0) {
      return Response.json(synthetic(), { headers: { "Cache-Control": "no-store" } });
    }

    if (timeframe === "4h") {
      validCandles.sort((a, b) => a.time - b.time);
      validCandles = aggregateFourHourCandles(validCandles);
    }

    const latest = validCandles[validCandles.length - 1];
    const oldestTime = validCandles[0]?.time ?? null;
    const historyCutoff = now - (interval.maximumDays || 30) * 24 * 60 * 60;
    const hasMore = timeframe !== "max" && validCandles.length > 0 && oldestTime !== null && oldestTime > historyCutoff;

    return Response.json({
      candles: quoteOnly ? [] : validCandles,
      hasMore,
      quote: {
        price: latest.close,
        previousClose: validCandles.length > 1 ? validCandles[validCandles.length - 2].close : null,
        timestamp: latest.time,
        currency: "USD",
      },
      source: "biquote",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.warn(`[DATA] biquote failed for ${market}/${symbol}:`, error instanceof Error ? error.message : String(error));
    return Response.json(synthetic(), { headers: { "Cache-Control": "no-store" } });
  }
}

/** Global scan stability: wrap each symbol fetch in try/catch */
function withScanStability<T>(fn: () => Promise<T>): Promise<T | null> {
  return async () => {
    try {
      return await fn();
    } catch (error) {
      console.log("[market/history] Symbol not found/blocked, skip");
      return null;
    }
  };
}
