# The harness overhaul: the "before" table (phase 1, signed)

Alexis signed this table on 2026-11-13 (D13155): eight rows with their targets, two kept as context with no gain to claim
(they do not measure the same thing before and after). The five tasks T1 to T5 are not replayed on the old process (D13156).

Sources: `.claude/tmp/slice-13/overnight/phase1-before.md` (gate-times.log since 2026-11-04: 809 real runs, 9,299 rows),
`.claude/tmp/slice-13/reports/process-global.md`, `.claude/tmp/slice-13/reports/harness-before.md`, GitHub's Actions page
(read the night of 2026-11-13), and the core's share counted by day over `overnight/scripts/core_share.py`'s definitions.
Those files are not tracked; the numbers below are the record.

## The rows and their targets

| Measure | Before (evidence) | Target |
|---|---|---|
| A ping-pong commit's gate | staged mode since 11-07: median 45 s, p90 217 s; fast mode (Claude's commit with tests) median 176.6 s, p90 249.8 s (phase1-before.md 1.1) | the secrets scan and the format, under 10 s; related tests in the background, never blocking |
| Vitest's share of the gate | 33.1 % of all step time; the longest lane in 69.8 % of fast and 59.1 % of staged runs (1.3) | out of the commit's path: related tests in the background, the whole suite in CI shards |
| A merge check | merge mode, longest lane only (a lower bound): median 439 s, p90 1,152 s, n=14 (1.1) | the required check on GitHub: 15 min of wall clock at most, jobs in parallel |
| A piece of work, written to main | median 42 h; 33 to 126 h (the final page; process-global.md) | the same day |
| Alexis's gestures to close a branch | 17 (counted 2026-11-13) | "pose", plus an approval when the core changes |
| GitHub's CI | 32 runs of gate.yml, none green: 21 failed and 4 cancelled of the 25 shown. On main, "The full gate" step failed after 41 to 57 min (runs #31, #32); #31's annotation: a Vitest timeout at 5,000 ms in src/features/chat/Lines.test.tsx:109 (compiled); #23 cancelled at 3 h 0 min 58 s (timeout-minutes 180). Main's runs are never cancelled by a push (gate.yml:13), so cancel-in-progress explains the branch runs' cancels only | green on Linux, every job 15 min at most; a slow-runner timeout is a flaky test to repair, with one noted retry meanwhile |
| The core's share | commits since 11-04: 6.6 % (narrow list) to 8.5 % (wide); merges since 10-20: 71 to 77 %; days since 11-04 with a commit on main touching it: 6 of 8 (narrow and wide alike) | measured again after phase 3; most hits are deploy/ (245 commit-file touches), scripts/ (129), .claude/ (78), app/*.config.ts (64): the security reviewer's recheck of the core's list (phase 3) decides whether app/*.config.ts stays in it |
| The harness's scripts | 19,391 lines | about 9,400 (D13145) |

## Context, with no gain to claim

These two rows are kept to show the change, never as a "before and after": each side measures something else.

| Measure | Before | After | Why it is no comparison |
|---|---|---|---|
| The ritual of a part | 2.9 h active, median of 64 parts, the work included (process-global.md) | a PR's checks: 30 min at most | the work is inside the 2.9 h, not inside the 30 min; the pose's own time is measured in phase 4 |
| Actions cost | about 66 billed min a PR, an estimate for a private repository (phase1-before.md 3) | 0: standard runners are free on a public repository (D13139) | the repository has been public all along: the "before" is a cost it never paid |

## The five tasks (D13156)

Not replayed. The log ties no run to a commit (no hash): T2 (`d8cd162c`) and T5 (`889f7d1c`) are ambiguous, T3
(`07365ef1`) predates the log, T4's docs-only gate (`3e2bfeb1`) wrote no row, and only T1 (`02d07637`) has a plausible
row: fast mode, longest lane 36 s (phase1-before.md 4). Four of the five no longer reverse cleanly on a7c06153 (checked
2026-11-13 with `git apply --check -R`; only T3 does), so a replay would mend each by hand, then spend hours of gate and agent
time on a process being retired.

At phase 3's exit the five tasks are measured once on the new process, and judged against this table's medians. That is
weaker than CLAUDE.md's rule for a speed claim (the same work before and after, both numbers shown): the claim then reads
"a commit's gate, median of the old runs against the five tasks' new times", never "the same task, before and after".
