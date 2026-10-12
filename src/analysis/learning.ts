import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Part 4 — Adaptive learning store.
 *
 * Persists scored analysis calls to a JSON file on disk so the engine's measured
 * hit rate survives a server restart and is shared across all sessions, rather
 * than living only in one browser's localStorage.
 *
 * Design constraints:
 * - No database dependency is added; the project has none today.
 * - Writes are atomic (temp file + rename) so a crash mid-write cannot corrupt
 *   the store.
 * - A capped ring buffer keeps the file small and bounded.
 * - Every failure path degrades to "no learning data" instead of throwing, so a
 *   read-only or missing data directory can never break analysis.
 */

export type TradeOutcome = "win" | "loss";

export interface LearningRecord {
  symbol: string;
  direction: "buy" | "sell" | "wait";
  confidence: number;
  price: number;
  /** Unix ms when the call was made. */
  time: number;
  /** null until the call is old enough to be scored against a later price. */
  outcome: TradeOutcome | null;
  /** Percent move measured when the record was scored, once resolved. */
  movePercent: number | null;
}

export interface LearningSummary {
  total: number;
  resolved: number;
  wins: number;
  losses: number;
  /** null until at least MIN_SCORED_SAMPLES calls have been scored. */
  hitRate: number | null;
  /** Confidence blended toward the measured hit rate, or null when unknown. */
  adjustedConfidence: number | null;
  note: string;
}

const STORE_FILE = path.join(process.cwd(), "data", "learning-store.json");
const MAX_RECORDS = 500;
const MIN_SCORED_SAMPLES = 3;

/** A call must be at least this old before its outcome can be judged. */
export const SCORING_DELAY_MS = 4 * 60 * 60 * 1000;

/** Neutral band: moves inside ±0.2% neither win nor lose the call. */
const NOISE_BAND = 0.002;

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

/** Reads the store, returning [] on any failure (missing file, bad JSON). */
export async function readStore(): Promise<LearningRecord[]> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): LearningRecord[] => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Partial<LearningRecord>;
      if (typeof record.symbol !== "string" || typeof record.time !== "number" || typeof record.price !== "number") return [];
      return [{
        symbol: record.symbol,
        direction: record.direction === "buy" || record.direction === "sell" ? record.direction : "wait",
        confidence: typeof record.confidence === "number" && Number.isFinite(record.confidence) ? record.confidence : 0,
        price: record.price,
        time: record.time,
        outcome: record.outcome === "win" || record.outcome === "loss" ? record.outcome : null,
        movePercent: typeof record.movePercent === "number" ? record.movePercent : null,
      }];
    });
  } catch {
    return [];
  }
}

/** Serialized in-process write queue, so concurrent requests cannot race. */
let queue: Promise<unknown> = Promise.resolve();

async function writeStore(records: LearningRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  const temp = `${STORE_FILE}.tmp`;
  await fs.writeFile(temp, JSON.stringify(records, null, 2), "utf8");
  await fs.rename(temp, STORE_FILE);
}

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task, task);
  return queue.then(() => undefined);
}

/** Scores one unresolved call against the latest observed price. */
function scoreRecord(record: LearningRecord, latestPrice: number, now: number): LearningRecord {
  if (record.outcome !== null) return record;
  if (now - record.time < SCORING_DELAY_MS) return record;
  if (record.price <= 0) return record;
  const move = (latestPrice - record.price) / record.price;
  if (Math.abs(move) <= NOISE_BAND) return record;
  const direction = record.direction === "buy" ? 1 : record.direction === "sell" ? -1 : 0;
  if (direction === 0) return record;
  const movePercent = Number((move * 100).toFixed(2));
  return { ...record, movePercent, outcome: direction * move > 0 ? "win" : "loss" };
}

/**
 * Records a fresh call and resolves any older calls for the same symbol that
 * are now old enough to score. Safe to call on every analysis; never throws.
 */
export async function recordCall(input: {
  symbol: string;
  direction: "buy" | "sell" | "wait";
  confidence: number;
  price: number;
}): Promise<LearningSummary> {
  try {
    const now = Date.now();
    const current: LearningRecord = {
      symbol: input.symbol,
      direction: input.direction,
      confidence: clamp(Math.round(input.confidence), 0, 100),
      price: input.price,
      time: now,
      outcome: null,
      movePercent: null,
    };

    await enqueueWrite(async () => {
      const stored = await readStore();
      const resolved = stored.map((record) => (record.symbol === input.symbol ? scoreRecord(record, input.price, now) : record));
      await writeStore([current, ...resolved].slice(0, MAX_RECORDS));
    });

    // Re-read so the summary reflects what actually persisted.
    return summarize(await readStore(), input.confidence);
  } catch {
    return summarize([], input.confidence);
  }
}

/** Aggregates stored records into the hit rate used to adjust confidence. */
export function summarize(records: LearningRecord[], currentConfidence: number): LearningSummary {
  const scored = records.filter((record) => record.outcome !== null);
  const wins = scored.filter((record) => record.outcome === "win").length;
  const losses = scored.length - wins;
  const hitRate = scored.length >= MIN_SCORED_SAMPLES ? wins / scored.length : null;
  const adjustedConfidence = hitRate === null
    ? null
    : Math.round(clamp(currentConfidence, 0, 100) * 0.5 + hitRate * 100 * 0.5);

  return {
    total: records.length,
    resolved: scored.length,
    wins,
    losses,
    hitRate,
    adjustedConfidence,
    note: scored.length < MIN_SCORED_SAMPLES
      ? `Needs ${MIN_SCORED_SAMPLES - scored.length} more scored call(s) before a hit rate is reported. Results are graded against later prices, not claimed accuracy.`
      : `Measured across ${scored.length} scored calls: ${wins} correct. Past performance never guarantees future results.`,
  };
}

/**
 * Renders the measured record as a short, honest prompt clause.
 *
 * Only returned once enough calls exist, so the model is never told about a
 * statistic resting on one or two samples.
 */
export function buildLearningClause(records: LearningRecord[]): string {
  const summary = summarize(records, 0);
  if (summary.hitRate === null) return "";
  const pct = (summary.hitRate * 100).toFixed(0);
  return `Self-measured track record: ${summary.wins} correct out of ${summary.resolved} scored calls (${pct}%). Weight recent structure heavily and treat this as context only — it is not a win-rate guarantee, and past performance does not predict the next trade.`;
}

export async function readLearningSummary(currentConfidence: number): Promise<LearningSummary> {
  return summarize(await readStore(), currentConfidence);
}

export async function clearStore(): Promise<void> {
  await enqueueWrite(async () => writeStore([]));
}