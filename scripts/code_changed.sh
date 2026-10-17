#!/bin/sh
# code_changed.sh: whether anything but prose changed; the one definition the commit gate and the
# turn gate share. With --staged, what is staged; otherwise the working tree, untracked files
# included. Exit 0 when code changed, 1 when only docs and Markdown did. With --state, it prints a
# fingerprint of the whole tree (HEAD, the changes, untracked files): what check.sh records when
# it passes, and stop_gate.sh compares.
set -eu
mode=${1:-}
if [ "$mode" = --state ]; then
	{ git rev-parse HEAD; git diff HEAD --binary; git ls-files -o --exclude-standard -z | xargs -0 -r git hash-object --; } | git hash-object --stdin
	exit 0
fi
set -- . ':!docs' ':!adr' ':!*.md'
if [ "$mode" = --staged ]; then
	! git diff --cached --quiet -- "$@"
else
	[ -n "$(git status --porcelain -- "$@")" ]
fi
