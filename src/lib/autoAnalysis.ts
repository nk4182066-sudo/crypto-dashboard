// Rule-based analysis engine. Educational only. Not financial advice.

import type { Candle } from "@/src/analysis/types";
import { macd, rsi, sma } from "@/src/analysis/indicators";
import { findSwings } from "@/src/analysis/structure";
import { scanCandlestickPatterns } from "@/src/lib/chart/candlestickPatterns";

export type Verdict = "STRONG_SETUP" | "MODERATE" | "WAIT";
export type TrendDirection = "bullish" | "bearish" | "neutral";
export type RiskLevel = "low" | "medium" | "high";

export interface PatternInfo {
  name: string;
  type: string;
  confidence: number;
}

export interface AutoAnalysis {
  symbol: string;
  market: string;
  score: number;
  verdict: Verdict;
  trend: TrendDirection;
  timeframeAlignment: string;
  support: number;
  resistance: number;
  current: number;
  patterns: PatternInfo[];
  indicators: { rsi: number; macd: string; sma: string; volume: string };
  explanation: string;
  riskLevel: RiskLevel;
}

interface HistoryResponse {
  candles?: Candle[];
}

/** All four timeframes the engine reads through the existing history route. */
const TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;

/** Reads one timeframe from /api/market/history; failures degrade to []. */
async function fetchCandles(market: string, symbol: string, timeframe: string): Promise<Candle[]> {
  try {
    const query = new URLSearchParams({ market, symbol, timeframe });
    const response = await fetch(`/api/market/history?${query}`, { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as HistoryResponse;
    return Array.isArray(payload.candles) ? payload.candles : [];
  } catch {
    return [];
  }
}

/** Latest close versus SMA 20 (falls back to a 10-bar average on short series). */
function trendOf(candles: Candle[]): TrendDirection {
  if (candles.length < 2) return "neutral";
  const closes = candles.map((candle) => candle.close);
  const current = closes[closes.length - 1];
  const average =
    sma(closes, 20).at(-1) ??
    closes.slice(-10).reduce((sum, value) => sum + value, 0) / Math.min(10, closes.length);
  if (current > average) return "bullish";
  if (current < average) return "bearish";
  return "neutral";
}

/** Support = highest recent swing low; resistance = lowest recent swing high. */
function keyLevels(candles: Candle[]): { support: number; resistance: number } {
  if (candles.length === 0) return { support: 0, resistance: 0 };
  const { highs, lows } = findSwings(candles, 3);
  const support = lows.length > 0
    ? Math.max(...lows.slice(-5).map((point) => point.price))
    : Math.min(...candles.map((candle) => candle.low));
  const resistance = highs.length > 0
    ? Math.min(...highs.slice(-5).map((point) => point.price))
    : Math.max(...candles.map((candle) => candle.high));
  return { support, resistance };
}

/** Latest finite reading of an indicator series. */
function lastValue(series: (number | null)[]): number | null {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index];
    if (value !== null && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * Rule-based analysis of one symbol: reads 15m/1h/4h/1d candles and scores
 * five checks (25 + 25 + 20 + 15 + 15 = 100 points). No AI, no API key.
 */
export async function analyzeSymbol(symbol: string, market: string): Promise<AutoAnalysis> {
  const [m15, h1, h4, d1] = await Promise.all(
    TIMEFRAMES.map((timeframe) => fetchCandles(market, symbol, timeframe)),
  );

  // Check 1 — timeframe alignment (25 pts: 4/4=25, 3/4=18, 2/4=10, else 0).
  const trends = [m15, h1, h4, d1].map(trendOf);
  const bullish = trends.filter((trend) => trend === "bullish").length;
  const bearish = trends.filter((trend) => trend === "bearish").length;
  const trend: TrendDirection = bullish === bearish ? "neutral" : bullish > bearish ? "bullish" : "bearish";
  const aligned = trend === "neutral" ? 0 : trend === "bullish" ? bullish : bearish;
  const alignmentPoints = aligned === 4 ? 25 : aligned === 3 ? 18 : aligned === 2 ? 10 : 0;
  const alignmentWord = trend === "bullish" ? "Bullish" : trend === "bearish" ? "Bearish" : "Mixed";
  const timeframeAlignment = `${aligned}/4 ${alignmentWord}`;

  // 1h is the working chart; 1d anchors the longer-term swing levels.
  const primary = h1.length > 0 ? h1 : d1.length > 0 ? d1 : m15;
  const levelSeries = d1.length > 10 ? d1 : primary;
  const current = primary[primary.length - 1]?.close ?? 0;

  // Check 2 — key level from swing points (20 pts when near support).
  const { support, resistance } = keyLevels(levelSeries);
  const range = resistance - support;
  const position = range > 0 ? (current - support) / range : 0.5;
  const nearSupport = position <= 0.33;
  const levelPoints = nearSupport ? 20 : 0;

  // Check 3 — candlestick patterns in the last 5 candles (3+=25, 2=15, 1=8).
  const hits = scanCandlestickPatterns(primary, 5);
  const wanted: string = trend === "bearish" ? "bearish" : "bullish";
  const matches = hits.filter((hit) => hit.type === wanted);
  const patternPoints = matches.length >= 3 ? 25 : matches.length === 2 ? 15 : matches.length === 1 ? 8 : 0;
  const patterns: PatternInfo[] = hits.map((hit) => ({
    name: hit.pattern,
    type: hit.type,
    confidence: hit.confidence,
  }));

  // Check 4 — volume versus its 20-bar average (15 pts when above average).
  const volWindow = primary.slice(-20);
  const averageVolume = volWindow.reduce((sum, candle) => sum + candle.volume, 0) / (volWindow.length || 1);
  const latestVolume = primary[primary.length - 1]?.volume ?? 0;
  const aboveAverage = averageVolume > 0 && latestVolume > averageVolume;
  const volumePoints = aboveAverage ? 15 : 0;

  // Check 5 — RSI + MACD agreement with the trend (15 = both, 8 = one).
  const closes = primary.map((candle) => candle.close);
  const rsiValue = lastValue(rsi(closes, 14)) ?? 50;
  const histogram = macd(closes)?.histogram ?? 0;
  const agrees = (bullishReading: boolean) => (trend === "bearish" ? !bullishReading : bullishReading);
  const agreement = (agrees(rsiValue >= 50) ? 1 : 0) + (agrees(histogram > 0) ? 1 : 0);
  const indicatorPoints = agreement === 2 ? 15 : agreement === 1 ? 8 : 0;

  // SMA stack on the level series: how many of 20/50/200 price sits above.
  const levelCloses = levelSeries.map((candle) => candle.close);
  const aboveSma = [20, 50, 200].filter((period) => {
    const value = lastValue(sma(levelCloses, period));
    return value !== null && current > value;
  }).length;

  const score = Math.min(100, alignmentPoints + patternPoints + levelPoints + volumePoints + indicatorPoints);
  const verdict: Verdict = score >= 75 ? "STRONG_SETUP" : score >= 50 ? "MODERATE" : "WAIT";
  const riskLevel: RiskLevel = verdict === "STRONG_SETUP" ? "low" : verdict === "MODERATE" ? "medium" : "high";

  // Roman Urdu, 2-3 lines — educational summary, never a buy/sell instruction.
  const direction = trend === "bullish" ? "upar" : trend === "bearish" ? "neeche" : "side-ways";
  const explanation = [
    `${symbol} ka trend ${direction} hai aur timeframes ${timeframeAlignment} align hain.`,
    `RSI ${Math.round(rsiValue)}, MACD ${histogram > 0 ? "bullish" : "bearish"}, SMA ${aboveSma}/3 upar hai, score ${score}/100 bana hai.`,
    verdict === "STRONG_SETUP"
      ? "Confluence strong hai aur setup ban raha hai — lekin yeh sirf education ke liye hai."
      : verdict === "MODERATE"
        ? "Setup develop ho raha hai, confirmation candle ka wait karo."
        : "Direction abhi clear nahi, isliye wait karna behtar hai.",
  ].join(" ");

  return {
    symbol,
    market,
    score,
    verdict,
    trend,
    timeframeAlignment,
    support,
    resistance,
    current,
    patterns,
    indicators: {
      rsi: Math.round(rsiValue),
      macd: histogram > 0 ? "bullish" : "bearish",
      sma: `${aboveSma}/3 above`,
      volume: aboveAverage ? "above average" : "normal",
    },
    explanation,
    riskLevel,
  };
}

