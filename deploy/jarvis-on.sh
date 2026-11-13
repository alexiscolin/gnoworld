#!/bin/sh
# deploy/jarvis-on.sh: switches Jarvis on (10u-g2, D13987), and only when the last evals result passes the gate
# (deploy/jarvis-evals-gate.py). It writes JARVIS=on in deploy/.env (or the file named as $1); never edit that line by hand.
#   sh deploy/jarvis-on.sh
# Exit: 0 switched on, 1 the gate refused (its reason is printed, the file untouched), 2 a tool is missing or fails.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(dirname "$here")
env_file=${1:-$here/.env}
command -v python3 >/dev/null || { echo "jarvis-on.sh: python3 is missing" >&2; exit 2; }
command -v node >/dev/null || { echo "jarvis-on.sh: node is missing" >&2; exit 2; }
gate=${TEST_EVALS_GATE:-$here/jarvis-evals-gate.py}
evals=${JARVIS_EVALS_DIR:-$repo/evals}
# The code this checkout deploys, as the evals fingerprint it: the gate refuses a result of other code.
fingerprint=$(node "$repo/evals/fingerprint.ts") || { echo "jarvis-on.sh: the code's fingerprint failed" >&2; exit 2; }
if ! answer=$(python3 -I "$gate" "$evals/results" "$evals/cases" "$fingerprint" 2>&1); then
	echo "jarvis-on.sh: Jarvis stays off: $answer" >&2
	exit 1
fi
touch "$env_file"
kept=$(grep -v '^JARVIS=' "$env_file" || true)
{
	[ -z "$kept" ] || printf '%s\n' "$kept"
	echo "JARVIS=on"
} >"$env_file.new"
mv "$env_file.new" "$env_file"
echo "jarvis-on.sh: JARVIS=on in $env_file; start it with --profile jarvis (docs/OPERATIONS.md, \"Switching Jarvis on\")"
