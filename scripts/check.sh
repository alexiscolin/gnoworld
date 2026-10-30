#!/bin/sh
# check.sh: the gate (ADR-0001 §14, ADR-0002 §9). Its steps run in lanes side by side: a lane stops
# at its first failure, every lane runs to its end, and the gate fails when one did, showing each.
# - Fast, by default: every commit (the pre-commit hook) and every turn of Claude Code (the Stop
#   hook) run it. In a repository it checks only the areas its change touches (below); it prints
#   each lane's and each step's time, and logs a run past its budget for /pre-merge.
# - `--full` adds what the slice's last /pre-merge and CI run: the harness's own probe, coverage
#   and patch coverage, mutations, and the scan of the whole history for secrets. It checks
#   everything, and its record lets main take the code (pre-push).
# - `--merge`, a merge's own /pre-merge: the same, but the harness mutants of the guard files the
#   merge changed alone, since its last recorded pass (Alexis, 2026-10-25, 2026-10-27), and without the stories, the
#   coverage lane and prove_fix when no product code changed since main (2026-10-29); it records the fast gate only.
#
# GNO_TOOLCHAIN is the folder holding a gno that matches the chain, and its gnohome
# (docs/DEVELOPMENT.md, "Toolchain"). Node comes from .node-version, through nvm when the
# shell's own differs.
set -eu
cd "$(realpath "$(dirname "$0")/..")" # the folder's own case: a $PWD spelled otherwise loads a tool twice (F081)
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE # a hook's git environment must not steer the gate's git calls
unset AUDIT_ANSWER PROVE_FIX_VITEST PROVE_FIX_GNO PROVE_FIX_GO PICTURES_OF STORIES_PORT STORIES_OUT # the scripts' test switches, which would fake a pass
full=false merge=false
[ "${1:-}" = "--full" ] && full=true
[ "${1:-}" = "--merge" ] && full=true merge=true
started=$(date +%s)
logs=$(mktemp -d "${TMPDIR:-/tmp}/check.XXXXXX")
# bash 3.2, macOS's sh, exits 0 through an EXIT trap after an unbound variable: `finished`, set
# on the last line, tells a run that reached its end from one that died on the way.
trap 'status=$?; rm -rf "$logs" || :; [ "$status" != 0 ] || [ "${finished:-}" = 1 ] || status=1; exit "$status"' EXIT
trap 'exit 1' HUP INT TERM # so the EXIT trap also runs on Ctrl-C under dash
# The code this run tests; at the end it is recorded, unless it changed meanwhile (F076).
tested=
# A merge being committed has no time budget (Alexis, 2026-10-28): the full gate follows every merge. In a repository, git says
# so (MERGE_HEAD, which it must read as a commit: an unreadable one is no merge, and the budget holds); pre-commit's staged copy
# has no repository, so pre-commit says it, GATE_MERGE=1, read there alone (a caller's variable switches nothing off in a repository).
merging=false
if git rev-parse --git-dir >/dev/null 2>&1; then # not in pre-commit's staged copy, which has no repository
	if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then merging=true; fi
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
elif [ "${GATE_MERGE:-}" = 1 ]; then
	merging=true
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
all=true ts=false app=false gno=false tokens=false related=true changed=
regressions=false audit=false # a test file touched; the lockfile changed (below)
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
		# A commit that touches a test, a bench or an approved picture runs check_regressions (a renamed test passed the fast gate
		# in 5b and failed only the merge check); one that changes the lockfile runs the audit (lighthouse's advisories showed only
		# at the merge check, 5e). .githooks/pre-commit holds the same list of tests, for the staged copy's own gate.
		case $path in
		*.test.ts | *.test.tsx | *.bench.ts | *.bench.tsx | *.spec.ts | *_test.gno | *_test.go | *-snapshots/*.png | *__screenshots__/*.png) regressions=true ;;
		pnpm-lock.yaml) audit=true ;;
		esac
		case $path in
		server/src/*) ts=true related=false ;;
		app/src/*.ts | app/src/*.tsx | app/tests/*.ts | packages/ui/src/*.ts | packages/ui/src/*.tsx) ts=true app=true ;;
		packages/ui/src/tokens.css) ts=true app=true tokens=true related=false ;; # the tokens story lists every token (F1190)
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
# check_regressions reads git, which the staged copy has not (pre-commit runs it in the repository); a merge's full gate follows and
# runs it (and the audit) whole. Its base is where the branch left main, so a `Removed-test:` line of an earlier commit of the
# branch counts; with no origin/main, HEAD; with no commit yet, or no repository, nothing to compare (no base).
regr_base=
if $merging; then regressions=false; fi
if $merging; then audit=false; fi
if $regressions; then
	regr_base=$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse -q --verify HEAD 2>/dev/null) || regr_base=
	[ -n "$regr_base" ] || regressions=false
fi
budget=120 # s, for everything (Alexis, 2026-10-28: 75 refused a harness commit on a half-busy machine; 60 before 2026-10-27); for a run scoped to a change, 30
# A run that builds the app runs every journey, the work of a run of everything: 73-96 s on a quiet machine (slice-5a, F2162).
$all || $app || budget=30
[ "${GATE_BUDGET:-$budget}" -lt "$budget" ] 2>/dev/null && budget=$GATE_BUDGET # a test lowers it; nothing raises it
tests_scope=
$related && tests_scope="--changed --passWithNoTests"

# The tools run as package.json's scripts, the one place their commands are written, with
# node_modules/.bin first on PATH: what `pnpm run` does, minus its install check, which fails in
# the pre-commit copy that borrows node_modules. $2, a scoped run's own options.
PATH="$PWD/node_modules/.bin:$PATH"
run() { sh -c "$(node -p "require('./package.json').scripts['$1']") ${2:-}"; }
# A Vitest file or a journey that fails runs once more, alone; the ones that then pass are logged for /pre-merge, a gate
# that fails twice fails (scripts/unsteady.py, F1700). The log is the repository's own: pre-commit's copy has no repository,
# but its node_modules is a link to the repository's.
unsteady_log=.claude/tmp/unsteady.log
[ -n "$tested" ] || ! [ -L node_modules ] || unsteady_log=$(dirname "$(readlink node_modules)")/.claude/tmp/unsteady.log
retry() { # retry <tool> <report> <output> <command...>: <report>'s failed files, given to <command>, run once more; <output>, the first run's console, is shown first
	tool=$1 report=$2 output=$3
	shift 3
	cat "$output"
	python3 -I scripts/unsteady.py "$tool" "$report" "$output" "$unsteady_log" "$(python3 -I scripts/load.py)" -- "$@"
}
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
		grep '^unsteady: ' "$logs/$l.log" || : # a test that failed and then passed is said, not only logged
	done
	for l in $failed; do
		echo "check.sh: lane $l failed at $(cat "$logs/$l.at" 2>/dev/null || echo its start):" >&2
		cat "$logs/$l.log" >&2
	done
	[ -z "$failed" ]
}

# free_ports <n>: a base from which <n> ports in a row are free, picked at random; it fails with a message when 200 tries find none.
free_ports() {
	python3 -Ic 'import random, socket, sys
for _ in range(200):
    base, held = random.randrange(20000, 60000), []
    try:
        for p in range(base, base + int(sys.argv[1])):
            s = socket.socket()
            s.bind(("127.0.0.1", p))
            held.append(s)
    except OSError:
        continue
    finally:
        [s.close() for s in held]
    print(base)
    break
else:
    sys.exit(f"check.sh: no run of {sys.argv[1]} free ports in 200 tries")' "$1"
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
	# Three free ports from a base of this run's own (the journeys' hosts), so gates of several worktrees run at once;
	# a port taken between this and the build fails the run, never another's.
	E2E_PORT=$(free_ports 3)
	export E2E_PORT
	packages() { cat package.json app/package.json pnpm-lock.yaml | cksum; }
	installed=$(packages)
	export PLAYWRIGHT_JSON_OUTPUT_NAME="$logs/playwright.json"
	# The journeys the change can reach (scripts/journeys.py), given to Playwright as filters, which it reads as regular
	# expressions: a name's own characters escaped, its dots left (they match more, never less). The full gate and a change it
	# cannot place run every journey. A journeys.py that fails fails the run: a change scoped to nothing would pass unseen.
	set --
	if ! $full && ! $all; then
		scope=$(printf '%s\n' "$changed" | python3 -I scripts/journeys.py)
		if [ "$scope" != all ]; then
			while IFS= read -r journey; do
				set -- "$@" "$(printf '%s' "$journey" | sed 's/[][+(){}^$|?*\\]/\\&/g')"
			done <<EOF
$scope
EOF
		fi
	fi
	node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts --reporter=dot,json "$@" >"$logs/playwright.out" 2>&1 || # node: see check_regressions.py
		retry playwright "$PLAYWRIGHT_JSON_OUTPUT_NAME" "$logs/playwright.out" env -u PLAYWRIGHT_JSON_OUTPUT_NAME node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts --reporter=dot
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
	$full || run test "$tests_scope --reporter=default --reporter=json --outputFile.json=$logs/vitest.json" >"$logs/vitest.out" 2>&1 ||
		retry vitest "$logs/vitest.json" "$logs/vitest.out" sh -c "$(node -p "require('./package.json').scripts.test") \"\$@\"" sh
	# The coverage run leaves the compiled project out (its memo cache checks are branches nothing takes, F1350): the
	# render counts run here instead, once, beside the coverage lane's work.
	if $full; then
		step compiled
		run test:compiled
	fi
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

# The design system's tokens story lists every token, so a token added or changed moves its pictures: a change of
# tokens.css compares them, that story alone at its three widths, which the full gate walks with every other (F1190:
# a95a764 added two tokens, every commit's fast gate passed, and --merge failed 30 minutes later). Storybook is built
# in this run's own folder: a copy outside a repository would have jscpd and knip read a build left in the tree.
lane_pictures() {
	$tokens || return 0
	step pictures
	port=$(free_ports 1) # a line of its own: in a prefix assignment, its failure would be swallowed and the tool would start with no port (R2)
	STORIES_OUT="$logs/storybook" STORIES_PORT=$port PICTURES_OF=tokens-- node app/node_modules/@playwright/test/cli.js test -c app/playwright.stories.config.ts --reporter=dot pictures
}

lane_docs() {
	step check_docs # harness docs name only files that exist
	python3 -I scripts/check_docs.py
	if $regressions; then
		step regressions # no test gone, no floor lower, no approved picture changed, unless a commit of the branch says why
		python3 -I scripts/check_regressions.py "$regr_base"
	fi
	if $audit; then
		step audit
		python3 -I scripts/audit.py
	fi
	step parse
	# Some scripts run only in --full: a broken one would pass every commit (finding F084).
	python3 -I -c 'import ast, sys; [ast.parse(open(f).read(), f) for f in sys.argv[1:]]' scripts/*.py
	$all || return 0 # the hooks' tests read the harness, whose change runs everything
	step hooks
	sh scripts/test_hooks.sh
}

# The machine's 1-minute load and its cores, in tenths (scripts/load.py), read as the lanes start, before any of them loads it
# (and again at the end, if the run is over budget).
load_start=$(python3 -I scripts/load.py)
start ts
start types
start tests
start gno
start docs
start pictures
finish ts types tests gno docs pictures

took=$(($(date +%s) - started))
if ! $full && [ "$took" -gt "$budget" ]; then
	slowest=$(cat "$logs"/*.times | sort -k2 -n | tail -1)
	load_end=$(python3 -I scripts/load.py) # read last, once every lane has ended
	load=${load_start% *} cores=${load_start#* } end=${load_end% *}
	if $merging; then
		echo "check.sh: the fast gate took ${took} s, past its ${budget} s budget, which a merge commit has none of (the full gate follows it); its slowest step, ${slowest%% *}, took $(seconds "${slowest##* }") s" >&2
	else
		# Past its budget, a run that passed passes (Alexis, 2026-10-30: refusing it made agents run it again and again): it says
		# so and is logged, with its time and the machine's loads, for /pre-merge and the dream to read, as an unsteady test is.
		# A pass no one can see is not a pass, as in scripts/unsteady.py: a log it cannot write fails it.
		echo "check.sh: the fast gate took ${took} s, over its ${budget} s budget: passed, and logged for /pre-merge; its slowest step, ${slowest%% *}, took $(seconds "${slowest##* }") s (load $((load / 10)).$((load % 10)) then $((end / 10)).$((end % 10)) on $((cores / 10)) cores)" >&2
		mkdir -p "$(dirname "$unsteady_log")" && printf '%s\tgate\t%s\tload %s.%s then %s.%s on %s cores\tthe fast gate took %s s, over its %s s budget; slowest step, %s, took %s s\n' \
			"$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${slowest%% *}" "$((load / 10))" "$((load % 10))" "$((end / 10))" "$((end % 10))" "$((cores / 10))" "$took" "$budget" "${slowest%% *}" "$(seconds "${slowest##* }")" >>"$unsteady_log" || {
			echo "check.sh: the fast gate ran past its budget, and $unsteady_log cannot be written: a pass no one sees is not a pass" >&2
			exit 1
		}
	fi
fi

if $full; then
	base=$(git merge-base HEAD origin/main) || { echo "check.sh --full: needs origin/main to compare with (git fetch)" >&2; exit 1; }
	# A merge's own gate judges the product when its change since main holds some (Alexis, 2026-10-29): docs, the harness and
	# the linters' configs alone have no coverage, mutant or fix of the product to judge, which took 40 of its 47 minutes. --full judges all.
	product=true
	if $merge; then
		product=false
		changes=$(git -c core.quotePath=false diff --no-renames --name-only "$base" -- && git -c core.quotePath=false ls-files --others --exclude-standard)
		while IFS= read -r path; do
			case $path in '' | docs/* | adr/* | *.md | scripts/* | .githooks/* | .claude/* | .github/* | lint/* | eslint.config.ts | knip.json | .jscpd.json | .prettierrc.json | .prettierignore) ;; *) product=true ;; esac
		done <<EOF
$changes
EOF
		$product || echo "check.sh --merge: no product code since $base: the stories, the coverage lane and prove_fix do not run"
	fi
	# probe.py plants its faults in the source tree, so it runs alone: a lane beside it (the coverage's Vitest,
	# check_regressions' list, StrykerJS, the stories' build) would read its files as they come and go.
	lane_probe() {
		step probe # the harness keeps its promises
		python3 -I scripts/probe.py
		step bench # the budgets of docs/plans/, after probe.py and alone: beside other work a bench measures the load
		python3 -I scripts/bench.py
	}
	lane_stories() {
		step core_chromium # core's tests again in Chromium, whose engine reads some regexes and Unicode otherwise (F816)
		CORE_CHROMIUM=1 node node_modules/vitest/vitest.mjs run --project core_chromium # vitest.config.ts opens it then alone
		step stories # the design system's stories in a browser: axe, the invariants and the CSS jsdom cannot see
		port=$(free_ports 1) # its own, as the pictures' lane: two worktrees' gates both took 6007 and one failed (2026-10-29)
		STORIES_PORT=$port node app/node_modules/@playwright/test/cli.js test -c app/playwright.stories.config.ts --reporter=dot
	}
	# The coverage lane's tools take half the machine each, the harness lane beside them the rest: at the machine's
	# width, their load outlasted Ergo's 9 s auth script (F777).
	half=$(($(node -p "require('os').availableParallelism()") / 2))
	[ "$half" -ge 1 ] || half=1
	parses() { python3 -Ic 'import json, sys; json.load(open(sys.argv[1]))' "$1" 2>/dev/null; }
	lane_coverage() {
		step coverage # 85% everywhere, core 100%
		run coverage "--maxWorkers=$half"
		step patch_coverage # 85% of the lines this branch changed
		python3 -I scripts/patch_coverage.py "$base"
		step stryker # mutations, incremental, from the one cache every tree shares: a tree's own copy went stale (Alexis, 2026-10-29)
		# StrykerJS works on this run's copy, taken only if the cache reads as JSON, and the copy goes back whole only if it reads
		# in turn: StrykerJS rethrows a file it cannot parse, so a run cut short would fail every tree's. Two runs that end at once
		# keep the last one's verdicts: the other's are judged again, never lost to a half-written file.
		cache="$HOME/.cache/gnoworld-tools/stryker-incremental.json" own="$logs/stryker-incremental.json"
		# A run cut short leaves its sandboxes in .stryker-tmp, which a bench measured (5n: Cmd-K at 27 to 41 ms instead of 2 to 4):
		# emptied before StrykerJS starts. A link is removed, never followed: what it leads to is not StrykerJS's.
		if [ -L .stryker-tmp ]; then rm .stryker-tmp; elif [ -d .stryker-tmp ]; then find .stryker-tmp -mindepth 1 -delete; fi
		mkdir -p "${cache%/*}"
		! parses "$cache" || cp "$cache" "$own"
		stryker=0
		run mutate "--concurrency $half --incrementalFile $own" || stryker=$?
		! parses "$own" || { cp "$own" "$cache.$$" && mv -f "$cache.$$" "$cache"; }
		[ "$stryker" = 0 ]
	}
	lane_history() {
		# --full too: a slice's last merge is checked by it (pre-merge.md, step 8) and is the one that reaches main (security-S2).
		step batch_size # a merge's own product code is a small batch (DORA; docs/REVIEW.md)
		python3 -I scripts/batch_size.py "$base"
		if $product; then
			step prove_fix # every fix of the product comes with a test that failed before it
			python3 -I scripts/prove_fix.py "$base"
		fi
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
		if $merge; then
			python3 -I scripts/harness_mutate.py --changed "$base"
			return 0
		fi
		python3 -I scripts/harness_mutate.py
	}
	start probe
	finish probe
	# The stories' journeys run beside the history lane alone: under the coverage's Vitest and StrykerJS and
	# the harness's worktrees, a Dialog's teardown in the browser outlasted its test (F815). A failure there stops
	# the gate before the two after them, whose fifteen to twenty minutes would fix nothing of it (C.5, F823).
	! $product || start stories
	start history
	finish $($product && echo stories) history || {
		echo "check.sh: the coverage and harness lanes did not run: the stories' or the history lane failed first" >&2
		exit 1
	}
	! $product || start coverage
	start harness
	finish $($product && echo coverage) harness
fi

if [ -n "$tested" ]; then
	mkdir -p .claude/tmp && sh scripts/code_changed.sh --state >.claude/tmp/gate-green # what stop_gate.sh compares
	! $merge || full=false # --merge records the fast gate only: main wants --full's record
	gate_passed "$tested" "$full" # for the hooks outside the sandbox, which run no gate (F076)
fi
echo "all checks passed in $(($(date +%s) - started)) s (budget $budget s)"
finished=1
