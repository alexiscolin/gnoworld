"""check_regressions.py: the safety net never shrinks quietly (CLAUDE.md, "No regression").

Against the base (where the branch left main), it refuses, unless a commit of the branch says
so with its reason, which Alexis reads in review:
- a test that existed and is gone, a rename included: `Removed-test: <its name> - why`;
- a quality floor lowered (vitest.config.ts's coverage thresholds, StrykerJS's break):
  `Lowered-floor: <the floor as printed below> - why`;
- an approved screenshot changed or deleted: `Updated-baseline: <its path> - why`.
Usage: check_regressions.py <base>, from the repository root; --self-test checks the rules."""
import json
import os
import re
import subprocess
import sys
import tempfile

SHOT = re.compile(r"(-snapshots|__screenshots__)/.+\.(png|jpe?g)$")


def removed_tests(before, after, declared):
    """Tests in `before` missing from `after`, less those a `Removed-test:` line names."""
    return sorted(t for t in before - after if not any(t in line for line in declared))


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


def lowered_floors(before, after, declared):
    """Floors lower than they were, or gone, less those a `Lowered-floor:` line names."""
    return sorted(f"{name} {old} -> {after.get(name, 'gone')}" for name, old in before.items()
                  if after.get(name, 0) < old and not any(name in line for line in declared))


def changed_baselines(name_status, declared):
    """Approved screenshots modified, renamed or deleted, less those an `Updated-baseline:` line names."""
    out = []
    for line in name_status.splitlines():
        status, *paths = line.split("\t")
        if status[0] in "MDR" and SHOT.search(paths[0]) and not any(paths[0] in d for d in declared):
            out.append(paths[0])
    return out


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def show(base, path):
    try:
        return git("show", f"{base}:{path}")
    except subprocess.CalledProcessError:
        return ""


def test_names(root):
    """Every test's file and full name, from `vitest list`; none when the tree has no Vitest."""
    if not os.path.exists(os.path.join(root, "vitest.config.ts")):
        return set()
    out = subprocess.run(["node_modules/.bin/vitest", "list", "--json"], cwd=root, capture_output=True, text=True, check=True).stdout
    return {f"{os.path.relpath(t['file'], root)} > {t['name']}" for t in json.loads(out)}


def base_tests(base):
    """The base's tests, listed in a throwaway worktree that borrows node_modules."""
    with tempfile.TemporaryDirectory(dir=".claude/tmp") as where:
        tree = os.path.join(where, "base")
        git("worktree", "add", "-q", "--detach", tree, base)
        try:
            os.symlink(os.path.abspath("node_modules"), os.path.join(tree, "node_modules"))
            return test_names(tree)
        finally:
            git("worktree", "remove", "--force", tree)


def self_test():
    """The rules on small cases: each refuses its fault and lets a declared one through."""
    assert removed_tests({"a > x", "a > y"}, {"a > x"}, []) == ["a > y"]
    assert removed_tests({"a > y"}, set(), ["Removed-test: a > y - merged into x"]) == []
    vitest = 'thresholds: {\n  lines: 85,\n  "packages/core/**": { lines: 100, branches: 95 },\n}'
    before = floors(vitest, '{"thresholds": {"break": 80}}')
    assert before == {"coverage everywhere lines": 85, "coverage packages/core/** lines": 100, "coverage packages/core/** branches": 95, "mutation break": 80}
    after = floors(vitest.replace("95", "90"), '{"thresholds": {"break": null}}')
    assert lowered_floors(before, after, []) == ["coverage packages/core/** branches 95 -> 90", "mutation break 80 -> 0"]
    assert lowered_floors(before, after, ["Lowered-floor: mutation break - x", "Lowered-floor: coverage packages/core/** branches - y"]) == []
    assert lowered_floors(before, before, []) == []
    diff = "M\tapp/tests/e2e/home.spec.ts-snapshots/home.png\nA\tapp/tests/e2e/x.spec.ts-snapshots/new.png\nD\tapp/__screenshots__/old.png"
    assert changed_baselines(diff, []) == ["app/tests/e2e/home.spec.ts-snapshots/home.png", "app/__screenshots__/old.png"]
    assert changed_baselines(diff, ["Updated-baseline: app/tests/e2e/home.spec.ts-snapshots/home.png - new header", "Updated-baseline: app/__screenshots__/old.png - gone with the page"]) == []
    print("check_regressions: self-test passed")


if sys.argv[1:] == ["--self-test"]:
    self_test()
    sys.exit(0)
base = sys.argv[1]
declared = [line.strip() for line in git("log", "--format=%B", f"{base}..HEAD").splitlines() if line.strip()]
problems = [f"a test is gone: {t}" for t in removed_tests(base_tests(base), test_names("."), declared)]
problems += [f"a floor is lower: {f}" for f in lowered_floors(floors(show(base, "vitest.config.ts"), show(base, "stryker.config.json")),
                                                               floors(open("vitest.config.ts").read(), open("stryker.config.json").read()), declared)]
problems += [f"an approved screenshot changed: {p}" for p in changed_baselines(git("diff", "--name-status", f"{base}..HEAD"), declared)]
if problems:
    print("check_regressions: the safety net shrank. Undo it, or say why in a commit (Removed-test:, Lowered-floor:, Updated-baseline:):", *problems, sep="\n  ", file=sys.stderr)
    sys.exit(1)
print("check_regressions: no test gone, no floor lower, no approved screenshot changed")
