"use client";

// Chart Patterns Library — searchable grid of all 25 chart patterns from the
// existing catalogue. Click a card -> /chart-patterns/[name]. Educational only.
import { useMemo, useState } from "react";
import Link from "next/link";
import { chartPatternDefs, type PatternCategory, type PatternType } from "@/src/lib/chart/chartPatterns";

const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F6465D";
const GRAY = "#9CA3AF";

function iconFor(type: PatternType): string {
  if (type === "bullish") return "🟢";
  if (type === "bearish") return "🔴";
  return "⚪";
}

function typeLabel(type: PatternType): string {
  return type === "bullish" ? "Bullish" : type === "bearish" ? "Bearish" : "Neutral";
}

function typeColor(type: PatternType): string {
  return type === "bullish" ? GREEN : type === "bearish" ? RED : GRAY;
}

function categoryLabel(category: PatternCategory): string {
  if (category === "reversal") return "Reversal";
  if (category === "continuation") return "Continuation";
  return "Harmonic";
}

export default function ChartPatternsPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chartPatternDefs;
    return chartPatternDefs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.romanUrdu.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-4">
      <p className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>Library</p>
      <h1 className="mb-1 text-2xl font-bold" style={{ color: TEXT }}>📊 Chart Patterns Library</h1>
      <p className="mb-4 text-sm" style={{ color: MUTED }}>{chartPatternDefs.length} patterns available</p>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search pattern..."
        className="mb-4 w-full rounded-xl border px-4 py-2.5 text-sm outline-none"
        style={{ backgroundColor: CARD, borderColor: BORDER, color: TEXT }}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((def) => (
          <Link
            key={def.name}
            href={`/chart-patterns/${encodeURIComponent(def.name)}`}
            className="flex flex-col rounded-2xl border p-4 transition-colors hover:border-[#3b4252]"
            style={{ backgroundColor: CARD, borderColor: BORDER }}
          >
            <span className="text-2xl">{iconFor(def.type)}</span>
            <span className="mt-2 text-sm font-bold" style={{ color: TEXT }}>{def.name}</span>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ color: typeColor(def.type), backgroundColor: "rgba(255,255,255,0.06)" }}
              >
                {typeLabel(def.type)}
              </span>
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: MUTED, backgroundColor: "rgba(255,255,255,0.06)" }}>
                {categoryLabel(def.category)}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm" style={{ color: MUTED }}>Koi pattern nahi mila.</p>
      )}

      <footer className="mt-6 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational only. Not financial advice.
      </footer>
    </main>
  );
}

