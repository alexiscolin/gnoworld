# Review

Review by risk, not line by line everywhere.

## What to read, and how

| Tier | What | How |
|---|---|---|
| 1. Every line | Realms (`r/`, `p/`), crypto (signed statements, Merkle, key storage, the MLS boundary), the sponsor (key, caps), relay authorization, the CSP | Every line, plus a fresh-context `gno-auditor` pass for realms. External audit before mainnet |
| 2. Tests first | Client logic (state, queries), relay plumbing | Read the tests closely, skim the code. The tests are the spec |
| 3. Use it | Interface, 3D, motion | Run it and use it; read the budgets the gate prints |

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
  - a guard with no line in `scripts/mutations.txt`.
- **TypeScript and React:**
  - promises that are not awaited;
  - `as` on outside data;
  - effect dependencies, and stale closures;
  - unchecked index access;
  - a new dependency.
- **Go (relay):**
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

## Blind first

In the first slices, the author gives only the review card's first three items: what to read, what to skim, what to try. Alexis reviews and writes findings, then compares them with the author's and with a fresh-context reviewer's. Each comparison goes into [review-log.md](review-log.md): what was caught, what was missed, and why.
