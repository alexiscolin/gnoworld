# The harness

The harness is everything around Claude Code that keeps the code it writes correct, safe and
cheap: what Claude reads, what it may do, the checks every change goes through, the reviews,
and the tests that prove those checks work. This file is its one description; the others
point here.

Three ideas run through it:
- **A claim is not evidence.** A review's finding counts once a command or a failing test
  shows it; a fix counts once its test failed without it.
- **Every guard is proven.** Each check comes with a fault planted to show it catches it,
  and switching the check off must make a test fail.
- **What costs no tokens runs first.** Scripts and linters before any model.

## The picture

```
 what Claude reads          what Claude may do           what every change goes through
┌──────────────────┐   ┌──────────────────────────┐   ┌───────────────────────────────────┐
│ CLAUDE.md        │   │ .claude/settings.json    │   │ scripts/check.sh: the gate        │
│ CLAUDE.local.md  │   │  deny / ask rules        │   │  fast: every turn, every commit   │
│ .claude/rules/   │   │  the sandbox             │   │  full: /pre-merge, a push of main │
│ .claude/agents/  │   │ hooks: guard, format,    │   │ the no-regression net             │
│ .claude/commands/│   │  Stop gate               │   │ reviews and the findings ledger   │
└──────────────────┘   └──────────────────────────┘   └───────────────────────────────────┘
                 the harness tests itself: probe.py, test_hooks.sh, harness_mutate.py
```

## A change, from plan to merge

1. **Plan.** `/slice-plan <n>` writes the slice's plan in `docs/plans/`; Alexis approves it.
2. **Tests first.** Claude writes the failing tests and sees them fail. The `test-auditor`
   agent reviews them before any code (the red pass: complete, relevant, riskiest first,
   security). Their commit carries a line `Red-pass: <findings fixed>`. In `packages/core`
   the tests are marked `test.fails` and Alexis writes the code (pairing).
3. **Code.** Before each Bash command, web fetch or edit, `scripts/guard.py` runs. Formatting
   is the gate's (`pnpm format` fixes it): a hook runs outside the sandbox, so no hook runs a
   tool a sandboxed command could rewrite.
4. **End of each turn.** When code changed, the Stop hook (`scripts/stop_gate.sh`) stops the turn
   once unless the fast gate, which Claude runs in the sandbox, passed on exactly this tree
   (`check.sh` records it). The hook itself runs nothing from the repository.
5. **Each commit.** `commit-msg` holds the subject's form and refuses attribution lines.
   `pre-commit` scans what is staged for secrets, then runs the fast gate on a copy of what
   is staged, not on the working tree.
6. **A push of a work branch.** `pre-push` runs the fast gate and scans the history for
   secrets.
7. **Before a merge.** `/pre-merge` runs the full gate, the `test-auditor`'s green pass on the
   mutation survivors, `/code-review`, and the `security-reviewer` for a tier-1 change. Each
   finding is reproduced, then fixed or put to Alexis, and written to
   `docs/review/findings.md`. Then it records a review pass (`scripts/review_pass.py`).
8. **Alexis reviews,** blind first, in revdiff (`docs/REVIEW.md`).
9. **Merge and push, by Alexis, in his own shell.** The merge is made locally; pushing `main`
   runs the full gate again and needs the committed review pass for exactly that tree. Claude
   cannot do either: the sandbox refuses the merge's writes to the harness (F063), and over a
   remote session its commands cannot read the keychain that holds the GitHub token (F064).
10. **The CI** runs the full gate again on GitHub's machines, for every branch pushed.

## The gate

`scripts/check.sh` stops at the first failure and prints its time.

**Fast** (every turn, every commit, a work branch's push; it fails past 60 s):

| Step | What it catches |
|---|---|
| Prettier | unformatted code |
| `tsc` | type errors; `core` sees no DOM and no Node, so it cannot reach the network |
| ESLint, with `@eslint/css` | floating promises, swallowed errors, `any`, an incomplete switch, `eval`, import cycles, size and complexity limits, impure `core` (clock, chance, globals), switched-off tests, invalid CSS, unlayered CSS, physical properties |
| Vitest, with fast-check | failing tests; a test with no assertion |
| knip | unused files, exports and dependencies |
| jscpd | copies, renamed ones and near ones (similarity 0.8) |
| `scripts/check_css.py` | CUBE CSS: raw values outside tokens, layout outside compositions, unknown or unused tokens and classes, copied rules |
| `scripts/check_comments.mjs` | long comments, to-do markers, banners, numbered steps, emoji, escape hatches |
| `gno lint`, `gno test` on `gno/...` | every realm and package |
| `scripts/mutate.py` | a realm guard no test notices when removed |
| `gofmt`, `go vet`, the seal vectors | Go tools; `gno/r/seal/vectors_test.gno` equals what `go run ./tools/sealvec` prints |
| `scripts/check_docs.py` | a harness doc naming a file that does not exist; a bad row in the findings ledger |
| `scripts/test_hooks.sh` | the hooks, the guard, the settings' boundary, and the scripts below |

**Full** (`--full`: `/pre-merge` and a push of `main`) adds:

| Step | What it catches |
|---|---|
| `scripts/probe.py` | a lint rule, selector or check that no longer catches its planted fault |
| coverage | under 85% anywhere, under 100% (95% branches) in `core` |
| `scripts/patch_coverage.py` | under 85% of the changed lines run by a test, or a changed file no coverage measures |
| `scripts/prove_fix.py` | a fix of the product whose tests did not fail on the commit before it |
| StrykerJS | a mutant of the TypeScript that no test kills |
| `scripts/check_regressions.py` | the safety net shrinking (next section) |
| gitleaks | a secret anywhere in the history |
| `pnpm audit` | a dependency with a known advisory, moderate or worse |
| `scripts/harness_mutate.py` | when the harness changed: a guard of the harness that no test notices switched off |

## The safety net never shrinks quietly

`scripts/check_regressions.py` compares the branch with where it left `main`, and refuses:
- a test gone (Vitest, gno or Go; a rename included), or switched to `.fails`;
- a coverage threshold or the mutation floor lowered;
- a known gap added to a mutation check's `GAPS`, or an entry added to an ignore list;
- an approved screenshot changed.

Each is allowed only when a commit of the branch says why, on a line of its own:
`Removed-test: <test> - why`, `Lowered-floor: <floor>`, `Lowered-floor: gap <label>`,
`Lowered-floor: ignore <file> <entry>`, `Updated-baseline: <path> - why`. Alexis reads them
in review. A sentence that merely mentions a floor excuses nothing.

## Reviews and findings

A finding is a claim until it is reproduced: a command, or a test seen failing. Every finding
goes into `docs/review/findings.md` with its status (`claimed`, `reproduced`, `fixed`,
`rejected`, `asked`) and its evidence; a fixed one names its commit, a rejected one says why.
Reviews read the ledger first, so a rejected claim is not raised again and a fixed one that
comes back is a regression. The review agents (`.claude/agents/`) report rows for it.

| Who | When | Model |
|---|---|---|
| `test-auditor`, red pass | after the failing tests, before code | Sonnet |
| `test-auditor`, green pass | first in `/pre-merge`, on the mutation survivors | Sonnet |
| `/code-review` | every merge | Claude Code's |
| `security-reviewer` | a merge touching a tier-1 file | Opus |
| `finding-verifier` | after the review pass, on each tier-1 lot: refutes or reproduces each finding | Opus |
| Alexis | every merge, blind first | — |

## The boundary: what Claude may do

`.claude/settings.json`, read only when Claude Code starts in this folder or moves into it
with `/cd`:
- **Deny:** reading `.env`, `deploy/secrets/`, `~/.ssh`, `~/.config/gh`, `~/.npmrc`, `~/.aws`.
- **Ask Alexis first:** `git push` (the guard asks for any form of it), `pnpm add`, `rm -rf`,
  and every gnomcp write (`gno_addpkg`, `gno_call`, `gno_run`, `gno_key_send`,
  `gno_cla_sign`). Claude edits alone (Alexis, 2026-10-17), except what runs with Alexis's
  full access: `scripts/`, the git hooks and `.claude/` (the Claude Code hooks run outside the
  sandbox, and the git hooks run the gate in his shell when he pushes or merges), the
  `*.config.ts` files and `stryker.config.json` the gate loads, and what pnpm runs at his
  install (`package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.pnpmfile.cjs`) (findings F068,
  F076). The tests and `gno/tools` still run at his push with no ask; the backlog's
  "hooks that run no repository code" closes that. Ask and deny rules hold in every
  permission mode.
- **The sandbox** around shell commands: they write only in the project and its caches,
  never in the harness's files; they reach only the npm and Go registries and github.com;
  no command may leave the sandbox.
- **`scripts/guard.py`,** before each Bash call, web fetch and edit: no git hook skipped
  (`--no-verify` or its prefixes, `commit -n`, a hooks path or `GIT_CONFIG` override,
  `commit-tree`), no forced push; no `gnokey`, no raw call to the chain, and no `.gno` file
  written before the gno skill is loaded and gnomcp was used. It reads through wrappers
  (`env`, `xargs`, `timeout`...), `sh -c`, `eval` and `$(...)`; if it crashes, the call is
  blocked.

The guard and the hooks are a seatbelt, not a wall: a determined bypass exists for any
pattern list. What holds whatever happens is on the server, and there is none yet (see the
limits below).

## Plugins

On for this project (`.claude/settings.json`): `typescript-lsp`, to follow the code through
the TypeScript language server; `context7`, for a library's docs at the pinned version;
`gnomcp`, for everything about gno. Each later one comes with its slice, since every plugin
costs context in every session: `chrome-devtools-mcp` (1b), `frontend-design` (2),
`posthog` (12). Not Figma.

## How the harness proves itself

- **`scripts/probe.py`** plants one fault per guard (a swallowed error, a raw colour, a
  copied function, a long comment...) and checks that the right tool catches it, by the
  rule's own message.
- **`scripts/test_hooks.sh`** runs each hook and script on throwaway repositories: what each
  must refuse, and what it must let through.
- **`scripts/harness_mutate.py`** switches each guard off in turn, in a throwaway copy, and
  runs the one section of the probe or hook tests that belongs to it (`ONLY=<section>`): a
  guard whose removal no test notices is a guard nobody checks, and the run prints the test
  to add. It takes about two minutes, and runs in the full gate when the harness changed.
- **A new guard lands with its planted fault and its mutant;** a check whose test passes
  for the wrong reason is caught by the mutation. On 2026-10-17 this found a lint selector
  that had never matched, and an exit trap that turned any crash into success.

## Speed and cost

Measured on this machine, 2026-10-17: the fast gate 10 to 13 s (budget 60 s); the probe
4.7 s and the hook tests 5.9 s (both while the harness mutation ran beside them); the harness
mutation 118 s for 148 guards, against 384 s for 127 before each mutant ran only its own
section. Subagents run on Sonnet unless their file says
otherwise; agents get the diff's path, never its content; one review pass per merge.

## Is it solid?

Measured, not claimed: each `/pre-merge` records in `docs/review-log.md` how many verified
findings it found in the harness itself. Falling from merge to merge means solid. Flat over
three merges means the harness is simplified, not extended: a guard that keeps leaking gives
way to a boundary the system enforces (the sandbox, a server check), or goes. The first
measure, slice 1a's merge, found 25 or more, one of them a way out of the sandbox.

## Known limits

- **The server reports, it does not block.** The CI (`.github/workflows/gate.yml`) runs the
  full gate on every branch pushed, but GitHub cannot protect a branch on this
  repository's plan: a red run cannot stop a merge, and the git hooks on this machine can be
  skipped by someone who means to (findings F009, F001).
- **Claude Code's layer is active only in a session started in this folder,** or moved into
  it with `/cd`.
- **`prove_fix.py` covers the product;** a fix of the harness is proven by
  `harness_mutate.py` instead.
- **`scripts/mutate.py` mutates every realm on every commit;** it will need to mutate only
  the changed packages once there are many.
- **The review pass is recorded by the agent that ran the review;** the pre-push hook checks
  it matches the tree, not who wrote it.

## Files

| File | Role |
|---|---|
| `CLAUDE.md`, `.claude/rules/` | the rules Claude reads; each area's file loads when its files are touched |
| `.claude/settings.json` | permissions, the sandbox, the hooks, the plugins |
| `.claude/agents/` | `test-auditor`, `security-reviewer` |
| `.claude/commands/` | `/slice-plan`, `/pre-merge` |
| `.githooks/` | `commit-msg`, `pre-commit`, `pre-push` (`pnpm install` points git at them) |
| `scripts/check.sh` | the gate |
| `scripts/guard.py`, `scripts/stop_gate.sh` | Claude Code's hooks |
| `scripts/scan_secrets.sh`, `scripts/gitleaks.toml`, `scripts/audit.py` | the secret scan and the dependency audit |
| `scripts/code_changed.sh`, `scripts/borrow_node_modules.sh`, `scripts/repo_files.py` | what the hooks and scripts share |
| `scripts/check_css.py`, `scripts/check_comments.mjs`, `scripts/check_docs.py` | the style and docs checks |
| `scripts/mutate.py` | the realms' mutation check |
| `scripts/patch_coverage.py`, `scripts/prove_fix.py`, `scripts/check_regressions.py` | the no-regression net |
| `scripts/review_pass.py` | records and checks a `/pre-merge` pass |
| `scripts/probe.py`, `scripts/test_hooks.sh`, `scripts/harness_mutate.py` | the harness's own tests |
| `docs/review/findings.md`, `docs/review-log.md` | every finding; what Alexis caught and missed |
