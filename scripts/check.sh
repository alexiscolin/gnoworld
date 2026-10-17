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
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE # a hook's git environment must not steer the gate's git calls
full=false
[ "${1:-}" = "--full" ] && full=true

want="v$(cat .node-version)"
nvm_node="${NVM_DIR:-$HOME/.nvm}/versions/node/$want/bin"
PATH="$nvm_node:$PATH"
[ "$(node -v 2>/dev/null)" = "$want" ] || {
	echo "check.sh: Node $want is needed (.node-version; docs/DEVELOPMENT.md, \"Setup\")" >&2
	exit 1
}
toolchain=$(cd "${GNO_TOOLCHAIN:-$HOME/.cache/gno-toolchains/onyx}" && pwd) # absolute: gno also runs from temporary folders
export GNO="$toolchain/gno" GNOHOME="$toolchain/gnohome"
if [ ! -x "$GNO" ]; then
	echo "check.sh: no gno at $GNO (docs/DEVELOPMENT.md, \"Toolchain\")" >&2
	exit 1
fi

# The tools run as package.json's scripts, the one place their commands are written, with
# node_modules/.bin first on PATH: what `pnpm run` does, minus its install check, which fails in
# the pre-commit copy that borrows node_modules.
PATH="$PWD/node_modules/.bin:$PATH"
run() { sh -c "$(node -p "require('./package.json').scripts['$1']")"; }
echo "== TypeScript: format, types, lint, tests"
run format:check
run typecheck
run lint
$full || run test # --full runs the tests once, with coverage

echo "== no dead code, no copy, no renamed copy, CSS and comment rules"
run unused
copies=$(run copies 2>&1) || { printf '%s\n' "$copies"; exit 1; }
run clones
python3 -I scripts/check_css.py
python3 -I scripts/check_comments.py

echo "== realms (gno/): lint and tests"
(cd gno && "$GNO" lint ./r/... && "$GNO" test ./r/...)

echo "== realms: removing any guard fails a test"
(cd gno && python3 -I ../scripts/mutate.py)

echo "== Go tools (gno/tools): format, vet, and the seal vectors they generate"
(
	cd gno
	test -z "$(gofmt -l tools)" || { gofmt -l tools >&2; exit 1; }
	go vet ./tools/...
	go run ./tools/sealvec | cmp -s - r/seal/vectors_test.gno || {
		echo "gno/r/seal/vectors_test.gno differs from: go run ./tools/sealvec, in gno/" >&2
		exit 1
	}
)

echo "== harness docs name only files that exist"
python3 -I scripts/check_docs.py

echo "== hooks"
sh scripts/test_hooks.sh

if $full; then
	echo "== the harness keeps its promises (scripts/probe.py)"
	python3 -I scripts/probe.py
	base=$(git merge-base HEAD origin/main) || { echo "check.sh --full: needs origin/main to compare with (git fetch)" >&2; exit 1; }
	echo "== coverage: 85% everywhere, core 100%; and 85% of the lines this branch changed"
	run coverage
	python3 -I scripts/patch_coverage.py "$base"
	echo "== mutations (StrykerJS, incremental)"
	run mutate
	echo "== no regression: no test gone, no floor lower, no approved screenshot changed, unless a commit says why"
	python3 -I scripts/check_regressions.py "$base"
	echo "== no secret anywhere in the history"
	gitleaks git --no-banner --redact .
	if ! git diff --quiet "$base" -- scripts .githooks .claude/settings.json package.json pnpm-workspace.yaml \
		eslint.config.ts tsconfig.base.json tsconfig.json vitest.config.ts stryker.config.json knip.json .jscpd.json \
		.prettierrc.json .prettierignore .gitignore; then
		echo "== the harness changed: each guard switched off must fail a test (several minutes)"
		python3 -I scripts/harness_mutate.py
	fi
fi

echo "all checks passed"
