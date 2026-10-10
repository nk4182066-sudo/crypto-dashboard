import { cached } from "@/src/lib/cache";
import { getCachedAnalysis, getCachedSnapshot, runScan, type ScanResult, type ScanSnapshot } from "@/src/scanner/scanner";
import { startScheduler } from "@/src/scanner/scheduler";
import { scanUniverse, type ScanMarket, type ScanTarget } from "@/src/scanner/universe";

export const dynamic = "force-dynamic";

startScheduler();

const validMarkets: ScanMarket[] = ["crypto", "forex", "stocks", "metals"];

/** How many extra all-coins symbols we scan per market (above the minimums). */
const DYNAMIC_LIMITS: Record<ScanMarket, number> = {
  crypto: 45,
  forex: 24,
  stocks: 28,
  metals: 6,
};

/** One coin row from /api/market/all-coins (only the fields we need). */
interface AllCoinsCoin {
  symbol: string;
  label?: string;
  market?: string;
  quoteVolume?: number;
}

/** One enriched analysis card for the Signals page. Educational only. */
export interface MarketSignal {
  symbol: string;
  label: string;
  market: ScanMarket;
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  bias: "Bullish" | "Bearish" | "Sideways";
  price: number;
  pattern: string | null;
  support: number | null;
  resistance: number | null;
  watchLevel: number | null;
  reason: string;
  analyzedAt: string;
}

/**
 * Maps an all-coins symbol to the Yahoo chart symbol the scanner reads:
 * Binance "BTCUSDT" -> "BTC-USD", "EUR/USD" -> "EURUSD=X", spot metals fall
 * back to the most liquid futures contract, stocks pass through as-is.
 * Returns null when the symbol cannot be scanned.
 */
function toProviderSymbol(symbol: string, market: ScanMarket): string | null {
  if (market === "crypto") {
    return symbol.endsWith("USDT") && symbol.length > 4 ? `${symbol.slice(0, -4)}-USD` : null;
  }
  if (market === "metals") {
    if (symbol.startsWith("XAU")) return "GC=F";
    if (symbol.startsWith("XAG")) return "SI=F";
    if (symbol.startsWith("XPT")) return "PL=F";
    if (symbol.startsWith("XPD")) return "PA=F";
    if (symbol.startsWith("XLC") || symbol.startsWith("XCU")) return "HG=F";
    return null;
  }
  if (market === "forex") return symbol.includes("/") ? `${symbol.replace("/", "")}=X` : `${symbol}=X`;
  return symbol;
}

/** Builds the extra scan targets from the all-coins API (cached 10 minutes). */
async function loadDynamicTargets(origin: string): Promise<ScanTarget[]> {
  return cached(
    "signals:all-coins-targets",
    { ttlMs: 10 * 60 * 1000, staleMs: 30 * 60 * 1000, maxEntries: 4 },
    async () => {
      const response = await fetch(`${origin}/api/market/all-coins`, {
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`all-coins returned ${response.status}`);
      const payload = (await response.json()) as { coins?: AllCoinsCoin[] };
      const coins = Array.isArray(payload.coins) ? payload.coins : [];

      const buckets: Record<ScanMarket, AllCoinsCoin[]> = { crypto: [], forex: [], stocks: [], metals: [] };
      for (const coin of coins) {
        const market: string | undefined = coin.market;
        // Futures duplicate the spot pairs — skip them so one symbol = one scan.
        if (!market || market === "futures" || !(market in buckets)) continue;
        buckets[market as ScanMarket].push(coin);
      }
      // Most liquid crypto first; the static lists are already curated.
      buckets.crypto.sort((first, second) => (second.quoteVolume ?? 0) - (first.quoteVolume ?? 0));

      const targets: ScanTarget[] = [];
      const seen = new Set<string>();
      for (const market of validMarkets) {
        for (const coin of buckets[market].slice(0, DYNAMIC_LIMITS[market])) {
          const symbol = toProviderSymbol(coin.symbol, market);
          if (!symbol) continue;
          const key = `${market}:${symbol}`;
          if (seen.has(key)) continue;
          seen.add(key);
          targets.push({ symbol, market, label: coin.label ?? coin.symbol });
        }
      }
      return targets;
    }
  );
}


/**
 * Market signals endpoint. Scans every coin the all-coins API knows about
 * (plus the static universe), merges with the scanner's ranked snapshot, and
 * returns the requested market sorted by score (highest first). Failures
 * degrade to whatever is cached — never an empty tab.
 * Educational analysis only — not financial advice.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = (searchParams.get("market") ?? "crypto") as ScanMarket;
  if (!validMarkets.includes(market)) {
    return Response.json({ error: "Unsupported market." }, { status: 400 });
  }

  const snapshot: ScanSnapshot | null = getCachedSnapshot();

  // Extra targets from the all-coins API — a provider hiccup must not break
  // the tab, so we simply fall back to the static universe only.
  let dynamicTargets: ScanTarget[] = [];
  try {
    dynamicTargets = await loadDynamicTargets(new URL(request.url).origin);
  } catch (error) {
    console.warn("[market-signals] all-coins targets unavailable:", error);
  }

  const keyOf = (item: { symbol: string; market: ScanMarket }) => `${item.market}:${item.symbol}`;
  const known = new Set((snapshot?.results ?? []).map(keyOf));

  // Cold process (no snapshot yet) -> scan the static universe in the same
  // pass, so the first request still returns full market coverage.
  const wanted = new Map<string, ScanTarget>();
  if (!snapshot) {
    for (const target of scanUniverse) wanted.set(keyOf(target), target);
  }
  for (const target of dynamicTargets) wanted.set(keyOf(target), target);
  const missing = [...wanted.values()].filter((target) => !known.has(keyOf(target)));

  // One shared, cached scan pass: concurrent requests and rapid tab switches
  // reuse the same work instead of hammering the provider.
  const extra: ScanResult[] = missing.length
    ? await cached<ScanResult[]>(
        "signals:extra-scan",
        { ttlMs: 5 * 60 * 1000, staleMs: 15 * 60 * 1000, maxEntries: 2 },
        async () => (await runScan(missing)).results
      )
    : [];

  const merged = new Map<string, ScanResult>();
  for (const item of extra) merged.set(keyOf(item), item);
  for (const item of snapshot?.results ?? []) merged.set(keyOf(item), item);

  const results: MarketSignal[] = [...merged.values()]
    .filter((item) => item.market === market)
    .sort((first, second) => second.confidence - first.confidence)
    .map((item): MarketSignal => {
      const detail = getCachedAnalysis(item.symbol, item.market);
      const direction: MarketSignal["direction"] =
        item.direction === "buy" ? "bullish" : item.direction === "sell" ? "bearish" : "neutral";
      const support = detail?.structure.lastSwingLow?.price ?? null;
      const resistance = detail?.structure.lastSwingHigh?.price ?? null;
      const pattern = detail?.chartPatterns.classical?.[0]?.name ?? null;
      const watchLevel = direction === "bearish" ? resistance : support;
      return {
        symbol: item.symbol,
        label: item.label,
        market: item.market,
        score: item.confidence,
        direction,
        bias: item.bias,
        price: item.price,
        pattern,
        support,
        resistance,
        watchLevel,
        reason: item.reason,
        analyzedAt: item.analyzedAt,
      };
    });

  return Response.json(
    { generatedAt: snapshot?.generatedAt ?? new Date().toISOString(), market, results },
    { headers: { "Cache-Control": "no-store" } }
  );
}
