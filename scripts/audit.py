"""audit.py: no locked dependency has a known advisory, moderate or worse.

It sends every package and version of pnpm-lock.yaml to npm's advisory database, the one
`pnpm audit` asks, and fails on a moderate, high or critical advisory, or when it gets no
readable answer. It exists because pnpm cannot run inside Claude Code's sandbox.
AUDIT_ANSWER names a file read instead of the network, for tests; the request is
written beside it, and AUDIT_TODAY then names the day WAIVED is judged on. Usage: audit.py, from the repository root (GitHub's lint job and the night)."""
import datetime
import json
import os
import re
import sys
import urllib.request

URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk"
SEVERE = {"moderate", "high", "critical"}
# One advisory let through, on one package at or under one version, until a date; past it the audit fails again.
# GHSA-fc5q-39xc-vjpf (picomatch <= 4.0.7, a ReDoS on globs like +(*)) has no fixed version published, 4.0.7 the latest.
# Only build and test tools lock picomatch, reading our own globs: vite, vitest, knip, tinyglobby, fdir,
# @rollup/pluginutils, @rolldown/plugin-babel; no production dependency of any workspace reaches it.
WAIVED = ("picomatch", "/GHSA-fc5q-39xc-vjpf", (4, 0, 7), datetime.date(2026, 12, 18))
today = datetime.date.today()


def waived(name, advisory):
    package, ghsa, top, until = WAIVED
    versions = [re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", v) for v in locked.get(name, ())]
    return (name == package and str(advisory.get("url")).endswith(ghsa) and today <= until and versions
            and all(m and tuple(map(int, m.groups())) <= top for m in versions))


locked = {}
for name, version in re.findall(r"^  '?(@?[^@'\s]+)@(\d[^('\s:]*)", open("pnpm-lock.yaml").read(), re.M):
    locked.setdefault(name, set()).add(version)
if not locked:  # a lockfile format this parser does not know would otherwise pass for clean
    sys.exit("audit: no package read from pnpm-lock.yaml; its format changed, so this parser is out of date")
request = json.dumps({name: sorted(versions) for name, versions in sorted(locked.items())})

try:
    if fake := os.environ.get("AUDIT_ANSWER"):
        today = datetime.date.fromisoformat(os.environ.get("AUDIT_TODAY", today.isoformat()))
        with open(fake + ".request", "w") as f:
            f.write(request)
        answer = json.load(open(fake))
    else:
        call = urllib.request.Request(URL, data=request.encode(), headers={"content-type": "application/json"})
        with urllib.request.urlopen(call, timeout=60) as reply:
            answer = json.load(reply)
except (OSError, ValueError) as e:
    sys.exit(f"audit: no readable answer from npm's advisory database: {e}")

let = [f"{name}: {a.get('url')}" for name, advisories in sorted(answer.items()) for a in advisories if waived(name, a)]
if let:
    print(f"audit: let through until {WAIVED[3]}:", *let, sep="\n  ", file=sys.stderr)
answer = {name: [a for a in advisories if not waived(name, a)] for name, advisories in answer.items()}
found = [f"{name}: {a.get('severity')}: {a.get('title')} ({a.get('vulnerable_versions')}) {a.get('url')}"
         for name, advisories in sorted(answer.items()) for a in advisories if a.get("severity") in SEVERE]
if found:
    print("audit: locked dependencies with known advisories:", *found, sep="\n  ", file=sys.stderr)
    sys.exit(1)
print(f"audit: {len(locked)} locked packages, no moderate or worse advisory")
