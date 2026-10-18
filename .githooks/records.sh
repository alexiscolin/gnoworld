# records.sh: what the sandboxed gate records and the hooks check, defined once (F076). Sourced
# by the hooks and by check.sh; it runs nothing but git. A record is one code print per line, in
# .claude/tmp/green-fast, or green-full for the full gate, which writes both. Each function runs in
# a subshell, so it leaves no variable behind in the shell that sources this file.
# A tree's code: every file but prose (docs/, adr/, *.md), as scripts/code_changed.sh leaves it
# out; names unquoted, so an accented one is matched as code_changed.sh matches it.
code_print() ( printf '%s' "$(git -c core.quotePath=false ls-tree -r "$1" | grep -v -e '	docs/' -e '	adr/' -e '\.md$')" | git hash-object --stdin )
# The working tree's code print, untracked files included, read through a throwaway index.
worktree_print() (
	set -e
	dir=$(mktemp -d "${TMPDIR:-/tmp}/records.XXXXXX")
	tree=$(GIT_INDEX_FILE="$dir/index" git add -A && GIT_INDEX_FILE="$dir/index" git write-tree)
	rm -r "$dir"
	code_print "$tree"
)
# A tree without the review's own files, as scripts/review_pass.py prints it.
review_print() ( printf '%s' "$(git ls-tree -r "$1" | grep -v -e '	docs/review-log\.md$' -e '	docs/review-passes\.txt$')" | git hash-object --stdin )
# Appends the print $1 to the record $2 (fast or full), once.
put() ( mkdir -p .claude/tmp && { grep -qxF "$1" ".claude/tmp/green-$2" 2>/dev/null || printf '%s\n' "$1" >>".claude/tmp/green-$2"; } )
# A gate passed on the code printed $1, the full gate when $2 is true: recorded, unless that code
# changed while the gate ran.
gate_passed() (
	if [ "$(worktree_print)" != "$1" ]; then
		echo "records: the code changed while the gate ran; nothing recorded" >&2
		exit 0
	fi
	put "$1" fast
	[ "$2" != true ] || put "$1" full
)
# Whether a gate recorded the code of $1 in the record $2 (fast or full).
green() ( grep -qxF "$(code_print "$1")" ".claude/tmp/green-$2" 2>/dev/null )
# Whether $1 holds a committed review pass for itself.
reviewed() ( git show "$1:docs/review-passes.txt" 2>/dev/null | cut -d' ' -f2 | grep -qxF "$(review_print "$1")" )
