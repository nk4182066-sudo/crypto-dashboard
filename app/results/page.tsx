"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  loadSignalHistory,
  saveSignalHistory,
  evaluateStatus,
  type SignalRecord,
  type SetupStatus,
} from "@/src/lib/signalHistory";

const GREEN = "#00C087";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#848E9C";
const RED = "#F6465D";
const AMBER = "#F0B90B";
const LANG_KEY = "results-language";
type Lang = "urdu" | "english";
type StatusFilter = "all" | SetupStatus;
type TimeFilter = "today" | "week" | "month" | "all";

/** Normalize any symbol to a base key so "BTC-USD"/"BTCUSDT" match. */
function baseKey(symbol: string): string {
  return symbol
    .toUpperCase()
    .replace(/[/\s]/g, "")
    .replace(/-USD$/, "")
    .replace(/USD$/, "")
    .replace(/USDT$/, "")
    .replace(/=X$/, "");
}

function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 1 ? 2 : 4 })}`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const statusMeta: Record<SetupStatus, { emoji: string; label: string; color: string }> = {
  success: { emoji: "✅", label: "Success", color: GREEN },
  failed: { emoji: "❌", label: "Failed", color: RED },
  pending: { emoji: "⏳", label: "Pending", color: AMBER },
};

export default function ResultsPage() {
  const [records, setRecords] = useState<SignalRecord[]>([]);
  const [lang, setLang] = useState<Lang>("urdu");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [time, setTime] = useState<TimeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  // Restore language preference (default Roman Urdu) and load stored history.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored === "english" || stored === "urdu") setLang(stored);
    } catch { /* ignore */ }
    setRecords(loadSignalHistory());
    setLoading(false);
  }, []);

  function changeLang(next: Lang) {
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* ignore */ }
  }

  // Live re-evaluation: fetch quotes, score PENDING records, persist, re-check every 5 min.
  useEffect(() => {
    let cancelled = false;

    async function evaluate() {
      const current = loadSignalHistory();
      if (!current.length) return;
      if (current.every((r) => r.status !== "pending")) return;

      try {
        const res = await fetch("/api/market/all-coins", { cache: "no-store" });
        const data = await res.json();
        const coins: Array<{ symbol: string; currentPrice: number }> = Array.isArray(data?.coins) ? data.coins : [];
        const priceMap = new Map<string, number>();
        for (const c of coins) {
          if (typeof c?.symbol === "string" && Number.isFinite(c?.currentPrice)) {
            priceMap.set(baseKey(c.symbol), c.currentPrice);
          }
        }

        const updated = current.map((r) => {
          const price = priceMap.get(baseKey(r.symbol));
          if (price === undefined) return r;
          return { ...r, status: evaluateStatus(r, price) };
        });

        if (!cancelled && JSON.stringify(updated) !== JSON.stringify(current)) {
          saveSignalHistory(updated);
          setRecords(updated);
        }
        if (!cancelled) setLastCheck(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      } catch { /* keep stored state on network failure */ }
    }

    evaluate();
    const id = setInterval(evaluate, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const stats = useMemo(() => {
    const total = records.length;
    const wins = records.filter((r) => r.status === "success").length;
    const losses = records.filter((r) => r.status === "failed").length;
    const pending = records.filter((r) => r.status === "pending").length;
    const resolved = wins + losses;
    const winRate = resolved ? Math.round((wins / resolved) * 100) : 0;
    return { total, wins, losses, pending, winRate };
  }, [records]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return records.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (time === "today" && now - r.date > day) return false;
      if (time === "week" && now - r.date > 7 * day) return false;
      if (time === "month" && now - r.date > 30 * day) return false;
      return true;
    });
  }, [records, status, time]);

  // ── Bilingual copy ──
  const t = {
    subtitle: lang === "urdu"
      ? "Aap ke saved setups ka honest record. Past performance future guarantee nahi."
      : "An honest record of your saved setups. Past performance is not a guarantee of future results.",
    langUrdu: "Roman Urdu",
    langEnglish: "English",
    statsTitle: "STATISTICS",
    total: lang === "urdu" ? "Total" : "Total",
    wins: lang === "urdu" ? "Win" : "Win",
    losses: lang === "urdu" ? "Loss" : "Loss",
    pending: lang === "urdu" ? "Pending" : "Pending",
    winRate: lang === "urdu" ? "Win Rate" : "Win Rate",
    lastCheck: lang === "urdu" ? "Aakhri check" : "Last check",
    all: lang === "urdu" ? "All" : "All",
    success: lang === "urdu" ? "Success" : "Success",
    failed: lang === "urdu" ? "Failed" : "Failed",
    pend: lang === "urdu" ? "Pending" : "Pending",
    timeAll: lang === "urdu" ? "All time" : "All time",
    timeToday: lang === "urdu" ? "Aaj" : "Today",
    timeWeek: lang === "urdu" ? "Hafte" : "Week",
    timeMonth: lang === "urdu" ? "Mahine" : "Month",
    keyLevels: lang === "urdu" ? "KEY LEVELS" : "KEY LEVELS",
    entry: lang === "urdu" ? "Entry" : "Entry",
    target: lang === "urdu" ? "Target" : "Target",
    support: lang === "urdu" ? "Support" : "Support",
    resistance: lang === "urdu" ? "Resistance" : "Resistance",
    hit: lang === "urdu" ? "Hit" : "Hit",
    notHit: lang === "urdu" ? "Not hit" : "Not hit",
    emptyTitle: lang === "urdu" ? "Abhi tak koi analysis nahi." : "No analysis yet.",
    emptyBody: lang === "urdu"
      ? "Signals page se shuru karein. High-confluence setups yahan save honge."
      : "Start from the Signals page. High-confluence setups will be saved here.",
    emptyFilter: lang === "urdu" ? "Is filter mein kuch nahi mila." : "Nothing matches this filter.",
    disclaimer: lang === "urdu"
      ? "⚠️ Past performance future results ki guarantee nahi. Educational only — not financial advice."
      : "⚠️ Past performance is not a guarantee of future results. Educational only — not financial advice.",
  };

  const langTabs = (
    <div className="flex shrink-0 items-center gap-1 rounded-full border p-1" style={{ backgroundColor: CARD, borderColor: BORDER }}>
      {(["urdu", "english"] as Lang[]).map((k) => (
        <button
          key={k}
          onClick={() => changeLang(k)}
          aria-pressed={lang === k}
          className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          style={lang === k ? { backgroundColor: GREEN, color: "#0B0E11" } : { color: MUTED, backgroundColor: "transparent" }}
        >
          {k === "urdu" ? t.langUrdu : t.langEnglish}
        </button>
      ))}
    </div>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <Link href="/" className="text-sm font-semibold" style={{ color: GREEN }}>←</Link>
        {langTabs}
      </div>

      <h1 className="mt-3 flex items-center gap-2 text-xl font-bold" style={{ color: TEXT }}>
        <span aria-hidden>📊</span> RESULTS &amp; TRACKING
      </h1>
      <p className="mt-1 text-xs" style={{ color: MUTED }}>{t.subtitle}</p>

      {/* Statistics */}
      <div className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: GREEN }}>{t.statsTitle}</p>
          {lastCheck && <span className="text-[10px]" style={{ color: MUTED }}>{t.lastCheck}: {lastCheck}</span>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: t.total, value: stats.total, color: TEXT },
            { label: t.wins, value: stats.wins, color: GREEN },
            { label: t.losses, value: stats.losses, color: RED },
            { label: t.pending, value: stats.pending, color: AMBER },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>{s.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-xs" style={{ color: MUTED }}>{t.winRate}</span>
          <span className="text-lg font-bold" style={{ color: stats.winRate >= 50 ? GREEN : RED }}>{stats.winRate}%</span>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["all", "success", "failed", "pending"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatus(f)}
            className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
            style={status === f ? { backgroundColor: GREEN, color: "#0B0E11" } : { backgroundColor: CARD, color: MUTED, border: `1px solid ${BORDER}` }}
          >
            {f === "all" ? t.all : f === "success" ? t.success : f === "failed" ? t.failed : t.pend}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px sm:block" style={{ backgroundColor: BORDER }} />
        {(["all", "today", "week", "month"] as TimeFilter[]).map((tf) => (
          <button
            key={tf}
            onClick={() => setTime(tf)}
            className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
            style={time === tf ? { backgroundColor: CARD, color: GREEN, border: `1px solid ${GREEN}` } : { backgroundColor: "transparent", color: MUTED, border: `1px solid ${BORDER}` }}
          >
            {tf === "all" ? t.timeAll : tf === "today" ? t.timeToday : tf === "week" ? t.timeWeek : t.timeMonth}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="mt-4 flex flex-col gap-4">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-40 rounded-2xl" style={{ backgroundColor: CARD }} />
            <div className="h-40 rounded-2xl" style={{ backgroundColor: CARD }} />
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ backgroundColor: CARD, borderColor: BORDER }}>
            <p className="text-sm font-semibold" style={{ color: TEXT }}>{t.emptyTitle}</p>
            <p className="mt-1 text-xs" style={{ color: MUTED }}>{t.emptyBody}</p>
            <Link href="/signals" className="mt-4 inline-block rounded-lg px-4 py-2 text-xs font-bold" style={{ backgroundColor: GREEN, color: "#0B0E11" }}>
              {lang === "urdu" ? "Signals kholo →" : "Open Signals →"}
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ backgroundColor: CARD, borderColor: BORDER }}>
            <p className="text-sm" style={{ color: MUTED }}>{t.emptyFilter}</p>
          </div>
        ) : (
          filtered.map((r) => {
            const meta = statusMeta[r.status];
            const isBull = r.direction !== "bearish";
            const targetHit = r.status === "success";
            const explanation = lang === "urdu" ? r.explanationUrdu : r.explanationEnglish;
            return (
              <div key={r.id} className="rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ color: meta.color, backgroundColor: "rgba(255,255,255,0.06)" }}>
                    {meta.emoji} {meta.label}
                  </span>
                  <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ color: MUTED, backgroundColor: "rgba(255,255,255,0.06)" }}>
                    {r.market}
                  </span>
                </div>

                <h2 className="mt-2 text-base font-bold" style={{ color: TEXT }}>
                  {r.symbol} — {r.pattern}
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
                  {fmtDate(r.date)} — Score: {r.score}/100
                </p>

                <div className="mt-3">
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: GREEN }}>🎓 TEACHER EXPLANATION</p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: TEXT }}>{explanation}</p>
                </div>

                <div className="mt-3">
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: GREEN }}>{t.keyLevels}</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    <li className="flex justify-between"><span style={{ color: MUTED }}>{t.entry}</span><span style={{ color: TEXT }}>{fmtMoney(r.entryPrice)}</span></li>
                    <li className="flex justify-between">
                      <span style={{ color: MUTED }}>{t.target}</span>
                      <span style={{ color: targetHit ? GREEN : TEXT }}>
                        {fmtMoney(r.targetPrice)} {targetHit ? `✅ ${t.hit}` : r.status === "failed" ? `❌ ${t.notHit}` : "⏳"}
                      </span>
                    </li>
                    <li className="flex justify-between"><span style={{ color: MUTED }}>{t.support}</span><span style={{ color: TEXT }}>{fmtMoney(r.support)}</span></li>
                    <li className="flex justify-between"><span style={{ color: MUTED }}>{t.resistance}</span><span style={{ color: TEXT }}>{fmtMoney(r.resistance)}</span></li>
                  </ul>
                </div>

                {r.status !== "pending" && (
                  <div className="mt-3 rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: isBull ? GREEN : RED }}>
                      📊 {lang === "urdu" ? "KYA HUA" : "WHAT HAPPENED"}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs" style={{ color: TEXT }}>
                      <li>- Trend: {isBull ? "Bullish" : "Bearish"}</li>
                      <li>- Pattern: {r.pattern}</li>
                      <li>- {t.target}: {targetHit ? `Achieved (${fmtMoney(r.targetPrice)})` : `Not achieved (${fmtMoney(r.targetPrice)})`}</li>
                      {r.status === "failed" && (
                        <li>- {lang === "urdu" ? "Sabak" : "Lesson"}: {lang === "urdu"
                          ? "Technical analysis akela kaafi nahi. News events aur stop loss zaroori hai."
                          : "Technical analysis alone is not enough. Watch news events and always use a stop loss."}</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="mt-6 text-center text-xs" style={{ color: MUTED }}>{t.disclaimer}</p>
    </main>
  );
}

