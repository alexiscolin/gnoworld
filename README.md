# gnoworld

![The approved prototype: the universe of gno.land, its worlds as planets, the live count and the chat](docs/assets/prototype.jpg)

gnoworld is a place to meet on gno.land. Every project is a world you can fly to, every
world has its rooms to talk in, and Jarvis, an assistant, explains what a realm does and
prepares the calls you sign yourself in Adena. The picture above is the approved prototype;
the real app is rebuilt from it, slice by slice (slice 13, the realm plate and the social parts below, is the one in progress).

## What is here

The applications sit at the root; the libraries they import sit under `packages/`
([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), "Repository layout").

| Folder | Inside | What it holds |
|---|---|---|
| `app/` | | The web app: React Router, pre-rendered, installable as a PWA |
| | `src/` | Its code: one module per page (`routes/`), the 3D universe (`space/`: the cosmos, the worlds' planets and their depth, the Earth and its real hour), the state (`store/`), the service worker (`sw/`), and one folder per feature (`features/`: the universe and its rail, a world's page, the chat and its Lexical composer, search, Jarvis's cards, login and account with its linked accounts, the welcome card and its Get started dialog, follows, notifications, quests and the passport, previews, the shared error views, credits…) |
| | `tests/` | Playwright: the pages' journeys (`e2e/`), the design system's stories in a browser with their approved pictures (`stories/`), and the measuring tools (`tools/`) |
| | `data/`, `public/` | The universes, hubs and their rooms as data files; the files served as they are (the manifest, the icons, the planets' pictures) |
| `server/` | `src/` | The server, TypeScript on Node: login and linked accounts (`login/`), the chat's rooms on Ergo (IRC) and their moderation (`moderation/`, owners' rights in `roles/`), the search index (`search/`), the link cards (`cards/`), pins, prices, the guests (`guest/`), a call's detail (`calls/`), the worlds' activity and previews, the worlds job's rollup with its token worlds, people and network line (`worlds/`), the timed jobs (`jobs/`), and Jarvis's door (`door/`), its quotas, its kept answers and its translations, with the realms' explanations (`explain/`) |
| `link-reader/` | | The link reader, as its own service: it fetches a public page's head and picture for a chat line's card, walled in, off unless the link cards are on |
| `jarvis/` | | Jarvis, the assistant, as its own service: its skills, its reads of gno.land through gnomcp, its budget; it reaches only the hosts its way out lists |
| `evals/` | | Jarvis's evaluations: the cases its answers are held to |
| `packages/` | `core/` | The rules, pure TypeScript shared by everything else: the IRC parser, the planets' looks from their seed, the Markdown scanner |
| | `schemas/` | The contracts between the app, the server and Jarvis, checked with Zod on both sides |
| | `chain/` | Every read of a chain and its indexer, in one place (a lint rule holds it) |
| | `service/` | What the server and Jarvis share: HTTP, the network's guards, settings, the database, the logs |
| | `ui/` | The design system: tokens, CSS layers, compositions, components and icons, and its Storybook |
| `gno/` | `r/` | The realms, in gno: `seal` and `satellite` (a world's sign in space, rented by the day) |
| | `tools/` | Go tools around the chain (today `sealvec`, which writes the seal realm's test vectors) |
| `deploy/` | `web/`, `server/`, `jarvis/`, `jarvis-reader/`, `link-reader/`, `ergo/` | The demo's images: the app served by nginx, the server, Jarvis and its gnomcp reader, the link reader and the chat's IRC server |
| | `guard/`, `egress/`, `tailscale/` | The demo's network: a guard that lets out only what it must, the ways out (one list per service: the server's, Jarvis's, its reader's, the link reader's), and Tailscale, which publishes the demo |
| | `k6/`, `probe/`, `test.sh` | The load test, the health probe the images without a shell use, and `test.sh`, which starts the stack and checks it (with its mutants), with `test-jarvis.sh` and `test-links.sh` for the two services that sit behind a profile |
| | `demo.sh` | The demo's one script: it runs the stack from a checked copy of one commit, with its backup, wipe and restore ([docs/DEMO.md](docs/DEMO.md)) |
| `lint/` | | The lint rules, one file per area |
| `scripts/` | | The gate (`check.sh`), the workshop, and the harness that keeps the code honest: its checks, its probe, its mutation testers |
| `.githooks/` | | The git hooks, installed from `main`, and `merge.sh`, the one way into `main` |
| `.github/` | `workflows/` | The CI: the full gate on every push |
| `.claude/` | `rules/`, `agents/`, `commands/`, `workflows/` | Claude Code's rules per area, its review agents, `/slice-plan`, `/pre-merge` and `/dream`, and the branch workflow |
| `docs/` | `plans/`, `design/`, `review/`, `prototype/` | How it is built, looks and is reviewed: the slices' plans, the approved designs, the findings ledger, the approved prototype |
| `adr/` | | The design: ADR-0001, and ADR-0002, the prototype's scope |

Jarvis and the link cards are each behind a switch, off by default (`JARVIS=on`, `LINK_CARDS=1` in
`deploy/.env`; [docs/OPERATIONS.md](docs/OPERATIONS.md), every setting in
[docs/CONFIGURATION.md](docs/CONFIGURATION.md)). The satellites' realm is written; their screens come
later. Folders still to come: `gno/p/` once two realms share code, and the admin console `admin/`
(slice 12).

**Added in slice 13** (plans in [docs/plans/](docs/plans/)):
- **Linked accounts and owners' moderation:** the account that holds a world's namespace on chain moderates its rooms (hide, mute, pin);
  accounts link by a proof from Adena or from the command line, and a link can be released ([plan](docs/plans/owners-moderation.md)).
- **Search:** the chat's own search over the public rooms' lines, kept by the server, beside the palette that finds where to go ([plan](docs/plans/search.md)).
- **Link previews:** a card under a line that links a page, read by the link reader and checked before it shows ([plan](docs/plans/link-previews.md)).
- **Jarvis's kept answers:** a function's explanation is kept 7 days and a room's "here" an hour, in the server's database; Jarvis's answers are cards in the chat column.
- **Ask Jarvis and the realms' explanations:** a button beside the composer (or `@jarvis` at a line's start) asks Jarvis, whose answer is the
  asker's card; every realm and world carries a two-sentence explanation from its code, kept in the server's database and seeded for 322 of Onyx's realms.
- **The composer on Lexical:** the field shows its formatting in place, with `/`, `@` and `#` suggestions, and the card commands `/market`,
  `/trending` and `/proposals`, which post a line every reader of the room sees drawn as its card.
- **The explorer's additions:** the person card with balance and tokens, a call's detail, the token worlds (holders, supply, transfers),
  the network line, and a realm's page that says plainly when the realm is not on the chain.
- **Search by `from:` and by function name,** with a "Following" chip in the palette.
- **A welcome card and a Get started dialog** for a first visit and for a browser with no Adena; the passport in three tabs (Challenges,
  Stamps, Charted); one error system, one view in three sizes for every failure.
- **The demo's script:** `deploy/demo.sh` runs the stack from a checked commit, with backup, wipe and restore ([docs/DEMO.md](docs/DEMO.md)).
- **The planets' depth and the Earth's real hour:** relief shadows, height maps, a sea mask and rings; the Earth's day and night are the real ones.
- **Waiting after the demo:** private rooms ([plan](docs/plans/private-rooms.md)), the shared link's image ([plan](docs/plans/share-image.md)), Jarvis's queued ask,
  one timeline for every view's arrival, the 8K Earth map and CI. Putting the demo online in one command: [plan](docs/plans/online.md).

## Install

You need macOS or Linux, git, Python 3, Go 1.26, and:

1. **Node 24.22.0**, the version in `.node-version`. With nvm: `nvm install 24.22.0`. The
   gate finds it through nvm even when your shell uses another Node.
2. **pnpm.** Any recent pnpm works: it switches itself to the exact version the project
   names (12.14.0).
3. **A gno toolchain** that matches the chain, for the realms: see
   [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), "Toolchain".
4. **gitleaks**, for the full gate: `brew install gitleaks`.
5. **The TypeScript language server**, which Claude Code's `typescript-lsp` plugin (on for
   this project) uses to navigate the code: `brew install typescript-language-server`.

Then, in the repository:

```sh
pnpm install          # runs no script of the repository
git --no-replace-objects show main:scripts/install_hooks.sh | sh   # the git hooks, from main
./scripts/check.sh    # the gate, in under a minute
```

`pnpm install` refuses any package published less than a day ago, and runs no install
script a dependency brings unless it is listed in `pnpm-workspace.yaml`. If it stops on one
of those, that is the protection working, not a bug.

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | The site, on your machine, with hot reload (the PWA's worker is off in development); no Docker, no secret |
| `pnpm workshop` | The app's screens with hot reload, the chat running with them (a local Ergo and the server), put on your tailnet to look from a laptop or a phone; run it in your own terminal ([docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), "The workshop") |
| `docker compose -f deploy/compose.yaml --profile demo up -d --build` | The demo, published through Tailscale: its secrets first ([docs/OPERATIONS.md](docs/OPERATIONS.md)) |
| `./scripts/check.sh` | The fast gate, sized to the change: formatting, types, lint, the app's build and the docs check; a change to a tier-1 file (docs/REVIEW.md) also runs the related unit tests, dead code, copies, CSS and comment rules, the realms and the hooks. It runs before every commit (a Claude Code turn runs no gate by default) |
| `./scripts/check.sh --full` | The gate for a push to `main`: the whole tree, the tier-1 and smoke journeys, coverage (85% everywhere, higher floors for `core` and the tier-1 files), mutation testing of the changed tier-1 lines and a scan of the whole history for secrets; the harness's own probe and mutants only when the harness changed. `main` also needs a review pass (docs/REVIEW.md) |
| `pnpm run test:all` | `check.sh --everything`: every lane, test, picture, journey and check |
| `pnpm run test` | The unit tests |
| `pnpm run coverage` | The tests with coverage, under `coverage/` |
| `pnpm run mutate` | Mutation testing, with its report in `reports/mutation/index.html` |

## How work happens here

Work goes one slice at a time, each with a plan approved before any code
([docs/plans/](docs/plans/)). Tests come first. Code written with Claude Code passes the
same gate as anyone's, then a review sized by risk ([docs/REVIEW.md](docs/REVIEW.md)). The
whole method is in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), "The harness".

## Read more

- The design: [ADR-0001](adr/0001-gnoworld.md), and the approved prototype's scope,
  [ADR-0002](adr/0002-validated-prototype.md)
- How the code is laid out: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- How it looks: [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md)
- Every setting, secret and switch: [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
- What comes next: [docs/plans/backlog.md](docs/plans/backlog.md)

Planet textures, in the app and the prototype: [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0
(the app lists them under Credits, in the universe and in the chat).
