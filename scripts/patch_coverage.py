"""patch_coverage.py: how much of a change the tests run, like a pull request's patch
coverage, with no service: Vitest's coverage/coverage-final.json against `git diff`.

Every statement with a line added or changed, in a .ts or .tsx file, counts. It
prints the uncovered lines per file and fails under the floor, or when a changed tier-1 source file
is missing from the report (vitest.config.ts's coverage include does not reach it); under COVERAGE_ALL,
any changed source file missing.
Usage: patch_coverage.py <base> [floor], after `pnpm run coverage`; the floor defaults to 85, the
same as vitest.config.ts's."""
import json
import os
import pathlib
import re
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # -I leaves this folder off the path
from repo_files import changed_lines
from speeds import folded, rows, secure

base = sys.argv[1]
floor = float(sys.argv[2]) if len(sys.argv) > 2 else 85.0
changed = {os.path.realpath(path): lines for path, lines in changed_lines(base, "--", "*.ts", "*.tsx").items()}

try:
    with open("coverage/coverage-final.json") as f:
        report = {os.path.realpath(k): v for k, v in json.load(f).items()}
except OSError as e:  # a coverage run that failed leaves none: Vitest deletes coverage/ and writes no report on failure
    sys.exit(f"patch_coverage: no coverage report (coverage/coverage-final.json): {e.strerror}; the coverage run failed or did not run")

total = run = 0
# Tests and configs are never measured (Storybook's config and the tests' setup are of those); nor
# what vitest.config.ts leaves out of coverage: the app's document shell and server entry, which only
# the build renders, and Storybook's pages, whose handlers do nothing; the Playwright journeys walk
# them (docs/decisions.md, F247); the server's and jarvis's entries, run in child processes by their
# main.test.ts; and evals/, installed apart, whose own Node tests run in evals/run.sh. Matched inside
# the repository only (F098).
UNMEASURED = r"\.(test|config)\.tsx?$|\.d\.ts$|(^|/)tests/|(^|/)\.storybook/|(^|/)testSetup\.ts$|^packages/ui/src/.*\.stories\.tsx$|^packages/ui/src/Overview/Overview\.tsx$|^app/src/(root|entry\.server)\.tsx$|^(server|jarvis)/src/main\.ts$|^evals/"
# The default coverage measures tier 1 alone (the speed plan, 2026-11-06): a file outside it is refused only when docs/REVIEW.md's
# tier 1 holds it, the table read from this script's own tree (the base's on GitHub), none read making every file tier 1 (F13179).
# COVERAGE_ALL (check.sh --everything) measures every source file: any one missing is refused.
every = bool(os.environ.get("COVERAGE_ALL"))
try:
    security = [folded(p) for p in rows(str(pathlib.Path(__file__).resolve().parent.parent))["1"]]
except OSError:
    security = []
unmeasured = [p for p in changed if p not in report and not re.search(UNMEASURED, os.path.relpath(p))
              and (every or not security or secure(".", os.path.relpath(p), security))]
for path in sorted(unmeasured):
    print(f"{os.path.relpath(path)}: changed, but no coverage measures it: add it to vitest.config.ts's coverage include")
for path, lines in sorted(changed.items()):
    if path not in report:
        continue
    file = report[path]
    missed = []
    for sid, where in file["statementMap"].items():
        span = range(where["start"]["line"], where.get("end", where["start"])["line"] + 1)  # any changed line of it
        if lines.intersection(span):
            total += 1
            if file["s"][sid] > 0:
                run += 1
            else:
                missed.append(where["start"]["line"])
    if missed:
        print(f"{os.path.relpath(path)}: not run by any test: lines {', '.join(map(str, sorted(set(missed))))}")

share = 100.0 if total == 0 else 100.0 * run / total
print(f"patch coverage: {share:.1f}% of {total} changed statements (floor {floor:g}%)")
if share < floor or unmeasured:
    sys.exit(1)
