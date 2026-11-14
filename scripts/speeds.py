"""speeds.py --tier1 <root>: `tier1` or `other` for a change, by docs/REVIEW.md's tier-1 rows (GitHub's detector, scripts/ci_changes.sh,
run from the base; check_docs.py and patch_coverage.py read the table through rows and secure).

Reads the paths of a change on stdin, one a line, and prints `tier1` when one is a tier-1 path or one it cannot place, `other` when none
is; it always exits 0. Tier 1's backticked paths are the security paths (keys, the CSP, chain reads, login, roles, the worker,
deployment), compared in NFC and with their case folded, as a Mac's disk reads names (F164); a folder is written with its slash. A table
it cannot read, a list it reads empty, a path it cannot place (quoted, absolute, rewritten: `..`, `.`, `//`, a backslash; padded, a
control character, not UTF-8, a link or a path through one), and any other call (the merge check's two speeds and the radical mode's
light gate left with check.sh's old lanes, D13168) are `tier1`."""
import os
import re
import sys
import unicodedata

CELLS = re.compile(r"`([^`]+)`")


def rows(root):
    """{"1": [the backticked paths of the cell that names what tier 1 holds]} of docs/REVIEW.md's table."""
    found = {"1": []}
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


def tier1(root, paths):
    """`tier1` when a path is a tier-1 path, or one this script cannot place, or the table or the change is empty; `other` when none is
    (GitHub's detector, ci_changes.sh). Every doubt is `tier1`."""
    security = [folded(p) for p in rows(root)["1"]]
    return "other" if security and paths and not any(secure(root, path, security) for path in paths) else "tier1"


def main(argv):
    try:
        paths = [p for p in sys.stdin.buffer.read().decode("utf-8").split("\n") if p]
        return tier1(argv[2], paths) if argv[1:2] == ["--tier1"] and len(argv) == 3 else "tier1"
    except (OSError, ValueError):  # a table or a name it cannot read, bytes that are not text
        return "tier1"


if __name__ == "__main__":
    print(main(sys.argv))
