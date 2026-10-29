#!/bin/sh
# worktree.sh <dir> <branch> <base>: a worktree of a new branch, ready for the gate, made from the tree it runs in,
# whose packages are installed, and whose package files (lockfile, package.json) base must share: an install in the new tree
# would write into this one's. Its root node_modules is a real folder of links, one per package: a whole-folder link
# hides them from borrow_node_modules.sh, so pre-commit's staged copy would find none. A workspace's node_modules is
# copied as its links by borrow_node_modules.sh, so its @gnoworld links (relative) lead into the new tree, never this one's. Vite's caches are its
# own, each tree writing them. StrykerJS's incremental file is the one the gate's every run shares (check.sh).
set -eu
[ $# = 3 ] || { echo "usage: sh scripts/worktree.sh <dir> <branch> <base>" >&2; exit 2; }
dir=$1 branch=$2 base=$3
# An argument that starts with - is an option for git, never a name (a base `--output=<file>` made git diff truncate a file), and
# every check is made before the tree is: what the script cannot undo is not begun (CR6).
for arg in "$dir" "$branch" "$base"; do
	case $arg in -*) echo "worktree.sh: $arg starts with -, which git would read as an option" >&2; exit 2 ;; esac
done
[ ! -e "$dir" ] || { echo "worktree.sh: $dir exists; name a new folder" >&2; exit 1; }
git rev-parse --verify --quiet "$base^{commit}" >/dev/null || { echo "worktree.sh: $base is no commit" >&2; exit 1; }
src=$(pwd -P)
# The root's node_modules is taken apart below, which a link to a folder (borrow_node_modules.sh skips it) cannot be.
[ -d "$src/node_modules" ] && [ ! -L "$src/node_modules" ] || { echo "worktree.sh: $src/node_modules is a link or missing; it must be the real folder of this tree's installed packages" >&2; exit 1; }
# The packages linked below are this tree's, whose lockfile and package files its install follows: a base with others would
# run the gate on packages its own lockfile does not name, and a `pnpm install` in the new tree would write into this tree's
# install (the links lead there), so a base whose package files differ from this tree's is refused (security-S5).
differ=$(git diff --name-only "$base" -- pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs .pnpmfile.mjs .npmrc ':(glob)**/package.json') # a base git cannot read stops here
[ -z "$differ" ] || {
	echo "worktree.sh: $base's package files are not this tree's, whose installed packages the new tree would link; install them here first, or make the tree by hand: $(echo "$differ" | tr '\n' ' ')" >&2
	exit 1
}
git worktree add -q -b "$branch" "$dir" "$base"
# From here a failure undoes the tree and its branch, so the next run can name the same folder; `finished` tells a run that
# reached its end from one that died on the way (bash 3.2's EXIT trap exits 0 after an unbound variable, as in check.sh).
trap 'status=$?; { [ "$status" = 0 ] && [ "${finished:-}" = 1 ]; } || { git worktree remove --force "$dir" >/dev/null 2>&1; git branch -D -q "$branch" >/dev/null 2>&1; }; [ "$status" != 0 ] || [ "${finished:-}" = 1 ] || status=1; exit "$status"' EXIT
trap 'exit 1' HUP INT TERM
# The workspaces' node_modules are copied as their links by the helper pre-commit's staged copy uses; its link of the root's
# is replaced by the folder of per-package links below.
sh "$(dirname "$0")/borrow_node_modules.sh" "$dir"
rm "${dir:?}/node_modules"
mkdir "$dir/node_modules" "$dir/node_modules/.vite" "$dir/node_modules/.vite-temp"
for entry in "$src"/node_modules/* "$src"/node_modules/.[!.]*; do
	name=${entry##*/}
	case $name in .vite | .vite-temp | '*' | '.[!.]*') continue ;; esac
	if [ -L "$entry" ]; then cp -P "$entry" "$dir/node_modules/$name"; else ln -s "$entry" "$dir/node_modules/$name"; fi
done
echo "worktree.sh: $dir on $branch, from $base, its packages linked from $src"
finished=1
