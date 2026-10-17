# Development

## Setup

The README's "Install" lists what to install. `pnpm install` runs the `prepare` script,
which points git at `.githooks` (the gate before each commit and merge; no attribution
lines). The gate needs Node 24.22.0 (from `.node-version`, found through nvm when the shell
has another), pnpm, Go 1.26, Python 3, a gno toolchain that matches the chain, and, for
`--full`, gitleaks.

## Toolchain

The chains run the release named in ADR-0001's "Verified against" row. The gate uses
`$GNO_TOOLCHAIN/gno` and `$GNO_TOOLCHAIN/gnohome`. `GNO_TOOLCHAIN` defaults to
`~/.cache/gno-toolchains/onyx`, the same toolchain gnogolf uses. To build one from a gno
checkout without touching it:

```sh
T=~/.cache/gno-toolchains/onyx-v1.5.1
mkdir -p $T/src && git -C ~/Server/gno archive v1.5.1 | tar -x -C $T/src
(cd $T/src && go build -o $T/gno ./gnovm/cmd/gno && cd contribs/gnodev && go build -o $T/gnodev .)
GNO_TOOLCHAIN=$T GNOROOT=$T/src ./scripts/check.sh   # the first run downloads p/nt/* into $T/gnohome
```

## The gate

`./scripts/check.sh` stops at the first failure:

1. **Realms:** `gno lint` and `gno test` on `./r/...`, from `gno/`, where everything on the
   chain lives (realms, later gno packages, and the Go tools around them).
2. **Mutation check** (`scripts/mutate.py`; its header says how it works): every guard in a
   realm, removed in turn, must fail a test. The known gaps are listed there, with their
   reason.
3. **Reference client:** `gofmt` and `go vet`. `gno/r/seal/vectors_test.gno` must be exactly
   what `go run ./tools/sealvec` prints in `gno/`. To regenerate it, in `gno/`:
   `go run ./tools/sealvec > r/seal/vectors_test.gno`.

The pre-commit hook runs the gate on what is staged, and skips it when only docs are staged (`docs/`, `adr/`, Markdown, `.claude/`). `scripts/test_hooks.sh`, run by the gate, checks the hooks themselves. Claude Code's Stop hook
(`scripts/stop_gate.sh`, set in `.claude/settings.json`) runs the gate when a turn changed
code, and blocks the turn once if it fails.

## The harness

What keeps code written with Claude Code correct, cheap and fast. What costs no tokens runs
first.

| Layer | What | Cost |
| --- | --- | --- |
| Context | `CLAUDE.md`, short, always loaded; `.claude/rules/`, one file per area, loaded when its files are touched | Small, cached |
| Hard rules | Git hooks: the gate before each commit and merge; the full gate before each push, and `main` only with a committed `/pre-merge` pass (`scripts/review_pass.py`); no attribution lines. Claude Code hooks: the Stop gate, `scripts/guard_git.py` (no hook is ever skipped), `scripts/format_hook.sh` (`eslint --fix`, then Prettier, on each edited file). Permissions: secrets unreadable; `git push`, `pnpm add` and `rm -rf` ask first. The sandbox: commands write only in the project and its caches, and reach only the listed hosts | None |
| Checks | `scripts/check.sh`, under a minute: Prettier, `tsc`, ESLint (with `@eslint/css`), Vitest with fast-check, knip, jscpd, `clones.mjs`, `check_css.py`, `check_comments.py`, the realms and their mutation check, Go, the docs, the hooks. `--full` adds `probe.py`, coverage and `patch_coverage.py`, StrykerJS and gitleaks. From slice 1b: Playwright with axe, Lighthouse, the benches | None |
| Plan | `/slice-plan <n>` writes the slice's plan; Alexis approves it before code | One short pass |
| Tests first | After the failing tests, before the code: the `test-auditor`'s red pass (complete, relevant, impact first, security, against the plan) | One short pass |
| Review | `/pre-merge`: the gate and mutations, the `test-auditor` (Sonnet) on the survivors, `/code-review`, and the `security-reviewer` (Opus) on tier-1 changes. At the end of a slice with tier-1 code, Alexis may run `/code-review ultra` | One pass per merge |
| Jarvis | promptfoo in `evals/`: the evals and the red team, answers cached | Only changed cases |

**Keeping it cheap:** subagents run on Sonnet unless their file says otherwise
(`CLAUDE_CODE_SUBAGENT_MODEL` in `.claude/settings.json`); agents get the diff's path, never
its content; one review pass; `/clear` between slices; `/usage` shows a session's cost.

**Claude Code plugins,** on for this project (`.claude/settings.json`): `typescript-lsp`, to
navigate the code through the TypeScript language server; `context7`, for libraries' docs at
the pinned version. Each later one comes with its slice, since every plugin costs context in
every session: `chrome-devtools-mcp` (1b), `frontend-design` (2), `posthog` (12). Not Figma.

**Once the repo is pushed** (`origin`: github.com/alexiscolin/gnoworld, private): CI runs `scripts/check.sh`; `/security-review` works (it
compares with `origin`); Code Review can review each pull request if the organization is on
a Team or Enterprise plan; any scripted `claude -p` run carries `--max-budget-usd`.

**Secrets** live in `deploy/secrets/`, one file each, gitignored and unreadable by Claude
Code; the code reads them through `*_FILE` variables. Nobody pastes a key into a chat. The
Anthropic key is Alexis's own for tests, then the company's.

## Slices

One slice at a time, each with its plan in `docs/plans/` (ADR-0001 §14, CLAUDE.md).

The order, from phase 0 to phase 3, is in [plans/backlog.md](plans/backlog.md), with the
concepts of ADR-0002 placed in it. Each slice gets its plan before it starts.

Later: the seal store (`docs/plans/seal-store.md`), with private rooms in phase 2.
