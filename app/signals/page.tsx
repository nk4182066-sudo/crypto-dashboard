"use client";
import AuthGuard from "@/components/AuthGuard";

// AI Setups page. Clean like /markets: market tabs, then every scanned setup
// for that market (all-coins API scans the full universe), sorted by score
// highest first. Educational analysis only — never "Buy now", "accuracy", "Guaranteed", "signal".
// Neutral educational tone — educational analysis only.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PatternLanguageTabs, { type PatternDetailLanguage } from "@/components/PatternLanguageTabs";
import { generateFullSignal, type FullSignal } from "@/src/lib/signalGenerator";
import { analyzeCoin } from "@/src/lib/analyzeCoin";
import { saveSignal, MIN_SCORE, DISPLAY_MIN_SCORE } from "@/src/lib/signalStorage";
import { CandlestickVisual, ChartPatternVisual } from "@/components/PatternVisuals";
import { TrendBadge, ConfirmationSection, IndicatorPanel, ExpertPanel, GuidanceSection } from "@/components/AnalysisInsights";
import { buildGuidance, type ConfirmationIndicator, type Consensus, type EducatorVerdict } from "@/src/lib/confirmations";
import type { IndicatorRow } from "@/src/lib/indicatorEngine";
import type { CloudDoc } from "@/src/lib/signalCloud";
import { assetKey } from "@/src/lib/signalIdentity";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Pulls one timeframe of candles; [] on any failure. */
async function fetchCandles(market: string, symbol: string, timeframe: string): Promise<Candle[]> {
  try {
    const query = new URLSearchParams({ market, symbol, timeframe });
    const response = await fetch(`/api/market/history?${query}`, { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as { candles?: Candle[] };
    return Array.isArray(payload.candles) ? payload.candles : [];
  } catch {
    return [];
  }
}

const LANG_STORAGE_KEY = "signals-language";

const BG = "#0B0E11";
const CARD = "#181A20";

// Display "Valid till" with a live countdown timer
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function formatUnix(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleString("en-GB", { hour12: false });
}
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F6465D";
const AMBER = "#F0B90B";
const BLUE = "#3B82F6";
const YELLOW = "#F59E0B";

type Market = "crypto" | "forex" | "stocks" | "metals";

import { SIGNAL_TTL_MS } from "@/src/lib/signalCloud";

interface MarketSignal {
  symbol: string;
  label: string;
  market: Market;
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  createdAt?: number;
  bias: "Bullish" | "Bearish" | "Sideways";
  price: number;
  pattern: string | null;
  conditionsPassed?: number;
  support: number | null;
  resistance: number | null;
  watchLevel: number | null;
  reason: string;
  analyzedAt: string;
  chartPattern: string | null;
  chartPatternNote: string | null;
  candlestickPattern: string | null;
  candlestickConfidence: number;
  /** Feature 2 — real-data confirmation breakdown (null when candles are cold). */
  confirmations?: { indicators: ConfirmationIndicator[]; confirmed: number; total: number } | null;
  /** KAAM 4 — the full 10-indicator institutional panel (null when candles are cold). */
  indicators?: IndicatorRow[] | null;
  /** Feature 3 — expert panel + consensus (save requires agreed >= 3). */
  experts?: { educators: EducatorVerdict[]; consensus: Consensus } | null;
  /** STRICT tier — PREMIUM / STRONG / GOOD. Optional on stored/legacy records. */
  tier?: "PREMIUM" | "STRONG" | "GOOD";
  /** ATR(14) behind the DYNAMIC TP/SL plan (legacy docs → null until the
   *  rescoring pass fills it from fresh 1h candles — atrPlan.ts). */
  atr?: number | null;
  /** Plan timeframe class in minutes (60 = 1h signals). */
  timeframeMinutes?: number | null;
}

const TABS: { key: Market; label: string }[] = [
  { key: "crypto", label: "Crypto" },
  { key: "forex", label: "Forex" },
  { key: "stocks", label: "Stocks" },
  { key: "metals", label: "Metals" },
];

// MASLA 2 — auto-refresh every 30s (spec); also re-runs the retention check.
const REFRESH_MS = 30 * 1000;
/**
 * COLD START — while the live API still returns 0 signals (fresh deploy, cold
 * instance still scanning), re-poll every 8s instead of waiting the full 30s
 * so the pool appears the moment the first strict pass emits.
 */
const COLD_RETRY_MS = 8 * 1000;
/** Stored setups (cloud/backup) older than this expire — 24h retention (Quality spec). */

function fmtPrice(p: number | null): string {
  if (p == null || !Number.isFinite(p) || p === 0) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(8);
}

/** BTC-USD -> BTC/USD, EURUSD=X -> EUR/USD, GC=F -> GC. */
function displaySymbol(symbol: string): string {
  if (symbol.endsWith("=X")) return symbol.replace("=X", "").replace(/(.{3})(.{3})/, "$1/$2");
  if (symbol.endsWith("=F")) return symbol.replace("=F", "");
  return symbol.replace("-USD", "/USD").replace("-", "/");
}

function directionLabel(direction: MarketSignal["direction"]): string {
  if (direction === "bullish") return "Bullish";
  if (direction === "bearish") return "Bearish";
  return "Neutral";
}

/** Status wording stays educational: never "Buy now"/"Signal". */
function statusOf(signal: MarketSignal): { text: string; color: string } {
  if (signal.score >= MIN_SCORE && signal.direction !== "neutral")
    return { text: "High-Confidence Setup", color: GREEN };
  return { text: "Watch zone", color: AMBER };
}

/**
 * MASLA 4/6 — score badge mirrors the Trade page exactly: it shows the REAL
 * score from the shared strict engine (Trade + Signals use the same 8-condition
 * formula, so they can never disagree). The emoji is cosmetic only — the
 * number is authoritative. 8/8=100 PERFECT, 7/8=88 STRONG.
 */
function scoreTier(score: number): { emoji: string; label: string; color: string } {
  if (score >= 95) return { emoji: "🟢", label: "PREMIUM SETUP", color: GREEN };
  if (score >= 85) return { emoji: "🔵", label: "STRONG SETUP", color: BLUE };
  if (score >= 75) return { emoji: "🟡", label: "GOOD SETUP", color: YELLOW };
  return { emoji: "⚪", label: "REJECTED", color: MUTED };
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function SignalsPageContent() {
  const router = useRouter();
  const [market, setMarket] = useState<Market>("crypto");
  // MASLA 2 — three sources merged below: live API, Firestore (real-time) and
  // the localStorage backup, so setups never vanish on reload.
  const [apiSignals, setApiSignals] = useState<MarketSignal[]>([]);
  const [cloudSignals, setCloudSignals] = useState<MarketSignal[]>([]);
  const [backupSignals, setBackupSignals] = useState<MarketSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  // Bumped on every refresh so the 4h TTL re-checks while the page stays open.
  const [tick, setTick] = useState(0);
  // Spec: the "Abhi koi signal nahi" empty state appears only after 5 seconds.
  const [fiveSecDone, setFiveSecDone] = useState(false);
  // Dual-language detail toggle (Task 2). Default Roman Urdu, saved to localStorage.
  const [lang, setLang] = useState<PatternDetailLanguage>("urdu");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "english" || saved === "urdu") setLang(saved);
    } catch {
      /* localStorage unavailable — stay on default */
    }
  }, []);

  const changeLang = (next: PatternDetailLanguage) => {
    setLang(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* ignore write failures */
    }
  };

  // Spec — the empty state may appear only after 5 seconds of loader;
  // real data (API / cloud / backup) shows the moment it arrives.
  useEffect(() => {
    const timer = window.setTimeout(() => setFiveSecDone(true), 5_000);
    return () => window.clearTimeout(timer);
  }, []);

  // Live API — refresh every 30s (spec). Results merge with the cloud/backup
  // sources below instead of replacing them, so a slow or empty scan never
  // wipes setups that are already on screen.
  useEffect(() => {
    let cancelled = false;
    // Next poll is scheduled only when the previous load FINISHES (never an
    // interval) so slow responses can't stack, and an empty/error response
    // retries in COLD_RETRY_MS instead of idling out the full 30s.
    let timer: number | undefined;
    let hadResults = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/signals/live?market=${market}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load setups");
        const payload = (await response.json()) as { generatedAt?: string; results?: MarketSignal[] };
        if (cancelled) return;
        const results = Array.isArray(payload.results) ? payload.results : [];
        hadResults = results.length > 0;
        setApiSignals(results);
        setUpdatedAt(payload.generatedAt ?? null);
      } catch {
        if (!cancelled) {
          setError("Setups load nahi ho sake. Thodi der baad try karein.");
          // Keep whatever we have (cloud + backup) instead of emptying.
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setTick((current) => current + 1);
          timer = window.setTimeout(() => void load(), hadResults ? REFRESH_MS : COLD_RETRY_MS);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [market]);

  // Cloud layer — real-time Firestore listener + localStorage backup restore.
  // Dynamic import keeps firebase/firestore out of the initial page bundle.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void import("@/src/lib/signalCloud")
      .then((cloud) => {
        if (cancelled) return;
        setBackupSignals(cloud.loadSignalBackup() as unknown as MarketSignal[]);
        unsubscribe = cloud.subscribeSignals((docs) => {
          if (!cancelled) setCloudSignals(docs as unknown as MarketSignal[]);
        });
      })
      .catch((cloudError) => console.warn("[signals] cloud layer unavailable:", cloudError));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // MASLA 1 rescoring patches — shared-engine recomputes (score / conditions /
  // ATR) for stored records. Declared BEFORE the `signals` memo below, which
  // merges these patches over the stored rows at render time.
  const [rescoring, setRescoring] = useState<Record<string, Partial<MarketSignal>>>({});
  // One fetch attempt per market:symbol per page session — a failed attempt is
  // released (see the effect) so the next 30s tick can retry, but a completed
  // one is never re-fetched, which is what keeps the effect out of any loop.
  const rescoringTriedRef = useRef<Set<string>>(new Set());

  // Merge live API + cloud + backup into one list: one card per market:symbol,
  // newest analysis wins (the live API is applied last so it wins ties).
  // Stored copies older than the 30-day retention drop out while the page is
  // open — `tick` changes every 30s, which re-runs that freshness filter.
  const signals = useMemo(() => {
    const now = Date.now();
    // Firestore PENDING docs ship `analyzedAt: null` (only `createdAt` is set) —
    // the old `Date.parse(null)` → NaN check silently DROPPED all 7 stored
    // pending signals, which is exactly why the page rendered "0 setups" while
    // the Results page showed 7 pending. Fall back to createdAt; a doc with
    // neither timestamp is kept (the archive is append-only — nothing sweeps).
    const stampOf = (signal: MarketSignal): number => {
      const parsed = Date.parse(signal.analyzedAt || "");
      if (Number.isFinite(parsed)) return parsed;
      const created = (signal as { createdAt?: number }).createdAt;
      return typeof created === "number" && Number.isFinite(created) ? created : now;
    };
    const fresh = (signal: MarketSignal): boolean => now - stampOf(signal) < SIGNAL_TTL_MS;
    const byKey = new Map<string, MarketSignal>();
    const put = (signal: MarketSignal) => {
      // Canonical asset key (market + canonical symbol) so one asset never
      // appears twice because two sources spelled it differently ("BTC-USD"
      // from the API vs "BTCUSDT" from the cloud).
      const key = assetKey(signal.symbol, signal.market);
      const previous = byKey.get(key);
      if (!previous) {
        byKey.set(key, signal);
        return;
      }
      // Newest analysis wins (the live API is applied last so it wins ties).
      const previousAt = stampOf(previous);
      const incomingAt = stampOf(signal);
      if (incomingAt > previousAt || (incomingAt === previousAt && signal.score >= previous.score)) {
        byKey.set(key, signal);
      }
    };
    // MASLA 2 — category filter: EVERY source is filtered to the ACTIVE tab's
    // market BEFORE merging. The cloud (Firestore) and localStorage backup hold
    // signals from all four markets at once, so without this per-source
    // category filter crypto coins (e.g. TRX/USD) leak into the Forex tab.
    const inMarket = (signal: MarketSignal): boolean => signal.market === market;
    backupSignals.filter(fresh).filter(inMarket).forEach(put);
    cloudSignals.filter(fresh).filter(inMarket).forEach(put);
    apiSignals.filter(inMarket).forEach(put);
    // Merge the SHARED-engine rescoring patches (score / conditions / ATR) over
    // stored records — WITHOUT this, legacy Firestore cards kept their stale
    // stored score and never gained the dynamic-plan `atr` (the state above was
    // computed but never read). Fresh API rows are untouched: they were never
    // targeted (they already ship conditionsPassed + atr).
    const merged = [...byKey.values()].map((signal): MarketSignal => {
      const patch = rescoring[assetKey(signal.symbol, signal.market)];
      return patch ? { ...signal, ...patch } : signal;
    });
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` intentionally re-triggers the TTL filter
  }, [apiSignals, cloudSignals, backupSignals, tick, market, rescoring]);

  // Quality floor (Quality with Quantity spec): score 85+ AND experts >= 3/4.
  // NO page-level fallback — sub-floor stored cards are NEVER shown; a quiet
  // market renders the "Aaj ke liye best setups pure ho gaye hain" empty state.
  const displayed = useMemo(
    () =>
      signals
        .filter((s) => s.score >= DISPLAY_MIN_SCORE)
        // Experts gate: 0/4 and 2/4 consensus signals never reach the UI.
        .filter((s) => s.experts != null && s.experts.consensus.agreed >= 3)
        .sort((first, second) => second.score - first.score),
    [signals],
  );

  // MASLA 1 — stored setups (Firestore + localStorage backup) carried OLD
  // confidence-style scores. Re-run the SHARED analyzeCoin() on the SAME
  // /api/market/history candles the Trade page uses, so every card's score,
  // conditions count, direction, pattern and support/resistance EQUALs the
  // Trade page for that same coin. Fresh API signals already ship
  // conditionsPassed + atr and are skipped. Also fills `atr` (DYNAMIC TP/SL
  // plan input) for legacy docs that predate the ATR-based plan. The results
  // are merged into the list by the `signals` memo above.
  useEffect(() => {
    const targets = displayed.filter((signal) => {
      if (signal.conditionsPassed != null && signal.atr != null) return false;
      const key = assetKey(signal.symbol, signal.market);
      if (rescoringTriedRef.current.has(key)) return false;
      rescoringTriedRef.current.add(key);
      return true;
    });
    if (targets.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries: Array<[string, Partial<MarketSignal>]> = [];
      for (const target of targets) {
        if (cancelled) break;
        try {
          const [h1] = await Promise.all([
            fetchCandles(target.market, target.symbol, "1h"),
            fetchCandles(target.market, target.symbol, "4h"),
            fetchCandles(target.market, target.symbol, "1d"),
          ]);
          if (h1.length < 30) continue;
          const full = analyzeCoin({
            symbol: target.symbol,
            market: target.market,
            primary: h1,
            h1,
            h4: await fetchCandles(target.market, target.symbol, "4h"),
            d1: await fetchCandles(target.market, target.symbol, "1d"),
          });
          entries.push([
            assetKey(target.symbol, target.market),
            {
              score: full.score,
              conditionsPassed: full.conditionsPassed,
              direction: full.direction,
              price: full.price,
              support: full.support,
              resistance: full.resistance,
              pattern: full.chartPattern,
              chartPattern: full.chartPattern,
              chartPatternNote: full.chartPattern
                ? `${full.chartPattern} @ ${full.chartPatternConfidence}%`
                : null,
              candlestickPattern: full.candlestick,
              candlestickConfidence: full.candlestickConfidence,
              // DYNAMIC plan input — same 1h ATR the Trade chart reads.
              atr: full.atr,
              timeframeMinutes: full.tfMinutes,
            },
          ]);
        } catch {
          /* keep the original value (partial payload, no 1h candles, etc.) */
        }
      }
      if (cancelled) return;
      // Release keys that produced nothing (cold history fetch / analysis
      // throw) so the next 30s refresh retries them; keys WITH a patch stay
      // marked forever — that is what breaks any re-fetch cycle. Only a
      // non-empty result touches state (no re-render → no loop).
      for (const target of targets) {
        const key = assetKey(target.symbol, target.market);
        if (!entries.some(([entryKey]) => entryKey === key)) rescoringTriedRef.current.delete(key);
      }
      if (entries.length > 0) {
        setRescoring(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [displayed]);

  // Backup layer — persist whatever is on screen so the next reload starts
  // from it (works even without Firebase / offline).
  useEffect(() => {
    if (signals.length === 0) return;
    let cancelled = false;
    void import("@/src/lib/signalCloud")
      .then((cloud) => {
        if (!cancelled) cloud.saveSignalBackup(signals as unknown as CloudDoc[]);
      })
      .catch(() => {
        /* backup optional */
      });
    return () => {
      cancelled = true;
    };
  }, [signals]);

  // Auto-save every visible 80+ setup into localStorage so the Results page can
  // track it A→Z (entries, SL, TP1-3, support/resistance, trend, pattern,
  // candlestick). A signal's score is authoritative here; the expert panel is
  // cosmetic enrichment and is null whenever the candle cache is cold, so
  // (previously) almost nothing got saved and /results stayed empty. Client-side
  // only. De-dupes per symbol within a rolling 24h window, so the 5-min refresh
  // just skips coins already saved today instead of piling up duplicates.
  useEffect(() => {
    if (loading) return;
    for (const signal of displayed) {
      if (signal.score < MIN_SCORE) continue;
      const full = generateFullSignal({
        symbol: signal.symbol,
        market: signal.market,
        price: signal.price,
        direction: signal.direction,
        support: signal.support,
        resistance: signal.resistance,
        pattern: signal.pattern,
        score: signal.score,
        bias: signal.bias,
        reason: signal.reason,
        chartPattern: signal.chartPattern,
        chartPatternNote: signal.chartPatternNote,
        // DYNAMIC ATR plan (same inputs as the card render above).
        atr: signal.atr,
        timeframeMinutes: signal.timeframeMinutes,
        candlestick: signal.candlestickPattern
          ? { name: signal.candlestickPattern, confidence: signal.candlestickConfidence, type: signal.direction }
          : null,
      });
      if (!full) continue;
      saveSignal({
        symbol: signal.symbol,
        market: signal.market,
        score: signal.score,
        direction: signal.direction,
        trend: full.trend,
        pattern: full.chartPattern ?? full.pattern ?? "No clear pattern",
        candlestick: full.candlestickPattern
          ? `${full.candlestickPattern} (${full.candlestickType === "bearish" ? "Bearish" : full.candlestickType === "bullish" ? "Bullish" : "Neutral"}, ${full.candlestickConfidence}%)`
          : "Neutral (no confirmation)",
        entry1: full.entry1,
        entry2: full.entry2,
        stopLoss: full.stopLoss,
        tp1: full.tp1,
        tp2: full.tp2,
        tp3: full.tp3,
        support: full.support,
        resistance: full.resistance,
        currentPrice: signal.price,
      });
    }
  }, [displayed, loading]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      <p className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>Analysis</p>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: TEXT }}>💎 AI Setups</h1>
          <span className="text-xs" style={{ color: MUTED }}>{displayed.length} setups</span>
          {updatedAt && (
            <span className="text-xs" style={{ color: MUTED }}>Updated {timeAgo(updatedAt)}</span>
          )}
        </div>
        {/* Task 2 — dual-language detail toggle, top-right. */}
        <PatternLanguageTabs value={lang} onChange={changeLang} />
      </div>

      {/* Market tabs */}
      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMarket(t.key)}
            aria-pressed={market === t.key}
            className="rounded-full px-3.5 py-1 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: market === t.key ? GREEN : CARD,
              color: market === t.key ? BG : TEXT,
              border: `1px solid ${BORDER}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Cards — stored setups (Firestore + localStorage backup) survive reloads. */}
      {error && displayed.length === 0 ? (
        <div className="rounded-2xl border p-6 text-center text-sm" style={{ backgroundColor: CARD, borderColor: BORDER, color: RED }}>
          {error}
        </div>
      ) : displayed.length === 0 ? (
        fiveSecDone && !loading ? (
          <div className="rounded-2xl border p-6 text-center text-sm" style={{ backgroundColor: CARD, borderColor: BORDER, color: MUTED }}>
            <p>Aaj ke liye best setups pure ho gaye hain. Market ka intezar karein.</p>
            <p className="mt-1">Today&apos;s best setups are used up — please wait for the market.</p>
            <p className="mt-2 text-xs opacity-70">(Max 10 per market per day · 85+ score, 3/4+ experts, H1+H4 trend, volume &gt; 20-SMA, RSI 35/65 filter. No garbage signals.)</p>
          </div>
        ) : (
          <div className="animate-pulse rounded-2xl border p-6 text-center text-sm" style={{ backgroundColor: CARD, borderColor: BORDER, color: MUTED }} role="status">
            <p>Signals load ho rahe hain…</p>
            <p className="mt-1 text-xs opacity-70">Live market scan chal raha hai.</p>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {loading && (
            <p className="text-center text-xs" style={{ color: MUTED }} role="status">Live scan chal raha hai…</p>
          )}
          {displayed.map((signal, index) => {
            const tierInfo = scoreTier(signal.score);
            // MASLA 6 — every visible card is 85+; a single header tops the list.
            const sectionHeader = index === 0 ? (
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: tierInfo.color }}>
                {tierInfo.emoji} {tierInfo.label} — Score {signal.tier === "PREMIUM" ? "95-100" : signal.tier === "STRONG" ? "88-94" : "85-87"}
              </h2>
            ) : null;
            const status = statusOf(signal);
            const full = generateFullSignal({
              symbol: signal.symbol,
              market: signal.market,
              price: signal.price,
              direction: signal.direction,
              support: signal.support,
              resistance: signal.resistance,
              pattern: signal.pattern,
              score: signal.score,
              bias: signal.bias,
              reason: signal.reason,
              chartPattern: signal.chartPattern,
              chartPatternNote: signal.chartPatternNote,
              // DYNAMIC ATR plan — same volatility + timeframe as the emitting
              // analyzeCoin() run, so card TP/SL equal the Trade chart lines.
              atr: signal.atr,
              timeframeMinutes: signal.timeframeMinutes,
              candlestick: signal.candlestickPattern
                ? { name: signal.candlestickPattern, confidence: signal.candlestickConfidence, type: signal.direction }
                : null,
            });
            if (!full) return null;
            const why = lang === "urdu" ? full.whyRomanUrdu : full.whyEnglish;
            const teacher = lang === "urdu" ? full.teacherNotesRomanUrdu : full.teacherNotesEnglish;
            const dirColor = full.direction === "bearish" ? RED : full.direction === "bullish" ? GREEN : MUTED;
            const href = `/trade?symbol=${encodeURIComponent(signal.symbol)}&market=${signal.market}`;
            // Feature 4 — expert guidance quotes built from the panel summary.
            const guidanceQuotes =
              signal.confirmations && signal.experts
                ? buildGuidance(
                    { confirmed: signal.confirmations.confirmed, consensus: signal.experts.consensus },
                    {
                      direction: signal.direction,
                      price: signal.price,
                      support: signal.support ?? signal.price,
                      resistance: signal.resistance ?? signal.price,
                      pattern: signal.chartPattern ?? signal.pattern,
                      breakout: false,
                      score: signal.score,
                    }
                  )
                : [];
            return (
              <>
              {sectionHeader}
              <div
                key={`${signal.market}:${signal.symbol}`}
                className="overflow-hidden rounded-2xl border"
                style={{ backgroundColor: CARD, borderColor: BORDER }}
              >
              <Link
                href={href}
                // Task 4 — prefetch the trade route on hover/focus for instant open.
                onMouseEnter={() => router.prefetch(href)}
                onFocus={() => router.prefetch(href)}
                className="block p-4 transition-colors hover:bg-[#1f232b]"
              >
                {/* Header */}
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-base font-bold" style={{ color: TEXT }}>{displaySymbol(signal.symbol)}</span>
                  <span className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ color: tierInfo.color, backgroundColor: `${tierInfo.color}20` }}>
                    {tierInfo.emoji} Score: {signal.score}/100
                  </span>
                </div>

                {/* KAAM 4/6 — every visible card is 85+ (Tier 3 minimum), so the
                    ribbon always shows. Conditions are the shared strict-engine
                    count; experts is the live X/4 panel. Tier is from the API gate. */}
                <p className="mb-2 text-xs font-bold" style={{ color: tierInfo.color }}>
                  {tierInfo.emoji} {tierInfo.label}
                  {` · ${signal.conditionsPassed ?? 0}/8 Conditions`}
                  {signal.experts ? ` · ${signal.experts.consensus.agreed}/4 Experts Confirmed` : ""}
                </p>
                {/* Feature 1 — full-width trend badge at the top of the card. */}
                <TrendBadge direction={signal.direction} score={signal.score} />

                <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold" style={{ color: dirColor }}>{directionLabel(signal.direction)}</span>
                  <span style={{ color: MUTED }}>· {full.trend}</span>
                  <span className="ml-auto text-xs font-semibold" style={{ color: status.color }}>{status.text}</span>
                  {/* Valid till with live countdown — 24h expiry enforced at API level */}
                  {signal.createdAt && (
                    <span className="text-xs" style={{ color: MUTED }}>
                      {formatElapsed(Date.now() - signal.createdAt)} ago · valid until {formatUnix(signal.createdAt + SIGNAL_TTL_MS)}
                    </span>
                  )}
                </div>

                {/* 📊 CHART PATTERN (with small SVG) */}
                <Section title="📊 Chart Pattern" />
                {full.chartPattern ? (
                  <div className="flex items-center gap-3 py-1">
                    <div className="shrink-0">
                      <ChartPatternVisual name={full.chartPattern} type={full.direction} className="h-16 w-24" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: TEXT }}>{full.chartPattern}</p>
                      {full.chartPatternNote ? (
                        <p className="text-xs" style={{ color: MUTED }}>({full.chartPatternNote})</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="py-1 text-sm" style={{ color: MUTED }}>
                    No clear pattern detected — trend-based setup.
                  </p>
                )}

                {/* 🕯️ CANDLESTICK CONFIRMATION (with small SVG) */}
                <Section title="🕯️ Candlestick Confirmation" />
                {full.candlestickPattern ? (
                  <div className="flex items-center gap-3 py-1">
                    <div className="shrink-0">
                      <CandlestickVisual name={full.candlestickPattern} className="h-16 w-12" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: TEXT }}>
                        {full.candlestickPattern}
                        <span className="ml-1 text-xs font-normal" style={{ color: MUTED }}>
                          ({full.candlestickType === "bearish" ? "Bearish" : full.candlestickType === "bullish" ? "Bullish" : "Neutral"}, {full.candlestickConfidence}%)
                        </span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="py-1 text-sm" style={{ color: MUTED }}>
                    Candlestick: Neutral (no confirmation yet).
                  </p>
                )}

                {/* Trend */}
                <Line icon="📉" label="Trend" value={full.trend} />

                {/* Entries */}
                <Section title="🎯 Entry Points" />
                <Line label="Entry 1 (aggressive)" value={`$${fmtPrice(full.entry1)}`} />
                <Line label="Entry 2 (conservative)" value={`$${fmtPrice(full.entry2)}`} />

                {/* Stop loss */}
                <Section title="🛑 Stop Loss" />
                <Line label="SL" value={`$${fmtPrice(full.stopLoss)}`} valueColor={RED} note={`(${full.slPercent}% price · -${full.slLossPercent}% margin @${full.leverage}x)`} />

                {/* Targets */}
                <Section title="🎯 Targets" />
                <Line label="TP1" value={`$${fmtPrice(full.tp1)}`} valueColor={GREEN} note={`(1:${full.rr1} R:R · +${full.tp1ProfitPercent}%)`} />
                <Line label="TP2" value={`$${fmtPrice(full.tp2)}`} valueColor={GREEN} note={`(1:${full.rr2} R:R · +${full.tp2ProfitPercent}%)`} />
                <Line label="TP3" value={`$${fmtPrice(full.tp3)}`} valueColor={GREEN} note={`(1:${full.rr3} R:R · +${full.tp3ProfitPercent}%)`} />

                {/* Why */}
                <Section title={lang === "urdu" ? "📈 Why (Roman Urdu)" : "📈 Why (English)"} />
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{why}</p>

                {/* Key levels */}
                <Section title="🔍 Key Levels" />
                <Line label="Support" value={`$${fmtPrice(full.support)}`} valueColor={GREEN} />
                <Line label="Resistance" value={`$${fmtPrice(full.resistance)}`} valueColor={RED} />
                <Line label="Prev Low" value={`$${fmtPrice(full.prevLow)}`} />
                <Line label="Prev High" value={`$${fmtPrice(full.prevHigh)}`} />

                {/* Reversal warnings */}
                <Section title="⚠️ Reversal Warning" />
                <ul className="ml-4 list-disc space-y-0.5 text-xs" style={{ color: AMBER }}>
                  {full.reversalWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>

                {/* KAAM 6 — explicit bull / bear scenario. */}
                <Section title="🐂 Bull Case" />
                <p className="text-xs leading-relaxed" style={{ color: GREEN }}>{full.bullCase}</p>
                <Section title="🐻 Bear Case" />
                <p className="text-xs leading-relaxed" style={{ color: RED }}>{full.bearCase}</p>

                {/* KAAM 6 — exact invalidation triggers. */}
                <Section title="🚫 Invalidation" />
                <ul className="ml-4 list-disc space-y-0.5 text-xs" style={{ color: RED }}>
                  {full.invalidation.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>

                {/* Teacher notes */}
                <Section title={lang === "urdu" ? "🎓 Teacher Notes (Roman Urdu)" : "🎓 Teacher Notes (English)"} />
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{teacher}</p>

                {/* Features 2-4 — confirmation indicators, 10-indicator panel + expert panel. */}
                {signal.confirmations ? <ConfirmationSection report={signal.confirmations} /> : null}
                {signal.indicators && signal.indicators.length > 0 ? (
                  <IndicatorPanel indicators={signal.indicators} />
                ) : null}
                {signal.experts ? (
                  <ExpertPanel educators={signal.experts.educators} consensus={signal.experts.consensus} />
                ) : null}
              </Link>
              {/* Feature 4 — "Discuss in Chat": open the AI chat with THIS signal
                  loaded so the user can ask entry/SL/TP questions live. */}
              <div className="px-4 pb-2">
                <Link
                  href={`/chat?symbol=${encodeURIComponent(signal.symbol)}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "rgba(0,192,135,0.14)", color: GREEN, border: `1px solid ${GREEN}` }}
                >
                  💬 Discuss in Chat
                </Link>
              </div>
              {/* Feature 4 — expandable guidance lives outside the link so the
                  expand buttons do not trigger card navigation. */}
              {guidanceQuotes.length > 0 ? (
                <div className="px-4 pb-1">
                  <GuidanceSection quotes={guidanceQuotes} />
                </div>
              ) : null}
              <p className="px-4 pb-4 pt-2 text-xs" style={{ color: MUTED }}>⚠️ Educational only. Not financial advice.</p>
            </div>
            </>
            );
          })}
        </div>
      )}

      <Link
        href="/results"
        className="mt-5 block w-full rounded-lg py-3 text-center text-sm font-bold transition-opacity hover:opacity-90"
        style={{ backgroundColor: GREEN, color: BG }}
      >
        📊 View All Results →
      </Link>

      <footer className="mt-6 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational analysis only. Not financial advice.
      </footer>
    </main>
  );
}

/** A titled section divider inside a signal card. */
function Section({ title }: { title: string }) {
  return (
    <p className="mt-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: GREEN }}>
      {title}
    </p>
  );
}

/** One label/value row inside a signal card, with an optional icon, color and note. */
function Line({ icon, label, value, valueColor, note }: { icon?: string; label: string; value: string; valueColor?: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-sm">
      <span style={{ color: MUTED }}>
        {icon ? <span className="mr-1">{icon}</span> : null}
        {label}
      </span>
      <span className="text-right">
        <span className="font-semibold" style={{ color: valueColor ?? TEXT }}>{value}</span>
        {note ? <span className="ml-1 text-xs" style={{ color: MUTED }}>{note}</span> : null}
      </span>
    </div>
  );
}

export default function SignalsPage() {
  return (
    <AuthGuard>
      <SignalsPageContent />
    </AuthGuard>
  );
}
