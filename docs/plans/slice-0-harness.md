# Slice 0 — the harness

Status: done, 2026-10-14.

## Goal

Make every later slice safe to build fast: one gate, hooks, and the review method. No
product code.

## Tests first, and their results

| # | Test | Result |
|---|---|---|
| 1 | `scripts/check.sh` passes on the current tree | passes |
| 2 | Removing a guard from `r/seal` makes the gate fail | `mustStrong(pub)` removed → `TestWeakKeys` fails, exit 1 |
| 3 | A test vector that drifts from `tools/sealvec` makes the gate fail | `"deal"` changed in sealvec → "seal_test.gno lacks sealvec's root", exit 1 |
| 4 | The mutation check cannot mistake a broken setup for killed mutations | A control run on the untouched copy; the first version had exactly that bug (a package copied outside the workspace failed for every mutation) |
| 5 | The `commit-msg` hook refuses an attribution line and accepts a clean message | exit 1, exit 0 |

## What the mutation check found

Six of `r/seal`'s ten guards are covered by a test. Four are not:

- `mustStrong(b)`;
- `mustBeCurrent(kb)`;
- the owner check in `Bind`;
- the session check in `Bind`.

The ADR said "every guard is tested", which was too broad. The first three are closed in
slice 1. The last one needs a live chain: test 8 of slice 1.
