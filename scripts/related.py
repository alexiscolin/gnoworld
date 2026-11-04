"""related.py: the unit tests a commit's change asks for, and the map that finds them (docs/HARNESS.md, "The related tests").

Vitest's own `related` command follows the module graph: a test runs when it imports a changed file, through any chain of
imports. What sits outside that graph, this script maps (Alexis, 2026-11-04: related tests at each commit, in every area, the
whole suite at a part's end and at merges):
- server/src/main.test.ts runs the server as a child process, which loads core and the schemas outside Vitest's graph: any code
  of the server, core or the schemas adds it. The server loads core's whole index (193 of their 216 files), so a closure of its
  imports would have spared 6 of slice 7's 226 commits that touch them.
- a file read from disk: every code file under the sources is grepped for the places it names on disk (READ, a path written from the
  repository's root, a root folder's name alone);
  a change at or under a place adds its reader, a test, or a module whose importers Vitest then finds. A place that is a
  workspace's or the repository's root, or a path built at run time, is a base a later argument completes (a copy of the app
  to build, a file a helper is given): it adds its reader for a change outside Vitest's graph only, as a change of code is
  followed by the graph.
- a file read as text through Vite (GLOB, QUERY: `import.meta.glob`, an import with `?raw`): Vitest's graph drops such an import
  (getTestDependencies keeps a dependency only when its path, query included, exists on disk), so its places are read like a
  file's, code included.
A file that names a place on disk in a form the grep cannot follow (__dirname, process.cwd(), import.meta.dirname, a resolve, a
glob not written out, import.meta.url anywhere but in `new URL(<path>, import.meta.url)`) is refused, file and line: what it
reads would never bring it back; so is a link or a special file under the sources, which the walk does not follow.

Usage, from the repository root: the changed paths on stdin, one a line, as check.sh lists them. It prints, shell-quoted on one
line, the paths for Vitest's `related` command: each changed path but prose (Vitest follows what imports it), and what the maps add.
`--check`: the refusal alone, nothing read or printed (a run of every test)."""
import os
import re
import shlex
import stat
import sys

SOURCES = re.compile(r"(?:app/src|app/tests|server/src|packages/[^/]+/src)/")
CODE = re.compile(r"\.(?:[cm]?[jt]s|[jt]sx)$")
TEST = re.compile(r"\.test\.tsx?$")
SERVER = ("server/src/", "packages/core/src/", "packages/schemas/src/")
MAIN = "server/src/main.test.ts"
# `new URL(<place>, import.meta.url...)`, its place a string, a template, or a name (built at run time).
READ = re.compile(r"""new URL\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`|([\w.$]+))\s*,\s*import\.meta\.url\b""")
# Vite's glob, its patterns a string or a list of them, written out as Vite wants them.
GLOB = re.compile(r"""import\.meta\.glob\b(?:<[^>()]*>)?\(\s*(\[[^\]]*\]|"[^"\n]*"|'[^'\n]*')""")
QUOTED = re.compile(r"""["'`]([^"'`\n]*)["'`]""")
QUERY = re.compile(r"""\b(?:from|import)\s*\(?\s*["']([^"'?\n]+)\?(?:raw|url|inline|worker|sharedworker)\b""")
# Every way to name a place on disk relative to a file or to the process: each must sit in a READ or a GLOB.
ANCHOR = re.compile(
    r"import\.meta\.(?:url|dirname|filename|resolve|glob)\b|\b__(?:dirname|filename)\b|process\.cwd\b|require\.resolve\b|\bcreateRequire\b"
)


def tops():
    """The repository's folders, as a path read from the process's folder starts: `packages/ui/src/x.css`."""
    return sorted(d for d in os.listdir(".") if os.path.isdir(d) and not d.startswith(".") and d != "node_modules")


def sources():
    """(path, plain) for every code file under the sources, from the disk (a commit's staged copy has no repository to ask);
    plain is false for a link or a special file, and for a linked folder, which the walk does not follow."""
    for top in ("app", "server", "packages"):
        for folder, dirs, files in os.walk(top):
            dirs[:] = sorted(d for d in dirs if d != "node_modules")
            for name in dirs + sorted(files):
                path = os.path.join(folder, name)
                if not SOURCES.match(path + "/"):
                    continue
                mode = os.lstat(path).st_mode
                if name in dirs:
                    if stat.S_ISLNK(mode):
                        yield path, False
                elif CODE.search(name):
                    yield path, stat.S_ISREG(mode)


def place(text, start, cut):
    """A place on disk as (path, prefix): `path` normalized from the repository's root, and whether only its start is known
    (a template cut at its first `${`, a glob at its first wildcard). None for a place outside the repository, or not on disk."""
    if "://" in text or text.startswith("/"):
        return None
    path = os.path.normpath(os.path.join(start, text))
    if path == ".":
        path = ""
    elif path.startswith(".."):
        return None
    if cut and text.endswith("/") and path:
        path += "/"
    return path, cut


def scan(top_folders):
    """(reads, refused): each read as (reader, path, prefix, text), text when the reader reads code as text (a glob, a query);
    each place the grep cannot follow as `file:line: text`."""
    literal = re.compile(r"""["'`](?:\./)?((?:%s)/[^"'`$\n]*)(\$\{)?""" % "|".join(map(re.escape, top_folders)))
    # A root folder's name alone: a path joined from parts (`join("deploy", ...)`, `["app", "data", f].join("/")`, `${top}/x`).
    bare = re.compile(r"""["'`](%s)["'`]""" % "|".join(map(re.escape, top_folders)))
    reads, refused = [], []
    for file, plain in sources():
        if not plain:
            refused.append(f"{file}: a link or a special file, which the map does not follow")
            continue
        with open(file, encoding="utf-8", errors="replace") as f:
            text = f.read()
        lines = text.splitlines()
        here = os.path.dirname(file)
        spans = []
        for m in READ.finditer(text):
            spans.append((m.start(), m.end()))
            got = None
            if m.group(1) is not None or m.group(2) is not None:
                got = place(m.group(1) if m.group(1) is not None else m.group(2), here, False)
            elif m.group(3) is not None:
                static = m.group(3).split("${", 1)[0]
                got = place(static, here, "${" in m.group(3)) if static else ("", True)
            else:
                got = ("", True)  # a name: built at run time, anywhere
            if got:
                reads.append((file, *got, False))
        for m in GLOB.finditer(text):
            spans.append((m.start(), m.end()))
            for pattern in QUOTED.findall(m.group(1)):
                if pattern.startswith("!"):
                    continue  # a pattern left out reads less: the others hold it
                static = re.split(r"[*?[{]", pattern, maxsplit=1)[0]
                got = place(static, here, static != pattern)
                if got:
                    reads.append((file, *got, True))
        for m in QUERY.finditer(text):
            got = place(m.group(1), here, False)
            if got:
                reads.append((file, *got, True))
        for m in literal.finditer(text):
            got = place(m.group(1), "", m.group(2) is not None)
            if got:
                reads.append((file, *got, False))
        for m in bare.finditer(text):
            reads.append((file, m.group(1), False, False))
        for m in ANCHOR.finditer(text):
            if not any(a <= m.start() < b for a, b in spans):
                line = text.count("\n", 0, m.start()) + 1
                refused.append(f"{file}:{line}: {lines[line - 1].strip()[:120]}")
    return reads, refused


def base(path, top_folders):
    """A workspace's or the repository's root: what a later argument completes."""
    folder = path.rstrip("/")
    return folder == "" or folder in top_folders or re.fullmatch(r"packages/[^/]+", folder) is not None


def prose(path):
    """What check.sh reads as prose: the docs, the ADRs, Markdown outside the sources (a recorded page under them is a fixture)."""
    return path.startswith(("docs/", "adr/")) or (path.endswith(".md") and not SOURCES.match(path))


def covers(read, path, top_folders):
    _, at, prefix, text = read
    if not text and base(at, top_folders) and CODE.search(path) and SOURCES.match(path):
        return False  # code is followed by Vitest's graph
    if prefix or at == "":
        return path.startswith(at)
    return path == at or path.startswith(at + "/")


def main():
    if sys.argv[1:] not in ([], ["--check"]):
        sys.exit("usage: related.py [--check] < changed paths")
    top_folders = tops()
    reads, refused = scan(top_folders)
    if refused:
        for where in refused:
            print(f"related.py: {where}", file=sys.stderr)
        sys.exit(
            "related.py: these name a place on disk the map of related tests cannot follow, so a change there would never run them;"
            ' name it as new URL("<path>", import.meta.url) (docs/HARNESS.md, "The related tests")'
        )
    if sys.argv[1:] == ["--check"]:
        return
    out = set()
    for path in sys.stdin.read().split("\n"):
        if not path or prose(path):
            continue
        out.add(path)  # Vitest follows its importers, a JSON or a stylesheet of app/data or app/lab too (F4810)
        if path.startswith(SERVER) and CODE.search(path) and not TEST.search(path):
            out.add(MAIN)
        out.update(read[0] for read in reads if covers(read, path, top_folders))
    print(" ".join(shlex.quote(p) for p in sorted(out)))


if __name__ == "__main__":
    main()
