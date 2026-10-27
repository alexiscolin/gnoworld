"""bench.py: the benches hold their budgets (docs/plans/slice-4.md §4; docs/HARNESS.md, "The gate").

Runs Vitest's benches (`*.bench.ts(x)`, the node project) and reads its report: each bench names its budget in
brackets, `[0.2 ms]`, and the mean of its runs must stay under it. A bench with no budget, no sample (its function
threw), no bench at all, or one a `*.bench.ts(x)` source names that the report lacks (a `describe.skip` around it, an
`.only` beside it, a comment) fails: a measure nobody bounds guards nothing, and a bench switched off measures nothing. The full gate runs it alone, after probe.py: a bench beside other work
measures the machine's load. Usage: bench.py, from the repository root."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import BENCH, BENCH_FILE, BUDGET, listed

VITEST = os.environ.get("BENCH_VITEST", "node_modules/.bin/vitest")  # tests override it (test_hooks.sh)

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
# Each bench the sources name by a literal is in the report (check_regressions.py holds the sources' own list in place).
named = {m.group(2) for p in listed(pathlib.Path("."), {".ts", ".tsx"}) if BENCH_FILE.search(p.name) for m in BENCH.finditer(p.read_text())}
problems += [f"{name}: in a `*.bench.ts(x)` source, not in Vitest's report: switched off, or never run" for name in sorted(named - {m["name"] for m in measures})]
for measure in measures:
    name, mean = measure["name"], measure.get("mean")
    if mean is None:  # Vitest keeps a bench whose function threw, with no sample, and still exits 0
        problems.append(f"{name}: took no sample: its function threw or never ran")
        continue
    found = BUDGET.search(name)
    if found is None:
        problems.append(f"{name}: names no budget, `[<n> ms]` at its end")
        continue
    budget = float(found.group(1))
    print(f"bench {mean:.4f} ms of {budget:g} ms: {name[: found.start()]}")
    if mean > budget:
        problems.append(f"{name}: {mean:.4f} ms, over its {budget:g} ms")
if problems:
    print("bench.py: a bench passed its budget, or has none:", *problems, sep="\n  ", file=sys.stderr)
    sys.exit(1)
print(f"bench.py: {len(measures)} benches within their budgets")
