"""exam.py: the reviewers' exam (docs/plans/backlog.md, "The reviewers' exam"; Anthropic's "Solving code review at
Anthropic": incidents become evals, and a change to a reviewer is scored on them before it lands).

Its set: the ledger's fixed findings (docs/review/findings.md) whose fix commit the repository holds, each the code
before its fix (the fix's parent), the file the finding names, and the bug it held; the newest first, capped, so the
set stays the size of an afternoon's run however long the ledger grows (the ledger has no severity column:
`--severe` keeps the findings whose claim or evidence says high or medium). A reviewer (an agent file, a prompt, a
model) is scored on it whenever it changes, never on a merge: run it over each case's commit and file, and count the
cases whose bug it names. This builds the set, as JSON on stdout; running the reviewer is an agent's, so the session's.
Usage: exam.py [--severe] [--cap <n>], from the repository root."""
import json
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import git

LEDGER = "docs/review/findings.md"
SEVERE = re.compile(r"\b(high|medium)\b", re.I)
args = sys.argv[1:]
severe = "--severe" in args
cap = int(args[args.index("--cap") + 1]) if "--cap" in args else 40


def commit_of(evidence):
    """The fix's commit: the first backticked hash of the evidence the repository holds."""
    for sha in re.findall(r"`([0-9a-f]{7,40})`", evidence):
        if subprocess.run(["git", "cat-file", "-e", f"{sha}^{{commit}}"], capture_output=True).returncode == 0:
            return git("rev-parse", sha).strip()
    return None


cases = []
for row in open(LEDGER).read().splitlines():
    cells = [cell.strip() for cell in row.strip().strip("|").split(" | ")]
    if len(cells) != 7 or not re.fullmatch(r"F\d+", cells[0]) or cells[5] != "fixed":
        continue
    finding, _, _, where, claim, _, evidence = cells
    path = re.search(r"`([^`]+)`", where)
    fix = commit_of(evidence)
    if path is None or fix is None or (severe and not SEVERE.search(claim + " " + evidence)):
        continue
    parent = git("rev-parse", f"{fix}^").strip()
    cases.append({"id": finding, "commit": parent, "fix": fix, "file": path.group(1), "bug": claim})
chosen = cases[::-1][:cap]
json.dump(chosen, sys.stdout, indent=1)
kind = "high and medium" if severe else "all"
print(f"\nexam: {len(chosen)} cases of {len(cases)} ({kind} fixed, the newest first, at most {cap})", file=sys.stderr)
