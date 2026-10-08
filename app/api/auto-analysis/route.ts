// Rule-based auto analysis endpoint. Educational only. Not financial advice.
import { analyzeSymbol } from "@/src/lib/autoAnalysis";
import { cached } from "@/src/lib/cache";

export const dynamic = "force-dynamic";

/** One analysis reads 4 timeframes; reuse the result for 5 minutes. */
const TTL_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const market = searchParams.get("market");

  if (!symbol || !market) {
    return Response.json(
      { error: "Both symbol and market query params are required. Example: ?symbol=BTC-USD&market=crypto" },
      { status: 400 },
    );
  }

  const normalized = symbol.toUpperCase();
  try {
    const analysis = await cached(
      `auto-analysis:${market}:${normalized}`,
      { ttlMs: TTL_MS },
      () => analyzeSymbol(normalized, market),
    );
    return Response.json(analysis, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Analysis could not be generated right now." }, { status: 500 });
  }
}
