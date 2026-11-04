"""stryker_lines.py: the merge check's StrykerJS config, its `mutate` the code the branch changed since its base alone (Alexis, 2026-11-04:
"Lignes de la tranche"), so a survivor in code it did not touch goes unseen, as those of the files it did not change do.

StrykerJS 10.0.0 mutates a node only when its whole span lies inside one range (instrumenter syntax-helpers.js, locationIncluded), so a
changed line widens to the top-level statements it lies in, as TypeScript's own parser reads them: a function, a class, a declaration, an
`if (a &&\n b)` whose one line changed included. Each run is `path:from-to` (core's project-reader.js, MUTATION_RANGE_REGEX, from 1, lines
whole), in the files stryker.config.json's own `mutate` selects: its patterns, braces expanded, read as git's glob pathspecs, a negation as an
exclusion, a path with a hidden part left out as minimatch leaves it. A new file, committed or not, counts whole; a line removed, or a
comment's, touches none. Every other key of the config is kept.
Usage, from the repository's root: stryker_lines.py <base> <out.json>. It writes the config and says what it kept; with no such line it
writes nothing and exits 3; a config it cannot read, or a pattern git does not read as minimatch does (`?`, a class, an extglob), exit 2."""
import json
import pathlib
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # -I leaves this folder off the path
from repo_files import changed_lines, git

# A pattern git's glob pathspecs read as minimatch does: names, `*` within a part, `**` across them.
PLAIN = re.compile(r"[\w./*-]+")
BRACES = re.compile(r"\{([^{}]*)\}")
# Each top-level statement's first and last line, by TypeScript's parser (a statement's leading comments are no part of it).
SPANS = """import ts from "typescript";
import { readFileSync } from "node:fs";
for (const path of process.argv.slice(1)) {
  const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const line = (at) => file.getLineAndCharacterOfPosition(at).line + 1;
  for (const statement of file.statements) console.log(`${path}\\t${line(statement.getStart(file))}\\t${line(statement.end)}`);
}
"""


def expanded(pattern):
    """A pattern with its braces, `{ts,tsx}`, expanded: git's pathspecs have none."""
    found = BRACES.search(pattern)
    if found is None:
        return [pattern]
    return [p for choice in found.group(1).split(",") for p in expanded(pattern[: found.start()] + choice + pattern[found.end() :])]


def pathspecs(patterns):
    """StrykerJS's `mutate` patterns as git's pathspecs, or None when one is not read alike."""
    if not isinstance(patterns, list) or not patterns or not all(isinstance(p, str) for p in patterns):
        return None
    specs = []
    for pattern in patterns:
        negated = pattern.startswith("!")
        for each in expanded(pattern[1:] if negated else pattern):
            if not PLAIN.fullmatch(each):
                return None
            specs.append(f":(glob,exclude){each}" if negated else f":(glob){each}")
    return specs


def statements(paths):
    """{path: [(first, last)]}, the top-level statements of each file."""
    found = {path: [] for path in paths}
    out = subprocess.run(["node", "--input-type=module", "-e", SPANS, *paths], capture_output=True, text=True, check=True).stdout
    for row in out.splitlines():
        path, first, last = row.rsplit("\t", 2)
        found[path].append((int(first), int(last)))
    return found


def runs(lines):
    """The runs of consecutive lines, as (from, to)."""
    out = []
    for line in sorted(lines):
        if out and line == out[-1][1] + 1:
            out[-1][1] = line
        else:
            out.append([line, line])
    return [tuple(run) for run in out]


def selected(base, specs):
    """{path: the lines of the top-level statements its change touches}, a hidden path left out."""
    lines = changed_lines("--no-renames", base, "--", *specs)
    for path in git("ls-files", "--others", "--exclude-standard", "--", *specs).splitlines():
        lines[path] = set(range(1, len(pathlib.Path(path).read_text(encoding="utf-8").splitlines()) + 1))
    lines = {p: found for p, found in lines.items() if found and not any(part.startswith(".") for part in p.split("/"))}
    spans = statements(sorted(lines))
    return {p: {n for first, last in spans[p] if any(first <= at <= last for at in found) for n in range(first, last + 1)} for p, found in lines.items()}


def main():
    base, out = sys.argv[1], sys.argv[2]
    try:
        config = json.loads(pathlib.Path("stryker.config.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"stryker_lines: stryker.config.json cannot be read ({e})", file=sys.stderr)
        sys.exit(2)
    specs = pathspecs(config.get("mutate") if isinstance(config, dict) else None)
    if specs is None:
        print("stryker_lines: stryker.config.json's mutate is no list of patterns git reads as minimatch does", file=sys.stderr)
        sys.exit(2)
    kept = {path: runs(found) for path, found in selected(base, specs).items() if found}
    if not kept:
        print(f"stryker_lines: no line StrykerJS mutates changed since {base}")
        sys.exit(3)
    config["mutate"] = [f"{path}:{start}-{end}" for path in sorted(kept) for start, end in kept[path]]
    pathlib.Path(out).write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    total = sum(end - start + 1 for found in kept.values() for start, end in found)
    print(f"stryker_lines: {total} lines in {len(kept)} files changed since {base}")


if __name__ == "__main__":
    main()
