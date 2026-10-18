#!/bin/sh
# install_hooks.sh [--check] [<commit>]: puts the hooks of <commit>, main by default, and the
# scripts they run in git's own hooks folder, where no merge, checkout or command in Claude
# Code's sandbox writes: no branch brings its own into Alexis's shell (F129). He runs main's
# copy, never the working tree's: git show main:scripts/install_hooks.sh | sh
# --check writes nothing, and fails unless the folder holds exactly those files.
set -eu
check=false
if [ "${1:-}" = --check ]; then
	check=true
	shift
fi
ref=${1:-main}
hooks="$(git rev-parse --path-format=absolute --git-common-dir)/hooks"
for hook in commit-msg pre-commit pre-merge-commit pre-push; do # without one, git checks nothing there
	git cat-file -e "$ref:.githooks/$hook" 2>/dev/null || { echo "install_hooks: $ref has no .githooks/$hook" >&2; exit 1; }
done
files=$(git ls-tree --full-tree -r --name-only "$ref" -- .githooks scripts/install_hooks.sh scripts/scan_secrets.sh scripts/code_changed.sh \
	scripts/gitleaks.toml scripts/gitleaks-private.toml scripts/.gitleaksignore)
names=$(printf '%s\n' "$files" | sed 's|.*/||')
twice=$(printf '%s\n' "$names" | sort | uniq -d)
[ -z "$twice" ] || { echo "install_hooks: $ref holds two files named $twice, one of which would replace the other" >&2; exit 1; }
$check || mkdir -p "$hooks"
# Any other file there but git's samples could run as a hook.
others=$(ls -A "$hooks" | grep -v '\.sample$' | grep -vxF "$names" || :)
if $check; then
	[ -z "$others" ] || { echo "install_hooks: $hooks holds $others, which $ref does not" >&2; exit 1; }
	for f in $files; do
		to="$hooks/${f##*/}"
		# A link, which a checkout could change, or a hook git would skip, is not the commit's.
		[ ! -L "$to" ] && [ -x "$to" ] && git show "$ref:$f" | cmp -s - "$to" || {
			echo "install_hooks: $to is not $ref's $f; install the hooks: git show main:scripts/install_hooks.sh | sh" >&2
			exit 1
		}
	done
	exit 0
fi
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
