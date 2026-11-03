# Slice 10, the server's half: Jarvis's loop, its locks and its limits, tested with a fake model

Backlog row 10, ADR-0002 §5 and §7, with §4's digests and proposals. Planned and built on Alexis's MacBook the night of 2026-11-03, on the branch `slice-10a` cut from `slice-11-realm` at `057c2cbb`, not from `main`, whose harness cannot commit here (F5012, fixed in slice 11 by `bc060164`): slice 10 merges into `main` after slice 11 (D40). Alexis's choices of 2026-11-03 are the first rows of `docs/decisions.md` that day: plan then code with no stop for his approval (he reviews it by questions), the server's side only, Jarvis in its own container as §5 says, six dependencies approved. A choice marked D is Claude's, for his review.

## 1. Done when

Row 10's acceptance, word for word: "A tool off the allowlist is refused and logged; the injection suite passes; every number, link and function in a digest traces to its source; a proposal for a function that does not exist shows nothing; at 100% of the budget Jarvis stops and every feature falls back to its form without a model; a translation is made once per message and language; `jarvis` holds no key but Anthropic's". On the server's side: the injection suite is written and listed as not run (no key on this machine); "falls back to its form" is the server answering `spent`, the form being the app's. The plan adds: a call whose arguments fail its tool's schema is refused and logged, and the model is offered exactly the allowlist; untrusted text reaches the model inside a block marked with a random tag per turn, cut to its size limit, the tag never inside it; skills are read from the skills folder only, as text; every model call has its own timeout and at most two retries, every question a maximum of turns; concurrent questions never pass the cap (each call reserves its worst cost, then settles its real one, D41); a quota per account and UTC day; one trace per question with §5's spans; a translation that adds a link, a mention or a number is dropped and the original shows.

## 2. Out of scope

Everything under `app/src/` and `packages/ui/src/`: Jarvis's button, its answer card and buttons, the forms that show when it is spent; they come after slice 7's merge, built to the video's frames (Alexis, "Serveur seulement"). Running the model, the evals and promptfoo's red team (no key here: written, not run); Docker (`deploy/test.sh` is Alexis's); Langfuse (phase 1); the red-team pass before launch (slice 12); Jarvis writing or deploying contracts (cut).

## 3. Threat model

Assets: the Anthropic key and the day's budget; people's trust in an answer, a card or a button; questions and account ids; the chain, which Jarvis never writes. Entry points: a question (a logged-in person, through `server`, D42), everything Jarvis reads (realm source, rendered pages, room lines, indexer data, gnoscope's results), the model's tool calls, the skills folder, the settings.
- **Steered to write, sign or spend:** no write tool and no key: gnomcp started read-only (an empty working directory, no agent key, empty key and session paths); the model is offered gnomcp's seven reads (`gno_packages`, `gno_read`, `gno_render`, `gno_eval`, `gno_status`, `gno_history`, `gno_activity`), ours, and gnoscope's only with its switch on; every call checked by name and by our Zod schema of its arguments, a chain `profile` among the configured ones only, refused and logged otherwise. Tests: a fake model asks `gno_call`, `gno_addpkg`, an unknown name, a read with an extra or ill-typed argument or another profile: each refused, logged, answered as refused; the request's `tools` equals the allowlist.
- **Steered to leak:** nothing to steal (public data and the asker's own question; no DMs, no memory across people); untrusted blocks under a tag drawn per turn, results cut to a size. Tests: a result holding the tag, or a closing marker, stays inside its block (fast-check).
- **Draining the budget:** a quota per account and UTC day (D43), the hard cap with reserve-then-settle (D41), an alert at 80% and at 100% once a day, the stop until the next UTC day; an Anthropic workspace spend limit backs it (ops). Tests: concurrent questions at 99% get only what fits; at 100% `spent`; a new UTC day reopens.
- **Runaway cost:** turns per question, output tokens per call, a result's size and a question's size capped (D44); each call its timeout, two retries at most. Test: a fake model that asks tools forever stops at the turn cap with its cost settled.
- **A forged card:** digests, proposals and answer buttons are Zod data, grounded by string match against their sources, a proposal's function checked against `vm/qfuncs`, never carrying coins. Tests: a number or a link absent from the page refuses the digest; a function absent from `vm/qfuncs` gives nothing.
- **A planted skill:** the loader reads `server/jarvis/skills/<name>/SKILL.md` only, regular files within a size, no link, no other file. Tests: a link, a script beside it, `..`, a file past the size.
- **The key:** read only from `ANTHROPIC_API_KEY_FILE`, held in a value that never prints; logs carry no question text and accounts as their HMAC. Tests: errors and log lines never show it.
- **gnoscope, a third party:** off by default, its results untrusted and cut; down, Jarvis says so and answers from gnomcp.

## 4. Cost

Hot paths and their benches (budgets set by each part, measured before and after): the allowlist's check and the untrusted wrapping of a 64 KiB result, under 1 ms; grounding a 50-block digest against a 100 KiB page through a set of the page's tokens, O(n + m), under 5 ms; the budget's reserve and settle, one SQLite statement each. Money, from the `claude-api` skill (models cached 2026-10-06): Sonnet 5.5 $2 in, $10 out, $0.20 cache read; Haiku 5.5 $0.10 and $0.50 up to a 100K-token prompt, $0.50 and $2.50 above; Opus 5.5 $4 and $20, $0.20 read; a cache write costs 1.25× the input for 5 minutes. A question of 20K input tokens, 18K of them cached, and 1K out on Sonnet 5.5 costs about $0.018, so about 2,500 questions a day at $45.

## 5. Scale

The first limit is the day's budget (about 2,500 such questions), then the quotas; one `jarvis` container with one gnomcp child. Next: digests and translations cached per content hash (§7), then several `jarvis` containers, whose budget then leaves the container's own SQLite (D45) for a shared store; load tested against the fake model.

## 6. Tests, by level

ADR-0002 §9's rows that apply: unit tests in the server's Vitest project, with fast-check where an input is text; a fake model at the SDK's boundary, typed with the SDK's own types once installed; a fake MCP server for gnomcp; the jarvis process started as a child, as `main.test.ts` does the server's; the AI evals as promptfoo cases in `evals/`, plain JSON, run with a key later. Each part writes its failing tests first, from §1 and §3, and the red pass reads them.

## 7. Files and branches

Creates `server/src/jarvis/` (the code, one concept a file), `server/jarvis/skills/` (`SKILL.md` folders: ours, and gnomcp's `gno` skill under its Apache-2.0 licence), `evals/` (its own workspace); changes `server/src/config.ts` (its helpers shared, never copied), `server/src/log.ts` (fields), `knip.json` (the jarvis entry), `deploy/` (the `jarvis` service, its egress, gnomcp pinned by digest), `docs/ARCHITECTURE.md` (the layout: skills and evals where §5 puts them). Tier 1: the loop and its allowlist, `deploy/`.
- **10b, the locks** (tier 1, tonight): `allowlist.ts`, `untrusted.ts`, `skills.ts` and the skills' text.
- **10c, the limits** (tonight, beside 10b): `config.ts` for jarvis, `prices.ts`, `budget.ts`, `quota.ts`, jarvis's migrations; the shared helpers of `server/src/config.ts`.
- **10d, the checks on what Jarvis returns** (tonight, once 10b or 10c is merged): the digest, proposal and button schemas in `packages/schemas` (sharing `FunctionList`), grounding, the proposal's check, the translation's check.
- **10e, the loop** (tier 1, after Alexis's install and 10b to 10d): the SDK client, the loop and its spans, gnomcp over stdio; its first commit brings the five server dependencies with the code that imports them all (knip refuses one unused).
- **10f, the tools** (tier 1, after 10e): ours (the places, the chain's latest blocks and transactions, the digest, the proposal and the buttons through 10d's checks) and gnoscope's behind its switch.
- **10g, the service** (after 10f): translation and its cache, the digest's cache, jarvis's entry and routes, `server`'s door with the quotas (D42, D43).
- **10h, evals and deploy** (tier 1, after 10g): `evals/` with its provider and cases, the `jarvis` container in `deploy/`.
The modules of 10b to 10d are reached by their tests until 10e calls them; the slice merges into `main` whole, never before 10h. Two parts at once at most, each in its own session, worktree and herdr pane.

## 8. Dependencies

Approved by Alexis (2026-11-03), read on npm the night of 2026-11-04 and installed in a scratch folder for their sizes: `@anthropic-ai/sdk` 1.4.0 (2026-11-02, 25 Mo); `@modelcontextprotocol/client` 2.4.0 (2026-10-23, 9 Mo with its core); `@opentelemetry/api` 1.9.1 (2026-03-25), `@opentelemetry/sdk-trace-node` 2.12.0 and `@opentelemetry/exporter-trace-otlp-http` 0.223.0 (both 2026-10-06), 26 Mo together; `promptfoo` 0.125.1 (2026-10-25, 615 packages, 702 Mo, in `evals/` only). OpenTelemetry's 2.x line, as api 1.10.0 with exporter 0.300.0 needs `@opentelemetry/sdk-trace` 3, another name (D46). The install is Alexis's: pnpm cannot run in the sandbox (F027; tonight `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`, even for a lockfile alone in a scratch folder), and the sandbox refuses writing `server/package.json` and `pnpm-lock.yaml` in a worktree. His script: `.claude/tmp/slice-10/setup.sh`.

## 9. Questions for Alexis (decided for tonight, to confirm)

1. D40, the base: `slice-11-realm`, merged into `main` after slice 11.
2. D46: npm marks `@opentelemetry/sdk-trace-node` 2.12.0 deprecated ("Use @opentelemetry/sdk-trace package"); take `@opentelemetry/sdk-trace` 2.12.0 instead, already in the tree through the exporter? A new name, so yours.
3. D42, the door: `server` checks the session, the rate and the size, adds the room's public lines, and calls `jarvis` on a network of their own; `jarvis` serves nothing else and holds no session secret.
4. D43, the quota: 20 questions a day per account, 5 for an account with no mainnet name; D47, the budgets: $45 for questions and $5 for translation a day, $3 and $1 in the demo.
5. D45: jarvis keeps its budget and translations in its own SQLite file, on a volume of its own; the quotas are the door's, in the server's database, as `server` holds the session and the pepper.
6. promptfoo adds 702 Mo to the main checkout's packages: keep it in the workspace, or install `evals/` apart?
