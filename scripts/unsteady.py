"""unsteady.py <vitest|playwright> <report.json> <output> <log> <load> -- <command...>: the fast gate's second run (F1700).

A Vitest file or a Playwright spec that failed in the gate's run is run once more, alone: the command is given the failed
files, and the gate passes when it passes. A test that fails and then passes is unsteady, and a gate that passes it
without a trace hides it: each such file is appended to <log> with its failed tests, the machine's load (<load> is
scripts/load.py's "tenths cores") and the time, which /pre-merge reads. It exits 1, never 0, when:
- the report names no failed file (a crash, a config error, an unreadable report: that is no flake, and nothing reruns),
- the run had anything besides the failed files it would run again (R1): a pass of those files must never pass a run whose
  other failure no second run clears. <output> is the first run's console, where Vitest prints an unhandled error (its JSON
  report holds none: a flaky `a` beside a `b` that throws in a timer passed the gate); a Vitest file that failed with no failed
  test (it did not load, or a hook failed); Playwright's top-level `errors`. Nothing runs again, nothing is logged,
- the files fail a second time,
- the log cannot be written: a flake no one can see is not a pass.
Only the failed files run again, and only once. The full and merge gates run no second Vitest (coverage runs it), so they
keep their behaviour; the journeys' step is the same code in every gate."""
import datetime
import json
import os
import re
import subprocess
import sys


UNHANDLED = re.compile(r"Vitest caught \d+ unhandled errors? during the test run")  # vitest 4.1.12, cli-api chunk's printUnhandledErrors


def failed_vitest(report, output):
    """({file: [failed test names]}, what else the run had): Vitest's JSON reporter, whose report holds no unhandled error."""
    failed = {
        r["name"]: [a["fullName"] for a in r.get("assertionResults", []) if a["status"] == "failed"]
        for r in report["testResults"]
        if r["status"] == "failed"
    }
    besides = [f"{os.path.relpath(path)} failed with no failed test (it did not load, or a hook failed)" for path, names in failed.items() if not names]
    return failed, besides + (["an unhandled error"] if UNHANDLED.search(output) else [])


def failed_playwright(report, output):
    """({file: [failed specs]}, what else the run had): Playwright's JSON reporter, whose files are relative to its testDir."""
    root, found = report["config"]["rootDir"], {}

    def walk(suite, titles):
        for spec in suite.get("specs", []):
            if not spec["ok"]:
                found.setdefault(os.path.join(root, spec["file"]), []).append(" > ".join(titles + [spec["title"]]))
        for child in suite.get("suites", []):
            walk(child, titles + ([child["title"]] if child["title"] != child.get("file") else []))

    for suite in report["suites"]:
        walk(suite, [])
    return found, ["errors of its own (a config, a global setup, a file that did not load)"] if report["errors"] else []


READERS = {"vitest": failed_vitest, "playwright": failed_playwright}
# What each tool takes to run only a file: Vitest a path's text, Playwright a regular expression.
FILTERS = {"vitest": lambda path: path, "playwright": re.escape}


def main(argv):
    if len(argv) < 8 or argv[6] != "--" or argv[1] not in READERS:
        sys.exit(__doc__)
    tool, report, output, log, load, command = argv[1], argv[2], argv[3], argv[4], argv[5], argv[7:]
    try:
        with open(output, errors="replace") as o, open(report) as f:
            failed, besides = READERS[tool](json.load(f), o.read())
    except (OSError, ValueError, KeyError, TypeError) as e:
        sys.exit(f"unsteady: no readable report of {tool}'s failure ({e}): nothing to run again")
    if not failed:
        sys.exit(f"unsteady: {tool} failed with no failed file in its report: not a test to run again")
    if besides:
        sys.exit(f"unsteady: {tool}'s run had more than failed files, which a second run of them cannot clear: {'; '.join(besides)}: nothing runs again")
    files = sorted(os.path.relpath(path) for path in failed)  # check.sh runs from its folder's real path, as the tools report
    print(f"unsteady: {tool} failed in {', '.join(files)}: running them once more, alone", file=sys.stderr, flush=True)
    if subprocess.run(command + [FILTERS[tool](f) for f in files]).returncode != 0:
        sys.exit(f"unsteady: {', '.join(files)} failed twice")
    try:
        tenths, cores = map(int, load.split())
        busy = f"load {tenths / 10:.1f} on {cores // 10} cores"
    except ValueError:
        busy = f"load {load}"
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        os.makedirs(os.path.dirname(log) or ".", exist_ok=True)
        with open(log, "a") as f:
            for path, names in sorted(failed.items()):
                f.write("\t".join([now, tool, os.path.relpath(path), busy, "; ".join(names)]) + "\n")
    except OSError as e:
        sys.exit(f"unsteady: {', '.join(files)} passed the second time, but {log} cannot be written ({e}): an unsteady test no one sees is not a pass")
    print(f"unsteady: {', '.join(files)} passed the second time: logged in {log}", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv)
