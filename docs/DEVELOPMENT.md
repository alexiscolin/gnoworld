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

Each branch works in a worktree of its own, made from the root of a checkout whose packages are
installed (the main checkout, or the worktree a part is cut from) by one script, never by hand:
`sh scripts/worktree.sh <name> <branch> <base>`, `<name>` (a-z, 0-9 and -) a folder of
`~/Server/gnoworld-wt` (made once, in your shell), where no session's shell writes but its own
folder (Alexis, 2026-11-04; its file tools still can, F5095), which it may also be given in full.
Whatever the spelling (a `..`, a link, another path) it refuses any other folder, as it may run
outside the sandbox and must touch no other (F5058), and a base whose harness,
`CLAUDE.md` or package files are not its tree's (F5098). No part's session writes a sibling there, moves
one or plants one (7w3, F4893); the chief's session writes the folder by `--add-dir` (docs/HARNESS.md, "Who does
what"). It makes the branch, links the main tree's
installed packages one by one (one store), and copies each workspace's `node_modules` with its
relative links and a `.bin` of its own, through no link it did not make; the gate's StrykerJS reads
one incremental file every tree shares (`~/.cache/gnoworld-tools/stryker-incremental.json`). Hand-made
links loaded React twice in Storybook and let the probe delete main's own `.bin/storybook` (F2127).
`sh scripts/worktree.sh remove <name>`, from another tree,
removes a worktree of that root that holds no change, staged file or untracked file (git's own
check: its ignored files go with it, never what a link in it leads to) with its record, and keeps
its branch. It prunes no other record, which a session can point at nothing: `git worktree prune`
is run in your shell. In Claude Code it runs outside the sandbox: write the call alone, from the
checkout's root, with plain words (a bare `<name>`); the guard refuses any other form (a `cd`, a
`$(...)`, a `~`, an assignment, a redirect or another command in the call).
A branch with an upstream is deleted in your shell: in a session `git branch -D` cannot write
`.git/config`, so it deletes the branch but keeps its `branch.<name>` section, which a new branch
of that name would inherit (F5113). A branch `worktree.sh` made has no such section.
After a merge that changes the lockfile, install in the main checkout
(`PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH pnpm install --frozen-lockfile`).

A session writes its own worktree only: never another session's, by any tool, nor runs a command
that writes there (F5058). So a merge into a part's branch that changes the harness is Alexis's, in
his terminal: the part's own sandbox refuses those files (F5055), and the chief writing them for it
from his session was the hole F5058 names.

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

Design is tried here before it lands (`docs/decisions.md`, 2026-11-04): the app's screens on Vite's dev server, with hot reload,
opened from the MacBook or a phone over Tailscale. The lab (the realism page and its tuning panel) left with the 2026-11-09 batch:
`app/lab/` is gone, though `scripts/workshop.sh` and `app/lab.config.ts` still start a lab server that has no page to serve (to
remove, a harness change). No
gate runs per tweak. An accepted batch then lands once, in a part of its own: test first, through the gate and one review, with
pictures where it moves an approved one. A small isolated fix (about 20 product lines, no tier-1 or harness file) takes the
fast lane instead: its test seen failing, the gate, the journeys that watch it, one `reviewer`.

**Start it** with `pnpm workshop`, in your own terminal, from a worktree or the main checkout (the sandbox reaches neither
Tailscale's socket nor a server it could stop). `scripts/workshop.sh` serves the checkout it sits in, two dev servers of its app,
each started by its function `start` and put on the tailnet by `share`: the app's (`react-router dev`) on 127.0.0.1:5198 and the
lab's (`vite --config lab.config.ts`) on 5199, with `WORKSHOP_HOSTS` set to this machine's tailnet name and address; then, when
the `tailnet-preview` skill's script is installed, each on the tailnet under its own name, `workshop-app` and `workshop-lab`;
without it, the local addresses. It stops only processes it started itself (their pids and ports in `.claude/tmp/workshop.pid`):
a port held by anything else is said, never taken. Ctrl+C stops all three, the servers and the backend (below), and takes them
off the tailnet, and so does any of them that stops; a second `pnpm workshop` in the same checkout replaces the first, the
backend a run killed hard left included, and that run's names stay on the tailnet until the next one, or
`tailnet-preview.sh down workshop-app` and `down workshop-lab`.

**The ping-pong** (`pingpong` in `scripts/stop_gate.sh`; Alexis, 2026-11-04): while your own `pnpm workshop` serves a checkout,
a turn of Claude's in it ends without the gate (as every turn does by default since the speed plan), so each retouch shows live in a couple of minutes; the gate, the tests and the
review come once the batch is accepted, and pre-commit still gates every commit. The hook knows the workshop by its own shell,
running this checkout's `scripts/workshop.sh` from it, in its terminal's foreground group and outside every sandbox: a session's
sandboxed command cannot start one that counts. The code the workshop runs is outside Claude's sandbox, under a profile of its
own (`scripts/workshop.sb`): it writes its own folders and caches alone, reads of the home folder the code alone it runs, reaches
no keychain, no other app and no Unix socket but the system's. It cannot hold where that code listens, and its outbound network
stays open (HARNESS.md's known limits, F204, F4977): the servers listen on 127.0.0.1 because their configs say so, and macOS's
firewall is the wall against the LAN. Stop the workshop (Ctrl+C) when the ping-pong ends, as one left running keeps that
checkout's turns gate-free.

Each dev server listens on 127.0.0.1 alone and answers only the names `WORKSHOP_HOSTS` lists, exactly. By path it serves the app,
the packages and their store, never the repository's root, whose `deploy/` holds secrets (`app/vite.config.ts`'s `workshopServer`,
which both configs use). The `tailnet-preview` skill's script prints two links for each name, and the workshop says which is
which. On the MacBook or the phone, open the https ones:
- **`workshop-app`, the app's screens:** `https://<host>:<port>/` for the home, then `/earth`, `/w/<world>` and every route,
  the chat with them: the app's dev server alone proxies `/api` and `/ws` to the workshop's backend (below).
- **`workshop-lab`:** the second name the script puts on the tailnet; with `app/lab/` gone, no page answers there.

**The backend**, started once the app's server is on the tailnet (Alexis, 2026-11-04: "avec le chat dedans et toute l'UI"):
the journeys' real server and a local Ergo (`app/tests/e2e/workshopBackend.mjs`, through `api.mjs`'s `startBackend`, Ergo built
by `scripts/ergo.sh` first), on 127.0.0.1:5195 for the server, 5196 and 5197 for Ergo and its WebSocket
(`WORKSHOP_API_PORT`, `WORKSHOP_IRC_PORT`, `WORKSHOP_WS_PORT`), allowing the app's local address and its tailnet links as
origins. The app's dev server proxies `^/api/` and `^/ws$` there (`app/vite.config.ts`'s `workshopBackend`), the visitor's
address set by the proxy, never the browser's; Vite's proxy is a dev server's, so no build holds it, and the lab's server has
none. The chat, who is here and the rooms run on it; its roles are the journeys' (the shipped file and their test rooms). The
worlds job and the prices' timer run in it alone, never in the journeys' (`startBackend`'s `jobs`), reading the default universe's chain
and CoinGecko straight from this machine (the egress proxy is the deployment's) and writing into `.claude/tmp/workshop-data`
(`WORKSHOP_DATA_DIR`), kept from one run to the next; the app's dev server serves exactly `/worlds.json`, `/worlds-count.json` and
`/markets.json` from it, nothing else of it (`app/tests/e2e/workshopData.mjs`): the last run's at once, a 404 only before the very first
pass has written them (the worlds' pass reads every realm's history, minutes). The jobs' lines (`worlds_…`, `prices_…`, `height_…`) show in
the workshop's terminal. A login with Adena is untried here.

**A crowd** (Alexis, 2026-11-07): `cd app && node tests/e2e/crowd.mjs [--people 12] [--writers 5] [--base http://127.0.0.1:5198]` opens
simulated people on the running workshop, in headless Chromium, no scene, half on the Earth and the rest over the hubs' worlds; the
writers log in with Adena's stand-in and a test wallet and say a line ending "(sim)" every 20-90 s. It refuses any base but
127.0.0.1 or localhost (`node --test tests/e2e/crowd.test.mjs`), writes no file, and is in no gate. Ctrl-C leaves; the counts fall
when the streams close. Inside Claude Code's sandbox Chromium runs one process per browser, so there each person is a browser.

The http link on the Tailscale IP is the fallback for a device without Tailscale's DNS. It is not a secure context, so Copy
cannot reach the clipboard there; select the list instead.

**Landing a batch:** the accepted retouches land in code as one part, test first, in a session that reads the diff of what the workshop
showed (the lab's Copy list went with the lab).

## Probes and tools worth knowing

These are Playwright specs in `app/tests/e2e` (or `tests/tools`) that measure rather than guard; run one with
`node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts <spec>`, as any journey (the test build and its software GPU,
`?test-gpu`). The scene's engine is reached through `window.__gnoworldSpace`, which `features/universe/spaceHook.ts` sets in a
development or test-GPU build only; a production build holds no trace of it.
- **`smoothness.spec.ts`** records each flow of a reader's first minutes frame by frame (`smoothness.ts`, `smoothAnalysis.ts`) and fails on a
  jump or a bounce of what moves; a stall or a long frame is a number to compare between two trees, not a budget (the software GPU's times
  are not real ones). One JSON line a flow goes to the file `SMOOTH_OUT` names (default `smoothness.jsonl` in the system's temporary folder).
- **`earthSkeleton.spec.ts`** records the skeletons' lines and state in the Earth's page to the full chat, and in the arrival at the Earth
  from the universe and from its system (`SKEL_OUT`, default `earthSkeleton.jsonl`).
- **`chatTiming.spec.ts`** records, per frame, whether the camera is flying and the dock's opacity and place across a flight to a world's
  page: the chat must not show before the flight has ended (`CHAT_OUT`, default `chatTiming.jsonl`).
- **The picture tool** (`app/tests/tools/planetPictures.spec.ts`, its own config because the gate's journeys never walk `tests/tools`):
  `node app/node_modules/@playwright/test/cli.js test -c app/playwright.pictures.config.ts planetPictures` takes each world's picture of the
  chat's column once, from the engine as the rail draws it (`__gnoworldSpace.portraits`), at 88 px as WebP, and writes the manifest
  (`app/src/lib/worldPictures.json`) that `worldPictures.test.ts` checks against `pictureInputs.ts`'s hash of the inputs. Run it when the
  planets' look (`app/src/space/`) changes; the new pictures replace the old files in `app/public/world-pictures/`, which a commit declares
  with `Updated-baseline:`.
- **The link reader's tests** run with the unit tests (`pnpm run test`: `link-reader/src/**/*.test.ts` is in the `node` project). Its
  transport tests (`transport.test.ts`) need the `openssl` command: `tlsFixtures.ts` makes a CA and a leaf per name, once per run, in a folder
  of the system's temporary directory (never in the repository), and a missing or failing `openssl` fails the test with its message, it
  never skips. `memory.test.ts` runs the real codecs at their cap in a child with the image's flags and reads the peak resident memory,
  which must stay under the container's 256 MiB. What needs Docker (the reader's isolation, its way out, its guard rules) is
  `deploy/test-links.sh`, which `deploy/test.sh` sources: run `deploy/test.sh` from the commit you reviewed (docs/OPERATIONS.md) after any
  change to `deploy/`, the reader or what it fetches; it needs the network for its controls (`example.com`).

## Jarvis's evals

`evals/` is installed apart from the workspace (its own `pnpm-workspace.yaml`, with the workspace's supply-chain
rules, and its own lockfile): `cd evals && pnpm install --frozen-lockfile --ignore-scripts`, once, in your shell, so
no package's script runs there (F5317). They need Anthropic's key in a file
and gnomcp 0.11.0, and cost money for each case not kept in `evals/.cache`:
`ANTHROPIC_API_KEY_FILE=deploy/secrets/anthropic_api_key sh evals/run.sh`. `run.sh` checks the evals' own types
and Node tests first (`evals/test-*.ts`), then runs promptfoo's `eval` script, its results in `evals/results/`.
The gate lints `evals/` (its tsconfig takes zod's and Node's types from jarvis's install, which every tree has); knip
leaves it out, as promptfoo's binary resolves only where `evals/` is installed; `jarvis/src/routes.test.ts` holds the
cases to jarvis's wire. `run.sh` runs the branch's own code with the key, in your shell: run it on a commit you have
read (10j's security review, S1; question 10j-5).

## Slices

One slice at a time, each with its plan in `docs/plans/` (ADR-0001 §14, CLAUDE.md): a chief session
plans it and cuts it into branches, each run in a session and a worktree of its own, two at once at
most (`docs/HARNESS.md`, "Who does what").

The order, from phase 0 to phase 3, is in [plans/backlog.md](plans/backlog.md), with the
concepts of ADR-0002 placed in it. Each slice gets its plan before it starts.

Later: the seal store (`docs/plans/seal-store.md`), with private rooms in phase 2.
