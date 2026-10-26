"""bench.py: the benches hold their budgets (docs/plans/slice-4.md §4; docs/HARNESS.md, "The gate").

Runs Vitest's benches (`*.bench.ts(x)`, the node project) and reads its report: each bench names its budget in
brackets, `[0.2 ms]`, and the mean of its runs must stay under it. A bench with no budget, or no bench at all, fails:
a measure nobody bounds guards nothing. The full gate runs it alone, after probe.py: a bench beside other work
measures the machine's load. Usage: bench.py, from the repository root."""
import json
import os
import re
import subprocess
import sys
import tempfile

VITEST = os.environ.get("BENCH_VITEST", "node_modules/.bin/vitest")  # tests override it (test_hooks.sh)
BUDGET = re.compile(r"\[(\d+(?:\.\d+)?) ms\]$")

with tempfile.TemporaryDirectory() as where:
    path = os.path.join(where, "bench.json")
    run = subprocess.run([VITEST, "bench", "--run", "--project", "node", "--outputJson", path], capture_output=True, text=True)
    if run.returncode != 0 or not os.path.exists(path):
        sys.exit("bench.py: the benches did not run:\n" + (run.stdout + run.stderr)[-2000:])
    with open(path) as f:
        report = json.load(f)
measures = [b for file in report.get("files", []) for group in file.get("groups", []) for b in group.get("benchmarks", [])]
if not measures:
    sys.exit("bench.py: no bench ran: each budget of docs/plans/ has a `*.bench.ts(x)`")
problems = []
for measure in measures:
    name, mean = measure["name"], measure["mean"]
    found = BUDGET.search(name)
    if found is None:
        problems.append(f"{name}: names no budget, `[<n> ms]` at its end")
        continue
    budget = float(found.group(1))
    print(f"bench {mean:.4f} ms of {budget:g} ms: {name.removesuffix(found.group(0)).strip()}")
    if mean > budget:
        problems.append(f"{name}: {mean:.4f} ms, over its {budget:g} ms")
if problems:
    print("bench.py: a bench passed its budget, or has none:", *problems, sep="\n  ", file=sys.stderr)
    sys.exit(1)
print(f"bench.py: {len(measures)} benches within their budgets")
