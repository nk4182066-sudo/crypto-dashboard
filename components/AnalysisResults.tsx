"use client";

import { Fragment, useEffect, useState } from "react";

type Bias = "Bullish" | "Bearish" | "Neutral";
type Result = "Win" | "Loss";
type Filter = "All" | "Wins" | "Losses";
type AnalysisRecord = { id: string; date: string; symbol: string; bias: Bias; score: number; result: Result; reason: string; whyFailed?: string; marketCondition?: string; lesson?: string; };

const STORAGE_KEY = "analysis-results-v1";
const EVENT_NAME = "analysis-results-updated";
const FILTERS: Filter[] = ["All", "Wins", "Losses"];

function loadRecords(): AnalysisRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (Array.isArray(parsed)) return parsed as AnalysisRecord[];
  } catch { /* storage blocked or corrupt */ }
  return [];
}

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const biasColor: Record<Bias, string> = { Bullish: "text-emerald-400", Bearish: "text-rose-400", Neutral: "text-zinc-400" };

function Stat({ label, urdu, value, tone = "text-white" }: { label: string; urdu: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] text-zinc-400">{urdu}</p>
    </div>
  );
}

function Detail({ term, value, tone = "text-zinc-300" }: { term: string; value?: string; tone?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-zinc-500">{term}</dt>
      <dd className={tone}>{value ?? "Not recorded"}</dd>
    </div>
  );
}

export function saveAnalysis(entry: Omit<AnalysisRecord, "id">): void {
  try {
    const next = [{ id: `a${Date.now()}`, ...entry }, ...loadRecords()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch { /* storage full or blocked */ }
}

export default function AnalysisResults() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setRecords(loadRecords());
    sync();
    window.addEventListener(EVENT_NAME, sync);
    return () => window.removeEventListener(EVENT_NAME, sync);
  }, []);

  const wins = records.filter((r) => r.result === "Win").length;
  const losses = records.length - wins;
  const winRate = records.length === 0 ? 0 : Math.round((wins / records.length) * 1000) / 10;
  const visible = records.filter((r) => filter === "All" || (filter === "Wins" ? r.result === "Win" : r.result === "Loss"));

  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 sm:p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-bold tracking-wide text-white">📈 ANALYSIS RESULTS</h2>
        <p className="text-sm text-zinc-400">Honest record of every published analysis</p>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total analyses" urdu="Kul analyses" value={String(records.length)} />
        <Stat label="Wins" urdu="Sahi picks" value={String(wins)} tone="text-emerald-400" />
        <Stat label="Losses" urdu="Ghalat Analysis" value={String(losses)} tone="text-rose-400" />
        <Stat label="Win Rate" urdu="Sahi Analysis" value={`${winRate}%`} tone="text-sky-400" />
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Result filters">
        {FILTERS.map((name) => (
          <button key={name} type="button" onClick={() => setFilter(name)} aria-pressed={filter === name}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${filter === name ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"}`}>
            {name}
          </button>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Bias</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">Wajah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {visible.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-500">Abhi tak koi analysis nahi. Chart se start karein.</td></tr>}
            {visible.map((rec) => (
              <Fragment key={rec.id}>
                <tr
                  onClick={rec.result === "Loss" ? () => setOpenId(openId === rec.id ? null : rec.id) : undefined}
                  className={rec.result === "Loss" ? "cursor-pointer bg-zinc-900/40 hover:bg-zinc-900" : undefined}
                >
                  <td className="px-3 py-2 text-zinc-300">{fmtDate(rec.date)}</td>
                  <td className="px-3 py-2 font-semibold text-white">{rec.symbol}</td>
                  <td className={`px-3 py-2 ${biasColor[rec.bias]}`}>{rec.bias}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-300">{rec.score}</td>
                  <td className={`px-3 py-2 font-semibold ${rec.result === "Win" ? "text-emerald-400" : "text-rose-400"}`}>
                    {rec.result === "Win" ? "✅ Win" : "❌ Loss"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{rec.reason}</td>
                </tr>
                {rec.result === "Loss" && openId === rec.id && (
                  <tr className="bg-zinc-950/80">
                    <td colSpan={6} className="px-3 py-3">
                      <dl className="space-y-1 text-xs">
                        <Detail term="Kyun fail hui" value={rec.whyFailed} tone="text-rose-300" />
                        <Detail term="Us waqt market ka hal" value={rec.marketCondition} />
                        <Detail term="Lesson to learn" value={rec.lesson} tone="text-emerald-300" />
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">Tap a ❌ Loss row to see why it failed, market condition, and lesson.</p>
      <div className="space-y-1 border-t border-zinc-800 pt-3">
        <p className="text-xs font-semibold text-amber-400/90">⚠️ Past performance is not a guarantee of future results.</p>
        <p className="text-xs text-zinc-500">Educational tracking only. Not financial advice.</p>
      </div>
    </section>
  );
}

