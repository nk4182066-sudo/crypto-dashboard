import { getCachedAnalysis, getCachedSnapshot, type ScanSnapshot } from "@/src/scanner/scanner";
import { runNow, startScheduler } from "@/src/scanner/scheduler";
import type { ScanMarket } from "@/src/scanner/universe";

export const dynamic = "force-dynamic";

startScheduler();

const validMarkets: ScanMarket[] = ["crypto", "forex", "stocks", "metals"];

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
 * Market signals endpoint. Reuses the scanner's ranked snapshot, filters by
 * market, and enriches each symbol from its cached analysis (pattern name +
 * support/resistance swing levels). Returns highest score first.
 * Educational analysis only — not financial advice.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = (searchParams.get("market") ?? "crypto") as ScanMarket;
  if (!validMarkets.includes(market)) {
    return Response.json({ error: "Unsupported market." }, { status: 400 });
  }

  const snapshot: ScanSnapshot = getCachedSnapshot() ?? (await runNow());

  const results: MarketSignal[] = snapshot.results
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
    { generatedAt: snapshot.generatedAt, market, results },
    { headers: { "Cache-Control": "no-store" } }
  );
}
