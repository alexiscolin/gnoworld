"""lint_scope.py: the files a commit's lint reads, its change and every file that imports it at any depth (docs/HARNESS.md, "The gate").

ESLint's own cache keys a file on its own text, and this config's typed rules read other files' types: a type changed in a.ts turns an
unchanged b.ts red, and a cache keeps b.ts's old verdict. So the lint reads what the change reaches through TypeScript's own graph (the
chief, for Alexis, 2026-11-04, in place of "ESLint with its cache"): the .tsbuildinfo files the type check, run just before it in its lane,
wrote in one folder (TypeScript 6.0.3, lib/_tsc.js: ids from 1, `referencedMap` pairs a file with the id of its list in `fileIdsList`,
`fileInfos` in `fileNames`' order, the names relative to that folder as tsc was told it, in lower case on a disk that ignores case): those
package.json's typecheck names alone, never a file a hand run left. A change of a file that affects the global scope, a graph that is not
one, a file it names missing, or a typecheck that names none, is the whole repository.

Usage, from the repository's root: the changed paths on stdin, one a line, the type check's folder its argument. It prints `.` for the whole
repository, or the files on one line, shell-quoted: each changed path that exists and each file that imports one, in its own case. ESLint,
told so, passes over a path that is not its own."""
import json
import os
import pathlib
import re
import shlex
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # -I leaves this folder off the path
from repo_files import listed

# What TypeScript's graph can name: the code it reads and the data it imports.
GRAPHED = {".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"}
# A file of TSC_CACHE package.json's typecheck writes: `--tsBuildInfoFile "${TSC_CACHE:-<default>}/<name>.tsbuildinfo"`.
NAMED = re.compile(r'--tsBuildInfoFile\s+"\$\{TSC_CACHE:-[^}"]*\}/([\w.-]+\.tsbuildinfo)"')


def named():
    """The .tsbuildinfo files package.json's typecheck writes, by name."""
    scripts = json.loads(pathlib.Path("package.json").read_text(encoding="utf-8")).get("scripts")
    return NAMED.findall(scripts.get("typecheck", "")) if isinstance(scripts, dict) and isinstance(scripts.get("typecheck"), str) else []


def whole(why):
    """The whole repository, saying why on stderr."""
    print(f"lint_scope: {why}: the whole repository", file=sys.stderr)
    print(".")
    sys.exit(0)


def an_id(value, most):
    """Whether value is an id of a list of `most`: TypeScript's ids start at 1."""
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= most


def read(info):
    """One .tsbuildinfo: {file: the files that import it} and the files that affect the global scope, each path absolute and in lower case."""
    built = json.loads(info.read_text(encoding="utf-8"))
    if not isinstance(built, dict):
        raise ValueError("no object")
    names, files = built.get("fileNames"), built.get("fileInfos")
    refs, lists = built.get("referencedMap", []), built.get("fileIdsList", [])
    if not isinstance(names, list) or not all(isinstance(n, str) for n in names) or not isinstance(files, list) or len(files) > len(names):
        raise ValueError("no fileNames, or fileInfos past them")
    if not isinstance(refs, list) or not isinstance(lists, list):
        raise ValueError("no referencedMap or fileIdsList")
    folder = os.path.abspath(info.parent)  # as tsc was told it: its names are relative to that spelling, a link left as it is
    path = [os.path.normpath(os.path.join(folder, n)).lower() for n in names]
    if not all(isinstance(f, (str, dict)) for f in files):
        raise ValueError("a fileInfo of no known form")
    global_scope = {path[at] for at, f in enumerate(files) if isinstance(f, dict) and f.get("affectsGlobalScope") is True}
    importers = {}
    for ref in refs:
        if not (isinstance(ref, list) and len(ref) == 2 and an_id(ref[0], len(names)) and an_id(ref[1], len(lists))):
            raise ValueError("a referencedMap entry of no known form")
        imported = lists[ref[1] - 1]
        if not isinstance(imported, list) or not all(an_id(i, len(names)) for i in imported):
            raise ValueError("a fileIdsList entry of no known form")
        for i in imported:
            importers.setdefault(path[i - 1], set()).add(path[ref[0] - 1])
    return importers, global_scope


def main():
    changed = [line for line in sys.stdin.read().splitlines() if line]
    importers, global_scope = {}, set()
    try:
        infos = [pathlib.Path(sys.argv[1]) / name for name in named()]
        if not infos:
            raise ValueError("package.json's typecheck names no .tsbuildinfo")
        for info in infos:
            more, more_global = read(info)
            for file, by in more.items():
                importers.setdefault(file, set()).update(by)
            global_scope |= more_global
    except (OSError, ValueError) as e:  # json's errors and a text that is no UTF-8 are ValueErrors
        whole(f"the type check's graph cannot be read ({e})")
    root = os.path.realpath(".")
    todo = [os.path.join(root, path).lower() for path in changed]
    if global_scope.intersection(todo):
        whole("a change affects the global scope")
    # The repository's files by their path in lower case, as TypeScript names them where the disk ignores case.
    real = {}
    for file in map(str, listed(pathlib.Path("."), GRAPHED)):
        if real.setdefault(os.path.join(root, file).lower(), file) != file:
            whole(f"two files differ by their case alone ({file})")
    seen = set()
    while todo:
        file = todo.pop()
        if file not in seen:
            seen.add(file)
            todo.extend(importers.get(file, ()))
    files = {path for path in changed if os.path.isfile(path)} | {real[file] for file in seen if file in real}
    print(" ".join(shlex.quote(path) for path in sorted(files)))


main()
