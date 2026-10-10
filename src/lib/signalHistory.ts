/**
 * Local signal history — the source of truth for /results.
 *
 * The /trade page saves a record whenever the rule-based analysis produces a
 * high-confluence setup (score 80+). The /results page reads this list,
 * re-evaluates PENDING records against live price (every 5 min) and shows an
 * honest win rate. Educational only — not financial advice.
 *
 * NOTE: user-facing copy calls these "setups", not "signals", per the legal
 * language rule. The storage key stays "signal-history" for continuity.
 */

export type SetupStatus = "success" | "failed" | "pending";
export type Direction = "bullish" | "bearish" | "neutral";

/** Minimum score a setup must reach to be saved and tracked. */
export const HIGH_CONFLUENCE_SCORE = 80;

/** Max records kept; oldest are dropped when this is exceeded. */
export const MAX_RECORDS = 100;

/** localStorage key. Kept as "signal-history" for continuity with prior builds. */
export const SIGNAL_HISTORY_KEY = "signal-history";

export interface SignalRecord {
  id: string;
  symbol: string;
  market: string;
  /** Epoch ms when the setup was recorded. */
  date: number;
  score: number;
  direction: Direction;
  /** Price when the setup was flagged (entry reference). */
  entryPrice: number;
  /** Directional target — resistance for bullish, support for bearish. */
  targetPrice: number;
  support: number;
  resistance: number;
  pattern: string;
  status: SetupStatus;
  /** Roman Urdu + English teacher explanation, generated at save time. */
  explanationUrdu: string;
  explanationEnglish: string;
}

function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 1 ? 2 : 4 })}`;
}

/**
 * Build the bilingual teacher explanation. Written generically so it stays
 * accurate whatever the live outcome turns out to be.
 */
export function buildExplanation(record: Omit<SignalRecord, "explanationUrdu" | "explanationEnglish">): {
  explanationUrdu: string;
  explanationEnglish: string;
} {
  const dir = record.direction === "bearish" ? "bearish" : "bullish";
  const dirUrdu = record.direction === "bearish" ? "neeche" : "upar";
  const explanationUrdu =
    `${record.symbol} pe ${record.pattern} pattern ke saath ${dir} setup bana. ` +
    `Score ${record.score}/100 tha. Support ${fmtMoney(record.support)} aur resistance ${fmtMoney(record.resistance)} pe level set hui. ` +
    `Target ${fmtMoney(record.targetPrice)} ${dirUrdu} tha. Setup ka natija neeche live price ke against check kiya gaya hai.`;
  const explanationEnglish =
    `A ${dir} setup formed on ${record.symbol} with the ${record.pattern} pattern. ` +
    `Score was ${record.score}/100. Support ${fmtMoney(record.support)} and resistance ${fmtMoney(record.resistance)} defined the levels. ` +
    `Target was ${fmtMoney(record.targetPrice)}. Outcome was evaluated against live price.`;

  return { explanationUrdu, explanationEnglish };
}

/** Reads the full stored history (newest first). Returns [] on any problem. */
export function loadSignalHistory(): SignalRecord[] {
  try {
    const raw = localStorage.getItem(SIGNAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SignalRecord => {
        if (!item || typeof item !== "object") return false;
        const r = item as Partial<SignalRecord>;
        return typeof r.id === "string" && typeof r.symbol === "string" && typeof r.entryPrice === "number";
      })
      .map((r) => ({
        ...r,
        status: (r.status === "success" || r.status === "failed" ? r.status : "pending") as SetupStatus,
      }))
      .sort((a, b) => b.date - a.date);
  } catch {
    return [];
  }
}

/** Persists the list, bounding it to the newest MAX_RECORDS entries. */
export function saveSignalHistory(records: SignalRecord[]): void {
  try {
    const bounded = records.slice(0, MAX_RECORDS);
    localStorage.setItem(SIGNAL_HISTORY_KEY, JSON.stringify(bounded));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

/**
 * Save a high-confluence setup (score 80+). De-duplicates by symbol+market so a
 * re-scan of the same chart updates the existing record instead of piling up
 * duplicates. No-op below the threshold.
 */
export function recordHighConfluenceSetup(input: {
  symbol: string;
  market: string;
  score: number;
  direction: Direction;
  entryPrice: number;
  targetPrice: number;
  support: number;
  resistance: number;
  pattern: string;
}): void {
  if (input.score < HIGH_CONFLUENCE_SCORE) return;
  if (!Number.isFinite(input.entryPrice) || input.entryPrice <= 0) return;

  const existing = loadSignalHistory();
  // Drop any older record for the same symbol+market so we keep one live entry.
  const kept = existing.filter((r) => !(r.symbol === input.symbol && r.market === input.market));

  const base = {
    id: `${input.symbol}-${input.market}-${Date.now()}`,
    symbol: input.symbol,
    market: input.market,
    date: Date.now(),
    score: input.score,
    direction: input.direction,
    entryPrice: input.entryPrice,
    targetPrice: input.targetPrice,
    support: input.support,
    resistance: input.resistance,
    pattern: input.pattern || "No clear pattern",
    status: "pending" as SetupStatus,
  };
  const { explanationUrdu, explanationEnglish } = buildExplanation(base);
  const record: SignalRecord = { ...base, explanationUrdu, explanationEnglish };

  saveSignalHistory([record, ...kept]);
}

/**
 * Re-evaluate a PENDING record against the current price.
 *  - moved 1%+ in the setup direction  -> success
 *  - moved 1%+ against the direction   -> failed
 *  - otherwise still pending
 * Neutral direction can't be scored, so it stays pending.
 */
export function evaluateStatus(record: SignalRecord, currentPrice: number): SetupStatus {
  if (record.status !== "pending") return record.status;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || record.entryPrice <= 0) return "pending";

  const movePct = ((currentPrice - record.entryPrice) / record.entryPrice) * 100;

  if (record.direction === "bullish") {
    if (movePct >= 1) return "success";
    if (movePct <= -1) return "failed";
  } else if (record.direction === "bearish") {
    if (movePct <= -1) return "success";
    if (movePct >= 1) return "failed";
  }
  return "pending";
}
