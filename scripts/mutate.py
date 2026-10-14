#!/usr/bin/env python3
"""Mutation check: remove each guard listed in mutations.txt, in a copy of its
package, and run its tests. A "kill" guard must fail a test. A "gap" guard is a
known hole: it must still survive, so that closing it means updating the list.
Usage: GNO=<gno binary> mutate.py (run from the repository root)."""
import os
import shutil
import subprocess
import sys
import tempfile

gno = os.environ.get("GNO", "gno")
failed = False


def fails(path, src):
    """Whether path's package fails its tests once path holds src. The copy
    lives outside the workspace, so gno runs from inside it."""
    with tempfile.TemporaryDirectory() as tmp:
        pkg = os.path.join(tmp, "pkg")
        shutil.copytree(os.path.dirname(path), pkg)
        with open(os.path.join(pkg, os.path.basename(path)), "w") as f:
            f.write(src)
        return subprocess.run([gno, "test", "."], cwd=pkg, capture_output=True).returncode != 0


controlled = set()
for raw in open("scripts/mutations.txt"):
    line = raw.rstrip("\n")
    if not line.strip() or line.lstrip().startswith("#"):
        continue
    parts = line.split(" | ")
    expect, path, find, repl = parts[0].strip(), parts[1].strip(), parts[2], parts[3].rstrip()
    why = parts[4].strip() if len(parts) > 4 else ""
    src = open(path).read()
    if src.count(find) != 1:
        print(f"FAIL  {path}: '{find}' found {src.count(find)} times, not once: update mutations.txt")
        failed = True
        continue
    # Control: the untouched copy must pass, or every mutation would look killed.
    if path not in controlled:
        if fails(path, src):
            print(f"FAIL  control: {path}'s untouched copy fails its tests")
            sys.exit(1)
        controlled.add(path)
    killed = fails(path, src.replace(find, repl))
    label = f"{path}: {find.strip()}"
    if expect == "kill" and not killed:
        print(f"FAIL  survived: {label} — a test must catch this")
        failed = True
    elif expect == "gap" and killed:
        print(f"FAIL  now caught: {label} — mark it kill in mutations.txt")
        failed = True
    else:
        note = f"  (known gap: {why})" if expect == "gap" else ""
        print(f"ok    {'killed' if killed else 'survives'}: {label}{note}")

sys.exit(1 if failed else 0)
