/**
 * src/lib/candleSeries.ts — the ONE candle-series policy shared by the trade
 * page (live merge + history paging) and the chart component (rendering).
 *
 * Rules enforced here:
 *  - timestamps are normalized to whole UNIX seconds,
 *  - invalid rows are dropped instead of poisoning the series,
 *  - duplicate timestamps are collapsed (last write wins),
 *  - the result is always sorted ascending, because lightweight-charts
 *    REQUIRES strictly increasing times — unsorted or duplicated data throws
 *    inside setData and silently leaves holes in the chart.
 */

/** A renderable OHLCV bar. */
export interface SeriesCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A loosely-typed bar as it arrives from an API / persisted storage. */
export interface RawCandle {
  time: unknown;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume?: unknown;
}

/**
 * Parse an ISO-8601 datetime string into epoch seconds (UTC).
 * Node's global Date.parse is unreliable on some Windows/Node builds (it
 * mishandles the "Z" designator), so we tokenize the string ourselves and
 * build the epoch from Date.UTC instead.
 */
function parseIsoDateTime(value: string): number | null {
  // YYYY-MM-DDTHH:mm(:ss)(.sss)?(Z|±HH:mm)?
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{3}))?(Z|[+-]\d{2}:\d{2})?$/i
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] ? Number(match[6]) : 0;
  const ms = match[7] ? Number(match[7]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const base = Date.UTC(year, month - 1, day, hour, minute, second, Math.trunc(ms));
  const timezone = match[8];
  if (!timezone || timezone === "Z" || timezone === "z") return base;
  // Explicit numeric offset: ±HH:mm.
  const sign = timezone[0] === "+" ? 1 : -1;
  const offsetSeconds = Number(timezone.slice(1, 3)) * 3600 + Number(timezone.slice(4, 6));
  return base - sign * offsetSeconds * 1000;
}

/**
 * Normalize a raw timestamp into a clean UNIX second value.
 * Accepts numbers (seconds or milliseconds) and strings (trimmed of any
 * whitespace, ISO dates included). Returns null for anything unusable so the
 * caller can drop the row instead of feeding the chart a broken bar.
 */
export function normalizeTimestamp(value: unknown): number | null {
  let numeric: number | null = null;
  if (typeof value === "number") {
    numeric = Number.isFinite(value) ? value : null;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      numeric = parsed;
    } else {
      const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnly) {
        const year = Number(dateOnly[1]);
        const month = Number(dateOnly[2]);
        const day = Number(dateOnly[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        numeric = Date.UTC(year, month - 1, day) / 1000;
      } else {
        numeric = parseIsoDateTime(trimmed);
      }
    }
  }
  if (numeric === null) return null;
  // Millisecond timestamps (> 1e11) are converted down to seconds.
  if (numeric > 1e11) numeric = numeric / 1000;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

/**
 * Clean an incoming candle series so the chart never renders "gaps" caused by
 * bad data:
 *  - whitespace / non-numeric timestamps are parsed and trimmed,
 *  - millisecond timestamps are converted to seconds,
 *  - invalid OHLC rows are dropped,
 *  - duplicate timestamps are collapsed (last write wins),
 *  - the series is sorted ascending.
 */
export function normalizeCandles(raw: readonly RawCandle[]): SeriesCandle[] {
  const byTime = new Map<number, SeriesCandle>();
  for (const item of raw) {
    if (!item) continue;
    const time = normalizeTimestamp(item.time);
    if (time === null) continue;
    const open = Number(item.open);
    const high = Number(item.high);
    const low = Number(item.low);
    const close = Number(item.close);
    if (![open, high, low, close].every(Number.isFinite)) continue;
    const volume = Number(item.volume);
    byTime.set(time, {
      time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * Merge two candle series into one chronologically ordered series.
 * `override` wins on identical timestamps (last write wins), so:
 *  - live polling overrides the forming bar it just refreshed,
 *  - the already-held history overrides a backfilled page that (should) not
 *    overlap it — the existing bars are never rewritten by a stale page.
 */
export function mergeCandles(
  base: readonly SeriesCandle[],
  override: readonly SeriesCandle[]
): SeriesCandle[] {
  if (override.length === 0) return [...base];
  if (base.length === 0) return [...override].sort((a, b) => a.time - b.time);
  const byTime = new Map<number, SeriesCandle>();
  for (const candle of base) byTime.set(candle.time, candle);
  for (const candle of override) byTime.set(candle.time, candle);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}