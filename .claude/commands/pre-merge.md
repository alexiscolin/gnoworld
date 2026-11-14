---
description: The review before a merge, cheapest first — check.sh and GitHub's gate (no tokens), then one combined review agent, sized up by risk. Never merges.
---

Run the review before merging the current branch (base: $ARGUMENTS, or `main` if empty).
Follow `docs/REVIEW.md` ("AI review before a merge"). Never merge, push, rebase, skip a hook,
or edit a test to make it pass. Claude runs every step itself, through the real commands and
agents, in this order; it never hands a step to Alexis, and never stands in for a command.
A branch's Workflow `branch` (`.claude/workflows/branch.js`) runs steps 1, 3, 4 and 5 and returns its low findings, the
lines that loosen the net and its tokens; the branch session then runs steps 2 and 6 to 9. The chief session runs them all
on the slice's last merge.

0. **The speed plan (2026-11-06).** One review per slice, at its last merge, not per branch; the `security-reviewer` and `gno-auditor` only on a
   tier-1 or harness change (docs/REVIEW.md); no `finding-verifier`; StrykerJS by hand (`pnpm run mutate`; GitHub's gate runs it on the changed
   tier-1 lines alone, failing on no survivor yet: F13184). Since D13168 GitHub's gate judges the pull request; check.sh is the commit gate.
1. **No tokens first.** Run `sh scripts/check.sh` on the committed tree (Prettier, ESLint, the types, gno and the node, ui and compiled projects' tests
   but the `timing` ones; knip, jscpd, the journeys and the rest are GitHub's), and read
   GitHub's gate on the pull request once it is pushed (`gate-ok`). If one fails, run the failing lane or job's command alone, fix,
   and run it again; stop and report if it still fails. Write the diff to `.claude/tmp/diff.patch` and pass
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
   check.sh and GitHub's gate re-check them. A second review round runs only for a high
   finding fixed in a tier-1 file, and only its lens, on the diff since the first; the
   `design-reviewer` runs again only on the screens of a high finding of its own that a fix changed.
   A fourth round does not run: stop and reconsider with Alexis.
6. **The operator's tests.** Every branch asks Alexis once, after every fix is committed, for
   `deploy/test.sh` on the host (and its `--mutants` for a branch that changes `deploy/`), run in the
   background while the review goes on; never in between. He runs it from a checked copy of the commit
   he reviewed, never from the worktree: hand him `docs/OPERATIONS.md`'s "Run test.sh from the commit
   you reviewed" with that commit's full sha (F4927). An app change alone broke the web image
   in slice 4, found days later at the slice's end (F2133-F2136).
7. **Report** to Alexis, in French: the review card of `CLAUDE.md` (in the first slices, its
   items 1–3, 7 and 8 only, the findings held back until he has reviewed, per "Blind first");
   the findings, most severe first, each with its scenario and its tag (important, nit, or
   pre-existing: in the code before the branch); the low list; what was dropped, one line each.
8. **Record the pass.** On the final committed code, run `sh scripts/check.sh`, then
   `python3 -I scripts/review_pass.py record HEAD "<the agents that ran>"` (until 3b of the overhaul removes the pass, D13164).
9. **Log.** Append to `docs/review-log.md`: the date, the branch, its rounds, each finding with its
   agent and outcome, the tokens and hours the branch took, and what Alexis caught that the agents
   missed. Commit it with `docs/review-passes.txt`, with a line `Harness-changed: <path> - why` for
   each harness file the branch changes (`git diff --name-only main...HEAD` against `harness` in
   `.githooks/records.sh`): pushing `main` is refused without them. That commit keeps the pass valid.
