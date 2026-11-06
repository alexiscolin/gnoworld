#!/bin/sh
# merge.sh <branch>: merges a branch into the one checked out (main, or a part's: 9n-3) in Alexis's shell, after showing him
# each harness file the merge changes, with the diff: git writes them before any hook runs, so they are seen here or not at
# all (F129). Installed beside the hooks: sh .git/hooks/merge.sh <branch>
set -eu
. "$(dirname "$0")/records.sh"
cd "$(git rev-parse --show-toplevel)" # the harness's paths are the root's
branch=${1:?usage: sh .git/hooks/merge.sh <branch>}
tip=$(git rev-parse --verify "$branch^{commit}")
onto=$(git symbolic-ref -q --short HEAD) || { echo "merge.sh: check out the branch to merge onto first" >&2; exit 1; }
start=$(git rev-parse --verify HEAD)
[ -z "$(git status --porcelain)" ] || { echo "merge.sh: $onto has uncommitted or untracked files; commit or remove them first" >&2; exit 1; }
if foreign HEAD..."$tip"; then
	echo "merge.sh: the branch changes a path with a non-ASCII character, which this disk may read as another path; nothing merged (F164)" >&2
	exit 1
fi
# .git/info/attributes and .git/info/grafts change how git merges whatever the trees hold, and any session can write them.
rewiring=$(rewired)
[ -z "$rewiring" ] || { printf 'merge.sh: %s changes how git merges, and any session can write it; empty it first. Nothing merged\n' "$rewiring" >&2; exit 1; }
# What the merge does to this branch's harness (records.sh's merge_of), not what the branch changed: a rename on this side
# carries the branch's edit into the harness, a file/directory conflict moves a harness file out of it, and HEAD...tip reads
# one merge base of several (9n's /pre-merge). A harness file in conflict has no resolution that could be shown.
merged=$(merge_of "$tip")
shown_tree=$(printf '%s\n' "$merged" | sed -n 1p)
clash=$(printf '%s\n' "$merged" | sed 1d)
[ -n "$shown_tree" ] || { echo "merge.sh: git cannot merge $branch onto $onto; nothing merged" >&2; exit 1; }
if [ -n "$clash" ]; then
	printf 'merge.sh: these harness files would be in conflict, and no resolution of them is what you saw; merge %s into %s first. Nothing merged:\n%s\n' "$onto" "$branch" "$clash" >&2
	exit 1
fi
changed=$(harness --name-only HEAD "$shown_tree")
if [ -n "$changed" ]; then
	# As text, whatever an attribute or a driver would show instead (F132), and its control bytes
	# made visible: an escape sequence in a file could otherwise hide a line on the screen.
	shown=$(harness --text --no-ext-diff --no-textconv --color=never HEAD "$shown_tree")
	printf '%s\n\nThe harness files this merge changes, shown above:\n%s\n' "$shown" "$changed" | cat -v
	printf 'Type the branch name to merge them: '
	read -r answer
	[ "$answer" = "$branch" ] || { echo "merge.sh: nothing merged" >&2; exit 1; }
fi
# What was committed is the merge shown, or it is undone: the index can be swapped after pre-commit, and HEAD, MERGE_HEAD
# moved, while a hook or the wait below runs (9n's /pre-merge).
kept() {
	[ "$(git rev-parse -q --verify HEAD^1)" = "$start" ] && [ "$(git rev-parse -q --verify HEAD^2)" = "$tip" ] &&
		! git rev-parse -q --verify HEAD^3 >/dev/null && [ -z "$(harness --name-only "$shown_tree" HEAD)" ] && exit 0
	git reset -q --keep "$start"
	echo "merge.sh: the commit made is not the merge you saw (its parents or its harness changed while it was made); undone, $onto is back at $start" >&2
	exit 1
}
# The commit shown, not the branch, which may have moved since; pre-commit checks the mark. A conflict, every merge's ledgers,
# stops the merge: merge.sh commits it itself once it is resolved, so no mark is ever typed by hand, which anyone could
# write for a merge merge.sh never showed (9n's review), and with its own message, not .git/MERGE_MSG, which any session
# can write (9n's /pre-merge).
message="Merge branch '$branch'"
if GNOWORLD_MERGE=$tip git merge --no-ff -m "$message" "$tip"; then
	kept
fi
[ -n "$(git diff --name-only --diff-filter=U)" ] || exit 1
echo "merge.sh: the merge stopped on conflicts outside the harness. Resolve them and stage them, let the gate pass on the result in Claude Code's sandbox, then press Enter here to commit the merge (Ctrl-C leaves it; undo it with git merge --abort)." >&2
while read -r _; do
	if GNOWORLD_MERGE=$tip git commit -m "$message"; then
		kept
	fi
	echo "merge.sh: not committed (above); fix it, then press Enter again" >&2
done
echo "merge.sh: nothing committed; the merge waits, undo it with git merge --abort" >&2
exit 1
