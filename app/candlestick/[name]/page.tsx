"use client";

// Candlestick pattern detail page. Reads the pattern name from the route and
// renders its catalogue entry (Roman Urdu explanation + how to act).
// Educational only. Not financial advice.
import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { candlestickPatternDefs, type PatternType } from "@/src/lib/chart/candlestickPatterns";

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

/** "Kya karein" — one educational next-step line driven by the pattern type. */
function actionFor(type: PatternType): string {
  if (type === "bullish") {
    return "Ek confirm green candle (higher close) ka wait karein, phir chhota risk ke saath soch samajh ke plan banayein. Stop-loss neeche rakhein. Educational only.";
  }
  if (type === "bearish") {
    return "Ek confirm red candle (lower close) ka wait karein. Upar ke levels par selling pressure badh sakta hai — risk manage karein. Educational only.";
  }
  return "Market confused hai. Direction pakki hone tak wait karein, abhi entry se bachein. Educational only.";
}

export default function CandlestickDetailPage() {
  const params = useParams();
  const rawName = Array.isArray(params.name) ? params.name[0] : params.name;
  const name = typeof rawName === "string" ? decodeURIComponent(rawName) : "";

  const def = useMemo(() => candlestickPatternDefs.find((d) => d.name === name), [name]);

  if (!def) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-4">
        <Link href="/candlestick" className="text-sm font-semibold" style={{ color: GREEN }}>← Back</Link>
        <p className="mt-6 text-center text-sm" style={{ color: MUTED }}>Pattern not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      <Link href="/candlestick" className="text-sm font-semibold" style={{ color: GREEN }}>← Back</Link>

      <div className="mt-3 rounded-2xl border p-5" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <h1 className="text-2xl font-bold" style={{ color: TEXT }}>{def.name}</h1>
        <span
          className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ color: typeColor(def.type), backgroundColor: "rgba(255,255,255,0.06)" }}
        >
          {typeLabel(def.type)}
        </span>

        <div className="mt-5 flex flex-col gap-4">
          <Block title="Ye kya hai" body={def.romanUrdu} />
          <Block title="Matlab kya hai" body={def.matlab} />
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
