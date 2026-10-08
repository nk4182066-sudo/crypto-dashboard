"use client";

// Auto analysis overlay for the trading chart. Educational only. Not financial advice.

import { useEffect, useState } from "react";
import { getChartAnalysis, type ChartAnalysis } from "@/src/lib/autoChartAnalysis";

interface ChartAnalysisOverlayProps {
  symbol: string;
  market: string;
  candles: { time: number; close: number }[];
  /** Pre-fetched analysis (TradingChart owns fetch when provided); otherwise this panel fetches itself. */
  analysis?: ChartAnalysis | null;
  error?: string | null;
}

const money = (value: number): string =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 2 : 4 })}`;

const statusLabel: Record<ChartAnalysis["tradeStatus"], string> = { SETUP_FORMING: "SETUP FORMING", NO_SETUP: "NO SETUP", WATCH: "WATCH" };

const verdictEmoji: Record<ChartAnalysis["verdict"], string> = { STRONG: "✅", MODERATE: "⚠️", WEAK: "⭕" };

function toneOf(direction: ChartAnalysis["direction"]): { text: string; border: string; dot: string } {
  if (direction === "bullish") return { text: "text-emerald-400", border: "border-emerald-500/40", dot: "bg-emerald-500" };
  if (direction === "bearish") return { text: "text-rose-400", border: "border-rose-500/40", dot: "bg-rose-500" };
  return { text: "text-zinc-300", border: "border-zinc-700", dot: "bg-zinc-500" };
}

function Row({ label, value, className = "text-zinc-200" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className={`truncate text-right font-medium ${className}`}>{value}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="w-72 animate-pulse space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/95 p-3" role="status" aria-label="Loading analysis">
      <div className="h-3 w-2/3 rounded bg-zinc-800" />
      <div className="h-3 w-full rounded bg-zinc-800" />
      <div className="h-3 w-5/6 rounded bg-zinc-800" />
      <div className="h-3 w-1/2 rounded bg-zinc-800" />
    </div>
  );
}

export default function ChartAnalysisOverlay({ symbol, market, candles, analysis: injected, error: injectedError }: ChartAnalysisOverlayProps) {
  const [fetched, setFetched] = useState<{ symbol: string; data: ChartAnalysis | null; error: string | null }>({ symbol: "", data: null, error: null });
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Controlled mode: parent (TradingChart) owns the fetch. Standalone: fetch on symbol change + every 30s.
  const controlled = injected !== undefined;
  const fresh = fetched.symbol === symbol;
  const analysis = controlled ? injected : fresh ? fetched.data : null;
  const shownError = injectedError ?? (fresh ? fetched.error : null);

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getChartAnalysis(symbol, market);
        if (!cancelled) setFetched({ symbol, data: result, error: null });
      } catch {
        if (!cancelled) setFetched({ symbol, data: null, error: "Analysis load nahi ho saki." });
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbol, market, controlled]);

  // Smooth fade-in when the panel first mounts (loading skeleton swaps to panel).
  useEffect(() => {
    const frame = window.setTimeout(() => setVisible(true), 30);
    return () => window.clearTimeout(frame);
  }, []);

  if (shownError && !analysis) {
    return (
      <div role="alert" className="w-72 rounded-lg border border-rose-500/40 bg-zinc-950/95 p-3 text-xs text-rose-300">
        <p className="font-semibold">⚠️ Analysis unavailable</p>
        <p className="mt-1 text-rose-200/80">{shownError}</p>
      </div>
    );
  }
  if (!analysis) return <Skeleton />;

  const tone = toneOf(analysis.direction);
  const bullish = analysis.direction === "bullish";
  const trendWord = bullish ? "Bullish" : analysis.direction === "bearish" ? "Bearish" : "Neutral";
  const topPatterns = analysis.patterns.slice(0, 3);

  return (
    <section
      aria-label={`${analysis.symbol} auto analysis`}
      className={`w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border ${tone.border} bg-zinc-950/95 shadow-xl backdrop-blur transition-all duration-300 ${visible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}
    >
      <header className={`flex items-center justify-between gap-2 border-b ${tone.border} bg-zinc-900/80 px-3 py-2`}>
        <h3 className="truncate text-xs font-bold text-white">🎯 {analysis.symbol} ANALYSIS</h3>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand analysis panel" : "Minimize analysis panel"}
          className="rounded border border-zinc-700 px-1.5 text-zinc-300 hover:bg-zinc-800"
        >
          {collapsed ? "+" : "–"}
        </button>
      </header>
      {!collapsed && (
        <div className="space-y-2.5 px-3 py-2.5 text-[11px] leading-snug">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Score:</span>
            <span className={`font-bold ${analysis.score >= 80 ? "text-emerald-400" : analysis.score >= 60 ? "text-amber-400" : "text-rose-400"}`}>
              {analysis.score}/100 {verdictEmoji[analysis.verdict]} {analysis.verdict}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Status:</span>
            <span className={`font-semibold ${analysis.tradeStatus === "SETUP_FORMING" ? "text-emerald-400" : analysis.tradeStatus === "WATCH" ? "text-amber-400" : "text-rose-400"}`}>
              {statusLabel[analysis.tradeStatus]}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400">📈 Trend:</span>
            <span className={`font-semibold ${tone.text}`}>{trendWord}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">⏰ Timeframes:</span>
            <span className="font-medium text-zinc-200">{analysis.timeframeAlignment}</span>
          </div>

          <div className="border-t border-zinc-800 pt-2">
            <p className="mb-1 font-semibold text-zinc-300">🎯 Levels:</p>
            <Row label="Support:" value={money(analysis.support)} className="text-emerald-400" />
            <Row label="Resistance:" value={money(analysis.resistance)} className="text-rose-400" />
            <Row label="Current:" value={money(candles.at(-1)?.close ?? analysis.currentPrice)} className="text-sky-300" />
          </div>

          <div className="border-t border-zinc-800 pt-2">
            <p className="mb-1 font-semibold text-zinc-300">📊 Patterns:</p>
            {topPatterns.length === 0 && <p className="text-zinc-500">Koi pattern nahi mila</p>}
            {topPatterns.map((pattern) => (
              <p key={`${pattern.name}-${pattern.type}`} className="flex items-center justify-between gap-2">
                <span className="truncate text-zinc-300">
                  {pattern.confidence >= 75 ? "✅" : "▫️"} {pattern.name}
                </span>
                <span className="shrink-0 text-zinc-500">{pattern.confidence}%</span>
              </p>
            ))}
          </div>

          <div className="border-t border-zinc-800 pt-2">
            <p className="mb-1 font-semibold text-zinc-300">📈 Indicators:</p>
            <Row label="RSI:" value={`${analysis.indicators.rsi} (${analysis.indicators.rsi >= 70 ? "Hot" : analysis.indicators.rsi <= 30 ? "Oversold" : "Healthy"})`} />
            <Row label="MACD:" value={analysis.indicators.macd} className={analysis.indicators.macd === "bullish" ? "text-emerald-400" : "text-rose-400"} />
            <Row label="SMA 20/50:" value={`${money(analysis.indicators.sma20)} / ${money(analysis.indicators.sma50)}`} />
            <Row label="Volume:" value={analysis.indicators.volume} />
          </div>

          <div className="border-t border-zinc-800 pt-2">
            <p className="mb-1 font-semibold text-zinc-300">🎓 Analysis:</p>
            <p className="text-zinc-300">{analysis.explanation.headline}</p>
            <p className="mt-1 whitespace-pre-line text-zinc-400">{analysis.explanation.detail}</p>
          </div>

          <div className={`rounded border ${tone.border} px-2 py-1.5 ${tone.text}`}>
            <p className="font-semibold">⚠️ {analysis.explanation.action}</p>
            <p className="mt-0.5 text-zinc-400">{analysis.explanation.riskNote}</p>
          </div>

          <p className="border-t border-zinc-800 pt-2 text-[10px] text-zinc-500">📚 Educational only · Not financial advice</p>
        </div>
      )}
    </section>
  );
}


