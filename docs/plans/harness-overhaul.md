# The harness overhaul (slice 13)

The design: the final page (claude.ai/artifact/AkkvNY33kRnmB4fhNDR38V, v24) and Alexis's decisions D13137-D13153
(`docs/decisions.md`); background in `.claude/tmp/slice-13/reports/` (plan-review-2.md: the 23 attack tests) and `overnight/`.

## 1. Done when
- Ping-pong: a commit's gate is the secrets scan and the format, in seconds; the related tests run in the background.
- "pose" lands only what Alexis named, as PRs of about 600 product lines, each through 30 min of checks at most.
- GitHub judges main: one required check (`gate-ok`) over parallel jobs of 15 min at most; deploy/test.sh when deploy/ changes,
  with its own budget, required and failing closed until its two Linux reds are fixed (D13161, F13163); green PRs merge alone;
  a core change waits for an admin's approval; break-glass written and tested.
- The agent's own account (write, no admin) pushes agent/** through a core helper whose token no session reads.
- The night on GitHub: full Stryker, every journey, the harness's self-tests, the history scan; a night red goes first.
- Attack tests 1 to 23 pass, and they are the harness's own tests (plan-review-3.md: no second system beside them).
- scripts/ about half its 19,391 lines; guard.py at its vital bans; check.sh cut; CLAUDE.md about 3 KB; no relic.
- Registers frozen; docs/decisions/, docs/findings/open/ and docs/log/ in use; the dream due weekly, run alone.
- The cleanup: knip clean per package (not gno/, not Jarvis: D13153), a README per main folder, comments; screen unchanged.
- The five tasks (T1 to T5), measured once on the new process, faster than the "before" table's medians, with the same
  protections (not replayed before: D13156, `docs/plans/harness-overhaul-before.md`); the docs and docs/harness.png
  describe what exists, never a step before it exists.

## 2. Out of scope
Agents in CI, a private preview, error reports, flags, TS 7, Oxlint, DORA, a pose started from the cloud (later, if a
measure asks). The company repository (D13139: settings written as files, redone there). Jarvis's harness (D13153).
Product features; deploy/demo.sh waits for the new circuit (D13151).

## 3. Threat model
Assets: main; the core (what judges, what runs outside the sandbox, deploy/, the dependencies, Claude's settings and
rules); Alexis's keys (gno key stores, GitHub, the workshop's OpenAI key); the deploy. Entry points: a session's mistake or
injected text; a PR from another account (the repository is public: forks); a workflow file; a dependency.
- The agent weakens its judge: the core enters only by an admin's approval (CODEOWNERS read from the base); path
  detection and the regression net run from the base commit. Attack tests 4, 9-12.
- The agent reaches main or the settings: its own account without admin, a ruleset; tests 1-3, 6.
- A fork PR steals a secret or writes: `pull_request` only, never `pull_request_target`; zizmor (D13144); tests 7, 13-14.
  The evals that call a paid model run at night or by hand, never on a fork's code.
- A local escape (F13138): the user-level patch now (phase 0); in phase 3 hooks run main's copy and a walk test fails on any
  unprotected callee of a hook, an excludedCommand or a script Alexis runs; tests 17-18.
- An irreversible tool: the pose session in dontAsk, gno_addpkg, gno_call, gno_run, gno_key_send, gno_cla_sign and a push
  to main denied; deploy takes only origin/main; tests 19, 22.
- Injected text (workshop chat, a PR comment, a README in node_modules, a fetched page): four fixtures; test 20.
- Key stores and ~/.claude.json unreadable, the workshop's environment an allowlist; tests 21, 23.

## 4. Cost
The repository is public: standard runners are free, with 4 CPUs (D13139), so the budget is time: the required check 15 min
of wall clock, a PR 30 min, a ping-pong commit seconds. Agents: one review per pose (+ security, + gno audit when needed);
the deep review before each deploy, every ~2,000 merged lines, at least weekly (D13148).

## 5. Scale
First limit: flaky tests under a required check (31 files, 174 reruns noted; a 5 s Vitest timeout already failed GitHub's
run #31): one noted retry, never for a security test, each repaired. Next: deploy/test.sh on a hosted runner (never run).

## 6. Tests
- Each attack test is written failing first (tier-1 and harness keep test first and the red pass: D13138).
- A guard removed: its fault planted, what still catches it seen, the removal declared (`Removed-test:`).
- No product test deleted, but dead code's, with that code, declared. Each logic test of a pose must fail on the code
  before it (prove_fix.py's idea, checked in CI).

## 7. Phases
0. Now: Alexis applies `.claude/tmp/slice-13/f13138-user-settings.patch` to ~/.claude/settings.json; proven by an Edit
   refused on a worktree's scripts/workshop.sh.
1. Measure (~2 days), branch `harness-overhaul` (worktree ~/Server/gnoworld-wt/harness-overhaul). First commit: this plan,
   D13137-D13154, F13138, F13134 fixed, decisions.md's line 1. The "before" table (`docs/plans/harness-overhaul-before.md`,
   drafted the night of 11-13 with the core's share by day and the Actions history: 32 runs, none green, the full gate
   failing red on Linux), signed with two rows as context (D13155); T1-T5 not replayed, measured once at phase 3's exit
   (D13156); the dream (D13150). Exit: Alexis signs the table (done, 2026-11-13).
2. GitHub judges main (4-6 days): the push helper (tools/agent-github, in Alexis's name: D13163, D13164); gate.yml split into
   jobs (`pull_request`, push on main, workflow_dispatch), `gate-ok`, zizmor, green on Linux, no pictures; nightly.yml. No
   ruleset and no agent account (D13164): Alexis merges on GitHub once gate-ok is green. Exit: the red team's tests 1-15 that
   do not rest on a ruleset.
3. Delete and lock (3-4 days): the deletion map's order (mind check_docs.py importing speeds.py, guard.py parsing
   records.sh); check.sh cut; guard.py to its vital bans; CLAUDE.md and the rules (overnight/docs/rules-diff.md);
   the registers frozen; hooks on main's copy, key stores unreadable, the workshop's env an allowlist; dream_due.sh weekly.
   The security reviewer rechecks the core's list first. Exit: tests 16-23; T1-T5 measured, faster than the table's medians.
4. The pose and the cleanup (~3 days): /pose; knip per package; READMEs (overnight/readmes/); comments; the stale
   worktrees (15) and branches (133); the docs and docs/harness.png (overnight/harness-proposed.png). Exit: a day of
   ping-pong landed as several PRs, each in 30 min at most.
Until the ruleset is on, the branch reaches main through today's way (/pre-merge, Alexis's merge and push).

## 8. Dependencies to ask for
zizmor (approved, D13144): 1.32.0, released 2026-11-02 (PyPI, read 2026-11-13), installed by its wheel's hash. Each removal knip proposes: asked.
## 9. Questions for Alexis
The "before" table and its targets (phase 1's exit); the agent account's name and address (phase 2); branches or
worktrees holding unmerged work (phase 4).
