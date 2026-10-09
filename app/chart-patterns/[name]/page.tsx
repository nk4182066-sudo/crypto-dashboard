"use client";

// Chart pattern detail page. Reads the pattern name from the route and renders
// its catalogue entry (Roman Urdu explanation + points needed + how to act).
// Educational only. Not financial advice.
import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { chartPatternDefs, type PatternCategory, type PatternType } from "@/src/lib/chart/chartPatterns";

const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F6465D";
const GRAY = "#9CA3AF";

function typeLabel(type: PatternType): string {
  return type === "bullish" ? "Bullish" : type === "bearish" ? "Bearish" : "Neutral";
}

function typeColor(type: PatternType): string {
  return type === "bullish" ? GREEN : type === "bearish" ? RED : GRAY;
}

function categoryLabel(category: PatternCategory): string {
  return category === "reversal" ? "Reversal" : category === "continuation" ? "Continuation" : "Harmonic";
}

/** "Kya karein" — one educational next-step line driven by the pattern type. */
function actionFor(type: PatternType): string {
  if (type === "bullish") {
    return "Breakout ya neckline ke upar close hone ka confirmation dekhein, phir soch samajh ke plan banayein. Stop-loss support ke neeche rakhein. Educational only.";
  }
  if (type === "bearish") {
    return "Breakdown ya neckline ke neeche close hone ka confirmation dekhein. Risk manage karein, bara position na lein. Educational only.";
  }
  return "Direction clear hone tak wait karein. Bina confirmation ke entry na lein. Educational only.";
}

export default function ChartPatternDetailPage() {
  const params = useParams();
  const rawName = Array.isArray(params.name) ? params.name[0] : params.name;
  const name = typeof rawName === "string" ? decodeURIComponent(rawName) : "";

  const def = useMemo(() => chartPatternDefs.find((d) => d.name === name), [name]);

  if (!def) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-4">
        <Link href="/chart-patterns" className="text-sm font-semibold" style={{ color: GREEN }}>← Back</Link>
        <p className="mt-6 text-center text-sm" style={{ color: MUTED }}>Pattern not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      <Link href="/chart-patterns" className="text-sm font-semibold" style={{ color: GREEN }}>← Back</Link>

      <div className="mt-3 rounded-2xl border p-5" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <h1 className="text-2xl font-bold" style={{ color: TEXT }}>{def.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ color: typeColor(def.type), backgroundColor: "rgba(255,255,255,0.06)" }}
          >
            {typeLabel(def.type)}
          </span>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ color: MUTED, backgroundColor: "rgba(255,255,255,0.06)" }}>
            {categoryLabel(def.category)}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <Block title="Ye kya hai" body={def.romanUrdu} />
          <Block title="Detection Rules (Points Needed)" body={def.pointsNeeded} />
          <Block title="Kya karein" body={actionFor(def.type)} />
        </div>

        <p className="mt-6 text-xs" style={{ color: MUTED }}>⚠️ Educational only. Not financial advice.</p>
      </div>
    </main>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: GREEN }}>{title}</p>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: TEXT }}>{body}</p>
    </div>
  );
}
