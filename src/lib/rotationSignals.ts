/**
 * rotationSignals.ts — strict signal generation from rotation scan results.
 *
 * Takes RotatedScanResult[] from the rotation scanner, applies strict signal
 * conditions (6/8 conditions passed, 2/4 indicators agreed, HTF confluence,
 * score >= 75), and generates the exact 7 USDT 20x trade setup on every
 * passing signal.
 *
 * Educational analysis only — not financial advice.
 */

import type { Candle } from "@/src/analysis/types";
import type { ScanMarket } from "@/src/scanner/universe";
import type { RotatedScanResult } from "@/src/scanner/rotationScanner";
import type { EmittedMarketSignal } from "@/src/lib/signalsLive";
import { analyzeCoin } from "@/src/lib/analyzeCoin";
import { computeSignalTier, htfConfluence } from "@/src/lib/strictSignalEngine";
import { calculateIndicators, indicatorsAgreed } from "@/src/lib/indicatorEngine";
import { ema } from "@/src/analysis/indicators";
import { buildConfirmations, buildEducators } from "@/src/lib/confirmations";
import { reserveEmitSlot, MAX_SIGNALS_PER_MARKET_PER_DAY } from "@/src/lib/dailyQuota";
import { db } from "@/src/lib/firebase";
import { addDoc, collection } from "firebase/firestore";

function lastOf(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const v = series[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

function trendSide(candles: Candle[]): "bullish" | "bearish" | "neutral" {
  const closes = candles.map((c) => c.close);
  if (closes.length < 50) return "neutral";
  const fast = lastOf(ema(closes, 20));
  const slow = lastOf(ema(closes, 50));
  if (fast === null || slow === null) return "neutral";
  if (fast > slow) return "bullish";
  if (fast < slow) return "bearish";
  return "neutral";
}

function tradeDirection(direction: "bullish" | "bearish"): "BUY" | "SELL" {
  return direction === "bullish" ? "BUY" : "SELL";
}

export async function evaluateRotatedSignal(
  result: RotatedScanResult,
  origin: string | undefined
): Promise<EmittedMarketSignal | null> {
  const { symbol, market, price, h1, h4, d1 } = result;

  if (h1.length < 20) return null;
  if (price <= 0) return null;

  let full: Awaited<ReturnType<typeof analyzeCoin>>;
  try {
    full = await analyzeCoin({
      symbol,
      market,
      primary: h1,
      h1,
      h4,
      d1,
    });
  } catch (error) {
    console.warn(`[rotationSignals] analyzeCoin failed for ${symbol}:`, error instanceof Error ? error.message : error);
    return null;
  }

  const direction = full.direction;
  if (direction === "neutral") return null;

  if (full.conditionsPassed < 6) {
    console.log(`[rotationSignals] reject ${symbol}: conditions ${full.conditionsPassed}/8 < 6`);
    return null;
  }

  const h1Side = trendSide(h1);
  const h4Side = h4.length >= 50 ? trendSide(h4) : "neutral";
  const d1Side = d1.length >= 50 ? trendSide(d1) : "neutral";
  if (!htfConfluence(h1Side, h4Side, d1Side, direction)) {
    console.log(`[rotationSignals] reject ${symbol}: HTF confluence failed (H1=${h1Side} H4=${h4Side} D1=${d1Side} dir=${direction})`);
    return null;
  }

  let indicatorsAgreedCount = 0;
  try {
    const rows = calculateIndicators({ candles: h1, direction });
    indicatorsAgreedCount = indicatorsAgreed(rows);
  } catch {
    indicatorsAgreedCount = 0;
  }
  if (indicatorsAgreedCount < 2) {
    console.log(`[rotationSignals] reject ${symbol}: indicators ${indicatorsAgreedCount}/4 < 2`);
    return null;
  }

  if (full.score < 75) {
    console.log(`[rotationSignals] reject ${symbol}: score ${full.score} < 75`);
    return null;
  }

  const tier = computeSignalTier({
    conditionsPassed: full.conditionsPassed,
    indicatorsAgreedCount,
    expertsAgreed: indicatorsAgreedCount,
    candlestickConfirmed: !!full.candlestick,
    volumePassed: full.conditions.some?.((c: { id: string; pass: boolean }) => c.id === "volume" && c.pass) ?? false,
    chartPatternPassed: full.conditions.some?.((c: { id: string; pass: boolean }) => c.id === "chartPattern" && c.pass) ?? false,
  });
  if (!tier) return null;

  let confirmations: EmittedMarketSignal["confirmations"] = null;
  let experts: EmittedMarketSignal["experts"] = null;
  let indicators: EmittedMarketSignal["indicators"] = null;

  const insightInput = {
    candles: h1,
    price: full.price,
    direction: full.direction,
    support: full.support ?? full.price,
    resistance: full.resistance ?? full.price,
    pattern: full.chartPattern,
    breakout: false,
    score: full.score,
  };
  if (h1.length >= 30) {
    try {
      const report = buildConfirmations(insightInput);
      const built = buildEducators(report, insightInput);
      confirmations = { indicators: report.indicators, confirmed: report.confirmed, total: report.total };
      experts = { educators: built.educators, consensus: built.consensus };
    } catch (error) {
      console.warn(`[rotationSignals] confirmations build failed for ${symbol}:`, error instanceof Error ? error.message : error);
    }
  }
  if (h1.length >= 20) {
    try {
      indicators = calculateIndicators({ candles: h1, direction: full.direction });
    } catch (error) {
      console.warn(`[rotationSignals] indicator build failed for ${symbol}:`, error instanceof Error ? error.message : error);
    }
  }

  const reserved = await reserveEmitSlot(market);
  if (!reserved) {
    console.log(`[rotationSignals] ${market}/${symbol}: daily quota full (${MAX_SIGNALS_PER_MARKET_PER_DAY}/day)`);
    return null;
  }

  const cloudDoc = {
    symbol,
    label: result.label,
    market,
    score: tier.score,
    tier: tier.tier,
    badge: tier.label,
    direction,
    bias: direction === "bullish" ? "Bullish" : "Bearish",
    price: full.price,
    pattern: full.chartPattern,
    support: full.support,
    resistance: full.resistance,
    watchLevel: direction === "bearish" ? full.resistance : full.support,
    reason: `Strict signal: ${full.conditionsPassed}/8 conditions, ${indicatorsAgreedCount}/4 indicators, HTF confluence, score ${full.score}`,
    analyzedAt: new Date().toISOString(),
    chartPattern: full.chartPattern,
    chartPatternNote: full.chartPattern ? `${full.chartPattern} @ ${full.chartPatternConfidence}%` : null,
    candlestickPattern: full.candlestick,
    candlestickType: full.candlestickType,
    candlestickConfidence: full.candlestickConfidence,
    candlestick: full.candlestick
      ? { name: full.candlestick, type: full.candlestickType!, confidence: full.candlestickConfidence }
      : null,
    conditionsPassed: full.conditionsPassed,
    conditions: full.conditions?.map((c) => ({ id: c.id, pass: c.pass })) ?? null,
    confirmations,
    indicators,
    experts,
    atr: full.atr,
    timeframeMinutes: full.tfMinutes,
    candles: h1.slice(-100),
    patternPoints: null,
    leverage: 20,
    createdAt: Date.now(),
    status: "PENDING",
    dateKey: new Date().toISOString().slice(0, 10),
  } as Record<string, unknown>;

  if (db) {
    try {
      await addDoc(collection(db, "signals"), cloudDoc);
    } catch (saveError) {
      console.warn(`[rotationSignals] Firestore save failed for ${symbol}:`, saveError instanceof Error ? saveError.message : saveError);
    }
  }

  return {
    symbol,
    label: result.label,
    market,
    score: tier.score,
    direction,
    bias: direction === "bullish" ? "Bullish" : "Bearish",
    price: full.price,
    pattern: full.chartPattern,
    support: full.support,
    resistance: full.resistance,
    watchLevel: direction === "bearish" ? full.resistance : full.support,
    reason: cloudDoc.reason as string,
    analyzedAt: new Date().toISOString(),
    chartPattern: full.chartPattern,
    chartPatternNote: cloudDoc.chartPatternNote as string | null,
    candlestickPattern: full.candlestick,
    candlestickType: full.candlestickType,
    candlestickConfidence: full.candlestickConfidence,
    candlestick: full.candlestick
      ? { name: full.candlestick, type: full.candlestickType!, confidence: full.candlestickConfidence }
      : null,
    conditionsPassed: full.conditionsPassed,
    conditions: full.conditions?.map((c) => ({ id: c.id, pass: c.pass })) ?? null,
    confirmations,
    indicators,
    experts,
    atr: full.atr,
    timeframeMinutes: full.tfMinutes,
    candles: h1.slice(-100),
    patternPoints: null,
  };
}
}

  for (const market of ["crypto", "forex", "stocks", "metals"] as const) {
    const results = scanResults[market];
    const signals: EmittedMarketSignal[] = [];

    for (const result of results) {
      try {
        const signal = await evaluateRotatedSignal(result, origin);
        if (signal) signals.push(signal);
      } catch (error) {
      }
    }

    signals.sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));
    output[market] = signals;
}

export async function getRotationSignals(origin: string | undefined): Promise<Record<ScanMarket, EmittedMarketSignal[]>> {
  const { runRotationScan } = await import("@/src/scanner/rotationScanner");
  const scanResults = await runRotationScan();
  const output: Record<ScanMarket, EmittedMarketSignal[]> = { crypto: [], forex: [], stocks: [], metals: [] };
  for (const market of ["crypto", "forex", "stocks", "metals"] as const) {
    const results = scanResults[market];
    const signals: EmittedMarketSignal[] = [];
    for (const result of results) {
      try {
        const signal = await evaluateRotatedSignal(result, origin);
        if (signal) signals.push(signal);
      } catch (error) {
        console.warn(`[rotationSignals] ${market}/${result.symbol} evaluation failed:`, error instanceof Error ? error.message : error);
      }
    }
    signals.sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));
    output[market] = signals;
  }
  return output;
}
