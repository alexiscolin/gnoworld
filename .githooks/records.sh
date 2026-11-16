# records.sh: the harness list, and the check of a path this disk may fold, defined once: sourced by pre-commit, worktree.sh and
# GitHub's detector (scripts/ci_changes.sh, the base's copy), read by guard.py. It runs nothing but git, and python3 for `folded`. Each function runs in a
# subshell, so it leaves no variable behind in the shell that sources this file.
# Git shows each object itself, whatever a replace ref would show instead.
export GIT_NO_REPLACE_OBJECTS=1
# The harness: the files that make the gate and Claude's limits, or that run at the owner's install
# or in Claude Code outside the sandbox. None is committed from the sandbox (pre-commit),
# GitHub's gate runs the harness's own tests when one changes, and the night mutates them (harness_mutate.py).
# Case-blind, as this disk is: Scripts/guard.py is scripts/guard.py there, and read as globs whatever a caller's
# GIT_*_PATHSPECS say (one let a commit's hook read its * as a name). $@: git diff's options and commits.
harness() ( env -u GIT_NOGLOB_PATHSPECS -u GIT_GLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS GIT_ICASE_PATHSPECS=1 git -c core.quotePath=false diff "$@" -- scripts .githooks .github .claude CLAUDE.md .mcp.json package.json app/package.json server/package.json server/tsconfig.json \
	jarvis/package.json jarvis/tsconfig.json link-reader/package.json link-reader/tsconfig.json 'packages/*/package.json' 'packages/*/tsconfig.json' pnpm-workspace.yaml pnpm-lock.yaml .pnpmfile.cjs .pnpmfile.mjs evals/package.json evals/pnpm-workspace.yaml \
	evals/pnpm-lock.yaml evals/tsconfig.json evals/.pnpmfile.cjs evals/.pnpmfile.mjs .node-version .nvmrc .npmrc '*.config.ts' tsconfig.json \
	tsconfig.base.json app/tsconfig.json stryker.config.json stryker.all.config.json '*.gitattributes' knip.json .jscpd.json .prettierrc.json .prettierignore .gitignore app/tests/stories/pictures.spec.ts deploy/test.sh )
# The paths of a tree this disk may read as another (git's `$@` lists them NUL-separated: ls-files -z for the index, ls-tree -r -z
# --name-only HEAD for a commit): a byte outside ASCII (the disk folds more letters than git can match: ſ is s on APFS), or a folder or
# file name equal but for case to another (Packages/evil/package.json lands as packages/evil/, a workspace pnpm installs). Prints one
# line a finding and exits 1; exits 2 when git cannot list them, which the caller refuses as it refuses a finding. The one check of
# pre-commit and of GitHub's detector. python3 is read from the PATH, as the hooks read git.
folded() ( python3 -I -c '
import subprocess, sys
listing = subprocess.run(["git", "-c", "core.quotePath=false"] + sys.argv[1:], capture_output=True)
if listing.returncode:
    sys.exit(2)
seen, found = {}, []
for p in [p for p in listing.stdout.split(b"\0") if p]:
    if any(b > 0x7e for b in p):
        found.append("a byte outside ASCII: " + p.decode("utf-8", "backslashreplace"))
    parts = p.split(b"/")
    for i in range(1, len(parts) + 1):
        seen.setdefault(b"/".join(parts[:i]).lower(), set()).add(b"/".join(parts[:i]))
for names in seen.values():
    if len(names) > 1:
        found.append("names equal but for case: " + " and ".join(sorted(n.decode("utf-8", "backslashreplace") for n in names)))
print("\n".join(found))
sys.exit(1 if found else 0)
' "$@" )
