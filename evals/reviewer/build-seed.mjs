#!/usr/bin/env node
// Builds evals/reviewer/seed.json: a tiny dataset that proves the harness
// runs end to end. Five questions are copied unchanged from the live bank
// (label "clean"); five more are copies with exactly one planted defect each.
// Every mutation is written out here so the label can be checked by reading
// the code. The full corpus (real misses + more planted defects, every label
// verified by hand) replaces this in the next PR.
//
//   node evals/reviewer/build-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");
const bank = JSON.parse(readFileSync(path.join(root, "data/questions/javascript.json"), "utf8"));
const byId = (id) => {
  const q = bank.find((x) => x.id === id);
  if (!q) throw new Error(`missing ${id}`);
  const copy = structuredClone(q);
  delete copy.id; // the harness assigns neutral IDs; the bank ID stays in `source`
  return copy;
};

function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`mutation text not found: ${from.slice(0, 60)}`);
  return text.replace(from, to);
}

const items = [];

// Clean: copied unchanged.
for (const source of ["js-0023", "js-0028", "js-0044", "js-0046", "js-0060"]) {
  items.push({ label: "clean", source, note: "unchanged from the live bank", question: byId(source) });
}

// wrong_key: the marked answer moves to a wrong option; the explanation still
// describes the real answer.
{
  const q = byId("js-0005");
  q.correctIndex = 0; // "It clones the `Foo` function…"
  items.push({
    label: "wrong_key",
    source: "js-0005",
    note: "correctIndex moved from the real answer to the 'clones the function' option; explanation unchanged",
    question: q,
  });
}

// incomplete_explanation: per-option explanation replaced with a collective dismissal.
{
  const q = byId("js-0031");
  q.explanation =
    "`Object.hasOwn()` (the modern alternative to `.hasOwnProperty()`) checks only for an own property, independent of its value, which is why it's the most reliable choice. The other approaches are incorrect.";
  items.push({
    label: "incomplete_explanation",
    source: "js-0031",
    note: "explanation of why each wrong option fails replaced with 'The other approaches are incorrect.'",
    question: q,
  });
}

// filler_distractor: a plausible distractor swapped for one nobody would pick.
{
  const q = byId("js-0039");
  const i = q.options.findIndex((o) => o.startsWith("`window.queryParams`"));
  q.options[i] =
    "Ask the visitor to type the parameters into a `prompt()` dialog when the page loads, and read their answers from there";
  q.explanation = replaceOnce(
    q.explanation,
    "There's no built-in `window.queryParams`",
    "Asking the visitor to retype the values doesn't read the URL at all",
  );
  items.push({
    label: "filler_distractor",
    source: "js-0039",
    note: "'window.queryParams' distractor replaced with an absurd prompt() option; explanation updated to match",
    question: q,
  });
}

// strawman_explanation: the explanation refutes a claim no option makes.
{
  const q = byId("js-0021");
  q.explanation = replaceOnce(
    q.explanation,
    "— there's no built-in automatic retry or infinite-hang behavior in either.",
    "— so the idea that `Promise.all` renders the successful sections first and then throws once `fetchB` fails is wrong, and there's no built-in automatic retry or infinite-hang behavior in either.",
  );
  items.push({
    label: "strawman_explanation",
    source: "js-0021",
    note: "explanation restates the 'silently drops fetchB' option as 'renders first, then throws', which that option never says",
    question: q,
  });
}

// factual_error: one false claim inserted into an otherwise correct explanation.
{
  const q = byId("js-0063");
  q.explanation = replaceOnce(
    q.explanation,
    "The tradeoff is that workers have no direct DOM access",
    "The tradeoff is that the browser terminates every worker after 30 seconds of runtime, and workers have no direct DOM access",
  );
  items.push({
    label: "factual_error",
    source: "js-0063",
    note: "inserted the false claim that browsers terminate every worker after 30 seconds",
    question: q,
  });
}

const dataset = items.map((item, n) => ({ id: `seed-${String(n + 1).padStart(2, "0")}`, ...item }));
const out = path.join(here, "seed.json");
writeFileSync(out, JSON.stringify(dataset, null, 2) + "\n");
console.log(`wrote ${dataset.length} items to ${path.relative(root, out)}`);
