## Reviewer eval — claude-opus-5-5, effort high

Dataset `evals/reviewer/seed.json` (10 items: 5 broken, 5 clean, 0 borderline) · 3 run(s) · prompt `8fefb47fd78d` · 2026-11-19T07:55:14.336Z

| Metric | Result |
|---|---|
| Broken questions caught (any reason) | 100% |
| Caught for the planted reason | 100% |
| Clean questions wrongly failed | 27% (20%–40%) |
| Missing verdicts | 0 |
| Cost | $0.2996 for 3 run(s) (29496 in / 9083 out tokens) |
| Time per call | 28s average |

| Defect type | n | Caught | Right reason |
|---|---|---|---|
| `factual_error` | 1 | 100% | 100% |
| `filler_distractor` | 1 | 100% | 100% |
| `incomplete_explanation` | 1 | 100% | 100% |
| `strawman_explanation` | 1 | 100% | 100% |
| `wrong_key` | 1 | 100% | 100% |

Ranges show the lowest and highest result across runs.

### Flaky questions (verdict changed between runs)

| Question | Label | Failed in | Reviewer's reasons for failing it |
|---|---|---|---|
| seed-05 (js-0060) | clean | 1 of 3 | run 3: `surface_tell` The stem already says the function is 'pure' and asks 'what property of the function makes it viable'. Only the keyed option answers that second clause, and it does so by echoing 'pure'. A test-wise guesser can pick it from stem-keyword echo and grammatical fit alone. The 'None: only network responses can be cached' option is also weak padding. The explanation's coverage of the distractors is a single lumped sentence. |
