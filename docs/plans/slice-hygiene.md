# The hygiene slice

From D13170 (no backlog row: the decision is the row), with D13169, D13171, D13192 and D13194. 3,460 tracked files today.

## 1. Done when
- D13170, word for word: "a review of every file, fanned out; out goes what is unsafe for web3, compromising or reads as recording
  anything, dead code and dead tests, old things no longer used, and every comment that tells a phase, a plan, a pull request or a
  slice instead of its subject (the history stays in git and docs/decisions.md); the README describes the product and its use, no
  past plan; the result simple, clean, best practice, readable by a human who arrives, written by no AI style."
- Nothing is deleted before two independent checks agree it is unused: a static one (the language server's references, knip, a
  grep of every name and path) and a separate one (another agent's read, or the suites run without it).
- Comments keep the why alone: no date, name, F or D number, slice, part or pull request. No name suggests recording or keeping
  sensitive data. A README in each main folder (`app`, `server`, `packages/*`, `jarvis`, `link-reader`, `gno`, `deploy`).
- D13169: `app/recording/` and `app/src/lib/adena/record.ts`, `saveGuard.ts` gone; their tests read invented values;
  gitleaks-private refuses a recorded Adena answer.
- D13192: harness_mutate's `--changed`, cache and `suite_parts.py` gone; the project settings' 131 denies on gone folders gone; the
  fold check written once; knip clean per package (not `gno/`, not Jarvis's harness: D13153).
- D13194: the red team's attack tests 16 to 23 pass. F13210 to F13214 closed (the deploy flag on the images' sources, CLAUDE.md in
  the harness list, a PATH or GIT_EXEC_PATH prefix before a push, tag messages and merge content scanned).
- D13171: the hosting decided; the demo profile, its runbook steps and `deploy/test.sh`'s demo checks out once two checks agree.
- Every pull request green on GitHub's gate on its first push; main green at the end.

## 2. Out of scope
The automatic deploy and previews (D13172, the part after this one); any product feature or change of behaviour; git's history
(D13169: never rewritten); `docs/prototype/` (the frozen reference); `docs/plans/` and the registers (history, kept as written).

## 3. Threat model
- **A deletion that switches off a guard nobody tests:** the double check, the whole gate, `harness_mutate` and probe.py on every
  harness pull request; a deleted test declared on a `Removed-test:` line or GitHub's regressions job fails.
- **A comment rewrite that drops a security reason** (why a check exists): the security reviewer reads every tier-1 and harness
  pull request; a comment's why is kept, only its history goes.
- **Recorded wallet data** (D13169): the new gitleaks-private rule, planted with a recorded answer in `test_hooks.sh`, must refuse.
- **A dependency removed on knip's word** (`@hono/zod-validator`): asked first (CLAUDE.md), its use grepped, the suites run.

## 4. Cost
No hot path added; deletions only lower it. The review's cost: about 3,460 files read once by Opus agents, four at once at most.

## 5. Scale
The agents' count is the limit (4 at once, CLAUDE.md): batches by folder, each agent a folder of a few hundred files at most.

## 6. Tests, by level
- Every pull request: the whole gate (no new behaviour, so no new test but the guards' below).
- New guards with their planted faults and mutants: the gitleaks-private Adena rule; the guard's refusal of a PATH or
  GIT_EXEC_PATH prefix before a push; pre-push reading tag messages and merge content; the deploy flag on the images' sources.
- Attack tests 16 to 23 (`.claude/tmp/slice-13/reports/plan-review-2.md`) written into `test_hooks.sh`.

## 7. Files and branches
Tier-1 files touched: `app/src/lib/adena/`, `deploy/`, the harness (`scripts/`, `.githooks/`, `.github/`, `.claude/`).
1. **hygiene-adena** (tier 1, D13169): tests first (invented answers), the red pass, the security review.
2. **hygiene-harness** (the harness's leftovers, F13210 to F13214, attack tests 16 to 23): tests first, the red pass, the security review.
3. **hygiene-review** (the fan-out): Opus agents read each folder and report, per file, what to delete (with its static check),
   which comments to rewrite, which names to change, what is unsafe; a second agent checks each deletion. Then one pull request a
   folder or so, about 600 lines each: `packages/*`, `server/`, `link-reader/`, `jarvis/`, `gno/`, `deploy/`, then `app/` in
   several (its 2,059 files), then the docs and READMEs.
4. **hygiene-ops** (D13171): the hosting decision, then the demo profile out.
1 and 2 run side by side, each in its own session and worktree; 3 starts once 1 is merged (it reads the tree without Adena's
recording); 4 last.

## 8. Dependencies to ask for
None added. One possibly removed: `@hono/zod-validator` (server), if the double check finds it unused.

## 9. Questions for Alexis
Answered (D13198, 2026-11-15): the fan-out through the Workflow tool, about 70 Opus agents; Jarvis's code and `evals/` reviewed too;
the hosting a Hetzner VM with the same Compose and Caddy in front.
