#!/bin/sh
# stop_gate.sh: Claude Code's Stop hook. A turn that changed code ends only with the gate
# green. It blocks once: a second stop in a row passes, so a gate that cannot go green
# reaches Alexis instead of looping. Docs-only changes skip it, as in pre-commit.
set -eu
input=$(cat)
case $input in *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;; esac
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"
[ -z "$(git status --porcelain -- . ':!docs' ':!adr' ':!*.md' ':!.claude')" ] && exit 0
out=$(mktemp)
trap 'rm -f "$out"' EXIT
if ! sh scripts/check.sh >"$out" 2>&1; then
	echo "The gate failed (scripts/check.sh). Fix it before ending the turn:" >&2
	tail -n 40 "$out" >&2
	exit 2
fi
