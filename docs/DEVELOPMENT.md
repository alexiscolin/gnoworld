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
The app's journeys need Playwright's Chromium, once per Playwright version (a commit's gate walks none: run the spec you write or change yourself, `node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts <spec>`; the merge check and `--full` walk them all): `node app/node_modules/@playwright/test/cli.js install chromium`
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

## The pinned nginx

The merge check (`check.sh --merge`) runs `nginx -t` on the image's `deploy/web/nginx.conf` with the build's table, then serves the
built pages and asks each at its slashed, bare and `index.html` addresses (`scripts/check_nginx.py`; HARNESS.md). Docker is refused in
the sandbox, so it needs an nginx at the image's version, 1.30.6 (`deploy/web/Dockerfile`), in the tools' cache, and a merge check
without it fails: it never skips. It was set up once on the machine that runs the merge checks (the chief, 2026-10-31); anyone who
sets up another does the same:

1. Build nginx 1.30.6 from nginx.org's source release, its signature checked (`gpg --verify` of `nginx-1.30.6.tar.gz.asc` against the
   key `D6786CE303D9A9022998DC6CC8464D549AF75C0A`, from `https://nginx.org/keys/pluknet.key`; the tarball was good). The prefix is the
   pin's own folder: `./configure --prefix=$HOME/.cache/gnoworld-tools/nginx-1.30.6 --with-cc-opt=-I/opt/homebrew/opt/pcre2/include
   --with-ld-opt=-L/opt/homebrew/opt/pcre2/lib`, then `make` and `make install`.
2. One local patch, in `src/os/unix/ngx_darwin_init.c`: the loop over the sysctls passes over `NGX_EPERM` as it does `NGX_ENOENT`. The
   sandbox refuses reading `net.inet.tcp.sendspace`, and without the patch nginx does not start there.
3. The binary is at `~/.cache/gnoworld-tools/nginx-1.30.6/nginx` and `conf/mime.types` beside it (`GNOWORLD_TOOLS` moves the cache).
4. Its checksum is in `scripts/nginx.sha256` (one line: `shasum -a 256 ~/.cache/gnoworld-tools/nginx-1.30.6/nginx`), committed
   with a line `Harness-changed: scripts/nginx.sha256 - why`. Recorded: `ad773dcb709c8cb21a0fecd1b50bac4511d1847d4e20fa68247967ac84897a68`.
   The check runs the binary only when its SHA-256 is the pinned one; a rebuilt binary has another and needs a new pin.

The step passes on the real binary with no warning (the build's table is sized, F2454). Its logs go to a file of its own folder, not
`/dev/stderr`, which the real `nginx -t` cannot open under the sandbox. F2459's and F2460's faults, planted by hand on a scratch copy,
each fail it on the real binary (`.claude/tmp/slice-5/reports/slice-5-harness-c-final.md`); the stand-in for nginx in
`scripts/test_hooks.sh` models them for every run.

## The gate and the harness

`./scripts/check.sh` is the gate, and `./scripts/check.sh --full` the one `/pre-merge` runs.
A commit's gate runs the unit tests related to its change (HARNESS.md, "The related tests"); before a part's report,
`./scripts/check.sh --tests-all` runs every test of the commit's projects (node, ui, compiled); the slow ones (the real Ergo,
the soak) and core's in Chromium run at the merge check and in `--full`. Design still being tried lives in the workshop
(this file's "The workshop") and lands later, in one tested batch (REVIEW.md, "Keep it cheap").
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

## The workshop

Design is tried here before it lands (`docs/decisions.md`, 2026-11-04): the lab's pages on Vite's dev server, with hot reload,
and their tuning panel on the real renderer, opened from the MacBook or a phone over Tailscale. No gate runs per tweak. An accepted
batch then lands once, in a part of its own: test first, through the gate and one review, with pictures where it moves an approved
one. A small isolated fix (about 20 product lines, no tier-1 or harness file) takes the fast lane instead: its test seen failing,
the gate, the journeys that watch it, one `reviewer`.

**Start it** in your own terminal, from a worktree or the main checkout (the sandbox reaches neither Tailscale's socket nor a server
it could stop):

```sh
cd app
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"
host=$(tailscale status --json | python3 -c 'import sys,json;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
LAB_HOSTS="$host,$(tailscale ip -4 | head -n 1)" node_modules/.bin/vite --config lab.config.ts &
~/.claude/skills/tailnet-preview/scripts/tailnet-preview.sh up workshop 5199
```

The dev server listens on 127.0.0.1:5199 alone and answers only the names `LAB_HOSTS` lists, exactly. By path it serves the app,
the packages and their store, never the repository's root, whose `deploy/` holds secrets (`lab.config.ts`). The
`tailnet-preview` skill's script prints two links. On the MacBook or the phone, open the https one with `/realism.html` after it:
`https://<host>:<port>/realism.html` for the planets' views, and `/realism.html?view=cosmos` for the site's own scene
(`&arrive=<system>` for a system's view). The http link on the Tailscale IP is the fallback for a device without Tailscale's DNS.
It is not a secure context, so Copy cannot reach the clipboard there; select the list instead. Stop the workshop with
`tailnet-preview.sh down workshop`, then end the dev server.

**The panel:** T shows and hides it, on either page, and so does its Tuning button in the corner, for a phone.
- **Scene.** The scene's values the page's code has read: Exposure (the image grade, `app/src/scene/renderer.ts`), Lean at home
  (`LEAN`) and, at a system's view, its share of that lean (`ARRIVAL_LEAN = LEAN / 2.2`), both in
  `packages/core/src/space/drift.ts`. A Plan keeps its own share.
- **Colours.** The palette's primitives (`--p-*`, read from the design system's sheet).
- **Sizes.** The labels' font sizes (`--font-ui`, `--font-data`) and paddings (`--space-2xs`, `--space-xs`).

Colours and sizes are set on `:root`'s own style; no product code is touched. Every change draws at once. Keys, drags and wheels
inside the panel stay there. Copy lists the values changed, one line each, with where each lives in code; Reset puts back the
code's values. A code edit reloads the page and loses the panel's values, so copy first.

**Making a value tunable:**
- **A size token of `tokens.css`** needs only its name in `app/lab/panel.ts`'s lists; every primitive colour is offered already.
- **A scene value** gets a name in `TUNABLES` and a row in `app/lab/controls.ts`. It also gets one read where the value is used,
  written on the lab's switch: `import.meta.env.GNOWORLD_TUNING === "1" ? tuned(name, VALUE) : VALUE`, or `applyTuned` for a value
  set once on an object, as the renderer's exposure.

Only `lab.config.ts` defines the switch. The site's build folds each read back to `VALUE` and drops the registry
(`app/src/scene/tuning.ts`). Write the read so that it folds to the code that was there: in an expression, not a new variable the
minifier keeps. Then build the site before and after and compare every file (`tuning.spec.ts` holds the names out of the site's
build, and the budgets hold the bytes).

**Landing a batch:** paste Copy's list to Claude. The values land in code as one part, test first.

## Slices

One slice at a time, each with its plan in `docs/plans/` (ADR-0001 §14, CLAUDE.md): a chief session
plans it and cuts it into branches, each run in a session and a worktree of its own, two at once at
most (`docs/HARNESS.md`, "Who does what").

The order, from phase 0 to phase 3, is in [plans/backlog.md](plans/backlog.md), with the
concepts of ADR-0002 placed in it. Each slice gets its plan before it starts.

Later: the seal store (`docs/plans/seal-store.md`), with private rooms in phase 2.
