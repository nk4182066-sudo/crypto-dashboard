/** Markets the scanner supports. */
export type ScanMarket = "crypto" | "forex" | "stocks" | "metals";

export interface ScanTarget {
  symbol: string;
  market: ScanMarket;
  label: string;
}

/**
 * Feature 10 — the tracked universe the scanner walks every cycle.
 * Kept small and liquid on purpose: each entry costs one candles request.
 */
export const scanUniverse: ScanTarget[] = [
  // Crypto
  { symbol: "BTC-USD", market: "crypto", label: "Bitcoin" },
  { symbol: "ETH-USD", market: "crypto", label: "Ethereum" },
  { symbol: "SOL-USD", market: "crypto", label: "Solana" },
  { symbol: "XRP-USD", market: "crypto", label: "XRP" },
  { symbol: "ADA-USD", market: "crypto", label: "Cardano" },
  { symbol: "DOGE-USD", market: "crypto", label: "Dogecoin" },
  { symbol: "AVAX-USD", market: "crypto", label: "Avalanche" },
  { symbol: "LINK-USD", market: "crypto", label: "Chainlink" },
  { symbol: "DOT-USD", market: "crypto", label: "Polkadot" },
  // Forex
  { symbol: "EURUSD=X", market: "forex", label: "EUR/USD" },
  { symbol: "GBPUSD=X", market: "forex", label: "GBP/USD" },
  { symbol: "USDJPY=X", market: "forex", label: "USD/JPY" },
  { symbol: "AUDUSD=X", market: "forex", label: "AUD/USD" },
  { symbol: "USDCAD=X", market: "forex", label: "USD/CAD" },
  { symbol: "EURJPY=X", market: "forex", label: "EUR/JPY" },
  // Stocks
  { symbol: "AAPL", market: "stocks", label: "Apple" },
  { symbol: "TSLA", market: "stocks", label: "Tesla" },
  { symbol: "NVDA", market: "stocks", label: "NVIDIA" },
  { symbol: "MSFT", market: "stocks", label: "Microsoft" },
  { symbol: "AMZN", market: "stocks", label: "Amazon" },
  { symbol: "GOOGL", market: "stocks", label: "Alphabet" },
  // Metals — Yahoo lists these as GC=F / SI=F futures, not spot `=X` pairs.
  { symbol: "GC=F", market: "metals", label: "Gold" },
  { symbol: "SI=F", market: "metals", label: "Silver" },
];

/** Feature 2 — the scheduler runs on this interval. */
export const SCAN_INTERVAL_MS = 15 * 60 * 1000;

/** Feature 7 — items grouped per batch. */
export const SCAN_BATCH_SIZE = 50;

/** Feature 1 — how many symbols are fetched/analyzed at once. */
export const SCAN_CONCURRENCY = 6;

/** Minimum candles before an analysis is trustworthy. */
export const SCAN_MIN_CANDLES = 30;