import type { KuCoinCandle } from "@/components/KuCoinChart";

/**
 * Builds a realistic OHLCV series for when the live provider cannot be
 * reached. Deterministic per symbol: the same symbol always produces the same
 * candles, so the chart does not reshuffle on every render or poll.
 */

/** Small, fast string hash so a symbol always seeds the same walk. */
function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG — deterministic across runs and platforms. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sensible starting price per symbol so the fallback looks plausible. */
function basePriceFor(symbol: string): number {
  const upper = symbol.toUpperCase();
  if (upper.includes("BTC")) return 86000;
  if (upper.includes("ETH")) return 3400;
  if (upper.includes("SOL")) return 175;
  if (upper.includes("XRP")) return 0.52;
  if (upper.includes("DOGE")) return 0.123;
  if (upper.includes("EUR")) return 1.08;
  if (upper.includes("GBP")) return 1.27;
  if (upper.includes("JPY")) return 155;
  if (upper.includes("AAPL")) return 225;
  if (upper.includes("TSLA")) return 340;
  if (upper.includes("NVDA")) return 165;
  return 100;
}

export interface GenerateMockCandlesOptions {
  symbol: string;
  count?: number;
  /** Seconds each candle spans; used for timestamps. */
  intervalSeconds?: number;
  /** Unix seconds for the most recent candle. */
  now?: number;
}

/**
 * Produces `count` candles ending at `now`, walking price with a random walk
 * that respects a volatility proportional to the instrument's price.
 */
export function generateMockCandles({
  symbol,
  count = 80,
  intervalSeconds = 3600,
  now = Math.floor(Date.now() / 1000),
}: GenerateMockCandlesOptions): KuCoinCandle[] {
  const random = createRandom(hashSeed(symbol));
  const base = basePriceFor(symbol);
  // 1.2% per-bar volatility reads as realistic across asset classes.
  const volatility = base * 0.012;
  const end = Math.floor(now / intervalSeconds) * intervalSeconds;
  const startIndex = end - (count - 1) * intervalSeconds;

  const candles: KuCoinCandle[] = [];
  let close = base;

  for (let index = 0; index < count; index += 1) {
    const open = close;
    // Random walk with a slight upward drift, clamped so price never goes <= 0.
    const drift = (random() - 0.485) * volatility;
    close = Math.max(base * 0.05, open + drift);

    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    const upperWick = random() * volatility * 0.6;
    const lowerWick = random() * volatility * 0.6;

    candles.push({
      time: startIndex + index * intervalSeconds,
      open,
      high: bodyHigh + upperWick,
      low: Math.max(base * 0.01, bodyLow - lowerWick),
      close,
      // Volume loosely correlated with candle size, as in real markets.
      volume: Math.round((0.6 + random() * 0.8) * Math.abs(drift + volatility) * 1000),
    });
  }

  return candles;
}