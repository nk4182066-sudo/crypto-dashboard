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
 * per market (crypto 50 / forex 30 / stocks 30 / metals 10 = 120 candidates).
 */
export const scanUniverse: ScanTarget[] = [
  // Crypto (50)
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
  // MASLA 8 — top-50 coins the chat must resolve by name (SUI was missing).
  { symbol: "SUI-USD", market: "crypto", label: "Sui" },
  { symbol: "APT-USD", market: "crypto", label: "Aptos" },
  { symbol: "PEPE-USD", market: "crypto", label: "Pepe" },
  // MASLA: top-50 pool (12 more) — every symbol re-verified against the Yahoo
  // chart API (UNI/GRT/STX/IMX answer 404 "may be delisted" → deliberately excluded).
  { symbol: "TIA-USD", market: "crypto", label: "Celestia" },
  { symbol: "VET-USD", market: "crypto", label: "VeChain" },
  { symbol: "SAND-USD", market: "crypto", label: "The Sandbox" },
  { symbol: "AXS-USD", market: "crypto", label: "Axie Infinity" },
  { symbol: "EGLD-USD", market: "crypto", label: "MultiversX" },
  { symbol: "FLOW-USD", market: "crypto", label: "Flow" },
  { symbol: "CHZ-USD", market: "crypto", label: "Chiliz" },
  { symbol: "QNT-USD", market: "crypto", label: "Quant" },
  { symbol: "ONDO-USD", market: "crypto", label: "Ondo" },
  { symbol: "KAS-USD", market: "crypto", label: "Kaspa" },
  { symbol: "JUP-USD", market: "crypto", label: "Jupiter" },
  { symbol: "WLD-USD", market: "crypto", label: "Worldcoin" },
  // Forex (30)
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
  // MASLA: 30-pair forex pool (14 more, Yahoo-verified; all also covered by
  // Frankfurter/ECB for the 1d fallback chain).
  { symbol: "NZDJPY=X", market: "forex", label: "NZD/JPY" },
  { symbol: "EURPLN=X", market: "forex", label: "EUR/PLN" },
  { symbol: "EURNOK=X", market: "forex", label: "EUR/NOK" },
  { symbol: "EURSEK=X", market: "forex", label: "EUR/SEK" },
  { symbol: "USDSGD=X", market: "forex", label: "USD/SGD" },
  { symbol: "USDNOK=X", market: "forex", label: "USD/NOK" },
  { symbol: "USDSEK=X", market: "forex", label: "USD/SEK" },
  { symbol: "USDPLN=X", market: "forex", label: "USD/PLN" },
  { symbol: "USDTRY=X", market: "forex", label: "USD/TRY" },
  { symbol: "USDINR=X", market: "forex", label: "USD/INR" },
  { symbol: "USDMXN=X", market: "forex", label: "USD/MXN" },
  { symbol: "USDZAR=X", market: "forex", label: "USD/ZAR" },
  { symbol: "USDBRL=X", market: "forex", label: "USD/BRL" },
  { symbol: "USDHKD=X", market: "forex", label: "USD/HKD" },
  // Stocks (30)
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
  // MASLA: 30-stock pool (8 more, Yahoo-verified).
  { symbol: "ORCL", market: "stocks", label: "Oracle" },
  { symbol: "IBM", market: "stocks", label: "IBM" },
  { symbol: "CRM", market: "stocks", label: "Salesforce" },
  { symbol: "ADBE", market: "stocks", label: "Adobe" },
  { symbol: "PYPL", market: "stocks", label: "PayPal" },
  { symbol: "QCOM", market: "stocks", label: "Qualcomm" },
  { symbol: "TXN", market: "stocks", label: "Texas Instruments" },
  { symbol: "PLTR", market: "stocks", label: "Palantir" },
  // Metals (10) — Yahoo lists these as futures, not spot `=X` pairs.
  { symbol: "GC=F", market: "metals", label: "Gold" },
  { symbol: "SI=F", market: "metals", label: "Silver" },
  { symbol: "HG=F", market: "metals", label: "Copper" },
  { symbol: "PL=F", market: "metals", label: "Platinum" },
  { symbol: "PA=F", market: "metals", label: "Palladium" },
  { symbol: "MGC=F", market: "metals", label: "Micro Gold" },
  // MASLA: 10-metal pool (+4) — the two ETFs give the spot-style exposure the
  // futures roll can distort; ZNC/ALI are the liquid LME contracts Yahoo serves.
  { symbol: "GLD", market: "metals", label: "SPDR Gold (GLD)" },
  { symbol: "SLV", market: "metals", label: "iShares Silver (SLV)" },
  { symbol: "ZNC=F", market: "metals", label: "Zinc" },
  { symbol: "ALI=F", market: "metals", label: "Aluminum" },
];

/** Feature 2 — the scheduler runs on this interval. */
export const SCAN_INTERVAL_MS = 15 * 60 * 1000;

/** Feature 7 — items grouped per batch. */
export const SCAN_BATCH_SIZE = 50;

/** Feature 1 — how many symbols are fetched/analyzed at once. */
export const SCAN_CONCURRENCY = 6;

/** Minimum candles before an analysis is trustworthy. */
export const SCAN_MIN_CANDLES = 30;