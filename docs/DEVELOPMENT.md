# Development

## Start here

1. **Install** git, Python 3, Go 1.26, Node 24.22.0 (`.node-version`; with nvm, `nvm install`) and pnpm 12.14.0, then
   `pnpm install`, which runs no package's script.
2. **Run** `pnpm dev`: the app with hot reload, no Docker and no secret. The chat needs a backend: `pnpm workshop` starts one
   with the app, on macOS only ("The workshop", below).
3. **Test** with `pnpm run test` (the unit tests), `pnpm run typecheck` and `pnpm run lint`.
4. **Check** before a commit with `sh scripts/check.sh`, the commit gate on what the change touches. It also needs gitleaks, a gno
   toolchain ("Toolchain"), Ergo (`sh scripts/ergo.sh` builds it) and, for the journeys, Playwright's Chromium.
5. **Install the git hooks** once, from `main` ("Setup"). The installer also writes outside the repository: rules into every
   Claude Code profile's user settings (`~/.claude` and its siblings) and the `land` command into `~/.local/bin`.

Working with Claude Code (its sandbox, the worktrees, the coordinating session and its parts, `land`):
[process/claude-code.md](process/claude-code.md).

## Setup

The README's "Run it locally" lists what to install. `pnpm install` runs no script. The git hooks
(no attribution lines, no secret, no non-ASCII path; from Claude Code's sandbox no harness file, and Prettier and check_docs on
what is staged; in your own shell nothing of the working tree runs) live in `.git/hooks`, where
no merge, checkout or sandboxed command writes, so no branch brings its own. Install
them, and again after a merge that changes them, from `main`, never from the working tree, and
from the objects themselves, whatever a replace ref would show instead:

```bash
git --no-replace-objects show main:scripts/install_hooks.sh | sh
```

It also writes this machine's twins of the project's rules (the main checkout's, the worktrees' and the temporary folder's
paths, `scripts/machine_rules.py`) into every Claude profile's user settings, a copy of each file kept beside it. It
installs `land` too when python3, git, gh and gitleaks are on your PATH outside your home and temporary folders and
every Claude profile already keeps their folders from its sessions, which `tools/agent-github/install.sh` writes;
otherwise it says why, installs the hooks alone, and keeps the land already installed.

A branch reaches `main` as a pull request, merged on GitHub: `main` takes no push, and pre-push refuses one. The install
turns off fast-forward merges in this clone, so a merge always makes a commit, which pre-merge-commit checks (`merge.ff false`; a pull
stays a fast-forward, `pull.ff only`). A commit runs the secret scan, and from Claude Code's sandbox Prettier on the staged files and
the docs check, a harness file refused; `sh scripts/check.sh` is what you run before committing code. The gate needs the Node `.node-version` pins (first on PATH, as any version
manager puts it there, or in nvm's default folder; with nvm, `nvm use` picks it, since `.nvmrc` links to `.node-version`), pnpm, Go 1.26, Python 3, gitleaks, and a gno toolchain that matches the chain.
The app's journeys need Playwright's Chromium, once per Playwright version (no commit's gate walks one: run the spec you write or change yourself, `node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts <spec>`; GitHub's gate walks ten of the 110 on an app change, the nightly run 41): `node app/node_modules/@playwright/test/cli.js install chromium`
(the CI adds `--with-deps` for Linux's libraries), and Ergo's binary, which `sh scripts/ergo.sh` builds from the pin (the gate does).


## Toolchain

The chains run the release named in ADR-0001's "Verified against" row. The gate uses
`$GNO_TOOLCHAIN/gno` and `$GNO_TOOLCHAIN/gnohome`. `GNO_TOOLCHAIN` defaults to
`~/.cache/gno-toolchains/onyx`, the same toolchain gnogolf uses. To build one from a gno
checkout without touching it:

```sh
T=~/.cache/gno-toolchains/onyx-v1.5.1
mkdir -p $T/src && git -C <your gno checkout> archive v1.5.1 | tar -x -C $T/src
(cd $T/src && go build -o $T/gno ./gnovm/cmd/gno && cd contribs/gnodev && go build -o $T/gnodev .)
GNO_TOOLCHAIN=$T GNOROOT=$T/src ./scripts/check.sh   # the first run downloads p/nt/* into $T/gnohome
```

## The pinned nginx

`scripts/check_nginx.py` (GitHub's build job; on the Mac by hand, `python3 -I scripts/check_nginx.py` once the app is built) runs
`nginx -t` on the image's `deploy/web/nginx.conf` with the build's table, then serves the built pages and asks each at its slashed, bare
and `index.html` addresses (HARNESS.md); on GitHub, for an app change alone. Docker is refused in the sandbox, so on the Mac it needs an nginx at the image's version, 1.30.6
(`deploy/web/Dockerfile`), in the tools' cache, and a run without it fails: it never skips. Anyone who sets up another does the same:

1. Build nginx 1.30.6 from nginx.org's source release, its signature checked (`gpg --verify` of `nginx-1.30.6.tar.gz.asc` against the
   key `D6786CE303D9A9022998DC6CC8464D549AF75C0A`, from `https://nginx.org/keys/pluknet.key`; the tarball must verify). The prefix is the
   pin's own folder: `./configure --prefix=$HOME/.cache/gnoworld-tools/nginx-1.30.6 --with-cc-opt=-I/opt/homebrew/opt/pcre2/include
   --with-ld-opt=-L/opt/homebrew/opt/pcre2/lib`, then `make` and `make install`.
2. One local patch, in `src/os/unix/ngx_darwin_init.c`: the loop over the sysctls passes over `NGX_EPERM` as it does `NGX_ENOENT`. The
   sandbox refuses reading `net.inet.tcp.sendspace`, and without the patch nginx does not start there.
3. The binary is at `~/.cache/gnoworld-tools/nginx-1.30.6/nginx` and `conf/mime.types` beside it (`GNOWORLD_TOOLS` moves the cache).
4. Its checksum is in `scripts/nginx.sha256` (one line: `shasum -a 256 ~/.cache/gnoworld-tools/nginx-1.30.6/nginx`), committed
   with a line `Harness-changed: scripts/nginx.sha256 - why`. Recorded: `ad773dcb709c8cb21a0fecd1b50bac4511d1847d4e20fa68247967ac84897a68`.
   The check runs the binary only when its SHA-256 is the pinned one; a rebuilt binary has another and needs a new pin.
5. GitHub's build job builds its own from the same release, the tarball checked against its SHA-256 (`3cf46f5e…`, signed by the
   key above), with Ubuntu's pcre2 and zlib, and hands check_nginx.py that binary's checksum.

The step passes on the real binary with no warning (the build's table is sized). Its logs go to a file of its own folder, not
`/dev/stderr`, which the real `nginx -t` cannot open under the sandbox. The stand-in for nginx in `scripts/test_hooks.sh` models the faults that fail it on the real binary, for every run.

## The gate and the harness

`./scripts/check.sh` is the commit gate: Prettier and ESLint on the change's files, the types, the unit tests related to a
tier-1 change (HARNESS.md, "The related tests") and gno, on what the change touches; on a tree with no change, every tool and every test
of the commit's projects (node, ui, compiled) but the `timing` ones, which is a part's last check before its report. GitHub's gate
(`.github/workflows/gate.yml`) judges each pull request by what it calls for, and the night (`nightly.yml`) runs the slow, display and `timing`
tests, the journeys of its list, StrykerJS and the harness's mutants. By hand, as no gate runs them: the benches (`python3 -I scripts/bench.py`),
the pictures and the flash's pixel test (`node app/node_modules/@playwright/test/cli.js test -c app/playwright.stories.config.ts
app/tests/stories/behaviours.spec.ts` on the Mac). Design still being tried lives in the workshop (this file's "The workshop") and
lands later, in one tested batch (REVIEW.md, "Keep it cheap"). At a turn's end the Stop hook only reaps stray processes.
What each step catches, the hooks, the permissions, the reviews and how the harness proves
itself: [HARNESS.md](HARNESS.md).

To mutate only your own files with StrykerJS, from the repository root and on the pinned Node (the
`PATH` check.sh sets: `.node-version`'s Node, from the PATH or nvm's default folder): `node_modules/.bin/stryker run --mutate 'a.ts,b.tsx'`, one comma-separated
value. It replaces the config's `mutate` list (its log says `Found 2 of 935 file(s)`), keeps the
incremental file whole and takes no `--`. Two forms fail: `pnpm run mutate -- --mutate a.ts` hands
StrykerJS a literal `--` (`too many arguments for 'run'`, pnpm's own help: every later token reaches
the script verbatim), and `--mutate a.ts b.ts` reads `b.ts` as its config file. Without `--mutate`
the whole config runs (`pnpm run mutate`; `pnpm run mutate:all` runs `stryker.all.config.json`). Keep `checkers: ["typescript"]` (HARNESS.md).

**Secrets** live in `deploy/secrets/`, one file each, gitignored and unreadable by Claude
Code; the code reads them through `*_FILE` variables. Nobody pastes a key into a chat. The
Anthropic key is the owner's own for tests.

## The workshop

Design is tried here before it lands: `pnpm workshop`, in your own terminal (the sandbox cannot stop a server it did not start),
serves the app's dev server with hot reload on 127.0.0.1:5198 and the backend below. It stops only the processes it started, and
Ctrl+C stops them all. No gate runs per tweak. An accepted batch then lands once, in a part of its own: test first, through the
gate and one review, with pictures where it moves an approved one. A small isolated fix (about 20 product lines, no tier-1 or
harness file) takes the fast lane instead: its test seen failing, the gate, the journeys that watch it, one `reviewer`. How the
owner opens it from another device over a private network is in [process/claude-code.md](process/claude-code.md).

**The backend**, started with the app's server:
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

**A crowd:** `cd app && node tests/e2e/crowd.mjs [--people 12] [--writers 5] [--base http://127.0.0.1:5198]` opens
simulated people on the running workshop, in headless Chromium, no scene, half on the Earth and the rest over the hubs' worlds; the
writers log in with Adena's stand-in and a test wallet and say a line ending "(sim)" every 20-90 s. It refuses any base but
127.0.0.1 or localhost (`node --test tests/e2e/crowd.test.mjs`), writes no file, and is in no gate. Ctrl-C leaves; the counts fall
when the streams close. Inside Claude Code's sandbox Chromium runs one process per browser, so there each person is a browser.
`--script app/tests/e2e/crowd-script.txt [--every 10] [--minutes 15]` makes the writers act that file's lines instead (`room|line`,
or `room|reply|line`, `room|thread|line`, `room|react|👍`, `room|vote|<answer>`, `room|edit|line`, in the Earth, an Earth room
`earth/<name>` (writer 0 makes it, its name checked by the moderation), a hub's world or a realm's page `/r/<path>`; `\n` breaks a line,
`@{prev}` mentions the room's last speaker; writer n sits in the script's room n modulo their number), each by the next writer of its
room able to (a reply, a thread, a reaction, a card or a mention needs a key), the `--bare` writers before the guests declaring no country, the last `--guests` writers as guests with no key (their lines checked by OpenAI with the moderation's key, `WORKSHOP_OPENAI_KEY_FILE`, by the world's rules alone without it), one every
`--every` to 1.5 times `--every` seconds, from the start again till `--minutes` are over (once without), then they
stay silent till Ctrl-C; the "(sim)" mark stays, and each writer declares a country of its own. To empty the chat first, stop the workshop
and remove `.claude/tmp/workshop-data/backend` (history, accounts, sessions; the worlds and prices stay); the workshop's server takes 50 new
accounts an hour, so the crowd's wallets log in again.

**Jarvis for a demo:** `WORKSHOP_JARVIS=standin pnpm workshop` has the backend start a local stand-in for jarvis
(`server/src/testing/jarvisStandin.ts`: the same paths and schemas, prepared answers chosen by the question's words, no model, no key, no
network) and give the server `JARVIS=on`, its address and a key file; without the variable Jarvis stays off. Never set in the journeys.



## The stack

The stack runs on a Docker host with `docker compose -f deploy/compose.yaml up -d --build`; its runbook is [OPERATIONS.md](OPERATIONS.md), running it
for testers [DEMO.md](DEMO.md) and every setting [CONFIGURATION.md](CONFIGURATION.md). `deploy/test.sh` starts the stack and checks it.

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
- **The map tools** (`app/tests/tools/heightMaps.mjs`, `textureVariants.mjs`), run by hand and in no gate: the first makes the Earth's and
  the Moon's height maps once from their public data (the command is its header's); the second makes the variants of `app/public/textures`
  (each map at its widths, named with a hash) and writes `app/src/space/planet/mapFiles.json`.
- **The link reader's tests** run with the unit tests (`pnpm run test`: `link-reader/src/**/*.test.ts` is in the `node` project). Its
  transport tests (`transport.test.ts`) need the `openssl` command: `tlsFixtures.ts` makes a CA and a leaf per name, once per run, in a folder
  of the system's temporary directory (never in the repository), and a missing or failing `openssl` fails the test with its message, it
  never skips. `memory.test.ts` runs the real codecs at their cap in a child with the image's flags and reads the peak resident memory,
  which must stay under the container's 256 MiB. What needs Docker (the reader's isolation, its way out, its guard rules) is
  `deploy/test-links.sh`, which `deploy/test.sh` sources: GitHub's deploy-stack job runs `deploy/test.sh` on a change to `deploy/` or to what the
  images build from, the reader and what it fetches included; its last line names its failed checks, which the job's
  annotation shows with no login. It needs the network for its controls (`example.com.`).

## Jarvis's evals

`evals/` is installed apart from the workspace (its own `pnpm-workspace.yaml`, with the workspace's supply-chain
rules, and its own lockfile): `cd evals && pnpm install --frozen-lockfile --ignore-scripts`, once, in your shell, so
no package's script runs there. They need Anthropic's key in a file
and gnomcp 0.11.0, and cost money for each case not kept in `evals/.cache`:
`ANTHROPIC_API_KEY_FILE=deploy/secrets/anthropic_api_key sh evals/run.sh`. `run.sh` checks the evals' own types
and Node tests first (`evals/test-*.ts`), then runs promptfoo's `eval` script, its results in `evals/results/`.
The gate lints `evals/` (its tsconfig takes zod's and Node's types from jarvis's install, which every tree has); knip
leaves it out, as promptfoo's binary resolves only where `evals/` is installed; `jarvis/src/routes.test.ts` holds the
cases to jarvis's wire. `run.sh` runs the branch's own code with the key, in your shell: run it on a commit you have
read.

