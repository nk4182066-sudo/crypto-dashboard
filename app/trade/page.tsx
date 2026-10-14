"use client";

// Trade chart page. Clean like /markets: symbol + price header, timeframe
// buttons, a full-width chart with auto-drawn patterns (blue), support/
// resistance (green/red dashed), buy-point arrows and Entry/SL/TP zones, then
// an AI Analysis box below. Educational only. Not financial advice.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import TradingChart, { type ChartArrowMarker, type ChartLevel } from "@/components/TradingChart";
import { buildLeverageLevels } from "@/src/lib/signalGenerator";
import { scanChartPatterns } from "@/src/lib/chart/chartPatterns";
import { zigZag } from "@/src/analysis/structure";
import { getChartAnalysis, type ChartAnalysis } from "@/src/lib/autoChartAnalysis";
import { analyzeCoin, type AnalyzeResult } from "@/src/lib/analyzeCoin";
import { normalizeSymbol } from "@/src/lib/chart/symbol";
import { recordHighConfluenceSetup } from "@/src/lib/signalHistory";
import { buildConfirmations, buildEducators, buildGuidance } from "@/src/lib/confirmations";
import { TrendBadge, ConfirmationSection, ExpertPanel, GuidanceSection } from "@/components/AnalysisInsights";

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
  const leverage = Number(params.get("leverage")) > 1 ? Number(params.get("leverage")) : 1;
  // The history/analysis APIs only serve crypto prices through the Binance
  // branch (market === "crypto"). Futures are the same underlying USDT pairs,
  // so we read candles/quotes/analysis as crypto but keep `market` for display.
  const dataMarket = market === "futures" ? "crypto" : market;
  const symbol = useMemo(
    () => normalizeSymbol(rawSymbol, market === "stocks" ? "stocks" : "") || rawSymbol,
    [rawSymbol, market]
  );

  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [candles, setCandles] = useState<Candle[]>([]);
  // MASLA 1/2 — fixed 1h/4h/1d series for the shared analyzeCoin() trend
  // condition ("Trend aligned 1h + 4h + 1d"). Fetched once per symbol,
  // independent of the selected chart timeframe.
  const [multiTf, setMultiTf] = useState<{ h1: Candle[]; h4: Candle[]; d1: Candle[] }>({ h1: [], h4: [], d1: [] });
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<ChartAnalysis | null>(null);
  const [quote, setQuote] = useState<{ price: number; previousClose: number } | null>(null);

  // Fullscreen chart container + toggle.
  const chartRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // On-chart overlay toggles (all ON by default). Each gates one visual layer
  // so the user can declutter the chart without losing the analysis box below.
  const [layers, setLayers] = useState({
    pattern: true,
    trend: true,
    levels: true,
    experts: true,
    indicators: true,
  });
  const toggleLayer = (key: keyof typeof layers) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void chartRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.();
    }
  };

  // Track the browser fullscreen state so the layout + button icon stay in sync.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Candles for the selected timeframe (drives the chart + pattern scan).
  // Initial full load, then live polling that updates the last candle in place
  // and appends new ones — no full reset, so the chart keeps its position.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchCandles(symbol, dataMarket, timeframe).then((rows) => {
      if (cancelled) return;
      setCandles(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, dataMarket, timeframe]);

  // MASLA 1 — the 1h/4h/1d series analyzeCoin() needs for the multi-timeframe
  // trend condition. Same endpoint, same candles the Signals route reads, so
  // both pages always agree on the trend (and therefore the score).
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchCandles(symbol, dataMarket, "1h"),
      fetchCandles(symbol, dataMarket, "4h"),
      fetchCandles(symbol, dataMarket, "1d"),
    ]).then(([h1, h4, d1]) => {
      if (!cancelled) setMultiTf({ h1, h4, d1 });
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, dataMarket]);

  // Real-time refresh: poll Binance/Yahoo on a timeframe-wise cadence and merge.
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchCandles(symbol, dataMarket, timeframe).then((rows) => {
        if (rows.length === 0) return; // ignore empty/error polls, keep last state
        setCandles((prev) => mergeLiveCandles(prev, rows));
      });
    }, refreshMsFor(timeframe));
    return () => clearInterval(interval);
  }, [symbol, dataMarket, timeframe]);

  // Rule-based analysis (score, trend, support/resistance, verdict) + header quote.
  useEffect(() => {
    let cancelled = false;
    void getChartAnalysis(symbol, dataMarket)
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
    void fetchQuote(symbol, dataMarket).then((result) => {
      if (!cancelled) setQuote(result);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, dataMarket]);

  // Detected chart patterns -> a blue dashed swing outline drawn on the chart.
  const patternHits = useMemo(
    () => (candles.length >= 40 ? scanChartPatterns(candles) : []),
    [candles]
  );

  // MASLA 4 — SINGLE shared score. analyseCoin runs the strict 8-condition
  // engine (the SAME one the Signals page scores from) on the chart candles, so
  // the Trade page ALGO score can NEVER disagree with the Signals page ALGO.
  // score = (conditions_passed / 8) * 100 → 8/8=100, 7/8=88, 6/8=75, <6 hidden.
  const coinAnalysis: AnalyzeResult | null = useMemo(
    () =>
      candles.length >= 20
        ? analyzeCoin({
            symbol,
            market: dataMarket,
            primary: candles,
            // Trend condition = 1h + 4h + 1d (MASLA 2 #3). The chart's own
            // series wins on its timeframe; the Signals route passes the same
            // 1h history candles as primary+h1, so at the default 1h view both
            // pages compute an identical score for the same coin.
            h1: timeframe === "1h" ? candles : multiTf.h1,
            h4: timeframe === "4h" ? candles : multiTf.h4,
            d1: timeframe === "1d" ? candles : multiTf.d1,
          })
        : null,
    [candles, symbol, dataMarket, timeframe, multiTf],
  );
  const patternOutlines = useMemo(() => {
    const top = [...patternHits].sort((a, b) => b.confidence - a.confidence)[0];
    if (!top) return [];
    const pivots = zigZag(candles.slice(-150), 3);
    const points = pivots.slice(-6).map((p) => ({ time: p.time, price: p.price }));
    if (points.length < 2) return [];
    // Green for bullish patterns, red for bearish, neutral amber otherwise.
    const color = top.type === "bullish" ? GREEN : top.type === "bearish" ? RED : "#f0b90b";
    return [{ name: top.pattern, points, color }];
  }, [patternHits, candles]);

  // Support / resistance as green / red dashed lines.
  const srLevels: ChartLevel[] = useMemo(() => {
    if (!analysis) return [];
    const levels: ChartLevel[] = [];
    if (analysis.support > 0) levels.push({ kind: "support", price: analysis.support, label: `Support $${fmtPrice(analysis.support)}`, lineStyle: "dashed" });
    if (analysis.resistance > 0) levels.push({ kind: "resistance", price: analysis.resistance, label: `Resistance $${fmtPrice(analysis.resistance)}`, lineStyle: "dashed" });
    return levels;
  }, [analysis]);

  // Leverage-aware Entry / SL / TP1-2-3 lines + entry arrow.
  // Spec: SL = 3% price move (≈30% margin loss @leverage), TP1/2/3 = 10/20/30%
  // price moves (≈100/200/300% margin profit @leverage), R:R ≥ 1:3.33.
  // Direction-correct: bullish → SL below entry, targets above; bearish reversed.
  const { planLevels, arrowMarkers } = useMemo(() => {
    const empty: { planLevels: ChartLevel[]; arrowMarkers: ChartArrowMarker[] } = { planLevels: [], arrowMarkers: [] };
    if (!analysis || candles.length === 0) return empty;
    const actionable = analysis.tradeStatus !== "NO_SETUP" && analysis.direction !== "neutral";
    if (!actionable) return empty;

    const bullish = analysis.direction === "bullish";
    const last = candles[candles.length - 1];
    const entry = analysis.currentPrice || last.close;
    const lev = leverage > 0 ? leverage : 10;
    const plan = buildLeverageLevels(entry, bullish ? "bullish" : "bearish", lev);

    // Distinct green shades for TP1 (light) → TP3 (deep).
    const tpColors = ["#4ade80", "#22c55e", "#15803d"];
    const levels: ChartLevel[] = [
      { kind: "entry", price: plan.entry, label: `Entry $${fmtPrice(plan.entry)}`, lineStyle: "solid" },
      { kind: "stopLoss", price: plan.stopLoss, label: `SL $${fmtPrice(plan.stopLoss)} (-${plan.slLossPercent}%)` },
      { kind: "takeProfit", price: plan.tp1, color: tpColors[0], label: `TP1 $${fmtPrice(plan.tp1)} (+${plan.tp1ProfitPercent}%)` },
      { kind: "takeProfit", price: plan.tp2, color: tpColors[1], label: `TP2 $${fmtPrice(plan.tp2)} (+${plan.tp2ProfitPercent}%)` },
      { kind: "takeProfit", price: plan.tp3, color: tpColors[2], label: `TP3 $${fmtPrice(plan.tp3)} (+${plan.tp3ProfitPercent}%)` },
    ];

    const markers: ChartArrowMarker[] = [{
      time: last.time,
      position: bullish ? "belowBar" : "aboveBar",
      color: bullish ? GREEN : RED,
      shape: bullish ? "arrowUp" : "arrowDown",
      text: bullish ? "Entry here" : "Exit here",
    }];

    return { planLevels: levels, arrowMarkers: markers };
  }, [analysis, candles, leverage]);

  // Gated by the on-chart toggles: Levels controls S/R + Entry/SL/TP lines,
  // Pattern the outline, and arrows follow Levels.
  const levels = useMemo(
    () => [...(layers.levels ? srLevels : []), ...(layers.levels ? planLevels : [])],
    [srLevels, planLevels, layers.levels]
  );
  const visibleArrowMarkers = layers.levels ? arrowMarkers : [];
  const visiblePatternOutlines = layers.pattern ? patternOutlines : [];

  // Trend line through the recent swing pivots that follow the dominant
  // direction: higher-highs/higher-lows for bullish, the mirror for bearish.
  // Gated by the Trend toggle. Direction is derived from `analysis` (not the
  // later `trendLabel`) to avoid a temporal-dead-zone reference.
  const trendline = useMemo(() => {
    const dir = analysis?.direction;
    if (!layers.trend || dir !== "bullish" && dir !== "bearish") return [];
    const pivots = zigZag(candles.slice(-150), 3);
    if (pivots.length < 2) return [];
    const wantHigh = dir === "bullish";
    // Follow the pivots that build the structure in the trend's direction.
    const chosen = pivots.filter((p) => (wantHigh ? p.kind === "high" : p.kind === "low")).slice(-4);
    const points = (chosen.length >= 2 ? chosen : pivots.slice(-4)).map((p) => ({ time: p.time, price: p.price }));
    return points;
  }, [candles, layers.trend, analysis]);

  // ---- Header numbers ------------------------------------------------------
  const headerPrice = quote?.price ?? analysis?.currentPrice ?? candles[candles.length - 1]?.close ?? 0;
  const prevClose = quote?.previousClose ?? 0;
  const changePct = prevClose > 0 ? ((headerPrice - prevClose) / prevClose) * 100 : 0;
  const up = changePct >= 0;

  // ---- AI Analysis box data -----------------------------------------------
  // MASLA 1 — the displayed pattern comes from the SHARED analyzeCoin() engine
  // first, so the Trade "Pattern" row equals the Signals card pattern for the
  // same coin (chart-outline detection below stays a visual layer only).
  const topPattern = coinAnalysis?.chartPattern ?? patternHits[0]?.pattern ?? analysis?.patterns[0]?.name ?? "No clear pattern";
  // MASLA 4 — the authoritative score is the shared analyseCoin result (same as
  // Signals). Falls back to the chart heuristic only when there are no candles.
  const score = coinAnalysis?.score ?? analysis?.score ?? 0;
  const conditionsPassed = coinAnalysis?.conditionsPassed ?? 0;
  const conditionsTotal = coinAnalysis?.conditionsTotal ?? 8;
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

  // Features 1-4: confirmations (RSI/MACD/EMA/Volume), expert panel and
  // guidance — all derived from the REAL candles + analysis. Educational only.
  const insights = useMemo(() => {
    if (!analysis || candles.length < 30) return null;
    const input = {
      candles,
      price: analysis.currentPrice || candles[candles.length - 1].close,
      direction: analysis.direction,
      support: analysis.support,
      resistance: analysis.resistance,
      pattern: topPattern === "No clear pattern" ? null : topPattern,
      breakout: breakout > 0,
      score: analysis.score,
    };
    const report = buildConfirmations(input);
    const { educators, consensus } = buildEducators(report, input);
    const guidance = buildGuidance({ confirmed: report.confirmed, consensus }, input);
    return { report: { ...report, educators, consensus }, educators, consensus, guidance };
  }, [analysis, candles, topPattern, breakout, score]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      {/* Fullscreen container: header + timeframe + chart stay visible when fullscreen */}
      <div
        ref={chartRef}
        className={
          isFullscreen
            ? "flex h-screen w-full flex-col overflow-hidden bg-[#0B0E11] p-2"
            : "w-full"
        }
      >
        {/* Symbol + price header */}
        <div className={"mb-3 flex items-center justify-between rounded-2xl border p-4" + (isFullscreen ? " mt-0" : "")} style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <div className="flex flex-col">
            <span className="text-lg font-bold" style={{ color: TEXT }}>{symbol}</span>
            <span className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
              <span>Timeframe: {timeframe}</span>
              {market === "futures" && (
                <span
                  className="rounded px-1.5 py-0.5 font-semibold"
                  style={{ color: "#60a5fa", backgroundColor: "rgba(96,165,250,0.15)" }}
                >
                  Futures
                </span>
              )}
              {leverage > 1 && (
                <span
                  className="rounded px-1.5 py-0.5 font-bold"
                  style={{ color: "#f0b90b", backgroundColor: "rgba(240,185,11,0.15)" }}
                >
                  {leverage}x
                </span>
              )}
            </span>
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

        {/* Main chart — full width, responsive height, mobile friendly */}
        <div
          className={
            "relative w-full overflow-hidden rounded-2xl border " +
            (isFullscreen
              ? "min-h-0 flex-1"
              : "h-[60vh] p-2 md:h-[500px] md:p-4")
          }
          style={{ backgroundColor: BG, borderColor: BORDER }}
        >
          {/* Fullscreen toggle — absolute top-right */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="absolute right-2 top-2 z-10 rounded-lg p-2 text-sm font-bold"
            style={{ backgroundColor: "rgba(24,26,32,0.9)", color: TEXT, border: `1px solid ${BORDER}` }}
          >
            {isFullscreen ? "⛶" : "⛶"}
          </button>
          {loading ? (
            <p className="px-4 py-6 text-sm" style={{ color: MUTED }}>Loading chart...</p>
          ) : candles.length === 0 ? (
            <p className="px-4 py-6 text-sm" style={{ color: MUTED }}>No chart data available.</p>
          ) : (
            <>
            {/* Toggle buttons — top-left of the chart, above everything else */}
            <div className="absolute left-2 top-2 z-20 flex flex-wrap gap-1.5">
              <LayerToggle label="Pattern" active={layers.pattern} onClick={() => toggleLayer("pattern")} />
              <LayerToggle label="Trend" active={layers.trend} onClick={() => toggleLayer("trend")} />
              <LayerToggle label="Levels" active={layers.levels} onClick={() => toggleLayer("levels")} />
              <LayerToggle label="Experts" active={layers.experts} onClick={() => toggleLayer("experts")} />
              <LayerToggle label="Indicators" active={layers.indicators} onClick={() => toggleLayer("indicators")} />
            </div>
            {/* Educators panel — top-right inside the chart */}
            {layers.experts && insights ? (
              <div
                className="pointer-events-none absolute right-2 top-12 z-10 max-w-[46%] rounded-lg p-2 text-[10px] leading-tight shadow-lg sm:text-[11px]"
                style={{ backgroundColor: "rgba(24,26,32,0.92)", color: TEXT, border: `1px solid ${BORDER}` }}
              >
                <p className="mb-1 text-[10px] font-bold" style={{ color: MUTED }}>🧠 EDUCATORS · Consensus {insights.consensus.agreed}/{insights.consensus.total}</p>
                {insights.educators.map((e) => (
                  <p key={e.role} className="flex items-center justify-between gap-2">
                    <span className="truncate">{e.emoji} {e.role}</span>
                    <span style={{ color: e.confirms ? GREEN : RED }}>{e.confirms ? "✅" : "⚠️"}</span>
                  </p>
                ))}
              </div>
            ) : null}
            {/* Indicators panel — bottom-left inside the chart */}
            {layers.indicators && insights ? (
              <div
                className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[52%] rounded-lg p-2 text-[10px] leading-tight shadow-lg sm:text-[11px]"
                style={{ backgroundColor: "rgba(24,26,32,0.92)", color: TEXT, border: `1px solid ${BORDER}` }}
              >
                <p className="mb-1 text-[10px] font-bold" style={{ color: MUTED }}>📊 INDICATORS</p>
                {insights.report.indicators.map((ind) => (
                  <p key={ind.name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{ind.name}</span>
                    <span style={{ color: ind.confirms ? GREEN : ind.icon === "against" ? RED : "#f0b90b" }}>{ind.value}</span>
                  </p>
                ))}
              </div>
            ) : null}
            <TradingChart
              data={candles}
              chartKey={`${symbol}:${timeframe}`}
              levels={levels}
              patternOutlines={visiblePatternOutlines}
              arrowMarkers={visibleArrowMarkers}
              trendline={trendline}
              trendDirection={
                analysis?.direction === "bullish" ? "Bullish"
                : analysis?.direction === "bearish" ? "Bearish"
                : "Sideways"
              }
              market={dataMarket}
              autoAnalyze={false}
              height={isFullscreen ? undefined : 420}
            />
            </>
          )}
        </div>
      </div>

      {/* AI Analysis box below the chart */}
      <section aria-label="AI analysis" className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <h2 className="mb-3 text-sm font-bold" style={{ color: TEXT }}>📊 AI ANALYSIS</h2>
        {/* MASLA 4/11 — trend badge + score come from the SHARED analyseCoin
            engine, so this ALGO score always equals the Signals page ALGO. */}
        {coinAnalysis ? <TrendBadge direction={coinAnalysis.direction} score={coinAnalysis.score} /> : (analysis ? <TrendBadge direction={analysis.direction} score={analysis.score} /> : null)}
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Pattern" value={topPattern} />
          <Row label="Score" value={`${score}/100`} />
          {coinAnalysis ? <Row label="Conditions" value={`${conditionsPassed}/${conditionsTotal} Passed`} valueColor={conditionsPassed === conditionsTotal ? GREEN : conditionsPassed >= 7 ? "#f0b90b" : MUTED} /> : null}
          <Row label="Trend" value={trendLabel} valueColor={trendLabel === "Bullish" ? GREEN : trendLabel === "Bearish" ? RED : MUTED} />
          <Row label="Support" value={support > 0 ? `$${fmtPrice(support)}` : "—"} valueColor={GREEN} />
          <Row label="Resistance" value={resistance > 0 ? `$${fmtPrice(resistance)}` : "—"} valueColor={RED} />
          <Row label="Breakout" value={breakout > 0 ? `$${fmtPrice(breakout)}` : "—"} />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: MUTED }}>Verdict</span>
            <span className="text-sm font-bold" style={{ color: verdictColor }}>{verdict}</span>
          </div>
        </div>
        {/* Features 2-4 — confirmation indicators, expert panel, expert guidance. */}
        {insights ? <ConfirmationSection report={insights.report} /> : null}
        {insights ? <ExpertPanel educators={insights.educators} consensus={insights.consensus} /> : null}
        {insights ? <GuidanceSection quotes={insights.guidance} /> : null}
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

/** Small on-chart toggle pill for one visual layer (Pattern/Trend/Levels/...). */
function LayerToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${active ? "Hide" : "Show"} ${label}`}
      className="rounded-md border px-2 py-0.5 text-[10px] font-bold transition-colors sm:text-[11px]"
      style={{
        backgroundColor: active ? "rgba(59,130,246,0.25)" : "rgba(24,26,32,0.9)",
        color: active ? "#93c5fd" : MUTED,
        borderColor: active ? "#3b82f6" : BORDER,
      }}
    >
      {label}
    </button>
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

