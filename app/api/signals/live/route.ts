// GET /api/signals/live — the authoritative 40-signal LIVE POOL.
//
// Guarantees exactly 40 live signals (10 per market: Crypto / Forex / Metals /
// Stocks), selected by the strict tier gate (PREMIUM 8/8 or STRONG 7/8,
// 3/4 experts, score >= 85) and scored by the shared analyzeCoin() engine. Every signal carries the
// full trade plan (entries, SL, TP1-3, support/resistance, R:R, chart pattern +
// candlestick, 4-expert consensus) so the Signals page can render the exact
// card. Stored PENDING setups from Firestore are always merged in first, so
// the page can never render "0 setups" while pending signals exist.
//
// GET /api/signals/live?market=crypto   → 10 signals for one market.
// GET /api/signals/live?market=all      → all 40 (or fewer if a market has
//                                         fewer than its cap).
// refresh() runs first so the pool is always populated
// (auto-refill on loss/expiry is handled by the track-signals cron).
//
// Educational analysis only — not financial advice.

import { refresh, getLiveSignals, LIVE_CAPS, type EmittedMarketSignal, type ScanMarket } from "@/src/lib/signalsLive";
import { SIGNAL_TTL_MS } from "@/src/lib/signalCloud";
import { scanUniverse } from "@/src/scanner/universe";

// ONE entry per MARKET — scanUniverse holds one row per SYMBOL (120 today), so
// mapping it straight to markets produced ["crypto","crypto",…"metals",…] and
// `market=all` fired refresh() + getLiveSignals() 120 TIMES per request (82
// before the pool expansion): ~120 Firestore reads + 120 strict passes → the
// route routinely blew its serverless duration and the Signals page showed
// "loading" forever. Dedupe to the 4 real markets.
const MARKET_VALUES: ScanMarket[] = [...new Set(scanUniverse.map((s) => s.market))];

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toMarket(market: string | null | undefined): ScanMarket | "all" {
  if (!market) return "all";
  const normalized = String(market).toLowerCase() as ScanMarket;
  return MARKET_VALUES.includes(normalized) ? normalized : "all";
}

function toComparable(market: string, symbol: string): string {
  return `${market}|${symbol}`.toUpperCase();
}

export async function GET(request: Request) {
  console.log('LIVE API HIT: market=', new URL(request.url).searchParams.get('market'), 'Time:', new Date().toISOString());
  const { searchParams } = new URL(request.url);
  const market = toMarket(searchParams.get("market"));
  const origin = new URL(request.url).origin;

  // ONE pass per market — refresh() reads the stored PENDING docs, merges the
  // fresh strict candidates in (auto-refill) and RETURNS the capped pool. That
  // return value IS the response: the old flow awaited refresh() but threw its
  // pool away, then re-querued the strict-only getLiveSignals() — so a
  // strict-empty pass answered `results: []` even while PENDING setups sat in
  // Firestore (the "0 setups" page). Markets run in PARALLEL — each is an
  // independent I/O chain (scan + history fetches), and serialising them on a
  // cold instance used to risk blowing the serverless duration.
  const markets: ScanMarket[] = market === "all" ? MARKET_VALUES : [market];
  const pools = await Promise.all(
    markets.map(async (active): Promise<EmittedMarketSignal[]> => {
      try {
        return await refresh(active, origin);
      } catch (error) {
        console.warn(`[signals/live] refresh failed for ${active}:`, error instanceof Error ? error.message : error);
      }
      // Defensive fallback — strict-only pool (never persists, never throws).
      try {
        return await getLiveSignals(active, origin);
      } catch (error) {
        console.warn(`[signals/live] strict fallback failed for ${active}:`, error instanceof Error ? error.message : error);
        return [];
      }
    }),
  );

  const results: Record<string, EmittedMarketSignal[]> = {};

  // STRICT 24H EXPIRY FILTER — only signals created within last 24 hours are
  // returned. Older signals are silently dropped so the UI can never show stale
  // setups that failed to resolve to WIN/LOSS/EXPIRED.
  const now = Date.now();
  function isFresh(signal: EmittedMarketSignal): boolean {
    const createdAt = signal.createdAt ?? 0;
    return createdAt > 0 && now - createdAt <= SIGNAL_TTL_MS;
  }

  const filteredPools = pools.map((pool) => pool.filter(isFresh));

  console.log('[signals/live] markets:', markets, 'raw pool sizes:', pools.map((p) => p?.length ?? 0), 'fresh sizes:', filteredPools.map((p) => p.length));

  if (market === "all") {
    const merged: EmittedMarketSignal[] = [];
    markets.forEach((active, index) => {
      for (const signal of filteredPools[index] ?? []) results[toComparable(active, signal.symbol)] = [signal];
      merged.push(...(filteredPools[index] ?? []));
    });
    merged.sort((a, b) => b.score - a.score || a.market.localeCompare(b.market) || (a.symbol < b.symbol ? -1 : 1));
    const expiredCount = (pools[0]?.length ?? 0) - (filteredPools[0]?.length ?? 0);
    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        targets: LIVE_CAPS,
        results: merged,
        expiresAt: new Date(now + SIGNAL_TTL_MS).toISOString(),
        expiredFiltered: expiredCount,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const pool = filteredPools[0] ?? [];
  const cap = LIVE_CAPS[market as ScanMarket];
  const expiredCount = (pools[0]?.length ?? 0) - (pool.length);
  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      market,
      cap,
      results: pool,
      expiresAt: new Date(now + SIGNAL_TTL_MS).toISOString(),
      expiredFiltered: expiredCount,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
