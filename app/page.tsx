"use client";

// Home — clean market list only: search bar + market tabs + coin list.
// The navbar and mobile bottom nav are rendered globally in app/layout.tsx.
// Clicking a row opens /trade?symbol=... Educational only. Not financial advice.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#848E9C";
const GREEN = "#00C087";
const RED = "#F6465D";

interface AllCoin {
  id: string;
  symbol: string;
  label: string;
  market: "crypto" | "futures" | "metals" | "forex" | "stocks";
  currentPrice: number;
  priceChangePercent: number;
}

type Market = "crypto" | "futures" | "metals" | "stocks" | "forex";

// Order matches the requested tabs: Spot | Futures | Metals | Stocks | Forex.
const TABS: { key: Market; label: string }[] = [
  { key: "crypto", label: "Spot" },
  { key: "futures", label: "Futures" },
  { key: "metals", label: "Metals" },
  { key: "stocks", label: "Stocks" },
  { key: "forex", label: "Forex" },
];

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "--";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export default function Home() {
  const [market, setMarket] = useState<Market>("crypto");
  const [coins, setCoins] = useState<AllCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/market/all-coins", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<{ coins?: AllCoin[] }>;
      })
      .then((data) => {
        if (!cancelled) setCoins(Array.isArray(data.coins) ? data.coins : []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message ?? e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => coins.filter((c) => c.market === market), [coins, market]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(
      (c) => c.symbol.toUpperCase().includes(q) || c.label.toUpperCase().includes(q)
    );
  }, [rows, query]);

  return (
    <main className="min-h-screen" style={{ backgroundColor: BG }}>
      {/* Search */}
      <div className="px-4 pt-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search market (BTC, Gold, EUR/USD)..."
          className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none"
          style={{ backgroundColor: CARD, borderColor: BORDER, color: TEXT }}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap px-4 py-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMarket(t.key)}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={
              market === t.key
                ? { backgroundColor: GREEN, color: "#000000" }
                : { backgroundColor: CARD, color: MUTED, border: `1px solid ${BORDER}` }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Coin list */}
      <div className="mx-4 overflow-hidden rounded-2xl border" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        {loading && <p className="px-4 py-6 text-sm" style={{ color: MUTED }}>Loading markets...</p>}
        {error && <p className="px-4 py-6 text-sm" style={{ color: RED }}>{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="px-4 py-6 text-sm" style={{ color: MUTED }}>No markets found.</p>
        )}
        {!loading &&
          !error &&
          filtered.map((c) => {
            const up = c.priceChangePercent >= 0;
            const base = c.symbol.replace(/USDT$/, "").split("/")[0].slice(0, 3) || c.label.slice(0, 1);
            return (
              <Link
                key={c.id}
                href={`/trade?symbol=${encodeURIComponent(c.symbol)}`}
                className="flex items-center justify-between border-b px-4 py-3 last:border-b-0"
                style={{ borderColor: BORDER }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                    style={{ backgroundColor: "#2B3139", color: TEXT }}
                  >
                    {base}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold" style={{ color: TEXT }}>
                      {c.symbol}
                    </span>
                    <span className="text-xs" style={{ color: MUTED }}>
                      {c.label}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold" style={{ color: TEXT }}>
                    ${fmtPrice(c.currentPrice)}
                  </span>
                  <span
                    className="mt-0.5 rounded px-1.5 py-0.5 text-xs font-semibold"
                    style={{
                      color: up ? GREEN : RED,
                      backgroundColor: up ? "rgba(0,192,135,0.12)" : "rgba(246,70,93,0.12)",
                    }}
                  >
                    {up ? "+" : ""}
                    {c.priceChangePercent.toFixed(2)}%
                  </span>
                </div>
              </Link>
            );
          })}
      </div>

      <p className="mt-4 px-4 text-center text-sm" style={{ color: MUTED }}>
        100% Free for everyone. No hidden charges. No paid analysis.
      </p>
      <p className="mt-2 mb-4 px-4 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational only. Not financial advice.
      </p>
    </main>
  );
}
