// Auto chart analysis. Educational only. Not financial advice.

import { analyzeSymbol, type AutoAnalysis, type PatternInfo } from "@/src/lib/autoAnalysis";
import { sma } from "@/src/analysis/indicators";
import type { Candle } from "@/src/analysis/types";

export type AnalysisVerdict = "STRONG" | "MODERATE" | "WEAK";
export type TradeStatus = "SETUP_FORMING" | "NO_SETUP" | "WATCH";
export type Direction = "bullish" | "bearish" | "neutral";

export interface ChartAnalysisLevel {
  price: number;
  type: "support" | "resistance";
  strength: string;
}

export interface ChartAnnotation {
  time: number;
  price: number;
  label: string;
  color: string;
  position: "aboveBar" | "belowBar";
}

export interface ChartAnalysis {
  symbol: string;
  market: string;
  currentPrice: number;
  score: number;
  verdict: AnalysisVerdict;
  tradeStatus: TradeStatus;
  direction: Direction;
  support: number;
  resistance: number;
  patterns: PatternInfo[];
  indicators: { rsi: number; macd: string; sma20: number; sma50: number; volume: string };
  timeframeAlignment: string;
  explanation: { headline: string; detail: string; action: string; riskNote: string };
  levels: ChartAnalysisLevel[];
  chartAnnotations: ChartAnnotation[];
}

interface HistoryPayload {
  candles?: Candle[];
}

/** Reads 1h candles for SMA values and level touch counts; failures degrade to []. */
async function fetchCandles(market: string, symbol: string): Promise<Candle[]> {
  try {
    const query = new URLSearchParams({ market, symbol, timeframe: "1h" });
    const response = await fetch(`/api/market/history?${query}`, { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as HistoryPayload;
    return Array.isArray(payload.candles) ? payload.candles : [];
  } catch {
    return [];
  }
}

const money = (value: number): string =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 2 : 4 })}`;

/** How many recent candles traded through this level (drives level strength). */
function touchCount(candles: Candle[], level: number): number {
  if (level === 0 || candles.length === 0) return 0;
  const tolerance = Math.abs(level) * 0.002;
  return candles.filter((candle) => candle.low <= level + tolerance && candle.high >= level - tolerance).length;
}

/** Score 80+ with 3/4 alignment = setup, 60-79 = watch, below 60 = no setup. */
function tradeStatusOf(score: number, alignment: string): TradeStatus {
  const aligned = Number.parseInt(alignment, 10) || 0;
  if (score >= 80 && aligned >= 3) return "SETUP_FORMING";
  return score >= 60 ? "WATCH" : "NO_SETUP";
}

function verdictOf(verdict: AutoAnalysis["verdict"]): AnalysisVerdict {
  return verdict === "STRONG_SETUP" ? "STRONG" : verdict === "MODERATE" ? "MODERATE" : "WEAK";
}

/** Roman Urdu explanation block shown on the chart overlay. */
function buildExplanation(analysis: AutoAnalysis, status: TradeStatus): ChartAnalysis["explanation"] {
  const aligned = analysis.timeframeAlignment;
  const pattern = analysis.patterns[0];
  const rsiWord = analysis.indicators.rsi >= 70 ? "hot" : analysis.indicators.rsi <= 30 ? "oversold" : "healthy";
  if (status === "SETUP_FORMING") {
    return {
      headline: `${analysis.symbol} - Strong ${analysis.trend} setup detected`,
      detail:
        `Support ${money(analysis.support)} pe price react kar raha hai${pattern ? ` aur ${pattern.name} pattern bana hai` : ""}. ` +
        `${aligned} timeframes align hain. RSI ${analysis.indicators.rsi} ${rsiWord}. ` +
        `Volume ${analysis.indicators.volume}. Setup strong hai.`,
      action: `Watch zone: ${money(analysis.current * 0.998)} - ${money(analysis.current * 1.002)}`,
      riskNote: `Agar ${money(analysis.support)} toot jaye to setup fail ho jayega.`,
    };
  }
  if (status === "WATCH") {
    return {
      headline: `${analysis.symbol} - Setup develop ho raha hai`,
      detail:
        `Score ${analysis.score}/100 hai aur ${aligned} timeframes align hain. ` +
        `RSI ${analysis.indicators.rsi} ${rsiWord}, volume ${analysis.indicators.volume}. ` +
        `Confirmation candle ka wait karein.`,
      action: "Confirmation ka wait karein",
      riskNote: `Abhi stop ${money(analysis.support)} ke neeche rakhna safe hai.`,
    };
  }
  return {
    headline: `${analysis.symbol} - No clear setup right now`,
    detail:
      `Market confused hai. ${aligned} timeframes align hain. ` +
      `RSI ${analysis.indicators.rsi} neutral, volume ${analysis.indicators.volume}. ` +
      `Clear direction ka wait karein.`,
    action: "Wait karein",
    riskNote: "Koi trade na lein abhi.",
  };
}


/**
 * Auto chart analysis. Educational only. Not financial advice.
 * Wraps analyzeSymbol into the chart overlay payload: score, verdict, trade
 * status, Roman Urdu explanation, touch-weighted levels and annotations.
 */
export async function getChartAnalysis(symbol: string, market: string): Promise<ChartAnalysis> {
  const [base, candles] = await Promise.all([analyzeSymbol(symbol, market), fetchCandles(market, symbol)]);
  const closes = candles.map((candle) => candle.close);
  const sma20 = sma(closes, 20).at(-1) ?? base.current;
  const sma50 = sma(closes, 50).at(-1) ?? base.current;
  const supportTouches = touchCount(candles, base.support);
  const resistanceTouches = touchCount(candles, base.resistance);
  const lastTime = candles.at(-1)?.time ?? Math.floor(Date.now() / 1000);
  const tradeStatus = tradeStatusOf(base.score, base.timeframeAlignment);

  return {
    symbol: base.symbol,
    market: base.market,
    currentPrice: base.current,
    score: base.score,
    verdict: verdictOf(base.verdict),
    tradeStatus,
    direction: base.trend,
    support: base.support,
    resistance: base.resistance,
    patterns: base.patterns,
    indicators: {
      rsi: base.indicators.rsi,
      macd: base.indicators.macd,
      sma20,
      sma50,
      volume: base.indicators.volume,
    },
    timeframeAlignment: base.timeframeAlignment,
    explanation: buildExplanation(base, tradeStatus),
    levels: [
      { price: base.support, type: "support", strength: supportTouches >= 3 ? "major" : supportTouches >= 2 ? "minor" : "fresh" },
      { price: base.resistance, type: "resistance", strength: resistanceTouches >= 3 ? "major" : resistanceTouches >= 2 ? "minor" : "fresh" },
    ],
    chartAnnotations: [
      { time: lastTime, price: base.support, label: `Support ${money(base.support)}`, color: "#22c55e", position: "belowBar" },
      { time: lastTime, price: base.resistance, label: `Resistance ${money(base.resistance)}`, color: "#ef4444", position: "aboveBar" },
    ],
  };
}
