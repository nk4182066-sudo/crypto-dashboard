// Market data â€” one endpoint for every asset class.
//
// GET /api/market/all-coins
//   -> { success, timestamp, data: { spot, futures, forex, stocks, metals }, coins, total }
//
// Sources:
//   spot    â€” Binance /api/v3/ticker/24hr   (all USDT pairs, leveraged tokens excluded)
//   futures â€” Binance /fapi/v1/ticker/24hr  (all USDT perps)
//   forex   â€” frankfurter (primary) + open.er-api (fallback), cross-rates from USD
//   stocks  â€” Yahoo v7/quote (batched); on failure symbols stay present with note
//   metals  â€” Yahoo futures + XAUXAG ratio; ALWAYS exactly 10 items
//
// Each source is wrapped in try/catch and degrades on its own, so one provider
// failing never breaks the whole response. Whole payload cached 15s in-memory.
// Educational only. Not financial advice.

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Vercel — keep this route on the Node.js runtime (not edge): it fans out to
// five providers with timeouts and caches the payload in Node memory.
export const runtime = "nodejs";

type Category = "spot" | "futures" | "forex" | "stocks" | "metals";
type LegacyMarket = "crypto" | "futures" | "metals" | "stocks" | "forex";

export interface MarketCoin {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume: number;
  category: Category;
  note?: string;
}

interface LegacyCoin {
  id: string;
  symbol: string;
  label: string;
  market: LegacyMarket;
  currentPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
}

interface MarketData {
  spot: MarketCoin[];
  futures: MarketCoin[];
  forex: MarketCoin[];
  stocks: MarketCoin[];
  metals: MarketCoin[];
}

function num(value: unknown): number {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson(url: string, timeoutMs = 5_000): Promise<unknown> {
  // Keep every attempt well under Vercel's 10s function limit — the provider
  // fan-out runs in parallel, so the slowest single attempt bounds the route.
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.split("?")[0]}`);
  return response.json();
}

const LEVERAGED_TOKEN = /(UP|DOWN|BULL|BEAR)$/;

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

async function fetchBinance(category: Category): Promise<MarketCoin[]> {
  const isFutures = category === "futures";
  // MASLA 1 + MASLA 2 — Binance Futures 2-step approach, merged so we ship
  // 200+ futures coins even when api.binance.com answers HTTP 451 from Vercel's
  // US edge. Futures is NOT served by data-api.binance.vision (spot mirror), so
  // the fallback chain for futures ends at fapi.binance.com:
  //   STEP A — exchangeInfo: canonical symbol universe (USDT + TRADING + no
  //            leveraged tokens + no COIN-M margin pairs)
  //   STEP B — ticker/24hr: live prices for that exact universe
  //   STEP C — merge: every STEP A symbol gets a price entry (0 if live data
  //            is missing) — never an empty row.
  const attempts: Array<{
    host: string;
    exchangePath: string;
    tickerPath: string;
    timeoutMs: number;
  }> =
    isFutures
      ? [
          { host: "https://fapi.binance.com", exchangePath: "/fapi/v1/exchangeInfo", tickerPath: "/fapi/v1/ticker/24hr", timeoutMs: 5_000 },
          { host: "https://data-api.binance.vision", exchangePath: "/fapi/v1/exchangeInfo", tickerPath: "/fapi/v1/ticker/24hr", timeoutMs: 6_000 },
          { host: "https://fapi.binance.com", exchangePath: "/fapi/v1/exchangeInfo", tickerPath: "/fapi/v1/ticker/price", timeoutMs: 5_000 },
        ]
      : [
          { host: "https://api.binance.com", exchangePath: "/api/v3/exchangeInfo", tickerPath: "/api/v3/ticker/24hr", timeoutMs: 3_000 },
          { host: "https://data-api.binance.vision", exchangePath: "/api/v3/exchangeInfo", tickerPath: "/api/v3/ticker/24hr", timeoutMs: 6_000 },
        ];

  // STEP A — canonical symbol universe (crypto futures: USDT, TRADING only).
  let exchange: unknown = null;
  let exchangeError: unknown = null;
  for (const attempt of attempts) {
    try {
      exchange = await fetchJson(`${attempt.host}${attempt.exchangePath}`, attempt.timeoutMs);
      break;
    } catch (error) {
      exchangeError = error;
      console.warn(
        `[all-coins] ${isFutures ? "futures" : "spot"} exchangeInfo ${attempt.host} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  if (exchange === null) {
    console.error(
      `[all-coins] ${isFutures ? "futures" : "spot"} exchangeInfo unreachable from every provider:`,
      exchangeError instanceof Error ? exchangeError.message : exchangeError,
    );
    return [];
  }
  const symbols = extractExchangeSymbols(exchange, isFutures);
  if (symbols.length === 0 && isFutures) {
    // Exposed futures pairs are the edge case: the fapi exchangeInfo can ship
    // empty (or a provider may drop the payload), so fall back to building the
    // universe straight from the live ticker/24hr list (USDT only).
    try {
      const primary = attempts[0];
      const tickerPayload = await fetchJson(`${primary.host}${primary.tickerPath}`, primary.timeoutMs);
      const list = Array.isArray(tickerPayload) ? tickerPayload : [];
      const seen = new Set<string>();
      const fromTicker: string[] = [];
      for (const raw of list as Array<Record<string, unknown>>) {
        const symbol = typeof raw.symbol === "string" ? raw.symbol : "";
        if (symbol.endsWith("USDT") && !seen.has(symbol)) {
          seen.add(symbol);
          fromTicker.push(symbol);
        }
      }
      if (fromTicker.length > 0) {
        console.warn(
          `[all-coins] futures: exchangeInfo universe empty — built ${fromTicker.length} symbols from ticker/24hr (USDT)`,
        );
        symbols.splice(0, symbols.length, ...fromTicker);
      }
    } catch (error) {
      console.warn(
        `[all-coins] futures: ticker-based universe fallback failed:`,
        error instanceof Error ? error.message : error,
      );
    }
    if (symbols.length === 0) return [];
  }

  // STEP B — live prices for the exact universe built in STEP A.
  let ticker: unknown = null;
  let tickerError: unknown = null;
  for (const attempt of attempts) {
    try {
      ticker = await fetchJson(`${attempt.host}${attempt.tickerPath}`, attempt.timeoutMs);
      break;
    } catch (error) {
      tickerError = error;
      console.warn(
        `[all-coins] ${isFutures ? "futures" : "spot"} ticker/24hr ${attempt.host} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  if (ticker === null) {
    console.error(
      `[all-coins] ${isFutures ? "futures" : "spot"} ticker/24hr unreachable from every provider:`,
      tickerError instanceof Error ? tickerError.message : tickerError,
    );
    return symbols.map((symbol) => ({
      symbol: symbol as string,
      name: baseName(symbol as string),
      price: 0,
      change24h: 0,
      volume: 0,
      category,
      note: "price-unavailable",
    }));
  }
  if (!Array.isArray(ticker)) {
    return symbols.map((symbol) => ({
      symbol: symbol as string,
      name: baseName(symbol as string),
      price: 0,
      change24h: 0,
      volume: 0,
      category,
      note: "price-unavailable",
    }));
  }

  const prices = new Map<string, { price: number; change24h: number; volume: number }>();
  for (const raw of ticker as unknown[]) {
    const normalized = normalizeTicker(raw as Record<string, unknown>);
    if (!normalized) continue;
    if (!symbols.includes(normalized.symbol)) continue;
    prices.set(normalized.symbol, {
      price: normalized.lastPrice,
      change24h: normalized.change24h,
      volume: normalized.volume,
    });
  }

  // STEP C — merge universe (STEP A) with prices (STEP B).
  const coins: MarketCoin[] = [];
  for (const symbol of symbols) {
    const priceData = prices.get(symbol);
    coins.push({
      symbol: symbol as string,
      name: baseName(symbol as string),
      price: priceData ? priceData.price : 0,
      change24h: priceData ? priceData.change24h : 0,
      volume: priceData ? priceData.volume : 0,
      category,
      ...(priceData ? {} : { note: "price-unavailable" }),
    });
  }
  return coins;
}


// STEP A helper — tradable USDT pairs only (no leveraged tokens, no COIN-M).
// Accepts both the new "symbols at top level" payload shape and the older
// "result.symbols" shape, so a provider change can never drop the universe.
function extractExchangeSymbols(payload: unknown, isFutures: boolean): string[] {
  const container = payload as Record<string, unknown>;
  const result =
    (container as { result?: { symbols?: unknown[] } }).result?.symbols ??
    (container as { symbols?: unknown[] }).symbols ??
    [];
  if (!Array.isArray(result)) return [];
  const out: string[] = [];
  for (const raw of result as Array<Record<string, unknown>>) {
    if (!raw || typeof raw.symbol !== "string") continue;
    const symbol = raw.symbol;
    const status = raw.status;
    if (status !== "TRADING") continue;
    if (!symbol.endsWith("USDT")) continue;
    if (LEVERAGED_TOKEN.test(symbol)) continue;
    if (symbol.includes("COIN-M")) continue;
    out.push(symbol);
  }
  return out;
}

// STEP B helper — normalises both /fapi/v1/ticker/24hr and /fapi/v1/ticker/price
// (the fallback endpoint) into one shape: { symbol, lastPrice, change24h, volume }.
function normalizeTicker(raw: Record<string, unknown>): { symbol: string; lastPrice: number; change24h: number; volume: number } | null {
  const symbol = typeof raw.symbol === "string" ? raw.symbol : null;
  if (!symbol) return null;
  const price = num(raw.lastPrice ?? raw.price);
  if (price <= 0) return null;
  return {
    symbol,
    lastPrice: price,
    change24h: num(raw.priceChangePercent),
    volume: num(raw.quoteVolume),
  };
}

function baseName(symbol: string): string {
  return symbol.slice(0, -4);
}

// â”€â”€ Forex â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FOREX_PAIRS: Array<[string, string]> = [
  ["EUR", "USD"], ["GBP", "USD"], ["USD", "JPY"], ["USD", "CHF"],
  ["AUD", "USD"], ["USD", "CAD"], ["NZD", "USD"],
  ["EUR", "GBP"], ["EUR", "JPY"], ["EUR", "CHF"], ["EUR", "AUD"],
  ["EUR", "CAD"], ["EUR", "NZD"], ["EUR", "SEK"], ["EUR", "NOK"],
  ["EUR", "DKK"], ["EUR", "PLN"], ["EUR", "CZK"], ["EUR", "HUF"], ["EUR", "TRY"],
  ["GBP", "JPY"], ["GBP", "CHF"], ["GBP", "AUD"], ["GBP", "CAD"],
  ["GBP", "NZD"],
  ["AUD", "JPY"], ["AUD", "CHF"], ["AUD", "CAD"], ["AUD", "NZD"],
  ["NZD", "JPY"], ["NZD", "CHF"], ["NZD", "CAD"], ["CAD", "JPY"],
  ["CAD", "CHF"], ["CHF", "JPY"],
  ["USD", "PKR"], ["USD", "INR"], ["USD", "AED"], ["USD", "SAR"],
  ["USD", "TRY"], ["USD", "ZAR"], ["USD", "EGP"], ["USD", "BDT"],
  ["USD", "MYR"], ["USD", "PHP"], ["USD", "THB"], ["USD", "SGD"],
  ["USD", "KRW"], ["USD", "HKD"], ["USD", "MXN"], ["USD", "BRL"],
  ["USD", "RUB"], ["USD", "NGN"], ["USD", "KES"], ["USD", "CNY"],
  ["USD", "SEK"], ["USD", "NOK"], ["USD", "DKK"], ["USD", "PLN"],
  ["USD", "CZK"], ["USD", "HUF"], ["USD", "IDR"], ["USD", "ILS"],
  ["USD", "VND"], ["USD", "TWD"],
];

function extractRates(payload: unknown): Record<string, number> {
  const rates = (payload as { rates?: unknown })?.rates;
  const out: Record<string, number> = {};
  if (rates && typeof rates === "object") {
    for (const [key, value] of Object.entries(rates as Record<string, unknown>)) {
      const n = num(value);
      if (n > 0) out[key] = n;
    }
  }
  return out;
}

async function fetchForex(): Promise<MarketCoin[]> {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const [frToday, frPrev, er] = await Promise.allSettled([
    fetchJson("https://api.frankfurter.app/latest?from=USD"),
    fetchJson(`https://api.frankfurter.app/${yesterday}?from=USD`),
    fetchJson("https://open.er-api.com/v6/latest/USD"),
  ]);

  const frRates = frToday.status === "fulfilled" ? extractRates(frToday.value) : {};
  const erRates = er.status === "fulfilled" ? extractRates(er.value) : {};
  const prevRates = frPrev.status === "fulfilled" ? extractRates(frPrev.value) : {};

  // frankfurter wins where present; er-api fills every gap (PKR/AED/SAR/â€¦).
  const rates: Record<string, number> = { USD: 1, ...erRates, ...frRates };
  const prev: Record<string, number> = { USD: 1, ...prevRates };

  const coins: MarketCoin[] = [];
  for (const [base, quote] of FOREX_PAIRS) {
    const b = rates[base];
    const q = rates[quote];
    if (!b || !q) continue;
    const price = q / b;
    if (!Number.isFinite(price) || price <= 0) continue;
    const pb = prev[base];
    const pq = prev[quote];
    const prevPrice = pb && pq ? pq / pb : 0;
    const change24h = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
    const symbol = `${base}/${quote}`;
    coins.push({
      symbol,
      name: symbol,
      price: Math.round(price * 100000) / 100000,
      change24h: Math.round(change24h * 100) / 100,
      volume: 0,
      category: "forex",
    });
  }
  return coins;
}

// â”€â”€ Stocks (Yahoo) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STOCK_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "V", "JPM",
  "WMT", "MA", "PG", "UNH", "HD", "DIS", "PYPL", "NFLX", "ADBE", "CRM",
  "INTC", "AMD", "CSCO", "PFE", "KO", "PEP", "XOM", "CVX", "ABT", "TMO",
  "COST", "AVGO", "QCOM", "TXN", "HON", "IBM", "GE", "BA", "CAT", "MMM",
  "NKE", "MCD", "SBUX", "WFC", "BAC", "GS", "MS", "C", "BLK", "AXP",
  "T", "VZ", "TMUS", "CMCSA", "ORCL", "SHOP", "SQ", "SNOW", "PLTR", "UBER",
  "LYFT", "ABNB", "DASH", "COIN", "ROKU", "SPOT", "ZM", "DOCU", "ARM", "SMCI",
  "MRVL", "MU", "LRCX", "AMAT", "KLAC", "ASML", "TSM", "BABA", "JD", "PDD",
  "NIO", "LI", "XPEV", "BIDU", "F", "GM", "RIVN", "LCID", "CVS", "WBA",
  "CI", "TGT", "LOW", "TJX", "ROST", "DG", "DLTR",
  "SPY", "QQQ", "DIA", "IWM", "VOO", "LMT", "RTX", "DE", "UPS", "FDX",
  "EMR", "ETN", "PH", "DOW", "LIN", "APD", "SHW", "ECL", "NEE", "DUK",
  "SO", "AEP", "PLD", "AMT", "CCI", "EQIX", "PSA", "O", "WELL", "MAR",
  "HLT", "BKNG", "RCL", "CCL", "LVS", "MGM", "YUM", "CMG", "DRI", "PANW",
  "CRWD", "FTNT", "ANET", "NOW", "INTU", "ADP", "PAYX", "FIS", "GILD", "MDLZ",
];

interface YahooQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  shortName?: string;
  longName?: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchStocks(): Promise<MarketCoin[]> {
  const bySymbol = new Map<string, YahooQuote>();

  const batches = chunk(STOCK_SYMBOLS, 50);
  const results = await Promise.allSettled(
    batches.map(async (symbols) => {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.map(encodeURIComponent).join(",")}`;
      const payload = (await fetchJson(url, 12_000)) as { quoteResponse?: { result?: YahooQuote[] } };
      const list = payload?.quoteResponse?.result;
      if (Array.isArray(list)) for (const quote of list) if (quote?.symbol) bySymbol.set(quote.symbol.toUpperCase(), quote);
    }),
  );
  const anySucceeded = results.some((r) => r.status === "fulfilled");

  return STOCK_SYMBOLS.map((symbol) => {
    const quote = bySymbol.get(symbol.toUpperCase());
    const price = quote ? num(quote.regularMarketPrice) : 0;
    const name = quote?.shortName ?? quote?.longName ?? symbol;
    const live = price > 0;
    return {
      symbol,
      name,
      price,
      change24h: quote ? num(quote.regularMarketChangePercent) : 0,
      volume: quote ? num(quote.regularMarketVolume) : 0,
      category: "stocks" as Category,
      ...(live ? {} : { note: anySucceeded ? "unavailable" : "closed" }),
    };
  });
}

// â”€â”€ Metals (exactly 10, never skipped) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface YahooMeta {
  price: number;
  change24h: number;
}

async function yahooChart(symbol: string): Promise<YahooMeta> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const payload = (await fetchJson(url, 12_000)) as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }> };
  };
  const meta = payload?.chart?.result?.[0]?.meta;
  const price = num(meta?.regularMarketPrice);
  if (price <= 0) throw new Error(`no price for ${symbol}`);
  const prev = num(meta?.chartPreviousClose) || num(meta?.previousClose);
  const change24h = prev > 0 ? ((price - prev) / prev) * 100 : 0;
  return { price, change24h: Math.round(change24h * 100) / 100 };
}

async function fetchMetals(): Promise<MarketCoin[]> {
  const [gold, silver, platinum, palladium, copper] = await Promise.allSettled([
    yahooChart("GC=F"),
    yahooChart("SI=F"),
    yahooChart("PL=F"),
    yahooChart("PA=F"),
    yahooChart("HG=F"),
  ]);
  const val = (r: PromiseSettledResult<YahooMeta>): YahooMeta =>
    r.status === "fulfilled" ? r.value : { price: 0, change24h: 0 };

  const g = val(gold);
  const s = val(silver);
  const ratio = g.price > 0 && s.price > 0 ? Math.round((g.price / s.price) * 100) / 100 : 0;

  const build = (symbol: string, name: string, m: YahooMeta): MarketCoin => ({
    symbol,
    name,
    price: m.price,
    change24h: m.change24h,
    volume: 0,
    category: "metals",
    ...(m.price > 0 ? {} : { note: "unavailable" }),
  });

  // ALWAYS exactly 10 items â€” never skip, even when a live price is missing.
  return [
    build("XAUUSD", "Gold", g),
    build("XAGUSD", "Silver", s),
    build("XPTUSD", "Platinum", val(platinum)),
    build("XPDUSD", "Palladium", val(palladium)),
    build("XCUUSD", "Copper", val(copper)),
    { symbol: "XALUSD", name: "Aluminum", price: 0, change24h: 0, volume: 0, category: "metals", note: "unavailable" },
    { symbol: "XNIUSD", name: "Nickel", price: 0, change24h: 0, volume: 0, category: "metals", note: "unavailable" },
    { symbol: "XZNUSD", name: "Zinc", price: 0, change24h: 0, volume: 0, category: "metals", note: "unavailable" },
    { symbol: "XPBUSD", name: "Lead", price: 0, change24h: 0, volume: 0, category: "metals", note: "unavailable" },
    { symbol: "XAUXAG", name: "Gold/Silver Ratio", price: ratio, change24h: 0, volume: 0, category: "metals", ...(ratio > 0 ? {} : { note: "unavailable" }) },
  ];
}

// â”€â”€ Legacy flat list (back-compat for pages + signals scanner) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function toLegacyMarket(category: Category): LegacyMarket {
  return category === "spot" ? "crypto" : category;
}

function toLegacy(coins: MarketCoin[]): LegacyCoin[] {
  return coins.map((c) => ({
    id: `${c.category}:${c.symbol}`,
    symbol: c.symbol,
    label: c.name,
    market: toLegacyMarket(c.category),
    currentPrice: c.price,
    priceChangePercent: c.change24h,
    quoteVolume: c.volume,
  }));
}

// â”€â”€ 15s in-memory cache + handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CachedPayload {
  success: true;
  timestamp: number;
  data: MarketData;
  coins: LegacyCoin[];
  total: number;
}

const CACHE_MS = 15_000;
let cache: { payload: CachedPayload; expires: number } | null = null;

// Vercel CDN + browser friendly headers — CORS so the live site (and any
// static consumer) can read the JSON, s-maxage so the edge caches the 15s
// in-memory snapshot instead of re-running the provider fan-out.
const RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, s-maxage=15",
};

function jsonResponse(payload: CachedPayload): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: RESPONSE_HEADERS });
}

export async function GET(): Promise<Response> {
  const now = Date.now();
  if (cache && now < cache.expires) {
    return jsonResponse(cache.payload);
  }

  // Each source degrades independently â€” one failure never breaks the whole API.
  const [spot, futures, forex, stocks, metals] = await Promise.all([
    fetchBinance("spot").catch((e) => {
      console.error("[all-coins] spot failed:", e instanceof Error ? e.message : e);
      return [] as MarketCoin[];
    }),
    fetchBinance("futures").catch((e) => {
      console.error("[all-coins] futures failed:", e instanceof Error ? e.message : e);
      return [] as MarketCoin[];
    }),
    fetchForex().catch((e) => {
      console.error("[all-coins] forex failed:", e instanceof Error ? e.message : e);
      return [] as MarketCoin[];
    }),
    fetchStocks().catch((e) => {
      console.error("[all-coins] stocks failed:", e instanceof Error ? e.message : e);
      return [] as MarketCoin[];
    }),
    fetchMetals().catch((e) => {
      console.error("[all-coins] metals failed:", e instanceof Error ? e.message : e);
      return [] as MarketCoin[];
    }),
  ]);

  const data: MarketData = { spot, futures, forex, stocks, metals };
  const coins = [
    ...toLegacy(spot),
    ...toLegacy(futures),
    ...toLegacy(forex),
    ...toLegacy(stocks),
    ...toLegacy(metals),
  ];

  const payload: CachedPayload = {
    success: true,
    timestamp: Date.now(),
    data,
    coins,
    total: coins.length,
  };

  cache = { payload, expires: now + CACHE_MS };
  return jsonResponse(payload);
}
