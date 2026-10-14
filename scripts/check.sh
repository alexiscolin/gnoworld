#!/bin/sh
# check.sh: everything that must pass before a commit or a deploy (ADR-0001 §14).
# The pre-commit hook and CI run it. It stops at the first failure.
#
# The gno toolchain must match the chain (docs/DEVELOPMENT.md, "Toolchain"):
# GNO_TOOLCHAIN is the folder holding gno and its gnohome.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNO=${GNO:-$toolchain/gno}
if [ ! -x "$GNO" ]; then
	echo "check.sh: no gno at $GNO (docs/DEVELOPMENT.md, \"Toolchain\")" >&2
	exit 1
fi
export GNO GNOHOME="${GNOHOME:-$toolchain/gnohome}"

echo "== realms: lint and tests"
"$GNO" lint ./r/...
"$GNO" test ./r/...

echo "== realms: removing a guard fails a test (scripts/mutations.txt)"
python3 -I scripts/mutate.py

echo "== reference client: format, vet, and the vectors the realm tests use"
unformatted=$(gofmt -l tools)
if [ -n "$unformatted" ]; then
	echo "gofmt: $unformatted" >&2
	exit 1
fi
go vet ./tools/...
# Every vector the tests use must be what tools/sealvec computes today.
go run ./tools/sealvec -chain dev -realm gno.land/r/gnoworld/seal \
	-a g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 -b g1y2tswmrtlany2ffmpyc0uyunk4gt4gv8gtf736 |
	while IFS= read -r line; do
		name=${line%% =*}
		value=${line#*= }
		case $name in n | bindSigB) continue ;; esac # unused by the tests
		if ! grep -qF -- "$value" r/seal/seal_test.gno; then
			echo "r/seal/seal_test.gno lacks sealvec's $name: $value" >&2
			exit 1
		fi
	done

echo "all checks passed"
