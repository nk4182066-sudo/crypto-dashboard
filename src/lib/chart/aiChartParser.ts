import type { SignalLine } from "./levelLines";
import type { ChartShape } from "./patternDetector";

/** Candle envelope used to sanity-check AI prices against real market data. */
export interface PriceRange {
  min: number;
  max: number;
}

export interface ParsedAiChart {
  lines: SignalLine[];
  shapes: ChartShape[];
  trend: "Bullish" | "Bearish" | "Sideways" | null;
  verdict: "Take Entry" | "Wait" | "Do Not Enter" | null;
  /** Pattern names the AI reported, for the legend. */
  patternNames: string[];
  summary: string;
  /**
   * Levels the AI produced but that were rejected because they fell outside
   * the real candle range. Surfaced rather than silently dropped so the UI can
   * tell the user why a level is missing.
   */
  rejected: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts a number, or a numeric string such as "$86,204.50". */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function withinRange(price: number | null, range?: PriceRange): price is number {
  if (price === null || price <= 0) return false;
  if (!range) return true;
  // Allow a modest overshoot so a legitimate level just outside the visible
  // candle range is kept, while still catching hallucinated prices.
  const span = range.max - range.min || 1;
  const slack = span * 0.25;
  return price >= range.min - slack && price <= range.max + slack;
}

/**
 * Pulls a JSON object out of a model response. Groq and Gemini both tend to
 * wrap JSON in prose or ```json fences even when told to reply with JSON only.
 */
export function extractJson(raw: unknown): Record<string, unknown> | null {
  if (isRecord(raw)) return raw;
  if (typeof raw !== "string") return null;

  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text].filter((value): value is string => typeof value === "string");

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isRecord(parsed)) return parsed;
    } catch {
      // Fall through and try a brace-balanced slice.
    }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
        if (isRecord(parsed)) return parsed;
      } catch {
        // Give up on this candidate.
      }
    }
  }
  return null;
}

/** Builds a Phase 4 channel shape from an AI-reported pair of boundaries. */
function channelShape(
  name: string,
  upper: { time: number; price: number },
  lower: { time: number; price: number },
  span: { from: number; to: number }
): ChartShape {
  return {
    id: `ai-channel:${span.from}:${span.to}`,
    kind: "ascendingTriangle",
    label: name,
    direction: "neutral",
    color: "#f0b90b",
    confidence: 60,
    note: "Channel projected by the assistant from the reported boundary prices.",
    fills: [[upper, lower]],
    lines: [
      { id: "ai-upper", label: "Channel top", color: "#f0b90b", style: "dashed", points: [upper, { time: span.to, price: upper.price }] },
      { id: "ai-lower", label: "Channel base", color: "#ff7eb6", style: "dashed", points: [lower, { time: span.to, price: lower.price }] },
    ],
    span,
  };
}

/**
 * Converts an AI analysis payload into the Phase 2 level lines and Phase 4
 * geometry the chart understands.
 *
 * Every price is validated against the real candle range before use — an
 * assistant that invents a level should not be able to draw it.
 */
export function parseAiChartAnalysis(
  raw: unknown,
  options: { range?: PriceRange; from?: number; to?: number } = {}
): ParsedAiChart {
  const root = extractJson(raw);
  const lines: SignalLine[] = [];
  const shapes: ChartShape[] = [];
  const rejected: string[] = [];

  if (!root) {
    return { lines, shapes, trend: null, verdict: null, patternNames: [], summary: "", rejected: [] };
  }

  const range = options.range;
  const to = options.to ?? options.from ?? 0;

  const push = (kind: SignalLine["kind"], value: unknown, label?: string) => {
    const price = toNumber(value);
    if (price === null) return;
    if (!withinRange(price, range)) {
      rejected.push(`${label ?? kind} @ ${price}`);
      return;
    }
    lines.push({ kind, price, label });
  };

  const pushArray = (kind: SignalLine["kind"], values: unknown, prefix?: string) => {
    if (!Array.isArray(values)) return;
    values.slice(0, 6).forEach((value, index) => push(kind, value, prefix ? `${prefix}${index + 1}` : undefined));
  };

  // Support and resistance arrive as plain number arrays.
  pushArray("support", root.support, "SUP");
  pushArray("resistance", root.resistance, "RES");

  // The setup block carries entry / stop / target. Targets may be a single
  // number or an array, so both are accepted.
  const setup = isRecord(root.setup) ? root.setup : {};
  push("entry", setup.entry, "ENTRY");
  push("stopLoss", setup.stopLoss, "SL");

  const rawTargets = setup.takeProfit ?? setup.takeProfits ?? root.takeProfit;
  const entry = toNumber(setup.entry);
  const stop = toNumber(setup.stopLoss);

  if (Array.isArray(rawTargets)) {
    rawTargets.slice(0, 3).forEach((value, index) => push("takeProfit", value, `TP${index + 1}`));
  } else {
    // A single target is staged into TP1..TP3 using a fixed risk multiple
    // ladder, so beginners still get multiple exit levels to work with.
    const target = toNumber(rawTargets);
    if (target !== null && entry !== null && withinRange(target, range)) {
      const risk = Math.abs(entry - (stop ?? entry)) || Math.abs(target - entry) || 1;
      const direction = Math.sign(target - entry) || 1;
      [1, 1.5, 2.5].forEach((multiple, index) => {
        const price = entry + direction * risk * multiple;
        if (withinRange(price, range)) lines.push({ kind: "takeProfit", price, label: `TP${index + 1}` });
      });
    } else if (target !== null) {
      push("takeProfit", target, "TP1");
    }
  }

  const trend = root.trend === "Bullish" || root.trend === "Bearish" || root.trend === "Sideways" ? root.trend : null;
  const verdict: "Take Entry" | "Wait" | "Do Not Enter" | null = root.verdict === "Setup Detected"
    ? "Take Entry"
    : root.verdict === "Low Confluence - Wait"
      ? "Do Not Enter"
      : root.verdict === "Wait"
        ? "Wait"
        : null;

  // Chart patterns: a "Channel" becomes Phase 4 geometry, everything else is
  // kept as a legend entry only.
  const patternNames: string[] = [];
  if (Array.isArray(root.patterns)) {
    for (const item of root.patterns.slice(0, 6)) {
      if (!isRecord(item)) continue;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (name) patternNames.push(name);
      if (!/channel/i.test(name)) continue;

      const anchors = (Array.isArray(item.points) ? item.points : [])
        .map((point) => (isRecord(point)
          ? { time: toNumber(point.time), price: toNumber(point.price) }
          : { time: null, price: null }))
        .filter((point): point is { time: number; price: number } =>
          point.time !== null && point.price !== null && withinRange(point.price, range));
      if (anchors.length < 2) continue;

      const upper = anchors.reduce((best, point) => (point.price > best.price ? point : best));
      const lower = anchors.reduce((best, point) => (point.price < best.price ? point : best));
      const spanFrom = Math.min(...anchors.map((point) => point.time));
      const spanTo = Math.max(...anchors.map((point) => point.time));
      shapes.push(channelShape(name || "Channel", upper, lower, { from: spanFrom, to: Math.max(spanTo, to) }));
    }
  }

  const summary = typeof root.pattern === "string"
    ? root.pattern
    : typeof root.explanation === "string"
      ? root.explanation
      : "";

  return { lines, shapes, trend, verdict, patternNames, summary, rejected };
}
