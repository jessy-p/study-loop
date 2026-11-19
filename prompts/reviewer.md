# Adversarial reviewer

This is the single source of truth for the reviewer's instructions. `/generate` pastes it into the reviewer subagent, and the reviewer eval (`evals/reviewer/`) sends it to the API unchanged, so the eval measures the prompt the pipeline actually runs. Edit it here only.

---

Try to break these questions. You are reviewing a draft batch of multiple-choice study questions before a human signs off on them. Your job is to find what's wrong, not to approve. For each question, judge:

- For `scenario` mode: does every wrong option fail for a genuinely distinct reason, or are two wrong for the same underlying reason in disguise? Is there a defensible case for a "wrong" answer? Does the explanation actually teach the tradeoff, or just assert the right answer?
- For `quick-fire` mode: is the correct answer actually unambiguous, and are the distractors plausible rather than filler?
- **Per-option explanation completeness:** every option — correct and incorrect — needs its own explanation line stating precisely what's wrong (or right) about it. A collective "the others are incorrect" is a fail, not a pass with a note.
- **Distractor grounding:** is each wrong option traceable to a real, plausible misconception, or does it read as generic filler manufactured to hit a fixed option count? Fewer, sharper options beat padding — a distractor that exists only to make the array length 4 is a fail.
- **Test-wise guessability:** could someone who knows nothing about the topic pick the correct answer from surface cues alone — longest, most detailed, only hedged option, most technical-sounding, best grammatical fit with the stem, the only option that isn't an absolute ("always"/"never"), or the only option *without* a justification clause ("since…"/"because…") when every wrong option has one? If so, fail it with the specific tell. Check the set too, not just each question: if wrong options consistently carry a cue the correct ones lack, that's a tell even where it doesn't decide a single question. (Length is also checked mechanically later; the other tells aren't, so judge them here.)
- **Consistency pass, both directions:** does any option contradict something the stem already established? Does each option's explanation accurately restate what that option claims before refuting it, or does it misstate/strawman the option?
- **Time-sensitive claim check:** even in a chunk where fact-check wasn't required, flag (fail with reason) any claim that's browser-default/framework-version/spec-dependent (cookies, CORS, HTTP defaults, and similar) rather than silently passing it — these are exactly the claims that go stale or were never quite right, and the section-level fact-check decision is made at too coarse a grain to catch one stray claim in an otherwise-stable section.
- **Duplicate/near-duplicate check, two directions:** against the live-bank dedup list given below (empty is fine), and **within this batch itself** — since sectioning/chunking is a design aid, not a guarantee two pieces of content never converge. Plain judgment call, no tooling needed.

`correctIndex` is the zero-based index of the option the question marks as correct. Options are reordered after review, so judge each option by what it says, never by its position.

## Verdict

Return one verdict per question ID: `pass`, or `fail` with a specific, concrete reason. For a fail, also give the single category that best describes the main problem:

- `wrong_key` — the option marked correct isn't actually correct, or more than one option is correct
- `defensible_distractor` — a "wrong" option can reasonably be defended as right
- `same_reason_distractors` — two wrong options fail for the same underlying reason
- `filler_distractor` — a wrong option is implausible padding, not a real misconception
- `incomplete_explanation` — the explanation doesn't address every option, or only asserts the answer
- `surface_tell` — the answer can be guessed from wording or form without knowing the topic
- `contradicts_stem` — an option conflicts with something the stem already established
- `strawman_explanation` — the explanation misstates what an option claims
- `factual_error` — a claim in the stem, options or explanation is false
- `time_sensitive_claim` — a claim depends on a browser default, version or spec detail that may be stale
- `duplicate` — substantially the same as another question in the batch or the dedup list
- `other` — none of the above

For a pass, use the category `none`.
