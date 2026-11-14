"""audit.py: no locked dependency has a known advisory, moderate or worse (ADR-0002 §9).

It sends every package and version of pnpm-lock.yaml to npm's advisory database, the one
`pnpm audit` asks, and fails on a moderate, high or critical advisory, or when it gets no
readable answer. It exists because pnpm cannot run inside Claude Code's sandbox (findings
F027). AUDIT_ANSWER names a file read instead of the network, for tests; the request is
written beside it. Usage: audit.py, from the repository root (GitHub's lint job and the night)."""
import json
import os
import re
import sys
import urllib.request

URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk"
SEVERE = {"moderate", "high", "critical"}

locked = {}
for name, version in re.findall(r"^  '?(@?[^@'\s]+)@(\d[^('\s:]*)", open("pnpm-lock.yaml").read(), re.M):
    locked.setdefault(name, set()).add(version)
if not locked:  # a lockfile format this parser does not know would otherwise pass for clean
    sys.exit("audit: no package read from pnpm-lock.yaml; its format changed, so this parser is out of date")
request = json.dumps({name: sorted(versions) for name, versions in sorted(locked.items())})

try:
    if fake := os.environ.get("AUDIT_ANSWER"):
        with open(fake + ".request", "w") as f:
            f.write(request)
        answer = json.load(open(fake))
    else:
        call = urllib.request.Request(URL, data=request.encode(), headers={"content-type": "application/json"})
        with urllib.request.urlopen(call, timeout=60) as reply:
            answer = json.load(reply)
except (OSError, ValueError) as e:
    sys.exit(f"audit: no readable answer from npm's advisory database: {e}")

found = [f"{name}: {a.get('severity')}: {a.get('title')} ({a.get('vulnerable_versions')}) {a.get('url')}"
         for name, advisories in sorted(answer.items()) for a in advisories if a.get("severity") in SEVERE]
if found:
    print("audit: locked dependencies with known advisories:", *found, sep="\n  ", file=sys.stderr)
    sys.exit(1)
print(f"audit: {len(locked)} locked packages, no moderate or worse advisory")
