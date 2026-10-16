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

// ONE entry per MARKET — scanUniverse holds one row per SYMBOL (120 today), so
// mapping it straight to markets produced ["crypto","crypto",…"metals",…] and
// `market=all` fired refresh() + getLiveSignals() 120 TIMES per request (82
// before the pool expansion): ~120 Firestore reads + 120 strict passes → the
// route routinely blew its serverless duration and the Signals page showed
// "loading" forever. Dedupe to the 4 real markets.
const MARKET_VALUES: ScanMarket[] = [...new Set(scanUniverse.map((s) => s.market))];

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
  const origin = new URL(request.url).origin;

  // Always refresh before responding so the pool is populated and settled.
  // Markets run in PARALLEL — each is an independent I/O chain (scan + history
  // fetches), and serialising them on a cold instance used to risk blowing the
  // serverless duration before a single signal was returned.
  try {
    if (market === "all") {
      await Promise.all(MARKET_VALUES.map((m) => refresh(m, origin)));
    } else {
      await refresh(market, origin);
    }
  } catch (error) {
    console.warn(`[signals/live] background refresh failed:`, error instanceof Error ? error.message : error);
  }

  const results: Record<string, EmittedMarketSignal[]> = {};

  if (market === "all") {
    const merged: EmittedMarketSignal[] = [];
    const pools = await Promise.all(MARKET_VALUES.map((m) => getLiveSignals(m, origin)));
    MARKET_VALUES.forEach((m, index) => {
      for (const signal of pools[index] ?? []) results[toComparable(m, signal.symbol)] = [signal];
      merged.push(...(pools[index] ?? []));
    });
    merged.sort((a, b) => b.score - a.score || a.market.localeCompare(b.market) || (a.symbol < b.symbol ? -1 : 1));
    return Response.json({ generatedAt: new Date().toISOString(), targets: LIVE_CAPS, results: merged }, { headers: { "Cache-Control": "no-store" } });
  }

  const pool = await getLiveSignals(market, origin);
  const cap = LIVE_CAPS[market as ScanMarket];
  return Response.json({ generatedAt: new Date().toISOString(), market, cap, results: pool }, { headers: { "Cache-Control": "no-store" } });
}
