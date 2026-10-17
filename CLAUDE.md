# Notes for AI assistants

gnoworld: a social, on-chain, graphical hub for gno.land. The design is
[ADR-0001](adr/0001-gnoworld.md), with the approved prototype's scope in
[ADR-0002](adr/0002-validated-prototype.md). The code layout and its rules are
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the look is
[docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md); the order of work is
[docs/plans/backlog.md](docs/plans/backlog.md). How to build and test is
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md); how changes are reviewed is
[docs/REVIEW.md](docs/REVIEW.md).

## Rules

- Never add `Co-Authored-By`, "Generated with" or any other attribution line to commits or pull requests. The `commit-msg` hook rejects them.
- Never push, publish or deploy to a public network without being asked in the current conversation.
- Talk to Alexis in French. Code, comments, commits and docs are in English.

## How we work

- Test first: write the failing test, run it, see it fail, then write the code. The mutation check finds every guard; one no test can catch yet goes into `GAPS` in `scripts/mutate.py`, with the reason.
- `scripts/check.sh` must pass before every commit that changes code (the pre-commit hook runs it). Never commit with `--no-verify`.
- Strict TypeScript: no `any`, no `@ts-ignore`, no `!`. Data from the relay, the indexer or a realm goes through Zod first.
- Never change a test to make code pass without saying so in the review card.
- Each area's rules are in `.claude/rules/`, loaded when its files are touched. Every review, `/code-review` included, also reads the tiers in `docs/REVIEW.md`.
- No new dependency without asking.
- Pairing: in `packages/core/**` (`.claude/rules/core.md`), and wherever a slice plan says "human", write the failing test, commit it marked `test.fails` (the gate and the Stop hook accept it), and stop. Alexis writes the code and removes the mark; then review it.
- Claude writes the realms, the server and any Go (who reviews what: docs/REVIEW.md).
- Explain a language, React or tooling feature newer than 2025 the first time it appears, in two lines.
- Invent nothing. A claim about a library, a browser API or a gno package comes from the installed types or source at the pinned version, official docs read in this session, or a live query of the target chain (gnomcp); never from memory. Every claim in a review card cites its evidence (a command's output, `file:line`, a URL), and what was not verified is named.
- A turn that changes code ends with the gate green: the Stop hook runs `scripts/check.sh` and blocks once. Speed, algorithmic growth, scale and memory are measured locally by the gate's benches; `/pre-merge` runs the full set on this machine, the GPU bench included.
- Work one slice at a time (`docs/plans/`). Stop at the end of a slice for review.
- The prototype (`docs/prototype/`) is the reference for what to build and how it feels. Never copy its code: rebuild each concept test first, with the design system's components.

## Review card (end of every change)

1. Read line by line: the tier-1 files (docs/REVIEW.md). Name them.
2. Read the tests, skim the code: name the files.
3. Try it: what to run or click.
4. What the tests prove, and what they do not.
5. Do not trust me on: what I did not run, verify or understand.
6. Changed: dependencies, tests, deviations from the plan.
7. For each changed realm function, its card: who may call it, what it checks in order, what it changes, its cost, the tests that prove it.

In the first slices, give items 1–3 and 7 only, and wait for Alexis's review before sharing findings. While he reviews, answer only the question asked, with no hint of other problems (docs/REVIEW.md, "Blind first").
