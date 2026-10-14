# Development

## Layout

```
adr/0001-gnoworld.md        the design: what, why, and what was verified
r/seal                      gno.land/r/gnoworld/seal: chat keys and conversation seals
tools/sealvec               the reference client for r/seal's signing formats (Go)
scripts/check.sh            the gate: everything that must pass before a commit
scripts/mutate.py           the mutation check, driven by scripts/mutations.txt
docs/REVIEW.md              how changes are reviewed
docs/plans/                 one plan per slice of the proof of concept
docs/review/                review exercises
```

## Setup

```sh
git config core.hooksPath .githooks   # the gate before each commit, no attribution lines
nvm use                               # Node 24 LTS (.nvmrc), for the client from slice 2
```

Go 1.26 and Python 3 are needed by the gate.

## Toolchain

The realms are tested with a `gno` that matches the chain. Mainnet and onyx run `v1.5.1`
(onyx `v1.5.1-rc.1`, the same commit `07e44776c`). The gate looks for it in
`~/.cache/gno-toolchains/onyx`, as gnogolf does; `GNO_TOOLCHAIN` (or `GNO`) points
elsewhere. To build one from a gno checkout, without touching it:

```sh
mkdir -p /tmp/gno-v151 && git -C ~/Server/gno archive v1.5.1 | tar -x -C /tmp/gno-v151
(cd /tmp/gno-v151 && go build -o /tmp/gno-v151/bin/gno ./gnovm/cmd/gno)
GNO=/tmp/gno-v151/bin/gno GNOROOT=/tmp/gno-v151 ./scripts/check.sh
```

## The gate

```sh
./scripts/check.sh
```

It stops at the first failure:

1. **Realms:** `gno lint` and `gno test` on `./r/...`.
2. **Mutation check:** each guard listed in `scripts/mutations.txt` is removed, one at a
   time, in a copy of its package.
   - A `kill` guard must make a test fail.
   - A `gap` guard is a known hole, with its reason, and must still survive. Closing a gap
     therefore means editing the list.
   - A first run on the untouched copy must pass, so a broken setup cannot pass for killed
     mutations.
3. **Reference client:** `gofmt`, `go vet`, and every vector the realm tests use is what
   `tools/sealvec` computes today.

It grows with each slice: the client's typecheck, lint, tests, build and budgets, then the
relay's tests.

## Slices

The proof of concept moves one slice at a time (ADR-0001 §14). A slice starts with its
plan in `docs/plans/`. The plan lists the tests first, and Alexis approves them before the
code is written. A slice ends with the gate green, a review card (CLAUDE.md), and one or a
few commits.
