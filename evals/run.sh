#!/bin/sh
# evals/run.sh: gnoworld's evals (ADR-0002 §5, "Evals"), on a developer's machine whose packages and evals/ are installed
# (.claude/tmp/slice-10/setup-10j.sh), with Anthropic's key in a file nobody pastes:
#   ANTHROPIC_API_KEY_FILE=deploy/secrets/anthropic_api_key sh evals/run.sh [promptfoo eval's options]
# It checks the evals' own code first (types, tests), then runs promptfoo: each case not kept in evals/.cache costs its
# model calls and its grading, written to evals/results/. GNOMCP names gnomcp 0.11.0 (default: the one on PATH).
# Exit: promptfoo's, or 2 when a tool or the key is missing.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(dirname "$here")
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"
missing() {
	echo "evals/run.sh: $1" >&2
	exit 2
}
[ "$(node --version)" = v24.22.0 ] || missing "Node 24.22.0 is not first on PATH"
[ -r "${ANTHROPIC_API_KEY_FILE:-}" ] || missing "ANTHROPIC_API_KEY_FILE names no readable file"
GNOMCP=${GNOMCP:-$(command -v gnomcp || true)}
[ -n "$GNOMCP" ] && [ "$("$GNOMCP" version 2>/dev/null)" = 0.11.0 ] || missing "gnomcp 0.11.0 is not found (GNOMCP)"
[ -x "$here/node_modules/.bin/promptfoo" ] || missing "evals/ is not installed (setup-10j.sh)"
ANTHROPIC_API_KEY_FILE=$(cd "$(dirname "$ANTHROPIC_API_KEY_FILE")" && pwd)/$(basename "$ANTHROPIC_API_KEY_FILE")
export ANTHROPIC_API_KEY_FILE GNOMCP
"$repo/node_modules/.bin/tsc" -p "$here/tsconfig.json"
# Named test-*.ts, not *.test.ts, which knip's vitest plugin would take for the root workspace's (knip.json).
node --test "$here"/test-*.ts
mkdir -p "$here/results"
cd "$here"
# promptfoo's command is package.json's `eval`, the one place it is written (as check.sh runs its tools). The grader
# reads its key from the environment, for this command alone; promptfoo sends nothing of its own out.
PATH="$here/node_modules/.bin:$PATH"
ANTHROPIC_API_KEY=$(cat "$ANTHROPIC_API_KEY_FILE") PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_SHARING=1 \
	PROMPTFOO_DISABLE_UPDATE=1 PROMPTFOO_DISABLE_REMOTE_GENERATION=1 \
	exec sh -c "$(node -p "require('./package.json').scripts.eval") \"\$@\"" sh -o "results/$(date -u +%Y-%m-%dT%H%M%SZ).json" "$@"
