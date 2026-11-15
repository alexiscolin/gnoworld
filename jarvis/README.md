# jarvis

Jarvis is gnoworld's assistant. It answers a visitor's question about a realm or a room, explains
what a realm does, and translates chat lines. It runs as its own Node service and its own image.
Only the server calls it, never the browser. It reads chains through gnomcp, which it starts
read-only, and it cannot sign or send anything.

Jarvis is off unless `JARVIS=on` is set. Switched off, `/ask` answers "off" before doing any work.

## What is in it

`src/` holds the loop and the guards around it.

- `main.ts`: the process. It reads the settings, opens the database, loads the skills and starts
  gnomcp and the HTTP server. On `SIGTERM` it lets questions in flight finish, then exits.
- `config.ts`: the settings, read from the environment and checked at start.
- `routes.ts`, `http.ts`: the paths `/ask`, `/translate`, `/digest`, `/explain` and `/budgets`.
  Each body goes through its Zod schema from `@gnoworld/schemas` first.
- `loop.ts`, `loopParts.ts`, `askLoops.ts`: the loop that takes a question to an answer. The system
  prompt is in `loopParts.ts`. Each turn calls the model, then checks every tool call it asks for.
- `explainPrompt.ts`, `explainRealm.ts`: the prompt and the job that label a realm for a newcomer
  from its outline.
- `translate.ts`, `translationCheck.ts`: translation of one chat line, and the check that the
  result adds no link, account, `@room` or number.
- `allowlist.ts`, `toolbox.ts`: the tools the model is offered. A call must name a listed tool and
  pass that tool's strict Zod object before anything runs.
- `budget.ts`: the daily spending cap. A call reserves its worst-case cost before it starts and
  settles the real cost after. Questions and translations each have a cap, set in whole dollars
  by `JARVIS_BUDGET_USD` and `JARVIS_TRANSLATION_BUDGET_USD`. The totals are kept in Jarvis's
  own database, so a restart does not reset the day.
- `untrusted.ts`: wraps a visitor's question and a room's lines as untrusted data for the model.
- `gnomcp.ts`, `gnomcpTools.ts`, `tools/`: the reads of gno.land through gnomcp, the cards Jarvis
  can answer with, and the optional gnoscope reads.
- `skills.ts`: loads the skills as text only.
- `testing/`: fakes used by the tests.

`skills/` has one folder per skill, each with a `SKILL.md`: `catch-up`, `concierge`, `gno`,
`realm-reader` and `translation`. Only the skills loader reads this folder.

## Build, test and run

From the repository root, after `pnpm install`:

```sh
pnpm run test        # all unit tests, Jarvis's included
pnpm run typecheck   # every workspace, Jarvis's included
pnpm run lint
```

The package has no scripts of its own. The benchmarks are the `src/*.bench.ts` files, run with
`python3 -I scripts/bench.py`.

The image starts Jarvis with `node --disallow-code-generation-from-strings jarvis/src/main.ts`
(see `deploy/jarvis/Dockerfile`). It needs its settings, an Anthropic key in a file and the
reader, so run it through the stack described in [docs/OPERATIONS.md](../docs/OPERATIONS.md).
Every setting is listed in [docs/CONFIGURATION.md](../docs/CONFIGURATION.md).

The evaluations live in `evals/` and cost money. They have their own install and read the key from
a file; the steps are in [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md), "Jarvis's evals".

## Rules

- Jarvis imports `core`, `schemas`, `service`, `chain` and Node, never `server`
  ([docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)).
- Every read of a chain goes through gnomcp.
- No secret in code, and no key in a prompt or a log.
- The rules for this folder are in [.claude/rules/server.md](../.claude/rules/server.md) and
  [.claude/rules/typescript.md](../.claude/rules/typescript.md).
