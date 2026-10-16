---
description: The review before a merge — the gate, the test audit, five fresh-context lenses, verified findings, and the review log. Never merges.
---

Run the review before merging the current branch (base: $ARGUMENTS, or `main` if empty).
Follow `docs/REVIEW.md` ("AI review before a merge"). Never merge, push, rebase, skip a hook,
or edit a test to make it pass.

1. **The gate.** Run `scripts/check.sh`. If it fails, stop and report the failure.
2. **The test audit.** Launch the `test-auditor` agent on the range. If it reports
   findings, stop: list them and wait. Nothing else is reviewed until the tests are sound.
3. **Five lenses, in parallel.** Launch five `reviewer` agents in one message, one lens each:
   correctness, security, performance, accessibility and UX, simplicity.
4. **Verify.** Launch one more `reviewer` agent with every finding, asking it to verify
   each one against the code and drop the false positives, with its reasons.
5. **Report** to Alexis, in French:
   - the review card of `CLAUDE.md` (in the first slices, only its items 1–3 and 7, and the
     findings held back until Alexis has reviewed, per "Blind first");
   - the verified findings, most severe first, each with its scenario;
   - what was dropped as a false positive, in one line each.
6. **Log.** Append to `docs/review-log.md`: the date, the branch, each finding with its lens
   and outcome (fixed, put to Alexis, false positive), and what Alexis caught that the
   agents missed. A miss seen twice becomes a proposed rule, lint or test.
