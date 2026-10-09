// BeginnerTooltips: wraps the whole dashboard and shows bit-size
// tooltips for beginners. Educational tool only. Not financial advice.
"use client";

import { useState } from "react";

interface TooltipItem {
  trigger: string;
  label: string;
  description: string;
}

const TOOLTIPS: TooltipItem[] = [
  {
    trigger: "Hindistani support",
    label: "RSI (Relative Strength Index)",
    description:
      "Measures speed and change of price moves. 70+ = overbought, 30 = oversold.",
  },
  {
    trigger: "RSI",
    label: "SMA (Simple Moving Average)",
    description:
      "Average closing price over a period. SMA 20 = short-term, SMA 200 = long-term.",
  },
  {
    trigger: "SMA",
    label: "ATR (Average True Range)",
    description:
      "Measures volatility. Higher ATR = more volatile market, wider stops needed.",
  },
  {
    trigger: "ATR",
    label: "Volume Profile",
    description:
      "Shows price levels where most trading volume happened. POC = Point of Control.",
  },
  {
    trigger: "POC",
    label: "Liquidity Sweep",
    description:
      "When price briefly breaks below support to trigger stops, then reverses.",
  },
  {
    trigger: "Sweep",
    label: "Smart Money Zones",
    description:
      "Thresholds where institutions likely bought (demand) or sold (supply).",
  },
  {
    trigger: "Zones",
    label: "Kelly Criterion",
    description:
      "Formula for optimal position sizing: % = W - (1-W)/R.",
  },
  {
    trigger: "Kelly",
    label: "Breakout Filter",
    description:
      "Filters out false breakouts. Only trades when volume confirms the move.",
  },
  {
    trigger: "Filter",
    label: "Coin Scanner",
    description:
      "Auto-refreshes every 60s. Shows BTC, ETH, SOL with 24h change, RSI and divergence.",
  },
  {
    trigger: "Scanner",
    label: "Pattern Library",
    description:
      "Browse 70+ candlestick, chart and reversal patterns with explainer text.",
  },
];

interface BeginnerTooltipsProps {
  children: React.ReactNode;
}

function TooltipIcon({ label, description }: { label: string; description: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="group pointer-events-auto relative inline-block">
      <button
        type="button"
        aria-label={`Tooltip for ${label}`}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-600/50 bg-zinc-800/60 text-zinc-500 transition-all hover:border-zinc-400 hover:text-zinc-300"
      >
        <svg
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a2 2 0 112.828 2.828 2 2 0 01-2.828 0 2 2 0 012.828-2.828z"
          />
        </svg>
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 animate-in fade-in slide-in-from-top-2 rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 text-xs text-zinc-200 shadow-xl">
          <p className="mb-0.5 font-semibold text-zinc-300">{label}</p>
          <p className="text-zinc-400">{description}</p>
        </div>
      )}
    </div>
  );
}

// BeginnerTooltips has been disabled: the previous fixed full-screen overlay
// was getting stuck on top of the UI. It now acts as a transparent pass-through
// so existing usages keep working without rendering anything on screen.
export default function BeginnerTooltips({ children }: BeginnerTooltipsProps) {
  return <>{children}</>;
}
