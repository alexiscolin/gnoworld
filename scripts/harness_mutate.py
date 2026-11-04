"""harness_mutate.py: the harness's own mutation test.

Each guard of the harness (a lint rule or selector, a check in a script, a refusal in a hook, a
limit in a config, a step of the gate) is switched off in turn, in a throwaway worktree of HEAD,
and the harness's tests (probe.py, test_hooks.sh) must then fail. A guard whose removal they do
not notice is a guard nobody checks: the run prints the test to add. GAPS lists the known ones,
with their reason; a gap that gets killed must leave the list. Usage: scripts/harness_mutate.py,
from the repository root; it takes minutes, so the full gate runs it when the harness changes.
`--dry` builds every mutant on the working tree and checks its text and sections, no test run: the fast
gate's check, through test_hooks.sh. The mutants are judged over HARNESS_SHARDS worktrees side by side
(4 by default); `--changed <base>`, a branch's merge check, judges only those that rewrite a line committed since base
(suite_parts.py: a change to a suite's section, or to a guard file's other lines, asks for none) and, when this script
changed, those it defines anew or otherwise than base's (sections a mutant only gained are no other definition); past MOST left to judge after the cache it stops before
judging any, and the way on is the chief's check.sh --full. With no argument, what main requires, every mutant is judged.
A killed mutant whose verdict's key holds (verdict_key, which blank lines do not move) is taken from the cache in
~/.cache/gnoworld-tools, a survivor is always judged again; the CI keeps no cache, so it judges every one."""
import collections
import concurrent.futures
import contextlib
import hashlib
import inspect
import json
import os
import re
import subprocess
import sys
import threading
import types

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import git, last_reviewed, worktree
from suite_parts import code, parts, select

WORKTREE = ""  # the throwaway worktree of HEAD, set by the run below
OFF = "(lambda *a: None)("
GAPS = {  # label -> why no test can notice it yet
    "check.sh: a git that cannot list the change fails the gate #1": "equivalent: under sh, set -e already holds inside the command substitution, so the && only says it",
}

TESTS = {"probe": [sys.executable, "-I", "scripts/probe.py"], "hooks": ["sh", "scripts/test_hooks.sh"]}
# The lint config and its parts: each rule, selector and restricted name lives in one of them.
ESLINT = ["eslint.config.ts", "lint/shared.config.ts", "lint/core.config.ts", "lint/react.config.ts", "lint/app.config.ts", "lint/server.config.ts", "lint/chain.config.ts", "lint/gnoworld.config.ts"]
REACT = "lint/react.config.ts"
APP = "lint/app.config.ts"
SERVER = "lint/server.config.ts"
CHAIN = "lint/chain.config.ts"
RULES = "lint/gnoworld.config.ts"
WORDS = "lint/words.config.ts"
# Each guard's file, and the sections of its test that must notice the guard gone (their ONLY=):
# a mutant runs those alone, not the whole suite. A guard file missing here stops the run.
SECTIONS = {
    "eslint.config.ts": "lint,outside_core,react,ui_lint,app_folders,server,jarvis,service,chain,walls,chain_reads", "app/tsconfig.json": "react_tsc",
    "lint/shared.config.ts": "lint,outside_core,react,ui_lint,app_folders,server,jarvis,service,chain,walls,chain_reads,bench_files", "lint/core.config.ts": "lint",
    "lint/chain.config.ts": "chain,walls", "lint/gnoworld.config.ts": "chain_reads,walls", "lint/words.config.ts": "chain_words",
    "lint/react.config.ts": "react,ui_lint,app_folders", "lint/app.config.ts": "app_folders,react",
    "lint/server.config.ts": "server,jarvis,service,walls", "server/tsconfig.json": "server", "scripts/ergo.sh": "ergo",
    # A file both suites guard names each one's sections: a section of the other suite would
    # fail the run as unknown, and count a mutant killed that no test saw.
    "package.json": {"probe": "react_warn,react_tsc,ui_tsc,jarvis,service,chain", "hooks": "wiring"}, "pnpm-workspace.yaml": {"hooks": "wiring,regressions"},
    "scripts/check_css.py": "css", "scripts/check_comments.mjs": "comments",
    ".jscpd.json": "jscpd", "tsconfig.base.json": "tsc", "vitest.config.ts": {"probe": "vitest,vitest_ui,server,jarvis,core_chromium,pinned_node,bench_files", "hooks": "vitest_stryker"},
    "app/tests/stories/pictures.spec.ts": "tokens_pictures", "app/playwright.stories.config.ts": "tokens_pictures",
    "scripts/guard.py": "guard", "scripts/review_pass.py": "review_pass", "scripts/patch_coverage.py": "patch_coverage",
    "scripts/check_docs.py": "check_docs", "scripts/hidden.py": "check_docs", "scripts/check_regressions.py": "regressions", "scripts/check_migrations.py": "migrations",
    "scripts/harness_mutate.py": "harness_mutate,harness_shards,harness_shards_records,harness_shards_changed,harness_shards_cache,harness_shards_signal,harness_shards_text", ".githooks/commit-msg": "commit_msg,installed,outside",
    ".githooks/pre-push": "pre_push,wiring,outside,installed", ".githooks/pre-commit": "pre_commit,wiring,outside,installed,gate_checks",
    ".githooks/records.sh": "outside,installed,wiring,worktree_script",".githooks/pre-merge-commit": "outside,installed", ".githooks/merge.sh": "installed",
    "scripts/install_hooks.sh": "installed,outside", "scripts/code_changed.sh": "pre_commit,stop_gate", "scripts/borrow_node_modules.sh": "prove_fix,worktree_script,borrow",
    "scripts/stop_gate.sh": "stop_gate,wiring", ".claude/workflows/branch.js": "workflow_branch", "deploy/test.sh": "deploy_lock", ".claude/settings.json": "wiring", "scripts/test_hooks.sh": "wiring,unsigned",
    "scripts/check.sh": "wiring,check_hooks,gate_scope,gate_triggers,gate_lanes,gate_times,gate_full,gate_full_order,gate_full_fail,gate_full_merge,gate_journeys,gate_checks,gate_stryker,merge_lock,gate_limits", "scripts/check_nginx.py": "nginx_check", "scripts/mutate.py": "wiring,mutate", "scripts/prove_fix.py": "prove_fix",
    "scripts/repo_files.py": {"hooks": "check_docs,worktrees,regressions,batch_size,harness_shards,harness_shards_records,harness_shards_changed,harness_shards_cache,harness_shards_signal,harness_shards_text,bench", "probe": "bench_files"}, "scripts/worktree.sh": "worktree_script", "scripts/bench.py": "bench,bench_load", "scripts/suite_parts.py": "mutant_scope,harness_shards,harness_shards_records,harness_shards_changed,harness_shards_cache,harness_shards_signal,harness_shards_text", "scripts/batch_size.py": "batch_size", "scripts/load.py": "gate_times", "scripts/unsteady.py": {"hooks": "gate_lanes", "probe": "unsteady_real"}, "scripts/audit.py": "audit", "scripts/scan_secrets.sh": "secrets", "scripts/gitleaks-private.toml": "secrets", ".github/workflows/gate.yml": "wiring",
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


def journeys_mutants():
    """A commit's gate walks no journey (Alexis, 2026-10-31): it builds the app and starts no browser for it; the merge check and --full walk every journey.
    And Prettier's cache lives in the worktree's .claude/tmp, in a repository only (harness-c, speed-audit.md row 6)."""
    check = "scripts/check.sh"
    for find, replace, label in (
        ("\tif ! $full; then\n\t\t# A commit's gate builds the app", "\tif false; then\n\t\t# A commit's gate builds the app", "walks the journeys at a commit"),
        ("\t\trun build:app\n", "\t\t:\n", "builds the app at a commit"),
        ("\t\treturn 0\n\tfi\n\t# Three free ports", "\tfi\n\t# Three free ports", "stops after the build at a commit"),
        ("\t\tapp/src/*.test.ts | app/src/*.test.tsx) ts=true ;;", "\t\tapp/src/*.test.ts | app/src/*.test.tsx) ts=true app=true ;;", "builds the app for a change of its tests alone"),
        ("\t\tapp/tests/*.ts) ts=true ;;", "\t\tapp/tests/*.ts) ts=true app=true ;;", "builds the app for a change of a journey"),
        ("--reporter=dot,json >", "--reporter=dot,json app/tests/e2e/home.spec.ts >", "gives the merge check's journeys a filter"),
        ('{ $full || [ -z "$tested" ]; } || format_cache=', '{ $full || [ -n "$tested" ]; } || format_cache=', "keeps Prettier's cache in a staged copy and none in a repository"),
        ('{ $full || [ -z "$tested" ]; } || format_cache=', "format_cache=", "keeps Prettier's cache in a staged copy"),
        ('{ $full || [ -z "$tested" ]; } || format_cache=', '[ -z "$tested" ] || format_cache=', "gives --full and --merge Prettier's writable cache"),
        ("--cache --cache-strategy content --cache-location=.claude/tmp/prettier-cache", "--cache-strategy content", "gives Prettier no cache"),
        ("--cache --cache-strategy content --cache-location", "--cache --cache-strategy metadata --cache-location", "keys Prettier's cache by modification time, not content"),
    ):
        yield from each(check, find, replace, "hooks", f"check.sh {label}")


def quick_mutants():
    """check_regressions --quick, per commit (F2579): the hook and the fast gate ask for it, and it lists only what the change touches."""
    yield from each(".githooks/pre-commit", '--quick "$base"', '"$base"', "hooks", "pre-commit lists every test of the base and the tree per commit")
    yield from each("scripts/check.sh", '--quick "$regr_base"', '"$regr_base"', "hooks", "check.sh lists every test of the base and the tree per commit")
    c, h = "scripts/check_regressions.py", "hooks"
    yield from each(c, 'if n.split(" > ", 1)[0] not in touched}', "if True}", h, "check_regressions.py keeps the base's tests of the files the change touches")
    yield from each(c, "or any(SPEC_FILE.search(p) for p in paths)", "or any(not VITEST_FILE.search(p) for p in paths)", h, "check_regressions.py lists the tree whole for a change beside the test files")
    yield from each(c, "or any(SPEC_FILE.search(p) for p in paths)", "or False", h, "check_regressions.py lists only the touched files for a Playwright spec")
    yield from each(c, "os.replace(f.name, path)", "pass", h, "check_regressions.py keeps the base's listing in the cache")
    yield from each(c, 'git("ls-files", "--others", "--exclude-standard").splitlines()', "[]", h, "check_regressions.py lists the touched files without the new ones")
    yield from each(c, "        return set(json.load(f))\n", "        raise OSError\n", h, "check_regressions.py reads the base's listing from the cache")


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
        ('python3 -I "$s/check_regressions.py" --quick "$base"', ":", "runs check_regressions"),
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
        if path not in (SERVER, CHAIN, RULES, "eslint.config.ts"):  # the services', the chain's and our rules' parts ban by name, path and words; the root config composes the parts
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
    for name in ("./server", "./packages/core", "./packages/schemas", "./packages/service", "./packages/chain"):
        yield from each(SERVER, f'"{name}"', '"./nowhere"', "probe", f"eslint the server imports from {name}")
    yield from each(SERVER, '"packages/service/src/net.ts", ', "", "probe", "eslint net.ts calls fetch")
    yield from each(SERVER, '"packages/service/**/*.ts"', '"packages/service/**/*.nothing"', "probe", "eslint reaches the service package's files")
    # The walls (decision-isolation.md, D110 to D112): each folder's bans by name, the service package's zone; the zones'
    # exceptions are the names loop's above.
    yield from each(SERVER, 'banned("jarvis", SERVER)', 'banned("never", SERVER)', "probe", "eslint the server refuses Jarvis by name")
    yield from each(SERVER, 'banned("server", JARVIS)', 'banned("never", JARVIS)', "probe", "eslint Jarvis refuses the server by name")
    listed = 'banned("server|jarvis|app|chain", SERVICE)'
    for name in ("server|", "jarvis|", "app|", "|chain"):
        yield from each(SERVER, listed, listed.replace(name, "", 1), "probe", f"eslint the service package refuses {name.strip('|')} by name")
    yield from each(SERVER, 'target: "./packages/service"', 'target: "./nowhere"', "probe", "eslint the service package reaches no path out of its folder")
    # A module in another extension, and a require made by hand (D123): each pattern and each module name.
    yield from each("eslint.config.ts", '"{app/src,server,jarvis,packages/*/src}/**/*.{mts,cts,js,mjs,cjs,jsx}",', '"nowhere/**",', "probe", "eslint refuses a module of the product in another extension")
    yield from each("eslint.config.ts", '"{server,jarvis,packages/service}/**/*.tsx",', '"nowhere/**",', "probe", "eslint refuses a .tsx under the services")
    yield from each(SERVER, '["node:module", "module"]', '["module"]', "probe", "eslint the services refuse createRequire from node:module")
    yield from each(SERVER, '["node:module", "module"]', '["node:module"]', "probe", "eslint the services refuse createRequire from module")
    yield from each(CHAIN, 'target: "./packages/chain"', 'target: "./nowhere"', "probe", "eslint the chain package reaches no path out of its folder")
    for name in ('"./packages/core"', '"./packages/schemas"', '"./packages/chain"'):
        yield from each(CHAIN, name, '"./nowhere"', "probe", f"eslint the chain package imports from {name}")
    for name in ("server|", "jarvis|", "app|", "|service"):
        yield from each(CHAIN, "server|jarvis|app|service", "server|jarvis|app|service".replace(name, "", 1), "probe", f"eslint the chain package refuses {name.strip('|')} by name")
    # Our own rules (lint/gnoworld.config.ts; decision-onchain.md, D113, D123, D124): a read's words outside the chain package
    # (lint/words.config.ts), each word and each way a string is read; a test helper or the expression sender imported by
    # product code; an import at run time of a computed name; the files each reaches or leaves free.
    for find, replace, label in (
        (r"/abci_(?:query|info)/", "/(?!)/", "an ABCI query"),
        (r"/(?<![A-Za-z])vm(?:\/|%2[Ff])q|\b(?:auth\/accounts|bank\/balances)\//", "/(?!)/", "an ABCI path"),
        (r"|\b(?:auth\/accounts|bank\/balances)\//", "/", "an account's or a balance's ABCI path"),
        (r"(?:\/|%2[Ff])q", r"\/q", "an ABCI path URL-encoded"),
        (r"`(?:\\$\\{\\}|://[^/?#\\s]+)/(?:${ROUTES})(?![\\w-])`", "`(?!)`", "a node's RPC route"),
        (r"(?:\\$\\{\\}|://[^/?#\\s]+)", r"(?:\\$\\{\\})", "a node's RPC route after a full address"),
        (r"(?:\\$\\{\\}|://[^/?#\\s]+)", r"(?:://[^/?#\\s]+)", "a node's RPC route after an interpolation"),
        ('"status|block|', '"block|', "the status route"),
        ("|block|block_results|", "|block_results|", "the block route"),
        (r'`"method"\\s*:\\s*"(?:${ROUTES})"`', "`(?!)`", "a JSON-RPC method in a text"),
        (r"/:26657(?!\d)/", "/(?!)/", "the RPC port"),
        (r"/^\s*(?:(?:query|subscription|mutation)\b[^{]*\{|\{\s*[A-Za-z_]\w*\s*[({])/", "/(?!)/", "a GraphQL operation"),
        ("(?:query|subscription|mutation)", "(?:query|mutation)", "a GraphQL subscription"),
        (r"|\{\s*[A-Za-z_]\w*\s*[({])/", ")/", "GraphQL's shorthand"),
        (r"/^@gnoworld\/chain\/testing(?:\/|$)/", "/(?!)/", "the chain package's fake node"),
        # Each word's every alternative and edge (10h's review, V5): one case of the probe's chain_words block must fail.
        ("abci_(?:query|info)", "abci_(?:info)", "the abci_query query"),
        ("abci_(?:query|info)", "abci_(?:query)", "the abci_info query"),
        (r"vm(?:\/|%2[Ff])q", r"vm(?:%2[Ff])q", "an ABCI path with its slash"),
        (r"vm(?:\/|%2[Ff])q", r"vm(?:\/|%2F)q", "an ABCI path encoded in lower case"),
        (r"auth\/accounts|bank\/balances", r"bank\/balances", "an account's ABCI path"),
        (r"auth\/accounts|bank\/balances", r"auth\/accounts", "a balance's ABCI path"),
        ("(?<![A-Za-z])vm", "vm", "no ABCI path inside a longer word"),
        (r"(?![\\w-])`", "`", "no route inside a longer word"),
        ("(?:query|subscription|mutation)", "(?:subscription|mutation)", "a GraphQL query"),
        ("(?:query|subscription|mutation)", "(?:query|subscription)", "a GraphQL mutation"),
    ):
        yield from each(WORDS, find, replace, "probe", f"eslint our rules refuse {label}")
    for name in ("block_results", "blockchain", "commit", "validators", "genesis", "net_info", "health", "tx", "tx_search",
                 "unconfirmed_txs", "num_unconfirmed_txs", "consensus_state", "dump_consensus_state"):
        yield from each(WORDS, f"|{name}|", "|", "probe", f"eslint our rules refuse the {name} route")
    yield from each(WORDS, '|consensus_params"', '"', "probe", "eslint our rules refuse the consensus_params route")
    for name in ("async", "sync", "commit"):
        kept = "|".join(other for other in ("async", "sync", "commit") if other != name)
        yield from each(WORDS, "broadcast_tx_(?:async|sync|commit)", f"broadcast_tx_(?:{kept})", "probe", f"eslint our rules refuse the broadcast_tx_{name} route")
    for find, replace, label in (
        ('typeof node.value === "string" ? node.value : undefined', "undefined", "a literal's text"),
        ('if (node.type === "TemplateLiteral")', "if (false)", "a template's text"),
        ('.join("${}")', '.join("")', "a template's interpolation"),
        ('if (operator !== "+" ||', "if (true ||", "a sum's text"),
        ('${textOf(left) ?? "${}"}', '${textOf(left) ?? ""}', "a sum's value on its left"),
        ("      Literal: check,\n", "", "the rule's literals"),
        ("      TemplateLiteral: check,\n", "", "the rule's templates"),
        ("      BinaryExpression: check,\n", "", "the rule's sums"),
        ('keyed("jsonrpc") !== undefined && ', "", "a JSON-RPC call's version key"),
        ("if (rpcCall(node)) call(node);", "", "a JSON-RPC call to a node"),
        ('node.callee?.name === "URL" && ', "", "a route given to URL alone"),
        ("if (routed(node)) url(node);", "", "a route given to URL"),
        ('"app/src/**/*.{ts,tsx}", "server/**/*.ts"', '"server/**/*.ts"', "the rules' reach in the app"),
        ('"server/**/*.ts", "jarvis/**/*.ts"', '"jarvis/**/*.ts"', "the rules' reach in the server"),
        ('"jarvis/**/*.ts", "packages/*/src/**/*.{ts,tsx}"', '"packages/*/src/**/*.{ts,tsx}"', "the rules' reach in Jarvis"),
        ('"jarvis/**/*.ts", "packages/*/src/**/*.{ts,tsx}"]', '"jarvis/**/*.ts"]', "the rules' reach in the packages"),
        ('"packages/chain/src/**", ', "", "the chain package's own words free"),
        ('"**/testing/**", ', "", "the fakes free"),
        ("...TESTS, ...BENCHES]", "...BENCHES]", "the tests free"),
        ("...TESTS, ...BENCHES]", "...TESTS]", "the benches free"),
        (r"/(?:^|\/)testing(?:\/|$)/", "/(?!)/", "a test helper imported by product code"),
        ("      ImportDeclaration: check,\n", "", "an import's module"),
        ("      ExportNamedDeclaration: check,\n", "", "a re-export's module"),
        ("      ExportAllDeclaration: check,\n", "", "a whole re-export's module"),
        ("      ImportExpression: check,\n", "", "a run-time import's module"),
        ('type === "ImportNamespaceSpecifier" || ', "", "a namespace import of the expression sender"),
        ('(imported ?? local)?.name === "readEvaluated"', "false", "the expression sender by its name"),
        ('node.type === "ImportExpression" || ', "", "a run-time import of the expression sender's module"),
        (' || node.type === "ExportAllDeclaration"', "", "a whole re-export of the expression sender's module"),
        ('"app/src/lib/chain/rpc.ts", ', "", "evalCall's builder free"),
        ('"server/src/door/names.ts"]', "]", "the door's builder free"),
        ("text === undefined || ", "", "a computed import"),
        (' || text.includes("${}")', "", "a templated import"),
    ):
        yield from each(RULES, find, replace, "probe", f"eslint our rules refuse {label}")
    # The chain package (D112): each browser package by name, the store, the files the block reaches, its tests left free.
    for name in ("react|", "react-dom|", "react-router|", "|@gnoworld/ui"):
        yield from each(CHAIN, name, "", "probe", f"eslint the chain package refuses {name.strip('|')} by name")
    yield from each(CHAIN, '"^zustand(/|$)"', '"^never_zustand(/|$)"', "probe", "eslint the chain package refuses the store by name")
    yield from each(CHAIN, '"packages/chain/**/*.ts"', '"packages/chain/**/*.nothing"', "probe", "eslint reaches the chain package's files")
    yield from each(CHAIN, "ignores: TESTS,", "", "probe", "eslint leaves the chain package's tests free")
    yield from each(SERVER, "...TESTS", "", "probe", "eslint a server test calls the server it started")
    yield from each(SERVER, '"server/**/*.ts"', '"server/**/*.nothing"', "probe", "eslint reaches the server's files")
    # Jarvis's folder (D110): the same rules, its own zone, the files each block reaches.
    yield from each(SERVER, 'target: "./jarvis"', 'target: "./nowhere"', "probe", "eslint Jarvis reaches no path out of its folder")
    yield from each(SERVER, '"./jarvis"', '"./nowhere"', "probe", "eslint Jarvis imports from its own folder")
    yield from each(SERVER, '"jarvis/**/*.ts"', '"jarvis/**/*.nothing"', "probe", "eslint reaches Jarvis's files")
    # A bench is switched off like a test (security-S1): its files, both extensions, and the selector the block holds.
    yield from each("eslint.config.ts", "files: BENCHES,", 'files: ["**/*.nothing"],', "probe", "eslint a bench is never switched off")
    yield from each("lint/shared.config.ts", '"**/*.bench.ts", ', "", "probe", "eslint a .ts bench is never switched off")
    yield from each("lint/shared.config.ts", "|fixme|fails)$/]", "|fixme)$/]", "probe", "eslint refuses a test marked fails, in core too")
    yield from each("lint/shared.config.ts", ', "**/*.bench.tsx"', "", "probe", "eslint a .tsx bench is never switched off")
    yield from each("eslint.config.ts", 'CLASS_AT_END, SWITCHED_OFF] },\n  },\n  {\n    files: ["**/*.css"]', 'CLASS_AT_END] },\n  },\n  {\n    files: ["**/*.css"]', "probe", "eslint the bench block holds the switched-off selector")
    # No state at a module's top (F412): the block for every workspace's source, core's and ui's own lists, the selector's parts.
    both = '"server/src/**/*.ts", "jarvis/src/**/*.ts", "packages/*/src/**/*.{ts,tsx}"'
    yield from each("eslint.config.ts", both, '"jarvis/src/**/*.ts", "packages/*/src/**/*.{ts,tsx}"', "probe", "eslint keeps no state at a server module's top")
    yield from each("eslint.config.ts", both, '"server/src/**/*.ts", "packages/*/src/**/*.{ts,tsx}"', "probe", "eslint keeps no state at a Jarvis module's top")
    yield from each("eslint.config.ts", both, '"server/src/**/*.ts", "jarvis/src/**/*.ts"', "probe", "eslint keeps no state at a workspace module's top")
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
    yield from each("vitest.config.ts", '            "server/src/**/*.test.ts",\n', "", "probe", "the server's tests are found")
    yield from each("vitest.config.ts", '            "jarvis/src/**/*.test.ts",\n', "", "probe", "Jarvis's tests are found")
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
    yield from each("package.json", " && tsc -p jarvis/tsconfig.json", "", "probe", "typecheck covers Jarvis")
    yield from each("package.json", " && tsc -p packages/service/tsconfig.json", "", "probe", "typecheck covers the service package")
    yield from each("package.json", " && tsc -p packages/chain/tsconfig.json", "", "probe", "typecheck covers the chain package")
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
    yield from each(".jscpd.json", '    "**/.git/**",\n', "", "probe", "jscpd reads no file of git's own folder (F129)")
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
    yield from each(hm, "{id(m) for m in select" "(found, lines, read)} | ", "", "hooks", "harness_mutate --changed judges the mutants of the changed lines")
    yield from each(hm, "if changed is not None" " and len(found) > MOST:", "if len(found) > MOST:", "hooks", "harness_mutate with no argument judges every mutant, past the limit of --changed")
    yield from each(hm, "and len(found)" " > MOST:", "and len(found) >= MOST:", "hooks", "harness_mutate --changed judges 100 mutants, and stops at 101")
    yield from each(hm, "and len(found)" " > MOST:", "and len(keys) > MOST:", "hooks", "harness_mutate --changed counts what is left after the cache against its limit")
    yield from each(hm, "and len(found)" " > MOST:", "and False:", "hooks", "harness_mutate --changed stops before judging past its limit")
    yield from each(hm, "MOST = 100" "  # what", "MOST = 101  # what", "hooks", "harness_mutate --changed stops past 100 mutants")
    yield from each(hm, 'collections.Counter(m[1]' ' for m in found)', 'collections.Counter(m[0] for m in found)', "hooks", "harness_mutate --changed says which files its mutants come from")
    yield from each(hm, "context = code(" "outside", "context = (outside", "hooks", "a cached verdict does not stand on a suite's blank lines")
    yield from each(hm, "sha256(code(" "mutated)", "sha256((mutated)", "hooks", "a cached verdict does not stand on its file's blank lines")
    yield from each(hm, '"--no-renames", "--no-color"' ', "--no-ext-diff"', '"--no-renames", "--no-ext-diff"', "hooks", "harness_mutate --changed reads the hunks whatever git's colours")
    yield from each(hm, '"--no-color", "--no-ext-diff"' ', "--text"', '"--no-color", "--text"', "hooks", "harness_mutate --changed reads the hunks whatever git's external diff")
    yield from each(hm, '"--no-ext-diff", "--text"' ', "--no-textconv"', '"--no-ext-diff", "--no-textconv"', "hooks", "harness_mutate --changed reads a file marked -diff as text, not as Binary files differ (F2537)")
    yield from each(hm, '"--text", "--no-textconv"' ", base", '"--text", base', "hooks", "harness_mutate --changed reads the hunks whatever a textconv (F2537)")
    yield from each(hm, "int(hunk.group(2)" " or 1)", "int(hunk.group(2) or 0)", "hooks", "harness_mutate --changed reads a hunk of one line, which git writes with no count")
    yield from each(hm, "if count else {start," " start + 1}", "if count else set()", "hooks", "harness_mutate --changed: a removed line touches the two beside it")
    yield from each(hm, "if count else {start," " start + 1}", "if count else {start}", "hooks", "harness_mutate --changed: a removed line touches the line after it")
    yield from each(hm, "if count else {start," " start + 1}", "if count else {start + 1}", "hooks", "harness_mutate --changed: a removed line touches the line before it")
    yield from each(hm, '"probe": "scripts/' 'probe.py"}', '"probe": "scripts/nowhere.py"}', "hooks", "a cached verdict reads probe.py as test_hooks.sh (G5)")
    # The find is split in two, so that this line holds it nowhere itself: a spot of its own would be a mutant of no guard.
    yield from each(hm, 'SUITE_OF = {"hooks": "scripts/test_hooks.sh' '", ', 'SUITE_OF = {', "hooks", "a cached verdict reads both suites (G5)")
    yield from each(hm, "    if diff.returncode != 0:\n", "    if False:\n", "hooks", "harness_mutate --changed wants a base git can compare with")
    yield from each(hm, "killed = verdicts[i % " "shards][i // shards]", "killed = verdicts[0][0]", "hooks", "harness_mutate reads each mutant's own verdict")
    yield from each(hm, "worktree(\"HEAD\")) for _ in range(shards - 1)]", "worktree(\"HEAD\")) for _ in range(0)]", "hooks", "harness_mutate makes a worktree a shard")
    yield from each(hm, "ThreadPoolExecutor(" "shards) as pool", "ThreadPoolExecutor(1) as pool", "hooks", "harness_mutate's shards run side by side")
    yield from each(hm, "ThreadPoolExecutor(" "CONTROLS_AT_ONCE)", "ThreadPoolExecutor(len(controls))", "hooks", "harness_mutate runs its controls two at a time (F2138)")
    # F2526: a run cut short keeps no verdict. The finds are split so that these lines hold none of them.
    yield from each(hm, "if code < 0 or " "code in CUT_BY_SIGNAL:", "if code in CUT_BY_SIGNAL:", "hooks", "harness_mutate takes a suite ended by a signal for no verdict (F2526)")
    for kept in ("137, 143", "130, 143", "130, 137"):
        yield from each(hm, "CUT_BY_SIGNAL = (" "130, 137, 143)", f"CUT_BY_SIGNAL = ({kept})", "hooks", f"harness_mutate takes the code of a shell's signal for no verdict, without {({'137, 143': '130', '130, 143': '137', '130, 137': '143'})[kept]} (F2526)")
    yield from each(hm, '                if STOP.is_set' '():\n                    raise Cut("the run was stopped")\n                killed = judged(', "                killed = judged(", "hooks", "harness_mutate's shards start no mutant once the run is stopped (F2526)")
    yield from each(hm, '                    if STOP.is_set' '():\n                        raise Cut("the run was stopped")\n                    if killed !=', "                    if killed !=", "hooks", "harness_mutate keeps no verdict once the run is stopped (F2526)")
    yield from each(hm, "                STOP.set" "()\n", "", "hooks", "harness_mutate stops its shards when it is interrupted (F2526)")
    yield from each(hm, "except BaseException " "as e:", "except Cut as e:", "hooks", "harness_mutate stops its shards on an interrupt of its main thread (F2526)")
    yield from each(".claude/workflows/branch.js", "if (!red) return", "if (false) return", "hooks", "the branch loop stops on a red pass that gave no report")
    yield from each(".claude/workflows/branch.js", "return done && done.branch === A.branch ? done : null;", "return done;", "hooks", "the branch loop takes no commit made on another branch")
    yield from each(".claude/workflows/branch.js", "if (notGits(gate.files))", "if (false)", "hooks", "the branch loop takes no list of files but git's")
    yield from each(".claude/workflows/branch.js", "every Bash command begins with", "a Bash command may begin with", "hooks", "the branch loop has every command cd into its worktree")
    yield from each(".claude/workflows/branch.js", "Number them within this branch's range, ${A.ids}, never past it. ", "", "hooks", "the branch loop numbers its findings in its own range")
    yield from each(".claude/workflows/branch.js", '(g.exit === 0 && PASS_LINE.test(g.lastLine || ""))', 'PASS_LINE.test(g.lastLine || "")', "hooks", "the branch loop passes a merge check only on the gate's exit code 0 (F2638)")
    yield from each(".claude/workflows/branch.js", '    "lastLine",\n    "exit",\n', '    "lastLine",\n', "hooks", "the branch loop requires the gate's exit code in its report (F2638)")
    yield from each(".claude/workflows/branch.js", "if (!reviews.every(Boolean)) return", "if (false) return", "hooks", "the branch loop stops on a lens that gave no report")
    yield from each(".claude/workflows/branch.js", "if (open.length)\n", "if (false)\n", "hooks", "the branch loop stops on a finding its fixer left open")
    yield from each(".claude/workflows/branch.js", "if (round === 4)\n", "if (false)\n", "hooks", "the branch loop stops after three rounds")
    yield from each(".claude/workflows/branch.js", 'const TIER1 = [\n  "scripts/",\n  ".githooks/",\n  ".github/",\n  ".claude/",\n  "gno/",\n', "const TIER1 = [\n", "hooks", "the harness and realms bring the security review whatever the arguments")
    for entry in ("app/src/csp.ts", "app/src/cspOrigins.ts", "app/src/cspForms.ts", "app/src/lib/chain/evalCall.ts", "deploy/", "packages/core/src/markdown/", "app/src/lib/adena/", "server/src/login/", "server/src/roles/", "server/roles.json", "app/src/sw/", "server/src/ergo/", "app/src/features/login/", "app/src/lib/api/login.ts", "app/src/lib/ergo/"):
        yield from each(".claude/workflows/branch.js", f'  "{entry}",\n', "", "hooks", f"{entry} brings the security review by itself")
    yield from each(".claude/workflows/branch.js", 'const BASE = A.base || "main";', 'const BASE = "main";', "hooks", "the branch loop reads from the base it is given")
    yield from each(".claude/workflows/branch.js", "let since = BASE;", 'let since = "main";', "hooks", "the branch loop's first round reads since the base")
    yield from each(".claude/workflows/branch.js", '${BASE === "main" ? "" : ` --base ${BASE}`}', "", "hooks", "the merge check runs check.sh against the base it is given (F2531)")
    yield from each(".claude/workflows/branch.js", "(every line that starts with `survivor: `, StrykerJS's and harness_mutate's: ", "(", "hooks", "the merge check reports the survivors check.sh prints, pass or fail")
    yield from each(".claude/workflows/branch.js", "...(gate.files.some(realm)\n", "...(false\n", "hooks", "a realm brings the gno-auditor")
    yield from each(".claude/workflows/branch.js", "id: `${lenses[i][1]}-${round}-${n + 1}`, ", "", "hooks", "the branch loop numbers the findings itself")
    yield from each(".claude/workflows/branch.js", ".filter(([, label]) => !lensesDue || lensesDue.has(label))", "", "hooks", "a second round runs only the lens whose high finding was fixed")
    yield from each("scripts/check.sh", '		survivors "$logs/$l.log"\n', "", "hooks", "check.sh prints the surviving mutants of every lane, pass or fail (F2359, F2409)")
    yield from each("scripts/check.sh", "(Survived|NoCoverage)", "(Survived)", "hooks", "check.sh prints a mutant no test covers as a survivor")
    yield from each("scripts/check.sh", 'if [ "${2:-}" = "--base" ]; then', "if false; then", "hooks", "check.sh --merge --base names the base (F2531)")
    yield from each("scripts/check.sh", 'git merge-base HEAD "$base_ref")', "git merge-base HEAD origin/main)", "hooks", "check.sh reads every lane from the base it is given (F2531)")
    yield from each("scripts/check.sh", '[ -n "$base_ref" ] || {', 'true || {', "hooks", "check.sh --base wants a ref (F2531)")
    yield from each("scripts/check.sh", 'if (changed_list != "" && !(path in changed)) {', "if (0) {", "hooks", "check.sh counts a survivor on a file the branch did not change instead of listing it (F2529)")
    yield from each("scripts/check.sh", "END { if (left) print", "END { if (0) print", "hooks", "check.sh counts the survivors it does not list (F2529)")
    yield from each("scripts/check.sh", '>"$logs/changed" && changed_list="$logs/changed"', '>"$logs/changed"', "hooks", "check.sh lists the survivors of the files the branch changed alone (F2529)")
    yield from each("scripts/check.sh", "	/^FAIL  survives: / {", "	/^FAIL  survives_: / {", "hooks", "check.sh prints a harness mutant that survives as a survivor")
    yield from each("deploy/test.sh", '	if ! mkdir "$lock" 2>/dev/null; then\n', "	if false; then\n", "hooks", "deploy/test.sh refuses to run beside a run holding its project")
    yield from each("deploy/test.sh", '&& pid_alive "$holder"; then\n			missing', '&& false; then\n			missing', "hooks", "deploy/test.sh takes over the lock of a run that is dead, and only of that")
    yield from each("deploy/test.sh", "except PermissionError:\n    pass", "except PermissionError:\n    sys.exit(1)", "hooks", "deploy/test.sh reads a refused signal as a live holder (F2616)")
    yield from each("deploy/test.sh", "lock_dir=$HOME/.cache/gnoworld-tools", "lock_dir=$TMPDIR", "hooks", "deploy/test.sh's lock does not hang on TMPDIR")
    yield from each("deploy/test.sh", "trap 'exit 143' HUP TERM\n", "", "hooks", "deploy/test.sh releases its lock when it is stopped by TERM")
    yield from each("deploy/test.sh", "cleanup() {\n	release\n", "cleanup() {\n", "hooks", "deploy/test.sh releases its lock when it ends")
    yield from each("deploy/test.sh", "grep -E '^gnoworld-demo-mutant-[0-9]+$'", "grep -E '.'", "hooks", "deploy/test.sh names only a mutant project as a leftover")
    yield from each("deploy/test.sh", "grep -vx \"$project\" |", "", "hooks", "deploy/test.sh does not take its own project for a leftover")
    yield from each("deploy/test.sh", 'if [ "${1:-}" != --demo ]; then\n	mkdir -p "$lock_dir"', 'if true; then\n	mkdir -p "$lock_dir"', "hooks", "deploy/test.sh --demo takes no lock")
    # F2528: each guard of the lock the first round left with no proof.
    yield from each("deploy/test.sh", "docker compose ls --all --format json 2>/dev/null |", "true |", "hooks", "deploy/test.sh finds a leftover project through docker compose ls")
    yield from each("deploy/test.sh", "docker network ls --format '{{.Name}}' 2>/dev/null | sed", "true | sed", "hooks", "deploy/test.sh finds a leftover project through its network, which outlives its containers (5f)")
    yield from each("deploy/test.sh", "trap 'exit 130' INT\n", "", "hooks", "deploy/test.sh releases its lock when it is stopped by Ctrl+C")
    yield from each("deploy/test.sh", "trap 'release' EXIT\n", "", "hooks", "deploy/test.sh releases its lock when it refuses on a leftover, before its cleanup trap exists")
    yield from each("deploy/test.sh", ' && [ "$(cat "$lock/pid" 2>/dev/null || true)" = "$$" ]', "", "hooks", "deploy/test.sh releases only a lock that holds its own pid")
    yield from each("deploy/test.sh", 'if [ -z "$holder" ]; then sleep 1;', 'if false; then sleep 1;', "hooks", "deploy/test.sh waits for the run that made a lock to write its pid")
    yield from each("deploy/test.sh", 'mkdir "$lock" 2>/dev/null || missing "another run took the project $project at this very moment"', 'mkdir "$lock" 2>/dev/null || true', "hooks", "deploy/test.sh refuses when another run takes the lock it removed")
    yield from each("scripts/borrow_node_modules.sh", '[ -L "$copy/$m/.bin" ]', "false", "hooks", "a borrowed workspace's linked .bin becomes a folder of its own (F2127)")
    yield from each(hm, "        if rel not in (path, suite," " SELF):", "        if False:", "hooks", "a cached verdict stands on the files its sections name")
    yield from each(hm, "for n in names if n" ' != ".git"]', "for n in names]", "hooks", "a cached verdict never stands on a worktree's .git file")
    yield from each(hm, "remember({keys[id(m)]: " '"killed" if killed else "survives"})', "pass", "hooks", "a verdict is kept as soon as it is judged, for a run cut short")
    yield from each(hm, "os.path.basename(f) in context or f" " in ALWAYS", "os.path.basename(f) in context", "hooks", "a cached verdict stands on the tools' lockfile")
    yield from each(hm, "context = code(outside" " + ", "context = code(", "hooks", "a cached verdict stands on its suite's text outside its sections")
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
    yield from each(hm, 'sys.modules["suite_parts"]' " = theirs", "theirs", "hooks", "harness_mutate --changed reads base's script with base's helper")
    yield from each(hm, "    if before is" " None:", "    if False:", "hooks", "harness_mutate --changed judges every mutant against a base script it cannot read")
    yield from each(hm, "and not alike" "(m, before)}", "and False}", "hooks", "harness_mutate --changed judges the mutants it defines anew or otherwise")
    yield from each(hm, 'set(theirs.split(","))' " <= set(", 'set(theirs.split(",")) == set(', "hooks", "harness_mutate --changed does not ask again for a mutant whose sections only grew")
    yield from each(hm, 'theirs is not None and set(theirs.split(","))' ' <= set(mine[3].split(","))', "theirs is not None", "hooks", "harness_mutate --changed asks again for a mutant that lost a section")
    yield from each(hm, "return label, path, test, judged_by, label" " in gaps, None", "return label, path, test, None, False, None", "hooks", "harness_mutate --changed tells a mutant by its sections and its place in GAPS")
    yield from each(hm, "else hashlib.sha256(" "code(mutated).encode()).hexdigest()", 'else ""', "hooks", "harness_mutate --changed tells a mutant by the text it writes")
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
    yield from each("scripts/check_regressions.py", "chr(n) if n <= 0x10FFFF and HIDDEN.fullmatch(chr(n)) else match.group(0)", "match.group(0)", "hooks", "check_regressions reads a hidden character written <U+XXXX> (D117)")
    yield from each("scripts/check_regressions.py", " and HIDDEN.fullmatch(chr(n))", "", "hooks", "check_regressions reads no other escape (D125, F5280)")
    yield from each("scripts/check_regressions.py", "n <= 0x10FFFF and ", "", "hooks", "check_regressions reads a number past Unicode as text (D125, F5280)")
    yield from each("scripts/check_regressions.py", "([0-9A-F]{4,6})>", "([0-9A-F]{2,6})>", "hooks", "check_regressions reads four hex digits at least (D117)")
    yield from each("scripts/check_regressions.py", "after.get(name, 0) < old", "False", "hooks", "check_regressions floors")
    yield from each("scripts/check_regressions.py", 'status[0] in "MDR"', "False", "hooks", "check_regressions baselines")
    yield from each("scripts/check_regressions.py", 're.fullmatch(rf"{key}: (.+) - \\S.*", line.strip())', 're.search(rf"{key}: (.+?)(?: - |$)", line.strip())', "hooks", "check_regressions wants a reason")
    yield from each("scripts/check_regressions.py", 'rf"{key}: (.+) - \\S.*"', 'rf"{key}: (.+?) - \\S.*"', "hooks", "check_regressions reads an item holding ' - ' (F5000)")
    yield from each("scripts/check_regressions.py", '{m.group(1).strip() for line in lines if (m := re.fullmatch(rf"{key}: (.+) - \\S.*", line.strip()))}',
                    '{m.group(1)[: cut.start()].strip() for line in lines if (m := re.fullmatch(rf"{key}: (.+)", line.strip())) for cut in re.finditer(r" - (?=\\S)", m.group(1)) if cut.start()}',
                    "hooks", "check_regressions names one item a line (F5023)")
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
    yield from each(".githooks/commit-msg", "print(len(sys.stdin.buffer.read().decode()))') || {", "print(len(sys.stdin.buffer.read().decode()))') || true || {", "hooks", "commit-msg refuses a subject python3 cannot count (F5080)")
    yield from each(".githooks/commit-msg", 'if ! printf \'%s\\n\' "$msg" | python3 -I -c "$rule"; then', "if false; then", "hooks", "commit-msg refuses a hidden character in the message (F5085)")
    yield from each(".githooks/commit-msg", 'rule=$(git show :scripts/hidden.py 2>/dev/null) && [ -n "$rule" ] ||', "rule=$(cat scripts/hidden.py) ||", "hooks", "commit-msg reads the message with the staged scripts/hidden.py (F5085)")
    yield from each(".githooks/commit-msg", 'if [ -n "${SANDBOX_RUNTIME:-}" ]; then\n\trule=', "if true; then\n\trule=", "hooks", "commit-msg runs nothing of the repository outside the sandbox (F076, F5085)")
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
    for find, replace, way in (("export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null\n", "export GIT_CONFIG_SYSTEM=/dev/null\n", "a global file"),
                               ("export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null\n", "export GIT_CONFIG_GLOBAL=/dev/null\n", "a system file"),
                               ("unset GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_CONFIG GIT_TEMPLATE_DIR\n", "unset GIT_CONFIG_COUNT GIT_CONFIG GIT_TEMPLATE_DIR\n", "git -c's parameters"),
                               ("unset GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_CONFIG GIT_TEMPLATE_DIR\n", "unset GIT_CONFIG_PARAMETERS GIT_CONFIG GIT_TEMPLATE_DIR\n", "git -c's count"),
                               ("unset GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_CONFIG GIT_TEMPLATE_DIR\n", "unset GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_TEMPLATE_DIR\n", "GIT_CONFIG's file (F5022)"),
                               ("unset GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_CONFIG GIT_TEMPLATE_DIR\n", "unset GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_CONFIG\n", "a template folder (F5022)")):
        yield from each("scripts/test_hooks.sh", find, replace, "hooks", f"the hook suite's throwaway repositories ignore the git config of {way} (F5012)")
    yield from each("scripts/test_hooks.sh", "export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null\n", "GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null\n",
                    "hooks", "the hook suite exports its git config files to git, which a plain assignment never reaches (F5021)")
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
    yield from each("scripts/borrow_node_modules.sh", 'else cp -RP "$m" "$copy/$m"; fi', 'else ln -s "$PWD/$m" "$copy/$m"; fi', "hooks", "a copy reads its own workspace packages (F344)")
    yield from each(".githooks/pre-commit", 'if [ -n "$differ" ]; then', "if false; then", "hooks", "pre-commit refuses a staged harness unlike the working tree")
    yield from each(".githooks/pre-commit", "--name-only -z --", "--name-only --", "hooks", "pre-commit keeps a harness file's name whole")
    yield from each("scripts/guard.py", 'if sub in ("send-pack", "http-push", "receive-pack"):', "if False:", "hooks", "guard refuses send-pack")
    yield from each("scripts/guard.py", 'w.lower().startswith("alias.") or', "False or", "hooks", "guard refuses git aliases")
    yield from each("scripts/guard.py", "not (at_root and alone):", "not at_root:", "hooks", "guard runs worktree.sh alone, its words plain (F5058)")
    yield from each("scripts/guard.py", "not (at_root and alone):", "not alone:", "hooks", "guard runs worktree.sh from the project's root (F5058)")
    yield from each("scripts/guard.py", "( [A-Za-z0-9_./-]+)+", "( [^ ]+)+", "hooks", "guard takes worktree.sh's words plain (F5058)")
    yield from each("scripts/guard.py", "os.path.realpath(cwd) == ROOT", "os.path.realpath(cwd).startswith(ROOT)", "hooks", "guard takes no subfolder of the root for it (F5058)")
    yield from each("scripts/guard.py", "isinstance(cwd, str) and ", "", "hooks", "guard reads an event with no folder (F5058)")
    yield from each("scripts/guard.py", 'return bool(words) and os.path.basename(words[0]) == "worktree.sh"', "return False", "hooks", "guard sees a run of worktree.sh (F5058)")
    yield from each("scripts/guard.py", 'words = [w for w in words[1:] if not w.startswith("-")]', "words = words[1:]", "hooks", "guard sees worktree.sh past a shell's options (F5058)")
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
    yield from each(".claude/settings.json", '        "~/Server/gnoworld-wt/*/.git",\n', "", "hooks", "settings: no command points a worktree's git at another config (F5095)")
    yield from each(".claude/settings.json", '"excludedCommands": ["sh scripts/worktree.sh *"]', '"excludedCommands": ["sh *"]', "hooks", "settings: worktree.sh alone leaves the sandbox (F5058)")
    yield from each(".claude/settings.json", '"Edit(/scripts/worktree.sh)"', '"Edit(/nothing)"', "hooks", "settings: an edit of worktree.sh, which leaves the sandbox, is refused (F5058)")
    yield from each(".claude/settings.json", '"Edit(~/Server/gnoworld-wt/*/.git)"', '"Edit(/nothing)"', "hooks", "settings: no file tool points a worktree's git at another config (F5095)")
    yield from each(".claude/settings.json", '"Edit(~/Server/gnoworld/.git/hooks/**)"', '"Edit(/nothing)"', "hooks", "settings: no file tool writes the main checkout's git hooks (F5095)")
    yield from each(".claude/settings.json", '"Edit(~/Server/gnoworld/scripts/**)"', '"Edit(/nothing)"', "hooks", "settings: no file tool writes the main checkout's scripts (F5095)")
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
    yield from each("scripts/worktree.sh", 'harness --ignore-submodules=all --name-only "$base" && ', "", "hooks", "worktree.sh compares a base's harness and package files with this tree's (security-S5, F5098)")
    yield from each("scripts/worktree.sh", "--ignore-submodules=all ", "", "hooks", "worktree.sh enters no nested repository, whose config would run outside the sandbox (F5097)")
    # Through records.sh's list, the one harness list: each file worktree_script plants is in it.
    for name in (" pnpm-lock.yaml", " pnpm-workspace.yaml", " .pnpmfile.cjs", " .pnpmfile.mjs", " .npmrc", " app/package.json", " .claude ", " scripts "):
        yield from each(".githooks/records.sh", name, " " if name.endswith(" ") else "", "hooks", f"the harness list holds {name.strip()}, which worktree.sh compares (security-S5, F5098)")
    yield from each("scripts/worktree.sh", '[ -z "$differ" ] ||', "true ||", "hooks", "worktree.sh refuses a base whose package files are not this tree's (security-S5)")
    yield from each("scripts/worktree.sh", "export GIT_COMMON_DIR\n", "\n", "hooks", "worktree.sh's git reads this tree's config, never the one a worktree's commondir names (F5097)")
    yield from each("scripts/worktree.sh", 'cd "$gitdir/../.."', 'cd "$gitdir/.."', "hooks", "worktree.sh finds a worktree's common folder two folders above its record (F5097)")
    yield from each("scripts/worktree.sh", '[ -d "$src/.git" ]', '[ -e "$src/.git" ]', "hooks", "worktree.sh tells the main checkout's .git folder from a worktree's .git file (F5097)")
    rev_parse = "$(git rev-parse --path-format=absolute --git-common-dir)"
    yield from each("scripts/worktree.sh", 'GIT_COMMON_DIR=$(cd "$src" && cd "$gitdir/../.." && pwd -P)', f"GIT_COMMON_DIR={rev_parse}", "hooks", "worktree.sh finds a worktree's common folder from its .git, never its commondir (F5097)")
    yield from each("scripts/worktree.sh", "\tGIT_COMMON_DIR=$src/.git\n", f"\tGIT_COMMON_DIR={rev_parse}\n", "hooks", "worktree.sh takes the main checkout's .git folder, never a commondir in it (F5097)")
    yield from each("scripts/worktree.sh", "case $dir in */*) ;; *) dir=$root/$dir ;; esac", ":", "hooks", "worktree.sh takes a bare name for a folder of its root (F5096)")
    yield from each("scripts/worktree.sh", "3:remove) action= ;;\n", "", "hooks", "worktree.sh takes remove and two words for no call")
    yield from each("scripts/borrow_node_modules.sh", 'unlinked "$m" ||', "true ||", "hooks", "borrow_node_modules.sh writes through no link of the copy's tree (F5099)")
    yield from each("scripts/borrow_node_modules.sh", "in */node_modules/.bin) ;;", "in *) ;;", "hooks", "borrow_node_modules.sh copies a linked .bin from a node_modules/.bin alone (F5099)")
    yield from each("scripts/worktree.sh", ' && git diff --name-only "$base" -- CLAUDE.md', "", "hooks", "worktree.sh refuses a base whose CLAUDE.md is not this tree's (F5098)")
    yield from each("scripts/worktree.sh", "&& pwd -P) || parent=", "&& pwd -P)", "hooks", "worktree.sh says why it refuses a folder whose parent does not exist")
    # F5058: it may run outside the sandbox, so it makes and removes the folders of one root alone. The name's letters have no
    # mutant to `[a-z]`: under dash, Linux's sh, that range is ASCII already, so the CI would see it survive.
    yield from each("scripts/worktree.sh", '[ "$parent" = "$root" ] ||', "true ||", "hooks", "worktree.sh makes and removes the folders of its root alone (F5058)")
    yield from each("scripts/worktree.sh", "root=$HOME/Server/gnoworld-wt", "root=$HOME/Server", "hooks", "worktree.sh's root is $HOME/Server/gnoworld-wt (F5058)")
    yield from each("scripts/worktree.sh", "&& pwd -P) || parent=", "&& pwd -L) || parent=", "hooks", "worktree.sh resolves the folder's parent, never through a link (F5058)")
    for char in "._":
        yield from each("scripts/worktree.sh", "*[!abcdefghijklmnopqrstuvwxyz0123456789-]*)", f"*[!{char}abcdefghijklmnopqrstuvwxyz0123456789-]*)", "hooks", f"worktree.sh refuses a {char} in its folder's name (F5058)")
    yield from each("scripts/worktree.sh", "dir=$root/$name\n", "\n", "hooks", "worktree.sh names the folder by its resolved path, so no slash or .. hides a link (F5058)")
    yield from each("scripts/worktree.sh", '[ ! -L "$dir" ] ||', "true ||", "hooks", "worktree.sh refuses a link named as its folder (F5058)")
    yield from each("scripts/worktree.sh", "2:remove) action=remove", "2:*) action=remove", "hooks", "worktree.sh removes on the word remove alone")
    yield from each("scripts/worktree.sh", "src=$(pwd -P)\n", "src=$PWD\n", "hooks", "worktree.sh sees the tree it runs in, entered through a link")
    yield from each("scripts/worktree.sh", 'case $src/ in "$dir"/*)', "case $src/ in -none-)", "hooks", "worktree.sh never removes the tree it runs in")
    yield from each("scripts/worktree.sh", '[ -z "$changes" ] ||', "true ||", "hooks", "worktree.sh removes a clean worktree alone")
    yield from each("scripts/worktree.sh", "status --porcelain --ignore-submodules=all)", "status --porcelain)", "hooks", "worktree.sh's clean check enters no nested repository (security-reviewer, third review)")
    yield from each("scripts/worktree.sh", "GIT_CONFIG_KEY_0=core.hooksPath", "GIT_CONFIG_KEY_0=core.nothing", "hooks", "worktree.sh runs no hook of the common folder (F5095)")
    yield from each("scripts/worktree.sh", "GIT_CONFIG_KEY_1=core.fsmonitor", "GIT_CONFIG_KEY_1=core.nothing", "hooks", "worktree.sh runs no fsmonitor of the common folder (F5095)")
    yield from each("scripts/worktree.sh", "-, which git would read as an option\" >&2; exit 2", "-, which git would read as an option\" >&2; exit 1", "hooks", "worktree.sh refuses a leading dash as a wrong call")
    yield from each("scripts/bench.py", "    if mean > budget:", "    if False:", "hooks", "bench.py fails a bench over its budget")
    yield from each("scripts/bench.py", "    if found is None:", "    if False:", "hooks", "bench.py fails a bench with no budget")
    yield from each("scripts/bench.py", "    if mean is None:", "    if False:", "hooks", "bench.py fails a bench that took no sample (F1213)")
    yield from each("scripts/bench.py", "if not measures:", "if False:", "hooks", "bench.py fails a run with no bench")
    yield from each("scripts/bench.py", "if run.returncode != 0 or not", "if not", "hooks", "bench.py fails a Vitest run that failed")
    yield from each("scripts/bench.py", ' - {m["name"] for m in measures}', ' - {m["name"] for m in measures} - named', "hooks", "bench.py fails a bench the sources name that the report lacks (security-S1)")
    yield from each("scripts/bench.py", "if BENCH_FILE.search(p.name)", "if True", "hooks", "bench.py reads the sources of the benches' files alone (security-S1)")
    yield from each("scripts/bench.py", '{".ts", ".tsx"}', '{".ts"}', "hooks", "bench.py reads a .tsx bench's source too (security-S1)")
    yield from each("scripts/suite_parts.py", "            depth += 1", "            depth += 0", "hooks", "suite_parts: a nested if's fi does not end its section")
    yield from each("scripts/suite_parts.py", ' and not re.search(r"\\bfi$", bare)', "", "hooks", "suite_parts: a one-line if at the margin opens no section")
    yield from each("scripts/suite_parts.py", "len(bare.lstrip()) <= depth", "len(bare.lstrip()) < depth", "hooks", "suite_parts: a probe block ends at the next as little indented")
    yield from each("scripts/suite_parts.py", "return path in changed and (", "return (", "hooks", "suite_parts: a file no change reaches asks for nothing")
    yield from each("scripts/suite_parts.py", "mutated is None or bool(", "bool(", "hooks", "suite_parts: a mutant with no text to place is asked when its file changed")
    yield from each("scripts/suite_parts.py", "mutated) & changed[path])", "mutated))", "hooks", "suite_parts: a changed file asks only for the mutants of its changed lines")
    yield from each("scripts/suite_parts.py", " if line.strip())", ")", "hooks", "suite_parts: a blank line runs nothing")
    yield from each("scripts/suite_parts.py", " or {head, head + 1}", "", "hooks", "suite_parts: a line only added touches the two beside it")
    yield from each("scripts/suite_parts.py", "while tail < shared - head and ", "while tail < shared and ", "hooks", "suite_parts: a line added among its like counts from one end only")
    yield from each("scripts/suite_parts.py", "range(head + 1, len(before) - tail + 1)", "range(head + 1, len(before) + 1)", "hooks", "suite_parts: a mutant's lines end where its text does")
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
    yield from each("scripts/batch_size.py", "|^jarvis/src/testing/", "", "hooks", "batch_size leaves Jarvis's test helpers out (D110)")
    yield from each("scripts/batch_size.py", "|^packages/[^/]+/src/testing/", "", "hooks", "batch_size leaves a package's test helpers out (D112)")
    yield from each("scripts/batch_size.py", "|jarvis/src|", "|", "hooks", "batch_size counts Jarvis's code as product (D110)")
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
    yield from each("scripts/prove_fix.py", "any(commit.startswith(sha) for sha in excuses)", "bool(excuses)", "hooks", "prove_fix excuses a fix by its own sha, not any")
    yield from each("scripts/prove_fix.py", ' - \\S", re.M)\n\n\ndef excused', '", re.M)\n\n\ndef excused', "hooks", "prove_fix wants a reason with a sha's excuse")
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
        ("server/src/* | jarvis/src/* | packages/service/src/*) ts=true related=false ;;", "server/src/* | jarvis/src/* | packages/service/src/*) ts=true ;;", "a server change runs every test"),
        (" | jarvis/src/* | packages/service/src/*)", ")", "a change of Jarvis or the service package is the server's kind (D110, D111)"),
        (" | packages/chain/src/*) ts=true app=true", ") ts=true app=true", "a change of the chain package is core's kind (D112)"),
        ('"$@" &&\n\t\t\tgit -c core.quotePath=false ls-files', '"$@"\n\t\t\tgit -c core.quotePath=false ls-files', "a git that cannot list the change fails the gate"),
        ("--no-renames --name-only HEAD", "--name-only HEAD", "a rename keeps where it came from"),
        ("--no-renames --name-only HEAD --", "--no-renames --name-only --", "what is staged counts"),
        ("\t\tgno/*) gno=true ;;", "\t\tgno/*) gno=true; break ;;", "two areas at once run both"),
        ("elif ! $full; then", "elif true; then", "--full is never scoped"),
        ("':!node_modules'", "':!nothing'", "a linked node_modules is no change"),
        ("packages/chain/src/*) ts=true app=true related=false ;;", "packages/chain/src/*) ts=true app=true ;;", "a change outside Vitest's graph runs every test"),
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
    yield from journeys_mutants()
    yield from quick_mutants()
    yield from checks_mutants()
    yield from stryker_mutants()
    yield from merge_lock_mutants()
    yield from nginx_mutants()
    yield from bench_load_mutants()
    yield from regressions_name_mutants()
    yield from design_mutants()
    yield from mutate_mutants()
    yield from hidden_mutants()


def swaps(path, name, rows):
    """One mutant per occurrence of each (find, replace, label) row, in the hooks' tests, labelled `<name> <label>`."""
    for find, replace, label in rows:
        yield from each(path, find, replace, "hooks", f"{name} {label}")


REGRESSION_ROWS = (  # (find, replace, label) in scripts/check_regressions.py
        ("                entries.append(ref)\n", "                pass\n", "reads a name in an exclusion list as an entry (F2523)"),
        ("        if double or single:", "        if double:", "reads a single-quoted entry"),
        ("            if not (spread and OWN_DEFAULTS.fullmatch(spread)):", "            if False:", "reads a spread of anything but a tool's defaults as an entry"),
        ("            if not (spread and OWN_DEFAULTS.fullmatch(spread)):", "            if True:", "lets the spread of a tool's own defaults stay"),
        ("        if comment:\n            continue", "        if False:\n            continue", "skips a comment in a list (F2623)"),
        ("consts.get(ref.removeprefix(\"...\"), [])", "[]", "reads what a name or a spread holds (F2622)"),
        ("            out[m.group(1)] = list_entries(text, m.end())[0]", "            pass", "reads a const holding a list (F2622)"),
        ("            out[m.group(1)] = [(t.group(2) or t.group(3))[1:-1]]", "            pass", "reads a const holding a string (F2622)"),
        ("for m in SHORTHAND.finditer(text):", "for m in []:", "reads the shorthand { exclude } (F2627)"),
        ("globalIgnores\\(\\s*|", "globalIgnores\\(|", "reads a globalIgnores list on the next line (F2627)"),
        ("(?:ignores|exclude)[\\\"']?", "(?:ignores|exclude)", "reads an exclusion under a quoted key (F2627)"),
        (" and f\"{kind} {e.split(SEP)[0]}\" not in excused", "", "excuses a name's value by the name (F2622)"),
        ("if tail else []), pos", "if False else []), pos", "reads what follows a list (`.concat`)"),
        ("        elif template:\n            entries.append(template)", "        elif template:\n            pass", "reads a template literal as an entry"),
)


def merge_lock_mutants():
    """One merge check at a time, the open-files limit, the test switches dropped (slice-5 harness-c)."""
    c = "scripts/check.sh"
    yield from swaps(c, "check.sh", (
        ('if $merge; then\n\tmkdir -p "${merge_lock%/*}"', 'if false; then\n\tmkdir -p "${merge_lock%/*}"', "--merge takes the machine's lock"),
        ('until mkdir "$merge_lock" 2>/dev/null; do', "while false; do", "--merge waits for a live holder"),
        ("\tlock_held=1\n", "\tlock_held=\n", "--merge frees its lock"),
        ('\t[ -n "$lock_held" ] || return 0\n\tholder=$(cat "$merge_lock/pid" 2>/dev/null || :)\n\tif [ -z "$holder" ] || [ "$holder" = "$$" ]; then rm', '\tif true; then rm', "a run that is interrupted frees the lock whoever holds it"),
        ("\tstarted=$(date +%s) # the wait is not the run's time", "\t: # the wait is the run's time", "--merge's time leaves its wait out"),
        ('if [ -z "$announced" ]; then', "if false; then", "--merge says which worktree it waits for"),
        ("except PermissionError:\n    pass", "except PermissionError:\n    sys.exit(1)", "reads a signal another sandbox refuses as a live holder (F2616)"),
        ('if ! pid_alive "$holder"; then', "if false; then", "takes over the lock of a holder that is gone"),
        ('[ "$status" != 0 ] || [ "${finished:-}" != 1 ] || return 0\n\techo "check.sh: FAILED at', '[ "$status" != 0 ] || [ "${finished:-}" != 1 ] || return 0\n\t: "check.sh: FAILED at', "a failing run ends on its FAILED line (F2638)"),
        ('[ -n "$failed_at" ] || failed_at="$l:', '[ -n "$failed_at" ] || : "$l:', "the FAILED line names the lane and step that failed (F2638)"),
        ("release_lock; say_failed;", "release_lock;", "the FAILED line is printed on every exit path (F2638)"),
        ("ulimit -S -n 10240 2>/dev/null ||", ": ||", "sets the limit of open files"),
        ('[ "$open_files" != 10240 ]', '[ "$open_files" -lt 10240 ]', "lowers a limit of open files above 10240"),
        ('|| echo "check.sh: could not set the limit', '|| : "check.sh: could not set the limit', "says a limit of open files it cannot set"),
        ("unset NGINX_SHA256 NGINX_START_TIMEOUT", "unset NGINX_START_TIMEOUT", "drops NGINX_SHA256"),
        ("unset NGINX_SHA256 NGINX_START_TIMEOUT", "unset NGINX_SHA256", "drops NGINX_START_TIMEOUT"),
        (" BENCH_WAIT_CEILING BENCH_WAIT_STEP #", " BENCH_WAIT_STEP #", "drops BENCH_WAIT_CEILING"),
        (" BENCH_WAIT_CEILING BENCH_WAIT_STEP #", " BENCH_WAIT_CEILING #", "drops BENCH_WAIT_STEP"),
    ))


def nginx_mutants():
    """The merge check proves nginx accepts the image's config and serves each page its own policy (slice-5 harness-c)."""
    c = "scripts/check.sh"
    yield from each(c, "\t\tif $merge; then\n\t\t\tstep nginx", "\t\tif false; then\n\t\t\tstep nginx", "hooks", "check.sh --merge checks nginx")
    n = "scripts/check_nginx.py"
    yield from swaps(n, "check_nginx.py", (
        ("    if actual != want:", "    if False:", "refuses a binary whose checksum is not the pinned one"),
        ("        if test.returncode != 0:", "        if False:", "fails on a config nginx refuses (F2459)"),
        ("        if warnings:\n", "        if False:\n", "fails on a warning"),
        ('    conf = re.sub(r"^(\\s*(?:error|access)_log\\s+)/dev/std\\w+", lambda m: f"{m.group(1)}{where}/nginx.log", conf, flags=re.M)', "    pass", "logs to a file of its own folder"),
        ("                if status != 200:", "                if False:", "fails a page that does not answer 200"),
        ("                elif got[0] == want:", "                elif True:", "fails a page that answers another policy than its own (F2460)"),
        ("                elif got[0] == bare:", "                elif False:", "says the bare policy when a page got it"),
        ("        finally:\n            stop(proc)", "        finally:\n            pass", "stops the nginx it started after a failure"),
        ("            if proc.poll() is not None:", "            if False:", "fails at once on an nginx that died"),
        ("            if time.monotonic() - began > timeout:", "            if False:", "stops waiting for an nginx that never listens"),
        ('forms = [canonical + "/", canonical, "/" + rel]', 'forms = [canonical + "/", canonical]', "asks a page at its index.html address"),
        ('forms = [canonical + "/", canonical, "/" + rel]', 'forms = [canonical, "/" + rel]', "asks a page at its slashed address"),
        ('canonical, forms = "/", ["/", "/index.html"]', 'canonical, forms = "/", ["/"]', "asks the home at /index.html"),
        ('forms = [canonical + "/", canonical, "/" + rel]', 'forms = ["/" + rel]', "asks a page at its slashed and bare addresses"),
        ("        if n == 0:\n            fail(", "        if False:\n            fail(", "fails on a line of the image's config that is gone"),
        ("        if not want:\n", "        if False:\n", "names a page that _headers has no rule for"),
        ("                elif len(got) != 1:", "                elif False:", "fails a page answering two policies"),
        ('    conf = re.sub(r"(\\s)/tmp/(\\w+_temp)\\b", lambda m: f"{m.group(1)}{where}/{m.group(2)}", conf)\n', "", "moves the temporary paths out of /tmp"),
        ('    conf = re.sub(r"^(\\s*pid\\s+)\\S+;", lambda m: f"{m.group(1)}{where}/nginx.pid;", conf, flags=re.M)\n', "", "moves the pid file out of /tmp"),
        ('    conf = re.sub(r"^\\s*auth_basic(_user_file)?\\s+[^;]*;\\n", "", conf, flags=re.M)', "", "serves with no password"),
        ('    return re.sub(r"(proxy_pass\\s+https?://)[A-Za-z][\\w.-]*(:\\d+;)", r"\\g<1>127.0.0.1\\2", conf)', "    return conf", "points the upstream hosts at an address"),
        ('f"listen 127.0.0.1:{ports[0]};"', 'f"listen 8080;"', "serves on a free port"),
    ))


def bench_load_mutants():
    """A bench measures a quiet machine (slice-5 harness-c)."""
    b = "scripts/bench.py"
    yield from swaps(b, "bench.py", (
        ("        if load < cores:", "        if True:", "waits for the load to fall"),
        ("        if load < cores:", "        if load <= cores:", "waits at a load equal to the cores"),
        ("        if now is None:", "        if False:", "refuses a load it cannot read"),
        ("load >= 0 and cores > 0 else None", "load >= 0 else None", "refuses a machine of no core"),
        ("if polls > 1 else", "if True else", "says it waited only when it did"),
        ("        if waited >= ceiling:", "        if False:", "gives up past its ceiling"),
        ("        time.sleep(min(step,", "        time.sleep(0 * min(step,", "waits between two reads of the load"),
        ("CEILING, STEP = 600.0, 10.0", "CEILING, STEP = 1.0, 10.0", "waits up to 600 s by default"),
        ("CEILING, STEP = 600.0, 10.0", "CEILING, STEP = 600.0, 0.0", "reads the load every 10 s by default"),
    ))


def regressions_name_mutants():
    """An exclusion written with a name is read (F2523, slice-5 harness-c)."""
    for find, replace, label in REGRESSION_ROWS:
        yield from each("scripts/check_regressions.py", find, replace, "hooks", f"check_regressions.py {label}")


def design_mutants():
    """The design-reviewer starts for a screen, and missing frames fail the step (slice-5 harness-c)."""
    yield from each("scripts/check_docs.py", 'AGENTS = ("design-reviewer", ', "AGENTS = (", "hooks", "check_docs.py asks for the design-reviewer's brief")
    j = ".claude/workflows/branch.js"
    yield from swaps(j, "branch.js", (
        ('file.startsWith("app/src/") || file.startsWith("packages/ui/src/")', 'file.startsWith("packages/ui/src/")', "starts the design-reviewer for a change of app/src/"),
        ('file.startsWith("app/src/") || file.startsWith("packages/ui/src/")', 'file.startsWith("app/src/")', "starts the design-reviewer for a change of packages/ui/src/"),
        ("gate.files.some(screen)", "false", "starts the design-reviewer for a screen"),
        ('label === "design-reviewer" ? DESIGN : FINDINGS', "FINDINGS", "asks the design-reviewer whether the frames are missing"),
        ('lenses[i][1] === "design-reviewer" && r.framesMissing', "false", "fails the step on missing frames"),
        ("  if (!g || !g.passed || (g.exit === 0 && PASS_LINE.test(g.lastLine || \"\"))) return g;", "  if (true) return g;", "reads a merge check's last line itself (F2617)"),
        ("const PASS_LINE = /^all checks passed in \\d+ s/;", "const PASS_LINE = /all checks passed/;", "wants the pass line as the last line, with its time"),
        ("const PASS_LINE = /^all checks passed in \\d+ s/;", "const PASS_LINE = /^all checks passed in \\d+ s/m;", "reads only the last line"),
        ("    passed: false,\n    failingLane: g.failingLane", "    passed: true,\n    failingLane: g.failingLane", "fails a merge check whose last line is no pass line"),
    ))


def mutate_mutants():
    """The realms' mutation check flips operators and numbers (backlog row 11, slice-11a): each flip, each step over what is
    not code, each rule on a flip that does not compile, and the verdicts guards and flips share."""
    pairs = ((">=", ">"), (">", ">="), ("<=", "<"), ("<", "<="), ("==", "!="), ("!=", "=="), ("&&", "||"), ("||", "&&"), ("+", "-"), ("-", "+"))
    yield from swaps("scripts/mutate.py", "mutate.py", [(f'"{a}": "{b}"', f'"{a}": "{a}"', f"flips {a} into {b}") for a, b in pairs])
    yield from swaps("scripts/mutate.py", "mutate.py", (
        ("[shifted(text, 1), shifted(text, -1)]", "[shifted(text, 1)]", "shifts a number down"),
        ("[shifted(text, 1), shifted(text, -1)]", "[shifted(text, -1)]", "shifts a number up"),
        ('        if src.startswith("//", i):\n', "        if False:\n", "steps over a line comment"),
        ('        elif src.startswith("/*", i):\n', "        elif False:\n", "steps over a block comment"),
        ("        elif c in \"\\\"'`\":\n", "        elif c == '\"':\n", "steps over runes and raw strings"),
        ('j += 2 if src[j] == "\\\\" and c != "`" else 1', "j += 1", "reads a string's escapes"),
        ("op = next((o for o in OPERATORS if src.startswith(o, i)), c)", "op = c", "flips whole operators only"),
        ("            if INTEGER.fullmatch(src[i:j]):\n", "            if True:\n", "shifts integers only"),
        ('(src[j] in "+-" and src[j - 1] in exponent)', "False", "reads an exponent's sign as the number's"),
        ('        return f"({value})"\n', "        return str(value)\n", "writes a negative number in parentheses"),
        ('    return prefix + {16: f"{value:x}", 2: f"{value:b}", 8: f"{value:o}", 10: str(value)}[base]\n', "    return str(value)\n", "writes a number in its own base"),
        ("{f' #{k}' if seen[line, text, new] > 1 else ''}", "", "numbers the same flip of the same text"),
        ('        yield f"{path}: {line} [', '        yield f"{line} [', "names the file in a flip's key"),
        ('cases = [(f"{f}: {label}", f, src, False)', "cases = [(label, f, src, False)", "names the file in a guard's key (F5018)"),
        ('text not in FLIP or text in ("+", "-")', "True", "drops no comparison or logic flip"),
        ('text not in FLIP or text in ("+", "-")', "text not in FLIP", "drops a + or - flip that does not compile"),
        ("        cases += flipped\n", "", "runs the flips"),
        ('            if got == "does not compile" and droppable and label not in GAPS:\n', '            if got == "does not compile" and droppable:\n', "never drops a flip GAPS lists"),
        ("        if dropped:\n", "        if False:\n", "counts the flips it drops"),
        ('        if "test timed out after" in out:\n', "        if False:\n", "says gno timed out on a mutant that loops"),
        ("            seen[label] = seen.get(label, 0) + 1\n", "", "sees the mutants GAPS names"),
        ("    for stale in GAPS.keys() - seen.keys():\n", "    for stale in []:\n", "fails a stale GAPS key"),
        ("if seen.get(key, 0) > 1", "if False", "fails a GAPS key that names two mutants"),
        ('j += 2 if src[j] == "\\\\" and c != "`" else 1', 'j += 2 if src[j] == "\\\\" else 1', "reads no escape in a raw string"),
        ('"pP" if src[i : i + 2].lower() == "0x" else "eE"', '"eEpP"', "reads a hex number's e as a digit"),
        ("len(src) if stop < 0 else stop", "stop", "keys a last line without its newline"),
        ("i = n if i < 0 else i", "i = i if i < 0 else i", "ends a last comment without its newline"),
        ('elif c.isalpha() or c == "_":', "elif c.isalpha():", "reads a name that starts with _"),
        ('(c == "." and src[i + 1 : i + 2].isdigit())', "False", "reads a number that starts with a dot"),
        ('rf"^m{i}/\\S+:', 'rf"^m{i}\\S+:', "tells m1's compile errors from m10's"),
        ('rf"^ok\\s+\\./m{i}\\s"', 'rf"^ok\\s+\\./m{i}"', "tells m1's pass from m10's"),
        ('rf"^FAIL\\s+\\./m{i}\\s"', 'rf"^FAIL\\s+\\./m{i}"', "tells m1's failure from m10's"),
        ("            ok = got == want\n", "            ok = True\n", "fails a survivor or a killed gap"),
        ('if not f.endswith(("_test.gno", "_filetest.gno"))', "if True", "mutates no test"),
        ('    if re.search(rf"^m{i}/\\S+:\\d+:\\d+: .*\\(code=", out, re.M):\n', "    if False:\n", "tells a mutant that does not compile"),
        ('        if verdict(out, 0) != "survives":\n', "        if False:\n", "fails an untouched copy that fails"),
        ("SECONDS_A_COPY = 1.5", "SECONDS_A_COPY = 1.4", "gives a copy 1.5 s of its run's time (F5051)"),
        ("LEAST = 60", "LEAST = 0", "gives a run 60 s at least"),
        ("        except subprocess.TimeoutExpired:\n", "        except ZeroDivisionError:\n", "fails by name a gno that does not end (F5084)"),
        ("            print(stopped)\n", "            pass\n", "says which package's gno did not end"),
        ("            failed = True\n            continue\n", "            continue\n", "fails a package whose gno did not end"),
        ("math.ceil(SECONDS_A_COPY * len(dirs))", "int(SECONDS_A_COPY * len(dirs))", "rounds a run's time up"),
        ('"-timeout", f"{limit}s"', '"-timeout", "60s"', "grows a run's time with its copies (F5051)"),
        ('            if got == "survives" and label not in GAPS:  #', "            if False:  #", "judges a survivor again alone, where its filetests see it (F5050)"),
        ('            if got == "survives" and label not in GAPS:  #', '            if got == "survives":  #', "judges no gap again alone (F5050)"),
        ("                except Stopped:\n", "                except ZeroDivisionError:\n", "names a survivor whose run alone never ends"),
        ('                    got = "stopped"\n', "                    pass\n", "says a survivor's run alone stopped, not that it survived"),
        ('errors="replace", timeout=limit + GRACE', "timeout=limit + GRACE", "reads gno's output that is no UTF-8 (F5062)"),
    ))


def hidden_mutants():
    """check_docs refuses a hidden character (hidden.py's rule) in every file git tracks or would (F5053), and the listing
    it reads."""
    yield from swaps("scripts/hidden.py", "hidden", (
        ("for m in HIDDEN.finditer(text):", "for m in []:", "refuses a hidden character"),
        ("(0x2028, 0x202E)", "(0x202A, 0x202E)", "refuses the line and paragraph separators (F5086)"),
        ("(0xE0000, 0xE0FFF)", "(0xE0001, 0xE007F)", "refuses the tags' whole block, its unassigned code points too (F5083)"),
        ('UNICODE = "17.0"', 'UNICODE = "16.0"', "names the Unicode its table is"),
        ('f"{chr(a)}-{chr(b)}"', 'f"{chr(a)}"', "refuses every code point of a range"),
        ("if ord(c) in LOOKS and picks_a_look(text, m.start()):", "if ord(c) in LOOKS:", "refuses a selector that picks no look (F5086)"),
        ("if ord(c) in LOOKS and picks_a_look(text, m.start()):", "if False:", "keeps a selector that picks an emoji's look"),
        ("return i > 0 and (", "return (", "refuses a selector that starts a text"),
        ("not text[i - 1].isascii() and ", "", "refuses a selector after an ASCII character"),
        (" and not HIDDEN.match(text[i - 1])", "", "refuses a second selector in a row"),
        ("or KEYCAP.match(text, i - 1) is not None", "or False", "keeps a keycap's selector"),
        ('"[0-9#*]"', '"[0-9]"', "keeps a # or * keycap's selector"),
        ("out, line, seen = [], 1, 0", "out, line, seen = [], 0, 0", "counts lines from 1"),
        ("        seen = m.start()\n", "", "counts the lines before each hidden character once"),
        ('column = m.start() - text.rfind("\\n", 0, m.start())', 'column = m.start() - text.rfind("\\n", 0, m.start()) - 1', "counts columns from 1"),
        ('name = unicodedata.name(c, "")', 'name = ""', "names the hidden character"),
        ('bad = data.find(b"\\0")', "bad = -1", "refuses a text holding a NUL (F5088)"),
        ("bad = e.start if bad < 0 else min(bad, e.start)", 'bad, text = -1, data.decode("utf-8", "replace")', "refuses a text with a byte that is no UTF-8 (F5088)"),
        ("min(bad, e.start)", "bad", "names a text's first byte that is no UTF-8"),
        ('        return [f"{where}: no UTF-8 text', '        return hidden_in(where, data.decode("utf-8", "surrogateescape")) + [f"{where}: no UTF-8 text', "reads no character of what is no UTF-8 text (F5082)"),
        ("{bad + 1}", "{bad}", "counts bytes from 1"),
    ))
    yield from swaps("scripts/check_docs.py", "check_docs", (
        ('".png": b"\\x89PNG\\r\\n\\x1a\\n", ', "", "reads no .png"),
        ('".jpg": b"\\xff\\xd8\\xff"', '".jpeg": b"\\xff\\xd8\\xff"', "reads no .jpg"),
        ("if suffix in IMAGES and data.startswith(IMAGES[suffix])", "if suffix in IMAGES", "reads a text named as an image"),
        ("path, link = p.relative_to(root).as_posix(), p.is_symlink()", "path, link = p.name, p.is_symlink()", "names the file by its path"),
        ('    if not (root / ".git").exists():\n        return {}', "    if True:\n        return {}", "reads the index's copy, what a commit takes (F5087)"),
        ("    for path, (data, link) in held.items():\n", "    for path, (data, link) in []:\n", "reads each blob the index holds"),
        ('if not info.startswith("160000 ")', "if True", "reads no gitlink as a file"),
        ('(batch[start:end], mode == "120000")', "(batch[start:end], False)", "names a staged link as one"),
        ('" (link)" * link + " (work tree)" * (path in held)', '" (link)" * link', "names the work tree's copy as one"),
        ("        if held.get(path) != (data, link):\n", "        if True:\n", "reads the work tree's copy only where it differs"),
        ("        if held.get(path) != (data, link):\n", "        if False:\n", "reads the work tree's copy where it differs"),
        ("os.fsencode(os.readlink(p)) if link else p.read_bytes()", "p.read_bytes()", "reads a link's target, not what it points to (F5089)"),
        ("        names.add(path)\n", "", "reads the name of each path git would track"),
        ('        out += hidden_in(f"the name {ascii(path)}", path)\n', "        pass\n", "reads every name (F5089)"),
        ("{ascii(path)}", "{path}", "writes a name's hidden character as its escape"),
        ('        held = {}\n        out.append(f"git cannot read the index', '        held = {}\n        (f"git cannot read the index', "fails when git cannot read the index"),
        ("if hidden_chars:\n    print(", "if False:\n    print(", "says why it refuses a hidden character"),
        ("if hidden_chars or missing", "if missing", "fails on a hidden character"),
        ('    if not (root / ".git").exists():\n        return []', "    if True:\n        return []", "reads the branch's commit messages (F5079)"),
        ('"refs/remotes/origin/main..HEAD"', '"HEAD"', "reads no message main holds already"),
        ('"refs/remotes/origin/main..HEAD"', '"-1", "refs/remotes/origin/main..HEAD"', "reads each message of the branch, not its newest only (F5081)"),
        ('"refs/remotes/origin/main"):\n        return []', '"refs/remotes/origin/main") and False:\n        return []', "reads no message with no origin/main"),
        ('if not git("-C", str(root), "for-each-ref", "--format=%(objectname)", "refs/remotes/origin/main"):',
         'if subprocess.run(["git", "-C", str(root), "rev-parse", "-q", "--verify", "origin/main^{commit}"]).returncode:',
         "takes no failing git for a branch with no origin/main"),
        ("subprocess.CalledProcessError) as e:\n        out.append(", "subprocess.CalledProcessError) as e:\n        (", "fails when git cannot read the messages"),
    ))
    yield from swaps("scripts/repo_files.py", "repo_files", (
        ('"ls-files", "-z", "--cached"', '"ls-files", "--cached"', "lists names git quotes none of (-z)"),
        ('{"node_modules", ".git"}', '{"node_modules"}', "walks none of git's own folder"),
        ('{"node_modules", ".git"}', '{".git"}', "walks no installed package"),
        ("    return [p for p in listing(root) if p.is_file()]\n", "    return listing(root)\n", "lists no file deleted from the work tree"),
    ))


def sections(path, test):
    """The sections of `test` that read `path`: one string, or one per suite."""
    only = SECTIONS[path]
    return only[test] if isinstance(only, dict) else only


class Cut(Exception):
    """A suite ended by a signal, or a run asked to stop: no verdict."""


STOP = threading.Event()  # set when the run is interrupted: no shard starts a mutant or keeps a verdict after it
CUT_BY_SIGNAL = (130, 137, 143)  # a shell's INT, KILL, TERM; a suite run by Python or sh itself ends with a negative code


def run(tree, test, only=""):
    """A test's exit code in the worktree `tree`; `only` names its sections, empty for all of them. A suite cut short by a
    signal (a Ctrl+C reaches every suite in flight) has no verdict, as a failing mutant would have: it raises (F2526)."""
    env = {**os.environ, "ONLY": only}
    code = subprocess.run(TESTS[test], cwd=tree, env=env, capture_output=True, text=True, timeout=600).returncode
    if code < 0 or code in CUT_BY_SIGNAL:
        raise Cut(f"{test} in {tree} ended with {code}, a signal")
    return code


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
MOST = 100  # what --changed judges at most: no variable or flag moves it (Alexis, 2026-10-30), a run with no argument has no such limit


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
    context = code(outside + "".join(found.get(name, "") for name in sections(path, test).split(",")))
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


HUNK = re.compile(r"^@@ -\S+ \+(\d+)(?:,(\d+))? @@", re.M)


def changed_lines(base, path):
    """The lines of HEAD's `path` that changed since base; a hunk of count 0, which only removes, touches the two beside it."""
    lines = set()
    for hunk in HUNK.finditer(git("diff", "-U0", "--no-renames", "--no-color", "--no-ext-diff", "--text", "--no-textconv", base, "HEAD", "--", path)):
        start, count = int(hunk.group(1)), int(hunk.group(2) or 1)
        lines |= set(range(start, start + count)) if count else {start, start + 1}
    return lines


DRY = re.compile(r'^if sys\.argv\[1:\] == \["--dry"\]:$', re.M)  # where this script's definitions end


def identity(mutant, sections_of, gaps):
    """A mutant as its label, file, suite, the sections that judge it, its place in GAPS and the text it writes, hashed:
    two scripts that define it alike agree; a section it cannot name is None, which no readable one equals."""
    label, path, mutated, test = mutant
    try:
        judged_by = sections_of(path, test)
    except Exception:  # base's tables may not know a file this tree's do
        judged_by = None
    return label, path, test, judged_by, label in gaps, None if mutated is None else hashlib.sha256(code(mutated).encode()).hexdigest()


def defined_at(base):
    """The mutants base's script defines, built on this tree's files, each identity with its sections apart, which alike()
    reads; None when it cannot say (no such file, no `--dry` line to cut its definitions at, its code failing here): then
    every mutant is judged. Its helper is base's too: a name this tree's dropped would otherwise fail its import, and every
    mutant look new."""
    shown, helper = (subprocess.run(["git", "show", f"{base}:{path}"], capture_output=True, text=True).stdout for path in (SELF, os.path.join(os.path.dirname(SELF), "suite_parts.py")))
    space = {"__name__": "harness_mutate_at_base", "__file__": os.path.abspath(__file__)}
    theirs = types.ModuleType("suite_parts")
    try:  # base's own code, whatever it raises: judging every mutant is the safe side
        exec(compile(helper, f"{base}:suite_parts.py", "exec"), theirs.__dict__)
        sys.modules["suite_parts"] = theirs  # this script bound its own names when it started
        exec(compile(shown[: DRY.search(shown).start()], f"{base}:{SELF}", "exec"), space)
        space["WORKTREE"] = WORKTREE
        return {i[:3] + i[4:]: i[3] for i in (identity(m, space["sections"], space["GAPS"]) for m in space["mutants"]())}
    except BaseException as e:  # a sys.exit in base's code too (security-S6)
        print(f"harness_mutate: {base}'s {SELF} cannot say its mutants here ({e!r})")
        return None


def alike(mutant, before):
    """Whether `before`, what defined_at(base) says, defines this mutant as this script does. Sections it only gained change
    nothing here, though the cache's key does move with them: a mutant S kills, S and T kill. One it lost is another mutant."""
    mine = identity(mutant, sections, GAPS)
    theirs = before.get(mine[:3] + mine[4:])
    return theirs is not None and set(theirs.split(",")) <= set(mine[3].split(","))


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
    before = defined_at(base) if changed is not None and SELF in changed else {}
    if before is None:
        print(f"harness_mutate: {SELF} changed since {base}, whose mutants it cannot read: every mutant")
    elif changed is not None:
        total = len(found)
        lines = {path: changed_lines(base, path) for path in {m[1] for m in found} & changed}
        # The lines a change rewrites ask for their mutants; when this script changed, those it does not define alike too.
        kept = {id(m) for m in select(found, lines, read)} | {id(m) for m in found if SELF in changed and not alike(m, before)}
        found = [m for m in found if id(m) in kept]
        print(f"harness_mutate: the lines and the mutants changed since {base}: {len(found)} of {total} mutants")
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
    if changed is not None and len(found) > MOST:
        files = ", ".join(f"{path} {n}" for path, n in collections.Counter(m[1] for m in found).most_common())
        sys.exit(f"harness_mutate: --changed stops before judging {len(found)} mutants, past the {MOST} a branch judges ({files}); the way on is the chief's check.sh --full")
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
            keep = threading.Lock()

            def judge(tree, m):
                """One verdict, kept in the cache as soon as it is known: a run cut short (a time limit, a Ctrl+C) leaves the
                verdicts it reached, as a run of 700 mutants cut at 100 minutes judged all of them again (2026-10-30). A run
                that is stopping keeps none: its suites died of the signal, not of the mutant (F2526)."""
                if STOP.is_set():
                    raise Cut("the run was stopped")
                killed = judged(tree, *m)
                with keep:
                    if STOP.is_set():
                        raise Cut("the run was stopped")
                    if killed != (m[0] in GAPS):
                        remember({keys[id(m)]: "killed" if killed else "survives"})
                return killed

            try:
                verdicts = list(pool.map(lambda n: [judge(trees[n], m) for m in found[n::shards]], range(shards)))
            except BaseException as e:  # the main thread's Ctrl+C, or a shard's suite cut short: the others stop at their next step
                STOP.set()
                if isinstance(e, Cut):
                    sys.exit(f"harness_mutate: {e}; no verdict of this mutant is kept, run it again")
                raise
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
