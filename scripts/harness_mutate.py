"""harness_mutate.py: the harness's own mutation test.

Each guard of the harness (a lint rule, a check in a script, a refusal in a hook, a limit in a
config) is switched off in turn, in a throwaway worktree, and the harness's tests (probe.py,
test_hooks.sh) must then fail. A guard whose removal they do not notice is a guard nobody
checks: it is listed in GAPS with its reason, or the tests grow. Usage: scripts/harness_mutate.py
from the repository root; it takes several minutes, so it runs on harness changes, not per commit."""
import os
import re
import shutil
import subprocess
import sys

WORKTREE = ".claude/tmp/harness-mutate"
OFF = "(lambda *a: None)("
GAPS = {  # label -> why no test can notice it yet
    "tsconfig types #1": "no @types package is installed, so types: [] changes nothing yet; testable once @types/node arrives (slice 3)",
}

TESTS = {"probe": [sys.executable, "-I", "scripts/probe.py"], "hooks": ["sh", "scripts/test_hooks.sh"]}


def nth(text, find, replace, n):
    """text with the n-th occurrence of find replaced, or None when there is no n-th."""
    at = -1
    for _ in range(n + 1):
        at = text.find(find, at + 1)
        if at < 0:
            return None
    return text[:at] + replace + text[at + len(find):]


def each(path, find, replace, test, label):
    text = open(path).read()
    for n in range(text.count(find)):
        yield f"{label} #{n + 1}", path, nth(text, find, replace, n), test


def eslint_rules():
    """Every rule set to "error" in eslint.config.ts, switched to "off"."""
    text = open("eslint.config.ts").read()
    for m in re.finditer(r'^\s+"?([\w@/-]+)"?:\s*(?=\[?\s*"error"|\[\s*$)', text, re.M):
        at = text.find('"error"', m.end())
        yield f"eslint {m.group(1)}", "eslint.config.ts", text[:at] + '"off"' + text[at + 7:], "probe"


def mutants():
    yield from eslint_rules()
    for path in ("scripts/check_css.py", "scripts/check_comments.py"):
        yield from each(path, "problems.append(", OFF, "probe", f"{path} problem")
    yield from each("scripts/check_css.py", "problems += [", "problems += [] and [", "probe", "check_css unused tokens")
    for name in ("MARKER", "BANNER", "STEP", "EMOJI"):
        text = open("scripts/check_comments.py").read()
        yield f"check_comments {name}", "scripts/check_comments.py", re.sub(rf"^{name} = re\.compile\(.*$", f'{name} = re.compile(r"(?!)")', text, count=1, flags=re.M), "probe"
    yield from each("scripts/check_comments.py", "limit = 6 if header else 3", "limit = 60 if header else 30", "probe", "check_comments limits")
    yield from each("scripts/clones.mjs", "process.exit(copies.length === 0 ? 0 : 1)", "process.exit(0)", "probe", "clones exit")
    yield from each(".jscpd.json", '"threshold": 0', '"threshold": 100', "probe", "jscpd threshold")
    yield from each("tsconfig.base.json", '"lib": ["es2024"],', "", "probe", "tsconfig lib")
    yield from each("tsconfig.base.json", '"types": [],', "", "probe", "tsconfig types")
    for indent in ("\n    ", "\n        ", "\n            "):
        yield from each("scripts/guard.py", indent + "refuse(", indent + OFF, "hooks", f"guard refusal ({len(indent) - 1} spaces)")
    yield from each("scripts/review_pass.py", 'sys.exit(f"review_pass: no', 'print(f"review_pass: no', "hooks", "review_pass check")
    yield from each("scripts/patch_coverage.py", "    sys.exit(1)", "    pass", "hooks", "patch_coverage floor")
    yield from each("scripts/check_docs.py", "    sys.exit(1)", "    pass", "hooks", "check_docs")
    yield from each(".githooks/commit-msg", "exit 1", ":", "hooks", "commit-msg refusal")
    yield from each(".githooks/pre-push", "exit 1", ":", "hooks", "pre-push refusal")
    yield from each(".githooks/pre-push", 'python3 -I scripts/review_pass.py check "$local_sha"', ":", "hooks", "pre-push review check")
    yield from each(".githooks/pre-commit", 'sh "$staged/scripts/check.sh"', "true", "hooks", "pre-commit gate")
    yield from each("scripts/code_changed.sh", "! git diff --cached", "git diff --cached", "hooks", "code_changed staged")
    yield from each("scripts/code_changed.sh", '[ -n "$(git status', '[ -z "$(git status', "hooks", "code_changed working tree")
    yield from each("scripts/stop_gate.sh", "exit 2", "exit 0", "hooks", "stop_gate block")
    yield from each("scripts/format_hook.sh", "node_modules/.bin/eslint --fix", ": eslint --fix", "hooks", "format_hook eslint")
    yield from each("scripts/format_hook.sh", "node_modules/.bin/prettier --write", ": prettier --write", "hooks", "format_hook prettier")
    text = open("scripts/check.sh").read()
    for m in re.finditer(r'^(\s*)((?:run |python3 -I |sh scripts/|gitleaks |go vet |go run |\(cd gno ).*)$', text, re.M):
        yield f"check.sh drops `{m.group(2)[:50]}`", "scripts/check.sh", text[: m.start(2)] + ":" + text[m.end(2):], "hooks"


def proposal(label):
    """The smallest change that would make a test notice this guard."""
    if label.startswith("eslint "):
        return f"add a case to LINT in scripts/probe.py that only {label[7:]} refuses, or drop the rule if another already holds it"
    if label.startswith("check.sh drops"):
        return 'add the step to the list in scripts/test_hooks.sh ("check.sh runs every step it promises")'
    if any(word in label for word in ("guard", "review_pass", "patch_coverage", "check_docs", "commit-msg", "pre-push", "pre-commit", "stop_gate", "format_hook")):
        return "add to scripts/test_hooks.sh the input this line refuses, and the exit code it must give"
    return "plant in scripts/probe.py a fault that only this guard catches"


def run(test):
    return subprocess.run(TESTS[test], cwd=WORKTREE, capture_output=True, text=True, timeout=600).returncode


shutil.rmtree(WORKTREE, ignore_errors=True)
subprocess.run(["git", "worktree", "prune"], check=True)
subprocess.run(["git", "worktree", "add", "-q", "--detach", WORKTREE, "HEAD"], check=True)
os.symlink(os.path.abspath("node_modules"), os.path.join(WORKTREE, "node_modules"))
survivors = []
try:
    for test in TESTS:  # the control: an untouched copy passes, so a failure means the mutant
        if run(test) != 0:
            sys.exit(f"harness_mutate: {test} fails on the untouched copy; fix that first")
    for label, path, mutated, test in mutants():
        if mutated is None:
            sys.exit(f"harness_mutate: {label}: nothing to mutate in {path}; this script is out of date")
        target = os.path.join(WORKTREE, path)
        original = open(target).read()
        with open(target, "w") as f:
            f.write(mutated)
        try:
            killed = run(test) != 0
        finally:
            with open(target, "w") as f:
                f.write(original)
        if killed:
            print(f"ok    killed: {label}")
        elif label in GAPS:
            print(f"ok    survives: {label}  (known gap: {GAPS[label]})")
        else:
            print(f"FAIL  survives: {label}\n      → {proposal(label)}")
            survivors.append(label)
finally:
    subprocess.run(["git", "worktree", "remove", "--force", WORKTREE])
if survivors:
    sys.exit(f"harness_mutate: {len(survivors)} guards are switched off with no test noticing")
print("harness_mutate: removing any guard fails a test")
