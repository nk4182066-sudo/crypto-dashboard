"use client";
import AuthGuard from "@/components/AuthGuard";

// Trade chart page. Clean like /markets: symbol + price header, timeframe
// buttons, a full-width chart with auto-drawn patterns (blue), support/
// resistance (green/red dashed), buy-point arrows and Entry/SL/TP zones, then
// an AI Analysis box below. Educational only. Not financial advice.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import TradingChart, { type ChartArrowMarker, type ChartLevel } from "@/components/TradingChart";
import { buildLeverageLevels } from "@/src/lib/signalGenerator";
import { zigZag } from "@/src/analysis/structure";
import { analyzeCoin, type AnalyzeResult } from "@/src/lib/analyzeCoin";
import { normalizeSymbol } from "@/src/lib/chart/symbol";
import { mergeCandles, type SeriesCandle } from "@/src/lib/candleSeries";
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

/** Timeframe → minutes, so the ATR plan picks the right ladder (<=15m tight). */
function tfToMinutes(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1m": return 1;
    case "5m": return 5;
    case "15m": return 15;
    case "4h": return 240;
    case "1d": return 1440;
    case "1h":
    default: return 60;
  }
}

type Candle = SeriesCandle;

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p === 0) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(8);
}

/**
 * Pulls one timeframe of candles; empty array on any failure.
 * `hasMore` mirrors the API's "there is more history before this page" flag
 * so the chart can offer historical navigation.
 */
async function fetchCandles(
  symbol: string,
  market: string,
  timeframe: string
): Promise<{ candles: Candle[]; hasMore: boolean }> {
  try {
    const query = new URLSearchParams({ market, symbol, timeframe });
    const response = await fetch(`/api/market/history?${query}`, { cache: "no-store" });
    if (!response.ok) return { candles: [], hasMore: false };
    const payload = (await response.json()) as {
      data?: Candle[];
      hasMore?: boolean;
      degraded?: boolean;
    };
    // Reject demo/synthetic data: a degraded body is NOT real market data.
    if (payload.degraded) return { candles: [], hasMore: false };
    const candles = Array.isArray(payload.data) ? payload.data : [];
    return { candles, hasMore: Boolean(payload.hasMore) && candles.length > 0 };
  } catch {
    return { candles: [], hasMore: false };
  }
}

/**
 * MASLA — fetch the page of candles that ENDS right before `before` (the
 * oldest bar we already hold). Used to backfill history when the user drags
 * the chart to the left, so older bars can be explored.
 */
async function fetchOlderCandles(
  symbol: string,
  market: string,
  timeframe: string,
  before: number
): Promise<{ candles: Candle[]; hasMore: boolean }> {
  try {
    const query = new URLSearchParams({
      market,
      symbol,
      timeframe,
      before: String(before),
    });
    const response = await fetch(`/api/market/history?${query}`, { cache: "no-store" });
    if (!response.ok) return { candles: [], hasMore: false };
    const payload = (await response.json()) as {
      data?: Candle[];
      hasMore?: boolean;
      degraded?: boolean;
    };
    if (payload.degraded) return { candles: [], hasMore: false };
    const candles = Array.isArray(payload.data) ? payload.data : [];
    return { candles, hasMore: Boolean(payload.hasMore) && candles.length > 0 };
  } catch {
    return { candles: [], hasMore: false };
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
 *
 * The implementation lives in "@/src/lib/candleSeries" (shared with the chart
 * component). Note the argument order matters:
 *  - live poll  -> mergeCandles(prev, incoming)  => the fresh tick wins,
 *  - history    -> mergeCandles(older, prev)      => the bars we already hold
 *    win, so a backfilled page can never rewrite an existing candle.
 */
function mergeLiveCandles(prev: Candle[], incoming: Candle[]): Candle[] {
  return mergeCandles(prev, incoming) as Candle[];
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
  // MASLA — historical navigation state. `hasMoreHistory` tells the chart it
  // may backfill; `loadingOlder` guards against duplicate concurrent fetches.
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // MASLA 1/2 — fixed 1h/4h/1d series for the shared analyzeCoin() trend
  // condition ("Trend aligned 1h + 4h + 1d"). Fetched once per symbol,
  // independent of the selected chart timeframe.
  const [multiTf, setMultiTf] = useState<{ h1: Candle[]; h4: Candle[]; d1: Candle[] }>({ h1: [], h4: [], d1: [] });
  const [loading, setLoading] = useState(true);
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
  // Mobile accordion for indicators/experts/guidance — keeps chart clear.
  const [showInsights, setShowInsights] = useState(false);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void chartRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.();
    }
  };

  // Single source of truth: fetch the same signal data the Signals page shows,
  // so Trade and Signals can NEVER disagree on score / conditions / trend.
  const [apiSignal, setApiSignal] = useState<any>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/signals/live?market=${dataMarket}`, { cache: "no-store" })
      .then(async (r) => {
        if (!cancelled && r.ok) {
          const payload = await r.json();
          const results = Array.isArray(payload.results) ? payload.results : [];
          // Flexible symbol matching: try exact, then case-insensitive, then
          // suffix-variant (EUR-USD vs EURUSD=X vs EURUSD) so forex/stocks/metals
          // never fall through to the local-analyzeCoin fallback path.
          let sig = results.find((s: any) => s.symbol === symbol);
          if (!sig) {
            const sUpper = symbol.toUpperCase();
            sig =
              results.find((s: any) => String(s.symbol).toUpperCase() === sUpper) ??
              results.find((s: any) => {
                const a = String(s.symbol).toUpperCase().replace(/[=X/-]/g, "");
                const b = sUpper.replace(/[=X/-]/g, "");
                return a === b;
              }) ??
              null;
          }
          setApiSignal(sig ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, dataMarket]);

  // Track the browser fullscreen state so the layout + button icon stay in sync.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Single-truth chart source: when the signal carries its saved 100-candle
  // series and we're on the signal's own timeframe (1h), render EXACTLY those
  // (no re-fetch) so the chart can never drift from what the signal was built on.
  const savedSeries = timeframe === "1h" ? ((apiSignal?.candles ?? null) as Candle[] | null) : null;
  const useSaved = Boolean(savedSeries && savedSeries.length > 0);

  // Candles for the selected timeframe (drives the chart + pattern scan).
  // Initial full load, then live polling that updates the last candle in place
  // and appends new ones — no full reset, so the chart keeps its position.
  useEffect(() => {
    let cancelled = false;
    if (useSaved && savedSeries) {
      // Deferred (async) like the fetch path below — applying state in a
      // microtask keeps the effect body side-effect-light.
      void Promise.resolve(savedSeries).then((rows) => {
        if (cancelled) return;
        setCandles(rows);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    void fetchCandles(symbol, dataMarket, timeframe).then(({ candles: rows, hasMore }) => {
      if (cancelled) return;
      setCandles(rows);
      setHasMoreHistory(hasMore);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, dataMarket, timeframe, useSaved, savedSeries]);

  // MASLA — historical navigation. The chart asks for older data when the
  // user scrolls/pans to the left edge; we fetch the previous page and
  // PREPEND it so the visible window keeps its position.
  const loadOlderData = useCallback(async () => {
    if (loadingOlder || !hasMoreHistory) return;
    const oldest = candles[0]?.time;
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const { candles: older, hasMore } = await fetchOlderCandles(
        symbol,
        dataMarket,
        timeframe,
        oldest,
      );
      if (older.length === 0) {
        setHasMoreHistory(false);
        return;
      }
      setCandles((prev) => mergeLiveCandles(older, prev));
      setHasMoreHistory(hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }, [candles, hasMoreHistory, loadingOlder, symbol, dataMarket, timeframe]);

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
      if (!cancelled) setMultiTf({ h1: h1.candles, h4: h4.candles, d1: d1.candles });
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, dataMarket]);

  // Real-time refresh: poll Binance/Yahoo on a timeframe-wise cadence and merge.
  useEffect(() => {
    if (useSaved) return; // frozen signal basis: no live drift from the saved series
    const interval = setInterval(() => {
      void fetchCandles(symbol, dataMarket, timeframe).then(({ candles: rows }) => {
        if (rows.length === 0) return; // ignore empty/error polls, keep last state
        setCandles((prev) => mergeLiveCandles(prev, rows));
      });
    }, refreshMsFor(timeframe));
    return () => clearInterval(interval);
  }, [symbol, dataMarket, timeframe, useSaved]);

  // Header quote only. Score/trend/SR/plan all come from the shared analyzeCoin()
  // engine (coinAnalysis below) so Trade and Signals can never disagree.
  useEffect(() => {
    let cancelled = false;
    void fetchQuote(symbol, dataMarket).then((result) => {
      if (!cancelled) setQuote(result);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, dataMarket]);

  // Detected chart pattern -> a swing outline drawn on the chart, labelled
  // with the SHARED engine's pattern only (see patternOutlines below).
  // (The outline memo lives AFTER coinAnalysis, which it reads.)

  // MASLA 4 — SINGLE shared score. Trade page hamesha API data (Signals page
  // se) use karta hai score/conditions/trend ke liye, chahe chart ka timeframe
  // kuch bhi ho. Chart alag timeframe dikh sakta hai, lekin score box aur AI
  // analysis box Signals page se bilkul match karenge — zero mismatch.
  // Agar API data available nahi hai, tabhi local analyzeCoin() fall back karega.
  const coinAnalysis: AnalyzeResult | null = useMemo(() => {
    // ─── Primary: API data (single source of truth, matches Signals page) ───
    if (apiSignal) {
      return {
        symbol,
        market: dataMarket,
        score: apiSignal.score,
        conditionsPassed: apiSignal.conditionsPassed ?? 0,
        conditionsTotal: 8,
        direction: apiSignal.direction,
        quality:
          apiSignal.score >= 88
            ? "PERFECT"
            : apiSignal.score >= 75
              ? "STRONG"
              : apiSignal.score >= 62
                ? "GOOD"
                : null,
        indicators: apiSignal.indicators ?? [],
        conditions: (apiSignal.conditions ?? []).map((c: any) => ({
          id: c.id,
          label: c.id,
          pass: c.pass,
          detail: "",
        })),
        chartPattern: apiSignal.chartPattern ?? null,
        chartPatternConfidence: apiSignal.chartPatternNote
          ? parseFloat(String(apiSignal.chartPatternNote).replace(/[^0-9.]/g, "")) || 0
          : 0,
        candlestick: apiSignal.candlestickPattern ?? null,
        candlestickType: apiSignal.candlestickType ?? null,
        candlestickConfidence: apiSignal.candlestickConfidence ?? 0,
        support: apiSignal.support ?? null,
        resistance: apiSignal.resistance ?? null,
        trends: [],
        price: apiSignal.price,
        atr: apiSignal.atr ?? null,
        tfMinutes: apiSignal.timeframeMinutes ?? 60,
      } as AnalyzeResult;
    }
    // ─── Fallback: local analyzeCoin() only when API data unavailable ───
    return candles.length >= 20
      ? analyzeCoin({
          symbol,
          market: dataMarket,
          primary: candles,
          h1: timeframe === "1h" ? candles : multiTf.h1,
          h4: timeframe === "4h" ? candles : multiTf.h4,
          d1: timeframe === "1d" ? candles : multiTf.d1,
        })
      : null;
  }, [candles, symbol, dataMarket, timeframe, multiTf, apiSignal]);
  const patternOutlines = useMemo(() => {
    // Outline only what the SHARED engine actually found — when it found
    // nothing the chart draws no pattern (never the loose 25-pattern scan,
    // which happily labels every symbol "Triple Top").
    const name = coinAnalysis?.chartPattern;
    if (!name) return [];
    const pivots = zigZag(candles.slice(-150), 3);
    const points = pivots.slice(-6).map((p) => ({ time: p.time, price: p.price }));
    if (points.length < 2) return [];
    // Green for bullish patterns, red for bearish, neutral amber otherwise.
    const color = coinAnalysis.direction === "bullish" ? GREEN : coinAnalysis.direction === "bearish" ? RED : "#f0b90b";
    return [{ name, points, color }];
  }, [coinAnalysis, candles]);

  // Support / resistance as green / red dashed lines (from shared engine).
  const srLevels: ChartLevel[] = useMemo(() => {
    if (!coinAnalysis) return [];
    const levels: ChartLevel[] = [];
    if (coinAnalysis.support != null && coinAnalysis.support > 0) levels.push({ kind: "support", price: coinAnalysis.support, label: `Support $${fmtPrice(coinAnalysis.support)}`, lineStyle: "dashed" });
    if (coinAnalysis.resistance != null && coinAnalysis.resistance > 0) levels.push({ kind: "resistance", price: coinAnalysis.resistance, label: `Resistance $${fmtPrice(coinAnalysis.resistance)}`, lineStyle: "dashed" });
    return levels;
  }, [coinAnalysis]);

  // Leverage-aware Entry / SL / TP1-2-3 lines + entry arrow.
  // DYNAMIC ATR plan (atrPlan.ts): >=1h → SL 1x ATR, TP1 1.5x (2-3h),
  // TP2 2.5x (4-5h), TP3 4x (6-8h); <=15m → tight ladder (0.5x ATR TP1).
  // S/R trim TP1 to the nearest wall and may place the stop behind structure —
  // never fixed 3% / 10/20/30%, so targets always sit near the entry on screen.
  // Direction-correct: bullish → SL below entry, targets above; bearish reversed.
  const { planLevels, arrowMarkers } = useMemo(() => {
    const empty: { planLevels: ChartLevel[]; arrowMarkers: ChartArrowMarker[] } = { planLevels: [], arrowMarkers: [] };
    if (!coinAnalysis || candles.length === 0) return empty;
    const actionable = coinAnalysis.direction !== "neutral" && coinAnalysis.quality !== null;
    if (!actionable) return empty;

    const bullish = coinAnalysis.direction === "bullish";
    const last = candles[candles.length - 1];
    const entry = coinAnalysis.price || last.close;
    const lev = leverage > 0 ? leverage : 10;
    const plan = buildLeverageLevels(entry, bullish ? "bullish" : "bearish", lev, {
      // Chart candles drive BOTH the ATR and the timeframe class (15m → tight),
      // so the on-chart plan always matches the timeframe the user is viewing.
      candles,
      timeframeMinutes: tfToMinutes(timeframe),
      support: coinAnalysis.support ?? null,
      resistance: coinAnalysis.resistance ?? null,
    });

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
  }, [coinAnalysis, candles, leverage, timeframe]);

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
    const dir = coinAnalysis?.direction;
    if (!layers.trend || dir !== "bullish" && dir !== "bearish") return [];
    const pivots = zigZag(candles.slice(-150), 3);
    if (pivots.length < 2) return [];
    const wantHigh = dir === "bullish";
    // Follow the pivots that build the structure in the trend's direction.
    const chosen = pivots.filter((p) => (wantHigh ? p.kind === "high" : p.kind === "low")).slice(-4);
    const points = (chosen.length >= 2 ? chosen : pivots.slice(-4)).map((p) => ({ time: p.time, price: p.price }));
    return points;
  }, [candles, layers.trend, coinAnalysis]);

  // ---- Header numbers ------------------------------------------------------
  const headerPrice = quote?.price ?? coinAnalysis?.price ?? candles[candles.length - 1]?.close ?? 0;
  const prevClose = quote?.previousClose ?? 0;
  const changePct = prevClose > 0 ? ((headerPrice - prevClose) / prevClose) * 100 : 0;
  const up = changePct >= 0;

  // ---- AI Analysis box data -----------------------------------------------
  // MASLA 1 — the displayed pattern comes from the SHARED analyzeCoin() engine
  // ONLY, so the Trade "Pattern" row equals the Signals card pattern for the
  // same coin. When the engine found nothing (real OHLC analysis says so) the
  // row says "No clear pattern" — we never fall back to a looser scan that
  // would contradict the engine.
  const topPattern = coinAnalysis
    ? (coinAnalysis.chartPattern ?? coinAnalysis.candlestick ?? "No clear pattern")
    : "…";
  // MASLA 4 — the authoritative score is the shared analyseCoin result (same as
  // Signals). The heuristic `analysis.score` is NEVER shown as the ALGO score
  // (it produced the "0/100 vs 88/100" contradiction) — while the engine has
  // not run yet (loading / <20 candles) the row shows "…" instead of 0/100.
  const score = coinAnalysis?.score ?? 0;
  const conditionsPassed = coinAnalysis?.conditionsPassed ?? 0;
  const conditionsTotal = coinAnalysis?.conditionsTotal ?? 8;
  // Panel direction — ONE source for the trend label and the expert/indicator
  // panels: the shared engine's verdict when it ran (it always has at this
  // point: insights gate on candles >= 30), else the chart heuristic. The old
  // mix (heuristic direction + engine score) produced "0/100 BEARISH" headers
  // whose panels argued about a different direction.
  const panelDirection = coinAnalysis?.direction ?? "neutral";
  const trendLabel = panelDirection === "bullish" ? "Bullish" : panelDirection === "bearish" ? "Bearish" : "Sideways";
  const support = coinAnalysis?.support ?? 0;
  const resistance = coinAnalysis?.resistance ?? 0;
  // Breakout watch level: an intermediate price between current and the target.
  const breakoutTarget = panelDirection === "bearish" ? support : resistance;
  const breakoutPrice = coinAnalysis?.price ?? 0;
  const breakout =
    breakoutTarget > 0 && breakoutPrice > 0
      ? breakoutPrice + (breakoutTarget - breakoutPrice) * 0.6
      : 0;
  const verdict =
    coinAnalysis?.quality === "PERFECT" || coinAnalysis?.quality === "STRONG"
      ? "SETUP FORMING"
      : coinAnalysis?.quality === "GOOD"
        ? "WATCH ZONE"
        : "NO SETUP";
  const verdictColor =
    coinAnalysis?.quality === "PERFECT" || coinAnalysis?.quality === "STRONG"
      ? GREEN
      : coinAnalysis?.quality === "GOOD"
        ? "#f0b90b"
        : MUTED;

  // Features 1-4: confirmations (RSI/MACD/EMA/Volume), expert panel and
  // guidance — all derived from the REAL candles + analysis. Educational only.
  const insights = useMemo(() => {
    if (!coinAnalysis || candles.length < 30) return null;
    const input = {
      candles,
      price: coinAnalysis?.price ?? candles[candles.length - 1].close,
      // SAME direction + SAME score as the displayed engine verdict, so the
      // consensus/confirmed panels can never contradict the score header
      // (the old `score: analysis.score` fed the heuristic score here while
      // the page displayed coinAnalysis.score — the "0/100 vs 4/4" bug).
      direction: panelDirection,
      support: coinAnalysis?.support ?? 0,
      resistance: coinAnalysis?.resistance ?? 0,
      pattern: topPattern === "No clear pattern" ? null : topPattern,
      breakout: breakout > 0,
      score,
    };
    const report = buildConfirmations(input);
    const { educators, consensus } = buildEducators(report, input);
    const guidance = buildGuidance({ confirmed: report.confirmed, consensus }, input);
    return { report: { ...report, educators, consensus }, educators, consensus, guidance };
  }, [coinAnalysis, candles, topPattern, breakout, score, panelDirection]);

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
              : "h-[55vh] p-2 md:h-[500px] md:p-4")
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
              // MASLA — historical navigation: the chart asks for older bars
              // when the user scrolls/pans to the left edge.
              hasMoreHistory={hasMoreHistory}
              loadingOlder={loadingOlder}
              onLoadOlderData={loadOlderData}
              // Anchors live on the frozen 1h series — on other timeframes
              // those bar times may not exist in the loaded data.
              patternPoints={savedSeries ? (apiSignal?.patternPoints ?? null) : null}
              trendline={trendline}
              trendDirection={
                coinAnalysis?.direction === "bullish" ? "Bullish"
                : coinAnalysis?.direction === "bearish" ? "Bearish"
                : "Sideways"
              }
              market={dataMarket}
              autoAnalyze={false}
              height={undefined}
            />
            {/* a11y + verification — the chart draws levels on <canvas> (no DOM
                text), so expose the EXACT plan (Entry/SL/TP1-3 prices) here for
                screen readers and the E2E smoke test. */}
            {planLevels.length > 0 ? (
              <div className="sr-only" data-testid="plan-levels">
                {planLevels.map((level) => (
                  <span key={`${level.kind}:${level.price}`} data-kind={level.kind} data-price={level.price}>
                    {level.kind} {level.price}
                  </span>
                ))}
              </div>
            ) : null}
            </>
          )}
        </div>
      </div>

      {/* AI Analysis box below the chart */}
      <section aria-label="AI analysis" className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <h2 className="mb-3 text-sm font-bold" style={{ color: TEXT }}>📊 AI ANALYSIS</h2>
        {/* MASLA 4/11 — trend badge + score come from the SHARED analyseCoin
            engine ONLY, so this ALGO score always equals the Signals page ALGO.
            Before the engine runs we render no badge (never the heuristic or
            a misleading 0/100). */}
        {coinAnalysis ? <TrendBadge direction={coinAnalysis.direction} score={coinAnalysis.score} /> : null}
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Pattern" value={topPattern} />
          <Row label="Score" value={coinAnalysis ? `${score}/100` : "…"} />
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
        {/* Features 2-4 — confirmation indicators, expert panel, expert guidance.
            Collapsible on mobile so the chart stays clear and uncluttered. */}
        {insights ? (
          <div className="mt-3 border rounded-xl overflow-hidden" style={{ borderColor: BORDER }}>
            <button
              type="button"
              onClick={() => setShowInsights((prev) => !prev)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
              style={{ backgroundColor: "#181A20", borderColor: BORDER }}
            >
              <span style={{ color: TEXT }}>📊 Indicators & Experts (tap to expand)</span>
              <span style={{ color: MUTED }}>{showInsights ? "▲" : "▼"}</span>
            </button>
            {showInsights && (
              <div className="px-4 py-3 border-t" style={{ borderColor: BORDER }}>
                <ConfirmationSection report={insights.report} />
                <ExpertPanel educators={insights.educators} consensus={insights.consensus} />
                <GuidanceSection quotes={insights.guidance} />
              </div>
            )}
          </div>
        ) : null}
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

function TradePageContent() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-4 py-4 text-sm text-[#9CA3AF]">Loading...</main>}>
      <TradeChart />
    </Suspense>
  );
}

export default function TradePage() {
  return (
    <AuthGuard>
      <TradePageContent />
    </AuthGuard>
  );
}

