"""check_comments.py: comments stay short and keep only what code cannot say (CLAUDE.md).

In TypeScript, JavaScript and CSS files: a file's header is 6 lines at most, any other
comment 3; no TODO marker (a deferral goes in the backlog), no banner, no numbered steps,
no emoji. Lines holding only a comment's delimiters do not count.
scripts/probe.py plants each fault. Usage: check_comments.py [root]"""
import pathlib
import re
import sys

SKIP = {"node_modules", "docs", "coverage", "reports", ".stryker-tmp", ".git", "r", "tools"}
MARKER = re.compile(r"\b(TODO|FIXME|XXX|HACK)\b")
BANNER = re.compile(r"[-=*#~_]{4,}")
STEP = re.compile(r"^\s*(\d+[.)]\s|step \d+\b)", re.I)
EMOJI = re.compile("[☀-➿\U0001f300-\U0001faff]")
TRAILING = re.compile(r"(?<![:\w\"'`])//(.*)$")


def comments(lines):
    """(line number, text, whether the line holds nothing but comment) for each comment line."""
    inside = False
    for n, line in enumerate(lines, 1):
        s = line.strip()
        if inside or s.startswith("/*"):
            inside = "*/" not in s or (s.startswith("/*") and s.endswith("/*"))
            text = re.sub(r"^/\*+|\*+/$|^\*", "", s).strip()
            yield n, text, True
        elif s.startswith("//"):
            yield n, s[2:].strip(), True
        elif m := TRAILING.search(line):
            yield n, m.group(1).strip(), False


root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
files = [p for ext in ("ts", "tsx", "mjs", "css") for p in root.rglob(f"*.{ext}") if not SKIP & set(p.relative_to(root).parts)]
problems = []
for path in files:
    lines = path.read_text().splitlines()
    runs, last = [], None
    for n, text, whole in comments(lines):
        for kind, pattern in (("a TODO marker", MARKER), ("a banner", BANNER), ("a numbered step", STEP), ("an emoji", EMOJI)):
            if pattern.search(text):
                problems.append(f"{path}:{n}: {kind} in a comment")
        if whole:
            if last is not None and n == last + 1:
                runs[-1].append((n, text))
            else:
                runs.append([(n, text)])
            last = n
    for run in runs:
        counted = [n for n, text in run if text]
        header = run[0][0] == 1
        limit = 6 if header else 3
        if len(counted) > limit:
            what = "header" if header else "comment"
            problems.append(f"{path}:{run[0][0]}: {what} longer than {limit} lines ({len(counted)}); keep only what the code cannot say")
if problems:
    print(*problems, sep="\n", file=sys.stderr)
    sys.exit(1)
