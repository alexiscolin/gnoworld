# check_docs.py: the harness's docs name only harness files that exist, so they cannot drift
# from the repo unnoticed. It reads CLAUDE.md, docs/DEVELOPMENT.md, docs/REVIEW.md and
# .claude/**/*.md (the ADRs, plans and ARCHITECTURE describe the future too), and checks
# every `scripts/`, `.claude/`, `docs/`, `adr/` or `.githooks/` path written in backticks.
# Paths with a template variable or under .claude/tmp/ are skipped. It also checks the findings
# ledger, docs/review/findings.md (docs/REVIEW.md). Usage: check_docs.py [root]
import pathlib
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # -I leaves this folder off the path
from repo_files import listed

STATUSES = {"claimed", "reproduced", "fixed", "rejected", "asked"}


def is_commit(root, sha):
    """Whether sha names a commit of root's repository; None outside a repository (the staged copy)."""
    if subprocess.run(["git", "-C", str(root), "rev-parse", "--git-dir"], capture_output=True).returncode != 0:
        return None
    return subprocess.run(["git", "-C", str(root), "cat-file", "-e", f"{sha}^{{commit}}"], capture_output=True).returncode == 0


def ledger_problems(root):
    """Each row of the findings ledger: a known status, a fixed one's commit, a rejected one's reason, a unique id."""
    ledger, seen, out = root / "docs/review/findings.md", set(), []
    if not ledger.is_file():
        return out
    for line in ledger.read_text().splitlines():
        cells = [c.strip() for c in re.split(r"(?<!\\)\|", line.strip().strip("|"))]
        if len(cells) != 7 or not re.fullmatch(r"F\d{3}", cells[0]):
            continue
        fid, status, evidence = cells[0], cells[5], cells[6]
        shas = re.findall(r"`([0-9a-f]{7,40})`", evidence)
        if fid in seen:
            out.append(f"{fid}: the id is used twice")
        seen.add(fid)
        if status not in STATUSES:
            out.append(f"{fid}: status {status!r} is none of {', '.join(sorted(STATUSES))}")
        elif status == "fixed" and not any(is_commit(root, s) is not False for s in shas):
            out.append(f"{fid}: fixed, but its evidence names no commit of this repository in backticks")
        elif status in ("rejected", "reproduced", "asked") and evidence in ("", "—", "-"):
            out.append(f"{fid}: {status}, with no evidence or reason")
    return out

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
harness = ("CLAUDE.md", "docs/DEVELOPMENT.md", "docs/REVIEW.md", "docs/HARNESS.md")
files = [p for p in listed(root, {".md"}) if p.relative_to(root).as_posix() in harness or p.relative_to(root).parts[0] == ".claude"]
path = re.compile(r"`((?:scripts|\.claude|docs|adr|\.githooks)/[^`\s*]*)`")
missing = []
for f in files:
    if not f.is_file():
        continue
    for m in path.finditer(f.read_text()):
        p = m.group(1).split(":")[0].split("#")[0]
        if "$" in p or p.startswith(".claude/tmp"):
            continue
        if not (root / p).exists():
            missing.append(f"{f.relative_to(root)}: {p}")
if missing:
    print("check_docs: these docs name files that do not exist:", *missing, sep="\n  ", file=sys.stderr)
problems = ledger_problems(root)
if problems:
    print("check_docs: the findings ledger (docs/review/findings.md):", *problems, sep="\n  ", file=sys.stderr)
# A test sits beside the file it tests, under its name (docs/ARCHITECTURE.md, "Naming").
tests = [p for p in root.glob("*/**/src/**/*.test.ts*") if "node_modules" not in p.parts]
orphans = [t.relative_to(root) for t in tests if not any(t.with_name(t.name.replace(".test.", ".", 1)).with_suffix(s).exists() for s in (".ts", ".tsx"))]
if orphans:
    print("check_docs: these tests sit beside no file of their name:", *orphans, sep="\n  ", file=sys.stderr)
if missing or problems or orphans:
    sys.exit(1)
