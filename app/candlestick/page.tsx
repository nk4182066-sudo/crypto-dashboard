"use client";

// Candlestick Patterns Library — searchable, grouped grid of all 30 patterns
// from the existing catalogue: Bullish (10), Bearish (10), Neutral (5) and
// Multi-candle (5). Click a card -> /candlestick/[name]. Educational only.
import { useMemo, useState } from "react";
import Link from "next/link";
import { candlestickPatternDefs, type PatternType } from "@/src/lib/chart/candlestickPatterns";
import { multiCandlePatternNames } from "@/src/lib/chart/patternLanguage";

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
  if (type === "bullish") return "Bullish";
  if (type === "bearish") return "Bearish";
  return "Neutral";
}

function typeColor(type: PatternType): string {
  return type === "bullish" ? GREEN : type === "bearish" ? RED : GRAY;
}

/** Group heading + accent for the four library sections. */
interface PatternGroup {
  key: "bullish" | "bearish" | "neutral" | "multi";
  title: string;
  icon: string;
  color: string;
  names: string[];
}

function buildGroups(): PatternGroup[] {
  const multi = candlestickPatternDefs.filter((d) => multiCandlePatternNames.has(d.name));
  const bullish = candlestickPatternDefs.filter((d) => d.type === "bullish" && !multiCandlePatternNames.has(d.name));
  const bearish = candlestickPatternDefs.filter((d) => d.type === "bearish" && !multiCandlePatternNames.has(d.name));
  const neutral = candlestickPatternDefs.filter((d) => d.type === "neutral" && !multiCandlePatternNames.has(d.name));
  return [
    { key: "bullish", title: "Bullish", icon: "🟢", color: GREEN, names: bullish.map((d) => d.name) },
    { key: "bearish", title: "Bearish", icon: "🔴", color: RED, names: bearish.map((d) => d.name) },
    { key: "neutral", title: "Neutral", icon: "⚪", color: GRAY, names: neutral.map((d) => d.name) },
    { key: "multi", title: "Multi-candle", icon: "🟡", color: "#F0B90B", names: multi.map((d) => d.name) },
  ];
}

export default function CandlestickPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candlestickPatternDefs;
    return candlestickPatternDefs.filter(
      (d) => d.name.toLowerCase().includes(q) || d.romanUrdu.toLowerCase().includes(q) || d.matlab.toLowerCase().includes(q)
    );
  }, [query]);

  const groups = useMemo(() => buildGroups(), []);

  // Card rendering data keyed by name for quick lookup inside groups.
  const byName = useMemo(() => {
    const map = new Map<string, (typeof candlestickPatternDefs)[number]>();
    for (const def of filtered) map.set(def.name, def);
    return map;
  }, [filtered]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-4">
      <p className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>Library</p>
      <h1 className="mb-1 text-2xl font-bold" style={{ color: TEXT }}>🕯️ Candlestick Patterns Library</h1>
      <p className="mb-4 text-sm" style={{ color: MUTED }}>
        {candlestickPatternDefs.length} patterns available · Bullish 10 · Bearish 10 · Neutral 5 · Multi-candle 5
      </p>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search pattern..."
        className="mb-4 w-full rounded-xl border px-4 py-2.5 text-sm outline-none"
        style={{ backgroundColor: CARD, borderColor: BORDER, color: TEXT }}
      />

      {groups.map((group) => {
        const defs = group.names
          .map((name) => byName.get(name))
          .filter((def): def is (typeof candlestickPatternDefs)[number] => Boolean(def));
        if (defs.length === 0) return null;
        return (
          <section key={group.key} className="mb-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: group.color }}>
              <span aria-hidden="true">{group.icon}</span>
              {group.title} ({group.names.length})
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {defs.map((def) => (
                <Link
                  key={def.name}
                  href={`/candlestick/${encodeURIComponent(def.name)}`}
                  className="flex flex-col rounded-2xl border p-4 transition-colors hover:border-[#3b4252]"
                  style={{ backgroundColor: CARD, borderColor: BORDER }}
                >
                  <span className="text-2xl">{iconFor(def.type)}</span>
                  <span className="mt-2 text-sm font-bold" style={{ color: TEXT }}>{def.name}</span>
                  <span
                    className="mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ color: typeColor(def.type), backgroundColor: "rgba(255,255,255,0.06)" }}
                  >
                    {typeLabel(def.type)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm" style={{ color: MUTED }}>Koi pattern nahi mila.</p>
      )}

      <footer className="mt-6 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational only. Not financial advice.
      </footer>
    </main>
  );
}

