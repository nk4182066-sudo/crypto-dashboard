"use client";

// Results & Tracking page — full A→Z breakdown of every tracked setup.
// Roman Urdu and English are shown TOGETHER in every section (no language tabs).
// Educational analysis only — not financial advice.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getSignals,
  cleanDuplicates,
  clearSignals,
  saveSignals,
  evaluateSignal,
  money,
  REFRESH_MS,
  type StoredSignal,
  type SignalStatus,
} from "@/src/lib/signalStorage";

const GREEN = "#00C087";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#848E9C";
const RED = "#F6465D";
const AMBER = "#F0B90B";

type StatusFilter = "all" | SignalStatus;
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

/** BTC-USD -> BTC/USD, EURUSD=X -> EUR/USD, GC=F -> GC. */
function displaySymbol(symbol: string): string {
  if (symbol.endsWith("=X")) return symbol.replace("=X", "").replace(/(.{3})(.{3})/, "$1/$2");
  if (symbol.endsWith("=F")) return symbol.replace("=F", "");
  return symbol.replace("-USD", "/USD").replace("-", "/");
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Score tier badge — 80+ are tracked, so every card is at least "Strong". */
function scoreTier(score: number): { emoji: string; label: string } {
  if (score >= 90) return { emoji: "🏆", label: "Excellent" };
  return { emoji: "⭐", label: "Strong" };
}

const statusMeta: Record<SignalStatus, { emoji: string; label: string; color: string }> = {
  SUCCESS: { emoji: "✅", label: "SUCCESS", color: GREEN },
  FAILED: { emoji: "❌", label: "FAILED", color: RED },
  PENDING: { emoji: "⏳", label: "PENDING", color: AMBER },
};

export default function ResultsPage() {
  const [records, setRecords] = useState<StoredSignal[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [time, setTime] = useState<TimeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  // Load stored history on mount (client-only; localStorage lives in the browser).
  // cleanDuplicates() drops any old per-symbol duplicates written before the
  // 24h guard existed, so the list shows at most one entry per coin.
  useEffect(() => {
    setRecords(cleanDuplicates());
    setLoading(false);
  }, []);

  // Auto-evaluation: fetch live quotes, resolve PENDING records (TP → SUCCESS,
  // SL → FAILED), persist and re-check every 30 seconds.
  useEffect(() => {
    let cancelled = false;

    async function evaluate() {
      const current = getSignals();
      if (!current.length) return;

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
          // No quote for this symbol → keep stored state, still refresh nothing.
          return price === undefined ? r : evaluateSignal(r, price);
        });

        if (!cancelled && JSON.stringify(updated) !== JSON.stringify(current)) {
          saveSignals(updated);
          setRecords(updated);
        }
        if (!cancelled) {
          setLastCheck(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
        }
      } catch {
        /* keep stored state on network failure */
      }
    }

    void evaluate();
    const id = window.setInterval(() => void evaluate(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Honest statistics — win rate is computed over RESOLVED setups only.
  const stats = useMemo(() => {
    const total = records.length;
    const wins = records.filter((r) => r.status === "SUCCESS").length;
    const losses = records.filter((r) => r.status === "FAILED").length;
    const pending = records.filter((r) => r.status === "PENDING").length;
    const resolved = wins + losses;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    return {
      total,
      wins,
      losses,
      pending,
      winPct: pct(wins),
      lossPct: pct(losses),
      pendingPct: pct(pending),
      resolved,
      winRate: resolved ? Math.round((wins / resolved) * 100) : 0,
    };
  }, [records]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return records.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (time === "today" && now - r.createdAt > day) return false;
      if (time === "week" && now - r.createdAt > 7 * day) return false;
      if (time === "month" && now - r.createdAt > 30 * day) return false;
      return true;
    });
  }, [records, status, time]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <Link href="/" className="text-sm font-semibold" style={{ color: GREEN }}>←</Link>
        <span className="text-[10px]" style={{ color: MUTED }}>
          ⏱ Auto-refresh: 30s{lastCheck ? ` · Last check: ${lastCheck}` : ""}
        </span>
      </div>

      <h1 className="mt-3 flex items-center gap-2 text-xl font-bold" style={{ color: TEXT }}>
        <span aria-hidden>📊</span> RESULTS &amp; TRACKING
      </h1>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: MUTED }}>
        Aap ke saved setups ka honest record — Roman Urdu aur English dono.
        <br />
        An honest record of your saved setups — in both Roman Urdu and English.
      </p>

      {/* Clear all history (local only). Educational data — wipes this device's records. */}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (confirm("Sab history delete karni hai? / Delete all history?")) {
              clearSignals();
              setRecords([]);
            }
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-90"
          style={{ backgroundColor: "rgba(246,70,93,0.12)", color: RED, border: `1px solid ${RED}` }}
        >
          🗑️ Clear History
        </button>
      </div>

      {/* Statistics — counts + honest percentages */}
      <div className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: GREEN }}>
          📈 STATISTICS / HISAAB
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Total", urdu: "Kul", value: stats.total, pct: 100, color: TEXT },
            { label: "Win", urdu: "Jeet", value: stats.wins, pct: stats.winPct, color: GREEN },
            { label: "Loss", urdu: "Haar", value: stats.losses, pct: stats.lossPct, color: RED },
            { label: "Pending", urdu: "Zer-e-ghaur", value: stats.pending, pct: stats.pendingPct, color: AMBER },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>
                {s.label} / {s.urdu}
              </p>
              <p className="text-[10px]" style={{ color: MUTED }}>{s.pct}%</p>
            </div>
          ))}
        </div>
        {/* Honest win rate — resolved setups only (pending ko count nahi karte). */}
        <div className="mt-3 flex items-baseline justify-between rounded-xl px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          <span className="text-xs" style={{ color: MUTED }}>
            Win Rate / Jeet ki sharaah
            <span className="ml-1 text-[10px]">({stats.resolved} resolved only)</span>
          </span>
          <span className="text-lg font-bold" style={{ color: stats.winRate >= 50 ? GREEN : RED }}>
            {stats.winRate}%
          </span>
        </div>
      </div>

      {/* Filters — status + time */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["all", "SUCCESS", "FAILED", "PENDING"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatus(f)}
            className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
            style={status === f ? { backgroundColor: GREEN, color: "#0B0E11" } : { backgroundColor: CARD, color: MUTED, border: `1px solid ${BORDER}` }}
          >
            {f === "all" ? "All / Sab" : `${statusMeta[f as SignalStatus].emoji} ${statusMeta[f as SignalStatus].label}`}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px sm:block" style={{ backgroundColor: BORDER }} />
        {([
          { key: "today" as TimeFilter, label: "Today / Aaj" },
          { key: "week" as TimeFilter, label: "Week / Hafte" },
          { key: "month" as TimeFilter, label: "Month / Mahine" },
          { key: "all" as TimeFilter, label: "All / Sab" },
        ]).map((tf) => (
          <button
            key={tf.key}
            onClick={() => setTime(tf.key)}
            className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
            style={time === tf.key ? { backgroundColor: CARD, color: GREEN, border: `1px solid ${GREEN}` } : { backgroundColor: "transparent", color: MUTED, border: `1px solid ${BORDER}` }}
          >
            {tf.label}
          </button>
        ))}
      </div>


      {/* Result cards — full A→Z detail, both languages together */}
      <div className="mt-4 flex flex-col gap-4">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-40 rounded-2xl" style={{ backgroundColor: CARD }} />
            <div className="h-40 rounded-2xl" style={{ backgroundColor: CARD }} />
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ backgroundColor: CARD, borderColor: BORDER }}>
            <p className="text-sm font-semibold" style={{ color: TEXT }}>
              No analysis yet. Signals page se start karein.
            </p>
            <p className="mt-1 text-xs" style={{ color: MUTED }}>
              Abhi tak koi analysis nahi. High-confluence setups yahan save honge.
            </p>
            <Link
              href="/signals"
              className="mt-4 inline-block rounded-lg px-4 py-2 text-xs font-bold"
              style={{ backgroundColor: GREEN, color: "#0B0E11" }}
            >
              💎 Signals kholo / Open Signals →
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ backgroundColor: CARD, borderColor: BORDER }}>
            <p className="text-sm" style={{ color: MUTED }}>
              Is filter mein kuch nahi mila. / Nothing matches this filter.
            </p>
          </div>
        ) : (
          filtered.map((r) => <ResultCard key={r.id} record={r} />)
        )}
      </div>

      <p className="mt-6 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Past performance is not a guarantee. Past performance future results ki guarantee nahi.
        <br />
        Educational analysis only — not financial advice.
      </p>
    </main>
  );
}

/** One label/value row in the card. */
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-sm">
      <span style={{ color: MUTED }}>{label}</span>
      <span className="font-semibold" style={{ color: color ?? TEXT }}>{value}</span>
    </div>
  );
}

/** Section heading inside a card. */
function Section({ title }: { title: string }) {
  return (
    <p className="mt-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: GREEN }}>
      {title}
    </p>
  );
}

/** Bilingual paragraph — Roman Urdu first, English below (never tabbed). */
function Both({ urdu, english }: { urdu: string; english: string }) {
  return (
    <div className="mt-1.5 space-y-2">
      <div className="rounded-lg p-2.5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: AMBER }}>Roman Urdu:</p>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: TEXT }}>{urdu}</p>
      </div>
      <div className="rounded-lg p-2.5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: GREEN }}>English:</p>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: TEXT }}>{english}</p>
      </div>
    </div>
  );
}


/** Full A→Z card for one tracked setup — every section in both languages. */
function ResultCard({ record: r }: { record: StoredSignal }) {
  const meta = statusMeta[r.status];
  const tier = scoreTier(r.score);
  const isBull = r.direction !== "bearish";

  const slMark = r.status === "FAILED" && r.hitTarget === "SL" ? " ❌ HIT" : "";

  const whyTitle =
    r.status === "SUCCESS" ? "📈 WHY IT SUCCEEDED / KYUN KAMYAB HUA"
      : r.status === "FAILED" ? "❌ WHY IT FAILED / KYUN NAKAAMYAB"
        : "⏳ WHY IT IS PENDING / ABHI ZER-E-GHAUR";

  return (
    <div className="rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
      {/* Header — status, symbol, date, score */}
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{ color: meta.color, backgroundColor: "rgba(255,255,255,0.06)" }}
        >
          {meta.emoji} {meta.label}
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ color: MUTED, backgroundColor: "rgba(255,255,255,0.06)" }}>
          {r.market}
        </span>
      </div>
      <h2 className="mt-2 text-base font-bold" style={{ color: TEXT }}>
        {displaySymbol(r.symbol)} — {fmtDate(r.createdAt)}
      </h2>
      <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
        Score: {r.score}/100 {tier.emoji} {tier.label}
      </p>

      {/* 📊 Market analysis */}
      <Section title="📊 MARKET ANALYSIS / BAZAR KA TAJZIYA" />
      <div className="mt-1">
        <Row label="Trend / Rujhan" value={r.trend} />
        <Row label="Pattern" value={r.pattern} />
        <Row label="Candlestick" value={r.candlestick} />
        <Row label="Support" value={money(r.support)} color={GREEN} />
        <Row label="Resistance" value={money(r.resistance)} color={RED} />
        <Row label="Current Price / Abqi qeemat" value={money(r.currentPrice)} />
      </div>

      {/* 🎯 Trade setup — dono entries, SL, teen targets */}
      <Section title="🎯 TRADE SETUP / TRADE KA PLAN" />
      <div className="mt-1">
        {isBull ? (
          <>
            <Row label="Entry 1 (aggressive)" value={money(r.entry1)} />
            <Row label="Entry 2 (conservative)" value={money(r.entry2)} />
          </>
        ) : (
          <Row label="Entry (bearish)" value={money(r.entry1)} />
        )}
        <Row label="Stop Loss / Nuqsan bandi" value={`${money(r.stopLoss)}${slMark}`} color={slMark ? RED : TEXT} />
        {([
          { tp: "TP1" as const, value: r.tp1 },
          { tp: "TP2" as const, value: r.tp2 },
          { tp: "TP3" as const, value: r.tp3 },
        ]).map(({ tp, value }) => {
          // Hit level gets ✅; unresolved targets show context for resolved setups.
          let note = "";
          if (r.status === "SUCCESS") note = r.hitTarget === tp ? " ✅ HIT" : "  (Not reached)";
          else if (r.status === "FAILED") note = "  (Not hit)";
          else note = "  ⏳";
          const hit = r.status === "SUCCESS" && r.hitTarget === tp;
          return <Row key={tp} label={tp} value={`${money(value)}${note}`} color={hit ? GREEN : TEXT} />;
        })}
      </div>

      {/* 📈/❌ Why it succeeded / failed — dono zubaan */}
      <Section title={whyTitle} />
      <Both urdu={r.whyUrdu} english={r.whyEnglish} />

      {/* 📚 Lesson / Sabaq — dono zubaan */}
      <Section title="📚 LESSON / SABAQ" />
      <Both urdu={r.lessonUrdu} english={r.lessonEnglish} />

      <p className="mt-3 text-[10px]" style={{ color: MUTED }}>
        ⚠️ Educational only — not financial advice.
      </p>
    </div>
  );
}

