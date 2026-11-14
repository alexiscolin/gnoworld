#!/bin/sh
# ci_changes.sh: what a change calls for on GitHub (gate.yml's `changes` job). The job runs the copy of this script, of
# records.sh's harness list, of docs/REVIEW.md's tiers and of the scripts below taken from the commit the change is judged
# against, so a change cannot rewrite the detector that judges it (the red team's tests 9 and 10). It writes nothing.
# Usage, from the checked-out change: ci_changes.sh <event> <base commit> <the base commit's tree>
# It prints name=value lines: base, then each flag, true or false. What it cannot read calls for the job.
set -eu
[ $# = 3 ] || { echo "usage: ci_changes.sh <event> <base> <base tree>" >&2; exit 2; }
event=$1 base=$2 root=$3
case $event in
pull_request | push) all=false ;;
*) all=true ;; # a manual run, or an event this script does not know, runs every job
esac
# Each path whole, NUL-separated: git quotes a name holding a tab, a quote or a backslash, which a prefix would then miss.
git cat-file -e "$base^{commit}" || { echo "ci_changes.sh: no commit $base to judge against" >&2; exit 1; }
changed=$(git diff -z --no-renames --name-only "$base" HEAD | tr '\0' '\n')
# What reaches main by GitHub's merge met no hook of a clone (D13173), so the change is refused, whatever the event, when the tree
# holds a path this disk may read as another, as pre-commit refuses one from the sandbox: a byte outside ASCII (F164), or a folder or
# file name equal but for case to another (F151: Packages/evil/package.json lands as packages/evil/, a workspace pnpm installs).
folded=$(git ls-tree -r -z --name-only HEAD | python3 -I -c '
import sys
seen = {}
for p in [p for p in sys.stdin.buffer.read().split(b"\0") if p]:
    if any(b > 0x7e for b in p):
        print("a byte outside ASCII: " + p.decode("utf-8", "backslashreplace"))
    parts = p.split(b"/")
    for i in range(1, len(parts) + 1):
        seen.setdefault(b"/".join(parts[:i]).lower(), set()).add(b"/".join(parts[:i]))
for names in seen.values():
    if len(names) > 1:
        print("names equal but for case: " + " and ".join(sorted(n.decode("utf-8", "backslashreplace") for n in names)))
') || { echo "ci_changes.sh: the tree's paths could not be read" >&2; exit 1; }
[ -z "$folded" ] || { printf 'ci_changes.sh: a path this disk may read as another (F151, F164):\n%s\n' "$folded" >&2; exit 1; }
has() { [ "$all" = true ] || printf '%s\n' "$changed" | grep -Eq "$1"; }
flag() { if "$@"; then echo true; else echo false; fi; }
# Code: anything but prose, the harness and the linters' configs; a page under the sources is code.
code() {
	[ "$all" = true ] && return 0
	has '^(app/src|app/tests|server/src|packages/[^/]+/src)/.*\.md$' && return 0
	printf '%s\n' "$changed" | grep -Ev '^(docs/|adr/|scripts/|\.githooks/|\.claude/|\.github/|lint/)|^(eslint\.config\.ts|knip\.json|\.jscpd\.json|\.prettierrc\.json|\.prettierignore)$|\.md$|^$' | grep -q .
}
# The harness, by the base's records.sh: a failure to read it counts as a harness change.
harness_changed() { [ "$all" = true ] || ! (. "$root/.githooks/records.sh" && harness --quiet "$base"); }
# The tier, by the base's docs/REVIEW.md and speeds.py: only `other` is no tier-1 path; anything else, a failure included, is tier 1.
# A link leads anywhere, and the base's tree holds none of the change's: any link the change adds, changes or removes is tier 1.
tier1() {
	[ "$all" = true ] && return 0
	git diff --no-renames --raw "$base" HEAD | grep -Eq '^:[0-7]+ 120000 |^:120000 ' && return 0
	[ "$(printf '%s\n' "$changed" | python3 -I "$root/scripts/speeds.py" --tier1 "$root" 2>/dev/null || :)" != other ]
}
# Each harness file of the base's list the change touches is declared on a line of a commit, `Harness-changed: <path> - why`, which
# Alexis reads (F089, F5717), as the local merge check and pre-push's push of main asked before D13173; a list that cannot be read
# refuses.
declared() { # $1: the path; stdin: the commit messages
	while IFS= read -r line; do
		case $line in "Harness-changed: $1 - "?*) return 0 ;; esac
	done
	return 1
}
if [ "$all" = false ]; then
	listed=$(. "$root/.githooks/records.sh" && harness --name-only "$base" HEAD) || {
		echo "ci_changes.sh: the base's harness list cannot be read, so no declaration can be checked" >&2
		exit 1
	}
	undeclared=$(printf '%s\n' "$listed" | while IFS= read -r f; do
		[ -z "$f" ] || git log --format=%B "$base..HEAD" | declared "$f" || printf '%s\n' "$f"
	done)
	[ -z "$undeclared" ] || {
		printf 'ci_changes.sh: harness files changed with no `Harness-changed: <path> - why` line in a commit:\n%s\n' "$undeclared" >&2
		exit 1
	}
fi
echo "base=$base"
echo "product=$(flag code)"
echo "ts=$(flag has '^(app|server|jarvis|link-reader|packages)/|^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig[^/]*\.json|vitest\.config\.ts|eslint\.config\.ts)$')"
echo "app=$(flag has '^(app|packages)/|^(package\.json|pnpm-lock\.yaml)$')"
echo "gno=$(flag has '^gno/')"
echo "deploy=$(flag has '^deploy/')"
echo "ui=$(flag has '^packages/ui/')"
echo "nginx=$(flag has '^(deploy/web/|app/|packages/)|^(scripts/check_nginx\.py|scripts/nginx\.sha256|pnpm-lock\.yaml)$')"
echo "migrations=$(flag has '^server/src/|^scripts/check_migrations\.py$')"
echo "harness=$(flag harness_changed)"
echo "tier1=$(flag tier1)"
