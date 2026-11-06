#!/bin/sh
# merge.sh <branch>: merges a branch into the one checked out (main, or a part's: 9n-3) in Alexis's shell, after showing him each harness
# file it changes, with the diff: git writes them before any hook runs, so they are seen here or
# not at all (F129). Installed beside the hooks: sh .git/hooks/merge.sh <branch>
set -eu
. "$(dirname "$0")/records.sh"
cd "$(git rev-parse --show-toplevel)" # the harness's paths are the root's
branch=${1:?usage: sh .git/hooks/merge.sh <branch>}
tip=$(git rev-parse --verify "$branch^{commit}")
onto=$(git symbolic-ref -q --short HEAD) || { echo "merge.sh: check out the branch to merge onto first" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "merge.sh: $onto has uncommitted or untracked files; commit or remove them first" >&2; exit 1; }
if foreign HEAD..."$tip"; then
	echo "merge.sh: the branch changes a path with a non-ASCII character, which this disk may read as another path; nothing merged (F164)" >&2
	exit 1
fi
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
# The commit shown, not the branch, which may have moved since; pre-commit checks the mark. A conflict, every merge's ledgers,
# stops the merge: merge.sh commits it itself once it is resolved, so no mark is ever typed by hand, which anyone could
# write for a merge merge.sh never showed (9n's review). A harness file in conflict has no resolution that was shown.
GNOWORLD_MERGE=$tip git merge --no-ff -m "Merge branch '$branch'" "$tip" && exit 0
[ -n "$(git diff --name-only --diff-filter=U)" ] || exit 1
held=$(harness --name-only --diff-filter=U)
if [ -n "$held" ]; then
	git merge --abort
	printf 'merge.sh: these harness files are in conflict, and no resolution of them is what you saw; merge %s into %s first. Nothing merged:\n%s\n' "$onto" "$branch" "$held" >&2
	exit 1
fi
echo "merge.sh: the merge stopped on conflicts outside the harness. Resolve them and stage them, let the gate pass on the result in Claude Code's sandbox, then press Enter here to commit the merge (Ctrl-C leaves it; undo it with git merge --abort)." >&2
while read -r _; do
	GNOWORLD_MERGE=$tip git commit --no-edit && exit 0
	echo "merge.sh: not committed (above); fix it, then press Enter again" >&2
done
echo "merge.sh: nothing committed; the merge waits, undo it with git merge --abort" >&2
exit 1
