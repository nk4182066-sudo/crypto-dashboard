"use client";

// Chart pattern detail page. Reads the pattern name from the route and renders
// its catalogue entry with [Roman Urdu] [English] tabs (default Urdu, choice
// saved to localStorage). Educational only. Not financial advice.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { chartPatternDefs, type PatternCategory, type PatternType } from "@/src/lib/chart/chartPatterns";
import {
  PATTERN_LANGUAGE_STORAGE_KEY,
  chartPatternActionText,
  chartPatternEnglish,
  type PatternDetailLanguage,
} from "@/src/lib/chart/patternLanguage";
import PatternLanguageTabs from "@/components/PatternLanguageTabs";

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

export default function ChartPatternDetailPage() {
  const params = useParams();
  const rawName = Array.isArray(params.name) ? params.name[0] : params.name;
  const name = typeof rawName === "string" ? decodeURIComponent(rawName) : "";

  const [lang, setLang] = useState<PatternDetailLanguage>("urdu");

  // Restore the shared language preference once on mount (default: Roman Urdu).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PATTERN_LANGUAGE_STORAGE_KEY);
      if (saved === "english" || saved === "urdu") setLang(saved);
    } catch {
      /* localStorage unavailable — stay on default */
    }
  }, []);

  const handleLangChange = (next: PatternDetailLanguage) => {
    setLang(next);
    try {
      localStorage.setItem(PATTERN_LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* ignore write failures */
    }
  };

  const def = useMemo(() => chartPatternDefs.find((d) => d.name === name), [name]);

  if (!def) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-4">
        <Link href="/chart-patterns" className="text-sm font-semibold" style={{ color: GREEN }}>← Back</Link>
        <p className="mt-6 text-center text-sm" style={{ color: MUTED }}>Pattern not found.</p>
      </main>
    );
  }

  const english = chartPatternEnglish[def.name];
  const what = lang === "urdu" ? def.romanUrdu : english?.what ?? def.romanUrdu;
  const matlab = lang === "urdu" ? english?.matlabUrdu ?? def.pointsNeeded : english?.matlab ?? def.pointsNeeded;
  const action = chartPatternActionText(def.type, lang);

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      <Link href="/chart-patterns" className="text-sm font-semibold" style={{ color: GREEN }}>← Back</Link>

      <div className="mt-3 rounded-2xl border p-5" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
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
          </div>
          <PatternLanguageTabs value={lang} onChange={handleLangChange} />
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <Block title="Ye kya hai" body={what} />
          <Block title="Matlab kya hai" body={matlab} />
          <Block title="Detection Rules (Points Needed)" body={def.pointsNeeded} />
          <Block title="Kya karein" body={action} />
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
