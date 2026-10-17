# Review exercise 01: `r/seal` before the audit

`seal.gno` is the exact version of `r/seal` before the independent audit. Read it cold.

## What the realm must guarantee

1. Only the holder of a chat key can bind it (`Bind`), and only to their own address.
2. A seal proves that the holders of keys `a` and `b` both signed the same root, for these `n` messages.
3. Anyone can submit a seal: one of the two parties or a sponsor pays.
4. Kept seals (`keep`) can be read by other realms, which use them as reputation.
5. A stolen chat key can be neutralised.
6. A session key (delegated, ADR-002) cannot change the user's chat key.

## Rules

- 45 minutes at most. Read neither `gno/r/seal/seal.gno` (the fixed version) nor the ADR's appendix before you have finished.
- If you have already read decisions 2 and 3 of the ADR, you know some of the answers. Then look mostly for the others, and check that you can point to the exact line.
- Follow the order of [`docs/REVIEW.md`](../../REVIEW.md): intent, tests, boundaries, errors, state, security and costs, readability.
- For each `issue:`, write the scenario: who calls what, with which arguments, and what they get.

To calibrate: the audit found 2 blocking flaws, 4 serious problems and 1 detail. You may find others.

## Where to write

In `findings.md` (to create), one note per entry:

```
- issue (L66): <the problem>
  scenario: <who does what, and the result>
- question (L…): …
- nit (L…): …
```

Then we compare with the ADR's appendix and the fixed code, and note what you saw or missed in `docs/review-log.md`.
