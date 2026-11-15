# app

The web app of gnoworld: the universe of gno.land as a 3D scene, a page for each world, its realms and its rooms to talk in.

It is a React Router site built as static files. Every page is pre-rendered at build time from the data files in `data/`, and the app installs as a PWA. In use, it talks to the server (`../server`) under `/api` and `/ws`.

## What is in it

- `src/routes/`: one module per page.
- `src/features/`: one folder per feature (chat, login, search, realms, world and others). Each exposes its public surface in `index.ts`.
- `src/lib/`: the boundaries to the outside: the server API, the chain, the chat stream, the wallet.
- `src/store/`: the one Zustand store.
- `src/space/`: the three.js scene (cosmos, planets, Earth).
- `src/sw/`: the service worker.
- `data/`: the universes, hubs, events and rooms as JSON files, checked with Zod at build.
- `public/`: files served as they are (manifest, icons, textures, world pictures).
- `tests/`: Playwright journeys (`e2e/`), component stories with approved pictures (`stories/`), and measuring tools (`tools/`).

## Build, test and run

Run these from the repository root. Use the Node version in `.node-version`.

```sh
pnpm install
pnpm run dev          # the dev server (react-router dev)
pnpm run build:app    # the static site
pnpm run test         # unit tests
pnpm run typecheck
pnpm run lint
```

One Playwright journey:

```sh
node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts <spec>
```

Journeys need Playwright's Chromium. [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) explains the setup. It also describes `pnpm run workshop`, which serves the app with a local chat and server on a Tailscale network.

## Rules and docs

- Which folder may import which: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), "Which way dependencies point". Lint enforces it.
- TypeScript and React checks: [.claude/rules/typescript.md](../.claude/rules/typescript.md).
- The look: [docs/DESIGN-SYSTEM.md](../docs/DESIGN-SYSTEM.md).
- Build, gate and workshop: [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md).

The client is public, so nothing secret belongs here.
