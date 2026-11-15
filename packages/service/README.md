# @gnoworld/service

What the server and Jarvis share on Node: settings, the database, logging, files, HTTP helpers and `net`, the one way out of the process.

## What is in it

`src/`, each file with its test beside it:

- `settings.ts`: settings read from the environment and checked at start. Secrets are held in a value that never prints.
- `db.ts`: opens the server's SQLite file and applies its migrations.
- `log.ts`: JSON lines on stdout. A line holds only the fields named in the code.
- `files.ts`: reads a data file, refusing one over 1 MiB.
- `http.ts`: the shared timeouts, stop and capped body of the HTTP servers.
- `net.ts`: outbound calls. Each carries a timeout, follows no redirect, and its answer is read up to a size.
- `testing/`: test helpers (`wayOut.ts`).

Each file is exported by its path, for example `@gnoworld/service/net`.

## Use

```ts
import { /* ... */ } from "@gnoworld/service/net";
import { openDatabase } from "@gnoworld/service/db";
```

The package exports every `src/*.ts` file by its name. `openDatabase(path, migrations)` is in `src/db.ts`.

## Build and test

No build step: the other packages import `packages/service/src` as it is. Its tests run with everyone's, or alone with
`pnpm exec vitest run packages/service` from the root; the setup is in [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).

## Rules

- `service` imports `core`, `schemas` and Node's built-ins. It never imports `server`, `jarvis`, the app, `chain` or React. See "Which way dependencies point" in [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
- Every outbound call goes through `net`.
- Server checks (blocking work, floating promises, timeouts, bounded caches): [.claude/rules/server.md](../../.claude/rules/server.md). General TypeScript rules: [.claude/rules/typescript.md](../../.claude/rules/typescript.md).
