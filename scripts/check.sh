#!/bin/sh
# check.sh: the gate (ADR-0001 §14, ADR-0002 §9). It stops at the first failure.
# - Fast, by default: every commit (the pre-commit hook) and every turn of Claude Code
#   (the Stop hook) run it; it stays under a minute.
# - `--full` adds what /pre-merge and CI run: the harness's own probe, coverage and patch
#   coverage, mutations, and the scan of the whole history for secrets.
#
# GNO_TOOLCHAIN is the folder holding a gno that matches the chain, and its gnohome
# (docs/DEVELOPMENT.md, "Toolchain"). Node comes from .node-version, through nvm when the
# shell's own differs.
set -eu
cd "$(dirname "$0")/.."
full=false
[ "${1:-}" = "--full" ] && full=true

want="v$(cat .node-version)"
nvm_node="${NVM_DIR:-$HOME/.nvm}/versions/node/$want/bin"
[ "$(node -v 2>/dev/null || :)" = "$want" ] || [ ! -x "$nvm_node/node" ] || PATH="$nvm_node:$PATH"
[ "$(node -v 2>/dev/null || :)" = "$want" ] || {
	echo "check.sh: Node $want is needed (.node-version; docs/DEVELOPMENT.md, \"Setup\")" >&2
	exit 1
}
toolchain=$(cd "${GNO_TOOLCHAIN:-$HOME/.cache/gno-toolchains/onyx}" && pwd) # absolute: gno also runs from temporary folders
export GNO="$toolchain/gno" GNOHOME="$toolchain/gnohome"
if [ ! -x "$GNO" ]; then
	echo "check.sh: no gno at $GNO (docs/DEVELOPMENT.md, \"Toolchain\")" >&2
	exit 1
fi

# The tools run straight from node_modules/.bin, not through `pnpm run`: the pre-commit copy
# borrows node_modules, where pnpm would try to install first. package.json has the same commands.
bin=node_modules/.bin
echo "== TypeScript: format, types, lint, tests"
"$bin/prettier" --check --log-level warn .
"$bin/tsc" -p tsconfig.json
"$bin/eslint" --cache --max-warnings 0 .
"$bin/vitest" run

echo "== no dead code, no copy, no renamed copy, CSS and comment rules"
"$bin/knip" --no-progress
"$bin/jscpd" . >/dev/null
node scripts/clones.mjs
python3 -I scripts/check_css.py
python3 -I scripts/check_comments.py

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

echo "== harness docs name only files that exist"
python3 -I scripts/check_docs.py

echo "== hooks"
sh scripts/test_hooks.sh

if $full; then
	echo "== the harness keeps its promises (scripts/probe.py)"
	python3 -I scripts/probe.py
	echo "== coverage: 85% everywhere, core 100%; and 85% of the lines this branch changed"
	"$bin/vitest" run --coverage
	python3 -I scripts/patch_coverage.py "$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse HEAD)" 85
	echo "== mutations (StrykerJS, incremental)"
	"$bin/stryker" run
	echo "== no secret anywhere in the history"
	gitleaks git --no-banner --redact .
fi

echo "all checks passed"
