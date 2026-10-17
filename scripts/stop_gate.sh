#!/bin/sh
# stop_gate.sh: Claude Code's Stop hook. It runs outside the sandbox, so it runs no code a
# sandboxed command could have written: no gate, no tool. A turn that changed code ends only
# once check.sh, run in the sandbox, has passed on exactly this tree (it records the state in
# .claude/tmp/gate-green). It blocks once: a second stop in a row passes, so a gate that cannot
# go green reaches Alexis instead of looping. Docs-only changes skip it, as in pre-commit.
set -eu
input=$(cat)
case $input in *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;; esac
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"
sh scripts/code_changed.sh || exit 0
[ "$(cat .claude/tmp/gate-green 2>/dev/null)" = "$(sh scripts/code_changed.sh --state)" ] && exit 0
echo "The code changed since the gate last passed on it: run sh scripts/check.sh, fix what fails, then end the turn." >&2
exit 2
