"""check_regressions.py: the safety net never shrinks quietly (CLAUDE.md, "No regression").

Against the base (where the branch left main), it refuses, unless a commit of the branch says
so on a line of its own, `Key: <item> - why`, which Alexis reads in review:
- a test gone (Vitest, gno, Go; a rename included), or switched to `.fails`: `Removed-test:`;
- a floor lowered (coverage thresholds, StrykerJS's break), a known gap added to a mutation
  check's GAPS, or an ignore added to a tool's ignore list: `Lowered-floor:`;
- an approved screenshot changed or deleted: `Updated-baseline:`.
Usage: check_regressions.py <base>, from the repository root; --self-test checks the rules."""
import ast
import json
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import git, worktree

SHOT = re.compile(r"(-snapshots|__screenshots__)/.+\.(png|jpe?g)$")
GAP_FILES = ["scripts/mutate.py", "scripts/harness_mutate.py"]
IGNORE_FILES = [".jscpd.json", "knip.json", "stryker.config.json", "eslint.config.ts", "vitest.config.ts", ".prettierignore", "scripts/check_comments.mjs"]


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
    return sorted(e for e in after - before if f"{kind} {e}" not in excused)


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
    return out


def changed_settings(before, after, excused):
    """Settings changed either way, less those named `setting <file> <key>`: a change of strictness is read in review."""
    return sorted(f"{name} {old if old is not None else 'unset'} -> {after.get(name) if after.get(name) is not None else 'gone'}"
                  for name, old in before.items() if after.get(name) != old and f"setting {name}" not in excused)


def ignores(read):
    """Each entry of the lists that keep files from a check, as `<file> <entry>`."""
    out = set()
    for name in IGNORE_FILES:
        text = read(name) or ""
        if name.endswith(".json") and text:
            for key, value in json.loads(text).items():
                if "ignore" in key.lower():
                    out |= {f"{name} {v}" for v in (value if isinstance(value, list) else [value])}
                elif key == "mutate":  # a negated glob takes files out of the mutation test
                    out |= {f"{name} {v}" for v in value if str(v).startswith("!")}
        elif name == ".prettierignore":
            out |= {f"{name} {line.strip()}" for line in text.splitlines() if line.strip() and not line.startswith("#")}
        else:
            for m in re.finditer(r"(?:globalIgnores\(|ignores:\s*|exclude:\s*|SKIP = new Set\()\[([^\]]*)\]", text):
                out |= {f"{name} {entry}" for entry in re.findall(r'"([^"]*)"', m.group(1))}
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


def test_names(root):
    """Every Vitest test's file and full name, from `vitest list`; none when the tree has no Vitest."""
    if not os.path.exists(os.path.join(root, "vitest.config.ts")):
        return set()
    out = subprocess.run(["node_modules/.bin/vitest", "list", "--json"], cwd=root, capture_output=True, text=True, check=True).stdout
    return {f"{os.path.relpath(t['file'], root)} > {t['name']}" for t in json.loads(out)}


def base_tests(base):
    """The base's Vitest tests, listed in a throwaway worktree of it."""
    with worktree(base) as tree:
        return test_names(tree)


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
    stryker = {"stryker.config.json": '{"mutate": ["packages/*/src/**/*.ts"]}'}
    unmutated = {"stryker.config.json": '{"mutate": ["packages/*/src/**/*.ts", "!packages/core/src/x.ts"]}'}
    assert weakened(ignores(stryker.get), ignores(unmutated.get), set(), "ignore") == ["stryker.config.json !packages/core/src/x.ts"]
    assert changed_settings(settings(old.get), settings(new.get), set()) == [".jscpd.json exitCode 1 -> gone"]
    assert changed_settings(settings(old.get), settings(new.get), {"setting .jscpd.json exitCode"}) == []
    diff = "+++ b/p/a.test.ts\n-  test(\"parses x\", () => {\n+  test.fails(\"parses x\", () => {\n+  test.fails(\"new one\", () => {\n+++ b/p/b.test.ts\n-  test.fails(\"done\", () => {\n+  test(\"done\", () => {\n"
    assert switched_to_fails(diff) == ["p/a.test.ts > parses x"]
    files = {"r/s/s_test.gno": "func TestBind(t *testing.T) {}\nfunc helper() {}\n", "r/s/z1_filetest.gno": "", "tools/v/main_test.go": "func TestVec(t *testing.T) {}\n", "r/s/s.gno": "func TestNot() {}\n"}
    assert source_tests(files) == {"r/s/s_test.gno > TestBind", "r/s/z1_filetest.gno", "tools/v/main_test.go > TestVec"}
    diff = "M\tapp/tests/e2e/home.spec.ts-snapshots/home.png\nA\tapp/tests/e2e/x.spec.ts-snapshots/new.png\nD\tapp/__screenshots__/old.png"
    assert changed_baselines(diff, set()) == ["app/tests/e2e/home.spec.ts-snapshots/home.png", "app/__screenshots__/old.png"]
    assert changed_baselines(diff, {"app/tests/e2e/home.spec.ts-snapshots/home.png", "app/__screenshots__/old.png"}) == []
    print("check_regressions: self-test passed")


if sys.argv[1:] == ["--self-test"]:
    self_test()
    sys.exit(0)
base = sys.argv[1]
log = git("log", "--format=%B", f"{base}..HEAD").splitlines()
tests_ok, floors_ok, shots_ok = declared(log, "Removed-test"), declared(log, "Lowered-floor"), declared(log, "Updated-baseline")
sources = lambda paths, read: source_tests({p: read(p) for p in paths.splitlines() if p.endswith((".gno", ".go"))})
before = base_tests(base) | sources(git("ls-tree", "-r", "--name-only", base, "--", "gno"), lambda p: show(base, p))
after = test_names(".") | sources(git("ls-files", "gno"), here)
problems = [f"a test is gone: {t}" for t in removed_tests(before, after, tests_ok)]
problems += [f"a test is switched to fails: {t}" for t in switched_to_fails(git("diff", "-U0", base, "--", "*.test.ts", "*.test.tsx")) if t not in tests_ok]
problems += [f"a floor is lower: {f}" for f in lowered_floors(floors(show(base, "vitest.config.ts"), show(base, "stryker.config.json")),
                                                               floors(here("vitest.config.ts"), here("stryker.config.json")), floors_ok)]
problems += [f"a known gap is added: {g}" for g in weakened(gaps(lambda p: show(base, p)), gaps(here), floors_ok, "gap")]
problems += [f"an ignore is added: {i}" for i in weakened(ignores(lambda p: show(base, p)), ignores(here), floors_ok, "ignore")]
problems += [f"a check's setting changed: {s}" for s in changed_settings(settings(lambda p: show(base, p)), settings(here), floors_ok)]
problems += [f"an approved screenshot changed: {p}" for p in changed_baselines(git("diff", "--name-status", f"{base}..HEAD"), shots_ok)]
if problems:
    print("check_regressions: the safety net shrank. Undo it, or say why on a line of a commit, `Key: <item> - why`"
          " (Removed-test:, Lowered-floor: [gap |ignore ]<item>, Updated-baseline:):", *problems, sep="\n  ", file=sys.stderr)
    sys.exit(1)
print("check_regressions: no test gone or switched off, no floor lower, no gap or ignore added, no approved screenshot changed")
