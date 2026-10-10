"use client";

// Chart Patterns Library — searchable grid of all 25 chart patterns from the
// existing catalogue. Click a card -> /chart-patterns/[name]. Educational only.
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { chartPatternDefs, type PatternCategory, type PatternType } from "@/src/lib/chart/chartPatterns";

const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F6465D";
const GRAY = "#9CA3AF";

/**
 * Har pattern ka apna chhota SVG shape: price path uske type color mein
 * (bullish green / bearish red) aur guide lines white. Educational only.
 */
function PatternThumb({ name, type }: { name: string; type: PatternType }) {
  const price = {
    stroke: typeColor(type),
    fill: "none",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const guide = {
    stroke: "#FFFFFF",
    strokeDasharray: "4 4",
    strokeWidth: 1.5,
  };

  let shape: ReactNode;
  switch (name) {
    // ── Reversal shapes ──
    case "Double Bottom": // W shape + neckline
      shape = (
        <>
          <path d="M10,30 L50,72 L90,30 L130,72 L170,30" {...price} />
          <line x1="10" y1="30" x2="190" y2="30" {...guide} />
        </>
      );
      break;
    case "Double Top": // M shape + support line
      shape = (
        <>
          <path d="M10,70 L50,28 L90,70 L130,28 L170,70" {...price} />
          <line x1="10" y1="70" x2="190" y2="70" {...guide} />
        </>
      );
      break;
    case "Triple Top": // 3 peaks + support line
      shape = (
        <>
          <path d="M8,68 L38,30 L66,68 L98,30 L126,68 L158,30 L188,68" {...price} />
          <line x1="8" y1="68" x2="190" y2="68" {...guide} />
        </>
      );
      break;
    case "Triple Bottom": // 3 valleys + neckline
      shape = (
        <>
          <path d="M8,32 L38,70 L66,32 L98,70 L126,32 L158,70 L188,32" {...price} />
          <line x1="8" y1="32" x2="190" y2="32" {...guide} />
        </>
      );
      break;
    case "Head & Shoulders": // 3 peaks (middle sab se ooncha) + neckline
      shape = (
        <>
          <path d="M10,64 L44,34 L68,64 L100,20 L132,64 L156,34 L190,64" {...price} />
          <line x1="10" y1="64" x2="190" y2="64" {...guide} />
        </>
      );
      break;
    case "Inverse Head & Shoulders": // ulte 3 peaks + neckline
      shape = (
        <>
          <path d="M10,36 L44,66 L68,36 L100,80 L132,36 L156,66 L190,36" {...price} />
          <line x1="10" y1="36" x2="190" y2="36" {...guide} />
        </>
      );
      break;
    case "Cup & Handle": // U shape + chhota dip
      shape = (
        <>
          <path d="M10,30 C48,96 104,96 142,36 L156,50 L168,38 L184,34" {...price} />
          <line x1="10" y1="30" x2="190" y2="30" {...guide} />
        </>
      );
      break;
    case "Inverse Cup & Handle": // ulta U + chhoti rally
      shape = (
        <>
          <path d="M10,70 C48,4 104,4 142,64 L156,50 L168,62 L184,66" {...price} />
          <line x1="10" y1="70" x2="190" y2="70" {...guide} />
        </>
      );
      break;
    case "Rounding Top": // dhali hui choti
      shape = (
        <>
          <path d="M10,72 C62,4 138,4 190,72" {...price} />
          <line x1="10" y1="72" x2="190" y2="72" {...guide} />
        </>
      );
      break;
    case "Rounding Bottom": // goli jaisi tal
      shape = (
        <>
          <path d="M10,28 C62,96 138,96 190,28" {...price} />
          <line x1="10" y1="28" x2="190" y2="28" {...guide} />
        </>
      );
      break;
    // ── Continuation shapes ──
    case "Ascending Triangle": // flat resistance + chadhti hui support
      shape = (
        <>
          <line x1="10" y1="32" x2="190" y2="32" {...guide} />
          <line x1="10" y1="86" x2="190" y2="42" {...guide} />
          <path d="M14,80 L52,44 L86,76 L122,50 L158,70 L184,40" {...price} />
        </>
      );
      break;
    case "Descending Triangle": // flat support + girti hui resistance
      shape = (
        <>
          <line x1="10" y1="68" x2="190" y2="68" {...guide} />
          <line x1="10" y1="30" x2="190" y2="60" {...guide} />
          <path d="M14,38 L52,64 L86,44 L122,62 L158,50 L184,66" {...price} />
        </>
      );
      break;
    case "Symmetrical Triangle": // dono lines converge karti hain
      shape = (
        <>
          <line x1="10" y1="30" x2="190" y2="58" {...guide} />
          <line x1="10" y1="88" x2="190" y2="64" {...guide} />
          <path d="M14,78 L52,42 L86,70 L122,48 L158,64 L184,56" {...price} />
        </>
      );
      break;
    case "Bull Flag": // pole + neeche jhuka rectangle
      shape = (
        <>
          <path d="M18,88 L46,32" {...price} />
          <path d="M46,32 L98,48 L98,74 L46,58 Z" {...guide} />
          <path d="M98,48 L178,22" {...price} />
        </>
      );
      break;
    case "Bear Flag": // pole + ooncha rectangle
      shape = (
        <>
          <path d="M18,14 L46,70" {...price} />
          <path d="M46,70 L98,54 L98,28 L46,44 Z" {...guide} />
          <path d="M98,54 L178,80" {...price} />
        </>
      );
      break;
    case "Pennant": // pole + chhota triangle
      shape = (
        <>
          <path d="M18,88 L54,30" {...price} />
          <path d="M54,30 L110,52 L54,70" {...guide} />
          <path d="M110,52 L180,26" {...price} />
        </>
      );
      break;
    case "Rising Wedge": // converge karti hui chadhti hui lines
      shape = (
        <>
          <line x1="10" y1="84" x2="190" y2="40" {...guide} />
          <line x1="10" y1="96" x2="190" y2="46" {...guide} />
          <path d="M16,90 L56,58 L96,74 L136,52 L176,60" {...price} />
        </>
      );
      break;
    case "Falling Wedge": // converge karti hui girti hui lines
      shape = (
        <>
          <line x1="10" y1="26" x2="190" y2="72" {...guide} />
          <line x1="10" y1="12" x2="190" y2="64" {...guide} />
          <path d="M16,18 L56,50 L96,34 L136,56 L176,46" {...price} />
        </>
      );
      break;
    case "Rectangle": // horizontal channel
      shape = (
        <>
          <line x1="10" y1="30" x2="190" y2="30" {...guide} />
          <line x1="10" y1="72" x2="190" y2="72" {...guide} />
          <path d="M14,66 L54,36 L94,66 L134,36 L174,66" {...price} />
        </>
      );
      break;
    case "Channel Up": // chadhti hui parallel lines
      shape = (
        <>
          <line x1="10" y1="86" x2="190" y2="44" {...guide} />
          <line x1="10" y1="58" x2="190" y2="16" {...guide} />
          <path d="M16,78 L56,52 L96,60 L136,32 L176,42" {...price} />
        </>
      );
      break;
    case "Channel Down": // girti hui parallel lines
      shape = (
        <>
          <line x1="10" y1="16" x2="190" y2="58" {...guide} />
          <line x1="10" y1="44" x2="190" y2="86" {...guide} />
          <path d="M16,40 L56,33 L96,60 L136,52 L176,80" {...price} />
        </>
      );
      break;
    case "Diamond": // heere jaisa outline
      shape = (
        <>
          <path d="M100,16 L176,52 L100,88 L24,52 Z" {...guide} />
          <path d="M56,52 L84,36 L112,64 L144,52" {...price} />
        </>
      );
      break;
    // ── Harmonic shapes (X-A-B-C-D zigzag) ──
    case "Gartley":
    case "Butterfly":
    case "Bat":
      shape = (
        <>
          <path d="M14,80 L58,24 L100,64 L138,34 L184,74" {...price} />
          <line x1="100" y1="74" x2="192" y2="74" {...guide} />
        </>
      );
      break;
    default: // koi unknown naam ho to generic zigzag
      shape = <path d="M10,70 L50,30 L90,66 L130,34 L170,58" {...price} />;
  }

  return (
    <svg viewBox="0 0 200 100" className="h-20 w-full" fill="none" aria-hidden="true">
      {shape}
    </svg>
  );
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
            <PatternThumb name={def.name} type={def.type} />
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

