#!/bin/sh
# ship.sh [--why "<why the harness changed>"] [--lenses "<the agents that ran>"]: the one command that takes a committed branch to the
# merge Alexis runs (the speed plan, 2026-11-06). In Claude Code's sandbox, from the branch's worktree, committed and clean:
#   1. the check that fits the change: `check.sh --merge` when a tier-1 path (docs/REVIEW.md) or a harness file (records.sh's list)
#      changed since main (the slim full gate, the harness's probe, hooks and changed mutants, StrykerJS on the changed tier-1 lines),
#      else `check.sh --full` (a design round: the types, the lint, the tests, the tier-1 and smoke journeys, the secrets, the audit);
#      both record the full gate, which pre-push wants;
#   2. the review pass (review_pass.py), for the tree that was checked;
#   3. a row in docs/review-log.md, and the `Harness-changed: <path> - <why>` line of each harness file (pre-push wants them);
#   4. a commit of docs/review-log.md and docs/review-passes.txt alone, which keeps the pass valid;
#   5. Alexis's merge and push commands, printed. It merges, pushes and installs nothing.
set -eu
cd "$(realpath "$(dirname "$0")/..")"
. .githooks/records.sh
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE
why= lenses="none (a design round, Alexis reads it live)"
while [ $# -gt 0 ]; do
	case $1 in
	--why) why=${2:?--why wants the reason} && shift 2 ;;
	--lenses) lenses=${2:?--lenses wants the agent names} && shift 2 ;;
	*) echo "usage: sh scripts/ship.sh [--why <why>] [--lenses <agents>]" >&2 && exit 1 ;;
	esac
done
branch=$(git symbolic-ref -q --short HEAD) || { echo "ship.sh: no branch checked out" >&2; exit 1; }
[ "$branch" != main ] || { echo "ship.sh: on main; ship a branch" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "ship.sh: commit or remove what is uncommitted first: the check judges the commit" >&2; exit 1; }
base=$(git merge-base HEAD origin/main) || { echo "ship.sh: no origin/main to compare with (git fetch)" >&2; exit 1; }
harness_files=$(harness --name-only "$base" HEAD)
tier1=$(git -c core.quotePath=false diff --no-renames --name-only "$base" HEAD | python3 -I scripts/speeds.py --tier1 "$PWD")
if [ -n "$harness_files" ] && [ -z "$why" ]; then
	echo "ship.sh: harness files changed, so --why \"<why>\" is wanted for their Harness-changed lines:" >&2
	printf '%s\n' "$harness_files" >&2
	exit 1
fi
check=--full
{ [ "$tier1" = tier1 ] || [ -n "$harness_files" ]; } && check=--merge
echo "ship.sh: $branch: tier-1 path: $tier1, harness files: $(printf '%s\n' "$harness_files" | grep -c . || :); running check.sh $check"
started=$(date +%s)
sh scripts/check.sh $check </dev/null
took=$(($(date +%s) - started))
python3 -I scripts/review_pass.py record HEAD "$lenses; check.sh $check, ${took} s"
row="| $(date +%F) | $branch (ship.sh: check.sh $check, $lenses) | - | - | - | - | - | check ${took} s |"
last=$(grep -n '^| 20' docs/review-log.md | tail -1 | cut -d: -f1)
awk -v n="$last" -v row="$row" 'NR == n { print; print row; next } { print }' docs/review-log.md >docs/review-log.md.new && mv docs/review-log.md.new docs/review-log.md
lines=$(printf '%s\n' "$harness_files" | while IFS= read -r f; do [ -z "$f" ] || printf 'Harness-changed: %s - %s\n' "$f" "$why"; done)
git add docs/review-log.md docs/review-passes.txt
git commit -q -m "docs(review): ship $branch" -m "${lines:-No harness file changed.}"
main_dir=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
echo "ship.sh: done in ${took} s of checks, pass recorded, committed. Alexis, from a shell outside Claude Code:"
echo "  cd $main_dir && git checkout main && sh .git/hooks/merge.sh $branch"
[ -z "$harness_files" ] || echo "  git --no-replace-objects show main:scripts/install_hooks.sh | sh   # the hooks changed: before the push"
echo "  git push origin main"
