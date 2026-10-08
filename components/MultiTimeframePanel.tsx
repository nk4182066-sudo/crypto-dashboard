"use client";

/**
 * Multi-timeframe analysis shows trend alignment
 * across different timeframes. Educational only.
 */

import { useEffect, useState } from "react";

export type TrendType = "Bullish" | "Bearish" | "Neutral";

export interface MultiTimeframePanelProps {
  symbol: string;
  /** Market vocabulary used by the history API: crypto | forex | stocks | metals. */
  market: string;
}

interface HistoryResponse {
  candles?: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>;
  error?: string;
}

/** Newest-last ordering, matching every provider the app uses. */
const TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;

/** How many candles back to measure the move against. */
const LOOKBACK = 10;

/**
 * Compares the latest close with the close LOOKBACK candles earlier.
 * Returns Neutral when the two are equal or either is unusable, rather than
 * guessing a direction from a rounding-level difference.
 */
export function calculateTrend(candles: HistoryResponse["candles"]): TrendType {
  if (!candles || candles.length < LOOKBACK + 1) return "Neutral";
  const latest = candles[candles.length - 1]?.close;
  const previous = candles[candles.length - 1 - LOOKBACK]?.close;
  if (!Number.isFinite(latest) || !Number.isFinite(previous)) return "Neutral";
  if (latest > previous) return "Bullish";
  if (latest < previous) return "Bearish";
  return "Neutral";
}

/** Fetches one timeframe's candles and reduces them to a trend. */
export async function fetchTrendForTimeframe(symbol: string, market: string, timeframe: string): Promise<TrendType> {
  const query = new URLSearchParams({ market, symbol, timeframe });
  try {
    const response = await fetch(`/api/market/history?${query}`);
    if (!response.ok) return "Neutral";
    return calculateTrend(((await response.json()) as HistoryResponse).candles);
  } catch {
    // A failed timeframe degrades that row only; the panel still renders.
    return "Neutral";
  }
}

const ARROWS: Record<TrendType, string> = { Bullish: "📈", Bearish: "📉", Neutral: "➡️" };
const ROW_STYLES: Record<TrendType, string> = { Bullish: "text-emerald-400", Bearish: "text-red-400", Neutral: "text-zinc-400" };

/**
 * Compact vertical trend summary for 15m / 1h / 4h / 1d.
 *
 * Terminology is deliberately trend-only: this reports direction, never a
 * "Buy"/"Sell" instruction or a confidence percentage.
 */
export default function MultiTimeframePanel({ symbol, market }: MultiTimeframePanelProps) {
  const [trends, setTrends] = useState<Record<string, TrendType>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol || !market) return;
    let active = true;
    setLoading(true);

    // Requested together so the rows fill in one round trip.
    Promise.all(TIMEFRAMES.map((tf) => fetchTrendForTimeframe(symbol, market, tf)))
      .then((results) => {
        // Ignore a response that lands after the symbol changed.
        if (!active) return;
        setTrends(Object.fromEntries(TIMEFRAMES.map((tf, index) => [tf, results[index]])));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [symbol, market]);

  const known = TIMEFRAMES.map((tf) => trends[tf]).filter(Boolean);
  const bullish = known.filter((trend) => trend === "Bullish").length;
  const bearish = known.filter((trend) => trend === "Bearish").length;
  const neutral = known.length - bullish - bearish;

  // "Mixed setup" when the timeframes disagree, so a split read is never
  // presented as agreement.
  const aligned = known.length === TIMEFRAMES.length && (bullish === 4 || bearish === 4);
  const summary = loading
    ? "Loading trends…"
    : known.length === 0
      ? "Trend data unavailable"
      : aligned
        ? `Alignment: ${bullish || bearish}/4 ${bullish ? "Bullish" : "Bearish"}`
        : `Mixed setup (${bullish} Bullish · ${bearish} Bearish · ${neutral} Neutral)`;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3" aria-label="Multi-timeframe trend alignment">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Trend Alignment</h3>
        <span className="text-[11px] text-zinc-500">{symbol}</span>
      </header>

      <ul className="flex flex-col divide-y divide-zinc-800">
        {TIMEFRAMES.map((tf) => {
          const trend = trends[tf];
          return (
            <li key={tf} className="flex items-center justify-between py-1.5 text-xs" title="4 timeframes ka trend alignment">
              <span className="font-medium text-zinc-300">{tf}</span>
              <span className={`flex items-center gap-1.5 ${trend ? ROW_STYLES[trend] : "text-zinc-600"}`}>
                {trend ? (
                  <>
                    <span aria-hidden="true">{ARROWS[trend]}</span>
                    <span>{trend}</span>
                  </>
                ) : (
                  <span>—</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <footer className="mt-2 border-t border-zinc-800 pt-2 text-xs text-zinc-400">{summary}</footer>
    </section>
  );
}