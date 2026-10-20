"use client";
import AuthGuard from "@/components/AuthGuard";

// Home - search, alerts, top 5 movers and a short news preview.
// The market tabs and the long coin list were removed (the bottom bar now has
// a live News tab), so Home no longer duplicates the Markets screen.
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

interface NewsItem {
  id: string;
  title: string;
  source: string;
  link: string;
  timeAgo: string;
  tag: "Crypto" | "Forex" | "Stock" | "Gold";
}

/** Small optimistic placeholder set so the first paint is never empty. */
const PLACEHOLDER_COINS: AllCoin[] = [
  { id: "BTCUSDT", symbol: "BTCUSDT", label: "BTC/USDT", market: "crypto", currentPrice: 83000, priceChangePercent: 0.25 },
  { id: "ETHUSDT", symbol: "ETHUSDT", label: "ETH/USDT", market: "crypto", currentPrice: 2300, priceChangePercent: 0.2 },
  { id: "SOLUSDT", symbol: "SOLUSDT", label: "SOL/USDT", market: "crypto", currentPrice: 109, priceChangePercent: 0.1 },
  { id: "BNBUSDT", symbol: "BNBUSDT", label: "BNB/USDT", market: "crypto", currentPrice: 600, priceChangePercent: -0.15 },
  { id: "XRPUSDT", symbol: "XRPUSDT", label: "XRP/USDT", market: "crypto", currentPrice: 0.52, priceChangePercent: 0.35 },
  { id: "ADAUSDT", symbol: "ADAUSDT", label: "ADA/USDT", market: "crypto", currentPrice: 0.45, priceChangePercent: -0.2 },
  { id: "DOGEUSDT", symbol: "DOGEUSDT", label: "DOGE/USDT", market: "crypto", currentPrice: 0.12, priceChangePercent: 0.5 },
  { id: "AVAXUSDT", symbol: "AVAXUSDT", label: "AVAX/USDT", market: "crypto", currentPrice: 28, priceChangePercent: 0.18 },
];

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "-";
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function HomeContent() {
  const router = useRouter();
  // Start with optimistic placeholders so the list is never blank.
  const [coins, setCoins] = useState<AllCoin[]>(PLACEHOLDER_COINS);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [news, setNews] = useState<NewsItem[]>([]);

  // Debounce the search by 300ms so filtering stays cheap while typing.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const clearSearch = () => {
    setQuery("");
    setDebouncedQuery("");
  };

  // Fetch live coins immediately, then refresh every 5s. Placeholders stay on
  // screen until the first real payload arrives, so the user sees instant
  // content and it silently upgrades to live prices.
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
          }
        })
        .catch((e) => {
          // Keep showing placeholders on failure; do not surface an error UI.
          if (!cancelled) console.error("all-coins fetch failed:", e);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Short news preview for the Home page (the full feed lives on /news).
  useEffect(() => {
    let cancelled = false;
    const loadNews = () => {
      fetch("/api/news?limit=5", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data && Array.isArray(data.items)) {
            setNews(data.items as NewsItem[]);
          }
        })
        .catch(() => {
          /* the preview is optional - stay silent if it fails */
        });
    };
    loadNews();
    const interval = setInterval(loadNews, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  /** Search matches every market (crypto, forex, metals, stocks). */
  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    return coins.filter((c) => {
      const symbol = c.symbol?.toLowerCase() ?? "";
      const label = c.label?.toLowerCase() ?? "";
      const base = symbol.replace(/usdt$/, "").split(/[\/-]/)[0] ?? "";
      return symbol.includes(q) || label.includes(q) || base.includes(q);
    });
  }, [coins, debouncedQuery]);

  /** Top 5 movers - biggest absolute 24h move across the whole universe.
   *  The universe contains the same asset in both spot and futures (e.g.
   *  EPICUSDT), so we collapse those twins and keep the stronger move. */
  const movers = useMemo(() => {
    const best = new Map<string, AllCoin>();
    for (const c of coins) {
      if (!Number.isFinite(c.priceChangePercent) || c.priceChangePercent === 0) continue;
      const key = (c.symbol ?? "").replace(/usdt$/i, "").toUpperCase() || c.id;
      const current = best.get(key);
      if (
        !current ||
        Math.abs(c.priceChangePercent) > Math.abs(current.priceChangePercent)
      ) {
        best.set(key, c);
      }
    }
    return [...best.values()]
      .sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent))
      .slice(0, 5);
  }, [coins]);

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: BG }}>
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
              x
            </button>
          )}
        </div>
      </div>

      {/* Search results - only visible while the user is typing. */}
      {query.trim().length > 0 && (
        <div
          className="mx-4 mt-3 overflow-hidden rounded-2xl border"
          style={{ backgroundColor: CARD, borderColor: BORDER }}
        >
          {loading && filtered.length === 0 && (
            <p className="px-4 py-4 text-sm" style={{ color: MUTED }}>
              Searching...
            </p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="px-4 py-4 text-sm" style={{ color: MUTED }}>
              Koi coin nahi mila. Try &quot;BTC&quot; or &quot;ETH&quot;
            </p>
          )}
          {filtered.slice(0, 20).map((c) => {
            const up = c.priceChangePercent >= 0;
            const base =
              c.symbol.replace(/USDT$/, "").split("/")[0].slice(0, 3) || c.label.slice(0, 1);
            return (
              <Link
                key={c.id}
                href={`/trade?symbol=${encodeURIComponent(c.symbol)}`}
                onMouseEnter={() =>
                  router.prefetch(`/trade?symbol=${encodeURIComponent(c.symbol)}`)
                }
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
                    {fmtPrice(c.currentPrice)}
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
      )}

      {/* Enable browser alerts (95+ score signals) */}
      <div className="px-4 pt-4">
        <EnableNotifications />
      </div>

      {/* Top 5 movers */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: TEXT }}>
            Top 5 Movers (24h)
          </h2>
          <Link href="/markets" className="text-xs font-semibold" style={{ color: GREEN }}>
            All markets
          </Link>
        </div>
        <div
          className="mt-2 overflow-hidden rounded-2xl border"
          style={{ backgroundColor: CARD, borderColor: BORDER }}
        >
          {loading && movers.length === 0 && (
            <div className="animate-pulse p-3" role="status" aria-label="Loading movers">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="mb-2 h-10 rounded" style={{ backgroundColor: "#23272f" }} />
              ))}
            </div>
          )}
          {movers.map((c) => {
            const up = c.priceChangePercent >= 0;
            const base =
              c.symbol.replace(/USDT$/, "").split("/")[0].slice(0, 3) || c.label.slice(0, 1);
            return (
              <Link
                key={c.id}
                href={`/trade?symbol=${encodeURIComponent(c.symbol)}`}
                className="flex items-center justify-between border-b px-4 py-3 last:border-b-0"
                style={{ borderColor: BORDER }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
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
                    {fmtPrice(c.currentPrice)}
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
      </div>

      {/* Short news preview - the full feed lives on /news */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: TEXT }}>
            Latest News
          </h2>
          <Link href="/news" className="text-xs font-semibold" style={{ color: GREEN }}>
            See all
          </Link>
        </div>
        <div
          className="mt-2 overflow-hidden rounded-2xl border"
          style={{ backgroundColor: CARD, borderColor: BORDER }}
        >
          {news.length === 0 ? (
            <p className="px-4 py-4 text-sm" style={{ color: MUTED }}>
              News load ho rahi hai...
            </p>
          ) : (
            news.map((n) => (
              <a
                key={n.id}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block border-b px-4 py-3 last:border-b-0"
                style={{ borderColor: BORDER }}
              >
                <p className="text-sm font-semibold leading-snug" style={{ color: TEXT }}>
                  {n.title}
                </p>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>
                  {n.source} | {n.timeAgo} | {n.tag}
                </p>
              </a>
            ))
          )}
        </div>
      </div>

      <p className="mt-5 px-4 text-center text-sm" style={{ color: MUTED }}>
        100% Free for everyone. No hidden charges. No paid analysis.
      </p>
      <p className="mt-2 mb-4 px-4 text-center text-xs" style={{ color: MUTED }}>
        Educational only. Not financial advice.
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