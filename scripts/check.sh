#!/bin/sh
# check.sh: the gate (ADR-0001 §14, ADR-0002 §9). Its steps run in lanes side by side: a lane stops
# at its first failure, every lane runs to its end, and the gate fails when one did, showing each.
# - Fast, by default: every commit (the pre-commit hook) and every turn of Claude Code (the Stop
#   hook) run it. In a repository it checks only the areas its change touches (below); it prints
#   each lane's and each step's time, and logs a run past its budget for /pre-merge.
# - `--full` adds what the slice's last /pre-merge and CI run: the harness's own probe, coverage
#   and patch coverage, mutations, and the scan of the whole history for secrets. It checks
#   everything, and its record lets main take the code (pre-push).
# - `--merge`, a merge's own /pre-merge: the same, but the harness mutants of the lines the
#   merge changed alone, since its last recorded pass (Alexis, 2026-10-25, 2026-10-27), and without the stories, the
#   coverage lane and prove_fix when no product code changed since main (2026-10-29); it records the fast gate only.
#
# GNO_TOOLCHAIN is the folder holding a gno that matches the chain, and its gnohome
# (docs/DEVELOPMENT.md, "Toolchain"). Node comes from .node-version, through nvm when the
# shell's own differs.
set -eu
started=$(date +%s)
logs=$(mktemp -d "${TMPDIR:-/tmp}/check.XXXXXX")
# bash 3.2, macOS's sh, exits 0 through an EXIT trap after an unbound variable: `finished`, set
# on the last line, tells a run that reached its end from one that died on the way.
merge_lock="${HOME}/.cache/gnoworld-tools/merge.lock" # --merge's lock, below
lock_held=
gate_build= # the folder a commit's gate builds the app into, below; its trap removes it
# Only the run that took the lock frees it: by its pid, or while the pid is not yet written (a signal between the folder and the pid).
release_lock() {
	[ -n "$lock_held" ] || return 0
	holder=$(cat "$merge_lock/pid" 2>/dev/null || :)
	if [ -z "$holder" ] || [ "$holder" = "$$" ]; then rm -rf "${merge_lock:?}"; fi
}
# A failing run ends on its own last line, after any tail it showed (a nested fixture's log ended one on `all checks passed`, and a reader
# of the last line took the run for a pass): `check.sh: FAILED at <lane>:<step>`, on every exit path, signals included.
failed_at=
say_failed() { # $status is the exit code the shell had; a run that never reached its last line failed too, whatever the code
	[ "$status" != 0 ] || [ "${finished:-}" != 1 ] || return 0
	echo "check.sh: FAILED at ${failed_at:-main:${step_name:-start}}" >&2
}
trap 'status=$?; rm -rf "${logs:?}" || :; [ -z "$gate_build" ] || { rm -rf "${gate_build:?}" || :; rmdir "${gate_build%/*}" 2>/dev/null || :; }; release_lock; say_failed; [ "$status" != 0 ] || [ "${finished:-}" = 1 ] || status=1; exit "$status"' EXIT
trap 'exit 1' HUP INT TERM # so the EXIT trap also runs on Ctrl-C under dash
cd "$(realpath "$(dirname "$0")/..")" # the folder's own case: a $PWD spelled otherwise loads a tool twice (F081)
# Beside the logs' folder, so two gates of one worktree (a hook and a Stop hook) never share it; app/ is where a build finds its node_modules.
gate_build="$(pwd)/app/build-gate/${logs##*/}"
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE # a hook's git environment must not steer the gate's git calls
unset GNOWORLD_BUILD AUDIT_ANSWER PROVE_FIX_VITEST PROVE_FIX_GNO PROVE_FIX_GO PICTURES_OF STORIES_PORT STORIES_OUT # the scripts' test switches, which would fake a pass
unset NGINX_SHA256 NGINX_START_TIMEOUT BENCH_WAIT_CEILING BENCH_WAIT_STEP # a run must not trust any nginx binary, nor measure a busy machine, on a caller's say-so
# The e2e web server dies of EMFILE under a soft limit of open files that is too low, and F2543 failed at 1048576 too: the soft limit is set
# to 10240 for every step, up or down, and a limit that cannot be set is said, never hidden.
open_files=$(ulimit -S -n)
if [ "$open_files" != 10240 ]; then
	ulimit -S -n 10240 2>/dev/null || echo "check.sh: could not set the limit of open files from $open_files to 10240 (its hard limit is $(ulimit -H -n)): the e2e web server may die of EMFILE" >&2
fi
full=false merge=false tests_all=false
[ "${1:-}" = "--full" ] && full=true
[ "${1:-}" = "--merge" ] && full=true merge=true
# --tests-all: the fast gate with every test, a part's last step before its report (Alexis, 2026-11-04): a commit runs the related ones.
[ "${1:-}" = "--tests-all" ] && tests_all=true
# `--full|--merge --base <ref>`: what this run's branch is measured against, in every lane that reads a base (the batch, the fixes, the
# regressions, the migrations, the patch's coverage, the harness's mutants, what counts as product code, the survivors listed): the
# merge-base with <ref>, origin/main when absent. A branch cut from an integration branch names it (F2531): from main its range holds
# the other branches' lines too.
base_ref=origin/main
if [ "${2:-}" = "--base" ]; then
	base_ref=${3:-}
	[ -n "$base_ref" ] || { echo "check.sh: --base wants a ref to compare with" >&2; exit 1; }
fi
all_failed= # every lane that failed, as lane:step, in the order it came: a merge check goes on after one and says them all at its end
changed_list= # the paths this branch changed since its base, one a line, once a full run has computed them
# Alive means the process exists: `kill -0` fails alike for a gone pid (ESRCH) and for a live one another sandbox owns (EPERM, F2616), so
# only ESRCH counts as dead. Python reads the errno, not the shell's wording.
pid_alive() {
	python3 -Ic 'import os, sys
try:
    os.kill(int(sys.argv[1]), 0)
except ProcessLookupError:
    sys.exit(1)
except PermissionError:
    pass' "$1"
}
# One merge check at a time on the machine (harness-c, Alexis 2026-10-31: five side by side at a load of 25 to 40 on 16 cores failed by load
# alone). `--merge` takes a lock shared by every worktree, a folder in the tools' cache holding its pid, its worktree and its start (seconds),
# and WAITS for a live holder, never refuses; a holder whose pid is gone (a crash, a kill -9) leaves no wait and its lock is taken over.
# mkdir is the atomic step. Only the run that took the lock frees it, by its pid, so a waiter that is interrupted drops nothing of another's.
# The fast gate and --full take none. The run's time starts after the wait.
if $merge; then
	mkdir -p "${merge_lock%/*}"
	announced= unread=0 held_by= lock_try=$(date +%s)
	until mkdir "$merge_lock" 2>/dev/null; do
		holder=$(cat "$merge_lock/pid" 2>/dev/null || :)
		if [ -z "$holder" ]; then
			# The run that made the folder is writing its pid; a folder that stays empty (a run killed in between) is nobody's.
			unread=$((unread + 1))
			[ "$unread" -lt 6 ] || { rm -rf "${merge_lock:?}"; unread=0; continue; }
			sleep 1
			continue
		fi
		unread=0
		if ! pid_alive "$holder"; then # gone (ESRCH): its lock is taken over. A refused signal (EPERM) is a live process of another sandbox (F2616)
			rm -rf "${merge_lock:?}"
			continue
		fi
		if [ -z "$announced" ]; then
			held_by=$(cat "$merge_lock/worktree" 2>/dev/null || echo "another worktree")
			since=$(cat "$merge_lock/since" 2>/dev/null || :)
			echo "check.sh --merge: waiting for the merge check of $(cat "$merge_lock/worktree" 2>/dev/null || echo "another worktree") (pid $holder), running since $(date -r "${since:-0}" '+%H:%M:%S' 2>/dev/null || echo "${since:-an unknown time}"): one merge check at a time on this machine" >&2
			announced=1
		fi
		sleep 1
	done
	lock_held=1
	printf '%s\n' "$$" >"$merge_lock/pid"
	pwd >"$merge_lock/worktree"
	date +%s >"$merge_lock/since"
	# The measure of the lock's cost (the dream of 2026-11-01, 4), before anything is built on it: one line a merge check, tab-separated, the
	# UTC time, this worktree, the seconds waited (0 when the lock was free: a clock read twice a few milliseconds apart can cross a second, a
	# wait that never began cannot), and the worktree whose check made it wait ("-" for none). A log that cannot be written costs the measure, never the run.
	waited=0
	[ -z "$held_by" ] || waited=$(($(date +%s) - lock_try))
	printf '%s\t%s\twaited %s s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(pwd -P)" "$waited" "${held_by:--}" >>"${merge_lock%/*}/merge-waits.log" 2>/dev/null || :
	started=$(date +%s) # the wait is not the run's time
fi
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
# path outside these areas changed: a config, the lockfile, the harness, the deployment. What a commit
# leaves out, the full gate runs before main takes it (pre-push).
# The tests are the ones related to the change, in every area (Alexis, 2026-11-04: Vitest was the slowest step of 210 of the 212
# slow gates): Vitest's own `related` command, given the paths scripts/related.py prints, which adds main.test.ts for the server's
# process and the readers of a file on disk, both outside Vitest's module graph. Every test when everything runs, and at --tests-all.
# ESLint reads no cache: one is keyed on a file's own text, so a type changed elsewhere would hide the error it brings there.
# test_hooks.sh runs when the change holds what it tests (the harness audit, 2026-11-04: 99 to 228 s on each of 17 config commits a
# slice): every path but a config of the tools it does not read, the lockfile, the roles, the deployment's other files.
all=true ts=false app=false gno=false tokens=false hooks=true changed=
regressions=false audit=false # a test file touched; the lockfile changed (below)
if ! $full && [ -z "$tested" ]; then
	changed=${GATE_CHANGED:-}
elif ! $full; then
	# The borrowed node_modules of a worktree is a link, which .gitignore's folder rule misses. Markdown is listed, prose to the
	# areas below but a fixture to the related tests under the sources (a recorded chain page, F4740).
	changed=$(
		set -- . ':!docs' ':!adr' ':!node_modules'
		git -c core.quotePath=false diff --no-renames --name-only HEAD -- "$@" &&
			git -c core.quotePath=false ls-files --others --exclude-standard -- "$@"
	)
fi
if [ -n "$changed" ]; then
	all=false code=false hooks=false
	while IFS= read -r path; do
		case $path in app/src/*.md | app/tests/*.md | server/src/*.md | packages/*/src/*.md) ;; docs/* | adr/* | *.md) continue ;; esac # prose, which pre-commit's list may hold; a recorded page under the sources is a fixture (F4812)
		code=true
		# A commit that touches a test, a bench or an approved picture runs check_regressions (a renamed test passed the fast gate
		# in 5b and failed only the merge check); one that changes the lockfile runs the audit (lighthouse's advisories showed only
		# at the merge check, 5e). .githooks/pre-commit holds the same list of tests, for the staged copy's own gate.
		case $path in
		*.test.ts | *.test.tsx | *.bench.ts | *.bench.tsx | *.spec.ts | *_test.gno | *_test.go | *-snapshots/*.png | *__screenshots__/*.png) regressions=true ;;
		pnpm-lock.yaml) audit=true ;;
		esac
		case $path in
		server/src/*) ts=true ;;
		app/src/*.test.ts | app/src/*.test.tsx) ts=true ;; # no page loads a test of the app: no build
		app/tests/*) ts=true ;; # the journeys, their helpers and recordings: the merge check and --full walk them
		app/src/*.ts | app/src/*.tsx | packages/ui/src/*.ts | packages/ui/src/*.tsx) ts=true app=true ;;
		packages/ui/src/tokens.css) ts=true app=true tokens=true ;; # the tokens story lists every token (F1190)
		app/src/* | app/data/* | app/lab/* | app/public/* | packages/core/src/* | packages/schemas/src/* | packages/ui/src/*) ts=true app=true ;;
		gno/*) gno=true ;;
		*)
			all=true
			case $path in
			lint/shared.config.ts | app/vitest.compiled.config.ts | deploy/test.sh | deploy/web/nginx.conf) hooks=true ;; # its own cases read them
			knip.json | .jscpd.json | .prettierignore | eslint.config.ts | tsconfig.json | tsconfig.base.json | */tsconfig.json | app/*.config.ts | lint/* | server/roles.json | deploy/*) ;;
			*) hooks=true ;;
			esac
			;;
		esac
	done <<EOF
$changed
EOF
	$code || all=true hooks=true # prose alone is no change of code, as in a repository
fi
$all && ts=true app=true gno=true
! $tests_all || ts=true # every test, whatever the change (F4815)
related=true
if $all || $tests_all; then related=false; fi
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
# A run that builds the app has the build to wait for, and the lint and types of a whole project: the budget of a run of everything. A commit's gate walks no journey (Alexis, 2026-10-31): the merge check and --full do.
$all || $app || budget=30
[ "${GATE_BUDGET:-$budget}" -lt "$budget" ] 2>/dev/null && budget=$GATE_BUDGET # a test lowers it; nothing raises it

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
# survivors <log>: every mutant that survived, as one line `survivor: <path>: line L:C [Status] Kind`, pass or fail (F2359, F2409: the
# lanes' logs are shown only on failure, and StrykerJS exits 0 with survivors, so the Workflow loop never saw one). StrykerJS's
# clear-text report (clear-text-reporter.js, v10) writes `[Survived] Kind` or `[NoCoverage] Kind`, then `path:line:column`;
# harness_mutate.py writes `FAIL  survives: <mutant>`. A Killed mutant is neither.
# Output sized by the change, not the codebase (F2529): with `changed_list`, a StrykerJS survivor on a file this branch did not change is
# counted in one line (`survivors not listed: N ...`, no `survivor: ` line), the others and every harness mutant are listed.
survivors() {
	awk -v changed_list="$changed_list" '
	BEGIN { while (changed_list != "" && (getline file < changed_list) > 0) changed[file] = 1 }
	/^\[(Survived|NoCoverage)\] / { status = $1; gsub(/[][]/, "", status); kind = $0; sub(/^\[[A-Za-z]+\] /, "", kind); want = 1; next }
	want && $0 ~ /^[^ :][^ ]*:[0-9]+:[0-9]+$/ {
		n = split($0, part, ":")
		path = substr($0, 1, length($0) - length(part[n]) - length(part[n - 1]) - 2)
		want = 0
		if (changed_list != "" && !(path in changed)) { left++; if (!(path in elsewhere)) { elsewhere[path] = 1; files++ } next }
		print "survivor: " path ": line " part[n - 1] ":" part[n] " [" status "] " kind
		next
	}
	/^\[/ { want = 0 }
	/^FAIL  survives: / { sub(/^FAIL  survives: /, ""); print "survivor: " $0 }
	END { if (left) print "survivors not listed: " left " StrykerJS survivors on " files " unchanged file" (files == 1 ? "" : "s") ", none of them changed by this branch since its base" }
	' "$1"
}
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
		survivors "$logs/$l.log"
	done
	for l in $failed; do
		[ -n "$failed_at" ] || failed_at="$l:$(cat "$logs/$l.at" 2>/dev/null || echo start)"
		all_failed="$all_failed $l:$(cat "$logs/$l.at" 2>/dev/null || echo start)"
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
	# Prettier's cache is keyed by a file's path and content: in a repository it lives in the worktree's own .claude/tmp and makes a rerun of
	# an unchanged tree 0.9 s of 7.5 (speed-audit.md, row 6); pre-commit's staged copy is a new folder each time, so it keeps none, and --full and --merge read no writable cache.
	format_cache=
	{ $full || [ -z "$tested" ]; } || format_cache="--cache --cache-strategy content --cache-location=.claude/tmp/prettier-cache"
	run format:check "$format_cache"
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
	if ! $full; then
		# A commit's gate builds the app and walks no journey (Alexis, 2026-10-31: 487 and 505 CPU s of journeys against 67 to 91 for the
		# rest of a commit's gate, speed-audit.md): the build still fails on a route or an import the types do not see. The merge check
		# and --full walk every journey, which build the app themselves.
		# In a folder of its own (app/build-gate/<this run>, gitignored, removed when the gate ends; inside the app, where the server bundle finds its node_modules): a build empties the folder it writes, and app/build is the one the journeys
		# of a session build and serve, so a gate run beside them left their site empty (33 ERR_EMPTY_RESPONSE, F4249). The budget run below
		# builds again and serves the same folder (react-router.config.ts, serve.mjs, lab.config.ts read GNOWORLD_BUILD).
		GNOWORLD_BUILD=$gate_build
		export GNOWORLD_BUILD
		run build:app
		[ "$(packages)" = "$installed" ] || { echo "check.sh: building the app changed package.json or the lockfile" >&2; exit 1; }
		# And the first screen's budget, read with the budget spec's own measure, the browser's gzip, and nothing else of the journeys: the build
		# alone let a broken budget through to the merge check, 30 minutes later (the dream of 2026-11-01, 6).
		E2E_PORT=$(free_ports 3)
		export E2E_PORT
		node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts --reporter=dot app/tests/e2e/budgets.spec.ts
		return 0
	fi
	# Three free ports from a base of this run's own (the journeys' hosts), so gates of several worktrees run at once;
	# a port taken between this and the build fails the run, never another's.
	E2E_PORT=$(free_ports 3)
	export E2E_PORT
	export PLAYWRIGHT_JSON_OUTPUT_NAME="$logs/playwright.json"
	node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts --reporter=dot,json >"$logs/playwright.out" 2>&1 || # node: see check_regressions.py
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
	if ! $full; then # --full runs the tests once, with coverage
		step vitest
		tests=$(node -p "require('./package.json').scripts.test")
		if $related; then
			# Vitest's own `related` command, which a path at a time follows to every test importing it (Vitest 4.1.12 has no `run --related`:
			# its cac refuses the option), with the projects the test script keeps; a script of another shape is refused, never run as it is.
			case $tests in "vitest run "*) ;; *)
				echo "check.sh: package.json's test script does not start with 'vitest run ': its related tests cannot be asked for" >&2
				exit 1
				;;
			esac
			files=$(printf '%s\n' "$changed" | python3 -I scripts/related.py)
			tests="vitest related --run ${tests#vitest run } $files"
		else
			python3 -I scripts/related.py --check </dev/null # the map's own test: a read it cannot follow refuses, whatever runs
		fi
		sh -c "$tests --reporter=default --reporter=json --outputFile.json=$logs/vitest.json" >"$logs/vitest.out" 2>&1 ||
			retry vitest "$logs/vitest.json" "$logs/vitest.out" sh -c "$(node -p "require('./package.json').scripts.test") \"\$@\"" sh
	fi
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
		python3 -I scripts/check_regressions.py --quick "$regr_base" # per commit: the base's listing cached, only the touched files listed (F2579)
	fi
	if $audit; then
		step audit
		python3 -I scripts/audit.py
	fi
	step parse
	# Some scripts run only in --full: a broken one would pass every commit (finding F084).
	python3 -I -c 'import ast, sys; [ast.parse(open(f).read(), f) for f in sys.argv[1:]]' scripts/*.py
	$hooks || return 0 # the hooks' tests run when the change holds what they test (above)
	step hooks
	sh scripts/test_hooks.sh
}

# A merge check's first phase carries its failure like the others: a journey, a lint or a type error stopped the check before the survivors'
# run (round 1, reviewer-1-1). The fast gate and --full stop here.
carried=

# The machine's 1-minute load and its cores, in tenths (scripts/load.py), read as the lanes start, before any of them loads it
# (and again at the end, if the run is over budget).
load_start=$(python3 -I scripts/load.py)
start ts
start types
start tests
start gno
start docs
start pictures
finish ts types tests gno docs pictures || { $merge || exit 1; carried=1; }

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
	base=$(git merge-base HEAD "$base_ref") || { echo "check.sh --full: needs $base_ref to compare with (git fetch, or a ref that exists)" >&2; exit 1; }
	changes=$(git -c core.quotePath=false diff --no-renames --name-only "$base" -- && git -c core.quotePath=false ls-files --others --exclude-standard)
	printf '%s\n' "$changes" >"$logs/changed" && changed_list="$logs/changed"
	# A merge's own gate judges the product when its change since main holds some (Alexis, 2026-10-29): docs, the harness and
	# the linters' configs alone have no coverage, mutant or fix of the product to judge, which took 40 of its 47 minutes. --full judges all.
	# check_nginx.py and check_migrations.py run when what they read changed since the base (the harness audit, 2026-11-04): nginx's,
	# the image's web files, the app and what it builds from (its table and pages come from the data, the routes, the inline scripts:
	# app/react-router.config.ts, F4811), the lockfile, the check and its pin; the migrations', the server's code.
	product=true nginx=false migrations=false
	! $merge || product=false
	while IFS= read -r path; do
		case $path in '' | docs/* | adr/* | *.md | scripts/* | .githooks/* | .claude/* | .github/* | lint/* | eslint.config.ts | knip.json | .jscpd.json | .prettierrc.json | .prettierignore) ;; *) product=true ;; esac
		case $path in deploy/web/* | app/* | packages/* | pnpm-lock.yaml | scripts/check_nginx.py | scripts/nginx.sha256) nginx=true ;; esac
		case $path in server/src/* | scripts/check_migrations.py) migrations=true ;; esac
	done <<EOF
$changes
EOF
	$product || echo "check.sh --merge: no product code since $base: the stories, the coverage lane and prove_fix do not run"
	# harness_mutate.py in --full: skipped when no harness file (records.sh's list) changed since the last green --full, whose commit
	# .claude/tmp/green-harness names, and nothing is untracked, which git diff does not see (the harness audit, 2026-11-04: the mutants
	# took 173 s warm, up to 3,766 s); probe.py too, when nothing at all changed, as it reads the product's files (tokens.css, F4813).
	# The record must name a commit by its whole id; anything else runs both.
	harness_judged=false probe_judged=false
	if ! $merge && [ -z "$(git ls-files --others --exclude-standard)" ]; then
		judged=$(cat .claude/tmp/green-harness 2>/dev/null || :)
		case $judged in *[!0-9a-f]*) judged= ;; esac # a name, an option, a second line, a carriage return: no id
		if [ "${#judged}" = 40 ] && git rev-parse -q --verify "$judged^{commit}" >/dev/null && harness --quiet "$judged"; then
			harness_judged=true
			! git diff --quiet "$judged" || probe_judged=true
			echo "check.sh --full: no harness file changed since the last green --full ($judged): harness_mutate.py does not run$($probe_judged && echo ', nor probe.py (no change at all)')"
		fi
	fi
	# The merge check's two speeds (slice 7, question 21; scripts/speeds.py reads docs/REVIEW.md's tiers): a change of interface alone runs no
	# StrykerJS, and any other, or any doubt, runs the whole control. Only the word `interface`, as the one line the script prints, lowers it.
	# --full, which main requires, stays whole.
	speed=full
	if $merge && $product; then
		speed=$(printf '%s\n' "$changes" | python3 -I scripts/speeds.py "$PWD" 2>/dev/null) || speed=full
		[ "$speed" = interface ] || speed=full
		[ "$speed" = full ] || echo "check.sh --merge: a change of interface alone (docs/REVIEW.md, tier 3): StrykerJS does not run; the coverage, the patch's coverage and the rest do"
	fi
	# probe.py plants its faults in the source tree, so it runs alone: a lane beside it (the coverage's Vitest,
	# check_regressions' list, StrykerJS, the stories' build) would read its files as they come and go.
	lane_probe() {
		if ! $probe_judged; then
			step probe # the harness keeps its promises
			python3 -I scripts/probe.py
		fi
		# The budgets of docs/plans/, after probe.py and alone: beside other work a bench measures the load. At a slice's end alone (--full):
		# a part's merge check waited up to 600 s for a quiet machine, at loads of 48 to 142, to refuse with no verdict (the harness audit).
		if ! $merge; then
			step bench
			python3 -I scripts/bench.py
		fi
		if $merge && $nginx; then
			step nginx # the image's nginx.conf with the build's table in a pinned nginx, then the built pages served: each answers its own policy (5f's F2459, F2460)
			python3 -I scripts/check_nginx.py
		fi
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
		# A test that fails once under the coverage's load runs again, as in the fast gate (F3384: one failure cost an hour of a gate that was
		# not retried). The second run is the WHOLE coverage, not the failed file alone: the thresholds (85%, core 100%) are measured on
		# every file, and one file alone cannot meet them; unsteady.py's file arguments are left unread. R1's refusals hold as in the fast gate.
		run coverage "--maxWorkers=$half --reporter=default --reporter=json --outputFile.json=$logs/coverage.json" >"$logs/coverage.out" 2>&1 ||
			retry vitest "$logs/coverage.json" "$logs/coverage.out" sh -c "$(node -p "require('./package.json').scripts.coverage") --maxWorkers=$half" sh
	}
	lane_mutation() {
		step patch_coverage # 85% of the lines this branch changed
		# Its failure, or a coverage run that left no report, never stops StrykerJS beside it: the merge check goes on and says every failure
		# (round 1, reviewer-1-2); the lane still fails, naming this step.
		patched=0
		python3 -I scripts/patch_coverage.py "$base" || patched=$?
		[ "$patched" = 0 ] || $merge || return "$patched" # --full stops here, as before
		[ "$speed" = full ] || return "$patched" # a change of interface alone runs no StrykerJS
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
		[ "$patched" = 0 ] || { echo patch_coverage >"$logs/$lane.at"; return 1; }
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
		if $migrations; then
			step migrations # a migration main has keeps its text and its place (F466)
			python3 -I scripts/check_migrations.py "$base"
		fi
		step secrets # no secret anywhere in the history, no known vulnerability in a dependency
		sh scripts/scan_secrets.sh
		step audit
		python3 -I scripts/audit.py
	}
	lane_harness() {
		! $harness_judged || return 0 # judged by the last green --full (above)
		harness --quiet "$base" && return 0 # records.sh's list
		step harness_mutate # each guard switched off must fail a test (several minutes)
		if $merge; then
			python3 -I scripts/harness_mutate.py --changed "$base"
			return 0
		fi
		python3 -I scripts/harness_mutate.py
	}
	# A phase is the lanes that run side by side. --full stops at the first phase with a failure, which fixes nothing of what comes after; a
	# merge check's phases all run (the dream of 2026-11-01, 5: a failed lane or a bench refused for the load stopped the 20 minutes that find
	# the survivors), and the end of it fails, saying every failure.
	phase() {
		finish "$@" || {
			$merge || {
				echo "check.sh: the lanes after $* did not run: $* failed first" >&2
				exit 1
			}
			carried=1
		}
	}
	start probe
	phase probe
	# The coverage after the probe, which plants its faults in the tree, and never beside it (F3384); before prove_fix, whose 40 minutes a
	# failure of the coverage need not wait for. It runs alone: beside it, the stories' journeys timed out (F815).
	if $product; then
		start coverage
		phase coverage
	fi
	# The stories' journeys run beside the history lane alone: under the patch's coverage, StrykerJS and the harness's worktrees, a
	# Dialog's teardown in the browser outlasted its test (F815). A failure there stops --full before the two after them, whose
	# fifteen to twenty minutes would fix nothing of it (C.5, F823).
	! $product || start stories
	start history
	phase $($product && echo stories) history
	! $product || start mutation
	start harness
	phase $($product && echo mutation) harness
	[ -z "$carried" ] || {
		echo "check.sh --merge: every failure above, in the order they came:$all_failed" >&2
		exit 1
	}
fi

if [ -n "$tested" ]; then
	mkdir -p .claude/tmp && sh scripts/code_changed.sh --state >.claude/tmp/gate-green # what stop_gate.sh compares
	# The harness a green --full judged, by its commit, for the next --full to skip the probe and the mutants on (above): only a tree
	# whose harness is committed, with nothing untracked, and that did not change while the gate ran, is named by one; and only from
	# origin/main, as a run from another base judges no mutant of a harness that base already has (F4814).
	if $full && ! $merge && [ "$base_ref" = origin/main ] && [ "$(worktree_print)" = "$tested" ] && harness --quiet HEAD && [ -z "$(git ls-files --others --exclude-standard)" ]; then
		git rev-parse HEAD >.claude/tmp/green-harness
	fi
	! $merge || full=false # --merge records the fast gate only: main wants --full's record
	gate_passed "$tested" "$full" # for the hooks outside the sandbox, which run no gate (F076)
fi
echo "all checks passed in $(($(date +%s) - started)) s (budget $budget s)"
finished=1
