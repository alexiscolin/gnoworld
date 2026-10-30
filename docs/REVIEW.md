# Review

Review by risk, not line by line everywhere.

## What to read, and how

| Tier | What | Written by | How it is reviewed |
|---|---|---|---|
| 1 | Realms (`gno/r/`, `gno/p/`), the sponsor, relay authorization (`server/src/ergo/`) | Claude | Claude and a fresh-context `gno-auditor` read every line. Alexis reviews the function cards and the attack scenarios. External audit before mainnet |
| 1 | Client crypto (keys, signed statements, Merkle, the MLS boundary), the CSP (`app/src/csp.ts`) | Alexis for the core, Claude elsewhere | Alexis reads every line |
| 2 | Other TypeScript (state, queries, views) | Alexis for the core, Claude elsewhere | Alexis reads the tests first, then every line |
| 1 | The server's login (`server/src/login/`) and the client's (`app/src/features/login/`, `app/src/lib/api/login.ts`, `app/src/lib/ergo/`), the admin API's rights (`server/src/roles/`, `server/roles.json`), the approval signing, the admin console, Jarvis's tool-allowlist loop, Adena (`app/src/lib/adena/`) | Claude | Alexis reads every line |
| 1 | What decides who may do what at the edge: the deploy folder (`deploy/`), the markdown scanner (`packages/core/src/markdown/`), the service worker (`app/src/sw/`) | Claude | Alexis reads every line |
| 2 | The rest of the server (TypeScript on Node) | Claude | Alexis reads the tests first, then every line |
| 2 | Go (the seal reference client) | Claude | Behaviour and tests |
| 3 | Interface, 3D, motion | Either | Run it; read the budgets the gate prints |

## Order

Most important first:

1. **Intent:** does it do what the plan says, and only that?
2. **Tests:** do they check the right thing? Would they fail if the code were wrong? The mutation check answers this for realms.
3. **Boundaries:** is untrusted input validated? Who may call this?
4. **Errors:** surfaced or swallowed?
5. **State and ordering:** races, stale state, cleanup.
6. **Security and costs:** secrets, gas, storage, render loops.
7. **Readability:** last.

## What to look for, by technology

The checklists live in `.claude/rules/`, one file per area (realms, TypeScript, the server,
Go, `packages/core`). Claude Code loads each one when a change or a review touches its files.

## Warning signs

- A test changed to pass, or skipped (`.skip`, `.only`).
- A mock that hides the real behaviour.
- A `catch` that swallows the error.
- A lint rule switched off.
- Hand-written crypto.
- A `TODO` in tier-1 code.

## Comments

Use [Conventional Comments](https://conventionalcomments.org): `issue:` (blocks the merge), `question:`, `suggestion:`, `nit:`. For an `issue:`, write the scenario: who calls what, with which arguments, and what they get.

## AI review before a merge

Code written by an agent gets the same reading as anyone's, plus this. `/pre-merge`
(`.claude/commands/pre-merge.md`) runs it, with the agents of `.claude/agents/`; from slice 5 a
branch's Workflow loop runs it (Alexis, 2026-10-28, `docs/decisions.md`):

1. **No tokens first.** The merge's gate, then the mutation tester on the changed code: a
   surviving mutant is a missing test, found without a model.
2. **The red pass, once per branch.** Before any code, the `test-auditor` reviews the branch's
   failing tests against the plan: complete, relevant, riskiest paths first, the threat model's
   abuse cases present. Their commit says what it fixed (`Red-pass:`). A fixer's tests get none.
3. **One combined review.** The `reviewer` agent reads the branch once: the tests' green pass on the
   mutation survivors (tautologies, mocks of the thing under test, empty assertions, timing
   guesses, a test weakened since its red pass), correctness, security, cost in big O against the
   size each input reaches, and simplification. A tier-1 file or the harness adds the
   `security-reviewer` (Opus, the threat model), a realm the `gno-auditor`. Each finding names its
   class, and its fix covers every instance; one only about style is dropped. A merge carries
   about 400 lines of product code at most when it touches a tier-1 file, and about 600 otherwise
   (DORA's small batches; Alexis, 2026-10-22).
4. **Verified, then reproduced, before it is fixed.** On tier-1 files the `finding-verifier`
   (Opus) first tries to refute each finding, then to reproduce it, and its severity stands. Then:
   a command, or a test seen failing. One nobody could reproduce stays `claimed`; a false positive
   is `rejected`, a true one whose behaviour is wanted `intended`, a true one of no matter `moot`,
   each with its reason. A speed claim names the call it timed, its input, Node's version and what
   the call answered. A fix of the product proves itself: its tests, run on the commit before it,
   must fail (`scripts/prove_fix.py`, in the full gate).
5. **High and medium fixed, low listed.** High and medium findings are fixed, test first. Low ones
   and anything beyond the plan go to one list for Alexis with a recommendation (fix now, a backlog
   row, or moot). A second round runs only for a high finding fixed in a tier-1 file, only its
   lens, on the diff since the first; after three rounds the review stops and Claude and Alexis
   reconsider the approach.
6. **Learn from it.** Every finding goes into [the findings ledger](review/findings.md), with its
   status and evidence, and a review reads it first: no rejected claim raised again without new
   evidence, and a fixed one that comes back filed as a regression. What Alexis caught and missed
   goes into the review log, with each branch's rounds, tokens and hours (measured against slice
   4's). At each slice's end, the dream (`CLAUDE.md`) reads the agents' reports, the learnings, the
   log and the ledger, and proposes the rules and memories a repeated miss calls for; Alexis
   accepts each.
7. **Measure the harness by its findings.** Each `/pre-merge` writes to the review log how many
   verified findings it found in the harness itself (`scripts/`, `.githooks/`, `.claude/`). If
   that number does not fall over three merges, the harness is simplified, not extended: a guard
   that keeps leaking is replaced by a boundary the system enforces (the sandbox, a server
   check), or removed.
8. **Keep it cheap.** Each branch runs in a new session of its own, in its own worktree, two at
   most at once; the chief session plans, integrates and runs the full gate. Agents are fresh,
   briefed from files, four at most at once, each asked for a short report: its findings, one row
   each with its evidence. A workspace is reviewed whole once per slice, at its true last merge.

## Before a push

Each merge lives on its branch. Pushing a work branch wants a gate that passed on its code, and
scans the history for secrets (`.githooks/pre-push`); pushing `main` wants the full gate's
record of exactly that code and a committed `/pre-merge` pass whose fingerprint matches it
(`scripts/review_pass.py`): a change after the review voids both, the review's own record does
not. In Alexis's shell the hooks run no gate, only these checks (F076); the CI runs the full
gate again, and blocks nothing until `main` is protected. A merge made on GitHub skips the
hooks, so merges happen locally after `/pre-merge`, through `sh .git/hooks/merge.sh <branch>`,
which shows each harness file the branch changes before git writes it (F129); then `main` is
pushed, with the hooks installed from it.

## Blind first

Alexis reads the diff in revdiff, beside the session, from the main checkout: `revdiff -o .claude/tmp/revdiff.md <base> <branch>` (the previous merge's branch, then this one). His notes land in that file, which git ignores; "read the review" asks Claude to read them and answer each one.

In the first slices, the author gives only the review card's items 1–3, 7 and 8: what to read, what to skim, what to try, each realm function's card, the risk and its undo. Alexis reviews and writes findings, then compares them with the author's and with a fresh-context reviewer's. Each comparison goes into [review-log.md](review-log.md): what was caught, what was missed, and why.
