#!/usr/bin/env python3
"""Mutation check (ADR-0001 §14): every guard in a realm, removed in turn, and
every operator or number flipped, must make a test fail.

A guard is a `mustX(...)` call on its own line, or an `if` whose body starts
with `panic(`; each `||` branch of such an `if` is removed on its own. A flip
turns one `>=`, `>`, `<=`, `<`, `==`, `!=`, `&&`, `||`, `+` or `-` of a source's
code (never its comments, strings or runes) into its partner, or shifts one
integer literal by one, up or down. A package's mutants are copies of it in one
temporary workspace, next to an untouched copy that must pass, all tested by one
`gno test` run, whose time limit grows with its copies (F5051). There a test in
the package runs against its own copy, but a filetest against the first copy of
its module in the workspace, the untouched one (F5050): so a mutant that run lets
survive, GAPS not listing it, is judged again alone, in a workspace of its own
copy, where its filetests see it. A gap is not judged again, so a gap only a
filetest kills stays a gap. A mutant that
does not compile is an error of this script, never a kill; but a `+`, `-` or
number flip that does not compile (a string's `+`, an array's size) is dropped and
counted, unless GAPS lists it. A comparison or logic flip changes no type, so one
that does not compile means a broken run.

GAPS holds the mutants no test catches yet, with the reason. They must keep
surviving, so closing a gap means deleting its line here. A key names its file:
a guard's is `<file>: <line>` (its branch, for one `||` branch), a flip's
`<file>: <line> [<from> -> <to>]`, with ` #<k>` after `<to>` when the same flip
of the same text comes k times in the file. A key that names more than one
mutant (the same guard line twice in a file) fails: one gap, one mutant. A flip
that loops forever times the whole run out, and no gap can hold it: bound its loop.
Usage: GNO=<gno binary> ../scripts/mutate.py, from gno/ (scripts/check.sh does this)."""
import glob
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

GAPS = {
    "r/seal/seal.gno: mustStrong(b)": "no test seals with a weak key as b: seal-store slice",
    "r/seal/seal.gno: mustBeCurrent(kb)": "no test seals with a rotated key as b (needs vectors): seal-store slice",
    "r/seal/seal.gno: if v := owner.Get(k); v != nil && v.(address) != caller {": "no test binds one key to a second address (needs vectors): seal-store slice",
    "r/seal/seal.gno: if _, _, _, isSession := runtime.GetSessionInfo(); isSession {": "gno test cannot fake a session: phase 2, on onyx",
    "r/seal/seal.gno: !ed25519.Verify(b[:], msg, sigB[:])": "no test pairs a valid sigA with a bad sigB: seal-store slice",
    "r/seal/seal.gno: height, _ = strconv.ParseInt(f[1], 10, 64) [64 -> 63]": "equivalent: a block height stays below 2^62, where a 63-bit parse reads it alike",
}
# Mutations that are not guards: (file, text found exactly once, replacement).
EXTRA = [("r/seal/seal.gno", ' + string(a[:]) + string(b[:]) + "|"', ' + "|"')]
# A run's time limit, a copy's share of it (F5051, docs/decisions.md D30): 60 s at least. A fixed 60 s failed the slot
# realm's 227 copies in a gate of every lane, though none loops; runs of 40 copies, 60 s each, failed there too.
SECONDS_A_COPY = 1.5
LEAST = 60
# gno's timer starts once it has loaded the copies (gnovm/cmd/gno/test.go at chain/onyx, Load before the timer): a run
# still going GRACE seconds past its limit has hung where no timer counts, and is stopped with no verdict (F5084). 60 s
# is more than loading takes: 200 seal copies took 6.81 s to load and test, alone.
GRACE = 60

MUST = re.compile(r"^\s*must[A-Z]\w*\(.*\)\s*$")
IF = re.compile(r"^(\s*if )(?:(.*); )?(.*) \{\s*$")
FLIP = {">=": ">", ">": ">=", "<=": "<", "<": "<=", "==": "!=", "!=": "==", "&&": "||", "||": "&&", "+": "-", "-": "+"}
# Go's operators of two and three characters, longest first: a flip takes a whole token, never a part of `++` or `>>=`.
OPERATORS = ["<<=", ">>=", "&^=", "...", "&&", "||", "<-", "++", "--", "==", "!=", "<=", ">=", ":=", "+=", "-=", "*=", "/=",
             "%=", "&=", "|=", "^=", "<<", ">>", "&^"]
INTEGER = re.compile(r"0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|0[0-7_]*|[1-9][0-9_]*")


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


def tokens(src):
    """(start, end) of each flippable operator and integer literal of src's code: comments, strings, runes, names and
    other numbers are stepped over."""
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            i = src.find("\n", i)
            i = n if i < 0 else i  # a last line without its newline ends the file
        elif src.startswith("/*", i):
            i = src.index("*/", i) + 2
        elif c in "\"'`":
            j = i + 1
            while src[j] != c:
                j += 2 if src[j] == "\\" and c != "`" else 1
            i = j + 1
        elif c.isalpha() or c == "_":  # a name: Go's letters are Python's, Unicode ones included
            while i < n and (src[i].isalnum() or src[i] == "_"):
                i += 1
        elif c.isdigit() or (c == "." and src[i + 1 : i + 2].isdigit()):
            j, exponent = i, "pP" if src[i : i + 2].lower() == "0x" else "eE"
            while j < n and (src[j].isalnum() or src[j] in "_." or (src[j] in "+-" and src[j - 1] in exponent)):
                j += 1
            if INTEGER.fullmatch(src[i:j]):
                yield i, j
            i = j
        elif c.isspace():
            i += 1
        else:
            op = next((o for o in OPERATORS if src.startswith(o, i)), c)
            if op in FLIP:
                yield i, i + len(op)
            i += len(op)


def shifted(text, by):
    """An integer literal plus `by`, written in its own base; below zero, in parentheses."""
    prefix = text[:2] if text[:2].lower() in ("0x", "0b", "0o") else "0" if len(text) > 1 and text[0] == "0" else ""
    base = {"0x": 16, "0b": 2, "0o": 8, "0": 8}.get(prefix.lower(), 10)
    value = int(text[len(prefix):].replace("_", "") or "0", base) + by
    if value < 0:
        return f"({value})"
    return prefix + {16: f"{value:x}", 2: f"{value:b}", 8: f"{value:o}", 10: str(value)}[base]


def flips(path):
    """(label, mutated source, may be dropped) for each flip of a file's code; the label is its GAPS key."""
    src = open(path).read()
    found, seen = [], {}
    for start, end in tokens(src):
        text = src[start:end]
        stop = src.find("\n", end)
        line = src[src.rfind("\n", 0, start) + 1 : len(src) if stop < 0 else stop].strip()
        for new in [FLIP[text]] if text in FLIP else [shifted(text, 1), shifted(text, -1)]:
            key = (line, text, new)
            seen[key] = seen.get(key, 0) + 1
            found.append((key, seen[key], src[:start] + new + src[end:], text not in FLIP or text in ("+", "-")))
    for (line, text, new), k, mutated, droppable in found:
        yield f"{path}: {line} [{text} -> {new}{f' #{k}' if seen[line, text, new] > 1 else ''}]", mutated, droppable


class Stopped(Exception):
    """A gno test run stopped GRACE seconds past its limit: its package has no verdict, and the check fails by its name."""


def run(pkg, packages, copies):
    """gno test's output for copies of pkg, m0 first, each a (file, source) pair, (None, None) for the untouched package;
    Stopped when gno did not end GRACE seconds past its limit."""
    gno = os.path.abspath(os.environ["GNO"])  # gno runs from temporary folders
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copy("gnowork.toml", tmp)
        for other in packages - {pkg}:  # imported packages; pkg's copies take its module path
            shutil.copytree(other, os.path.join(tmp, other))
        for i, (file, src) in enumerate(copies):
            shutil.copytree(pkg, os.path.join(tmp, f"m{i}"))
            if file:
                with open(os.path.join(tmp, f"m{i}", os.path.relpath(file, pkg)), "w") as f:
                    f.write(src)
        dirs = [f"./m{i}" for i in range(len(copies))]
        # -timeout: a mutant that loops forever fails the check instead of hanging the commit; gno's timeout ends the
        # whole run, so the mutants still running get no result. One run for all the copies, its limit grown with them:
        # a slow mutant takes the time the fast ones leave, and each run of its own would start gno's workers again.
        limit = max(LEAST, math.ceil(SECONDS_A_COPY * len(dirs)))
        try:
            out = subprocess.run([gno, "test", "-timeout", f"{limit}s", *dirs], cwd=tmp, capture_output=True, text=True,
                                 timeout=limit + GRACE)
        except subprocess.TimeoutExpired:
            raise Stopped(f"FAIL  gno test did not end {GRACE} s past its own time limit of {limit} s, and was stopped: in {pkg}, no mutant has a verdict")
        return out.stdout + out.stderr


def verdict(out, i):
    if re.search(rf"^m{i}/\S+:\d+:\d+: .*\(code=", out, re.M):
        return "does not compile"
    if re.search(rf"^ok\s+\./m{i}\s", out, re.M):
        return "survives"
    if re.search(rf"^FAIL\s+\./m{i}\s", out, re.M):
        return "killed"
    return "no result"


def main():
    packages = {os.path.dirname(p) for p in glob.glob("**/gnomod.toml", recursive=True)}
    failed, seen = False, {}  # each mutant's key, and how many mutants carry it
    for pkg in sorted(packages):
        sources = [f for f in sorted(glob.glob(f"{pkg}/*.gno")) if not f.endswith(("_test.gno", "_filetest.gno"))]
        # (key, file, source, may be dropped when it does not compile): a guard's key names its file, as a flip's (F5018)
        cases = [(f"{f}: {label}", f, src, False) for f in sources for label, src in mutants(f)]
        flipped = [(label, f, src, drop) for f in sources for label, src, drop in flips(f)]
        cases += flipped
        for label, *_ in cases:  # each key is seen, judged or not: a package with no verdict calls none of its gaps stale
            seen[label] = seen.get(label, 0) + 1
        try:
            out = run(pkg, packages, [(None, None)] + [(f, src) for _, f, src, _ in cases])
        except Stopped as stopped:
            print(stopped)
            failed = True
            continue
        if verdict(out, 0) != "survives":
            sys.exit(f"FAIL  control: {pkg}'s untouched copy does not pass\n{out}")
        dropped = 0
        for i, (label, file, src, droppable) in enumerate(cases, 1):
            got, want = verdict(out, i), "survives" if label in GAPS else "killed"
            if got == "survives" and label not in GAPS:  # its filetests ran against m0: judged again alone (F5050)
                try:
                    got = verdict(run(pkg, packages, [(file, src)]), 0)
                except Stopped:
                    got = "stopped"
            if got == "does not compile" and droppable and label not in GAPS:
                dropped += 1
                continue
            note = f"  (known gap: {GAPS[label]})" if label in GAPS else ""
            ok = got == want
            failed |= not ok
            print(f"{'ok  ' if ok else 'FAIL'}  {got}: {label}{note if ok else f' (expected {want})'}")
        if dropped:
            print(f"ok    {dropped} of {len(flipped)} flips do not compile, dropped: {pkg}")
        if "test timed out after" in out:
            print(f"FAIL  gno test timed out: in {pkg}, a mutant with no result above loops forever; no GAPS entry can hold it, so bound its loop")
            failed = True
    for stale in GAPS.keys() - seen.keys():
        print(f"FAIL  GAPS lists a mutant that no longer exists: {stale}")
        failed = True
    # The same guard line twice in one file has one key: both would hide behind one gap.
    for shared in (key for key in GAPS if seen.get(key, 0) > 1):
        print(f"FAIL  GAPS key names {seen[shared]} mutants, one only: {shared}")
        failed = True
    return failed


if __name__ == "__main__":
    sys.exit(main())
