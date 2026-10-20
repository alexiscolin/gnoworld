# gnoworld

![The approved prototype: the universe of gno.land, its worlds as planets, the live count and the chat](docs/assets/prototype.jpg)

gnoworld is a place to meet on gno.land. Every project is a world you can fly to, every
world has its rooms to talk in, and Jarvis, an assistant, explains what a realm does and
prepares the calls you sign yourself in Adena. The picture above is the approved prototype;
the real app is being rebuilt from it, slice by slice.

## What is here

The applications sit at the root; the libraries they import sit under `packages/`
([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), "Repository layout").

| Folder | Inside | What it holds |
|---|---|---|
| `app/` | | The web app: React Router, pre-rendered, installable as a PWA |
| | `src/` | Its code: the document shell, one module per page (`routes/`), the service worker (`sw/`), and one folder per feature (`features/`: today the update notice and the page that failed) |
| | `tests/` | Playwright: the pages' journeys (`e2e/`) and the design system's stories in a browser, with their approved pictures (`stories/`) |
| | `public/` | The files served as they are: the manifest and the icons |
| `packages/` | `core/` | The rules, pure TypeScript shared by everything else (today: the IRC line parser) |
| | `ui/` | The design system: tokens, CSS layers, compositions, components and icons, and its Storybook |
| `gno/` | `r/` | The realms, in gno: today `seal` |
| | `tools/` | Go tools around the chain (today `sealvec`, which writes the seal realm's test vectors) |
| `deploy/` | `web/` | The demo's image: the app built, then served by nginx |
| | `guard/`, `tailscale/` | The demo's network: a guard that lets out only what it must, and Tailscale, which publishes the demo |
| `scripts/` | | The gate (`check.sh`) and the harness that keeps the code honest: its checks, its probe, its mutation testers |
| `.githooks/` | | The git hooks, installed from `main`, and `merge.sh`, the one way into `main` |
| `.github/` | `workflows/` | The CI: the full gate on every push |
| `.claude/` | `rules/`, `agents/`, `commands/` | Claude Code's rules per area, its review agents, and `/slice-plan` and `/pre-merge` |
| `docs/` | `plans/`, `design/`, `review/`, `prototype/` | How it is built, looks and is reviewed: the slices' plans, the approved designs, the findings ledger, the approved prototype |
| `adr/` | | The design: ADR-0001, and ADR-0002, the prototype's scope |

Each other folder arrives with its slice: the `server/` (3), `packages/schemas` with the
first boundary that needs one, `gno/p/` once two realms share code, and the admin console
`admin/` (12).

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
| `docker compose -f deploy/compose.yaml --profile demo up -d --build` | The demo, published through Tailscale: its secrets first ([docs/OPERATIONS.md](docs/OPERATIONS.md)) |
| `./scripts/check.sh` | The fast gate: formatting, types, lint, tests, dead code, copies, CSS and comment rules, the realms, the hooks. It runs before every commit and at the end of every Claude Code turn |
| `./scripts/check.sh --full` | Everything above, plus the harness's own probe, coverage (85% everywhere, 100% in `core`), the coverage of the lines you changed, mutation testing and a scan of the whole history for secrets. It runs before every push; `main` also needs a review pass (docs/REVIEW.md) |
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
- What comes next: [docs/plans/backlog.md](docs/plans/backlog.md)

Planet textures in the prototype: [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0.
