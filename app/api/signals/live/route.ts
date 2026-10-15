// GET /api/signals/live — the authoritative 20-signal LIVE POOL.
//
// Guarantees exactly 20 live signals (Crypto 7 / Forex 7 / Metals 4 / Stocks 2)
// by category, selected by the STRICT 8/8 + 4/4 gate and scored by the shared
// analyzeCoin() engine. Every signal carries the full trade plan (entries,
// SL, TP1-3, support/resistance, R:R, chart pattern + candlestick, 4-expert
// consensus) so the Signals page can render the exact card.
//
// GET /api/signals/live?market=crypto   → 7 signals for one market.
// GET /api/signals/live?market=all      → all 20 (or fewer if a market has
//                                         fewer than its cap).
// Trigger a background refresh first so the pool is always populated
// (auto-refill on loss/expiry is handled by the track-signals cron).
//
// Educational analysis only — not financial advice.

import { refresh, getLiveSignals, LIVE_CAPS, type EmittedMarketSignal, type ScanMarket } from "@/src/lib/signalsLive";
import { scanUniverse } from "@/src/scanner/universe";

const MARKET_VALUES: ScanMarket[] = scanUniverse.map((s) => s.market);

export const dynamic = "force-dynamic";

function toMarket(market: string | null | undefined): ScanMarket | "all" {
  if (!market) return "all";
  const normalized = String(market).toLowerCase() as ScanMarket;
  return MARKET_VALUES.includes(normalized) ? normalized : "all";
}

function toComparable(market: string, symbol: string): string {
  return `${market}|${symbol}`.toUpperCase();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = toMarket(searchParams.get("market"));

  // Always refresh before responding so the pool is populated and settled.
  try {
    if (market === "all") {
      for (const m of MARKET_VALUES) await refresh(m);
    } else {
      await refresh(market);
    }
  } catch (error) {
    console.warn(`[signals/live] background refresh failed:`, error instanceof Error ? error.message : error);
  }

  const results: Record<string, EmittedMarketSignal[]> = {};

  if (market === "all") {
    const merged: EmittedMarketSignal[] = [];
    for (const m of MARKET_VALUES) {
      const pool = await getLiveSignals(m);
      for (const signal of pool) results[toComparable(m, signal.symbol)] = [signal];
      merged.push(...pool);
    }
    merged.sort((a, b) => b.score - a.score || a.market.localeCompare(b.market) || (a.symbol < b.symbol ? -1 : 1));
    return Response.json({ generatedAt: new Date().toISOString(), targets: LIVE_CAPS, results: merged }, { headers: { "Cache-Control": "no-store" } });
  }

  const pool = await getLiveSignals(market);
  const cap = LIVE_CAPS[market as ScanMarket];
  return Response.json({ generatedAt: new Date().toISOString(), market, cap, results: pool }, { headers: { "Cache-Control": "no-store" } });
}
