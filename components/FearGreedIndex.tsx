"use client";

/**
 * Fear & Greed Index shows market sentiment.
 * Educational only. Not financial advice.
 */

import { useEffect, useState } from "react";

interface FngEntry {
  value: string;
  value_classification: string;
  timestamp: string;
}
interface FngResponse {
  data?: FngEntry[];
}

type ZoneKey = "extremeFear" | "fear" | "neutral" | "greed" | "extremeGreed";

interface Zone {
  label: string;
  chip: string;
  bar: string;
  note: string;
}

/** Zone thresholds and Roman Urdu wording. Observational only — no buy/sell cues. */
const ZONES: Array<{ min: number; key: ZoneKey }> = [
  { min: 76, key: "extremeGreed" }, { min: 56, key: "greed" }, { min: 46, key: "neutral" },
  { min: 26, key: "fear" }, { min: 0, key: "extremeFear" },
];

const ZONE_TEXT: Record<ZoneKey, Zone> = {
  extremeFear: {
    label: "Extreme Fear", chip: "bg-red-500/15 text-red-400 border-red-500/40", bar: "bg-red-500",
    note: "Log bohot dare hue hain. Aisi situations mein experienced traders khareedte hain.",
  },
  fear: {
    label: "Fear", chip: "bg-orange-500/15 text-orange-400 border-orange-500/40", bar: "bg-orange-500",
    note: "Log thoda dare hue hain. Market mein uncertainty hai.",
  },
  neutral: {
    label: "Neutral", chip: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40", bar: "bg-zinc-500",
    note: "Market neutral hai. Clear direction nahi.",
  },
  greed: {
    label: "Greed", chip: "bg-lime-500/15 text-lime-400 border-lime-500/40", bar: "bg-lime-500",
    note: "Log lalchi ho rahe hain. Careful raho.",
  },
  extremeGreed: {
    label: "Extreme Greed", chip: "bg-emerald-700/20 text-emerald-500 border-emerald-600/50", bar: "bg-emerald-700",
    note: "Log bohot zyada lalchi hain. Aisi situations mein experienced traders bechte hain.",
  },
};

function zoneFor(value: number): Zone {
  const match = ZONES.find((entry) => value >= entry.min);
  return ZONE_TEXT[match?.key ?? "neutral"];
}

async function fetchIndex(): Promise<number | null> {
  try {
    const response = await fetch("https://api.alternative.me/fng/?limit=1&format=json", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as FngResponse;
    const raw = Number(payload.data?.[0]?.value);
    return Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : null;
  } catch {
    return null;
  }
}

export default function FearGreedIndex() {
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const next = await fetchIndex();
      if (!active) return;
      if (next !== null) setValue(next);
      setLoading(false);
    };
    void load();
    const timer = setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const zone = zoneFor(value ?? 50);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-300">😱 FEAR & GREED INDEX</h3>

      {loading ? (
        <p className="mt-4 text-zinc-400">Loading sentiment data...</p>
      ) : value === null ? (
        <p className="mt-4 text-zinc-400">Sentiment feed unavailable. Thodi der baad watch karein.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className={`grid h-24 w-24 place-items-center rounded-full border-4 ${zone.chip}`}>
              <span className="text-3xl font-bold">{value}</span>
            </div>
            <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${zone.chip}`}>{zone.label}</span>
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className={`h-full rounded-full ${zone.bar}`} style={{ width: `${value}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
            <span>0</span>
            <span>100</span>
          </div>

          <p className="mt-3 leading-relaxed text-zinc-400">{zone.note}</p>
        </>
      )}

      <p className="mt-3 border-t border-zinc-800 pt-2 text-[11px] text-zinc-500">
        ⚠️ Ye sirf analysis hai. Faisla apna khud karein.
      </p>
    </section>
  );
}
