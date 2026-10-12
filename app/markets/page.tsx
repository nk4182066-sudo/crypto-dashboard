"use client";

// Markets — every asset in one searchable table.
// Tabs: Spot | Futures | Metals | Stocks | Forex.
// Table columns: Symbol | Price | 24h Change | Volume | Leverage | Action.
// Data comes from /api/market/all-coins (Binance spot + Binance futures USDT
// pairs + static metals / forex / stocks with live Yahoo prices), refreshed on
// an interval. Action -> /trade?symbol=X&market=Y&leverage=Z.
// Educational only. Not financial advice.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F6465D";

type Market = "crypto" | "futures" | "metals" | "stocks" | "forex";

interface Coin {
  id: string;
  symbol: string;
  label: string;
  market: Market;
  currentPrice: number;
  priceChangePercent: number;
  quoteVolume?: number;
}

// Order matches the requested tabs: Spot | Futures | Metals | Stocks | Forex.
const TABS: { key: Market; label: string }[] = [
  { key: "crypto", label: "Spot" },
  { key: "futures", label: "Futures" },
  { key: "metals", label: "Metals" },
  { key: "stocks", label: "Stocks" },
  { key: "forex", label: "Forex" },
];

/** Leverage presets per market — futures go up to 100x, CFD classes to 50x. */
const LEVERAGE_OPTIONS: Record<Market, number[]> = {
  crypto: [1],
  futures: [1, 5, 10, 20, 50, 100],
  metals: [1, 5, 10, 20, 50],
  stocks: [1, 5, 10, 20, 50],
  forex: [1, 5, 10, 20, 50],
};

/** Sensible starting leverage per market (futures 20x, others 5x, spot 1x). */
const DEFAULT_LEVERAGE: Record<Market, number> = {
  crypto: 1,
  futures: 20,
  metals: 5,
  stocks: 5,
  forex: 5,
};

/** Display names for the well-known coins (falls back to the ticker/label). */
const COIN_NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", XRP: "XRP",
  ADA: "Cardano", DOGE: "Dogecoin", AVAX: "Avalanche", LINK: "Chainlink",
  DOT: "Polkadot", MATIC: "Polygon", LTC: "Litecoin", TRX: "TRON",
  UNI: "Uniswap", ATOM: "Cosmos", ETC: "Ethereum Classic", NEAR: "NEAR",
  APT: "Aptos", FIL: "Filecoin", ARB: "Arbitrum", OP: "Optimism",
};

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function fmtVolume(v: number | undefined): string {
  if (!v || !Number.isFinite(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

/** BTCUSDT -> BTC · XAU-USD -> XAU · AAPL -> AAPL */
function baseOf(symbol: string): string {
  return symbol.replace(/usdt$/i, "").split(/[\-/]/)[0] ?? symbol;
}

function nameOf(coin: Coin): string {
  const base = baseOf(coin.symbol);
  return COIN_NAMES[base] ?? coin.label ?? base;
}

/** How many rows render before "Load more" (keeps 400+ pairs snappy). */
const PAGE_SIZE = 60;

export default function MarketsPage() {
  const [market, setMarket] = useState<Market>("crypto");
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  // Per-row leverage selection, keyed by coin id.
  const [leverage, setLeverage] = useState<Record<string, number>>({});

  // Load once, then refresh every 5s so prices/change stay live.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void fetch("/api/market/all-coins", { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          return res.json() as Promise<{ coins?: Coin[]; error?: string }>;
        })
        .then((data) => {
          if (Array.isArray(data.coins) && data.coins.length > 0) {
            setCoins(data.coins);
            setError(null);
          }
        })
        .catch((e) => {
          setError(String(e?.message ?? e));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Rows for the active tab.
  const rows = useMemo(() => coins.filter((c) => c.market === market), [coins, market]);

  // Real-time search across symbol / base / name.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => {
      const symbol = c.symbol?.toLowerCase() ?? "";
      const label = c.label?.toLowerCase() ?? "";
      const base = baseOf(c.symbol).toLowerCase();
      const name = nameOf(c).toLowerCase();
      return symbol.includes(q) || base.includes(q) || label.includes(q) || name.includes(q);
    });
  }, [rows, search]);

  // Reset paging in the handlers instead of an effect (lint-clean).
  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const selectMarket = (next: Market) => {
    setMarket(next);
    setVisible(PAGE_SIZE);
  };
  const onSearch = (value: string) => {
    setSearch(value);
    setVisible(PAGE_SIZE);
  };

  const leverageFor = (coin: Coin): number => leverage[coin.id] ?? DEFAULT_LEVERAGE[coin.market];

  const tradeHref = (coin: Coin): string => {
    const params = new URLSearchParams({
      symbol: coin.symbol,
      market: coin.market,
      leverage: String(leverageFor(coin)),
    });
    return `/trade?${params.toString()}`;
  };

  const leverageOptions = LEVERAGE_OPTIONS[market];
  const hasQuery = search.trim().length > 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      <h1 className="mb-3 text-xl font-bold" style={{ color: TEXT }}>📈 Markets</h1>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search coin (BTC, ETH, Gold, EUR-USD)..."
        aria-label="Search markets"
        className="mb-2 w-full rounded-xl border px-4 py-2.5 text-sm outline-none"
        style={{ backgroundColor: CARD, borderColor: BORDER, color: TEXT }}
      />

      {/* Count + clear */}
      <div className="mb-3 flex items-center justify-between text-xs" style={{ color: MUTED }}>
        <span>
          Showing {filtered.length} of {rows.length} coins
          {loading && coins.length === 0 ? " · loading..." : ""}
        </span>
        {hasQuery && (
          <button type="button" onClick={() => onSearch("")} className="font-semibold" style={{ color: GREEN }}>
            Clear
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectMarket(t.key)}
            aria-pressed={market === t.key}
            className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: market === t.key ? GREEN : CARD,
              color: market === t.key ? BG : MUTED,
              border: `1px solid ${BORDER}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase" style={{ borderColor: BORDER, color: MUTED }}>
              <th className="px-3 py-2 font-semibold">Symbol</th>
              <th className="px-3 py-2 text-right font-semibold">Price</th>
              <th className="px-3 py-2 text-right font-semibold">24h Change</th>
              <th className="px-3 py-2 text-right font-semibold">Volume</th>
              <th className="px-3 py-2 text-center font-semibold">Leverage</th>
              <th className="px-3 py-2 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && coins.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-sm" style={{ color: MUTED }}>
                  Loading market data...
                </td>
              </tr>
            )}
            {!loading && error && coins.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-sm" style={{ color: RED }}>
                  Data load nahi ho saka. Thori dair baad try karein. ({error})
                </td>
              </tr>
            )}
            {!loading && !error && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-sm" style={{ color: MUTED }}>
                  Koi coin nahi mila. Try &quot;BTC&quot; or &quot;ETH&quot;
                </td>
              </tr>
            )}
            {shown.map((c) => {
              const up = c.priceChangePercent >= 0;
              return (
                <tr key={c.id} className="border-b last:border-b-0" style={{ borderColor: BORDER }}>
                  <td className="px-3 py-2">
                    <span className="block text-sm font-semibold" style={{ color: TEXT }}>
                      {c.label ?? c.symbol}
                    </span>
                    <span className="block text-[11px]" style={{ color: MUTED }}>
                      {nameOf(c)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold" style={{ color: TEXT }}>
                    {fmtPrice(c.currentPrice)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold" style={{ color: up ? GREEN : RED }}>
                    {up ? "+" : ""}
                    {c.priceChangePercent.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right text-xs" style={{ color: MUTED }}>
                    {fmtVolume(c.quoteVolume)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <select
                      value={leverageFor(c)}
                      onChange={(e) =>
                        setLeverage((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))
                      }
                      aria-label={`Leverage for ${c.symbol}`}
                      className="rounded-md border px-1.5 py-1 text-xs font-semibold outline-none"
                      style={{ backgroundColor: BG, borderColor: BORDER, color: TEXT }}
                    >
                      {leverageOptions.map((lev) => (
                        <option key={lev} value={lev}>
                          {lev}x
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={tradeHref(c)}
                      className="inline-block rounded-lg px-3 py-1.5 text-xs font-bold"
                      style={{ backgroundColor: GREEN, color: BG }}
                    >
                      Trade
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {visible < filtered.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE * 2)}
          className="mt-3 w-full rounded-xl border py-2.5 text-sm font-semibold"
          style={{ borderColor: BORDER, backgroundColor: CARD, color: TEXT }}
        >
          Load more ({filtered.length - visible} remaining)
        </button>
      )}

      <footer className="mt-4 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational only. Leverage increases risk. Not financial advice.
      </footer>
    </main>
  );
}
