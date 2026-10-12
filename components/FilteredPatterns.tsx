// Only high-confidence patterns shown.
// Educational analysis. Not financial advice.
"use client";

import { useMemo } from "react";
import { candlestickPatternDefs } from "@/src/lib/chart/candlestickPatterns";
import {
  categorizePatterns,
  filterHighConfidencePatterns,
  type ConfidencePattern,
} from "@/src/lib/chart/patternFilter";

export interface FilteredPatternsProps {
  /** Detected patterns from the chart analysis (e.g. scanCandlestickPatterns). */
  patterns: ConfidencePattern[];
}

/** Maximum cards rendered — keeps the panel scannable. */
const MAX_SHOWN = 5;

type Badge = { label: "Bullish" | "Bearish" | "Reversal"; cls: string };

/** Name-based badge lookup; unmatched high-confidence hits default to Reversal. */
function badgeFor(name: string, groups: ReturnType<typeof categorizePatterns>): Badge {
  if (groups.bullish.some((hit) => hit.pattern === name)) return { label: "Bullish", cls: "bg-emerald-500/15 text-emerald-400" };
  if (groups.bearish.some((hit) => hit.pattern === name)) return { label: "Bearish", cls: "bg-rose-500/15 text-rose-400" };
  return { label: "Reversal", cls: "bg-yellow-500/15 text-yellow-400" };
}

/** Short Roman Urdu explainer from the Phase 6 pattern catalogue. */
function noteFor(name: string): string {
  return candlestickPatternDefs.find((def) => def.name === name)?.romanUrdu ?? "High-confidence pattern mila hai.";
}

export default function FilteredPatterns({ patterns }: FilteredPatternsProps) {
  const groups = useMemo(() => categorizePatterns(patterns), [patterns]);
  const shown = useMemo(() => filterHighConfidencePatterns(patterns).slice(0, MAX_SHOWN), [patterns]);

  if (shown.length === 0) {
    return (
      <section aria-label="High-confidence patterns" className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
        <h2 className="text-sm font-bold tracking-wide text-white">🔍 High-Confidence Patterns</h2>
        <p className="mt-2 text-sm text-zinc-400">No high-confidence patterns detected</p>
      </section>
    );
  }

  return (
    <section aria-label="High-confidence patterns" className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-white">🔍 High-Confidence Patterns</h2>
        <span className="text-xs text-zinc-500">75%+ confidence only</span>
      </header>
      <ul className="space-y-2">
        {shown.map((hit) => {
          const badge = badgeFor(hit.pattern, groups);
          return (
            <li key={`${hit.pattern}-${hit.confidence}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{hit.pattern}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge.cls}`}>{badge.label}</span>
                  <span className="text-xs font-bold tabular-nums text-sky-400">{hit.confidence}%</span>
                </div>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">{noteFor(hit.pattern)}</p>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-zinc-800 pt-2 text-[11px] text-zinc-500">
        ⚠️ Educational analysis only. Not financial advice.
      </p>
    </section>
  );
}
