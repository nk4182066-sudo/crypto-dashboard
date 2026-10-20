/** Markets the scanner supports. */
export type ScanMarket = "crypto" | "forex" | "stocks" | "metals";

export interface ScanTarget {
  symbol: string;
  market: ScanMarket;
  label: string;
}

/**
 * Feature 10 — the tracked universe the scanner walks every cycle.
 * Quality with Quantity spec — 100 pairs (50 crypto + 20 forex + 20 stocks +
 * 10 metals) so the strict emission gate has ENOUGH candidates to fill the
 * 10-signals-per-market daily quota with 85+ setups only.
 * Symbols are Yahoo-compatible chart symbols.
 */
export const scanUniverse: ScanTarget[] = [
  // Crypto (50) — Yahoo USD pairs
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
  { symbol: "SHIB-USD", market: "crypto", label: "SHIBUSDT" },
  { symbol: "NEAR-USD", market: "crypto", label: "NEARUSDT" },
  { symbol: "APT-USD", market: "crypto", label: "APTUSDT" },
  { symbol: "ATOM-USD", market: "crypto", label: "ATOMUSDT" },
  { symbol: "FIL-USD", market: "crypto", label: "FILUSDT" },
  { symbol: "ETC-USD", market: "crypto", label: "ETCUSDT" },
  { symbol: "XLM-USD", market: "crypto", label: "XLMUSDT" },
  { symbol: "HBAR-USD", market: "crypto", label: "HBARUSDT" },
  { symbol: "VET-USD", market: "crypto", label: "VETUSDT" },
  { symbol: "ICP-USD", market: "crypto", label: "ICPUSDT" },
  { symbol: "ARB-USD", market: "crypto", label: "ARBUSDT" },
  { symbol: "OP-USD", market: "crypto", label: "OPUSDT" },
  { symbol: "INJ-USD", market: "crypto", label: "INJUSDT" },
  { symbol: "SUI-USD", market: "crypto", label: "SUIUSDT" },
  { symbol: "SEI-USD", market: "crypto", label: "SEIUSDT" },
  { symbol: "RUNE-USD", market: "crypto", label: "RUNEUSDT" },
  { symbol: "AAVE-USD", market: "crypto", label: "AAVEUSDT" },
  { symbol: "MKR-USD", market: "crypto", label: "MKRUSDT" },
  { symbol: "LDO-USD", market: "crypto", label: "LDOUSDT" },
  { symbol: "GRT-USD", market: "crypto", label: "GRTUSDT" },
  { symbol: "SAND-USD", market: "crypto", label: "SANDUSDT" },
  { symbol: "MANA-USD", market: "crypto", label: "MANAUSDT" },
  { symbol: "THETA-USD", market: "crypto", label: "THETAUSDT" },
  { symbol: "EOS-USD", market: "crypto", label: "EOSUSDT" },
  { symbol: "KAVA-USD", market: "crypto", label: "KAVAUSDT" },
  { symbol: "FTM-USD", market: "crypto", label: "FTMUSDT" },
  { symbol: "ONE-USD", market: "crypto", label: "ONEUSDT" },
  { symbol: "EGLD-USD", market: "crypto", label: "EGLDUSDT" },
  { symbol: "XTZ-USD", market: "crypto", label: "XTZUSDT" },
  { symbol: "FLOW-USD", market: "crypto", label: "FLOWUSDT" },
  { symbol: "CHZ-USD", market: "crypto", label: "CHZUSDT" },
  { symbol: "ENJ-USD", market: "crypto", label: "ENJUSDT" },
  { symbol: "CRV-USD", market: "crypto", label: "CRVUSDT" },
  { symbol: "SNX-USD", market: "crypto", label: "SNXUSDT" },
  { symbol: "COMP-USD", market: "crypto", label: "COMPUSDT" },
  // Forex (20) — Yahoo `=X` pairs
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
  { symbol: "EURCHF=X", market: "forex", label: "EURCHF" },
  { symbol: "GBPCHF=X", market: "forex", label: "GBPCHF" },
  { symbol: "AUDJPY=X", market: "forex", label: "AUDJPY" },
  { symbol: "CADJPY=X", market: "forex", label: "CADJPY" },
  { symbol: "CHFJPY=X", market: "forex", label: "CHFJPY" },
  { symbol: "AUDNZD=X", market: "forex", label: "AUDNZD" },
  { symbol: "NZDCAD=X", market: "forex", label: "NZDCAD" },
  { symbol: "EURCAD=X", market: "forex", label: "EURCAD" },
  { symbol: "EURAUD=X", market: "forex", label: "EURAUD" },
  { symbol: "GBPAUD=X", market: "forex", label: "GBPAUD" },
  // Stocks (20) — bare Yahoo tickers
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
  { symbol: "JPM", market: "stocks", label: "JPM" },
  { symbol: "V", market: "stocks", label: "V" },
  { symbol: "MA", market: "stocks", label: "MA" },
  { symbol: "WMT", market: "stocks", label: "WMT" },
  { symbol: "JNJ", market: "stocks", label: "JNJ" },
  { symbol: "KO", market: "stocks", label: "KO" },
  { symbol: "DIS", market: "stocks", label: "DIS" },
  { symbol: "XOM", market: "stocks", label: "XOM" },
  { symbol: "ORCL", market: "stocks", label: "ORCL" },
  { symbol: "CRM", market: "stocks", label: "CRM" },
  // Metals (10) — Yahoo futures / spot / ETFs
  { symbol: "GC=F", market: "metals", label: "XAUUSD" },
  { symbol: "SI=F", market: "metals", label: "XAGUSD" },
  { symbol: "PL=F", market: "metals", label: "XPTUSD" },
  { symbol: "PA=F", market: "metals", label: "XPDUSD" },
  { symbol: "CL=F", market: "metals", label: "USOIL" },
  { symbol: "HG=F", market: "metals", label: "COPPER" },
  { symbol: "NG=F", market: "metals", label: "NATGAS" },
  { symbol: "GLD", market: "metals", label: "GOLD-ETF" },
  { symbol: "SLV", market: "metals", label: "SILVER-ETF" },
  { symbol: "DBB", market: "metals", label: "METALS-ETF" },
];

/** Feature 2 — the scheduler runs on this interval. */
export const SCAN_INTERVAL_MS = 15 * 60 * 1000;

/** Feature 7 — items grouped per batch. */
export const SCAN_BATCH_SIZE = 50;

/** Feature 1 — how many symbols are fetched/analyzed at once. */
export const SCAN_CONCURRENCY = 6;

/** Minimum candles before an analysis is trustworthy. */
export const SCAN_MIN_CANDLES = 30;