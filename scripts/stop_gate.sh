#!/bin/sh
# stop_gate.sh: Claude Code's Stop hook. It runs outside the sandbox, so it runs no code a
# sandboxed command could have written: no gate, no tool. A turn that changed code ends only
# once check.sh, run in the sandbox, has passed on exactly this tree (it records the state in
# .claude/tmp/gate-green). It blocks once: a second stop in a row passes, so a gate that cannot
# go green reaches Alexis instead of looping. Docs-only changes skip it, as in pre-commit.
set -eu
input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"
# First, at every turn's end, it stops what runs of this project left behind (Alexis, 2026-10-29: StrykerJS workers of a
# killed run spun for 31 hours, a vitest for 6 days), which the sandbox cannot see: a node process naming a folder
# `gnoworld/` whose parent is gone for 30 minutes or more (2 hours while a gate runs; a session's server started a moment
# ago is spared), or a test tool's, not in a dev or watch mode, 3 hours old or more.
# TERM, then KILL a second later. It writes nothing the sandbox could have planted a link at: no temporary file, and its
# log, `<pid> <seconds> <command>` a line, under ~/Library/Logs (security-S1, S3). A cleanup that fails never costs the
# block below.
reap() {
	list=$(ps -Ao pid=,ppid=,etime=,command= | awk -v self=$$ '
		function age(t, d, n, p) {
			d = 0
			if (index(t, "-")) { d = substr(t, 1, index(t, "-") - 1); t = substr(t, index(t, "-") + 1) }
			n = split(t, p, ":")
			return d * 86400 + (n == 3 ? p[1] * 3600 + p[2] * 60 + p[3] : p[1] * 60 + p[2])
		}
		{
			pid[NR] = $1; ppid[NR] = $2; secs[NR] = age($3)
			cmd = $0; sub(/^ *[0-9]+ +[0-9]+ +[0-9:-]+ /, "", cmd); line[NR] = cmd
			split(cmd, w, " "); first = w[1]; sub(/.*\//, "", first); prog[NR] = first
			if ($2 != 1 && (w[1] ~ /(^|\/)scripts\/check\.sh$/ || (first ~ /^(sh|bash|dash|zsh)$/ && w[2] ~ /(^|\/)scripts\/check\.sh$/))) gate = 1
		}
		END {
			for (i = 1; i <= NR; i++) {
				low = tolower(line[i])
				if (pid[i] == self || prog[i] != "node" || low !~ /gnoworld\//) continue
				if ((ppid[i] == 1 && secs[i] >= (gate ? 7200 : 1800)) || (low ~ /vitest|stryker|playwright|storybook/ && low !~ / (dev|watch|--watch)( |$)/ && secs[i] >= 10800))
					print pid[i], secs[i], line[i]
			}
		}') || return 0
	[ -n "$list" ] || return 0
	pids=$(printf '%s\n' "$list" | cut -d' ' -f1)
	kill $pids 2>/dev/null
	sleep 1
	kill -9 $pids 2>/dev/null
	log="$HOME/Library/Logs/gnoworld-reaped.log"
	{ mkdir -p "${log%/*}" && printf '%s\n' "$list" >>"$log"; } 2>/dev/null
}
# The ping-pong, the one exception (Alexis, 2026-11-04; CLAUDE.md, docs/DEVELOPMENT.md, "The workshop"): while Alexis's own `pnpm workshop`
# serves this checkout, a turn ends without the gate, which pre-commit still runs on every commit. Its sign is one no sandboxed command can
# plant (the chief): a shell running this checkout's scripts/workshop.sh from this checkout's folder, its parent alive and its group its
# terminal's foreground one (a look-alike that code the workshop runs left behind is launchd's, or in no terminal's foreground: F4962),
# that macOS's sandbox_check finds in no sandbox. No file of the tree is read for it; its tools are the
# system's own, by their paths, Python isolated from the folder (F4850); any of them missing or failing is no ping-pong.
pingpong() {
	here=$(pwd -P)
	shells=$(/bin/ps -Ao pid=,ppid=,pgid=,tpgid=,etime=,command= | /usr/bin/awk -v here="$here" '
		{ shell = $6; sub(/.*\//, "", shell) }
		$2 != 1 && $3 == $4 && NF == 7 && shell ~ /^(sh|bash|dash|zsh)$/ && ($7 == "scripts/workshop.sh" || $7 == "./scripts/workshop.sh" || $7 == here "/scripts/workshop.sh") { print $1 }') || return 1
	for pid in $shells; do
		[ "$(/usr/sbin/lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | /usr/bin/sed -n 's/^n//p')" = "$here" ] || continue
		/usr/bin/python3 -Ic 'import ctypes, sys
check = ctypes.CDLL("/usr/lib/libSystem.dylib").sandbox_check
check.restype, check.argtypes = ctypes.c_int, [ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
sys.exit(0 if check(int(sys.argv[1]), None, 0) == 0 else 1)' "$pid" 2>/dev/null && return 0
	done
	return 1
}
reap || : # set -e is off inside it, called so: one kill that finds its pid gone stops nothing
case $input in *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;; esac
sh scripts/code_changed.sh || exit 0
state=$(sh scripts/code_changed.sh --state)
[ "$(cat .claude/tmp/gate-green 2>/dev/null)" = "$state" ] && exit 0
pingpong && exit 0 # its record and its block left as they are
# Once per tree: a stop on the very tree it blocked already says nothing new.
[ "$(cat .claude/tmp/gate-blocked 2>/dev/null)" = "$state" ] && exit 0
# A record it cannot write still blocks: a hook that fails lets the turn end.
# Written beside it, then moved over it: a link the sandbox planted there is replaced, never written through, and a folder
# there (or a link to one, which mv would move into) is left as it is (security-S2).
{ [ ! -L .claude/tmp ] && [ ! -d .claude/tmp/gate-blocked ] && mkdir -p .claude/tmp && tmp=$(mktemp .claude/tmp/gate-blocked.XXXXXX) &&
	{ printf '%s\n' "$state" >"$tmp" && mv -f "$tmp" .claude/tmp/gate-blocked || rm -f "$tmp"; }; } 2>/dev/null
echo "The code changed since the gate last passed on it: run sh scripts/check.sh, fix what fails, then end the turn." >&2
exit 2
