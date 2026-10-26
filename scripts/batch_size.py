"""batch_size.py: a merge carries a small batch of product code (DORA's small batches; docs/REVIEW.md: about 400 lines
when it touches a tier-1 file, 600 otherwise; Alexis, 2026-10-22). Slice 4's merges 4b and 4c added 1,551 and 1,199
lines unseen.

A merge's own code: the lines it adds since the newest commit /pre-merge reviewed (docs/review-passes.txt, the
previous merge's tip), or since base when none is between. Product code: app/src, packages/*/src, server/src and gno;
tests, stories and journeys are not. Past 600 lines it fails, unless a commit of the merge says why on a line
`Batch-size: <lines> - <why>`, which Alexis reads; past 400 it says the tier-1 limit, for the review card.
check.sh --merge runs it. Usage: batch_size.py <base>, from the repository root."""
import os
import re
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import PASSES, fingerprint, git

LIMIT, TIER_ONE = 600, 400
PRODUCT = re.compile(r"^(app/src|packages/[^/]+/src|server/src|gno)/")
NOT_PRODUCT = re.compile(r"(\.test\.tsx?|\.spec\.ts|\.stories\.tsx|_test\.gno|_filetest\.gno|_test\.go)$")

base = sys.argv[1]
reviewed = {line.split()[1] for line in open(PASSES) if line.strip() and not line.startswith("#")} if os.path.exists(PASSES) else set()
own = next((commit for commit in git("rev-list", f"{base}..HEAD").split() if fingerprint(commit) in reviewed), base)
added = 0
for row in git("diff", "--numstat", own, "HEAD").splitlines():
    plus, _, path = row.split("\t", 2)
    if plus != "-" and PRODUCT.match(path) and not NOT_PRODUCT.search(path):
        added += int(plus)
print(f"batch_size: {added} lines of product code since {own[:12]}, the last reviewed commit or the base")
if added > LIMIT and not re.search(r"^Batch-size: \d+ - \S", git("log", "--format=%B", f"{own}..HEAD"), re.M):
    sys.exit(f"batch_size: {added} lines, past a merge's {LIMIT} (docs/REVIEW.md, DORA's small batches): cut the "
             "merge in two, or say why on a commit's line `Batch-size: <lines> - <why>`, which Alexis reads")
if added > TIER_ONE:
    print(f"batch_size: past {TIER_ONE}: a merge that touches a tier-1 file carries {TIER_ONE} at most (docs/REVIEW.md); "
          "the review card says whether it does")
