// GET /api/signals/live - strict rotation scanner with 7 USDT 20x trade setup.
//
// Scans only 4 coins per market (16 total) with continuous rotation, applies
// strict signal conditions (6/8 conditions, 2/4 indicators, HTF confluence,
// score >= 75), and emits the exact 7 USDT 20x trade setup on every signal.
//
// GET /api/signals/live?market=crypto   -> signals for one market.
// GET /api/signals/live?market=all      -> all 4 markets.
//
// Educational analysis only - not financial advice.

import { getRotationSignals } from "@/src/lib/rotationSignals";
import type { ScanMarket } from "@/src/scanner/universe";
import { SIGNAL_TTL_MS } from "@/src/lib/signalCloud";

const MARKET_VALUES: ScanMarket[] = ["crypto", "forex", "stocks", "metals"];


export const maxDuration = 10;

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

  const markets: ScanMarket[] = market === "all" ? MARKET_VALUES : [market];

  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) =>
    setTimeout(() => resolve({ timedOut: true }), 6000)
  );

  const scanPromise = (async () => {
    return await getRotationSignals(origin);
  })();

  const result = await Promise.race([scanPromise, timeoutPromise]);
  const now = Date.now();

  function isFresh(signal: { createdAt?: number }): boolean {
    const createdAt = signal.createdAt ?? 0;
    return createdAt > 0 && now - createdAt <= SIGNAL_TTL_MS;
  }

  const results: Record<string, { createdAt?: number }[]> = {};

  if (result && !("timedOut" in result)) {
    const allSignals: Record<ScanMarket, { createdAt?: number }[]> = result as unknown as Record<ScanMarket, { createdAt?: number }[]>;

    if (market === "all") {
      const merged: { createdAt?: number }[] = [];
      for (const m of markets) {
        const pool = (allSignals[m] ?? []).filter(isFresh);
        for (const s of pool) results[toComparable(m, (s as { symbol: string }).symbol)] = [s];
        merged.push(...pool);
      }
      merged.sort((a, b) => (b as { score: number }).score - (a as { score: number }).score);
      return Response.json(
        {
          generatedAt: new Date().toISOString(),
          targets: { crypto: 4, forex: 4, stocks: 4, metals: 4 },
          results: merged,
          expiresAt: new Date(now + SIGNAL_TTL_MS).toISOString(),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const pool = (allSignals[market] ?? []).filter(isFresh);
    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        market,
        cap: 4,
        results: pool,
        expiresAt: new Date(now + SIGNAL_TTL_MS).toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      market,
      cap: 4,
      results: market === "all" ? [] : results,
      expiresAt: new Date(now + SIGNAL_TTL_MS).toISOString(),
      timedOut: true,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

