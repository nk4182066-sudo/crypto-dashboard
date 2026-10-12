import { LineStyle, type IPriceLine, type ISeriesApi } from "lightweight-charts";

/** Every horizontal level the chart can draw. */
export type SignalLineKind =
  | "support"
  | "resistance"
  | "entry"
  | "stopLoss"
  | "takeProfit"
  | "reversal";

export interface SignalLine {
  kind: SignalLineKind;
  price: number;
  /** Overrides the default label (e.g. "TP2"). */
  label?: string;
  /** Overrides the line colour. */
  color?: string;
}

interface StyleSpec {
  color: string;
  lineStyle: LineStyle;
  lineWidth: 1 | 2 | 3 | 4;
  defaultLabel: string;
}

/**
 * KuCoin-ish styling per level type: green support, red resistance, blue
 * entry, red dashed stop, green dashed targets, orange dashed reversal.
 */
const STYLES: Record<SignalLineKind, StyleSpec> = {
  support: { color: "#089981", lineStyle: LineStyle.Solid, lineWidth: 2, defaultLabel: "SUPPORT" },
  resistance: { color: "#f23645", lineStyle: LineStyle.Solid, lineWidth: 2, defaultLabel: "RESISTANCE" },
  entry: { color: "#2f81f7", lineStyle: LineStyle.Solid, lineWidth: 2, defaultLabel: "ENTRY" },
  stopLoss: { color: "#f23645", lineStyle: LineStyle.Dashed, lineWidth: 2, defaultLabel: "SL" },
  takeProfit: { color: "#089981", lineStyle: LineStyle.Dashed, lineWidth: 2, defaultLabel: "TP" },
  reversal: { color: "#f0883e", lineStyle: LineStyle.Dashed, lineWidth: 2, defaultLabel: "REVERSE" },
};

/** Take-profit targets are numbered TP1/TP2/TP3 by their own ordering. */
function resolveLabel(kind: SignalLineKind, label: string | undefined, tpOrdinal: number): string {
  if (label) return label;
  if (kind === "takeProfit") return `TP${tpOrdinal + 1}`;
  return STYLES[kind].defaultLabel;
}

/**
 * Builds the option set for one level. Split out so the same styling drives
 * both first-time creation and in-place updates.
 *
 * `tpOrdinal` counts only take-profit levels, so TP numbering stays TP1, TP2,
 * TP3 regardless of where entry/stop lines sit in the array.
 */
export function toPriceLineOptions(line: SignalLine, tpOrdinal: number) {
  const style = STYLES[line.kind];
  const color = line.color ?? style.color;
  return {
    price: line.price,
    color,
    lineWidth: style.lineWidth,
    lineStyle: style.lineStyle,
    axisLabelVisible: true,
    title: resolveLabel(line.kind, line.label, tpOrdinal),
  } as const;
}

/** A tracked line plus the identity used to match it across updates. */
export interface TrackedSignalLine {
  key: string;
  line: IPriceLine;
}

/**
 * Base identity of a level, independent of its position in the array.
 * Position is deliberately excluded: dropping TP2 would otherwise shift every
 * later index and needlessly recreate the lines that did not change.
 */
function baseKey(line: SignalLine): string {
  return `${line.kind}:${line.label ?? ""}`;
}

/**
 * Stable identity for a level. Two supports at different prices are
 * distinguished by their occurrence number, which only shifts if a
 * same-kind, same-label line before them is actually removed.
 */
function buildKeys(lines: SignalLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = baseKey(line);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return `${base}#${occurrence}`;
  });
}

/**
 * Keeps the chart's price lines in sync with `lines`.
 *
 * Lines are matched by kind/label and updated **in place** via
 * `applyOptions`, so a recalculated level slides along the axis instead of
 * flickering. Anything left over is removed, which keeps the line count
 * stable across repeated analysis updates.
 */
export function syncSignalLines(
  series: ISeriesApi<"Candlestick">,
  lines: SignalLine[],
  current: TrackedSignalLine[],
): TrackedSignalLine[] {
  // Drop invalid prices up front — a NaN level would throw inside the library.
  const valid = lines.filter(
    (line) => typeof line.price === "number" && Number.isFinite(line.price) && line.price > 0
  );

  const next: TrackedSignalLine[] = [];
  const reused = new Set<number>();
  // Keys are built from the filtered list so an invalid entry cannot shift the
  // identity of the lines after it.
  const keys = buildKeys(valid);

  valid.forEach((line, index) => {
    const key = keys[index];
    const existingIndex = current.findIndex(
      (candidate, position) => !reused.has(position) && candidate.key === key
    );
    // Only take-profit levels advance the TP counter.
    const tpOrdinal = line.kind === "takeProfit"
      ? valid.slice(0, index).filter((candidate) => candidate.kind === "takeProfit").length
      : 0;
    if (existingIndex >= 0) {
      reused.add(existingIndex);
      const existing = current[existingIndex];
      // Slide the existing line to the new price instead of recreating it, so
      // a recalculated level moves smoothly rather than popping.
      existing.line.applyOptions(toPriceLineOptions(line, tpOrdinal));
      next.push({ key, line: existing.line });
      return;
    }
    const created = series.createPriceLine(toPriceLineOptions(line, tpOrdinal));
    next.push({ key, line: created });
  });

  current.forEach((entry, position) => {
    if (!reused.has(position)) series.removePriceLine(entry.line);
  });

  return next;
}