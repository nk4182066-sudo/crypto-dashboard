"use client";

// Trade chart page. Clean like /markets: symbol + price header, timeframe
// buttons, a full-width chart with auto-drawn patterns (blue), support/
// resistance (green/red dashed), buy-point arrows and Entry/SL/TP zones, then
// an AI Analysis box below. Educational only. Not financial advice.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TradingChart, { type ChartArrowMarker, type ChartLevel } from "@/components/TradingChart";
import { scanChartPatterns } from "@/src/lib/chart/chartPatterns";
import { zigZag } from "@/src/analysis/structure";
import { getChartAnalysis, type ChartAnalysis } from "@/src/lib/autoChartAnalysis";
import { normalizeSymbol } from "@/src/lib/chart/symbol";
import { recordHighConfluenceSetup } from "@/src/lib/signalHistory";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F6465D";
const BLUE = "#3b82f6";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

/** Poll cadence per timeframe — fast ones refresh often, slow ones rarely. */
function refreshMsFor(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1m":
    case "5m": return 5000;   // 5s
    case "15m":
    case "1h": return 30000;  // 30s
    case "4h":
    case "1d": return 60000;  // 60s
    default: return 30000;
  }
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p === 0) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

/** Pulls one timeframe of candles; empty array on any failure. */
async function fetchCandles(symbol: string, market: string, timeframe: string): Promise<Candle[]> {
  try {
    const query = new URLSearchParams({ market, symbol, timeframe });
    const response = await fetch(`/api/market/history?${query}`, { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as { candles?: Candle[] };
    return Array.isArray(payload.candles) ? payload.candles : [];
  } catch {
    return [];
  }
}

/** Latest quote (price + previous close) for the header change badge. */
async function fetchQuote(symbol: string, market: string): Promise<{ price: number; previousClose: number } | null> {
  try {
    const query = new URLSearchParams({ market, symbol, timeframe: "1h", quoteOnly: "1" });
    const response = await fetch(`/api/market/history?${query}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { quote?: { price?: number | null; previousClose?: number | null } };
    const price = payload.quote?.price ?? null;
    if (price == null) return null;
    return { price, previousClose: payload.quote?.previousClose ?? price };
  } catch {
    return null;
  }
}
/**
 * Merge freshly polled candles into the current series: update the last candle
 * in place (live close/high/low tick) and append genuinely new candles. Keeps
 * historical candles untouched so the chart doesn't jump around.
 */
function mergeLiveCandles(prev: Candle[], incoming: Candle[]): Candle[] {
  if (incoming.length === 0) return prev;
  const byTime = new Map(prev.map((c) => [c.time, c]));
  for (const candle of incoming) byTime.set(candle.time, candle);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}


function TradeChart() {
  const params = useSearchParams();
  const rawSymbol = params.get("symbol") ?? "BTC-USD";
  const market = params.get("market") ?? "crypto";
  const symbol = useMemo(
    () => normalizeSymbol(rawSymbol, market === "stocks" ? "stocks" : "") || rawSymbol,
    [rawSymbol, market]
  );

  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<ChartAnalysis | null>(null);
  const [quote, setQuote] = useState<{ price: number; previousClose: number } | null>(null);

  // Candles for the selected timeframe (drives the chart + pattern scan).
  // Initial full load, then live polling that updates the last candle in place
  // and appends new ones — no full reset, so the chart keeps its position.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchCandles(symbol, market, timeframe).then((rows) => {
      if (cancelled) return;
      setCandles(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, market, timeframe]);

  // Real-time refresh: poll Binance/Yahoo on a timeframe-wise cadence and merge.
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchCandles(symbol, market, timeframe).then((rows) => {
        if (rows.length === 0) return; // ignore empty/error polls, keep last state
        setCandles((prev) => mergeLiveCandles(prev, rows));
      });
    }, refreshMsFor(timeframe));
    return () => clearInterval(interval);
  }, [symbol, market, timeframe]);

  // Rule-based analysis (score, trend, support/resistance, verdict) + header quote.
  useEffect(() => {
    let cancelled = false;
    void getChartAnalysis(symbol, market)
      .then((result) => {
        if (!cancelled) setAnalysis(result);
        // Task 4: persist high-confluence setups (score 80+) to localStorage
        // so /results can track their outcome. De-duped by symbol+market inside.
        if (result && result.score >= 80) {
          recordHighConfluenceSetup({
            symbol: result.symbol,
            market: result.market,
            score: result.score,
            direction: result.direction,
            entryPrice: result.currentPrice,
            targetPrice:
              result.direction === "bearish" ? result.support : result.resistance || result.currentPrice,
            support: result.support,
            resistance: result.resistance,
            pattern: result.patterns[0]?.name ?? "No clear pattern",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setAnalysis(null);
      });
    void fetchQuote(symbol, market).then((result) => {
      if (!cancelled) setQuote(result);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, market]);

  // Detected chart patterns -> a blue dashed swing outline drawn on the chart.
  const patternHits = useMemo(
    () => (candles.length >= 40 ? scanChartPatterns(candles) : []),
    [candles]
  );
  const patternOutlines = useMemo(() => {
    const top = [...patternHits].sort((a, b) => b.confidence - a.confidence)[0];
    if (!top) return [];
    const pivots = zigZag(candles.slice(-150), 3);
    const points = pivots.slice(-6).map((p) => ({ time: p.time, price: p.price }));
    if (points.length < 2) return [];
    return [{ name: top.pattern, points, color: BLUE }];
  }, [patternHits, candles]);

  // Support / resistance as green / red dashed lines.
  const srLevels: ChartLevel[] = useMemo(() => {
    if (!analysis) return [];
    const levels: ChartLevel[] = [];
    if (analysis.support > 0) levels.push({ kind: "support", price: analysis.support, label: "Support", lineStyle: "dashed" });
    if (analysis.resistance > 0) levels.push({ kind: "resistance", price: analysis.resistance, label: "Resistance", lineStyle: "dashed" });
    return levels;
  }, [analysis]);

  // Entry / SL / TP zones + buy-point arrow only when there is a directional posture.
  const { planLevels, arrowMarkers } = useMemo(() => {
    const empty: { planLevels: ChartLevel[]; arrowMarkers: ChartArrowMarker[] } = { planLevels: [], arrowMarkers: [] };
    if (!analysis || candles.length === 0) return empty;
    const actionable = analysis.tradeStatus !== "NO_SETUP" && analysis.direction !== "neutral";
    if (!actionable) return empty;

    const bullish = analysis.direction === "bullish";
    const last = candles[candles.length - 1];
    const entry = analysis.currentPrice || last.close;
    const stopLoss = bullish ? analysis.support : analysis.resistance;
    const takeProfit = bullish ? analysis.resistance : analysis.support;
    const levels: ChartLevel[] = [{ kind: "entry", price: entry, label: "Entry" }];
    if (stopLoss > 0) levels.push({ kind: "stopLoss", price: stopLoss, label: "SL" });
    if (takeProfit > 0) levels.push({ kind: "takeProfit", price: takeProfit, label: "TP" });

    const markers: ChartArrowMarker[] = [{
      time: last.time,
      position: bullish ? "belowBar" : "aboveBar",
      color: bullish ? GREEN : RED,
      shape: bullish ? "arrowUp" : "arrowDown",
      text: "BP",
    }];

    return { planLevels: levels, arrowMarkers: markers };
  }, [analysis, candles]);

  const levels = useMemo(() => [...srLevels, ...planLevels], [srLevels, planLevels]);

  // ---- Header numbers ------------------------------------------------------
  const headerPrice = quote?.price ?? analysis?.currentPrice ?? candles[candles.length - 1]?.close ?? 0;
  const prevClose = quote?.previousClose ?? 0;
  const changePct = prevClose > 0 ? ((headerPrice - prevClose) / prevClose) * 100 : 0;
  const up = changePct >= 0;

  // ---- AI Analysis box data -----------------------------------------------
  const topPattern = patternHits[0]?.pattern ?? analysis?.patterns[0]?.name ?? "No clear pattern";
  const score = analysis?.score ?? 0;
  const trendLabel = analysis?.direction === "bullish" ? "Bullish" : analysis?.direction === "bearish" ? "Bearish" : "Sideways";
  const support = analysis?.support ?? 0;
  const resistance = analysis?.resistance ?? 0;
  // Breakout watch level: an intermediate price between current and the target.
  const breakoutTarget = analysis ? (analysis.direction === "bearish" ? support : resistance) : 0;
  const breakout =
    analysis && breakoutTarget > 0 && analysis.currentPrice > 0
      ? analysis.currentPrice + (breakoutTarget - analysis.currentPrice) * 0.6
      : 0;
  const verdict =
    analysis?.tradeStatus === "SETUP_FORMING"
      ? "SETUP FORMING"
      : analysis?.tradeStatus === "WATCH"
        ? "WATCH ZONE"
        : "NO SETUP";
  const verdictColor =
    analysis?.tradeStatus === "SETUP_FORMING" ? GREEN : analysis?.tradeStatus === "WATCH" ? "#f0b90b" : MUTED;

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      {/* Symbol + price header */}
      <div className="mb-3 flex items-center justify-between rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <div className="flex flex-col">
          <span className="text-lg font-bold" style={{ color: TEXT }}>{symbol}</span>
          <span className="text-xs" style={{ color: MUTED }}>Timeframe: {timeframe}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xl font-bold" style={{ color: TEXT }}>${fmtPrice(headerPrice)}</span>
          {quote && (
            <span
              className="mt-0.5 rounded px-1.5 py-0.5 text-xs font-semibold"
              style={{
                color: up ? GREEN : RED,
                backgroundColor: up ? "rgba(0,192,135,0.12)" : "rgba(246,70,93,0.12)",
              }}
            >
              {up ? "+" : ""}{changePct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Timeframe buttons */}
      <div className="mb-3 flex flex-wrap gap-2">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            aria-pressed={timeframe === tf}
            className="rounded-lg px-3 py-1 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: timeframe === tf ? "#00C087" : "#181A20",
              color: timeframe === tf ? "#000000" : "#9CA3AF",
            }}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Main chart — full width, mobile friendly */}
      <div className="h-[420px] w-full overflow-hidden rounded-2xl border sm:h-[520px]" style={{ backgroundColor: BG, borderColor: BORDER }}>
        {loading ? (
          <p className="px-4 py-6 text-sm" style={{ color: MUTED }}>Loading chart...</p>
        ) : candles.length === 0 ? (
          <p className="px-4 py-6 text-sm" style={{ color: MUTED }}>No chart data available.</p>
        ) : (
          <TradingChart
            data={candles}
            chartKey={`${symbol}:${timeframe}`}
            levels={levels}
            patternOutlines={patternOutlines}
            arrowMarkers={arrowMarkers}
            market={market}
            autoAnalyze={false}
            height={420}
          />
        )}
      </div>

      {/* AI Analysis box below the chart */}
      <section aria-label="AI analysis" className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <h2 className="mb-3 text-sm font-bold" style={{ color: TEXT }}>📊 AI ANALYSIS</h2>
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Pattern" value={topPattern} />
          <Row label="Score" value={`${score}/100`} />
          <Row label="Trend" value={trendLabel} valueColor={trendLabel === "Bullish" ? GREEN : trendLabel === "Bearish" ? RED : MUTED} />
          <Row label="Support" value={support > 0 ? `$${fmtPrice(support)}` : "—"} valueColor={GREEN} />
          <Row label="Resistance" value={resistance > 0 ? `$${fmtPrice(resistance)}` : "—"} valueColor={RED} />
          <Row label="Breakout" value={breakout > 0 ? `$${fmtPrice(breakout)}` : "—"} />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: MUTED }}>Verdict</span>
            <span className="text-sm font-bold" style={{ color: verdictColor }}>{verdict}</span>
          </div>
        </div>
        <p className="mt-3 text-xs" style={{ color: MUTED }}>⚠️ Educational only. Not financial advice.</p>
      </section>

      <footer className="mt-4 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational only. Not financial advice.
      </footer>
    </main>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold" style={{ color: MUTED }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: valueColor ?? TEXT }}>{value}</span>
    </div>
  );
}

export default function TradePage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-4 py-4 text-sm text-[#9CA3AF]">Loading...</main>}>
      <TradeChart />
    </Suspense>
  );
}

