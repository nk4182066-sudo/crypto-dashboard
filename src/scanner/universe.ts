/** Markets the scanner supports. */
export type ScanMarket = "crypto" | "forex" | "stocks" | "metals";

export interface ScanTarget {
  symbol: string;
  market: ScanMarket;
  label: string;
}

/**
 * Feature 10 — the tracked universe the scanner walks every cycle.
 * Kept liquid on purpose: each entry costs one candles request. Symbols are
 * verified Yahoo chart symbols so the scheduler always yields enough signals
 * per market (crypto 30+, forex 15+, stocks 20+, metals 5+).
 */
export const scanUniverse: ScanTarget[] = [
  // Crypto (35)
  { symbol: "BTC-USD", market: "crypto", label: "Bitcoin" },
  { symbol: "ETH-USD", market: "crypto", label: "Ethereum" },
  { symbol: "SOL-USD", market: "crypto", label: "Solana" },
  { symbol: "XRP-USD", market: "crypto", label: "XRP" },
  { symbol: "ADA-USD", market: "crypto", label: "Cardano" },
  { symbol: "DOGE-USD", market: "crypto", label: "Dogecoin" },
  { symbol: "AVAX-USD", market: "crypto", label: "Avalanche" },
  { symbol: "LINK-USD", market: "crypto", label: "Chainlink" },
  { symbol: "DOT-USD", market: "crypto", label: "Polkadot" },
  { symbol: "SHIB-USD", market: "crypto", label: "Shiba Inu" },
  { symbol: "BONK-USD", market: "crypto", label: "Bonk" },
  { symbol: "NEAR-USD", market: "crypto", label: "Near" },
  { symbol: "INJ-USD", market: "crypto", label: "Injective" },
  { symbol: "ARB-USD", market: "crypto", label: "Arbitrum" },
  { symbol: "OP-USD", market: "crypto", label: "Optimism" },
  { symbol: "SEI-USD", market: "crypto", label: "Sei" },
  { symbol: "XLM-USD", market: "crypto", label: "Stellar" },
  { symbol: "BCH-USD", market: "crypto", label: "Bitcoin Cash" },
  { symbol: "LTC-USD", market: "crypto", label: "Litecoin" },
  { symbol: "ATOM-USD", market: "crypto", label: "Cosmos" },
  { symbol: "XMR-USD", market: "crypto", label: "Monero" },
  { symbol: "ETC-USD", market: "crypto", label: "Ethereum Classic" },
  { symbol: "FIL-USD", market: "crypto", label: "Filecoin" },
  { symbol: "ALGO-USD", market: "crypto", label: "Algorand" },
  { symbol: "AAVE-USD", market: "crypto", label: "Aave" },
  { symbol: "MKR-USD", market: "crypto", label: "Maker" },
  { symbol: "HBAR-USD", market: "crypto", label: "Hedera" },
  { symbol: "TRX-USD", market: "crypto", label: "Tron" },
  { symbol: "SNX-USD", market: "crypto", label: "Synthetix" },
  { symbol: "CRV-USD", market: "crypto", label: "Curve DAO" },
  { symbol: "ZEC-USD", market: "crypto", label: "Zcash" },
  { symbol: "DASH-USD", market: "crypto", label: "Dash" },
  { symbol: "LDO-USD", market: "crypto", label: "Lido DAO" },
  { symbol: "MANA-USD", market: "crypto", label: "Decentraland" },
  { symbol: "ICP-USD", market: "crypto", label: "Internet Computer" },
  // Forex (16)
  { symbol: "EURUSD=X", market: "forex", label: "EUR/USD" },
  { symbol: "GBPUSD=X", market: "forex", label: "GBP/USD" },
  { symbol: "USDJPY=X", market: "forex", label: "USD/JPY" },
  { symbol: "AUDUSD=X", market: "forex", label: "AUD/USD" },
  { symbol: "USDCAD=X", market: "forex", label: "USD/CAD" },
  { symbol: "EURJPY=X", market: "forex", label: "EUR/JPY" },
  { symbol: "EURCHF=X", market: "forex", label: "EUR/CHF" },
  { symbol: "EURGBP=X", market: "forex", label: "EUR/GBP" },
  { symbol: "GBPJPY=X", market: "forex", label: "GBP/JPY" },
  { symbol: "AUDJPY=X", market: "forex", label: "AUD/JPY" },
  { symbol: "CHFJPY=X", market: "forex", label: "CHF/JPY" },
  { symbol: "EURAUD=X", market: "forex", label: "EUR/AUD" },
  { symbol: "EURNZD=X", market: "forex", label: "EUR/NZD" },
  { symbol: "NZDUSD=X", market: "forex", label: "NZD/USD" },
  { symbol: "USDCHF=X", market: "forex", label: "USD/CHF" },
  { symbol: "CADJPY=X", market: "forex", label: "CAD/JPY" },
  // Stocks (22)
  { symbol: "AAPL", market: "stocks", label: "Apple" },
  { symbol: "TSLA", market: "stocks", label: "Tesla" },
  { symbol: "NVDA", market: "stocks", label: "NVIDIA" },
  { symbol: "MSFT", market: "stocks", label: "Microsoft" },
  { symbol: "AMZN", market: "stocks", label: "Amazon" },
  { symbol: "GOOGL", market: "stocks", label: "Alphabet" },
  { symbol: "META", market: "stocks", label: "Meta Platforms" },
  { symbol: "JPM", market: "stocks", label: "JPMorgan Chase" },
  { symbol: "V", market: "stocks", label: "Visa" },
  { symbol: "MA", market: "stocks", label: "Mastercard" },
  { symbol: "WMT", market: "stocks", label: "Walmart" },
  { symbol: "XOM", market: "stocks", label: "Exxon Mobil" },
  { symbol: "CVX", market: "stocks", label: "Chevron" },
  { symbol: "KO", market: "stocks", label: "Coca-Cola" },
  { symbol: "DIS", market: "stocks", label: "Walt Disney" },
  { symbol: "NFLX", market: "stocks", label: "Netflix" },
  { symbol: "AMD", market: "stocks", label: "AMD" },
  { symbol: "INTC", market: "stocks", label: "Intel" },
  { symbol: "CSCO", market: "stocks", label: "Cisco Systems" },
  { symbol: "BA", market: "stocks", label: "Boeing" },
  { symbol: "CAT", market: "stocks", label: "Caterpillar" },
  { symbol: "GS", market: "stocks", label: "Goldman Sachs" },
  // Metals (6) — Yahoo lists these as futures, not spot `=X` pairs.
  { symbol: "GC=F", market: "metals", label: "Gold" },
  { symbol: "SI=F", market: "metals", label: "Silver" },
  { symbol: "HG=F", market: "metals", label: "Copper" },
  { symbol: "PL=F", market: "metals", label: "Platinum" },
  { symbol: "PA=F", market: "metals", label: "Palladium" },
  { symbol: "MGC=F", market: "metals", label: "Micro Gold" },
];

/** Feature 2 — the scheduler runs on this interval. */
export const SCAN_INTERVAL_MS = 15 * 60 * 1000;

/** Feature 7 — items grouped per batch. */
export const SCAN_BATCH_SIZE = 50;

/** Feature 1 — how many symbols are fetched/analyzed at once. */
export const SCAN_CONCURRENCY = 6;

/** Minimum candles before an analysis is trustworthy. */
export const SCAN_MIN_CANDLES = 30;