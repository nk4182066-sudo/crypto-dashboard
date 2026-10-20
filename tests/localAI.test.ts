/**
 * tests/localAI.test.ts — the intent classifier.
 *
 * The PERFORMANCE intent must win over the "show me signals" rules for
 * history questions, otherwise "pichle 30 din ke signals ka win rate" is
 * answered with a fresh shortlist instead of the real archive numbers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { detectIntent, isRomanUrdu } from "@/src/lib/localAI";

test("history questions are classified as PERFORMANCE", () => {
  assert.equal(detectIntent("how accurate are your signals?"), "PERFORMANCE");
  assert.equal(detectIntent("what is the win rate"), "PERFORMANCE");
  assert.equal(detectIntent("kitne signals jeete?"), "PERFORMANCE");
  assert.equal(detectIntent("pichle 30 din ke signals ka win rate kya hai?"), "PERFORMANCE");
  assert.equal(detectIntent("signal stats dikhao"), "PERFORMANCE");
  assert.equal(detectIntent("how many wins do you have?"), "PERFORMANCE");
  assert.equal(detectIntent("signal accuracy kya hai"), "PERFORMANCE");
});

test("a plain signal request still reaches SIGNAL_QUERY", () => {
  assert.equal(detectIntent("aaj ke signals dikhao"), "SIGNAL_QUERY");
  assert.equal(detectIntent("best setup batao"), "SIGNAL_QUERY");
  assert.equal(detectIntent("show signals"), "SIGNAL_QUERY");
});

test("a signal discussion still reaches SIGNAL_DISCUSSION", () => {
  assert.equal(detectIntent("kab entry laun?"), "SIGNAL_DISCUSSION");
  assert.equal(detectIntent("should i enter this signal?"), "SIGNAL_DISCUSSION");
});

test("Roman Urdu detection recognises the history question", () => {
  assert.equal(isRomanUrdu("pichle 30 din ke signals ka win rate kya hai?"), true);
  assert.equal(isRomanUrdu("how accurate are your signals?"), false);
});
