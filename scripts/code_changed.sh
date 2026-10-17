#!/bin/sh
# code_changed.sh: whether anything but prose changed; the one definition the commit gate and the
# turn gate share. With --staged, what is staged; otherwise the working tree, untracked files
# included. Exit 0 when code changed, 1 when only docs and Markdown did. With --state, it prints a
# fingerprint of the code, prose left out (the index, the changes, untracked files): what
# check.sh records when it passes, and stop_gate.sh compares.
set -eu
mode=${1:-}
set -- . ':!docs' ':!adr' ':!*.md'
if [ "$mode" = --state ]; then # the index, then what differs from it, so a docs commit keeps it
	{ git ls-files -s -- "$@"; git diff --binary -- "$@"; git ls-files -o --exclude-standard -z -- "$@" | xargs -0 git hash-object --; } | git hash-object --stdin
	exit 0
fi
if [ "$mode" = --staged ]; then
	! git diff --cached --quiet -- "$@"
else
	[ -n "$(git status --porcelain -- "$@")" ]
fi
