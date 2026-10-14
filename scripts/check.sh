#!/bin/sh
# check.sh: everything that must pass before a commit or a deploy (ADR-0001 §14).
# The pre-commit hook runs it; CI will too, once there is a remote. It stops at
# the first failure.
#
# GNO_TOOLCHAIN is the folder holding a gno that matches the chain, and its
# gnohome (docs/DEVELOPMENT.md, "Toolchain").
set -eu
cd "$(dirname "$0")/.."

toolchain=$(cd "${GNO_TOOLCHAIN:-$HOME/.cache/gno-toolchains/onyx}" && pwd) # absolute: gno also runs from temporary folders
export GNO="$toolchain/gno" GNOHOME="$toolchain/gnohome"
if [ ! -x "$GNO" ]; then
	echo "check.sh: no gno at $GNO (docs/DEVELOPMENT.md, \"Toolchain\")" >&2
	exit 1
fi

echo "== realms: lint and tests"
"$GNO" lint ./r/...
"$GNO" test ./r/...

echo "== realms: removing any guard fails a test"
python3 -I scripts/mutate.py

echo "== reference client: format, vet, and the vectors file it generates"
test -z "$(gofmt -l tools)" || { gofmt -l tools >&2; exit 1; }
go vet ./tools/...
go run ./tools/sealvec | cmp -s - r/seal/vectors_test.gno || {
	echo "r/seal/vectors_test.gno differs from: go run ./tools/sealvec" >&2
	exit 1
}

echo "== hooks"
sh scripts/test_hooks.sh

echo "all checks passed"
