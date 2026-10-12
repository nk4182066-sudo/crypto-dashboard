"use client";

/**
 * This box gives educational guidance in Roman Urdu.
 * It does NOT give buy/sell advice.
 * Users must make their own decisions.
 */

import { useMemo } from "react";

export interface GuidanceCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type RiskLevel = "Low" | "Medium" | "High";

export interface WhatToDoNowProps {
  candles: GuidanceCandle[];
  /** Alignment summary, e.g. "3/4 Bullish", "Mixed setup". */
  trendAlignment: string;
}

export interface Guidance {
  /** 2-3 short Roman Urdu lines. */
  message: string;
  riskLevel: RiskLevel;
}

/** Candles averaged when judging whether volume is elevated. */
const VOLUME_WINDOW = 10;
/** Current price must sit within this share of the range to count as "near" a level. */
const NEAR_LEVEL_RATIO = 0.03;
/** Volume at or above this multiple of the average counts as high. */
const HIGH_VOLUME_RATIO = 1.2;

export function generateGuidance(candles: GuidanceCandle[], alignment: string): Guidance {
  const lines: string[] = [];

  if (!candles.length) {
    return { message: "Market data load nahi hua. Thori der baad dobara dekhein.", riskLevel: "Medium" };
  }

  // ---- 1. Trend alignment ------------------------------------------------
  const bullishCount = Number(alignment.match(/(\d)\/4/)?.[1] ?? NaN);
  const isBullish = /bullish/i.test(alignment) && bullishCount >= 3;
  const isBearish = bullishCount <= 1 || /bearish/i.test(alignment);

  if (isBullish) {
    lines.push("Trend clear bullish hai.");
  } else if (isBearish) {
    lines.push("Trend bearish hai.");
  } else {
    lines.push("Market confused hai.");
  }

  // ---- 2. Volume ---------------------------------------------------------
  const recent = candles.slice(-VOLUME_WINDOW);
  const recentVolume = recent.reduce((sum, candle) => sum + (candle.volume ?? 0), 0) / (recent.length || 1);
  const older = candles.slice(0, Math.max(1, candles.length - VOLUME_WINDOW));
  const olderVolume = older.reduce((sum, candle) => sum + (candle.volume ?? 0), 0) / (older.length || 1);
  const highVolume = olderVolume > 0 && recentVolume >= olderVolume * HIGH_VOLUME_RATIO;

  // ---- 3. Distance to the nearest support / resistance ------------------
  const last = candles[candles.length - 1];
  const lows = candles.slice(-VOLUME_WINDOW).map((candle) => candle.low);
  const highs = candles.slice(-VOLUME_WINDOW).map((candle) => candle.high);
  const price = last.close;
  const nearestSupport = Math.max(...lows.filter((low) => low <= price), Math.min(...lows));
  const nearestResistance = Math.min(...highs.filter((high) => high >= price), Math.max(...highs));
  const nearSupport = price > 0 && price - nearestSupport <= price * NEAR_LEVEL_RATIO;
  const nearResistance = price > 0 && nearestResistance - price <= price * NEAR_LEVEL_RATIO;

  // ---- 4. Compose the guidance ------------------------------------------
  if (isBullish) {
    lines.push(nearSupport ? "Price support ke qareeb hai, bounce ka wait karein." : "Support zone qareeb ho to watch karein.");
    if (highVolume) lines.push("Volume barhi hui hai, move qeem lag sakta hai.");
  } else if (isBearish) {
    lines.push(nearResistance ? "Price resistance ke qareeb hai, breakout ya rejection dekhein." : "Resistance zone qareeb ho to watch karein.");
    if (highVolume) lines.push("Volume barhi hui hai, move qeem lag sakta hai.");
  } else {
    lines.push("Clear direction ka wait karein.");
    lines.push(nearSupport ? "Support ke qareeb hai, reaction dekhein." : nearResistance ? "Resistance ke qareeb hai, reaction dekhein." : "Range ke andar hai, patience rakhein.");
  }

  // Risk rises with conflicting evidence and with volume-driven fast moves.
  let riskLevel: RiskLevel = "Low";
  if (nearSupport || nearResistance) riskLevel = "Medium";
  if (highVolume && (nearSupport || nearResistance)) riskLevel = "High";
  if (!isBullish && !isBearish) riskLevel = riskLevel === "Low" ? "Medium" : "High";

  return { message: lines.join(" "), riskLevel };
}

const RISK_STYLES: Record<RiskLevel, string> = {
  Low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Medium: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  High: "bg-red-500/15 text-red-300 border-red-500/40",
};

export default function WhatToDoNow({ candles, trendAlignment }: WhatToDoNowProps) {
  const guidance = useMemo(() => generateGuidance(candles, trendAlignment), [candles, trendAlignment]);

  return (
    <section
      className="rounded-xl border border-purple-500/40 bg-zinc-900/70 p-4"
      aria-label="Ab kya karna chahiye - educational guidance"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold tracking-wide text-purple-200">🎯 AB KYA KARNA CHAHIYE?</h3>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RISK_STYLES[guidance.riskLevel]}`}
          title={`Risk level: ${guidance.riskLevel} (low is safer, not a guarantee)`}
        >
          Risk: {guidance.riskLevel}
        </span>
      </header>

      <p className="text-sm leading-relaxed text-zinc-200">{guidance.message}</p>

      <footer className="mt-3 border-t border-zinc-800 pt-2 text-[11px] text-zinc-500">
        ⚠️ Ye sirf analysis hai. Faisla apna khud karein.
      </footer>
    </section>
  );
}