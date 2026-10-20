// GET /api/signals/check — returns the setups that score at or above minScore.
// Powers the background notification watcher (95+ only). Educational only.
import { analyzeSymbol, type AutoAnalysis } from "@/src/lib/autoAnalysis";
import { cached } from "@/src/lib/cache";

export const dynamic = "force-dynamic";

/** One setup the watcher can raise an alert for. */
interface AlertSignal {
  id: string;
  symbol: string;
  score: number;
  pattern: string | null;
  candlestick: string | null;
  direction: "bullish" | "bearish" | "neutral";
  entry: number;
  stopLoss: number | null;
  tp1: number | null;
}

/**
 * Curated major coins the watcher scans. Kept deliberately small (12) so one
 * check does not fan out into hundreds of history requests — each analysis
 * itself reads 4 timeframes.
 */
const SYMBOLS = [
  "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD",
  "ADA-USD", "DOGE-USD", "AVAX-USD", "LINK-USD", "DOT-USD",
  "LTC-USD", "TRX-USD",
];

/** One analysis reads 4 timeframes; reuse it for 5 minutes. */
const TTL_MS = 5 * 60 * 1000;

/** Highest-confidence detected candlestick pattern name, or null. */
function bestPattern(analysis: AutoAnalysis): string | null {
  const hits = analysis.patterns ?? [];
  if (hits.length === 0) return null;
  const best = [...hits].sort((a, b) => b.confidence - a.confidence)[0];
  return best?.name ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parseInt(searchParams.get("minScore") ?? "95", 10);
  const minScore = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 95;

  try {
    const analyses = await Promise.all(
      SYMBOLS.map((symbol) =>
        cached(`signals-check:${symbol}`, { ttlMs: TTL_MS }, () => analyzeSymbol(symbol, "crypto")).catch(
          () => null,
        ),
      ),
    );

    const signals: AlertSignal[] = [];
    analyses.forEach((analysis, index) => {
      if (!analysis || analysis.score < minScore) return;
      const symbol = SYMBOLS[index];
      const direction: AlertSignal["direction"] =
        analysis.trend === "bullish" || analysis.trend === "bearish" ? analysis.trend : "neutral";
      const stopLoss = direction === "bearish" ? analysis.resistance : analysis.support;
      const tp1 = direction === "bearish" ? analysis.support : analysis.resistance;
      const pattern = bestPattern(analysis);
      // Stable id so the same setup does not re-alert on every poll: same symbol,
      // direction and ~5-point score bucket counts as the same signal.
      const bucket = Math.round(analysis.score / 5) * 5;
      signals.push({
        id: `${symbol}:${direction}:${bucket}`,
        symbol,
        score: analysis.score,
        pattern,
        candlestick: pattern,
        direction,
        entry: analysis.current,
        stopLoss: stopLoss ?? null,
        tp1: tp1 ?? null,
      });
    });

    signals.sort((a, b) => b.score - a.score);
    return Response.json({ signals, minScore, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
