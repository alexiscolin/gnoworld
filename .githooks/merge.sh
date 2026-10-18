#!/bin/sh
# merge.sh <branch>: merges a branch into main in Alexis's shell, after showing him each harness
# file it changes, with the diff: git writes them before any hook runs, so they are seen here or
# not at all (F129). Installed beside the hooks: sh .git/hooks/merge.sh <branch>
set -eu
. "$(dirname "$0")/records.sh"
cd "$(git rev-parse --show-toplevel)" # the harness's paths are the root's
branch=${1:?usage: sh .git/hooks/merge.sh <branch>}
tip=$(git rev-parse --verify "$branch^{commit}")
[ "$(git symbolic-ref -q --short HEAD)" = main ] || { echo "merge.sh: check out main first" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "merge.sh: main has uncommitted or untracked files; commit or remove them first" >&2; exit 1; }
changed=$(harness --name-only HEAD..."$tip")
if [ -n "$changed" ]; then
	# As text, whatever an attribute or a driver would show instead (F132), and its control bytes
	# made visible: an escape sequence in a file could otherwise hide a line on the screen.
	shown=$(harness --text --no-ext-diff --no-textconv --color=never HEAD..."$tip")
	printf '%s\n\nThe harness files this merge changes, shown above:\n%s\n' "$shown" "$changed" | cat -v
	printf 'Type the branch name to merge them: '
	read -r answer
	[ "$answer" = "$branch" ] || { echo "merge.sh: nothing merged" >&2; exit 1; }
fi
# The commit shown, not the branch, which may have moved since; pre-commit checks the mark.
GNOWORLD_MERGE=$tip git merge --no-ff -m "Merge branch '$branch'" "$tip"
