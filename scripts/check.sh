#!/bin/sh
# check.sh: the gate (ADR-0001 §14, ADR-0002 §9). Its steps run in lanes side by side: a lane stops
# at its first failure, every lane runs to its end, and the gate fails when one did, showing each.
# - Fast, by default: every commit (the pre-commit hook) and every turn of Claude Code (the Stop
#   hook) run it. In a repository it checks only the areas its change touches (below); it prints
#   each lane's and each step's time, and fails past its budget.
# - `--full` adds what /pre-merge and CI run: the harness's own probe, coverage and patch
#   coverage, mutations, and the scan of the whole history for secrets. It checks everything.
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
logs=$(mktemp -d "${TMPDIR:-/tmp}/check.XXXXXX")
# bash 3.2, macOS's sh, exits 0 through an EXIT trap after an unbound variable: `finished`, set
# on the last line, tells a run that reached its end from one that died on the way.
trap 'status=$?; rm -rf "$logs" || :; [ "$status" != 0 ] || [ "${finished:-}" = 1 ] || status=1; exit "$status"' EXIT
trap 'exit 1' HUP INT TERM # so the EXIT trap also runs on Ctrl-C under dash
# The code this run tests; at the end it is recorded, unless it changed meanwhile (F076).
tested=
if git rev-parse --git-dir >/dev/null 2>&1; then # not in pre-commit's staged copy, which has no repository
	# Git runs the hooks of its own folder, which no branch writes and the sandbox cannot (F129).
	git_dir=$(git rev-parse --path-format=absolute --git-common-dir)
	runs_from=$(git rev-parse --path-format=absolute --git-path hooks)
	if [ "$runs_from" != "$git_dir/hooks" ]; then
		echo "check.sh: git runs hooks from $runs_from, not $git_dir/hooks; install them: git --no-replace-objects show main:scripts/install_hooks.sh | sh" >&2
		exit 1
	fi
	if [ -n "${SANDBOX_RUNTIME:-}" ]; then
		if (: >>"$git_dir/config") 2>/dev/null || { probe=$(mktemp "$git_dir/hooks/probe.XXXXXX" 2>/dev/null) && rm "$probe"; }; then
			echo "check.sh: a command in the sandbox can write git's hooks or config; .claude/settings.json's sandbox must deny .git/hooks and .git/config" >&2
			exit 1
		fi
		for hook in commit-msg pre-commit pre-merge-commit pre-push; do
			[ -x "$git_dir/hooks/$hook" ] || {
				echo "check.sh: no $hook in $git_dir/hooks, so git checks no commit there; install the hooks: git --no-replace-objects show main:scripts/install_hooks.sh | sh" >&2
				exit 1
			}
		done
	fi
	. .githooks/records.sh && tested=$(worktree_print)
fi

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

# What a fast run checks: the areas its change touches, against HEAD, untracked files included; in
# pre-commit's staged copy, no repository, those GATE_CHANGED lists, one path a line, which the hook
# reads from git. Everything when nothing changed, or once any
# path outside these areas changed: a config, the lockfile, the harness, the schemas both sides
# read, the deployment. What a commit leaves out, the full gate runs before main takes it (pre-push).
# The tests are Vitest's related ones only for a change of the app's or the design system's
# TypeScript: main.test.ts runs the server, which imports core, as a child process, outside Vitest's
# module graph, and a fixture read from disk is outside it too. ESLint reads no cache: one is keyed
# on a file's own text, so a type changed elsewhere would hide the error it brings there.
all=true ts=false app=false gno=false related=true changed=
if ! $full && [ -z "$tested" ]; then
	changed=${GATE_CHANGED:-} related=false # Vitest finds the related tests through git, which a copy has not
elif ! $full; then
	# The borrowed node_modules of a worktree is a link, which .gitignore's folder rule misses.
	changed=$(
		set -- . ':!docs' ':!adr' ':!*.md' ':!node_modules'
		git -c core.quotePath=false diff --no-renames --name-only HEAD -- "$@" &&
			git -c core.quotePath=false ls-files --others --exclude-standard -- "$@"
	)
fi
if [ -n "$changed" ]; then
	all=false code=false
	while IFS= read -r path; do
		case $path in docs/* | adr/* | *.md) continue ;; esac # prose, which pre-commit's list may hold
		code=true
		case $path in
		server/src/*) ts=true related=false ;;
		app/src/*.ts | app/src/*.tsx | app/tests/*.ts | packages/ui/src/*.ts | packages/ui/src/*.tsx) ts=true app=true ;;
		app/src/* | app/tests/* | packages/core/src/* | packages/ui/src/*) ts=true app=true related=false ;;
		gno/*) gno=true ;;
		*) all=true ;;
		esac
	done <<EOF
$changed
EOF
	$code || all=true # prose alone is no change of code, as in a repository
fi
$all && ts=true app=true gno=true related=false
budget=60 # s, for everything; for a run scoped to a change, 30
$all || budget=30
[ "${GATE_BUDGET:-$budget}" -lt "$budget" ] 2>/dev/null && budget=$GATE_BUDGET # a test lowers it; nothing raises it
tests_scope=
$related && tests_scope="--changed --passWithNoTests"

# The tools run as package.json's scripts, the one place their commands are written, with
# node_modules/.bin first on PATH: what `pnpm run` does, minus its install check, which fails in
# the pre-commit copy that borrows node_modules. $2, a scoped run's own options.
PATH="$PWD/node_modules/.bin:$PATH"
run() { sh -c "$(node -p "require('./package.json').scripts['$1']") ${2:-}"; }
ms() { python3 -Ic 'import time; print(int(time.time() * 1000))'; }
# step <name> starts a step of the lane $lane, and closes the one before; `step` alone closes the last.
step() {
	now=$(ms)
	[ -z "${step_name:-}" ] || echo "$step_name $((now - step_at))" >>"$logs/$lane.times"
	step_name=${1:-} step_at=$now
	[ -z "$step_name" ] || echo "$step_name" >"$logs/$lane.at"
}
# start <lane>: runs lane_<lane> in the background, its output in its own log.
start() {
	lane=$1
	: >"$logs/$lane.times"
	( # set -e holds in it, as everywhere here
		step_name=
		"lane_$lane"
		step
	) >"$logs/$lane.log" 2>&1 &
	eval "pid_$lane=\$!"
}
seconds() { echo "$(($1 / 1000)).$(($1 % 1000 / 100))"; }
# finish <lane>...: waits for each lane, prints its time and its steps', then each failed one's output.
finish() {
	failed=
	for l in "$@"; do
		eval "wait \"\$pid_$l\"" || failed="$failed $l"
	done
	for l in "$@"; do
		if [ ! -s "$logs/$l.times" ] && [ ! -e "$logs/$l.at" ]; then
			echo "lane $l skipped: the change touches nothing it checks"
			continue
		fi
		total=0 parts=
		while read -r name took_ms; do
			total=$((total + took_ms)) parts="$parts${parts:+, }$name $(seconds "$took_ms")"
		done <"$logs/$l.times"
		echo "lane $l $(seconds "$total") s: $parts"
	done
	for l in $failed; do
		echo "check.sh: lane $l failed at $(cat "$logs/$l.at" 2>/dev/null || echo its start):" >&2
		cat "$logs/$l.log" >&2
	done
	[ -z "$failed" ]
}

lane_ts() {
	step format
	run format:check
	step unused
	run unused
	step copies
	copies=$(run copies 2>&1) || { printf '%s\n' "$copies"; exit 1; }
	step css
	python3 -I scripts/check_css.py
	step comments
	run comments
	$app || return 0
	# After the checks above: pre-commit's staged copy is no repository, so they would read the
	# build's output, which .gitignore keeps from them only in one.
	# A build never installs: React Router's default server entry adds isbot and runs the package
	# manager, with whatever access the build has (finding F080).
	step app
	packages() { cat package.json app/package.json pnpm-lock.yaml | cksum; }
	installed=$(packages)
	node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts --reporter=dot # node: see check_regressions.py
	[ "$(packages)" = "$installed" ] || { echo "check.sh: building the app changed package.json or the lockfile" >&2; exit 1; }
}

# Neither reads the build's output: the app's tsconfig leaves React Router's generated types out.
lane_types() {
	$ts || return 0
	step typecheck
	run typecheck
	step lint
	run lint
}

lane_tests() {
	$ts || return 0
	step ergo
	sh scripts/ergo.sh >/dev/null # the Ergo the server's tests start, built once from deploy/ergo/VERSION
	$full || step vitest # --full runs the tests once, with coverage
	$full || run test "$tests_scope"
}

lane_gno() {
	$gno || return 0
	step gno
	(cd gno && "$GNO" lint ./... && "$GNO" test ./...)
	step mutate.py # removing any guard fails a test
	(cd gno && python3 -I ../scripts/mutate.py)
	step go # format, vet, and the seal vectors they generate
	(
		cd gno
		test -z "$(gofmt -l tools)" || { gofmt -l tools >&2; exit 1; }
		go vet ./tools/...
		go run ./tools/sealvec | cmp -s - r/seal/vectors_test.gno || {
			echo "gno/r/seal/vectors_test.gno differs from: go run ./tools/sealvec, in gno/" >&2
			exit 1
		}
	)
}

lane_docs() {
	step check_docs # harness docs name only files that exist
	python3 -I scripts/check_docs.py
	step parse
	# Some scripts run only in --full: a broken one would pass every commit (finding F084).
	python3 -I -c 'import ast, sys; [ast.parse(open(f).read(), f) for f in sys.argv[1:]]' scripts/*.py
	$all || return 0 # the hooks' tests read the harness, whose change runs everything
	step hooks
	sh scripts/test_hooks.sh
}

start ts
start types
start tests
start gno
start docs
finish ts types tests gno docs

took=$(($(date +%s) - started))
if ! $full && [ "$took" -gt "$budget" ]; then
	slowest=$(cat "$logs"/*.times | sort -k2 -n | tail -1)
	echo "check.sh: the fast gate took ${took} s, over its ${budget} s budget: its slowest step, ${slowest%% *}, took $(seconds "${slowest##* }") s; find what grew" >&2
	exit 1
fi

if $full; then
	base=$(git merge-base HEAD origin/main) || { echo "check.sh --full: needs origin/main to compare with (git fetch)" >&2; exit 1; }
	lane_stories() {
		step probe # the harness keeps its promises
		python3 -I scripts/probe.py
		step stories # the design system's stories in a browser: axe, the invariants and the CSS jsdom cannot see
		node app/node_modules/@playwright/test/cli.js test -c app/playwright.stories.config.ts --reporter=dot
	}
	lane_coverage() {
		step coverage # 85% everywhere, core 100%
		run coverage
		step patch_coverage # 85% of the lines this branch changed
		python3 -I scripts/patch_coverage.py "$base"
		step stryker # mutations, incremental
		run mutate
	}
	lane_history() {
		step prove_fix # every fix of the product comes with a test that failed before it
		python3 -I scripts/prove_fix.py "$base"
		step regressions # no test gone, no floor lower, no approved screenshot changed, unless a commit says why
		python3 -I scripts/check_regressions.py "$base"
		step migrations # a migration main has keeps its text and its place (F466)
		python3 -I scripts/check_migrations.py "$base"
		step secrets # no secret anywhere in the history, no known vulnerability in a dependency
		sh scripts/scan_secrets.sh
		step audit
		python3 -I scripts/audit.py
	}
	lane_harness() {
		harness --quiet "$base" && return 0 # records.sh's list
		step harness_mutate # each guard switched off must fail a test (several minutes)
		python3 -I scripts/harness_mutate.py
	}
	start stories
	start coverage
	start history
	start harness
	finish stories coverage history harness
fi

if [ -n "$tested" ]; then
	mkdir -p .claude/tmp && sh scripts/code_changed.sh --state >.claude/tmp/gate-green # what stop_gate.sh compares
	gate_passed "$tested" "$full" # for the hooks outside the sandbox, which run no gate (F076)
fi
echo "all checks passed in $(($(date +%s) - started)) s (budget $budget s)"
finished=1
