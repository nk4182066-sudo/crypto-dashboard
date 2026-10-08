import { cached } from "@/src/lib/cache";

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
  "15m": { yahoo: "15m", initialDays: 7, chunkDays: 7, maximumDays: 60 },
  "1h": { yahoo: "1h", initialDays: 60, chunkDays: 30, maximumDays: 730 },
  "4h": { yahoo: "1h", initialDays: 90, chunkDays: 30, maximumDays: 730 },
  "1d": { yahoo: "1d", initialDays: 30, chunkDays: 365, maximumDays: 36500 },
  max: { yahoo: "1d", initialDays: 0, chunkDays: 365, maximumDays: 36500 },
} as const;

function intervalSecondsFor(timeframe: string): number {
  switch (timeframe) {
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

async function fetchBinanceHistory(
  symbol: string,
  timeframe: string,
  before: number | null,
  quoteOnly: boolean,
  now: number
) {
  const baseSymbol = symbol.replace(/-USD$/, "").replace(/USDT$/, "");
  const intervals: Record<string, string> = {
    "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d", max: "1d",
  };
  const interval = quoteOnly ? "1m" : intervals[timeframe];
  if (!/^[A-Z0-9]{1,15}$/.test(baseSymbol) || !interval) return null;

  const pair = `${baseSymbol}USDT`;
  const collected: Candle[] = [];
  let endTime = before === null ? now * 1000 : before * 1000 - 1;
  const pageCount = timeframe === "max" && !quoteOnly && before === null ? 40 : 1;

  for (let page = 0; page < pageCount; page += 1) {
    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", pair);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", quoteOnly ? "1" : "1000");
    url.searchParams.set("endTime", String(endTime));

    const rows = await cached(
      `binance:${url.toString()}`,
      { ttlMs: quoteOnly ? 30000 : 120000, staleMs: 900000 },
      async () => {
        try {
          const response = await fetch(url, { cache: "no-store" });
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
  const timeframe = searchParams.get("timeframe") ?? "1h";
  const quoteOnly = searchParams.get("quoteOnly") === "1";
  const interval = intervalOptions[timeframe as keyof typeof intervalOptions];
  const beforeValue = Number(searchParams.get("before"));
  const before = Number.isFinite(beforeValue) && beforeValue > 0 ? beforeValue : null;

  if (!/^[A-Z0-9.^=_-]{1,24}$/.test(symbol) || !interval) {
    return Response.json({ error: "A valid market symbol and timeframe are required." }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);

  // ---- Source chain -------------------------------------------------------
  // crypto : Binance (primary, no key)   -> Yahoo -> generated
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

  if (market === "crypto") {
    // Binance first: free, no API key, and far more reliable than Yahoo,
    // which rate-limits unauthenticated calls.
    const binance = await fetchBinanceHistory(symbol, timeframe, before, quoteOnly, now);
    if (binance && (quoteOnly || binance.candles.length > 0)) {
      return Response.json(binance, { headers: { "Cache-Control": "no-store" } });
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

  // Metals are not listed on Binance or Frankfurter, so they resolve to Yahoo's
  // futures symbols before the generic Yahoo call below. The spot "XAUUSD=X" /
  // "XAGUSD=X" tickers were retired by Yahoo (they now answer 404), so these
  // map to the COMEX futures contracts, which Yahoo still serves.
  const metalsYahooSymbol: Record<string, string> = {
    XAU: "GC=F",
    XAG: "SI=F",
    XPT: "PL=F",
    XPD: "PA=F",
    XCU: "HG=F",
  };
  const providerSymbol = market === "metals"
    ? (metalsYahooSymbol[symbol.split("-")[0]] ?? `${symbol.split("-")[0]}USD=X`)
    : symbol;

  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}`);
  url.searchParams.set("interval", quoteOnly ? "1m" : interval.yahoo);
  url.searchParams.set("events", "history");

  if (quoteOnly) {
    url.searchParams.set("range", "1d");
  } else if (timeframe === "max") {
    url.searchParams.set("period1", "0");
    url.searchParams.set("period2", String(now + 60));
  } else {
    const periodEnd = before ?? now + 60;
    const periodDays = before ? interval.chunkDays : interval.initialDays;
    url.searchParams.set("period1", String(Math.max(0, periodEnd - periodDays * 24 * 60 * 60)));
    url.searchParams.set("period2", String(periodEnd));
  }

  const payload = await cached<YahooChartResult | null>(
    `yahoo:${url.toString()}`,
    { ttlMs: quoteOnly ? 30 * 1000 : 2 * 60 * 1000, staleMs: 15 * 60 * 1000 },
    async () => {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return null;
        const body: unknown = await response.json();
        const record = body as { chart?: { result?: YahooChartResult[] } };
        return record.chart?.result?.[0] ?? null;
      } catch {
        return null;
      }
    },
  );

  try {
    const result = payload;
    const quote = result?.indicators?.quote?.[0];
    if (!result || !quote) {
      // Yahoo gave nothing usable; serve generated data so the chart renders.
      return Response.json(synthetic(), { headers: { "Cache-Control": "no-store" } });
    }

    const timestamps = result.timestamp ?? [];
    let candles = timestamps.flatMap((time, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      if (open == null || high == null || low == null || close == null) return [];
      return [{ time, open, high, low, close, volume: quote.volume?.[index] ?? 0 }];
    });

    if (candles.length === 0) {
      return Response.json(synthetic(), { headers: { "Cache-Control": "no-store" } });
    }

    if (timeframe === "4h") candles = aggregateFourHourCandles(candles);

    const marketPrice = result.meta?.regularMarketPrice ?? candles[candles.length - 1]?.close ?? null;
    const oldestTime = candles[0]?.time ?? null;
    const historyCutoff = now - interval.maximumDays * 24 * 60 * 60;
    const hasMore = timeframe !== "max" && candles.length > 0 && oldestTime !== null && oldestTime > historyCutoff;

    return Response.json({
      candles: quoteOnly ? [] : candles,
      hasMore,
      quote: {
        price: marketPrice,
        previousClose: result.meta?.chartPreviousClose ?? null,
        timestamp: result.meta?.regularMarketTime ?? candles[candles.length - 1]?.time ?? now,
        currency: result.meta?.currency ?? "USD",
      },
      source: "Yahoo Finance",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Last resort: generated data beats an error the user cannot act on.
    console.error("Error fetching market history:", error);
    return Response.json(synthetic(), { headers: { "Cache-Control": "no-store" } });
  }
}
