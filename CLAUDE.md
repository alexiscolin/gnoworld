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
- Code, comments, commits and docs are in English, whatever language the conversation is in. How to talk to each person is in their `CLAUDE.local.md`, which is not committed.
- Be critical, never complacent and never flattering: say what is wrong, weak or missing, with its evidence, even unasked; go into the detail and be exhaustive on what matters; keep to the point, and invent nothing.

## How we work

- Test first: write the failing tests, run them, see them fail, then launch the `test-auditor` for its red pass (complete, relevant, impact first, security) and fix its findings; the commit of those tests says so in a line `Red-pass: <findings fixed>`, the mark the green pass measures drift from. Only then write the code. The mutation check finds every guard; one no test can catch yet goes into `GAPS` in `scripts/mutate.py`, with the reason.
- `scripts/check.sh` must pass before every commit that changes code (the pre-commit hook runs it). Never commit with `--no-verify`.
- Strict TypeScript: no `any`, no `@ts-ignore`, no `!`. Data from the relay, the indexer or a realm goes through Zod first.
- Never change a test to make code pass without saying so in the review card.
- Each area's rules are in `.claude/rules/`, loaded when its files are touched. Every review, `/code-review` included, also reads the tiers in `docs/REVIEW.md`.
- Pairing: in `packages/core/**` (`.claude/rules/core.md`), and wherever a slice plan says "human", write the failing test, commit it marked `test.fails` (the gate and the Stop hook accept it), and stop. Alexis writes the code and removes the mark; then review it.
- Claude writes the realms, the server and any Go (who reviews what: docs/REVIEW.md).
- Everything about gno (realms, pure packages, chain reads and writes) goes through gnomcp, never memory, `gnokey` or raw RPC; `scripts/guard.py` refuses the rest (`.claude/rules/gno.md`).
- Read a file before changing it; before changing an exported symbol, find every reference through the language server (`typescript-lsp`), not by text search.
- Commits: conventional subjects, `type(scope): what` in 72 characters at most (`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`, `revert`; the commit-msg hook holds it); one behaviour each, and a refactor apart. Stage files by name, never everything at once (an editor's swap file went in that way once).
- A speed, size or score claim compares the same work before and after (same inputs, same counts), with both numbers shown.
- Explain a language, React or tooling feature newer than 2025 the first time it appears, in two lines.
- Invent nothing. A claim about a library, a browser API or a gno package comes from the installed types or source at the pinned version, official docs read in this session, or a live query of the target chain (gnomcp); never from memory. Every claim in a review card cites its evidence (a command's output, `file:line`, a URL), and what was not verified is named.
- When the harness misses something (a bug that passed the gate and review found, a surviving mutant, a clean file refused), propose in the same turn the rule, the probe case or the test that would have caught it, not only the code fix; the probe and the harness mutation print their own proposals.
- A new guard (a lint rule, a check, a hook) lands with the fault that proves it (`scripts/probe.py` or `scripts/test_hooks.sh`), and `scripts/harness_mutate.py` must see a test fail when the guard is switched off; the full gate runs it whenever the harness changes.
- A turn that changes code ends with the gate green: the Stop hook runs `scripts/check.sh` and blocks once. How the gate, the hooks and the reviews work: `docs/HARNESS.md`. The fast gate holds a 60 s budget; the benches (speed, growth, memory, the GPU) arrive with slice 1b and run in `/pre-merge`.
- Work one slice at a time (`docs/plans/`), each merge on its own branch (`slice-1a`), pushed only when asked; `main` takes a merge only after `/pre-merge` (the pre-push hook refuses it otherwise). Stop at the end of a slice for review.
- The prototype (`docs/prototype/`) is the reference for what to build and how it feels. Never copy its code: rebuild each concept test first, with the design system's components.
- When Alexis corrects something this file or `.claude/rules/` could have prevented, propose the line that would have.

## No regression

- A fix starts with a test that reproduces the bug, seen failing, and is committed with it; the test's name says the bug.
- A feature lands with its journey (Playwright) and, when it shows something, its approved screenshots.
- The safety net never shrinks quietly: a test gone (Vitest, gno or Go; a rename included) or switched to `.fails`, a floor lowered (coverage, mutation), a known gap or an ignore added, or an approved screenshot changed fails the push unless a commit of the branch says why on a line of its own, `Key: <item> - why` (`Removed-test:`, `Lowered-floor:`, `Updated-baseline:`), which Alexis reads in review (`scripts/check_regressions.py`). No test is switched off (`.skip`, `.only`, `.todo`); `.fails` is for pairing, in core only.
- Floors rise with the scores, and never come down.

## Stop and ask

- A new dependency, tool or plugin.
- A change to a committed public signature, a store's shape, a schema already in use, or a realm's storage layout.
- A diff growing past what the plan describes.
- A test that would have to change to pass.
- The same problem corrected twice.
- Anything touching secrets, permissions, the sandbox or deployment security.

## Review card (end of every change)

1. Read line by line: the tier-1 files (docs/REVIEW.md). Name them.
2. Read the tests, skim the code: name the files.
3. Try it: what to run or click.
4. What the tests prove, and what they do not.
5. Do not trust me on: what I did not run, verify or understand.
6. Changed: every file, by category (`git diff --stat`); dependencies, tests, deviations from the plan.
7. For each changed realm function, its card: who may call it, what it checks in order, what it changes, its cost, the tests that prove it.

In the first slices, give items 1–3 and 7 only, and wait for Alexis's review before sharing findings. While he reviews, answer only the question asked, with no hint of other problems (docs/REVIEW.md, "Blind first").
