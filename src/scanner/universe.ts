/** Markets the scanner supports. */
export type ScanMarket = "crypto" | "forex" | "stocks" | "metals";

export interface ScanTarget {
  symbol: string;
  market: ScanMarket;
  label: string;
}

/**
 * Feature 10 — the tracked universe the scanner walks every cycle.
 * Exactly 40 pairs (15 crypto + 10 forex + 10 stocks + 5 metals) so the
 * strict emission gate can fill 10 signals per market = 40 live signals.
 * Symbols are Yahoo-compatible chart symbols.
 */
export const scanUniverse: ScanTarget[] = [
  // Crypto (15) — Yahoo USD pairs
  { symbol: "BTC-USD", market: "crypto", label: "BTCUSDT" },
  { symbol: "ETH-USD", market: "crypto", label: "ETHUSDT" },
  { symbol: "SOL-USD", market: "crypto", label: "SOLUSDT" },
  { symbol: "BNB-USD", market: "crypto", label: "BNBUSDT" },
  { symbol: "XRP-USD", market: "crypto", label: "XRPUSDT" },
  { symbol: "ADA-USD", market: "crypto", label: "ADAUSDT" },
  { symbol: "DOGE-USD", market: "crypto", label: "DOGEUSDT" },
  { symbol: "AVAX-USD", market: "crypto", label: "AVAXUSDT" },
  { symbol: "LINK-USD", market: "crypto", label: "LINKUSDT" },
  { symbol: "LTC-USD", market: "crypto", label: "LTCUSDT" },
  { symbol: "TRX-USD", market: "crypto", label: "TRXUSDT" },
  { symbol: "MATIC-USD", market: "crypto", label: "MATICUSDT" },
  { symbol: "DOT-USD", market: "crypto", label: "DOTUSDT" },
  { symbol: "ALGO-USD", market: "crypto", label: "ALGOUSDT" },
  { symbol: "UNI-USD", market: "crypto", label: "UNIUSDT" },
  // Forex (10) — Yahoo `=X` pairs
  { symbol: "EURUSD=X", market: "forex", label: "EURUSD" },
  { symbol: "GBPUSD=X", market: "forex", label: "GBPUSD" },
  { symbol: "USDJPY=X", market: "forex", label: "USDJPY" },
  { symbol: "AUDUSD=X", market: "forex", label: "AUDUSD" },
  { symbol: "USDCAD=X", market: "forex", label: "USDCAD" },
  { symbol: "USDCHF=X", market: "forex", label: "USDCHF" },
  { symbol: "EURGBP=X", market: "forex", label: "EURGBP" },
  { symbol: "EURJPY=X", market: "forex", label: "EURJPY" },
  { symbol: "GBPJPY=X", market: "forex", label: "GBPJPY" },
  { symbol: "NZDUSD=X", market: "forex", label: "NZDUSD" },
  // Stocks (10) — bare Yahoo tickers
  { symbol: "AAPL", market: "stocks", label: "AAPL" },
  { symbol: "TSLA", market: "stocks", label: "TSLA" },
  { symbol: "NVDA", market: "stocks", label: "NVDA" },
  { symbol: "MSFT", market: "stocks", label: "MSFT" },
  { symbol: "GOOGL", market: "stocks", label: "GOOGL" },
  { symbol: "AMZN", market: "stocks", label: "AMZN" },
  { symbol: "META", market: "stocks", label: "META" },
  { symbol: "NFLX", market: "stocks", label: "NFLX" },
  { symbol: "AMD", market: "stocks", label: "AMD" },
  { symbol: "SPY", market: "stocks", label: "SPY" },
  // Metals (5) — Yahoo futures / spot
  { symbol: "GC=F", market: "metals", label: "XAUUSD" },
  { symbol: "SI=F", market: "metals", label: "XAGUSD" },
  { symbol: "PL=F", market: "metals", label: "XPTUSD" },
  { symbol: "PA=F", market: "metals", label: "XPDUSD" },
  { symbol: "CL=F", market: "metals", label: "USOIL" },
];

/** Feature 2 — the scheduler runs on this interval. */
export const SCAN_INTERVAL_MS = 15 * 60 * 1000;

/** Feature 7 — items grouped per batch. */
export const SCAN_BATCH_SIZE = 50;

/** Feature 1 — how many symbols are fetched/analyzed at once. */
export const SCAN_CONCURRENCY = 6;

/** Minimum candles before an analysis is trustworthy. */
export const SCAN_MIN_CANDLES = 30;