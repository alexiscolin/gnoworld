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

It shows four loops, one inside the other: a commit through the commit gate, a branch through review and fixes, a slice through the chief's
integration, and the dream back into the rules; it shows the harness before phase 3a (D13168), and phase 4 redraws it. Its source is
[harness.html](harness.html). After changing it, render the image again from the
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
  the slice's integration branch, reads GitHub's gate, runs the slice's last `/pre-merge`, with the `design-reviewer` once more over every 3D view, then the dream.
  In slice 7 alone the parts follow each other with one full verification before the demo: a part runs neither a merge check nor the Workflow
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
  work is cut from: the merge check's file list, the reviewer's diff and `since` read from it. The merge check runs
  `sh scripts/check.sh` on the committed tree, which takes no option (D13168).
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
   once unless the commit gate, which Claude runs in the sandbox, passed on exactly this tree. The
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
   (F129). `commit-msg` holds the subject's form, refuses attribution lines, scans the message for secrets, and, in Claude Code's sandbox only, refuses a hidden
   character in it with the staged `scripts/hidden.py`, as pre-commit runs the staged scripts there (F5085, D36). `pre-commit`
   scans what is staged for secrets, then, in Claude Code's sandbox, runs the commit gate on a copy
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
7. **Before a merge.** `/pre-merge` (`docs/REVIEW.md`): `check.sh` on the committed tree, GitHub's gate, one combined review
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
   (its parents, its harness), with `git reset --hard` (it began on a clean tree). Pushing `main` (refused since D13168, which writes no full record; 3b removes this) wanted
   the hooks installed from it, the full gate recorded green on that code, the committed review
   pass for exactly that tree, and each harness file changed since the remote's `main` declared on
   a line `Harness-changed: <path> - why`. Claude can do neither: the sandbox refuses the merge's
   writes to the harness, and the push asks.
10. **The CI** on GitHub judges every pull request to main, every push to main and a run by hand: one job reads what the
    change calls for with the base commit's own detector, the checks run side by side, and `gate-ok`, the one check main
    will require, reads every result with the base commit's verdict; `nightly.yml` runs the long checks at night
    (`docs/plans/harness-overhaul.md`, phase 2).

## The gate

Two gates since the harness overhaul (D13168): `scripts/check.sh` before each commit, on what the change touches, in seconds; GitHub's,
`.github/workflows/gate.yml`, on each pull request, by what the change calls for, its one verdict `gate-ok`. The night, `nightly.yml`, runs what both leave out.

**The commit gate** (`sh scripts/check.sh`, which takes no option and takes seconds when no test runs, a minute or two when the tests or the whole tree run; pre-commit runs it on the staged copy, `GATE_CHANGED` listing the
change there). Four lanes side by side: a lane stops at its first failure, every lane runs to its end, and the gate fails when one did,
shows its output and ends on `check.sh: FAILED at <lane>:<step>`; a pass ends on `all checks passed in N s`.

| Lane | Steps | For a change of |
|---|---|---|
| lint | the harness's floor (`check_docs.py`, every `scripts/*.py` parsing, `sh -n` on each changed shell script, every `scripts/*.sh` and `.githooks/*` on a whole run), then Prettier (`--ignore-unknown`) and ESLint (`--no-warn-ignored`), each handed the change's files that exist, after `--` | the floor at every run; Prettier and ESLint for any file but prose and the realms |
| types | `tsc`, incremental: the worktree's `.claude/tmp/tsc`, the staged copy a folder of the run's own | the TypeScript's sources and what they read: `app/src`, `app/tests`, `app/data`, `app/lab`, `app/public`, `server/src`, `jarvis/src`, `link-reader/src`, `packages/*/src` |
| tests | Ergo's build, then Vitest's `related` command on the paths `scripts/related.py` gives, the `timing` tests left out | a tier-1 path (docs/REVIEW.md's rows, `scripts/speeds.py --tier1`, any doubt tier 1) of the same areas, or of `deploy/`, whose files some tests read from disk (`server/src/prices/prices.test.ts`); every other change's tests run on GitHub's unit job when TypeScript or its config changed (node, ui, compiled, the `timing` ones apart), else at night (the speed plan's rule: a change of shared code runs some 450 test files, 100 s) |
| gno | `gno lint` and `gno test` on `gno/...` | `gno/` |

No change, prose alone, a config, the lockfile or a path no area places: every lane on the whole repository, Prettier from the worktree's
cache, every test of the node, ui and compiled projects but the `timing` ones. The harness (`scripts/`, `.githooks/`, `.github/`,
`.claude/`), `deploy/`, `evals/` and `tools/` get no type check; `deploy/`, tier 1, gets its related tests, the others none before the
night: their suites are their own, `test_hooks.sh`, `probe.py` and `deploy/test.sh` on GitHub and by hand while the
change is written (`ONLY=<section> sh scripts/test_hooks.sh`, `python3 -I scripts/probe.py`, with `.node-version`'s Node first on the
PATH, `~/.nvm/versions/node/v<version>/bin`, which check.sh gave them until D13168), the evals and `tools/agent-github/test.sh` by hand. In a repository the gate first refuses git hooks taken from
elsewhere than `.git/hooks`, and, in the sandbox, a `.git/hooks` or `.git/config` a command can write or a hook not installed (F129); it
records the code it passed for the hooks outside the sandbox (`.githooks/records.sh`, F076). No commit's gate walks a journey: a session
that writes or changes one runs that spec itself before committing (`node app/node_modules/@playwright/test/cli.js test -c
app/playwright.config.ts <spec>`).

**GitHub's gate** (a pull request, a push on `main`, a run by hand): what the change calls for, by the base commit's own detector
(`scripts/ci_changes.sh`, which runs `scripts/speeds.py --tier1` from the base), in jobs of 15 minutes at most but `deploy-stack`'s 40: the types; the lint
(Prettier, ESLint, knip, jscpd, the CSS and comments rules, `check_docs.py`, every script parsing, the audit, gitleaks over the change by
the base's rules); zizmor; Vitest in three shards with one retry; core's tests in Chromium and, for a change of the design system or the harness, the stories, never their pictures; the
critical journeys; the build, the first screen's budget and nginx (`scripts/check_nginx.py`, for an app change alone: F13186), which a commit's gate no longer builds; gno, its mutants (`scripts/mutate.py`) and
the Go tools; the coverage and the patch's (`scripts/patch_coverage.py`, from the base); StrykerJS on the changed tier-1 lines
(`scripts/stryker_lines.py`, from the base; no job fails on its survivors yet, F13184); the regressions and the migrations (`scripts/check_regressions.py`,
`scripts/check_migrations.py`, from the base); `deploy/test.sh` when `deploy/` changes; the harness's own `probe.py` and `test_hooks.sh`
when the harness changes. `gate-ok` reads every job with the base's `scripts/ci_gate_ok.py`.

**The night** (on `main`): the 41 journeys of the gate's list and the old merge list (the other 68 specs of `app/tests/e2e` run by
hand: F13185); the `timing`, display and slow Vitest projects; StrykerJS over tier 1; `harness_mutate.py`,
`test_hooks.sh` and `probe.py` whole; gitleaks over the history and the audit; gno's tests and mutants; `deploy/test.sh --mutants`. A red
night opens or updates the issue "Nightly red".

**By hand, run by no gate** (D13168): the benches (`python3 -I scripts/bench.py`; four were red when the gate left them, F13182); the
pictures and the flash's pixel test (`app/playwright.pictures.config.ts`, `app/playwright.stories.config.ts`); StrykerJS on a file of
one's own (`docs/DEVELOPMENT.md`); `check_nginx.py` on the Mac (`docs/DEVELOPMENT.md`, "The pinned nginx").

**The related tests** (Alexis, 2026-11-04: 212 fast gates past their budget in two days, the whole Vitest suite the slowest step in 210):
a commit's Vitest runs, for a tier-1 change (the tests lane above), only the tests it asks for, through Vitest's own `related` command (`vitest related --run`, with the
projects of package.json's `test` script, which must start with `vitest run`; Vitest 4.1.12 has no `run --related`). `scripts/related.py`
gives it the paths: every changed path but prose, whose importers, at any depth, Vitest finds; `server/src/main.test.ts` for any code of
the server, core or the schemas, as it runs the server as a child process, outside that graph; and the code that reads a changed place
from disk, found by a grep of `new URL(<place>, import.meta.url)`, of a path written from the repository's root and of `join("deploy",
...)`. A place named any other way (`__dirname`, `process.cwd()`, `import.meta.dirname`, `import.meta.url` outside `new URL(...)`, a
resolve, `createRequire`) is refused, file and line, in a run of the related tests and, as `related.py --check`, in a run of every one.
The staged copy gets the related tests too, from its list.

**The timing tests** (Alexis, 2026-11-04): a test that reads a clock carries Vitest's tag `timing` (`{ tags: ["timing"] }`, defined in
vitest.config.ts). The commit gate and GitHub's gate leave them out (`--tags-filter=!timing`); the night runs them. Run them alone:
`pnpm exec vitest run --tags-filter=timing`.

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
run is no row; nothing records one that GitHub's retry passed (D13168).

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

- **The server judges, it does not block yet.** `main` changes only through a pull request (D13165), but no check is required:
  Alexis merges by `gate-ok`'s verdict, and the local hooks can be skipped by someone who means to (F001, F009).
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
- **A commit's lint reads the change's files alone** (D13168): a type changed in one file that turns another's typed rule red is
  found by GitHub's lint job, or by `sh scripts/check.sh` on a clean tree, which lints the whole repository. Two gates at once in one
  worktree share its `.tsbuildinfo`.
- **A commit's gate trusts Vitest's module graph, `main.test.ts` and the map's grep** (`scripts/related.py`): a test
  that runs code in a child process other than the server's (`app/src/dataFiles.test.ts` builds the app) runs for a change
  of code only when the graph holds it, and a read through a place built from another's (`join(APP, "..", "deploy")`) is seen
  as its base; a path built at run time from no literal the grep knows is not seen. Markdown is prose outside the sources only,
  for the gate, `code_changed.sh` and the record's print alike (a recorded chain page under them is a fixture). A part's end
  (`sh scripts/check.sh` on the committed tree) and GitHub's gate run every test of the fast projects, the night the rest.
- **pre-commit trusts the record of a green gate** on the staged code instead of running the gate again (F076's record, which
  the sandbox can forge); the CI keeps none.
- **Core's tests alone run on both engines,** Node's V8 and Chromium's (F816, F817).
- **No script proves a fix's test failed before it** since `prove_fix.py` left with check.sh's old lanes (D13168): the reviewer reads it;
  a fix of the harness is proven by `harness_mutate.py`.
- **Two caches every tree shares** (`~/.cache/gnoworld-tools`): StrykerJS's incremental file and the harness mutants'
  verdicts. A verdict is reused when what it was keyed on is unchanged; StrykerJS does not see a test helper it neither
  mutates nor counts as a test, and a harness verdict sees only the files its sections name. So a "killed" judged in
  another branch's tree can stand in a local run. The CI keeps neither cache and judges everything on each push
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
| `scripts/check.sh` | the commit gate |
| `scripts/ergo.sh`, `scripts/workshop.sb`, `scripts/load.py` | the Ergo the server's tests start; the workshop's Seatbelt profile; the machine's load, for the benches |
| `scripts/related.py` | the unit tests a commit's change asks for: the paths for Vitest's `related` command, `main.test.ts`, the readers of a place on disk |
| `scripts/stryker_lines.py` | the code GitHub's StrykerJS mutates: the changed tier-1 lines |
| `scripts/worktree.sh`, `scripts/borrow_node_modules.sh` | a branch's worktree with its packages, made and removed in one root alone; a copy borrowing the installed packages, a workspace's `.bin` its own |
| `.github/workflows/gate.yml` | the gate on GitHub: a pull request to main, a push to main or a run by hand, `gate-ok` its verdict |
| `.github/workflows/nightly.yml` | the night on GitHub: 41 journeys, StrykerJS and the harness whole, the history's secrets; a red night opens one issue |
| `.github/CODEOWNERS` | the core, whose change needs an owner's approval once main's ruleset asks for it |
| `scripts/ci_changes.sh`, `scripts/ci_gate_ok.py` | what a change calls for, and gate-ok's verdict, each run from the base commit |
| `app/playwright.config.ts`, `app/tests/e2e/` | the app's journeys, against a real server and a real Ergo |
| `scripts/guard.py`, `scripts/stop_gate.sh`, `scripts/dream_due.sh` | Claude Code's hooks (the last is SessionStart's: it says a dream is due when `main` has a merge after the `The dream of <sha>` rows of `docs/review-log.md`, on `main` and on the branches it has not got, for a row lands on the next slice's branch (F4063); it reads committed rows with read-only git and blocks nothing) |
| `scripts/speeds.py` | `--tier1`: whether a change holds a tier-1 path of docs/REVIEW.md, or one it cannot place (GitHub's detector, from the base) |
| `scripts/scan_secrets.sh`, `scripts/gitleaks.toml`, `scripts/gitleaks-private.toml`, `scripts/.gitleaksignore`, `scripts/audit.py` | the secret scan and the dependency audit |
| `scripts/code_changed.sh`, `scripts/repo_files.py` | what the hooks and scripts share |
| `scripts/check_css.py`, `scripts/check_comments.mjs`, `scripts/check_docs.py` | the style and docs checks |
| `scripts/hidden.py` | the characters no text holds raw: check_docs's rule, in a file of its own to be shared |
| `scripts/mutate.py` | the realms' mutation check |
| `scripts/patch_coverage.py`, `scripts/check_regressions.py` | the no-regression net |
| `scripts/review_pass.py` | records and checks a `/pre-merge` pass |
| `scripts/probe.py`, `scripts/test_hooks.sh`, `scripts/harness_mutate.py`, `scripts/suite_parts.py` | the harness's own tests |
| `scripts/bench.py`, `app/tests/bench/` | the benches and their budgets, run by hand (F13182) |
| `scripts/workshop.sh` | `pnpm workshop`: the app's and the lab's dev servers on the tailnet, the chat's backend behind the app's (DEVELOPMENT.md, "The workshop") |
| `scripts/check_nginx.py`, `scripts/nginx.sha256` | `nginx -t` and the served build's policies, in GitHub's build job; the Mac's pinned binary's checksum |
| `docs/review/findings.md`, `docs/review-log.md` | every finding; what Alexis caught and missed, each branch's cost |
| `docs/harness.html`, `docs/harness.png` | the picture above, and its source |
