# Reviewer eval

The adversarial reviewer is the pipeline's quality gate: every generated question has to get past it before a human sees it. This eval measures how well it does that job.

It runs the production reviewer prompt ([`prompts/reviewer.md`](../../prompts/reviewer.md), the same file `/generate` uses) over a labelled set of questions and counts what it catches.

## The dataset

Each item is a question plus a label the reviewer never sees:

- **`clean`**: a good question. The reviewer should pass it.
- **A defect type** such as `wrong_key` or `factual_error`: a question broken in exactly that one way. The reviewer should fail it, ideally naming that defect.

```json
{ "id": "seed-06", "label": "wrong_key", "source": "js-0005",
  "note": "correctIndex moved from the real answer to the 'clones the function' option",
  "question": { "prompt": "…", "options": ["…"], "correctIndex": 0, "explanation": "…" } }
```

The clean items matter as much as the broken ones. Without them, a reviewer that failed everything would score 100%.

`seed.json` is a 10-item starter set (5 clean, 5 broken) built by [`build-seed.mjs`](build-seed.mjs), where every mutation is written out in code. It proves the harness works; it's too small to draw conclusions from. The full corpus replaces it next.

## What it measures

| Metric | Meaning |
|---|---|
| Caught (any reason) | Share of broken questions the reviewer failed |
| Right reason | Share failed with the planted defect's category |
| Clean wrongly failed | Share of clean questions the reviewer failed |
| Cost, tokens, time | Per run, from the API's usage numbers |

Scoring is plain counting against the labels, with no model grading another model. When the reviewer fails a "clean" question, look at its reason before calling it a false positive: it may have found a real problem, in which case the label was wrong and gets fixed.

## Running it

Put `ANTHROPIC_API_KEY` in `.env.local`, then:

```bash
npm run eval:reviewer                                   # seed set, Opus 5.5, effort high, 3 runs
npm run eval:reviewer -- --runs 5                       # more runs for a tighter range
npm run eval:reviewer -- --model claude-sonnet-5-5      # compare models
npm run eval:reviewer -- --dataset path/to/set.json     # another dataset
npm run eval:reviewer -- --dry-run                      # print the request, no API call
npm test                                                # scoring unit tests
```

Each eval writes `results/<date>-<model>-<effort>.json` (every verdict and reason, usage per call) and a `.md` summary. Results record a hash of the prompt and of the dataset, so a score can always be traced to the exact prompt version that produced it. Results are append-only: new runs are added, old ones are never rewritten.

## Dealing with run-to-run variance

The reviewer is a model, so the same question can get a different verdict on a different run, and the API offers no way to make it deterministic. So:

- **Every eval runs the dataset three times** and reports the mean with the lowest and highest result. One run is a sample, not a measurement.
- **Flaky questions are listed separately:** any question that passed in some runs and failed in others, with the reviewer's reasons. Each one points either to a vague rule in the prompt or to a genuinely ambiguous question.
- **Genuinely debatable questions get the label `borderline`.** They still appear in the report but are left out of the metrics, since either verdict could be right.
- **A difference between two configs counts only if it's bigger than the run-to-run range.** With 10 questions, one flipped verdict moves a metric by 10 points, so the seed set can't compare prompts or models. The full corpus is sized for that.

If flakiness turns out to be common, the production fix is to run the reviewer three times and take the majority verdict. This eval would show whether that's worth three times the cost.

**How the reviewer sees questions:** shuffled (seeded per run, so reruns are reproducible), mixed so broken and clean questions share a batch as they would in a real run, and under neutral IDs (`Q-01`…), so nothing hints at which ones were tampered with.

**No refusal fallback:** the eval measures one named model, so it doesn't let the API quietly retry on a different one. A refusal is recorded as an error and its questions count as missing verdicts.

## Results so far (seed set, Opus 5.5, effort high)

1. **First run** (`results/2026-11-19T0702-…`, about $0.09). It caught all 5 planted defects, each for the planted reason. It also failed 3 of the 5 "clean" questions, and its reasons held up. `js-0028` had a real surface tell: the correct option was the only one with a "because" clause, which the length check misses because a wrong option was longer. `js-0023` and `js-0044` didn't explain every wrong option, a rule `/generate` requires but the approved bank didn't always meet. Those three questions were fixed in the live bank.
2. **Rerun after the fixes** (`results/2026-11-19T0734-…`). All three passed on the problems that were fixed, but two clean questions now failed for new reasons, including `js-0060`, which had passed the first time. That's run-to-run variance, which led to running everything three times.
3. **Three runs** (`results/2026-11-19T0755-…`, about $0.30):

| Metric | Result |
|---|---|
| Planted defects caught | 100% in every run, all for the planted reason |
| Clean questions wrongly failed | 27% (20%–40%) |

The false positives come from two questions. `js-0060` is flaky: failed once in three runs, for a debatable surface tell. `js-0044` failed in all three runs, though for different reasons each time (a padded distractor, a surface tell). Whether these are real problems or borderline calls is decided when the labels are checked by hand for the full corpus.
