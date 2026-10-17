"""harness_mutate.py: the harness's own mutation test.

Each guard of the harness (a lint rule or selector, a check in a script, a refusal in a hook, a
limit in a config, a step of the gate) is switched off in turn, in a throwaway worktree of HEAD,
and the harness's tests (probe.py, test_hooks.sh) must then fail. A guard whose removal they do
not notice is a guard nobody checks: the run prints the test to add. GAPS lists the known ones,
with their reason; a gap that gets killed must leave the list. Usage: scripts/harness_mutate.py,
from the repository root; it takes minutes, so the full gate runs it when the harness changes."""
import os
import re
import shutil
import subprocess
import sys

WORKTREE = ".claude/tmp/harness-mutate"
OFF = "(lambda *a: None)("
GAPS = {}  # label -> why no test can notice it yet

TESTS = {"probe": [sys.executable, "-I", "scripts/probe.py"], "hooks": ["sh", "scripts/test_hooks.sh"]}


def read(path):
    """A file of the worktree: the mutants come from the code under test, not the working tree."""
    with open(os.path.join(WORKTREE, path)) as f:
        return f.read()


def each(path, find, replace, test, label):
    """One mutant per occurrence of `find`; none at all means this script is out of date."""
    text = read(path)
    spots = [m.start() for m in re.finditer(re.escape(find), text)]
    if not spots:
        yield label, path, None, test
    for n, at in enumerate(spots):
        yield f"{label} #{n + 1}", path, text[:at] + replace + text[at + len(find):], test


def lines(path, pattern, replace, test, label):
    """One mutant per line matching `pattern`, the line rewritten by `replace`."""
    text = read(path)
    found = list(re.finditer(pattern, text, re.M))
    if not found:
        yield label, path, None, test
    for m in found:
        yield f"{label} `{m.group(0).strip()[:50]}`", path, text[: m.start()] + m.expand(replace) + text[m.end():], test


def mutants():
    """Every guard of the harness, each with the test that must notice it gone."""
    # ESLint: each rule set to "error", switched off; each selector and restricted name, never matching.
    text = read("eslint.config.ts")
    for m in re.finditer(r'^\s+"?([\w@/-]+)"?:\s*(?=\[?\s*"error"|\[\s*$)', text, re.M):
        at = text.find('"error"', m.end())
        yield f"eslint {m.group(1)} (line {text.count(chr(10), 0, m.start()) + 1})", "eslint.config.ts", text[:at] + '"off"' + text[at + 7:], "probe"
    yield from each("eslint.config.ts", 'selector: "', 'selector: "Never ', "probe", "eslint selector")
    yield from each("eslint.config.ts", "selector: `", "selector: `Never ", "probe", "eslint selector")
    yield from each("eslint.config.ts", 'property: "', 'property: "never_', "probe", "eslint restricted property")
    yield from each("eslint.config.ts", "noInlineConfig: true", "noInlineConfig: false", "probe", "eslint inline config")
    # The style checks.
    yield from each("scripts/check_css.py", "problems.append(", OFF, "probe", "check_css problem")
    yield from each("scripts/check_css.py", "problems += [", "problems += [] and [", "probe", "check_css unused tokens")
    yield from lines("scripts/check_comments.mjs", r'^(  \["[^"]+", )/.*/\w*\],$', r"\1/(?!)/],", "probe", "check_comments rule")
    yield from each("scripts/check_comments.mjs", "{ header: 6, other: 3 }", "{ header: 60, other: 30 }", "probe", "check_comments limits")
    yield from each("scripts/check_comments.mjs", "problems.push(", "(() => {})(", "probe", "check_comments problem")
    yield from each(".jscpd.json", '"exitCode": 1', '"exitCode": 0', "probe", "jscpd exit code")
    yield from each(".jscpd.json", '"similarity": 0.8', '"similarity": 1', "probe", "jscpd similarity")
    yield from each("tsconfig.base.json", '"lib": ["es2024"],', "", "probe", "tsconfig lib")
    # The hooks and their scripts.
    yield from each("scripts/guard.py", ' refuse("', " " + OFF + '"', "hooks", "guard refusal")
    yield from each("scripts/guard.py", " refuse(UNREAD)", " " + OFF + "UNREAD)", "hooks", "guard unread .gno")
    yield from each("scripts/review_pass.py", 'sys.exit(f"review_pass: no', 'print(f"review_pass: no', "hooks", "review_pass check")
    yield from each("scripts/patch_coverage.py", "    sys.exit(1)", "    pass", "hooks", "patch_coverage floor")
    yield from each("scripts/check_docs.py", "    sys.exit(1)", "    pass", "hooks", "check_docs")
    yield from each("scripts/check_regressions.py", "before - after", "set()", "hooks", "check_regressions tests")
    yield from each("scripts/check_regressions.py", "after.get(name, 0) < old", "False", "hooks", "check_regressions floors")
    yield from each("scripts/check_regressions.py", 'status[0] in "MDR"', "False", "hooks", "check_regressions baselines")
    yield from each(".githooks/commit-msg", "exit 1", ":", "hooks", "commit-msg refusal")
    yield from each(".githooks/pre-push", "exit 1", ":", "hooks", "pre-push refusal")
    yield from each(".githooks/pre-push", 'python3 -I scripts/review_pass.py check "$local_sha"', ":", "hooks", "pre-push review check")
    yield from each(".githooks/pre-push", "sh scripts/check.sh --full </dev/null", ":", "hooks", "pre-push gate")
    yield from each(".githooks/pre-commit", 'sh "$staged/scripts/check.sh"', "true", "hooks", "pre-commit gate")
    yield from each("scripts/code_changed.sh", "! git diff --cached", "git diff --cached", "hooks", "code_changed staged")
    yield from each("scripts/code_changed.sh", '[ -n "$(git status', '[ -z "$(git status', "hooks", "code_changed working tree")
    yield from each("scripts/stop_gate.sh", "exit 2", "exit 0", "hooks", "stop_gate block")
    yield from each("scripts/format_hook.sh", "node_modules/.bin/eslint --fix", ": eslint --fix", "hooks", "format_hook eslint")
    yield from each("scripts/format_hook.sh", "node_modules/.bin/prettier --write", ": prettier --write", "hooks", "format_hook prettier")
    # The gate: each step dropped.
    yield from lines("scripts/check.sh", r"^(\s*)((?:run |python3 -I |sh scripts/|gitleaks |go vet |go run |\(cd gno |\$full \|\| run ).*)$", r"\1:", "hooks", "check.sh drops")


def run(test):
    return subprocess.run(TESTS[test], cwd=WORKTREE, capture_output=True, text=True, timeout=600).returncode


def proposal(label):
    """The smallest change that would make a test notice this guard."""
    if label.startswith("eslint"):
        return "add to LINT in scripts/probe.py a case only this rule or selector refuses, or drop it if another already holds it"
    if label.startswith("check.sh drops"):
        return 'add the step to the list in scripts/test_hooks.sh ("check.sh runs every step it promises")'
    if label.split()[0] in ("guard", "review_pass", "patch_coverage", "check_docs", "check_regressions", "commit-msg", "pre-push", "pre-commit", "code_changed", "stop_gate", "format_hook"):
        return "add to scripts/test_hooks.sh the input this line refuses, and the exit code it must give"
    return "plant in scripts/probe.py a fault that only this guard catches"


shutil.rmtree(WORKTREE, ignore_errors=True)
subprocess.run(["git", "worktree", "prune"], check=True)
subprocess.run(["git", "worktree", "add", "-q", "--detach", WORKTREE, "HEAD"], check=True)
subprocess.run(["sh", "scripts/borrow_node_modules.sh", WORKTREE], check=True)
failures = []
try:
    for test in TESTS:  # the control: an untouched copy passes, so a failure means the mutant
        if run(test) != 0:
            sys.exit(f"harness_mutate: {test} fails on the untouched copy; fix that first")
    for label, path, mutated, test in mutants():
        if mutated is None:
            sys.exit(f"harness_mutate: {label}: nothing to mutate in {path}; this script is out of date")
        target = os.path.join(WORKTREE, path)
        original = read(path)
        with open(target, "w") as f:
            f.write(mutated)
        try:
            killed = run(test) != 0
        finally:
            with open(target, "w") as f:
                f.write(original)
        if killed and label in GAPS:
            print(f"FAIL  killed, yet listed in GAPS: {label}\n      → delete its line from GAPS")
            failures.append(label)
        elif killed:
            print(f"ok    killed: {label}")
        elif label in GAPS:
            print(f"ok    survives: {label}  (known gap: {GAPS[label]})")
        else:
            print(f"FAIL  survives: {label}\n      → {proposal(label)}")
            failures.append(label)
finally:
    subprocess.run(["git", "worktree", "remove", "--force", WORKTREE])
if failures:
    sys.exit(f"harness_mutate: {len(failures)} guards are not proven by a test")
print("harness_mutate: removing any guard fails a test")
