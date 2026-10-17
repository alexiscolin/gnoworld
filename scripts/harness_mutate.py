"""harness_mutate.py: the harness's own mutation test.

Each guard of the harness (a lint rule or selector, a check in a script, a refusal in a hook, a
limit in a config, a step of the gate) is switched off in turn, in a throwaway worktree of HEAD,
and the harness's tests (probe.py, test_hooks.sh) must then fail. A guard whose removal they do
not notice is a guard nobody checks: the run prints the test to add. GAPS lists the known ones,
with their reason; a gap that gets killed must leave the list. Usage: scripts/harness_mutate.py,
from the repository root; it takes minutes, so the full gate runs it when the harness changes."""
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import worktree

WORKTREE = ""  # the throwaway worktree of HEAD, set by the run below
OFF = "(lambda *a: None)("
GAPS = {}  # label -> why no test can notice it yet

TESTS = {"probe": [sys.executable, "-I", "scripts/probe.py"], "hooks": ["sh", "scripts/test_hooks.sh"]}
# Each guard's file, and the sections of its test that must notice the guard gone (their ONLY=):
# a mutant runs those alone, not the whole suite. A guard file missing here stops the run.
SECTIONS = {
    "eslint.config.ts": "lint,outside_core,react", "package.json": "react", "app/tsconfig.json": "react","scripts/check_css.py": "css", "scripts/check_comments.mjs": "comments",
    ".jscpd.json": "jscpd", "tsconfig.base.json": "tsc", "vitest.config.ts": "vitest",
    "scripts/guard.py": "guard", "scripts/review_pass.py": "review_pass", "scripts/patch_coverage.py": "patch_coverage",
    "scripts/check_docs.py": "check_docs", "scripts/check_regressions.py": "regressions", ".githooks/commit-msg": "commit_msg",
    ".githooks/pre-push": "pre_push", ".githooks/pre-commit": "pre_commit,wiring", "scripts/code_changed.sh": "pre_commit,stop_gate",
    "scripts/stop_gate.sh": "stop_gate,wiring", ".claude/settings.json": "wiring", "scripts/test_hooks.sh": "wiring",
    "scripts/check.sh": "wiring", "scripts/mutate.py": "wiring", "scripts/prove_fix.py": "prove_fix",
    "scripts/audit.py": "audit", "scripts/scan_secrets.sh": "secrets", ".github/workflows/gate.yml": "wiring",
}


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


def alternatives(selector):
    """The top-level alternatives of an esquery selector: its commas outside brackets and parentheses."""
    parts, depth, start = [], 0, 0
    for i, c in enumerate(selector):
        depth += (c in "([") - (c in ")]")
        if c == "," and depth == 0:
            parts.append(selector[start:i])
            start = i + 1
    return parts + [selector[start:]]


def selectors(path, test):
    """One mutant per alternative of each selector, made to match nothing; the others stay."""
    text = read(path)
    found = list(re.finditer(r'selector:\s*(["`])(.*?)\1', text, re.S))
    if not found:
        yield "eslint selector", path, None, test
    for m in found:
        parts = alternatives(m.group(2))
        for n, part in enumerate(parts):
            off = ",".join(parts[:n] + [" Never" if n else "Never"] + parts[n + 1:])
            yield f"eslint selector `{part.strip()[:100]}`", path, text[: m.start(2)] + off + text[m.end(2):], test


def mutants():
    """Every guard of the harness, each with the test that must notice it gone."""
    # ESLint: each rule set to "error", switched off; each selector and restricted name, never matching.
    text = read("eslint.config.ts")
    for m in re.finditer(r'^\s+"?([\w@/-]+)"?:\s*(?=\[?\s*"error"|\[\s*$)', text, re.M):
        at = text.find('"error"', m.end())
        yield f"eslint {m.group(1)} (line {text.count(chr(10), 0, m.start()) + 1})", "eslint.config.ts", text[:at] + '"off"' + text[at + 7:], "probe"
    yield from selectors("eslint.config.ts", "probe")
    yield from each("eslint.config.ts", 'property: "', 'property: "never_', "probe", "eslint restricted property")
    yield from each("eslint.config.ts", "noInlineConfig: true", "noInlineConfig: false", "probe", "eslint inline config")
    # The app's React lint, and the files its rules reach.
    yield from each("eslint.config.ts", 'reactHooks.configs.flat["recommended-latest"], ', "", "probe", "eslint React hooks preset")
    yield from each("eslint.config.ts", ', eslintReact.configs["strict-type-checked"]', "", "probe", "eslint @eslint-react preset")
    yield from each("eslint.config.ts", '{ name: "react", importNames: ["memo", "useMemo", "useCallback"], message: MEMO },', "", "probe", "eslint no hand-written memo")
    yield from each("eslint.config.ts", '...["memo", "useMemo", "useCallback"].map(', "...[].map(", "probe", "eslint no React.useMemo")
    yield from each("eslint.config.ts", '...["innerHTML", "outerHTML", "insertAdjacentHTML"].map(', "...[].map(", "probe", "eslint no raw HTML")
    yield from each("eslint.config.ts", 'name: "DataWithResponseInit"', 'name: "Nothing"', "probe", "eslint lets a route throw data()")
    yield from each("eslint.config.ts", '"**/*.spec.ts"', '"**/*.never.ts"', "probe", "eslint reads Playwright's tests")
    yield from each("package.json", "--max-warnings 0 ", "", "probe", "lint fails on a warning")
    yield from each("app/tsconfig.json", '"extends": "../tsconfig.base.json",', "", "probe", "the app takes the compiler flags")
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
    yield from each("scripts/guard.py", "push |= check_git(words)", "check_git(words)", "hooks", "guard asks before a push")
    yield from each("scripts/guard.py", "words = unwrap(raw)", "words = raw", "hooks", "guard sees through wrappers")
    yield from each("scripts/guard.py", 'yield from commands("".join(inner))', "pass", "hooks", "guard reads $(...)")
    yield from each("scripts/guard.py", 'elif words and words[0] == "eval":', "elif False:", "hooks", "guard reads eval")
    yield from each("scripts/guard.py", ' or (program in INTERPRETERS and ".gno" in text)', "", "hooks", "guard sees interpreters write .gno")
    yield from each("scripts/guard.py", '"--no-verify".startswith(w)', 'w == "--no-verify"', "hooks", "guard refuses --no-verify's prefixes")
    yield from each("scripts/guard.py", 'found == {"gnomcp", "skill"}', '"gnomcp" in found', "hooks", "guard wants the gno skill")
    yield from each("scripts/guard.py", 'text = text.replace("\\\\\\n", "")', "pass", "hooks", "guard joins continued lines")
    yield from each("scripts/guard.py", "ASSIGNMENT.fullmatch(words[0]) or words[0] in KEYWORDS", "ASSIGNMENT.fullmatch(words[0])", "hooks", "guard reads past if, then, ( and {")
    yield from each("scripts/guard.py", '"xargs", "sudo", "doas"}', '"xargs"}', "hooks", "guard reads past sudo")
    yield from each("scripts/guard.py", 're.fullmatch(r"-[a-zA-Z]*c[a-zA-Z]*", words[1])', 'words[1] == "-c"', "hooks", "guard reads bash -lc")
    yield from each("scripts/guard.py", "            if token in SEPARATORS:", "            if False:", "hooks", "guard splits at the shell's separators")
    yield from each("scripts/review_pass.py", 'sys.exit(f"review_pass: no', 'print(f"review_pass: no', "hooks", "review_pass check")
    yield from each("scripts/patch_coverage.py", "    sys.exit(1)", "    pass", "hooks", "patch_coverage floor")
    yield from each("scripts/check_docs.py", "    sys.exit(1)", "    pass", "hooks", "check_docs")
    yield from each("scripts/check_docs.py", "if status not in STATUSES:", "if False:", "hooks", "ledger: a known status")
    yield from each("scripts/check_docs.py", 'elif status == "fixed" and not any(', 'elif False and not any(', "hooks", "ledger: a fix names its commit")
    yield from each("scripts/check_docs.py", "if fid in seen:", "if False:", "hooks", "ledger: unique ids")
    yield from each("scripts/check_docs.py", 'evidence in ("", "—", "-")', "False", "hooks", "ledger: a rejection says why")
    yield from each("scripts/patch_coverage.py", "unmeasured = [p for p in changed if", "unmeasured = [p for p in [] if", "hooks", "patch_coverage unmeasured file")
    yield from each("scripts/mutate.py", 'glob.glob("**/gnomod.toml"', 'glob.glob("r/**/gnomod.toml"', "hooks", "mutate.py every gno package")
    yield from each("scripts/check.sh", '"$GNO" test ./...', '"$GNO" test ./r/...', "hooks", "check.sh gno scope")
    yield from each("vitest.config.ts", "requireAssertions: true", "requireAssertions: false", "probe", "vitest requires an assertion")
    yield from each("scripts/check_regressions.py", "before - after", "set()", "hooks", "check_regressions tests")
    yield from each("scripts/check_regressions.py", "after.get(name, 0) < old", "False", "hooks", "check_regressions floors")
    yield from each("scripts/check_regressions.py", 'status[0] in "MDR"', "False", "hooks", "check_regressions baselines")
    yield from each("scripts/check_regressions.py", 're.fullmatch(rf"{key}: (.+?) - \\S.*", line.strip())', 're.search(rf"{key}: (.+?)(?: - |$)", line.strip())', "hooks", "check_regressions wants a reason")
    yield from each("scripts/check_regressions.py", "e for e in after - before if", "e for e in set() if", "hooks", "check_regressions gaps and ignores")
    yield from each("scripts/check_regressions.py", ".strip() in gone.get(current, set())", ".strip() in set()", "hooks", "check_regressions switched to fails")
    yield from each("scripts/check_regressions.py", 'elif path.endswith(("_test.gno", "_test.go")):', "elif False:", "hooks", "check_regressions gno and Go tests")
    yield from each("scripts/check_regressions.py", "ast.literal_eval(node.value)", "{}", "hooks", "check_regressions reads GAPS")
    yield from each("scripts/check_regressions.py", 'if "ignore" in key.lower():', "if False:", "hooks", "check_regressions reads ignore lists")
    yield from each("scripts/check_regressions.py", 'elif key == "mutate":', "elif False:", "hooks", "check_regressions reads StrykerJS's negated globs")
    yield from each("scripts/check_regressions.py", '    if report["errors"]:', "    if False:", "hooks", "check_regressions stops on a failed Playwright listing")
    yield from each("scripts/check_regressions.py", 'walk(child, [*path, child["title"]])', "walk(child, path)", "hooks", "check_regressions names a journey with its describe")
    yield from each("scripts/check_regressions.py", ', "scripts/.gitleaksignore", "pnpm-workspace.yaml"]', ', "pnpm-workspace.yaml"]', "hooks", "check_regressions reads the secret scan's exceptions")
    yield from each("scripts/check_regressions.py", ', "pnpm-workspace.yaml"]', "]", "hooks", "check_regressions reads pnpm's exemptions")
    yield from each("scripts/check_regressions.py", 'elif re.search(rf"^{key}:", text, re.M):', "elif False:", "hooks", "check_regressions reports a list it cannot read")
    yield from each("scripts/check_regressions.py", '("minimumReleaseAge", "trustPolicy", "engineStrict")', "()", "hooks", "check_regressions watches pnpm's supply-chain settings")
    yield from each("scripts/check_regressions.py", "os.path.relpath(os.path.realpath(path), os.path.realpath(root))", "os.path.relpath(path, root)", "hooks", "check_regressions resolves links")
    yield from each("scripts/check_regressions.py", "if after.get(name) != old and", "if False and", "hooks", "check_regressions watches a check's settings")
    yield from each(".githooks/commit-msg", "exit 1", ":", "hooks", "commit-msg refusal")
    yield from each(".githooks/pre-push", "exit 1", ":", "hooks", "pre-push refusal")
    yield from each(".githooks/pre-push", 'python3 -I scripts/review_pass.py check "$local_sha"', ":", "hooks", "pre-push review check")
    yield from each(".githooks/pre-push", "sh scripts/check.sh --full </dev/null", ":", "hooks", "pre-push gate")
    yield from each(".githooks/pre-push", "		sh scripts/check.sh </dev/null", "		:", "hooks", "pre-push fast gate")
    yield from each(".githooks/pre-push", "		sh scripts/scan_secrets.sh", "		:", "hooks", "pre-push secret scan")
    yield from each("scripts/scan_secrets.sh", "--config \"$here/$config\" ", "", "hooks", "scan_secrets imposes its rules")
    yield from each("scripts/scan_secrets.sh", "gitleaks.toml gitleaks-private.toml; do", "gitleaks.toml; do", "hooks", "scan_secrets keeps private names out")
    yield from each("scripts/scan_secrets.sh", " --ignore-gitleaks-allow", "", "hooks", "scan_secrets ignores gitleaks:allow")
    yield from each("scripts/scan_secrets.sh", "if [ -e .gitleaksignore ]; then", "if false; then", "hooks", "scan_secrets refuses a root .gitleaksignore")
    yield from each(".githooks/pre-commit", 'sh "$s/check.sh"', "true", "hooks", "pre-commit gate")
    yield from each(".githooks/pre-commit", 'sh "$s/scan_secrets.sh" --staged', ":", "hooks", "pre-commit secret scan")
    yield from each(".githooks/pre-commit", 'sh "$s/borrow_node_modules.sh" "$staged"', 'sh scripts/borrow_node_modules.sh "$staged"', "hooks", "pre-commit runs the staged helpers")
    yield from each(".githooks/pre-commit", 'if [ -n "$differ" ]; then', "if false; then", "hooks", "pre-commit refuses a staged harness unlike the working tree")
    yield from each(".githooks/pre-commit", "--name-only -z --", "--name-only --", "hooks", "pre-commit keeps a harness file's name whole")
    yield from each("scripts/guard.py", 'if sub in ("send-pack", "http-push", "receive-pack"):', "if False:", "hooks", "guard refuses send-pack")
    yield from each("scripts/guard.py", 'w.lower().startswith("alias.") or', "False or", "hooks", "guard refuses git aliases")
    yield from each("scripts/check.sh", "unset AUDIT_ANSWER PROVE_FIX_VITEST PROVE_FIX_GNO PROVE_FIX_GO", "true", "hooks", "check.sh clears the test switches")
    yield from each("scripts/code_changed.sh", "! git diff --cached", "git diff --cached", "hooks", "code_changed staged")
    yield from each("scripts/code_changed.sh", '[ -n "$(git status', '[ -z "$(git status', "hooks", "code_changed working tree")
    yield from each("scripts/code_changed.sh", 'git ls-files -s -- "$@"; git diff --binary -- "$@";', "git rev-parse HEAD; git diff HEAD --binary;", "hooks", "code_changed state leaves prose out")
    yield from each("scripts/code_changed.sh", ' git diff --binary -- "$@";', "", "hooks", "code_changed state holds unstaged changes")
    yield from each("scripts/stop_gate.sh", "exit 2", "exit 0", "hooks", "stop_gate block")
    yield from each("scripts/stop_gate.sh", '" = "$(sh scripts/code_changed.sh --state)"', '" != "x"', "hooks", "stop_gate compares the state the gate passed")
    yield from each("scripts/check.sh", "printf '%s' \"${want#v}\" | grep -qxE", "true || printf '%s' \"${want#v}\" | grep -qxE", "hooks", "check.sh refuses a .node-version that is not a version")
    yield from each(".claude/settings.json", '"onFailure": "block"', '"onFailure": "ignore"', "hooks", "settings: guard blocks on a crash")
    yield from each(".claude/settings.json", '"allowUnsandboxedCommands": false', '"allowUnsandboxedCommands": true', "hooks", "settings: no unsandboxed retry")
    yield from each(".claude/settings.json", '"denyRead": ["~/.ssh"', '"denyRead": ["~/.nothing"', "hooks", "settings: credentials unreadable")
    yield from each(".claude/settings.json", '"scripts",\n', '"nothing",\n', "hooks", "settings: harness unwritable")
    yield from each(".claude/settings.json", '"Bash(pnpm add *)"', '"Bash(nothing)"', "hooks", "settings: a new dependency asks")
    yield from each(".claude/settings.json", '"Edit(/scripts/guard.py)"', '"Edit(/nothing)"', "hooks", "settings: an edit of a hook's script asks")
    yield from each(".claude/settings.json", '"mcp__gnomcp__gno_addpkg"', '"mcp__nothing"', "hooks", "settings: chain writes ask")
    yield from each(".claude/settings.json", '"repo": "gnoverse/gno-mcp"', '"repo": "nowhere/nothing"', "hooks", "settings: gnomcp's marketplace")
    for path in ("scripts/test_hooks.sh", ".githooks/pre-commit"):
        yield from each(path, "|| status=1; exit \"$status\"' EXIT", "exit \"$status\"' EXIT", "hooks", f"{path} keeps a failure through its EXIT trap")
    yield from each("scripts/prove_fix.py", "return all(subprocess.run(cmd", "return True or all(subprocess.run(cmd", "hooks", "prove_fix runs the tests on the parent")
    yield from each("scripts/prove_fix.py", 're.search(r"^No-test: \\S", message, re.M)', "True", "hooks", "prove_fix wants a reason for no test")
    yield from each("scripts/prove_fix.py", "    if not product:\n", "    if True:\n", "hooks", "prove_fix checks product fixes")
    yield from each("scripts/audit.py", 'if a.get("severity") in SEVERE]', "if False]", "hooks", "audit fails on an advisory")
    yield from each("scripts/audit.py", "locked.setdefault(name, set()).add(version)", "pass", "hooks", "audit asks about every package")
    yield from each("scripts/audit.py", '''sys.exit(f"audit: no readable answer from npm's advisory database: {e}")''', "answer = {}", "hooks", "audit fails without an answer")
    ci = ".github/workflows/gate.yml"
    yield from each(ci, "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "actions/checkout@v7", "hooks", "CI pins its actions")
    yield from each(ci, "  contents: read\n", "  contents: write\n", "hooks", "CI only reads")
    yield from each(ci, "run: sh scripts/check.sh --full", "run: sh scripts/check.sh", "hooks", "CI runs the full gate")
    yield from each(ci, "| sha256sum -c", "| cat", "hooks", "CI checks gitleaks' checksum")
    yield from each(ci, " --frozen-lockfile", "", "hooks", "CI keeps the lockfile frozen")
    yield from each(ci, "run: sh scripts/check.sh --full", "run: sh scripts/check.sh --full || true", "hooks", "CI fails on a red gate")
    yield from each(ci, "      - name: The full gate\n", "      - name: The full gate\n        continue-on-error: true\n", "hooks", "CI lets no step fail")
    yield from each(ci, "      - name: gitleaks", "      - if: false\n        name: gitleaks", "hooks", "CI skips no step")
    yield from each(ci, "\n  push:\n", "\n  pull_request_target:\n  push:\n", "hooks", "CI runs on a push only")
    yield from each(ci, "persist-credentials: false", "persist-credentials: true", "hooks", "CI drops its token")
    yield from each(ci, "fetch-depth: 0", "fetch-depth: 1", "hooks", "CI fetches main")
    yield from each(ci, "GNO_COMMIT: 07e44776c26187830b7dcbd2454991b5a1960378", "GNO_COMMIT: master", "hooks", "CI pins gno")
    # The gate: each step dropped.
    yield from lines("scripts/check.sh", r"^(\s*)((?:run |python3 -I |sh scripts/|gitleaks |go vet |go run |\(cd gno |\$full \|\| run ).*)$", r"\1:", "hooks", "check.sh drops")


def run(test, only=""):
    """A test's exit code in the worktree; `only` names its sections, empty for all of them."""
    env = {**os.environ, "ONLY": only}
    return subprocess.run(TESTS[test], cwd=WORKTREE, env=env, capture_output=True, text=True, timeout=600).returncode


def proposal(test, path):
    """The smallest change that would make a test notice this guard."""
    if path == "scripts/check.sh":
        return 'add the step to the list in scripts/test_hooks.sh ("check.sh runs every step it promises")'
    if test == "probe":
        return f"plant in scripts/probe.py, block {SECTIONS[path]}, a fault only this guard catches, or drop the guard if another holds it"
    return f"add to scripts/test_hooks.sh, section {SECTIONS[path]}, the input this line refuses and the exit code it must give"


failures = []
with worktree("HEAD") as WORKTREE:
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
            killed = run(test, SECTIONS[path]) != 0
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
            print(f"FAIL  survives: {label}\n      → {proposal(test, path)}")
            failures.append(label)
if failures:
    sys.exit(f"harness_mutate: {len(failures)} guards are not proven by a test")
print("harness_mutate: removing any guard fails a test")
