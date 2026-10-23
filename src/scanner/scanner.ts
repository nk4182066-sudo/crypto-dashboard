import type { Candle, MarketAnalysis } from "@/src/analysis/types";
import { analyzeMarket } from "@/src/analysis";
import { cacheGet, cached, cacheSet } from "@/src/lib/cache";
import { detectCandlestickPattern, type CandlestickDetection } from "@/src/lib/signalGenerator";
import { mapConcurrent, toBatches } from "./batch";
import { SCAN_BATCH_SIZE, SCAN_CONCURRENCY, SCAN_MIN_CANDLES, scanUniverse, type ScanTarget } from "./universe";

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
const SNAPSHOT_TTL_MS = 20 * 60 * 1000;
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

async function fetchCandles(symbol: string, market: ScanTarget["market"]): Promise<Candle[]> {
  const providerSymbol = toProviderSymbol(symbol);

  // Cache the CONVERTED Candle[] array (not the raw Yahoo payload) under this
  // key. The market-signals route reads `scan:candles:...` and calls
  // candles.slice() on it; caching the raw JSON object here made that throw
  // "candles.slice is not a function" once the per-symbol details survived.
  // The scheduler and on-demand reads still share this one cached fetch.
  return cached<Candle[]>(
    `scan:candles:${market}:${providerSymbol}`,
    { ttlMs: 1 * 60 * 1000, staleMs: 2 * 60 * 1000 },
    async () => {
      const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}`);
      url.searchParams.set("interval", "1h");
      url.searchParams.set("range", "1mo");

      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
      if (!response.ok) throw new Error(`Provider returned ${response.status} for ${providerSymbol}`);
      const payload = (await response.json()) as YahooChartPayload;

      const result = payload.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0];
      if (!quote) return [];

      const candles = timestamps.flatMap((time, index): Candle[] => {
        const open = quote.open?.[index];
        const high = quote.high?.[index];
        const low = quote.low?.[index];
        const close = quote.close?.[index];
        if (open == null || high == null || low == null || close == null) return [];
        return [{ time, open, high, low, close, volume: quote.volume?.[index] ?? 0 }];
      });
      if (candles.length > 0) {
        console.log(`[DATA FRESH] ${symbol} Last candle: ${new Date(candles[candles.length - 1].time * 1000).toISOString()}`);
      }
      return candles;
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
