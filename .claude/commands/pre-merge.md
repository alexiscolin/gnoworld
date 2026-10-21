---
description: The review before a merge, cheapest first — the gate and mutations (no tokens), the test audit, /simplify, then every review lens Claude Code has, sized up by risk. Never merges.
---

Run the review before merging the current branch (base: $ARGUMENTS, or `main` if empty).
Follow `docs/REVIEW.md` ("AI review before a merge"). Never merge, push, rebase, skip a hook,
or edit a test to make it pass. Claude runs every step itself, through the real commands and
agents, in this order; it never hands a step to Alexis, and never stands in for a command.
A branch that changes `deploy/` also runs semgrep's Dockerfile and Compose rules
(`p/dockerfile`, `p/docker-compose`) in step 1, and the operator's own tests on the host
(`deploy/test.sh`, then its `--mutants`). Those are asked for once, after every fix of steps 4
to 6 is committed, never in between: each run costs him its whole length.

1. **No tokens first.** Run `scripts/check.sh --full`: the gate, the probe, coverage and patch coverage, the proof of each fix, mutations, secrets. If the gate fails, stop and report its output. Write the diff to
   `.claude/tmp/diff.patch` and pass agents its path, never its content. Over about 400
   lines of product code, say so and propose a split before reviewing.
2. **The plan.** List the files changed that the slice plan does not name; each gets its
   reason in the review card, or leaves the merge.
3. **The test audit.** Launch the `test-auditor` agent for its green pass, with the diff
   path and the surviving mutants. If it reports findings, stop: list them and wait.
4. **Simplify.** Run `/simplify`'s altitude and simplification angles on the range, two agents
   in parallel with its own briefs; add its efficiency angle for a slice with a hot path (the 3D,
   the chat); its reuse angle no more (docs/decisions.md, 2026-10-21). A follow-up merge of fixes
   (2f, 2g) runs the altitude angle alone. Apply their fixes (each in
   its own commit, a refactor apart), note what they skip and why, then run the full gate again.
   The reviews below read the code as it will merge.
5. **Every review lens, sized up by risk.** Count the branch's review rounds first (its rows in
   `docs/review-passes.txt` and `docs/review-log.md`). The first round reads the range; any later
   one reads only the diff since the last round. A fourth round does not run: stop, report, and
   reconsider the approach with Alexis before any more code. Launch these together:
   - always: Claude Code's `/code-review`; tell it the ledger's open and fixed findings for the
     files it reads, so none is raised again;
   - a tier-1 file or the harness (`scripts/`, `.githooks/`, `.claude/`, `.github/`, the tools'
     configs): also `/security-review`, told the ledger as `/code-review` is;
   - always: the `complexity-reviewer` agent, the cost in big O of each loop the range adds;
   - a tier-1 file (`docs/REVIEW.md`): also the `security-reviewer` agent (Opus), which reads
     the project's threat model, and, for a realm, the `gno-auditor`;
   - the last merge of a slice with tier-1 code: propose to Alexis that he runs
     `/code-review ultra` (a deeper review in the cloud, billed per run; Claude cannot start it);
   - the true last merge of a slice: also `/code-review` on each workspace the slice touched, as
     a path, so it reads the whole folder and not only the diff, with the export map; once per
     slice, a follow-up merge of fixes reading only its range.
   Ask every agent and lens for a short report: its findings, one row each with its evidence,
   no summary of the diff.
   A finding names its class, the kind of bug, and its fix covers every instance of the class,
   not the one line. A finding only about style, diagnostics or cleanup is dropped: `/simplify`
   owns those.
   A finding beyond the plan (its "done when" and threat model) that is not high is verified
   and recorded like any other, then put to Alexis with a recommendation, fix now or a backlog
   row, instead of being fixed by default.
6. **Verify, then reproduce each finding** before fixing it. For each tier-1 lot (the harness,
   a realm, a security path), give its findings to the `finding-verifier` agent (Opus), which
   tries to refute each one, then to reproduce it, and rates it again; a `refuted` finding is
   `rejected` with its evidence. Then reproduce what is left yourself: the command, or a test
   seen failing. Write every
   finding to `docs/review/findings.md` with its status and evidence: `fixed` with its commit,
   `rejected` (it is wrong), `intended` (the behaviour is wanted) or `moot` (true, and it does not
   matter), each with its reason; a finding nobody reproduced stays `claimed`. A fix's commit body names
   its finding (`Finding: F012`). Fixes are re-checked by the gate and the mutation tester, not by a new pass. A
   second pass runs only for a high finding fixed in a tier-1 file, and only that lens.
7. **Report** to Alexis, in French:
   - the review card of `CLAUDE.md` (in the first slices, only its items 1–3 and 7, and the
     findings held back until Alexis has reviewed, per "Blind first");
   - the findings, most severe first, each with its scenario;
   - what was dropped as a false positive, in one line each.
8. **Record the pass.** Once every finding is fixed or put to Alexis, run `scripts/check.sh
   --full` once more on the final, committed code: pushing `main` wants that code's full-gate
   record (F076). Then run `python3 -I scripts/review_pass.py record HEAD "<the lenses that ran>"`.
   Without both, the pre-push hook refuses `main`.
9. **Log.** Append to `docs/review-log.md`: the date, the branch, the rounds it took to pass,
   each finding with its lens and outcome (fixed, wrong, intended, moot, put to Alexis), and what Alexis caught that the
   agents missed. A miss seen twice becomes a proposed rule, lint or test; a lens whose
   findings are mostly dropped over five slices is narrowed or removed. Commit the log and
   `docs/review-passes.txt` together, with a line `Harness-changed: <path> - why` for each
   harness file the branch changes (`git diff --name-only main...HEAD` against the list of
   `harness` in `.githooks/records.sh`): pushing `main` is refused without them. That commit
   keeps the pass valid.
