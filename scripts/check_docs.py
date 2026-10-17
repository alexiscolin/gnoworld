# check_docs.py: the harness's docs name only harness files that exist, so they cannot drift
# from the repo unnoticed. It reads CLAUDE.md, docs/*.md and .claude/**/*.md, and checks
# every `scripts/`, `.claude/`, `docs/`, `adr/` or `.githooks/` path written in backticks.
# Paths with a template variable or under .claude/tmp/ are skipped. Usage: check_docs.py [root]
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
files = [root / "CLAUDE.md", *root.glob("docs/*.md"), *root.glob(".claude/**/*.md")]
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
    sys.exit(1)
