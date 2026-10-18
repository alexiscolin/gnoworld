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
cd "$(realpath "$(dirname "$0")/..")" # the folder's own case: a $PWD spelled otherwise loads a tool twice (F081)
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE # a hook's git environment must not steer the gate's git calls
unset AUDIT_ANSWER PROVE_FIX_VITEST PROVE_FIX_GNO PROVE_FIX_GO # the scripts' test switches, which would fake a pass
full=false
[ "${1:-}" = "--full" ] && full=true
started=$(date +%s)

want="v$(cat .node-version)"
# A version and nothing else: anything more would put a folder of its choice first on PATH.
printf '%s' "${want#v}" | grep -qxE '[0-9]+\.[0-9]+\.[0-9]+' || { echo "check.sh: .node-version must be a version such as 24.22.0" >&2; exit 1; }
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

echo "== no dead code, no copy (renamed or near ones too), CSS and comment rules"
run unused
copies=$(run copies 2>&1) || { printf '%s\n' "$copies"; exit 1; }
python3 -I scripts/check_css.py
run comments

# After the checks above: pre-commit's staged copy is no repository, so they would read the
# build's output, which .gitignore keeps from them only in one.
echo "== the app: built, pre-rendered, and its journeys walked in a browser (Playwright, axe)"
# A build never installs: React Router's default server entry adds isbot and runs the package
# manager, with whatever access the build has (finding F080).
packages() { cat package.json app/package.json pnpm-lock.yaml | cksum; }
installed=$(packages)
node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts --reporter=dot # node: see check_regressions.py
[ "$(packages)" = "$installed" ] || { echo "check.sh: building the app changed package.json or the lockfile" >&2; exit 1; }

echo "== gno (realms and packages): lint and tests"
(cd gno && "$GNO" lint ./... && "$GNO" test ./...)

echo "== gno: removing any guard fails a test"
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

echo "== harness docs name only files that exist; every harness script parses"
python3 -I scripts/check_docs.py
# Some scripts run only in --full: a broken one would pass every commit (finding F084).
python3 -I -c 'import ast, sys; [ast.parse(open(f).read(), f) for f in sys.argv[1:]]' scripts/*.py

echo "== hooks"
sh scripts/test_hooks.sh

took=$(($(date +%s) - started))
if ! $full && [ "$took" -gt 60 ]; then
	echo "check.sh: the fast gate took ${took} s, over its 60 s budget (docs/plans/slice-1.md): find what grew" >&2
	exit 1
fi

if $full; then
	echo "== the harness keeps its promises (scripts/probe.py)"
	python3 -I scripts/probe.py
	base=$(git merge-base HEAD origin/main) || { echo "check.sh --full: needs origin/main to compare with (git fetch)" >&2; exit 1; }
	echo "== coverage: 85% everywhere, core 100%; and 85% of the lines this branch changed"
	run coverage
	python3 -I scripts/patch_coverage.py "$base"
	echo "== every fix of the product comes with a test that failed before it"
	python3 -I scripts/prove_fix.py "$base"
	echo "== mutations (StrykerJS, incremental)"
	run mutate
	echo "== no regression: no test gone, no floor lower, no approved screenshot changed, unless a commit says why"
	python3 -I scripts/check_regressions.py "$base"
	echo "== no secret anywhere in the history, no known vulnerability in a dependency"
	sh scripts/scan_secrets.sh
	python3 -I scripts/audit.py
	if ! git diff --quiet "$base" -- scripts .githooks .github .claude package.json app/package.json \
		pnpm-workspace.yaml pnpm-lock.yaml .node-version .nvmrc .npmrc '*.config.ts' tsconfig.json tsconfig.base.json app/tsconfig.json \
		stryker.config.json knip.json .jscpd.json .prettierrc.json .prettierignore .gitignore; then
		echo "== the harness changed: each guard switched off must fail a test (several minutes)"
		python3 -I scripts/harness_mutate.py
	fi
fi

if git rev-parse --git-dir >/dev/null 2>&1; then # not in pre-commit's staged copy, which has no repository
	mkdir -p .claude/tmp && sh scripts/code_changed.sh --state >.claude/tmp/gate-green # what stop_gate.sh compares
fi
echo "all checks passed in $(($(date +%s) - started)) s"
