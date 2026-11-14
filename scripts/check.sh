#!/bin/sh
# check.sh: the commit gate (the harness overhaul, phase 3a; D13168). It checks what the change touches, in seconds when no test runs: Prettier and
# ESLint read the change's files, TypeScript the types, Vitest the tests related to the change (scripts/related.py), gno its lint and
# tests when a realm changed. A tree with no change, or a change of a config, the lockfile or a path no area places, is checked whole.
# The harness, deploy/, evals/ and tools/ get no type check, and deploy/, tier 1, its related tests (related.py: prices.test.ts reads it
# from disk), the others none: their suites are their own (test_hooks.sh, probe.py and deploy/test.sh run on GitHub; the evals and
# tools/agent-github/test.sh by hand). GitHub's gate judges each pull request by what
# it calls for (.github/workflows/gate.yml, the base's detector), and the night runs the rest (nightly.yml). Its steps run in lanes side by side: a lane stops at its first
# failure, every lane runs to its end, and the gate fails when one did, showing each. It takes no option.
# pre-commit runs it on the staged copy, which has no repository: GATE_CHANGED lists the change there, one path a line.
# GNO_TOOLCHAIN is the folder holding a gno that matches the chain, and its gnohome (docs/DEVELOPMENT.md, "Toolchain"). Node comes
# from .node-version, through nvm when the shell's own differs.
set -eu
[ "$#" = 0 ] || {
	echo "check.sh: no option since D13168 (the old --full, --merge, --tests-all and --everything): GitHub's gate judges a branch's pull request (.github/workflows/gate.yml)" >&2
	exit 1
}
# ESLint over the whole project passed 4 GB once slice 9 joined (2026-11-06): every node of the gate gets 8 GB of heap.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192"
started=$(date +%s)
logs=$(mktemp -d "${TMPDIR:-/tmp}/check.XXXXXX")
# A failing run ends on its own last line, which branch.js reads: `check.sh: FAILED at <lane>:<step>`, on every exit path, signals
# included. bash 3.2, macOS's sh, exits 0 through an EXIT trap after an unbound variable: `finished`, set on the last line, tells a
# run that reached its end from one that died on the way.
failed_at=main:start
trap 'status=$?; rm -rf "${logs:?}" || :; [ "$status" = 0 ] && [ "${finished:-}" = 1 ] || echo "check.sh: FAILED at $failed_at" >&2; [ "$status" != 0 ] || [ "${finished:-}" = 1 ] || status=1; exit "$status"' EXIT
trap 'exit 1' HUP INT TERM # so the EXIT trap also runs on Ctrl-C under dash
cd "$(realpath "$(dirname "$0")/..")" # the folder's own case: a $PWD spelled otherwise loads a tool twice (F081)
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE # a hook's git environment must not steer the gate's git calls
# Nor a caller's: a common folder of its own would hold hooks of its choice (lot 1's security review, S5).
unset GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CEILING_DIRECTORIES
unset COVERAGE_ALL CORE_CHROMIUM # vitest.config.ts's switches, which would change what its tests are

# The code this run tests, printed before its first step and recorded after its last one, unless it changed meanwhile (F076, F133).
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
PATH="$nvm_node:$PWD/node_modules/.bin:$PATH" # node_modules/.bin, as `pnpm run` puts it, minus its install check, which fails in the staged copy
[ "$(node -v 2>/dev/null)" = "$want" ] || {
	echo "check.sh: Node $want is needed (.node-version; docs/DEVELOPMENT.md, \"Setup\")" >&2
	exit 1
}

# The change, against HEAD, untracked files included; in pre-commit's staged copy, what GATE_CHANGED lists. The borrowed node_modules
# of a worktree is a link, which .gitignore's folder rule misses.
if [ -n "$tested" ]; then
	changed=$(
		set -- . ':!docs' ':!adr' ':!node_modules'
		git -c core.quotePath=false diff --no-renames --name-only HEAD -- "$@" &&
			git -c core.quotePath=false ls-files --others --exclude-standard -- "$@"
	)
else
	changed=${GATE_CHANGED:-}
fi
# whole: the whole repository, for every tool; ts, a change of the TypeScript's sources or what they read; tests, of a file a test may
# read from disk, outside the sources; gno, of a realm. files: the
# change's files that exist, one a line, which Prettier and ESLint read (each passes over a file that is not its own).
whole=false ts=false tests=false gno=false code=false files=
while IFS= read -r path; do
	[ -n "$path" ] || continue
	case $path in app/src/*.md | app/tests/*.md | server/src/*.md | packages/*/src/*.md) ;; docs/* | adr/* | *.md) continue ;; esac # prose; a recorded page under the sources is a fixture (F4812)
	code=true
	case $path in
	app/src/* | app/tests/* | app/data/* | app/lab/* | app/public/* | server/src/* | jarvis/src/* | link-reader/src/* | packages/*/src/*) ts=true ;;
	gno/*) gno=true && continue ;; # neither Prettier nor ESLint reads a realm
	scripts/* | .githooks/* | .github/* | .claude/* | deploy/* | evals/* | tools/*) tests=true ;; # their own suites (the header)
	*) whole=true ;; # a config, the lockfile, a path no area places
	esac
	[ ! -f "$path" ] || files="$files$path
"
done <<EOF
$changed
EOF
$code || whole=true # no change, or prose alone, is checked whole
# The tests, at a commit, for a tier-1 path alone (the speed plan, 2026-11-06, kept by D13168: a change of shared code ran 456 test files,
# 100 s; GitHub's unit job runs a pull request's tests when TypeScript or its config changed): docs/REVIEW.md's tier-1 rows, read by scripts/speeds.py --tier1, any doubt
# being tier 1. A whole run runs every test.
tier1=true
if ! $whole && [ "$(printf '%s\n' "$changed" | python3 -I scripts/speeds.py --tier1 "$PWD" 2>/dev/null)" = other ]; then tier1=false; fi

# The tools run as package.json's scripts, the one place their commands are written. named <script> <option>...: the script, its last
# word `.` (the whole repository) replaced by the change's files, each a word of its own, after `--` (a name that reads as an option is
# a file: lot 1, S3); a script of another shape is refused, never run as it is.
run() { sh -c "$(node -p "require('./package.json').scripts['$1']") ${2:-}"; }
named() {
	script=$(node -p "require('./package.json').scripts['$1']")
	shift
	case $script in *" .") ;; *)
		echo "check.sh: package.json's script does not end with ' .', so the change's files cannot be named in its place: $script" >&2
		exit 1
		;;
	esac
	options="$*"
	set -f
	IFS='
'
	# shellcheck disable=SC2086 # one word a line
	set -- $files
	unset IFS
	set +f
	sh -c "${script% .} $options -- \"\$@\"" sh "$@"
}
# The type check builds incrementally (Alexis, 2026-11-04), from the worktree's own .claude/tmp/tsc; pre-commit's staged copy, which
# does not hold that folder, from one of this run's own, gone at its end. TypeScript keys each file of its .tsbuildinfo on its text.
TSC_CACHE=$logs/tsc
[ -z "$tested" ] || TSC_CACHE=$PWD/.claude/tmp/tsc
mkdir -p "$TSC_CACHE" && export TSC_CACHE

# step <name>: the step its lane is at, which a failure names, and one more of the steps it ran.
step() { echo "$1" >"$logs/$lane.at" && echo "$1" >>"$logs/$lane.steps"; }
lanes=
# start <lane>: lane_<lane> in the background, its output in its own log, its seconds in its own file.
start() {
	lane=$1
	(
		at=$(date +%s)
		"lane_$lane"
		echo "$(($(date +%s) - at))" >"$logs/$lane.took"
	) >"$logs/$lane.log" 2>&1 &
	eval "pid_$lane=\$!"
	lanes="$lanes $lane"
}

lane_lint() {
	# The harness's floor, at every run: its docs name only files that exist, every script parses (F084: a broken one passed every
	# commit), and a changed shell script reads as sh, every scripts/*.sh and .githooks/* on a whole run. Prettier and ESLint read none of them, and pre-commit
	# outside the sandbox trusts the record of a harness commit (the security review of 3a, S1, S4).
	step scripts
	python3 -I scripts/check_docs.py
	python3 -I -c 'import ast, sys; [ast.parse(open(f).read(), f) for f in sys.argv[1:]]' scripts/*.py
	if $whole; then
		for f in scripts/*.sh .githooks/*; do sh -n "$f"; done
	else
		printf '%s' "$files" | grep -E '\.sh$|^\.githooks/[^/]+$' | while IFS= read -r f; do sh -n "$f" || exit 1; done
	fi
	if $whole; then
		step format
		# Prettier's cache, in a repository alone, keys a file on its path and content: a rerun of an unchanged tree is 0.9 s of 7.5.
		cache=
		[ -z "$tested" ] || cache="--cache --cache-strategy content --cache-location=.claude/tmp/prettier-cache"
		run format:check "$cache"
		step lint
		run lint # ESLint reads no cache: one keys a file on its own text, and its typed rules read the others' types
		return 0
	fi
	[ -n "$files" ] || return 0
	step format
	named format:check --ignore-unknown
	step lint
	named lint --no-warn-ignored
}

# Neither reads a build's output: the app's tsconfig leaves React Router's generated types out.
lane_types() {
	$whole || $ts || return 0
	step typecheck
	run typecheck
}

lane_tests() {
	$whole || { $tier1 && { $ts || $tests; }; } || return 0
	step ergo
	sh scripts/ergo.sh >/dev/null # the Ergo the server's tests start, built once from deploy/ergo/VERSION
	step vitest
	tests=$(node -p "require('./package.json').scripts.test")
	# Vitest's own `related` command, which a path at a time follows to every test importing it (Vitest 4.1.12 has no `run --related`),
	# with the projects the test script keeps. The tests tagged `timing`, a bound in wall-clock time, run at night (nightly.yml).
	case $tests in "vitest run "*) ;; *)
		echo "check.sh: package.json's test script does not start with 'vitest run ': its related tests cannot be asked for" >&2
		exit 1
		;;
	esac
	if $whole; then
		python3 -I scripts/related.py --check </dev/null # the map's own test: a read it cannot follow refuses, whatever runs
		sh -c "$tests --tags-filter=!timing"
		return 0
	fi
	related=$(printf '%s\n' "$changed" | python3 -I scripts/related.py)
	sh -c "vitest related --run --passWithNoTests ${tests#vitest run } --tags-filter=!timing $related" # a change no test reads is no failure
}

lane_gno() {
	$whole || $gno || return 0
	step gno
	toolchain=$(cd "${GNO_TOOLCHAIN:-$HOME/.cache/gno-toolchains/onyx}" && pwd) # absolute: gno also runs from temporary folders
	export GNO="$toolchain/gno" GNOHOME="$toolchain/gnohome"
	[ -x "$GNO" ] || { echo "check.sh: no gno at $GNO (docs/DEVELOPMENT.md, \"Toolchain\")" >&2; exit 1; }
	(cd gno && "$GNO" lint ./... && "$GNO" test ./...)
}

start lint
start types
start tests
start gno
failed=
for l in $lanes; do
	if eval "wait \"\$pid_$l\""; then
		if [ -e "$logs/$l.steps" ]; then echo "lane $l $(cat "$logs/$l.took") s: $(paste -sd ' ' "$logs/$l.steps")"; else echo "lane $l: nothing the change touches"; fi
		continue
	fi
	at="$l:$(cat "$logs/$l.at" 2>/dev/null || echo start)"
	[ -n "$failed" ] || failed_at=$at
	failed="$failed $at"
	echo "check.sh: lane $l failed at $at:" >&2
	cat "$logs/$l.log" >&2
done
[ -z "$failed" ] || exit 1

if [ -n "$tested" ]; then
	mkdir -p .claude/tmp && sh scripts/code_changed.sh --state >.claude/tmp/gate-green # what stop_gate.sh compares (GNOWORLD_STRICT=1)
	gate_passed "$tested" false # for the hooks outside the sandbox, which run no gate (F076)
fi
echo "all checks passed in $(($(date +%s) - started)) s"
finished=1
