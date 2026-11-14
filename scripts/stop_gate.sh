#!/bin/sh
# stop_gate.sh: Claude Code's Stop hook, which only reaps since D13173 (its turn's gate and the ping-pong's exception left): it
# runs outside the sandbox, so it runs no code a sandboxed command could have written, no gate and no tool of the tree, the system's
# ps and kill alone; it never blocks a turn.
set -eu
# At every turn's end it stops what runs of this project left behind (Alexis, 2026-10-29: StrykerJS workers of a
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
reap || : # set -e is off inside it, called so: one kill that finds its pid gone stops nothing
exit 0
