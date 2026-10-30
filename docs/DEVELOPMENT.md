# Development

## Setup

The README's "Install" lists what to install. `pnpm install` runs no script. The git hooks
(no attribution lines, no secret; in Claude Code's sandbox the gate before each commit; in your
own shell no gate runs, the hooks check the code it recorded, F076) live in `.git/hooks`, where
no merge, checkout or sandboxed command writes, so no branch brings its own (F129). Install
them, and again after a merge that changes them, from `main`, never from the working tree, and
from the objects themselves, whatever a replace ref would show instead:

```bash
git --no-replace-objects show main:scripts/install_hooks.sh | sh
```

Merge a branch into `main` with `sh .git/hooks/merge.sh <branch>`: it shows each harness file
the branch changes, with its diff, and merges once you type the branch's name. The install turns
off fast-forward merges in this clone, which run no hook (`merge.ff false`; a pull stays a
fast-forward, `pull.ff only`). A plain merge
that changes the harness has written it before any hook runs, and its commit is refused; abort
it at once (`git merge --abort`). Pushing `main` wants the hooks installed from it. The gate needs Node 24.22.0 (from `.node-version`, found through nvm when the shell
has another; in a shell, `nvm use` picks it, since `.nvmrc` links to `.node-version`; nvm must be loaded
first, by `source ~/.nvm/nvm.sh` or the shell's profile), pnpm, Go 1.26, Python 3, gitleaks, and a gno toolchain that matches the chain.
The app's journeys need Playwright's Chromium, once per Playwright version: `node app/node_modules/@playwright/test/cli.js install chromium`
(the CI adds `--with-deps` for Linux's libraries), and Ergo's binary, which `sh scripts/ergo.sh` builds from the pin (the gate does).

Start Claude Code in this folder, so it reads the project's settings, hooks and sandbox, and
accept the folder's trust prompt. The project's plugins are enabled for everyone but each
person installs them once:

```bash
claude plugin install typescript-lsp@claude-plugins-official --scope project
claude plugin install context7@claude-plugins-official --scope project
claude plugin install gnomcp@gnoverse --scope project   # its marketplace is declared in .claude/settings.json
```

## A branch's worktree

Each branch works in a worktree of its own, made from the main checkout by one script, never by
hand: `sh scripts/worktree.sh <dir> <branch> <base>`. It makes the branch, links the main tree's
installed packages one by one (one store), and copies each workspace's `node_modules` with its
relative links and a `.bin` of its own; the gate's StrykerJS reads one incremental file every tree
shares (`~/.cache/gnoworld-tools/stryker-incremental.json`). Hand-made links
loaded React twice in Storybook and let the probe delete main's own `.bin/storybook` (F2127).
After a merge that changes the lockfile, install in the main checkout
(`PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH pnpm install --frozen-lockfile`); the sandbox
cannot remove a worktree's record in `.git/worktrees`, so `git worktree prune` is run in your shell.

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
`--merge` takes a lock shared by every worktree and waits for it: one merge check at a time on the machine (HARNESS.md).
What each step catches, the hooks, the permissions, the reviews and how the harness proves
itself: [HARNESS.md](HARNESS.md).

To mutate only your own files with StrykerJS, from the repository root and on the pinned Node (the
`PATH` check.sh sets): `node_modules/.bin/stryker run --mutate 'a.ts,b.tsx'`, one comma-separated
value. It replaces the config's `mutate` list (its log says `Found 2 of 935 file(s)`), keeps the
incremental file whole and takes no `--`. Two forms fail: `pnpm run mutate -- --mutate a.ts` hands
StrykerJS a literal `--` (`too many arguments for 'run'`, pnpm's own help: every later token reaches
the script verbatim), and `--mutate a.ts b.ts` reads `b.ts` as its config file. Without `--mutate`
the whole config runs: 9,062 mutants in 142 files, and its initial test run alone takes 2 min 22 s
(2026-10-27, load 5 to 19); one file (`packages/core/src/chat/compose.ts`, 57 mutants) takes 19 s
with `--force`, 4 s from the incremental file. Keep `checkers: ["typescript"]` (HARNESS.md).

To regenerate the seal vectors after a change to `gno/tools/sealvec`, in `gno/`:
`go run ./tools/sealvec > r/seal/vectors_test.gno`.

**Secrets** live in `deploy/secrets/`, one file each, gitignored and unreadable by Claude
Code; the code reads them through `*_FILE` variables. Nobody pastes a key into a chat. The
Anthropic key is Alexis's own for tests, then the company's.

## Slices

One slice at a time, each with its plan in `docs/plans/` (ADR-0001 §14, CLAUDE.md): a chief session
plans it and cuts it into branches, each run in a session and a worktree of its own, two at once at
most (`docs/HARNESS.md`, "Who does what").

The order, from phase 0 to phase 3, is in [plans/backlog.md](plans/backlog.md), with the
concepts of ADR-0002 placed in it. Each slice gets its plan before it starts.

Later: the seal store (`docs/plans/seal-store.md`), with private rooms in phase 2.
