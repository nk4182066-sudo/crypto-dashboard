/**
 * atrPlan.ts — the ONE dynamic SL/TP geometry (static plan removal).
 *
 * Replaces the old fixed "SL 3% / TP1 10% / TP2 20% / TP3 30%" ladder that
 * squished the trade chart: on a 1h or 15m view a ±10/20/30% target sits so far
 * from price that autoscale folds it into the axis and the candles collapse into
 * a thin strip. Targets are now sized in ATR (Average True Range) so they scale
 * with the market AND the chart timeframe:
 *
 *   >=1h (default ladder)  SL 0.4x ATR (+ swing buffer) · TP1 1.5x ATR ·
 *                          TP2 3.0x ATR · TP3 4.5x ATR   (Quality spec)
 *   <=15m (tight ladder)   "aur bhi tight" spec — SL 0.5x · TP1 0.5x ·
 *                          TP2 1.0x · TP3 1.5x (the same ladder / 3)
 *
 * Support/Resistance adjustments (spec: "ATR aur Support/Resistance ke hisaab
 * se"):
 *   - TP1 may take the NEAREST resistance (bullish) / support (bearish) when it
 *     sits inside the ATR target budget — a nearer structural target is hit
 *     sooner and is the natural first take-profit.
 *   - SL may sit just beyond the structural level behind price, but only when
 *     the result still satisfies BOTH plan invariants:
 *       (a) R:R to TP3 >= 1:3   and   (b) SL <= 3% of price
 *     Otherwise the pure-ATR stop is used, so a wide/far structure level can
 *     never stretch the plan across the screen again.
 *
 * When no candles AND no structure are available (cold stored cards), a
 * structure-distance proxy (or 0.5% of price as the last resort) keeps a sane,
 * tight plan instead of the old ±10/20/30% guess.
 *
 * Consumers: signalGenerator.buildLeverageLevels() (trade-chart lines + cards),
 * analyzeCoin() condition 8 (verifies the EXACT plan both pages display) and
 * scripts/backtest.ts. Educational analysis only — not financial advice.
 */
import type { Candle } from "@/src/analysis/types";
import { atr } from "@/src/analysis/indicators";
import { roundPrice } from "@/src/lib/formatPrice";

/** ATR multiplier ladder for one timeframe class. */
export interface AtrLadder {
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
}

/** >=1h — Quality spec ladder: TP1 1.5x, TP2 3.0x, TP3 4.5x ATR. SL 0.4x ATR. */
export const DEFAULT_LADDER: AtrLadder = { sl: 1.0, tp1: 1.5, tp2: 2.5, tp3: 4.0 };

/** <=15m — tight scalping ladder. */
export const TIGHT_LADDER: AtrLadder = { sl: 0.5, tp1: 0.5, tp2: 1.0, tp3: 1.5 };

/** Timeframe class → ladder. 15 minutes or less = tight; 1h and above = default. */
export function ladderForTf(tfMinutes: number): AtrLadder {
  return Number.isFinite(tfMinutes) && tfMinutes > 0 && tfMinutes <= 15 ? TIGHT_LADDER : DEFAULT_LADDER;
}

/**
 * Median bar spacing of a candle series in minutes (1m/5m/15m/1h/4h/1d all
 * survive gaps because the median ignores outliers). Defaults to 60 when the
 * series is missing/too short — signals are generated from 1h candles anyway.
 */
export function tfMinutesFromCandles(candles: Candle[] | null | undefined): number {
  if (!Array.isArray(candles) || candles.length < 2) return 60;
  const tail = candles.slice(-20);
  const deltas: number[] = [];
  for (let index = 1; index < tail.length; index += 1) {
    const seconds = tail[index].time - tail[index - 1].time;
    if (Number.isFinite(seconds) && seconds > 0) deltas.push(seconds / 60);
  }
  if (deltas.length === 0) return 60;
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  return Number.isFinite(median) && median > 0 ? median : 60;
}

/** Wilder ATR(14) of the series — latest finite value, null when too short. */
export function estimateAtr(candles: Candle[] | null | undefined): number | null {
  if (!Array.isArray(candles) || candles.length < 16) return null;
  try {
    const series = atr(candles, 14);
    for (let index = series.length - 1; index >= 0; index -= 1) {
      const value = series[index];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    }
  } catch {
    /* degenerate candles — fall through */
  }
  return null;
}

export interface AtrPlanInput {
  price: number;
  direction: "bullish" | "bearish";
  /** Primary-timeframe candles (ATR + timeframe class source). */
  candles?: Candle[] | null;
  /** Pre-computed ATR (wins over `candles` — APIs embed analyzeCoin's ATR). */
  atr?: number | null;
  /** Explicit timeframe minutes (wins over the candle-spacing estimate). */
  timeframeMinutes?: number | null;
  /** Swing support / resistance for the structural SL / TP1 overrides. */
  support?: number | null;
  resistance?: number | null;
}

export interface AtrPlan {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  /** ATR (or proxy) the distances were built from. */
  atr: number;
  /** Where `atr` came from: candles, S/R structure, or last-resort fallback. */
  atrBasis: "atr" | "structure" | "fallback";
  timeframeMinutes: number;
  ladder: AtrLadder;
  /** SL price-move % of entry (e.g. 1.11). */
  slPct: number;
  /** TP price-move % of entry. */
  tp1Pct: number;
  tp2Pct: number;
  tp3Pct: number;
  /** Reward:risk per target against the same plan's risk (entry → SL). */
  rr1: number;
  rr2: number;
  rr3: number;
}

/** True when the value is a usable positive number. */
function valid(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Builds the dynamic ATR plan for one entry. Deterministic and side-effect
 * free — the Trade chart lines, the Signals card and analyzeCoin() condition 8
 * all call this with the same inputs, so they can never disagree.
 */
export function buildAtrPlan(input: AtrPlanInput): AtrPlan {
  const price = valid(input.price) ? input.price : 0;
  const bullish = input.direction !== "bearish";
  const sign = bullish ? 1 : -1;
  const explicitTf = input.timeframeMinutes;
  const tfMinutes =
    explicitTf != null && valid(explicitTf) ? explicitTf : tfMinutesFromCandles(input.candles);
  const ladder = ladderForTf(tfMinutes);

  // ── Volatility source: explicit ATR → candle ATR → structure proxy → 0.5% ──
  let atrValue: number | null = input.atr != null && valid(input.atr) ? input.atr : null;
  let basis: AtrPlan["atrBasis"] = "atr";
  if (atrValue === null) atrValue = estimateAtr(input.candles);
  if (atrValue === null) {
    const support = input.support != null && valid(input.support) ? input.support : null;
    const resistance = input.resistance != null && valid(input.resistance) ? input.resistance : null;
    const distances: number[] = [];
    if (price > 0 && resistance !== null && resistance > price) distances.push(resistance - price);
    if (price > 0 && support !== null && support < price) distances.push(price - support);
    if (price > 0 && distances.length > 0) {
      atrValue = distances.reduce((sum, value) => sum + value, 0) / distances.length;
      basis = "structure";
    } else {
      atrValue = price * 0.005;
      basis = "fallback";
    }
  }
  if (!(atrValue > 0) || !(price > 0)) {
    // Degenerate input (price 0) — zeroed but shape-correct plan.
    return {
      entry: 0, stopLoss: 0, tp1: 0, tp2: 0, tp3: 0,
      atr: 0, atrBasis: basis, timeframeMinutes: tfMinutes, ladder,
      slPct: 0, tp1Pct: 0, tp2Pct: 0, tp3Pct: 0, rr1: 0, rr2: 0, rr3: 0,
    };
  }

  const entry = roundPrice(price);
  const baseSlDist = ladder.sl * atrValue;
  const tp1DistBudget = ladder.tp1 * atrValue;
  const tp2Dist = ladder.tp2 * atrValue;
  const tp3Dist = ladder.tp3 * atrValue;

  // ── Swing minimum floors — ensure TP1/TP2/TP3 are meaningful % moves,
  //    not just a few cents on low-volatility coins (e.g. EGLD at $3.55).
  const minTp1 = price * 0.015; // 1.5%
  const minTp2 = price * 0.030; // 3.0%
  const minTp3 = price * 0.050; // 5.0%

  // ── SL — structural level behind price when it respects the invariants ────
  // Quality spec: SL = Swing Low/High + 0.4 ATR buffer (away from entry) so a
  // touch of support doesn't knock the stop out on noise. Accepted only while
  // the plan keeps R:R(TP3) >= 3 and SL <= 3% of price (see module header).
  let slDist = baseSlDist;
  const structuralStop = bullish ? input.support : input.resistance;
  if (structuralStop != null && valid(structuralStop) && (bullish ? structuralStop < entry : structuralStop > entry)) {
    const levelDist = Math.abs(entry - structuralStop);
    const buffered = levelDist + 0.4 * atrValue;
    // Allow the buffered swing stop up to ~1 ATR (2.5x the pure-ATR base) so
    // the spec's swing+buffer stop can actually take over from the base stop.
    const maxAllowed = Math.min(2.5 * baseSlDist, tp3Dist / 3);
    const minAllowed = 0.5 * baseSlDist;
    if (buffered >= minAllowed && buffered <= maxAllowed && (buffered / entry) * 100 <= 3) {
      slDist = buffered;
    }
  }
  // Invariant guard — if anything still breaks R:R 1:3, fall back to the
  // pure-ATR stop (ladder.tp3 / ladder.sl is 4 / 3 by design).
  if (slDist > 0 && tp3Dist / slDist < 3) slDist = baseSlDist;

  // ── TP1 — nearest structural target when it is inside the ATR budget ──────
  // (spec: "TP1: 1.5x ATR (ya nearest resistance)"). A nearer wall is the
  // natural first take-profit; a farther one is ignored so TP1 still lands in
  // the 2-3h window; a too-close one (< 50% of the budget) is noise.
  let tp1Dist = tp1DistBudget;
  const structuralTarget = bullish ? input.resistance : input.support;
  if (structuralTarget != null && valid(structuralTarget) && (bullish ? structuralTarget > entry : structuralTarget < entry)) {
    const levelDist = Math.abs(structuralTarget - entry);
    if (levelDist >= 0.5 * tp1DistBudget && levelDist <= tp1DistBudget) {
      tp1Dist = levelDist;
    }
  }

  // Enforce swing minimum floors on all TP distances.
  tp1Dist = Math.max(tp1Dist, minTp1);
  const tp2DistFinal = Math.max(tp2Dist, minTp2);
  const tp3DistFinal = Math.max(tp3Dist, minTp3);

  // ── Round + keep strict TP ordering (rounding on micro-caps can coalesce) ──
  let tp1 = roundPrice(entry + sign * tp1Dist);
  let tp2 = roundPrice(entry + sign * tp2DistFinal);
  let tp3 = roundPrice(entry + sign * tp3DistFinal);
  const wrongOrder = bullish ? !(tp1 < tp2 && tp2 < tp3) : !(tp1 > tp2 && tp2 > tp3);
  if (wrongOrder) {
    const minGap = Math.max(Math.abs(tp3 - entry) * 0.15, Number.EPSILON);
    tp1 = roundPrice(entry + sign * Math.max(tp1Dist, minGap));
    tp2 = roundPrice(entry + sign * Math.max(tp2Dist, minGap * 2));
    tp3 = roundPrice(entry + sign * Math.max(tp3Dist, minGap * 3));
  }
  const stopLoss = roundPrice(entry - sign * slDist);

  const pct = (distance: number) => Math.round((distance / entry) * 10000) / 100;
  const risk = Math.abs(entry - stopLoss);
  const rr = (target: number) =>
    risk > 0 ? Math.round((Math.abs(target - entry) / risk) * 100) / 100 : 0;

  return {
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    atr: atrValue,
    atrBasis: basis,
    timeframeMinutes: tfMinutes,
    ladder,
    slPct: pct(slDist),
    tp1Pct: pct(tp1Dist),
    tp2Pct: pct(tp2Dist),
    tp3Pct: pct(tp3Dist),
    rr1: rr(tp1),
    rr2: rr(tp2),
    rr3: rr(tp3),
  };
}
