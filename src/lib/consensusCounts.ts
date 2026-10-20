// consensusCounts.ts — the ONE place the chat's consensus counts come from.
//
// The chat used to print whatever strings a client sent ("75%", "3 of 4", …)
// plus a hardcoded "(8/8)" badge — counts no evaluation ever produced. Every
// consensus count the chat reports is now resolved HERE from GENUINE
// evaluation fields only:
//
//   • experts    = the 4-educator panel rollup ({agreed, total: 4} or an exact
//                  "X/4" string)      → reported exactly as X/4
//   • conditions = the strict 8-condition engine output
//                  ({conditionsPassed} or an exact "X/8" string, or the 8
//                  pass/fail ConditionLine rows) → reported exactly as X/8
//
// The exact ACCEPTED thresholds a genuine evaluation must clear before the
// chat presents a setup as consensus-backed:
//
//   • 2/4 experts    (ACCEPTED_EXPERT_AGREED)
//   • 6/8 conditions (ACCEPTED_CONDITIONS_PASSED)
//
// Anything malformed or fabricated is rejected (null) — the chat then reports
// NO count rather than an invented one. Educational only.

/** The expert panel is always 4 educators. */
export const EXPERTS_TOTAL = 4;

/** The strict engine always evaluates 8 conditions. */
export const CONDITIONS_TOTAL = 8;

/** Exact accepted threshold — at least 2 of 4 experts must agree. */
export const ACCEPTED_EXPERT_AGREED = 2;

/** Exact accepted threshold — at least 6 of 8 conditions must pass. */
export const ACCEPTED_CONDITIONS_PASSED = 6;

/** Genuine expert-panel rollup: agreed X of 4. */
export interface ExpertCounts {
  agreed: number;
  total: number;
}

/** Genuine consensus counts resolved from a signal payload. */
export interface ChatConsensus {
  /** 4-educator panel rollup, or null when no genuine panel ran. */
  experts: ExpertCounts | null;
  /** Strict 8-condition pass count, or null when no genuine engine ran. */
  conditionsPassed: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** Strict "X/T" (spaces around "/" allowed) — nothing else survives. */
function parseStrictFraction(value: unknown, total: number): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  if (Number(match[2]) !== total) return null;
  const count = Number(match[1]);
  return count <= total ? count : null;
}

/**
 * Genuine expert-panel consensus: the rollup object the 4-educator engine
 * produces ({agreed, total: 4}) or an exact "X/4" string. Everything else —
 * percentages, prose, wrong denominators, out-of-range or fractional counts —
 * is fabricated or malformed and rejected (null).
 */
export function parseExpertCounts(value: unknown): ExpertCounts | null {
  if (isRecord(value)) {
    const { agreed, total } = value;
    if (isInt(agreed) && isInt(total) && total === EXPERTS_TOTAL && agreed >= 0 && agreed <= total) {
      return { agreed, total };
    }
    return null;
  }
  const agreed = parseStrictFraction(value, EXPERTS_TOTAL);
  return agreed === null ? null : { agreed, total: EXPERTS_TOTAL };
}

/** Genuine 8-condition pass count: integer 0..8 or an exact "X/8" string. */
export function parseConditionsPassed(value: unknown): number | null {
  if (isInt(value) && value >= 0 && value <= CONDITIONS_TOTAL) return value;
  return parseStrictFraction(value, CONDITIONS_TOTAL);
}

/**
 * The strict engine's ConditionLine rows ({id, label, pass, detail}) — exactly
 * 8 genuine rows with boolean pass flags, reduced to the pass count. Anything
 * else (wrong length, non-boolean flags) is not a genuine evaluation.
 */
function conditionsFromLines(value: unknown): number | null {
  if (!Array.isArray(value) || value.length !== CONDITIONS_TOTAL) return null;
  if (!value.every((entry) => isRecord(entry) && typeof entry.pass === "boolean")) return null;
  return value.filter((entry) => (entry as { pass: boolean }).pass).length;
}

/**
 * Resolves the genuine consensus counts from a signal payload. Authoritative
 * order: the evaluated panel/engine fields first, strict-format display strings
 * only as fallback. Returns null when NOTHING genuine is present.
 */
export function resolveChatConsensus(raw: unknown): ChatConsensus | null {
  if (!isRecord(raw)) return null;

  // Experts: the evaluated panel rollup wins over any display string.
  const experts =
    (isRecord(raw.experts) ? parseExpertCounts(raw.experts.consensus) : null) ??
    parseExpertCounts(raw.consensus);

  // Conditions: the engine's own count, then a strict "X/8" string, then the
  // 8 genuine pass/fail rows.
  const conditionsPassed =
    parseConditionsPassed(raw.conditionsPassed) ??
    parseStrictFraction(raw.conditions, CONDITIONS_TOTAL) ??
    conditionsFromLines(raw.conditions);

  if (experts === null && conditionsPassed === null) return null;
  return { experts, conditionsPassed };
}

/** Exact rendering: "2/4 experts · 6/8 conditions" (missing sides skipped). */
export function formatConsensusCounts(consensus: ChatConsensus): string {
  const parts: string[] = [];
  if (consensus.experts) {
    parts.push(`${consensus.experts.agreed}/${consensus.experts.total} experts`);
  }
  if (consensus.conditionsPassed !== null) {
    parts.push(`${consensus.conditionsPassed}/${CONDITIONS_TOTAL} conditions`);
  }
  return parts.join(" · ");
}

/**
 * Accepted only for GENUINE evaluations that clear BOTH exact thresholds —
 * 2/4 experts and 6/8 conditions. A missing side means the evaluation was
 * never completed, so nothing is "accepted".
 */
export function isAcceptedConsensus(consensus: ChatConsensus | null): boolean {
  if (!consensus || !consensus.experts || consensus.conditionsPassed === null) return false;
  return (
    consensus.experts.agreed >= ACCEPTED_EXPERT_AGREED &&
    consensus.conditionsPassed >= ACCEPTED_CONDITIONS_PASSED
  );
}

/**
 * Exact counts plus the accepted/below-threshold verdict, e.g.
 * "2/4 experts · 6/8 conditions ✅". Null when nothing genuine exists — the
 * caller then prints NO count at all.
 */
export function describeConsensus(consensus: ChatConsensus | null): string | null {
  const counts = consensus ? formatConsensusCounts(consensus) : "";
  if (!counts) return null;
  return isAcceptedConsensus(consensus)
    ? `${counts} ✅`
    : `${counts} ⚠️ below accepted threshold (2/4 experts · 6/8 conditions)`;
}