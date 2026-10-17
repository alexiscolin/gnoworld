#!/bin/sh
# code_changed.sh: whether anything but prose changed; the one definition the commit gate and the
# turn gate share. With --staged, what is staged; otherwise the working tree, untracked files
# included. Exit 0 when code changed, 1 when only docs and Markdown did.
set -eu
mode=${1:-}
set -- . ':!docs' ':!adr' ':!*.md'
if [ "$mode" = --staged ]; then
	! git diff --cached --quiet -- "$@"
else
	[ -n "$(git status --porcelain -- "$@")" ]
fi
