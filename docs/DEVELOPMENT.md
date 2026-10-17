# Development

## Setup

The README's "Install" lists what to install. `pnpm install` runs the `prepare` script,
which points git at `.githooks` (the gate before each commit and merge; no attribution
lines). The gate needs Node 24.22.0 (from `.node-version`, found through nvm when the shell
has another; in a shell, `nvm use` picks it, since `.nvmrc` links to `.node-version`; nvm must be loaded
first, by `source ~/.nvm/nvm.sh` or the shell's profile), pnpm, Go 1.26, Python 3, gitleaks, and a gno toolchain that matches the chain.

Start Claude Code in this folder, so it reads the project's settings, hooks and sandbox, and
accept the folder's trust prompt. The project's plugins are enabled for everyone but each
person installs them once:

```bash
claude plugin install typescript-lsp@claude-plugins-official --scope project
claude plugin install context7@claude-plugins-official --scope project
claude plugin install gnomcp@gnoverse --scope project   # its marketplace is declared in .claude/settings.json
```

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

## The gate and the harness

`./scripts/check.sh` is the gate, and `./scripts/check.sh --full` the one `/pre-merge` runs.
What each step catches, the hooks, the permissions, the reviews and how the harness proves
itself: [HARNESS.md](HARNESS.md).

To regenerate the seal vectors after a change to `gno/tools/sealvec`, in `gno/`:
`go run ./tools/sealvec > r/seal/vectors_test.gno`.

**Secrets** live in `deploy/secrets/`, one file each, gitignored and unreadable by Claude
Code; the code reads them through `*_FILE` variables. Nobody pastes a key into a chat. The
Anthropic key is Alexis's own for tests, then the company's.

## Slices

One slice at a time, each with its plan in `docs/plans/` (ADR-0001 §14, CLAUDE.md).

The order, from phase 0 to phase 3, is in [plans/backlog.md](plans/backlog.md), with the
concepts of ADR-0002 placed in it. Each slice gets its plan before it starts.

Later: the seal store (`docs/plans/seal-store.md`), with private rooms in phase 2.
