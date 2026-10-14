# Development

## Setup

```sh
git config core.hooksPath .githooks   # the gate before each commit and merge; no attribution lines
```

The gate needs Go 1.26, Python 3, and a gno toolchain that matches the chain.

## Toolchain

The chains run the release named in ADR-0001's "Verified against" row. The gate uses
`$GNO_TOOLCHAIN/gno` and `$GNO_TOOLCHAIN/gnohome`. `GNO_TOOLCHAIN` defaults to
`~/.cache/gno-toolchains/onyx`, the same toolchain gnogolf uses. To build one from a gno
checkout without touching it:

```sh
T=~/.cache/gno-toolchains/onyx-v1.5.1
mkdir -p $T/src && git -C ~/Server/gno archive v1.5.1 | tar -x -C $T/src
(cd $T/src && go build -o $T/gno ./gnovm/cmd/gno && cd contribs/gnodev && go build -o $T/gnodev .)
GNO_TOOLCHAIN=$T GNOROOT=$T/src ./scripts/check.sh   # the first run downloads p/nt/* into $T/gnohome
```

## The gate

`./scripts/check.sh` stops at the first failure:

1. **Realms:** `gno lint` and `gno test` on `./r/...`.
2. **Mutation check** (`scripts/mutate.py`; its header says how it works): every guard in a
   realm, removed in turn, must fail a test. The known gaps are listed there, with their
   reason.
3. **Reference client:** `gofmt` and `go vet`. `r/seal/vectors_test.gno` must be exactly
   what `go run ./tools/sealvec` prints. To regenerate it:
   `go run ./tools/sealvec > r/seal/vectors_test.gno`.

The pre-commit hook runs the gate on what is staged, and skips it when only docs are staged (`docs/`, `adr/`, Markdown, `.claude/`). `scripts/test_hooks.sh`, run by the gate, checks the hooks themselves.

## Slices

One slice at a time, each with its plan in `docs/plans/` (ADR-0001 §14, CLAUDE.md).
