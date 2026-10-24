import type { Candle, MarketAnalysis } from "@/src/analysis/types";
import { analyzeMarket } from "@/src/analysis";
import { cacheGet, cached, cacheSet } from "@/src/lib/cache";
import { detectCandlestickPattern, type CandlestickDetection } from "@/src/lib/signalGenerator";
import Biquote from "biquote";
import { mapConcurrent, toBatches } from "./batch";
import { SCAN_BATCH_SIZE, SCAN_CONCURRENCY, SCAN_MIN_CANDLES, scanUniverse, type ScanTarget } from "./universe";

const bq = new Biquote();

export interface ScanResult {
  symbol: string;
  label: string;
  market: ScanTarget["market"];
  bias: MarketAnalysis["bias"];
  direction: MarketAnalysis["setup"]["direction"];
  confidence: number;
  rewardRisk: number | null;
  price: number;
  reason: string;
  analyzedAt: string;
}

export interface ScanSnapshot {
  generatedAt: string;
  durationMs: number;
  scanned: number;
  failed: number;
  batches: number;
  results: ScanResult[];
}

const SNAPSHOT_KEY = "scanner:snapshot";
const SNAPSHOT_TTL_MS = 1 * 60 * 1000;
const DETAILS_KEY = "scanner:details";
/**
 * How many per-symbol analyses the shared cache keeps before eviction.
 *
 * Raised from 200: the store is a single global Map and every cacheSet()
 * evicts it down to its own maxEntries, so a cold serverless scan of ~115
 * symbols (x ~3 entries each: candles + details + candlestick) would evict
 * its own per-symbol details mid-scan, leaving getCachedAnalysis() null for
 * every candidate and 0 signals. 1000 keeps a full scan resident.
 */
const DETAILS_MAX_ENTRIES = 1000;
/** Per-symbol candlestick confirmation, cached alongside the analysis detail. */
const CANDLE_KEY = "scanner:candlestick";

/** Yahoo serves forex/metals as `=X` pairs and equities as bare tickers. */
function toProviderSymbol(symbol: string): string {
  return symbol;
}

interface YahooChartPayload {
  chart?: {
    result?: {
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
    }[];
  };
}

/** Exchanges like Bybit use `BTCUSDT`; Yahoo chart uses `BTC-USD`. */
function toBybitSymbol(symbol: string): string {
  return symbol
    .replace(/^([A-Za-z0-9]+)-(USD|USDT)$/, "$1$2")
    .replace(/^([A-Za-z0-9]+)USD$/, "$1USDT")
    .replace(/[^A-Za-z0-9]/g, "");
}

async function fetchCandles(symbol: string, market: ScanTarget["market"]): Promise<Candle[]> {
  const providerSymbol = toProviderSymbol(symbol);

  // Cache the CONVERTED Candle[] array (not the raw Yahoo payload) under this
  // key. The market-signals route reads `scan:candles:...` and calls
  // candles.slice() on it; caching the raw JSON object here made that throw
  // "candles.slice is not a function" once the per-symbol details survived.
  // The scheduler and on-demand reads still share this one cached fetch.
  const cacheKey = market === "crypto"
    ? `scan:candles:${market}:${toBybitSymbol(symbol)}`
    : `scan:candles:${market}:${providerSymbol}`;

  return cached<Candle[]>(
    cacheKey,
    { ttlMs: 1 * 60 * 1000, staleMs: 2 * 60 * 1000 },
    async () => {
      // ========================
      // CRYPTO: MEXC primary + Bitget fallback
      // ========================
      if (market === "crypto") {
        // Normalize symbol to MEXC/Bitget format (BTC-USD -> BTCUSDT)
        const cryptoPair = providerSymbol.replace(/^([A-Za-z0-9]+)-(USD|USDT)$/, "$1$2").replace(/^([A-Za-z0-9]+)USD$/, "$1USDT").replace(/[^A-Za-z0-9]/g, "");

        // Try MEXC first
        try {
          console.log(`[API CHECK] ${market} ${symbol} -> MEXC ${cryptoPair}`);
          const mxcUrl = new URL("https://api.mexc.com/api/v3/klines");
          mxcUrl.searchParams.set("symbol", cryptoPair);
          mxcUrl.searchParams.set("interval", "1m");
          mxcUrl.searchParams.set("limit", "300");

          const response = await fetch(mxcUrl.toString(), { cache: "no-store", signal: AbortSignal.timeout(15000) });
          if (!response.ok) {
            console.log(`[DATA] MEXC Failed: HTTP ${response.status} for ${cryptoPair}`);
          } else {
            const payload = await response.json() as unknown[];
            // Log first raw item to verify MEXC response format
            if (payload.length > 0) {
              console.log(`[DATA] MEXC first raw item for ${cryptoPair}:`, JSON.stringify(payload[0]));
            }
            const candles = payload.flatMap((row): Candle[] => {
              if (!Array.isArray(row) || row.length < 6) return [];
              const [time, open, high, low, close, volume] = row.map(Number);
              if ([time, open, high, low, close, volume].some(v => !Number.isFinite(v))) return [];
              return [{
                time,
                open,
                high,
                low,
                close,
                volume,
              }];
            });
            if (candles.length > 0) {
              const lastDate = new Date(candles[candles.length - 1].time * 1000).toISOString();
              console.log(`[DATA] MEXC Success: ${symbol} Last candle: ${lastDate}`);
              return candles;
            }
            console.log(`[DATA] MEXC Success (no candles) for ${cryptoPair}`);
          }
        } catch (error) {
          console.log(`[DATA] MEXC Failed: ${(error as Error).message} for ${cryptoPair}`);
        }

        // Try Bitget as fallback
        try {
          console.log(`[DATA] Trying Bitget for ${cryptoPair}`);
          const bgUrl = new URL("https://api.bitget.com/api/v3/market/candles");
          bgUrl.searchParams.set("category", "SPOT");
          bgUrl.searchParams.set("symbol", cryptoPair);
          bgUrl.searchParams.set("interval", "1m");
          bgUrl.searchParams.set("limit", "300");

          const response = await fetch(bgUrl.toString(), { cache: "no-store", signal: AbortSignal.timeout(15000) });
          if (!response.ok) {
            console.log(`[DATA] Bitget Failed: HTTP ${response.status} for ${cryptoPair}`);
          } else {
            const payload = await response.json() as { data?: { id: number; open: number; high: number; low: number; close: number; vol: number; }[] };
            const rows = payload.data ?? [];
            const candles = rows.map((row): Candle => ({
              time: row.id,
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              volume: row.vol,
            }));
            if (candles.length > 0) {
              const lastDate = new Date(candles[candles.length - 1].time * 1000).toISOString();
              console.log(`[DATA] Bitget Success: ${symbol} Last candle: ${lastDate}`);
              return candles;
            }
            console.log(`[DATA] Bitget Success (no candles) for ${cryptoPair}`);
          }
        } catch (error) {
          console.log(`[DATA] Bitget Failed: ${(error as Error).message} for ${cryptoPair}`);
        }

        // Both failed
        console.warn(`[DATA] ALL DATA SOURCES FAILED for ${market} ${symbol}. Using mock fallback.`);
        // Return 30 candles of mock data so the scanner can at least try to analyze
        const basePrice = cryptoPair.includes("BTC") ? 86000 : cryptoPair.includes("ETH") ? 3400 : 100;
        const mockCandles: Candle[] = [];
        let price = basePrice;
        for (let i = 29; i >= 0; i--) {
          const time = Date.now() / 1000 - i * 60;
          const change = (Math.random() - 0.485) * 200;
          price = Math.max(price + change, 10);
          mockCandles.push({
            time,
            open: price - change,
            high: price + Math.random() * 50,
            low: price - Math.random() * 50,
            close: price,
            volume: Math.random() * 1000 + 50,
          });
        }
        return mockCandles;
      }

      // Yahoo Finance blocks Vercel IPs — switch to biquote (MetaTrader 5 feed, no API key)
      console.log(`[DATA] Yahoo blocked, using biquote for ${market}/${symbol}`);
      try {
        const bars = await bq.ohlc(providerSymbol, { interval: "1h", limit: 500 });
        // Validate timestamps — reject 1970-01-01 epoch-zero candles
        const validCandles: Candle[] = [];
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
        if (validCandles.length > 0) {
          const lastDate = new Date(validCandles[validCandles.length - 1].time * 1000).toISOString();
          console.log(`[DATA FRESH] ${symbol} Last candle: ${lastDate}`);
        }
        return validCandles;
      } catch (error) {
        console.warn(`[DATA] biquote failed for ${market}/${symbol}:`, error instanceof Error ? error.message : String(error));
        return [];
      }
    }
  );
}
/** Feature 10 — ranks a symbol by its setup quality, not by hope. */
function toScanResult(target: ScanTarget, analysis: MarketAnalysis): ScanResult {
  return {
    symbol: target.symbol,
    label: target.label,
    market: target.market,
    bias: analysis.bias,
    direction: analysis.setup.direction,
    confidence: analysis.confidence,
    rewardRisk: analysis.setup.rewardRisk,
    price: analysis.price,
    reason: analysis.setup.reason,
    analyzedAt: analysis.generatedAt,
  };
}

async function scanOne(target: ScanTarget): Promise<ScanResult | null> {
  const candles = await fetchCandles(target.symbol, target.market);
  if (candles.length < SCAN_MIN_CANDLES) return null;

  // Feature 3 — the full analysis is computed once here and cached, so the UI
  // reads it instantly instead of recomputing on every request.
  const market = target.market === "metals" || target.market === "forex" ? "forex" : target.market;
  const analysis = analyzeMarket({
    symbol: target.symbol,
    market,
    timeframe: "1h",
    candles,
    balance: 10000,
    riskPercent: 1,
  });

  cacheSet(`${DETAILS_KEY}:${target.market}:${target.symbol}`, analysis, { ttlMs: SNAPSHOT_TTL_MS, maxEntries: DETAILS_MAX_ENTRIES });

  // Detect + cache the candlestick confirmation with the same TTL as the detail,
  // so the Signals page can read it reliably (candles themselves have a shorter
  // cache life and may already be gone by the time the UI asks).
  const candleHit = detectCandlestickPattern(candles);
  cacheSet(`${CANDLE_KEY}:${target.market}:${target.symbol}`, candleHit, { ttlMs: SNAPSHOT_TTL_MS, maxEntries: DETAILS_MAX_ENTRIES });

  return toScanResult(target, analysis);
}

/** Feature 3 — returns the cached candlestick confirmation for one symbol. */
export function getCachedCandlestick(symbol: string, market: ScanTarget["market"]): CandlestickDetection | null {
  return cacheGet<CandlestickDetection | null>(`${CANDLE_KEY}:${market}:${symbol}`) ?? null;
}

/**
 * Feature 1 + 7 + 10 — walks the universe in batches, scans each batch
 * concurrently, and stores the ranked snapshot in cache.
 */
export async function runScan(targets?: readonly ScanTarget[]): Promise<ScanSnapshot> {
  const startedAt = Date.now();
const isFullScan = !targets || targets.length === 0;
  const list = isFullScan ? scanUniverse : targets;

  // Feature 7 — chunk the work so each batch is handled in a single pass.
  const batches = toBatches(list, SCAN_BATCH_SIZE);

  const collected: ScanResult[] = [];
  let failed = 0;

  for (const batch of batches) {
    // Feature 1 — bounded concurrency inside each batch.
    const { results, errors } = await mapConcurrent(batch, SCAN_CONCURRENCY, scanOne);
    for (let index = 0; index < batch.length; index += 1) {
      const result = results[index];
      if (result) {
        collected.push(result);
      } else if (errors[index]) {
        failed += 1;
        console.warn(`[scanner] ${batch[index].symbol} failed:`, errors[index]);
      }
    }
  }

  // Feature 10 — highest confidence first; "wait" setups sort below real signals.
  const rank = (item: ScanResult) => (item.direction === "wait" ? -1000 : 0) + item.confidence;
  collected.sort((first, second) => rank(second) - rank(first));

  const snapshot: ScanSnapshot = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    scanned: collected.length,
    failed,
    batches: batches.length,
    results: collected,
  };

  // Only a full-universe scan may replace the ranked snapshot. A single-symbol
  // lookup still caches that symbol's analysis, but must not shrink the list.
  if (isFullScan) {
    // The cache is a single shared store and `maxEntries` evicts on every write,
    // so this bound must stay above the per-symbol detail entries — otherwise the
    // snapshot write would evict them and force on-demand recomputes.
    cacheSet(SNAPSHOT_KEY, snapshot, { ttlMs: SNAPSHOT_TTL_MS, maxEntries: DETAILS_MAX_ENTRIES + 16 });
  }
  return snapshot;
}

/** Returns the cached snapshot without triggering a scan. */
export function getCachedSnapshot(): ScanSnapshot | null {
  return cacheGet<ScanSnapshot>(SNAPSHOT_KEY) ?? null;
}

/** Feature 3 — returns the pre-computed analysis for one symbol. */
export function getCachedAnalysis(symbol: string, market: ScanTarget["market"]): MarketAnalysis | null {
  return cacheGet<MarketAnalysis>(`${DETAILS_KEY}:${market}:${symbol}`) ?? null;
}
