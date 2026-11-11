"""batch_size.py: a merge carries a small batch of product code (DORA's small batches; docs/REVIEW.md: about 400 lines
when it touches a tier-1 file, 600 otherwise; Alexis, 2026-10-22). Slice 4's merges 4b and 4c added 1,551 and 1,199
lines unseen.

A merge's own code: the lines it adds since the newest commit /pre-merge reviewed (docs/review-passes.txt, the
previous merge's tip), or since base when none is between. Product code: app/src, packages/*/src, server/src, jarvis/src
and gno; tests, stories, journeys and the test helpers of the server, Jarvis and a package (testing/) are not. Past 600 lines it fails, unless a commit of the
merge says why on a line `Batch-size: <lines> - <why>` giving the count, a tenth more at most, which Alexis reads
(a far larger number would waive the lines added after it); past 400 it
says the tier-1 limit, for the review card. A renamed file counts its added lines at its new path.
check.sh --merge and --full run it. Usage: batch_size.py <base>, from the repository root."""
import os
import re
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import git, last_reviewed

LIMIT, TIER_ONE = 600, 400
PRODUCT = re.compile(r"^(app/src|packages/[^/]+/src|server/src|jarvis/src|link-reader/src|gno)/")
NOT_PRODUCT = re.compile(r"(\.test\.tsx?|\.spec\.ts|\.stories\.tsx|_test\.gno|_filetest\.gno|_test\.go)$|^server/src/testing/|^jarvis/src/testing/|^link-reader/src/testdata/|^link-reader/src/testImages\.ts$|^packages/[^/]+/src/testing/")  # test helpers

base = sys.argv[1]
own = last_reviewed(base)
added = 0
rows = git("diff", "-z", "--numstat", own, "HEAD").split("\0")  # a rename is "<+>\t<->\t", the old path, the new
while rows and rows[0]:
    plus, _, path = rows.pop(0).split("\t", 2)
    if not path:  # a rename's lines are its new path's: git's own "app/{tests => src}/h.ts" matches no folder
        path = (rows.pop(0), rows.pop(0))[1]
    if plus != "-" and PRODUCT.match(path) and not NOT_PRODUCT.search(path):
        added += int(plus)
print(f"batch_size: {added} lines of product code since {own[:12]}, the last reviewed commit or the base")
stated = [int(n) for n in re.findall(r"^Batch-size: (\d+) - \S", git("log", "--format=%B", f"{own}..HEAD"), re.M)]
if added > LIMIT and not any(added <= n and n * 10 <= added * 11 for n in stated):
    sys.exit(f"batch_size: {added} lines, past a merge's {LIMIT} (docs/REVIEW.md, DORA's small batches): cut the "
             "merge in two, or say why on a commit's line `Batch-size: <lines> - <why>` (the count, a tenth more at most), "
             "which Alexis reads")
if added > TIER_ONE:
    print(f"batch_size: past {TIER_ONE}: a merge that touches a tier-1 file carries {TIER_ONE} at most (docs/REVIEW.md); "
          "the review card says whether it does")
