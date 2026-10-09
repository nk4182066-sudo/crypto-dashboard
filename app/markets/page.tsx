"use client";

// Markets: clean coin list only. Search bar + full-width rows.
// Each row: icon + symbol + name (left), price + % badge (right).
// Click -> /trade?symbol=XXX-USD. Educational only. Not financial advice.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const GREEN = "#00C087";
const RED = "#F6465D";

interface CoinRow {
  symbol: string;
  display: string;
  base: string;
  name: string;
  price: number;
  changePct: number;
}

const COIN_NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", XRP: "XRP",
  ADA: "Cardano", DOGE: "Dogecoin", AVAX: "Avalanche", LINK: "Chainlink",
  DOT: "Polkadot", MATIC: "Polygon", LTC: "Litecoin", TRX: "TRON",
  UNI: "Uniswap", ATOM: "Cosmos", ETC: "Ethereum Classic", NEAR: "NEAR",
  APT: "Aptos", FIL: "Filecoin", ARB: "Arbitrum", OP: "Optimism",
};

const STATIC_ROWS: Record<string, CoinRow[]> = {
  metals: [
    { symbol: "XAU-USD", display: "XAU/USD", base: "XAU", name: "Gold Spot", price: 2330, changePct: 0.42 },
    { symbol: "XAG-USD", display: "XAG/USD", base: "XAG", name: "Silver Spot", price: 27.4, changePct: -0.31 },
  ],
  stocks: [
    { symbol: "AAPL", display: "AAPL", base: "AAPL", name: "Apple Inc.", price: 189.5, changePct: 0.65 },
    { symbol: "TSLA", display: "TSLA", base: "TSLA", name: "Tesla Inc.", price: 175.2, changePct: -1.12 },
    { symbol: "NVDA", display: "NVDA", base: "NVDA", name: "NVIDIA Corp.", price: 120.8, changePct: 2.03 },
  ],
};

type Feed = "spot" | "futures" | "metals" | "stocks";

const FEEDS: { key: Feed; label: string }[] = [
  { key: "spot", label: "Spot" },
  { key: "futures", label: "Futures" },
  { key: "metals", label: "Metals" },
  { key: "stocks", label: "Stocks" },
];

async function fetchBinanceTop(kind: "spot" | "futures", limit = 20): Promise<CoinRow[]> {
  const url =
    kind === "spot"
      ? "https://api.binance.com/api/v3/ticker/24hr"
      : "https://fapi.binance.com/fapi/v1/ticker/24hr";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${kind} ${res.status}`);
  const data = (await res.json()) as Array<{
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
    quoteVolume: string;
  }>;
  return data
    .filter((d) => d.symbol.endsWith("USDT"))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, limit)
    .map((d) => {
      const base = d.symbol.replace(/USDT$/, "");
      return {
        symbol: `${base}-USD`,
        display: `${base}/USD`,
        base,
        name: COIN_NAMES[base] ?? base,
        price: Number(d.lastPrice),
        changePct: Number(d.priceChangePercent),
      };
    });
}

function fmtPrice(p: number) {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export default function MarketsPage() {
  const [feed, setFeed] = useState<Feed>("spot");
  const [rows, setRows] = useState<CoinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (feed === "metals" || feed === "stocks") {
      setRows(STATIC_ROWS[feed]);
      setLoading(false);
      return;
    }

    fetchBinanceTop(feed, 20)
      .then((data) => {
        if (!cancelled) setRows(data);
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
  }, [feed]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => r.base.includes(q) || r.name.toUpperCase().includes(q));
  }, [rows, query]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search coin..."
        className="mb-3 w-full rounded-xl border px-4 py-2.5 text-sm outline-none"
        style={{ backgroundColor: CARD, borderColor: BORDER, color: TEXT }}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {FEEDS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFeed(f.key)}
            className="rounded-full px-3.5 py-1 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: feed === f.key ? GREEN : CARD,
              color: feed === f.key ? BG : TEXT,
              border: `1px solid ${BORDER}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        {loading && <p className="px-4 py-6 text-sm text-[#9CA3AF]">Loading...</p>}
        {error && <p className="px-4 py-6 text-sm text-[#F6465D]">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="px-4 py-6 text-sm text-[#9CA3AF]">No coins found.</p>
        )}
        {!loading &&
          filtered.map((r) => {
            const up = r.changePct >= 0;
            return (
              <Link
                key={r.symbol}
                href={`/trade?symbol=${encodeURIComponent(r.symbol)}`}
                className="flex items-center justify-between border-b px-4 py-3 last:border-b-0"
                style={{ borderColor: BORDER }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                    style={{ backgroundColor: "#2B3139", color: TEXT }}
                  >
                    {r.base.slice(0, 3)}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold" style={{ color: TEXT }}>
                      {r.display}
                    </span>
                    <span className="text-xs text-[#9CA3AF]">{r.name}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold" style={{ color: TEXT }}>
                    ${fmtPrice(r.price)}
                  </span>
                  <span
                    className="mt-0.5 rounded px-1.5 py-0.5 text-xs font-semibold"
                    style={{
                      color: up ? GREEN : RED,
                      backgroundColor: up ? "rgba(0,192,135,0.12)" : "rgba(246,70,93,0.12)",
                    }}
                  >
                    {up ? "+" : ""}
                    {r.changePct.toFixed(2)}%
                  </span>
                </div>
              </Link>
            );
          })}
      </div>

      <footer className="mt-4 text-center text-xs text-[#9CA3AF]">
        ⚠️ Educational only. Not financial advice.
      </footer>
    </main>
  );
}

