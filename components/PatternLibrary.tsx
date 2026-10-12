"use client";

/**
 * Phase 6 — PatternLibrary: catalogue UI for all 70 patterns and signals.
 * Tabs split candlestick / chart / reversal, cards carry the Roman Urdu
 * explainer plus what it means, and (optionally) live detection counts when a
 * candles array is passed in. Dark theme, Tailwind CSS. Educational only.
 */
import { useMemo, useState } from "react";
import { candlestickPatternDefs, scanCandlestickPatterns } from "@/src/lib/chart/candlestickPatterns";
import { chartPatternDefs, scanChartPatterns } from "@/src/lib/chart/chartPatterns";
import { reversalSignalDefs, scanReversalSignals } from "@/src/lib/chart/reversalSignals";
import type { DetectorCandle } from "@/src/lib/chart/candlestickDetector";
import type { Candle } from "@/src/analysis/types";

type Dir = "bullish" | "bearish" | "neutral";
type Tab = "candlestick" | "chart" | "reversal";

const TABS: { id: Tab; label: string }[] = [
  { id: "candlestick", label: "Candlestick" },
  { id: "chart", label: "Chart" },
  { id: "reversal", label: "Reversal" },
];

interface CardRow {
  key: string; name: string; type: Dir; group: string;
  romanUrdu: string; label: string; secondary: string; count: number;
}

/** Same palette the chart markers use (see CandlePatterns.tsx). */
const COLORS: Record<Dir, string> = { bullish: "#26a69a", bearish: "#ef5350", neutral: "#71717a" };
const badgeClass = (type: Dir) =>
  type === "bullish" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
  : type === "bearish" ? "border-rose-500/30 bg-rose-500/15 text-rose-400"
  : "border-zinc-600/50 bg-zinc-700/40 text-zinc-400";

/** Tiny candle glyph so every card has a visual at a glance. */
function PatternGlyph({ type }: { type: Dir }) {
  const color = COLORS[type];
  return (
    <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden="true">
      <line x1="16" y1="3" x2="16" y2="29" stroke={color} strokeWidth="1.5" />
      {type === "neutral" ? (
        <rect x="9" y="14.5" width="14" height="3" rx="1.5" fill={color} />
      ) : (
        <rect x="10" y={type === "bullish" ? 8 : 6} width="12" height={type === "bullish" ? 16 : 18} rx="1.5" fill={color} />
      )}
    </svg>
  );
}

export interface PatternLibraryProps {
  /** Live candles unlock per-card detection counts from the scan functions. */
  candles?: DetectorCandle[];
  className?: string;
}

export default function PatternLibrary({ candles, className }: PatternLibraryProps) {
  const [tab, setTab] = useState<Tab>("candlestick");
  const [query, setQuery] = useState("");

  /** Latest direction + fire count per pattern name, when candles are given. */
  const stats = useMemo(() => {
    const map = new Map<string, { count: number; dir: Dir }>();
    if (!candles || candles.length < 45) return map;
    const asCandles: Candle[] = candles.map((c) => ({ ...c, volume: c.volume ?? 0 }));
    const bump = (key: string, dir: Dir) => {
      const prev = map.get(key) ?? { count: 0, dir: "neutral" as Dir };
      map.set(key, { count: prev.count + 1, dir });
    };
    scanCandlestickPatterns(candles).forEach((hit) => bump(hit.pattern, hit.type));
    scanChartPatterns(asCandles).forEach((hit) => bump(hit.pattern, hit.type));
    scanReversalSignals(asCandles).forEach((hit) => bump(hit.signal, hit.direction));
    return map;
  }, [candles]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (name: string, text: string) => name.toLowerCase().includes(q) || text.toLowerCase().includes(q);
    const withStats = (key: string, type: Dir) => {
      const s = stats.get(key);
      return { type: s?.dir ?? type, count: s?.count ?? 0 };
    };
    if (tab === "chart") return chartPatternDefs.filter((d) => match(d.name, d.romanUrdu)).map((d): CardRow => ({ key: d.name, name: d.name, group: d.category, ...withStats(d.name, d.type), romanUrdu: d.romanUrdu, label: "Points Needed", secondary: d.pointsNeeded }));
    if (tab === "reversal") return reversalSignalDefs.filter((d) => match(d.signal, d.romanUrdu)).map((d): CardRow => ({ key: d.signal, name: d.signal, group: "", ...withStats(d.signal, d.type), romanUrdu: d.romanUrdu, label: "Matlab", secondary: d.matlab }));
    return candlestickPatternDefs.filter((d) => match(d.name, d.romanUrdu)).map((d): CardRow => ({ key: d.name, name: d.name, group: "", ...withStats(d.name, d.type), romanUrdu: d.romanUrdu, label: "Matlab", secondary: d.matlab }));
  }, [tab, query, stats]);

  return (
    <section className={`rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 ${className ?? ""}`}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Pattern Library</h3>
          <p className="text-[11px] text-zinc-500">{rows.length} pattern{rows.length === 1 ? "" : "s"} · {tab} tab</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${tab === t.id ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search patterns..."
            className="w-40 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
        </div>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 ? (
          <p className="col-span-full py-8 text-center text-xs text-zinc-500">
            Koi pattern match nahi hua — search badlo.
          </p>
        ) : (
          rows.map((c) => (
            <article key={c.key} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <PatternGlyph type={c.type} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="truncate text-sm font-semibold text-zinc-100">{c.name}</h4>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${badgeClass(c.type)}`}>
                    {c.type}
                  </span>
                </div>
                {c.group && <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">{c.group}</p>}
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">{c.romanUrdu}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  <span className="font-medium text-zinc-400">{c.label}:</span> {c.secondary}
                </p>
                {c.count > 0 && (
                  <span className="mt-2 inline-block rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                    {c.count}× detected
                  </span>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      <footer className="mt-4 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
        ⚠️ Disclaimer: Sirf educational/analysis ke liye — yeh financial advice nahi hai. Koi bhi pattern 100% guarantee
        nahi deta; apna risk manage karo aur hamesha confirmation ka wait karo.
      </footer>
    </section>
  );
}