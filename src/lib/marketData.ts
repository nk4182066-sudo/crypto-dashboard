/**
 * MASLA 1 — three-layer market data provider (Bybit → Bitget → CoinGecko).
 *
 * The strict signal engine needs OHLCV across 1h / 4h / 1d plus a live price.
 * Every read is defensive (try/catch, per-request timeout) and degrades to the
 * next provider on failure. If all three fail we return [] / null so the
 * caller can decide what to do — we never throw.
 *
 *   PRIMARY  Bybit     https://api.bybit.com/v5/market/kline
 *                       https://api.bybit.com/v5/market/tickers
 *   FALLBACK Bitget    https://api.bitget.com/api/v2/spot/market/candles
 *                       https://api.bitget.com/api/v2/spot/market/tickers
 *   BACKUP   CoinGecko https://api.coingecko.com/api/v3/simple/price
 *                       https://api.coingecko.com/api/v3/coins/{id}/market_chart
 *
 * Console log contract:
 *   "Using Bybit" / "Bybit failed, trying Bitget" / "Bitget failed, trying CoinGecko"
 *   "CoinGecko failed for <symbol>"
 *
 * Only crypto can be sourced from these exchanges. Forex / stocks / metals are
 * out of scope for this provider, so they degrade to [] + null price (the caller
 * decides how to handle that).
 *
 * Educational analysis only — not financial advice.
 */

import type { Candle } from "@/src/analysis/types";

const BYBIT_BASE = "https://api.bybit.com";
const BITGET_BASE = "https://api.bitget.com";
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const FETCH_TIMEOUT_MS = 4_000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** One symbol row, normalised to the exact pair shapes each exchange expects. */
export interface CryptoSymbol {
  key: string;
  label: string;
  bybit: string;
  bitget: string;
  coingeckoId: string;
}

/** Market data returned by the three-layer provider. */
export interface MarketData {
  price: number | null;
  /** OHLCV across the three timeframes the strict gate and scan need. */
  candles: { oneHour: Candle[]; fourHour: Candle[]; oneDay: Candle[] };
  /** Last-candle volume / average of the prior 20 volumes. Null when not measurable. */
  volumeRatio: number | null;
}

function timedFetch(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await timedFetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "User-Agent": "crypto-dashboard/1.0",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** volumeRatio = last-candle volume / mean of the last 20 volumes. */
function computeVolumeRatio(candles: Candle[]): number | null {
  if (candles.length < 20) return null;
  const volumes = candles.map((c) => c.volume);
  const last = volumes[volumes.length - 1] ?? 0;
  const avg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  return avg > 0 ? last / avg : null;
}

/** Buckets raw price/volume ticks into OHLCV candles of `bucketMs` width. */
function bucketCandles(
  points: Array<{ time: number; price: number; volume: number }>,
  bucketMs: number,
  limit: number,
): Candle[] {
  const buckets = new Map<number, Candle>();
  for (const point of points) {
    const time = Math.floor(point.time / bucketMs) * bucketMs;
    const existing = buckets.get(time);
    if (!existing) {
      buckets.set(time, {
        time,
        open: point.price,
        high: point.price,
        low: point.price,
        close: point.price,
        volume: point.volume,
      });
      continue;
    }
    existing.high = Math.max(existing.high, point.price);
    existing.low = Math.min(existing.low, point.price);
    existing.close = point.price;
    existing.volume += point.volume;
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time).slice(-limit);
}

/** All crypto symbols, normalised to the exact pair shapes each exchange expects. */
export const cryptoSymbols: CryptoSymbol[] = [
  { key: "BTC-USD", label: "Bitcoin", bybit: "BTCUSDT", bitget: "BTC-USDT", coingeckoId: "bitcoin" },
  { key: "ETH-USD", label: "Ethereum", bybit: "ETHUSDT", bitget: "ETH-USDT", coingeckoId: "ethereum" },
  { key: "SOL-USD", label: "Solana", bybit: "SOLUSDT", bitget: "SOL-USDT", coingeckoId: "solana" },
  { key: "XRP-USD", label: "XRP", bybit: "XRPUSDT", bitget: "XRP-USDT", coingeckoId: "xrp" },
  { key: "ADA-USD", label: "Cardano", bybit: "ADAUSDT", bitget: "ADA-USDT", coingeckoId: "cardano" },
  { key: "DOGE-USD", label: "Dogecoin", bybit: "DOGEUSDT", bitget: "DOGE-USDT", coingeckoId: "dogecoin" },
  { key: "AVAX-USD", label: "Avalanche", bybit: "AVAXUSDT", bitget: "AVAX-USDT", coingeckoId: "avalanche-2" },
  { key: "LINK-USD", label: "Chainlink", bybit: "LINKUSDT", bitget: "LINK-USDT", coingeckoId: "chainlink" },
  { key: "DOT-USD", label: "Polkadot", bybit: "DOTUSDT", bitget: "DOT-USDT", coingeckoId: "polkadot" },
  { key: "SHIB-USD", label: "Shiba Inu", bybit: "SHIBUSDT", bitget: "SHIB-USDT", coingeckoId: "shibatoken" },
  { key: "BONK-USD", label: "Bonk", bybit: "BONKUSDT", bitget: "BONK-USDT", coingeckoId: "bonk" },
  { key: "NEAR-USD", label: "Near", bybit: "NEARUSDT", bitget: "NEAR-USDT", coingeckoId: "near" },
  { key: "INJ-USD", label: "Injective", bybit: "INJUSDT", bitget: "INJ-USDT", coingeckoId: "injective" },
  { key: "ARB-USD", label: "Arbitrum", bybit: "ARBUSDT", bitget: "ARB-USDT", coingeckoId: "arbitrum" },
  { key: "OP-USD", label: "Optimism", bybit: "OPUSDT", bitget: "OP-USDT", coingeckoId: "optimism" },
  { key: "SEI-USD", label: "Sei", bybit: "SEIUSDT", bitget: "SEI-USDT", coingeckoId: "sei-network" },
  { key: "XLM-USD", label: "Stellar", bybit: "XLMUSDT", bitget: "XLM-USDT", coingeckoId: "stellar" },
  { key: "COMP-USD", label: "Compound", bybit: "COMPUSDT", bitget: "COMP-USDT", coingeckoId: "compound-governance-token" },
  { key: "FTM-USD", label: "Fantom", bybit: "FTMUSDT", bitget: "FTM-USDT", coingeckoId: "fantom" },
];

function findSymbol(key: string): CryptoSymbol | undefined {
  return cryptoSymbols.find((s) => s.key === key);
}

/** ------------------------------------------------------------------ Bybit
 * Bybit is the primary feed. interval: 60 / 240 / D (Bybit wants minutes, or
 * "D" for daily). limit maps to 300 / 120 / 60 (Bybit caps each kline query at
 * ~300 rows, so the timeframes share the same payload shape). price comes from
 * /v5/market/tickers lastPrice.
 */

interface BybitKlineResponse {
  result: { kline: { list: string[][] } };
  retCode: number;
  retMsg: string;
}

interface BybitTickersResponse {
  result: { list: Array<{ symbol: string; lastPrice: string; amount: string }> };
  retCode: number;
  retMsg: string;
}

async function getCandlesBybit(symbol: string, timeframe: string, limit = 300): Promise<Candle[]> {
  const url = `${BYBIT_BASE}/v5/market/kline`;
  const params = new URLSearchParams({ symbol, interval: timeframe, limit: String(limit) });
  console.log('[API CHECK]', symbol, 'URL:', url);
  const response = await fetchJson<BybitKlineResponse>(`${url}?${params.toString()}`);
  if (!response || response.retCode !== 0) return [];
  const rows = response.result?.kline?.list ?? [];
  const rawTimes = rows.map((row) => parseInt(row[0] ?? "0", 10));
  const times = rawTimes.map((rawTime) => rawTime * 1000);
  const firstRaw = rawTimes[0] ?? 0;
  const firstTime = firstRaw ? firstRaw * 1000 : 0;
  console.log(
    `[DATA FIX] ${symbol} Bybit kline: firstRaw=${firstRaw} fixed=${firstTime} date=${firstTime ? new Date(firstTime).toISOString() : "invalid"}`,
  );
  return rows.map((row, index) => ({
    time: times[index],
    open: parseFloat(row[1] ?? "0"),
    high: parseFloat(row[2] ?? "0"),
    low: parseFloat(row[3] ?? "0"),
    close: parseFloat(row[4] ?? "0"),
    volume: parseFloat(row[5] ?? "0"),
  }));
}

async function getLastPriceBybit(symbol: string): Promise<number | null> {
  const url = `${BYBIT_BASE}/v5/market/tickers`;
  const params = new URLSearchParams({ symbol });
  const response = await fetchJson<BybitTickersResponse>(`${url}?${params.toString()}`);
  if (!response || response.retCode !== 0) return null;
  const tickers = response.result?.list ?? [];
  const best = tickers.find((t) => t.symbol === symbol);
  return best?.lastPrice != null ? parseFloat(best.lastPrice) : null;
}

async function getMarketDataBybit(symbol: string): Promise<MarketData | null> {
  console.log(`[marketData] Using Bybit for ${symbol}`);
  const row = findSymbol(symbol);
  if (!row) return null;
  const price = await getLastPriceBybit(row.bybit);
  if (price == null) return null;
  const [oneHour, fourHour, oneDay] = await Promise.all([
    getCandlesBybit(row.bybit, "60", 300),
    getCandlesBybit(row.bybit, "240", 120),
    getCandlesBybit(row.bybit, "D", 60),
  ]);
  const volumeRatio = computeVolumeRatio(oneHour);
  return { price, candles: { oneHour, fourHour, oneDay }, volumeRatio };
}


/** ------------------------------------------------------------------ Bitget
 * Bitget is the first fallback. Spot candles come from
 * /api/v2/spot/market/candles (interval 1h / 4h / 1d), tickers from
 * /api/v2/spot/market/tickers. symbol uses the Bitget form ('BTC-USDT').
 */

interface BitgetCandleRow {
  id: number;
  open: string;
  high: string;
  low: string;
  close: string;
  vol: string;
}

interface BitgetCandleResponse {
  code: string;
  msg: string;
  data: BitgetCandleRow[];
}

interface BitgetTickerResponse {
  code: string;
  msg: string;
  data: Array<{ symbol: string; last: string; amount: string }>;
}

async function getCandlesBitget(symbol: string, timeframe: string, limit = 300): Promise<Candle[]> {
  const url = `${BITGET_BASE}/api/v2/spot/market/candles`;
  const params = new URLSearchParams({ symbol, interval: timeframe, limit: String(limit) });
  console.log('[API CHECK]', symbol, 'URL:', url);
  const response = await fetchJson<BitgetCandleResponse>(`${url}?${params.toString()}`);
  if (!response || response.code !== "00000") return [];
  const rows = response.data ?? [];
  const firstRaw = rows.length > 0 ? rows[0].id : 0;
  console.log(
    `[DATA FIX] ${symbol} Bitget candles: firstRaw=${firstRaw} alreadyMs=${firstRaw > 1_000_000_000}`,
  );
  return rows.map((row) => ({
    time: row.id,
    open: parseFloat(row.open ?? "0"),
    high: parseFloat(row.high ?? "0"),
    low: parseFloat(row.low ?? "0"),
    close: parseFloat(row.close ?? "0"),
    volume: parseFloat(row.vol ?? "0"),
  }));
}

async function getLastPriceBitget(symbol: string): Promise<number | null> {
  const url = `${BITGET_BASE}/api/v2/spot/market/tickers`;
  const params = new URLSearchParams({ symbol });
  const response = await fetchJson<BitgetTickerResponse>(`${url}?${params.toString()}`);
  if (!response || response.code !== "00000") return null;
  const tickers = response.data ?? [];
  const best = tickers.find((t) => t.symbol === symbol);
  return best?.last != null ? parseFloat(best.last) : null;
}

async function getMarketDataBitget(symbol: string): Promise<MarketData | null> {
  console.log(`[marketData] Bybit failed, trying Bitget for ${symbol}`);
  const row = findSymbol(symbol);
  if (!row) return null;
  const price = await getLastPriceBitget(row.bitget);
  if (price == null) return null;
  const [oneHour, fourHour, oneDay] = await Promise.all([
    getCandlesBitget(row.bitget, "1h", 300),
    getCandlesBitget(row.bitget, "4h", 120),
    getCandlesBitget(row.bitget, "1d", 60),
  ]);
  const volumeRatio = computeVolumeRatio(oneHour);
  return { price, candles: { oneHour, fourHour, oneDay }, volumeRatio };
}


/** ------------------------------------------------------------------ CoinGecko
 * CoinGecko is the last-resort backup. /simple/price gives the live price;
 * /coins/{id}/market_chart gives price + volume history that we bucket into
 * candles. The free tier publishes no rolling volume average, so volumeRatio
 * is null here — the strict gate degrades to "no volume confirmation" instead
 * of failing the whole call.
 */

interface CoinGeckoPriceResponse {
  [coingeckoId: string]: { usd: number; usd_24hr_vol?: number };
}

interface CoinGeckoChartResponse {
  prices: Array<[number, number]>; // [timestamp(ms), price]
  total_volumes: Array<[number, number]>;
}

async function getLastPriceCoinGecko(symbol: string): Promise<number | null> {
  const row = findSymbol(symbol);
  if (!row) return null;
  const url = `${COINGECKO_BASE}/simple/price`;
  const params = new URLSearchParams({
    ids: row.coingeckoId,
    vs_currencies: "usd",
    include_24hr_vol: "true",
  });
  const response = await fetchJson<CoinGeckoPriceResponse>(`${url}?${params.toString()}`);
  if (!response) return null;
  const info = response[row.coingeckoId];
  return info?.usd ?? null;
}

async function getCandlesCoinGecko(symbol: string, bucketMs: number, days: number, limit: number): Promise<Candle[]> {
  const row = findSymbol(symbol);
  if (!row) return [];
  const url = `${COINGECKO_BASE}/coins/${row.coingeckoId}/market_chart`;
  const params = new URLSearchParams({
    vs_currency: "usd",
    days: String(days),
    interval: bucketMs <= HOUR_MS ? "hourly" : "daily",
  });
  const response = await fetchJson<CoinGeckoChartResponse>(`${url}?${params.toString()}`);
  if (!response) return [];
  const points = (response.prices ?? []).map(([time, price], index) => ({
    time,
    price,
    volume: response.total_volumes?.[index]?.[1] ?? 0,
  }));
  return bucketCandles(points, bucketMs, limit);
}

async function getMarketDataCoinGecko(symbol: string): Promise<MarketData | null> {
  console.log(`[marketData] Bitget failed, trying CoinGecko for ${symbol}`);
  const price = await getLastPriceCoinGecko(symbol);
  if (price == null) {
    console.warn(`[marketData] CoinGecko failed for ${symbol}`);
    return null;
  }
  const [oneHour, fourHour, oneDay] = await Promise.all([
    getCandlesCoinGecko(symbol, HOUR_MS, 30, 300),
    getCandlesCoinGecko(symbol, 4 * HOUR_MS, 60, 120),
    getCandlesCoinGecko(symbol, DAY_MS, 90, 60),
  ]);
  const volumeRatio = null; // CoinGecko free tier exposes no rolling volume average.
  return { price, candles: { oneHour, fourHour, oneDay }, volumeRatio };
}

/** MASLA 1 orchestrator: Bybit → Bitget → CoinGecko. Null only when all fail. */
export async function getMarketData(symbol: string): Promise<MarketData | null> {
  const plans: Array<() => Promise<MarketData | null>> = [
    () => getMarketDataBybit(symbol),
    () => getMarketDataBitget(symbol),
    () => getMarketDataCoinGecko(symbol),
  ];
  for (const plan of plans) {
    try {
      const result = await plan();
      if (result != null) return result;
    } catch (error) {
      console.warn("[marketData] provider threw, degrading to the next one:", error);
    }
  }
  console.warn(`[marketData] All providers failed for ${symbol}`);
  return null;
}

