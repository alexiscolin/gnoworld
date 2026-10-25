# check_docs.py: the harness's docs name only harness files that exist, so they cannot drift
# from the repo unnoticed. It reads CLAUDE.md, docs/DEVELOPMENT.md, docs/REVIEW.md and
# .claude/**/*.md (the ADRs, plans and ARCHITECTURE describe the future too), and checks
# every `scripts/`, `.claude/`, `docs/`, `adr/` or `.githooks/` path written in backticks.
# Paths with a template variable or under .claude/tmp/ are skipped. It also checks the findings
# ledger, docs/review/findings.md (docs/REVIEW.md), and the runbook's alerts and known limits.
# Usage: check_docs.py [root]
import pathlib
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # -I leaves this folder off the path
from repo_files import listed

# As Anthropic sorts its reviewer's comments: fixed, wrong (rejected), wanted (intended), of no
# matter (moot); and the ones still open: claimed, reproduced, asked.
STATUSES = {"claimed", "reproduced", "fixed", "rejected", "intended", "moot", "asked"}
# The known limits slice 3's plan has the runbook say (its section 8; 3M-19), each by a phrase of its line.
LIMITS = [
    "evaded with a new address",
    "a connection already open lasts until it drops",
    "A mistaken hide stays",
    "left unchecked by a provider outage",
    "Restricted, not encrypted",
    "never sent to OpenAI",
    "100 accounts a members room",
    "Nobody is invited at login",
    "no age: decision 154's 14 days",
    "Ergo deletes history by age alone",
    "the erasure path (slice 12) are blockers",
]


def commits(root, shas):
    """Which of shas name a commit of root's repository, in one call; all of them outside a repository (the
    staged copy), where none can be read."""
    if subprocess.run(["git", "-C", str(root), "rev-parse", "--git-dir"], capture_output=True).returncode != 0:
        return set(shas)
    asked = "".join(f"{sha}^{{commit}}\n" for sha in shas)
    kinds = subprocess.run(["git", "-C", str(root), "cat-file", "--batch-check=%(objecttype)"], input=asked,
                           capture_output=True, text=True).stdout.splitlines()
    return {sha for sha, kind in zip(shas, kinds) if kind == "commit"}


def ledger_problems(root):
    """Each row of the findings ledger: a known status, a fixed one's commit, every commit it cites a real one, a
    rejected one's reason, a unique id."""
    ledger, seen, out = root / "docs/review/findings.md", set(), []
    if not ledger.is_file():
        return out
    rows = []
    for line in ledger.read_text().splitlines():
        cells = [c.strip() for c in re.split(r"(?<!\\)\|", line.strip().strip("|"))]
        if len(cells) == 7 and re.fullmatch(r"F\d{3}", cells[0]):
            rows.append((cells[0], cells[5], cells[6], re.findall(r"`([0-9a-f]{7,40})`", cells[6])))
    real = commits(root, [sha for *_, shas in rows for sha in shas])
    for fid, status, evidence, shas in rows:
        if fid in seen:
            out.append(f"{fid}: the id is used twice")
        seen.add(fid)
        if status not in STATUSES:
            out.append(f"{fid}: status {status!r} is none of {', '.join(sorted(STATUSES))}")
        elif status == "fixed" and not shas:
            out.append(f"{fid}: fixed, but its evidence names no commit in backticks")
        elif status in ("rejected", "intended", "moot", "reproduced", "asked") and evidence in ("", "—", "-"):
            out.append(f"{fid}: {status}, with no evidence or reason")
        out += [f"{fid}: cites {sha}, no commit of this repository" for sha in shas if sha not in real]
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
tests = [p for p in listed(root, {".ts", ".tsx"}) if re.search(r"\.test\.tsx?$", p.name) and "src" in p.relative_to(root).parts]
orphans = [t.relative_to(root) for t in tests if not any(t.with_name(t.name.replace(".test.", ".", 1)).with_suffix(s).exists() for s in (".ts", ".tsx"))]
if orphans:
    print("check_docs: these tests sit beside no file of their name:", *orphans, sep="\n  ", file=sys.stderr)
# The alerts the server logs are OPERATIONS.md's "Every alert", which ops matches, both ways (3n; F646): each
# log("alert", { ..., error: "x" }), however laid out, a test's none. An "alert" written otherwise (a template, a
# constant) or a name no literal cannot be read: it fails (F637).
event = re.compile(r"""[`"']alert[`"']""")
named = re.compile(r"""log\(\s*["']alert["']\s*,\s*\{[^}]*?\berror:\s*["']([a-z_]+)["']""")
sources = [p for p in listed(root, {".ts"}) if p.relative_to(root).parts[:2] == ("server", "src") and ".test." not in p.name]
alerts, unread = set(), []
for p in sources:
    text = p.read_text()
    found = named.findall(text)
    alerts |= set(found)
    if len(event.findall(text)) > len(found):
        unread.append(str(p.relative_to(root)))
runbook = root / "docs/OPERATIONS.md"
said = runbook.read_text() if runbook.is_file() else ""
bullet = re.search(r"^- \*\*Every alert\*\*(.*?)(?=^- \*\*|^#|\Z)", said, re.S | re.M)
listed_alerts = set(re.findall(r"`([a-z_]+)`", bullet.group(1) if bullet else ""))
unnamed = [f"{a}: logged, not in the alerts list" for a in sorted(alerts - listed_alerts)]
unnamed += [f"{a}: listed, never logged" for a in sorted(listed_alerts - alerts)]
unnamed += [f"{f}: an alert whose name is no literal" for f in unread]
if unnamed:
    print("check_docs: the server's alerts and docs/OPERATIONS.md's list of them differ:", *unnamed, sep="\n  ", file=sys.stderr)
# A runbook says each known limit, its line wrapped anyhow; a folder with no runbook (a test's) has none to say.
lost = [limit for limit in LIMITS if runbook.is_file() and limit not in " ".join(said.split())]
if lost:
    print("check_docs: docs/OPERATIONS.md no longer says these known limits (slice 3's plan, section 8):", *lost, sep="\n  ", file=sys.stderr)
if missing or problems or orphans or unnamed or lost:
    sys.exit(1)
