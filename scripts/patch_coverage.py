"""patch_coverage.py: how much of a change the tests run, like a pull request's patch
coverage, with no service: Vitest's coverage/coverage-final.json against `git diff`.

Every statement with a line added or changed, in a .ts or .tsx file, counts. It
prints the uncovered lines per file and fails under the floor, or when a changed source file is
missing from the report (vitest.config.ts's coverage include does not reach it).
Usage: patch_coverage.py <base> [floor], after `pnpm run coverage`; the floor defaults to 85, the
same as vitest.config.ts's."""
import json
import os
import pathlib
import re
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # -I leaves this folder off the path
from repo_files import git

base = sys.argv[1]
floor = float(sys.argv[2]) if len(sys.argv) > 2 else 85.0
diff = git("diff", "-U0", base, "--", "*.ts", "*.tsx")

changed, current = {}, None
for line in diff.splitlines():
    if line.startswith("+++ "):
        current = None if line == "+++ /dev/null" else os.path.realpath(line[6:])
    elif line.startswith("@@") and current:
        m = re.match(r"@@ -\S+ \+(\d+)(?:,(\d+))? @@", line)
        if m:
            start, count = int(m.group(1)), int(m.group(2) or 1)
            changed.setdefault(current, set()).update(range(start, start + count))

with open("coverage/coverage-final.json") as f:
    report = {os.path.realpath(k): v for k, v in json.load(f).items()}

total = run = 0
# Tests and configs are never measured (Storybook's config and the tests' setup are of those); nor
# what vitest.config.ts leaves out of coverage: the app's document shell and server entry, which only
# the build renders, and Storybook's pages, whose handlers do nothing; the Playwright journeys walk
# them (docs/decisions.md, F247). Matched inside the repository only (F098).
UNMEASURED = r"\.(test|config)\.tsx?$|\.d\.ts$|(^|/)tests/|(^|/)\.storybook/|(^|/)testSetup\.ts$|^packages/ui/src/.*\.stories\.tsx$|^packages/ui/src/Overview/Overview\.tsx$|^app/src/(root|entry\.server)\.tsx$"
unmeasured = [p for p in changed if p not in report and not re.search(UNMEASURED, os.path.relpath(p))]
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
