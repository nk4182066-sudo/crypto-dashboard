import type { Candle, EpochMatch, HistoricalContextReport, HistoricalEpoch, TrendBias } from "./types";

/**
 * Historical Knowledge Base — structural market context.
 *
 * These entries are published, well-documented market history: cycle dates,
 * peak-to-trough percentages and the mechanism behind each move. Nothing here
 * is a forecast. The module never claims the past repeats — it reports how
 * closely the current tape resembles a stored episode and what actually
 * followed that time, so the analysis stays evidence-based.
 *
 * Magnitudes are approximate and rounded; they describe shape and scale, not
 * exact index levels.
 */

export const historicalEpochs: HistoricalEpoch[] = [
  // ---------------- Crypto bull runs ----------------
  {
    id: "crypto-2013",
    label: "2013 Bitcoin bull run",
    market: "crypto",
    kind: "Bull run",
    start: "2013-10-30",
    peak: "2013-12-04",
    trough: "2013-01-01",
    drawdownPercent: 0,
    gainPercent: 5400,
    durationDays: 380,
    trigger: "Tiny float, first large Western adoption, and no exchange infrastructure to sell into.",
    aftermath: "A violent 80%+ collapse followed within weeks once exchanges opened and leverage arrived.",
    lesson: "Parabolic advances are never the point to add size; they are the point to plan an exit.",
  },
  {
    id: "crypto-2017",
    label: "2017 Bitcoin / altcoin mania",
    market: "crypto",
    kind: "Bull run",
    start: "2017-04-02",
    peak: "2017-12-17",
    trough: "2016-12-14",
    drawdownPercent: 0,
    gainPercent: 1700,
    durationDays: 259,
    trigger: "ICO mania plus the retail exchange wave; altcoins vastly outperformed Bitcoin.",
    aftermath: "An 84% crash over 2018 as leverage unwound and projects failed.",
    lesson: "When altcoins massively outperform Bitcoin, the cycle is usually late, not early.",
  },
  {
    id: "crypto-2021",
    label: "2021 Bitcoin bull run",
    market: "crypto",
    kind: "Bull run",
    start: "2020-11-02",
    peak: "2021-11-10",
    trough: "2020-03-13",
    drawdownPercent: 0,
    gainPercent: 690,
    durationDays: 374,
    trigger: "Post-lockdown stimulus, ETF anticipation and an over-leveraged retail cohort.",
    aftermath: "A 77% drawdown through 2022 as rates rose and leverage was purged.",
    lesson: "Realised volatility was extraordinary; surviving the move mattered more than catching it.",
  },
  // ---------------- Crypto crashes ----------------
  {
    id: "crypto-2014",
    label: "2014 Bitcoin crash",
    market: "crypto",
    kind: "Crash",
    start: "2013-12-04",
    peak: "2013-12-04",
    trough: "2015-01-14",
    drawdownPercent: 86,
    gainPercent: 0,
    durationDays: 406,
    trigger: "Mt Gox collapse, a missing Chinese exchange and the end of the first retail wave.",
    aftermath: "A multi-year bear market with repeated 50%+ drawdowns inside it.",
    lesson: "Crashes come in waves, not one clean slide — capital survives them, not predictions of them.",
  },
  {
    id: "crypto-2018",
    label: "2018 crypto crash",
    market: "crypto",
    kind: "Crash",
    start: "2018-01-06",
    peak: "2017-12-17",
    trough: "2018-12-15",
    drawdownPercent: 84,
    gainPercent: 0,
    durationDays: 343,
    trigger: "Dead-cat bounce into January, then relentless deleveraging and no new capital.",
    aftermath: "Bottoming lasted into 2019; Bitcoin eventually halved again from its 2018 low.",
    lesson: "After the first crash leg, dead-cat rallies are common — size for the possibility of a second leg.",
  },
  {
    id: "crypto-2022",
    label: "2022 crypto crash (Terra/LMtH)",
    market: "crypto",
    kind: "Crash",
    start: "2022-03-07",
    peak: "2021-11-10",
    trough: "2022-11-21",
    drawdownPercent: 77,
    gainPercent: 0,
    durationDays: 624,
    trigger: "Algorithmic stablecoin depeg, inflated leverage, then a brutal rate-hiking cycle.",
    aftermath: "Cautious grinding recovery; spot ETFs in 2024 finally brought sustained institutional flow.",
    lesson: "Structural leverage plus a macro regime shift can extend a drawdown for a year.",
  },
  // ---------------- Stocks / macro crashes ----------------
  {
    id: "stocks-2000",
    label: "2000 dot-com crash",
    market: "stocks",
    kind: "Crash",
    start: "2000-03-24",
    peak: "2000-03-24",
    trough: "2002-10-09",
    drawdownPercent: 49,
    gainPercent: 0,
    durationDays: 929,
    trigger: "Speculative valuations, overbuilt telecom capacity and the first rate hikes in five years.",
    aftermath: "A grinding multi-year bear market; leadership rotated to energy and defensives.",
    lesson: "Valuation-driven declines last years and repeatedly revisit prior lows.",
  },
  {
    id: "stocks-2008",
    label: "2008 global financial crisis",
    market: "stocks",
    kind: "Crash",
    start: "2007-10-09",
    peak: "2007-10-09",
    trough: "2009-03-09",
    drawdownPercent: 57,
    gainPercent: 0,
    durationDays: 517,
    trigger: "Subprime credit unwinding collapsing into a global funding crisis.",
    aftermath: "Policy stimulus produced a powerful V-shaped rebound, but volatility stayed elevated for years.",
    lesson: "Correlations converge to one in a systemic credit event; diversification fails when it is needed.",
  },
  {
    id: "stocks-2020",
    label: "2020 COVID crash",
    market: "stocks",
    kind: "Crash",
    start: "2020-02-19",
    peak: "2020-02-19",
    trough: "2020-03-23",
    drawdownPercent: 34,
    gainPercent: 0,
    durationDays: 33,
    trigger: "Pandemic shutdowns producing an unprecedented economic stop.",
    aftermath: "Massive fiscal and monetary support drove the fastest snapback in market history.",
    lesson: "The speed of the recovery depends on the policy response, not on the chart.",
  },
  {
    id: "macro-2022",
    label: "2022 inflation-led bear market",
    market: "stocks",
    kind: "Macro",
    start: "2022-01-03",
    peak: "2021-11-19",
    trough: "2022-10-12",
    drawdownPercent: 25,
    gainPercent: 0,
    durationDays: 283,
    trigger: "Decades-high inflation forcing aggressive central-bank tightening across developed markets.",
    aftermath: "Bond and equity sells happened together — the classic diversification break of a stagflation scare.",
    lesson: "Rapid rate repricing hurts bonds and equities at once; watch inflation, not just growth.",
  },
  {
    id: "forex-2015",
    label: "2015 Swiss franc / EUR collapse",
    market: "forex",
    kind: "Crash",
    start: "2015-01-11",
    peak: "2015-01-11",
    trough: "2015-01-16",
    drawdownPercent: 30,
    gainPercent: 0,
    durationDays: 5,
    trigger: "The SNB abandoning its currency floor of 1.20 without warning.",
    aftermath: "Broker collapses and an extreme volatility spike; major pairs still gapped for months.",
    lesson: "Central banks can move policy instantly and without notice; overnight gaps are a real risk.",
  },
  {
    id: "forex-2008",
    label: "2008 forex de-leveraging",
    market: "forex",
    kind: "Macro",
    start: "2008-07-01",
    peak: "2008-07-01",
    trough: "2008-12-31",
    drawdownPercent: 15,
    gainPercent: 0,
    durationDays: 183,
    trigger: "Funding stress and margin calls forcing liquidation of leveraged carry positions.",
    aftermath: "Carry trades unwound violently, then rebuilt and drove extended recovery rallies.",
    lesson: "When funding tightens, high-yielding pairs liquidate first — the opposite of normal behaviour.",
  },
  {
    id: "stocks-1990-rate-shock",
    label: "1990 rate-driven equity crash",
    market: "stocks",
    kind: "Macro",
    start: "1990-07-16",
    peak: "1987-10-19",
    trough: "1990-10-11",
    drawdownPercent: 20,
    gainPercent: 0,
    durationDays: 87,
    trigger: "Recession, an oil shock and aggressive rate tightening in the aftermath of 1987.",
    aftermath: "A slow grind lower for three months, then a recovery that lasted nearly a decade.",
    lesson: "Rate-driven bear markets grind rather than crash; position sizing matters more than timing.",
  },
];

/** Epochs relevant to a given asset class. */
export function epochsFor(assetClass: string): HistoricalEpoch[] {
  const key = assetClass.toLowerCase();
  const filtered = historicalEpochs.filter((epoch) => epoch.market === key);
  return filtered.length > 0 ? filtered : historicalEpochs;
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

/** Live market measurements used to compare against the stored epochs. */
export interface LiveMetrics {
  drawdownPercent: number;
  gainPercent: number;
  /** Position of price inside the loaded range, 0-100. */
  rangePosition: number;
  bias: TrendBias;
  /** Annualized realized volatility in percent. */
  realizedPercent: number;
}

/** Derives live drawdown, gain and range position from the loaded candles. */
export function measureLiveMarket(candles: Candle[], bias: TrendBias, realizedPercent = 0): LiveMetrics {
  if (candles.length === 0) {
    return { drawdownPercent: 0, gainPercent: 0, rangePosition: 50, bias, realizedPercent };
  }
  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  const current = candles.at(-1)!.close;
  const drawdownPercent = high > 0 ? Math.max(0, ((high - current) / high) * 100) : 0;
  const gainPercent = low > 0 ? Math.max(0, ((current - low) / low) * 100) : 0;
  const rangePosition = high > low ? clamp(((current - low) / (high - low)) * 100, 0, 100) : 50;
  return { drawdownPercent, gainPercent, rangePosition, bias, realizedPercent };
}

/** Compares one magnitude pair and returns how close they are, 0-100. */
function magnitudeScore(actual: number, reference: number): number {
  if (reference <= 0) return 0;
  return Math.round(clamp(100 - (Math.abs(actual - reference) / reference) * 100, 0, 100));
}

/**
 * Scores how closely the live tape resembles one epoch.
 *
 * Magnitude carries the most weight because a crash's defining feature is its
 * depth; range position and directional bias confirm the market is actually
 * in that phase rather than merely far from its high.
 */
function scoreEpoch(epoch: HistoricalEpoch, live: LiveMetrics): EpochMatch {
  const shared: string[] = [];
  const differing: string[] = [];

  const magnitude = epoch.kind === "Crash"
    ? magnitudeScore(live.drawdownPercent, epoch.drawdownPercent)
    : magnitudeScore(Math.max(live.gainPercent, live.drawdownPercent), epoch.gainPercent);

  const positionScore = clamp(100 - Math.abs(live.rangePosition - (epoch.kind === "Crash" ? 25 : 85)) * 2, 0, 100);
  const biasScore = epoch.kind === "Crash"
    ? live.bias === "Bearish" ? 100 : live.bias === "Sideways" ? 55 : 15
    : live.bias === "Bullish" ? 100 : live.bias === "Sideways" ? 55 : 15;

  const similarity = Math.round(magnitude * 0.5 + positionScore * 0.3 + biasScore * 0.2);

  if (magnitude >= 60) shared.push(`Scale is comparable: live drawdown ${live.drawdownPercent.toFixed(0)}% against ${epoch.drawdownPercent}% in ${epoch.label}.`);
  else differing.push(`Scale differs: live drawdown ${live.drawdownPercent.toFixed(0)}% against ${epoch.drawdownPercent}% in ${epoch.label}.`);

  if (biasScore >= 70) shared.push(`Direction matches: the tape is ${live.bias.toLowerCase()} as it was then.`);
  else differing.push(`Direction differs: this ran ${epoch.kind.toLowerCase()} while the tape is ${live.bias.toLowerCase()}.`);

  if (positionScore >= 60) shared.push("Price sits in a comparable position inside its recent range.");
  else differing.push("Price is at a different point in its range than the comparable window.");

  const verdict = similarity >= 75
    ? `Close structural match — ${epoch.label} is a reasonable reference frame.`
    : similarity >= 50
      ? `Partial resemblance to ${epoch.label}; useful as context, not as a template.`
      : `Weak resemblance to ${epoch.label}.`;

  return { epoch, similarity, shared, differing, note: `${verdict} ${epoch.lesson}` };
}

/**
 * Where the live price sits inside its own cycle.
 *
 * Computed from distance below the loaded-period high plus the position within
 * the range, so it stays honest about only the supplied candles being used.
 */
function cyclePosition(candles: Candle[], drawdownPercent: number): { position: number; label: string } {
  if (candles.length === 0) return { position: 50, label: "Indeterminate" };
  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  const current = candles.at(-1)!.close;
  const normalized = high > low ? clamp(((current - low) / (high - low)) * 100, 0, 100) : 50;

  if (drawdownPercent >= 60) return { position: normalized, label: "Deep bear phase" };
  if (drawdownPercent >= 35) return { position: normalized, label: "Major bear phase" };
  if (drawdownPercent >= 18) return { position: normalized, label: "Correction / bear phase" };
  if (normalized >= 85) return { position: normalized, label: "Late-stage expansion" };
  if (normalized >= 60) return { position: normalized, label: "Mid-cycle expansion" };
  return { position: normalized, label: "Early accumulation" };
}

/**
 * Part 3 — builds the historical context report for an asset.
 *
 * Returns the relevant epochs, ranks the closest structural matches and states
 * what actually followed each time. It reports similarity rather than
 * prediction: a close match raises context, it must never raise confidence.
 */
export function analyzeHistoricalContext(
  candles: Candle[],
  assetClass: string,
  bias: TrendBias,
  realizedPercent = 0,
): HistoricalContextReport {
  const epochs = epochsFor(assetClass);
  const live = measureLiveMarket(candles, bias, realizedPercent);
  const matches = epochs
    .map((epoch) => scoreEpoch(epoch, live))
    .sort((first, second) => second.similarity - first.similarity)
    .slice(0, 3);

  const cycle = cyclePosition(candles, live.drawdownPercent);
  const top = matches.at(0);
  const detected = (top?.similarity ?? 0) >= 70;

  const lessons = matches
    .filter((match) => match.similarity >= 50)
    .map((match) => `${match.epoch.label}: ${match.epoch.aftermath}`);

  return {
    assetClass,
    epochs,
    matches,
    cyclePosition: Number(cycle.position.toFixed(1)),
    cycleLabel: cycle.label,
    repetition: {
      detected,
      similarity: top?.similarity ?? 0,
      summary: detected
        ? `The current tape closely resembles ${top!.epoch.label} (${top!.similarity}% structural similarity). ${top!.epoch.aftermath}`
        : top
          ? `No strong structural match to a stored episode. The closest is ${top.epoch.label} at ${top.similarity}% similarity — a coincidence, not a signal.`
          : "No comparable historical episodes are stored for this asset class.",
    },
    lessons: lessons.length > 0 ? lessons : ["No stored episode is close enough in shape to draw a lesson from."],
    note: "These episodes are published market history used as context, not as prediction. Similar past structure does not imply the same outcome — sizing and risk limits decide the result regardless of which year we are in.",
  };
}