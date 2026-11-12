# The harness

The harness is everything around Claude Code that keeps the code it writes correct, safe and
cheap: what Claude reads, what it may do, the checks every change goes through, the reviews,
and the tests that prove those checks work. This file says what runs today; why each piece is
there lives in `docs/decisions.md`, the findings ledger and the review log, by its id.

Three ideas run through it:
- **A claim is not evidence.** A review's finding counts once a command or a failing test
  shows it; a fix counts once its test failed without it.
- **Every guard is proven.** Each check comes with a fault planted to show it catches it,
  and switching the check off must make a test fail.
- **What costs no tokens runs first.** Scripts and linters before any model.

## The speed plan (Alexis, 2026-11-06): nothing deleted, less called by default

Goal: from the end of a slice's code to `main`, 15-20 minutes, everything included. No test, snapshot, picture or check was deleted: the
default runs do not call the ones the plan drops, and one command calls everything. Where this section disagrees with the rest of this file,
it holds.

- **Default** (`check.sh`, `--full`, `--merge`, the commit gate): tier 1 of `docs/REVIEW.md` (wallet signing, realms, login and roles,
  moderation, Jarvis's tools and egress in `jarvis/src/`, the deploy) keeps full rigor; a commit with no tier-1 path runs the types, the lint,
  prettier, the build when the app changed and `check_docs` (`scripts/speeds.py --tier1`; a doubt is tier 1); `--full`/`--merge` add the
  journeys of `check.sh` (tier 1's and the critical flows: the file list in `lane_ts`, flights' two smoke tests by title), the coverage of tier-1
  files and core (`vitest.config.ts`, the `packages/core/**` floor kept), the secrets' scan, the audit, and, only when a harness file changed,
  the probe, the bench, `test_hooks.sh`, the harness mutants, and the stories (also for `packages/ui`) without their pictures. `--merge` adds
  StrykerJS on the changed tier-1 lines (`stryker.config.json`, now tier 1 only, no TypeScript checker) and records the full gate too.
  No declaration line is asked (`check_regressions.py`, `prove_fix.py`, `batch_size.py`, the `fix` check of commit-msg and pre-commit,
  the Stop hook's gate): they stay as files and are called only under `GNOWORLD_STRICT=1` or `--everything`.
- **On demand**: the Vitest tests the inventory (`.claude/tmp/slice-8/reports/inventory-tests.md`) marks display-only are in the `display` and
  `display_ui` projects of `vitest.config.ts` (`vitest run --project display --project display_ui`); the journeys not in the default list, the
  pictures and compositions specs of the stories, and all snapshot folders stay in the repository.
- **Everything**: `pnpm run test:all` = `sh scripts/check.sh --everything`: the old full gate, every lane: StrykerJS whole
  (`stryker.all.config.json`, `pnpm run mutate:all`), the probe, test_hooks, harness_mutate, the stories and their pictures, every journey, every
  Vitest project with the old coverage floors (`COVERAGE_ALL`), check_regressions, prove_fix, batch_size, the patch's coverage.
  `GNOWORLD_STRICT=1` gives every mode its old behaviour; `scripts/test_hooks.sh` exports it, so its fixtures test the old paths as before.
- **Ship**: `sh scripts/ship.sh` (sandbox) runs the check that fits the change, records the pass, writes the log row and the
  `Harness-changed:` lines, commits docs only, and prints Alexis's merge and push commands.

## The picture

![How the AI works: Alexis's approvals, the chief session and the branch sessions, each branch's Workflow loop, the agents, the gates, the merge and the dream](harness.png)

It shows four loops, one inside the other: a commit through the fast gate, a branch through review and fixes, a slice through the chief's
integration, and the dream back into the rules. Its source is [harness.html](harness.html). After changing it, render the image again from the
repository's root (in Claude Code's sandbox, launch Chromium with `args: ["--single-process"]`):

```sh
node -e 'const { chromium } = require("./app/node_modules/@playwright/test"); chromium.launch({ args: ["--single-process"] }).then(async (b) => { const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 }); await p.goto("file://" + process.cwd() + "/docs/harness.html"); await p.screenshot({ path: "docs/harness.png", fullPage: true }); await b.close(); });'
```

## Who does what

From slice 5 (Alexis, 2026-10-28, `docs/decisions.md`):
- **Alexis** approves each slice's plan, reviews blind first, runs what the
  sandbox refuses (Docker's `deploy/test.sh`, the merge into `main`, the push), and accepts or
  refuses each rule the dream proposes.
- **The chief session**, one per slice, plans it (`/slice-plan`), makes the slice's shared folder
  (`.claude/tmp/slice-<n>/` with `reports/`), cuts it into branches, sizes each before it starts, gives each branch its range of F numbers
  (two branches side by side once took the same ones), makes its worktree and brief, opens its session in a herdr pane through one
  script that alone leaves the sandbox (`~/.claude/skills/herdr-branch/scripts/open.sh`, Alexis, 2026-11-01), merges each finished branch into
  the slice's integration branch, runs the full gate and the slice's last `/pre-merge`, with the `design-reviewer` once more over every 3D view, then the dream.
  In slice 7 alone the parts follow each other with one full verification before the demo: a part runs neither `--merge` nor the Workflow
  (`docs/decisions.md`, `docs/plans/slice-7.md`).
  From 7w3 the worktrees live beside the main checkout, in `~/Server/gnoworld-wt/`, which no part's sandbox writes: the
  chief's session starts with that folder added (`claude --add-dir ~/Server/gnoworld-wt` in the main checkout, or Alexis
  types `/add-dir ~/Server/gnoworld-wt` once in it), for its worktrees and its merges there; never in a settings file,
  which every part's session would read too. Its sandbox writes no folder outside its checkout, the temp folder and the caches, so
  it needs it from the move on, not only once `main` holds the write block (F5324).
- **A branch session**, one per branch, two at most at once, works in its own worktree, made by
  `scripts/worktree.sh` and never by hand (one store of packages, a real `.bin`, F2127), in
  `~/Server/gnoworld-wt/`, where no session's shell writes but its own folder (its file tools still can, F5095), the one root where the script makes or removes a folder
  (`worktree.sh remove`); it writes no other session's worktree, by any tool (F5058). Its
  pipeline is the Workflow `branch` (`.claude/workflows/branch.js`): the failing tests, the red
  pass, the code, the merge check, one combined review, the high and medium fixes, the merge check
  again; it returns its commits, the low findings for Alexis, the lines that loosen the net and its tokens.
  An agent that gives no report blocks it; the harness's and the realms' files bring their reviews
  whatever its arguments say, and so does every tier-1 path of `docs/REVIEW.md`'s table that exists (the relay's auth script,
  the CSP, `deploy/`, `core/markdown`, `lib/adena`, the login of the server and of the client, the server's roles, the worker): the
  table writes each path in backticks, and `scripts/check_docs.py`, which pre-commit runs on every commit, prose alone included, fails
  when the table names one its `TIER1` lacks, or `TIER1` holds one the table does not name (F4928: a commit of the table alone was
  prose, and the `workflow_branch` case that held it never ran). Its argument `base` (`main` when absent) is the branch the
  work is cut from: the merge check's file list, the reviewer's diff and `since` read from it. The merge check
  reports the `survivor: ` lines `check.sh --merge` prints, pass or fail, and the reviewer gets them: StrykerJS's survivors on the
  files the branch changed, one `survivors not listed:` count for the rest, and every harness mutant. With a base the loop runs
  `check.sh --merge --base <base>`, so every lane (batch, fixes, regressions, migrations, patch coverage, harness mutants, product
  or not) measures from the merge-base with it, `origin/main` when absent (F2529, F2531).
  `test_hooks.sh`'s section `workflow_branch` runs it under stubbed globals.
- **Agents** are fresh, briefed from files (never forks), four at most at once, each asked for a
  short report saved to a file. The sessions coordinate through files: the plan,
  `docs/decisions.md`, the ledger, a state file per branch and one shared learnings file.
- **The dream** (`/dream <slice>`, `.claude/commands/dream.md`), at each slice's end, keeps a
  dated copy of the memory, then the `dreamer` agent (read only, no shell) reads the agents' reports, the learnings,
  the review log, the ledger and the handoff (never transcripts) and proposes rule, memory, test
  and check changes, each with its evidence, prevalence and cost, standing on committed rows, and as
  many removals: a rule, a test or a check whose cost what it caught does not repay (Alexis, 2026-11-04). Alexis
  accepts each, reading a memory's full text first; a rule or a check goes on a branch through `merge.sh`.

## A change, from plan to merge

1. **Plan.** `/slice-plan <n>` writes the slice's plan in `docs/plans/`; Alexis approves it.
2. **Tests first.** The failing tests, seen failing; the `test-auditor`'s red pass, once per
   branch, never on a fixer's tests; the commit that brings the tests and their code carries
   `Red-pass: <findings fixed>`.
3. **Code.** Before each Bash command, web fetch or edit, `scripts/guard.py` runs.
4. **End of each turn.** By default the Stop hook only reaps stray processes (below); with `GNOWORLD_STRICT=1`, when code changed, it (`scripts/stop_gate.sh`) stops the turn
   once unless the fast gate, which Claude runs in the sandbox, passed on exactly this tree. The
   hook itself runs nothing from the repository. First, it stops what runs of this project left
   behind, which the sandbox cannot see: a node process naming a folder `gnoworld/` whose parent
   is gone for 30 minutes (2 hours while a gate runs), or a test tool's 3 hours old or more but a
   dev or watch mode, each logged to `~/Library/Logs/gnoworld-reaped.log`, where the sandbox
   cannot write. Its one exception is the ping-pong (`pingpong`; Alexis, 2026-11-04): while
   Alexis's own `pnpm workshop` serves this checkout, the turn ends with no gate (docs/DEVELOPMENT.md,
   "The workshop"). Its sign is one no sandboxed command plants: a shell running this checkout's
   `scripts/workshop.sh` from its folder, its parent alive, that macOS's `sandbox_check` finds in no
   sandbox, read with `/bin/ps`, `/usr/sbin/lsof` and `/usr/bin/python3 -I`; no file of the tree.
   A workshop left running keeps every turn of that checkout gate-free; pre-commit still gates each
   commit.
5. **Each commit.** The git hooks run from `.git/hooks`, installed from `main` with the scripts
   they run, where no merge, checkout or sandboxed command writes: no branch brings its own
   (F129). `commit-msg` holds the subject's form, refuses attribution lines and a `fix` of the
   product with no test and no `No-test:` line, scans the message for secrets, and, in Claude Code's sandbox only, refuses a hidden
   character in it with the staged `scripts/hidden.py`, as pre-commit runs the staged scripts there (F5085, D36). `pre-commit`
   scans what is staged for secrets, then, in Claude Code's sandbox, runs the fast gate on a copy
   of what is staged, scoped to the commit's paths (`GATE_CHANGED`), and records the code it
   passed; a staged code a green `check.sh` run already recorded runs no second gate (the harness
   audit, 2026-11-04). In Alexis's shell it runs no gate: the staged code must be code the sandboxed gate
   recorded green (`.githooks/records.sh`, F076). A harness file (`records.sh`'s list) is committed in his
   Terminal alone: from the sandbox, told by `SANDBOX_RUNTIME` or, that unset, by the hook failing to open
   itself for writing, which the sandbox forbids, pre-commit refuses it (D241). So a harness change reaches
   a branch as a patch Alexis applies in his Terminal, the sandboxed gate passes on it and records it, and
   he commits it there. pre-commit reaches `git commit` and `git merge` alone: cherry-pick, revert, rebase, am
   and git's plumbing (`stash create` then `update-ref`, as F129's `commit-tree`) commit with no hook, so such a
   commit meets its wall later, at pre-push's `Harness-changed:` lines and in `merge.sh`, which shows Alexis
   every harness file before `main` (F129, F153).
6. **A push of a work branch.** `pre-push` wants a gate that passed on its code, nothing
   uncommitted, and scans the history for secrets.
7. **Before a merge.** `/pre-merge` (`docs/REVIEW.md`): `check.sh --merge`, one combined review
   by the `reviewer` agent (with the `security-reviewer` for a tier-1 file or the harness, the
   `gno-auditor` for a realm), each finding reproduced, high and medium fixed,
   low ones listed for Alexis, then a recorded review pass (`scripts/review_pass.py`).
8. **Alexis reviews,** blind first, in revdiff, and runs `deploy/test.sh` once per branch, from a copy of the commit he reviewed
   whose commit and files hash to its name (`docs/OPERATIONS.md`, "Run test.sh from the commit you reviewed"), never from a worktree. It takes a lock per Docker project
   (a folder in `~/.cache/gnoworld-tools` holding its pid): a second run, from another terminal or session, is
   refused while a first holds it; a project a Ctrl+C left up (`gnoworld-demo-mutant-<pid>`) is named with the
   command that removes it. `test_hooks.sh`'s section `deploy_lock` runs it against stubbed Docker.
9. **Merge and push, by Alexis, in his own shell.** Through `.git/hooks/merge.sh`, onto the branch
   checked out (`main`, or a part's), which shows each harness file the merge changes (git
   merge-tree's tree, with HEAD's attributes), with its diff, before git writes it, and refuses
   a harness file in conflict and a non-empty `.git/info/attributes`, `.git/info/grafts` or `.git/shallow`; a merge
   stopped on a conflict outside the harness (the ledgers, every time) it commits itself, with its
   own message, once resolved, on Enter; then it undoes any commit that is not the merge shown
   (its parents, its harness), with `git reset --hard` (it began on a clean tree). Pushing `main` wants
   the hooks installed from it, the full gate recorded green on that code, the committed review
   pass for exactly that tree, and each harness file changed since the remote's `main` declared on
   a line `Harness-changed: <path> - why`. Claude can do neither: the sandbox refuses the merge's
   writes to the harness, and the push asks.
10. **The CI** runs the full gate again on GitHub's machines, for every branch pushed.

## The gate

`scripts/check.sh` runs its steps in lanes side by side. A lane stops at its first failure;
every lane runs to its end; the gate fails when one did, shows its output, and prints each
lane's and step's time. A fast run checks only the areas its change touches against `HEAD`,
untracked files included.

```
fast gate                                              full gate (--full, --merge), after it
  ts     format, knip, jscpd, CSS, comments ─▶ build    probe     probe.py ─▶ the benches, alone
  types  tsc ─▶ ESLint                                   ─▶ stories   core in Chromium ─▶ the stories' journeys
  tests  Ergo's build ─▶ Vitest                             history   the batch's size ─▶ prove_fix
  gno    gno lint, test ─▶ mutate.py ─▶ Go                            ─▶ regressions ─▶ migrations ─▶ gitleaks ─▶ audit
  docs   check_docs, parse ─▶ test_hooks.sh              ─▶ coverage  coverage ─▶ patch coverage
     (the five lanes at once)                               harness   harness_mutate, in 4 worktrees
                                                         ─▶ StrykerJS, alone, on every core
                                                         (the benches in --full alone; nginx in --merge alone)
                                                         (two lanes at once, then two, then one)
```

A failure in the stories or history lane stops the gate before the coverage and harness lanes,
which would take fifteen to twenty minutes to say nothing the fix will not change. When the full
gate fails, run the failing lane alone before running the whole gate again.

| A fast run's change | What runs beside the cheap checks (format, knip, jscpd, CSS, comments, check_docs) | Budget |
|---|---|---|
| `server/src`, `jarvis/src`, `link-reader/src`, `packages/service/src` | tsc, ESLint, the related tests and `main.test.ts` (below) | 30 s |
| the TypeScript of `app/src`, `packages/ui/src` | tsc, ESLint, the related tests, the app's build (below) | 120 s |
| a test of the app (`app/src/*.test.ts(x)`), anything of `app/tests/` (a journey, its helper, a recording) | tsc, ESLint, the related tests; no build | 30 s |
| `packages/core/src`, `packages/chain/src`, `packages/schemas/src`, any other file of `app/src` and `packages/ui/src` (a fixture, a stylesheet), `app/data`, `app/lab`, `app/public` | tsc, ESLint, the related tests (and `main.test.ts` for core's and the schemas' code), the app's build | 120 s |
| `packages/ui/src/tokens.css` | as above, and the tokens story's pictures at their three widths (F1190) | 120 s |
| `gno/` | the gno lane | 30 s |
| anything else (a config, the lockfile, the harness, `deploy/`), no change at all, or a list pre-commit could not give | everything, every test; `test_hooks.sh` only when the change holds what it tests: the harness, a package file, the lockfile (its cases run the real Prettier and Vitest), a config its cases read (`vitest.config.ts`, `app/vitest.compiled.config.ts`, `lint/shared.config.ts`, `.prettierrc.json`, `.gitignore`, `.node-version`, `pnpm-workspace.yaml`, `deploy/test.sh`, `deploy/web/nginx.conf`), a line it cannot place, or nothing at all (the harness audit, 2026-11-04: 99 to 228 s on each of 17 config commits a slice) | 120 s |

**The radical mode's light gate** (Alexis, 2026-11-04, until the hardening slice; `docs/decisions.md`): while git's own hooks folder
holds `radical-mode` reading `on`, a fast run whose change is the interface's alone (`scripts/speeds.py --light`: every path under a
tier-3 folder that docs/REVIEW.md's table names both in the tree and on `origin/main`, and none a tier-1 path of either, so a tier-1 row
the change drops still counts and a tier-3 folder it adds does not yet; the interface alone, F4909's (a)) and
no harness file (records.sh's list, read by git through an index of the run's own) runs the types, the importers' lint, the build with the
first screen's cap and jscpd, and says so; no Vitest, no journey, no Prettier, knip, CSS or comments check, no docs lane. pre-commit's
secrets scan runs on every commit as before. A path of no tier-3 folder (the server, core, lib, the design system's own root, a doc, a
test outside the folders), a tier-1 path or a harness file, the file absent or reading anything else, a table it cannot read,
`--tests-all`, `--merge` and `--full` run the whole gate. Only Alexis switches it, from any checkout: on with
`printf 'on\n' >"$(git rev-parse --git-common-dir)/hooks/radical-mode"`, off with `rm -f "$(git rev-parse --git-common-dir)/hooks/radical-mode"`.
No sandboxed command writes there, and check.sh refuses to run where one could; pre-commit's staged copy reads the mode of the
repository whose packages it borrows, and the paths pre-commit lists from the commit's own index. A tree a light gate recorded stays
recorded once the mode is off.

**The related tests** (Alexis, 2026-11-04: 212 fast gates past their budget in two days, a mean of 141 s, the whole Vitest
suite the slowest step in 210): a commit's Vitest runs only the tests its change asks for, in every area, through Vitest's own
`related` command (`vitest related --run`, with the projects of package.json's `test` script, which must start with `vitest run`;
Vitest 4.1.12 has no `run --related`). `scripts/related.py` gives it the paths: every changed path but prose (a JSON of `app/data` too), whose
importers, at any depth, Vitest finds; `server/src/main.test.ts` for any code of the server, core
or the schemas, as it runs the server as a child process, outside that graph (the server loads core's whole index, 193 of their 216
files); and the code that reads a changed place from disk, found by a grep of `new URL(<place>, import.meta.url)`, of a path written
from the repository's root (`` `packages/ui/src/${file}` ``) and of `join("deploy", ...)`. A place that is a workspace's or the
repository's root, or one built at run time, is a base a later argument completes (a copy of the app to build, a file a helper is
given): it brings its reader for a change of no code, the graph following the code. A place named any other way (`__dirname`,
`process.cwd()`, `import.meta.dirname`, `import.meta.url` outside `new URL(...)`, a resolve, `createRequire`) is refused, file and line,
in a run of the related tests and, as `related.py --check`, in a run of every one: its reads would never bring it back. The staged
copy of pre-commit gets the related tests too, from its list (the command, given the paths, needs no git). The whole suite runs when
the change holds a path no area places, when nothing changed, at a part's end (`check.sh --tests-all`, the fast gate with every test of
its projects, before its report; the slow project and core's in Chromium wait for the merge check) and in the merge check and `--full`.

**The timing tests** (Alexis, 2026-11-04, "Oui, les deux"): a test that reads a clock ("in 100 ms or less", a cost that grows
with its input and not its square) carries Vitest's tag `timing` (`{ tags: ["timing"] }`, defined in vitest.config.ts). The fast
gate leaves those, related, `--tests-all` and a failed file's second run alike (`--tags-filter=!timing`); the merge check and
`--full` run them in the coverage, as every test. Three carry it: rest.test.ts's two search costs (202 times in the worktrees'
unsteady logs) and search.test.ts's square. A behaviour test that failed only on its timeout under load is no clock's: it keeps
its place in every commit's related tests, with a timeout that holds at a load of 80, a minute (main.test.ts's 3k, LineView's
country, Here's two counts, whose waits get 30 s, arrival's seven views and same arrival, cosmos.test.ts's close world,
space.test.ts's shells, useSpace's three, ladder's two past the cap; the chief's reading of the decision, lot 2's R2). So do the
guards against overload (the markdown scanner's linear-in-bytes cases, tier 1; the guards' property tests). Run the tagged alone:
`pnpm exec vitest run --tags-filter=timing`.

**A commit's gate walks no journey** (Alexis, 2026-10-31; harness-c): the speed audit measured 487 and 505 CPU s of Playwright
journeys against 67 to 91 for the rest of a commit's gate, and scoping them to the change (the former journey scoper,
harness-b) still ran 40 of 44 files for 74 % of the app's commits, the app being one import graph. The fast gate now
runs `pnpm run build:app` (React Router's build, 2 to 5 s) for a change a page can load, which still fails on a route or an
import the types do not see, and starts no browser for it; the tokens story's pictures (above) are the one browser run
left at a commit, as they guard a fault that only the merge check found (F1190). `--full` and `--merge` run every journey,
unfiltered, and build the app through Playwright. A journey that fails is therefore found at the merge check: **a session
that writes or changes a journey runs that spec itself before it commits** (`node app/node_modules/@playwright/test/cli.js
test -c app/playwright.config.ts <spec>`), as it runs a test it writes. The measure is in `.claude/tmp/slice-5/reports/slice-5-harness-c-speed.md`.

**Two checks the fast gate runs on a trigger** (harness-b): a commit that touches a test, a bench or an approved picture
(`*.test.ts(x)`, `*.bench.ts(x)`, `*.spec.ts`, gno and Go test files, `*-snapshots/*.png`, `*__screenshots__/*.png`;
deleted or renamed ones too) runs `check_regressions.py` (a renamed test passed the fast gate in 5b and failed only the merge
check); a commit that changes `pnpm-lock.yaml` runs the audit (lighthouse's advisories showed only at the merge check, 5e).
The base of `check_regressions.py` is where the branch left `main` (the merge base with `origin/main`; HEAD with none), so a
`Removed-test:`, `Lowered-floor:` or `Updated-baseline:` line of an earlier commit of the branch lets a later removal
through. The commit that removes the test cannot carry its own line, because its message does not exist yet at pre-commit:
declare it first, on an empty commit if need be. The staged copy has no git, so `.githooks/pre-commit` runs the staged
`check_regressions.py` in the repository (it reads the working tree, not the index: a test staged in part is judged as it is
on disk), and `check.sh` runs it in a repository only. Neither runs in a merge commit, whose full gate follows.
Both pass `--quick` (F2579): the base's listing of Vitest tests and journeys is kept in the tools' cache
(`~/.cache/gnoworld-tools/regressions/`, one file per base commit, which never changes), and whatever the change is, it lists
only the Vitest files it touches (about 3 s for one file, against 33 s for all 6,944 tests, measured by the reviewer); a change
that touches a Playwright spec lists the tree whole, as no listing of the touched files gives a journey's names. The merge check runs without
`--quick`, whole and with no cache. A picture is judged on the tree, not on `base..HEAD` (F2574): its own commit's message does not
exist yet, so its `Updated-baseline:` line goes on an earlier commit too.

**StrykerJS's sandboxes** (harness-b): a run cut short leaves `.stryker-tmp/`, which Vitest's bench project once measured
(5n: Cmd-K at 27 to 41 ms instead of 2 to 4). `vitest.config.ts` leaves `**/.stryker-tmp/**` out of its benches (only a bench
could reach the folder: the projects' includes are anchored at the root), `check.sh --full` empties the folder before
StrykerJS starts (a link of that name is removed, never followed), and `borrow_node_modules.sh` copies nothing of it into
pre-commit's staged copy. That last one is hygiene, not a proven cause of F2414 (the staged copy's lint that once reported
14,683 problems): planted in such a copy, a sandbox's `node_modules` did not make ESLint report anything.

`GATE_BUDGET` may lower the budget, never raise it. A merge commit has none (F2071): the full
gate follows every merge. A run past its budget that passed still passes (Alexis, 2026-10-30:
refusing it made agents run it again and again): it says so and is written, with its time and the
machine's loads (`scripts/load.py`), to `.claude/tmp/unsteady.log`, which `/pre-merge` reads in its
first step and the dream reads (F2070); a log it cannot write fails it. The budget is a measure, not a wall.

A Vitest file that fails in the fast gate (a journey fails only at the merge check) runs once more, alone
(`scripts/unsteady.py`, F1700; neither run of the journeys writes a missing picture, `--update-snapshots=none`, or the
second would pass on what the first wrote, F5625): the gate passes if it passes, and logs the file, its failed
tests and the machine's load to `.claude/tmp/unsteady.log`. It refuses, with nothing run again,
when the report names no failed file or is missing, and when the run had anything a second run
of those files cannot clear (an unhandled error, a file that failed to load, Playwright's own
errors). The log is a record, not a floor: a test that shows in it again and again is a test to
fix. `check.sh` puts the Node `.node-version` pins first on its PATH, and `vitest.config.ts`
refuses another Node (F816).

**Fast** (every turn, every commit, a work branch's push), its steps:

| Step | What it catches |
|---|---|
| Prettier | unformatted code |
| `tsc` | type errors; `core` sees no DOM and no Node, so it cannot reach the network. It builds incrementally, into `TSC_CACHE`: in a repository's fast gate the worktree's `.claude/tmp/tsc`; in pre-commit's staged copy, `--full` and `--merge` a folder of the run's own, gone at its end |
| ESLint, with `@eslint/css` | floating promises, swallowed errors, `any`, an incomplete switch, `eval`, import cycles, size and complexity limits, impure `core` (clock, chance, globals), a test switched off (`.skip`, `.only`, `.todo`, `.fails`), invalid or unlayered CSS, physical properties; in the app, React's hooks and compiler rules, a hand-written `memo`, raw HTML into the DOM, a folder's import against ARCHITECTURE.md's table, the network or storage outside `lib` and `sw`, `console`; the config is `eslint.config.ts` and its parts in `lint/` |
| Vitest, with fast-check | failing tests (the related ones, or every one: above); a test with no assertion; the `compiled` project (`app/vitest.compiled.config.ts`), which counts what a re-render recomputes |
| `scripts/related.py` | a place on disk named in a form its map cannot follow |
| `scripts/lint_scope.py` | the files a commit's ESLint reads: those it changed and every file that imports one at any depth, from the type check's own graph (the `.tsbuildinfo` files package.json's `typecheck` names, never another), in place of package.json's `lint`'s `.`; ESLint keeps no cache, which keys a file on its own text while its typed rules read other files' types. A change of the global scope, a graph it cannot read or a run of it that fails lints the whole repository, as a config, `--tests-all`, `--merge` and `--full` do |
| knip | unused files, exports and dependencies |
| jscpd | copies, renamed ones and near ones |
| `scripts/check_css.py` | CUBE CSS: raw values outside tokens, layout outside compositions, unknown or unused tokens and classes, copied rules |
| `scripts/check_comments.mjs` | long comments, to-do markers, banners, numbered steps, emoji, escape hatches |
| the app's build, at a commit | a route or an import the types do not see; it walks no page |
| the app, in Playwright (the merge check and `--full`) | a page that fails to build, pre-render or hydrate, with the wrong tags, or with an accessibility violation (axe) |
| `gno lint`, `gno test` on `gno/...` | every realm and package |
| `scripts/mutate.py` | a realm guard no test notices when removed, or an operator flipped (`>=` and `>`, `<=` and `<`, `==` and `!=`, `&&` and `||`, `+` and `-`) or an integer shifted by one that none notices, on every line of code; one `gno test` run judges a package's guards and flips together, its time limit 1.5 s a copy and 60 s at least, so a busy machine slows a big package's run without failing it (F5051, D30), and a run still going 60 s past it, where gno's timer, which starts once the copies are loaded, never fired, stopped and failed by name (F5084); a `+`, `-` or number flip that does not compile is dropped and counted, any other mutant that does not compile fails; a `GAPS` key names its file and one mutant; a flip that loops forever fails by name, as no gap can hold it; in that run a filetest runs against the untouched copy, the first of its module in the workspace, so a survivor `GAPS` does not list is judged again alone, in a workspace of its own copy, where its filetests see it, and a gap is not (F5050); gno's output that is no UTF-8 reads as U+FFFD, never as a traceback (F5062) |
| `gofmt`, `go vet`, the seal vectors | Go tools; `gno/r/seal/vectors_test.gno` equals what `go run ./tools/sealvec` prints |
| `scripts/check_docs.py` | a harness doc naming a file that does not exist; a bad ledger row or one citing a missing commit; a known limit the runbook no longer says; a review agent's file missing or without its sentence `Never run a git command that writes the index or the work tree`; CLAUDE.md without the review card's item 8; a hidden character (`scripts/hidden.py`'s table, held to the pinned Node's Unicode: what shows nothing, the zero-width ones, the variation selectors and the tags; the format characters, the bidi controls and the BOM; the line and paragraph separators; an emoji's look selector right after it passes) in any file git tracks or would but an image (a `.png`, `.jpg` or `.webp` that starts with its format's bytes), read as the index holds it, what a commit takes, and as the work tree does where it differs, in a name or a link's target, or in a commit message since the branch left `origin/main`, named by its file, name or commit, line, column and code point, which a file that needs one writes as an escape; a file that is no UTF-8 text (a NUL, UTF-16, a binary of a format `IMAGES` does not name), refused whole from its first such byte (F5053, F5079, F5082, F5083, F5086 to F5089, D31 to D35) |
| `scripts/test_hooks.sh` | the hooks, the guard, the settings' boundary, the CI's promises, the scripts; a harness mutant that no longer finds its text (`harness_mutate.py --dry`); when what it tests changed (above) |

**One merge check at a time.** `check.sh --merge` takes the lock `~/.cache/gnoworld-tools/merge.lock`, a folder holding `pid`,
`worktree` and `since`, shared by every worktree of the machine: five side by side at a load of 25 to 40 on 16 cores failed by load
alone (2026-10-30). It waits for a live holder, printing which worktree holds it and since when, and never refuses; a holder whose pid is
gone (a crash, `kill -9`) leaves no wait, its lock taken over; a waiter that is interrupted frees nothing of another's. The fast gate and
`--full` take none, and the time a run prints leaves the wait out. Each `--merge` appends one line to `~/.cache/gnoworld-tools/merge-waits.log`
(UTC time, worktree, `waited N s`, the worktree that held the lock): the measure to read before anything more is built on the lock (the dream
of 2026-11-01, 4). `check.sh` also sets the soft limit (up or down) of open files to 10240 for its
steps (F2543), saying so when it cannot.

**Two speeds, a merge check only** (`scripts/speeds.py`, slice 7). A change whose every path is on docs/REVIEW.md's tier-3 list (the
backticked folders of that row, named one by one: six feature folders and the design system's component folders; a new folder, `chat/`,
`realms/` and the root files of `packages/ui/src/` are not on it) runs no StrykerJS; the coverage, the patch's coverage, `prove_fix`
and the stories still run. Any path outside that list, any path of a tier-1 row (login, the CSP, chain reads, roles, the worker, realms,
the deploy folder, the harness), a table or a list the script cannot read, a path it cannot place (quoted, absolute, rewritten, a link, not
UTF-8), and a script that fails or prints anything but the word `interface`, run the whole control. `--full`, which `main` requires, is
always whole.

**A failing merge check goes on** (the dream of 2026-11-01, 5): a failed lane, or a bench refused for the load, no longer stops the
coverage and StrykerJS in `--merge`, the first phase's (lint, types, tests, the build, the budget) too, and the patch's coverage, whose lane
fails before StrykerJS's own phase runs (a coverage run that failed leaves no report, and says so); it ends on `FAILED at <first failure>` after saying every lane that failed. `--full` still stops at
the first phase with a failure (C.5, F823). Its coverage runs after the probe and the benches, alone, and before the stories and
`prove_fix` (F3384); a failed Vitest file runs once more, as in the fast gate, but the second run is the whole coverage, so that the
85% and 100% floors are measured on it (a single file cannot meet them). A commit's gate that builds the app also reads the first screen's
budget with the budget spec's tests tagged `@gate` alone (`app/tests/e2e/budgets.spec.ts`, the browser's gzip), and the late chunks'
caps from the built files with no page (`app/tests/e2e/chunks.ts`, Node's gzip, the browser's bytes; Alexis, 2026-11-04): the late
chunks' journeys, which draw the scene on a software GPU to see which chunk a page asks, timed out at a load of 60 and run at the merge
check and in `--full`, each checking that the chunk the page asked is the file weighed.

**Full** (`--full`: the slice's last merge and a push of `main`; `--merge`: each branch's
`/pre-merge`, with the harness mutants of the lines it changed, and without the stories,
the coverage lane and `prove_fix` when nothing but docs, the harness and the linters' configs changed since
`main`) adds:

| Step | What it catches |
|---|---|
| `scripts/probe.py` | a lint rule, selector or check that no longer catches its planted fault; `--full` skips it when nothing at all changed since its last green run (it reads the product's files, `tokens.css`), whose commit it records in `.claude/tmp/green-harness` from `origin/main` alone, and nothing is untracked |
| the benches (`scripts/bench.py`, `app/tests/bench/`; `--full` alone, a slice's end) | a bench over its budget, or one a source names that the report lacks; it first waits, up to 60 s, for the 1-minute load to fall under the machine's cores, prints the load it measured at, and refuses (no verdict) when the load stays up or cannot be read |
| `scripts/check_nginx.py` (`--merge` only, when the app, the packages, `deploy/web/`, the lockfile, the check or its pin changed since the base: the table and the pages are built from the app's data, routes and inline scripts) | nginx refusing the image's config with the build's table (F2459), or a served page answering the bare or another page's policy at its slashed, bare or `index.html` address (F2460); a pinned nginx 1.30.6 from the tools' cache, its checksum checked (`scripts/nginx.sha256`, DEVELOPMENT.md, "The pinned nginx"); a missing binary or build fails, never skips |
| `core_chromium`, the stories' journeys | core's tests on Chromium's engine; the design system's stories |
| `test:compiled` | the compiled project's render counts, run alone |
| coverage | under 85% anywhere, under 100% (95% branches) in `core` |
| `scripts/patch_coverage.py` | under 85% of the changed lines run by a test |
| `scripts/batch_size.py` | a merge's own product code past 600 lines (400 with a tier-1 file) with no `Batch-size:` line |
| `scripts/prove_fix.py` | a fix of the product whose tests did not fail on the commit before it, in any of 3 runs, unless it says why (`No-test: <why>`) or a later commit of the range does (`No-test: <short sha> - <why>`) |
| StrykerJS | a mutant of the TypeScript that no test kills (`checkers: ["typescript"]` stays); it starts from one cache every tree shares, `~/.cache/gnoworld-tools/stryker-incremental.json`, and puts its file back only whole. It runs alone, once every other lane has ended, on every core (Alexis, 2026-11-04; F777's case at 16 workers passed). A merge check gives it the code the branch changed since its base (`scripts/stryker_lines.py`: each changed line widened to its top-level statements, as StrykerJS mutates a node only inside one range; `path:from-to`), so a survivor in code the branch did not touch goes unseen, as those of the files it did not change do; no such line, no StrykerJS; a `stryker_lines.py` that fails, the whole control. `--full` mutates the whole |
| `scripts/check_regressions.py` | the safety net shrinking (next section) |
| `scripts/check_migrations.py` (when `server/src/` or the check changed since the base) | a migration `main` has, edited, moved or removed (F466) |
| gitleaks | a secret anywhere in the history; a path into a home folder or the demo's host |
| `pnpm audit` | a dependency with a known advisory, moderate or worse |
| `scripts/harness_mutate.py` | a guard of the harness that no test notices switched off; over `HARNESS_SHARDS` worktrees (4), each first passing its suites untouched, two such controls at once (F2138); `--changed <base>` (a branch's merge check) judges only the mutants that rewrite a line changed since the last review pass (a change to a suite's section or to a guard file's other lines asks for none) and, when the script itself changed, those it defines anew or otherwise (sections a mutant only gained are no other definition: what S kills, S and T kill; one it lost is), and stops before judging more than 100 left after the cache, the way on being the chief's `check.sh --full`, which judges every one (but when no harness file changed since its last green run, above: the harness audit, 2026-11-04, the mutants took 173 s warm, up to 3,766 s) and which `main` requires, so a test a branch weakens shows there, not on the branch (Alexis, 2026-10-30); a killed mutant whose key holds (its text, its sections, the files they name, the runner; blank lines do not count, comments do, a `#` line in a heredoc being text) comes from a cache of verdicts, a survivor is always judged again |

## The safety net never shrinks quietly

`scripts/check_regressions.py` compares the branch with where it left `main`, and refuses a test
gone (a rename included) or switched to `.fails`; a coverage threshold or the mutation floor
lowered; a known gap added to a mutation check's `GAPS` or an ignore list; a change to
`pnpm-workspace.yaml` outside its packages list; an approved screenshot changed. Each is allowed
only when a commit of the branch says why, on a line of its own: `Removed-test: <test> - why`,
`Lowered-floor: <floor>`, `Lowered-floor: gap <label>`, `Lowered-floor: ignore <file> <entry>`,
`Updated-baseline: <path> - why`. Alexis reads them in review. What a slice itself creates has no
baseline on `main`, so review alone holds it until the slice merges (CR1).

## Reviews and findings

A finding is a claim until it is reproduced: a command, or a test seen failing. Every finding
goes into `docs/review/findings.md` with its status (`claimed`, `reproduced`, `fixed`,
`rejected`, `intended`, `moot`, `asked`) and its evidence; a fixed one names its commit. Reviews
grep the ledger for their diff's paths and ids, never read it whole, so a rejected claim is not
raised again and a fixed one that comes back is a regression. A flaky test that passed on its second
run is no row: `unsteady.log` keeps it.

| Who | When | Model |
|---|---|---|
| `test-auditor` | the red pass: after a branch's failing tests, before code | Sonnet |
| `reviewer` | each branch's `/pre-merge`: the green pass, correctness, security, cost, simplification | Opus |
| `security-reviewer` | a branch touching a tier-1 file or the harness | Opus |
| `design-reviewer` | a branch that changes how space looks (the scene, the planets, the cosmos), or when the reviewer asks; each screen against the approved video's frames | Opus |
| `gno-auditor` | every realm, line by line | gnomcp's |
| `/code-review ultra` | proposed to Alexis at a slice's last merge with tier-1 code | Claude Code's |
| Alexis | every merge, blind first | — |

## The boundary: what Claude may do

`.claude/settings.json`, read when Claude Code starts in this folder or moves into it with `/cd`, and read again
whenever the file changes: Claude Code reloads a changed settings file in the running session, hooks and permissions
included (its settings page, "When edits take effect"). A worktree session reads its own checkout's file, and the main
checkout's local settings (`settings.local.json` in its `.claude/`) when there are some:
- **Deny:** reading `.env`, `deploy/secrets/`, `~/.ssh`, `~/.config/gh`, `~/.npmrc`, `~/.aws`.
- **Ask Alexis first:** only `git push` and every gnomcp write (`gno_addpkg`, `gno_call`,
  `gno_run`, `gno_key_send`, `gno_cla_sign`).
- **Refused outright in the main checkout:** an edit of the harness (the guard, the Stop hook,
  the git hooks, `.git/hooks` and `.git/config`, Claude Code's settings, agents, commands, skills,
  rules, workflows and hooks in `.claude/` but `.claude/tmp/`, the `package.json` files and what pnpm loads,
  `scripts/worktree.sh` and the scripts it runs, which leave the sandbox, every worktree's `.git`, and,
  from any session, the main checkout's `.git/hooks`, `.git/config`, `scripts/` and `.githooks/`), an edit of the
  instructions every session reads (`CLAUDE.md`, `CLAUDE.local.md`, `.claude`'s own `CLAUDE.md`: Alexis's from 7z on),
  `pnpm add` and `rm -rf`. A branch changes the harness in its own worktree, where Alexis sees
  each such file at `merge.sh`; a merge into a part's branch that changes the harness is his too,
  in his terminal, never another session's (F5055, F5058). In his shell the hooks run nothing of
  the repository but the records the sandboxed gate wrote (F076).
- **The sandbox** around shell commands: they write only in the project, its worktrees and its
  caches, never in `.git/hooks` or `.git/config`, nor in a worktree's `.git` or `commondir` under `.git/worktrees` (so a stale worktree is pruned by Alexis: `git worktree prune`, F5095), nor in a harness path of
  `records.sh`'s list but `.claude/`, whose `tmp/` is the slices' shared folder and whose other parts Claude Code
  loads have their bans, a project CLAUDE.md in it included; no ban reaches StrykerJS's copy of the tree in `.stryker-tmp/`,
  which a merge check writes (a `wiring` case, read as the sandbox reads its paths; D242, F111); another
  worktree is no folder of theirs, as every one sits in `~/Server/gnoworld-wt/` (F5058). They reach
  only the npm and Go registries and github.com. One command of the project's settings leaves the
  sandbox, `sh scripts/worktree.sh *` (`excludedCommands`), which writes the trees it makes and
  removes, in its one root; the guard lets it run only alone, its words plain, from the project's
  root, and the file tools can edit neither it, nor the scripts it runs, nor a worktree's `.git`.
- **Every worktree's closed files, to every session** (7z, F4890 to F4892). A relative rule guards the session's own tree alone,
  and every worktree lives in the temp folder every command may write, so each closed path has twins: each relative `denyWrite`
  entry again under `/private/tmp/claude-501/gnoworld-wt/*/`, each relative `Read` and `Edit` deny again there by both spellings
  of the temp folder (`//private/tmp/…` and `//tmp/…`, a link the file tools may not follow) and in the main checkout
  (`~/Server/gnoworld/…`), which the file tools reach from every worktree; and a linked worktree's `.git`, the file that names
  git's folder (F150's class). `*` is one folder's name, so a worktree made tomorrow is covered, and the sandbox matches the
  real path, so `/tmp` and a link reach the same refusal. `test_hooks.sh`'s section `siblings` reads the rules as Claude Code
  does and, in its sandbox, writes into a sibling to see each write refused. A session carries the twins once its own
  checkout's `settings.json` does: a branch cut after 7z's merge at once, the chief's session (started in the main checkout,
  which reads `main`'s) after slice 7 reaches `main`, or sooner if Alexis copies the twins into the main checkout's
  local settings, which every session of the repository reads.
- **The instructions at a tree's root and above it** (7z, S4): Claude Code reads `CLAUDE.md` and `CLAUDE.local.md` in every
  folder above the one it starts in (its memory page), and `.claude`'s own `CLAUDE.md` and `.claude/rules/` there by its source.
  Closed: to commands in `/private/tmp/claude-501/` and `gnoworld-wt/`, the folders above every worktree a command may write; to
  the file tools there, in `/private/tmp/` (by both spellings), in `~` and in `~/Server/`, and above the next parts' trees in
  `~/Server/gnoworld-wt/` (7w3); `AGENTS.md` and `.claude`'s own beside them everywhere (7w3, F5323: read there where no
  `CLAUDE.md` stands, or when the settings ask for both kinds). Not closed: the memory and the imports (Known limits).
- **The instructions below a tree's root** (7w3, S2-3, F5321, F5323): Claude Code loads a subfolder's `CLAUDE.md` and
  `CLAUDE.local.md`, an `AGENTS.md` where no `CLAUDE.md` stands, and a subfolder's `.claude` rules and skills, once it reads
  a file there (its memory and skills pages). Closed at any depth (`**/`), to commands and the file tools, in a session's own tree, in
  every sibling's and the main checkout's; StrykerJS's `ignorePatterns` leave those names out of its copies, which the denies would
  refuse. `scripts/check_docs.py`, which every commit runs, refuses one committed or on disk and not ignored (case folded, a link by
  its name, any `.claude` below the root), and at the root a `CLAUDE.local.md` or an `AGENTS.md`.
- **The file tools write the session's folders alone** (7w3, F5320, Alexis's "Oui, pour gnoworld"): the committed settings set
  `permissions.blockWritesOutsideWorkingDirectories`, so Write, Edit and NotebookEdit refuse every path outside the working
  directories, in every mode, bypass included (Claude Code's settings reference, 2.1.314 and later), whatever the deny lists name: they
  name some places, never all (7w2's reviews found thirteen more). The working directories: the session's tree, and each running
  slice's `reports/` folder in the main checkout's `.claude/tmp/` (slice 7's and 8's), which the main checkout's local settings name
  (`settings.local.json` in its `.claude/`: a folder only a repository's settings name does not count, unless git tracks that file
  not, and Alexis's global excludes hold it, F5326); never the whole `.claude/tmp/`, which holds the chief's gate records and the
  briefs (the review's S1, R1). A part's state line goes in `reports/` too; a new slice's folder is a line Alexis adds there. That
  local file also closes the instruction files below the main checkout's root to every gnoworld session, the old folder's parts and
  the chief's included, whose trees lack 7w3's denies. Claude Code's own files stay open (the scratchpad, plan files, this project's
  auto memory). Settings files are refused everywhere, and
  `EnterWorktree` goes. It holds the file tools alone: commands are the sandbox's, and MCP tools and hooks are neither's. A session
  holds it once its tree's settings do; the chief's, once `main`'s do.
- **The next parts' worktrees, out of the temp folder** (7w3, F5322, F4893's remedy a): `~/Server/gnoworld-wt/`, beside
  the main checkout. No part's sandbox has a write root there but its own tree, so its commands write no sibling's files, move none
  and plant no folder there (a sibling's git state, its index and HEAD in the shared `.git`, stays theirs to write: F152, F4897);
  the chief's session, which adds the folder, is held by 7z's twins there, by one spelling (no link on the way), and above the
  trees by the instructions' rules, once `main` holds 7w3: until then its commands and file tools write every part's tree, as they
  do in the temp folder today (F4896). The folder's own `.claude` is closed whole: an added folder's skills, commands and agents
  load into the session that adds it (lot 2's S2-2). `scripts/worktree.sh` makes a tree there alone, the folder read
  from git's common folder, a caller's git folders dropped; herdr's `open.sh` opens a part only in a folder there that is no link
  and that the main checkout's `git worktree list` names. The old folder's twins stay while a part runs there.
- **What a session holding the twins no longer writes in another worktree** (7z): everything closed in its own tree,
  in every worktree under `gnoworld-wt/`. By command: `CLAUDE.md`, `CLAUDE.local.md`, `.claude`'s own `CLAUDE.md`, `scripts/`,
  `.githooks/`, `.github/`, the settings, agents, commands, workflows, skills, rules and hooks in `.claude/`, every
  `package.json`, the lockfile and pnpm's files, the tools' configs (`eslint.config.ts`, `vitest.config.ts`,
  `stryker.config.json`, `knip.json`, `.jscpd.json`, the `tsconfig`s, Prettier's two), `.gitignore`, `.node-version`, `.npmrc`,
  `.mcp.json` and the worktree's `.git`. By file tool: the Edit list above (the harness files run outside the sandbox and the
  instructions) and the secrets' reads, in the main checkout too. So `scripts/worktree.sh` (`git worktree add` writes all of
  them in the new tree), and any merge or checkout that writes one of them, leave such a session for Alexis's terminal or one
  of his scripts. What stays: the tree's `docs/` and `adr/` (the ledger, the decisions, the review log), the code,
  `.claude/tmp/`, the shared folder in the main checkout's `.claude/tmp/`, and git's shared folder (refs, objects, each
  worktree's index and HEAD).
- **Alexis's scripts run nothing of a checkout** (7z, R1, S1): a script that writes a closed file for him reads the files it
  changes and nothing else of the tree, and calls the system's own programs by path (S2-2); the format of what it wrote is the session's gate's to check, in its sandbox, at the
  commit. Prettier run from a worktree loads a config a session can plant beside the file (a `prettier.config.mjs` in `.claude/`, run
  with Alexis's rights, reproduced).
- **`scripts/guard.py`,** before each Bash call, web fetch and edit: no git hook skipped, no
  forced push, no git pointed at folders of the command's own (`GIT_DIR`, `GIT_COMMON_DIR`,
  `GIT_WORK_TREE` given a value or exported, `--git-dir`, `--work-tree`, `core.worktree`: their hooks
  run, or none), no recursive delete of a path a variable may leave empty (only `${name:?}`), no
  `gnokey`, no raw call to the chain, and no `.gno` file written before the gno skill is loaded
  and gnomcp was used, and no `worktree.sh` run but alone, as `sh scripts/worktree.sh` and plain
  words, from the project's root: elsewhere those words would run a script the session can write,
  and behind anything else in the call, something else outside the sandbox (F5058); and no subagent's Edit or Write of a harness file (`agent_id` in the hook's input; `records.sh`'s list,
  in every tree above the file, its own included when it has no `.git`, so a planted `.git` hides nothing; its path
  read through links, dots and case; `.claude/tmp/` is none), as the sandbox covers a shell, never a file tool (D240). Every check reads the command from every word on, so a wrapper it does not know
  runs nothing past it (git-core's dashed programs read as git): it fails closed, refusing a bare `gnokey`
  word (the Grep tool searches for one) and asking before `echo git push`. It reads a shell's `-c`
  wherever it stands among the options, `eval`, env's `-S` line, `$(...)`, `<(...)`, backticks, `${...}`,
  a function's body and a command whose quotes hold a newline, takes a quoted mark for a word, and reads
  past git's global options that take their argument apart; it refuses a shell or `source` reading a pipe,
  a file, a here-string or a process (`=(…)` and stdin by any path included; a heredoc's lines are read), and a
  zsh glob qualifier after any word. What it cannot read it refuses (7w4, reports/slice-7w4.md):
  - a program a substitution's output names, a variable alone, a glob or a brace naming one (`/usr/bin/gi?`,
    `""{zsh,-s}`), find's `-exec {}`; a program a variable names is otherwise read as git, rm and curl;
  - in git: a list's words (`"$@"`), a subcommand, a `-c` value or a config key from an expansion, an expansion
    in a commit, merge or pull but as `-m`'s or `-F`'s value (strict too when commit follows a variable behind a
    wrapper), a brace no quote holds, a glob in a commit's, merge's, pull's or push's words, `-nm"…"`; git `am`,
    `cherry-pick`, `rebase`, `revert`, `filter-branch`, `replay`, `update-ref`, a commit made by hash-object,
    subtree add/merge/pull/split, stash create/store, the stash named by a command that moves a branch,
    `pull --reb[ase]`, a config key making a pull rebase: commits no pre-commit saw;
  - xargs or parallel feeding git or a shell, or running a program none of `FED`;
  - a shell's `-c` line (read wherever the shell stands, and the words after it), `eval`, `trap`, `let`,
    `sched`, `zpty`, `zstyle`, `bind`, `complete`, `compgen` and `parallel` holding an expansion (their words are
    read as eval's); zregexparse;
  - an alias or a hashed name (given by a variable too), zsh's `aliases`, `commands`, `functions`, `options`,
    `histchars` and `HISTCHARS` given a value, by assignment, `${…::=…}`, `set -A`, `read -A`, `printf -v`,
    `zparseopts` or `typeset`;
  - zsh's ways of running a value's code: `${~x}`, `$~x`, the `(e)`, `(%)`, `(P)` and `(#)` flags, globsubst,
    promptsubst, braceccl, extendedglob, shwordsplit, `setopt -m`, an option a variable names (to setopt or a
    shell's `-o`), emulate, `print -P`, a `$'…'` escape by code, a value whose subscript assembles a `$(`;
  - a NUL byte.
  A value given is read as words, its substitutions as commands, and each line's substitutions are read too, its
  quotes read as quotes and as characters, a command's comment skipped. A heredoc's body no shell reads (its line's
  programs all of `READS_TEXT`) and a quote's later lines are text: kept from the qualifiers' check, a quoted
  body's substitutions unread; the reader that finds them ends at any form it cannot settle (a continued line, a
  `case`, a `<<` inside backticks, a mark it cannot read or never finds), what follows staying commands. If it
  crashes, the call is blocked.
  `.githooks/pre-commit` drops a caller's `GIT_COMMON_DIR` and `GIT_OBJECT_DIRECTORY`, which served
  the staged copy a planted object under a staged file's name (F4923).
- **Alexis's user settings** (`~/.claude/settings.json`, every project; 7w2's `apply-7w2-user.sh`): the
  file tools, which the sandbox does not hold and bypass mode does not ask for, are denied the programs that
  run outside the sandbox with his rights: the folders on `PATH` he owns and where their links lead (`~/.local`,
  `~/.opencode`, `/opt/homebrew`, `~/.orbstack`, `/Applications`), what those settings run (`~/.claude/skills`,
  `hooks`, `statusline.sh`, `plugins`, `dev-mods`, `agents`, `commands`, the file itself, `~/.claude.json`), the
  same of the second profile `~/.claude-work`, launchd's agents, zsh's startup files and what they source, the
  tools' config (`~/.config`, `~/.npmrc`, `~/.gitconfig`, `~/.docker`), python3's user site, `~/.ssh`, `~/.nvm`,
  every project's settings under `~/Server`, and the main checkout's git config and hooks. A deny holds in every
  mode, bypass included.

The guard and the hooks are a seatbelt, not a wall: what holds whatever happens is `main`
protected with the CI required, which this repository's plan does not offer yet (below).

## Plugins

On for this project (`.claude/settings.json`): `typescript-lsp`, to follow the code through
the TypeScript language server; `context7`, for a library's docs at the pinned version;
`gnomcp`, for everything about gno. Each later one comes with its slice, since every plugin
costs context in every session.

## How the harness proves itself

- **`scripts/probe.py`** plants one fault per guard and checks that the right tool catches it,
  by the rule's own message.
- **`scripts/test_hooks.sh`** runs each hook and script on throwaway repositories: what each
  must refuse, and what it must let through.
- **`scripts/harness_mutate.py`** switches each guard off in turn, in a throwaway copy, and runs
  the section of the probe or hook tests that belongs to it (`ONLY=<section>`): a guard whose
  removal no test notices is a guard nobody checks, and the run prints the test to add.
- **A removal or a narrowing lands with no test of its own** (Alexis, 2026-11-04): three read-only passes read it (a `reviewer`, the
  `security-reviewer`, a second `reviewer` over the gate as a whole), and the whole suite runs at a part's end and before main; a case
  that tested what is removed goes with it, on a `Removed-test:` line.
- **A new guard lands with its planted fault and its mutant.** Each `/pre-merge` writes to the
  review log how many verified findings it found in the harness itself; if that number does not
  fall over three merges, the harness is simplified, not extended.

## Known limits

- **The server reports, it does not block.** The CI runs the full gate on every branch pushed,
  but GitHub cannot protect a branch on this repository's plan, and the local hooks can be
  skipped by someone who means to (F001, F009).
- **A record of a green gate can be forged from the sandbox,** which writes it (F076).
- **Claude's sandbox shares Alexis's `.git`** (one repository, Alexis 2026-10-18): it writes
  refs, objects and the index, so it could move or shadow `main` or plant a nested repository
  (F152, F153, F163). The boundary is `main` protected with the CI required.
- **A glob holds no folder at its `*`, so a command still rewrites a sibling** (F4893, high). The sandbox refuses a rename of a
  rule's fixed part and of a literal rule's folders, not of the folder a `*` stands for: a command can move a whole worktree out
  of `gnoworld-wt/`, write its closed files there and move it back (probed on `packages/core`, whose `package.json` only a glob
  holds; the section `siblings` prints it as a known gap), or plant a whole folder there for herdr's `open.sh`, which opens a
  session in any folder of the part's name. Alexis chose the worktrees out of the temp folder (7w3): in
  `~/Server/gnoworld-wt/` no part's command reaches a sibling, and `open.sh` opens a folder git made there alone. It stays
  open in the old folder while a part runs there, and for the chief's own session, whose `--add-dir` gives it the new folder: a
  folder there moves out and back by its commands (the live probe prints it). And until every session holds the write block, the
  file tools of one that does not (the old folder's parts, the chief) still write the next parts' trees, plant a folder there that
  `open.sh` would open (a part's command forges the list git keeps of its worktrees), and rewrite the briefs (lot 2's S2-1, F5333):
  the local settings close a tree's own `settings.local.json` and the folder's `.claude` to them, not the rest. The block in the
  local settings would close it at once, the chief's included, at its cost: Alexis's call.
- **A folder carrying an instruction file moves into a tree** (F5325, from Claude Code 2.1.318's source): `**/CLAUDE.md` and its
  kin refuse a write or a rename onto such a name, not a folder made in the temp folder and renamed in, which the glob holds
  nothing of; the live probe prints it. `check_docs.py` refuses it at every commit, so it reaches no other tree but by the session's
  own working tree, which only that session reads.
- **The file tools still edit another worktree's files that only the sandbox closes** (F4895): `scripts/check.sh`,
  `scripts/test_hooks.sh`, the tools' configs. The Edit list holds what runs outside the sandbox and the instructions, and no
  rule tells a session's own tree from another's: one closing a sibling's would close its own. A worktree outside `gnoworld-wt/`
  has no twin at all (F4897), and every session shares the rest of the temp folder (another session's scratchpad, its test trees,
  an agent's report before the chief records its message: S5).
- **Alexis's scripts wait in the main checkout's `.claude/tmp/`, open to every session's file tools** (R2): one can be rewritten
  before he runs it, or between his check and his run. He copies it into a `mktemp -d` folder, checks the copy against the
  `shasum -a 256` the chief's message gives, never a file's, and runs the copy (S2-5).
- **What Alexis runs from a checkout is any session's to rewrite** (7z's round 2, S2-1; F204's class): `deploy/test.sh` and
  `deploy/`'s compose files are open, in the integration worktree too, so an uncommitted line any session adds there runs with
  his rights and Docker's socket. Safe only from a tree no session writes: `CLAUDE.md` sends him to `docs/OPERATIONS.md`'s checked
  copy of the commit he reviewed (7w3, F5329; 7w2's recipe, which lands with 7w2's merge), never a worktree; until then
  `git archive <sha> | tar -x -C "$(mktemp -d)"`, the sha from the chief's message.
- **In bypass mode the file tools write the programs that run outside the sandbox** (S2-2, claimed, the writes not run):
  `~/.local/bin` comes first on PATH (gnomcp, which Claude Code starts by name, lives there), then `~/.opencode/bin` and
  `/opt/homebrew/bin` (the hooks' `python3`); herdr's `open.sh`, the hooks and Alexis's scripts call programs by name; no deny
  names those folders, nor `~/.claude/skills/` (the two excluded scripts) or `~/Library/LaunchAgents/`. Closing them is Alexis's
  user settings' to do; `apply-7z.sh` calls only `/usr/bin` and `/bin`.
- **Claude Code's memory stays open** (S2-4; 7w3's S3, F5331): the auto memory every gnoworld session loads, the chief's included
  (`~/.claude/projects/…/memory/`), which the write block leaves to the file tools by design and no settings file can close (a
  memory folder only a repository names loses the exemption, and that key is ignored there): the widest channel from one session
  to the next once the block holds. `~/.claude/RTK.md`, which `~/.claude/CLAUDE.md` imports. Below a tree's root
  the instructions are closed (7w3, "The boundary") but for F5325, and for the installed packages' own: `node_modules` holds
  `AGENTS.md` files (`@cosmjs`'s), Alexis's install's, which Claude Code reads only where no `CLAUDE.md` stands at or above a
  session's folder, or when his settings ask for both kinds (its memory page, F5327).
- **The write block stands on the main checkout's local settings staying untracked** (F5326): an index entry for that
  `settings.local.json` in the main checkout's (one `git update-index` from any session, whose sandbox writes the shared `.git`)
  makes it the repository's, whose folders do not count, and Claude Code remembers it in `~/.claude.json`
  (`localSettingsSeenGitTracked` under the project), even once the index is mended: the parts' reports are refused, loudly, until
  Alexis sets it back with no session running (the review's S5). The reports folders it names are working directories of every
  gnoworld session, to the sandbox too: their commands write each other's reports.
- **Two commands leave the sandbox** by Alexis's user settings (`sandbox.excludedCommands`): his captures' `fetch.sh` and
  herdr's `open.sh`, each taking arguments it validates; what they write is theirs to keep in bounds.
- **Only merge.sh shows a merge before git writes it** (F129). A plain merge that changes the
  harness is refused at its commit, its files written already: undo it at once
  (`git merge --abort`). A cherry-pick, a rebase or a checkout of Claude's branch runs no such
  check (F153). pre-commit compares only the merge's harness files with git merge-tree's merge of
  the commit merge.sh marked: one changed during the resolution, or in conflict, is refused; the
  other files are resolved by hand and gated (9n), and so is a merge read through a non-empty
  `.git/info/attributes`, `.git/info/grafts` or `.git/shallow`, which a sandboxed command can write. A mark anyone
  types by hand for a clean merge merge.sh never showed still passes (a backlog row on
  slice-9n, answer 9n-4): merge.sh never asks Alexis to type one.
- **A merge refuses a path with a non-ASCII character** (F164).
- **The install is not atomic** (F159), and a fresh clone has no hooks until its owner installs
  them from `main`.
- **The history scan is defence in depth;** the staged scan is the barrier (F141 to F143).
- **The fast gate's budget, judged on the load, lets a slow change through on a busy machine;**
  the overrun is printed and logged every time.
  Every step of every gate keeps its time, the run's mode and the load as its lanes started in
  `~/.cache/gnoworld-tools/gate-times.log`, a line a step, which nothing prunes (about 3 KB a run).
- **A commit's lint trusts TypeScript's graph** (`scripts/lint_scope.py`): a file whose lint would read another it neither imports
  nor reaches through a type (a rule reading the disk) is linted at a part's end (`--tests-all`) and in the merge check, which lint the
  whole repository. Two gates at once in one worktree share its `.tsbuildinfo`, so one may read the graph the other wrote.
- **A commit's gate trusts Vitest's module graph, `main.test.ts` and the map's grep** (`scripts/related.py`): a test
  that runs code in a child process other than the server's (`app/src/dataFiles.test.ts` builds the app) runs for a change
  of code only when the graph holds it, and a read through a place built from another's (`join(APP, "..", "deploy")`) is seen
  as its base; a path built at run time from no literal the grep knows is not seen. Markdown is prose outside the sources only,
  for the gate, `code_changed.sh` and the record's print alike (a recorded chain page under them is a fixture). A part's end
  (`check.sh --tests-all`) runs every test of the fast projects, the merge check and `--full` every test.
- **pre-commit trusts the record of a green gate** on the staged code instead of running the gate again (F076's record, which
  the sandbox can forge), and **`--full` trusts the record of its last green run** to skip the probe and the harness mutants;
  the CI keeps neither.
- **Core's tests alone run on both engines,** Node's V8 and Chromium's (F816, F817).
- **`prove_fix.py` covers the product;** a fix of the harness is proven by `harness_mutate.py`.
- **Two caches every tree shares** (`~/.cache/gnoworld-tools`): StrykerJS's incremental file and the harness mutants'
  verdicts. A verdict is reused when what it was keyed on is unchanged; StrykerJS does not see a test helper it neither
  mutates nor counts as a test, and a harness verdict sees only the files its sections name. So a "killed" judged in
  another branch's tree can stand in a local `--full`. The CI keeps neither cache and judges everything on each push
  (security-S7, review 8).
- **The three-round limit is a written rule;** nothing counts the rounds.
- **The review pass is recorded by the agent that ran the review;** the pre-push hook checks it
  matches the tree, not who wrote it.
- **Product files Claude writes run outside the sandbox** (F204): the compose file the demo starts
  from, and the app's code that `pnpm dev` runs in Alexis's shell; `deploy/test.sh` runs from a checked
  copy of the commit he reviewed, so what it runs is what he read. The workshop the same, and at once (lot 2's S1, F4962):
  while `pnpm workshop` runs, an edit of `app/vite.config.ts` or of a file it imports re-runs in Vite's dev servers, and the
  backend runs `server/src` through `app/tests/e2e/api.mjs`, all with Alexis's rights, outside the sandbox; any session can write
  them (another worktree's too, F4900). Since Alexis's "Oui, avant le ping-pong", each of the workshop's processes, and
  `scripts/ergo.sh`'s check of the Ergo binary a session can write, runs under its own Seatbelt profile (`scripts/workshop.sb`,
  by `/usr/bin/sandbox-exec`): it writes `$TMPDIR`, the checkout's `.claude/tmp`, Vite's caches and React Router's types alone,
  never the checkout's code, `~/.claude` or `~/.local`; of the home folder it reads the code alone it runs (the checkout, the one
  its `node_modules` lead to, Node, the tools' cache), never `deploy/secrets`, `.env`, `~/.ssh`, `~/.config`, `~/.claude.json`,
  gnokey's or gnomcp's keys; it reaches no keychain daemon, opens and scripts no other app, starts no launchd job, connects to no
  Unix socket but the system's logs and name resolver (Docker's, an SSH agent's, Claude Code's sessions' among them). Its limits:
  where its processes listen, no rule holds. They listen on 127.0.0.1 because the code they run says so (`app/vite.config.ts`'s
  `workshopServer`, the server's `HOST`, the Ergo config of `server/src/testing/ergo.ts`), code a session can write, and Seatbelt
  cannot keep a program a session wrote from listening on every address: its compiler takes no host but `*` and `localhost`, and
  on this Mac every bind or inbound rule on a local `localhost` let 0.0.0.0, `::` and the LAN's address through, every other
  refused 127.0.0.1 too (F4977, the probe's table, 2026-11-05). The wall against the LAN is macOS's firewall, Alexis's machine
  setting, outside the code. Outbound network stays open (the backend reads the chain and the prices), and so do TCP services on localhost; outside the home folder it reads everything (`/private/tmp`, Claude Code's scratch folders among them); its
  processes keep Alexis's environment, and what macOS's privacy settings grant his terminal; the keychain's daemons are denied
  by name, and the data-protection keychain's is untried. `workshop.sh` itself runs as Alexis does, and so does `pnpm`, which runs
  what the checkout's `package.json` and `.npmrc` say: a session that edits them is read before he starts it. `sandbox-exec` is
  deprecated by Apple (its man page, 2017) and still ships on macOS 26.5.2, where Claude Code's own sandbox uses Seatbelt too;
  were it gone, the workshop's processes would want a container or another user account.
- **The file tools write anywhere else Alexis can** (F4926): the user settings deny a list of places
  (above), not every place outside the sessions' folders. `permissions.blockWritesOutsideWorkingDirectories`
  would refuse them all, in every mode; it is Alexis's choice, for what it costs (7w2's report).
- **The guard reads a command's text** (F4924, 7w4): a variable set with `set -a` and `read`, `for`, `printf -v`
  or a substitution's output (`y=$(printf 'a[\x24(…)]'); echo $((y))`), a word an expansion yields
  (`v=GIT_DIR=x; env "$v" git commit`; zsh's array or an unquoted `$(...)` as `-m`'s value, which the shell may
  split into flags), a program a variable names behind a wrapper the guard does not know before a subcommand a
  variable gives too (read for its literal flags alone), a shell reading a pipe behind such a wrapper (F5362), a
  script that sets git's folders itself, a script or a module run from a file (`sh f`, `source f`, `enable -f`,
  `zmodload`, `python3 -c` calling git, a copy of git under another name), a commit no hook saw put on a branch
  by its hash (`git reset --soft <hash>`, F5369's S7-7), a subscript assembled character by character (S7-8),
  and a crafted `.git` found by discovery after a `cd` (F152's class) pass it. The guard is a speed bump, not the
  wall: skipped hooks close with a record of each gated tree that no session can write (the chief's next part,
  reports/slice-7w4.md). A heredoc's line that reads as a refused command is refused, a heredoc inside backticks
  too: a commit message goes in a file (`git commit -F`).

## Files

| File | Role |
|---|---|
| `CLAUDE.md`, `.claude/rules/` | the rules Claude reads; each area's file loads when its files are touched |
| `.claude/settings.json` | permissions, the sandbox, the hooks, the plugins |
| `.claude/agents/` | `test-auditor`, `reviewer`, `security-reviewer`, `design-reviewer`, `dreamer` |
| `.claude/commands/` | `/slice-plan`, `/pre-merge`, `/dream` |
| `.claude/workflows/` | `branch`, a branch's loop |
| `.githooks/` | `commit-msg`, `pre-commit`, `pre-merge-commit`, `pre-push`; `records.sh`, the prints and the harness list; `merge.sh`, the merge that shows the harness first |
| `scripts/install_hooks.sh` | puts `main`'s hooks and the scripts they run in `.git/hooks` |
| `scripts/check.sh` | the gate |
| `scripts/ship.sh` | the end of a slice's branch: the check that fits the change, the review pass, the log row, the `Harness-changed:` lines, Alexis's merge and push commands |
| `scripts/ergo.sh`, `scripts/workshop.sb`, `scripts/load.py` | the Ergo the server's tests start; the workshop's Seatbelt profile; the machine's load, for the gate's budget |
| `scripts/related.py` | the unit tests a commit's change asks for: the paths for Vitest's `related` command, `main.test.ts`, the readers of a place on disk |
| `scripts/unsteady.py` | the fast gate's second run of a failed file, and its log |
| `scripts/lint_scope.py`, `scripts/stryker_lines.py` | the files a commit's lint reads, from the type check's graph; the code a merge check's StrykerJS mutates |
| `scripts/worktree.sh`, `scripts/borrow_node_modules.sh` | a branch's worktree with its packages, made and removed in one root alone; a copy borrowing the installed packages, a workspace's `.bin` its own |
| `.github/workflows/gate.yml` | the full gate on GitHub's machines |
| `app/playwright.config.ts`, `app/tests/e2e/` | the app's journeys, against a real server and a real Ergo |
| `scripts/guard.py`, `scripts/stop_gate.sh`, `scripts/dream_due.sh` | Claude Code's hooks (the last is SessionStart's: it says a dream is due when `main` has a merge after the `The dream of <sha>` rows of `docs/review-log.md`, on `main` and on the branches it has not got, for a row lands on the next slice's branch (F4063); it reads committed rows with read-only git and blocks nothing) |
| `scripts/speeds.py` | the merge check's two speeds: `interface` (docs/REVIEW.md's tier-3 paths alone: no StrykerJS) or `full`, which any other path, or any doubt, runs; `--full` is always whole ; with `--light`, whether a change of the interface alone, tier-3 folders of main's table and the tree's and no tier-1 path of either, may take the radical mode's light gate |
| `scripts/scan_secrets.sh`, `scripts/gitleaks.toml`, `scripts/gitleaks-private.toml`, `scripts/.gitleaksignore`, `scripts/audit.py` | the secret scan and the dependency audit |
| `scripts/code_changed.sh`, `scripts/repo_files.py` | what the hooks and scripts share |
| `scripts/check_css.py`, `scripts/check_comments.mjs`, `scripts/check_docs.py` | the style and docs checks |
| `scripts/hidden.py` | the characters no text holds raw: check_docs's rule, in a file of its own to be shared |
| `scripts/mutate.py` | the realms' mutation check |
| `scripts/patch_coverage.py`, `scripts/prove_fix.py`, `scripts/check_regressions.py`, `scripts/batch_size.py` | the no-regression net |
| `scripts/review_pass.py` | records and checks a `/pre-merge` pass |
| `scripts/probe.py`, `scripts/test_hooks.sh`, `scripts/harness_mutate.py`, `scripts/suite_parts.py` | the harness's own tests |
| `scripts/bench.py`, `app/tests/bench/` | the benches and their budgets |
| `scripts/workshop.sh` | `pnpm workshop`: the app's and the lab's dev servers on the tailnet, the chat's backend behind the app's (DEVELOPMENT.md, "The workshop") |
| `scripts/check_nginx.py`, `scripts/nginx.sha256` | `nginx -t` and the served build's policies, in the merge check; the pinned binary's checksum |
| `docs/review/findings.md`, `docs/review-log.md` | every finding; what Alexis caught and missed, each branch's cost |
| `docs/harness.html`, `docs/harness.png` | the picture above, and its source |
