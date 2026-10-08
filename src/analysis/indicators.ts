import type { Candle, IchimokuReport, IndicatorReport, PivotReport, SeriesPoint, TrendBias } from "./types";

export function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = Array(values.length).fill(null);
  if (period <= 0) return result;
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) result[index] = sum / period;
  }
  return result;
}

export function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return result;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
  result[period - 1] = current;
  for (let index = period; index < values.length; index += 1) {
    current = (values[index] - current) * multiplier + current;
    result[index] = current;
  }
  return result;
}

export function wilderSmoothing(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = Array(values.length).fill(null);
  if (values.length < period) return result;
  let current = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
  result[period - 1] = current;
  for (let index = period; index < values.length; index += 1) {
    current = (current * (period - 1) + values[index]) / period;
    result[index] = current;
  }
  return result;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length <= period) return result;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    gains.push(Math.max(0, change));
    losses.push(Math.max(0, -change));
  }
  const avgGain = wilderSmoothing(gains, period);
  const avgLoss = wilderSmoothing(losses, period);
  for (let index = 0; index < avgGain.length; index += 1) {
    const gain = avgGain[index];
    const loss = avgLoss[index];
    if (gain === null || loss === null) continue;
    result[index + 1] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return result;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const line: (number | null)[] = closes.map((_, index) =>
    fastEma[index] !== null && slowEma[index] !== null ? fastEma[index]! - slowEma[index]! : null);
  const compact = line.flatMap((value) => (value === null ? [] : [value]));
  const signalCompact = ema(compact, signalPeriod);
  const signal: (number | null)[] = Array(closes.length).fill(null);
  let cursor = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === null) continue;
    signal[index] = signalCompact[cursor] ?? null;
    cursor += 1;
  }
  const latestIndex = line.reduce<number>((last, value, index) => (value === null ? last : index), -1);
  if (latestIndex < 0) return null;
  const lineValue = line[latestIndex]!;
  const signalValue = signal[latestIndex];
  if (signalValue === null) return { line: lineValue, signal: 0, histogram: lineValue };
  return { line: lineValue, signal: signalValue, histogram: lineValue - signalValue };
}

export function trueRange(candles: Candle[]): number[] {
  return candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  });
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  return wilderSmoothing(trueRange(candles), period);
}

export function stochasticRsi(candles: Candle[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
  const rsiSeries = rsi(candles.map((candle) => candle.close), rsiPeriod);
  const rawStoch: (number | null)[] = rsiSeries.map((value, index) => {
    if (value === null) return null;
    const window = rsiSeries.slice(Math.max(0, index - stochPeriod + 1), index + 1).filter((item): item is number => item !== null);
    if (window.length < stochPeriod) return null;
    const lowest = Math.min(...window);
    const highest = Math.max(...window);
    if (highest === lowest) return 50;
    return ((value - lowest) / (highest - lowest)) * 100;
  });
  const compact = rawStoch.flatMap((value) => (value === null ? [] : [value]));
  const kCompact = sma(compact, kSmooth);
  const dCompact = sma(kCompact.map((value) => value ?? 0), dSmooth);
  const k = kCompact.at(-1) ?? null;
  const d = dCompact.at(-1) ?? null;
  if (k === null || d === null) return null;
  return { k, d };
}

export function adx(candles: Candle[], period = 14) {
  if (candles.length < period * 2) return null;
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const ranges = trueRange(candles);
  for (let index = 1; index < candles.length; index += 1) {
    const upMove = candles[index].high - candles[index - 1].high;
    const downMove = candles[index - 1].low - candles[index].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const smoothPlus = wilderSmoothing(plusDM, period);
  const smoothMinus = wilderSmoothing(minusDM, period);
  const smoothRange = wilderSmoothing(ranges.slice(1), period);
  const dx: number[] = [];
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  for (let index = 0; index < smoothRange.length; index += 1) {
    const range = smoothRange[index];
    const plus = smoothPlus[index];
    const minus = smoothMinus[index];
    if (range === null || plus === null || minus === null || range === 0) continue;
    const pdi = (plus / range) * 100;
    const mdi = (minus / range) * 100;
    plusDI.push(pdi);
    minusDI.push(mdi);
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }
  const adxCompact = wilderSmoothing(dx, period);
  const last = adxCompact.at(-1);
  if (last === null || last === undefined) return null;
  return { adx: last, plusDI: plusDI.at(-1) ?? 0, minusDI: minusDI.at(-1) ?? 0 };
}

export function obvSeries(candles: Candle[]): number[] {
  let running = 0;
  return candles.map((candle, index) => {
    if (index === 0) return running;
    const previousClose = candles[index - 1].close;
    if (candle.close > previousClose) running += candle.volume;
    else if (candle.close < previousClose) running -= candle.volume;
    return running;
  });
}

export function cmf(candles: Candle[], period = 20): number | null {
  if (candles.length < period) return null;
  const window = candles.slice(-period);
  let moneyFlowVolume = 0;
  let volumeSum = 0;
  for (const candle of window) {
    const range = candle.high - candle.low;
    const multiplier = range === 0 ? 0 : ((candle.close - candle.low) - (candle.high - candle.close)) / range;
    moneyFlowVolume += multiplier * candle.volume;
    volumeSum += candle.volume;
  }
  return volumeSum === 0 ? null : moneyFlowVolume / volumeSum;
}

export function bollinger(closes: number[], period = 20, multiplier = 2) {
  const middleSeries = sma(closes, period);
  const middle = middleSeries.at(-1);
  if (middle === null || middle === undefined) return null;
  const window = closes.slice(-period);
  const deviation = Math.sqrt(window.reduce((total, value) => total + (value - middle) ** 2, 0) / window.length);
  const upper = middle + multiplier * deviation;
  const lower = middle - multiplier * deviation;
  return { upper, middle, lower, widthPercent: middle === 0 ? 0 : ((upper - lower) / middle) * 100 };
}

export function ichimoku(candles: Candle[]): IchimokuReport | null {
  const highLowMid = (period: number, offset = 0): number | null => {
    const end = candles.length - offset;
    const start = end - period;
    if (end < 1 || start < 0) return null;
    const window = candles.slice(start, end);
    return (Math.max(...window.map((item) => item.high)) + Math.min(...window.map((item) => item.low))) / 2;
  };
  const tenkan = highLowMid(9);
  const kijun = highLowMid(26);
  if (tenkan === null || kijun === null) return null;
  const senkouBRaw = highLowMid(52);
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = senkouBRaw;
  const chikou = candles.at(-26)?.close ?? null;
  const price = candles.at(-1)!.close;
  const upper = senkouB === null ? senkouA : Math.max(senkouA, senkouB);
  const lower = senkouB === null ? senkouA : Math.min(senkouA, senkouB);
  const cloudBias: TrendBias = price > upper ? "Bullish" : price < lower ? "Bearish" : "Sideways";
  return { tenkan, kijun, senkouA, senkouB, chikou, cloudBias };
}

export function pivotPoints(candles: Candle[], method: "classic" | "fibonacci" = "classic"): PivotReport | null {
  const bar = candles.at(-2) ?? candles.at(-1);
  if (!bar) return null;
  const { high, low, close } = bar;
  const range = high - low;
  const pivot = (high + low + close) / 3;
  if (method === "fibonacci") {
    return {
      method,
      pivot,
      r1: pivot + range * 0.382,
      r2: pivot + range * 0.618,
      r3: pivot + range * 1.0,
      s1: pivot - range * 0.382,
      s2: pivot - range * 0.618,
      s3: pivot - range * 1.0,
    };
  }
  return {
    method,
    pivot,
    r1: 2 * pivot - low,
    r2: pivot + range,
    r3: high + 2 * (pivot - low),
    s1: 2 * pivot - high,
    s2: pivot - range,
    s3: low - 2 * (high - pivot),
  };
}

export function supertrend(candles: Candle[], period = 10, multiplier = 3) {
  if (candles.length < period + 1) return null;
  const atrSeries = atr(candles, period);
  let finalUpper = 0;
  let finalLower = 0;
  let direction: "up" | "down" = "up";
  for (let index = 1; index < candles.length; index += 1) {
    const atrValue = atrSeries[index];
    if (atrValue === null) continue;
    const mid = (candles[index].high + candles[index].low) / 2;
    const upperBand = mid + multiplier * atrValue;
    const lowerBand = mid - multiplier * atrValue;
    const previousClose = candles[index - 1].close;
    finalUpper = upperBand < finalUpper || previousClose > finalUpper ? upperBand : finalUpper;
    finalLower = lowerBand > finalLower || previousClose < finalLower ? lowerBand : finalLower;
    if (finalUpper === 0 && finalLower === 0) {
      finalUpper = upperBand;
      finalLower = lowerBand;
    }
    direction = candles[index].close > finalUpper ? "up" : candles[index].close < finalLower ? "down" : direction;
  }
  const value = direction === "up" ? finalLower : finalUpper;
  return { value, direction };
}

export function parabolicSar(candles: Candle[], step = 0.02, max = 0.2) {
  if (candles.length < 3) return null;
  let bullish = candles[1].close >= candles[0].close;
  let sar = bullish ? candles[0].low : candles[0].high;
  let extreme = bullish ? candles[0].high : candles[0].low;
  let acceleration = step;
  for (let index = 1; index < candles.length; index += 1) {
    sar += acceleration * (extreme - sar);
    if (bullish) {
      if (candles[index].low < sar) {
        bullish = false;
        sar = extreme;
        extreme = candles[index].low;
        acceleration = step;
      } else if (candles[index].high > extreme) {
        extreme = candles[index].high;
        acceleration = Math.min(max, acceleration + step);
      }
    } else if (candles[index].high > sar) {
      bullish = true;
      sar = extreme;
      extreme = candles[index].high;
      acceleration = step;
    } else if (candles[index].low < extreme) {
      extreme = candles[index].low;
      acceleration = Math.min(max, acceleration + step);
    }
  }
  return { value: sar, direction: bullish ? ("up" as const) : ("down" as const) };
}

export function buildIndicatorReport(candles: Candle[]): IndicatorReport {
  const closes = candles.map((candle) => candle.close);
  const atrSeries = atr(candles, 14);
  const atr14 = atrSeries.at(-1) ?? null;
  const price = closes.at(-1) ?? 0;
  const obv = obvSeries(candles);
  const obvSma = sma(obv, 20);
  const obvLast = obv.at(-1) ?? null;
  const obvAvg = obvSma.at(-1) ?? null;
  const obvTrend: TrendBias = obvLast === null || obvAvg === null ? "Sideways" : obvLast > obvAvg ? "Bullish" : obvLast < obvAvg ? "Bearish" : "Sideways";
  const adxValue = adx(candles, 14);
  const srsi = stochasticRsi(candles);
  const ichi = ichimoku(candles);
  const st = supertrend(candles);
  const psar = parabolicSar(candles);
  const pivots = pivotPoints(candles, "classic");
  const bb = bollinger(closes, 20, 2);

  return {
    rsi14: rsi(closes, 14).at(-1) ?? null,
    macd: macd(closes),
    stochasticRsi: srsi,
    atr14,
    atrPercent: atr14 !== null && price > 0 ? (atr14 / price) * 100 : null,
    adx: adxValue,
    obv: obvLast,
    obvTrend,
    cmf: cmf(candles),
    ichimoku: ichi,
    supertrend: st,
    parabolicSar: psar,
    pivotPoints: pivots,
    bollinger: bb,
    movingAverages: {
      sma20: sma(closes, 20).at(-1) ?? null,
      sma50: sma(closes, 50).at(-1) ?? null,
      sma200: sma(closes, 200).at(-1) ?? null,
      ema21: ema(closes, 21).at(-1) ?? null,
    },
  };
}

export function toSeries(values: (number | null)[], candles: Candle[]): SeriesPoint[] {
  return values.flatMap((value, index) => (value === null ? [] : [{ time: candles[index].time, value }]));
}
