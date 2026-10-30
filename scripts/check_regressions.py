"""check_regressions.py: the safety net never shrinks quietly (CLAUDE.md, "No regression").

Against the base (where the branch left main), it refuses, unless a commit of the branch says
so on a line of its own, `Key: <item> - why`, which Alexis reads in review:
- a test gone (Vitest, gno, Go; a rename included), or switched to `.fails`: `Removed-test:`;
- a floor lowered (coverage thresholds, StrykerJS's break), a known gap added to a mutation
  check's GAPS, an ignore added to a tool's ignore list, or a bench gone or given a longer budget
  (`bench("<name> [<n> ms]"`, named `bench <name>`): `Lowered-floor:`;
- an approved screenshot changed or deleted: `Updated-baseline:`.
Usage: check_regressions.py [--quick] <base>, from the repository root; --self-test checks the rules.
--quick (the hook and the fast gate, per commit: F2579) keeps the base's listing of tests in the tools' cache, one per base
commit, and lists only the Vitest files the change touches when the change is nothing but those, gno or Go sources, pictures
and prose; any other change lists the tree whole. The merge check runs without it, whole and with no cache."""
import ast
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import BENCH_FILE, benches, git, worktree

SHOT = re.compile(r"(-snapshots|__screenshots__)/.+\.(png|jpe?g)$")
GAP_FILES = ["scripts/mutate.py", "scripts/harness_mutate.py"]
IGNORE_FILES = [".jscpd.json", "knip.json", "stryker.config.json", "eslint.config.ts", "vitest.config.ts", ".prettierignore", "scripts/check_comments.mjs", "scripts/.gitleaksignore"]


def declared(lines, key):
    """The items a commit names on a `Key: <item> - why` line; a line without its reason names nothing."""
    return {m.group(1).strip() for line in lines if (m := re.fullmatch(rf"{key}: (.+?) - \S.*", line.strip()))}


def removed_tests(before, after, excused):
    """Tests in `before` missing from `after`, less those named exactly."""
    return sorted(before - after - excused)


def floors(vitest_config, stryker_config):
    """Each floor by name: the coverage thresholds per scope, and StrykerJS's break."""
    found, scope = {}, "everywhere"
    for line in vitest_config.splitlines():
        if m := re.search(r'"([^"]+)":\s*\{', line):
            scope = m.group(1)
        for key, value in re.findall(r"\b(lines|functions|branches|statements):\s*(\d+)", line):
            found[f"coverage {scope} {key}"] = int(value)
        if "}" in line and "{" not in line:
            scope = "everywhere"
    if stryker_config:
        found["mutation break"] = json.loads(stryker_config).get("thresholds", {}).get("break") or 0
    return found


def lowered_floors(before, after, excused):
    """Floors lower than they were, or gone, less those named exactly."""
    return sorted(f"{name} {old} -> {after.get(name, 'gone')}" for name, old in before.items()
                  if after.get(name, 0) < old and name not in excused)


def weakened(before, after, excused, kind):
    """Entries added to a list that loosens a check (a gap, an ignore), less those named `<kind> <entry>`."""
    return sorted(e for e in after - before if f"{kind} {e}" not in excused and f"{kind} {e.split(SEP)[0]}" not in excused)


def looser_benches(before, after, excused):
    """Benches gone, or given a longer budget, less those named `bench <name>`: the budgets are the slice plan's."""
    return sorted(f"{name} {old:g} ms -> {f'{after[name]:g} ms' if name in after else 'gone'}" for name, old in before.items()
                  if after.get(name, float("inf")) > old and f"bench {name}" not in excused)


def gaps(read):
    """Each known gap, as `<file> <label>`, from the GAPS dict of each mutation check."""
    out = set()
    for name in GAP_FILES:
        for node in ast.parse(read(name) or "").body:
            if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "GAPS" for t in node.targets):
                out |= {f"{name} {key}" for key in ast.literal_eval(node.value)}
    return out


SETTINGS = {".jscpd.json": ("exitCode", "threshold", "similarity", "minTokens", "minLines", "mode")}


def settings(read):
    """The settings that decide how strict a check is, as `<file> <key>`: their value, or None."""
    out = {}
    for name, keys in SETTINGS.items():
        data = json.loads(read(name) or "{}")
        out |= {f"{name} {key}": data.get(key) for key in keys}
    # pnpm reads keys in more forms than a pattern can follow (quoted, spaced, nested): every
    # change outside the packages list counts, as a fingerprint of the rest (F088).
    rest = re.sub(r"^packages:\n(?:[ \t]*(?:-.*|#.*)?\n)*", "", read("pnpm-workspace.yaml") or "", flags=re.M)
    out["pnpm-workspace.yaml outside packages"] = hashlib.sha256(rest.encode()).hexdigest()[:12]
    return out


def changed_settings(before, after, excused):
    """Settings changed either way, less those named `setting <file> <key>`: a change of strictness is read in review."""
    return sorted(f"{name} {old if old is not None else 'unset'} -> {after.get(name) if after.get(name) is not None else 'gone'}"
                  for name, old in before.items() if after.get(name) != old and f"setting {name}" not in excused)


LIST_START = re.compile(r"(?:globalIgnores\(\s*|(?:ignores|exclude)[\"']?\s*:\s*|SKIP = new Set\(\s*)")
SHORTHAND = re.compile(r"[{,]\s*(exclude|ignores)\s*(?=[,}])")  # `{ exclude }`: the list is the const of that name
CONST = re.compile(r"\b(?:const|let|var)\s+(\w+)\s*(?::[^=\n]+)?=\s*")
# Comments first, so an apostrophe or a bracket in one is no string and no end of the list; a quoted string holds no newline.
TOKEN = re.compile(r"\s*(?:(//[^\n]*|/\*.*?\*/)|(\"[^\"\n]*\")|('[^'\n]*')|(`[^`]*`)|(\.\.\.[\w$.]+)|([\w$.]+)|(.))", re.S)
OWN_DEFAULTS = re.compile(r"\.\.\.configDefaults\.exclude")  # the spread of the tool's own defaults: its entries are the tool's, not a change
SEP = " := "  # `<name> := <value>`: what a name held, an entry of its own; a line naming the name excuses it


def list_entries(text, at, consts=None):
    """The entries of the list that starts at text[at]: a quoted string is read; a name, a template, a spread of anything but the tool's
    own defaults, or what follows the list (`.concat(...)`) is an entry that cannot be read, named as written (F2523). A name or spread
    of a const the file holds is also read as its value, `<name> := <value>`, so a changed value shows (F2622). Comments are skipped (F2623)."""
    entries, pos = [], at
    consts = consts or {}
    if text[at] != "[":  # a list passed by name, or an expression: unread
        m = re.match(r"[^,;})\n]+", text[at:])
        return ([m.group(0).strip()] if m and m.group(0).strip() else []), at
    pos += 1
    while pos < len(text):
        m = TOKEN.match(text, pos)
        pos = m.end()
        comment, double, single, template, spread, name, other = m.groups()
        if comment:
            continue
        if double or single:
            entries.append((double or single)[1:-1])
        elif template:
            entries.append(template)
        elif spread or name:
            ref = spread or name
            if not (spread and OWN_DEFAULTS.fullmatch(spread)):
                entries.append(ref)
                entries += [f"{ref}{SEP}{value}" for value in consts.get(ref.removeprefix("..."), [])]
        elif other == "]":
            tail = re.match(r"\s*(\.\w+\([^)]*\)|\+[^,;}\n]*)", text[pos:])  # `].concat(X)`, `] + X`
            return entries + ([tail.group(1).strip()] if tail else []), pos
        elif other not in ",":
            entries.append(other)
    return entries, pos


def constants(text):
    """The consts of a file whose value is a string or a list of strings, by name: what a name in an ignore list stands for."""
    out = {}
    for m in CONST.finditer(text):
        if m.end() >= len(text):
            continue
        if text[m.end()] == "[":
            out[m.group(1)] = list_entries(text, m.end())[0]
        elif (t := TOKEN.match(text, m.end())) and (t.group(2) or t.group(3)):
            out[m.group(1)] = [(t.group(2) or t.group(3))[1:-1]]
    return out


def ignores(read):
    """Each entry of the lists that keep files from a check, as `<file> <entry>`; an entry written with a name is its name, and its value."""
    out = set()
    for name in IGNORE_FILES:
        text = read(name) or ""
        if name.endswith(".json") and text:
            # Nested too: knip takes an ignore list per workspace (F101).
            pending, found = [json.loads(text)], []
            while pending:
                for key, value in pending.pop().items():
                    if "ignore" in key.lower():
                        found += value if isinstance(value, list) else [value]
                    elif key == "mutate":  # a negated glob takes files out of the mutation test
                        found += [v for v in value if str(v).startswith("!")]
                    elif isinstance(value, dict):
                        pending.append(value)
            out |= {f"{name} {v}" for v in found}
        elif name in (".prettierignore", "scripts/.gitleaksignore"):
            out |= {f"{name} {line.strip()}" for line in text.splitlines() if line.strip() and not line.startswith("#")}
        else:
            consts = constants(text)
            for m in LIST_START.finditer(text):
                if m.end() < len(text):
                    out |= {f"{name} {entry}" for entry in list_entries(text, m.end(), consts)[0]}
            for m in SHORTHAND.finditer(text):
                out |= {f"{name} {entry}" for entry in [m.group(1), *(f"{m.group(1)}{SEP}{v}" for v in consts.get(m.group(1), []))]}
    return out


def switched_to_fails(diff):
    """Tests a diff turned into `.fails`: an added line that, without `.fails`, is a removed one."""
    out, gone, current = [], {}, ""
    for line in diff.splitlines():
        if line.startswith("+++ "):
            current = line[6:]
        elif line.startswith("-") and not line.startswith("---"):
            gone.setdefault(current, set()).add(line[1:].strip())
        elif line.startswith("+") and ".fails" in line and line[1:].replace(".fails", "", 1).strip() in gone.get(current, set()):
            title = re.search(r"\(\s*([\"'`])(.*?)\1", line)
            out.append(f"{current} > {title.group(2) if title else line[1:].strip()}")
    return out


def source_tests(files):
    """gno and Go tests by file and name ({path: text}); a filetest is its file."""
    out = set()
    for path, text in files.items():
        if path.endswith("_filetest.gno"):
            out.add(path)
        elif path.endswith(("_test.gno", "_test.go")):
            out |= {f"{path} > {name}" for name in re.findall(r"^func (Test\w*)\(", text, re.M)}
    return out


def changed_baselines(name_status, excused):
    """Approved screenshots modified, renamed or deleted, less those named exactly."""
    out = []
    for line in name_status.splitlines():
        status, *paths = line.split("\t")
        if status[0] in "MDR" and SHOT.search(paths[0]) and paths[0] not in excused:
            out.append(paths[0])
    return out


def show(base, path):
    try:
        return git("show", f"{base}:{path}")
    except subprocess.CalledProcessError:
        return ""


def here(path):
    return open(path).read() if os.path.exists(path) else ""


def relative(path, root):
    """path from root, both with their links resolved: Vitest reports real paths."""
    return os.path.relpath(os.path.realpath(path), os.path.realpath(root))


def journeys(listing, root):
    """Playwright's tests, `<file> > <describe> > <title>`, from its JSON listing; a listing that failed stops the check."""
    report = json.loads(listing)
    if report["errors"]:
        sys.exit("check_regressions: Playwright could not list its journeys: " + report["errors"][0]["message"].splitlines()[0])
    out = set()

    def walk(suite, path):
        for spec in suite.get("specs", []):
            name = " > ".join([*path, spec["title"]])
            out.add(f"{relative(os.path.join(report['config']['rootDir'], spec['file']), root)} > {name}")
        for child in suite.get("suites", []):
            walk(child, [*path, child["title"]])

    for suite in report["suites"]:
        walk(suite, [])
    return out


def test_names(root):
    """Every Vitest test and Playwright journey, by file and full name; none of a kind the tree does not run."""
    names = set()
    if os.path.exists(os.path.join(root, "vitest.config.ts")):
        out = subprocess.run(["node_modules/.bin/vitest", "list", "--json"], cwd=root, capture_output=True, text=True, check=True).stdout
        names |= {f"{relative(t['file'], root)} > {t['name']}" for t in json.loads(out)}
    for config in ("app/playwright.config.ts", "app/playwright.stories.config.ts"):  # the app's journeys, the stories'
        if os.path.exists(os.path.join(root, config)):
            # Node, not pnpm's shim: the shim spells paths from $PWD, whose case can differ from the
            # directory's on macOS, and Playwright loaded under two spellings lists no test.
            command = ["node", "app/node_modules/@playwright/test/cli.js", "test", "-c", config, "--list", "--reporter=json"]
            names |= journeys(subprocess.run(command, cwd=root, capture_output=True, text=True).stdout, root)
    return names


def base_tests(base):
    """The base's Vitest tests, listed in a throwaway worktree of it."""
    with worktree(base) as tree:
        return test_names(tree)


TOUCHES_NO_NAMES = re.compile(r"\.(gno|go|md)$")  # a test of these kinds is read from the files; they list no Vitest or Playwright name
VITEST_FILE = re.compile(r"\.test\.tsx?$")


def cached_base_tests(base):
    """base_tests(base), kept in the tools' cache under the base's commit (it never changes for one): a quick run lists the
    whole of the base's tests once per base, not once per commit."""
    sha = git("rev-parse", "--verify", f"{base}^{{commit}}").strip()
    folder = os.path.join(os.environ.get("GNOWORLD_TOOLS") or os.path.join(os.path.expanduser("~"), ".cache", "gnoworld-tools"), "regressions")
    path = os.path.join(folder, f"base-{sha}.json")
    try:
        with open(path) as f:
            return set(json.load(f))
    except (OSError, ValueError):
        pass
    names = base_tests(base)
    try:  # a cache that cannot be written costs the next run its listing, nothing else
        os.makedirs(folder, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", dir=folder, delete=False, suffix=".tmp") as f:
            json.dump(sorted(names), f)
        os.replace(f.name, path)
    except OSError:
        pass
    return names


def quick_tests(base, before):
    """The Vitest and Playwright names the tree holds, from the base's (`before`) and a listing of the files the change touches,
    or None when the change is more than those Vitest files, gno or Go sources, approved pictures and prose."""
    paths = [p for p in git("diff", "--no-renames", "--name-only", base).splitlines() + git("ls-files", "--others", "--exclude-standard").splitlines() if p]
    if not os.path.exists("vitest.config.ts") or not all(VITEST_FILE.search(p) or TOUCHES_NO_NAMES.search(p) or SHOT.search(p) for p in paths):
        return None
    touched = {p for p in paths if VITEST_FILE.search(p)}
    kept = {n for n in before if n.split(" > ", 1)[0] not in touched}
    existing = sorted(p for p in touched if os.path.exists(p))
    if not existing:
        return kept
    with tempfile.TemporaryDirectory() as where:
        out = os.path.join(where, "list.json")  # `--json <file>` would read the first path as the output's
        subprocess.run(["node_modules/.bin/vitest", "list", f"--json={out}", *existing], capture_output=True, text=True, check=True)
        with open(out) as f:
            listing = json.load(f)
    return kept | {f"{relative(t['file'], '.')} > {t['name']}" for t in listing if relative(t["file"], ".") in touched}


def self_test():
    """The rules on small cases: each refuses its fault and lets a declared one through."""
    log = ["docs: explain why the mutation break follows the score", "Removed-test: a > xy - another test",
           "Removed-test: a > z", "Lowered-floor: mutation break - see the plan", "Removed-test: a > y - merged into x"]
    assert declared(log, "Lowered-floor") == {"mutation break"} and declared(log, "Removed-test") == {"a > xy", "a > y"}
    assert removed_tests({"a > x", "a > y", "a > z"}, set(), declared(log, "Removed-test")) == ["a > x", "a > z"]
    vitest = 'thresholds: {\n  lines: 85,\n  "packages/core/**": { lines: 100, branches: 95 },\n}'
    before = floors(vitest, '{"thresholds": {"break": 80}}')
    assert before == {"coverage everywhere lines": 85, "coverage packages/core/** lines": 100, "coverage packages/core/** branches": 95, "mutation break": 80}
    after = floors(vitest.replace("95", "90"), '{"thresholds": {"break": null}}')
    assert lowered_floors(before, after, set()) == ["coverage packages/core/** branches 95 -> 90", "mutation break 80 -> 0"]
    assert lowered_floors(before, after, declared(log[:1], "Lowered-floor")) == lowered_floors(before, after, set()), "a sentence excused a floor"
    assert lowered_floors(before, after, {"mutation break", "coverage packages/core/** branches"}) == []
    old = {"scripts/mutate.py": 'GAPS = {\n    "a": "why",\n}\n', ".jscpd.json": '{"ignore": ["docs/**"], "exitCode": 1}',
           "eslint.config.ts": 'globalIgnores(["docs/"]),\n  { ignores: ["packages/core/**"] }', ".prettierignore": "# x\n*.md\n"}
    new = {**old, "scripts/mutate.py": 'GAPS = {\n    "a": "why",\n    "b": "no test yet",\n}\n', ".jscpd.json": '{"ignore": ["docs/**", "app/**"]}',
           "eslint.config.ts": 'globalIgnores(["docs/", "server/"]),\n  { ignores: ["packages/core/**"] }', ".prettierignore": "*.md\n*.ts\n"}
    assert gaps(old.get) == {"scripts/mutate.py a"} and weakened(gaps(old.get), gaps(new.get), set(), "gap") == ["scripts/mutate.py b"]
    assert weakened(ignores(old.get), ignores(new.get), set(), "ignore") == [".jscpd.json app/**", ".prettierignore *.ts", "eslint.config.ts server/"]
    assert weakened(ignores(old.get), ignores(new.get), {"ignore .jscpd.json app/**", "ignore .prettierignore *.ts", "ignore eslint.config.ts server/"}, "ignore") == []
    knip = {"knip.json": '{"ignoreFiles": ["docs/**"], "workspaces": {"app": {"entry": ["src/x.ts"]}}}'}
    nested = {"knip.json": '{"ignoreFiles": ["docs/**"], "workspaces": {"app": {"entry": ["src/x.ts"], "ignoreDependencies": ["left-pad"]}}}'}
    assert weakened(ignores(knip.get), ignores(nested.get), set(), "ignore") == ["knip.json left-pad"], "a workspace's ignore list went unseen (F101)"
    stryker = {"stryker.config.json": '{"mutate": ["packages/*/src/**/*.ts"]}'}
    unmutated = {"stryker.config.json": '{"mutate": ["packages/*/src/**/*.ts", "!packages/core/src/x.ts"]}'}
    assert weakened(ignores(stryker.get), ignores(unmutated.get), set(), "ignore") == ["stryker.config.json !packages/core/src/x.ts"]
    leaks = {"scripts/.gitleaksignore": "# a reason\n"}
    hidden = {"scripts/.gitleaksignore": "# a reason\nabc:docs/a.md:home-folder-path:4\n"}
    named = {"vitest.config.ts": "export default { test: { exclude: [...configDefaults.exclude, STRYKER_TMP, 'c/**', \"a,b/**\"] } };\n"}
    assert ignores(named.get) == {"vitest.config.ts STRYKER_TMP", "vitest.config.ts c/**", "vitest.config.ts a,b/**"}, "a name is an entry, a spread of the defaults is not, quotes either way"
    assert ignores({"vitest.config.ts": "exclude: LIST,\n"}.get) == {"vitest.config.ts LIST"}, "a list passed by name"
    assert ignores({"vitest.config.ts": 'exclude: ["a"].concat(X)'}.get) == {"vitest.config.ts a", "vitest.config.ts .concat(X)"}, "a list with a method"
    # A name stands for its value (F2622), a comment is no entry (F2623), and the other forms of the key are read (F2627).
    held = 'const T = "x/**";\nconst L = ["l/**"];\nexport default { test: { exclude: [...configDefaults.exclude, T, ...L] } };\n'
    assert ignores({"vitest.config.ts": held}.get) == {"vitest.config.ts T", "vitest.config.ts T := x/**", "vitest.config.ts ...L", "vitest.config.ts ...L := l/**"}
    wider = held.replace("x/**", "**/*.test.ts")
    assert weakened(ignores({"vitest.config.ts": held}.get), ignores({"vitest.config.ts": wider}.get), set(), "ignore") == ["vitest.config.ts T := **/*.test.ts"]
    assert weakened(ignores({"vitest.config.ts": held}.get), ignores({"vitest.config.ts": wider}.get), {"ignore vitest.config.ts T"}, "ignore") == [], "a name did not excuse its value"
    assert ignores({"vitest.config.ts": "exclude: [...myConfigDefaults.exclude]"}.get) == {"vitest.config.ts ...myConfigDefaults.exclude"}, "a lookalike of the tool's defaults"
    commented = "exclude: [\n  \"a/**\",\n  // The server's entry, see [1]\n  /* it's [ too */\n  \"b/**\",\n]\n"
    assert ignores({"vitest.config.ts": commented}.get) == {"vitest.config.ts a/**", "vitest.config.ts b/**"}, "a comment in a list was read"
    assert ignores({"vitest.config.ts": "x = { exclude }\n"}.get) == {"vitest.config.ts exclude"}, "the shorthand { exclude }"
    assert ignores({"vitest.config.ts": '{ "exclude": ["a"] }'}.get) == {"vitest.config.ts a"}, "a quoted key"
    assert ignores({"eslint.config.ts": 'globalIgnores(\n  ["a/"],\n  "n",\n)'}.get) == {"eslint.config.ts a/"}, "a list on the next line"
    assert weakened(ignores(leaks.get), ignores(hidden.get), set(), "ignore") == ["scripts/.gitleaksignore abc:docs/a.md:home-folder-path:4"]
    # pnpm's supply-chain file: any change outside its packages list is read in review, whatever
    # its form (F079, F088): quoted or spaced keys, a pnpmfile, builds, overrides, a lower age.
    strict = "packages:\n  - app\nminimumReleaseAge: 1440\ntrustPolicy: no-downgrade\n"
    workspace = lambda text: settings({"pnpm-workspace.yaml": text}.get)
    for loose in ['"minimumReleaseAgeExclude":\n  - left-pad\n', "minimumReleaseAgeExclude :\n  - left-pad\n", "pnpmfile: app/x.cjs\n",
                  "dangerouslyAllowAllBuilds: true\n", "allowBuilds:\n  esbuild: true\n", 'overrides:\n  qs: "npm:evil-qs@1.0.0"\n',
                  '"minimumReleaseAge": 1440\nminimumReleaseAge : 0\n']:
        changed = changed_settings(workspace(strict), workspace(strict + loose), set())
        assert len(changed) == 1 and changed[0].startswith("pnpm-workspace.yaml outside packages "), loose
        assert changed_settings(workspace(strict), workspace(strict + loose), {"setting pnpm-workspace.yaml outside packages"}) == []
    assert changed_settings(workspace(strict), workspace(strict.replace("  - app\n", "  - app\n  - admin\n")), set()) == []
    # A list with a comment, a blank line or items flush with its key is still the list (F123).
    for listed, more in (("  # the client\n  - app\n\n", "  # the client\n  - app\n\n  - admin\n"), ("- app\n", "- app\n- admin\n")):
        before, after = (f"packages:\n{items}minimumReleaseAge: 1440\n" for items in (listed, more))
        assert changed_settings(workspace(before), workspace(after), set()) == [], listed
        assert changed_settings(workspace(before), workspace(after + "pnpmfile: x.cjs\n"), set()) != [], listed
    assert changed_settings(settings(old.get), settings(new.get), set()) == [".jscpd.json exitCode 1 -> gone"]
    assert changed_settings(settings(old.get), settings(new.get), {"setting .jscpd.json exitCode"}) == []
    plan = {"a.bench.ts": 'bench("a line [0.2 ms]", () => {});\nbench(\n  "a room [100 ms]",\n  () => {},\n);\n'}
    held = benches(plan)
    assert held == {"a line": 0.2, "a room": 100.0} and benches({"x.bench.ts": 'bench("no budget", f)'}) == {}
    assert looser_benches(held, benches({"a.bench.ts": plan["a.bench.ts"]}), set()) == []
    assert looser_benches(held, benches({"a.bench.ts": plan["a.bench.ts"].replace("[100 ms]", "[1000 ms]")}), set()) == ["a room 100 ms -> 1000 ms"], "a bench's budget raised went unseen"
    assert looser_benches(held, benches({"a.bench.ts": 'bench("a line [0.2 ms]", () => {});'}), set()) == ["a room 100 ms -> gone"], "a bench gone went unseen"
    assert looser_benches(held, benches({"a.bench.ts": plan["a.bench.ts"].replace("[100 ms]", "[10 ms]")}), set()) == [], "a lower budget was refused"
    assert looser_benches(held, benches({"a.bench.ts": plan["a.bench.ts"] + 'bench("new [5 ms]", f)'}), set()) == [], "a new bench was refused"
    assert looser_benches(held, {}, {"bench a room", "bench a line"}) == [], "an item named exactly did not excuse its bench"
    assert looser_benches(held, {}, declared(["Lowered-floor: bench a room - renamed", "Lowered-floor: a line - x"], "Lowered-floor")) == ["a line 0.2 ms -> gone"], "a sentence excused a bench"
    diff = "+++ b/p/a.test.ts\n-  test(\"parses x\", () => {\n+  test.fails(\"parses x\", () => {\n+  test.fails(\"new one\", () => {\n+++ b/p/b.test.ts\n-  test.fails(\"done\", () => {\n+  test(\"done\", () => {\n"
    assert switched_to_fails(diff) == ["p/a.test.ts > parses x"]
    files = {"r/s/s_test.gno": "func TestBind(t *testing.T) {}\nfunc helper() {}\n", "r/s/z1_filetest.gno": "", "tools/v/main_test.go": "func TestVec(t *testing.T) {}\n", "r/s/s.gno": "func TestNot() {}\n"}
    assert source_tests(files) == {"r/s/s_test.gno > TestBind", "r/s/z1_filetest.gno", "tools/v/main_test.go > TestVec"}
    diff = "M\tapp/tests/e2e/home.spec.ts-snapshots/home.png\nA\tapp/tests/e2e/x.spec.ts-snapshots/new.png\nD\tapp/__screenshots__/old.png"
    assert changed_baselines(diff, set()) == ["app/tests/e2e/home.spec.ts-snapshots/home.png", "app/__screenshots__/old.png"]
    assert changed_baselines(diff, {"app/tests/e2e/home.spec.ts-snapshots/home.png", "app/__screenshots__/old.png"}) == []
    listing = {"config": {"rootDir": "/r/app/tests/e2e"}, "errors": [], "suites": [{"title": "a.spec.ts", "specs": [{"file": "a.spec.ts", "title": "top"}],
               "suites": [{"title": "pages", "specs": [{"file": "a.spec.ts", "title": "/ has a title"}], "suites": []}]}]}
    assert journeys(json.dumps(listing), "/r") == {"app/tests/e2e/a.spec.ts > top", "app/tests/e2e/a.spec.ts > pages > / has a title"}
    try:
        journeys(json.dumps({**listing, "errors": [{"message": "Error: No tests found"}]}), "/r")
        raise AssertionError("a listing that failed counted as no journey")
    except SystemExit:
        pass
    with tempfile.TemporaryDirectory() as real:  # macOS's /tmp is a link to /private/tmp; Vitest reports real paths
        link = os.path.join(real, "link")
        os.symlink(real, link)
        assert relative(os.path.join(os.path.realpath(real), "a.test.ts"), link) == "a.test.ts"
    print("check_regressions: self-test passed")


if sys.argv[1:] == ["--self-test"]:
    self_test()
    sys.exit(0)
quick = "--quick" in sys.argv[1:]
base = [a for a in sys.argv[1:] if a != "--quick"][0]
log = git("log", "--format=%B", f"{base}..HEAD").splitlines()
tests_ok, floors_ok, shots_ok = declared(log, "Removed-test"), declared(log, "Lowered-floor"), declared(log, "Updated-baseline")
sources = lambda paths, read: source_tests({p: read(p) for p in paths.splitlines() if p.endswith((".gno", ".go"))})
base_names = cached_base_tests(base) if quick else base_tests(base)
before = base_names | sources(git("ls-tree", "-r", "--name-only", base, "--", "gno"), lambda p: show(base, p))
tree_names = quick_tests(base, base_names) if quick else None
after = (test_names(".") if tree_names is None else tree_names) | sources(git("ls-files", "gno"), here)
problems = [f"a test is gone: {t}" for t in removed_tests(before, after, tests_ok)]
problems += [f"a test is switched to fails: {t}" for t in switched_to_fails(git("diff", "-U0", base, "--", "*.test.ts", "*.test.tsx")) if t not in tests_ok]
problems += [f"a floor is lower: {f}" for f in lowered_floors(floors(show(base, "vitest.config.ts"), show(base, "stryker.config.json")),
                                                               floors(here("vitest.config.ts"), here("stryker.config.json")), floors_ok)]
benched = lambda paths, read: benches({p: read(p) for p in paths.splitlines() if BENCH_FILE.search(p)})
problems += [f"a bench is gone or its budget longer: {b}" for b in looser_benches(benched(git("ls-tree", "-r", "--name-only", base), lambda p: show(base, p)),
                                                                                  benched(git("ls-files"), here), floors_ok)]
problems += [f"a known gap is added: {g}" for g in weakened(gaps(lambda p: show(base, p)), gaps(here), floors_ok, "gap")]
problems += [f"an ignore is added: {i}" for i in weakened(ignores(lambda p: show(base, p)), ignores(here), floors_ok, "ignore")]
problems += [f"a check's setting changed: {s}" for s in changed_settings(settings(lambda p: show(base, p)), settings(here), floors_ok)]
# The tree, not base..HEAD: the hook and the fast gate run this before the commit exists (F2574), as the line for the tests above.
problems += [f"an approved screenshot changed: {p}" for p in changed_baselines(git("diff", "--name-status", base), shots_ok)]
if problems:
    print("check_regressions: the safety net shrank. Undo it, or say why on a line of a commit, `Key: <item> - why`"
          " (Removed-test:, Lowered-floor: [gap |ignore |bench ]<item>, Updated-baseline:). An ignore written with a name is read as the name, "
          "not its value: write the glob quoted:", *problems, sep="\n  ", file=sys.stderr)
    sys.exit(1)
print("check_regressions: no test gone or switched off, no floor lower, no bench gone or looser, no gap or ignore added, no approved screenshot changed")
