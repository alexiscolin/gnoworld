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
- **A branch session**, one per branch, two at most at once, works in its own worktree, made by
  `scripts/worktree.sh` and never by hand (one store of packages, a real `.bin`, F2127). Its
  pipeline is the Workflow `branch` (`.claude/workflows/branch.js`): the failing tests, the red
  pass, the code, the merge check, one combined review, the high and medium fixes, the merge check
  again; it returns its commits, the low findings for Alexis, the lines that loosen the net and its tokens.
  An agent that gives no report blocks it; the harness's and the realms' files bring their reviews
  whatever its arguments say, and so does every tier-1 path of `docs/REVIEW.md`'s table that exists (the relay's auth script,
  the CSP, `deploy/`, `core/markdown`, `lib/adena`, the login of the server and of the client, the server's roles, the worker): the
  table writes each path in backticks, and a `workflow_branch` case fails when the table names one its `TIER1` lacks, or `TIER1` holds
  one the table does not name. Its argument `base` (`main` when absent) is the branch the
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
4. **End of each turn.** When code changed, the Stop hook (`scripts/stop_gate.sh`) stops the turn
   once unless the fast gate, which Claude runs in the sandbox, passed on exactly this tree. The
   hook itself runs nothing from the repository. First, it stops what runs of this project left
   behind, which the sandbox cannot see: a node process naming a folder `gnoworld/` whose parent
   is gone for 30 minutes (2 hours while a gate runs), or a test tool's 3 hours old or more but a
   dev or watch mode, each logged to `~/Library/Logs/gnoworld-reaped.log`, where the sandbox
   cannot write.
5. **Each commit.** The git hooks run from `.git/hooks`, installed from `main` with the scripts
   they run, where no merge, checkout or sandboxed command writes: no branch brings its own
   (F129). `commit-msg` holds the subject's form, refuses attribution lines and a `fix` of the
   product with no test and no `No-test:` line, and scans the message for secrets. `pre-commit`
   scans what is staged for secrets, then, in Claude Code's sandbox, runs the fast gate on a copy
   of what is staged, scoped to the commit's paths (`GATE_CHANGED`), and records the code it
   passed; a staged code a green `check.sh` run already recorded runs no second gate (the harness
   audit, 2026-11-04). In Alexis's shell it runs no gate: the staged code must be code the sandboxed gate
   recorded green (`.githooks/records.sh`, F076).
6. **A push of a work branch.** `pre-push` wants a gate that passed on its code, nothing
   uncommitted, and scans the history for secrets.
7. **Before a merge.** `/pre-merge` (`docs/REVIEW.md`): `check.sh --merge`, one combined review
   by the `reviewer` agent (with the `security-reviewer` for a tier-1 file or the harness, the
   `gno-auditor` for a realm), each finding reproduced, high and medium fixed,
   low ones listed for Alexis, then a recorded review pass (`scripts/review_pass.py`).
8. **Alexis reviews,** blind first, in revdiff, and runs `deploy/test.sh` once per branch. It takes a lock per Docker project
   (a folder in `~/.cache/gnoworld-tools` holding its pid): a second run, from another terminal or session, is
   refused while a first holds it; a project a Ctrl+C left up (`gnoworld-demo-mutant-<pid>`) is named with the
   command that removes it. `test_hooks.sh`'s section `deploy_lock` runs it against stubbed Docker.
9. **Merge and push, by Alexis, in his own shell.** Through `.git/hooks/merge.sh`, which shows
   each harness file the branch changes, with its diff, before git writes it. Pushing `main` wants
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
| `server/src` | tsc, ESLint, the related tests and `main.test.ts` (below) | 30 s |
| the TypeScript of `app/src`, `packages/ui/src` | tsc, ESLint, the related tests, the app's build (below) | 120 s |
| a test of the app (`app/src/*.test.ts(x)`), anything of `app/tests/` (a journey, its helper, a recording) | tsc, ESLint, the related tests; no build | 30 s |
| `packages/core/src`, `packages/schemas/src`, any other file of `app/src` and `packages/ui/src` (a fixture, a stylesheet), `app/data`, `app/lab`, `app/public` | tsc, ESLint, the related tests (and `main.test.ts` for core's and the schemas' code), the app's build | 120 s |
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
(`scripts/unsteady.py`, F1700): the gate passes if it passes, and logs the file, its failed
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
| `scripts/mutate.py` | a realm guard no test notices when removed |
| `gofmt`, `go vet`, the seal vectors | Go tools; `gno/r/seal/vectors_test.gno` equals what `go run ./tools/sealvec` prints |
| `scripts/check_docs.py` | a harness doc naming a file that does not exist; a bad ledger row or one citing a missing commit; a known limit the runbook no longer says; a review agent's file missing or without its sentence `Never run a git command that writes the index or the work tree`; CLAUDE.md without the review card's item 8 |
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
budget with the budget spec alone (`app/tests/e2e/budgets.spec.ts`, the browser's gzip).

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
  `scripts/worktree.sh` and `scripts/borrow_node_modules.sh`, which Alexis's terminal runs), an edit of the
  instructions every session reads (`CLAUDE.md`, `CLAUDE.local.md`, `.claude`'s own `CLAUDE.md`: Alexis's from 7z on),
  `pnpm add` and `rm -rf`. A branch changes the harness in its own worktree, where Alexis sees
  each such file at `merge.sh`. In his shell the hooks run nothing of the repository but the
  records the sandboxed gate wrote (F076).
- **The sandbox** around shell commands: they write only in the project, the per-user temp folder (`$TMPDIR`, where the
  worktrees live) and the caches, and in git's shared folder never `.git/hooks`, `.git/config` or a worktree's `commondir`
  under `.git/worktrees` (so a stale worktree is pruned by Alexis: `git worktree prune`); they reach only the npm and Go
  registries and github.com.
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
  the file tools there, in `/private/tmp/` (by both spellings), in `~` and in `~/Server/`. Not closed: those below a tree's root,
  the memory and the imports (Known limits).
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
  forced push, no recursive delete of a path a variable may leave empty (only `${name:?}`), no
  `gnokey`, no raw call to the chain, and no `.gno` file written before the gno skill is loaded
  and gnomcp was used. It reads through wrappers, `sh -c`, `eval` and `$(...)`; if it crashes,
  the call is blocked.

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
  session in any folder of the part's name. What closes it is the worktrees out of the temp folder, each session writing only
  its own, their making and merging out of the sandbox, or a literal rule per worktree written at its making: Alexis's decision.
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
  his rights and Docker's socket. Safe only from a tree no session writes: `git archive <sha> | tar -x -C "$(mktemp -d)"`, the sha
  from the chief's message.
- **In bypass mode the file tools write the programs that run outside the sandbox** (S2-2, claimed, the writes not run):
  `~/.local/bin` comes first on PATH (gnomcp, which Claude Code starts by name, lives there), then `~/.opencode/bin` and
  `/opt/homebrew/bin` (the hooks' `python3`); herdr's `open.sh`, the hooks and Alexis's scripts call programs by name; no deny
  names those folders, nor `~/.claude/skills/` (the two excluded scripts) or `~/Library/LaunchAgents/`. Closing them is Alexis's
  user settings' to do; `apply-7z.sh` calls only `/usr/bin` and `/bin`.
- **Instructions below a tree's root and Claude Code's memory stay open** (S2-3, S2-4): a `CLAUDE.md` in any folder of a tree,
  which Claude Code attaches when it reads a file there (its memory page: subdirectories load on demand), its `.claude/rules/` and
  skills; the auto memory every worktree session loads (`~/.claude/projects/…/memory/`); `~/.claude/RTK.md`, which
  `~/.claude/CLAUDE.md` imports. Closing the nested ones needs StrykerJS to leave `CLAUDE.md` out of its copies.
- **Two commands leave the sandbox** by Alexis's user settings (`sandbox.excludedCommands`): his captures' `fetch.sh` and
  herdr's `open.sh`, each taking arguments it validates; what they write is theirs to keep in bounds.
- **Only merge.sh shows a merge before git writes it** (F129). A plain merge that changes the
  harness is refused at its commit, its files written already: undo it at once
  (`git merge --abort`). A cherry-pick, a rebase or a checkout of Claude's branch runs no such
  check (F153); a merge with a conflict that changes the harness needs the branch rebased first.
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
- **Product files Claude writes run outside the sandbox** (F204): `deploy/test.sh`, the compose
  file, and the app's code that `pnpm dev` runs in Alexis's shell.

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
| `scripts/related.py` | the unit tests a commit's change asks for: the paths for Vitest's `related` command, `main.test.ts`, the readers of a place on disk |
| `scripts/unsteady.py` | the fast gate's second run of a failed file, and its log |
| `scripts/lint_scope.py`, `scripts/stryker_lines.py` | the files a commit's lint reads, from the type check's graph; the code a merge check's StrykerJS mutates |
| `scripts/worktree.sh`, `scripts/borrow_node_modules.sh` | a branch's worktree with its packages; a copy borrowing the installed packages, a workspace's `.bin` its own |
| `.github/workflows/gate.yml` | the full gate on GitHub's machines |
| `app/playwright.config.ts`, `app/tests/e2e/` | the app's journeys, against a real server and a real Ergo |
| `scripts/guard.py`, `scripts/stop_gate.sh`, `scripts/dream_due.sh` | Claude Code's hooks (the last is SessionStart's: it says a dream is due when `main` has a merge after the `The dream of <sha>` rows of `docs/review-log.md`, on `main` and on the branches it has not got, for a row lands on the next slice's branch (F4063); it reads committed rows with read-only git and blocks nothing) |
| `scripts/speeds.py` | the merge check's two speeds: `interface` (docs/REVIEW.md's tier-3 paths alone: no StrykerJS) or `full`, which any other path, or any doubt, runs; `--full` is always whole ; with `--light`, whether a change of the interface alone, tier-3 folders of main's table and the tree's and no tier-1 path of either, may take the radical mode's light gate |
| `scripts/scan_secrets.sh`, `scripts/gitleaks.toml`, `scripts/gitleaks-private.toml`, `scripts/.gitleaksignore`, `scripts/audit.py` | the secret scan and the dependency audit |
| `scripts/code_changed.sh`, `scripts/repo_files.py` | what the hooks and scripts share |
| `scripts/check_css.py`, `scripts/check_comments.mjs`, `scripts/check_docs.py` | the style and docs checks |
| `scripts/mutate.py` | the realms' mutation check |
| `scripts/patch_coverage.py`, `scripts/prove_fix.py`, `scripts/check_regressions.py`, `scripts/batch_size.py` | the no-regression net |
| `scripts/review_pass.py` | records and checks a `/pre-merge` pass |
| `scripts/probe.py`, `scripts/test_hooks.sh`, `scripts/harness_mutate.py`, `scripts/suite_parts.py` | the harness's own tests |
| `scripts/bench.py`, `app/tests/bench/` | the benches and their budgets |
| `scripts/workshop.sh` | `pnpm workshop`: the app's and the lab's dev servers on the tailnet (DEVELOPMENT.md, "The workshop") |
| `scripts/check_nginx.py`, `scripts/nginx.sha256` | `nginx -t` and the served build's policies, in the merge check; the pinned binary's checksum |
| `docs/review/findings.md`, `docs/review-log.md` | every finding; what Alexis caught and missed, each branch's cost |
| `docs/harness.html`, `docs/harness.png` | the picture above, and its source |
