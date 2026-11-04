---
description: The review before a merge, cheapest first — the merge's gate and mutations (no tokens), then one combined review agent, sized up by risk. Never merges.
---

Run the review before merging the current branch (base: $ARGUMENTS, or `main` if empty).
Follow `docs/REVIEW.md` ("AI review before a merge"). Never merge, push, rebase, skip a hook,
or edit a test to make it pass. Claude runs every step itself, through the real commands and
agents, in this order; it never hands a step to Alexis, and never stands in for a command.
A branch's Workflow `branch` (`.claude/workflows/branch.js`) runs steps 1, 3, 4 and 5 and returns its low findings, the
lines that loosen the net and its tokens; the branch session then runs steps 2 and 6 to 9. The chief session runs them all
on the slice's last merge.

1. **No tokens first.** Run `scripts/check.sh --merge` (the full gate's lanes, with the harness
   mutants of the guard files the branch changed). If it fails, run the failing lane alone, fix,
   and run it again; stop and report if it still fails. Read `.claude/tmp/unsteady.log` (test files
   the fast gate ran twice: failed once, then passed; docs/HARNESS.md): a file that passed on its
   second run is no ledger row, one named again and again is a test to fix; then delete the log. Write the diff to `.claude/tmp/diff.patch` and pass
   agents its path, never its content. Past the size `docs/REVIEW.md` allows (about 400 lines of
   product code with a tier-1 file, 600 otherwise), say so and propose a split before reviewing.
   A branch that changes `deploy/` also runs semgrep's Dockerfile and Compose rules
   (`p/dockerfile`, `p/docker-compose`).
2. **The plan.** List the files changed that the slice plan does not name; each gets its reason
   in the review card, or leaves the merge.
3. **One combined review.** Launch the `reviewer` agent with the diff path, the surviving mutants
   and the ids of the ledger's rows that name its files (grep them; no agent reads the ledger whole).
   It reads the code once, and the screens it changes with the video's frames: the tests' green pass
   on StrykerJS's survivors (no hand-written mutant where StrykerJS runs), correctness, security, cost
   and simplification, in one table. A tier-1 file or the harness (`docs/REVIEW.md`) adds the
   `security-reviewer` agent, a realm the `gno-auditor`, a change of how space looks (the scene, the
   planets, the cosmos) the `design-reviewer`, in the same message; nothing else adds a lens but the
   `reviewer` asking for the `design-reviewer`. Two review lots at most: a part too large for them is
   split, not reviewed in more. The last merge of a slice with tier-1 code: propose
   `/code-review ultra` to Alexis (billed per run; Claude cannot start it).
4. **Reproduce.** Reproduce each finding yourself: a command, or a test seen failing (no agent
   verifies the reviewers' findings since 2026-11-04). Write every finding to `docs/review/findings.md` with its status and evidence:
   `fixed` with its commit, `rejected`, `intended`, `moot` or `asked`, each with its reason; one
   nobody reproduced stays `claimed`.
5. **Fix high and medium.** Each test first, its commit body naming its finding (`Finding: F012`).
   Low findings, and any finding beyond the plan, go to one list for Alexis with a recommendation
   (fix now, a backlog row, or moot), never to a fixer by default. A fixer's tests get no red pass:
   the gate and the mutation tester re-check them. A second review round runs only for a high
   finding fixed in a tier-1 file, and only its lens, on the diff since the first; the
   `design-reviewer` runs again only on the screens of a high finding of its own that a fix changed.
   A fourth round does not run: stop and reconsider with Alexis.
6. **The operator's tests.** Every branch asks Alexis once, after every fix is committed, for
   `deploy/test.sh` on the host (and its `--mutants` for a branch that changes `deploy/`), run in the
   background while the review goes on; never in between. An app change alone broke the web image
   in slice 4, found days later at the slice's end (F2133-F2136).
7. **Report** to Alexis, in French: the review card of `CLAUDE.md` (in the first slices, its
   items 1–3, 7 and 8 only, the findings held back until he has reviewed, per "Blind first");
   the findings, most severe first, each with its scenario and its tag (important, nit, or
   pre-existing: in the code before the branch); the low list; what was dropped, one line each.
8. **Record the pass.** On the final committed code, run `scripts/check.sh --merge`; on the
   slice's last merge, the tip pushed to `main`, `scripts/check.sh --full` instead (pushing `main`
   wants its record). Then `python3 -I scripts/review_pass.py record HEAD "<the agents that ran>"`.
   Without both, the pre-push hook refuses `main`.
9. **Log.** Append to `docs/review-log.md`: the date, the branch, its rounds, each finding with its
   agent and outcome, the tokens and hours the branch took, and what Alexis caught that the agents
   missed. Commit it with `docs/review-passes.txt`, with a line `Harness-changed: <path> - why` for
   each harness file the branch changes (`git diff --name-only main...HEAD` against `harness` in
   `.githooks/records.sh`): pushing `main` is refused without them. That commit keeps the pass valid.
