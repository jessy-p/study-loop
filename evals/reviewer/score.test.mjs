import { test } from "node:test";
import assert from "node:assert/strict";
import { outcomeFor, scoreRun, summarize, toMarkdown } from "./score.mjs";

const pass = { verdict: "pass", category: "none", reason: "ok" };
const fail = (category) => ({ verdict: "fail", category, reason: "broken" });

test("outcomeFor covers every case", () => {
  assert.equal(outcomeFor("clean", pass), "pass");
  assert.equal(outcomeFor("clean", fail("other")), "false_positive");
  assert.equal(outcomeFor("wrong_key", fail("wrong_key")), "caught");
  assert.equal(outcomeFor("wrong_key", fail("factual_error")), "caught_wrong_reason");
  assert.equal(outcomeFor("wrong_key", pass), "missed");
  assert.equal(outcomeFor("wrong_key", undefined), "no_verdict");
});

const items = [
  { id: "a", label: "clean" },
  { id: "b", label: "clean" },
  { id: "c", label: "wrong_key" },
  { id: "d", label: "wrong_key" },
  { id: "e", label: "factual_error" },
];

test("scoreRun computes recall, right-reason recall and false positives", () => {
  const scored = scoreRun(items, {
    a: pass,
    b: fail("surface_tell"), // false positive
    c: fail("wrong_key"), // caught
    d: fail("defensible_distractor"), // caught, wrong reason
    // e: missing → no verdict
  });
  assert.equal(scored.totals.recall, 2 / 3);
  assert.equal(scored.totals.rightReasonRecall, 1 / 3);
  assert.equal(scored.totals.falsePositiveRate, 1 / 2);
  assert.equal(scored.totals.noVerdict, 1);
  assert.deepEqual(scored.byLabel.wrong_key, { n: 2, caught: 2, rightReason: 1, missed: 0, noVerdict: 0 });
});

test("summarize reports mean, min and max across runs", () => {
  const all = { a: pass, b: pass, c: fail("wrong_key"), d: fail("wrong_key"), e: fail("factual_error") };
  const none = { a: pass, b: pass, c: pass, d: pass, e: pass };
  const s = summarize([scoreRun(items, all), scoreRun(items, none)]);
  assert.deepEqual(s.totals.recall, { mean: 0.5, min: 0, max: 1 });
  assert.equal(s.byLabel.wrong_key.n, 2);
  assert.equal(s.runs, 2);
});

test("borderline items are reported but not scored", () => {
  const withBorderline = [...items, { id: "f", label: "borderline" }];
  const scored = scoreRun(withBorderline, {
    a: pass, b: pass, c: fail("wrong_key"), d: fail("wrong_key"), e: fail("factual_error"),
    f: fail("surface_tell"),
  });
  assert.equal(scored.totals.falsePositiveRate, 0);
  assert.equal(scored.totals.recall, 1);
  assert.equal(scored.totals.borderline, 1);
  assert.equal(scored.byLabel.borderline, undefined);
});

test("summarize lists questions whose verdict changed between runs", () => {
  const run1 = { a: pass, b: pass, c: fail("wrong_key"), d: fail("wrong_key"), e: fail("factual_error") };
  const run2 = { ...run1, a: fail("filler_distractor") }; // a flips
  const run3 = { ...run1, e: undefined }; // e missing once: not flaky
  const s = summarize([run1, run2, run3].map((v) => scoreRun(items, v)));
  assert.deepEqual(s.inconsistent.map((x) => x.id), ["a"]);
  assert.equal(s.inconsistent[0].failed, 1);
  assert.equal(s.inconsistent[0].decided, 3);
  assert.equal(s.inconsistent[0].reasons[0].category, "filler_distractor");

  const md = toMarkdown(s, {
    model: "m", effort: "high", dataset: "d.json", items: 5, promptHash: "p", date: "now",
    cost: 0.1, inputTokens: 1, outputTokens: 1, avgLatencyMs: 1000,
  });
  assert.match(md, /Flaky questions/);
  assert.match(md, /\| a \| clean \| 1 of 3 \|/);
});
