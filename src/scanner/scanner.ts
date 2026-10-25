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

/** Fetch candles from Yahoo Finance API. */
async function fetchYahooCandles(symbol: string, market: ScanTarget["market"], timeframe: "1h" | "4h" | "1d"): Promise<Candle[]> {
  const intervalMap: Record<"1h" | "4h" | "1d", string> = {
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
  };
  const interval = intervalMap[timeframe] ?? "1h";

  let yahooSymbol = symbol;
  if (market === "forex") {
    if (!symbol.includes("=")) {
      yahooSymbol = `${symbol}=X`;
    }
  }

  if (market === "metals") {
    const metalBaseSymbols = ["GDX", "GDXU", "PAAS", "SIL", "AGO", "AAU", "NUE", "AEM", "SMH", "HYG", "LQD", "TTM", "RSP", "IYM", "EWZ", "EEM", "UUP", "USO", "GOLD", "GLD", "SLV", "IAU", "GDXJ", "GDXSE"];
    if (!metalBaseSymbols.includes(yahooSymbol)) {
      yahooSymbol = `${yahooSymbol}=X`;
    }
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=1mo`;
  
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  
  if (!response.ok) {
    console.log(`[DATA] Yahoo Failed: HTTP ${response.status} for ${yahooSymbol} (${symbol})`);
    return [];
  }

  const payload = (await response.json()) as YahooChartPayload;
  const result = payload.chart?.result?.[0];
  
  if (!result) {
    console.log(`[DATA] Yahoo No data: ${yahooSymbol} (${symbol})`);
    return [];
  }

  const timestamps = result.timestamp;
  const indicators = result.indicators?.quote?.[0];
  
  if (!timestamps || !indicators) {
    console.log(`[DATA] Yahoo Invalid payload: ${yahooSymbol}`);
    return [];
  }

  const { open, high, low, close, volume } = indicators;
  
  const candles = timestamps.map((ts, i) => ({
    time: ts,
    open: open?.[i] ?? 0,
    high: high?.[i] ?? 0,
    low: low?.[i] ?? 0,
    close: close?.[i] ?? 0,
    volume: volume?.[i] ?? 0,
  })).filter((c) => c.high > 0);

  console.log(`[DATA] Yahoo Success: ${market}/${symbol} Raw Length: ${candles.length}`);
  
  if (candles.length > 0) {
    const lastDate = new Date(candles[candles.length - 1].time * 1000).toISOString();
    console.log(`[DATA] Yahoo Last candle: ${lastDate} for ${symbol}`);
  }
  
  return candles;
}


async function fetchCandles(symbol: string, market: ScanTarget["market"], timeframe: "1h" | "4h" | "1d"): Promise<Candle[]> {
  const providerSymbol = toProviderSymbol(symbol);

  const cacheKey = market === "crypto"
    ? `scan:candles:${market}:${toBybitSymbol(symbol)}`
    : `scan:candles:${market}:${providerSymbol}`;

  return cached<Candle[]>(
    cacheKey,
    { ttlMs: 1 * 60 * 1000, staleMs: 2 * 60 * 1000 },
    async () => {
      if (market === "crypto") {
        return fetchMexcCandles(symbol, market, timeframe);
      }

      if (market === "forex" || market === "stocks" || market === "metals") {
        return fetchYahooCandles(symbol, market, timeframe);
      }

      console.warn(`[DATA] No data source matched for market=${market} symbol=${symbol}`);
      return [];
    }
  );
}
}
/** Feature 10 â€” ranks a symbol by its setup quality, not by hope. */
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

  // fetchCandles stores Candle.time in milliseconds. The analysis pipeline
  // (analyzeMarket â†’ timeAnalysis) expects seconds, so convert here.
  const analysisCandles = candles.map((c) => ({ ...c, time: Math.floor(c.time / 1000) }));

  // Feature 3 â€” the full analysis is computed once here and cached, so the UI
  // reads it instantly instead of recomputing on every request.
  const market = target.market === "metals" || target.market === "forex" ? "forex" : target.market;
  const analysis = analyzeMarket({
    symbol: target.symbol,
    market,
    timeframe: "1h",
    candles: analysisCandles,
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

/** Feature 3 â€” returns the cached candlestick confirmation for one symbol. */
export function getCachedCandlestick(symbol: string, market: ScanTarget["market"]): CandlestickDetection | null {
  return cacheGet<CandlestickDetection | null>(`${CANDLE_KEY}:${market}:${symbol}`) ?? null;
}

/**
 * Feature 1 + 7 + 10 â€” walks the universe in batches, scans each batch
 * concurrently, and stores the ranked snapshot in cache.
 */
export async function runScan(targets?: readonly ScanTarget[]): Promise<ScanSnapshot> {
  const startedAt = Date.now();
const isFullScan = !targets || targets.length === 0;
  const list = isFullScan ? scanUniverse : targets;

  // Feature 7 â€” chunk the work so each batch is handled in a single pass.
  const batches = toBatches(list, SCAN_BATCH_SIZE);

  const collected: ScanResult[] = [];
  let failed = 0;

  for (const batch of batches) {
    // Feature 1 â€” bounded concurrency inside each batch.
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

      // Small delay between batches to avoid rate limiting for MEXC API
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }

  // Feature 10 â€” highest confidence first; "wait" setups sort below real signals.
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
    // so this bound must stay above the per-symbol detail entries â€” otherwise the
    // snapshot write would evict them and force on-demand recomputes.
    cacheSet(SNAPSHOT_KEY, snapshot, { ttlMs: SNAPSHOT_TTL_MS, maxEntries: DETAILS_MAX_ENTRIES + 16 });
  }
  return snapshot;
}

/** Returns the cached snapshot without triggering a scan. */
export function getCachedSnapshot(): ScanSnapshot | null {
  return cacheGet<ScanSnapshot>(SNAPSHOT_KEY) ?? null;
}

/** Feature 3 â€” returns the pre-computed analysis for one symbol. */
export function getCachedAnalysis(symbol: string, market: ScanTarget["market"]): MarketAnalysis | null {
  return cacheGet<MarketAnalysis>(`${DETAILS_KEY}:${market}:${symbol}`) ?? null;
}
