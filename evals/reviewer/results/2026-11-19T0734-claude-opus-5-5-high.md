## Reviewer eval — claude-opus-5-5, effort high

Dataset `evals/reviewer/seed.json` (10 items) · 1 run(s) · prompt `8fefb47fd78d` · 2026-11-19T07:34:11.016Z

| Metric | Result |
|---|---|
| Broken questions caught (any reason) | 100% |
| Caught for the planted reason | 100% |
| Clean questions wrongly failed | 40% |
| Missing verdicts | 0 |
| Cost | $0.1025 (9832 in / 3161 out tokens) |
| Time per call | 30s average |

| Defect type | n | Caught | Right reason |
|---|---|---|---|
| `factual_error` | 1 | 100% | 100% |
| `filler_distractor` | 1 | 100% | 100% |
| `incomplete_explanation` | 1 | 100% | 100% |
| `strawman_explanation` | 1 | 100% | 100% |
| `wrong_key` | 1 | 100% | 100% |
