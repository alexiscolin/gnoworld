#!/bin/sh
# worktree.sh <dir> <branch> <base>: a worktree of a new branch, ready for the gate, made from the tree it runs in,
# whose packages are installed, and whose package files (lockfile, package.json) base must share: an install in the new tree
# would write into this one's. Its root node_modules is a real folder of links, one per package: a whole-folder link
# hides them from borrow_node_modules.sh, so pre-commit's staged copy would find none. A workspace's node_modules is
# copied as its links by borrow_node_modules.sh, so its @gnoworld links (relative) lead into the new tree, never this one's. Vite's caches are its
# own, each tree writing them.
# worktree.sh remove <dir>: removes, from another tree, a worktree that holds no change, staged or untracked file, and keeps its
# branch.
set -eu
# A bare <dir> is a folder of the root (below), so `remove` names no tree.
case $#:${1-} in
2:remove) action=remove dir=$2 branch= base= ;;
3:remove) action= ;;
3:*) action=add dir=$1 branch=$2 base=$3 ;;
*) action= ;;
esac
[ -n "$action" ] || { printf 'usage: sh scripts/worktree.sh <dir> <branch> <base>\n   or: sh scripts/worktree.sh remove <dir>\n' >&2; exit 2; }
# An argument that starts with - is an option for git, never a name (a base `--output=<file>` made git diff truncate a file), and
# every check is made before the tree is: what the script cannot undo is not begun (CR6).
for arg in "$dir" "$branch" "$base"; do
	case $arg in -*) echo "worktree.sh: $arg starts with -, which git would read as an option" >&2; exit 2 ;; esac
done
# It may run outside the sandbox (F5058): it makes and removes the folders of one root alone, in this user's home, where no
# session's shell writes but its own folder (Alexis, 2026-11-04; the file tools still can, F5095), and which no argument moves. The folder's parent is resolved, so a
# `..`, a link on the way or another path is refused, and compared with the root as written, never resolved; the name's letters
# are spelled out, as sh's [a-z] takes a capital or an accented letter in a UTF-8 locale (bash 3.2). The folder is then named by
# that resolved path, so no trailing slash or `..` hides a link from the checks below, nor the tree this runs in: a link named as
# the folder is refused, as git makes the branch before failing on one, and removes the tree a link leads to, wherever it is.
root=$HOME/Server/gnoworld-wt
case $dir in */*) ;; *) dir=$root/$dir ;; esac # a bare name is a folder of the root
name=$(basename "$dir")
parent=$(cd "$(dirname "$dir")" 2>/dev/null && pwd -P) || parent=
case $name in *[!abcdefghijklmnopqrstuvwxyz0123456789-]*) parent= ;; esac
[ "$parent" = "$root" ] || { echo "worktree.sh: $dir is not $root/<name>, <name> in a-z, 0-9 and -, once resolved" >&2; exit 1; }
dir=$root/$name
[ ! -L "$dir" ] || { echo "worktree.sh: $dir is a link; name the folder itself" >&2; exit 1; }
# A caller's git folders are never this run's: a work tree, an index or an object folder of another place (7w3, T9).
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY
src=$(pwd -P)
# Every git below, and every git it starts in another tree, reads this tree's common folder and so its config, never one a
# commondir names: Claude Code denies writing a commondir only for the trees that stood when the session started, and outside
# the sandbox an fsmonitor of another config would run (F5097). That folder is found from the .git of the tree this runs at the
# root of, which the settings deny every session: the main checkout's folder, or a worktree's file naming <common>/worktrees/<id>.
if [ -d "$src/.git" ]; then
	GIT_COMMON_DIR=$src/.git
else
	gitdir=$(sed -n 's/^gitdir: //p' "$src/.git")
	GIT_COMMON_DIR=$(cd "$src" && cd "$gitdir/../.." && pwd -P)
fi
export GIT_COMMON_DIR
# Nor a hook or an fsmonitor of that folder, whose .git/hooks and config the file tools can still write (F5095): a post-checkout
# hook ran as the tree was made, an fsmonitor as the base was compared (security-reviewer, third review).
GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null GIT_CONFIG_KEY_1=core.fsmonitor GIT_CONFIG_VALUE_1=false
export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 GIT_CONFIG_KEY_1 GIT_CONFIG_VALUE_1
if [ "$action" = remove ]; then
	# Never the tree this runs in, however it was entered: its removal would leave the run in no folder. Only a clean tree, by a
	# check that enters no nested repository: git's own ran git status in one its index staged at that moment, which the tree's
	# session can flip between git's two reads (security-reviewer, third review). Then git removes a worktree of this repository,
	# its ignored files and its own record with it, never what a link in it leads to; a change made since is the tree's own loss.
	# No other record is pruned: a session can point another tree's at nothing (reviewer, second review); Alexis prunes by hand.
	case $src/ in "$dir"/*) echo "worktree.sh: $dir is the tree this runs in; remove it from another" >&2; exit 1 ;; esac
	changes=$(git -C "$dir" status --porcelain --ignore-submodules=all)
	[ -z "$changes" ] || { echo "worktree.sh: $dir holds a change, a staged or an untracked file; commit or delete it first: $(echo "$changes" | tr '\n' ' ')" >&2; exit 1; }
	git worktree remove --force "$dir"
	echo "worktree.sh: $dir removed, its branch kept"
	exit 0
fi
[ ! -e "$dir" ] || { echo "worktree.sh: $dir exists; name a new folder" >&2; exit 1; }
git rev-parse --verify --quiet "$base^{commit}" >/dev/null || { echo "worktree.sh: $base is no commit" >&2; exit 1; }
# The root's node_modules is taken apart below, which a link to a folder (borrow_node_modules.sh skips it) cannot be.
[ -d "$src/node_modules" ] && [ ! -L "$src/node_modules" ] || { echo "worktree.sh: $src/node_modules is a link or missing; it must be the real folder of this tree's installed packages" >&2; exit 1; }
# The packages linked below are this tree's, whose lockfile and package files its install follows: a base with others would
# run the gate on packages its own lockfile does not name, and a `pnpm install` in the new tree would write into this tree's
# install (the links lead there), so a base whose package files differ from this tree's is refused (security-S5). So is one
# whose harness differs (records.sh's list, the package files in it): out of the sandbox, a base a session wrote by plumbing
# would check its own settings, hooks and CLAUDE.md out into a tree a session is later started in (F5098). No nested repository
# is entered: git would run it with its own config (F5097).
. "$(dirname "$0")/../.githooks/records.sh"
differ=$(harness --ignore-submodules=all --name-only "$base" && git diff --name-only "$base" -- CLAUDE.md) # a base git cannot read stops here
[ -z "$differ" ] || {
	echo "worktree.sh: $base's harness or package files are not this tree's, whose installed packages the new tree would link; install them here first, or make the tree by hand: $(echo "$differ" | tr '\n' ' ')" >&2
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
