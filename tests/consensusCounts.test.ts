/**
 * tests/consensusCounts.test.ts — the chat's consensus-count resolver.
 *
 * Only GENUINE evaluations may report consensus counts, and the exact
 * accepted thresholds are 2/4 experts + 6/8 conditions. Malformed or
 * fabricated counts ("75%", "3 of 4", hardcoded "8/8", wrong denominators,
 * out-of-range numbers) must be rejected — the chat then reports nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACCEPTED_CONDITIONS_PASSED,
  ACCEPTED_EXPERT_AGREED,
  CONDITIONS_TOTAL,
  EXPERTS_TOTAL,
  describeConsensus,
  formatConsensusCounts,
  isAcceptedConsensus,
  parseConditionsPassed,
  parseExpertCounts,
  resolveChatConsensus,
} from "@/src/lib/consensusCounts";

test("the accepted thresholds are exactly 2/4 experts and 6/8 conditions", () => {
  assert.equal(EXPERTS_TOTAL, 4);
  assert.equal(CONDITIONS_TOTAL, 8);
  assert.equal(ACCEPTED_EXPERT_AGREED, 2);
  assert.equal(ACCEPTED_CONDITIONS_PASSED, 6);
});

test("genuine expert counts parse exactly", () => {
  assert.deepEqual(parseExpertCounts({ agreed: 2, total: 4 }), { agreed: 2, total: 4 });
  assert.deepEqual(parseExpertCounts("2/4"), { agreed: 2, total: 4 });
  assert.deepEqual(parseExpertCounts(" 3 / 4 "), { agreed: 3, total: 4 });
  assert.deepEqual(parseExpertCounts("0/4"), { agreed: 0, total: 4 });
  assert.deepEqual(parseExpertCounts("4/4"), { agreed: 4, total: 4 });
});

test("malformed or fabricated expert counts are rejected", () => {
  assert.equal(parseExpertCounts("75%"), null);
  assert.equal(parseExpertCounts("3 of 4"), null);
  assert.equal(parseExpertCounts("5/4"), null); // agreed above total
  assert.equal(parseExpertCounts("2/5"), null); // wrong denominator
  assert.equal(parseExpertCounts("Strong (4/4)"), null);
  assert.equal(parseExpertCounts("2 experts"), null);
  assert.equal(parseExpertCounts("consensus"), null);
  assert.equal(parseExpertCounts(2.5), null); // fractional, and bare numbers carry no denominator
  assert.equal(parseExpertCounts(4), null);
  assert.equal(parseExpertCounts(-1), null);
  assert.equal(parseExpertCounts(null), null);
  assert.equal(parseExpertCounts(undefined), null);
  assert.equal(parseExpertCounts({ agreed: 2 }), null); // total missing
  assert.equal(parseExpertCounts({ agreed: 2, total: 5 }), null); // wrong denominator
  assert.equal(parseExpertCounts({ agreed: 5, total: 4 }), null); // agreed above total
  assert.equal(parseExpertCounts({ agreed: 1.5, total: 4 }), null);
});

test("genuine condition counts parse exactly", () => {
  assert.equal(parseConditionsPassed(6), 6);
  assert.equal(parseConditionsPassed(0), 0);
  assert.equal(parseConditionsPassed(8), 8);
  assert.equal(parseConditionsPassed("6/8"), 6);
  assert.equal(parseConditionsPassed(" 7 / 8 "), 7);
});

test("malformed or fabricated condition counts are rejected", () => {
  assert.equal(parseConditionsPassed(9), null); // above 8
  assert.equal(parseConditionsPassed(-1), null);
  assert.equal(parseConditionsPassed(6.5), null);
  assert.equal(parseConditionsPassed("9/8"), null);
  assert.equal(parseConditionsPassed("6/9"), null); // wrong denominator
  assert.equal(parseConditionsPassed("75%"), null);
  assert.equal(parseConditionsPassed("8/8 claimed"), null);
  assert.equal(parseConditionsPassed("Strong (8/8)"), null);
  assert.equal(parseConditionsPassed("eight"), null);
  assert.equal(parseConditionsPassed(null), null);
});

test("the evaluated panel rollup beats a client display string", () => {
  const consensus = resolveChatConsensus({
    experts: { educators: [], consensus: { agreed: 2, total: 4 } },
    consensus: "4/4", // stale/fabricated display string — must lose
  });
  assert.deepEqual(consensus, { experts: { agreed: 2, total: 4 }, conditionsPassed: null });
});

test("strict strings still resolve when no panel object is present", () => {
  const consensus = resolveChatConsensus({ consensus: "3/4", conditionsPassed: "7/8" });
  assert.deepEqual(consensus, { experts: { agreed: 3, total: 4 }, conditionsPassed: 7 });
});

test("the 8 genuine condition rows are reduced to their pass count", () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({ id: `c${index}`, pass: index < 6 }));
  assert.deepEqual(resolveChatConsensus({ conditions: rows }), {
    experts: null,
    conditionsPassed: 6,
  });
  // Wrong length is not a genuine 8-condition evaluation.
  assert.equal(resolveChatConsensus({ conditions: rows.slice(0, 7) }), null);
});

test("fabricated payloads with nothing genuine resolve to null", () => {
  assert.equal(resolveChatConsensus(null), null);
  assert.equal(resolveChatConsensus({}), null);
  assert.equal(resolveChatConsensus({ consensus: "Strong (8/8)", conditionsPassed: "8/8 claimed" }), null);
  assert.equal(resolveChatConsensus({ consensus: "75%", conditions: [] }), null);
});

test("the exact accepted thresholds clear acceptance and nothing below does", () => {
  const exact = { experts: { agreed: 2, total: 4 }, conditionsPassed: 6 };
  assert.equal(isAcceptedConsensus(exact), true); // exactly 2/4 + 6/8

  const above = { experts: { agreed: 3, total: 4 }, conditionsPassed: 7 };
  assert.equal(isAcceptedConsensus(above), true);

  assert.equal(isAcceptedConsensus({ experts: { agreed: 1, total: 4 }, conditionsPassed: 6 }), false); // experts below 2/4
  assert.equal(isAcceptedConsensus({ experts: { agreed: 2, total: 4 }, conditionsPassed: 5 }), false); // conditions below 6/8
  assert.equal(isAcceptedConsensus({ experts: null, conditionsPassed: 8 }), false); // never evaluated by the panel
  assert.equal(isAcceptedConsensus({ experts: { agreed: 4, total: 4 }, conditionsPassed: null }), false); // never evaluated by the engine
  assert.equal(isAcceptedConsensus(null), false);
});

test("exact counts render as '2/4 experts · 6/8 conditions'", () => {
  assert.equal(
    formatConsensusCounts({ experts: { agreed: 2, total: 4 }, conditionsPassed: 6 }),
    "2/4 experts · 6/8 conditions",
  );
  assert.equal(formatConsensusCounts({ experts: { agreed: 3, total: 4 }, conditionsPassed: null }), "3/4 experts");
  assert.equal(formatConsensusCounts({ experts: null, conditionsPassed: 7 }), "7/8 conditions");
});

test("describeConsensus reports nothing without a genuine evaluation", () => {
  assert.equal(describeConsensus(null), null);
  assert.equal(describeConsensus({ experts: null, conditionsPassed: null }), null);
  assert.equal(
    describeConsensus({ experts: { agreed: 2, total: 4 }, conditionsPassed: 6 }),
    "2/4 experts · 6/8 conditions ✅",
  );
  assert.match(
    describeConsensus({ experts: { agreed: 1, total: 4 }, conditionsPassed: 4 }) ?? "",
    /1\/4 experts · 4\/8 conditions ⚠️ below accepted threshold/,
  );
});