# check_docs.py: the harness's docs name only harness files that exist, so they cannot drift
# from the repo unnoticed. It reads CLAUDE.md, docs/DEVELOPMENT.md, docs/REVIEW.md and
# .claude/**/*.md (the ADRs, plans and ARCHITECTURE describe the future too), and checks
# every `scripts/`, `.claude/`, `docs/`, `adr/` or `.githooks/` path written in backticks.
# Paths with a template variable or under .claude/tmp/ are skipped. It also checks the findings
# ledger, docs/review/findings.md (docs/REVIEW.md), the runbook's alerts and known limits, and
# that no file git tracks or would, as staged or in the work tree, no name, link or commit message
# of the branch holds a hidden character (F5053, F5087, F5089).
# Usage: check_docs.py [root]
import os
import pathlib
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # -I leaves this folder off the path
import speeds
from hidden import hidden_in, hidden_in_data
from repo_files import git, listed, listing

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


# What an agent's brief or the review card must keep saying, which nothing else reads: a line cut from one stays green.
# Every review agent never writes a worktree's git index (2026-10-26: one staged old files into wt-4dm's and failed the
# next commit's gate); CLAUDE.md's review card ends with the change's risk and undo.
AGENT_RULE = "Never run a git command that writes the index or the work tree"
AGENTS = ("design-reviewer", "reviewer", "security-reviewer", "test-auditor")  # each must exist (CR2); the finding-verifier left (2026-11-04)
CARD_ITEM = re.compile(r"^8\. Risk and undo:", re.M)


def lost_rules(root):
    """The agents' files missing or without the index rule, and a CLAUDE.md missing or whose review card lost its item 8."""
    briefs = {f".claude/agents/{name}.md" for name in AGENTS} | {p.relative_to(root).as_posix() for p in root.glob(".claude/agents/*.md")}
    out = []
    for brief in sorted(briefs):
        p = root / brief
        if not p.is_file():
            out.append(f"{brief}: the agent's brief is missing")
        elif AGENT_RULE not in " ".join(p.read_text().split()):
            out.append(f"{brief}: no sentence `{AGENT_RULE}`")
    claude = root / "CLAUDE.md"
    if not claude.is_file() or not CARD_ITEM.search(claude.read_text()):
        out.append("CLAUDE.md: the review card has no item `8. Risk and undo:`")
    return out


# The instructions Claude Code reads beside the root's (its memory and skills pages): a subfolder's CLAUDE.md and CLAUDE.local.md, an
# AGENTS.md where no CLAUDE.md stands, and a subfolder's .claude/rules and .claude/skills, each loaded once a file there is read (S2-3).
INSTRUCTIONS = {"claude.md", "claude.local.md", "agents.md"}
ROOT_OWN = {("claude.md",), (".claude", "claude.md")}


def stray_instructions(root):
    """Each path git would hold that Claude Code may read as instructions, past the root's closed CLAUDE.md: one of those names
    anywhere but the root's CLAUDE.md and .claude/CLAUDE.md (a CLAUDE.local.md is a person's own, never committed; an AGENTS.md
    stands in for a CLAUDE.md), and any .claude below the root. Names are read as macOS's disk reads them, case folded, and a
    link by its name, whether it leads anywhere or not."""
    out = []
    for p in listing(root):
        parts = tuple(part.lower() for part in p.relative_to(root).parts)
        if ".claude" in parts[1:]:
            out.append(f"{p.relative_to(root)}: a .claude folder below the root")
        elif parts[-1] in INSTRUCTIONS and parts not in ROOT_OWN:
            out.append(f"{p.relative_to(root)}: an instruction file Claude Code reads beside the root's")
    return sorted(out)


# An image is no text: a file whose suffix names one and that starts with its format's own bytes is not read (a text so
# named is). Any other file is UTF-8 text read for what hidden.py names (F5053), or is refused: a binary of another format
# (a font, a video) wants its suffix and first bytes here first (F5082).
IMAGES = {".png": b"\x89PNG\r\n\x1a\n", ".jpg": b"\xff\xd8\xff", ".webp": b"RIFF"}  # a WebP is RIFF, then its size, then WEBP


def messages(root):
    """(short sha, message) of each commit since the branch left origin/main (F5079): none outside a repository (the
    pre-commit's staged copy) or with no origin/main to say where the branch starts. A git that cannot run, or fails, raises:
    for-each-ref answers nothing for a missing ref, so a failure is never taken for one."""
    if not (root / ".git").exists():
        return []
    if not git("-C", str(root), "for-each-ref", "--format=%(objectname)", "refs/remotes/origin/main"):
        return []
    log = git("-C", str(root), "log", "-z", "--format=%h%x00%B", "refs/remotes/origin/main..HEAD").split("\0")
    return list(zip(log[0::2], log[1::2]))


def staged(root):
    """{path: (bytes, whether a link)} of each blob the index holds, what a commit takes (F5087), a link's target its bytes:
    none outside a repository (the pre-commit's staged copy, whose files are the index's). A gitlink (a submodule) holds no
    text. A git that cannot run, or fails, raises."""
    if not (root / ".git").exists():
        return {}
    entries = [entry.split("\t", 1) for entry in git("-C", str(root), "ls-files", "-z", "--stage").split("\0") if entry]
    blobs = [(info.split()[0], info.split()[1], path) for info, path in entries if not info.startswith("160000 ")]
    batch = subprocess.run(["git", "-C", str(root), "cat-file", "--batch"], input="".join(f"{sha}\n" for _, sha, _ in blobs).encode(),
                           capture_output=True, check=True).stdout
    held, at = {}, 0
    for mode, _, path in blobs:  # each `<sha> blob <size>`, the bytes, a newline
        start = batch.index(b"\n", at) + 1
        end = start + int(batch[at:start].split()[2])
        held[path], at = (batch[start:end], mode == "120000"), end + 1
    return held


def text_of(where, path, data):
    """hidden_in_data of a file's bytes, but none of an image's."""
    suffix = pathlib.PurePosixPath(path).suffix
    return [] if suffix in IMAGES and data.startswith(IMAGES[suffix]) else hidden_in_data(where, data)


def hidden(root):
    """Each hidden character, and each file that is no UTF-8 text: of what a commit takes, the index's copy of each file and
    link; of the work tree's copy where it differs, and of what git would track; of every name (F5089); and of the branch's
    commit messages."""
    out = []
    try:
        held = staged(root)
    except (OSError, subprocess.CalledProcessError) as e:
        held = {}
        out.append(f"git cannot read the index, so nothing staged is proven clean: {e}")
    for path, (data, link) in held.items():
        out += text_of(path + " (link)" * link, path, data)
    names = set(held)
    for p in listing(root):
        path, link = p.relative_to(root).as_posix(), p.is_symlink()
        names.add(path)
        if not (link or p.is_file()):
            continue
        data = os.fsencode(os.readlink(p)) if link else p.read_bytes()
        if held.get(path) != (data, link):
            out += text_of(path + " (link)" * link + " (work tree)" * (path in held), path, data)
    for path in sorted(names):
        out += hidden_in(f"the name {ascii(path)}", path)
    try:
        for sha, message in messages(root):
            out += hidden_in(f"commit {sha}", message)
    except (OSError, subprocess.CalledProcessError) as e:
        out.append(f"git cannot read the branch's commit messages, so none is proven clean: {e}")
    return out


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
        if line.lstrip().startswith("|") and re.fullmatch(r"F\d{3,}", cells[0]):
            # A row of other than seven cells was skipped by every check below (1,992 rows read, 95 with more and 14 with fewer were not).
            if len(cells) != 7:
                out.append(f"{cells[0]}: {len(cells)} cells, not 7 (a pipe inside a cell is written \\|)")
                continue
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
rules = lost_rules(root)
if rules:
    print("check_docs: a rule the review depends on is gone:", *rules, sep="\n  ", file=sys.stderr)
if problems:
    print("check_docs: the findings ledger (docs/review/findings.md):", *problems, sep="\n  ", file=sys.stderr)
# No instruction file below the root reaches a commit (7w3, S2-3): every commit runs this, prose alone included.
stray = stray_instructions(root)
if stray:
    print("check_docs: instructions every session reading their folder would follow, past the root's CLAUDE.md:", *stray, sep="\n  ", file=sys.stderr)
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
# docs/REVIEW.md's tier-1 rows and the workflow's TIER1 name the same paths, both ways (F2530): pre-commit runs this on every commit,
# prose alone included, so a row the table gains or loses without the workflow stops at its own commit, which took a change of the
# table for prose and ran no gate (7y's c160019e, F4928). The table is read as speeds.py reads it, one reader for both. The harness's
# folders and gno/ are tier 1 by the harness's own rule: TIER1 must hold them; the realms' two folders are the table's `gno/r/` and
# `gno/p/`. A comment in the list is no entry. A root with no tier-1 row (a test's) has none to compare.
review = root / "docs/REVIEW.md"
named = set(speeds.rows(str(root))["1"]) - {"gno/r/", "gno/p/"} if review.is_file() else set()
workflow = root / ".claude/workflows/branch.js"
src = workflow.read_text() if workflow.is_file() else ""
block = src[src.find("const TIER1 = ["):src.find("...(A.tier1")] if "const TIER1 = [" in src else ""
entries = set(re.findall(r'^\s+"([^"]+)",$', re.sub(r"/\*.*?\*/|//[^\n]*", "", block, flags=re.S), re.M))
OWN = {"scripts/", ".githooks/", ".github/", ".claude/", "gno/"}
tier1 = entries - OWN
drift = [] if not named else [".claude/workflows/branch.js holds no TIER1 list to compare with"] if len(tier1) < 10 else []
drift += [f"branch.js's TIER1 lacks {p}, tier 1 by the harness's own rule" for p in sorted(OWN - entries) if named and tier1]
drift += [f"branch.js's TIER1 holds {p}, which no tier-1 row of docs/REVIEW.md names in backticks" for p in sorted(tier1 - named) if named]
drift += [f"docs/REVIEW.md names {p} as tier 1 in backticks, which branch.js's TIER1 lacks" for p in sorted(named - tier1) if tier1]
if drift:
    print("check_docs: docs/REVIEW.md's tier 1 and the workflow's TIER1 differ: change both in one commit:", *drift, sep="\n  ", file=sys.stderr)
hidden_chars = hidden(root)
if hidden_chars:
    print("check_docs: these files hold a hidden character, which shows nothing or changes how the text around it reads"
          " (F5053); write each as an escape, never raw, and every text in UTF-8 (an image is known by its suffix and first"
          " bytes, IMAGES):", *hidden_chars, sep="\n  ", file=sys.stderr)
if hidden_chars or missing or problems or orphans or unnamed or lost or rules or drift:
    sys.exit(1)
if stray:
    sys.exit(1)
