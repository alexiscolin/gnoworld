---
description: The review before a merge, cheapest first — the gate and mutations (no tokens), the test audit, then one review pass sized by risk. Never merges.
---

Run the review before merging the current branch (base: $ARGUMENTS, or `main` if empty).
Follow `docs/REVIEW.md` ("AI review before a merge"). Never merge, push, rebase, skip a hook,
or edit a test to make it pass.

1. **No tokens first.** Run `scripts/check.sh`, then the mutation tester on the changed
   files. If the gate fails, stop and report its output. Write the diff to
   `.claude/tmp/diff.patch` and pass agents its path, never its content. Over about 400
   lines, say so and propose a split before reviewing.
2. **The plan.** List the files changed that the slice plan does not name; each gets its
   reason in the review card, or leaves the merge.
3. **The test audit.** Launch the `test-auditor` agent for its green pass, with the diff
   path and the surviving mutants. If it reports findings, stop: list them and wait.
4. **One review pass, sized by risk:**
   - always: Claude Code's `/code-review` on the range;
   - a tier-1 file (`docs/REVIEW.md`): also the `security-reviewer` agent (Opus);
   - the last merge of a slice with tier-1 code: propose to Alexis that he runs
     `/code-review ultra` (a deeper review in the cloud, billed per run; Claude cannot start it);
   - the last merge of a slice: `/simplify` on the slice's changes, then the gate again.
5. **Check each finding** against the code before fixing it; drop a false positive with its
   reason. Fixes are re-checked by the gate and the mutation tester, not by a new pass. A
   second pass runs only for a high finding fixed in a tier-1 file, and only that lens.
6. **Report** to Alexis, in French:
   - the review card of `CLAUDE.md` (in the first slices, only its items 1–3 and 7, and the
     findings held back until Alexis has reviewed, per "Blind first");
   - the findings, most severe first, each with its scenario;
   - what was dropped as a false positive, in one line each.
7. **Log.** Append to `docs/review-log.md`: the date, the branch, each finding with its lens
   and outcome (fixed, put to Alexis, false positive), and what Alexis caught that the
   agents missed. A miss seen twice becomes a proposed rule, lint or test; a lens whose
   findings are mostly dropped over five slices is narrowed or removed.
