import type { AssetClassKey, Candle, CorrelationPair, CorrelationReport, MacroIndicator } from "./types";

export interface BenchmarkSeries {
  key: string;
  candles: Candle[];
  /** Defaults to inferring the class from the key. */
  assetClass?: AssetClassKey;
}

/**
 * Part 5 — cross-market benchmark map.
 *
 * Each entry is a Yahoo symbol used to measure how the analysed asset relates
 * to the other four classes. Rates and the dollar are included because they
 * drive every risk asset, so correlation to them is the macro signal.
 */
export const CROSS_MARKET_BENCHMARKS: { key: string; label: string; assetClass: AssetClassKey }[] = [
  { key: "BTC-USD", label: "Bitcoin", assetClass: "crypto" },
  { key: "EURUSD=X", label: "Euro / Dollar", assetClass: "forex" },
  { key: "^GSPC", label: "S&P 500", assetClass: "stocks" },
  { key: "CL=F", label: "Crude Oil", assetClass: "commodities" },
  { key: "GC=F", label: "Gold", assetClass: "metals" },
  { key: "DX-Y.NYB", label: "US Dollar Index (DXY)", assetClass: "forex" },
  { key: "^TNX", label: "US 10Y Yield", assetClass: "stocks" },
];

const ASSET_CLASS_HINTS: { key: string; assetClass: AssetClassKey }[] = [
  { key: "BTC-USD", assetClass: "crypto" },
  { key: "GC=F", assetClass: "metals" },
  { key: "SI=F", assetClass: "metals" },
  { key: "XAU", assetClass: "metals" },
  { key: "CL=F", assetClass: "commodities" },
  { key: "NG=F", assetClass: "commodities" },
  { key: "^GSPC", assetClass: "stocks" },
  { key: "^TNX", assetClass: "stocks" },
  { key: "DX-Y.NYB", assetClass: "forex" },
];

/**
 * Resolves a benchmark key to its asset class.
 *
 * Accepts both provider symbols ("BTC-USD", "GC=F") and the friendly labels the
 * client sends ("BTC", "Gold", "S&P 500"), so coverage is accurate either way.
 */
export function assetClassFor(key: string, declared?: AssetClassKey): AssetClassKey {
  if (declared) return declared;
  const upper = key.toUpperCase();
  if (upper.includes("=X") || upper.includes("EURUSD") || upper.includes("GBPUSD") || upper.includes("USDJPY")) return "forex";
  if (upper.includes("BTC")) return "crypto";
  if (upper.includes("GOLD") || upper.includes("SILVER") || upper.includes("XAU") || upper.includes("XAG")) return "metals";
  if (upper.includes("OIL") || upper.includes("CRUDE") || upper.includes("CL=F") || upper.includes("COPPER")) return "commodities";
  if (upper.includes("DXY") || upper.includes("DX-Y")) return "forex";
  if (upper.includes("SPX") || upper.includes("S&P") || upper.includes("NASDAQ") || upper.includes("DJI") || upper.includes("10Y") || upper.includes("TNX")) return "stocks";
  const hint = ASSET_CLASS_HINTS.find((entry) => upper.includes(entry.key.toUpperCase()));
  return hint?.assetClass ?? "stocks";
}

function returns(candles: Candle[]): Map<number, number> {
  const table = new Map<number, number>();
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (previous.close === 0) continue;
    table.set(current.time, (current.close - previous.close) / previous.close);
  }
  return table;
}

function pearson(pairs: number[][]): { correlation: number; beta: number } | null {
  if (pairs.length < 10) return null;
  const n = pairs.length;
  const meanX = pairs.reduce((total, [x]) => total + x, 0) / n;
  const meanY = pairs.reduce((total, [, y]) => total + y, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const [x, y] of pairs) {
    covariance += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  }
  if (varianceX === 0 || varianceY === 0) return null;
  return {
    correlation: covariance / Math.sqrt(varianceX * varianceY),
    beta: covariance / varianceY,
  };
}

function describe(key: string, correlation: number): string {
  const strength = Math.abs(correlation) >= 0.7 ? "strong" : Math.abs(correlation) >= 0.4 ? "moderate" : "weak";
  const direction = correlation >= 0 ? "moves together with" : "moves opposite to";
  return `${key} ${strength} ${correlation >= 0 ? "positive" : "negative"} correlation — this asset ${direction} ${key}.`;
}

/** Total percent change of a benchmark across its loaded window. */
function windowChange(candles: Candle[]): number | null {
  if (candles.length < 5) return null;
  const first = candles[0].close;
  const last = candles.at(-1)!.close;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}

/**
 * Part 5 — derives global macro stance from the benchmark series themselves.
 *
 * Direction is taken from what the proxy actually did over the window rather
 * than from any rate/inflation guess: a falling DXY is a dollar tailwind, a
 * rising 10Y yield is a headwind for risk assets. Indicators whose series were
 * not supplied are omitted rather than filled with invented values.
 */
function buildMacro(benchmarks: BenchmarkSeries[]): MacroIndicator[] {
  const macro: MacroIndicator[] = [];
  // Matches either the provider symbol ("DX-Y.NYB") or the friendly label the
  // client sends ("DXY"), so the macro block works with either source.
  const byKey = (...needles: string[]) => benchmarks.find((entry) => {
    const haystack = entry.key.toUpperCase();
    return needles.some((needle) => haystack.includes(needle.toUpperCase()));
  });

  const dxy = byKey("DX-Y.NYB", "DXY");
  if (dxy) {
    const change = windowChange(dxy.candles);
    const falling = change !== null && change < -0.5;
    const rising = change !== null && change > 0.5;
    macro.push({
      key: "DXY",
      label: "US Dollar Index",
      stance: falling ? "tailwind" : rising ? "headwind" : "neutral",
      changePercent: change === null ? null : Number(change.toFixed(2)),
      note: rising
        ? "A strengthening dollar is usually a headwind for risk assets — liquidity tightens and non-USD buyers pay more."
        : falling
          ? "A weakening dollar generally supports risk assets and non-USD-denominated commodities."
          : "The dollar is broadly flat over this window, so it is not the dominant driver right now.",
    });
  }

  const rates = byKey("^TNX", "10Y", "TNX");
  if (rates) {
    const change = windowChange(rates.candles);
    const rising = change !== null && change > 1;
    const falling = change !== null && change < -1;
    macro.push({
      key: "US10Y",
      label: "US 10Y Treasury Yield",
      stance: rising ? "headwind" : falling ? "tailwind" : "neutral",
      changePercent: change === null ? null : Number(change.toFixed(2)),
      note: rising
        ? "Rising long-term yields tighten financial conditions and raise the bar for long-duration growth assets."
        : falling
          ? "Falling yields ease financial conditions and historically support risk assets."
          : "Long-term yields are stable, so rates are not the dominant pressure on this window.",
    });
  }

  const oil = byKey("CL=F", "OIL", "CRUDE");
  if (oil) {
    const change = windowChange(oil.candles);
    const rising = change !== null && change > 5;
    macro.push({
      key: "OIL",
      label: "Crude Oil",
      stance: rising ? "headwind" : change !== null && change < -5 ? "tailwind" : "neutral",
      changePercent: change === null ? null : Number(change.toFixed(2)),
      note: rising
        ? "A sharp oil rally is an inflation impulse and a margin headwind for most risk assets."
        : "Energy prices are not flashing a strong inflation signal over this window.",
    });
  }

  const equities = byKey("^GSPC", "S&P 500", "SPX");
  if (equities) {
    const change = windowChange(equities.candles);
    const rising = change !== null && change > 2;
    macro.push({
      key: "SPX",
      label: "S&P 500 (risk appetite)",
      stance: rising ? "tailwind" : change !== null && change < -5 ? "headwind" : "neutral",
      changePercent: change === null ? null : Number(change.toFixed(2)),
      note: rising
        ? "Broad equity strength is the clearest live signal of risk appetite being available."
        : "Equity weakness or flatness suggests risk appetite is constrained right now.",
    });
  }

  return macro;
}

export function analyzeCorrelation(base: Candle[], benchmarks: BenchmarkSeries[]): CorrelationReport {
  const baseReturns = returns(base);
  const pairs: CorrelationPair[] = [];
  const coverage = new Set<AssetClassKey>();

  for (const benchmark of benchmarks) {
    if (benchmark.candles.length < 15) continue;
    const benchReturns = returns(benchmark.candles);
    const aligned: number[][] = [];
    for (const [time, baseValue] of baseReturns) {
      const benchValue = benchReturns.get(time);
      if (benchValue === undefined) continue;
      aligned.push([baseValue, benchValue]);
    }
    const stats = pearson(aligned);
    if (!stats) continue;
    const assetClass = assetClassFor(benchmark.key, benchmark.assetClass);
    coverage.add(assetClass);
    pairs.push({
      key: benchmark.key,
      correlation: Number(stats.correlation.toFixed(3)),
      beta: Number(stats.beta.toFixed(3)),
      assetClass,
      note: describe(benchmark.key, stats.correlation),
    });
  }

  // Strongest negative correlation first — the key cross-market warning.
  pairs.sort((first, second) => first.correlation - second.correlation);
  const macro = buildMacro(benchmarks);
  const headwinds = macro.filter((indicator) => indicator.stance === "headwind").length;

  return {
    pairs,
    coverage: [...coverage],
    macro,
    note: pairs.length
      ? `Correlations are computed from daily-matched returns over the overlapping window across ${coverage.size} asset class(es). Correlations shift in stress: hedges that held last month can fail this month.${headwinds > 0 ? ` ${headwinds} macro indicator(s) currently read as headwinds.` : ""}`
      : "No overlapping benchmark data was available to compute correlation.",
  };
}
