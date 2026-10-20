"use client";
import AuthGuard from "@/components/AuthGuard";

// Home — clean market list only: search bar + market tabs + coin list.
// The navbar and mobile bottom nav are rendered globally in app/layout.tsx.
// Clicking a row opens /trade?symbol=... Educational only. Not financial advice.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EnableNotifications from "@/components/EnableNotifications";

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

// Task 2 — optimistic placeholders. Shown instantly on first paint so the user
// never sees a blank/loading list; replaced by live data within ~1-2s. Approx
// values only (educational). Covers every market tab so switching is instant too.
const PLACEHOLDER_COINS: AllCoin[] = [
  { id: "BTCUSDT", symbol: "BTCUSDT", label: "BTC/USDT", market: "crypto", currentPrice: 83000, priceChangePercent: 0.25 },
  { id: "ETHUSDT", symbol: "ETHUSDT", label: "ETH/USDT", market: "crypto", currentPrice: 2300, priceChangePercent: 0.2 },
  { id: "SOLUSDT", symbol: "SOLUSDT", label: "SOL/USDT", market: "crypto", currentPrice: 109, priceChangePercent: 0.1 },
  { id: "BNBUSDT", symbol: "BNBUSDT", label: "BNB/USDT", market: "crypto", currentPrice: 600, priceChangePercent: -0.15 },
  { id: "XRPUSDT", symbol: "XRPUSDT", label: "XRP/USDT", market: "crypto", currentPrice: 0.52, priceChangePercent: 0.35 },
  { id: "ADAUSDT", symbol: "ADAUSDT", label: "ADA/USDT", market: "crypto", currentPrice: 0.45, priceChangePercent: -0.2 },
  { id: "DOGEUSDT", symbol: "DOGEUSDT", label: "DOGE/USDT", market: "crypto", currentPrice: 0.12, priceChangePercent: 0.5 },
  { id: "AVAXUSDT", symbol: "AVAXUSDT", label: "AVAX/USDT", market: "crypto", currentPrice: 28, priceChangePercent: 0.18 },
  { id: "LINKUSDT", symbol: "LINKUSDT", label: "LINK/USDT", market: "crypto", currentPrice: 14.5, priceChangePercent: -0.1 },
  { id: "DOTUSDT", symbol: "DOTUSDT", label: "DOT/USDT", market: "crypto", currentPrice: 6.2, priceChangePercent: 0.22 },
  { id: "MATICUSDT", symbol: "MATICUSDT", label: "MATIC/USDT", market: "crypto", currentPrice: 0.38, priceChangePercent: -0.3 },
  { id: "LTCUSDT", symbol: "LTCUSDT", label: "LTC/USDT", market: "crypto", currentPrice: 72, priceChangePercent: 0.12 },
  { id: "TRXUSDT", symbol: "TRXUSDT", label: "TRX/USDT", market: "crypto", currentPrice: 0.13, priceChangePercent: 0.08 },
  { id: "ATOMUSDT", symbol: "ATOMUSDT", label: "ATOM/USDT", market: "crypto", currentPrice: 6.8, priceChangePercent: -0.18 },
  { id: "UNIUSDT", symbol: "UNIUSDT", label: "UNI/USDT", market: "crypto", currentPrice: 9.1, priceChangePercent: 0.28 },
  { id: "ETCUSDT", symbol: "ETCUSDT", label: "ETC/USDT", market: "crypto", currentPrice: 26, priceChangePercent: -0.05 },
  { id: "FILUSDT", symbol: "FILUSDT", label: "FIL/USDT", market: "crypto", currentPrice: 4.3, priceChangePercent: 0.16 },
  { id: "APTUSDT", symbol: "APTUSDT", label: "APT/USDT", market: "crypto", currentPrice: 8.4, priceChangePercent: 0.24 },
  { id: "ARBUSDT", symbol: "ARBUSDT", label: "ARB/USDT", market: "crypto", currentPrice: 0.75, priceChangePercent: -0.22 },
  { id: "OPUSDT", symbol: "OPUSDT", label: "OP/USDT", market: "crypto", currentPrice: 1.6, priceChangePercent: 0.19 },
  // Futures (mirror majors so the tab isn't empty before live data).
  { id: "BTCUSDT-fut", symbol: "BTCUSDT", label: "BTC/USDT Perp", market: "futures", currentPrice: 83000, priceChangePercent: 0.25 },
  { id: "ETHUSDT-fut", symbol: "ETHUSDT", label: "ETH/USDT Perp", market: "futures", currentPrice: 2300, priceChangePercent: 0.2 },
  { id: "SOLUSDT-fut", symbol: "SOLUSDT", label: "SOL/USDT Perp", market: "futures", currentPrice: 109, priceChangePercent: 0.1 },
  { id: "BNBUSDT-fut", symbol: "BNBUSDT", label: "BNB/USDT Perp", market: "futures", currentPrice: 600, priceChangePercent: -0.15 },
  { id: "XRPUSDT-fut", symbol: "XRPUSDT", label: "XRP/USDT Perp", market: "futures", currentPrice: 0.52, priceChangePercent: 0.35 },
  // Metals.
  { id: "xau-usd", symbol: "XAU-USD", label: "Gold (XAU-USD)", market: "metals", currentPrice: 2648, priceChangePercent: 0.3 },
  { id: "xag-usd", symbol: "XAG-USD", label: "Silver (XAG-USD)", market: "metals", currentPrice: 31.2, priceChangePercent: -0.4 },
  { id: "xpt-usd", symbol: "XPT-USD", label: "Platinum (XPT-USD)", market: "metals", currentPrice: 985, priceChangePercent: 0.12 },
  { id: "xpd-usd", symbol: "XPD-USD", label: "Palladium (XPD-USD)", market: "metals", currentPrice: 1020, priceChangePercent: -0.08 },
  { id: "xcu-usd", symbol: "XCU-USD", label: "Copper (XCU-USD)", market: "metals", currentPrice: 4.5, priceChangePercent: 0.05 },
  // Stocks.
  { id: "aapl", symbol: "AAPL", label: "Apple Inc.", market: "stocks", currentPrice: 228, priceChangePercent: 0.45 },
  { id: "tsla", symbol: "TSLA", label: "Tesla Inc.", market: "stocks", currentPrice: 248, priceChangePercent: -0.6 },
  { id: "nvda", symbol: "NVDA", label: "NVIDIA Corp.", market: "stocks", currentPrice: 122, priceChangePercent: 1.2 },
  { id: "msft", symbol: "MSFT", label: "Microsoft Corp.", market: "stocks", currentPrice: 420, priceChangePercent: 0.2 },
  { id: "amzn", symbol: "AMZN", label: "Amazon.com", market: "stocks", currentPrice: 185, priceChangePercent: -0.15 },
  // Forex.
  { id: "eur-usd", symbol: "EUR-USD", label: "Euro / US Dollar", market: "forex", currentPrice: 1.085, priceChangePercent: 0.05 },
  { id: "gbp-usd", symbol: "GBP-USD", label: "British Pound / US Dollar", market: "forex", currentPrice: 1.27, priceChangePercent: -0.03 },
  { id: "usd-jpy", symbol: "USD-JPY", label: "US Dollar / Japanese Yen", market: "forex", currentPrice: 152.4, priceChangePercent: 0.12 },
  { id: "usd-chf", symbol: "USD-CHF", label: "US Dollar / Swiss Franc", market: "forex", currentPrice: 0.9, priceChangePercent: -0.02 },
  { id: "aud-usd", symbol: "AUD-USD", label: "Australian Dollar / US Dollar", market: "forex", currentPrice: 0.66, priceChangePercent: 0.08 },
];

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "--";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function HomeContent() {
  const router = useRouter();
  const [market, setMarket] = useState<Market>("crypto");
  // Task 2 — start with optimistic placeholders so the list is never blank.
  const [coins, setCoins] = useState<AllCoin[]>(PLACEHOLDER_COINS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the search by 300ms so filtering stays cheap while typing.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const clearSearch = () => {
    setQuery("");
    setDebouncedQuery("");
  };

  // Task 2 + Task 4 — fetch live coins immediately, then refresh every 2s.
  // Placeholders stay on screen until the first real payload arrives, so the
  // user sees instant content and it silently upgrades to live prices.
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetch("/api/market/all-coins", { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          return res.json() as Promise<{ coins?: AllCoin[] }>;
        })
        .then((data) => {
          if (!cancelled && Array.isArray(data.coins) && data.coins.length > 0) {
            setCoins(data.coins);
            setError(null);
          }
        })
        .catch((e) => {
          // Task 7 — keep showing placeholders on failure; don't surface an error UI.
          if (!cancelled) console.error("all-coins fetch failed:", e);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load();
    const interval = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const rows = useMemo(() => coins.filter((c) => c.market === market), [coins, market]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => {
      const symbol = c.symbol?.toLowerCase() ?? "";
      const label = c.label?.toLowerCase() ?? "";
      const base = symbol.replace(/usdt$/, "").split(/[\/-]/)[0] ?? "";
      return symbol.includes(q) || label.includes(q) || base.includes(q);
    });
  }, [rows, debouncedQuery]);

  return (
    <main className="min-h-screen" style={{ backgroundColor: BG }}>
      {/* Search */}
      <div className="px-4 pt-4">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search market (BTC, Gold, EUR-USD)..."
            className="w-full rounded-xl border px-4 py-2.5 pr-11 text-sm outline-none"
            style={{ backgroundColor: CARD, borderColor: BORDER, color: TEXT }}
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-base font-bold"
              style={{ color: MUTED, backgroundColor: BORDER }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Enable browser alerts (95+ score signals) */}
      <div className="px-4 pt-4">
        <EnableNotifications />
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
        {/* Task 3 — skeleton shimmer instead of a "Loading..." spinner. Only
            shows on the very first paint before any data (placeholders or live). */}
        {loading && coins.length === 0 && (
          <div className="animate-pulse p-2" role="status" aria-label="Loading markets">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="mb-2 flex items-center justify-between rounded-xl px-2 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full" style={{ backgroundColor: "#2B3139" }} />
                  <div className="flex flex-col gap-1.5">
                    <div className="h-3.5 w-24 rounded" style={{ backgroundColor: "#2B3139" }} />
                    <div className="h-2.5 w-16 rounded" style={{ backgroundColor: "#23272f" }} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="h-3.5 w-16 rounded" style={{ backgroundColor: "#2B3139" }} />
                  <div className="h-2.5 w-10 rounded" style={{ backgroundColor: "#23272f" }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-6 text-sm" style={{ color: MUTED }}>
            Koi coin nahi mila. Try 'BTC' or 'ETH'
          </p>
        )}
        {(loading || filtered.length > 0) &&
          filtered.map((c) => {
            const up = c.priceChangePercent >= 0;
            const base = c.symbol.replace(/USDT$/, "").split("/")[0].slice(0, 3) || c.label.slice(0, 1);
            return (
              <Link
                key={c.id}
                href={`/trade?symbol=${encodeURIComponent(c.symbol)}`}
                // Task 5 — prefetch the trade route on hover so a click opens instantly.
                onMouseEnter={() => router.prefetch(`/trade?symbol=${encodeURIComponent(c.symbol)}`)}
                onFocus={() => router.prefetch(`/trade?symbol=${encodeURIComponent(c.symbol)}`)}
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
export default function Home() {
  return (
    <AuthGuard>
      <HomeContent />
    </AuthGuard>
  );
}
