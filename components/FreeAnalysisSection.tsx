"use client";

import { useCallback, useEffect, useState } from "react";

type Tab = "Crypto" | "Forex" | "Stocks" | "Metals";
type Trend = "Bullish" | "Bearish" | "Neutral";
type Status = "Watch" | "Wait" | "Setup Detected";
type Confidence = "HIGH" | "MEDIUM" | "LOW";

interface Seed { price: number; trend: Trend; confluence: number; key: "Support" | "Resistance"; status: Status; confidence: Confidence }
interface Row { symbol: string; price: number; bias: string; direction: string; confidence: number }
interface Asset { symbol: string; scan: string; seed: Seed }

const ASSETS: Record<Tab, Asset[]> = {
  Crypto: [
    { symbol: "BTC/USD", scan: "BTC-USD", seed: { price: 68420, trend: "Bullish", confluence: 3, key: "Support", status: "Watch", confidence: "HIGH" } },
    { symbol: "ETH/USD", scan: "ETH-USD", seed: { price: 3540, trend: "Neutral", confluence: 2, key: "Support", status: "Wait", confidence: "MEDIUM" } },
  ],
  Forex: [
    { symbol: "EUR/USD", scan: "EURUSD=X", seed: { price: 1.087, trend: "Bearish", confluence: 3, key: "Resistance", status: "Watch", confidence: "MEDIUM" } },
    { symbol: "GBP/USD", scan: "GBPUSD=X", seed: { price: 1.271, trend: "Bullish", confluence: 2, key: "Support", status: "Wait", confidence: "MEDIUM" } },
  ],
  Stocks: [
    { symbol: "AAPL", scan: "AAPL", seed: { price: 228, trend: "Bullish", confluence: 4, key: "Support", status: "Setup Detected", confidence: "HIGH" } },
    { symbol: "NVDA", scan: "NVDA", seed: { price: 122, trend: "Neutral", confluence: 2, key: "Resistance", status: "Wait", confidence: "MEDIUM" } },
  ],
  Metals: [
    { symbol: "XAU/USD", scan: "GC=F", seed: { price: 2648, trend: "Bullish", confluence: 3, key: "Support", status: "Setup Detected", confidence: "HIGH" } },
    { symbol: "XAG/USD", scan: "SI=F", seed: { price: 31.2, trend: "Bearish", confluence: 1, key: "Resistance", status: "Wait", confidence: "LOW" } },
  ],
};
const TABS: Tab[] = ["Crypto", "Forex", "Stocks", "Metals"];

const trendColor: Record<Trend, string> = { Bullish: "text-emerald-400", Bearish: "text-rose-400", Neutral: "text-zinc-400" };
const statusStyle: Record<Status, string> = {
  Watch: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  Wait: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  "Setup Detected": "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
};
const confColor: Record<Confidence, string> = { HIGH: "text-emerald-400", MEDIUM: "text-amber-400", LOW: "text-rose-400" };

const toTrend = (bias: string): Trend => (bias === "Bullish" ? "Bullish" : bias === "Bearish" ? "Bearish" : "Neutral");
const toStatus = (direction: string, confidence: number): Status =>
  direction === "wait" ? "Wait" : confidence >= 70 ? "Setup Detected" : "Watch";
const toConfidence = (value: number): Confidence => (value >= 70 ? "HIGH" : value >= 45 ? "MEDIUM" : "LOW");
const fmtPrice = (value: number): string => {
  const digits = value >= 1000 ? 2 : value >= 1 ? 3 : 5;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

function RowLine({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`font-semibold ${className ?? "text-zinc-200"}`}>{value}</dd>
    </div>
  );
}

function Card({ asset, row }: { asset: Asset; row?: Row }) {
  const trend = row ? toTrend(row.bias) : asset.seed.trend;
  const status = row ? toStatus(row.direction, row.confidence) : asset.seed.status;
  const confidence = row ? toConfidence(row.confidence) : asset.seed.confidence;
  const price = row?.price ?? asset.seed.price;
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">{asset.symbol}</span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusStyle[status]}`}>{status}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-white">{fmtPrice(price)}</p>
      <dl className="mt-3 space-y-1 text-xs">
        <RowLine label="Trend" value={trend} className={trendColor[trend]} />
        <RowLine label="Confluence" value={`${asset.seed.confluence}/4 timeframes`} />
        <RowLine label="Key Level" value={asset.seed.key} />
        <RowLine label="Confidence" value={confidence} className={confColor[confidence]} />
      </dl>
    </article>
  );
}

export default function FreeAnalysisSection() {
  const [tab, setTab] = useState<Tab>("Crypto");
  const [rows, setRows] = useState<Row[]>([]);
  const [updated, setUpdated] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/market/scan", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { results?: Row[] };
      if (Array.isArray(data.results)) {
        setRows(data.results);
        setUpdated(Date.now());
      }
    } catch {
      /* offline: keep last known analysis */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const hourly = window.setInterval(() => void refresh(), 60 * 60 * 1000);
    const ticker = window.setInterval(() => setTick((tick) => tick + 1), 30 * 1000);
    return () => {
      window.clearInterval(hourly);
      window.clearInterval(ticker);
    };
  }, [refresh]);

  const mins = updated === null ? null : Math.floor((Date.now() - updated) / 60000);
  const updatedLabel = mins === null ? "waiting for analysis" : mins < 1 ? "just now" : `${mins} min ago`;

  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 sm:p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-bold tracking-wide text-white">📊 FREE MARKET ANALYSIS</h2>
        <p className="text-sm text-zinc-400">High confluence setups updated hourly</p>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Market categories">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            aria-pressed={tab === name}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === name
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="grid gap-3 sm:grid-cols-2">
        {ASSETS[tab].map((asset) => (
          <Card key={asset.scan} asset={asset} row={rows.find((found) => found.symbol === asset.scan)} />
        ))}
      </div>
      <p className="text-xs text-zinc-500">Last updated: {updatedLabel}</p>
    </section>
  );
}
