#!/usr/bin/env python3
"""Mutation check (ADR-0001 §14): every guard in a realm, removed in turn, must
make a test fail.

A guard is a `mustX(...)` call on its own line, or an `if` whose body starts
with `panic(`; each `||` branch of such an `if` is removed on its own. A package's mutants are copies of it in one temporary workspace,
next to an untouched copy that must pass, all tested by one `gno test` run. A
mutant that does not compile is an error of this script, never a kill.

GAPS holds the guards no test catches yet, with the reason. They must keep
surviving, so closing a gap means deleting its line here.
Usage: GNO=<gno binary> scripts/mutate.py, from the repository root."""
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile

GAPS = {
    "mustStrong(b)": "no test seals with a weak key as b: slice 1",
    "mustBeCurrent(kb)": "no test seals with a rotated key as b (needs vectors): slice 1",
    "if v := owner.Get(k); v != nil && v.(address) != caller {": "no test binds one key to a second address (needs vectors): slice 1",
    "if _, _, _, isSession := runtime.GetSessionInfo(); isSession {": "gno test cannot fake a session: phase 0, on onyx",
    "if n < 1 {": "no test seals with n < 1: slice 1",
    "!ed25519.Verify(b[:], msg, sigB[:])": "no test pairs a valid sigA with a bad sigB: slice 1",
}
# Mutations that are not guards: (file, text found exactly once, replacement).
EXTRA = [("r/seal/seal.gno", ' + string(a[:]) + string(b[:]) + "|"', ' + "|"')]

GNO = os.path.abspath(os.environ["GNO"])  # gno runs from temporary folders
MUST = re.compile(r"^\s*must[A-Z]\w*\(.*\)\s*$")
IF = re.compile(r"^(\s*if )(?:(.*); )?(.*) \{\s*$")


def branches(cond):
    """cond's top-level `||` branches (one branch when there is no top-level `||`)."""
    parts, depth, start = [], 0, 0
    for i, ch in enumerate(cond):
        depth += ch in "([{"
        depth -= ch in ")]}"
        if depth == 0 and cond.startswith(" || ", i):
            parts.append(cond[start:i])
            start = i + 4
    return parts + [cond[start:]]


def mutants(path):
    """(label, mutated source) for each guard of a file, and its EXTRA mutations."""
    src = open(path).read()
    lines = src.split("\n")
    for i, line in enumerate(lines):
        nxt = next((l.strip() for l in lines[i + 1:] if l.strip()), "")
        if MUST.match(line):
            yield line.strip(), "\n".join(lines[:i] + [""] + lines[i + 1:])
        elif (m := IF.match(line)) and nxt.startswith("panic("):
            prefix, init, cond = m.groups()
            head = prefix + (init + "; " if init else "")
            parts = branches(cond)
            for j, part in enumerate(parts):
                if len(parts) == 1:  # the whole guard off
                    new, label = f"{head}false && ({cond}) {{", line.strip()
                else:  # this branch off, the others kept
                    new = head + " || ".join("false" if k == j else p for k, p in enumerate(parts)) + " {"
                    label = part.strip()
                yield label, "\n".join(lines[:i] + [new] + lines[i + 1:])
    for file, find, repl in EXTRA:
        if file == path:
            if src.count(find) != 1:
                sys.exit(f"FAIL  {path}: '{find}' found {src.count(find)} times, not once: update EXTRA")
            yield find.strip(), src.replace(find, repl)


def run(pkg, packages, cases):
    """gno test's output for the untouched package (m0) and each case (m1…)."""
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copy("gnowork.toml", tmp)
        for other in packages - {pkg}:  # imported packages; pkg's copies take its module path
            shutil.copytree(other, os.path.join(tmp, other))
        for i, (_, file, src) in enumerate([(None, None, None)] + cases):
            shutil.copytree(pkg, os.path.join(tmp, f"m{i}"))
            if file:
                with open(os.path.join(tmp, f"m{i}", os.path.relpath(file, pkg)), "w") as f:
                    f.write(src)
        dirs = [f"./m{i}" for i in range(len(cases) + 1)]
        # -timeout: a mutant that loops forever fails instead of hanging the commit.
        out = subprocess.run([GNO, "test", "-timeout", "60s", *dirs], cwd=tmp, capture_output=True, text=True, timeout=600)
        return out.stdout + out.stderr


def verdict(out, i):
    if re.search(rf"^m{i}/\S+:\d+:\d+: .*\(code=", out, re.M):
        return "does not compile"
    if re.search(rf"^ok\s+\./m{i}\s", out, re.M):
        return "survives"
    if re.search(rf"^FAIL\s+\./m{i}\s", out, re.M):
        return "killed"
    return "no result"


packages = {os.path.dirname(p) for p in glob.glob("r/**/gnomod.toml", recursive=True)}
failed, seen = False, set()
for pkg in sorted(packages):
    sources = [f for f in glob.glob(f"{pkg}/*.gno") if not f.endswith(("_test.gno", "_filetest.gno"))]
    cases = [(label, f, src) for f in sorted(sources) for label, src in mutants(f)]
    out = run(pkg, packages, cases)
    if verdict(out, 0) != "survives":
        sys.exit(f"FAIL  control: {pkg}'s untouched copy does not pass\n{out}")
    for i, (label, file, _) in enumerate(cases, 1):
        seen.add(label)
        got, want = verdict(out, i), "survives" if label in GAPS else "killed"
        note = f"  (known gap: {GAPS[label]})" if label in GAPS else ""
        ok = got == want
        failed |= not ok
        print(f"{'ok  ' if ok else 'FAIL'}  {got}: {file}: {label}{note if ok else f' (expected {want})'}")

for stale in GAPS.keys() - seen:
    print(f"FAIL  GAPS lists a guard that no longer exists: {stale}")
    failed = True
sys.exit(failed)
