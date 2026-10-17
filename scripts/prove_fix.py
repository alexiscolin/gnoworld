"""prove_fix.py: a fix proves it fixed something (CLAUDE.md, "No regression").

For each `fix` commit of the branch that changes product code (packages, gno, app, admin,
server), the tests it adds or changes must fail on the commit before it: run there, they
show the bug; run on the fix, the gate already saw them pass. A test that passes before the
fix reproduces nothing, and the fix is refused. A fix with no test is refused, unless its
message says why on a line `No-test: <why>`, which Alexis reads in review. A fix of the
harness alone is left to scripts/harness_mutate.py, which proves each guard is watched.
Usage: prove_fix.py <base>, from the repository root (check.sh --full)."""
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import git, worktree

PRODUCT = ("packages/", "gno/", "app/", "admin/", "server/")
TEST = re.compile(r"(\.test\.tsx?|_test\.gno|_filetest\.gno|_test\.go)$")
# The command per kind of test, run from the worktree's root; tests override them (test_hooks.sh).
VITEST = os.environ.get("PROVE_FIX_VITEST", "node_modules/.bin/vitest run")
GNO_TEST = os.environ.get("PROVE_FIX_GNO", f"{os.environ.get('GNO', 'gno')} test")
GO_TEST = os.environ.get("PROVE_FIX_GO", "go test")


def runs(tests):
    """The commands that run these test files, each with the folder it runs in."""
    vitest = [t for t in tests if t.endswith((".test.ts", ".test.tsx"))]
    gno = sorted({os.path.relpath(os.path.dirname(t), "gno") for t in tests if t.endswith(".gno")})
    go = sorted({os.path.relpath(os.path.dirname(t), "gno") for t in tests if t.endswith("_test.go")})
    out = [(".", f"{VITEST} {' '.join(vitest)}")] if vitest else []
    out += [("gno", f"{GNO_TEST} {' '.join('./' + d for d in gno)}")] if gno else []
    out += [("gno", f"{GO_TEST} {' '.join('./' + d for d in go)}")] if go else []
    return out


def fails_before(commit, tests):
    """Whether the commit's tests fail on its parent: a worktree of the parent, with only them added."""
    with worktree(f"{commit}^") as tree:
        git("-C", tree, "checkout", commit, "--", *tests)
        return all(subprocess.run(cmd, shell=True, cwd=os.path.join(tree, folder), capture_output=True).returncode != 0
                   for folder, cmd in runs(tests))


def verdict(commit):
    """None when the commit is not a product fix or proves itself; otherwise what is wrong."""
    message = git("log", "-1", "--format=%B", commit)
    if not re.match(r"fix(\(.+?\))?!?:", message):
        return None
    files = git("diff-tree", "--no-commit-id", "--name-only", "-r", "--diff-filter=AM", commit).splitlines()
    product = [f for f in files if f.startswith(PRODUCT)]
    tests = [f for f in product if TEST.search(f)]
    if not product:
        return None
    if not tests:
        return None if re.search(r"^No-test: \S", message, re.M) else "a fix with no test that reproduces the bug (or a `No-test: <why>` line)"
    return None if fails_before(commit, tests) else f"its tests pass before the fix, so they reproduce nothing: {', '.join(tests)}"


base = sys.argv[1]
problems = [f"{c[:7]} {git('log', '-1', '--format=%s', c).strip()}: {why}"
            for c in git("rev-list", "--no-merges", "--reverse", f"{base}..HEAD").split() if (why := verdict(c))]
if problems:
    print("prove_fix: a fix must come with a test that fails without it:", *problems, sep="\n  ", file=sys.stderr)
    sys.exit(1)
print("prove_fix: every product fix comes with a test that failed before it")
