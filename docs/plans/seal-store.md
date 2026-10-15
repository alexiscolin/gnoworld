# Seal store — `r/seal`: data apart from rules, the gaps closed, on onyx

Status: deferred to phase 2, with private rooms (ADR-0001, Rollout). The tests below are written first, and are approved before any code.

## Goal

1. Split `r/seal` into a permanent store and a versioned rules realm (ADR-0001 §14):
   - `r/gnoworld/store` holds the bindings, the kept seals and the counts;
   - `r/gnoworld/seal/v1` holds `Bind`, `Seal`, `Anchor` and the reads, and writes the store.
2. Close the known gaps of `GAPS` in `scripts/mutate.py` that local tests can close.
3. Deploy on onyx, and run the phase-0 checks that need a live chain.

## Tests first

| # | Test | Closes |
|---|---|---|
| 1 | The five current tests, moved to `seal/v1` unchanged, still pass | — |
| 2 | A seal with a small-order key as `b` (and a strong `a`) aborts with `weak key` | gap `mustStrong(b)` |
| 3 | After carol rotates her key, a seal where her old key is `b` aborts with `key rotated out` (new vectors from `sealvec`: carol's binds, alice's half of the alice–carol seal) | gap `mustBeCurrent(kb)` |
| 4 | A key bound by alice cannot be bound by bob, even with a valid signature of the key over bob's address (new vector) | gap on the owner check |
| 5 | Only `seal/v1` can write the store: a call from any other realm or user aborts | new guard, found by the mutation check |
| 5b | A seal with `n = 0` aborts with `n must be positive`; a seal with a valid `sigA` and a bad `sigB` aborts with `bad signature` | gaps `if n < 1` and the `sigB` branch |
| 6 | Gas and storage goldens for `Bind`, `Seal` (event, kept) and `Anchor` | — |
| 7 | On onyx: a `dev` vector aborts with `bad signature` (domain separation) | ADR feasibility row |
| 8 | On onyx: `Bind` under a session aborts (needs a session approved with Alexis's key) | gap on the session check |

## Out of scope

- The hubs realm (phase 1).
- The client.

## Open before starting

- **Question 13:** which namespace do we deploy to on onyx? Either Alexis's `nym-` name,
  which Alexis signs, or the agent key's own address.
- **Check Adena early:** can it create a session (question 2)? Test 8 and the sessions depend
  on it.
