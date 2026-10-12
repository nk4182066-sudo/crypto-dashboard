// Educational analysis only. Not financial advice.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AutoAnalysis } from "@/src/lib/autoAnalysis";

type Tab = "Crypto" | "Forex" | "Stocks" | "Metals";

const TABS: Tab[] = ["Crypto", "Forex", "Stocks", "Metals"];

const SYMBOLS: Record<Tab, string[]> = {
  Crypto: ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD"],
  Forex: ["EUR-USD", "GBP-USD", "USD-JPY", "AUD-USD", "USD-CAD"],
  Stocks: ["AAPL", "MSFT", "GOOGL", "TSLA", "AMZN"],
  Metals: ["XAU-USD", "XAG-USD", "XPT-USD", "XPD-USD", "XCU-USD"],
};

const MARKET: Record<Tab, string> = { Crypto: "crypto", Forex: "forex", Stocks: "stocks", Metals: "metals" };

/** The history route expects Yahoo `=X` pairs for forex, so map before fetching. */
const API_SYMBOL: Record<string, string> = {
  "EUR-USD": "EURUSD=X", "GBP-USD": "GBPUSD=X", "USD-JPY": "USDJPY=X",
  "AUD-USD": "AUDUSD=X", "USD-CAD": "USDCAD=X",
};

const REFRESH_MS = 5 * 60 * 1000;

const fmtPrice = (value: number): string => value.toLocaleString("en-US", { maximumFractionDigits: value >= 1000 ? 2 : 4 });

/** Green 75+, yellow 50-74, red below 50. */
const scoreRing = (score: number): string =>
  score >= 75 ? "border-emerald-400 text-emerald-400 bg-emerald-500/10"
    : score >= 50 ? "border-yellow-400 text-yellow-400 bg-yellow-500/10"
      : "border-red-400 text-red-400 bg-red-500/10";

const scoreText = (score: number): string =>
  score >= 75 ? "text-emerald-400" : score >= 50 ? "text-yellow-400" : "text-red-400";

const verdictText = (verdict: AutoAnalysis["verdict"]): string =>
  verdict === "STRONG_SETUP" ? "Setup Detected" : verdict === "MODERATE" ? "Moderate" : "Wait";

/** "x min ago" label; only called from event/interval callbacks (never render). */
function labelFor(time: number | null): string {
  if (time === null) return "not yet";
  const mins = Math.floor((Date.now() - time) / 60000);
  return mins < 1 ? "just now" : `${mins} min ago`;
}

async function fetchOne(symbol: string, tab: Tab): Promise<AutoAnalysis> {
  const query = new URLSearchParams({ symbol: API_SYMBOL[symbol] ?? symbol, market: MARKET[tab] });
  const response = await fetch(`/api/auto-analysis?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${symbol} unavailable`);
  return (await response.json()) as AutoAnalysis;
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className={`truncate text-right font-medium ${className ?? "text-zinc-200"}`}>{value}</dd>
    </div>
  );
}

function Card({ item }: { item: AutoAnalysis }) {
  const trend =
    item.trend === "bullish"
      ? { text: "📈 Bullish", cls: "text-emerald-400" }
      : item.trend === "bearish"
        ? { text: "📉 Bearish", cls: "text-red-400" }
        : { text: "➡️ Neutral", cls: "text-zinc-400" };
  const patterns = item.patterns.slice(0, 3).map((pattern) => pattern.name).join(", ") || "None detected";
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">{item.symbol}</h3>
          <p className="text-lg font-semibold tabular-nums text-zinc-200">{fmtPrice(item.current)}</p>
        </div>
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold tabular-nums ${scoreRing(item.score)}`}
          aria-label={`Score ${item.score} of 100`}
        >
          {item.score}
        </div>
      </div>
      <dl className="mt-3 space-y-1 text-xs">
        <Row label="Trend:" value={trend.text} className={trend.cls} />
        <Row label="Timeframes:" value={item.timeframeAlignment} />
        <Row label="Patterns:" value={patterns} />
      </dl>
      <p className={`mt-2 border-t border-zinc-800 pt-2 text-xs font-semibold ${scoreText(item.score)}`}>
        {verdictText(item.verdict)}
      </p>
    </article>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/60 p-4" aria-hidden="true">
      <div className="h-4 w-24 rounded bg-zinc-800" />
      <div className="mt-3 h-6 w-32 rounded bg-zinc-800" />
      <div className="mt-3 h-3 w-full rounded bg-zinc-800" />
    </div>
  );
}

export default function FreePremiumSignal() {
  const [tab, setTab] = useState<Tab>("Crypto");
  const [rows, setRows] = useState<AutoAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedLabel, setUpdatedLabel] = useState("not yet");
  const requestIdRef = useRef(0);
  const updatedRef = useRef<number | null>(null);

  const load = useCallback((active: Tab) => {
    const requestId = ++requestIdRef.current;
    const done = (settled: PromiseSettledResult<AutoAnalysis>[]) => {
      const found = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      // Debug: see exactly what the auto-analysis endpoint returned.
      console.log("[FreePremiumSignal] fetched", found.length, "/", settled.length, found.map((row) => `${row.symbol}=${row.score}`).join(", "));
      if (requestId !== requestIdRef.current) return;
      if (found.length === 0) {
        setError("Analysis is unavailable right now.");
      } else {
        setRows(found);
        setError(null);
        updatedRef.current = Date.now();
        setUpdatedLabel(labelFor(updatedRef.current));
      }
      setLoading(false);
    };
    void Promise.allSettled(SYMBOLS[active].map((symbol) => fetchOne(symbol, active))).then(done);
  }, []);

  // Fetch on mount / tab change.
  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  // Auto-refresh every 5 minutes + tick the "Last updated" label.
  useEffect(() => {
    const refresh = window.setInterval(() => void load(tab), REFRESH_MS);
    const ticker = window.setInterval(() => setUpdatedLabel(labelFor(updatedRef.current)), 30 * 1000);
    return () => { window.clearInterval(refresh); window.clearInterval(ticker); };
  }, [tab, load]);

  const switchTab = (name: Tab) => { setTab(name); setRows([]); setLoading(true); setError(null); };
  const retry = () => { setLoading(true); setError(null); void load(tab); };
  const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
  // Temporarily lowered (was 75) so qualifying setups show up while testing.
  const top = rows.filter((row) => row.score >= 60);

  return (
    <section aria-label="Free premium analysis" className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 sm:p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-bold tracking-wide text-white">💎 FREE PREMIUM ANALYSIS</h2>
        <p className="text-sm text-zinc-400">Auto analysis - High confluence setups</p>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Market categories">
        {TABS.map((name) => (
          <button key={name} type="button" onClick={() => switchTab(name)} aria-pressed={tab === name}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${tab === name ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"}`}>
            {name}
          </button>
        ))}
      </nav>
      {error && rows.length === 0 ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300" role="alert">
          <p>{error}</p>
          <button type="button" onClick={retry} className="mt-2 rounded border border-red-500/50 px-3 py-1 text-xs font-semibold hover:bg-red-500/20">Retry</button>
        </div>
      ) : loading && rows.length === 0 ? (
        <div className={grid}>{SYMBOLS[tab].map((symbol) => <Skeleton key={symbol} />)}</div>
      ) : (
        <>
          <section className="space-y-2" aria-label="Top setups">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Top Setups (score 60+)</h3>
            {top.length > 0 ? (
              <div className={grid}>{top.map((item) => <Card key={item.symbol} item={item} />)}</div>
            ) : (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">No high-confluence setups yet — keep watching.</p>
            )}
          </section>
          <section className="space-y-2" aria-label="All analysis">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">All Analysis</h3>
            <div className={grid}>{rows.map((item) => <Card key={item.symbol} item={item} />)}</div>
          </section>
        </>
      )}
      <footer className="space-y-1 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        <p>⚠️ Educational analysis only · Not financial advice</p>
        <p>Last updated: {updatedLabel} · Auto-refreshes every 5 minutes</p>
      </footer>
    </section>
  );
}


