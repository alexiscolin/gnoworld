"""bench.py: the benches hold their budgets (docs/plans/slice-4.md §4; docs/HARNESS.md, "The gate").

Runs Vitest's benches (`*.bench.ts(x)`, the node project) and reads its report: each bench names its budget in
brackets, `[0.2 ms]`, and the mean of its runs must stay under it. A bench with no budget, no sample (its function
threw), no bench at all, or one a `*.bench.ts(x)` source names that the report lacks (a `describe.skip` around it, an
`.only` beside it, a comment) fails: a measure nobody bounds guards nothing, and a bench switched off measures nothing. The full gate runs it alone, after probe.py: a bench beside other work
measures the machine's load. A bench measures a quiet machine (harness-c): before it runs, bench.py reads the load (load.py, beside it,
in tenths) and waits while the 1-minute load is not under the machine's cores, up to a ceiling; past it, it refuses, saying so, since a
verdict on the code needs a machine that can measure it. No budget changes. BENCH_WAIT_CEILING and BENCH_WAIT_STEP (seconds) are the
tests' switches, which check.sh drops. Usage: bench.py, from the repository root."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import BENCH, BENCH_FILE, BUDGET, listed

VITEST = "node_modules/.bin/vitest"  # relative to the root the script runs from: a test puts its stub there
LOAD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "load.py")
# s: how long to wait for a quiet machine (60, the harness audit, 2026-11-04: 600 at loads of 48 to 142 ended on a refusal all the same),
# and between two reads of the load
CEILING, STEP = 60.0, 10.0


def seen():
    """The load and the cores, in tenths, as load.py prints them; None when it cannot be read."""
    try:
        run = subprocess.run([sys.executable, "-I", LOAD], capture_output=True, text=True, timeout=30)
        load, cores = (int(word) for word in run.stdout.split())
        return (load, cores) if run.returncode == 0 and load >= 0 and cores > 0 else None
    except (ValueError, OSError, subprocess.SubprocessError):
        return None


def tenths(n):
    return f"{n // 10}.{n % 10}"


def quiet():
    """Waits for the load to fall under the cores; exits when it cannot be read, or stays up past the ceiling."""
    ceiling, step = float(os.environ.get("BENCH_WAIT_CEILING", CEILING)), float(os.environ.get("BENCH_WAIT_STEP", STEP))
    began, polls = time.monotonic(), 0
    while True:
        now = seen()
        if now is None:
            sys.exit(f"bench.py: the machine's load cannot be read ({LOAD}): a bench would measure a busy machine unannounced")
        load, cores = now
        waited, polls = time.monotonic() - began, polls + 1
        if load < cores:
            print(f"bench.py: measuring at load {tenths(load)} on {tenths(cores)[:-2]} cores" + (f", after it waited {waited:.1f} s for the load to fall" if polls > 1 else ""))
            return
        if waited >= ceiling:
            sys.exit(f"bench.py: the load stayed at {tenths(load)} on {tenths(cores)[:-2]} cores for {waited:.0f} s: a verdict on the code needs a machine that can measure it")
        if polls == 1 or int(waited // 60) != int((waited - step) // 60):
            print(f"bench.py: load {tenths(load)} on {tenths(cores)[:-2]} cores, over the cores: waiting for it to fall (up to {ceiling:.0f} s)", file=sys.stderr)
        time.sleep(min(step, max(ceiling - waited, 0.01)))


quiet()

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
