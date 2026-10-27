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
them all); all of them when this script changed; the full gate judges them all."""
import concurrent.futures
import contextlib
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import worktree
from suite_parts import select, touched

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
    "lint/shared.config.ts": "lint,outside_core,react,ui_lint,app_folders,server", "lint/core.config.ts": "lint",
    "lint/react.config.ts": "react,ui_lint,app_folders", "lint/app.config.ts": "app_folders,react",
    "lint/server.config.ts": "server", "server/tsconfig.json": "server", "scripts/ergo.sh": "ergo",
    # A file both suites guard names each one's sections: a section of the other suite would
    # fail the run as unknown, and count a mutant killed that no test saw.
    "package.json": {"probe": "react_warn,react_tsc,ui_tsc", "hooks": "wiring"}, "pnpm-workspace.yaml": {"hooks": "wiring,regressions"},
    "scripts/check_css.py": "css", "scripts/check_comments.mjs": "comments",
    ".jscpd.json": "jscpd", "tsconfig.base.json": "tsc", "vitest.config.ts": "vitest,vitest_ui,server,core_chromium",
    "app/playwright.stories.config.ts": "tokens_pictures",
    "server/src/testing/toolchain.test.ts": "pinned_node", "server/src/testing/toolchain.ts": "pinned_node",
    "scripts/guard.py": "guard", "scripts/review_pass.py": "review_pass", "scripts/patch_coverage.py": "patch_coverage",
    "scripts/check_docs.py": "check_docs", "scripts/check_regressions.py": "regressions", "scripts/check_migrations.py": "migrations",
    "scripts/harness_mutate.py": "harness_mutate,harness_shards", ".githooks/commit-msg": "commit_msg,installed",
    ".githooks/pre-push": "pre_push,wiring,outside,installed", ".githooks/pre-commit": "pre_commit,wiring,outside,installed",
    ".githooks/records.sh": "outside,installed,wiring", ".githooks/pre-merge-commit": "outside,installed", ".githooks/merge.sh": "installed",
    "scripts/install_hooks.sh": "installed,outside", "scripts/code_changed.sh": "pre_commit,stop_gate", "scripts/borrow_node_modules.sh": "prove_fix,worktree_script",
    "scripts/stop_gate.sh": "stop_gate,wiring", ".claude/settings.json": "wiring", "scripts/test_hooks.sh": "wiring",
    "scripts/check.sh": "wiring,check_hooks,gate_scope,gate_triggers,gate_lanes,gate_times,gate_full", "scripts/mutate.py": "wiring", "scripts/prove_fix.py": "prove_fix",
    "scripts/repo_files.py": "worktrees,regressions", "scripts/worktree.sh": "worktree_script", "scripts/bench.py": "bench", "scripts/suite_parts.py": "mutant_scope,harness_shards", "scripts/batch_size.py": "batch_size", "scripts/load.py": "gate_times", "scripts/audit.py": "audit", "scripts/scan_secrets.sh": "secrets", "scripts/gitleaks-private.toml": "secrets", ".github/workflows/gate.yml": "wiring",
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
    for path in ESLINT:
        text = read(path)
        for m in re.finditer(r'^\s+"?([\w@/-]+)"?:\s*(?=\[?\s*"error"|\[\s*$)', text, re.M):
            at = text.find('"error"', m.end())
            yield f"eslint {m.group(1)} ({path}:{text.count(chr(10), 0, m.start()) + 1})", path, text[:at] + '"off"' + text[at + 7:], "probe"
        if path != SERVER:  # the server's part bans by name and path, with no selector of its own
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
    yield from each("app/playwright.stories.config.ts", "if (!Number.isInteger(port) || port < 1024 || port > 65535)", "if (false)", "probe", "the stories' config refuses a port that is no port")
    # The folder Storybook deletes before it builds (security-S6): the default or a plain absolute folder inside the temporary one.
    for find, replace, label in (
        ("out !== DEFAULT_OUT &&", "false &&", "is checked at all"),
        ('inTmp === "" ||', "", "is not the temporary folder itself"),
        ('inTmp === ".." ||', "", "is not the folder above the temporary one"),
        ("inTmp.startsWith(`..${sep}`)", "false", "is not out of the temporary folder"),
        ("!/^\\/[", "!/^[", "is absolute"),
        ("[\\w@%+=:,./-]", "[\\w@%+=:,./ -]", "has no space"),
        ("[\\w@%+=:,./-]", "[\\w@%+=:,./;-]", "has no shell character"),
    ):
        yield from each("app/playwright.stories.config.ts", find, replace, "probe", f"the stories' config refuses a STORIES_OUT that is not safe to delete: it {label} (security-S6)")
    yield from each("server/src/testing/toolchain.test.ts", "expect(process.version).toBe(pinnedNode());", "expect(process.version).toBeTruthy();", "probe", "the toolchain test holds a run to the pinned Node")
    yield from each("server/src/testing/toolchain.ts", ".trim()", "", "probe", "the pinned Node is read without its newline")
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
    yield from each(mig, '"${" in texts[0] or ', "", "hooks", "check_migrations refuses a migration built from a value")
    yield from each(mig, ' or "\\\\" in texts[0]', "", "hooks", "check_migrations refuses a migration with an escape")
    yield from each(mig, '.returncode != 0:\n    sys.exit(f"check_migrations: {base} is no commit")', '.returncode == 2:\n    sys.exit(f"check_migrations: {base} is no commit")', "hooks", "check_migrations wants a base that is a commit")
    yield from each("scripts/harness_mutate.py", "        if mutated is None:\n", "        if False:\n", "hooks", "harness_mutate --dry sees a stale mutant")
    yield from each("scripts/harness_mutate.py", "        if unknown:\n", "        if False:\n", "hooks", "harness_mutate --dry sees a section its suite lacks")
    yield from each("scripts/harness_mutate.py", '    WORKTREE = "."\n    checked()\n', '    WORKTREE = "."\n', "hooks", "harness_mutate --dry checks the mutants")
    hm = "scripts/harness_mutate.py"
    yield from each(hm, "        found = select" "(found, changed, touched_by, sections)\n", "", "hooks", "harness_mutate --changed judges only the changed guard files and sections")
    yield from each(hm, "for test, suite in SUITE_OF" ".items() if suite in changed}", "for test, suite in SUITE_OF.items() if False}", "hooks", "harness_mutate --changed reads the suites' changed sections")
    yield from each(hm, '"probe": "scripts/' 'probe.py"}', '"probe": "scripts/nowhere.py"}', "hooks", "harness_mutate --changed reads probe.py's changed blocks as test_hooks.sh's (G5)")
    yield from each(hm, 'SUITE_OF = {"hooks": "scripts/test_hooks.sh", ', 'SUITE_OF = {', "hooks", "harness_mutate --changed reads both suites' changed sections (G5)")
    yield from each(hm, "    if diff.returncode != 0:\n", "    if False:\n", "hooks", "harness_mutate --changed wants a base git can compare with")
    yield from each(hm, "killed = verdicts[i % " "shards][i // shards]", "killed = verdicts[0][0]", "hooks", "harness_mutate reads each mutant's own verdict")
    yield from each(hm, "worktree(\"HEAD\")) for _ in range(shards)]", "worktree(\"HEAD\")) for _ in range(1)]", "hooks", "harness_mutate makes a worktree a shard")
    yield from each(hm, "ThreadPoolExecutor(" "shards) as pool", "ThreadPoolExecutor(1) as pool", "hooks", "harness_mutate's shards run side by side")
    yield from each(hm, "    finally:\n        with open(target, \"w\") as f:\n            f.write(original)\n", "    finally:\n        pass\n", "hooks", "harness_mutate puts each mutant's file back")
    yield from each(hm, "            if code " "!= 0:\n", "            if False:\n", "hooks", "harness_mutate stops on a failed control")
    yield from each(hm, "lambda c: run(*c), [(tr, te) for tr in " "trees ", "lambda c: run(*c), [(tr, te) for tr in trees[:1] ", "hooks", "harness_mutate's control runs in every tree")
    yield from each(hm, "elif sys.argv[1:]" ":\n", "elif False:\n", "hooks", "harness_mutate refuses an unknown argument")
    yield from each(hm, "    if sys.argv[2].startswith" "(\"-\"):", "    if False:", "hooks", "harness_mutate --changed takes no option for its base")
    yield from each(hm, "if changed is not None and SELF" " in changed:", "if False:", "hooks", "harness_mutate --changed judges every mutant when it changed itself")
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
    gate_line, rec_line = 'env -u GIT_INDEX_FILE -u GIT_DIR -u GIT_WORK_TREE GATE_CHANGED="$changed" sh "$s/check.sh"\n', 'put "$(code_print "$(git write-tree)")" fast'
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
    yield from each("scripts/stop_gate.sh", '"$state" >.claude/tmp/gate-blocked', '"$state" >/dev/null', "hooks", "stop_gate records the tree it blocked")
    yield from each("scripts/stop_gate.sh", "2>/dev/null || :", "2>/dev/null", "hooks", "stop_gate blocks when it cannot record the tree")
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
    yield from each("scripts/worktree.sh", '[ ! -e "$dir" ] ||', "true ||", "hooks", "worktree.sh never writes into a folder that exists")
    yield from each("scripts/worktree.sh", ' "$dir/node_modules/.vite" "$dir/node_modules/.vite-temp"', "", "hooks", "worktree.sh gives Vite caches of the tree's own")
    yield from each("scripts/worktree.sh", "case $name in .vite | .vite-temp | ", "case $name in ", "hooks", "worktree.sh never shares Vite's caches")
    yield from each("scripts/worktree.sh", 'else ln -s "$entry"', 'else cp -R "$entry"', "hooks", "worktree.sh links each package, never copies it")
    yield from each("scripts/worktree.sh", 'sh "$(dirname "$0")/borrow_node_modules.sh" "$dir"', ":", "hooks", "worktree.sh keeps a workspace's @gnoworld links in the new tree")
    yield from each("scripts/worktree.sh", 'rm "${dir:?}/node_modules"\n', "", "hooks", "worktree.sh's root node_modules is a folder of links, not one link")
    yield from each("scripts/worktree.sh", '\tcp reports/stryker-incremental.json "$dir/reports/"', "\t:", "hooks", "worktree.sh seeds StrykerJS's incremental file")
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
    yield from each("scripts/batch_size.py", "if fingerprint(commit) in reviewed", "if False", "hooks", "batch_size counts from the last reviewed commit")
    yield from each("scripts/batch_size.py", r"(\.test\.tsx?|", "(", "hooks", "batch_size leaves the tests out")
    yield from each("scripts/batch_size.py", "if added > TIER_ONE:", "if False:", "hooks", "batch_size says the tier-1 limit")
    sized = '\t\tstep batch_size # a merge\'s own product code is a small batch (DORA; docs/REVIEW.md)\n\t\tpython3 -I scripts/batch_size.py "$base"\n'
    yield from each("scripts/check.sh", sized, "\t\tif $merge; then\n" + sized.replace("\t\t", "\t\t\t") + "\t\tfi\n", "hooks", "check.sh: --full sizes the batch too, the last merge of a slice being checked by it (security-S2)")
    yield from each("scripts/load.py", "print(round(os.getloadavg()[0] * 10), (os.cpu_count() or 1) * 10)", "print((os.cpu_count() or 1) * 10, round(os.getloadavg()[0] * 10))", "hooks", "load.py prints the load, then the cores")
    yield from each("scripts/load.py", "getloadavg()[0]", "getloadavg()[2]", "hooks", "load.py reads the 1-minute average, not the 15-minute one")
    yield from each("scripts/load.py", "[0] * 10)", "[0] * 1000)", "hooks", "load.py scales the load to tenths")
    yield from each("scripts/load.py", "(os.cpu_count() or 1)", "(os.cpu_count() or 0)", "hooks", "load.py counts one core when it cannot count")
    yield from each("scripts/check_docs.py", ' if AGENT_RULE not in " ".join(p.read_text().split())]', " if False]", "hooks", "check_docs wants each agent's brief to say the git-index rule (G12)")
    yield from each("scripts/check_docs.py", "not CARD_ITEM.search(claude.read_text())", "False", "hooks", "check_docs wants the review card's item 8 (G12)")
    yield from each("scripts/prove_fix.py", "return all(subprocess.run(cmd", "return True or all(subprocess.run(cmd", "hooks", "prove_fix runs the tests on the parent")
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
        ("$all || budget=30", ":", "a scoped run has the lower budget"),
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
        ("\tfinish stories history || {\n", "\t: || {\n", "--full fails when the stories or the history lane did"),
        ("\tfinish coverage harness\n", "\t:\n", "--full fails when the coverage or the harness lane did"),
        ("\t\texit 1\n\t}\n\tstart coverage", "\t\t:\n\t}\n\tstart coverage", "--full stops before the coverage and the harness after a first-phase failure (C.5)"),
        ('\t\techo "check.sh: the coverage and harness lanes did not run', '\t\t: "check.sh: the coverage and harness lanes did not run', "--full says which lanes did not run (C.5)"),
        (
            "\tstart history\n\tfinish stories history || {\n",
            "\tstart history\n\tstart coverage\n\tfinish stories history || {\n",
            "the stories run before the coverage and the harness lanes (F815)",
        ),
        (
            "\tstart stories\n\tstart history\n\tfinish stories history || {\n",
            "\tstart stories\n\tfinish stories\n\tstart history\n\tfinish history || {\n",
            "the stories run beside the history lane",
        ),
        ("\tfinish coverage harness\n", "\tfinish coverage harness || true\n", "--full fails when the coverage or the harness lane alone did"),
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
        ("STORIES_PORT=$(free_ports 1) PICTURES_OF=tokens-- node", "PICTURES_OF=tokens-- node", "the tokens pictures get a free port of their own (F1190)"),
        ("STORIES_OUT=\"$logs/storybook\" STORIES_PORT", "STORIES_PORT", "the tokens pictures build Storybook in the run's own folder (F1190)"),
        ("STORIES_PORT=$(free_ports 1) PICTURES_OF=tokens-- node", "STORIES_PORT=$(free_ports 1) node", "the tokens pictures compare that story alone (F1190)"),
        ("--reporter=dot pictures\n", "--reporter=dot pictures || :\n", "the tokens pictures failing fails the lane (F1190)"),
        (" PICTURES_OF STORIES_PORT STORIES_OUT #", " #", "the environment narrows no stories' walk (F1190)"),
        ('\tif [ "$load" -gt "$cores" ]; then', "\tif false; then", "the fast gate passes past its budget on a machine busy when it started (C.8)"),
        ('\tif [ "$load" -gt "$cores" ]; then', '\tif [ "$load" -ge "$cores" ]; then', "the fast gate fails past its budget on a machine at its cores (C.8)"),
        ("load=${load_start% *}", "load=$(python3 -I scripts/load.py | cut -d' ' -f1)", "a machine its own lanes loaded is no excuse (security-S3)"),
        ("cores=${load_start#* }", "cores=0", "the cores a busy machine is judged by are the ones counted (C.8)"),
        ("; find what grew\" >&2\n\t\texit 1\n", "; find what grew\" >&2\n\t\t:\n", "the fast gate fails past its budget on an idle machine (C.8)"),
        ('run coverage "--maxWorkers=$half"', "run coverage", "--full caps Vitest's coverage at half the machine (F777)"),
        ('run mutate "--concurrency $half"', "run mutate", "--full caps StrykerJS at half the machine (F777)"),
        ("\tstart probe\n\tfinish probe\n", "\tstart probe\n", "probe.py runs alone, before the full lanes"),
        ("\t! $merge || full=false", "\t:", "--merge records no full gate"),
        ("\texport E2E_PORT\n", "\n", "the journeys get a free port of their own"),
        ('[ "${1:-}" = "--merge" ] && full=true merge=true', '[ "${1:-}" = "--merge" ] && full=true', "--merge judges the merge's own harness mutants"),
        ('[ "${1:-}" = "--merge" ] && full=true merge=true', '[ "${1:-}" = "--merge" ] && merge=true', "--merge runs the full gate's steps"),
        ("python3 -I scripts/harness_mutate.py\n", "python3 -I scripts/harness_mutate.py --changed \"$base\"\n", "--full judges every harness mutant"),
    ):
        yield from each("scripts/check.sh", find, replace, "hooks", f"check.sh: {label}")
    # The gate: each step dropped.
    yield from lines("scripts/check.sh", r"^(\s*)((?:run |python3 -I |sh scripts/|gitleaks |go vet |go run |\(cd gno |\$full \|\| run ).*)$", r"\1:", "hooks", "check.sh drops")


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
        return run(tree, test, sections(path, test)) != 0
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
SELF = os.path.relpath(os.path.abspath(__file__))  # this script, from the repository's root, where it runs


def suite_touched(base, suite):
    """The sections of a suite committed since base that changed; None when either side cannot be read."""
    old, new = (subprocess.run(["git", "show", f"{rev}:{suite}"], capture_output=True, text=True) for rev in (base, "HEAD"))
    return None if old.returncode or new.returncode else touched(suite, old.stdout, new.stdout)


changed = None
if sys.argv[1:2] == ["--changed"] and len(sys.argv) == 3:
    if sys.argv[2].startswith("-"):  # git would read it as an option
        sys.exit(f"harness_mutate: --changed {sys.argv[2]}: a base is a commit, not an option")
    diff = subprocess.run(["git", "diff", "--name-only", sys.argv[2], "HEAD", "--"], capture_output=True, text=True)
    if diff.returncode != 0:
        sys.exit(f"harness_mutate: --changed {sys.argv[2]}: git cannot compare with it: {diff.stderr.strip()}")
    changed = set(diff.stdout.splitlines())
elif sys.argv[1:]:
    sys.exit("usage: harness_mutate.py [--dry | --changed <base>]")
shards = max(1, int(os.environ.get("HARNESS_SHARDS", "4")))
failures = []
with contextlib.ExitStack() as stack:
    trees = [stack.enter_context(worktree("HEAD")) for _ in range(shards)]
    WORKTREE = trees[0]
    found = checked()
    if changed is not None and SELF in changed:
        print(f"harness_mutate: {SELF} changed since {sys.argv[2]}: every mutant")
    elif changed is not None:
        total = len(found)
        touched_by = {test: suite_touched(sys.argv[2], suite) for test, suite in SUITE_OF.items() if suite in changed}
        found = select(found, changed, touched_by, sections)
        print(f"harness_mutate: the guard files and the suites' sections changed since {sys.argv[2]}: {len(found)} of {total} mutants")
    with concurrent.futures.ThreadPoolExecutor(shards * len(TESTS)) as pool:
        # The control: an untouched copy passes, so a failure means the mutant.
        for (tree, test), code in zip([(tr, te) for tr in trees for te in TESTS], pool.map(lambda c: run(*c), [(tr, te) for tr in trees for te in TESTS])):
            if code != 0:
                sys.exit(f"harness_mutate: {test} fails on the untouched copy {tree}; fix that first")
    # Each shard judges every shards-th mutant, one at a time in its own worktree; the verdicts come back in order.
    with concurrent.futures.ThreadPoolExecutor(shards) as pool:
        verdicts = list(pool.map(lambda n: [judged(trees[n], *m) for m in found[n::shards]], range(shards)))
    for i, (label, path, mutated, test) in enumerate(found):
        killed = verdicts[i % shards][i // shards]
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
