# @gnoworld/schemas

The Zod schemas for data that crosses a boundary: the relay, the indexer, realms and the server API. The app, the server and Jarvis share them, so outside data is parsed here before anything uses it.

## What is in it

`src/` has one file per kind of data, with its test beside it. Some examples:

- `chain.ts`, `chainEvents.ts`, `indexer.ts`, `functions.ts`, `proposal.ts`: chain and indexer data. The last four are also exported on their own (`@gnoworld/schemas/indexer` and so on).
- `data.ts`, `worlds.ts`, `rooms.ts`, `person.ts`, `markets.ts`: the server's data.
- `login.ts`, `guest.ts`, `address.ts`, `token.ts`: sign-in, guest chat, addresses and token data.
- `jarvis.ts`: Jarvis's requests and answers.
- `zod.ts`: the Zod Mini setup every schema builds on. It is the only file marked as having side effects.
- `index.ts`: the public surface.

## Use

```ts
import { StatusAnswer } from "@gnoworld/schemas";
import { FunctionList } from "@gnoworld/schemas/functions";
```

`StatusAnswer` and `FunctionList` are the schemas `packages/chain/src/node.ts` imports this way.

## Build, test and run

There is no build step and no `scripts` entry in `package.json`: other packages import the sources directly. From the repository root, with the Node version in `.node-version`:

```bash
pnpm run test
pnpm run typecheck
pnpm run lint
```

Setup is in [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).

## Rules

- `schemas` imports `core` and Zod only. See "Which way dependencies point" in [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
- Data from the relay, the indexer or a realm goes through a schema first. No `as` cast stands in for a parse.
- General TypeScript rules: [.claude/rules/typescript.md](../../.claude/rules/typescript.md).
