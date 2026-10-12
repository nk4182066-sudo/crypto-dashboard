import type { AssetClassReport } from "./types";

const COMMODITY_SYMBOLS = ["GC=F", "SI=F", "CL=F", "NG=F", "HG=F", "XAU", "XAG", "GOLD", "SILVER", "OIL", "COPPER"];
const BOND_SYMBOLS = ["^TNX", "^IRX", "^FVX", "^TYX", "ZN=F", "ZB=F", "TLT", "IEF", "BOND"];

function detect(symbol: string, market: "crypto" | "forex" | "stocks"): AssetClassReport["assetClass"] {
  const upper = symbol.toUpperCase();
  if (COMMODITY_SYMBOLS.some((needle) => upper.includes(needle))) return "Commodities";
  if (BOND_SYMBOLS.some((needle) => upper.includes(needle))) return "Bonds";
  if (market === "forex" || /=X$/.test(upper) || /^[A-Z]{3}[-/][A-Z]{3}$/.test(upper)) return "Forex";
  if (market === "stocks") return "Stocks";
  if (market === "crypto") return "Crypto";
  return "Stocks";
}

export function analyzeAssetClass(symbol: string, market: "crypto" | "forex" | "stocks"): AssetClassReport {
  const assetClass = detect(symbol, market);

  const profiles: Record<AssetClassReport["assetClass"], AssetClassReport> = {
    Crypto: {
      assetClass: "Crypto",
      hours: "24/7 — no closing bell, so weekend gaps and Sunday illiquidity are real risks.",
      volatilityProfile: "Highest volatility of the five classes; 3–8% daily moves are normal in trending phases.",
      primaryDriver: "Liquidity cycles, ETF flows, funding rates and the Bitcoin halving cycle.",
      note: "Crypto leads the risk curve: altcoins amplify BTC moves. Size positions for the larger stops this class requires.",
    },
    Forex: {
      assetClass: "Forex",
      hours: "Monday ~21:00 UTC to Friday ~21:00 UTC; London and New York overlap (12:00–16:00 UTC) carries most volume.",
      volatilityProfile: "Lowest daily volatility of the five classes; pairs rarely move more than 0.5–1% in a session without news.",
      primaryDriver: "Interest-rate differentials, central-bank language and macro data (CPI, NFP).",
      note: "Session timing matters more than anything else in forex — trade the overlap and avoid the Asia-range chop unless range-trading.",
    },
    Stocks: {
      assetClass: "Stocks",
      hours: "Regular session 14:30–21:00 UTC (US equities); pre/post market are thin and wide.",
      volatilityProfile: "Moderate volatility; individual names gap on earnings, indices are smoother.",
      primaryDriver: "Earnings, guidance, rates and index flows. Single names can diverge from the index for days.",
      note: "Avoid holding illiquid small caps into earnings; index futures extend the tradable window beyond the cash session.",
    },
    Commodities: {
      assetClass: "Commodities",
      hours: "Futures trade nearly 23 hours/day with a daily maintenance break; energy and metals have distinct roll cycles.",
      volatilityProfile: "Event-driven volatility: inventories, weather, OPEC decisions and USD strength dominate.",
      primaryDriver: "Supply/demand balance, USD inverse relationship, and geopolitical risk premium.",
      note: "Gold trades as a USD hedge; oil trades as growth + geopolitics. Contract rolls create costs that stocks traders ignore.",
    },
    Bonds: {
      assetClass: "Bonds",
      hours: "Cash bonds follow the US session (14:00–21:00 UTC); futures trade nearly around the clock.",
      volatilityProfile: "Lowest price volatility but high sensitivity to rate surprises; yields invert normal stock logic.",
      primaryDriver: "Central-bank policy expectations, inflation prints and flight-to-quality flows.",
      note: "Bonds and stocks usually hedge each other; when correlations break (stagflation), both fall together — size defensively.",
    },
  };

  return profiles[assetClass];
}
