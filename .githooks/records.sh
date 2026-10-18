# records.sh: what the sandboxed gate records and the hooks check, defined once (F076). Sourced
# by the hooks and by check.sh; it runs nothing but git. A record is one code print per line, in
# .claude/tmp/green-fast or green-full.
# A tree's code: every file but prose (docs/, adr/, *.md), as scripts/code_changed.sh leaves it out.
code_print() { printf '%s' "$(git ls-tree -r "$1" | grep -v -e '	docs/' -e '	adr/' -e '\.md$')" | git hash-object --stdin; }
# A tree without the review's own files, as scripts/review_pass.py prints it.
review_print() { printf '%s' "$(git ls-tree -r "$1" | grep -v -e '	docs/review-log\.md$' -e '	docs/review-passes\.txt$')" | git hash-object --stdin; }
# Whether a gate recorded $1's code green in one of the files that follow.
green() {
	p=$(code_print "$1") || return 1
	shift
	for f; do grep -qxF "$p" "$f" 2>/dev/null && return 0; done
	return 1
}
# Whether $1 holds a committed review pass for itself.
reviewed() { git show "$1:docs/review-passes.txt" 2>/dev/null | cut -d' ' -f2 | grep -qxF "$(review_print "$1")"; }
