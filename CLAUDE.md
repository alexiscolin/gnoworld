# Notes for AI assistants

gnoworld: a social, on-chain, graphical hub for gno.land. The design is
[ADR-0001](adr/0001-gnoworld.md); how to build and test is
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md); how changes are reviewed is
[docs/REVIEW.md](docs/REVIEW.md).

## Rules

- Never add `Co-Authored-By`, "Generated with" or any other attribution line to commits or pull requests. The `commit-msg` hook rejects them.
- Never push, publish or deploy to a public network without being asked in the current conversation.
- Talk to Alexis in French. Code, comments, commits and docs are in English.

## How we work

- Test first: write the failing test, run it, see it fail, then write the code. The mutation check finds every guard; one no test can catch yet goes into `GAPS` in `scripts/mutate.py`, with the reason.
- `scripts/check.sh` must pass before every commit (the pre-commit hook runs it). Never skip it.
- Strict TypeScript: no `any`, no `@ts-ignore`, no `!`. Data from the relay, the indexer or a realm goes through Zod first.
- Never change a test to make code pass without saying so in the review card.
- No new dependency without asking.
- Pairing: in `app/src/core/**`, and wherever a slice plan says "human", write the failing test and stop. Alexis writes the code; then review it.
- Explain a language, React or tooling feature newer than 2025 the first time it appears, in two lines.
- Work one slice at a time (`docs/plans/`). Stop at the end of a slice for review.

## Review card (end of every change)

1. Read line by line: the tier-1 files (docs/REVIEW.md). Name them.
2. Read the tests, skim the code: name the files.
3. Try it: what to run or click.
4. What the tests prove, and what they do not.
5. Do not trust me on: what I did not run, verify or understand.
6. Changed: dependencies, tests, deviations from the plan.

In the first slices, give items 1–3 only and wait for Alexis's review before sharing findings (docs/REVIEW.md, "Blind first").
