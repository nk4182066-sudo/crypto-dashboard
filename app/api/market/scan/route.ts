import { runNow, schedulerState, startScheduler } from "@/src/scanner/scheduler";
import { getCachedAnalysis, getCachedSnapshot, runScan } from "@/src/scanner/scanner";
import type { ScanMarket, ScanTarget } from "@/src/scanner/universe";

export const dynamic = "force-dynamic";

const validMarkets: ScanMarket[] = ["crypto", "forex", "stocks", "metals"];

/** Feature 3 — ensure the 15-minute background job is running. */
startScheduler();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const market = searchParams.get("market") as ScanMarket | null;
  const force = searchParams.get("force") === "1";

  // Feature 3 — serve a single symbol's pre-computed analysis when available.
  if (symbol && market && validMarkets.includes(market)) {
    const analysis = getCachedAnalysis(symbol, market);
    if (analysis) {
      return Response.json({ analysis, source: "precomputed" }, { headers: { "Cache-Control": "no-store" } });
    }
    const refreshed = await runScan([{ symbol, market, label: symbol } as ScanTarget]);
    const first = refreshed.results[0];
    if (first) {
      const detail = getCachedAnalysis(symbol, market);
      if (detail) {
        return Response.json({ analysis: detail, source: "on-demand" }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    return Response.json({ error: "No analysis is available for that symbol yet." }, { status: 404 });
  }

  // Feature 10 — the ranked snapshot, from cache unless force is set.
  if (force) {
    const snapshot = await runNow();
    return Response.json({ ...snapshot, scheduler: schedulerState() }, { headers: { "Cache-Control": "no-store" } });
  }

  const cached = getCachedSnapshot();
  if (cached) {
    return Response.json({ ...cached, scheduler: schedulerState() }, { headers: { "Cache-Control": "no-store" } });
  }

  // Nothing pre-computed yet, so fill it on first read.
  const snapshot = await runNow();
  return Response.json({ ...snapshot, scheduler: schedulerState() }, { headers: { "Cache-Control": "no-store" } });
}