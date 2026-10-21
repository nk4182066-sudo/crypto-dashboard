/**
 * src/lib/data/twelveData.ts — TwelveData `time_series` provider.
 *
 * SINGLE TRUTH for NON-crypto candles (spec A/B/C): forex, stocks, metals and
 * oil resolve to TwelveData; crypto NEVER comes here — Binance stays the only
 * crypto source in app/api/market/history/route.ts.
 *
 * Yahoo is the fallback whenever TwelveData is unconfigured, rate-limited or has
 * no data for a symbol: this module returns null (never throws) and the history
 * route falls through to Frankfurter/Yahoo so the chart still renders REAL data
 * instead of synthetic demo candles.
 *
 * Responses are memoised with the shared 5-minute `cached()` window (spec C) —
 * TwelveData's free tier is 8 requests/min / 800 per day, and the dashboard polls
 * far more often than that. A stale cache value is served when a refresh fails,
 * so a transient rate-limit degrades to slightly old data instead of an error.
 *
 * Educational analysis only — not financial advice.
 */
import { cached } from "@/src/lib/cache";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** History-route shaped payload (matches the Binance/Yahoo branch shape). */
export interface TwelveDataResult {
  candles: Candle[];
  hasMore: boolean;
  quote: {
    price: number;
    previousClose: number | null;
    timestamp: number;
    currency: string;
  };
  source: string;
}

/** One raw row from TwelveData (every field is a numeric string). */
interface TwelveDataRow {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

interface TwelveDataPayload {
  values?: TwelveDataRow[];
  status?: string;
  code?: number;
  message?: string;
}

/** Fresh lifetime for one cached series (spec C — 5-minute cache). */
const CACHE_TTL_MS = 5 * 60 * 1000;
/** Long stale window so a rate-limited refresh degrades to slightly old data. */
const CACHE_STALE_MS = 60 * 60 * 1000;
/** Hard network timeout so a stalled call can never hang the history route. */
const FETCH_TIMEOUT_MS = 8000;
/** Bars requested per non-quote series (plenty for EMA200 + swing pivots). */
const OUTPUT_SIZE = 500;

/** Internal timeframe -> TwelveData interval. */
function tdInterval(timeframe: string): string | null {
  switch (timeframe) {
    case "1m": return "1min";
    case "5m": return "5min";
    case "15m": return "15min";
    case "1h": return "1h";
    case "4h": return "4h";
    case "1d":
    case "max": return "1day";
    default: return null;
  }
}

/** Futures/commodity contracts -> TwelveData spot symbols (spec-confirmed). */
const FUTURES_TO_SPOT: Record<string, string> = {
  GC: "XAU/USD",    // Gold
  SI: "XAG/USD",    // Silver
  PL: "XPT/USD",    // Platinum
  PA: "XPD/USD",    // Palladium
  CL: "WTI/USD",    // WTI crude oil
  BZ: "XBR/USD",    // Brent crude oil
  HG: "COPPER/USD", // Copper
};

/** Bare metal labels -> spot symbols. */
const METAL_LABELS: Record<string, string> = {
  XAUUSD: "XAU/USD",
  XAGUSD: "XAG/USD",
  XPTUSD: "XPT/USD",
  XPDUSD: "XPD/USD",
};

/**
 * Map an internal/universe symbol to a TwelveData symbol, or null when the
 * symbol is not a TwelveData instrument (e.g. `BTC-USD` — crypto is handled by
 * Binance and must never reach this provider). Accepts `EURUSD=X`, `AAPL`,
 * `GC=F`, `XAU/USD` and `XAUUSD`.
 */
export function toTwelveDataSymbol(symbol: string): string | null {
  const raw = String(symbol ?? "").trim().toUpperCase();
  if (!raw) return null;

  // Already TwelveData format: "EUR/USD", "XAU/USD", "WTI/USD".
  if (raw.includes("/")) return raw;

  // Forex: "EURUSD=X" -> "EUR/USD".
  if (raw.endsWith("=X")) {
    const base = raw.slice(0, -2);
    if (/^[A-Z]{6}$/.test(base)) return `${base.slice(0, 3)}/${base.slice(3)}`;
    return null;
  }

  // Futures: "GC=F" -> "XAU/USD" via the contract table.
  if (raw.endsWith("=F")) {
    return FUTURES_TO_SPOT[raw.slice(0, -2)] ?? null;
  }

  // Bare metal labels: "XAUUSD" -> "XAU/USD".
  const labeled = METAL_LABELS[raw];
  if (labeled) return labeled;

  // Stock tickers pass through (AAPL, SPY, GOOGL). Anything with a `-` or a
  // crypto-style id fails this and returns null, so a crypto pair can never be
  // priced here even if a caller mislabels it.
  if (/^[A-Z]{1,6}$/.test(raw)) return raw;

  return null;
}

/** Parse a TwelveData `datetime` ("2026-01-01 12:00:00" or "2026-01-01") to epoch seconds (UTC). */
function toEpoch(datetime?: string): number | null {
  if (!datetime) return null;
  const cleaned = datetime.replace("T", " ").trim();
  const [datePart, timePart = "00:00:00"] = cleaned.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return null;
  const [hh = 0, mm = 0, ss = 0] = timePart.split(".")[0].split(":").map((v) => Number(v) || 0);
  return Math.floor(Date.UTC(y, m - 1, d, hh, mm, ss) / 1000);
}

/** Format an epoch second as TwelveData's `end_date` datetime ("2026-01-01 12:00:00" UTC). */
function toEndParam(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Fetch one series from TwelveData. Returns null (never throws) when the key is
 * absent, the symbol is not a TwelveData instrument, the API errors/rate-limits,
 * or the series is empty — the caller then falls back to Yahoo.
 */
export async function fetchTwelveDataHistory(
  symbol: string,
  timeframe: string,
  quoteOnly: boolean,
  before: number | null,
  now: number
): Promise<TwelveDataResult | null> {
  try {
    const apiKey = process.env.TWELVEDATA_API_KEY?.trim();
    if (!apiKey) return null;

    const tdSymbol = toTwelveDataSymbol(symbol);
    if (!tdSymbol) return null;

    // Quotes want the freshest possible tick (1min); candles use the real interval.
    const interval = quoteOnly ? "1min" : tdInterval(timeframe);
    if (!interval) return null;

    // 2 bars for a quote (price + previousClose); a full page for candles.
    const outputsize = quoteOnly ? 2 : OUTPUT_SIZE;

    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", tdSymbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("outputsize", String(outputsize));
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("apikey", apiKey);
    // Backward paging: Twelve Data supports `end_date` (NOT `end` — an
    // unknown `end` param is silently IGNORED by the API, which would always
    // return the newest bars and never backfill).
    // `end_date` is INCLUSIVE (the bar opening exactly at that instant IS
    // returned), so we ask for one second before the oldest bar we already
    // hold to get a strictly older page.
    if (before !== null && !quoteOnly) url.searchParams.set("end_date", toEndParam(before - 1));

    const cacheKey = `twelve:${tdSymbol}:${interval}:${outputsize}:${before ?? "now"}`;

    let payload: TwelveDataPayload;
    try {
      payload = await cached<TwelveDataPayload>(
        cacheKey,
        { ttlMs: CACHE_TTL_MS, staleMs: CACHE_STALE_MS },
        async () => {
          const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
          if (!response.ok) throw new Error(`TwelveData HTTP ${response.status}`);
          const body = (await response.json()) as TwelveDataPayload;
          if (!body || body.status === "error" || !Array.isArray(body.values) || body.values.length === 0) {
            throw new Error(body?.message ?? "TwelveData empty series");
          }
          return body;
        }
      );
    } catch {
      // Unconfigured / rate-limited / down with no stale value — fall back to Yahoo.
      return null;
    }

    // TwelveData returns newest-first; parse then sort chronologically.
    const candles: Candle[] = [];
    for (const row of payload.values ?? []) {
      const time = toEpoch(row.datetime);
      const open = Number(row.open);
      const high = Number(row.high);
      const low = Number(row.low);
      const close = Number(row.close);
      if (time === null || ![open, high, low, close].every(Number.isFinite)) continue;
      candles.push({ time, open, high, low, close, volume: Number(row.volume) || 0 });
    }
    if (candles.length === 0) return null;
    candles.sort((a, b) => a.time - b.time);

    const latest = candles[candles.length - 1];
    const previousClose = candles.length >= 2 ? candles[candles.length - 2].close : null;
    // Quote currency = the second side of the pair (EUR/USD -> USD, USD/JPY -> JPY);
    // bare stock tickers settle in USD.
    const currency = tdSymbol.includes("/") ? tdSymbol.split("/")[1] : "USD";

    return {
      candles: quoteOnly ? [] : candles,
      hasMore: quoteOnly ? false : candles.length >= outputsize && timeframe !== "max",
      quote: {
        price: latest.close,
        previousClose,
        timestamp: latest.time || now,
        currency,
      },
      source: "Twelve Data",
    };
  } catch (error) {
    console.warn("[twelveData] fetch failed:", error instanceof Error ? error.message : error);
    return null;
  }
}


