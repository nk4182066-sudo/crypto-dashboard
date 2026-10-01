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

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BinanceHistory {
  candles: Candle[];
  hasMore: boolean;
  quote: { price: number | null; previousClose: null; timestamp: number; currency: "USDT" };
  source: "Binance";
}

const intervalOptions = {
  "15m": { yahoo: "15m", initialDays: 7, chunkDays: 7, maximumDays: 60 },
  "1h": { yahoo: "1h", initialDays: 60, chunkDays: 30, maximumDays: 730 },
  "4h": { yahoo: "1h", initialDays: 90, chunkDays: 30, maximumDays: 730 },
  "1d": { yahoo: "1d", initialDays: 30, chunkDays: 365, maximumDays: 36500 },
  max: { yahoo: "1d", initialDays: 0, chunkDays: 365, maximumDays: 36500 },
} as const;

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

  return [...grouped.values()].sort((first, second) => first.time - second.time);
}

async function fetchBinanceHistory(symbol: string, timeframe: string, before: number | null, quoteOnly: boolean, now: number): Promise<BinanceHistory | null> {
  const baseSymbol = symbol.replace(/-USD$/, "");
  const intervals: Record<string, string> = { "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d", max: "1d" };
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

    let response: Response;
    try {
      response = await fetch(url, { cache: "no-store" });
    } catch {
      return null;
    }
    if (!response.ok) return null;

    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    const candles = rows.flatMap((row): Candle[] => {
      if (!Array.isArray(row) || row.length < 6) return [];
      const [time, open, high, low, close, volume] = row;
      const values = [time, open, high, low, close, volume].map(Number);
      if (!values.every(Number.isFinite)) return [];
      return [{ time: Math.floor(values[0] / 1000), open: values[1], high: values[2], low: values[3], close: values[4], volume: values[5] }];
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

  const cryptoFallback = () => market === "crypto"
    ? fetchBinanceHistory(symbol, timeframe, before, quoteOnly, Math.floor(Date.now() / 1000))
    : Promise.resolve(null);
  const now = Math.floor(Date.now() / 1000);
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
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

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });

    if (!response.ok) {
      const fallback = await cryptoFallback();
      if (fallback) return Response.json(fallback, { headers: { "Cache-Control": "no-store" } });
      if (before !== null && response.status >= 400 && response.status < 500) {
        return Response.json({ candles: [], hasMore: false });
      }
      return Response.json({ error: `Historical data provider returned ${response.status}.` }, { status: 502 });
    }

    const payload = await response.json();
    const result: YahooChartResult | undefined = payload.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    if (!result || !quote) {
      const fallback = await cryptoFallback();
      if (fallback) return Response.json(fallback, { headers: { "Cache-Control": "no-store" } });
      if (before !== null) return Response.json({ candles: [], hasMore: false });
      return Response.json({ error: `No historical candles are available for ${symbol}.` }, { status: 404 });
    }

    let candles = timestamps.flatMap((time, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      if (open === null || open === undefined || high === null || high === undefined || low === null || low === undefined || close === null || close === undefined) {
        return [];
      }
      return [{ time, open, high, low, close, volume: quote.volume?.[index] ?? 0 }];
    });

    if (candles.length === 0) {
      const fallback = await cryptoFallback();
      if (fallback) return Response.json(fallback, { headers: { "Cache-Control": "no-store" } });
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
    const fallback = await cryptoFallback();
    if (fallback) return Response.json(fallback, { headers: { "Cache-Control": "no-store" } });
    console.error("Error fetching market history:", error);
    return Response.json({ error: "Unable to fetch historical market data." }, { status: 502 });
  }
}