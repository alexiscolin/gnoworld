#!/bin/sh
# worktree.sh <dir> <branch> <base>: a worktree of a new branch, ready for the gate, made from the tree it runs in,
# whose packages are installed. Its root node_modules is a real folder of links, one per package: a whole-folder link
# hides them from borrow_node_modules.sh, so pre-commit's staged copy would find none. A workspace's node_modules is
# copied as its links, so its @gnoworld links (relative) lead into the new tree, never this one's. Vite's caches are its
# own, each tree writing them. StrykerJS's incremental file is seeded: a missing one ran all 9,045 mutants
# (2026-10-26) where the branch's changes wanted a few dozen.
set -eu
[ $# = 3 ] || { echo "usage: sh scripts/worktree.sh <dir> <branch> <base>" >&2; exit 2; }
dir=$1 branch=$2 base=$3
[ ! -e "$dir" ] || { echo "worktree.sh: $dir exists; name a new folder" >&2; exit 1; }
src=$(pwd -P)
git worktree add -q -b "$branch" "$dir" "$base"
mkdir "$dir/node_modules" "$dir/node_modules/.vite" "$dir/node_modules/.vite-temp"
for entry in "$src"/node_modules/* "$src"/node_modules/.[!.]*; do
	name=${entry##*/}
	case $name in .vite | .vite-temp | '*' | '.[!.]*') continue ;; esac
	if [ -L "$entry" ]; then cp -P "$entry" "$dir/node_modules/$name"; else ln -s "$entry" "$dir/node_modules/$name"; fi
done
find . -name node_modules -type d -prune -not -path ./node_modules -not -path './.git/*' -not -path './.claude/*' | while read -r m; do
	mkdir -p "$dir/$(dirname "$m")"
	cp -RP "$m" "$dir/$m"
done
if [ -f reports/stryker-incremental.json ]; then
	mkdir -p "$dir/reports"
	cp reports/stryker-incremental.json "$dir/reports/"
fi
echo "worktree.sh: $dir on $branch, from $base, its packages linked from $src"
