import type { Candle, CycleReport } from "./types";

const HALVINGS = ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-19"];
const NEXT_HALVING = "2028-04-18";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Rebuilds daily closes from whatever timeframe the candles arrive on. */
function dailyCloses(candles: Candle[]): { time: number; close: number }[] {
  const grouped = new Map<number, number>();
  for (const candle of candles) {
    const day = Math.floor(candle.time / 86400) * 86400;
    grouped.set(day, candle.close);
  }
  return [...grouped.entries()].map(([time, close]) => ({ time, close })).sort((first, second) => first.time - second.time);
}

function monthlyStats(daily: { time: number; close: number }[]) {
  const buckets = new Map<number, number[]>();
  const byDay = new Map<number, number>();
  for (const point of daily) byDay.set(point.time, point.close);
  const days = [...byDay.entries()].sort((first, second) => first[0] - second[0]);
  for (let index = 1; index < days.length; index += 1) {
    const previousDay = Math.floor(days[index - 1][0] / 86400);
    const currentDay = Math.floor(days[index][0] / 86400);
    if (currentDay - previousDay > 7) continue;
    const change = (days[index][1] - days[index - 1][1]) / days[index - 1][1];
    const month = new Date(days[index][0] * 1000).getUTCMonth();
    const bucket = buckets.get(month) ?? [];
    bucket.push(change);
    buckets.set(month, bucket);
  }
  const averages = [...buckets.entries()].map(([month, values]) => ({
    month,
    average: values.reduce((total, value) => total + value, 0) / values.length,
    samples: values.length,
  })).filter((entry) => entry.samples >= 2);
  return averages;
}

function weekdayStats(daily: { time: number; close: number }[]) {
  const buckets = new Map<number, number[]>();
  for (let index = 1; index < daily.length; index += 1) {
    const change = (daily[index].close - daily[index - 1].close) / daily[index - 1].close;
    const weekday = new Date(daily[index].time * 1000).getUTCDay();
    const bucket = buckets.get(weekday) ?? [];
    bucket.push(change);
    buckets.set(weekday, bucket);
  }
  const averages = [...buckets.entries()].map(([weekday, values]) => ({
    weekday,
    average: values.reduce((total, value) => total + value, 0) / values.length,
  }));
  return averages.sort((first, second) => second.average - first.average);
}

export function analyzeCycles(candles: Candle[]): CycleReport {
  const now = Date.now();
  const lastHalving = Date.parse(`${HALVINGS.at(-1)}T00:00:00Z`);
  const nextHalving = Date.parse(`${NEXT_HALVING}T00:00:00Z`);
  const cycleLength = nextHalving - lastHalving;
  const day = Math.max(0, Math.floor((now - lastHalving) / 86400000));
  const progress = Math.min(1, (now - lastHalving) / cycleLength);
  const daysToNext = Math.max(0, Math.ceil((nextHalving - now) / 86400000));

  const fourYearPhase = progress < 0.15
    ? "Reset / accumulation after the halving"
    : progress < 0.45
      ? "Expansion — the classic post-halving bull phase"
      : progress < 0.7
        ? "Euphoria build — returns get choppier"
        : "Late cycle — historical topping zones tend to form here";

  const daily = dailyCloses(candles);
  const monthStats = monthlyStats(daily);
  const best = monthStats.length ? monthStats.reduce((top, entry) => entry.average > top.average ? entry : top) : null;
  const worst = monthStats.length ? monthStats.reduce((low, entry) => entry.average < low.average ? entry : low) : null;
  const weekdays = weekdayStats(daily);
  const currentMonth = new Date().getUTCMonth();
  const currentMonthStats = monthStats.find((entry) => entry.month === currentMonth) ?? null;

  return {
    bitcoin: {
      lastHalving: HALVINGS.at(-1)!,
      nextHalving: NEXT_HALVING,
      daysToNext,
      progress: Number(progress.toFixed(3)),
      phase: fourYearPhase,
    },
    fourYear: { day, percent: Number((progress * 100).toFixed(1)), phase: fourYearPhase },
    seasonality: {
      month: currentMonth,
      monthName: MONTH_NAMES[currentMonth],
      historicalReturn: currentMonthStats ? Number((currentMonthStats.average * 100).toFixed(2)) : null,
      bestMonth: best ? `${MONTH_NAMES[best.month]} (${best.average >= 0 ? "+" : ""}${(best.average * 100).toFixed(1)}% avg)` : "—",
      worstMonth: worst ? `${MONTH_NAMES[worst.month]} (${(worst.average * 100).toFixed(1)}% avg)` : "—",
      weekdayBias: weekdays.length
        ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdays[0].weekday]} is strongest, ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdays.at(-1)!.weekday]} weakest in the loaded data`
        : "—",
    },
    note: "Bitcoin's halving cycle and calendar seasonality are heuristics, not guarantees. They describe tendency only — always combine them with structure and risk limits.",
  };
}
