import type { Candle, TimeframeKey } from "@/src/analysis/types";
import { analyzeMarket, resample, toSnapshot } from "@/src/analysis";
import { buildConfluence, type ConfluenceResult, type TimeframeSnapshot } from "@/src/analysis/confluence";
import { analyzeCorrelation, type BenchmarkSeries } from "@/src/analysis/correlation";
import { runBacktest, walkForward } from "@/src/analysis/backtest";
import { glossary } from "@/src/analysis/language";
import { buildLearningClause, readStore, recordCall } from "@/src/analysis/learning";
import { cacheGet, cacheSet } from "@/src/lib/cache";

const validTimeframes: TimeframeKey[] = ["15m", "1h", "4h", "1d", "1w"];

/** Feature 9 — cache key for a full analyst response. */
const ANALYST_CACHE_TTL_MS = 10 * 60 * 1000;

function analystCacheKey(input: {
  symbol: string;
  market: string;
  primaryTimeframe: string;
  balance: number;
  riskPercent: number;
  winRate: number | null;
  runBacktest: boolean;
  lastCandleTime: number;
  candleCount: number;
}): string {
  return `analyst:${JSON.stringify(input)}`;
}

/** Feature 9 — responses carry this so callers can tell a hit from a miss. */
function withTiming(body: Record<string, unknown>, startedAt: number, source: "cache" | "computed") {
  return Response.json(
    { ...body, source, latencyMs: Date.now() - startedAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function sanitizeCandles(input: unknown): Candle[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((row): Candle[] => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const time = Number(record.time);
    const open = Number(record.open);
    const high = Number(record.high);
    const low = Number(record.low);
    const close = Number(record.close);
    const volume = Number(record.volume ?? 0);
    if (![time, open, high, low, close].every(Number.isFinite)) return [];
    return [{ time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 }];
  }).sort((first, second) => first.time - second.time);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      symbol?: string;
      market?: "crypto" | "forex" | "stocks";
      primaryTimeframe?: TimeframeKey;
      frames?: Record<string, unknown>;
      balance?: number;
      riskPercent?: number;
      winRate?: number | null;
      runBacktest?: boolean;
      refresh?: boolean;
      benchmarks?: Record<string, unknown>;
    };

    const symbol = typeof body.symbol === "string" && body.symbol.trim() ? body.symbol.trim() : "Asset";
    const market = body.market === "forex" || body.market === "stocks" ? body.market : "crypto";
    const primaryTimeframe = body.primaryTimeframe && validTimeframes.includes(body.primaryTimeframe) ? body.primaryTimeframe : "1h";
    const balance = Number.isFinite(body.balance) ? Math.max(0, Number(body.balance)) : 10000;
    const riskPercent = Number.isFinite(body.riskPercent) ? Math.min(100, Math.max(0.1, Number(body.riskPercent))) : 1;
    const winRate = typeof body.winRate === "number" && body.winRate > 0 && body.winRate < 1 ? body.winRate : null;

    const frames: Partial<Record<TimeframeKey, Candle[]>> = {};
    if (body.frames && typeof body.frames === "object") {
      for (const key of validTimeframes) {
        const candles = sanitizeCandles((body.frames as Record<string, unknown>)[key]);
        if (candles.length >= 30) frames[key] = candles;
      }
    }

    let primaryCandles = frames[primaryTimeframe] ?? [];
    if (primaryCandles.length < 30) {
      const daily = frames["1d"] ?? frames["4h"] ?? frames["1h"] ?? frames["15m"];
      if (daily && daily.length >= 30) primaryCandles = primaryTimeframe === "1w" ? resample(daily, 7 * 24 * 60 * 60) : daily;
    }

    if (primaryCandles.length < 30) {
      return Response.json({ error: "At least 30 candles are required for a reliable analysis." }, { status: 400 });
    }

    // Feature 9 — return a pre-computed result when the inputs are unchanged.
    // The key includes the last candle time, so a new candle naturally misses.
    const startedAt = Date.now();
    const cacheKey = analystCacheKey({
      symbol,
      market,
      primaryTimeframe,
      balance,
      riskPercent,
      winRate,
      runBacktest: Boolean(body.runBacktest),
      lastCandleTime: primaryCandles[primaryCandles.length - 1].time,
      candleCount: primaryCandles.length,
    });
    if (body.refresh !== true) {
      const hit = cacheGet<Record<string, unknown>>(cacheKey);
      if (hit) return withTiming(hit, startedAt, "cache");
    }

    const analysis = analyzeMarket({ symbol, market, timeframe: primaryTimeframe, candles: primaryCandles, balance, riskPercent, winRate });

    if (body.benchmarks && typeof body.benchmarks === "object") {
      const series: BenchmarkSeries[] = [];
      for (const [key, value] of Object.entries(body.benchmarks)) {
        const benchmarkCandles = sanitizeCandles(value);
        if (benchmarkCandles.length >= 15) series.push({ key, candles: benchmarkCandles });
      }
      if (series.length > 0) analysis.correlation = analyzeCorrelation(primaryCandles, series);
    }

    // Part 4 — persist this call and resolve older ones against the latest
    // price. Failures are swallowed inside the store, so analysis still returns.
    const learning = await recordCall({
      symbol,
      direction: analysis.setup.direction,
      confidence: analysis.confidence,
      price: analysis.price,
    });
    const learningClause = buildLearningClause(await readStore());

    const snapshots: TimeframeSnapshot[] = [];
    for (const key of validTimeframes) {
      const candles = frames[key] ?? (key === primaryTimeframe ? primaryCandles : null);
      if (!candles || candles.length < 30) continue;
      snapshots.push(toSnapshot(analyzeMarket({ symbol, market, timeframe: key, candles, balance, riskPercent, winRate }), key));
    }
    const confluence: ConfluenceResult = buildConfluence(snapshots);
    if (confluence.frames.length > 0 && analysis.whatToDo) {
      const aligned = confluence.aligned;
      for (const language of Object.keys(analysis.whatToDo) as (keyof typeof analysis.whatToDo)[]) {
        analysis.whatToDo[language] = analysis.whatToDo[language].map((step) =>
          step.step === 1
            ? { ...step, detail: `${step.detail} ${aligned ? "Higher and lower timeframes agree." : "Timeframes are not fully aligned."}` }
            : step);
      }
    }

    const backtest = body.runBacktest ? runBacktest(primaryCandles, { riskPercent }) : null;
    const forward = body.runBacktest ? walkForward(primaryCandles, { riskPercent }) : null;

    const payload = {
      analysis,
      confluence,
      glossary,
      backtest,
      forward,
      learning,
      learningClause,
      generatedAt: new Date().toISOString(),
    };
    cacheSet(cacheKey, payload, { ttlMs: ANALYST_CACHE_TTL_MS, maxEntries: 120 });
    return withTiming(payload, startedAt, "computed");
  } catch (error) {
    console.error("Error in analyst API:", error);
    return Response.json({ error: "Unable to build the master analysis." }, { status: 502 });
  }
}
