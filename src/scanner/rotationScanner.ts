/**
 * rotationScanner.ts — Smart Rotation Scanner
 *
 * Scans only 4 coins per market (16 total) per request with continuous rotation.
 * Maintains an in-memory pointer per market that advances on each call, rotating
 * through the entire universe over time.
 *
 * - Crypto: MEXC (Min60/Min240/Min1440)
 * - Forex/Stocks/Metals: Yahoo Finance (with browser User-Agent header)
 * - 300ms delay between API calls
 * - Graceful per-market failure (never crashes)
 *
 * Educational analysis only — not financial advice.
 */

import type { Candle } from "@/src/analysis/types";
import { scanUniverse, type ScanTarget, type ScanMarket } from "./universe";
import { fetchMexcCandles } from "./scanner";

const ROTATION_SIZE = 4;
const MARKETS: ScanMarket[] = ["crypto", "forex", "stocks", "metals"];

const rotationOffset = new Map<ScanMarket, number>(
  MARKETS.map((m) => [m, 0])
);

export function rotationTargets(market: ScanMarket): ScanTarget[] {
  const all = scanUniverse.filter((t) => t.market === market);
  if (all.length === 0) return [];
  const start = (rotationOffset.get(market) ?? 0) % all.length;
  const end = Math.min(start + ROTATION_SIZE, all.length);
  const slice = all.slice(start, end);
  rotationOffset.set(market, (start + ROTATION_SIZE) % all.length);
  return slice;
}

export function resetRotation(): void {
  MARKETS.forEach((m) => rotationOffset.set(m, 0));
}

const YAHOO_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchYahooCandlesRotated(
  symbol: string,
  market: ScanMarket,
  timeframe: "1h" | "4h" | "1d"
): Promise<Candle[]> {
  const intervalMap: Record<"1h" | "4h" | "1d", string> = {
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
  };
  const interval = intervalMap[timeframe] ?? "1h";

  let yahooSymbol = symbol;
  if (market === "forex" && !symbol.includes("=")) {
    yahooSymbol = `${symbol}=X`;
  }
  if (market === "metals") {
    const metalBaseSymbols = [
      "GDX", "GDXU", "PAAS", "SIL", "AGO", "AAU", "NUE", "AEM", "SMH", "HYG",
      "LQD", "TTM", "RSP", "IYM", "EWZ", "EEM", "UUP", "USO", "GOLD", "GLD",
      "SLV", "IAU", "GDXJ", "GDXSE",
    ];
    if (!metalBaseSymbols.includes(yahooSymbol)) {
      yahooSymbol = `${yahooSymbol}=X`;
    }
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=1mo`;

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: YAHOO_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (attempt < maxRetries) {
          await delay(Math.pow(2, attempt) * 1000);
          continue;
        }
        console.log(
          `[DATA] Yahoo Failed: HTTP ${response.status} for ${yahooSymbol} (${symbol})`
        );
        return [];
      }

      const payload = await response.json() as any;
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

      const candles: Candle[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i] * 1000;
        const o = indicators.open?.[i];
        const h = indicators.high?.[i];
        const l = indicators.low?.[i];
        const c = indicators.close?.[i];
        const v = indicators.volume?.[i] ?? 0;
        if (![t, o, h, l, c].every(Number.isFinite)) continue;
        candles.push({ time: t, open: o, high: h, low: l, close: c, volume: v });
      }
      return candles;
    } catch (error) {
      if (attempt < maxRetries) {
        await delay(Math.pow(2, attempt) * 1000);
        continue;
      }
      console.log(
        `[DATA] Yahoo error for ${yahooSymbol}:`,
        error instanceof Error ? error.message : error
      );
      return [];
    }
  }
  return [];
}

/** Fetch candles for one symbol from the correct provider. */
async function fetchCandlesRotated(
  symbol: string,
  market: ScanMarket,
  timeframe: "1h" | "4h" | "1d"
): Promise<Candle[]> {
  if (market === "crypto") {
    const idMap: Record<string, string> = { "BTC-USD": "bitcoin", "ETH-USD": "ethereum", "SOL-USD": "solana" };
    const coinId = idMap[symbol] ?? symbol.toLowerCase().replace("-USD", "");
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=1`;
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json() as number[][];
        const candles: Candle[] = [];
        for (const k of data) {
          const t = Number(k[0]); const o = Number(k[1]); const h = Number(k[2]); const l = Number(k[3]); const c = Number(k[4]);
          if (![t, o, h, l, c].every(Number.isFinite)) continue;
          candles.push({ time: t, open: o, high: h, low: l, close: c, volume: 0 });
        }
        console.log(`[DATA] CoinGecko Success: ${symbol} Length: ${candles.length}`);
        return candles;
      }
    } catch (e) {
      console.log(`[DATA] CoinGecko error for ${symbol}:`, e instanceof Error ? e.message : e);
    }
    return [];
  }
  const candles = await fetchYahooCandlesRotated(symbol, market, timeframe);
  console.log(`[DATA] Yahoo Raw Length for ${symbol}: ${candles.length}`);
  return candles;
}

/** Result of scanning one symbol across all 3 timeframes. */
export interface RotatedScanResult {
  symbol: string;
  label: string;
  market: ScanMarket;
  price: number;
  h1: Candle[];
  h4: Candle[];
  d1: Candle[];
  analyzedAt: string;
}

/** Scan one symbol across 1h, 4h, 1d timeframes sequentially (300ms between calls). */
async function scanSymbolRotated(
  target: ScanTarget
): Promise<RotatedScanResult | null> {
  const h1 = await fetchCandlesRotated(target.symbol, target.market, "1h");
  await delay(300);
  const h4 = await fetchCandlesRotated(target.symbol, target.market, "4h");
  await delay(300);
  const d1 = await fetchCandlesRotated(target.symbol, target.market, "1d");

  if (h1.length === 0) {
    console.log(`[DATA] No 1h candles for ${target.symbol} (${target.market})`);
    return null;
  }

  const price = h1[h1.length - 1].close;
  if (!price || price <= 0) return null;

  return {
    symbol: target.symbol,
    label: target.label,
    market: target.market,
    price,
    h1,
    h4,
    d1,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Scan the next 4 coins per market (16 total) with rotation.
 * Returns results keyed by market. Each market's scan is independent —
 * if one market fails, the others still complete.
 */
export async function runRotationScan(): Promise<
  Record<ScanMarket, RotatedScanResult[]>
> {
  const results: Record<ScanMarket, RotatedScanResult[]> = {
    crypto: [],
    forex: [],
    stocks: [],
    metals: [],
  };

  for (const market of MARKETS) {
    const targets = rotationTargets(market);
    console.log(
      `[rotationScanner] ${market}: scanning ${targets.length} coins (${
        targets.map((t) => t.symbol).join(", ")
      })`
    );

    for (const target of targets) {
      try {
        const result = await scanSymbolRotated(target);
        if (result) {
          results[market].push(result);
        }
      } catch (error) {
        console.warn(
          `[rotationScanner] ${market}/${target.symbol} failed:`,
          error instanceof Error ? error.message : error
        );
      }
      await delay(300);
    }
  }

  return results;
}