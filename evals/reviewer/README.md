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
npm run eval:reviewer                                   # seed set, Opus 5.5, effort high, 1 run
npm run eval:reviewer -- --runs 3                       # repeat to see run-to-run variance
npm run eval:reviewer -- --model claude-sonnet-5-5      # compare models
npm run eval:reviewer -- --dataset path/to/set.json     # another dataset
npm run eval:reviewer -- --dry-run                      # print the request, no API call
npm test                                                # scoring unit tests
```

Each run writes `results/<date>-<model>-<effort>.json` (every verdict and reason, usage per call) and a `.md` summary. Results record a hash of the prompt and of the dataset, so a score can always be traced to the exact prompt version that produced it.

**How the reviewer sees questions:** shuffled (seeded per run, so reruns are reproducible), mixed so broken and clean questions share a batch as they would in a real run, and under neutral IDs (`Q-01`…), so nothing hints at which ones were tampered with.

**No refusal fallback:** the eval measures one named model, so it doesn't let the API quietly retry on a different one. A refusal is recorded as an error and its questions count as missing verdicts.

## First result (seed set)

Opus 5.5, effort high, one run, about $0.09:

- **Planted defects:** it caught all 5, each for the planted reason.
- **"Clean" questions:** it failed 3 of the 5, and its reasons hold up. `js-0028` has a real surface tell: the correct option is the only one with a "because" clause, which the length check misses because a wrong option is longer. `js-0023` and `js-0044` don't explain every wrong option, a rule `/generate` requires but the approved bank doesn't always meet.

So the first run already turned up label errors, which is why every label in the full corpus gets checked by hand.
