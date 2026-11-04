"""speeds.py <root>: the merge check's two speeds (slice 7, question 21); speeds.py --light <root>, the radical mode's light gate.

Reads the paths of a change on stdin, one a line (check.sh's own `$changes`), and prints `interface` or `full`; it always exits 0.
`interface` is for a change of the interface alone: one review and no StrykerJS. Everything else runs the full control, and so does
any doubt: every path must be on the interface list, or the answer is `full`. With --light it prints `light` when no path is a
security path, `full` otherwise: the radical mode's light gate (Alexis, 2026-11-04), whose harness files check.sh judges itself.

What counts as security, and what counts as interface, is one place: the tables of <root>/docs/REVIEW.md. Tier 1's backticked paths
are the security paths (keys, the CSP, chain reads, login, roles, the worker, deployment); tier 3's are the interface. A path under
both is security (app/src/features/login/ sits under app/src/features/). A table it cannot read, or a list it reads empty, is `full`.
An interface path is a folder written with its slash, compared exactly; a security path is compared in NFC and with its case
folded, as a Mac's disk reads names (F164). A path it cannot place, which is to say a quoted, absolute, rewritten (`..`, `.`, `//`,
a backslash), padded or control-character name, a name that is not UTF-8, a link or a path through one, is `full`."""
import os
import re
import sys
import unicodedata

FULL, INTERFACE, LIGHT = "full", "interface", "light"
CELLS = re.compile(r"`([^`]+)`")


def rows(root):
    """({tier: [backticked paths of the cell that names what the tier holds]}) of docs/REVIEW.md's table; none when unreadable."""
    found = {"1": [], "3": []}
    with open(os.path.join(root, "docs", "REVIEW.md"), encoding="utf-8") as f:
        for line in f:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if line.lstrip().startswith("|") and len(cells) >= 2 and cells[0] in found:
                found[cells[0]] += CELLS.findall(cells[1])
    return found


def plain(path):
    """Whether a path is spelled the one way a path of the change is: no control character, no padding, no backslash or quote."""
    parts = path.split("/")
    return (
        bool(path)
        and path == path.strip()
        and not any(ord(c) < 32 or ord(c) == 127 or c in '\\"' for c in path)
        and not path.startswith("/")
        and all(p not in ("", ".", "..") for p in parts)
    )


def folded(path):
    return unicodedata.normalize("NFC", path).casefold()


def linked(root, path):
    """Whether the path, or a folder on its way, is a link on disk (a link under an interface folder leads anywhere)."""
    parts = path.split("/")
    return any(os.path.islink(os.path.join(root, *parts[: n + 1])) for n in range(len(parts)))


def secure(root, path, security):
    """Whether a path is a tier-1 path, or one this script cannot place, which counts as one."""
    n = folded(path)
    return not plain(path) or linked(root, path) or any(n == s or (s.endswith("/") and n.startswith(s)) for s in security)


def speed(root, paths):
    table = rows(root)
    security = [folded(p) for p in table["1"]]
    interface = [p for p in table["3"] if p.endswith("/") and plain(p[:-1]) and p.count("/") >= 2]
    if not security or not interface or not paths:
        return FULL
    for path in paths:
        if secure(root, path, security) or not any(path.startswith(i) for i in interface):
            return FULL
    return INTERFACE


def light(root, paths):
    """`light` when no path is a tier-1 path (the radical mode's light gate, check.sh), `full` otherwise or with nothing to read."""
    security = [folded(p) for p in rows(root)["1"]]
    if not security or not paths or any(secure(root, path, security) for path in paths):
        return FULL
    return LIGHT


def main(argv):
    try:
        judge, args = (light, argv[2:]) if argv[1:2] == ["--light"] else (speed, argv[1:])
        if len(args) != 1:
            return FULL
        text = sys.stdin.buffer.read().decode("utf-8")
        return judge(args[0], [p for p in text.split("\n") if p])
    except (OSError, ValueError):  # a table or a name it cannot read, bytes that are not text
        return FULL


if __name__ == "__main__":
    print(main(sys.argv))
