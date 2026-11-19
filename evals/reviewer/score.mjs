// Scoring for the reviewer eval. Pure functions over the dataset and the
// reviewer's verdicts, so they're testable without calling the API.
//
// Each dataset item has a `label`: "clean" (a good question; the reviewer
// should pass it) or a defect category (a question broken in exactly that
// way; the reviewer should fail it, ideally naming that category).

export const CATEGORIES = [
  "wrong_key",
  "defensible_distractor",
  "same_reason_distractors",
  "filler_distractor",
  "incomplete_explanation",
  "surface_tell",
  "contradicts_stem",
  "strawman_explanation",
  "factual_error",
  "time_sensitive_claim",
  "duplicate",
  "other",
];

/**
 * Outcome of one item in one run:
 *   clean item  → "pass" (correct) or "false_positive"
 *   broken item → "caught" (failed, right category), "caught_wrong_reason"
 *                 (failed, other category) or "missed" (passed)
 *   either      → "no_verdict" (reviewer skipped it, or the call errored)
 */
export function outcomeFor(label, verdict) {
  if (!verdict) return "no_verdict";
  if (label === "clean") return verdict.verdict === "pass" ? "pass" : "false_positive";
  if (verdict.verdict === "pass") return "missed";
  return verdict.category === label ? "caught" : "caught_wrong_reason";
}

/** Score one run. `verdictsById` maps dataset item id → { verdict, category, reason }. */
export function scoreRun(items, verdictsById) {
  const perItem = items.map((item) => {
    const v = verdictsById[item.id];
    return {
      id: item.id,
      label: item.label,
      verdict: v?.verdict ?? null,
      category: v?.category ?? null,
      reason: v?.reason ?? null,
      outcome: outcomeFor(item.label, v),
    };
  });

  const clean = perItem.filter((r) => r.label === "clean");
  const broken = perItem.filter((r) => r.label !== "clean");
  const count = (rows, ...outcomes) => rows.filter((r) => outcomes.includes(r.outcome)).length;
  const rate = (n, d) => (d ? n / d : null);

  const byLabel = {};
  for (const label of [...new Set(broken.map((r) => r.label))].sort()) {
    const rows = broken.filter((r) => r.label === label);
    byLabel[label] = {
      n: rows.length,
      caught: count(rows, "caught", "caught_wrong_reason"),
      rightReason: count(rows, "caught"),
      missed: count(rows, "missed"),
      noVerdict: count(rows, "no_verdict"),
    };
  }

  return {
    perItem,
    byLabel,
    totals: {
      broken: broken.length,
      clean: clean.length,
      // Share of broken questions the reviewer failed, for any reason.
      recall: rate(count(broken, "caught", "caught_wrong_reason"), broken.length),
      // Share of broken questions failed for the planted reason.
      rightReasonRecall: rate(count(broken, "caught"), broken.length),
      // Share of clean questions the reviewer wrongly failed.
      falsePositiveRate: rate(count(clean, "false_positive"), clean.length),
      noVerdict: count(perItem, "no_verdict"),
    },
  };
}

/** Mean, min and max of a metric across runs (nulls ignored). */
function spread(values) {
  const v = values.filter((x) => x !== null && x !== undefined);
  if (!v.length) return null;
  return { mean: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v) };
}

/** Combine several scored runs of the same config. */
export function summarize(scoredRuns) {
  const totals = {};
  for (const key of ["recall", "rightReasonRecall", "falsePositiveRate"]) {
    totals[key] = spread(scoredRuns.map((r) => r.totals[key]));
  }
  totals.noVerdict = scoredRuns.reduce((a, r) => a + r.totals.noVerdict, 0);

  const labels = [...new Set(scoredRuns.flatMap((r) => Object.keys(r.byLabel)))].sort();
  const byLabel = {};
  for (const label of labels) {
    const rows = scoredRuns.map((r) => r.byLabel[label]).filter(Boolean);
    byLabel[label] = {
      n: rows[0].n,
      caught: spread(rows.map((x) => x.caught / x.n)),
      rightReason: spread(rows.map((x) => x.rightReason / x.n)),
    };
  }
  return { runs: scoredRuns.length, totals, byLabel };
}

const pct = (s) => {
  if (!s) return "–";
  const f = (x) => `${Math.round(x * 100)}%`;
  return s.min === s.max ? f(s.mean) : `${f(s.mean)} (${f(s.min)}–${f(s.max)})`;
};

/** Markdown summary for the results file and the terminal. */
export function toMarkdown(summary, meta) {
  const lines = [
    `## Reviewer eval — ${meta.model}, effort ${meta.effort}`,
    "",
    `Dataset \`${meta.dataset}\` (${meta.items} items) · ${summary.runs} run(s) · prompt \`${meta.promptHash}\` · ${meta.date}`,
    "",
    "| Metric | Result |",
    "|---|---|",
    `| Broken questions caught (any reason) | ${pct(summary.totals.recall)} |`,
    `| Caught for the planted reason | ${pct(summary.totals.rightReasonRecall)} |`,
    `| Clean questions wrongly failed | ${pct(summary.totals.falsePositiveRate)} |`,
    `| Missing verdicts | ${summary.totals.noVerdict} |`,
    `| Cost | ${meta.cost === null ? "unknown model price" : `$${meta.cost.toFixed(4)}`} (${meta.inputTokens} in / ${meta.outputTokens} out tokens) |`,
    `| Time per call | ${Math.round(meta.avgLatencyMs / 1000)}s average |`,
    "",
    "| Defect type | n | Caught | Right reason |",
    "|---|---|---|---|",
  ];
  for (const [label, s] of Object.entries(summary.byLabel)) {
    lines.push(`| \`${label}\` | ${s.n} | ${pct(s.caught)} | ${pct(s.rightReason)} |`);
  }
  if (summary.runs > 1) lines.push("", "Ranges show the lowest and highest result across runs.");
  return lines.join("\n");
}
