#!/bin/sh
# dream_due.sh: Claude Code's SessionStart hook. It says a dream is due when main has a merge no dream has covered (the dream of
# 2026-11-01, item 15 of slice 7's answers): the last `The dream of <sha>` row of docs/review-log.md, which /dream's step 5 writes, names the
# commit the dream looked at, and a dream is due when main has a merge after it. A row lands on the next slice's branch, and reaches main only
# with the next merge, itself past the sha (F4063): so the committed rows of the branches main has not got count too, and only add to what is covered.
# It runs outside the sandbox, as stop_gate.sh does, so it runs no code a sandboxed command could have written: git, read-only, and text
# tools; no gate, no file of the repository run or sourced. It reads committed rows alone, never the work tree (the file on disk is a branch's,
# or a session's), and blocks no session: it always ends 0. A read that fails says it could not tell, never stays silent.
# The sha comes from a file a session may have changed: it is used only when it is 7 to 40 hexadecimal digits, so it can be nothing git
# reads as an option or a command, and only as a commit that main contains.
dir=${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}
export GIT_OPTIONAL_LOCKS=0 # a read that takes no lock and writes no index

cannot() { # $1: why
	echo "dream_due: could not tell whether a dream was run after main's last merge ($1)"
	exit 0
}
git -C "$dir" rev-parse --git-dir >/dev/null 2>&1 || cannot "not a repository"
git -C "$dir" rev-parse --verify --quiet "refs/heads/main^{commit}" >/dev/null 2>&1 || cannot "no branch main"
log=$(git -C "$dir" show "refs/heads/main:docs/review-log.md" 2>/dev/null) || cannot "no docs/review-log.md on main"
refs=$(git -C "$dir" for-each-ref --no-merged=refs/heads/main --format='%(refname)' refs/heads 2>/dev/null) || cannot "git could not list the branches"

# The shas of the last rows (the last 20), the newest row's first: a row older than an earlier one covers nothing more.
rows=$(printf '%s\n' "$log" | sed -n 's/.*The dream of \([^ ]*\).*/\1/p' | tail -n 20)
# A branch's last rows, read as committed. With no ref, `:docs/review-log.md` would be the index's file.
others=$(printf '%s\n' "$refs" | while IFS= read -r ref; do
	[ -n "$ref" ] || continue
	git -C "$dir" show "$ref:docs/review-log.md" 2>/dev/null | sed -n 's/.*The dream of \([^ ]*\).*/\1/p' | tail -n 20
done | sort -u)
# Read a line at a time, never split by the shell (a word with a * in it would name the files of the folder), and through a pipe: no temporary file.
known=$(printf '%s\n%s\n' "$rows" "$others" | while IFS= read -r sha; do
	printf '%s\n' "$sha" | grep -Eqx '[0-9a-f]{7,40}' || continue
	oid=$(git -C "$dir" rev-parse --verify --quiet "$sha^{commit}" 2>/dev/null) || continue
	git -C "$dir" merge-base --is-ancestor "$oid" "refs/heads/main" 2>/dev/null || continue
	printf ' %s' "$oid"
done)
last=$(printf '%s\n' "$rows" | tail -n 1)
if [ -n "$last" ]; then
	printf '%s\n' "$last" | grep -Eqx '[0-9a-f]{7,40}' || cannot "the last dream's row names no commit"
	oid=$(git -C "$dir" rev-parse --verify --quiet "$last^{commit}" 2>/dev/null) || cannot "the last dream's commit is unknown here"
	git -C "$dir" merge-base --is-ancestor "$oid" "refs/heads/main" 2>/dev/null || cannot "the last dream's commit is not on main"
fi
# shellcheck disable=SC2086 # known holds object names, hexadecimal digits and spaces alone
count=$(git -C "$dir" rev-list --merges --count "refs/heads/main" --not $known 2>/dev/null) || cannot "git could not count main's merges"
[ "$count" -gt 0 ] 2>/dev/null || exit 0
if [ -n "$last" ]; then
	echo "A dream is due: main has $count merge(s) no dream has covered, the last dream being that of $last. Run /dream before the next slice."
else
	echo "A dream is due: main has $count merge(s) and docs/review-log.md records no dream. Run /dream before the next slice."
fi
exit 0
