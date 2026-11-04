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

Its source is [harness.html](harness.html). After changing it, render the image again from the
repository's root (in Claude Code's sandbox, launch Chromium with `args: ["--single-process"]`):

```sh
node -e 'const { chromium } = require("./app/node_modules/@playwright/test"); chromium.launch({ args: ["--single-process"] }).then(async (b) => { const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 }); await p.goto("file://" + process.cwd() + "/docs/harness.html"); await p.screenshot({ path: "docs/harness.png", fullPage: true }); await b.close(); });'
```

## Who does what

From slice 5 (Alexis, 2026-10-28, `docs/decisions.md`):
- **Alexis** approves each slice's plan, opens the sessions, reviews blind first, runs what the
  sandbox refuses (Docker's `deploy/test.sh`, the merge into `main`, the push), and accepts or
  refuses each rule the dream proposes.
- **The chief session**, one per slice, plans it (`/slice-plan`), makes the slice's shared folder
  (`.claude/tmp/slice-<n>/` with `reports/`), cuts it into branches, gives each branch its range of F numbers
  (two branches side by side once took the same ones) and Alexis each branch's starting brief, integrates the branches, runs the full gate and the
  slice's last `/pre-merge`, then the dream.
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
  and check changes, each with its evidence, prevalence and cost, standing on committed rows. Alexis
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
   product with no test and no `No-test:` line, scans the message for secrets, and, in Claude Code's sandbox only, refuses a hidden
   character in it with the staged `scripts/hidden.py`, as pre-commit runs the staged scripts there (F5085, D36). `pre-commit`
   scans what is staged for secrets, then, in Claude Code's sandbox, runs the fast gate on a copy
   of what is staged, scoped to the commit's paths (`GATE_CHANGED`), and records the code it
   passed. In Alexis's shell it runs no gate: the staged code must be code the sandboxed gate
   recorded green (`.githooks/records.sh`, F076).
6. **A push of a work branch.** `pre-push` wants a gate that passed on its code, nothing
   uncommitted, and scans the history for secrets.
7. **Before a merge.** `/pre-merge` (`docs/REVIEW.md`): `check.sh --merge`, one combined review
   by the `reviewer` agent (with the `security-reviewer` for a tier-1 file or the harness, the
   `gno-auditor` for a realm), the `finding-verifier` on tier-1 findings, high and medium fixed,
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
  docs   check_docs, parse ─▶ test_hooks.sh              ─▶ coverage  coverage ─▶ patch coverage ─▶ StrykerJS
     (the five lanes at once)                               harness   harness_mutate, in 4 worktrees
                                                         (two lanes at once, then two)
```

A failure in the stories or history lane stops the gate before the coverage and harness lanes,
which would take fifteen to twenty minutes to say nothing the fix will not change. When the full
gate fails, run the failing lane alone before running the whole gate again.

| A fast run's change | What runs beside the cheap checks (format, knip, jscpd, CSS, comments, check_docs) | Budget |
|---|---|---|
| `server/src` | tsc, ESLint, every Vitest test (`main.test.ts` runs the server as a child process, outside Vitest's module graph) | 30 s |
| the TypeScript of `app/src`, `packages/ui/src` | tsc, ESLint, Vitest's tests related to the change (`--changed`), the app's build (below) | 120 s |
| a test of the app (`app/src/*.test.ts(x)`), a journey or its helper (`app/tests/`) | tsc, ESLint, Vitest's tests related to the change; no build | 30 s |
| `packages/core/src`, or any other file of `app/src` and `packages/ui/src` (a fixture, a stylesheet) | tsc, ESLint, every Vitest test, the app's build | 120 s |
| `packages/ui/src/tokens.css` | as above, and the tokens story's pictures at their three widths (F1190) | 120 s |
| `gno/` | the gno lane | 30 s |
| anything else (a config, the lockfile, the harness, `packages/schemas`, `deploy/`), no change at all, or pre-commit's staged copy | everything | 120 s |

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
| `tsc` | type errors; `core` sees no DOM and no Node, so it cannot reach the network |
| ESLint, with `@eslint/css` | floating promises, swallowed errors, `any`, an incomplete switch, `eval`, import cycles, size and complexity limits, impure `core` (clock, chance, globals), a test switched off (`.skip`, `.only`, `.todo`, `.fails`), invalid or unlayered CSS, physical properties; in the app, React's hooks and compiler rules, a hand-written `memo`, raw HTML into the DOM, a folder's import against ARCHITECTURE.md's table, the network or storage outside `lib` and `sw`, `console`; the config is `eslint.config.ts` and its parts in `lint/` |
| Vitest, with fast-check | failing tests; a test with no assertion; the `compiled` project (`app/vitest.compiled.config.ts`), which counts what a re-render recomputes |
| knip | unused files, exports and dependencies |
| jscpd | copies, renamed ones and near ones |
| `scripts/check_css.py` | CUBE CSS: raw values outside tokens, layout outside compositions, unknown or unused tokens and classes, copied rules |
| `scripts/check_comments.mjs` | long comments, to-do markers, banners, numbered steps, emoji, escape hatches |
| the app's build, at a commit | a route or an import the types do not see; it walks no page |
| the app, in Playwright (the merge check and `--full`) | a page that fails to build, pre-render or hydrate, with the wrong tags, or with an accessibility violation (axe) |
| `gno lint`, `gno test` on `gno/...` | every realm and package |
| `scripts/mutate.py` | a realm guard no test notices when removed, or an operator flipped (`>=` and `>`, `<=` and `<`, `==` and `!=`, `&&` and `||`, `+` and `-`) or an integer shifted by one that none notices, on every line of code; one `gno test` run judges a package's guards and flips together, its time limit 1.5 s a copy and 60 s at least, so a busy machine slows a big package's run without failing it (F5051, D30), and a run still going 60 s past it, where gno's timer, which starts once the copies are loaded, never fired, stopped and failed by name (F5084); a `+`, `-` or number flip that does not compile is dropped and counted, any other mutant that does not compile fails; a `GAPS` key names its file and one mutant; a flip that loops forever fails by name, as no gap can hold it; in that run a filetest runs against the untouched copy, the first of its module in the workspace, so a survivor `GAPS` does not list is judged again alone, in a workspace of its own copy, where its filetests see it, and a gap is not (F5050); gno's output that is no UTF-8 reads as U+FFFD, never as a traceback (F5062) |
| `gofmt`, `go vet`, the seal vectors | Go tools; `gno/r/seal/vectors_test.gno` equals what `go run ./tools/sealvec` prints |
| `scripts/check_docs.py` | a harness doc naming a file that does not exist; a bad ledger row or one citing a missing commit; a known limit the runbook no longer says; a review agent's file missing or without its sentence `Never run a git command that writes the index or the work tree`; CLAUDE.md without the review card's item 8; a hidden character (`scripts/hidden.py`'s table, held to the pinned Node's Unicode: what shows nothing, the zero-width ones, the variation selectors and the tags; the format characters, the bidi controls and the BOM; the line and paragraph separators; an emoji's look selector right after it passes) in any file git tracks or would but an image (a `.png` or `.jpg` that starts with its format's bytes), read as the index holds it, what a commit takes, and as the work tree does where it differs, in a name or a link's target, or in a commit message since the branch left `origin/main`, named by its file, name or commit, line, column and code point, which a file that needs one writes as an escape; a file that is no UTF-8 text (a NUL, UTF-16, a binary of a format `IMAGES` does not name), refused whole from its first such byte (F5053, F5079, F5082, F5083, F5086 to F5089, D31 to D35) |
| `scripts/test_hooks.sh` | the hooks, the guard, the settings' boundary, the CI's promises, the scripts; a harness mutant that no longer finds its text (`harness_mutate.py --dry`) |

**One merge check at a time.** `check.sh --merge` takes the lock `~/.cache/gnoworld-tools/merge.lock`, a folder holding `pid`,
`worktree` and `since`, shared by every worktree of the machine: five side by side at a load of 25 to 40 on 16 cores failed by load
alone (2026-10-30). It waits for a live holder, printing which worktree holds it and since when, and never refuses; a holder whose pid is
gone (a crash, `kill -9`) leaves no wait, its lock taken over; a waiter that is interrupted frees nothing of another's. The fast gate and
`--full` take none, and the time a run prints leaves the wait out. `check.sh` also sets the soft limit (up or down) of open files to 10240 for its
steps (F2543), saying so when it cannot.

**Full** (`--full`: the slice's last merge and a push of `main`; `--merge`: each branch's
`/pre-merge`, with the harness mutants of the lines it changed, and without the stories,
the coverage lane and `prove_fix` when nothing but docs, the harness and the linters' configs changed since
`main`) adds:

| Step | What it catches |
|---|---|
| `scripts/probe.py` | a lint rule, selector or check that no longer catches its planted fault |
| the benches (`scripts/bench.py`, `app/tests/bench/`) | a bench over its budget, or one a source names that the report lacks; it first waits, up to 10 minutes, for the 1-minute load to fall under the machine's cores, prints the load it measured at, and refuses (no verdict) when the load stays up or cannot be read |
| `scripts/check_nginx.py` (`--merge` only) | nginx refusing the image's config with the build's table (F2459), or a served page answering the bare or another page's policy at its slashed, bare or `index.html` address (F2460); a pinned nginx 1.30.6 from the tools' cache, its checksum checked (`scripts/nginx.sha256`, DEVELOPMENT.md, "The pinned nginx"); a missing binary or build fails, never skips |
| `core_chromium`, the stories' journeys | core's tests on Chromium's engine; the design system's stories |
| `test:compiled` | the compiled project's render counts, run alone |
| coverage | under 85% anywhere, under 100% (95% branches) in `core` |
| `scripts/patch_coverage.py` | under 85% of the changed lines run by a test |
| `scripts/batch_size.py` | a merge's own product code past 600 lines (400 with a tier-1 file) with no `Batch-size:` line |
| `scripts/prove_fix.py` | a fix of the product whose tests did not fail on the commit before it, in any of 3 runs, unless it says why (`No-test: <why>`) or a later commit of the range does (`No-test: <short sha> - <why>`) |
| StrykerJS | a mutant of the TypeScript that no test kills (`checkers: ["typescript"]` stays); it starts from one cache every tree shares, `~/.cache/gnoworld-tools/stryker-incremental.json`, and puts its file back only whole |
| `scripts/check_regressions.py` | the safety net shrinking (next section) |
| `scripts/check_migrations.py` | a migration `main` has, edited, moved or removed (F466) |
| gitleaks | a secret anywhere in the history; a path into a home folder or the demo's host |
| `pnpm audit` | a dependency with a known advisory, moderate or worse |
| `scripts/harness_mutate.py` | a guard of the harness that no test notices switched off; over `HARNESS_SHARDS` worktrees (4), each first passing its suites untouched, two such controls at once (F2138); `--changed <base>` (a branch's merge check) judges only the mutants that rewrite a line changed since the last review pass (a change to a suite's section or to a guard file's other lines asks for none) and, when the script itself changed, those it defines anew or otherwise (sections a mutant only gained are no other definition: what S kills, S and T kill; one it lost is), and stops before judging more than 100 left after the cache, the way on being the chief's `check.sh --full`, which judges every one and which `main` requires, so a test a branch weakens shows there, not on the branch (Alexis, 2026-10-30); a killed mutant whose key holds (its text, its sections, the files they name, the runner; blank lines do not count, comments do, a `#` line in a heredoc being text) comes from a cache of verdicts, a survivor is always judged again |

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
read the ledger first, so a rejected claim is not raised again and a fixed one that comes back is
a regression.

| Who | When | Model |
|---|---|---|
| `test-auditor` | the red pass: after a branch's failing tests, before code | Sonnet |
| `reviewer` | each branch's `/pre-merge`: the green pass, correctness, security, cost, simplification | Opus |
| `security-reviewer` | a branch touching a tier-1 file or the harness | Opus |
| `gno-auditor` | every realm, line by line | gnomcp's |
| `finding-verifier` | the findings on tier-1 files: refutes or reproduces each | Opus |
| `/code-review ultra` | proposed to Alexis at a slice's last merge with tier-1 code | Claude Code's |
| Alexis | every merge, blind first | — |

## The boundary: what Claude may do

`.claude/settings.json`, read only when Claude Code starts in this folder or moves into it
with `/cd`:
- **Deny:** reading `.env`, `deploy/secrets/`, `~/.ssh`, `~/.config/gh`, `~/.npmrc`, `~/.aws`.
- **Ask Alexis first:** only `git push` and every gnomcp write (`gno_addpkg`, `gno_call`,
  `gno_run`, `gno_key_send`, `gno_cla_sign`).
- **Refused outright in the main checkout:** an edit of the harness (the guard, the Stop hook,
  the git hooks, `.git/hooks` and `.git/config`, Claude Code's settings, agents, commands, skills,
  rules, workflows and hooks in `.claude/` but `.claude/tmp/`, the `package.json` files and what pnpm loads,
  `scripts/worktree.sh` and the scripts it runs, which leave the sandbox, every worktree's `.git`, and,
  from any session, the main checkout's `.git/hooks`, `.git/config`, `scripts/` and `.githooks/`),
  `pnpm add` and `rm -rf`. A branch changes the harness in its own worktree, where Alexis sees
  each such file at `merge.sh`; a merge into a part's branch that changes the harness is his too,
  in his terminal, never another session's (F5055, F5058). In his shell the hooks run nothing of
  the repository but the records the sandboxed gate wrote (F076).
- **The sandbox** around shell commands: they write only in the project, its worktrees and its
  caches, never in `.git/hooks` or `.git/config`, nor in any worktree's `.git` (F5095); another
  worktree is no folder of theirs, as every one sits in `~/Server/gnoworld-wt/` (F5058). They reach
  only the npm and Go registries and github.com. One command of the project's settings leaves the
  sandbox, `sh scripts/worktree.sh *` (`excludedCommands`), which writes the trees it makes and
  removes, in its one root; the guard lets it run only alone, its words plain, from the project's
  root, and the file tools can edit neither it, nor the scripts it runs, nor a worktree's `.git`.
- **`scripts/guard.py`,** before each Bash call, web fetch and edit: no git hook skipped, no
  forced push, no recursive delete of a path a variable may leave empty (only `${name:?}`), no
  `gnokey`, no raw call to the chain, and no `.gno` file written before the gno skill is loaded
  and gnomcp was used, and no `worktree.sh` run but alone, as `sh scripts/worktree.sh` and plain
  words, from the project's root: elsewhere those words would run a script the session can write,
  and behind anything else in the call, something else outside the sandbox (F5058). It reads
  through wrappers, `sh -c`, `eval` and `$(...)`; if it crashes,
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
- **A fast run trusts Vitest's module graph** for a change of the app's or the design system's
  TypeScript; the full gate runs every test.
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
| `.claude/agents/` | `test-auditor`, `reviewer`, `security-reviewer`, `finding-verifier`, `design-reviewer`, `dreamer` |
| `.claude/commands/` | `/slice-plan`, `/pre-merge`, `/dream` |
| `.claude/workflows/` | `branch`, a branch's loop |
| `.githooks/` | `commit-msg`, `pre-commit`, `pre-merge-commit`, `pre-push`; `records.sh`, the prints and the harness list; `merge.sh`, the merge that shows the harness first |
| `scripts/install_hooks.sh` | puts `main`'s hooks and the scripts they run in `.git/hooks` |
| `scripts/check.sh` | the gate |
| `scripts/unsteady.py` | the fast gate's second run of a failed file, and its log |
| `scripts/worktree.sh`, `scripts/borrow_node_modules.sh` | a branch's worktree with its packages, made and removed in one root alone; a copy borrowing the installed packages, a workspace's `.bin` its own |
| `.github/workflows/gate.yml` | the full gate on GitHub's machines |
| `app/playwright.config.ts`, `app/tests/e2e/` | the app's journeys, against a real server and a real Ergo |
| `scripts/guard.py`, `scripts/stop_gate.sh` | Claude Code's hooks |
| `scripts/scan_secrets.sh`, `scripts/gitleaks.toml`, `scripts/gitleaks-private.toml`, `scripts/.gitleaksignore`, `scripts/audit.py` | the secret scan and the dependency audit |
| `scripts/code_changed.sh`, `scripts/repo_files.py` | what the hooks and scripts share |
| `scripts/check_css.py`, `scripts/check_comments.mjs`, `scripts/check_docs.py` | the style and docs checks |
| `scripts/hidden.py` | the characters no text holds raw: check_docs's rule, in a file of its own to be shared |
| `scripts/mutate.py` | the realms' mutation check |
| `scripts/patch_coverage.py`, `scripts/prove_fix.py`, `scripts/check_regressions.py`, `scripts/batch_size.py` | the no-regression net |
| `scripts/review_pass.py` | records and checks a `/pre-merge` pass |
| `scripts/probe.py`, `scripts/test_hooks.sh`, `scripts/harness_mutate.py`, `scripts/suite_parts.py` | the harness's own tests |
| `scripts/bench.py`, `app/tests/bench/` | the benches and their budgets |
| `scripts/check_nginx.py`, `scripts/nginx.sha256` | `nginx -t` and the served build's policies, in the merge check; the pinned binary's checksum |
| `docs/review/findings.md`, `docs/review-log.md` | every finding; what Alexis caught and missed, each branch's cost |
| `docs/harness.html`, `docs/harness.png` | the picture above, and its source |
