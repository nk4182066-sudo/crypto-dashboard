// All Coins API - aggregates Binance spot + futures USDT tickers with
// static metals / forex / stocks reference data so the home page can show
// every asset in one paginated, searchable list.
// Educational only. Not financial advice.


// --------------------------------------------------------------- types

export interface AllCoin {
  id: string;
  symbol: string;
  label: string;
  market: "crypto" | "futures" | "metals" | "forex" | "stocks";
  currentPrice: number;
  priceChangePercent: number;
  quoteVolume?: number;
  change?: number;
}

export interface MarketCounts {
  crypto: number;
  futures: number;
  metals: number;
  forex: number;
  stocks: number;
}

export interface AllCoinsResult {
  coins: AllCoin[];
  counts: MarketCounts;
  updatedAt: string;
}

// ------------------------------------------------------------- static refs

interface StaticItem {
  id: string;
  symbol: string;
  label: string;
}

/** Physical metals traded against USD (and EUR). */
const METALS: StaticItem[] = [
  { id: "gold", symbol: "XAU/USD", label: "Gold (XAU/USD)" },
  { id: "gold-eur", symbol: "XAU/EUR", label: "Gold (XAU/EUR)" },
  { id: "silver", symbol: "XAG/USD", label: "Silver (XAG/USD)" },
  { id: "platinum", symbol: "XPT/USD", label: "Platinum (XPT/USD)" },
  { id: "palladium", symbol: "XPD/USD", label: "Palladium (XPD/USD)" },
  { id: "copper", symbol: "XLC/USD", label: "Copper (XLC/USD)" },
];

/** Top 30 forex pairs (major + minor + a few exotics). */
const FOREX: StaticItem[] = [
  { id: "eurusd", symbol: "EUR/USD", label: "Euro / US Dollar" },
  { id: "gbpusd", symbol: "GBP/USD", label: "British Pound / US Dollar" },
  { id: "usdjpy", symbol: "USD/JPY", label: "US Dollar / Japanese Yen" },
  { id: "usdcad", symbol: "USD/CAD", label: "US Dollar / Canadian Dollar" },
  { id: "audusd", symbol: "AUD/USD", label: "Australian Dollar / US Dollar" },
  { id: "usdzar", symbol: "USD/ZAR", label: "US Dollar / South African Rand" },
  { id: "usdcny", symbol: "USD/CNY", label: "US Dollar / Chinese Yuan" },
  { id: "usdhkd", symbol: "USD/HKD", label: "US Dollar / Hong Kong Dollar" },
  { id: "usdmxn", symbol: "USD/MXN", label: "US Dollar / Mexican Peso" },
  { id: "usdsek", symbol: "USD/SEK", label: "US Dollar / Swedish Krona" },
  { id: "audcad", symbol: "AUD/CAD", label: "Australian Dollar / Canadian Dollar" },
  { id: "audjpy", symbol: "AUD/JPY", label: "Australian Dollar / Japanese Yen" },
  { id: "chfjpy", symbol: "CHF/JPY", label: "Swiss Franc / Japanese Yen" },
  { id: "euraud", symbol: "EUR/AUD", label: "Euro / Australian Dollar" },
  { id: "eurgbp", symbol: "EUR/GBP", label: "Euro / British Pound" },
  { id: "eurchf", symbol: "EUR/CHF", label: "Euro / Swiss Franc" },
  { id: "eurcad", symbol: "EUR/CAD", label: "Euro / Canadian Dollar" },
  { id: "eurnok", symbol: "EUR/NOK", label: "Euro / Norwegian Krone" },
  { id: "eurnzd", symbol: "EUR/NZD", label: "Euro / New Zealand Dollar" },
  { id: "usdkrw", symbol: "USD/KRW", label: "US Dollar / Korean Won" },
  { id: "usdcop", symbol: "USD/COP", label: "US Dollar / Colombian Peso" },
  { id: "usdtry", symbol: "USD/TRY", label: "US Dollar / Turkish Lira" },
  { id: "usdthb", symbol: "USD/THB", label: "US Dollar / Thai Baht" },
  { id: "usdils", symbol: "USD/ILS", label: "US Dollar / Israeli Shekel" },
  { id: "usdtwd", symbol: "USD/TWD", label: "US Dollar / New Taiwan Dollar" },
  { id: "usdmyr", symbol: "USD/MYR", label: "US Dollar / Malaysian Ringgit" },
  { id: "usdsgd", symbol: "USD/SGD", label: "US Dollar / Singapore Dollar" },
  { id: "usdngn", symbol: "USD/NGN", label: "US Dollar / Nigerian Naira" },
  { id: "usdbwp", symbol: "USD/BWP", label: "US Dollar / Botswana Pula" },
  { id: "usdhuf", symbol: "USD/HUF", label: "US Dollar / Hungarian Forint" },
];
const STOCKS: StaticItem[] = [
  { id: "aapl", symbol: "AAPL", label: "Apple Inc." },
  { id: "msft", symbol: "MSFT", label: "Microsoft Corporation" },
  { id: "googl", symbol: "GOOGL", label: "Alphabet Inc." },
  { id: "goog", symbol: "GOOG", label: "Alphabet Inc." },
  { id: "amzn", symbol: "AMZN", label: "Amazon.com Inc." },
  { id: "tsla", symbol: "TSLA", label: "Tesla Inc." },
  { id: "meta", symbol: "META", label: "Meta Platforms" },
  { id: "nvda", symbol: "NVDA", label: "Nvidia Corporation" },
  { id: "brk-b", symbol: "BRK-B", label: "Berkshire Hathaway" },
  { id: "jnj", symbol: "JNJ", label: "Johnson & Johnson" },
  { id: "v", symbol: "V", label: "Visa Inc." },
  { id: "wmt", symbol: "WMT", label: "Walmart Inc." },
  { id: "xom", symbol: "XOM", label: "Exxon Mobil" },
  { id: "jpm", symbol: "JPM", label: "JPMorgan Chase" },
  { id: "ma", symbol: "MA", label: "Mastercard" },
  { id: "cvx", symbol: "CVX", label: "Chevron" },
  { id: "ko", symbol: "KO", label: "Coca-Cola" },
  { id: "pg", symbol: "PG", label: "Procter & Gamble" },
  { id: "mcd", symbol: "MCD", label: "McDonald's" },
  { id: "dis", symbol: "DIS", label: "The Walt Disney Company" },
  { id: "nke", symbol: "NKE", label: "Nike Inc." },
  { id: "adbe", symbol: "ADBE", label: "Adobe Inc." },
  { id: "intc", symbol: "INTC", label: "Intel Corporation" },
  { id: "csco", symbol: "CSCO", label: "Cisco Systems" },
  { id: "axp", symbol: "AXP", label: "American Express" },
  { id: "unp", symbol: "UNP", label: "Union Pacific" },
  { id: "cat", symbol: "CAT", label: "Caterpillar" },
  { id: "mmm", symbol: "MMM", label: "3M Company" },
  { id: "de", symbol: "DE", label: "Dell Technologies" },
  { id: "hon", symbol: "HON", label: "Honeywell" },
  { id: "usb", symbol: "USB", label: "U.S. Bancorp" },
  { id: "gs", symbol: "GS", label: "Goldman Sachs" },
  { id: "c", symbol: "C", label: "Citigroup" },
  { id: "bac", symbol: "BAC", label: "Bank of America" },
  { id: "ms", symbol: "MS", label: "Morgan Stanley" },
  { id: "wfc", symbol: "WFC", label: "Wells Fargo" },
  { id: "panw", symbol: "PANW", label: "Palo Alto Networks" },
  { id: "crm", symbol: "CRM", label: "Salesforce" },
  { id: "orcl", symbol: "ORCL", label: "Oracle" },
  { id: "ibm", symbol: "IBM", label: "International Business Machines" },
  { id: "acn", symbol: "ACN", label: "Accenture" },
  { id: "cmcsa", symbol: "CMCSA", label: "Comcast" },
  { id: "t", symbol: "T", label: "AT&T" },
  { id: "vz", symbol: "VZ", label: "Verizon" },
  { id: "foxa", symbol: "FOXA", label: "Fox Corporation" },
  { id: "nsc", symbol: "NSC", label: "Norfolk Southern" },
  { id: "kmb", symbol: "KMB", label: "Kimberly-Clark" },
  { id: "cl", symbol: "CL", label: "Colgate-Palmolive" },
  { id: "apd", symbol: "APD", label: "Air Products" },
  { id: "ed", symbol: "ED", label: "Edwards Lifesciences" },
  { id: "duk", symbol: "DUK", label: "Duke Energy" },
  { id: "so", symbol: "SO", label: "Southern Company" },
  { id: "peg", symbol: "PEG", label: "Prologis" },
  { id: "nee", symbol: "NEE", label: "NextEra Energy" },
  { id: "o", symbol: "O", label: "Realty Income" },
  { id: "hmo", symbol: "HMO", label: "Horizon Therapeutics" },
  { id: "ly", symbol: "LY", label: "Eli Lilly" },
  { id: "pfe", symbol: "PFE", label: "Pfizer" },
  { id: "mrk", symbol: "MRK", label: "Merck" },
  { id: "abt", symbol: "ABT", label: "Abbott Laboratories" },
  { id: "bmy", symbol: "BMY", label: "Bristol-Myers Squibb" },
  { id: "coin", symbol: "COIN", label: "Coinbase Global" },
  { id: "slb", symbol: "SLB", label: "Schlumberger" },
  { id: "hal", symbol: "HAL", label: "Halliburton" },
  { id: "orty", symbol: "ORTY", label: "O'Reilly Automotive" },
];

// ------------------------------------------------------------- chunk 2
/** Coerces a Yahoo meta value to a finite number (null when invalid). */
function num(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

interface YahooMeta {
  regularMarketPrice: number | null;
  regularMarketChangePercent: number | null;
  changePercent: number | null;
  change: number | null;
}

async function fetchYahooChart(symbol: string): Promise<{ currentPrice: number; priceChangePercent: number; change?: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}=X?range=1d&interval=1d&comprehensive=false`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json: { chart?: { result?: unknown[] } } = await res.json();
    const result = json.chart?.result;
    if (!Array.isArray(result) || result.length === 0) return null;
    const meta = result[0] as Record<string, unknown>;
    const m = (meta as { indicators?: { quote?: unknown[] } } | undefined)?.indicators?.quote?.[0] as Record<string, unknown> | undefined;
    const price = num(m?.regularMarketPrice ?? meta?.regularMarketPrice);
    if (price === null) return null;
    const pct = num(m?.changePercent ?? meta?.regularMarketChangePercent) ?? 0;
    return { currentPrice: price, priceChangePercent: pct, change: num(m?.change ?? meta?.change) ?? undefined };
  } catch {
    return null;
  }
}

/** Maps a static symbol to the Yahoo chart symbol (e.g. "EUR/USD" -> "EURUSD=X"). */
function toYahooSymbol(symbol: string, market: AllCoin["market"]): string {
  if (market === "stocks") return symbol;
  return symbol.replace("/", "") + "=X";
}

/** Fetch a list of symbols with a capped concurrency (rate-limit safe). */
async function fetchAllWithConcurrency<T>(items: string[], concurrency: number, fn: (item: string) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ------------------------------------------------------------- chunk 3
/** Builds a static (metals / forex / stocks) coin list with best-effort prices. */
async function buildStaticCoins(items: StaticItem[], market: AllCoin["market"]): Promise<AllCoin[]> {
  const ids = items.map((item) => item.id);
  const fetched = await fetchAllWithConcurrency<{ currentPrice: number; priceChangePercent: number; change?: number } | null>(
    ids,
    8,
    (id) => {
      const item = items.find((i) => i.id === id);
      return fetchYahooChart(toYahooSymbol(item?.symbol ?? id, market));
    }
  );
  const out: AllCoin[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const data = fetched[i];
    out.push({
      id: item.id,
      symbol: item.symbol,
      label: item.label,
      market,
      currentPrice: data?.currentPrice ?? 0,
      priceChangePercent: data?.priceChangePercent ?? 0,
      change: data?.change,
    });
  }
  return out;
}

/** Normalizes a Binance ticker into an AllCoin (USDT pairs only). */
function toBinanceCoin(ticker: Record<string, string | number>, market: "crypto" | "futures"): AllCoin | null {
  const price = Number(ticker.lastPrice);
  const changePercent = Number(ticker.priceChangePercent);
  const quoteVolume = Number(ticker.quoteVolume);
  if (!Number.isFinite(price) || !Number.isFinite(changePercent)) return null;
  const symbol = typeof ticker.symbol === "string" ? ticker.symbol : "";
  const base = symbol.slice(0, -4);
  const suffix = symbol.slice(-4);
  return {
    id: symbol.toLowerCase(),
    symbol,
    label: `${base}/${suffix}`,
    market,
    currentPrice: price,
    priceChangePercent: changePercent,
    quoteVolume: Number.isFinite(quoteVolume) ? quoteVolume : undefined,
  };
}

// ------------------------------------------------------------- chunk 4

export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const errors: string[] = [];

  // 1) Binance spot - all USDT pairs (400+).
  let spotCoins: AllCoin[] = [];
  try {
    const spotRes = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!spotRes.ok) throw new Error(`Binance spot returned ${spotRes.status}`);
    const tickers = (await spotRes.json()) as Record<string, string | number>[];
    spotCoins = tickers
      .filter((ticker) => typeof ticker.symbol === "string" && ticker.symbol.endsWith("USDT"))
      .map((ticker) => toBinanceCoin(ticker, "crypto"))
      .filter((coin): coin is AllCoin => coin !== null);
  } catch (error) {
    errors.push(`spot: ${(error as Error).message}`);
  }

  // 2) Binance futures - all USDT pairs.
  let futuresCoins: AllCoin[] = [];
  try {
    const futuresRes = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr", {
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!futuresRes.ok) throw new Error(`Binance futures returned ${futuresRes.status}`);
    const tickers = (await futuresRes.json()) as Record<string, string | number>[];
    futuresCoins = tickers
      .filter((ticker) => typeof ticker.symbol === "string" && ticker.symbol.endsWith("USDT"))
      .map((ticker) => toBinanceCoin(ticker, "futures"))
      .filter((coin): coin is AllCoin => coin !== null);
  } catch (error) {
    errors.push(`futures: ${(error as Error).message}`);
  }

  // 3) Static metals / forex / stocks with best-effort price data.
  const metalsCoins = await buildStaticCoins(METALS, "metals");
  const forexCoins = await buildStaticCoins(FOREX, "forex");
  const stocksCoins = await buildStaticCoins(STOCKS, "stocks");

  // Sort by 24h change percent (descending) within each market.
  const sortByChange = (coins: AllCoin[]) => [...coins].sort((a, b) => b.priceChangePercent - a.priceChangePercent);

  const coins: AllCoin[] = [
    ...sortByChange(spotCoins),
    ...sortByChange(futuresCoins),
    ...metalsCoins,
    ...sortByChange(forexCoins),
    ...sortByChange(stocksCoins),
  ];

  return Response.json(
    {
      coins,
      counts: {
        crypto: spotCoins.length,
        futures: futuresCoins.length,
        metals: metalsCoins.length,
        forex: forexCoins.length,
        stocks: stocksCoins.length,
      },
      updatedAt: new Date().toISOString(),
      note: errors.length > 0 ? `warnings: ${errors.join("; ")}` : undefined,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
