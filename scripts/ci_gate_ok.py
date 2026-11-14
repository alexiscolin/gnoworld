"""ci_gate_ok.py: the verdict of gate.yml's `gate-ok` job, the one check main requires. GitHub reports a job skipped by its
condition as a success, and skips a job whose needed job failed (docs.github.com, troubleshooting-required-status-checks), so this
reads every job's result: a failed or cancelled job fails the gate, and so does a skipped one the change called for. The job runs
the base commit's copy, so a change cannot loosen its own verdict; it also reads deploy/ and gno/ from git on its own, so a
`changes` job that lies cannot skip deploy/test.sh or the realms' tests (the red team's test 9).
Usage, from the checked-out change, with NEEDS set to the job's `toJSON(needs)`: ci_gate_ok.py <event>. Exit 0 when the gate passes."""
import json
import os
import subprocess
import sys

# Each job, by the flags of `changes` that call for it, all of them ([] = every change).
REQUIRED = {
    "types": ["ts"],
    "lint": [],
    "zizmor": [],
    "unit": ["ts"],
    "unit-browser": ["ts"],
    "journeys": ["app"],
    "build": ["app"],
    "gno-go": ["gno"],
    "coverage": ["tier1", "product"],
    "risk": ["tier1", "product"],
    "regressions": [],
    "deploy-stack": ["deploy"],
    "harness-selftest": ["harness"],
}
# The folders this script reads from git itself, and the job each one calls for whatever `changes` says.
OWN = {"deploy/": "deploy-stack", "gno/": "gno-go"}


def verdict(needs, event, changed):
    """The gate's faults, one line each: none means it passes. `changed` is the change's paths, or None when git could not say."""
    bad = []
    changes = needs.get("changes", {})
    out = changes.get("outputs") or {}
    if changes.get("result") != "success" or not out.get("base"):
        bad.append(f"changes: {changes.get('result', 'missing')}, the gate cannot judge")
    # A flag gate.yml's `outputs:` misspells, or that ci_changes.sh no longer prints, reads empty: never a "no".
    unread = sorted(f for f in {f for flags in REQUIRED.values() for f in flags} if out.get(f) not in ("true", "false"))
    if unread:
        bad.append(f"changes gave no answer for {', '.join(unread)}")
    if changed is None:
        bad.append("git could not list the change: deploy/ and gno/ cannot be checked")
    manual = event not in ("pull_request", "push")  # a manual run calls for every job, as `changes` does
    forced = {job for folder, job in OWN.items() if changed is None or any(p.startswith(folder) for p in changed)}
    for name, flags in REQUIRED.items():
        result = needs.get(name, {}).get("result", "missing")
        wanted = manual or name in forced or all(out.get(f) == "true" for f in flags)
        if result == "success":
            continue
        if result == "skipped" and not wanted:
            continue
        why = {"skipped": ", but the change calls for it", "missing": ": gate-ok does not wait for it (removing a job takes an admin's bypass, D13142)"}
        bad.append(f"{name}: {result}{why.get(result, '')}")
    for name in sorted(set(needs) - set(REQUIRED) - {"changes"}):
        if needs[name].get("result") not in ("success", "skipped"):
            bad.append(f"{name}: {needs[name].get('result')}")
    return bad


def main(argv):
    if len(argv) != 2:
        sys.exit("usage: ci_gate_ok.py <event>, NEEDS in the environment")
    needs = json.loads(os.environ["NEEDS"])
    base = (needs.get("changes", {}).get("outputs") or {}).get("base", "")
    changed = None
    if base:
        # NUL-separated: git quotes a name holding a tab, a quote or a backslash, and a quoted name misses the prefix.
        r = subprocess.run(["git", "diff", "-z", "--no-renames", "--name-only", base, "HEAD"], capture_output=True, text=True)
        if r.returncode == 0:
            changed = [p for p in r.stdout.split("\0") if p]
    bad = verdict(needs, argv[1], changed)
    for line in bad:
        print("gate-ok:", line)
    print("gate-ok: passed" if not bad else f"gate-ok: {len(bad)} fault(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
