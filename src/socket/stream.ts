import { cached } from "../lib/cache.ts";
import { allClients, broadcast, heartbeat } from "./ws.ts";

/**
 * Feature 5 — pushes price ticks to subscribed clients on an interval so the UI
 * updates without polling. Quotes are fetched once per cycle and fanned out to
 * every watcher, so N clients watching 1 symbol still costs 1 provider call.
 */

const TICK_MS = 5000;
const QUOTE_TTL_MS = 4000;

interface Quote {
  symbol: string;
  price: number;
  previousClose: number | null;
  changePercent: number | null;
  at: number;
}

const globalKey = "__priceStreamTimer";
type GlobalWithStream = typeof globalThis & { [globalKey]?: ReturnType<typeof setInterval> };

/** Collects every symbol any client currently watches. */
function watchedSymbols(): string[] {
  const symbols = new Set<string>();
  for (const client of allClients()) {
    for (const symbol of client.subscriptions) symbols.add(symbol);
  }
  return [...symbols];
}

async function fetchQuote(symbol: string): Promise<Quote | null> {
  return cached<Quote | null>(`quote:${symbol}`, { ttlMs: QUOTE_TTL_MS, staleMs: 60 * 1000 }, async () => {
    try {
      const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
      url.searchParams.set("interval", "1m");
      url.searchParams.set("range", "1d");

      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
      if (!response.ok) return null;

      const body = await response.json() as {
        chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }[] };
      };
      const meta = body.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      if (typeof price !== "number" || !Number.isFinite(price)) return null;

      const previousClose = typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose : null;
      return {
        symbol,
        price,
        previousClose,
        changePercent: previousClose ? ((price - previousClose) / previousClose) * 100 : null,
        at: Date.now(),
      };
    } catch {
      return null;
    }
  });
}

async function tick(): Promise<void> {
  const symbols = watchedSymbols();
  if (symbols.length === 0) return;

  const quotes = await Promise.all(symbols.map((symbol) => fetchQuote(symbol)));
  const priced = quotes.filter((quote): quote is Quote => quote !== null);
  if (priced.length === 0) return;

  broadcast(priced.map((quote) => quote.symbol), {
    type: "prices",
    at: Date.now(),
    quotes: priced,
  });
}

/** Starts the broadcast loop. Safe to call more than once. */
export function startPriceStream(): void {
  const scope = globalThis as GlobalWithStream;
  if (scope[globalKey]) return;

  scope[globalKey] = setInterval(() => {
    tick().catch((error) => console.error("[socket] tick failed:", error));
  }, TICK_MS);

  // Ping on the same cadence so dead sockets get reaped.
  setInterval(heartbeat, TICK_MS * 3).unref?.();

  console.log(`[socket] price stream started, interval ${TICK_MS}ms`);
}

export function stopPriceStream(): void {
  const scope = globalThis as GlobalWithStream;
  if (!scope[globalKey]) return;
  clearInterval(scope[globalKey]);
  delete scope[globalKey];
}