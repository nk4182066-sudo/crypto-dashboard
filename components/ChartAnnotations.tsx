// Chart annotations overlay. Educational analysis only. Not financial advice.
"use client";

import type { ChartAnnotation, TradeVerdict } from "@/components/AnnotatedChart";

interface ChartAnnotationsProps {
  annotations: ChartAnnotation[];
  verdict: TradeVerdict;
}

const verdictLabel: Record<TradeVerdict, string> = {
  "Take Entry": "TAKE ENTRY",
  Wait: "WAIT",
  "Do Not Enter": "DO NOT ENTER",
};

const verdictColor: Record<TradeVerdict, string> = {
  "Take Entry": "text-emerald-400",
  Wait: "text-amber-300",
  "Do Not Enter": "text-rose-400",
};

const verdictBg: Record<TradeVerdict, string> = {
  "Take Entry": "bg-emerald-500/15",
  Wait: "bg-amber-500/15",
  "Do Not Enter": "bg-rose-500/15",
};

const pointLabel = (value: number): string =>
  value >= 1000 ? "" : `${value.toFixed(2)}`;

export default function ChartAnnotations({
  annotations,
  verdict,
}: ChartAnnotationsProps) {
  if (annotations.length === 0) {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 text-xs text-zinc-500">
          <span>No annotations yet.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      {/* Verdict badge */}
      <div className={`absolute bottom-2 left-2 rounded-lg px-3 py-1.5 shadow-lg ${verdictBg[verdict]}`}>
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${verdictColor[verdict]}`}>
          {verdictLabel[verdict]}
        </p>
      </div>

      {/* Annotations */}
      {annotations.map((ann, i) => {
        switch (ann.type) {
          case "horizontal": {
            const color =
              ann.category === "support"
                ? "#22c55e"
                : ann.category === "resistance"
                ? "#ef4444"
                : ann.category === "stopLoss"
                ? "#ef4444"
                : "#22c55e";
            return (
              <div key={i} className="relative flex items-center">
                <div
                  className="h-full w-px bg-current opacity-60"
                  style={{ backgroundColor: color }}
                />
                <div className="absolute top-0 left-2 rounded bg-black/80 px-2 py-0.5 text-[10px] text-zinc-300">
                  {ann.label}
                </div>
              </div>
            );
          }
          case "trendline": {
            return (
              <div key={i} className="relative flex items-center">
                <div className="h-0.5 w-full bg-current opacity-50" style={{ borderTop: `3px solid ${ann.category === "upperTrend" ? "#22c55e" : "#ef4444"}` }} />
                <div className="absolute top-0 left-2 rounded bg-black/80 px-2 py-0.5 text-[10px] text-zinc-300">
                  {ann.label}
                </div>
              </div>
            );
          }
          case "pattern": {
            return (
              <div key={i} className="relative flex items-center">
                <div className="absolute top-0 left-2 rounded bg-black/80 px-2 py-0.5 text-[10px] text-zinc-300">
                  {ann.label} · {ann.name}
                </div>
              </div>
            );
          }
          case "entry": {
            const isBuy = ann.direction === "buy";
            return (
              <div key={i} className="relative flex items-center">
                <div
                  className={`h-3 w-3 rounded-full shadow-lg ${
                    isBuy ? "bg-emerald-400" : "bg-red-400"
                  }`}
                  style={{
                    boxShadow: isBuy
                      ? "0 0 8px rgba(34,197,94,0.8)"
                      : "0 0 8px rgba(239,68,68,0.8)",
                  }}
                />
                <div className="absolute top-0 left-5 rounded bg-black/80 px-2 py-0.5 text-[10px] text-zinc-300">
                  {isBuy ? "Entry: BUY" : "Entry: SELL"} · {ann.label}
                </div>
              </div>
            );
          }
          default:
            return null;
        }
      })}

      <div className="absolute bottom-2 right-2 flex gap-1">
        <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] text-zinc-400">
          Chart annotations
        </span>
      </div>
    </div>
  );
}
