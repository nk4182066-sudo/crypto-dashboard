import type { Candle, PsychologyFlag, PsychologyReport } from "./types";
import { rsi, sma } from "./indicators";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function analyzePsychology(candles: Candle[]): PsychologyReport {
  const window = candles.slice(-80);
  if (window.length < 20) {
    const empty: PsychologyFlag = { score: 0, active: false, evidence: "Not enough candles to read crowd psychology." };
    return { fomo: empty, capitulation: empty, euphoria: empty, discipline: ["Always use a stop loss."], note: "Not enough data." };
  }

  const closes = window.map((candle) => candle.close);
  const rsiSeries = rsi(closes, 14).filter((value): value is number => value !== null);
  const currentRsi = rsiSeries.at(-1) ?? 50;
  const averageVolume = window.reduce((total, candle) => total + candle.volume, 0) / window.length;
  const sma20Series = sma(closes, 20).filter((value): value is number => value !== null);
  const sma20 = sma20Series.at(-1) ?? closes.at(-1)!;
  const last = window.at(-1)!;

  const moveStart = window[Math.max(0, window.length - 11)].close;
  const movePercent = ((last.close - moveStart) / moveStart) * 100;
  const volumeSpike = averageVolume > 0 ? last.volume / averageVolume : 1;

  const fomoScore = clampScore(
    Math.max(0, movePercent) * 4 +
    Math.max(0, currentRsi - 65) * 2 +
    Math.max(0, volumeSpike - 1) * 15,
  );
  const fomo: PsychologyFlag = {
    score: fomoScore,
    active: fomoScore >= 60 && currentRsi >= 70,
    evidence: `${movePercent >= 0 ? "+" : ""}${movePercent.toFixed(1)}% over 10 candles with RSI ${currentRsi.toFixed(0)} and volume ${volumeSpike.toFixed(1)}x average. ${fomoScore >= 60 ? "Late chasing here is how retail buys the top — wait for a pullback." : "Momentum is healthy, not euphoric."}`,
  };

  const capitulationCandidate = [...window].reverse().find((candle, index) => {
    if (index > 15) return false;
    const range = candle.high - candle.low;
    if (range <= 0 || candle.volume < averageVolume * 1.8) return false;
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    return lowerWick > range * 0.5 && upperWick < range * 0.2;
  });
  const capitulation: PsychologyFlag = {
    score: capitulationCandidate ? clampScore((capitulationCandidate.volume / averageVolume) * 35) : 15,
    active: Boolean(capitulationCandidate),
    evidence: capitulationCandidate
      ? `A volume-climax candle with a deep lower wick appeared ${(window.length - window.indexOf(capitulationCandidate))} candles ago — classic capitulation where weak hands sell to strong hands.`
      : "No volume-climax reversal in the recent window — the crowd has not capitulated yet.",
  };

  let upStreak = 0;
  for (let index = window.length - 1; index > 0; index -= 1) {
    if (window[index].close > window[index - 1].close) upStreak += 1;
    else break;
  }
  const distanceAbove = ((last.close - sma20) / sma20) * 100;
  const euphoriaScore = clampScore(upStreak * 12 + Math.max(0, distanceAbove - 4) * 5);
  const euphoria: PsychologyFlag = {
    score: euphoriaScore,
    active: euphoriaScore >= 60,
    evidence: `${upStreak} consecutive up-candles and price ${distanceAbove.toFixed(1)}% above its 20-period average. ${euphoriaScore >= 60 ? "Parabolic runs end without warning — take partial profits and trail stops." : "Trend is extended but not parabolic."}`,
  };

  const discipline: string[] = [
    "Risk a fixed percentage per trade (1% or less) — no exceptions, no size changes after a loss.",
    "Write the entry reason before entry; if you cannot write it, there is no setup.",
  ];
  if (fomo.active) discipline.push("FOMO is active: skip the chase, place the limit order at the pullback or pass entirely.");
  if (euphoria.active) discipline.push("Euphoria is active: take partial profits and move the stop to break-even on runners.");
  if (capitulation.active) discipline.push("Capitulation printed: this is where buyers are made — look for reclaim entries, not panic sells.");
  discipline.push("Never revenge-trade: after two consecutive losses, stop for the session and journal what happened.");

  const note = "Psychology read is heuristic: price patterns and volume are proxies for crowd emotion. They warn you about your own behaviour — they do not predict price.";

  return { fomo, capitulation, euphoria, discipline, note };
}
