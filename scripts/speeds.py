"""speeds.py <root>: the merge check's two speeds (slice 7, question 21); speeds.py --light <root>, the radical mode's light gate.

Reads the paths of a change on stdin, one a line (check.sh's own `$changes`), and prints `interface` or `full`; it always exits 0.
`interface` is for a change of the interface alone: one review and no StrykerJS. Everything else runs the full control, and so does
any doubt: every path must be on the interface list, or the answer is `full`. `speeds.py --light <root> <main's table>` prints `light`
when no path is a security path of either table, `full` otherwise: the radical mode's light gate (Alexis, 2026-11-04), whose harness
files check.sh judges itself.

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


def rows(root, table=None):
    """({tier: [backticked paths of the cell that names what the tier holds]}) of docs/REVIEW.md's table, or of the file `table`."""
    found = {"1": [], "3": []}
    with open(table or os.path.join(root, "docs", "REVIEW.md"), encoding="utf-8") as f:
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


def folders(table):
    """The tier-3 folders of a table: each written with its slash, spelled as a plain path, two levels down at least."""
    return [p for p in table["3"] if p.endswith("/") and plain(p[:-1]) and p.count("/") >= 2]


def within(root, paths, security, interface):
    """Whether every path is under an interface folder and none is a security path, or one this script cannot place; never with no
    security path, no folder or no path to compare."""
    return bool(security and interface and paths) and all(
        not secure(root, path, security) and any(path.startswith(i) for i in interface) for path in paths
    )


def speed(root, paths):
    table = rows(root)
    return INTERFACE if within(root, paths, [folded(p) for p in table["1"]], folders(table)) else FULL


def light(root, main_table, paths):
    """`light` when no path is a tier-1 path of the tree's table or of main's (the radical mode's light gate, check.sh): a row the change
    drops from the tree's stays main's. `full` otherwise, or when either table holds no tier-1 row, or with nothing to read."""
    tree, main = (([folded(p) for p in rows(root, table)["1"]]) for table in (None, main_table))
    if not tree or not main or not paths or any(secure(root, path, tree + main) for path in paths):
        return FULL
    return LIGHT


def main(argv):
    try:
        text = sys.stdin.buffer.read().decode("utf-8")
        paths = [p for p in text.split("\n") if p]
        if argv[1:2] == ["--light"]:
            return light(argv[2], argv[3], paths) if len(argv) == 4 else FULL
        return speed(argv[1], paths) if len(argv) == 2 else FULL
    except (OSError, ValueError):  # a table or a name it cannot read, bytes that are not text
        return FULL


if __name__ == "__main__":
    print(main(sys.argv))
