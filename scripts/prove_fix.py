"""prove_fix.py: a fix proves it fixed something (CLAUDE.md, "No regression").

For each `fix` commit of the branch that changes product code (packages, gno, app, admin,
server), the tests it adds or changes must fail on the commit before it: run there, they
show the bug; run on the fix, the gate already saw them pass. A test that passes before the
fix reproduces nothing, and the fix is refused. A fix with no test is refused, unless its
message says why on a line `No-test: <why>`, which Alexis reads in review. A merged fix whose message cannot change
is excused by a line `No-test: <short sha> - <why>` on any later commit of the range. A fix of the
harness alone is left to scripts/harness_mutate.py, which proves each guard is watched, and one
of tests alone changes no product code, so it has nothing to prove.
Usage: prove_fix.py <base>, from the repository root (check.sh --full)."""
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import git, worktree

PRODUCT = ("packages/", "gno/", "app/", "admin/", "server/")
TEST = re.compile(r"(\.test\.tsx?|\.spec\.ts|_test\.gno|_filetest\.gno|_test\.go)$")
# The journeys' folder: their helpers are tests too, so a fix of them alone changes no product code.
JOURNEYS = "app/tests/"
# The harness's list, one for every script (.githooks/records.sh).
RECORDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".githooks", "records.sh")
# The command per kind of test, run from the worktree's root; tests override them (test_hooks.sh).
VITEST = os.environ.get("PROVE_FIX_VITEST", "node_modules/.bin/vitest run")
PLAYWRIGHT = os.environ.get("PROVE_FIX_PLAYWRIGHT", "node app/node_modules/@playwright/test/cli.js test")
GNO_TEST = os.environ.get("PROVE_FIX_GNO", f"{os.environ.get('GNO', 'gno')} test")
GO_TEST = os.environ.get("PROVE_FIX_GO", "go test")
# Each journey runs under the config of its folder, the first that holds it.
CONFIGS = {"app/tests/stories/": "app/playwright.stories.config.ts", "": "app/playwright.config.ts"}


def runs(tests):
    """The commands that run these test files, each with the folder it runs in. A run that finds no
    test passes, so a test no runner reaches reads as passing before the fix, never as failing."""
    vitest = [t for t in tests if t.endswith((".test.ts", ".test.tsx"))]
    gno = sorted({os.path.relpath(os.path.dirname(t), "gno") for t in tests if t.endswith(".gno")})
    go = sorted({os.path.relpath(os.path.dirname(t), "gno") for t in tests if t.endswith("_test.go")})
    journeys = {}
    for t in tests:
        if t.endswith(".spec.ts"):
            journeys.setdefault(next(c for folder, c in CONFIGS.items() if t.startswith(folder)), []).append(t)
    out = [(".", f"{VITEST} --passWithNoTests {' '.join(vitest)}")] if vitest else []
    out += [(".", f"{PLAYWRIGHT} --pass-with-no-tests -c {config} {' '.join(files)}") for config, files in journeys.items()]
    out += [("gno", f"{GNO_TEST} {' '.join('./' + d for d in gno)}")] if gno else []
    out += [("gno", f"{GO_TEST} {' '.join('./' + d for d in go)}")] if go else []
    return out


# A journey that reproduces a race fails on the parent only sometimes (ca98dda): each command gets up to this
# many runs there and counts as failing if any one fails, the runs stopping at the first failure.
RUNS = 3


def fails_before(commit, tests):
    """The most runs it took on the commit's parent for each of the tests' commands to fail there, or None when
    one passed all RUNS runs: a worktree of the parent, with only the tests added."""
    with worktree(f"{commit}^") as tree:
        git("-C", tree, "checkout", commit, "--", *tests)
        took = 0
        for folder, cmd in runs(tests):
            for n in range(1, RUNS + 1):
                if subprocess.run(cmd, shell=True, cwd=os.path.join(tree, folder), capture_output=True).returncode != 0:
                    break
            else:
                return None
            took = max(took, n)
        return took


def harness_files(commit):
    """The files of the commit that records.sh lists as the harness's (a tool's config under app/ is one): harness_mutate
    proves those. A list git cannot give refuses rather than counting them as product or as harness."""
    listed = subprocess.run(["sh", "-c", '. "$1" && harness --name-only "$2^" "$2"', "-", RECORDS, commit],
                            capture_output=True, text=True, check=True)  # a failed list raises: the gate refuses
    return set(listed.stdout.splitlines())


EXCUSE = re.compile(r"^No-test: ([0-9a-f]{7,40}) - \S", re.M)


def excused(base):
    """The shas the range's messages excuse, each by a line `No-test: <sha> - <why>` (7 hex digits at least)."""
    return {m for msg in git("log", "--no-merges", "--format=%B%x00", f"{base}..HEAD").split("\0") for m in EXCUSE.findall(msg)}


def verdict(commit, excuses=frozenset()):
    """None when the commit is not a product fix or proves itself; otherwise what is wrong."""
    message = git("log", "-1", "--format=%B", commit)
    if not re.match(r"fix(\(.+?\))?!?:", message):
        return None
    if any(commit.startswith(sha) for sha in excuses):  # a later commit says why it needs no test
        return None
    # Every product file it touches, a deleted one included; the tests it runs, those it leaves.
    changed = git("diff-tree", "--no-commit-id", "--name-only", "-r", "--diff-filter=AMDT", commit).splitlines()
    left = set(git("diff-tree", "--no-commit-id", "--name-only", "-r", "--diff-filter=AM", commit).splitlines())
    harness = harness_files(commit)
    product = [f for f in changed if f.startswith(PRODUCT) and f not in harness]
    tests = [f for f in product if TEST.search(f) and f in left]
    if all(TEST.search(f) or f.startswith(JOURNEYS) for f in product):  # the harness or tests alone: nothing to prove
        return None
    if not tests:
        return None if re.search(r"^No-test: \S", message, re.M) else "a fix with no test that reproduces the bug (or a `No-test: <why>` line)"
    took = fails_before(commit, tests)
    if took is None:
        return f"its tests pass before the fix in {RUNS} runs, so they reproduce nothing: {', '.join(tests)}"
    print(f"prove_fix: {commit[:7]} its tests failed before the fix, in {took} run{'s' * (took > 1)}")
    return None


base = sys.argv[1]
excuses = excused(base)
problems = [f"{c[:7]} {git('log', '-1', '--format=%s', c).strip()}: {why}"
            for c in git("rev-list", "--no-merges", "--reverse", f"{base}..HEAD").split() if (why := verdict(c, excuses))]
if problems:
    print("prove_fix: a fix must come with a test that fails without it:", *problems, sep="\n  ", file=sys.stderr)
    sys.exit(1)
print("prove_fix: every product fix comes with a test that failed before it")
