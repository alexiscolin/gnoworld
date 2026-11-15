# @gnoworld/core

The pure rules the app, the server and Jarvis share. Everything here is a function of its inputs: no DOM, no Node API, no clock and no randomness. Time and chance come in as parameters.

## What is in it

`src/` has one folder per domain. The main ones:

- `irc/`, `chat/`, `markdown/`, `text/`: parsing and formatting of chat lines and messages.
- `planet/`, `cosmos/`, `earth/`, `ring/`, `station/`, `space/`: the rules that decide how worlds and places look and where they sit.
- `lod/`, `frame/`: which things are drawn, labelled or kept clear on screen.
- `places/`, `discovery/`, `store/`: places, discovery and shared store logic.
- `chain/`, `json/`, `args/`, `bubbles/`: helpers for chain data, JSON, arguments and chat bubbles.
- `index.ts`: the public surface. The package also exports `./bubbles` (`src/bubbles/index.ts`).

Each source file has its test beside it (`*.test.ts`).

## Use

```ts
import { guestName } from "@gnoworld/core";
import { /* ... */ } from "@gnoworld/core/bubbles";
```

Import from the package root, or from `./bubbles`. `guestName` is exported from `src/index.ts`.

## Build, test and run

There is no build step and no `scripts` entry in `package.json`: other packages import the TypeScript sources directly. Run these from the repository root, with the Node version in `.node-version`:

```bash
pnpm run test        # vitest; core also runs in the Chromium project core_chromium
pnpm run typecheck
pnpm run lint
```

The package is not run on its own. Setup is in [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).

## Rules

- `core` imports only `core`, and uses no globals such as `window`, `document` or `Date.now()`. Lint enforces it. See "Which way dependencies point" in [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
- Lines are 100% covered by tests and branches 95%: [.claude/rules/core.md](../../.claude/rules/core.md).
- General TypeScript rules: [.claude/rules/typescript.md](../../.claude/rules/typescript.md).
