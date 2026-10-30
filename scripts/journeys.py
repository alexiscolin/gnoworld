"""journeys.py: which of the app's journeys a change can reach (the fast gate's cost follows the change, Alexis 2026-10-29).

Usage: journeys.py [path ...] from the repository root; with no argument, the paths come one a line on stdin.
Prints the paths of the journeys (Playwright specs) to run, one a line, or `all` when the change cannot be placed.

A journey reaches the files its pages load: the page of each URL it goes to (`page.goto("/w/a")`) is the route whose path
matches it in app/src/routes.ts, and a route loads what it imports, followed through every import, import(), re-export, type
import and stylesheet. A changed file runs the journeys that reach it. What cannot be placed runs everything:
- a path outside app/src and the journeys' own folder (a config, a helper the journeys share, the file server, the server's
  code: the journeys start it), or a file no route loads, one the root loads (every page does), or one that was deleted;
- the routes' list, when it holds more than index() and route() calls.
A journey whose URL is not a literal, or that goes to no URL, cannot be placed: it runs on every change of the app. What a
journey reaches by a click, a link or a redirect after its first page is not followed: the merge check runs every journey.
A comment in a changed file decides nothing; nothing here reads one."""
import os
import re
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__

SRC = "app/src"
E2E = "app/tests/e2e"
ROUTES = f"{SRC}/routes.ts"
EVERY_PAGE = [f"{SRC}/root.tsx", f"{SRC}/entry.client.tsx"]
EXTENSIONS = ("", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".css")
# from "x", import "x", import("x"), export * from "x": a quoted specifier after `from` or `import`.
IMPORT = re.compile(r"""\b(?:from|import)\s*\(?\s*(["'])([^"'\n]+)\1""")
# import(expr) with no literal, or a glob: what the graph cannot follow.
OPAQUE = re.compile(r"""\bimport\s*\(\s*[^"'\s)]|\bimport\.meta\.glob""")
GOTO = re.compile(r"\.goto\(\s*")
SPEC = re.compile(r"\.(spec|test)\.[cm]?[jt]sx?$")
TEST_FILE = re.compile(r"\.(test|bench|stories)\.tsx?$")  # never loaded by a page
PROSE = re.compile(r"^(docs/|adr/)|\.md$")


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (OSError, UnicodeDecodeError):
        return None


def resolve(importer, specifier):
    """The file a relative specifier names, or None (a package, or a file that is not there)."""
    if not specifier.startswith("."):
        return None
    base = os.path.normpath(os.path.join(os.path.dirname(importer), specifier.split("?")[0]))
    stem = base.rsplit(".", 1)[0] if base.endswith((".js", ".jsx", ".mjs")) else None
    for candidate in [base + e for e in EXTENSIONS] + [os.path.join(base, "index" + e) for e in EXTENSIONS[1:]] + ([stem + e for e in (".ts", ".tsx")] if stem else []):
        if os.path.isfile(candidate):
            return candidate
    return None


class Graph:
    def __init__(self):
        self.edges, self.opaque = {}, False

    def direct(self, path):
        if path not in self.edges:
            text = read(path) or ""
            self.opaque = self.opaque or bool(OPAQUE.search(text))
            self.edges[path] = {r for m in IMPORT.finditer(text) if (r := resolve(path, m.group(2)))}
        return self.edges[path]

    def closure(self, path):
        """The file and everything it loads, through any depth."""
        seen, todo = set(), [path]
        while todo:
            f = todo.pop()
            if f not in seen:
                seen.add(f)
                todo += self.direct(f)
        return seen


def routes():
    """app/src/routes.ts as [(path segments, file)], or None when it is more than index() and route() calls."""
    text = read(ROUTES)
    if text is None:
        return None
    body = re.sub(r"//[^\n]*", "", text)
    found = [("", m.group(1)) for m in re.finditer(r"""\bindex\(\s*["']([^"']+)["']""", body)]
    found += [(m.group(1) or "", m.group(2)) for m in re.finditer(r"""\broute\(\s*["']([^"']*)["']\s*,\s*["']([^"']+)["']""", body)]
    if len(found) != len(re.findall(r"\b(?:index|route)\(", body)) or re.search(r"\b(?:layout|prefix)\(|children|\?[:\"']", body):
        return None
    return [([s for s in p.strip("/").split("/") if s], os.path.normpath(os.path.join(SRC, f))) for p, f in found]


def score(pattern):
    """React Router's ranking: static segments over parameters over a splat."""
    return len(pattern) + sum(-2 if s == "*" else 3 if s.startswith(":") else 10 for s in pattern)


def matching(url, table):
    """The files of the routes whose path the URL's path matches: the best ones, every one that ties. A segment of the URL
    that is a template's `${...}` fits any segment of a route, and then every route it fits counts but the splat's."""
    parts = [s for s in re.split(r"[?#]", url)[0].strip("/").split("/") if s]
    unknown = [p for p in parts if "${" in p]
    hits = []
    for pattern, file in table:
        if pattern and pattern[-1] == "*":
            rest = len(parts) >= len(pattern) - 1
            fits = rest and all("${" in s or p.startswith(":") or p == s for p, s in zip(pattern[:-1], parts))
        else:
            fits = len(parts) == len(pattern) and all("${" in s or p.startswith(":") or p == s for p, s in zip(pattern, parts))
        if fits:
            hits.append((score(pattern), file, bool(pattern) and pattern[-1] == "*"))
    if unknown and any(not splat for _, _, splat in hits):
        return {f for _, f, splat in hits if not splat}
    best = max((s for s, _, _ in hits), default=None)
    return {f for s, f, _ in hits if s == best}


ORIGIN = re.compile(r"\s*(?:site|origin|base|host)\b", re.I)


def literal_at(text, at):
    """The URL a goto() argument starting at `at` names, or None: a string, or a template whose substitutions are in the path
    (each stays as `${...}`) or stand for the site's origin at the start; a variable or a call is none."""
    quote = text[at:at + 1]
    if quote not in ("\"", "'", "`"):
        return None
    end, depth = at + 1, 0
    while end < len(text):  # the closing quote, outside a template's ${ ... }
        c = text[end]
        if quote == "`" and text.startswith("${", end):
            depth += 1
            end += 1
        elif depth and c == "}":
            depth -= 1
        elif not depth and c == quote:
            break
        elif not depth and c == "\\":
            end += 1
        end += 1
    else:
        return None
    body = text[at + 1:end]
    if body.startswith("${"):  # the origin first: `${SITE}/path`
        close = body.find("}")
        while close != -1 and body[2:close].count("{") > body[2:close].count("}"):
            close = body.find("}", close + 1)
        if close == -1 or not ORIGIN.match(body[2:close]):
            return None
        body = body[close + 1:]
    return body if body.startswith("/") else None


def urls_of(text):
    """The paths a file goes to, and whether some goto() it holds has none (a variable, a call, a full URL)."""
    urls, opaque = set(), False
    for m in GOTO.finditer(text):
        url = literal_at(text, m.end())
        if url is None:
            opaque = True
        else:
            urls.add(url)
    return urls, opaque


def specs_in(folder):
    return sorted(os.path.join(d, f) for d, _, files in os.walk(folder) for f in files if SPEC.search(f))


def journeys(changed):
    """The specs a list of changed paths reaches, or None for all of them."""
    table = routes()
    specs = specs_in(E2E)
    if table is None or not specs:
        return None
    graph = Graph()
    placed, always = {}, set()  # spec -> every file its journey reaches
    unplaced = set()
    for spec in specs:
        files, urls, opaque = graph.closure(spec), set(), False
        for f in files:
            if f.startswith(E2E + "/"):
                found, bad = urls_of(read(f) or "")
                urls |= found
                opaque = opaque or bad
        if opaque or not urls:
            unplaced.add(spec)
            continue
        reached = set(files)
        for url in urls:
            for route in matching(url, table):
                reached |= graph.closure(route)
        placed[spec] = reached
    for root in EVERY_PAGE:
        if os.path.isfile(root):
            always |= graph.closure(root)
    loaded = set().union(*(graph.closure(f) for _, f in table), *placed.values())
    if graph.opaque:
        return None
    run = set()
    for path in changed:
        if PROSE.search(path):
            continue
        if SPEC.search(path) and path.startswith(E2E + "/"):
            run |= {path} if os.path.isfile(path) else set()
            continue
        shots = re.fullmatch(rf"({re.escape(E2E)}/.+)-snapshots/.+", path)
        if shots:
            if not os.path.isfile(shots.group(1)):
                return None
            run.add(shots.group(1))
            continue
        if not path.startswith(SRC + "/") or path == ROUTES or not os.path.isfile(path) or path in always:
            return None
        if TEST_FILE.search(path):
            continue
        if path not in loaded:
            return None
        run |= {s for s, reached in placed.items() if path in reached} | unplaced
    if not run or run >= set(specs):
        return None
    return sorted(run)


if __name__ == "__main__":
    paths = sys.argv[1:] or [line for line in sys.stdin.read().split("\n") if line]
    chosen = journeys(paths)
    print("all" if chosen is None else "\n".join(chosen))
