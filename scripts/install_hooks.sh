#!/bin/sh
# install_hooks.sh [<commit>]: puts the hooks of <commit>, main by default, and the scripts they run in git's own hooks folder,
# where no merge, checkout or command in Claude Code's sandbox writes: no branch brings its own into Alexis's shell (F129). He
# runs main's copy, never the working tree's, and the object itself, whatever a replace ref would show:
# git --no-replace-objects show main:scripts/install_hooks.sh | sh
set -eu
export GIT_NO_REPLACE_OBJECTS=1 # the commit's own bytes, whatever a replace ref shows (F132)
# The commit, read once: a ref moved while this runs (a session can move a work branch's) changes nothing it writes (L3).
ref=$(git rev-parse --verify --quiet "${1:-main}^{commit}") || { echo "install_hooks: ${1:-main} is no commit" >&2; exit 1; }
hooks="$(git rev-parse --path-format=absolute --git-common-dir)/hooks"
for hook in commit-msg pre-commit pre-merge-commit pre-push; do # without one, git checks nothing there
	git cat-file -e "$ref:.githooks/$hook" 2>/dev/null || { echo "install_hooks: $ref has no .githooks/$hook" >&2; exit 1; }
done
files=$(git ls-tree --full-tree -r --name-only "$ref" -- .githooks scripts/scan_secrets.sh scripts/gitleaks.toml \
	scripts/gitleaks-private.toml scripts/.gitleaksignore)
names=$(printf '%s\n' "$files" | sed 's|.*/||')
twice=$(printf '%s\n' "$names" | sort | uniq -d)
[ -z "$twice" ] || { echo "install_hooks: $ref holds two files named $twice, one of which would replace the other" >&2; exit 1; }
mkdir -p "$hooks"
# Any other file there but git's samples could run as a hook, or is left from an older install (D13173).
others=$(ls -A "$hooks" | grep -v '\.sample$' | grep -vxF "$names" || :)
printf '%s\n' "$others" | while IFS= read -r f; do [ -z "$f" ] || rm -rf -- "${hooks:?}/$f"; done
for f in $files; do
	to="$hooks/${f##*/}"
	rm -f "$to" # a link there would take the write elsewhere
	git show "$ref:$f" >"$to"
	chmod 755 "$to"
done
git config --unset-all core.hooksPath || [ $? = 5 ] # 5: none was set
# A merge then always makes a commit, which pre-merge-commit checks; a fast-forward runs no hook.
# A pull stays a fast-forward of the remote's main.
git config merge.ff false
git config pull.ff only
[ "$(git rev-parse --path-format=absolute --git-path hooks)" = "$hooks" ] || {
	echo "install_hooks: git still takes its hooks from $(git rev-parse --git-path hooks), set in a config this cannot change; remove it there" >&2
	exit 1
}
