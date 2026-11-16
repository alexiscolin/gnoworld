# @gnoworld/chain

The reads of a chain's node and of the indexer, shared by the app, the server and Jarvis. Each read has a size cap and goes through a schema, and a node is checked to be on the expected chain before it is read.

## What is in it

`src/`, each file with its test beside it:

- `read.ts`: the shared read, with its size cap, schema parse and named failure kinds.
- `transport.ts`: the HTTP transport and time limits.
- `node.ts`: reads of a node: the latest block height, a realm's page, one expression, a realm's functions.
- `indexer.ts`: reads of the indexer.
- `abci.ts`, `asks.ts`, `callAsk.ts`, `tokenAsks.ts`: the requests sent to a node or the indexer, written as data.
- `tx.ts`: one transaction by its hash. `transactions.ts`: the indexer's GraphQL query for transactions. `fees.ts`: the fees recent calls of a realm function paid.
- `testing/`: fakes for tests (`envelopes.ts`).

Each file is exported by its path, for example `@gnoworld/chain/node`.

## Use

```ts
import { /* ... */ } from "@gnoworld/chain/node";
import { /* ... */ } from "@gnoworld/chain/read";
```

The package exports every `src/*.ts` file by its name.

## Build and test

No build step: the other packages import `packages/chain/src` as it is. Its tests run with everyone's, or alone with
`pnpm exec vitest run packages/chain` from the root; the setup is in [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).

## Rules

- `chain` imports `core`, `schemas` and Zod, and uses `fetch`. It never imports `server`, `jarvis`, the app, React or the store. See "Which way dependencies point" in [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
- A read has a size cap and a schema, and no secret passes through here.
- General TypeScript rules: [.claude/rules/typescript.md](../../.claude/rules/typescript.md). Gno code and chain reads while authoring go through gnomcp: [.claude/rules/gno.md](../../.claude/rules/gno.md).
