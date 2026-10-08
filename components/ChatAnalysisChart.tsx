"use client";

import { useEffect, useRef, useState } from "react";
import TradingChart, { type IndicatorOverlay } from "./TradingChart";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PricePattern {
  name: string;
  points: { time: number; price: number }[];
}

interface CandlePattern {
  time: number;
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  price: number;
}

interface TradePlan {
  direction: "buy" | "sell" | "wait";
  qualityScore: number | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  rewardRisk: number | null;
  reason: string;
}

interface TradeSummary {
  balance: string;
  risk: string;
  maxLoss: string;
  size: string;
  margin: string;
  leverage: string;
  rewardRisk: string;
  requestedProfit: string;
  requestedRewardRisk: string;
  estimatedProfit: string;
}

interface ChatAnalysisChartProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  levels: { support: number[]; resistance: number[] };
  patterns: PricePattern[];
  candlePatterns: CandlePattern[];
  trend: "Bullish" | "Bearish" | "Sideways";
  tradePlan: TradePlan;
  tradeSummary?: TradeSummary;
  language?: "English" | "Urdu" | "Roman Urdu";
  verdict?: "Take Entry" | "Wait" | "Do Not Enter";
}

function average(values: number[], endIndex: number, period: number) {
  if (endIndex + 1 < period) return null;
  const window = values.slice(endIndex - period + 1, endIndex + 1);
  return window.reduce((total, value) => total + value, 0) / period;
}

function exponentialAverage(values: number[], period: number) {
  const result: (number | null)[] = Array(values.length).fill(null);
  if (values.length < period) return result;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
  result[period - 1] = current;
  for (let index = period; index < values.length; index += 1) {
    current = (values[index] - current) * multiplier + current;
    result[index] = current;
  }
  return result;
}

function fitBoundary(candles: Candle[], field: "high" | "low") {
  const startIndex = Math.max(0, candles.length - 40);
  const values = candles.slice(startIndex).map((candle) => candle[field]);
  if (values.length < 5) return null;
  const meanX = (values.length - 1) / 2;
  const meanY = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, _, index) => total + (index - meanX) ** 2, 0);
  const slope = values.reduce((total, value, index) => total + (index - meanX) * (value - meanY), 0) / variance;
  const intercept = meanY - slope * meanX;
  return {
    startIndex,
    endIndex: candles.length - 1,
    startPrice: intercept,
    endPrice: intercept + slope * (values.length - 1),
  };
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 7 }).format(price);
}

function verdictLabel(direction: TradePlan["direction"], language: ChatAnalysisChartProps["language"], verdict: ChatAnalysisChartProps["verdict"]) {
  if (verdict === "Do Not Enter") {
    if (language === "Roman Urdu") return "ENTRY MAT LO";
    if (language === "Urdu") return "انٹری نہ لیں";
    return "DO NOT ENTER";
  }
  if (language === "Roman Urdu") return direction === "wait" ? "WAIT KAREIN" : "ENTRY LE LO";
  if (language === "Urdu") return direction === "wait" ? "انتظار کریں" : "انٹری لے لیں";
  return direction === "wait" ? "WAIT" : `ENTRY ${direction.toUpperCase()}`;
}

export default function ChatAnalysisChart({ candles, symbol, timeframe, levels, patterns, candlePatterns, trend, tradePlan, tradeSummary, language, verdict }: ChatAnalysisChartProps) {
  const fullscreenRef = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const closes = candles.map((candle) => candle.close);
  const latest = candles.at(-1);
  const rsiValues = candles.map((_, index) => {
    if (index < 14) return null;
    let gains = 0;
    let losses = 0;
    for (let offset = index - 13; offset <= index; offset += 1) {
      const change = closes[offset] - closes[offset - 1];
      gains += Math.max(change, 0);
      losses += Math.max(-change, 0);
    }
    return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  });
  const fastEma = exponentialAverage(closes, 12);
  const slowEma = exponentialAverage(closes, 26);
  const macdValues = closes.map((_, index) => fastEma[index] !== null && slowEma[index] !== null ? fastEma[index]! - slowEma[index]! : null);
  const macdSignal = exponentialAverage(macdValues.flatMap((value) => value === null ? [] : [value]), 9);
  const macdStart = macdValues.findIndex((value) => value !== null);
  const macdHistogram = macdValues.map((value, index) => value === null ? null : value - (macdSignal[index - macdStart] ?? value));
  const overlays: IndicatorOverlay[] = ([50, 100, 200] as const).map((period) => ({
    id: `sma${period}` as IndicatorOverlay["id"],
    points: candles.flatMap((candle, index) => {
      const value = average(closes, index, period);
      return value === null ? [] : [{ time: candle.time, value }];
    }),
  }));
  const bollingerPoints = candles.flatMap((candle, index) => {
    const middle = average(closes, index, 20);
    if (middle === null) return [];
    const window = closes.slice(index - 19, index + 1);
    const deviation = Math.sqrt(window.reduce((total, value) => total + (value - middle) ** 2, 0) / window.length);
    return [{ time: candle.time, upper: middle + deviation * 2, middle, lower: middle - deviation * 2 }];
  });
  for (const [id, field] of [["bollingerUpper", "upper"], ["bollingerMiddle", "middle"], ["bollingerLower", "lower"]] as const) {
    overlays.push({ id, points: bollingerPoints.map((point) => ({ time: point.time, value: point[field] })) });
  }

  const range = candles.slice(-120);
  const rangeHigh = Math.max(...range.map((candle) => candle.high));
  const rangeLow = Math.min(...range.map((candle) => candle.low));
  const chartLevels: { kind: "support" | "resistance" | "entry" | "stopLoss" | "takeProfit" | "fibonacci"; price: number; label: string }[] = [
    ...levels.support.slice(0, 2).map((price, index) => ({ kind: "support" as const, price, label: `Support ${index + 1} · ${formatPrice(price)}` })),
    ...levels.resistance.slice(0, 2).map((price, index) => ({ kind: "resistance" as const, price, label: `Resistance ${index + 1} · ${formatPrice(price)}` })),
    ...(rangeHigh > rangeLow ? [0.382, 0.618].map((ratio) => ({ kind: "fibonacci" as const, price: rangeHigh - (rangeHigh - rangeLow) * ratio, label: `Fib ${Math.round(ratio * 100)}%` })) : []),
  ];
  const targetPrices = tradePlan.direction === "wait" || tradePlan.entry === null || tradePlan.takeProfit === null
    ? []
    : [1 / 3, 2 / 3, 1].map((fraction) => tradePlan.entry! + (tradePlan.takeProfit! - tradePlan.entry!) * fraction);
  if (tradePlan.direction !== "wait" && tradePlan.entry !== null && tradePlan.stopLoss !== null) {
    chartLevels.push({ kind: "entry", price: tradePlan.entry, label: `ENTRY · ${formatPrice(tradePlan.entry)}` });
    chartLevels.push({ kind: "stopLoss", price: tradePlan.stopLoss, label: `SL · ${formatPrice(tradePlan.stopLoss)}` });
    targetPrices.forEach((price, index) => chartLevels.push({ kind: "takeProfit", price, label: `TP${index + 1} · ${formatPrice(price)}` }));
  }

  const upper = fitBoundary(candles, "high");
  const lower = fitBoundary(candles, "low");
  const patternOutlines = [
    ...patterns.flatMap((pattern) => [
      { name: pattern.name, points: pattern.points, color: /triangle|double|head|shoulder/i.test(pattern.name) ? "#facc15" : /flag|channel/i.test(pattern.name) ? "#38bdf8" : "#f472b6" },
      ...(/head|shoulder/i.test(pattern.name) && pattern.points.length === 5
        ? [{ name: `${pattern.name} neckline`, points: [pattern.points[1], pattern.points[3]], color: "#f472b6" }]
        : []),
    ]),
    ...(upper ? [{ name: "Upper trendline", color: "#facc15", points: [{ time: candles[upper.startIndex].time, price: upper.startPrice }, { time: candles[upper.endIndex].time, price: upper.endPrice }] }] : []),
    ...(lower ? [{ name: "Lower trendline", color: "#38bdf8", points: [{ time: candles[lower.startIndex].time, price: lower.startPrice }, { time: candles[lower.endIndex].time, price: lower.endPrice }] }] : []),
  ];
  const entrySignal = latest && tradePlan.direction !== "wait" && tradePlan.entry !== null
    ? [{ direction: tradePlan.direction, time: latest.time, price: tradePlan.entry, reason: "Validated entry" }]
    : [];
  const currentRsi = rsiValues.at(-1);
  const currentMacd = macdHistogram.at(-1);
  const recentCandlePatterns = candlePatterns.slice(-2);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === fullscreenRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === fullscreenRef.current) await document.exitFullscreen();
    else await fullscreenRef.current?.requestFullscreen();
  };

  const verdictColor = verdict === "Do Not Enter" ? "border-rose-500/50 bg-rose-500/10 text-rose-200" : tradePlan.direction === "wait" ? "border-amber-500/50 bg-amber-500/10 text-amber-200" : "border-emerald-500/50 bg-emerald-500/10 text-emerald-200";
  const approvedPatterns = [...patterns.map((pattern) => pattern.name), ...candlePatterns.slice(-5).map((pattern) => pattern.name)];
  const nextStep = verdict === "Do Not Enter"
    ? { en: "Do not enter. The supplied evidence invalidates this setup.", ur: "انٹری نہ لیں۔ موجودہ شواہد اس سیٹ اپ کو غلط ثابت کرتے ہیں۔", roman: "Entry mat lein. Maujooda evidence is setup ko invalidate karta hai." }
    : tradePlan.direction === "wait"
      ? { en: "Wait for a new confirmed setup. Do not enter from this chart alone.", ur: "نئی تصدیق شدہ صورتحال کا انتظار کریں۔ صرف اس چارٹ کی بنیاد پر ٹریڈ نہ کریں۔", roman: "Naye confirmed setup ka wait karein. Sirf is chart ki bunyaad par trade na lein." }
      : { en: "Check the entry, stop, and targets. If price has moved past the entry, do not chase it.", ur: "انٹری، اسٹاپ اور اہداف دیکھیں۔ قیمت انٹری سے آگے جا چکی ہو تو اس کا پیچھا نہ کریں۔", roman: "Entry, stop aur targets check karein. Price entry se aage nikal gaya ho to uska peecha na karein." };

  return (
    <section ref={fullscreenRef} className={`mb-3 w-full overflow-y-auto border border-zinc-700 bg-[#0b0e11] text-zinc-100 ${fullscreen ? "h-screen p-4" : "rounded-lg p-3"}`} aria-label="Live technical analysis chart">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">{symbol} <span className="text-zinc-400">· {timeframe}</span></h3>
          <p className="text-[11px] text-zinc-400">{latest ? `Live close ${formatPrice(latest.close)} · ${new Date(latest.time * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC` : "Waiting for candles"}</p>
        </div>
        <button type="button" onClick={() => void toggleFullscreen()} className="rounded border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800" aria-label={fullscreen ? "Exit full-screen chart" : "Open full-screen chart"}>
          {fullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </header>
      <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-400">
        <span className="text-amber-300">━ Upper trendline</span>
        <span className="text-sky-300">━ Lower trendline</span>
        <span>SMA 50 / 100 / 200 · Bollinger Bands · Fibonacci</span>
      </div>

      <div className="h-[360px] min-h-[320px] w-full" style={{ height: fullscreen ? "min(62vh, 720px)" : undefined }}>
        <TradingChart
          data={candles}
          chartKey={`${symbol}:${timeframe}`}
          signals={entrySignal}
          candlePatterns={recentCandlePatterns}
          levels={chartLevels}
          trendDirection={trend}
          patternOutlines={patternOutlines}
          indicatorOverlays={overlays}
          height={fullscreen ? 700 : 360}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section className="rounded border border-zinc-800 bg-[#11161c] p-2" aria-label="RSI indicator">
          <div className="mb-1 flex justify-between text-[11px]"><strong>RSI · 14</strong><span>{currentRsi === null || currentRsi === undefined ? "n/a" : currentRsi.toFixed(1)}</span></div>
          <div className="relative h-12 overflow-hidden border-y border-zinc-800">
            <div className="absolute inset-x-0 top-[30%] border-t border-dashed border-amber-900" />
            <div className="absolute inset-x-0 top-1/2 border-t border-zinc-700" />
            <div className="absolute inset-x-0 top-[70%] border-t border-dashed border-amber-900" />
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="h-full w-full">
              <path d={rsiValues.flatMap((value, index) => value === null ? [] : [`${index ? "L" : "M"}${(index / Math.max(1, rsiValues.length - 1) * 1000).toFixed(1)},${(100 - value).toFixed(1)}`]).join(" ")} fill="none" stroke="#38bdf8" strokeWidth="2" />
            </svg>
          </div>
        </section>
        <section className="rounded border border-zinc-800 bg-[#11161c] p-2" aria-label="MACD indicator">
          <div className="mb-1 flex justify-between text-[11px]"><strong>MACD · 12 / 26 / 9</strong><span>{currentMacd === null || currentMacd === undefined ? "n/a" : formatPrice(currentMacd)}</span></div>
          <div className="flex h-12 items-center gap-px border-y border-zinc-800">
            {macdHistogram.slice(-80).map((value, index) => <span key={index} className={`flex-1 ${value !== null && value >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} style={{ height: `${Math.max(2, Math.abs(value ?? 0) / Math.max(0.000001, ...macdHistogram.flatMap((item) => item === null ? [] : [Math.abs(item)])) * 100)}%` }} />)}
          </div>
        </section>
      </div>

      <div className={`mt-3 rounded border p-3 ${verdictColor}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-lg">{verdictLabel(tradePlan.direction, language, verdict)}</strong>
          <span className="text-xs font-semibold">{tradePlan.qualityScore === null ? "Quality n/a" : `Quality ${tradePlan.qualityScore}/100 · not a win probability`}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed">{tradePlan.reason || "No approved entry from the current evidence."}</p>
        <p className="mt-2 text-xs font-medium">What to do now: {nextStep.en}</p>
      </div>

      <details className="mt-3 rounded border border-zinc-800 bg-[#11161c] p-3">
        <summary className="cursor-pointer text-xs font-semibold text-zinc-200">Pattern guide · simple explanations in English, Urdu, and Roman Urdu</summary>
        <div className="mt-3 space-y-3 text-xs leading-relaxed text-zinc-300">
          {approvedPatterns.length ? approvedPatterns.map((name, index) => <PatternGuide key={`${name}-${index}`} name={name} />) : <p>No chart or candlestick pattern was confirmed.</p>}
          <div className="border-t border-zinc-800 pt-2">
            <p><strong className="text-white">English:</strong> {nextStep.en}</p>
            <p><strong className="text-white">اردو:</strong> {nextStep.ur}</p>
            <p><strong className="text-white">Roman Urdu:</strong> {nextStep.roman}</p>
          </div>
        </div>
      </details>

      {tradeSummary && <p className="mt-2 text-[10px] text-zinc-500">Size {tradeSummary.size} · Margin {tradeSummary.margin} · Leverage {tradeSummary.leverage} · R:R {tradeSummary.rewardRisk} · SMA 50/100/200 and Bollinger Bands are overlaid on the chart. Fibonacci levels are approximate retracements.</p>}
    </section>
  );
}

function PatternGuide({ name }: { name: string }) {
  const pattern = name.toLowerCase();
  let guide = {
    en: "A repeated price shape can suggest a pause or change, but it is not a promise. Wait for confirmation.",
    ur: "قیمت کی دہرائی ہوئی شکل رکنے یا بدلنے کا اشارہ ہو سکتی ہے، ضمانت نہیں۔ تصدیق کا انتظار کریں۔",
    roman: "Price ki dohrayi hui shape rukne ya badalne ka ishara ho sakti hai, guarantee nahi. Tasdeeq ka wait karein.",
  };
  if (pattern.includes("double top")) guide = { en: "Price tested a ceiling twice. A confirmed break below the middle support can indicate weakness.", ur: "قیمت نے دو بار اوپری حد آزمائی۔ درمیان کی سپورٹ ٹوٹنے کی تصدیق کمزوری دکھا سکتی ہے۔", roman: "Price ne do baar upar ki had test ki. Darmiyani support tootne ki tasdeeq kamzori dikha sakti hai." };
  else if (pattern.includes("double bottom")) guide = { en: "Price tested a floor twice. A confirmed move above the middle resistance can indicate strength.", ur: "قیمت نے دو بار نچلی حد آزمائی۔ درمیان کی ریزسٹنس سے اوپر تصدیق شدہ حرکت مضبوطی دکھا سکتی ہے۔", roman: "Price ne do baar neeche ki had test ki. Darmiyani resistance se upar tasdeeq-shuda move mazbooti dikha sakti hai." };
  else if (pattern.includes("head") || pattern.includes("shoulder")) guide = { en: "Three peaks can warn that an uptrend is weakening. The neckline break needs confirmation.", ur: "تین چوٹیاں اوپر کے رجحان کی کمزوری دکھا سکتی ہیں۔ نیک لائن ٹوٹنے کی تصدیق ضروری ہے۔", roman: "Teen peaks upar ke trend ki kamzori dikha sakti hain. Neckline break ki tasdeeq zaroori hai." };
  else if (pattern.includes("triangle")) guide = { en: "Price is moving between narrowing boundaries. Wait for a confirmed breakout; direction is not certain before then.", ur: "قیمت سکڑتی ہوئی حدوں میں چل رہی ہے۔ تصدیق شدہ بریک آؤٹ کا انتظار کریں؛ پہلے سمت یقینی نہیں۔", roman: "Price tang hoti boundaries mein chal rahi hai. Confirmed breakout ka wait karein; us se pehle direction pakki nahi." };
  else if (pattern.includes("flag")) guide = { en: "A short pause follows a strong move. The next breakout may continue the move, but can fail.", ur: "تیز حرکت کے بعد مختصر وقفہ ہے۔ اگلا بریک آؤٹ حرکت جاری رکھ سکتا ہے مگر ناکام بھی ہو سکتا ہے۔", roman: "Tez move ke baad chhota pause hai. Agla breakout move jari rakh sakta hai, magar fail bhi ho sakta hai." };
  else if (pattern.includes("channel")) guide = { en: "Price is moving between two parallel boundaries. The edges may act as support and resistance.", ur: "قیمت دو متوازی حدوں کے درمیان چل رہی ہے۔ کنارے سپورٹ اور ریزسٹنس بن سکتے ہیں۔", roman: "Price do parallel boundaries ke darmiyan chal rahi hai. Kinare support aur resistance ban sakte hain." };
  else if (pattern.includes("wedge")) guide = { en: "Price is squeezed between sloping lines. A break may change direction; wait for confirmation.", ur: "قیمت ترچھی لائنوں کے درمیان دب رہی ہے۔ بریک سمت بدل سکتا ہے؛ تصدیق کا انتظار کریں۔", roman: "Price tirchi lines ke darmiyan dab rahi hai. Break direction badal sakta hai; tasdeeq ka wait karein." };
  else if (pattern.includes("doji")) guide = { en: "Open and close are close together. Buyers and sellers are undecided; it is not a trade setup by itself.", ur: "اوپن اور کلوز قریب ہیں۔ خریدار اور فروخت کنندہ غیر فیصلہ کن ہیں؛ یہ اکیلا ٹریڈ سیٹ اپ نہیں۔", roman: "Open aur close qareeb hain. Buyers aur sellers undecided hain; yeh akela trade setup nahi." };
  else if (pattern.includes("hammer")) guide = { en: "A long lower wick shows price was pushed down and then recovered. Look for follow-through.", ur: "لمبی نچلی وِک بتاتی ہے کہ قیمت نیچے گئی پھر واپس آئی۔ اگلی تصدیق دیکھیں۔", roman: "Lambi lower wick batati hai price neeche gayi phir wapas aayi. Agli tasdeeq dekhein." };
  else if (pattern.includes("shooting star")) guide = { en: "A long upper wick shows price was rejected higher. Look for follow-through before acting.", ur: "لمبی اوپری وِک بتاتی ہے کہ اوپر کی قیمت رد ہوئی۔ قدم سے پہلے مزید تصدیق دیکھیں۔", roman: "Lambi upper wick batati hai upar ki price reject hui. Action se pehle mazeed tasdeeq dekhein." };
  else if (pattern.includes("engulfing")) guide = { en: "The latest candle's body covers the prior body, showing a possible momentum shift. Confirm with context.", ur: "تازہ کینڈل کا جسم پچھلے جسم کو ڈھانپتا ہے، رفتار بدلنے کا امکان ہے۔ باقی حالات سے تصدیق کریں۔", roman: "Nayi candle ka body pichle body ko cover karta hai, momentum badalne ka imkaan hai. Context se tasdeeq karein." };
  else if (pattern.includes("morning star")) guide = { en: "A three-candle shape can indicate buyers returning after a fall. Wait for confirmation.", ur: "تین کینڈل کی شکل گراوٹ کے بعد خریداروں کی واپسی دکھا سکتی ہے۔ تصدیق کا انتظار کریں۔", roman: "Teen candle ki shape girawat ke baad buyers ki wapsi dikha sakti hai. Tasdeeq ka wait karein." };
  else if (pattern.includes("evening star")) guide = { en: "A three-candle shape can indicate buyers weakening after a rise. Wait for confirmation.", ur: "تین کینڈل کی شکل تیزی کے بعد خریداروں کی کمزوری دکھا سکتی ہے۔ تصدیق کا انتظار کریں۔", roman: "Teen candle ki shape tezi ke baad buyers ki kamzori dikha sakti hai. Tasdeeq ka wait karein." };

  return <div className="border-t border-zinc-800 pt-2"><strong className="text-white">{name}</strong><p><strong>English:</strong> {guide.en}</p><p><strong>اردو:</strong> {guide.ur}</p><p><strong>Roman Urdu:</strong> {guide.roman}</p></div>;
}