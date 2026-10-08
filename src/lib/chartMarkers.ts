// Auto chart markers for the analysis overlay. Educational only. Not financial advice.

import { LineStyle } from "lightweight-charts";
import type { ChartAnalysis } from "@/src/lib/autoChartAnalysis";

interface MarkerCandle {
  time: number;
  close: number;
}

export interface AnalysisMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  text: string;
}

export interface AnalysisPriceLine {
  price: number;
  color: string;
  lineStyle: LineStyle;
  title: string;
}

export interface AnalysisZone {
  priceHigh: number;
  priceLow: number;
  color: string;
  label: string;
}

export interface ChartMarkerBundle {
  markers: AnalysisMarker[];
  priceLines: AnalysisPriceLine[];
  zones: AnalysisZone[];
}

const EMPTY: ChartMarkerBundle = { markers: [], priceLines: [], zones: [] };

const MIN_PATTERN_CONFIDENCE = 75;

/**
 * Maps an analysis onto lightweight-charts primitives: high-confidence pattern
 * markers at candle times, touch-validated support/resistance lines, plus entry
 * and target zones. Educational only. Not financial advice.
 */
export function generateChartMarkers(analysis: ChartAnalysis, candles: MarkerCandle[]): ChartMarkerBundle {
  if (candles.length === 0 || analysis.support === 0 || analysis.resistance === 0) return EMPTY;
  const lastTime = candles[candles.length - 1].time;
  const markers: AnalysisMarker[] = [];
  const priceLines: AnalysisPriceLine[] = [];
  const zones: AnalysisZone[] = [];

  // Patterns with 75%+ confidence — anchored to the most recent candle times.
  const confident = analysis.patterns.filter((pattern) => pattern.confidence >= MIN_PATTERN_CONFIDENCE).slice(0, 3);
  confident.forEach((pattern, index) => {
    const anchor = candles[candles.length - 1 - index] ?? candles[candles.length - 1];
    const bullish = pattern.type === "bullish";
    markers.push({
      time: anchor.time,
      position: bullish ? "belowBar" : "aboveBar",
      color: bullish ? "#22c55e" : pattern.type === "bearish" ? "#ef4444" : "#facc15",
      shape: bullish ? "arrowUp" : pattern.type === "bearish" ? "arrowDown" : "circle",
      text: pattern.name,
    });
  });

  // Support (green dashed) / resistance (red dashed) only with 2+ touches.
  for (const level of analysis.levels) {
    if (level.strength === "fresh") continue;
    const isSupport = level.type === "support";
    priceLines.push({
      price: level.price,
      color: isSupport ? "#22c55e" : "#ef4444",
      lineStyle: LineStyle.Dashed,
      title: `${isSupport ? "Support" : "Resistance"} (${level.strength})`,
    });
  }

  // Entry zone (yellow) only when there is directional posture to act on.
  const actionable = analysis.tradeStatus !== "NO_SETUP" && analysis.direction !== "neutral";
  if (actionable) {
    const entryMid = analysis.currentPrice;
    zones.push({
      priceHigh: entryMid * 1.003,
      priceLow: entryMid * 0.997,
      color: "#facc15",
      label: "Entry zone",
    });
    // Target zone (blue) at the opposing level, plus a directional arrow marker.
    const target = analysis.direction === "bullish" ? analysis.resistance : analysis.support;
    zones.push({
      priceHigh: target * 1.002,
      priceLow: target * 0.998,
      color: "#3b82f6",
      label: "Target",
    });
    markers.push({
      time: lastTime,
      position: analysis.direction === "bullish" ? "belowBar" : "aboveBar",
      color: "#3b82f6",
      shape: analysis.direction === "bullish" ? "arrowUp" : "arrowDown",
      text: `TARGET ${target.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
    });
  }

  return { markers, priceLines, zones };
}
