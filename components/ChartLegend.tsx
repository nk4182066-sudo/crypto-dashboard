"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { SignalLine } from "@/src/lib/chart/levelLines";
import type { ChartShape, Trendline } from "@/src/lib/chart/patternDetector";
import type { DetectedPattern } from "@/src/lib/chart/candlestickDetector";
import { LEVEL_EXPLANATIONS, TRENDLINE_EXPLANATIONS, explainShape } from "@/src/lib/chart/legend";

export interface ChartLegendProps {
  levels: SignalLine[];
  trendlines: Trendline[];
  shapes: ChartShape[];
  candlePatterns: DetectedPattern[];
  aiSummary?: string;
  trend?: "Bullish" | "Bearish" | "Sideways" | null;
  verdict?: "Take Entry" | "Wait" | "Do Not Enter" | null;
  /** Levels the parser refused to draw because they fell outside the range. */
  rejected?: string[];
}

const TONE = {
  bullish: "text-[#089981]",
  bearish: "text-[#f23645]",
  neutral: "text-zinc-400",
} as const;

function formatPrice(value: number): string {
  const magnitude = Math.abs(value);
  const digits = magnitude >= 1000 ? 2 : magnitude >= 1 ? 3 : magnitude >= 0.01 ? 5 : 8;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A single legend entry with a hover-revealed plain-language explanation. */
function LegendRow({
  swatch,
  label,
  value,
  explanation,
}: {
  swatch: string;
  label: string;
  value: ReactNode;
  explanation: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
    >
      <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="h-0.5 w-4 shrink-0 rounded" style={{ backgroundColor: swatch }} />
          <span className="truncate text-zinc-300">{label}</span>
        </span>
        <span className="shrink-0 tabular-nums text-zinc-200">{value}</span>
      </div>
      {open && (
        <p className="absolute left-0 top-full z-20 mt-1 w-64 rounded border border-zinc-700 bg-[#0d1117]/97 p-2 text-[11px] leading-relaxed text-zinc-300 shadow-lg">
          {explanation}
        </p>
      )}
    </li>
  );
}
export default function ChartLegend({
  levels,
  trendlines,
  shapes,
  candlePatterns,
  aiSummary = "",
  trend = null,
  verdict = null,
  rejected = [],
}: ChartLegendProps) {
  // Levels are grouped into a fixed reading order so the panel always reads
  // ceiling → entry → targets → stop → floor.
  const grouped = useMemo(() => {
    const order: SignalLine["kind"][] = ["resistance", "entry", "takeProfit", "stopLoss", "support", "reversal"];
    return order
      .map((kind) => ({ kind, items: levels.filter((level) => level.kind === kind) }))
      .filter((group) => group.items.length > 0);
  }, [levels]);

  const recentCandlePatterns = candlePatterns.slice(-4);
  const hasContent = grouped.length > 0 || trendlines.length > 0 || shapes.length > 0
    || recentCandlePatterns.length > 0 || Boolean(aiSummary);

  if (!hasContent) {
    return (
      <p className="border-t border-[#161b22] px-3 py-2 text-[11px] text-zinc-500">
        No active levels yet — they appear once candles and analysis load.
      </p>
    );
  }

  return (
    <div className="space-y-2 border-t border-[#161b22] px-3 py-2 text-[11px]">
      {(trend || verdict) && (
        <div className="flex flex-wrap items-center gap-2">
          {trend && (
            <span className={`font-semibold ${trend === "Bullish" ? "text-[#089981]" : trend === "Bearish" ? "text-[#f23645]" : "text-zinc-400"}`}>
              {trend} trend
            </span>
          )}
          {verdict && (
            <span className={`rounded px-1.5 py-0.5 font-semibold ${verdict === "Take Entry" ? "bg-[#089981] text-white" : verdict === "Do Not Enter" ? "bg-[#f23645] text-white" : "bg-zinc-700 text-zinc-200"}`}>
              {verdict}
            </span>
          )}
        </div>
      )}

      {grouped.length > 0 && (
        <ul className="space-y-0.5">
          {grouped.flatMap((group) => group.items.map((level, index) => (
            <LegendRow
              key={`${group.kind}-${index}`}
              swatch={level.color ?? (group.kind === "stopLoss" || group.kind === "resistance" ? "#f23645" : group.kind === "entry" ? "#2f81f7" : group.kind === "reversal" ? "#f0883e" : "#089981")}
              label={level.label ?? group.kind}
              value={formatPrice(level.price)}
              explanation={LEVEL_EXPLANATIONS[group.kind]}
            />
          )))}
        </ul>
      )}

      {trendlines.length > 0 && (
        <ul className="space-y-0.5">
          {trendlines.map((line) => (
            <LegendRow
              key={line.id}
              swatch={line.color}
              label={line.label}
              value={formatPrice(line.points[1].price)}
              explanation={TRENDLINE_EXPLANATIONS[line.kind]}
            />
          ))}
        </ul>
      )}

      {shapes.length > 0 && (
        <ul className="space-y-0.5">
          {shapes.map((shape) => (
            <LegendRow
              key={shape.id}
              swatch={shape.color}
              label={`${shape.label} (${shape.confidence}%)`}
              value={<span className={TONE[shape.direction]}>{shape.direction}</span>}
              explanation={explainShape(shape)}
            />
          ))}
        </ul>
      )}

      {recentCandlePatterns.length > 0 && (
        <ul className="space-y-0.5">
          {recentCandlePatterns.map((pattern) => (
            <LegendRow
              key={`${pattern.name}:${pattern.time}`}
              swatch={pattern.direction === "bullish" ? "#089981" : pattern.direction === "bearish" ? "#f23645" : "#8b949e"}
              label={pattern.name}
              value={<span className={TONE[pattern.direction]}>{pattern.direction}</span>}
              explanation={pattern.note}
            />
          ))}
        </ul>
      )}

      {aiSummary && (
        <p className="border-t border-[#161b22] pt-1.5 text-zinc-400">
          <span className="font-semibold text-zinc-300">AI summary: </span>
          {aiSummary}
        </p>
      )}

      {rejected.length > 0 && (
        <p className="text-amber-300/80">
          {rejected.length} suggested level{rejected.length === 1 ? "" : "s"} ignored — outside the chart&apos;s price range.
        </p>
      )}
    </div>
  );
}