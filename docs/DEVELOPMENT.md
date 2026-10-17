# Development

## Setup

```sh
git config core.hooksPath .githooks   # the gate before each commit and merge; no attribution lines
```

The gate needs Go 1.26, Python 3, and a gno toolchain that matches the chain.

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

1. **Realms:** `gno lint` and `gno test` on `./r/...`.
2. **Mutation check** (`scripts/mutate.py`; its header says how it works): every guard in a
   realm, removed in turn, must fail a test. The known gaps are listed there, with their
   reason.
3. **Reference client:** `gofmt` and `go vet`. `r/seal/vectors_test.gno` must be exactly
   what `go run ./tools/sealvec` prints. To regenerate it:
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
| Hard rules | Git hooks: the gate before each commit and merge, no attribution lines. Claude Code hooks: the Stop gate, `scripts/guard_git.py` (no hook is ever skipped), and from slice 1 `eslint --fix` on each edited file. Permissions: secrets unreadable; `git push`, `pnpm add` and `rm -rf` ask first | None |
| Checks | `scripts/check.sh`: realms, their mutation check, Go, the hooks. From slice 1: `tsc`, ESLint, Vitest with fast-check, StrykerJS on what changed, Playwright with axe, Lighthouse, the unused-code finder, the CSS linter, the benches | None |
| Plan | `/slice-plan <n>` writes the slice's plan; Alexis approves it before code | One short pass |
| Review | `/pre-merge`: the gate and mutations, the `test-auditor` (Sonnet) on the survivors, `/code-review`, and the `security-reviewer` (Opus) on tier-1 changes. At the end of a slice with tier-1 code, Alexis may run `/code-review ultra` | One pass per merge |
| Jarvis | promptfoo in `evals/`: the evals and the red team, answers cached | Only changed cases |

**Keeping it cheap:** subagents run on Sonnet unless their file says otherwise
(`CLAUDE_CODE_SUBAGENT_MODEL` in `.claude/settings.json`); agents get the diff's path, never
its content; one review pass; `/clear` between slices; `/usage` shows a session's cost.

**Once the repo has a remote:** CI runs `scripts/check.sh`; `/security-review` works (it
compares with `origin`); Code Review can review each pull request if the organization is on
a Team or Enterprise plan; any scripted `claude -p` run carries `--max-budget-usd`.

## Slices

One slice at a time, each with its plan in `docs/plans/` (ADR-0001 §14, CLAUDE.md).

The order, from phase 0 to phase 3, is in [plans/backlog.md](plans/backlog.md), with the
concepts of ADR-0002 placed in it. Each slice gets its plan before it starts.

Later: the seal store (`docs/plans/seal-store.md`), with private rooms in phase 2.
