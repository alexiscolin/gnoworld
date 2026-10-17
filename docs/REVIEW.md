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
3. **One review pass, sized by risk.** Claude Code's own `/code-review` reads the change in a
   fresh context, through every lens at once: correctness, security, performance,
   accessibility and UX, simplicity, with this file's checklists. A change to a tier-1 file adds one more agent, on the
   strongest model, for security alone. Fixes are re-checked by the gate and the mutation
   tester; a second pass runs only for a high finding fixed in tier-1 code.
4. **Each finding is checked against the code** before it is fixed, and a false positive is
   dropped with its reason.
5. **Nothing is waved through.** Every remaining finding is fixed, or put to Alexis with
   the scenario.
6. **Learn from it.** Findings and outcomes go into the review log. A miss that repeats
   becomes a rule here, a lint, or a test; a lens whose findings are mostly dropped is
   narrowed or removed.

## Before a push

Each merge lives on its branch. Pushing runs the full gate (`.githooks/pre-push`); pushing
`main` also needs a committed `/pre-merge` pass whose fingerprint matches the code
(`scripts/review_pass.py`): a change after the review voids it, the review's own record does
not. Until CI exists, these hooks are the barrier; a merge made on GitHub skips them, so
merges happen locally after `/pre-merge`, then `main` is pushed.

## Blind first

Alexis reads the diff in revdiff, beside the session: `revdiff origin/main -o .claude/tmp/review.txt`. His notes land in that file, which git ignores; "read the review" asks Claude to read them and answer each one.

In the first slices, the author gives only the review card's first three items: what to read, what to skim, what to try. Alexis reviews and writes findings, then compares them with the author's and with a fresh-context reviewer's. Each comparison goes into [review-log.md](review-log.md): what was caught, what was missed, and why.
