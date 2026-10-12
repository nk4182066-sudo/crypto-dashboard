// Educational analysis only. Not financial advice.
import React from "react";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Trend = "Bullish" | "Bearish" | "Neutral";

interface MTFConfluenceProps {
  candles: Candle[];
  market: string;
}

const TIMEFRAMES: { label: string; seconds: number }[] = [
  { label: "15m", seconds: 15 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "4h", seconds: 4 * 60 * 60 },
  { label: "1d", seconds: 24 * 60 * 60 },
];

function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / (slice.length || 1);
}

function trendFor(candles: Candle[], seconds: number): Trend {
  if (candles.length === 0) return "Neutral";
  // Resample base candles into this timeframe's buckets.
  const buckets = new Map<number, Candle>();
  for (const c of candles) {
    const key = Math.floor(c.time / seconds) * seconds;
    const agg = buckets.get(key);
    if (!agg) buckets.set(key, { ...c, time: key });
    else {
      agg.high = Math.max(agg.high, c.high);
      agg.low = Math.min(agg.low, c.low);
      agg.close = c.close;
      agg.volume += c.volume;
    }
  }
  const resampled = [...buckets.values()].sort((a, b) => a.time - b.time);
  if (resampled.length < 2) return "Neutral";
  const closes = resampled.map((c) => c.close);
  const last = closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  if (last > sma20) return "Bullish";
  if (last < sma20) return "Bearish";
  return "Neutral";
}

const STYLE: Record<Trend, { icon: string; color: string }> = {
  Bullish: { icon: "📈", color: "text-emerald-400" },
  Bearish: { icon: "📉", color: "text-red-400" },
  Neutral: { icon: "➖", color: "text-zinc-400" },
};

const MTFConfluence: React.FC<MTFConfluenceProps> = ({ candles, market }) => {
  const results = TIMEFRAMES.map((tf) => ({
    label: tf.label,
    trend: trendFor(candles, tf.seconds),
  }));
  const bullish = results.filter((r) => r.trend === "Bullish").length;
  const bearish = results.filter((r) => r.trend === "Bearish").length;
  const aligned =
    bullish > bearish ? "Bullish" : bearish > bullish ? "Bearish" : "Mixed";

  return (
    <section
      aria-label={`Multi-timeframe confluence for ${market}`}
      className="border border-zinc-800 bg-zinc-950/60 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">MTF Confluence</h3>
        <span className="text-xs text-zinc-500">SMA 20 · {market}</span>
      </div>
      <ul className="space-y-1 text-sm">
        {results.map((r) => (
          <li key={r.label} className="flex items-center justify-between">
            <span className="text-zinc-400">{r.label}:</span>
            <span className={STYLE[r.trend].color}>
              {STYLE[r.trend].icon} {r.trend}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-zinc-800 pt-2 text-xs text-zinc-300">
        Alignment: {Math.max(bullish, bearish)}/4 {aligned}
      </p>
    </section>
  );
};

export default MTFConfluence;
