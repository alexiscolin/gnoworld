"""unsteady.py <vitest|playwright> <report.json> <log> <load> -- <command...>: the fast gate's second run (F1700).

A Vitest file or a Playwright spec that failed in the gate's run is run once more, alone: the command is given the failed
files, and the gate passes when it passes. A test that fails and then passes is unsteady, and a gate that passes it
without a trace hides it: each such file is appended to <log> with its failed tests, the machine's load (<load> is
scripts/load.py's "tenths cores") and the time, which /pre-merge reads. It exits 1, never 0, when:
- the report names no failed file (a crash, a config error, an unreadable report: that is no flake, and nothing reruns),
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


def failed_vitest(report):
    """{file: [failed test names]}: Vitest's JSON reporter, a file that failed to load with no test name."""
    return {
        r["name"]: [a["fullName"] for a in r.get("assertionResults", []) if a["status"] == "failed"]
        for r in report["testResults"]
        if r["status"] == "failed"
    }


def failed_playwright(report):
    """{file: [failed specs]}: Playwright's JSON reporter, whose files are relative to its testDir."""
    root, found = report["config"]["rootDir"], {}

    def walk(suite, titles):
        for spec in suite.get("specs", []):
            if not spec["ok"]:
                found.setdefault(os.path.join(root, spec["file"]), []).append(" > ".join(titles + [spec["title"]]))
        for child in suite.get("suites", []):
            walk(child, titles + ([child["title"]] if child["title"] != child.get("file") else []))

    for suite in report["suites"]:
        walk(suite, [])
    return found


READERS = {"vitest": failed_vitest, "playwright": failed_playwright}
# What each tool takes to run only a file: Vitest a path's text, Playwright a regular expression.
FILTERS = {"vitest": lambda path: path, "playwright": re.escape}


def main(argv):
    if len(argv) < 7 or argv[5] != "--" or argv[1] not in READERS:
        sys.exit(__doc__)
    tool, report, log, load, command = argv[1], argv[2], argv[3], argv[4], argv[6:]
    try:
        with open(report) as f:
            failed = READERS[tool](json.load(f))
    except (OSError, ValueError, KeyError, TypeError) as e:
        sys.exit(f"unsteady: no readable report of {tool}'s failure ({e}): nothing to run again")
    if not failed:
        sys.exit(f"unsteady: {tool} failed with no failed file in its report: not a test to run again")
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
                f.write("\t".join([now, tool, os.path.relpath(path), busy, "; ".join(names) or "(the file did not load)"]) + "\n")
    except OSError as e:
        sys.exit(f"unsteady: {', '.join(files)} passed the second time, but {log} cannot be written ({e}): an unsteady test no one sees is not a pass")
    print(f"unsteady: {', '.join(files)} passed the second time: logged in {log}", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv)
