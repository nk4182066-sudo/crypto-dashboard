"use client";

// AI Signals page. Clean like /markets: market tabs, then every scanned setup
// for that market (all-coins API scans the full universe), sorted by score
// highest first. Educational analysis only — never "Signal", "Buy now",
// "accuracy" or "Guaranteed".
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F6465D";
const AMBER = "#F0B90B";

type Market = "crypto" | "forex" | "stocks" | "metals";

interface MarketSignal {
  symbol: string;
  label: string;
  market: Market;
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  bias: "Bullish" | "Bearish" | "Sideways";
  price: number;
  pattern: string | null;
  support: number | null;
  resistance: number | null;
  watchLevel: number | null;
  reason: string;
  analyzedAt: string;
}

const TABS: { key: Market; label: string }[] = [
  { key: "crypto", label: "Crypto" },
  { key: "forex", label: "Forex" },
  { key: "stocks", label: "Stocks" },
  { key: "metals", label: "Metals" },
];

const REFRESH_MS = 5 * 60 * 1000;

function fmtPrice(p: number | null): string {
  if (p == null || !Number.isFinite(p) || p === 0) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
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
  if (signal.score >= 85 && signal.direction !== "neutral") return { text: "Setup detected", color: GREEN };
  return { text: "Watch zone", color: AMBER };
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

export default function SignalsPage() {
  const [market, setMarket] = useState<Market>("crypto");
  const [signals, setSignals] = useState<MarketSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/market-signals?market=${market}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load setups");
        const payload = (await response.json()) as { generatedAt?: string; results?: MarketSignal[] };
        if (cancelled) return;
        setSignals(Array.isArray(payload.results) ? payload.results : []);
        setUpdatedAt(payload.generatedAt ?? null);
      } catch {
        if (!cancelled) {
          setError("Setups load nahi ho sake. Thodi der baad try karein.");
          setSignals([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [market]);

  // Saare signals, highest score first — no minimum cutoff.
  const visible = useMemo(
    () => [...signals].sort((first, second) => second.score - first.score),
    [signals]
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      <p className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>Analysis</p>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: TEXT }}>💎 AI Setups</h1>
        <span className="text-xs" style={{ color: MUTED }}>{visible.length} setups</span>
        {updatedAt && (
          <span className="text-xs" style={{ color: MUTED }}>Updated {timeAgo(updatedAt)}</span>
        )}
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

      {/* Cards / skeleton / empty */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-40 border" style={{ borderColor: BORDER }} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border p-6 text-center text-sm" style={{ backgroundColor: CARD, borderColor: BORDER, color: RED }}>
          {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border p-6 text-center text-sm" style={{ backgroundColor: CARD, borderColor: BORDER, color: MUTED }}>
          Is market mein abhi koi setup nahi mila
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((signal) => {
            const status = statusOf(signal);
            return (
              <Link
                key={`${signal.market}:${signal.symbol}`}
                href={`/trade?symbol=${encodeURIComponent(signal.symbol)}&market=${signal.market}`}
                className="block rounded-2xl border p-4 transition-colors hover:border-[#3b4252]"
                style={{ backgroundColor: CARD, borderColor: BORDER }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-base font-bold" style={{ color: TEXT }}>{displaySymbol(signal.symbol)}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ color: GREEN, backgroundColor: "rgba(0,192,135,0.12)" }}>
                    Score: {signal.score}/100
                  </span>
                </div>

                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold" style={{ color: TEXT }}>{directionLabel(signal.direction)}</span>
                  {signal.watchLevel ? (
                    <span style={{ color: MUTED }}>— Watch ${fmtPrice(signal.watchLevel)}</span>
                  ) : null}
                  <span className="ml-auto text-xs font-semibold" style={{ color: status.color }}>{status.text}</span>
                </div>

                {signal.pattern && (
                  <p className="mb-2 text-sm" style={{ color: MUTED }}>
                    <span className="font-semibold" style={{ color: TEXT }}>Pattern:</span> {signal.pattern}
                  </p>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span style={{ color: MUTED }}>
                    Support: <span className="font-semibold" style={{ color: GREEN }}>${fmtPrice(signal.support)}</span>
                  </span>
                  <span style={{ color: MUTED }}>
                    Resistance: <span className="font-semibold" style={{ color: RED }}>${fmtPrice(signal.resistance)}</span>
                  </span>
                </div>

                <p className="mt-3 text-xs" style={{ color: MUTED }}>⚠️ Educational only</p>
              </Link>
            );
          })}
        </div>
      )}

      <footer className="mt-6 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational analysis only. Not financial advice.
      </footer>
    </main>
  );
}

