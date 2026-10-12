import type { Candle, TimeReport } from "./types";

interface SessionWindow {
  name: string;
  start: number;
  end: number;
}

const SESSIONS: SessionWindow[] = [
  { name: "Sydney", start: 21, end: 6 },
  { name: "Tokyo", start: 0, end: 9 },
  { name: "London", start: 7, end: 16 },
  { name: "New York", start: 12, end: 21 },
];

const KILL_ZONES: SessionWindow[] = [
  { name: "London kill zone (07:00–10:00 UTC)", start: 7, end: 10 },
  { name: "New York kill zone (12:00–15:00 UTC)", start: 12, end: 15 },
];

function within(hour: number, window: SessionWindow) {
  return window.start < window.end
    ? hour >= window.start && hour < window.end
    : hour >= window.start || hour < window.end;
}

export function analyzeTime(candles: Candle[], now = new Date()): TimeReport {
  const utcHour = now.getUTCHours();
  const active = SESSIONS.filter((session) => within(utcHour, session)).map((session) => session.name);
  const killZone = KILL_ZONES.find((zone) => within(utcHour, zone)) ?? null;

  const dayStart = Math.floor(now.getTime() / 86400000) * 1000;
  const todayCandles = candles.filter((candle) => candle.time * 1000 >= dayStart);
  let openingRange: TimeReport["openingRange"] = null;
  if (todayCandles.length > 0) {
    const first = todayCandles[0];
    const high = Math.max(...todayCandles.map((candle) => candle.high));
    const low = Math.min(...todayCandles.map((candle) => candle.low));
    const lastClose = candles.at(-1)?.close ?? first.close;
    const status: "Above" | "Below" | "Inside" = lastClose > high ? "Above" : lastClose < low ? "Below" : "Inside";
    openingRange = { high: Math.max(high, first.high), low: Math.min(low, first.low), status };
  }

  const buckets = new Map<number, number[]>();
  for (let index = 1; index < candles.length; index += 1) {
    const change = (candles[index].close - candles[index - 1].close) / candles[index - 1].close;
    const hour = new Date(candles[index].time * 1000).getUTCHours();
    const bucket = buckets.get(hour) ?? [];
    bucket.push(change);
    buckets.set(hour, bucket);
  }
  const averages = [...buckets.entries()]
    .filter(([, values]) => values.length >= 3)
    .map(([hour, values]) => ({ hour, average: values.reduce((total, value) => total + value, 0) / values.length }))
    .sort((first, second) => second.average - first.average);
  const bestHour = averages.at(0)?.hour ?? null;
  const worstHour = averages.at(-1)?.hour ?? null;

  const sessionLabel = active.length ? `${active.join(" + ")} session` : "Between major sessions (thin liquidity)";
  const note = killZone
    ? `You are inside the ${killZone.name}. These windows carry the day's sharpest moves because institutional orders cluster here — wait for the first displacement before entering.`
    : openingRange?.status === "Above"
      ? "Price is holding above today's opening range high — buyers control the range; a failed retest of the OR high is the low-risk entry."
      : openingRange?.status === "Below"
        ? "Price is under today's opening range low — sellers control the range; shorts prefer a retest of the OR low."
        : "Price is inside today's opening range. Breakouts from the range with volume are tradeable; inside the range, wait.";

  return { utcHour, session: sessionLabel, killZone: Boolean(killZone), killZoneName: killZone?.name ?? "—", openingRange, bestHour, worstHour, note };
}
