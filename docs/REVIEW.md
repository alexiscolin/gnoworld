# Review

Review by risk, not line by line everywhere.

## What to read, and how

| Tier | What | Written by | How it is reviewed |
|---|---|---|---|
| 1 | Realms (`r/`, `p/`), the sponsor, relay authorization | Claude | Claude and a fresh-context `gno-auditor` read every line. Alexis reviews the function cards and the attack scenarios. External audit before mainnet |
| 1 | Client crypto (keys, signed statements, Merkle, the MLS boundary), the CSP | Alexis for the core, Claude elsewhere | Alexis reads every line |
| 2 | Other TypeScript (state, queries, views) | Alexis for the core, Claude elsewhere | Alexis reads the tests first, then every line |
| 1 | The server's login, the admin API's rights, the approval signing | Claude | Alexis reads every line |
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

- **gno:**
  - caller identity (`cur.Previous()`, never `OriginCaller` for authority);
  - panic versus error, since an error does not revert;
  - storage per object;
  - escaping in `Render`;
  - cross-realm calls;
  - a new entry in `GAPS` (`scripts/mutate.py`).
- **TypeScript and React:**
  - promises that are not awaited;
  - `as` on outside data;
  - effect dependencies, and stale closures;
  - a new dependency.
- **Node (the server):**
  - work that blocks the event loop;
  - a promise left floating, or a rejection swallowed;
  - an outbound call without a timeout;
  - a map, a queue or a cache without a bound;
  - authorization checked before any work;
  - a clean stop on `SIGTERM`.
- **Go (the reference client):**
  - goroutine leaks;
  - context cancellation;
  - maps that grow without bound;
  - timeouts;
  - authorization checked before any work.

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
(`.claude/commands/pre-merge.md`) runs it, with the `test-auditor` and `reviewer` agents
(`.claude/agents/`):

1. **The test audit comes first.** A fresh agent whose only job is the tests checks each
   new or changed one: it runs the mutation tester on the changed code, and looks for
   tautologies, mocks of the thing under test, empty assertions ("was called", unread
   snapshots, loose matchers), missing failure and boundary cases, timing guesses, and a
   test not seen failing first (ADR-0002 §9). Its findings are fixed before anything else.
2. **Five fresh-context lenses** then read the diff, each an agent that did not write it:
   correctness, security, performance, accessibility and UX, simplicity.
3. **Verify each finding.** A second pass checks it against the code and drops the false
   positives.
4. **Nothing is waved through.** Every remaining finding is fixed, or put to Alexis with
   the scenario.
5. **Learn from it.** Findings and outcomes go into the review log. A miss that repeats
   becomes a rule here, a lint, or a test.

## Blind first

In the first slices, the author gives only the review card's first three items: what to read, what to skim, what to try. Alexis reviews and writes findings, then compares them with the author's and with a fresh-context reviewer's. Each comparison goes into [review-log.md](review-log.md): what was caught, what was missed, and why.
