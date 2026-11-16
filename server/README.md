# server

The gnoworld server: TypeScript on Node, with Hono. It serves the app's API and holds the data the app cannot keep in the browser.

## What is in it

`src/` has the process (`main.ts`, `app.ts`, `config.ts`), the chat (`chat.ts`) and one folder per area:

- `login/`: sign-in with a wallet, and linked accounts.
- `rooms/`, `irc/`, `ergo/`, `stream/`: the chat rooms, on Ergo (IRC).
- `moderation/`, `roles/`: moderation and owners' rights. `roles.json` is the roles file.
- `search/`: the search index.
- `cards/`, `previews/`: link cards and previews.
- `prices/`, `signals/`, `activity/`, `worlds/`: prices, signals, activity and the worlds' rollup.
- `calls/`, `explain/`: a call's detail, and explanations of realms.
- `door/`: the door to Jarvis, the assistant, with its quotas and kept answers.
- `guest/`, `pins/`, `unread/`, `translations/`: guests, pins, unread counts, translations.
- `jobs/`, `retention/`: timed jobs, and expiry of old data.
- `testing/`: fakes for tests.

## Build, test and run

Run these from the repository root. Use the Node version in `.node-version`.

```sh
pnpm install
pnpm run test         # unit tests
pnpm run typecheck
pnpm run lint
```

The server has no build step: Node runs the TypeScript directly. Start it with:

```sh
node --disallow-code-generation-from-strings server/src/main.ts
```

It refuses to start without that flag. It also needs its settings in the environment, with secrets read from files named by `*_FILE` variables. The list is in [docs/CONFIGURATION.md](../docs/CONFIGURATION.md). The container image that runs it is `deploy/server/Dockerfile`, and `deploy/compose.yaml` runs the whole stack.

## Rules and docs

- Which folder may import which: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), "Which way dependencies point". The server imports `core`, `schemas`, `service` and `chain`, and Node.
- Server checks: [.claude/rules/server.md](../.claude/rules/server.md). TypeScript checks: [.claude/rules/typescript.md](../.claude/rules/typescript.md).
- Review tiers, with login at tier 1: [docs/REVIEW.md](../docs/REVIEW.md).
- Settings: [docs/CONFIGURATION.md](../docs/CONFIGURATION.md). Running the stack: [docs/OPERATIONS.md](../docs/OPERATIONS.md).

Never put a secret in code, make an outbound call without a timeout, or leave a map, queue or cache unbounded.
