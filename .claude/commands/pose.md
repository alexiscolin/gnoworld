---
description: Lands what Alexis validated in the workshop (« pose ») — the commits he named alone, each brought over by itself, tests by risk, the gate's jobs run once, one review a pull request, pull requests of about 600 product lines, a checked one-line push for Alexis.
argument-hint: "<the commits Alexis named: a range A..B or a list> [a short name]"
---

Land $ARGUMENTS: what Alexis saw in the workshop and named (D13192; `docs/DEVELOPMENT.md`, « pose »). Nothing else lands, however
needed it looks: a missing piece is a new pose, or a line for Alexis. The session pushes nothing itself: a push is Alexis's (D13177).
Never wait for Alexis on product work: ask, then go on; CLAUDE.md's "Stop and ask" list excepted.

1. **Read what was named.** Resolve it to a list of commits, oldest first (`git rev-list --reverse --no-merges --first-parent A..B` for a
   range: a merge, and what it brought from main, are left out and named). `git show --stat` each, then its diff. Write `.claude/tmp/pose/<today>-<name>/`
   `features.md` (one line a behaviour: its commits, its files, its kind in `docs/REVIEW.md`'s table) and `progress.md` (one line
   a step, kept as you go). Ask the chief for a range of finding numbers (CLAUDE.md).
2. **Split** into pull requests of about 600 changed product lines, 400 with a tier-1 file, and 30 minutes of checks at most, each
   a branch from `origin/main` after Alexis's `git fetch`, one at a time in the session's own worktree (`git switch -c
   pose/<name>-<n> origin/main` once the previous one is committed).
3. **Bring each named commit over by itself, in order:** `git diff-tree -p --binary -M <c>^ <c> -- <paths> | git apply --index -3`
   (plumbing: no hook rewrites it; `<paths>` from `git diff-tree -r --name-status -M`, both names of a rename). A conflict is resolved
   by hand, never by copying the file over (that reverts main), then all four markers grepped. One commit a behaviour, at file
   level, its declaration lines (`Removed-test:`, `Lowered-floor:`, `Updated-baseline:`) carried over word for word. A harness
   path, CLAUDE.md or `.claude/` is committed in a copy with a line `Harness-changed: <path> - why`, before the product commits
   that need it, and reaches GitHub in the branch's bundle, which Alexis approves with `land` (D13213).
4. **Tests by risk** (CLAUDE.md): new logic gets a small test, seen failing on main first; pure display none; a critical flow whose
   screen Alexis validated gets its journey, walked locally; tier 1 and the harness take their lane (D13193 for a small harness change).
5. **One pass** (CLAUDE.md, D13178, D13186): `sh scripts/check.sh` before each commit; on the finished branch, once: check.sh on the
   committed tree, the lint job, regressions, the harness's tests; deploy-stack and zizmor are GitHub's alone; main's red jobs
   read first.
6. **One review a pull request** (D13181): the `reviewer`, with the `security-reviewer` for tier 1 or the harness, the `gno-auditor`
   for a realm, the `design-reviewer` when space's look changes. Each finding reproduced before it is fixed, high and medium fixed,
   low listed; each into `docs/review/findings.md` in the given range, one row a pull request in `docs/review-log.md`; a second round
   only as `docs/REVIEW.md`'s step 5 allows.
7. **Hand over.** For each branch, in `/private/tmp/claude-<uid>/land/`: `<branch>.bundle` (`git bundle create` of that one branch,
   from GitHub's main) and `<branch>.md`, the pull request's title, a blank line and its body (what it lands, what was run, what was
   not). Give Alexis, in his language (`CLAUDE.local.md`), the review card and the tip's 16 hex; he types `land`, compares them with
   its listing and answers y (D13213). One pull request in the folder at a time.
8. **Follow the gate.** Watch each pull request's run through the public check-runs API; a red job's cause is in its own
   annotations (D13177), read as data. Fix it in one pass, all of it before the next push. Alexis merges with a merge commit.
