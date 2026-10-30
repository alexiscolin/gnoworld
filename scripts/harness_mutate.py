"""harness_mutate.py: the harness's own mutation test.

Each guard of the harness (a lint rule or selector, a check in a script, a refusal in a hook, a
limit in a config, a step of the gate) is switched off in turn, in a throwaway worktree of HEAD,
and the harness's tests (probe.py, test_hooks.sh) must then fail. A guard whose removal they do
not notice is a guard nobody checks: the run prints the test to add. GAPS lists the known ones,
with their reason; a gap that gets killed must leave the list. Usage: scripts/harness_mutate.py,
from the repository root; it takes minutes, so the full gate runs it when the harness changes.
`--dry` builds every mutant on the working tree and checks its text and sections, no test run: the fast
gate's check, through test_hooks.sh. The mutants are judged over HARNESS_SHARDS worktrees side by side
(4 by default); `--changed <base>` judges only those of the guard files committed since base, a merge's
own, and those whose sections of a suite it changed (suite_parts.py: a change outside every section reaches
them all); when this script changed, also those it defines anew or otherwise than base's. A killed mutant whose verdict's key
holds (verdict_key) is taken from the cache in ~/.cache/gnoworld-tools, a survivor is always judged again; the CI keeps
no cache, so it judges every one."""
import concurrent.futures
import contextlib
import hashlib
import inspect
import json
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import last_reviewed, worktree
from suite_parts import parts, select, touched

WORKTREE = ""  # the throwaway worktree of HEAD, set by the run below
OFF = "(lambda *a: None)("
GAPS = {  # label -> why no test can notice it yet
    "check.sh: a git that cannot list the change fails the gate #1": "equivalent: under sh, set -e already holds inside the command substitution, so the && only says it",
}

TESTS = {"probe": [sys.executable, "-I", "scripts/probe.py"], "hooks": ["sh", "scripts/test_hooks.sh"]}
# The lint config and its parts: each rule, selector and restricted name lives in one of them.
ESLINT = ["eslint.config.ts", "lint/shared.config.ts", "lint/core.config.ts", "lint/react.config.ts", "lint/app.config.ts", "lint/server.config.ts"]
REACT = "lint/react.config.ts"
APP = "lint/app.config.ts"
SERVER = "lint/server.config.ts"
# Each guard's file, and the sections of its test that must notice the guard gone (their ONLY=):
# a mutant runs those alone, not the whole suite. A guard file missing here stops the run.
SECTIONS = {
    "eslint.config.ts": "lint,outside_core,react,ui_lint,app_folders,server", "app/tsconfig.json": "react_tsc",
    "lint/shared.config.ts": "lint,outside_core,react,ui_lint,app_folders,server,bench_files", "lint/core.config.ts": "lint",
    "lint/react.config.ts": "react,ui_lint,app_folders", "lint/app.config.ts": "app_folders,react",
    "lint/server.config.ts": "server", "server/tsconfig.json": "server", "scripts/ergo.sh": "ergo",
    # A file both suites guard names each one's sections: a section of the other suite would
    # fail the run as unknown, and count a mutant killed that no test saw.
    "package.json": {"probe": "react_warn,react_tsc,ui_tsc", "hooks": "wiring"}, "pnpm-workspace.yaml": {"hooks": "wiring,regressions"},
    "scripts/check_css.py": "css", "scripts/check_comments.mjs": "comments",
    ".jscpd.json": "jscpd", "tsconfig.base.json": "tsc", "vitest.config.ts": {"probe": "vitest,vitest_ui,server,core_chromium,pinned_node,bench_files", "hooks": "vitest_stryker"},
    "app/tests/stories/pictures.spec.ts": "tokens_pictures", "app/playwright.stories.config.ts": "tokens_pictures",
    "scripts/guard.py": "guard", "scripts/review_pass.py": "review_pass", "scripts/patch_coverage.py": "patch_coverage",
    "scripts/check_docs.py": "check_docs", "scripts/check_regressions.py": "regressions", "scripts/check_migrations.py": "migrations",
    "scripts/harness_mutate.py": "harness_mutate,harness_shards,harness_shards_records,harness_shards_changed,harness_shards_cache", ".githooks/commit-msg": "commit_msg,installed",
    ".githooks/pre-push": "pre_push,wiring,outside,installed", ".githooks/pre-commit": "pre_commit,wiring,outside,installed,gate_checks",
    ".githooks/records.sh": "outside,installed,wiring", ".githooks/pre-merge-commit": "outside,installed", ".githooks/merge.sh": "installed",
    "scripts/install_hooks.sh": "installed,outside", "scripts/code_changed.sh": "pre_commit,stop_gate", "scripts/borrow_node_modules.sh": "prove_fix,worktree_script,borrow",
    "scripts/stop_gate.sh": "stop_gate,wiring", ".claude/workflows/branch.js": "workflow_branch", ".claude/settings.json": "wiring", "scripts/test_hooks.sh": "wiring",
    "scripts/check.sh": "wiring,check_hooks,gate_scope,gate_triggers,gate_lanes,gate_times,gate_full,gate_full_order,gate_full_fail,gate_full_merge,gate_journeys,gate_checks,gate_stryker", "scripts/mutate.py": "wiring", "scripts/journeys.py": "gate_journeys", "scripts/prove_fix.py": "prove_fix",
    "scripts/repo_files.py": {"hooks": "worktrees,regressions,batch_size,harness_shards,harness_shards_records,harness_shards_changed,harness_shards_cache,bench", "probe": "bench_files"}, "scripts/worktree.sh": "worktree_script", "scripts/bench.py": "bench", "scripts/suite_parts.py": "mutant_scope,harness_shards,harness_shards_records,harness_shards_changed,harness_shards_cache", "scripts/batch_size.py": "batch_size", "scripts/load.py": "gate_times", "scripts/unsteady.py": {"hooks": "gate_lanes", "probe": "unsteady_real"}, "scripts/audit.py": "audit", "scripts/scan_secrets.sh": "secrets", "scripts/gitleaks-private.toml": "secrets", ".github/workflows/gate.yml": "wiring",
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


def scoping_mutants():
    """The fast gate runs the journeys its change can reach (slice-5 harness-b): check.sh's use of scripts/journeys.py, and the rules in it."""
    check = "scripts/check.sh"
    for find, replace, label in (
        ("if ! $full && ! $all && $app; then scope=", "if false; then scope=", "scopes the journeys to the change"),
        ('if [ "$scope" != all ]; then', "if false; then", "gives Playwright the journeys journeys.py names"),
        ('if [ "$scope" != all ] && [ "$scope" != none ]; then', 'if [ "$scope" != all ]; then', "gives a run with no journey the budget of one with some"),
        (r"""sed 's/[][+(){}^$|?*\\]/\\&/g'""", r"""sed 's/[][+(){}^$|?*\\]/&/g'""", "escapes the regular-expression characters of a journey's name"),
        ('set -- "$@" "$(printf', 'set -- "$(printf', "gives every journey journeys.py names"),
        ("printf '%s\\n' \"$changed\" | python3 -I scripts/journeys.py", "python3 -I scripts/journeys.py </dev/null", "tells journeys.py what changed"),
    ):
        yield from each(check, find, replace, "hooks", f"check.sh {label}")
    j = "scripts/journeys.py"
    for find, replace, label in (
        ("or path in always", "", "runs every journey on a file every page loads"),
        ("if path not in loaded:\n            return None", "if False:\n            return None", "runs every journey on a file no page loads"),
        ("| unplaced\n", "\n", "runs the journeys it cannot place on every change"),
        ("if opaque or not urls:", "if False:", "cannot place a journey whose page is not a literal"),
        ("    if graph.opaque:\n        return None\n", "", "gives up on an import it cannot follow"),
        (r"(?:from|import)\s*\(?", r"(?:from)\s*\(?", "follows an import() and a side-effect import"),
        ('os.path.join(base, "index" + e) for e in EXTENSIONS[1:]', "base for e in ()", "follows a directory's index"),
        ('-2 if s == "*" else', '20 if s == "*" else', "ranks the splat last"),
        ("if unknown and any(not splat for _, _, splat in hits):", "if False:", "means every route a template's ${} could"),
        ("if not os.path.isfile(shots.group(1)):\n                return None", "if False:\n                return None", "runs every journey on a picture of no journey"),
        ("        if TEST_FILE.search(path):\n            skipped += 1\n            continue\n", "", "reads a test file as no change of the pages"),
        ("        if PROSE.search(path):\n            skipped += 1\n            continue\n", "", "reads prose as no change of the pages"),
        ("if not run or run >= set(specs):", "if not run:", "says 'all' when every journey is due"),
        ("if len(found) != len(", "if False and len(found) != len(", "refuses a routes list with a call it does not read"),
        ("(?:layout|prefix)", "(?:prefix)", "refuses a routes list with a layout"),
        ("(?:layout|prefix)", "(?:layout)", "refuses a routes list with a prefix"),
        (' or body.count("[") > 1', "", "refuses a routes list with routes nested in routes"),
        ('if any("?" in path for path, _ in found):', "if False:", "refuses a routes list with an optional segment"),
        ("or not ORIGIN.match(", "or False and not ORIGIN.match(", "reads only the site's own origin at a template's start"),
    ):
        yield from each(j, find, replace, "hooks", f"journeys.py {label}")


def journeys_more_mutants():
    """What the journeys' scoping also does: a request or a location is a goto in a spec (F2575), tests alone are no journey (F2578)."""
    yield from each("scripts/check.sh", '[ "$scope" != none ] || app=false', ":", "hooks", "check.sh builds and walks the app for a change of its tests alone")
    for find, replace, label in (
        ("[ $((journeys_due * 2)) -gt \"$journeys_all\" ] || budget=60", "[ $((journeys_due * 2)) -gt \"$journeys_all\" ] || budget=120", "gives a run of half the journeys or fewer a shorter budget"),
        ("[ $((journeys_due * 2)) -gt", "[ $((journeys_due * 2)) -ge", "counts exactly half of the journeys as most of them"),
        ("[ $((journeys_due * 2)) -gt", "[ $((journeys_due)) -gt", "counts the journeys due by half their number"),
    ):
        yield from each("scripts/check.sh", find, replace, "hooks", f"check.sh {label}")
    for find, replace, label in (
        ("*(OTHER_GO.finditer(text) if own else ())", "*()", "places a journey by its gotos alone, not by a request or a location it sets"),
        ("OTHER_GO.finditer(text) if own else ()", "OTHER_GO.finditer(text)", "reads a helper's request through a variable as a journey's page"),
        ("if not run and changed and skipped == len(changed):", "if False:", "says 'all' for a change of tests and prose alone"),
        ("if not run and changed and skipped == len(changed):", "if not run:", "says 'none' for a deleted file beside a test"),
    ):
        yield from each("scripts/journeys.py", find, replace, "hooks", f"journeys.py {label}")


def checks_mutants():
    """The fast gate runs check_regressions when a commit touches a test, and the audit when the lockfile changes (slice-5 harness-b)."""
    check = "scripts/check.sh"
    for find, replace, label in (
        ("*.test.ts | ", "", "runs check_regressions on a .test.ts"),
        ("*.test.tsx | ", "", "runs check_regressions on a .test.tsx"),
        ("*.bench.ts | ", "", "runs check_regressions on a .bench.ts"),
        ("*.bench.tsx | ", "", "runs check_regressions on a .bench.tsx"),
        ("*.spec.ts | ", "", "runs check_regressions on a journey"),
        ("*_test.gno | ", "", "runs check_regressions on a gno test"),
        ("*_test.go | ", "", "runs check_regressions on a Go test"),
        ("*-snapshots/*.png | ", "", "runs check_regressions on an approved picture"),
        (" | *__screenshots__/*.png)", ")", "runs check_regressions on a story's picture"),
        ("pnpm-lock.yaml) audit=true ;;", "pnpm-lock.yaml) ;;", "runs the audit when the lockfile changes"),
        ("if $merging; then regressions=false; fi", "if false; then regressions=false; fi", "leaves check_regressions to a merge's full gate"),
        ("if $merging; then audit=false; fi", "if false; then audit=false; fi", "leaves the audit to a merge's full gate"),
        ("git merge-base HEAD origin/main 2>/dev/null || ", "", "compares with where the branch left main"),
        ('[ -n "$regr_base" ] || regressions=false', ":", "runs no check_regressions with nothing to compare"),
    ):
        yield from each(check, find, replace, "hooks", f"check.sh {label}")
    hook = ".githooks/pre-commit"
    for find, replace, label in (
        ('[ "$merge" = 0 ] && [ -n "$tests" ]', '[ -n "$tests" ]', "leaves check_regressions to a merge's full gate"),
        ('[ -n "$tests" ] && base=', "base=", "runs check_regressions only when a test is staged"),
        ("git merge-base HEAD origin/main 2>/dev/null || ", "", "compares with where the branch left main"),
        (r"\.(test|bench)\.tsx?$|", "", "runs check_regressions on a test and a bench"),
        (r"\.spec\.ts$|", "", "runs check_regressions on a journey"),
        (r"_test\.(gno|go)$|", "", "runs check_regressions on a gno or Go test"),
        (r"-snapshots/.*\.png$|", "", "runs check_regressions on an approved picture"),
        (r"|__screenshots__/.*\.png$", "", "runs check_regressions on a story's picture"),
        ('python3 -I "$s/check_regressions.py" "$base"', ":", "runs check_regressions"),
    ):
        yield from each(hook, find, replace, "hooks", f"pre-commit {label}")


def stryker_mutants():
    """StrykerJS's sandboxes are neither tested, benched nor borrowed (slice-5 harness-b)."""
    check = "scripts/check.sh"
    for find, replace, label in (
        ("find .stryker-tmp -mindepth 1 -delete", ":", "empties .stryker-tmp before StrykerJS starts"),
        ("then rm .stryker-tmp;", "then :;", "removes a link named .stryker-tmp, never what it leads to"),
        ("elif [ -d .stryker-tmp ]; then", "elif true; then", "empties .stryker-tmp only where it is a folder"),
        ("if [ -L .stryker-tmp ]; then rm .stryker-tmp; elif", "if false; then rm .stryker-tmp; elif", "does not follow a link named .stryker-tmp"),
    ):
        yield from each(check, find, replace, "hooks", f"check.sh {label}")
    yield from each("vitest.config.ts", ", STRYKER_TMP] }", "] }", "hooks", "vitest benches nothing a StrykerJS sandbox left (5n)")
    yield from each("vitest.config.ts", 'const STRYKER_TMP = "**/.stryker-tmp/**";', 'const STRYKER_TMP = "**/.nothing/**";', "hooks", "vitest's exclusion names StrykerJS's folder (5n)")
    yield from each("scripts/borrow_node_modules.sh", " -not -path './.stryker-tmp/*'", "", "hooks", "borrow_node_modules.sh borrows nothing of a StrykerJS sandbox (F2414)")


def mutants():
    """Every guard of the harness, each with the test that must notice it gone."""
    # ESLint: each rule set to "error", switched off; each selector and restricted name, never matching.
    for path in ESLINT:
        text = read(path)
        for m in re.finditer(r'^\s+"?([\w@/-]+)"?:\s*(?=\[?\s*"error"|\[\s*$)', text, re.M):
            at = text.find('"error"', m.end())
            yield f"eslint {m.group(1)} ({path}:{text.count(chr(10), 0, m.start()) + 1})", path, text[:at] + '"off"' + text[at + 7:], "probe"
        if path not in (SERVER, "eslint.config.ts"):  # the server's part bans by name and path; the root config composes the parts
            yield from selectors(path, "probe")
    for path in ("lint/core.config.ts", REACT, APP):
        yield from each(path, 'property: "', 'property: "never_', "probe", "eslint restricted property")
    # The server's folder: each browser package by name, the zone and each of its exceptions, the files
    # fetch is left to, and the files each block reaches.
    for name in ("react|", "react-dom|", "three|", "|@gnoworld/ui", "(/|$)"):
        yield from each(SERVER, name, "", "probe", f"eslint the server refuses {name.strip('|')} by name")
    yield from each(SERVER, 'target: "./server"', 'target: "./nowhere"', "probe", "eslint the server reaches no path out of its folder")
    # Not "./node_modules": this worktree borrows the repository's, outside it, so the zone never sees a
    # package here (F385); in the repository the gate's own lint fails without that exception.
    for name in ("./server", "./packages/core", "./packages/schemas"):
        yield from each(SERVER, f'"{name}"', '"./nowhere"', "probe", f"eslint the server imports from {name}")
    yield from each(SERVER, '"server/src/net.ts", ', "", "probe", "eslint net.ts calls fetch")
    yield from each(SERVER, "...TESTS", "", "probe", "eslint a server test calls the server it started")
    yield from each(SERVER, '"server/**/*.ts"', '"server/**/*.nothing"', "probe", "eslint reaches the server's files")
    # A bench is switched off like a test (security-S1): its files, both extensions, and the selector the block holds.
    yield from each("eslint.config.ts", "files: BENCHES,", 'files: ["**/*.nothing"],', "probe", "eslint a bench is never switched off")
    yield from each("lint/shared.config.ts", '"**/*.bench.ts", ', "", "probe", "eslint a .ts bench is never switched off")
    yield from each("lint/shared.config.ts", "|fixme|fails)$/]", "|fixme)$/]", "probe", "eslint refuses a test marked fails, in core too")
    yield from each("lint/shared.config.ts", ', "**/*.bench.tsx"', "", "probe", "eslint a .tsx bench is never switched off")
    yield from each("eslint.config.ts", 'CLASS_AT_END, SWITCHED_OFF] },\n  },\n  {\n    files: ["**/*.css"]', 'CLASS_AT_END] },\n  },\n  {\n    files: ["**/*.css"]', "probe", "eslint the bench block holds the switched-off selector")
    # No state at a module's top (F412): the block for every workspace's source, core's and ui's own lists, the selector's parts.
    both = '"server/src/**/*.ts", "packages/*/src/**/*.{ts,tsx}"'
    yield from each("eslint.config.ts", both, '"packages/*/src/**/*.{ts,tsx}"', "probe", "eslint keeps no state at a server module's top")
    yield from each("eslint.config.ts", both, '"server/src/**/*.ts"', "probe", "eslint keeps no state at a workspace module's top")
    yield from each("eslint.config.ts", '"error", ...SWALLOWED, CLASS_AT_END, MODULE_STATE]', '"error", ...SWALLOWED, CLASS_AT_END]', "probe", "eslint's workspace block refuses state at a module's top")
    yield from each("eslint.config.ts", '"error", ...SWALLOWED, CLASS_AT_END, MODULE_STATE]', '"error", CLASS_AT_END, MODULE_STATE]', "probe", "eslint's workspace block keeps the swallowed errors refused")
    yield from each("lint/core.config.ts", "...SWALLOWED, CLASS_AT_END, ", "...SWALLOWED, ", "probe", "eslint core refuses a u class right before $ (F821)")
    yield from each("lint/core.config.ts", "...IMPURE, MODULE_STATE]", "...IMPURE]", "probe", "eslint core keeps no state at a module's top")
    yield from each(REACT, "RAW_ANCHOR, MODULE_STATE]", "RAW_ANCHOR]", "probe", "eslint ui's components keep no state at a module's top")
    yield from each("lint/shared.config.ts", "/^(${KEPT})$/", "/${KEPT}/", "probe", "eslint keeps a module's state by whole names")
    yield from each("lint/shared.config.ts", ":not(:function NewExpression)", "", "probe", "eslint lets a function make a Map")
    yield from each("lint/shared.config.ts", "/^(Weak)?(Map|Set)$/", "/^(Map|Set)$/", "probe", "eslint refuses a WeakMap at a module's top")
    yield from each("server/tsconfig.json", '"types": ["node"]', '"types": []', "probe", "the server compiles with Node's types")
    # The Ergo the tests start (slice 3b): each refusal of the pin, each check of the cache, each refusal of a build.
    yield from lines("scripts/ergo.sh", r"^case .*refuse .*$", ":", "hooks", "ergo.sh checks the pin")
    yield from lines("scripts/ergo.sh", r'^\[ \$\{#commit\}.*$', ":", "hooks", "ergo.sh checks the pin's length")
    yield from each("scripts/ergo.sh", '[ "$("$bin" --version 2>/dev/null || :)" = "ergo-$tag" ] && ', "", "hooks", "ergo.sh checks the cached binary's version")
    yield from each("scripts/ergo.sh", "(cd \"$dir\" && shasum -a 256 -c ergo.sha256 >/dev/null 2>&1)", "true", "hooks", "ergo.sh checks the binary's SHA-256")
    yield from each("scripts/ergo.sh", 'command -v go >/dev/null 2>&1 || refuse', "true || refuse", "hooks", "ergo.sh refuses with no go")
    yield from each("scripts/ergo.sh", '[ "$(git -C "$dir" rev-parse HEAD)" = "$commit" ] || refuse', "true || refuse", "hooks", "ergo.sh checks the clone's commit")
    yield from each("scripts/ergo.sh", ' || refuse "building Ergo $tag failed"', " || :", "hooks", "ergo.sh refuses a failed build")
    yield from each("scripts/ergo.sh", "CGO_ENABLED=0 go build -trimpath", "go build", "hooks", "ergo.sh builds static, its paths trimmed")
    yield from each("scripts/ergo.sh", " sqlite\"", "\"", "hooks", "ergo.sh builds with sqlite")
    yield from each("vitest.config.ts", ', "server/src/**/*.test.ts"', "", "probe", "the server's tests are found")
    # Core's tests again in Chromium (F816), only when asked, so no other Vitest run opens a browser.
    yield from each("vitest.config.ts", '...(process.env["CORE_CHROMIUM"] ? [CORE_CHROMIUM] : []),', "CORE_CHROMIUM,", "probe", "core_chromium exists only when CORE_CHROMIUM asks")
    yield from each("vitest.config.ts", 'include: ["packages/core/src/**/*.test.ts"],', 'include: ["packages/core/sr/**/*.test.ts"],', "probe", "core_chromium finds core's tests")
    yield from each("vitest.config.ts", "enabled: true,\n      headless: true,", "enabled: false,\n      headless: true,", "probe", "core_chromium runs in a browser")
    yield from each("vitest.config.ts", "fileParallelism: false,", "", "probe", "core_chromium runs its files one after another")
    yield from each("vitest.config.ts", "screenshotFailures: false,", "", "probe", "core_chromium writes no screenshot beside the code")
    yield from each("vitest.config.ts", 'args: process.env["SANDBOX_RUNTIME"] ? ["--single-process"] : []', "args: []", "probe", "core_chromium's Chromium runs in one process in the sandbox")
    yield from each("scripts/check.sh", "CORE_CHROMIUM=1 node node_modules/vitest/vitest.mjs run --project core_chromium", ":", "hooks", "check.sh runs core's tests in Chromium")
    yield from each("scripts/check.sh", "CORE_CHROMIUM=1 node", "node", "hooks", "check.sh's Chromium run sets its switch")
    yield from each("scripts/check.sh", " run --project core_chromium #", " run #", "hooks", "check.sh's Chromium run names core's project")
    yield from each("scripts/check.sh", " run --project core_chromium #", " run --project core_chromium || : #", "hooks", "check.sh lets core's Chromium tests fail it")
    # Every test run on the pinned Node (F816 came from StrykerJS on Homebrew's Node 26).
    # The tokens story's pictures, which the fast gate compares when tokens.css changes (F1190). The mutants of
    # pictures.spec.ts wait for records.sh to list it (agent-hb/records_pictures.py).
    yield from each("app/playwright.stories.config.ts", "-o ${out} --quiet", "-o ../packages/ui/storybook-static --quiet", "probe", "the stories' Storybook is built where STORIES_OUT says")
    yield from each("app/playwright.stories.config.ts", '  outputDir: out === DEFAULT_OUT ? "test-results-stories" : resolve(out, "..", "stories-results"),\n', "", "probe", "the stories' evidence has a folder of its own (CR4)")
    yield from each("app/playwright.stories.config.ts", 'out === DEFAULT_OUT ? "test-results-stories"', 'out === DEFAULT_OUT ? "test-results"', "probe", "the stories' evidence, outside a gate, is not the journeys' folder (CR4)")
    yield from each("app/playwright.stories.config.ts", 'resolve(out, "..", "stories-results")', '"test-results-stories"', "probe", "the stories' evidence of a gate's run is in the run's folder (CR4)")
    pic = "app/tests/stories/pictures.spec.ts"
    yield from each(pic, 'const only = process.env["PICTURES_OF"] ?? "";', 'const only = "";', "probe", "the pictures' filter reads PICTURES_OF")
    yield from each(pic, "toBeGreaterThan(0);", "toBeGreaterThan(-1);", "probe", "a prefix no story has fails the pictures")
    yield from each(pic, "stories(page, only)", "stories(page)", "probe", "the pictures compare the stories of the prefix")
    yield from each("app/playwright.stories.config.ts", "if (!Number.isInteger(port) || port < 1024 || port > 65535)", "if (false)", "probe", "the stories' config refuses a port that is no port")
    # The folder Storybook deletes before it builds (security-S6, CR7): the default or the storybook folder of a check.* folder
    # directly inside the temporary one, a plain absolute path.
    for find, replace, label in (
        ("out !== DEFAULT_OUT &&", "false &&", "is checked at all"),
        ("|| !RUN_FOLDER.test(", "|| false && !RUN_FOLDER.test(", "is a run folder's storybook"),
        ("/^check\\.\\w+\\/storybook$/", "/check\\.\\w+\\/storybook$/", "is directly inside the temporary folder"),
        ("/^check\\.\\w+\\/storybook$/", "/^check\\.\\w+\\/storybook/", "is the storybook folder itself"),
        ("/^check\\.\\w+\\/storybook$/", "/^check\\w+\\/storybook$/", "is in a folder named check.*"),
        ("relative(resolve(tmpdir()), resolve(out)).split(sep).join(\"/\")", "out.slice(resolve(tmpdir()).length + 1)", "is read after its `..` are resolved (R5)"),
        ("!/^\\/[", "!/^[", "is absolute"),
        ("[\\w@%+=:,./-]", "[\\w@%+=:,./ -]", "has no space"),
        ("[\\w@%+=:,./-]", "[\\w@%+=:,./;-]", "has no shell character"),
    ):
        yield from each("app/playwright.stories.config.ts", find, replace, "probe", f"the stories' config refuses a STORIES_OUT that is not safe to delete: it {label} (security-S6)")
    # Every Vitest run on the pinned Node (F816 came from StrykerJS on Homebrew's Node 26): the config refuses another.
    yield from each("vitest.config.ts", "if (process.version !== PINNED)", "if (false)", "probe", "vitest.config.ts holds every run to the pinned Node")
    yield from each("vitest.config.ts", '.trim()', "", "probe", "the pinned Node is read without its newline")
    yield from each("vitest.config.ts", "benchmark: { include: BENCHES, exclude: [...configDefaults.exclude, STRYKER_TMP] },", "", "probe", "vitest runs the benches in the form the guards read (CR3)")
    yield from each("lint/shared.config.ts", '"**/*.bench.tsx"];', '"**/*.bench.tsx", "**/*.benchmark.ts"];', "probe", "the benches' form is the one the guards read (CR3)")
    yield from each("scripts/repo_files.py", '["git", "-c", "core.quotePath=false", *args]', '["git", *args]', "hooks", "repo_files.git prints a path with an accent as it is (CR5)")
    yield from each("scripts/repo_files.py", 'BENCH_FILE = re.compile(r"\\.bench\\.tsx?$")', 'BENCH_FILE = re.compile(r"\\.bench(mark)?\\.tsx?$")', "probe", "BENCH_FILE reads the form Vitest runs (CR3)")
    yield from each("vitest.config.ts", 'new URL(".node-version", import.meta.url)', 'new URL("../.node-version", import.meta.url)', "probe", "the pin is read from the root's own .node-version")
    # The app's folders (F378): each name of the network and storage, each owner, each folder's path,
    # each exception, and React's bans kept there, alone.
    for name in ("fetch", "XMLHttpRequest", "WebSocket", "EventSource", "localStorage", "sessionStorage", "indexedDB", "caches", "cookieStore", "window", "globalThis", "self"):
        yield from each(APP, f'"{name}"', '"_"', "probe", f"eslint app reaches {name} only from lib and sw")
    yield from each(APP, "${SRC}/", "${SRC}/nowhere-", "probe", "eslint app folder path")
    yield from each(APP, 'from: "./",\n              except: [`${SRC}/sw`],', 'from: SRC,\n              except: ["./sw"],', "probe", "eslint the worker reaches no path out of sw")
    # The worker's packages, refused by name (F385): a scoped one and node: too, and its catches still read.
    yield from each(APP, 'regex: "^[^.]"', 'regex: "^[a-z]"', "probe", "eslint the worker imports no package, scoped or node: (G2)")
    yield from each(APP, "...SWALLOWED, ", "", "probe", "eslint the worker's catches are read")
    yield from each(APP, "...reaching(REACHES.filter(", "...reaching([].filter(", "probe", "eslint the worker's folder keeps fetch and caches only (F395)")
    yield from each(APP, "{ts,tsx}", "ts", "probe", "eslint reads a feature's screens")
    yield from each(APP, "`./${feature}`,", "`./nowhere`,", "probe", "eslint a feature imports its own files")
    yield from each(APP, "/index.ts`)", "/nothing.ts`)", "probe", "eslint a feature imports another's index.ts")
    yield from each(APP, "ignores: TESTS,", "ignores: [],", "probe", "eslint a test in the app imports what it needs")
    yield from each(APP, "...REACT_PROPERTIES,", "", "probe", "eslint React's bans hold in the app's folders")
    yield from each("eslint.config.ts", "noInlineConfig: true", "noInlineConfig: false", "probe", "eslint inline config")
    # The app's React lint, and the files its rules reach.
    yield from each(REACT, 'reactHooks.configs.flat["recommended-latest"], ', "", "probe", "eslint React hooks preset")
    yield from each(REACT, ', eslintReact.configs["strict-type-checked"]', "", "probe", "eslint @eslint-react preset")
    yield from each(REACT, '{ name: "react", importNames: MEMOS, message: MEMO }', "", "probe", "eslint no hand-written memo")
    yield from each(REACT, "...MEMOS.map(", "...[].map(", "probe", "eslint no React.useMemo")
    for name in ("memo", "useMemo", "useCallback", "innerHTML", "outerHTML", "insertAdjacentHTML"):  # each banned name, alone (F118)
        yield from each(REACT, f'"{name}"', '"_"', "probe", f"eslint bans {name}")
    yield from each(REACT, 'name: "DataWithResponseInit"', 'name: "Nothing"', "probe", "eslint lets a route throw data()")
    yield from each("eslint.config.ts", 'files: ["packages/ui/src/Avatar/**/*.css"]', 'files: ["**/*.css"]', "probe", "eslint keeps forced-color-adjust to the avatar (F349)")
    yield from each("eslint.config.ts", 'allowProperties: ["forced-color-adjust"]', "allowProperties: []", "probe", "eslint lets the avatar's face keep its colours (F319)")
    yield from each("eslint.config.ts", 'files: ["packages/ui/src/Field/**/*.css"]', 'files: ["**/*.css"]', "probe", "eslint keeps field-sizing and resize to the box of lines (F1729)")
    yield from each("eslint.config.ts", 'allowProperties: ["field-sizing", "resize"]', "allowProperties: []", "probe", "eslint lets the box of lines size itself and resize (F1729)")
    yield from each("lint/shared.config.ts", ', "**/*.spec.ts"];', "];", "probe", "eslint reads Playwright's tests")
    yield from each("package.json", "--max-warnings 0 ", "", "probe", "lint fails on a warning")
    yield from each("package.json", " && tsc -p app/tsconfig.json", "", "probe", "typecheck covers the app")
    yield from each("package.json", " && tsc -p packages/ui/tsconfig.json", "", "probe", "typecheck covers ui")
    # ui: React's lint reaches it, and its tests run in jsdom, all of them, each on an empty page.
    yield from each(REACT, ', "packages/ui/src/**/*.{ts,tsx}"]', "]", "probe", "eslint reads ui as React")
    yield from each("vitest.config.ts", 'environment: "jsdom",', "", "probe", "ui's tests run in jsdom")
    yield from each("vitest.config.ts", 'setupFiles: ["packages/ui/src/testSetup.ts"],', "", "probe", "ui's tests clean the page")
    yield from each("vitest.config.ts", '"packages/ui/src/**/*.test.{ts,tsx}"', '"packages/ui/sr/**/*.test.{ts,tsx}"', "probe", "ui's tests are found")
    yield from each("pnpm-workspace.yaml", "ignorePnpmfile: true", "ignorePnpmfile: false", "hooks", "pnpm runs no pnpmfile")
    yield from each(".claude/settings.json", '"Edit(/pnpm-workspace.yaml)"', '"Edit(/nothing)"', "hooks", "settings: an edit of what pnpm loads is refused")
    yield from each(".claude/settings.json", '".pnpmfile.mjs",\n', '"nothing",\n', "hooks", "settings: no command plants a pnpmfile")
    yield from each("app/tsconfig.json", '"extends": "../tsconfig.base.json",', "", "probe", "the app takes the compiler flags")
    # The style checks.
    yield from each("scripts/check_css.py", "problems.append(", OFF, "probe", "check_css problem")
    yield from each("scripts/check_css.py", "problems += [", "problems += [] and [", "probe", "check_css unused tokens")
    yield from lines("scripts/check_comments.mjs", r'^(  \["[^"]+", )/.*/\w*\],$', r"\1/(?!)/],", "probe", "check_comments rule")
    yield from each("scripts/check_comments.mjs", "{ header: 6, other: 3 }", "{ header: 60, other: 30 }", "probe", "check_comments limits")
    yield from each("scripts/check_comments.mjs", "problems.push(", "(() => {})(", "probe", "check_comments problem")
    yield from each("scripts/check_comments.mjs", 'if (entry.name === "node_modules") return [];', "", "probe", "check_comments reads no node_modules outside a repository")
    yield from each("scripts/check_comments.mjs", "entry.isDirectory()", "statSync(join(dir, entry.name)).isDirectory()", "probe", "check_comments enters no link outside a repository")
    yield from each("scripts/check_comments.mjs", 'entry.name === "node_modules")', 'entry.name === "node_modules" || entry.isSymbolicLink())', "probe", "check_comments reads a linked file outside a repository (F171)")
    yield from each(".jscpd.json", '"exitCode": 1', '"exitCode": 0', "probe", "jscpd exit code")
    yield from each(".jscpd.json", '"similarity": 0.8', '"similarity": 1', "probe", "jscpd similarity")
    yield from each(".jscpd.json", ', "**/.git/**"', "", "probe", "jscpd reads no file of git's own folder (F129)")
    yield from each("tsconfig.base.json", '"lib": ["es2024"],', "", "probe", "tsconfig lib")
    # The migrations main has (F466), and harness_mutate's own dry check.
    mig = "scripts/check_migrations.py"
    yield from each(mig, " if i >= len(after) or after[i][1] != text]", " if False]", "hooks", "check_migrations keeps main's migrations")
    yield from each(mig, " if i >= len(after) or ", " if ", "hooks", "check_migrations sees main's list cut short")
    yield from each(mig, ' or not re.fullmatch(r"[\\w\\s,]*", found.group(1))', "", "hooks", "check_migrations reads a list of names alone")
    yield from each(mig, "len(texts) != 1 or ", "", "hooks", "check_migrations refuses a migration defined twice")
    yield from each(mig, " and NAMED.search(main)", " and False", "hooks", "check_migrations reads the list main.ts imports from migrations.ts")
    yield from each(mig, '"\\./migrations\\.ts"', '"[^"]*"', "hooks", "check_migrations wants the list imported from migrations.ts alone")
    yield from each(mig, '"${" in texts[0] or ', "", "hooks", "check_migrations refuses a migration built from a value")
    yield from each(mig, ' or "\\\\" in texts[0]', "", "hooks", "check_migrations refuses a migration with an escape")
    yield from each(mig, '.returncode != 0:\n    sys.exit(f"check_migrations: {base} is no commit")', '.returncode == 2:\n    sys.exit(f"check_migrations: {base} is no commit")', "hooks", "check_migrations wants a base that is a commit")
    yield from each("scripts/harness_mutate.py", "    shards = min(shards, len(found))\n", "", "hooks", "harness_mutate makes no more worktrees than it has mutants (CR9)")
    yield from each("scripts/harness_mutate.py", "    suites = [test for test in TESTS if any(m[3] == test for m in found)]\n", "    suites = list(TESTS)\n", "hooks", "harness_mutate controls only the suites its mutants run (C4)")
    yield from each("scripts/harness_mutate.py", 'trees = [stack.enter_context(' 'worktree("HEAD"))]', 'trees = [stack.enter_context(worktree("HEAD")) for _ in range(shards)]', "hooks", "harness_mutate makes its other worktrees once a mutant is selected (CR9)")
    yield from each("scripts/harness_mutate.py", "        if mutated is None:\n", "        if False:\n", "hooks", "harness_mutate --dry sees a stale mutant")
    yield from each("scripts/harness_mutate.py", "        if unknown:\n", "        if False:\n", "hooks", "harness_mutate --dry sees a section its suite lacks")
    yield from each("scripts/harness_mutate.py", '    WORKTREE = "."\n    checked()\n', '    WORKTREE = "."\n', "hooks", "harness_mutate --dry checks the mutants")
    hm = "scripts/harness_mutate.py"
    yield from each(hm, "{id(m) for m in select" "(found, changed, touched_by, sections)} | ", "", "hooks", "harness_mutate --changed judges the changed guard files and sections")
    yield from each(hm, "for test, suite in SUITE_OF" ".items() if suite in changed}", "for test, suite in SUITE_OF.items() if False}", "hooks", "harness_mutate --changed reads the suites' changed sections")
    yield from each(hm, '"probe": "scripts/' 'probe.py"}', '"probe": "scripts/nowhere.py"}', "hooks", "harness_mutate --changed reads probe.py's changed blocks as test_hooks.sh's (G5)")
    # The find is split in two, so that this line holds it nowhere itself: a spot of its own would be a mutant of no guard.
    yield from each(hm, 'SUITE_OF = {"hooks": "scripts/test_hooks.sh' '", ', 'SUITE_OF = {', "hooks", "harness_mutate --changed reads both suites' changed sections (G5)")
    yield from each(hm, "    if diff.returncode != 0:\n", "    if False:\n", "hooks", "harness_mutate --changed wants a base git can compare with")
    yield from each(hm, "killed = verdicts[i % " "shards][i // shards]", "killed = verdicts[0][0]", "hooks", "harness_mutate reads each mutant's own verdict")
    yield from each(hm, "worktree(\"HEAD\")) for _ in range(shards - 1)]", "worktree(\"HEAD\")) for _ in range(0)]", "hooks", "harness_mutate makes a worktree a shard")
    yield from each(hm, "ThreadPoolExecutor(" "shards) as pool", "ThreadPoolExecutor(1) as pool", "hooks", "harness_mutate's shards run side by side")
    yield from each(hm, "ThreadPoolExecutor(" "CONTROLS_AT_ONCE)", "ThreadPoolExecutor(len(controls))", "hooks", "harness_mutate runs its controls two at a time (F2138)")
    yield from each(".claude/workflows/branch.js", "if (!red) return", "if (false) return", "hooks", "the branch loop stops on a red pass that gave no report")
    yield from each(".claude/workflows/branch.js", "return done && done.branch === A.branch ? done : null;", "return done;", "hooks", "the branch loop takes no commit made on another branch")
    yield from each(".claude/workflows/branch.js", "if (notGits(gate.files))", "if (false)", "hooks", "the branch loop takes no list of files but git's")
    yield from each(".claude/workflows/branch.js", "every Bash command begins with", "a Bash command may begin with", "hooks", "the branch loop has every command cd into its worktree")
    yield from each(".claude/workflows/branch.js", "Number them within this branch's range, ${A.ids}, never past it. ", "", "hooks", "the branch loop numbers its findings in its own range")
    yield from each(".claude/workflows/branch.js", "if (!reviews.every(Boolean)) return", "if (false) return", "hooks", "the branch loop stops on a lens that gave no report")
    yield from each(".claude/workflows/branch.js", "if (open.length)\n", "if (false)\n", "hooks", "the branch loop stops on a finding its fixer left open")
    yield from each(".claude/workflows/branch.js", "if (round === 4)\n", "if (false)\n", "hooks", "the branch loop stops after three rounds")
    yield from each(".claude/workflows/branch.js", 'const TIER1 = ["scripts/", ".githooks/", ".github/", ".claude/", "gno/", ', "const TIER1 = [", "hooks", "the harness and realms bring the security review whatever the arguments")
    yield from each(".claude/workflows/branch.js", "...(gate.files.some(realm)\n", "...(false\n", "hooks", "a realm brings the gno-auditor")
    yield from each(".claude/workflows/branch.js", "id: `${lenses[i][1]}-${round}-${n + 1}`, ", "", "hooks", "the branch loop numbers the findings itself")
    yield from each(".claude/workflows/branch.js", ".filter(([, label]) => !lensesDue || lensesDue.has(label))", "", "hooks", "a second round runs only the lens whose high finding was fixed")
    yield from each("scripts/borrow_node_modules.sh", '[ -L "$1/$m/.bin" ]', "false", "hooks", "a borrowed workspace's linked .bin becomes a folder of its own (F2127)")
    yield from each(hm, "        if rel not in (path, suite," " SELF):", "        if False:", "hooks", "a cached verdict stands on the files its sections name")
    yield from each(hm, "for n in names if n" ' != ".git"]', "for n in names]", "hooks", "a cached verdict never stands on a worktree's .git file")
    yield from each(hm, "os.path.basename(f) in context or f" " in ALWAYS", "os.path.basename(f) in context", "hooks", "a cached verdict stands on the tools' lockfile")
    yield from each(hm, "context = outside" " + ", "context = ", "hooks", "a cached verdict stands on its suite's text outside its sections")
    yield from each(hm, "identity(mutant, sections, GAPS), context," " RUNNER]", "identity(mutant, sections, GAPS), context]", "hooks", "a cached verdict stands on the runner that judged it")
    yield from each(hm, 'learned[keys[id(found[i])]] = "kill' 'ed"', "pass", "hooks", "a killed mutant's verdict is cached")
    yield from each(hm, "    remember(" "learned)\n", "    pass\n", "hooks", "the run's verdicts reach the cache")
    yield from each(hm, "except (OSError," " ValueError):", "except OSError:", "hooks", "a cache it cannot read is no cache")
    yield from each(hm, "    finally:\n        with open(target, \"w\") as f:\n            f.write(original)\n", "    finally:\n        pass\n", "hooks", "harness_mutate puts each mutant's file back")
    yield from each(hm, "            if code " "!= 0:\n", "            if False:\n", "hooks", "harness_mutate stops on a failed control")
    yield from each(hm, "return killed and (label not in GAPS or " "run(tree", "return killed and (True or run(tree", "hooks", "harness_mutate judges a known gap that a run killed once more (F1832)")
    yield from each(hm, "lambda c: run(*c), " "controls)", "lambda c: run(*c), controls[:1])", "hooks", "harness_mutate's control runs in every tree")
    yield from each(hm, "        since = last_reviewed" "(base)\n", "        since = base\n", "hooks", "harness_mutate --changed judges the guard files changed since the last /pre-merge pass, not since base")
    yield from each(hm, "    except (OSError, ValueError)" " as e:", "    except ZeroDivisionError as e:", "hooks", "harness_mutate --changed refuses a passes file it cannot read, never judging fewer mutants")
    yield from each(hm, "    except (OSError, ValueError)" " as e:", "    except OSError as e:", "hooks", "harness_mutate --changed refuses a passes file that is malformed or no UTF-8, with a message (F1432)")
    yield from each(hm, "        if changed is None" ":  # a full run", "        if False:  # a full run", "hooks", "harness_mutate with no argument refuses to pass with no mutant to judge (F1431)")
    yield from each(hm, '"--no-renames", ' '"--name-only"', '"--name-only"', "hooks", "harness_mutate --changed counts a renamed guard file under its old name too (F1434)")
    yield from each(hm, '"--name-only", ' '"-z"', '"--name-only"', "hooks", "harness_mutate --changed reads a guard file's name git would quote (F1434)")
    yield from each(hm, "        base, changed = since, " "changed_since(since)\n", "        base = since\n", "hooks", "harness_mutate --changed reads the files changed since the pass, not since base")
    yield from each(hm, "    if not found" ":  # nothing to judge", "    if False:  # nothing to judge", "hooks", "harness_mutate --changed runs no control when it judges no mutant")
    yield from each(hm, "elif sys.argv[1:]" ":\n", "elif False:\n", "hooks", "harness_mutate refuses an unknown argument")
    yield from each(hm, "    if base.startswith" "(\"-\"):", "    if False:", "hooks", "harness_mutate --changed takes no option for its base")
    yield from each(hm, "    if before is" " None:", "    if False:", "hooks", "harness_mutate --changed judges every mutant against a base script it cannot read")
    yield from each(hm, "identity(m, sections, GAPS) not" " in before}", "False}", "hooks", "harness_mutate --changed judges the mutants it defines anew or otherwise")
    yield from each(hm, "return label, path, test, judged_by, label" " in gaps, None", "return label, path, test, None, False, None", "hooks", "harness_mutate --changed tells a mutant by its sections and its place in GAPS")
    yield from each(hm, "else hashlib.sha256(" "mutated.encode()).hexdigest()", 'else ""', "hooks", "harness_mutate --changed tells a mutant by the text it writes")
    yield from each(hm, "if failures" ":\n    sys.exit", "if failures and changed is None:\n    sys.exit", "hooks", "a survivor fails harness_mutate --changed")
    yield from each(hm, "    found = " "checked()\n", "    found = list(mutants())\n", "hooks", "harness_mutate --changed still checks every mutant")
    # The hooks and their scripts.
    yield from each("scripts/guard.py", ' refuse("', " " + OFF + '"', "hooks", "guard refusal")
    yield from each("scripts/guard.py", " refuse(UNREAD)", " " + OFF + "UNREAD)", "hooks", "guard unread .gno")
    yield from each("scripts/guard.py", "push |= check_git(words)", "check_git(words)", "hooks", "guard asks before a push")
    yield from each("scripts/guard.py", "words = unwrap(raw)", "words = raw", "hooks", "guard sees through wrappers")
    yield from each("scripts/guard.py", 'yield from commands("".join(inner))', "pass", "hooks", "guard reads $(...)")
    yield from each("scripts/guard.py", 'elif words and words[0] == "eval":', "elif False:", "hooks", "guard reads eval")
    yield from each("scripts/guard.py", ' or (program in INTERPRETERS and re.search(r"\\.gno\\b", text) is not None)', "", "hooks", "guard sees interpreters write .gno")
    yield from each("scripts/guard.py", 'r"\\.gno\\b"', 'r"\\.gno"', "hooks", "guard lets a name that only holds .gno pass")
    yield from each("scripts/guard.py", '"--no-verify".startswith(w)', 'w == "--no-verify"', "hooks", "guard refuses --no-verify's prefixes")
    yield from each("scripts/guard.py", 'found == {"gnomcp", "skill"}', '"gnomcp" in found', "hooks", "guard wants the gno skill")
    yield from each("scripts/guard.py", 'text = text.replace("\\\\\\n", "")', "pass", "hooks", "guard joins continued lines")
    # A recursive delete of a path a variable may leave empty (wt-3e's folder): each part of the guard.
    yield from each("scripts/guard.py", '"-delete" in words or ', "", "hooks", "guard sees find's -delete")
    yield from each("scripts/guard.py", "w in runs and", 'w == "-exec" and', "hooks", "guard sees find's -execdir and -ok")
    yield from each("scripts/guard.py", 'os.path.basename(n) == "rm"', 'n == "rm"', "hooks", "guard sees rm by its path")
    yield from each("scripts/guard.py", r'r"-[HLPEXdsx]+|-[fD]|-O\d*|--"', r'r"-[HLP]"', "hooks", "guard reads past find's options")
    yield from each("scripts/guard.py", '(not w.startswith("-") or FIND_OPTION.fullmatch(w))', "True", "hooks", "guard reads find's paths alone")
    yield from each("scripts/guard.py", 'r"-[a-zA-Z]*[rR][a-zA-Z]*"', 'r"-r"', "hooks", "guard sees rm's recursive flags")
    yield from each("scripts/guard.py", ' or w == "--recursive"', "", "hooks", "guard sees rm --recursive")
    yield from each("scripts/guard.py", 'itertools.takewhile(lambda w: w != "--", words[1:])', "words[1:]", "hooks", "guard reads rm's flags before --")
    yield from each("scripts/guard.py", r"(?![A-Za-z_]\w*:\?)", "", "hooks", "guard lets ${name:?} pass")
    yield from each("scripts/guard.py", r"|[A-Za-z_\d@*#?$!(-]|$)|`", r"|[A-Za-z_\d@*#?$!(-]|$)", "hooks", "guard sees a backtick's output")
    yield from each("scripts/guard.py", r"[A-Za-z_\d@*#?$!(-]", r"[A-Za-z_]", "hooks", "guard sees parameters and $(...)")
    yield from each("scripts/guard.py", r"|$)|`", r")|`", "hooks", "guard sees a lone $ before (...)")
    yield from each("scripts/guard.py", "ASSIGNMENT.fullmatch(words[0]) or words[0] in KEYWORDS", "ASSIGNMENT.fullmatch(words[0])", "hooks", "guard reads past if, then, ( and {")
    yield from each("scripts/guard.py", '"xargs", "sudo", "doas"}', '"xargs"}', "hooks", "guard reads past sudo")
    yield from each("scripts/guard.py", 're.fullmatch(r"-[a-zA-Z]*c[a-zA-Z]*", words[1])', 'words[1] == "-c"', "hooks", "guard reads bash -lc")
    yield from each("scripts/guard.py", "            if token in SEPARATORS:", "            if False:", "hooks", "guard splits at the shell's separators")
    yield from each("scripts/review_pass.py", 'sys.exit(f"review_pass: no', 'print(f"review_pass: no', "hooks", "review_pass check")
    yield from each("scripts/patch_coverage.py", "    sys.exit(1)", "    pass", "hooks", "patch_coverage floor")
    yield from each("scripts/patch_coverage.py", "|(^|/)tests/", "", "hooks", "patch_coverage leaves Playwright's tests out")
    yield from each("scripts/patch_coverage.py", "|^app/src/(root|entry\\.server)\\.tsx$", "", "hooks", "patch_coverage leaves the shell and server entry to the journeys")
    yield from each("scripts/patch_coverage.py", "|^server/src/main\\.ts$", "", "hooks", "patch_coverage leaves the server's entry to its child-process tests")
    yield from each("scripts/patch_coverage.py", "|(^|/)\\.storybook/", "", "hooks", "patch_coverage leaves Storybook's config out")
    yield from each("scripts/patch_coverage.py", "|(^|/)testSetup\\.ts$", "", "hooks", "patch_coverage leaves the tests' setup out")
    yield from each("scripts/patch_coverage.py", "|^packages/ui/src/.*\\.stories\\.tsx$", "", "hooks", "patch_coverage leaves the stories out (F247)")
    yield from each("scripts/patch_coverage.py", "^packages/ui/src/.*\\.stories", "\\.stories", "hooks", "patch_coverage leaves only Storybook's own stories out (F252)")
    yield from each("scripts/patch_coverage.py", "|^packages/ui/src/Overview/Overview\\.tsx$", "", "hooks", "patch_coverage leaves the overview out (F247)")
    yield from each("scripts/patch_coverage.py", "Overview/Overview\\.tsx$", "Overview/", "hooks", "patch_coverage leaves only the overview's page out (F264)")
    yield from each("scripts/patch_coverage.py", "(^|/)testSetup", "(^|/)\\w*", "hooks", "patch_coverage measures code named like a setup")
    yield from each("scripts/patch_coverage.py", "os.path.relpath(p))]", "p)]", "hooks", "patch_coverage matches paths inside the repository")
    yield from each("scripts/patch_coverage.py", "(root|entry\\.server)", ".+", "hooks", "patch_coverage measures the app's routes")
    yield from each("scripts/check_docs.py", "    sys.exit(1)", "    pass", "hooks", "check_docs")
    yield from each("scripts/check_docs.py", "if status not in STATUSES:", "if False:", "hooks", "ledger: a known status")
    yield from each("scripts/check_docs.py", "problems or orphans or", "problems or", "hooks", "check_docs wants each test beside its file")
    yield from each("scripts/check_docs.py", "unnamed or lost or rules:", "unnamed or rules:", "hooks", "check_docs wants the runbook's known limits")
    yield from each("scripts/check_docs.py", "unnamed or lost or rules:", "unnamed or lost:", "hooks", "check_docs fails a lost review rule (G12)")
    yield from each("scripts/check_docs.py", 'limit not in " ".join(said.split())', "limit not in said", "hooks", "check_docs reads a limit wrapped anyhow")
    yield from each("scripts/check_docs.py", "*lost, sep=", "*LIMITS, sep=", "hooks", "check_docs names the limits lost alone")
    yield from each("scripts/check_docs.py", " for sha in shas if sha not in real]", " for sha in shas if False]", "hooks", "ledger: every commit cited is one")
    yield from each("scripts/check_docs.py", 'if kind == "commit"}', 'if kind != "missing"}', "hooks", "ledger: a cited object is a commit")
    yield from each("scripts/check_docs.py", "        return set(shas)\n", "        return set()\n", "hooks", "ledger: no commit is read outside a repository")
    yield from each("scripts/check_docs.py", 'listed(root, {".ts", ".tsx"}) if re.search', 'root.rglob("*") if re.search', "hooks", "check_docs reads what git tracks")
    yield from each("scripts/check_docs.py", 're.search(r"\\.test\\.tsx?$", p.name)', '".test." in p.name', "hooks", "check_docs reads only tests")
    yield from each("scripts/check_docs.py", 'elif status == "fixed" and not shas:', "elif False:", "hooks", "ledger: a fix names its commit")
    yield from each("scripts/check_docs.py", r'r"F\d{3,}"', r'r"F\d{3}"', "hooks", "check_docs reads a ledger id of four digits (F1212)")
    yield from each("scripts/check_docs.py", "if fid in seen:", "if False:", "hooks", "ledger: unique ids")
    yield from each("scripts/check_docs.py", 'evidence in ("", "—", "-")', "False", "hooks", "ledger: a rejection says why")
    yield from each("scripts/check_docs.py", "orphans or unnamed or", "orphans or", "hooks", "check_docs wants every alert in the runbook")
    yield from each("scripts/check_docs.py", "if len(event.findall(text)) > len(found):", "if False:", "hooks", "check_docs refuses an alert it cannot read")
    yield from each("scripts/check_docs.py", r'''event = re.compile(r"""[`"']alert[`"']""")''', r'''event = re.compile(r"""["']alert["']""")''', "hooks", "check_docs sees the event however written")
    yield from each("scripts/check_docs.py", r'"^- \*\*Every alert\*\*(.*?)(?=^- \*\*|^#|\Z)"', r'"(.*)"', "hooks", "check_docs reads the list alone")
    yield from each("scripts/check_docs.py", "sorted(listed_alerts - alerts)", "[]", "hooks", "check_docs wants no listed alert the server never logs")
    yield from each("scripts/check_docs.py", r"""alert["']\s*,\s*\{""", r"""alert["'], \{""", "hooks", "check_docs reads a call across lines")
    yield from each("scripts/check_docs.py", r"""error:\s*["']([a-z_]+)["']""", r'''error:\s*"([a-z_]+)"''', "hooks", "check_docs reads either quote")
    yield from each("scripts/check_docs.py", 'and ".test." not in p.name', "", "hooks", "check_docs leaves a test's alerts out")
    yield from each("scripts/check_docs.py", r're.findall(r"`([a-z_]+)`", bullet', r're.findall(r"([a-z_]+)", bullet', "hooks", "check_docs wants an alert quoted")
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
    yield from each("scripts/check_regressions.py", "elif isinstance(value, dict):", "elif False:", "hooks", "check_regressions reads a workspace's ignore lists")
    yield from each("scripts/check_regressions.py", '    if report["errors"]:', "    if False:", "hooks", "check_regressions stops on a failed Playwright listing")
    yield from each("scripts/check_regressions.py", 'walk(child, [*path, child["title"]])', "walk(child, path)", "hooks", "check_regressions names a journey with its describe")
    yield from each("scripts/check_regressions.py", ', "scripts/.gitleaksignore"]', "]", "hooks", "check_regressions reads the secret scan's exceptions")
    yield from each("scripts/check_regressions.py", 'out["pnpm-workspace.yaml outside packages"] = ', "_ = ", "hooks", "check_regressions watches pnpm's supply-chain file")
    yield from each("scripts/check_regressions.py", r'r"^packages:\n(?:[ \t]*(?:-.*|#.*)?\n)*"', 'r"(?s).*"', "hooks", "check_regressions sees past the packages list")
    yield from each("scripts/check_regressions.py", r'r"^packages:\n(?:[ \t]*(?:-.*|#.*)?\n)*"', r'r"^packages:\n(?:[ \t]+-.*\n)*"', "hooks", "check_regressions reads a list with comments or flush items (F123)")
    yield from each("scripts/check_regressions.py", "os.path.relpath(os.path.realpath(path), os.path.realpath(root))", "os.path.relpath(path, root)", "hooks", "check_regressions resolves links")
    yield from each("scripts/check_regressions.py", 'benched(git("ls-files"), here)', 'benched(git("ls-tree", "-r", "--name-only", base), lambda p: show(base, p))', "hooks", "check_regressions reads the benches the branch has (G6)")
    yield from each("scripts/check_regressions.py", 'after.get(name, float("inf")) > old and', "False and", "hooks", "check_regressions refuses a bench with a longer budget (G6)")
    yield from each("scripts/check_regressions.py", 'float("inf")', "0", "hooks", "check_regressions refuses a bench gone (G6)")
    yield from each("scripts/check_regressions.py", 'f"bench {name}" not in excused', "True", "hooks", "check_regressions lets a commit name the bench it lowers (G6)")
    yield from each("scripts/repo_files.py", "            if budget:", "            if False:", "hooks", "check_regressions reads a bench's budget (G6)")
    yield from each("scripts/check_regressions.py", "if BENCH_FILE.search(p)", 'if p.endswith(".ts")', "hooks", "check_regressions reads the benches' files alone (G6)")
    yield from each("scripts/check_regressions.py", "if after.get(name) != old and", "if False and", "hooks", "check_regressions watches a check's settings")
    yield from each(".githooks/commit-msg", "exit 1", ":", "hooks", "commit-msg refusal")
    yield from each(".githooks/pre-push", "exit 1", ":", "hooks", "pre-push refusal")
    yield from each(".githooks/pre-push", 'python3 -I scripts/review_pass.py check "$local_sha"', ":", "hooks", "pre-push review check")
    yield from each(".githooks/pre-push", "sh scripts/check.sh --full </dev/null", ":", "hooks", "pre-push gate")
    yield from each(".githooks/pre-push", "		sh scripts/check.sh </dev/null", "		:", "hooks", "pre-push fast gate")
    yield from each(".githooks/pre-push", '"Harness-changed: $1 - "?*', "*", "hooks", "pre-push wants each harness change declared with its reason")
    yield from each(".githooks/commit-msg", "if ! printf '%s\\n' \"$msg\" | gitleaks stdin", "if false && printf '%s\\n' \"$msg\" | gitleaks stdin", "hooks", "commit-msg scans the message for private names")
    yield from each(".githooks/commit-msg", " --ignore-gitleaks-allow", "", "hooks", "commit-msg ignores gitleaks:allow (F113)")
    yield from each(".githooks/commit-msg", "|^claude-session:", "", "hooks", "commit-msg refuses a Claude-Session line (F591)")
    yield from each(".githooks/commit-msg", "for config in gitleaks.toml gitleaks-private.toml; do", "for config in gitleaks-private.toml; do", "hooks", "commit-msg scans the message for secrets")
    # A fix of the product with no test and no No-test line, refused at the commit (9db841c).
    cmsg = ".githooks/commit-msg"
    yield from each(cmsg, '&& [ -z "$kept" ] ', "", "hooks", "commit-msg takes a fix's test")
    yield from each(cmsg, 'grep -qvE "$tests|^$"', 'grep -qE "."', "hooks", "commit-msg leaves a fix of tests alone")
    yield from each(cmsg, " && ! printf '%s\\n' \"$msg\" | grep -qE '^No-test: [^ ]'", "", "hooks", "commit-msg takes a No-test line")
    yield from each(cmsg, "grep -qE '^No-test: [^ ]'", "grep -qE '^No-test:'", "hooks", "commit-msg wants a reason on a No-test line")
    yield from each(cmsg, "--name-only --diff-filter=AMDT)", "--name-only --diff-filter=AM)", "hooks", "commit-msg counts deleted product code")
    yield from each(cmsg, "--name-only --diff-filter=AM | grep", "--name-only | grep", "hooks", "commit-msg counts no deleted test")
    yield from each(cmsg, '|| { echo "commit-msg: git cannot list what is staged" >&2; exit 1; }', "|| :", "hooks", "commit-msg refuses a fix git cannot compare")
    yield from each(cmsg, "grep -qE '^fix(\\(.+\\))?!?:'; then", "grep -qE '^fix(\\(.+\\))?:'; then", "hooks", "commit-msg reads a breaking fix")
    yield from each(".githooks/commit-msg", "command -v gitleaks >/dev/null ||", "true ||", "hooks", "commit-msg names a missing gitleaks (F125)")
    yield from each("scripts/gitleaks-private.toml", r"'''(?i)\b[a-z]:\\{1,2}users", r"'''(?i)\bnever:\\{1,2}users", "hooks", "the private scan sees Windows home folders")
    yield from each("scripts/gitleaks-private.toml", "|file://)", ")", "hooks", "the private scan sees a file URL into a home folder")
    yield from each("scripts/gitleaks-private.toml", r"(?:^|[^\w./~]|file://)(", "(", "hooks", "the private scan lets a users folder inside a path pass (F117)")
    yield from each("scripts/gitleaks-private.toml", "/[a-z_][", r"/[\w][", "hooks", "the private scan lets a route's number pass (F117)")
    yield from each("scripts/gitleaks-private.toml", "(?i)^/home/runner$", "(?i)/home/runner", "hooks", "the private scan lets only the CI runner's folder pass")
    yield from each(".githooks/pre-push", 'changed=$(harness --name-only "$remote_sha" "$local_sha")', "changed=$(:)", "hooks", "pre-push lists the harness files main gets")
    yield from each(".githooks/pre-push", '"$local_sha") || refuse "fetch main first', '"$local_sha" || :) || refuse "fetch main first', "hooks", "pre-push refuses a main it cannot compare (F116)")
    yield from each(".githooks/records.sh", " app/tsconfig.json", "", "hooks", "the harness list holds every file harness_mutate guards (F124)")
    yield from each(".githooks/records.sh", " .mcp.json", "", "hooks", "the harness list holds what Claude Code starts (F129)")
    yield from each(".githooks/pre-push", 'if [ "$remote_sha" != "$zero" ]; then', "if false; then", "hooks", "pre-push compares main with the remote's")
    yield from each(".githooks/pre-push", '! $gated || sh "$(dirname "$0")/scan_secrets.sh"', ":", "hooks", "pre-push scans the history it sends")
    yield from each(".githooks/pre-push", '! $gated || sh "$(dirname "$0")/scan_secrets.sh"', "! $gated || sh scripts/scan_secrets.sh", "hooks", "pre-push scans with its own scan, not the working tree's (F129)")
    # F129: the hooks live in .git/hooks, installed from main with the scripts they run.
    ih = "scripts/install_hooks.sh"
    yield from each(ih, 'git cat-file -e "$ref:.githooks/$hook" 2>/dev/null ||', "true ||", "hooks", "install_hooks refuses a commit missing a hook")
    yield from each(ih, "git ls-tree --full-tree ", "git ls-tree ", "hooks", "install_hooks reads the commit from any folder")
    yield from each(ih, '[ -z "$twice" ] ||', "true ||", "hooks", "install_hooks refuses two files under one name")
    yield from each(ih, '[ -z "$others" ] ||', "true ||", "hooks", "install_hooks --check refuses a hook the commit does not hold")
    yield from each(ih, '[ ! -L "$to" ] && ', "", "hooks", "install_hooks --check refuses a link")
    yield from each(ih, '[ -x "$to" ] && ', "", "hooks", "install_hooks --check refuses a hook git would skip")
    yield from each(ih, 'git show "$ref:$f" | cmp -s - "$to" ||', "true ||", "hooks", "install_hooks --check wants each file the commit's")
    yield from each(ih, '[ -z "$f" ] || rm -rf -- "${hooks:?}/$f"', ":", "hooks", "install_hooks removes a hook the commit does not hold")
    yield from each(ih, '	rm -f "$to" # a link there', "	: # a link there", "hooks", "install_hooks writes in place of a link, not through it")
    yield from each(ih, '	git show "$ref:$f" >"$to"', '	cp "$f" "$to"', "hooks", "install_hooks installs the commit's files, not the working tree's")
    yield from each(ih, '	chmod 755 "$to"', "	:", "hooks", "install_hooks makes the hooks executable")
    yield from each(ih, "git config --unset-all core.hooksPath", "git config --unset core.hooksPath", "hooks", "install_hooks removes every override")
    yield from each(ih, "git config --unset-all core.hooksPath || [ $? = 5 ]", ":", "hooks", "install_hooks takes git off the repository's hooks")
    yield from each(ih, "git config merge.ff false", ":", "hooks", "install_hooks turns off fast-forwards, which run no hook")
    yield from each(ih, '[ "$(git rev-parse --path-format=absolute --git-path hooks)" = "$hooks" ] ||', "true ||", "hooks", "install_hooks fails while git takes hooks from elsewhere")
    ms = ".githooks/merge.sh"
    yield from each(ms, 'cd "$(git rev-parse --show-toplevel)"', ":", "hooks", "merge.sh reads the harness from the root, from any folder")
    yield from each(ms, '[ "$(git symbolic-ref -q --short HEAD)" = main ] ||', "true ||", "hooks", "merge.sh merges onto main only")
    yield from each(ms, '[ -z "$(git status --porcelain)" ] ||', "true ||", "hooks", "merge.sh merges onto a clean tree only")
    yield from each(ms, "if [ -n \"$changed\" ]; then", "if false; then", "hooks", "merge.sh shows the harness a branch changes")
    yield from each(ms, 'shown=$(harness --text ', "shown=$(harness ", "hooks", "merge.sh shows a file as text, whatever git takes it for (F132)")
    yield from each(ms, ' | cat -v', "", "hooks", "merge.sh shows control bytes, which could hide a line")
    yield from each(ms, '[ "$answer" = "$branch" ] ||', "true ||", "hooks", "merge.sh wants the branch's name typed")
    yield from each(ms, "GNOWORLD_MERGE=$tip ", "", "hooks", "merge.sh marks the merge it showed")
    yield from each(".githooks/pre-commit", '[ "${1:-}" = --merge ] || ', "", "hooks", "pre-commit checks a merge pre-merge-commit hands it (F129)")
    yield from each(".githooks/pre-commit", " || git rev-parse -q --verify MERGE_HEAD >/dev/null", "", "hooks", "pre-commit checks a merge concluded by hand (F129)")
    yield from each(".githooks/pre-commit", "GATE_MERGE=$merge ", "", "hooks", "pre-commit tells the staged gate whether it commits a merge: a caller's value counts for nothing")
    yield from each(".githooks/pre-commit", "merge=0\n{", "merge=1\n{", "hooks", "pre-commit gives a work commit its time budget")
    yield from each(".githooks/pre-commit", '{ [ "${1:-}" = --merge ] || git', "{ false || git", "hooks", "pre-commit tells the staged gate of pre-merge-commit's merge")
    yield from each(".githooks/pre-commit", "|| git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; } && merge=1", "|| false; } && merge=1", "hooks", "pre-commit tells the staged gate of a merge in progress")
    yield from each(".githooks/pre-commit", '[ -n "$changed" ] && ', "", "hooks", "pre-commit wants merge.sh only for a merge that changes the harness")
    yield from each(".githooks/pre-commit", '[ "$(git merge-tree --write-tree HEAD "${GNOWORLD_MERGE:-}" 2>/dev/null)" != "$(git write-tree)" ]',
                    '[ -z "${GNOWORLD_MERGE:-}" ]', "hooks", "pre-commit wants merge.sh's mark for this merge, not any (F129)")
    yield from each(".githooks/pre-commit", 'sh .git/hooks/merge.sh <branch>" >&2\n\t\t\texit 1', 'sh .git/hooks/merge.sh <branch>" >&2', "hooks", "pre-commit refuses a merge merge.sh did not show")
    yield from each(".githooks/pre-commit", '	sh "$(dirname "$0")/code_changed.sh" --staged', "	sh scripts/code_changed.sh --staged", "hooks", "pre-commit runs its own code_changed.sh, not the working tree's (F129)")
    yield from each(".githooks/pre-commit", '	sh "$(dirname "$0")/scan_secrets.sh" --staged', "	sh scripts/scan_secrets.sh --staged", "hooks", "pre-commit runs its own scan, not the working tree's (F129)")
    yield from each(".githooks/pre-merge-commit", " --merge", "", "hooks", "pre-merge-commit tells pre-commit it is a merge (F129)")
    yield from each(".githooks/pre-commit", ' || [ -e "$(git rev-parse --git-path SQUASH_MSG)" ]', "", "hooks", "pre-commit checks a squash merge (F129)")
    yield from each(".githooks/pre-commit", "harness --cached --name-only HEAD", "harness --name-only HEAD", "hooks", "pre-commit reads the merge in the index, what is committed")
    for hook in (".githooks/pre-commit", ".githooks/pre-push", ".githooks/merge.sh"):
        yield from each(hook, '. "$(dirname "$0")/records.sh"', ". .githooks/records.sh", "hooks", f"{hook} loads its own records, not the working tree's (F129)")
    yield from each(".githooks/records.sh", "export GIT_NO_REPLACE_OBJECTS=1", ":", "hooks", "the hooks read the objects, past a replace ref (F132)")
    yield from each(ih, "export GIT_NO_REPLACE_OBJECTS=1", ":", "hooks", "install_hooks reads the objects, past a replace ref (F132)")
    yield from each(ih, "grep -vxF", "grep -vF", "hooks", "install_hooks takes a hook's whole name, not a part of it")
    yield from each(ih, "git config pull.ff only", ":", "hooks", "install_hooks keeps a pull a fast-forward")
    yield from each(ih, '$check || mkdir -p "$hooks"', ":", "hooks", "install_hooks makes a missing hooks folder")
    yield from each(ms, ' "$tip"\n', ' "$branch"\n', "hooks", "merge.sh merges the commit it showed, not where the branch is now")
    ck = "scripts/check.sh"
    hooks = ("commit-msg", "pre-commit", "pre-merge-commit", "pre-push")
    for hook in hooks:
        for path in (ih, ck):
            yield from each(path, f"for hook in {' '.join(hooks)}; do", f"for hook in {' '.join(h for h in hooks if h != hook)}; do",
                            "hooks", f"{path} wants {hook} (F129)")
    yield from each(".githooks/pre-push", '--check "$local_sha"', "--check", "hooks", "pre-push checks the hooks of the main it pushes, not the local main's (F129)")
    # Round 1 of F129's review.
    yield from each(".githooks/records.sh", "GIT_ICASE_PATHSPECS=1 ", "", "hooks", "the harness list is case-blind, as the disk is (F151)")
    yield from each(ms, 'if foreign HEAD..."$tip"; then', "if false; then", "hooks", "merge.sh refuses a path the disk may fold (F164)")
    yield from each(".githooks/pre-commit", "if foreign --cached HEAD; then", "if false; then", "hooks", "pre-commit refuses a merged path the disk may fold (F164)")
    yield from each(".githooks/pre-commit", ", or git reset --hard after a squash", "", "hooks", "pre-commit tells how to undo a squash (F154)")
    yield from each(ih, '[ "$(git config merge.ff)" = false ] ||', "true ||", "hooks", "install_hooks --check wants fast-forward merges off (F159)")
    for flag in ("--no-ext-diff ", "--no-textconv ", "--color=never "):
        yield from each(ms, flag, "", "hooks", f"merge.sh shows the text itself: {flag.strip()} (F156)")
    for path in (".git/commondir", ".mcp.json"):
        yield from each(".claude/settings.json", f'      "Edit(/{path})",\n', "", "hooks", f"settings keep {path} out of Claude's file tools (F150, F158)")
    yield from each(".claude/settings.json", '        ".git/commondir",\n', "", "hooks", "the sandbox keeps commands out of git's commondir (F150)")
    yield from each(".claude/settings.json", ',\n        ".mcp.json"\n', "\n", "hooks", "the sandbox keeps commands out of .mcp.json (F158)")
    yield from each("scripts/test_hooks.sh", """if [ "$(grep -c '^if part ' "$0")" != "$(printf '%s\\n' "$sections" | grep -c .)" ]; then""", "if false; then",
                    "hooks", "the hook suite refuses a section its runner does not list (F160)")
    yield from each(".githooks/commit-msg", '--config "$(dirname "$0")/$config"', '--config "scripts/$config"', "hooks", "commit-msg scans with its own rules, not the working tree's (F129)")
    yield from each(".githooks/pre-push", 'sh "$(dirname "$0")/install_hooks.sh" --check "$local_sha" ||', "true ||", "hooks", "pre-push wants the hooks of the main it pushes installed (F129)")
    yield from each(ck, 'if [ "$runs_from" != "$git_dir/hooks" ]; then', "if false; then", "hooks", "check.sh refuses hooks taken from elsewhere (F129)")
    yield from each(ck, 'if [ -n "${SANDBOX_RUNTIME:-}" ]; then\n\t\tif (', "if true; then\n\t\tif (", "hooks", "check.sh probes the sandbox only in it")
    yield from each(ck, '(: >>"$git_dir/config") 2>/dev/null || ', "", "hooks", "check.sh probes git's config (F129)")
    yield from each(ck, ' || { probe=$(mktemp "$git_dir/hooks/probe.XXXXXX" 2>/dev/null) && rm "$probe"; }', "", "hooks", "check.sh probes git's hooks folder (F129)")
    yield from each(ck, ' && rm "$probe"', "", "hooks", "check.sh leaves no probe behind")
    yield from each(ck, '[ -x "$git_dir/hooks/$hook" ] ||', "true ||", "hooks", "check.sh wants the hooks installed (F129)")
    for path in (".git/hooks/**", ".git/config"):
        yield from each(".claude/settings.json", f'      "Edit(/{path})",\n', "", "hooks", f"settings keep {path} out of Claude's file tools (F129)")
    yield from each(".claude/settings.json", '        ".git/hooks",\n', "", "hooks", "the sandbox keeps commands out of git's hooks (F129)")
    yield from each(".claude/settings.json", '        ".git/config",\n', "", "hooks", "the sandbox keeps commands out of git's config (F129)")
    yield from each("package.json", ' --project slow"', ' --project slow --project compiled"', "hooks", "the coverage leaves the compiled project's memo checks out of its branches (F1350)")
    yield from each("package.json", '    "test:compiled": "vitest run --project compiled",\n', "", "hooks", "the full gate has a script for the compiled project's tests (F1350)")
    yield from each("package.json", '  "scripts": {\n', '  "scripts": {\n    "postinstall": "true",\n', "hooks", "pnpm install runs no script (F129)")
    # F076: outside the sandbox the hooks run no repository code, and check the gate's records.
    rec = ".githooks/records.sh"
    for part in (" -e '\tdocs/'", " -e '\tadr/'", " -e '\\.md$'", " -e '\tdocs/review-log\\.md$'", " -e '\tdocs/review-passes\\.txt$'"):
        yield from each(rec, part, "", "hooks", f"records.sh leaves{part} out of its print")
    yield from each(rec, "git -c core.quotePath=false ls-tree", "git ls-tree", "hooks", "records.sh reads an accented name as code_changed.sh does (F133)")
    yield from each(rec, "git add -A", "git add -u", "hooks", "records.sh prints untracked code too (F133)")
    yield from each(rec, 'if [ "$(worktree_print)" != "$1" ]; then', "if false; then", "hooks", "records.sh records no code that changed while its gate ran (F133)")
    yield from each(rec, '[ "$2" != true ] || put "$1" full', ":", "hooks", "records.sh records a full gate as full")
    yield from each(rec, 'grep -qxF "$1" ".claude/tmp/green-$2" 2>/dev/null || ', "", "hooks", "records.sh records a print once")
    yield from each(rec, 'grep -qxF "$1"', 'grep -qF "$1"', "hooks", "records.sh writes a print beside a longer line")
    green_line = 'green() ( grep -qxF "$(code_print "$1")" ".claude/tmp/green-$2" 2>/dev/null )'
    yield from each(rec, green_line, green_line.replace("-qxF", "-qF"), "hooks", "records.sh wants a whole record line")
    yield from each(rec, green_line, "green() ( true )", "hooks", "records.sh wants the code recorded")
    yield from each(rec, green_line, 'green() { p=leaked f=leaked; grep -qxF "$(code_print "$1")" ".claude/tmp/green-$2" 2>/dev/null; }', "hooks", "records.sh leaves no variable behind (F133)")
    yield from each(rec, 'grep -qxF "$(review_print "$1")"', "grep -q .", "hooks", "records.sh wants the review pass of this tree")
    pc = ".githooks/pre-commit"
    yield from each(pc, 'if [ -z "${SANDBOX_RUNTIME:-}" ]; then', "if false; then", "hooks", "pre-commit runs no gate outside the sandbox")
    yield from each(pc, '	sh "$(dirname "$0")/scan_secrets.sh" --staged', "	:", "hooks", "pre-commit scans outside the sandbox")
    yield from each(pc, '[ "$prose" -le 1 ] ||', "true ||", "hooks", "pre-commit refuses a failing code_changed.sh (F133)")
    yield from each(pc, 'if [ "$prose" = 0 ] && ! green "$(git write-tree)" fast; then', "if false; then", "hooks", "pre-commit wants recorded code outside the sandbox")
    yield from each(pc, 'or let Claude commit it there" >&2\n\t\texit 1', 'or let Claude commit it there" >&2', "hooks", "pre-commit refuses unrecorded code outside the sandbox")
    yield from each(pc, "\texit 0\nfi\nstaged=", "fi\nstaged=", "hooks", "pre-commit ends outside the sandbox before any gate")
    gate_line, rec_line = 'env -u GIT_INDEX_FILE -u GIT_DIR -u GIT_WORK_TREE GATE_CHANGED="$changed" GATE_MERGE=$merge sh "$s/check.sh"\n', 'put "$(code_print "$(git write-tree)")" fast'
    yield from each(pc, rec_line, "true", "hooks", "pre-commit records the code it passed")
    yield from each(pc, gate_line + rec_line, rec_line + "\n" + gate_line.rstrip("\n"), "hooks", "pre-commit records only after its gate passed")
    pp = ".githooks/pre-push"
    yield from each(pp, '[ -n "${SANDBOX_RUNTIME:-}" ] || outside=true', ":", "hooks", "pre-push runs no gate outside the sandbox")
    yield from each(pp, 'green "$local_sha" full ||', "true ||", "hooks", "pre-push wants main's full gate recorded")
    yield from each(pp, 'reviewed "$local_sha" ||', "true ||", "hooks", "pre-push wants main's review pass")
    yield from each(pp, 'green "$local_sha" fast ||', "true ||", "hooks", "pre-push wants a branch's gate recorded")
    yield from each(pp, "\t\tgated=true\n", "\n", "hooks", "pre-push scans what each kind of push sends")
    yield from each(pp, '. "$(dirname "$0")/records.sh"', ":", "hooks", "pre-push loads the records")
    yield from each(".githooks/pre-merge-commit", 'exec "$(dirname "$0")/pre-commit" --merge', "exit 0", "hooks", "pre-merge-commit gates a merge")
    yield from each("scripts/check.sh", ". .githooks/records.sh && tested=$(worktree_print)", ": && tested=", "hooks", "check.sh prints the code it tests (F133)")
    yield from each("scripts/check.sh", 'gate_passed "$tested" "$full"', ":", "hooks", "check.sh records the code it passed")
    for rule in ("scan_secrets.sh", "gitleaks.toml", "gitleaks-private.toml", ".gitleaksignore", "install_hooks.sh"):
        yield from each(".claude/settings.json", f'      "Edit(/scripts/{rule})",\n', "", "hooks", f"settings keep {rule} out of Claude's edits")
    yield from each("scripts/check_docs.py", '"intended", "moot", "asked"}', '"asked"}', "hooks", "check_docs knows Anthropic's outcomes")
    yield from each("scripts/check_docs.py", '"intended", "moot", "reproduced"', '"reproduced"', "hooks", "check_docs wants a reason for an intended or moot finding")
    yield from each("scripts/scan_secrets.sh", "export GIT_NO_REPLACE_OBJECTS=1", ":", "hooks", "scan_secrets reads past a replace ref (F132)")
    for flag in ('"--text', " --no-ext-diff", " --no-textconv"):
        yield from each("scripts/scan_secrets.sh", flag, '"' if flag.startswith('"') else "", "hooks", f"scan_secrets hands gitleaks text: {flag.strip(chr(34))} (F132)")
    yield from each("scripts/scan_secrets.sh", "--full-history --all ", "--full-history ", "hooks", "scan_secrets reads every branch")
    yield from each("scripts/scan_secrets.sh", '[ "$config" = gitleaks.toml ] || paths="-- . $binaries"', ":", "hooks", "scan_secrets keeps images from the private rules (F139)")
    yield from each("scripts/scan_secrets.sh", '[ "$config" = gitleaks.toml ] || paths=', "paths=", "hooks", "scan_secrets reads images for secrets (F139)")
    yield from each("scripts/scan_secrets.sh", ':(exclude,icase)*.png ', "", "hooks", "scan_secrets keeps a PNG from the private rules (F139)")
    yield from each("scripts/scan_secrets.sh", "(set -f && git log -1 $opts >/dev/null) ||", "true ||", "hooks", "scan_secrets refuses a history git cannot read (F140)")
    yield from each("scripts/scan_secrets.sh", "staged=$(set -f && git diff --cached -U0 $text $paths)", "staged=$(set -f && git diff --cached -U0 $text $paths || :)", "hooks", "scan_secrets refuses a staged diff git cannot read (F140)")
    yield from each("scripts/scan_secrets.sh", "--ignore-gitleaks-allow || found=1", "--ignore-gitleaks-allow || :", "hooks", "scan_secrets fails on what the staged scan found")
    yield from each("scripts/scan_secrets.sh", "--ignore-gitleaks-allow || found=1", "--ignore-gitleaks-allow", "hooks", "scan_secrets runs both rule sets on what is staged (F120)")
    yield from each("scripts/scan_secrets.sh", "--config \"$here/$config\" ", "", "hooks", "scan_secrets imposes its rules")
    yield from each("scripts/scan_secrets.sh", "gitleaks.toml gitleaks-private.toml; do", "gitleaks.toml; do", "hooks", "scan_secrets keeps private names out")
    yield from each("scripts/scan_secrets.sh", " --ignore-gitleaks-allow", "", "hooks", "scan_secrets ignores gitleaks:allow")
    yield from each("scripts/scan_secrets.sh", '. || found=1', ". || :", "hooks", "scan_secrets fails on what any rule set found")
    yield from each("scripts/scan_secrets.sh", '. || found=1', ".", "hooks", "scan_secrets runs both rule sets (F120)")
    yield from each("scripts/scan_secrets.sh", "if [ -e .gitleaksignore ]; then", "if false; then", "hooks", "scan_secrets refuses a root .gitleaksignore")
    yield from each(".githooks/pre-commit", 'sh "$s/check.sh"', "true", "hooks", "pre-commit gate")
    yield from each(".githooks/pre-commit", 'GATE_CHANGED="$changed" ', "", "hooks", "pre-commit hands the gate the commit's paths")
    yield from each(".githooks/pre-commit", "diff --cached --no-renames --name-only HEAD", "diff --cached --name-only HEAD", "hooks", "pre-commit lists a rename's two paths")
    yield from each(".githooks/pre-commit", "diff --cached --no-renames --name-only HEAD", "diff --no-renames --name-only HEAD", "hooks", "pre-commit lists what is staged only")
    yield from each(".githooks/pre-commit", 'sh "$s/scan_secrets.sh" --staged', ":", "hooks", "pre-commit secret scan")
    yield from each(".githooks/pre-commit", 'sh "$s/borrow_node_modules.sh" "$staged"', 'sh scripts/borrow_node_modules.sh "$staged"', "hooks", "pre-commit runs the staged helpers")
    yield from each("scripts/borrow_node_modules.sh", 'else cp -RP "$m" "$1/$m"; fi', 'else ln -s "$PWD/$m" "$1/$m"; fi', "hooks", "a copy reads its own workspace packages (F344)")
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
    yield from each("scripts/stop_gate.sh", 'gate-green 2>/dev/null)" = "$state"', 'gate-green 2>/dev/null)" != "x"', "hooks", "stop_gate compares the state the gate passed")
    yield from each("scripts/stop_gate.sh", 'gate-blocked 2>/dev/null)" = "$state"', 'gate-blocked 2>/dev/null)" != "x"', "hooks", "stop_gate passes only the tree it blocked")
    yield from each("scripts/stop_gate.sh", 'mv -f "$tmp" .claude/tmp/gate-blocked', 'rm -f "$tmp"', "hooks", "stop_gate records the tree it blocked")
    yield from each("scripts/stop_gate.sh", "[ ! -L .claude/tmp ] && ", "", "hooks", "stop_gate writes nothing through a planted .claude/tmp (security-S2)")
    yield from each("scripts/stop_gate.sh", "[ ! -d .claude/tmp/gate-blocked ] && ", "", "hooks", "stop_gate moves nothing into a folder at its record")
    yield from each("scripts/stop_gate.sh", "if ($2 != 1 && ", "if (1 && ", "hooks", "stop_gate takes no orphaned check.sh for a live gate")
    yield from each("scripts/stop_gate.sh", 'prog[i] != "node" || ', "", "hooks", "stop_gate stops node processes alone, never an editor (security-S4)")
    yield from each("scripts/stop_gate.sh", 'log="$HOME/Library/Logs/gnoworld-reaped.log"', 'log=.claude/tmp/reaped.log', "hooks", "stop_gate logs where the sandbox cannot plant a link (security-S1)")
    yield from each("scripts/stop_gate.sh", "reap || :", ":", "hooks", "stop_gate stops what runs left behind")
    yield from each("scripts/stop_gate.sh", "(gate ? 7200 : 1800)", "7200", "hooks", "stop_gate stops an orphan of 30 minutes when no gate runs")
    yield from each("scripts/stop_gate.sh", "secs[i] >= (gate ?", "secs[i] > (gate ?", "hooks", "stop_gate stops an orphan at its bound, 30 minutes or 2 hours")
    yield from each("scripts/stop_gate.sh", "(gate ? 7200 : 1800)", "(gate ? 7200 : 1799)", "hooks", "stop_gate spares an orphan under 30 minutes")
    yield from each("scripts/stop_gate.sh", "ppid[i] == 1 &&", "ppid[i] >= 1 &&", "hooks", "stop_gate's first rule is for orphans alone")
    yield from each("scripts/stop_gate.sh", "low ~ /vitest|stryker|playwright|storybook/", "low ~ /vitest|stryker|storybook/", "hooks", "stop_gate stops an old playwright")
    yield from each("scripts/stop_gate.sh", " && low !~ / (dev|watch|--watch)( |$)/", "", "hooks", "stop_gate spares a dev or watch mode")
    yield from each("scripts/stop_gate.sh", "low = tolower(line[i])", "low = line[i]", "hooks", "stop_gate reads gnoworld in any case")
    yield from each("scripts/stop_gate.sh", "secs[i] >= 10800", "secs[i] > 10800", "hooks", "stop_gate stops a test tool 3 hours old")
    yield from each("scripts/stop_gate.sh", "low !~ /gnoworld\\//", "low !~ /gnoworld/", "hooks", "stop_gate stops only a folder named gnoworld")
    yield from each("scripts/stop_gate.sh", "gate = 1", "gate = 0", "hooks", "stop_gate spares a young orphan while a gate runs")
    yield from each("scripts/stop_gate.sh", "(first ~ /^(sh|bash|dash|zsh)$/ && w[2] ~ /(^|\\/)scripts\\/check\\.sh$/)", "(cmd ~ /scripts\\/check\\.sh/)", "hooks", "stop_gate takes no mention of check.sh for a gate")
    yield from each("scripts/stop_gate.sh", "\tkill -9 $pids", "\t: $pids", "hooks", "stop_gate kills what ignores TERM")
    yield from each("scripts/stop_gate.sh", "return d * 86400 +", "return", "hooks", "stop_gate reads an age in days")
    yield from each("scripts/check.sh", "printf '%s' \"${want#v}\" | grep -qxE", "true || printf '%s' \"${want#v}\" | grep -qxE", "hooks", "check.sh refuses a .node-version that is not a version")
    yield from each(".claude/settings.json", '"onFailure": "block"', '"onFailure": "ignore"', "hooks", "settings: guard blocks on a crash")
    yield from each(".claude/settings.json", '"allowUnsandboxedCommands": false', '"allowUnsandboxedCommands": true', "hooks", "settings: no unsandboxed retry")
    yield from each(".claude/settings.json", '"denyRead": ["~/.ssh"', '"denyRead": ["~/.nothing"', "hooks", "settings: credentials unreadable")
    yield from each(".claude/settings.json", '"scripts",\n', '"nothing",\n', "hooks", "settings: harness unwritable")
    yield from each(".claude/settings.json", '"Bash(pnpm add *)"', '"Bash(nothing)"', "hooks", "settings: Claude adds no dependency")
    yield from each(".claude/settings.json", '"Edit(/scripts/guard.py)"', '"Edit(/nothing)"', "hooks", "settings: an edit of a hook's script is refused")
    yield from each(".claude/settings.json", '"mcp__gnomcp__gno_addpkg"', '"mcp__nothing"', "hooks", "settings: chain writes ask")
    yield from each(".claude/settings.json", '"Bash(rm -rf *)"', '"Bash(nothing)"', "hooks", "settings: no rm -rf")
    yield from each(".claude/settings.json", '"Edit(/app/package.json)"', '"Edit(/**/package.json)"', "hooks", "settings: no deny bans StrykerJS's copies")
    yield from each(".claude/settings.json", '"Edit(/.claude/settings.json)"', '"Edit(/.claude/**)"', "hooks", "settings: no deny bans the gate's state")
    yield from each(".claude/settings.json", '"Bash(git push *)",\n', '"Bash(git push *)",\n      "Edit(/app/**)",\n', "hooks", "settings: no edit asks")
    yield from each(".claude/settings.json", '"repo": "gnoverse/gno-mcp"', '"repo": "nowhere/nothing"', "hooks", "settings: gnomcp's marketplace")
    for path in ("scripts/test_hooks.sh", ".githooks/pre-commit"):
        yield from each(path, "|| status=1; exit \"$status\"' EXIT", "exit \"$status\"' EXIT", "hooks", f"{path} keeps a failure through its EXIT trap")
    yield from each("scripts/repo_files.py", "    clear_dead()\n", "\n", "hooks", "a copy clears the ones dead runs left")
    yield from each("scripts/repo_files.py", "if pid.isdigit() and not alive(int(pid)):", "if pid.isdigit():", "hooks", "a copy clears never a live run's")
    yield from each("scripts/repo_files.py", "            f.write(str(os.getpid()))", "            f.write(\"x\")", "hooks", "a copy names its run's pid")
    yield from each("scripts/repo_files.py", "        return False\n    except OSError:", "        return True\n    except OSError:", "hooks", "a gone pid is a dead run")
    yield from each("scripts/repo_files.py", 'os.path.join(where, "tree-" + os.path.basename(where))', 'os.path.join(where, "tree")', "hooks", "a copy never takes the name tree, one per run")
    yield from each("scripts/worktree.sh", 'case $arg in -*)', 'case $arg in -zzz)', "hooks", "worktree.sh refuses an argument that starts with a dash (CR6)")
    for find, replace, label in (('for arg in "$dir" ', "for arg in ", "the folder"), ('"$dir" "$branch" "$base"; do', '"$dir" "$base"; do', "the branch"),
                                 ('"$dir" "$branch" "$base"; do', '"$dir" "$branch"; do', "the base")):
        yield from each("scripts/worktree.sh", find, replace, "hooks", f"worktree.sh refuses {label} that starts with a dash (CR6)")
    yield from each("scripts/worktree.sh", 'git rev-parse --verify --quiet "$base^{commit}" >/dev/null ||', "true ||", "hooks", "worktree.sh refuses a base that is no commit (CR6)")
    yield from each("scripts/worktree.sh", '[ -d "$src/node_modules" ] && [ ! -L "$src/node_modules" ] ||', "true ||", "hooks", "worktree.sh refuses a root node_modules that is one link (CR6)")
    yield from each("scripts/worktree.sh", "\nfinished=1\n", "\n", "hooks", "worktree.sh marks the run that reached its end, so a trap that exits 0 after an error is no success (CR6)")
    yield from each("scripts/worktree.sh", "trap 'status=$?;", "trap ':'; : '", "hooks", "worktree.sh undoes the tree and branch a failing step left half-made (CR6)")
    yield from each("scripts/worktree.sh", '[ ! -e "$dir" ] ||', "true ||", "hooks", "worktree.sh never writes into a folder that exists")
    for sig, rest in (("HUP", "INT TERM"), ("INT", "HUP TERM"), ("TERM", "HUP INT")):
        yield from each("scripts/worktree.sh", "trap 'exit 1' HUP INT TERM", f"trap 'exit 1' {rest}", "hooks", f"worktree.sh undoes its tree when SIG{sig} stops it, whichever shell runs it (R6)")
    yield from each("scripts/worktree.sh", ' "$dir/node_modules/.vite" "$dir/node_modules/.vite-temp"', "", "hooks", "worktree.sh gives Vite caches of the tree's own")
    yield from each("scripts/worktree.sh", "case $name in .vite | .vite-temp | ", "case $name in ", "hooks", "worktree.sh never shares Vite's caches")
    yield from each("scripts/worktree.sh", 'else ln -s "$entry"', 'else cp -R "$entry"', "hooks", "worktree.sh links each package, never copies it")
    yield from each("scripts/worktree.sh", 'sh "$(dirname "$0")/borrow_node_modules.sh" "$dir"', ":", "hooks", "worktree.sh keeps a workspace's @gnoworld links in the new tree")
    yield from each("scripts/worktree.sh", 'rm "${dir:?}/node_modules"\n', "", "hooks", "worktree.sh's root node_modules is a folder of links, not one link")
    for name in ("pnpm-lock.yaml", "pnpm-workspace.yaml", ".pnpmfile.cjs", ".pnpmfile.mjs", ".npmrc", "':(glob)**/package.json'"):
        yield from each("scripts/worktree.sh", f" {name}" if name[0] != "'" else f" {name}", "", "hooks", f"worktree.sh refuses a base whose {name.strip(chr(39))} is not this tree's (security-S5)")
    yield from each("scripts/worktree.sh", '[ -z "$differ" ] ||', "true ||", "hooks", "worktree.sh refuses a base whose package files are not this tree's (security-S5)")
    yield from each("scripts/bench.py", "    if mean > budget:", "    if False:", "hooks", "bench.py fails a bench over its budget")
    yield from each("scripts/bench.py", "    if found is None:", "    if False:", "hooks", "bench.py fails a bench with no budget")
    yield from each("scripts/bench.py", "    if mean is None:", "    if False:", "hooks", "bench.py fails a bench that took no sample (F1213)")
    yield from each("scripts/bench.py", "if not measures:", "if False:", "hooks", "bench.py fails a run with no bench")
    yield from each("scripts/bench.py", "if run.returncode != 0 or not", "if not", "hooks", "bench.py fails a Vitest run that failed")
    yield from each("scripts/bench.py", ' - {m["name"] for m in measures}', ' - {m["name"] for m in measures} - named', "hooks", "bench.py fails a bench the sources name that the report lacks (security-S1)")
    yield from each("scripts/bench.py", "if BENCH_FILE.search(p.name)", "if True", "hooks", "bench.py reads the sources of the benches' files alone (security-S1)")
    yield from each("scripts/bench.py", '{".ts", ".tsx"}', '{".ts"}', "hooks", "bench.py reads a .tsx bench's source too (security-S1)")
    yield from each("scripts/suite_parts.py", "    if old_outside != new_outside:", "    if False:", "hooks", "suite_parts: a change outside every section touches them all")
    yield from each("scripts/suite_parts.py", "            depth += 1", "            depth += 0", "hooks", "suite_parts: a nested if's fi does not end its section")
    yield from each("scripts/suite_parts.py", ' and not re.search(r"\\bfi$", bare)', "", "hooks", "suite_parts: a one-line if at the margin opens no section")
    yield from each("scripts/suite_parts.py", "len(bare.lstrip()) <= depth", "len(bare.lstrip()) < depth", "hooks", "suite_parts: a probe block ends at the next as little indented")
    yield from each("scripts/suite_parts.py", "        if path in changed:", "        if False:", "hooks", "suite_parts: a changed guard file's mutants are asked")
    yield from each("scripts/suite_parts.py", "return touched_here is None or", "return False or", "hooks", "suite_parts: a suite touched outside its sections asks for all its mutants")
    yield from each("scripts/batch_size.py", "if added > LIMIT and not", "if False and not", "hooks", "batch_size fails a merge past its limit")
    yield from each("scripts/batch_size.py", r'"^Batch-size: (\d+) - \S"', '"^Batch-size: (\\d*)"', "hooks", "batch_size wants a reason on the Batch-size line")
    yield from each("scripts/batch_size.py", "any(added <= n and n * 10 <= added * 11 for n in stated)", "any(True for n in stated)", "hooks", "batch_size wants the Batch-size line to give the count (G8)")
    yield from each("scripts/batch_size.py", "added <= n and", "True and", "hooks", "batch_size takes no Batch-size line below the count (G8)")
    yield from each("scripts/batch_size.py", " and n * 10 <= added * 11", "", "hooks", "batch_size takes no Batch-size line far above the count (security-S4)")
    yield from each("scripts/batch_size.py", "n * 10 <= added * 11", "n * 10 < added * 11", "hooks", "batch_size takes a Batch-size line exactly a tenth above the count (security-S4)")
    yield from each("scripts/batch_size.py", "n * 10 <= added * 11", "n * 10 <= added * 20", "hooks", "batch_size takes a Batch-size line a tenth above the count at most (security-S4)")
    yield from each("scripts/batch_size.py", "if added > LIMIT and", "if added >= LIMIT and", "hooks", "batch_size lets a merge of exactly 600 lines pass (G8)")
    yield from each("scripts/batch_size.py", "if added > TIER_ONE:", "if added >= TIER_ONE:", "hooks", "batch_size says the tier-1 limit past 400, not at it (G8)")
    yield from each("scripts/batch_size.py", "    if not path:", "    if False:", "hooks", "batch_size reads a renamed file at its new path (G8)")
    yield from each("scripts/batch_size.py", "|^server/src/testing/", "", "hooks", "batch_size leaves the server's test helpers out (G8)")
    rf = "scripts/repo_files.py"
    yield from each(rf, "if fingerprint(commit) in reviewed", "if False", "hooks", "batch_size counts from the last reviewed commit, harness_mutate --changed from the last pass")
    yield from each(rf, "    if not os.path.exists(PASSES):", "    if False:", "hooks", "last_reviewed reads the passes file")
    yield from each(rf, 'git("rev-list", f"{base}..HEAD")', 'git("rev-list", "--reverse", f"{base}..HEAD")', "hooks", "last_reviewed takes the newest record of the range, not the oldest (F1430)")
    yield from each(rf, 'git("rev-list", f"{base}..HEAD")', 'git("rev-list", "HEAD")', "hooks", "last_reviewed looks only at base..HEAD, not at the history before the base (F1430)")
    yield from each(rf, "                if len(fields) < 2:", "                if False:", "hooks", "last_reviewed refuses a record line with no fingerprint (F1432)")
    yield from each("scripts/batch_size.py", r"(\.test\.tsx?|", "(", "hooks", "batch_size leaves the tests out")
    yield from each("scripts/batch_size.py", "if added > TIER_ONE:", "if False:", "hooks", "batch_size says the tier-1 limit")
    sized = '\t\tstep batch_size # a merge\'s own product code is a small batch (DORA; docs/REVIEW.md)\n\t\tpython3 -I scripts/batch_size.py "$base"\n'
    yield from each("scripts/check.sh", sized, "\t\tif $merge; then\n" + sized.replace("\t\t", "\t\t\t") + "\t\tfi\n", "hooks", "check.sh: --full sizes the batch too, the last merge of a slice being checked by it (security-S2)")
    yield from each("scripts/load.py", "print(round(os.getloadavg()[0] * 10), (os.cpu_count() or 1) * 10)", "print((os.cpu_count() or 1) * 10, round(os.getloadavg()[0] * 10))", "hooks", "load.py prints the load, then the cores")
    yield from each("scripts/load.py", "getloadavg()[0]", "getloadavg()[2]", "hooks", "load.py reads the 1-minute average, not the 15-minute one")
    yield from each("scripts/load.py", "[0] * 10)", "[0] * 1000)", "hooks", "load.py scales the load to tenths")
    yield from each("scripts/load.py", "(os.cpu_count() or 1)", "(os.cpu_count() or 0)", "hooks", "load.py counts one core when it cannot count")
    # A failed Vitest file or journey runs once more, and is logged (F1700).
    for name in ("vitest", "playwright"):
        yield from each("scripts/check.sh", f"retry {name} ", f"false {name} ", "hooks", f"check.sh: a failed {name} run is run once more")
    yield from each("scripts/check.sh", "--outputFile.json=$logs/vitest.json", "--outputFile.jsn=$logs/vitest.json", "hooks", "check.sh asks Vitest for its report")
    yield from each("scripts/check.sh", 'export PLAYWRIGHT_JSON_OUTPUT_NAME="$logs/playwright.json"', ":", "hooks", "check.sh asks Playwright for its report")
    yield from each("scripts/check.sh", "--reporter=dot,json", "--reporter=dot", "hooks", "check.sh asks Playwright for its JSON reporter")
    yield from each("scripts/check.sh", "unsteady_log=.claude/tmp/unsteady.log\n", "unsteady_log=/dev/null\n", "hooks", "check.sh logs an unsteady test in .claude/tmp")
    yield from each("scripts/check.sh", 'unsteady_log=$(dirname "$(readlink node_modules)")/', "unsteady_log=", "hooks", "check.sh logs a staged copy's unsteady test in the repository")
    yield from each("scripts/check.sh", """grep '^unsteady: ' "$logs/$l.log" || :""", ":", "hooks", "check.sh says an unsteady test it ran again")
    un = "scripts/unsteady.py"
    yield from each(un, ".returncode != 0:", ".returncode == 99:", "hooks", "unsteady: a file that fails twice fails the gate")
    yield from each(un, "    if not failed:\n", "    if False:\n", "hooks", "unsteady: a report that names no failed file runs nothing again")
    yield from each(un, "        sys.exit(f\"unsteady: {', '.join(files)} passed the second time, but", "        print(f\"unsteady: {', '.join(files)} passed the second time, but", "hooks", "unsteady: a log that cannot be written fails the gate")
    yield from each(un, "sorted(failed.items())", "[]", "hooks", "unsteady: logs each file that failed")
    yield from each(un, 'if r["status"] == "failed"', 'if r["status"] != "failed"', "hooks", "unsteady: Vitest's failed files only")
    yield from each(un, 'if not spec["ok"]:', 'if spec["ok"]:', "hooks", "unsteady: Playwright's failed specs only")
    yield from each(un, "re.escape}", "str}", "hooks", "unsteady: Playwright is given a file's name as a pattern")
    yield from each(un, "tenths / 10", "tenths", "hooks", "unsteady: the load is logged in whole units")
    yield from each(un, "cores // 10", "cores", "hooks", "unsteady: the cores are logged as cores")
    yield from each(un, "    if besides:\n", "    if False:\n", "hooks", "unsteady: a run with more than failed files refuses (R1)")
    yield from each(un, 'if UNHANDLED.search(output) else', "if False else", "hooks", "unsteady: an unhandled error of Vitest refuses (R1)")
    yield from each(un, "if not names]", "if names]", "hooks", "unsteady: a Vitest file that failed with no failed test refuses (R1, R3)")
    yield from each(un, 'if report["errors"] else', "if False else", "hooks", "unsteady: Playwright's own errors refuse (R1)")
    yield from each("scripts/check.sh", "E2E_PORT=$(free_ports 3)", "E2E_PORT=$(free_ports 3 || :)", "hooks", "check.sh fails the journeys' lane when free_ports fails (R2)")
    yield from each("scripts/check.sh", "port=$(free_ports 1)", "port=$(free_ports 1 || :)", "hooks", "check.sh fails the pictures' lane when free_ports fails (R2)")
    # The real tools' reports and console (probe.py's unsteady_real): the stubs print the words these read as they were written.
    yield from each(un, 'r"Vitest caught', 'r"Vitest caugt', "probe", "unsteady: Vitest's unhandled error is read as Vitest prints it (R1)")
    yield from each(un, 'if not names]', 'if names]', "probe", "unsteady: a real Vitest file that did not load refuses (R3)")
    yield from each(un, 'report["errors"]', 'report["errorz"]', "probe", "unsteady: Playwright's real report holds its errors under errors (R1)")
    yield from each(un, 'titles + ([child["title"]] if', 'titles + ([] if', "probe", "unsteady: a failed test of a nested describe is named by its titles (R4)")
    yield from each(un, 'os.path.join(root, spec["file"])', 'spec["file"]', "probe", "unsteady: a Playwright file is read from its testDir (R4)")
    yield from each("scripts/check.sh", '>"$logs/vitest.out" 2>&1', '>"$logs/vitest.out"', "hooks", "check.sh gives unsteady.py Vitest's stderr, where it prints an unhandled error (R1)")
    yield from each("scripts/check.sh", '\tcat "$output"\n', "", "hooks", "check.sh shows the first run's console of a refused retry (R1)")
    yield from each("scripts/check_docs.py", ' elif AGENT_RULE not in " ".join(p.read_text().split()):', " elif False:", "hooks", "check_docs wants each agent's brief to say the git-index rule (G12)")
    yield from each("scripts/check_docs.py", "        if not p.is_file():", "        if False:", "hooks", "check_docs wants each agent's brief to exist (CR2)")
    yield from each("scripts/check_docs.py", ' | {p.relative_to(root).as_posix() for p in root.glob(".claude/agents/*.md")}', "", "hooks", "check_docs reads an added agent's brief too (CR2)")
    yield from each("scripts/check_docs.py", '{f".claude/agents/{name}.md" for name in AGENTS} | ', "", "hooks", "check_docs names the four agent files (CR2)")
    yield from each("scripts/check_docs.py", 'AGENT_RULE = "Never run', 'AGENT_RULE = "run', "hooks", "check_docs wants the rule's full sentence, from its Never (CR2)")
    yield from each("scripts/check_docs.py", "not CARD_ITEM.search(claude.read_text())", "False", "hooks", "check_docs wants the review card's item 8 (G12)")
    yield from each("scripts/prove_fix.py", "if subprocess.run(cmd", "if True or subprocess.run(cmd", "hooks", "prove_fix runs the tests on the parent")
    yield from each("scripts/prove_fix.py", "\nRUNS = 3\n", "\nRUNS = 1\n", "hooks", "prove_fix gives a racy test 3 runs on the parent (ca98dda)")
    yield from each("scripts/prove_fix.py", "\nRUNS = 3\n", "\nRUNS = 5\n", "hooks", "prove_fix stops at 3 runs on the parent")
    yield from each("scripts/prove_fix.py", "                    break\n", "                    continue\n", "hooks", "prove_fix stops running at the first failure")
    yield from each("scripts/prove_fix.py", "            else:\n                return None\n", "            else:\n                pass\n", "hooks", "prove_fix refuses a test that passes all its runs")
    yield from each("scripts/prove_fix.py", "took = max(took, n)", "took = RUNS", "hooks", "prove_fix says how many runs it took")
    yield from each("scripts/prove_fix.py", 're.search(r"^No-test: \\S", message, re.M)', "True", "hooks", "prove_fix wants a reason for no test")
    yield from each("scripts/prove_fix.py", r"|\.spec\.ts", "", "hooks", "prove_fix takes a journey for a fix's test (F126)")
    yield from each("scripts/prove_fix.py", """    out += [(".", f"{PLAYWRIGHT} --pass-with-no-tests -c {config} {' '.join(files)}") for config, files in journeys.items()]\n""", "", "hooks", "prove_fix runs a fix's journeys before it (F126)")
    yield from each("scripts/prove_fix.py", "TEST.search(f) or f.startswith(JOURNEYS) for f in product", "TEST.search(f) for f in product", "hooks", "prove_fix counts the journeys' helpers as tests")
    yield from each("scripts/prove_fix.py", "--pass-with-no-tests ", "", "hooks", "prove_fix counts no journey found as passing")
    yield from each("scripts/prove_fix.py", "--passWithNoTests ", "", "hooks", "prove_fix counts no Vitest test found as passing")
    yield from each("scripts/prove_fix.py", '"app/tests/stories/": "app/playwright.stories.config.ts", ', "", "hooks", "prove_fix runs a stories journey under its config")
    yield from each("scripts/prove_fix.py", "    if all(TEST.search(f) or f.startswith(JOURNEYS) for f in product):", "    if True:", "hooks", "prove_fix checks product fixes")
    yield from each("scripts/prove_fix.py", "    if all(TEST.search(f) or f.startswith(JOURNEYS) for f in product):", "    if not product:", "hooks", "prove_fix leaves a fix of tests alone")
    yield from each("scripts/prove_fix.py", '"--diff-filter=AMDT"', '"--diff-filter=AM"', "hooks", "prove_fix counts deleted code (F253)")
    yield from each("scripts/prove_fix.py", " and f in left]", "]", "hooks", "prove_fix runs only the tests a fix leaves (F253)")
    yield from each("scripts/prove_fix.py", " and f not in harness]", "]", "hooks", "prove_fix leaves a fix of a harness file under app/ to harness_mutate")
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
    yield from each(ci, "path: ${{ env.GNO_TOOLCHAIN }}", "path: ~/.cache/gnoworld-tools", "hooks", "the CI keeps no cache of verdicts")
    yield from each(ci, "      - name: The full gate\n", "      - name: The full gate\n        continue-on-error: true\n", "hooks", "CI lets no step fail")
    yield from each(ci, "      - name: gitleaks", "      - if: false\n        name: gitleaks", "hooks", "CI skips no step")
    yield from each(ci, "\n  push:\n", "\n  pull_request_target:\n  push:\n", "hooks", "CI runs on a push only")
    yield from each(ci, "persist-credentials: false", "persist-credentials: true", "hooks", "CI drops its token")
    yield from each(ci, "fetch-depth: 0", "fetch-depth: 1", "hooks", "CI fetches main")
    yield from each(ci, "install --with-deps --only-shell chromium", "--version", "hooks", "CI installs the journeys' browser")
    yield from each(ci, "GNO_COMMIT: 07e44776c26187830b7dcbd2454991b5a1960378", "GNO_COMMIT: master", "hooks", "CI pins gno")
    # The app's step and its package guard (F080), which the step-dropping pattern below misses.
    yield from each("scripts/check.sh", "installed=$(packages)\n", "", "hooks", "check.sh snapshots the package files before the build")
    yield from each("scripts/check.sh", " app/package.json pnpm-lock.yaml | cksum", " | cksum", "hooks", "check.sh's package guard reads every package file")
    yield from each("scripts/check.sh", "node app/node_modules/@playwright/test/cli.js test -c", ": node app/node_modules/@playwright/test/cli.js test -c", "hooks", "check.sh walks the app's journeys")
    yield from each("scripts/check.sh", "playwright.stories.config.ts --reporter=dot\n", "playwright.stories.config.ts --reporter=dot || true\n", "hooks", "check.sh lets the stories fail it")
    # The lanes and the scope of a fast run (Alexis, 2026-10-25: a check's cost follows the change).
    for find, replace, label in (
        ("\t\t*) all=true ;;", "\t\t*) ;;", "a path of no known area runs everything"),
        ("$all && ts=true app=true gno=true related=false", ":", "no change runs everything"),
        ("server/src/*) ts=true related=false ;;", "server/src/*) ts=true ;;", "a server change runs every test"),
        ('"$@" &&\n\t\t\tgit -c core.quotePath=false ls-files', '"$@"\n\t\t\tgit -c core.quotePath=false ls-files', "a git that cannot list the change fails the gate"),
        ("--no-renames --name-only HEAD", "--name-only HEAD", "a rename keeps where it came from"),
        ("--no-renames --name-only HEAD --", "--no-renames --name-only --", "what is staged counts"),
        ("\t\tgno/*) gno=true ;;", "\t\tgno/*) gno=true; break ;;", "two areas at once run both"),
        ("elif ! $full; then", "elif true; then", "--full is never scoped"),
        ("':!node_modules'", "':!nothing'", "a linked node_modules is no change"),
        ("packages/ui/src/*) ts=true app=true related=false ;;", "packages/ui/src/*) ts=true app=true ;;", "a change outside Vitest's graph runs every test"),
        ('if ! $full && [ -z "$tested" ]; then', 'if ! $full && true; then', "a repository reads its change from git, never GATE_CHANGED"),
        ("changed=${GATE_CHANGED:-} related=false", "changed=${GATE_CHANGED:-}", "outside a repository, every test"),
        ("case $path in docs/* | adr/* | *.md) continue", "case $path in docs/nothing) continue", "prose in pre-commit's list is no change"),
        ("\t$code || all=true", "\t:", "prose alone runs everything"),
        ("if ! $full && [ -z \"$tested\" ]; then", "if [ -z \"$tested\" ]; then", "--full in a copy is never scoped"),
        ("$all || $app || budget=30", ":", "a scoped run has the lower budget"),
        ("$all || $app || budget=30", "$all || budget=30", "a run that builds the app has the budget of everything"),
        ('[ "${GATE_BUDGET:-$budget}" -lt "$budget" ] 2>/dev/null &&', '[ -n "${GATE_BUDGET:-}" ] &&', "GATE_BUDGET never raises the budget"),
        ('[ "$took" -gt "$budget" ]', '[ "$took" -gt 99999 ]', "the fast gate fails past its budget"),
        ("$related && tests_scope=", ": && tests_scope=", "a scoped run runs the related tests"),
        ('|| failed="$failed $l"', "|| :", "a failed lane fails the gate"),
        ('\t\tcat "$logs/$l.log" >&2\n', "\n", "a failed lane's output is shown"),
        ('\t[ -z "$failed" ]\n}', "\t:\n}", "finish fails when a lane did"),
        ("\t$ts || return 0\n\tstep typecheck", "\tstep typecheck", "types only for a TypeScript change"),
        ("\t$ts || return 0\n\tstep ergo", "\tstep ergo", "tests only for a TypeScript change"),
        ("\t$gno || return 0", "\t:", "gno only for a gno change"),
        ("\t$app || return 0", "\t:", "the journeys only for an app change"),
        ("\t$all || return 0 # the hooks'", "\t: # the hooks'", "the hooks' tests only for everything"),
        ('harness --quiet "$base" && return 0', 'true && return 0', "--full mutates a changed harness"),
        ("\tfinish $($product && echo stories) history || {\n", "\t: || {\n", "--full fails when the stories or the history lane did"),
        ("*) product=true ;; esac", "*) ;; esac", "--merge judges the product for any path it cannot place"),
        ("\t\tSTORIES_PORT=$port node app/node_modules/@playwright/test/cli.js test -c app/playwright.stories.config.ts", "\t\tnode app/node_modules/@playwright/test/cli.js test -c app/playwright.stories.config.ts", "the stories' walk takes a free port of its own"),
        ("\t\tproduct=false\n", "", "--merge skips the product's lanes with no product code"),
        ('changes=$(git -c core.quotePath=false diff --no-renames --name-only', 'changes=$(git -c core.quotePath=false diff --name-only', "--merge reads product code renamed away as a change of the product"),
        ('-- && git -c core.quotePath=false ls-files --others --exclude-standard)', '--)', "--merge reads an untracked product file as a change of the product"),
        ("'' | docs/* | adr/*", "'' | docs* | adr/*", "--merge reads a folder named like docs as product"),
        ("\t\tif $product; then\n\t\t\tstep prove_fix", "\t\tif true; then\n\t\t\tstep prove_fix", "--merge skips prove_fix with no product code"),
        ('\t\t! parses "$cache" || cp "$cache" "$own"\n', "", "StrykerJS starts from the cache every tree shares"),
        ('\t\t! parses "$cache" || cp', '\t\tcp', "StrykerJS starts from no cache cut short"),
        ('\t\t! parses "$own" || { cp', '\t\t{ cp', "StrykerJS's file goes back to the cache only whole"),
        ('mv -f "$cache.$$" "$cache"; }', ': ; }', "StrykerJS's verdicts reach the cache every tree shares"),
        ('|| stryker=$?\n', '\n', "StrykerJS's verdicts reach the cache when it found survivors"),
        ('\t\t[ "$stryker" = 0 ]\n', '\n', "the coverage lane fails when StrykerJS did"),
        ("\tfinish $($product && echo coverage) harness\n", "\t:\n", "--full fails when the coverage or the harness lane did"),
        ("\t\texit 1\n\t}\n\t! $product || start coverage", "\t\t:\n\t}\n\t! $product || start coverage", "--full stops before the coverage and the harness after a first-phase failure (C.5)"),
        ('\t\techo "check.sh: the coverage and harness lanes did not run', '\t\t: "check.sh: the coverage and harness lanes did not run', "--full says which lanes did not run (C.5)"),
        (
            "\tstart history\n\tfinish $($product && echo stories) history || {\n",
            "\tstart history\n\tstart coverage\n\tfinish $($product && echo stories) history || {\n",
            "the stories run before the coverage and the harness lanes (F815)",
        ),
        (
            "\t! $product || start stories\n\tstart history\n\tfinish $($product && echo stories) history || {\n",
            "\t! $product || start stories\n\tfinish stories\n\tstart history\n\tfinish history || {\n",
            "the stories run beside the history lane",
        ),
        ("\tfinish $($product && echo coverage) harness\n", "\tfinish $($product && echo coverage) harness || true\n", "--full fails when the coverage or the harness lane alone did"),
        (
            "load_start=$(python3 -I scripts/load.py)\nstart ts\nstart types\nstart tests\nstart gno\nstart docs\nstart pictures\nfinish ts types tests gno docs pictures\n",
            "start ts\nstart types\nstart tests\nstart gno\nstart docs\nstart pictures\nfinish ts types tests gno docs pictures\nload_start=$(python3 -I scripts/load.py)\n",
            "the load is read as the lanes start (G3)",
        ),
        ("\t\tpython3 -I scripts/probe.py\n", "\t\tpython3 -I scripts/probe.py || :\n", "--full fails when the probe does (G2)"),
        ("\t\tpython3 -I scripts/bench.py\n", "\t\tpython3 -I scripts/bench.py || :\n", "--full fails when a bench passes its budget (G2)"),
        ('\t\tpython3 -I scripts/batch_size.py "$base"\n', '\t\tpython3 -I scripts/batch_size.py "$base" || :\n', "--merge and --full fail when the batch is too large (G2)"),
        ("ts=true app=true tokens=true related=false ;;", "ts=true app=true related=false ;;", "a change of tokens.css compares the tokens story's pictures (F1190)"),
        ("\t$tokens || return 0\n\tstep pictures", "\tstep pictures", "the tokens pictures only for a change of tokens.css (F1190)"),
        ("start docs\nstart pictures\n", "start docs\n", "the tokens pictures lane starts (F1190)"),
        ("finish ts types tests gno docs pictures\n", "finish ts types tests gno docs\n", "a failed tokens comparison fails the gate (F1190)"),
        ("STORIES_PORT=$port PICTURES_OF=tokens-- node", "PICTURES_OF=tokens-- node", "the tokens pictures get a free port of their own (F1190)"),
        ("STORIES_OUT=\"$logs/storybook\" STORIES_PORT", "STORIES_PORT", "the tokens pictures build Storybook in the run's own folder (F1190)"),
        ("STORIES_PORT=$port PICTURES_OF=tokens-- node", "STORIES_PORT=$port node", "the tokens pictures compare that story alone (F1190)"),
        ("--reporter=dot pictures\n", "--reporter=dot pictures || :\n", "the tokens pictures failing fails the lane (F1190)"),
        (" PICTURES_OF STORIES_PORT STORIES_OUT #", " #", "the environment narrows no stories' walk (F1190)"),
        ("else:\n    sys.exit(f\"check.sh: no run of {sys.argv[1]} free ports in 200 tries\")' \"$1\"", "else:\n    pass' \"$1\"", "free_ports fails when it finds no free ports (CR8)"),
        ("    except OSError:\n        continue\n", "    except OSError:\n        pass\n", "free_ports tries again when a port is taken (CR8)"),
        ("load_end=$(python3 -I scripts/load.py)", "load_end=$load_start", "the end reading is read at the end (CR10)"),
        ("load=${load_start% *}", "load=$(python3 -I scripts/load.py | cut -d' ' -f1)", "a machine its own lanes loaded is no excuse (security-S3)"),
        ("cores=${load_start#* }", "cores=0", "the cores a busy machine is judged by are the ones counted (C.8)"),
        ("\tif $full; then\n\t\tstep compiled\n", "\tif false; then\n\t\tstep compiled\n", "--full runs the compiled project's render counts (F1350)"),
        ('run coverage "--maxWorkers=$half"', "run coverage", "--full caps Vitest's coverage at half the machine (F777)"),
        ('run mutate "--concurrency $half --', 'run mutate "--', "--full caps StrykerJS at half the machine (F777)"),
        ("\tstart probe\n\tfinish probe\n", "\tstart probe\n", "probe.py runs alone, before the full lanes"),
        ("\t! $merge || full=false", "\t:", "--merge records no full gate"),
        ("\tif $merging; then\n", "\tif false; then\n", "a merge commit has no time budget (Alexis, 2026-10-28)"),
        ("\tif git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then merging=true; fi\n", '\tif [ -e "$(git rev-parse --git-path MERGE_HEAD)" ]; then merging=true; fi\n', "a MERGE_HEAD git cannot read is no merge, the budget holds"),
        ("\tif git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then merging=true; fi\n", "\t:\n", "a merge in progress, in a repository, has no time budget"),
        ('elif [ "${GATE_MERGE:-}" = 1 ]; then', "elif true; then", "a staged copy is a merge only when pre-commit says so"),
        ("merging=false\nif git rev-parse --git-dir", 'merging=false\n[ "${GATE_MERGE:-}" != 1 ] || merging=true\nif git rev-parse --git-dir', "a caller's GATE_MERGE switches no budget off in a repository"),
        ('mkdir -p "$(dirname "$unsteady_log")" && printf \'%s\\tgate', 'true || printf \'%s\\tgate', "a run past its budget is logged for /pre-merge (F2070)"),
        ('>>"$unsteady_log" || {', '>>"$unsteady_log" || true || {', "a pass past the budget that cannot be logged fails (F2070)"),
        ("\t\t\texit 1\n\t\t}\n\tfi\nfi\n", "\t\t\texit 1\n\t\t}\n\t\texit 1\n\tfi\nfi\n", "a run past its budget that passed passes (Alexis, 2026-10-30)"),
        ('\t\t\t"$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${slowest%% *}" "$((load / 10))" "$((load % 10))" "$((end / 10))"', '\t\t\t"$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${slowest%% *}" "$((load / 10))" "$((load % 10))" "$((load / 10))"', "the log of a busy machine's pass holds the end load (F2070)"),
        ("\texport E2E_PORT\n", "\n", "the journeys get a free port of their own"),
        ('[ "${1:-}" = "--merge" ] && full=true merge=true', '[ "${1:-}" = "--merge" ] && full=true', "--merge judges the merge's own harness mutants"),
        ('[ "${1:-}" = "--merge" ] && full=true merge=true', '[ "${1:-}" = "--merge" ] && merge=true', "--merge runs the full gate's steps"),
        ("python3 -I scripts/harness_mutate.py\n", "python3 -I scripts/harness_mutate.py --changed \"$base\"\n", "--full judges every harness mutant"),
    ):
        yield from each("scripts/check.sh", find, replace, "hooks", f"check.sh: {label}")
    # The gate: each step dropped.
    yield from lines("scripts/check.sh", r"^(\s*)((?:run |python3 -I |sh scripts/|gitleaks |go vet |go run |\(cd gno |\$full \|\| run ).*)$", r"\1:", "hooks", "check.sh drops")
    yield from scoping_mutants()
    yield from journeys_more_mutants()
    yield from checks_mutants()
    yield from stryker_mutants()


def sections(path, test):
    """The sections of `test` that read `path`: one string, or one per suite."""
    only = SECTIONS[path]
    return only[test] if isinstance(only, dict) else only


def run(tree, test, only=""):
    """A test's exit code in the worktree `tree`; `only` names its sections, empty for all of them."""
    env = {**os.environ, "ONLY": only}
    return subprocess.run(TESTS[test], cwd=tree, env=env, capture_output=True, text=True, timeout=600).returncode


def judged(tree, label, path, mutated, test):
    """Whether a test of `tree` fails with this mutant written in it; the file is put back after."""
    target = os.path.join(tree, path)
    with open(target) as f:
        original = f.read()
    with open(target, "w") as f:
        f.write(mutated)
    try:
        killed = run(tree, test, sections(path, test)) != 0
        # A known gap is a mutant no test can notice: a failure here is the load, not the mutant, so it is judged once more.
        return killed and (label not in GAPS or run(tree, test, sections(path, test)) != 0)
    finally:
        with open(target, "w") as f:
            f.write(original)


def proposal(test, path):
    """The smallest change that would make a test notice this guard."""
    if path == "scripts/check.sh":
        return 'add the step to the list in scripts/test_hooks.sh ("check.sh runs every step it promises")'
    if test == "probe":
        return f"plant in scripts/probe.py, block {sections(path, test)}, a fault only this guard catches, or drop the guard if another holds it"
    return f"add to scripts/test_hooks.sh, section {sections(path, test)}, the input this line refuses and the exit code it must give"


def checked():
    """Every mutant, built before any test runs: one that finds no text, or a section its suite lacks, would
    count as killed or stop the run late, so it stops the run at once."""
    named = {"probe": set(re.findall(r'part\("(\w+)"\)', read("scripts/probe.py"))),
             "hooks": set(re.findall(r"^if part (\w+); then$", read("scripts/test_hooks.sh"), re.M))}
    found = list(mutants())
    for label, path, mutated, test in found:
        if mutated is None:
            sys.exit(f"harness_mutate: {label}: nothing to mutate in {path}; this script is out of date")
        try:
            unknown = set(sections(path, test).split(",")) - named[test]
        except KeyError:
            sys.exit(f"harness_mutate: {label}: {path} has no sections for {test} in SECTIONS")
        if unknown:
            sys.exit(f"harness_mutate: {label}: {path}'s sections {', '.join(sorted(unknown))} are none of {test}'s")
    return found


if sys.argv[1:] == ["--dry"]:
    WORKTREE = "."
    checked()
    sys.exit(0)
SUITE_OF = {"hooks": "scripts/test_hooks.sh", "probe": "scripts/probe.py"}
# The verdicts' cache (Alexis, 2026-10-29): a killed mutant whose key holds is not judged again, a survivor always is. The CI
# starts with none, so it judges every mutant on every push.
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "gnoworld-tools", "harness-verdicts.json")
RUNNER = hashlib.sha256((inspect.getsource(run) + inspect.getsource(judged) + json.dumps(TESTS)).encode()).hexdigest()
ALWAYS = ("pnpm-lock.yaml", ".node-version")  # the tools' versions, which no section names


def named_in(context, memo={}):
    """The files of the tree whose name the context holds, the tools' versions with them: what a verdict may depend on.
    A name is a file's own (check.sh), so a short one matches more than it needs to, never less."""
    if context not in memo:
        files = []
        for top, dirs, names in os.walk(WORKTREE):
            dirs[:] = [d for d in dirs if d not in (".git", "node_modules")]
            # A worktree's .git is a file naming its copy, another each run: read, it made every key new.
            files += [os.path.relpath(os.path.join(top, n), WORKTREE) for n in names if n != ".git"]
        memo[context] = sorted(f for f in files if os.path.basename(f) in context or f in ALWAYS)
    return memo[context]


def verdict_key(mutant, digests={}):
    """What a cached verdict stands on: the mutant, the sections that judge it and its suite's text outside them, every
    file of the tree that text names (not the mutated file, the suite or this script, which the rest covers), and the
    runner; a change of any is another key."""
    label, path, mutated, test = mutant
    suite = SUITE_OF[test]
    found, outside = parts(suite, read(suite))
    context = outside + "".join(found.get(name, "") for name in sections(path, test).split(","))
    h = hashlib.sha256(json.dumps([identity(mutant, sections, GAPS), context, RUNNER]).encode())
    for rel in named_in(context):
        if rel not in (path, suite, SELF):
            if rel not in digests:
                with open(os.path.join(WORKTREE, rel), "rb") as f:
                    digests[rel] = hashlib.sha256(f.read()).hexdigest()
            h.update(f"{rel}\0{digests[rel]}\0".encode())
    return h.hexdigest()


def cached_verdicts():
    """The cache as it is on disk; one it cannot read is none."""
    try:
        with open(CACHE) as f:
            held = json.load(f)
        return held if isinstance(held, dict) else {}
    except (OSError, ValueError):
        return {}


def remember(verdicts):
    """Adds these verdicts to the cache on disk, written whole and then moved into place, so a reader never meets half a
    file; a cache it cannot write costs the next run its time, not a verdict."""
    held = {**cached_verdicts(), **verdicts}
    # ponytail: past 50,000 keys only this run's are kept; an age per key if the cache must hold many branches' trees.
    if len(held) > 50_000:
        held = dict(verdicts)
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        with open(CACHE + f".{os.getpid()}", "w") as f:
            json.dump(held, f)
        os.replace(CACHE + f".{os.getpid()}", CACHE)
    except OSError as e:
        print(f"harness_mutate: the verdicts' cache could not be written ({e})")
SELF = os.path.relpath(os.path.abspath(__file__))  # this script, from the repository's root, where it runs


def suite_touched(base, suite):
    """The sections of a suite committed since base that changed; None when either side cannot be read."""
    old, new = (subprocess.run(["git", "show", f"{rev}:{suite}"], capture_output=True, text=True) for rev in (base, "HEAD"))
    return None if old.returncode or new.returncode else touched(suite, old.stdout, new.stdout)


DRY = re.compile(r'^if sys\.argv\[1:\] == \["--dry"\]:$', re.M)  # where this script's definitions end


def identity(mutant, sections_of, gaps):
    """A mutant as its label, file, suite, the sections that judge it, its place in GAPS and the text it writes, hashed:
    two scripts that define it alike agree; a section it cannot name is None, which no readable one equals."""
    label, path, mutated, test = mutant
    try:
        judged_by = sections_of(path, test)
    except Exception:  # base's tables may not know a file this tree's do
        judged_by = None
    return label, path, test, judged_by, label in gaps, None if mutated is None else hashlib.sha256(mutated.encode()).hexdigest()


def defined_at(base):
    """The identities of the mutants base's script defines, built on this tree's files; None when it cannot say (no
    such file, no `--dry` line to cut its definitions at, its code failing here): then every mutant is judged."""
    shown = subprocess.run(["git", "show", f"{base}:{SELF}"], capture_output=True, text=True).stdout
    space = {"__name__": "harness_mutate_at_base", "__file__": os.path.abspath(__file__)}
    try:  # base's own code, whatever it raises: judging every mutant is the safe side
        exec(compile(shown[: DRY.search(shown).start()], f"{base}:{SELF}", "exec"), space)
        space["WORKTREE"] = WORKTREE
        return {identity(m, space["sections"], space["GAPS"]) for m in space["mutants"]()}
    except BaseException as e:  # a sys.exit in base's code too (security-S6)
        print(f"harness_mutate: {base}'s {SELF} cannot say its mutants here ({e!r})")
        return None


def changed_since(base):
    """The files committed since base, a renamed one under both names and a name git would quote as it is; a base git
    cannot compare with stops the run."""
    diff = subprocess.run(["git", "diff", "--no-renames", "--name-only", "-z", base, "HEAD", "--"], capture_output=True, text=True)
    if diff.returncode != 0:
        sys.exit(f"harness_mutate: --changed {base}: git cannot compare with it: {diff.stderr.strip()}")
    return set(diff.stdout.split("\0")) - {""}


changed = None
if sys.argv[1:2] == ["--changed"] and len(sys.argv) == 3:
    base = sys.argv[2]
    if base.startswith("-"):  # git would read it as an option
        sys.exit(f"harness_mutate: --changed {base}: a base is a commit, not an option")
    changed = changed_since(base)
    try:  # the last /pre-merge pass already judged what came before it, as batch_size.py's base is that pass
        since = last_reviewed(base)
    except (OSError, ValueError) as e:  # never fewer mutants than the pass allows: a file that cannot be read or parsed is no pass
        sys.exit(f"harness_mutate: --changed {base}: cannot read the passes file ({e}); fix it first")
    if since != base:
        print(f"harness_mutate: the last /pre-merge pass is {since[:12]}: the guard files changed since it, not since {base}")
        base, changed = since, changed_since(since)
elif sys.argv[1:]:
    sys.exit("usage: harness_mutate.py [--dry | --changed <base>]")
shards = max(1, int(os.environ.get("HARNESS_SHARDS", "4")))
CONTROLS_AT_ONCE = 2  # every tree's suites at once overran their 600 s limit beside the coverage lane (F2138)
failures = []
with contextlib.ExitStack() as stack:
    trees = [stack.enter_context(worktree("HEAD"))]  # one tree to build and select with: the others only if a mutant is left (CR9)
    WORKTREE = trees[0]
    found = checked()
    before = defined_at(base) if changed is not None and SELF in changed else set()
    if before is None:
        print(f"harness_mutate: {SELF} changed since {base}, whose mutants it cannot read: every mutant")
    elif changed is not None:
        total = len(found)
        touched_by = {test: suite_touched(base, suite) for test, suite in SUITE_OF.items() if suite in changed}
        # Its own guards are mutants of a file it changed; the others, those it defines anew or otherwise than base's.
        kept = {id(m) for m in select(found, changed, touched_by, sections)} | {id(m) for m in found if SELF in changed and identity(m, sections, GAPS) not in before}
        found = [m for m in found if id(m) in kept]
        print(f"harness_mutate: the guard files, the suites' sections and the mutants changed since {base}: {len(found)} of {total} mutants")
    if not found:  # nothing to judge: the controls would only cost minutes (8 suite runs, 601 s at load 30 to 50)
        if changed is None:  # a full run with no mutant is a harness that lost them, not a green run
            sys.exit("harness_mutate: no mutant to judge: every mutant is gone from this script")
        print("harness_mutate: no mutant to judge")
        sys.exit(0)
    cache, keys = cached_verdicts(), {id(m): verdict_key(m) for m in found}
    held = [m for m in found if cache.get(keys[id(m)]) == ("survives" if m[0] in GAPS else "killed")]
    for label, path, mutated, test in held:
        print(f"ok    survives (cached): {label}  (known gap: {GAPS[label]})" if label in GAPS else f"ok    killed (cached): {label}")
    found = [m for m in found if m not in held]
    print(f"harness_mutate: {len(held)} verdicts from the cache, {len(found)} to judge")
    if found:
        # No more trees than mutants, and a control only of the suites they run: one mutant took 4 trees and 8 suite runs (C4).
        shards = min(shards, len(found))
        trees += [stack.enter_context(worktree("HEAD")) for _ in range(shards - 1)]
        suites = [test for test in TESTS if any(m[3] == test for m in found)]
        controls = [(tr, te) for tr in trees for te in suites]
        with concurrent.futures.ThreadPoolExecutor(CONTROLS_AT_ONCE) as pool:
            # The control: an untouched copy passes, so a failure means the mutant.
            for (tree, test), code in zip(controls, pool.map(lambda c: run(*c), controls)):
                if code != 0:
                    sys.exit(f"harness_mutate: {test} fails on the untouched copy {tree}; fix that first")
        # Each shard judges every shards-th mutant, one at a time in its own worktree; the verdicts come back in order.
        with concurrent.futures.ThreadPoolExecutor(shards) as pool:
            verdicts = list(pool.map(lambda n: [judged(trees[n], *m) for m in found[n::shards]], range(shards)))
learned = {}
if found:
    for i, (label, path, mutated, test) in enumerate(found):
        killed = verdicts[i % shards][i // shards]
        if killed and label in GAPS:
            print(f"FAIL  killed, yet listed in GAPS: {label}\n      → delete its line from GAPS")
            failures.append(label)
        elif killed:
            print(f"ok    killed: {label}")
            learned[keys[id(found[i])]] = "killed"
        elif label in GAPS:
            print(f"ok    survives: {label}  (known gap: {GAPS[label]})")
            learned[keys[id(found[i])]] = "survives"
        else:
            print(f"FAIL  survives: {label}\n      → {proposal(test, path)}")
            failures.append(label)
    remember(learned)
if failures:
    sys.exit(f"harness_mutate: {len(failures)} guards are not proven by a test")
print("harness_mutate: removing any guard fails a test")
