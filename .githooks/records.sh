# records.sh: the harness list, and the check of a path this disk may fold, defined once: sourced by pre-commit, worktree.sh and
# GitHub's detector (scripts/ci_changes.sh, the base's copy), read by guard.py. It runs nothing but git. Each function runs in a
# subshell, so it leaves no variable behind in the shell that sources this file.
# Git shows each object itself, whatever a replace ref would show instead (F132).
export GIT_NO_REPLACE_OBJECTS=1
# The harness: the files that make the gate and Claude's limits, or that run at Alexis's install
# or in Claude Code outside the sandbox. None is committed from the sandbox (pre-commit, D241),
# GitHub's gate runs the harness's own tests when one changes, and the night mutates them (harness_mutate.py).
# Case-blind, as this disk is: Scripts/guard.py is scripts/guard.py there (F151), and read as globs whatever a caller's
# GIT_*_PATHSPECS say (one let a commit's hook read its * as a name, 9j's review). $@: git diff's options and commits.
harness() ( env -u GIT_NOGLOB_PATHSPECS -u GIT_GLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS GIT_ICASE_PATHSPECS=1 git -c core.quotePath=false diff "$@" -- scripts .githooks .github .claude .mcp.json package.json app/package.json server/package.json server/tsconfig.json \
	jarvis/package.json jarvis/tsconfig.json 'packages/*/package.json' 'packages/*/tsconfig.json' pnpm-workspace.yaml pnpm-lock.yaml .pnpmfile.cjs .pnpmfile.mjs .node-version .nvmrc .npmrc '*.config.ts' tsconfig.json \
	tsconfig.base.json app/tsconfig.json stryker.config.json knip.json .jscpd.json .prettierrc.json .prettierignore .gitignore app/tests/stories/pictures.spec.ts deploy/test.sh )
# Whether the change $@ (git diff's options and commits) holds a path with a non-ASCII byte: the
# disk folds more letters than git can match (ſ is s on APFS), so no list names them (F164).
# A git that fails answers yes.
foreign() (
	paths=$(git -c core.quotePath=false diff --name-only "$@") || exit 0
	printf '%s\n' "$paths" | LC_ALL=C grep -q '[^ -~]'
)
