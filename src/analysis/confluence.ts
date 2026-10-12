import type { TimeframeKey, TrendBias } from "./types";

export interface TimeframeSnapshot {
  timeframe: TimeframeKey;
  bias: TrendBias;
  confidence: number;
  price: number;
  regime: string;
  setupDirection: "buy" | "sell" | "wait";
  qualityScore: number;
}

export interface ConfluenceResult {
  frames: TimeframeSnapshot[];
  higherTimeframeBias: TrendBias;
  lowerTimeframeEntry: string;
  aligned: boolean;
  score: number;
  note: string;
}

const weights: Record<TimeframeKey, number> = { "1w": 5, "1d": 4, "4h": 3, "1h": 2, "15m": 1 };

export function buildConfluence(frames: TimeframeSnapshot[]): ConfluenceResult {
  const ordered = [...frames].sort((first, second) => weights[first.timeframe] - weights[second.timeframe]);
  const higher = frames.filter((frame) => weights[frame.timeframe] >= 3);
  const lower = ordered[0] ?? null;

  let weightedBull = 0;
  let weightedBear = 0;
  let totalWeight = 0;
  for (const frame of higher) {
    const weight = weights[frame.timeframe];
    totalWeight += weight;
    if (frame.bias === "Bullish") weightedBull += weight;
    else if (frame.bias === "Bearish") weightedBear += weight;
  }

  const net = totalWeight === 0 ? 0 : (weightedBull - weightedBear) / totalWeight;
  const higherTimeframeBias: TrendBias = net > 0.25 ? "Bullish" : net < -0.25 ? "Bearish" : "Sideways";

  const lowerDirection = lower?.setupDirection ?? "wait";
  const aligned = higherTimeframeBias !== "Sideways" && (
    (higherTimeframeBias === "Bullish" && lowerDirection === "buy") ||
    (higherTimeframeBias === "Bearish" && lowerDirection === "sell")
  );

  const alignedFrames = frames.filter((frame) => frame.bias === higherTimeframeBias).length;
  const score = frames.length === 0 ? 0 : Math.round((alignedFrames / frames.length) * 60 + (aligned ? 30 : 0) + Math.abs(net) * 10);

  const lowerTimeframeEntry = lower
    ? lower.setupDirection === "wait"
      ? `No entry trigger on the ${lower.timeframe} chart yet — wait for a confirmation candle.`
      : `On the ${lower.timeframe} chart, look for a ${lower.setupDirection === "buy" ? "long" : "short"} entry in the direction of the ${higherTimeframeBias.toLowerCase()} higher-timeframe bias.`
    : "Add a lower timeframe for an entry trigger.";

  const note = aligned
    ? `Higher timeframes are ${higherTimeframeBias.toLowerCase()} and the entry timeframe agrees — this is an A+ aligned setup.`
    : higherTimeframeBias === "Sideways"
      ? "Higher timeframes are mixed. Trade smaller or wait for the weekly/daily to pick a side."
      : `Conflict: higher timeframes are ${higherTimeframeBias.toLowerCase()} but the entry timeframe points ${lowerDirection === "buy" ? "up" : "down"}. Prefer the higher-timeframe direction or stand aside.`;

  return {
    frames: ordered,
    higherTimeframeBias,
    lowerTimeframeEntry,
    aligned,
    score: Math.max(0, Math.min(100, score)),
    note,
  };
}
