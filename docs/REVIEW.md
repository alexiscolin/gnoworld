# Review

Review by risk, not line by line everywhere.

## What to read, and how

| Tier | What | Written by | How it is reviewed |
|---|---|---|---|
| 1 | Realms (`gno/r/`, `gno/p/`), the sponsor, relay authorization | Claude | Claude and a fresh-context `gno-auditor` read every line. Alexis reviews the function cards and the attack scenarios. External audit before mainnet |
| 1 | Client crypto (keys, signed statements, Merkle, the MLS boundary), the CSP | Alexis for the core, Claude elsewhere | Alexis reads every line |
| 2 | Other TypeScript (state, queries, views) | Alexis for the core, Claude elsewhere | Alexis reads the tests first, then every line |
| 1 | The server's login, the admin API's rights, the approval signing, the admin console, Jarvis's tool-allowlist loop, `lib/adena` | Claude | Alexis reads every line |
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
(`.claude/commands/pre-merge.md`) runs it, with the `test-auditor` and `security-reviewer` agents
(`.claude/agents/`):

1. **No tokens first.** The gate, then the mutation tester on the changed code: a surviving
   mutant is a missing test, found without a model.
2. **The test audit, in two passes.** Before any code, a fresh agent reviews the failing
   tests against the plan: complete, relevant, riskiest paths first, the threat model's abuse
   cases present. At the merge, it reads the mutation survivors and each new or changed
   test, and looks for
   tautologies, mocks of the thing under test, empty assertions ("was called", unread
   snapshots, loose matchers), missing failure and boundary cases, timing guesses, and a
   test not seen failing first (ADR-0002 §9). Its findings are fixed before anything else.
3. **Every lens where it finds.** `/simplify`'s altitude and simplification angles first (its
   efficiency angle too for a slice with a hot path: the 3D, the chat), their fixes applied and
   the gate run again; then Claude Code's `/code-review` (correctness, performance, accessibility
   and UX, with this file's checklists) and the `complexity-reviewer` (the cost in big O of each
   loop, against the size its input can reach) together, in a fresh context; a change to a tier-1
   file or the harness adds `/security-review`, and a tier-1 file the `security-reviewer` agent,
   on the strongest model, which reads the project's threat model (Alexis, 2026-10-21: the lenses
   that found nothing in an interface merge run where they find, docs/decisions.md). Each finding names its class, the
   kind of bug, and its fix covers every instance; one only about style, diagnostics or cleanup
   is dropped, `/simplify` owning those. Fixes are re-checked by the gate and the mutation
   tester; a second pass runs only for a high finding fixed in tier-1 code, and only its lens.
   Tests only the operator can run (`deploy/test.sh`, its mutants) run once, after every fix is
   in; a finding beyond the plan that is not high is put to Alexis, fix now or backlog.
   **Rounds converge**, as Anthropic's own reviewer does ("Solving code review at Anthropic"):
   the first round reads the branch, any later one only the diff since the last; after three
   rounds the review stops, and Claude and Alexis reconsider the approach before more code.
   A merge carries about 400 lines of product code at most when it touches a tier-1 file, and
   about 600 otherwise (DORA's small batches; Alexis, 2026-10-22): a slice is cut into merges of
   that size, and the review log notes each one's size, rounds and tokens.
4. **Each finding is verified, then reproduced, before it is fixed.** On a tier-1 lot, the
   `finding-verifier` agent (Opus) first tries to refute each finding, then to reproduce it, and
   its severity stands. Then: a command, or a test seen failing. One
   nobody could reproduce stays `claimed`; a false positive is `rejected`, a true one whose
   behaviour is wanted `intended`, a true one of no matter `moot`, each with its reason.
   A fix of the product proves itself: its tests, run on the commit before it, must fail
   (`scripts/prove_fix.py`, in the full gate).
5. **Nothing is waved through.** Every remaining finding is fixed, or put to Alexis with
   the scenario.
6. **Learn from it.** Every finding goes into [the findings ledger](review/findings.md), with
   its status and evidence, and a review reads it first: no rejected claim raised again
   without new evidence, and a fixed one that comes back filed as a regression. What Alexis
   caught and missed goes into the review log. A miss that repeats becomes a rule here, a
   lint, or a test; a lens whose findings are mostly dropped is narrowed or removed.
7. **Measure the harness by its findings.** Each `/pre-merge` writes to the review log how
   many verified findings it found in the harness itself (`scripts/`, `.githooks/`,
   `.claude/`), against the lines of harness it read. If that number falls from one merge to
   the next, the harness is getting solid. If it does not fall over three merges, the
   harness is simplified, not extended: a guard that keeps leaking is replaced by a boundary
   the system enforces (the sandbox, a server check), or removed.
8. **Keep it cheap.** Each merge runs in a new Claude Code session: the memory and the docs
   carry the state, and a session reads its whole history again at every exchange. A
   workspace is reviewed whole once per slice, at its true last merge; a follow-up merge of
   fixes reads only its range, with `/simplify`'s altitude angle alone. Every agent and lens
   is asked for a short report: its findings, one row each with its evidence.

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

Alexis reads the diff in revdiff, beside the session: `revdiff origin/main -o .claude/tmp/review.txt`. His notes land in that file, which git ignores; "read the review" asks Claude to read them and answer each one.

In the first slices, the author gives only the review card's first three items: what to read, what to skim, what to try. Alexis reviews and writes findings, then compares them with the author's and with a fresh-context reviewer's. Each comparison goes into [review-log.md](review-log.md): what was caught, what was missed, and why.
