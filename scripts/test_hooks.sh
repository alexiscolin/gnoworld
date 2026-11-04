#!/bin/sh
# test_hooks.sh: the git hooks do what docs/DEVELOPMENT.md says. check.sh runs it.
set -eu
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE # a `commit -a` hands its own index down; the throwaway repos must not touch it
# A `git merge` hands its hooks GIT_REFLOG_ACTION: left set, it renames every reflog entry, and `checkout -` finds no
# branch before (pathspec '-').
unset GIT_REFLOG_ACTION
# check.sh exports it, through records.sh: left set, it would hide a hook that does not (F144).
unset GIT_NO_REPLACE_OBJECTS
# The hooks run the gate as they do in Claude Code's sandbox, the CI included; the sections
# `outside` and `installed` run them as in Alexis's shell (F076, F129).
export SANDBOX_RUNTIME="${SANDBOX_RUNTIME:-test_hooks}"
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
here=$(cd "$(dirname "$0")" && pwd)
hooks=$(cd "$here/../.githooks" && pwd)
rp="$here"/review_pass.py # review_pass and pre_push both use it
secrets_into() { cp "$here/scan_secrets.sh" "$here/gitleaks.toml" "$here/gitleaks-private.toml" "$here/.gitleaksignore" "$1"; } # the secret scan, whole
hook_names="commit-msg pre-commit pre-merge-commit pre-push" # git checks nothing where one is missing
key="AKIA""J7Q2XRT4LMNB5VWZ" # assembled, so this file holds no key
t=$(mktemp -d "${TMPDIR:-/tmp}/test_hooks.XXXXXX")
# bash 3.2, macOS's sh, exits 0 through an EXIT trap after an unbound variable: `finished`, set
# on the last line, tells a run that reached its end from one that died on the way.
trap 'status=$?; chmod -R u+w "$t" 2>/dev/null; rm -rf "$t" || :; [ "$status" != 0 ] || [ "${finished:-}" = 1 ] || status=1; exit "$status"' EXIT
fail() {
	echo "test_hooks: $*" >&2
	exit 1
}

# ONLY=<section>[,<section>...] runs only those sections: harness_mutate runs the ones a guard
# belongs to. Unset, every section runs. Each builds its own throwaway repositories, so several
# run side by side, each in a process of its own; a failing one's output is shown.
sections=$(sed -n 's/^if part \([a-z0-9_]*\); then$/\1/p' "$0")
if [ "$(grep -c '^if part ' "$0")" != "$(printf '%s\n' "$sections" | grep -c .)" ]; then
	echo "test_hooks: a section is opened in a form the runner does not list, so it would never run" >&2
	exit 1
fi
case ${ONLY:-,} in
*,*)
	pids=
	for s in $(printf '%s' "${ONLY:-$(printf '%s\n' "$sections" | sort -u | paste -sd, -)}" | tr , ' '); do
		ONLY=$s sh "$0" >"$t/$s.out" 2>&1 &
		pids="$pids $!:$s"
	done
	failed=
	for p in $pids; do wait "${p%%:*}" || { cat "$t/${p#*:}.out" >&2; failed=1; }; done
	[ -z "$failed" ] || exit 1
	echo "hooks: ok"
	finished=1
	exit 0
	;;
esac
part() { case ",$ONLY," in *",$1,"*) ran=1 && return 0 ;; *) return 1 ;; esac; }
# The rules the review depends on are required of every root (CR2): the four agents' briefs, each saying the git-index
# rule, and CLAUDE.md's review card, its item 8; good_rules gives a fixture its own.
agents="design-reviewer reviewer security-reviewer test-auditor"
good_rules() {
	mkdir -p "$1/.claude/agents"
	for a in $agents; do printf 'You never edit.\nNever run a git command that writes the index or the work tree (checkout,\nrestore); copy with cp.\n' >"$1/.claude/agents/$a.md"; done
	printf '8. Risk and undo: what could go wrong.\n' >>"$1/CLAUDE.md"
}

if part wiring; then
# The wiring: settings.json runs each Claude Code hook, and check.sh runs every step it promises.
python3 -I - "$here/../.claude/settings.json" <<'PY' || fail "settings.json no longer wires a Claude Code hook"
import json, sys
hooks = json.load(open(sys.argv[1]))["hooks"]
wired = {event: " ".join(h["command"] for entry in hooks.get(event, []) for h in entry["hooks"]) for event in hooks}
assert "scripts/guard.py" in wired["PreToolUse"] and "scripts/stop_gate.sh" in wired["Stop"]
# A hook runs outside the sandbox: none may run a tool a sandboxed command can rewrite (finding F038).
assert not wired.get("PostToolUse"), "a PostToolUse hook runs outside the sandbox"
PY
# The boundary settings.json promises (docs/DEVELOPMENT.md, "The harness"): a guard that crashes
# blocks; no unsandboxed retry; credentials unreadable; the harness and chain writes ask first.
python3 -I - "$here/../.claude/settings.json" <<'PY' || fail "settings.json dropped a boundary"
import json, sys
s = json.load(open(sys.argv[1]))
guard = [h for e in s["hooks"]["PreToolUse"] for h in e["hooks"] if "guard.py" in h["command"]]
assert guard and all(h.get("onFailure") == "block" for h in guard), "guard does not block when it fails"
box = s["sandbox"]
assert box["enabled"] is True and box["allowUnsandboxedCommands"] is False, "the sandbox can be left"
assert {"~/.ssh", "~/.config/gh", "~/.npmrc", "~/.aws"} <= set(box["filesystem"]["denyRead"]), "a credential is readable"
assert {"scripts", ".githooks", ".github", "package.json", ".node-version", "pnpm-lock.yaml", ".gitignore", "CLAUDE.md", ".claude/rules"} <= set(box["filesystem"]["denyWrite"]), "a command can rewrite the harness, the lockfile or the rules"
assert {"pnpm-workspace.yaml", ".pnpmfile.cjs", ".pnpmfile.mjs"} <= set(box["filesystem"]["denyWrite"]), "a command can plant what pnpm runs (F087)"
assert {".git/hooks", ".git/config", ".git/commondir"} <= set(box["filesystem"]["denyWrite"]), "a command can rewrite git's hooks or point git at others (F129, F150)"
assert ".mcp.json" in box["filesystem"]["denyWrite"], "a command can add a server Claude Code starts (F158)"
assert {"CLAUDE.local.md", ".claude/CLAUDE.md"} <= set(box["filesystem"]["denyWrite"]), "a command can write instructions Claude Code reads beside CLAUDE.md (7z, S4)"
assert not [p for p in box["filesystem"]["allowWrite"] if "pnpm" in p], "a command can rewrite the pnpm that Alexis's install runs"
assert not any("api.github.com" in d for d in box["network"]["allowedDomains"]), "the GitHub API is reachable"
ask, deny = set(s["permissions"]["ask"]), set(s["permissions"]["deny"])
# Claude works alone and asks only before a push or a chain write (Alexis, 2026-10-18). The files
# run outside the sandbox themselves cannot be edited at all: the hooks and their scripts,
# Claude Code's own settings, skills and agents (F068), what pnpm loads at Alexis's install
# (F087), and git's own hooks folder and config, which bypass mode lets the file tools write
# otherwise (F129); and what Alexis's terminal runs to make a worktree (7z, S3), and the
# instructions every session reads, Alexis's from 7z on (R4). A dependency is Alexis's to add,
# and rm -rf no one's.
assert {"Bash(git push)", "Bash(git push *)"} <= ask, "a push asks no one"
assert {"Bash(pnpm add *)", "Bash(rm -rf *)"} <= deny, "Claude can add a dependency or delete a tree"
outside = {"Edit(/scripts/guard.py)", "Edit(/scripts/stop_gate.sh)", "Edit(/scripts/code_changed.sh)", "Edit(/.githooks/**)",
           "Edit(/scripts/scan_secrets.sh)", "Edit(/scripts/gitleaks.toml)", "Edit(/scripts/gitleaks-private.toml)", "Edit(/scripts/.gitleaksignore)",
           "Edit(/scripts/install_hooks.sh)", "Edit(/.git/hooks/**)", "Edit(/.git/config)", "Edit(/.git/commondir)", "Edit(/.mcp.json)",
           "Edit(/scripts/worktree.sh)", "Edit(/scripts/borrow_node_modules.sh)", "Edit(/CLAUDE.md)", "Edit(/CLAUDE.local.md)", "Edit(/.claude/CLAUDE.md)",
           "Edit(/.claude/settings.json)", "Edit(/.claude/settings.local.json)", "Edit(/.claude/agents/**)", "Edit(/.claude/commands/**)",
           "Edit(/.claude/skills/**)", "Edit(/.claude/rules/**)", "Edit(/.claude/hooks/**)", "Edit(/.claude/workflows/**)",
           "Edit(/package.json)", "Edit(/app/package.json)", "Edit(/packages/*/package.json)",
           "Edit(/server/package.json)", "Edit(/packages/schemas/package.json)",
           "Edit(/.npmrc)", "Edit(/pnpm-workspace.yaml)", "Edit(/.pnpmfile.cjs)", "Edit(/.pnpmfile.mjs)"}
edits = lambda rules: {r for r in rules if r.split("(")[0] in {"Edit", "Write", "MultiEdit", "NotebookEdit"}}
# This tree's own: the twins of every other worktree's and the main checkout's are the section `siblings`' (7z).
own = lambda rules: {r for r in rules if not r.split("(", 1)[1].startswith(("//", "~/"))}
assert own(edits(deny)) == outside, "the edits refused are not exactly the files run outside the sandbox and the instructions"
assert not edits(ask), "an edit asks Alexis: Claude works alone, and the files run outside the sandbox are refused"
# The sandbox turns an Edit deny into a write ban: none may reach what the gate writes itself, its
# state in .claude/tmp or StrykerJS's copies of the package files (F111).
import fnmatch
for rule in edits(deny):
    for written in ("/.claude/tmp/gate-green", "/.stryker-tmp/sandbox-x/app/package.json", "/.stryker-tmp/sandbox-x/packages/core/package.json"):
        assert not fnmatch.fnmatch(written, rule[5:-1]), f"{rule} bans the gate's own write to {written}"
assert {f"mcp__{p}__gno_{t}" for p in ("gnomcp", "plugin_gnomcp_gnomcp") for t in ("addpkg", "call", "run", "key_send", "cla_sign")} <= ask, "a chain write asks no one"
assert {"Read(~/.ssh/**)", "Read(~/.config/gh/**)"} <= deny, "the Read tool can open a credential"
# The sandbox turns Read denies into its own: one on dist, coverage or reports stops the gate
# reading node_modules' code, the coverage report or StrykerJS's incremental file.
assert not [r for r in deny if any(w in r for w in ("dist", "coverage", "reports"))], "a deny rule hides from the sandboxed gate what it reads"
market = s.get("extraKnownMarketplaces", {}).get("gnoverse", {}).get("source", {})
assert market.get("repo") == "gnoverse/gno-mcp", "a teammate's Claude Code cannot find gnomcp's marketplace"
PY
# pnpm runs no pnpmfile (F087), and no script at Alexis's install: one pointed git at the
# repository's hooks, which a branch can change (F129).
grep -qx 'ignorePnpmfile: true' "$here/../pnpm-workspace.yaml" || fail "pnpm may run a pnpmfile"
python3 -I - "$here/.." <<'PY' || fail "pnpm install runs a package.json script (F087, F129)"
import glob, json, os, sys
root = sys.argv[1]
for p in [os.path.join(root, "package.json"), os.path.join(root, "app/package.json"), *glob.glob(os.path.join(root, "packages/*/package.json"))]:
    scripts = json.load(open(p)).get("scripts", {})
    run = {"preinstall", "install", "postinstall", "preprepare", "prepare", "postprepare"} & set(scripts)
    assert not run, (p, run)
PY
# The coverage's Vitest runs the plain projects: the compiled one (React Compiler's memo cache checks) adds a branch
# to every component it renders, never all taken, and drowned the app's branches under 85% (F1350). The compiled
# project's own tests run in the full gate through `test:compiled`, and in the fast gate through `test`.
python3 -I - "$here/.." <<'PY' || fail "the coverage's Vitest counts the compiled project's branches, or no gate runs the compiled project (F1350)"
import json, os, sys
scripts = json.load(open(os.path.join(sys.argv[1], "package.json")))["scripts"]
words = scripts["coverage"].split()
assert {w for n, w in enumerate(words) if words[n - 1] == "--project"} == {"node", "ui", "slow"}, scripts["coverage"]
assert scripts["test:compiled"] == "vitest run --project compiled", scripts["test:compiled"]
assert "--project compiled" in scripts["test"], scripts["test"]
PY
# The type check builds incrementally, each project into its own .tsbuildinfo of TSC_CACHE (check.sh's; .claude/tmp/tsc when unset): the
# graph a commit's lint reads (scripts/lint_scope.py). Four projects, four names, the cache's folder in each.
python3 -I - "$here/.." <<'PY' || fail "package.json's typecheck does not build each project incrementally into a file of its own in TSC_CACHE"
import json, os, sys
scripts = json.load(open(os.path.join(sys.argv[1], "package.json")))["scripts"]
projects = [c.split() for c in scripts["typecheck"].split(" && ")]
assert [c[:3] for c in projects] == [["tsc", "-p", p] for p in ("tsconfig.json", "app/tsconfig.json", "packages/ui/tsconfig.json", "server/tsconfig.json")], scripts["typecheck"]
assert all(len(c) == 6 and c[3:5] == ["--incremental", "--tsBuildInfoFile"] and c[5].startswith('"${TSC_CACHE:-.claude/tmp/tsc}/') for c in projects), scripts["typecheck"]
assert len({c[5] for c in projects}) == 4, scripts["typecheck"]
PY
# Alexis's install command, wherever it is given, reads the script itself, whatever a replace ref
# shows (F132's class).
if grep -rn --exclude=test_hooks.sh --exclude-dir=review 'git show main:scripts/install_hooks' "$hooks" "$here" "$here/../docs"; then
	fail "the install command is given without --no-replace-objects"
fi
# A section opened in another form would never run in the default run: the runner refuses it (F160).
mkdir -p "$t/form/scripts" "$t/form/.githooks"
{ cat "$0"; printf 'if part Regress2 ; then\nfi\n'; } >"$t/form/scripts/test_hooks.sh"
ONLY=wiring sh "$t/form/scripts/test_hooks.sh" 2>&1 | grep -q "opened in a form the runner does not list" || fail "a section opened in another form would never run, unnoticed (F160)"
# check.sh runs every step it promises: removing one fails here.
gate_file="$here/check.sh"
for step in "run format:check" "run typecheck" "run lint" "run test" "run test:compiled" "run unused" "run copies" \
	"python3 -I scripts/check_css.py" "run comments" '"$GNO" lint ./...' '"$GNO" test ./...' \
	"node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts" '[ "$(packages)" = "$installed" ]' \
	"ast.parse(open(f).read(), f) for f in sys.argv[1:]]' scripts/*.py" \
	"python3 -I ../scripts/mutate.py" "go vet ./tools/..." "go run ./tools/sealvec | cmp" "python3 -I scripts/check_docs.py" \
	"sh scripts/test_hooks.sh" "python3 -I scripts/probe.py" "run coverage" "python3 -I scripts/patch_coverage.py" "sh scripts/ergo.sh" \
	"run mutate" "sh scripts/scan_secrets.sh" "python3 -I scripts/harness_mutate.py" "python3 -I scripts/check_regressions.py" "python3 -I scripts/check_migrations.py" "python3 -I scripts/bench.py" "python3 -I scripts/batch_size.py" "python3 -I scripts/load.py" \
	'unset GNOWORLD_BUILD AUDIT_ANSWER PROVE_FIX_VITEST PROVE_FIX_GNO PROVE_FIX_GO' '[ "$took" -gt "$budget" ]' "python3 -I scripts/prove_fix.py" "python3 -I scripts/audit.py" \
	"PICTURES_OF=tokens-- node app/node_modules/@playwright/test/cli.js test -c app/playwright.stories.config.ts"; do
	grep -v '^[[:space:]]*#' "$gate_file" | grep -qF -- "$step" || fail "check.sh no longer runs: $step"
done
# The app's step comes after the copy and dead-code checks (F082), and its guard (F080) snapshots
# every package file before the build and compares after it.
python3 -I - "$gate_file" <<'PY' || fail "check.sh's app step lost its order or its package guard"
import sys
lines = [l.strip() for l in open(sys.argv[1]) if not l.lstrip().startswith("#")]
at = lambda text: next(i for i, l in enumerate(lines) if l.startswith(text))
assert "packages() { cat package.json app/package.json pnpm-lock.yaml | cksum; }" in lines
last = lambda text: max(i for i, l in enumerate(lines) if l.startswith(text))
assert at("copies=$(run copies") < at("installed=$(packages)") < at("run build:app") < at("node app/node_modules/@playwright/test/cli.js test") < last('[ "$(packages)" = "$installed" ]')
PY
# The full gate walks the stories: a command of its own, not a line that names it and runs nothing.
grep -v '^[[:space:]]*#' "$gate_file" | grep -qE '^[[:space:]]*(STORIES_PORT=\$port )?node app/node_modules/@playwright/test/cli\.js test -c app/playwright\.stories\.config\.ts( --[a-z]+(=[a-z]+)?)*$' ||
	fail "check.sh no longer walks the design system's stories in a browser"
# One harness list, records.sh's: --full runs harness_mutate when a file of it changes, pre-push
# wants each declared on main, merge.sh shows each first (F129); every file harness_mutate
# guards is in it (F112, F114, F124), and what Claude Code starts, .mcp.json's servers.
python3 -I - "$gate_file" "$hooks/pre-push" "$hooks/merge.sh" "$hooks/records.sh" "$here/harness_mutate.py" <<'PY' || fail "a harness list other than records.sh's, or one missing a file harness_mutate guards"
import ast, fnmatch, re, sys
text = lambda n: open(sys.argv[n]).read()
assert 'harness --quiet "$base"' in text(1), "check.sh has its own harness list"
assert 'harness --name-only "$remote_sha" "$local_sha"' in text(2), "pre-push has its own harness list"
assert 'harness --name-only HEAD..."$tip"' in text(3), "merge.sh shows no harness list"
assert not [n for n in (1, 2, 3) if "pnpm-workspace.yaml" in text(n)], "a second harness list is left"
listed = re.search(r'^harness\(\) \( [^\n]*?git .*? -- (.*?) \)$', text(4), re.S | re.M).group(1).replace("\\\n", " ").replace("'", "").split()
assert {".mcp.json", ".pnpmfile.cjs", ".pnpmfile.mjs", "packages/*/package.json"} <= set(listed), "the harness list leaves out what Claude Code or pnpm runs"
tree = ast.parse(text(5))
guarded = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "SECTIONS")
missed = [p for p in guarded if not any(fnmatch.fnmatch(p, s) or p.startswith(s + "/") for s in listed)]
assert not missed, missed
PY
# The full gate judges every harness mutant: an argument (--changed) would judge a part of them.
grep -qxE '[[:space:]]*python3 -I scripts/harness_mutate\.py' "$gate_file" || fail "check.sh's full gate runs harness_mutate with arguments, so maybe not every mutant"
# check.sh prints the code it tests before its first step, and records it after its last one,
# through records.sh, whose own cases are in the section `outside` (F076, F133).
at() { grep -nF -- "$1" "$gate_file" | head -1 | cut -d: -f1; }
[ "$(at '. .githooks/records.sh && tested=$(worktree_print)')" -lt "$(at 'run format:check')" ] || fail "check.sh prints its code after a step ran (F133)"
[ "$(at 'gate_passed "$tested" "$full"')" -gt "$(at 'python3 -I scripts/harness_mutate.py')" ] || fail "check.sh records its code before its last step (F076)"
[ "$(at 'sh scripts/ergo.sh')" -lt "$(at 'sh -c "$tests --tags-filter=!timing --reporter=default')" ] || fail "check.sh runs the tests before it builds the Ergo they start"
# An EXIT trap keeps a failure: under macOS's sh, a plain one turns an unbound variable into exit 0.
for f in "$here"/*.sh "$hooks"/*; do
	grep -n "^[[:space:]]*trap .* EXIT$" "$f" | grep -v '|| status=1; exit "$status"' | grep -q . && fail "$(basename "$f") has an EXIT trap that can hide a failure"
done
# A temporary file goes in $TMPDIR: macOS's mktemp, given no template, uses the system's temp
# folder, which the sandbox forbids.
for f in "$here"/*.sh "$hooks"/*; do
	grep -nE '^[[:space:]]*[A-Za-z_]+=\$\(mktemp' "$f" | grep -vE 'mktemp (-d )?"\$\{TMPDIR:-/tmp\}/' | grep -q . && fail "$(basename "$f") makes a temporary file outside \$TMPDIR"
done
# The CI runs the full gate, reads the repository and nothing more, and pins every action and
# download: a tag or a branch can be moved to code nobody reviewed.
python3 -I - "$here/../.github/workflows/gate.yml" <<'PY' || fail "the CI workflow lost a promise"
import re, sys
# Comments out: a promise kept only in a comment is not kept.
ci = re.sub(r"[ \t]*#.*$", "", open(sys.argv[1]).read(), flags=re.M)
def has(line, why):
    assert re.search("^" + line + "$", ci, re.M), why
uses = re.findall(r"uses:\s*(\S+)", ci)
assert uses and all(re.fullmatch(r"[\w.-]+/[\w.-]+@[0-9a-f]{40}", u) for u in uses), f"an action not pinned to a commit: {uses}"
trigger = re.search(r"^on:\n((?:  .*\n)+)", ci, re.M)
assert trigger and re.findall(r"^  (\S+):", trigger.group(1), re.M) == ["push"], "the CI runs on something else than a push"
assert ci.count("permissions:") == 1 and "write" not in ci, "the CI may write"
has(r"permissions:\n  contents: read", "the CI may write")
assert "secrets." not in ci and "continue-on-error" not in ci, "the CI reads a secret or lets a step fail"
# One condition only, on one step: when the gate fails, the pictures the stories' journeys wrote
# where Linux had none are kept for review; no step of the gate itself can be skipped.
conditions = re.findall(r"^\s+(?:- )?if:.*$", ci, re.M)
assert [c.strip() for c in conditions] == ["if: failure()"], f"a CI step can be skipped: {conditions}"
has(r"      - name: Linux's pictures of the stories, written where none was approved\n        if: failure\(\)\n        uses: actions/upload-artifact@[0-9a-f]{40}\n        with:\n          name: stories-pictures-linux\n          path: app/tests/stories/__screenshots__/linux/\n          if-no-files-found: ignore\n          retention-days: 7",
    "the CI does not keep Linux's pictures when the gate fails, or keeps more")
has(r"    runs-on: ubuntu-24\.04", "the CI runs on a machine it does not name")
has(r"        run: sh scripts/check\.sh --full", "the CI does not run the full gate, or lets it fail")
# The CI judges every harness mutant afresh: it keeps no cache of verdicts, nor StrykerJS's, from one run to the next.
assert "gnoworld-tools" not in ci and not re.search(r"path:.*(\.cache\s*$|~/\.cache|HOME)", ci, re.M), "the CI keeps the tools' cache of verdicts"
has(r"          persist-credentials: false", "the CI keeps its token on disk for the gate")
has(r"          fetch-depth: 0", "the CI cannot compare the branch with main")
has(r"      GNO_COMMIT: [0-9a-f]{40}", "the CI builds gno from a name that can move")
has(r'          echo "[0-9a-f]{64}  \$RUNNER_TEMP/gitleaks\.tgz" \| sha256sum -c', "the CI trusts a download it did not check")
assert not re.search(r"\|\s*(ba)?sh\b", ci), "the CI runs a download"
assert "--frozen-lockfile" in ci and "--ignore-scripts" in ci, "the CI trusts a lockfile it did not check"
has(r"        run: node app/node_modules/@playwright/test/cli\.js install --with-deps --only-shell chromium", "the CI has no browser for the journeys")
PY
# check.sh refuses a .node-version that is more than a version, which would steer PATH.
nv="$t/nodeversion" && mkdir -p "$nv/scripts" && cp "$gate_file" "$nv/scripts/check.sh"
printf '24.22.0/../../../../evil\n' >"$nv/.node-version"
sh "$nv/scripts/check.sh" 2>&1 | grep -q ".node-version must be a version" || fail "check.sh accepted a .node-version that is a path"
# Every gno package is mutated, gno/p as well as gno/r: discovery names no area.
grep -qF 'glob.glob("**/gnomod.toml"' "$here/mutate.py" || fail "mutate.py no longer mutates every gno package"
fi

if part siblings; then
# No session writes another worktree's closed files (7z, F4890). The worktrees live in the per-user temp folder, which the sandbox
# lets every command write, and a relative entry of settings.json guards the session's own tree alone; hooks run outside the
# sandbox, and Claude Code reloads a settings file it sees change. So each relative denyWrite entry has its twin under the worktrees'
# folder, and each relative Read or Edit deny its twins there, by both spellings of the temp folder (macOS's /tmp is a link the
# file tools may not follow), and in the main checkout, which the file tools reach from every worktree (F4892); a linked worktree's
# .git, the file that names git's folder, is closed there too (F150's class, F4891). What a session must write stays open: its own
# docs and ledger, the gate's state, git's shared folder, the throwaway trees in $TMPDIR. The rules are read as Claude Code reads
# them: a Read or Edit rule as a gitignore pattern (its permissions page: * within one segment, ** across), the sandbox's by
# Claude Code 2.1.318's own source (* is [^/]*, ** is .*, a deny covers its path and all under it, a link resolved).
python3 -I - "$here/../.claude/settings.json" <<'PY' || fail "a sibling worktree's closed files are open to this session (F4890, F4891, F4892)"
import functools, json, os, re, sys

WT, TMP_WT, MAIN = "/private/tmp/claude-501/gnoworld-wt", "/tmp/claude-501/gnoworld-wt", "~/Server/gnoworld"
HOME, ROOT = os.path.expanduser("~"), "/own"  # ROOT: the session's own tree, for its relative rules, apart from every sibling
# The instructions Claude Code reads in every folder above a session's (its memory page: CLAUDE.md and CLAUDE.local.md "from your
# current working directory and every directory above it"; .claude/CLAUDE.md and .claude/rules by its source), closed in the folders
# above a worktree, which the sandbox writes from the temp folder down, and above the main checkout, which the file tools reach (S4).
ABOVE, ABOVE_MAIN = ("/private/tmp", "/private/tmp/claude-501", WT), ("~", "~/Server")
INSTRUCTIONS = ("CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md", ".claude/rules")
tmp = lambda p: "/tmp" + p[len("/private/tmp"):]
s = json.load(open(sys.argv[1]))
writes, deny = s["sandbox"]["filesystem"]["denyWrite"], s["permissions"]["deny"]
# Each once: a script run twice that added its twins again would pass the sets below (the red pass, T3).
assert len(writes) == len(set(writes)) and len(deny) == len(set(deny)), "a rule is written twice"
rules = [(m[1], m[2]) for r in deny if (m := re.fullmatch(r"(Read|Edit)\((.+)\)", r))]
assert all(p.startswith(("/", "~/")) for k, p in rules), "a Read or Edit deny with no anchor, which no twin follows (R6)"
own_writes = [w for w in writes if not w.startswith(("/", "~"))]
own_rules = [(k, p) for k, p in rules if p.startswith("/") and not p.startswith("//")]
# The twins, derived from the tree's own rules, and the folders above: nothing more is closed, nothing less.
rule_of = lambda n: f"{n}/**" if n == ".claude/rules" else n
want_writes = {f"{WT}/*/{w}" for w in own_writes} | {f"{WT}/*/.git"} | {f"{p}/{n}" for p in ABOVE[1:] for n in INSTRUCTIONS}
want_rules = {f"{k}(/{w}/*{p})" for k, p in own_rules for w in (WT, TMP_WT)} | {f"{k}({MAIN}{p})" for k, p in own_rules}
want_rules |= {f"Edit(/{w}/*/.git)" for w in (WT, TMP_WT)}
want_rules |= {f"Edit(/{q}/{rule_of(n)})" for p in ABOVE for q in (p, tmp(p)) for n in INSTRUCTIONS}
want_rules |= {f"Edit({p}/{rule_of(n)})" for p in ABOVE_MAIN for n in INSTRUCTIONS}
got_writes = {w for w in writes if w.startswith(("/", "~"))}
assert got_writes == want_writes, ("denyWrite's twins", sorted(want_writes - got_writes)[:4], sorted(got_writes - want_writes)[:4])
credentials = {"Read(~/.ssh/**)", "Read(~/.config/gh/**)", "Read(~/.npmrc)", "Read(~/.aws/**)"}  # the wiring section's
got_rules = {f"{k}({p})" for k, p in rules if p.startswith(("//", "~/"))} - credentials
assert got_rules == want_rules, ("the Read and Edit twins", sorted(want_rules - got_rules)[:4], sorted(got_rules - want_rules)[:4])


@functools.cache  # each pattern once: rebuilt, it was 0.8 s of the section's 0.9 (R5)
def glob_re(pattern):
    out, i = "", 0
    while i < len(pattern):
        for token, rx in (("**/", "(.*/)?"), ("**", ".*"), ("*", "[^/]*"), ("?", "[^/]")):
            if pattern.startswith(token, i):
                out, i = out + rx, i + len(token)
                break
        else:
            out, i = out + re.escape(pattern[i]), i + 1
    return out


real = lambda p: "/private" + p if p == "/tmp" or p.startswith("/tmp/") else p  # the kernel's path: the sandbox matches it


def sandbox_path(entry, rule):
    """An entry as the sandbox reads it: denyWrite's own prefixes, or an Edit deny's (// absolute, / this tree), merged in."""
    if rule and entry.startswith("//"):
        entry = entry[1:]
    elif rule and entry.startswith("/"):
        entry = ROOT + entry
    if entry.startswith("~/"):
        entry = HOME + entry[1:]
    elif not entry.startswith("/"):
        entry = ROOT + "/" + entry
    return real(entry)


boxed = [sandbox_path(w, False) for w in writes] + [sandbox_path(p, True) for k, p in rules if k == "Edit"]


def refused(path):
    """Whether the sandbox refuses a command's write to path."""
    path = real(path)
    for e in boxed:
        if any(c in e for c in "*?["):
            if re.fullmatch(glob_re(e) + "(/.*)?", path):
                return True
        elif path == e or path.startswith(e + "/"):
            return True
    return False


def denied(kind, path):
    """Whether the file tools refuse to read or edit path: a rule matches it or a folder holding it; no link is followed, so the
    /tmp spelling has rules of its own. A Read deny also refuses an edit (the permissions page)."""
    held = [path[:n] for n in range(len(path), 0, -1) if n == len(path) or path[n] == "/"]
    for k, p in rules:
        if k == kind or (kind == "Edit" and k == "Read"):
            anchored = p[1:] if p.startswith("//") else HOME + p[1:] if p.startswith("~/") else ROOT + p
            if any(re.fullmatch(glob_re(anchored), h) for h in held):
                return True
    return False


one = lambda p: p.replace("**", "x").replace("*", "core")  # a path a rule names, each glob made one name
# The two the brief names: a file that does not exist yet under a sibling's .githooks/, and an edit of a sibling's scripts/.
for tree in (f"{WT}/slice-7", f"{TMP_WT}/slice-7", f"{WT}/tomorrow"):
    assert refused(f"{tree}/.githooks/probe"), f"a command can write {tree}/.githooks/probe"
    assert denied("Edit", f"{tree}/scripts/stop_gate.sh"), f"the file tools can edit {tree}/scripts/stop_gate.sh"
# Every closed path of a sibling, an existing one or one made tomorrow, by both spellings; and the main checkout's, to the file tools.
for tree in (f"{WT}/slice-7", f"{WT}/tomorrow", f"{TMP_WT}/tomorrow"):
    for w in own_writes + [".git"]:
        assert refused(f"{tree}/{one(w)}"), f"a command can write {tree}/{w}"
    for k, p in own_rules + [("Edit", "/.git")]:
        assert denied(k, f"{tree}{one(p)}"), f"the file tools can {k.lower()} {tree}{p}"
for k, p in own_rules:
    assert denied(k, f"{HOME}/Server/gnoworld{one(p)}"), f"the file tools can {k.lower()} the main checkout's {p}"
    assert k == "Read" or refused(f"{HOME}/Server/gnoworld{one(p)}"), f"a command can write the main checkout's {p}"
# The instructions above every session: to the file tools by both spellings, to commands where the sandbox would let them write.
for p in ABOVE + tuple(HOME + a[1:] for a in ABOVE_MAIN):
    for n in INSTRUCTIONS:
        path = f"{p}/{n}" + ("/x.md" if n == ".claude/rules" else "")
        for spelt in {path, tmp(path) if path.startswith("/private/tmp") else path}:
            assert denied("Edit", spelt), f"the file tools can write {spelt}, which Claude Code reads above every session in it"
        assert p not in ABOVE[1:] or refused(path), f"a command can write {path}, which Claude Code reads above every worktree session"
for p in (f"{WT}/csp.diff", "/private/tmp/claude-501/notes.md", f"{HOME}/Server/notes.md"):
    assert not refused(p) and not denied("Edit", p), f"{p} is closed, and no session reads it as instructions"
# What every session writes: its own tree's open files, a sibling's (the chief's docs and ledger in the integration worktree), the
# gate's state and StrykerJS's copies, git's shared folder, the shared reports, the throwaway trees in $TMPDIR.
for tree in (ROOT, f"{WT}/slice-7", f"{TMP_WT}/tomorrow"):
    for p in ("docs/review/findings.md", "docs/decisions.md", "docs/review-log.md", "adr/0003-x.md", "app/src/main.tsx", ".claude/tmp/gate-green",
              ".stryker-tmp/sandbox-x/app/package.json", ".stryker-tmp/sandbox-x/packages/core/package.json", "node_modules/.vite/x"):
        assert not refused(f"{tree}/{p}") and not denied("Edit", f"{tree}/{p}"), f"{tree}/{p} is closed"
# A worktree's own folder stays open, to its making and to a rename: a glob holds no folder at its `*` (F4893, asked).
assert not refused(f"{WT}/tomorrow"), "a new worktree's folder is closed"
for p in (".git/worktrees/tomorrow/index", ".git/worktrees/tomorrow/HEAD", ".git/worktrees/tomorrow/COMMIT_EDITMSG", ".git/worktrees/tomorrow/MERGE_HEAD",
          ".git/worktrees/tomorrow/MERGE_MSG", ".git/worktrees/tomorrow/ORIG_HEAD", ".git/objects/ab/cdef", ".git/refs/heads/slice-9", ".git/packed-refs",
          ".git/info/exclude", ".git/index", ".git/logs/HEAD", ".claude/tmp/slice-7/reports/slice-7z.md"):
    assert not refused(f"{HOME}/Server/gnoworld/{p}") and not denied("Edit", f"{HOME}/Server/gnoworld/{p}"), f"the main checkout's {p} is closed"
for w in own_writes + ["scripts/guard.py", ".claude/settings.json", ".git"]:
    for throwaway in ("/tmp/claude-501/tmpab12/tree-tmpab12", "/tmp/claude-501/test_hooks.ab12/r", "/private/tmp/claude-501/gnoworld-wt2/x"):
        assert not refused(f"{throwaway}/{one(w)}"), f"a twin closes {throwaway}/{w}, a tree outside the worktrees' folder"
PY
# The sandbox itself, from this command, when it runs in Claude Code's (SANDBOX_RUNTIME=1) with this tree's own rules: a fresh file
# under this tree's .githooks is refused, or the session's rules are another folder's (the chief's, whose project is the main
# checkout; harness_mutate's throwaway tree) and it is SKIPPED, by name, as each part it cannot judge is. Then no write of a sibling
# may pass: under an existing sibling's .githooks, by /tmp and through a link; its Stop hook's script and its settings.json, which
# Claude Code reloads, opened to append nothing, and its Stop hook's script hard-linked; in a worktree made after the session
# started, its .githooks, scripts and .git, and what only an Edit rule closes (.claude's settings, hooks and agents, app's
# package.json), the folders .claude and app themselves staying open. No read either of the main checkout's secrets or a sibling's,
# a folder listed or a file opened, nothing of it read (R3); no CLAUDE.md made above the worktrees, and none there already (S4). Only
# the sandbox's own refusal counts (EPERM), so a probe that cannot run fails. That folder's move out of the worktrees' folder and back
# is printed, F4893's known gap, never failed on (the red pass, T1, T4 to T6). This half cannot be mutated (the sandbox's rules are
# the session's): the static half above is what harness_mutate judges.
if [ "$SANDBOX_RUNTIME" = 1 ]; then
	python3 -I - "$here/.." "$t" <<'PY' || fail "the sandbox's probe of the sibling worktrees found a write, or could not run (above): a write means this session's settings lack 7z's rules or predate them; restart it once apply-7z.sh has run (F4890)"
import errno, os, sys, tempfile

own, scratch = os.path.realpath(sys.argv[1]), sys.argv[2]
WT, name = "/private/tmp/claude-501/gnoworld-wt", f".probe-siblings-{os.getpid()}"


def write(path, folder=False, append=False, link=None):
    """'refused' when the sandbox refuses it; 'written', and undone, when not; any other failure is the probe's own."""
    try:
        if link:
            os.link(link, path)
        elif folder:
            os.mkdir(path)
        elif append:
            open(path, "a").close()  # appends nothing: the file is the same
        else:
            os.close(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644))
    except OSError as e:
        if e.errno == errno.EPERM:
            return "refused"
        raise
    if folder:
        os.rmdir(path)
    elif not append:
        os.unlink(path)
    return "written"


if write(os.path.join(own, ".githooks", name)) != "refused":
    print(f"siblings: SKIPPED (this sandbox does not hold {own}'s own rules: a session started in another folder, or no sandbox)")
    sys.exit(0)
if not os.path.isdir(WT):
    print(f"siblings: SKIPPED (no {WT})")
    sys.exit(0)
wrote, opened = [], []


def closed(path, **how):
    if write(path, **how) != "refused":
        wrote.append(path)


def folder(path):
    """A folder no rule closes, made to stay for what goes in it."""
    try:
        os.mkdir(path)
    except PermissionError as e:
        if e.errno != errno.EPERM:
            raise
        wrote.append(f"{path} (an open folder, refused)")
        return False
    opened.append(path)
    return True


def unread(path, folder=False):
    """A read the sandbox must refuse: a folder listed, a file opened and closed; nothing of either is read or shown (R3)."""
    try:
        os.listdir(path) if folder else os.close(os.open(path, os.O_RDONLY))
    except OSError as e:
        if e.errno != errno.EPERM:
            raise
        return
    wrote.append(f"{path} (read)")


def instructions(path):
    """A file Claude Code reads above every session in it: never there, never made (S4)."""
    try:
        if write(path) != "refused":
            wrote.append(path)
    except FileExistsError:
        wrote.append(f"{path} (already there: instructions every session below it reads)")


tmp = lambda p: "/tmp" + p[len("/private/tmp"):]
others = [os.path.join(WT, d) for d in sorted(os.listdir(WT)) if os.path.isdir(os.path.join(WT, d, ".githooks"))]
others = [d for d in others if os.path.realpath(d) != own and not os.path.basename(d).startswith("probe-siblings-")]  # S7
secrets = os.path.expanduser("~/Server/gnoworld/deploy/secrets")
if os.path.isdir(secrets):
    unread(secrets, folder=True)
else:
    print(f"siblings: SKIPPED (no {secrets}: the main checkout's secrets are not judged)")
for p in (WT, os.path.dirname(WT)):
    instructions(os.path.join(p, "CLAUDE.md"))
if others:
    sibling = others[0]
    os.symlink(sibling, os.path.join(scratch, "sibling"))
    for tree in (sibling, tmp(sibling), os.path.join(scratch, "sibling")):
        closed(os.path.join(tree, ".githooks", name))
    for p in ("scripts/stop_gate.sh", ".claude/settings.json"):
        if os.path.isfile(os.path.join(sibling, p)):
            closed(os.path.join(sibling, p), append=True)
            closed(tmp(os.path.join(sibling, p)), append=True)
    if os.path.isfile(os.path.join(sibling, "scripts/stop_gate.sh")):
        closed(os.path.join(scratch, "linked"), link=os.path.join(sibling, "scripts/stop_gate.sh"))
    for p in (".env", ".env.local"):
        if os.path.isfile(os.path.join(sibling, p)):
            unread(os.path.join(sibling, p))
    if os.path.isdir(os.path.join(sibling, "deploy/secrets")):
        unread(os.path.join(sibling, "deploy/secrets"), folder=True)
else:
    print(f"siblings: SKIPPED (no other tree with a .githooks in {WT}: an existing sibling, /tmp and a link are not judged)")
try:
    fresh = tempfile.mkdtemp(prefix="probe-siblings-", dir=WT)
except PermissionError as e:
    if e.errno != errno.EPERM:
        raise
    fresh = None
    print(f"siblings: SKIPPED (no tree can be made in {WT} at all: a worktree made tomorrow is not judged)")
if fresh:
    try:
        for p in (".githooks", "scripts"):
            closed(os.path.join(fresh, p), folder=True)
            closed(tmp(os.path.join(fresh, p)), folder=True)
        closed(os.path.join(fresh, ".git"))
        if folder(os.path.join(fresh, ".claude")):
            closed(os.path.join(fresh, ".claude/settings.json"))
            for p in ("hooks", "agents"):  # closed at the folder, or at what goes in it, as Claude Code turns `/**` into the sandbox's
                if write(os.path.join(fresh, ".claude", p), folder=True) == "written" and folder(os.path.join(fresh, ".claude", p)):
                    closed(os.path.join(fresh, ".claude", p, "x.md"))
        if folder(os.path.join(fresh, "app")):
            closed(os.path.join(fresh, "app/package.json"))
    finally:
        for p in reversed(opened):
            os.rmdir(p)
    try:
        os.rename(fresh, os.path.join(scratch, "moved"))
    except PermissionError as e:
        if e.errno != errno.EPERM:
            raise
        print("siblings: F4893 looks closed: a worktree's folder could not leave the worktrees' folder; mend the ledger")
    else:
        os.rename(os.path.join(scratch, "moved"), fresh)
        print("siblings: KNOWN GAP F4893: a worktree's folder moves out of the worktrees' folder and back")
    os.rmdir(fresh)
if wrote:
    print("siblings: the sandbox let this command write " + ", ".join(wrote))
    sys.exit(1)
print(f"siblings: the sandbox refused every write into {WT}'s other trees")
PY
fi
fi

if part commit_msg; then
# commit-msg: a conventional subject of 72 characters at most, or git's own merge and revert
# subjects; no attribution line. It runs as installed, beside its rule files (F129).
cm="$t/commit-msg"
mkdir "$cm"
cp "$hooks/commit-msg" "$cm/"
secrets_into "$cm/"
# It reads what is staged: it runs in a repository of its own, never the one under test.
cmr="$t/commit-msg-repo" && git init -q "$cmr"
refused() {
	printf '%s\n' "$1" >"$t/msg"
	! (cd "$cmr" && "$cm/commit-msg" "$t/msg") 2>"$t/err"
}
refused "fix: x

Co-Authored-By: a <noreply@anthropic.com>" || fail "a co-author line was accepted"
refused "fix: x

🤖 Generated with [Claude Code](https://claude.com/claude-code)" || fail "a robot line was accepted"
refused "fix: x

Generated by Claude Code" || fail "'Generated by Claude' was accepted"
refused "fix: x

Assisted-by: Claude" || fail "'Assisted-by' was accepted"
# A session's link is an attribution too (F591): refused as a line, kept inside a sentence.
refused "fix: x

Claude-Session: https://claude.ai/code/session_0123" || fail "a Claude-Session line was accepted (F591)"
refused "docs: the hook refuses Claude-Session lines" && fail "a mention of Claude-Session inside a sentence was refused"
# gitleaks reads files, not messages: a message holds no home folder either (F090).
refused "fix: x

Seen in /Us""ers/alice/notes." || fail "a message naming a home folder was accepted"
refused "fix: x

Seen in /Us""ers/alice/notes gitleaks:allow" || fail "gitleaks:allow let a home folder through a message (F113)"
refused "fix: x

aws = $key" || fail "a message holding a key was accepted"
printf 'fix: x\n' >"$t/msg"
(cd "$cmr" && PATH=/usr/bin:/bin "$cm/commit-msg" "$t/msg") 2>"$t/err" && fail "commit-msg passed with no gitleaks to scan the message"
grep -q "gitleaks is not installed" "$t/err" || fail "commit-msg did not say gitleaks is missing (F125)"
grep -q "the message holds" "$t/err" && fail "commit-msg blamed the message for a missing gitleaks (F125)"
refused "chore(seal): regenerate the vectors

Generated with tools/sealvec after the rotation." && fail "a plain 'Generated with' was refused"
refused "docs: link https://claude.ai/code/artifact/abc" && fail "a claude.ai link was refused"
refused "docs: commit-msg also refuses 'Generated by Claude' lines" && fail "a mention inside a sentence was refused"
refused "feat(core)!: parse IRC lines" && fail "a breaking-change subject was refused"
refused "Merge branch 'slice-1a'" && fail "git's merge subject was refused"
refused 'Revert "feat: x"' && fail "git's revert subject was refused"
refused "fixup! feat(core): parse IRC lines" && fail "a fixup subject was refused"
refused "squash! feat(core): parse IRC lines" && fail "a squash subject was refused"
refused "Add the parser" || fail "a subject with no type was accepted"
refused "feature: add the parser" || fail "an unknown type was accepted"
refused "feat:add the parser" || fail "a type with no space after it was accepted"
refused "feat: $(printf 'a%.0s' $(seq 1 67))" || fail "a 73-character subject was accepted"
refused "feat: $(printf 'a%.0s' $(seq 1 66))" && fail "a 72-character subject was refused"
# Characters, not bytes, whatever the locale: 66 characters, 78 bytes.
printf '%s\n' "docs(review): café résumé naïve déjà vu — été, hiver, février, déc" >"$t/msg"
(cd "$cmr" && LC_ALL=C "$cm/commit-msg" "$t/msg") 2>/dev/null || fail "commit-msg counted bytes, not characters, under the C locale"
# A fix of the product comes with its test, or a line No-test: <why>, as prove_fix.py wants, refused
# at the commit rather than 30 minutes later by the full gate (9db841c, slice 3).
mkdir -p "$cmr/server/src" "$cmr/scripts" && printf 'x\n' >"$cmr/server/src/a.ts" && git -C "$cmr" add server/src/a.ts
refused "fix(server): x" || fail "a fix of the product with no test was accepted (9db841c)"
grep -q "comes with the test that shows its bug" "$t/err" || fail "commit-msg did not say a fix wants its test: $(cat "$t/err")"
refused "fix(server)!: x" || fail "a breaking fix of the product with no test was accepted"
refused "fix(server): x

No-test: only a log line changes" && fail "a fix with its No-test line was refused"
refused "fix(server): x

No-test: " || fail "a No-test line with no reason was accepted"
refused "feat(server): x" && fail "a feat with no test was refused"
printf 'x\n' >"$cmr/server/src/a.test.ts" && git -C "$cmr" add server/src/a.test.ts
refused "fix(server): x" && fail "a fix with its test was refused"
git -C "$cmr" rm -q --cached server/src/a.ts
refused "fix(server): x" && fail "a fix of a test alone was refused"
git -C "$cmr" rm -q --cached server/src/a.test.ts && printf 'x\n' >"$cmr/scripts/a.sh" && git -C "$cmr" add scripts/a.sh
refused "fix(harness): x" && fail "a fix of the harness alone was refused"
git -C "$cmr" add server/src/a.ts && git -C "$cmr" commit -qm "feat(server): x" && git -C "$cmr" rm -q server/src/a.ts
refused "fix(server): x" || fail "a fix that deletes product code with no test was accepted"
# A test it deletes proves nothing: prove_fix.py runs only the tests a fix leaves.
printf 'x\n' >"$cmr/server/src/b.ts" && printf 'x\n' >"$cmr/server/src/b.test.ts" && git -C "$cmr" add server/src && git -C "$cmr" commit -qm "feat(server): b"
printf 'y\n' >>"$cmr/server/src/b.ts" && git -C "$cmr" add server/src/b.ts && git -C "$cmr" rm -q server/src/b.test.ts
refused "fix(server): x" || fail "a fix whose only test it deletes was accepted"
git -C "$cmr" reset -q HEAD server/src/b.ts
refused "fix(server): x" && fail "a fix that only deletes a test was refused, which changes no product code"
mkdir -p "$t/no-repo" && printf 'fix(server): x\n' >"$t/msg"
(cd "$t/no-repo" && GIT_CEILING_DIRECTORIES="$t" "$cm/commit-msg" "$t/msg") 2>"$t/err" && fail "commit-msg passed a fix it could not compare with what is staged"
grep -q "git cannot list what is staged" "$t/err" || fail "commit-msg did not say git failed: $(cat "$t/err")"
fi

if part pre_commit; then
# pre-commit: when mktemp fails, it stops before exporting anything. Fake
# mktemp and git binaries make the failure happen without touching the disk.
mkdir "$t/bin"
printf '#!/bin/sh\nexit 1\n' >"$t/bin/mktemp"
printf '#!/bin/sh\ncase $1 in diff) exit 1 ;; checkout-index) echo "$*" >>"%s/exported" ;; esac\n' "$t" >"$t/bin/git"
printf '#!/bin/sh\nexit 0\n' >"$t/bin/gitleaks" # the secret scan passes, so mktemp is what fails
chmod +x "$t/bin/mktemp" "$t/bin/git" "$t/bin/gitleaks"
if PATH="$t/bin:$PATH" "$hooks/pre-commit" 2>/dev/null; then
	fail "pre-commit passed though mktemp failed"
fi
[ ! -e "$t/exported" ] || fail "pre-commit exported the index after mktemp failed: $(cat "$t/exported")"
fi

if part stop_gate; then
# stop_gate runs outside the sandbox, so it runs nothing a sandboxed command could write: it
# compares the tree with the state check.sh last passed on. It passes on a second stop, on
# docs-only changes, and on a state the gate passed; otherwise it blocks (exit 2).
gate="$here"/stop_gate.sh
r="$t/repo"
mkdir -p "$r/scripts" "$r/docs" "$r/.claude/tmp"
printf '#!/bin/sh\ntouch "%s/gate-ran"\n' "$t" >"$r/scripts/check.sh"
cp "$here/code_changed.sh" "$r/scripts/" && printf '.claude/tmp/\n' >"$r/.gitignore"
git -C "$r" init -q && git -C "$r" add -A && git -C "$r" commit -qm init
stop() { printf '%s' "$1" | CLAUDE_PROJECT_DIR="$r" sh "$gate" 2>/dev/null; }
green() { (cd "$r" && sh scripts/code_changed.sh --state >.claude/tmp/gate-green); }
echo note >"$r/docs/n.md"
stop '{"stop_hook_active":false}' || fail "stop_gate blocked a docs-only change"
echo 'package x' >"$r/x.go"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate did not block a code change the gate never passed (exit $code)"
[ ! -e "$t/gate-ran" ] || fail "stop_gate ran the repository's check.sh outside the sandbox"
stop '{"stop_hook_active":true}' || fail "stop_gate blocked a second stop in a row"
# Once per tree: a later turn that stops on the tree it blocked already learns nothing new.
stop '{"stop_hook_active":false}' || fail "stop_gate blocked again a tree it had blocked once"
green && { stop '{"stop_hook_active":false}' || fail "stop_gate blocked a state the gate passed"; }
echo 'package y' >"$r/x.go"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate let through a change made after the gate passed (exit $code)"
stop '{"stop_hook_active":false}' || fail "stop_gate blocked again a second tree it had blocked once"
echo 'package z' >"$r/x.go"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate let a change through after a stop it had passed (exit $code)"
echo 'package y' >"$r/x.go"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate let through a tree it blocked before another one (exit $code)"
# A record it cannot write still blocks: a hook that fails otherwise lets the turn end.
echo 'package w' >"$r/x.go" && rm -f "$r/.claude/tmp/gate-blocked" && mkdir "$r/.claude/tmp/gate-blocked"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate let a change through when it could not record the tree (exit $code)"
rmdir "$r/.claude/tmp/gate-blocked"
rm "$r/x.go" && echo '{}' >"$r/.claude/settings.json"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate let a settings.json change through (exit $code)"
# Docs written or committed after the gate passed leave the code it passed on unchanged.
green && echo more >>"$r/docs/n.md" && { stop '{"stop_hook_active":false}' || fail "stop_gate blocked a docs edit after the gate passed"; }
git -C "$r" add docs/n.md && git -C "$r" commit -qm docs
stop '{"stop_hook_active":false}' || fail "stop_gate blocked a docs-only commit after the gate passed"
git -C "$r" add .claude/settings.json && git -C "$r" commit -qm settings && echo '{"a":1}' >"$r/.claude/settings.json"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate let a code change through after a commit (exit $code)"
green && echo '{"a":2}' >"$r/.claude/settings.json"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate let an unstaged edit of a tracked file through (exit $code)"
# It also stops what runs of this project left behind, at the end of every turn, before anything else (Alexis,
# 2026-10-29: six StrykerJS workers whose run was killed spun at 75% of a core each for 31 hours, a vitest for 6 days).
# The sandbox refuses ps; this hook runs outside it. A process of this project names a folder `gnoworld/` (any case:
# the checkout, a session's scratchpad) in its command, run by node. It is stopped when its parent is gone (PPID 1) and it
# is 30 minutes old or more (a session's server started a moment ago is spared), 2 hours while a gate runs (sh, bash or ./
# running scripts/check.sh, with a parent); or when it is a test tool's (vitest, stryker, playwright, storybook), not in a
# dev or watch mode, 3 hours old or more, whatever its parent. TERM first, KILL a second later.
# Each is logged to ~/Library/Logs/gnoworld-reaped.log, where the sandbox cannot write, as `<pid> <seconds> <command>`.
# Nothing else: another project, an editor, this project's dev server, a young test tool whose run lives. Here a fake ps,
# padded as ps pads, describes real sleeping processes.
mkdir -p "$t/fakeps"
for n in 1 2 3 4 5 6 7 8 9 10 11 13 14 15 16; do sleep 60 </dev/null >/dev/null 2>&1 & eval "z$n=\$!"; done # nothing of the suite held open
sh -c "trap '' TERM; while :; do sleep 1; done" </dev/null >/dev/null 2>&1 & z12=$! # a worker deaf to TERM
table() { # $1: the line of a gate's run, or a line that only mentions one
	printf '%6s %5s %11s %s\n' \
		"$z1" 1 30:00 "/opt/homebrew/bin/node --require /private/tmp/claude-501/-Users-twee-Server-gnoworld/s/scratchpad/wt/node_modules/@stryker-mutator/w.js" \
		"$z2" "$$" 6-04:00:00 "node /srv/gnoworld/node_modules/.pnpm/vitest@4/node_modules/vitest/vitest.mjs" \
		"$z3" "$$" 02:59:59 "node /srv/gnoworld/node_modules/@stryker-mutator/core/bin/stryker.js" \
		"$z4" 1 2-01:00:00 "node /srv/other/server.js" \
		"$z5" "$$" 10:00:00 "node /srv/gnoworld/node_modules/.bin/vite dev" \
		"$z6" 1 01:59:59 "node /srv/gnoworld/app/tests/e2e/api.mjs" \
		"$z7" 1 02:00:00 "node /srv/gnoworld/app/tests/e2e/serve.mjs" \
		"$z8" "$$" 05:00:00 "node /srv/other/node_modules/vitest/vitest.mjs" \
		"$z9" 1 10:00 "node /srv/other/node_modules/@stryker-mutator/w.js" \
		"$z10" 1 1-00:00:00 "node /srv/gnoworld-other/x.js" \
		"$z11" "$$" 03:00:00 "node /srv/GnoWorld/app/node_modules/@playwright/test/cli.js test" \
		"$z12" 1 1-07:00:00 "node --require /private/tmp/claude-501/-Users-twee-Server-gnoworld/s/w.js" \
		"$z13" "$$" 03:00:00 "nvim /srv/gnoworld/app/.storybook/preview.tsx" \
		"$z14" 1 10:00 "vim /srv/gnoworld/server/src/vitest.config.ts" \
		"$z15" "$$" 05:00:00 "node /srv/gnoworld/node_modules/.bin/storybook dev -p 6006" \
		"$z16" 1 29:59 "node /srv/gnoworld/app/tests/e2e/serve.mjs"
	[ -z "${1:-}" ] || printf '%6s %5s %11s %s\n' "$$" "${2:-$$}" 05:00 "$1"
}
gone() { n=0; while kill -0 "$1" 2>/dev/null; do n=$((n + 1)); [ "$n" -lt 40 ] || return 1; sleep 0.1; done; }
alive() { kill -0 "$1" 2>/dev/null; }
fakeps() { # $1: its exit status; then table's argument
	code=$1 && shift
	table "$@" >"$t/fakeps/table" && printf '#!/bin/sh\ncat "%s"\nexit %s\n' "$t/fakeps/table" "$code" >"$t/fakeps/ps" && chmod +x "$t/fakeps/ps"
}
reap() { printf '{"stop_hook_active":true}' | HOME="$t/home" PATH="$t/fakeps:$PATH" CLAUDE_PROJECT_DIR="$r" sh "$gate" 2>/dev/null || fail "stop_gate failed while stopping what runs left behind"; }
reaped="$t/home/Library/Logs/gnoworld-reaped.log"
# What the sandbox can plant, the hook never writes through (security-S1, S2): a link at the log's old place and at the
# blocked tree's record, to files outside the sandbox.
printf 'mine\n' >"$t/victim" && ln -s "$t/victim" "$r/.claude/tmp/reaped.log"
fakeps 0 "bash /srv/gnoworld/scripts/check.sh --full" && reap
for z in "$z2" "$z7" "$z11" "$z12"; do gone "$z" || fail "stop_gate left $(grep "^ *$z " "$t/fakeps/table")"; done
for z in "$z1" "$z6"; do alive "$z" || fail "stop_gate stopped a young orphan while a gate runs, maybe the gate's: $(grep "^ *$z " "$t/fakeps/table")"; done
grep -q "^$z2 [0-9]* node /srv/gnoworld/" "$reaped" || fail "stop_gate did not log <pid> <seconds> <command>: $(cat "$reaped")"
grep -q "^$z2 532800 " "$reaped" || fail "stop_gate misread 6-04:00:00 as $(grep "^$z2 " "$reaped")"
[ "$(cat "$t/victim")" = mine ] || fail "stop_gate wrote its log through a link the sandbox planted: $(cat "$t/victim")"
rm "$r/.claude/tmp/reaped.log"
# A command that only mentions check.sh (an editor, a grep), or a check.sh whose own parent is gone, is no gate: the young
# orphans go.
fakeps 0 "sh scripts/check.sh --merge" 1 && reap
for z in "$z1" "$z6"; do gone "$z" || fail "stop_gate took an orphaned check.sh for a live gate: $(grep "^ *$z " "$t/fakeps/table")"; done
for n in 1 6; do sleep 60 </dev/null >/dev/null 2>&1 & eval "z$n=\$!"; done
fakeps 0 "vim scripts/check.sh" && reap
for z in "$z1" "$z6"; do gone "$z" || fail "stop_gate took a mention of check.sh for a gate: $(grep "^ *$z " "$t/fakeps/table")"; done
for z in "$z3" "$z4" "$z5" "$z8" "$z9" "$z10" "$z13" "$z14" "$z15" "$z16"; do alive "$z" || fail "stop_gate stopped $(grep "^ *$z " "$t/fakeps/table")"; done
# What fails in the cleanup never costs the gate's block: ps failing, the log unwritable.
fakeps 1 && rm -f "$reaped" && mkdir -p "$reaped" && echo '{"a":3}' >"$r/.claude/settings.json"
code=0; printf '{"stop_hook_active":false}' | HOME="$t/home" PATH="$t/fakeps:$PATH" CLAUDE_PROJECT_DIR="$r" sh "$gate" 2>/dev/null || code=$?
[ "$code" = 2 ] || fail "stop_gate lost its block when ps failed and the log could not be written (exit $code)"
rmdir "$reaped"
# The blocked tree's record, a link the sandbox planted: still blocked, and the file it points at untouched.
rm -f "$r/.claude/tmp/gate-blocked" && ln -s "$t/victim" "$r/.claude/tmp/gate-blocked" && echo '{"a":4}' >"$r/.claude/settings.json"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] && [ "$(cat "$t/victim")" = mine ] || fail "stop_gate wrote its blocked tree through a planted link, or let the change through (exit $code): $(cat "$t/victim")"
rm -f "$r/.claude/tmp/gate-blocked"
# .claude/tmp itself, a link the sandbox planted to a folder outside it: still blocked, nothing written there.
mv "$r/.claude/tmp" "$r/.claude/tmp.real" && mkdir "$t/elsewhere" && ln -s "$t/elsewhere" "$r/.claude/tmp" && echo '{"a":5}' >"$r/.claude/settings.json"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] && [ -z "$(ls -A "$t/elsewhere")" ] || fail "stop_gate wrote through a planted .claude/tmp, or let the change through (exit $code): $(ls -A "$t/elsewhere")"
rm "$r/.claude/tmp" && mv "$r/.claude/tmp.real" "$r/.claude/tmp"
for n in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16; do eval "kill -9 \$z$n" 2>/dev/null || :; done
fi

if part check_docs; then
# check_docs: a harness doc that names a missing harness file fails the gate.
docs="$here"/check_docs.py
d="$t/docs-root"
mkdir -p "$d/scripts" "$d/.claude/rules"
touch "$d/scripts/real.sh"
printf 'Run `scripts/real.sh`, see `docs/plans/slice-$ARGUMENTS.md`.\n' >"$d/CLAUDE.md"
good_rules "$d"
python3 -I "$docs" "$d" >/dev/null 2>&1 || fail "check_docs refused a doc whose files exist"
printf 'Run `scripts/gone.sh`.\n' >"$d/.claude/rules/x.md"
python3 -I "$docs" "$d" >/dev/null 2>&1 && fail "check_docs accepted a doc naming a missing file"
rm "$d/.claude/rules/x.md"
git -C "$d" init -q && printf '.claude/tmp/\n' >"$d/.gitignore" && mkdir -p "$d/.claude/tmp/copy"
printf 'Run `scripts/gone.sh`.\n' >"$d/.claude/tmp/copy/x.md"
python3 -I "$docs" "$d" >/dev/null 2>&1 || fail "check_docs read a doc in a folder git ignores"
# docs/REVIEW.md's tier-1 rows and the workflow's TIER1 name the same paths, both ways, on every commit, prose alone included (F4928;
# workflow_branch held it, which a commit of the table alone never ran: 7y's c160019e). A row added without the workflow, an entry no
# row names, and no TIER1 to compare with each fail; a row of another tier, the harness's folders and the realms' two do not count.
v="$t/tiers-root" && mkdir -p "$v/docs" "$v/.claude/workflows" && : >"$v/CLAUDE.md" && good_rules "$v"
{ printf 'const TIER1 = [\n'; for p in scripts .githooks .github .claude gno; do printf '  "%s/",\n' "$p"; done
	for p in a b c d e f g h i j; do printf '  "src/%s/",\n' "$p"; done; printf '  ...(A.tier1 ?? []),\n];\n'; } >"$t/branch.js"
cp "$t/branch.js" "$v/.claude/workflows/branch.js"
{ printf '| Tier | What |\n|---|---|\n| 1 | Realms (`gno/r/`, `gno/p/`) |\n'; for p in a b c d e f g h i j; do printf '| 1 | The %s (`src/%s/`) |\n' "$p" "$p"; done; printf '| 3 | Interface (`src/z/`) |\n'; } >"$t/tiers.md"
tiers() { python3 -I "$docs" "$v" 2>&1; }
cp "$t/tiers.md" "$v/docs/REVIEW.md"
out=$(tiers) || fail "check_docs refused a tier-1 table and a TIER1 that name the same paths: $out"
printf '| 1 | The new guard (`src/new.ts`) |\n' >>"$v/docs/REVIEW.md"
out=$(tiers) && fail "check_docs accepted a tier-1 row the workflow's TIER1 lacks (7y's c160019e)"
printf '%s' "$out" | grep -qF "names src/new.ts as tier 1" || fail "check_docs did not name the row TIER1 lacks: $out"
grep -v 'src/j/' "$t/tiers.md" >"$v/docs/REVIEW.md"
out=$(tiers) && fail "check_docs accepted a TIER1 entry no tier-1 row names"
printf '%s' "$out" | grep -qF "TIER1 holds src/j/" || fail "check_docs did not name the TIER1 entry no row names: $out"
cp "$t/tiers.md" "$v/docs/REVIEW.md" && rm "$v/.claude/workflows/branch.js"
out=$(tiers) && fail "check_docs accepted a tier-1 table with no TIER1 to compare with"
# The table as speeds.py reads it, a row spelled `|1|` too; the harness's own folders required in TIER1; an entry in a comment no
# entry (7w2's second lot, S2-10, S2-9, S2-12).
cp "$t/branch.js" "$v/.claude/workflows/branch.js" && printf '|1| The relay (`src/relay/`) |\n' >>"$v/docs/REVIEW.md"
out=$(tiers) && fail "check_docs accepted a tier-1 row spelled |1|, which speeds.py reads as tier 1"
cp "$t/tiers.md" "$v/docs/REVIEW.md" && grep -v '"scripts/"' "$t/branch.js" >"$v/.claude/workflows/branch.js"
out=$(tiers) && fail "check_docs accepted a TIER1 without scripts/, tier 1 by the harness's own rule"
printf '%s' "$out" | grep -qF "TIER1 lacks scripts/" || fail "check_docs did not name the harness's folder TIER1 lacks: $out"
{ printf 'const TIER1 = [\n  /*\n  "src/k/",\n  */\n'; tail -n +2 "$t/branch.js"; } >"$v/.claude/workflows/branch.js" && printf '| 1 | The k (`src/k/`) |\n' >>"$v/docs/REVIEW.md"
out=$(tiers) && fail "check_docs took an entry in a comment of TIER1 for an entry"
cp "$t/branch.js" "$v/.claude/workflows/branch.js" && cp "$t/tiers.md" "$v/docs/REVIEW.md"
# The rules the review depends on, which no other check reads: each of the four agents' briefs says the git-index rule,
# in its full sentence, and the review card keeps its item 8 (G12); a missing file, folder or sentence fails (CR2).
r="$t/rules-root" && mkdir -p "$r" && : >"$r/CLAUDE.md" && good_rules "$r"
rules() { python3 -I "$docs" "$r" 2>&1; }
rules >/dev/null || fail "check_docs refused four agents with the git-index rule and a review card with its item 8"
printf 'You never edit.\n' >"$r/.claude/agents/test-auditor.md"
out=$(rules) && fail "check_docs accepted an agent whose brief lost the git-index rule"
printf '%s' "$out" | grep -qF "agents/test-auditor.md" || fail "check_docs did not name the agent without the rule: $out"
printf '%s' "$out" | grep -qF "agents/security-reviewer.md" && fail "check_docs named an agent that has the rule: $out"
printf 'You may run a git command that writes the index or the work tree.\n' >"$r/.claude/agents/test-auditor.md"
rules >/dev/null && fail "check_docs accepted a brief that allows what the rule forbids (CR2)"
printf 'Never run a git command that reads the index.\n' >"$r/.claude/agents/test-auditor.md"
rules >/dev/null && fail "check_docs accepted a brief whose sentence is another's (CR2)"
good_rules "$r"
rm "$r/.claude/agents/design-reviewer.md"
out=$(rules) && fail "check_docs accepted a root with no design-reviewer brief (harness-c, 5)"
printf '%s' "$out" | grep -qF "agents/design-reviewer.md: the agent's brief is missing" || fail "check_docs did not name the missing design-reviewer brief: $out"
good_rules "$r"
rm "$r/.claude/agents/test-auditor.md"
out=$(rules) && fail "check_docs accepted a missing agent file (CR2)"
printf '%s' "$out" | grep -qF "agents/test-auditor.md: the agent's brief is missing" || fail "check_docs did not name the missing agent file: $out"
good_rules "$r" && printf 'No rule.\n' >"$r/.claude/agents/extra.md"
rules >/dev/null && fail "check_docs accepted an added agent whose brief has no rule (CR2)"
rm "$r/.claude/agents/extra.md"
rm -r "${r:?}/.claude/agents"
rules >/dev/null && fail "check_docs accepted a root with no agents folder (CR2)"
good_rules "$r"
printf '7. Cards.\n' >"$r/CLAUDE.md"
out=$(rules) && fail "check_docs accepted a review card with no item 8"
printf '%s' "$out" | grep -qF "Risk and undo" || fail "check_docs did not name the missing item 8: $out"
rm "$r/CLAUDE.md"
rules >/dev/null && fail "check_docs accepted a root with no CLAUDE.md, whose item 8 nothing can hold (CR2)"
# The findings ledger: a known status, a fixed finding names a commit that exists, a rejected
# one says why, and no id twice.
git -C "$d" add -A && git -C "$d" commit -qm base && sha=$(git -C "$d" rev-parse --short HEAD)
mkdir -p "$d/docs/review"
row() { printf '| Id | Found | By | Where | Claim | Status | Evidence |\n|---|---|---|---|---|---|---|\n%s\n' "$1" >"$d/docs/review/findings.md"; python3 -I "$docs" "$d" >/dev/null 2>&1; }
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | fixed | \`$sha\`, its test |" || fail "check_docs refused a fixed finding naming its commit"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | rejected | the code already checks it |" || fail "check_docs refused a rejected finding with its reason"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | done | x |" && fail "check_docs accepted an unknown status"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | fixed | \`0badc0de\` |" && fail "check_docs accepted a fixed finding naming no commit of the repo"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | rejected | — |" && fail "check_docs accepted a rejected finding with no reason"
# As Anthropic sorts its reviewer's comments: true but wanted, or true and of no matter, each with its reason.
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | intended | the plan wants it |" || fail "check_docs refused an intended finding with its reason"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | moot | nothing reads it |" || fail "check_docs refused a moot finding with its reason"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | intended | — |" && fail "check_docs accepted an intended finding with no reason"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | moot | — |" && fail "check_docs accepted a moot finding with no reason"
row "| F001 | 2026-10-17 | a | x.py:1 | a | claimed | — |
| F001 | 2026-10-17 | b | y.py:1 | b | claimed | — |" && fail "check_docs accepted an id used twice"
# A four-digit id is a row too: the ledger passed F1000 on, unread (F1212).
row "| F1001 | 2026-10-27 | a | x.py:1 | a bug | fixed | \`0badc0de\` |" && fail "check_docs did not read a row whose id has four digits"
row "| F1001 | 2026-10-27 | a | x.py:1 | a | claimed | — |
| F1001 | 2026-10-27 | b | y.py:1 | b | claimed | — |" && fail "check_docs accepted a four-digit id used twice"
row "| F1001 | 2026-10-27 | a | x.py:1 | a bug | fixed | \`$sha\`, its test |" || fail "check_docs refused a fixed finding of four digits naming its commit"
# Every commit a row cites is one, whatever its status (slice 3 read a fix's first only); outside a repository,
# pre-commit's staged copy, none can be checked.
blob=$(git -C "$d" rev-parse --short HEAD:scripts/real.sh) && full=$(git -C "$d" rev-parse HEAD)
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | rejected | as \`$sha\` shows |" || fail "check_docs refused a rejected finding citing a commit of the repo"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | moot | as \`$full\` shows |" || fail "check_docs refused a full hash of a commit of the repo"
for status in claimed reproduced rejected intended moot asked; do
	row "| F001 | 2026-10-17 | a | x.py:1 | a bug | $status | as \`0badc0de\` shows |" && fail "check_docs accepted a $status finding citing no commit of the repo"
done
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | moot | as \`0badc0de0badc0de0badc0de0badc0de0badc0de\` shows |" && fail "check_docs accepted a full hash the repo lacks"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | fixed | \`$sha\`, then \`0badc0de\` |" && fail "check_docs accepted a fix citing a second commit the repo lacks"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | claimed | as \`$blob\` holds |" && fail "check_docs accepted a cited blob as a commit"
row "| F001 | 2026-10-17 | a | x.py:1 | a bug | fixed | its test |" && fail "check_docs accepted a fixed finding citing no commit"
o="$t/docs-copy" && mkdir -p "$o/docs/review" && good_rules "$o"
printf '| Id | Found | By | Where | Claim | Status | Evidence |\n|---|---|---|---|---|---|---|\n| F001 | 2026-10-17 | a | x.py:1 | a bug | fixed | `0badc0de` |\n| F002 | 2026-10-17 | a | x.py:1 | a bug | moot | as `0badc0de` shows |\n' >"$o/docs/review/findings.md"
python3 -I "$docs" "$o" >/dev/null 2>&1 || fail "check_docs refused cited commits outside a repository, where none can be read"
rm -r "$d/docs/review"
# A test sits beside the file it tests, under its name (docs/ARCHITECTURE.md, "Naming").
mkdir -p "$d/app/src/routes" "$d/packages/core/src"
touch "$d/app/src/routes/home.tsx" "$d/app/src/routes/home.test.tsx" "$d/packages/core/src/irc.ts" "$d/packages/core/src/irc.test.ts"
python3 -I "$docs" "$d" >/dev/null 2>&1 || fail "check_docs refused tests beside their files"
for orphan in app/src/routes/routes.test.tsx packages/core/src/parse.test.ts; do
	touch "$d/$orphan"
	python3 -I "$docs" "$d" >/dev/null 2>&1 && fail "check_docs accepted $orphan, beside no file of its name"
	rm "$d/$orphan"
done
# What git ignores (a mutation tester's sandbox) and what is no test (a snapshot) are not read.
printf '.stryker-tmp/\n' >>"$d/.gitignore" && mkdir -p "$d/.stryker-tmp/x/app/src" "$d/app/src/routes/__snapshots__"
touch "$d/.stryker-tmp/x/app/src/orphan.test.ts" "$d/app/src/routes/__snapshots__/home.test.tsx.snap" "$d/app/src/routes/home.test.data.ts"
python3 -I "$docs" "$d" >/dev/null 2>&1 || fail "check_docs read a folder git ignores, or a snapshot, as tests"
rm -r "$d/.stryker-tmp" "$d/app/src/routes/__snapshots__" "$d/app/src/routes/home.test.data.ts"
rm -r "$d/app" "$d/packages"
# The alerts the server logs are the runbook's list of alerts, which ops matches, both ways (slice 3's plan, 3n;
# F646): a test's ignored, each quoted in the list's own bullet, a name quoted elsewhere not counting.
mkdir -p "$d/server/src"
# The known limits slice 3's plan has the runbook say (its section 8; 3M-19), each by a phrase of its line; list
# leaves out the one its third argument names.
known="evaded with a new address
a connection already open lasts until it drops
A mistaken hide stays
left unchecked by a provider outage
Restricted, not encrypted
never sent to OpenAI
100 accounts a members room
Nobody is invited at login
no age: decision 154's 14 days
Ergo deletes history by age alone
the erasure path (slice 12) are blockers"
list() {
	printf 'Prose quoting `%s` elsewhere.\n\n- **Every alert**: %s.\n- **Next**: none.\n\n%s\n' "${2:-other_name}" "$1" \
		"$(printf '%s\n' "$known" | grep -vxF -- "${3:-}" | sed 's/$/./')" >"$d/docs/OPERATIONS.md"
}
printf 'log("alert", { error: "disk_full" });\nlog("alert", { error: "rows_near_cap" });\n' >"$d/server/src/job.ts"
printf 'log("alert", { error: "only_in_a_test" });\n' >"$d/server/src/job.test.ts"
list '`disk_full` (the disk is full), `rows_near_cap` (rows near their cap)'
python3 -I "$docs" "$d" >/dev/null 2>&1 || fail "check_docs refused a list naming every alert, with its prose"
printf '%s\n' "$known" | while IFS= read -r limit; do
	out=$(list '`disk_full`, `rows_near_cap`' "" "$limit" && python3 -I "$docs" "$d" 2>&1) && fail "check_docs accepted a runbook without its known limit: $limit"
	printf '%s' "$out" | grep -qF -- "$limit" || fail "check_docs did not name the known limit missing: $limit"
	printf '%s\n' "$known" | while IFS= read -r other; do
		[ "$other" = "$limit" ] || ! printf '%s' "$out" | grep -qF -- "$other" || fail "check_docs named a known limit the runbook holds: $other"
	done
done
list '`disk_full`, `rows_near_cap`' "" "Restricted, not encrypted" && printf 'restricted, not encrypted.\n' >>"$d/docs/OPERATIONS.md"
python3 -I "$docs" "$d" >/dev/null 2>&1 && fail "check_docs accepted a known limit in other letters"
list '`disk_full`, `rows_near_cap`'
python3 -I -c 'import sys; p = sys.argv[1]; s = open(p).read(); open(p, "w").write(s.replace("Restricted, not", "Restricted,\t\n\n  not"))' "$d/docs/OPERATIONS.md"
python3 -I "$docs" "$d" >/dev/null 2>&1 || fail "check_docs refused a known limit wrapped across lines"
list '`disk_full`'
python3 -I "$docs" "$d" >/dev/null 2>&1 && fail "check_docs accepted an alert the list leaves out"
list '`disk_full`' rows_near_cap
python3 -I "$docs" "$d" >/dev/null 2>&1 && fail "check_docs accepted an alert quoted outside the list only"
list '`rows_near_cap`, and disk_full unquoted'
python3 -I "$docs" "$d" >/dev/null 2>&1 && fail "check_docs accepted an alert the list names unquoted"
list '`disk_full`, `rows_near_cap`, `gone_now`'
python3 -I "$docs" "$d" >/dev/null 2>&1 && fail "check_docs accepted a listed alert the server no longer logs"
# Each spelling Prettier and people write (F637): across lines, the name after another key, single quotes.
printf 'log(\n  "alert",\n  { room, error: "split_name" },\n);\nlog('"'"'alert'"'"', { error: '"'"'quoted_name'"'"' });\n' >"$d/server/src/job.ts"
list '`split_name`, `quoted_name`'
python3 -I "$docs" "$d" >/dev/null 2>&1 || fail "check_docs refused alerts written across lines or in single quotes"
list '`quoted_name`'
python3 -I "$docs" "$d" >/dev/null 2>&1 && fail "check_docs accepted an alert written across lines the list leaves out"
# An alert it cannot read is refused rather than passed over (F646): a name in a variable, the event as a
# template or a constant.
list none
for call in 'const which = "hidden_name";\nlog("alert", { error: which });' 'log(`alert`, { error: "tpl_name" });' \
	'const ALERT = "alert";\nlog(ALERT, { error: "const_name" });'; do
	printf "$call\n" >"$d/server/src/job.ts"
	python3 -I "$docs" "$d" >/dev/null 2>&1 && fail "check_docs accepted an alert it cannot read: $call"
done
rm -r "$d/server" "$d/docs/OPERATIONS.md"
fi

if part harness_mutate; then
# harness_mutate --dry, in the fast gate: each mutant still finds its text, each guard file has its sections and
# each section exists; the full gate saw a stale one 35 minutes in (3n-b). On a copy whose worktree stops it and
# whose run() leaves a mark, since a fall-through to the real run takes hours.
m="$t/mutate" && mkdir -p "$m"
dry() { # $1: a mutant planted at the end of its list, $2: an entry planted in SECTIONS
	cp "$here/harness_mutate.py" "$here/suite_parts.py" "$m/"
	cp "$here/repo_files.py" "$m/repo_files.py" # the real helpers, then a worktree that stops the run (the later definition wins)
	printf '\n\ndef worktree(rev):\n    raise SystemExit("harness_mutate --dry made a worktree")\n' >>"$m/repo_files.py"
	python3 -I - "$m/harness_mutate.py" "$m/ran" "${1:-}" "${2:-}" <<'PY'
import sys
p, mark, mutant, entry = sys.argv[1:]
s = open(p).read()
for a, b in (('def run(tree, test, only=""):\n', f'def run(tree, test, only=""):\n    open({mark!r}, "w").close()\n'),
             ("\n\n\ndef sections(", "\n    " + mutant + "\n\n\ndef sections("), ("SECTIONS = {\n", "SECTIONS = {\n    " + entry + "\n")):
    assert s.count(a) == 1, f"harness_mutate.py no longer holds {a!r}: update test_hooks.sh's dry()"
    s = s.replace(a, b)
open(p, "w").write(s)
PY
	(cd "$here/.." && python3 -I "$m/harness_mutate.py" --dry 2>&1)
}
dry || fail "harness_mutate --dry: a mutant of the harness is out of date (above)"
out=$(dry 'yield from each("scripts/check.sh", "no such text", "", "hooks", "planted stale")') && fail "harness_mutate --dry accepted a mutant that finds no text"
printf '%s' "$out" | grep -q "planted stale: nothing to mutate" || fail "harness_mutate --dry did not name the stale mutant: $out"
out=$(dry 'yield from each("docs/REVIEW.md", "#", "", "hooks", "planted unsectioned")') && fail "harness_mutate --dry accepted a guard file with no sections"
printf '%s' "$out" | grep -qF "docs/REVIEW.md" || fail "harness_mutate --dry did not name the file with no sections: $out"
out=$(dry 'yield from each("docs/REVIEW.md", "#", "", "hooks", "planted keyless")' '"docs/REVIEW.md": {"probe": "lint"},') && fail "harness_mutate --dry accepted a guard file with no sections for its suite"
printf '%s' "$out" | grep -qF "docs/REVIEW.md" || fail "harness_mutate --dry did not name the file with no sections for its suite: $out"
# A section its suite lacks makes every mutant "killed": the suite fails on the unknown name.
out=$(dry 'yield from each("docs/REVIEW.md", "#", "", "hooks", "planted misnamed")' '"docs/REVIEW.md": "guard,no_such_section",') && fail "harness_mutate --dry accepted a section test_hooks.sh lacks"
printf '%s' "$out" | grep -qF "no_such_section" || fail "harness_mutate --dry did not name the unknown section: $out"
out=$(dry 'yield from each("docs/REVIEW.md", "#", "", "probe", "planted misnamed")' '"docs/REVIEW.md": "no_such_block",') && fail "harness_mutate --dry accepted a block probe.py lacks"
printf '%s' "$out" | grep -qF "no_such_block" || fail "harness_mutate --dry did not name the unknown block: $out"
[ ! -e "$m/ran" ] || fail "harness_mutate --dry ran a test, which takes minutes"
fi

# The planted copy these sections share: a suite, a guard file and a harness_mutate.py of its own, in a repository of two trees' worth of files.
shards_fixture() {
hs="$t/shards" && mkdir -p "$hs/src/scripts" "$hs/repo/scripts"
# The suite: its section opens at the line's start, as harness_mutate reads it, which this file's
# runner must not; with SHARDS_MEET, a mutant's run waits for that many trees to run at once.
printf '%s\n' '# Each section reads the tree, never its .git file.' 'part() { case ",$ONLY," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }' \
	'[ -n "$ONLY" ] || { echo . >>"$SHARD_ROOT/controls"; [ -z "${CINTR:-}" ] || { echo $$ >>"$SHARD_ROOT/suite.pid"; ! mkdir "$SHARD_ROOT/sig.lock" 2>/dev/null || kill -$CINTR "$PPID"; sleep 30; }; [ -z "${CFAIL:-}" ] || { n=0; until [ -s "$SHARD_ROOT/suite.pid" ] || [ "$n" -ge 50 ]; do n=$((n + 1)); sleep 0.1; done; exit 1; };[ -z "${CONTROLS_SLOW:-}" ] || { : >"$SHARD_ROOT/live.$$"; n=0; until [ "$(ls "$SHARD_ROOT" | grep -c "^live\.")" -ge 2 ] || [ "$n" -ge 50 ]; do n=$((n + 1)); sleep 0.1; done; sleep 0.3; ls "$SHARD_ROOT" | grep -c "^live\." >>"$SHARD_ROOT/overlap"; rm -f "$SHARD_ROOT/live.$$"; }; [ ! -e BROKEN_hooks ]; exit; }' \
	'if part x; then' \
	'	pwd >>"$SHARD_ROOT/ran"' \
	'	[ -n "${CUT:-}" ] && [ -n "$ONLY" ] && ! grep -q KEEP3 g.txt && kill -9 "$PPID"' \
	'	if [ -n "${INTR:-}" ] && ! grep -q " SPARE" g.txt; then' \
	'		case $INTR in group) kill -INT 0; sleep 5 ;; ppid) kill -INT "$PPID"; sleep 1 ;; ppidlong) echo $$ >>"$SHARD_ROOT/suite.pid"; kill -INT "$PPID"; sleep 30 ;; termlong) echo $$ >>"$SHARD_ROOT/suite.pid"; kill -TERM "$PPID"; sleep 30 ;; *) exit "$INTR" ;; esac' \
	'	fi' \
	'	! grep -q " SPARE" g.txt && [ -n "${FLAKE:-}" ] && [ ! -e "$SHARD_ROOT/flaked" ] && { : >"$SHARD_ROOT/flaked"; exit 1; }' \
	'	if [ -n "${SHARDS_MEET:-}" ]; then' \
	'		: >"$SHARD_ROOT/met.${PWD##*/}" && n=0' \
	'		until [ "$(ls "$SHARD_ROOT" | grep -c "^met\.")" -ge "$SHARDS_MEET" ]; do n=$((n + 1)); [ "$n" -lt 100 ] || { : >"$SHARD_ROOT/lonely"; break; }; sleep 0.1; done' \
	'	fi' \
	'	grep -q KEEP1 g.txt && grep -q KEEP2 g.txt && grep -q KEEP3 g.txt && grep -q KEEP4 h.txt && grep -q KEEP5 i.txt && grep -q KEEP8 "$(printf "\303\251").txt" && grep -q LINE1 m.txt && grep -q LINE2 m.txt' \
	'fi' >"$hs/src/scripts/test_hooks.sh"
# probe.py's block y reads k.txt (a mutant of k.txt is a probe block's, G5); ONLY names the blocks to run, none for all.
printf 'import os, sys, time\n\n\ndef part(name):\n    return name in os.environ.get("ONLY", "").split(",")\n\n\nif part("y"):\n    if "KEEP7" not in open("k.txt").read():\n        sys.exit(1)\nif not os.environ.get("ONLY"):\n    open(os.environ["SHARD_ROOT"] + "/probe_controls", "a").write(".\\n")\n    if os.environ.get("CSLEEP"):\n        open(os.environ["SHARD_ROOT"] + "/suite.pid", "a").write(str(os.getpid()) + "\\n")\n        time.sleep(30)\nsys.exit(os.path.exists("BROKEN_probe"))\n' >"$hs/src/scripts/probe.py"
printf 'KEEP1 KEEP2 KEEP3 SPARE\n' >"$hs/src/g.txt" && printf 'KEEP4 SPARE2\n' >"$hs/src/h.txt" && printf 'KEEP5\n' >"$hs/src/i.txt" && printf 'KEEP7\n' >"$hs/src/k.txt" && ac=$(printf '\303\251').txt && printf 'KEEP8\n' >"$hs/src/$ac"
printf 'LINE1\nLINE2\n' >"$hs/src/m.txt"
cp "$here/harness_mutate.py" "$here/suite_parts.py" "$hs/repo/"
# The worktrees: copies, logged when made and when removed; BREAK_SECOND=<suite> breaks the second one. Beside
# the real repo_files.py, whose last_reviewed this run reads: the stub's worktree is the later definition.
cp "$here/repo_files.py" "$hs/repo/repo_files.py"
cat >>"$hs/repo/repo_files.py" <<'PY'
import contextlib, os, shutil, tempfile

made = []


@contextlib.contextmanager
def worktree(rev):
    root = os.environ["SHARD_ROOT"]
    tree = tempfile.mkdtemp(dir=root)
    shutil.copytree(os.environ["SHARD_SRC"], tree, dirs_exist_ok=True)
    made.append(tree)
    with open(os.path.join(tree, ".git"), "w") as f:  # as git worktree writes it: the copy's own path, another each run
        f.write("gitdir: " + tree + "\n")
    if len(made) == 2 and os.environ.get("BREAK_SECOND"):
        open(os.path.join(tree, "BROKEN_" + os.environ["BREAK_SECOND"]), "w").close()
    with open(os.path.join(root, "made"), "a") as f:
        f.write(tree + "\n")
    try:
        yield tree
    finally:
        shutil.rmtree(tree)
        with open(os.path.join(root, "removed"), "a") as f:
            f.write(tree + "\n")
PY
python3 -I - "$hs/repo/harness_mutate.py" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
planted = '''def mutants():
    if os.environ.get("NONE"):
        return
    for n in "123":
        yield from each("g.txt", f"KEEP{n}", "", "hooks", f"planted keep{n}")
    yield from each("g.txt", " SPARE", "", "hooks", "planted spare")
    yield from each("h.txt", "KEEP4", "", "hooks", "planted keep4")
    yield from each("h.txt", " SPARE2", "", "hooks", "planted spare2")
    yield from each("i.txt", "KEEP5", "", "hooks", "planted keep5")
    if os.environ.get("STALE"):
        yield from each("g.txt", "NOWHERE", "", "hooks", "planted stale")
    if os.environ.get("SCOPED"):
        yield from each("j.txt", "KEEP6", "", "hooks", "planted keep6")
    if os.environ.get("SPACED"):
        yield from each("\\u00e9.txt", "KEEP8", "", "hooks", "planted keep8")
    if os.environ.get("PROBED"):
        yield from each("k.txt", "KEEP7", "", "probe", "planted keep7")
    if os.environ.get("LINED"):
        yield from each("m.txt", "LINE1", "", "hooks", "planted line1")
        yield from each("m.txt", "LINE2", "", "hooks", "planted line2")
    for n in range(int(os.environ.get("MANY", "0"))):
        yield from each("g.txt", "KEEP1", "", "hooks", f"planted many{n}")


def every_mutant():'''
gaps = '''GAPS = {
    **({"planted spare #1": "planted gap"} if os.environ.get("GAPPED") else {}),
    **({"planted keep1 #1": "planted gap"} if os.environ.get("GAPPED_KEEP") else {}),
'''
for a, b in (("def mutants():", planted), ("GAPS = {  # label -> why no test can notice it yet\n", gaps), ("SECTIONS = {\n", 'SECTIONS = {\n    "g.txt": "x", "h.txt": "x", "i.txt": "x", "j.txt": "z", "m.txt": "x", "k.txt": "y", "\\u00e9.txt": "x",\n')):
    assert s.count(a) == 1, f"harness_mutate.py no longer holds {a!r}: update test_hooks.sh's harness_shards"
    s = s.replace(a, b)
open(p, "w").write(s)
PY
cp "$hs/src/g.txt" "$hs/src/h.txt" "$hs/src/i.txt" "$hs/src/k.txt" "$hs/src/m.txt" "$hs/src/$ac" "$hs/repo/" && cp "$hs/src/scripts/test_hooks.sh" "$hs/src/scripts/probe.py" "$hs/repo/scripts/"
git -C "$hs/repo" init -q && git -C "$hs/repo" add -A && git -C "$hs/repo" commit -qm x
shards() { # $1: the shards; then harness_mutate's arguments
	n=$1 && shift
	rm -f "$hs/made" "$hs/removed" "$hs/ran" "$hs/controls" "$hs/probe_controls" "$hs/lonely" "$hs/flaked" "$hs"/met.* "$hs"/live.* "$hs/overlap"
	[ -n "${WARM:-}" ] || rm -rf "${hs:?}/home" # each run with no cache of verdicts, unless WARM keeps the last run's
	(cd "${HR:-$hs/repo}" && HOME="$hs/home" SHARD_ROOT="$hs" SHARD_SRC="$hs/src" HARNESS_SHARDS=$n ${GROUPED:+python3 -I "$hs/group.py"} python3 -I harness_mutate.py "$@" 2>&1)
}
count() { [ -e "$hs/$1" ] && wc -l <"$hs/$1" | tr -d ' ' || echo 0; }
verdicts() { printf '%s\n' "$1" | grep -c "killed: \|survives: " || :; }
}
# The four sections run apart, so a change of harness_mutate.py reruns the one that holds its case.
# A new mutant and one whose text changed, planted in the copy's harness_mutate.py and committed.
plant_new_mutants() {
python3 -I - "$hs/repo/harness_mutate.py" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
keep5 = '    yield from each("i.txt", "KEEP5", "", "hooks", "planted keep5")\n'
spare2 = 'each("h.txt", " SPARE2", "", "hooks", "planted spare2")'
assert s.count(keep5) == 1 and s.count(spare2) == 1, "the planted mutants changed: update test_hooks.sh's harness_shards"
s = s.replace(keep5, keep5 + '    yield from each("k.txt", "KEEP7", "", "probe", "planted keep7 again")\n')
s = s.replace(spare2, 'each("h.txt", " SPARE2", " SPARE3", "hooks", "planted spare2")')
open(p, "w").write(s)
PY
git -C "$hs/repo" commit -qam "a new mutant, a changed one"
}
if part harness_shards; then
# harness_mutate judges its mutants over HARNESS_SHARDS worktrees side by side, each mutant once and in
# a tree put back after each one, after a control run of each suite in every tree; with --changed
# <base>, only the mutants that rewrite a line committed since base (a merge's own) and those harness_mutate defines
# anew or otherwise, and never past 100; a survivor fails the run either way, and the worktrees go.
# On a copy whose worktrees are copies of a small tree, and whose mutants are planted.
shards_fixture
# Three shards at once: every mutant judged once, in its order; the survivor behind another file's
# killed mutant in its shard still survives (its tree put back); every worktree removed.
out=$(SHARDS_MEET=3 shards 3) && fail "harness_mutate passed with surviving mutants: $out"
for k in keep1 keep2 keep3 keep4 keep5; do
	[ "$(printf '%s\n' "$out" | grep -c "killed: planted $k #1$")" = 1 ] || fail "harness_mutate did not judge planted $k once: $out"
done
for k in spare spare2; do printf '%s\n' "$out" | grep -q "^FAIL  survives: planted $k #1$" || fail "harness_mutate hid the survivor $k among its shards: $out"; done
[ "$(printf '%s\n' "$out" | grep -E "planted [a-z0-9]+ #1" | sed 's/.*planted \([a-z0-9]*\) #1.*/\1/' | paste -sd' ' -)" = "keep1 keep2 keep3 spare keep4 spare2 keep5" ] ||
	fail "harness_mutate printed its verdicts out of the mutants' order: $out"
[ "$(count made)" = 3 ] || fail "harness_mutate made $(count made) worktrees for 3 shards"
[ "$(sort -u "$hs/ran" | wc -l | tr -d ' ')" = 3 ] || fail "harness_mutate did not spread its mutants over its 3 shards"
[ ! -e "$hs/lonely" ] || fail "harness_mutate's shards did not run side by side"
[ "$(count removed)" = 3 ] || fail "harness_mutate left worktrees behind"
# A run cut short (the merge check's own time limit, a Ctrl+C) keeps the verdicts it reached: harness_mutate used to remember them
# only at its end, so a run of 700 mutants cut at 100 minutes judged all of them again at the next (2026-10-30, slice-5-harness-a:
# the lane "stalled" twice, 100 minutes of verdicts lost each time). One shard, killed hard while it judges the third mutant.
out=$(CUT=1 shards 1) && fail "harness_mutate lived through the death of its process: $out"
out=$(WARM=1 shards 1) && fail "harness_mutate passed with surviving mutants after a cut run"
for k in keep1 keep2; do
	printf '%s\n' "$out" | grep -q "^ok    killed (cached): planted $k #1$" || fail "harness_mutate lost the verdict of planted $k when its run was cut short: $out"
done
# No shard asked for: one.
out=$(shards 0) && fail "harness_mutate passed with surviving mutants on one shard"
[ "$(count made)" = 1 ] || fail "harness_mutate made $(count made) worktrees for HARNESS_SHARDS=0"
# A known gap that a run "kills" is a test that failed for the load, not for the mutant: it is judged once more, and
# survives when the second run passes (the merge check of 01:54 failed on one); a gap killed twice is out of date.
out=$(GAPPED=1 FLAKE=1 shards 3) && fail "harness_mutate passed with surviving mutants beside a flaky known gap"
printf '%s\n' "$out" | grep -q "^ok    survives: planted spare #1  (known gap: planted gap)$" || fail "harness_mutate failed a known gap that one failed run had killed: $out"
[ -e "$hs/flaked" ] || fail "harness_mutate's flaky gap did not fail once: the case tests nothing"
out=$(GAPPED_KEEP=1 shards 3) && fail "harness_mutate passed with surviving mutants beside a gap"
printf '%s\n' "$out" | grep -q "^FAIL  killed, yet listed in GAPS: planted keep1 #1$" || fail "harness_mutate let a gap that is killed every time stay listed: $out"
# The control: a suite failing on any untouched tree stops the run before any verdict, its trees removed.
for suite in hooks probe; do
	out=$(PROBED=1 BREAK_SECOND=$suite shards 3) && fail "harness_mutate passed with $suite failing on an untouched tree"
	printf '%s\n' "$out" | grep -q "fails on the untouched copy" || fail "harness_mutate did not stop on $suite failing on an untouched tree: $out"
	[ "$(verdicts "$out")" = 0 ] || fail "harness_mutate judged mutants after a failed control: $out"
	[ "$(count removed)" = "$(count made)" ] || fail "harness_mutate left worktrees behind after a failed control"
done
# --changed: the committed changes since base; only i.txt changed, so only its mutant runs, and passes.
base=$(git -C "$hs/repo" rev-parse HEAD)
printf 'KEEP5 changed\n' >"$hs/repo/i.txt" && git -C "$hs/repo" commit -qam i
out=$(shards 2 --changed "$base") || fail "harness_mutate --changed failed on the mutant of the one changed file: $out"
printf '%s\n' "$out" | grep -q "killed: planted keep5 #1$" || fail "harness_mutate --changed skipped the changed file's mutant: $out"
[ "$(verdicts "$out")" = 1 ] || fail "harness_mutate --changed judged a mutant of a file that did not change: $out"
printf '%s\n' "$out" | grep -q "1 of 7 mutants" || fail "harness_mutate --changed did not say how many it kept: $out"
# One mutant to judge needs one tree, and the control of the one suite it belongs to: no more worktrees than mutants, no
# control of a suite none of the mutants runs (CR9, C4; 4 trees and 8 suite runs took 601 s at load 30 to 50 for one mutant).
[ "$(count made)" = 1 ] || fail "harness_mutate made $(count made) worktrees for 1 mutant and 2 shards: $out"
[ "$(count controls)" = 1 ] && [ "$(count probe_controls)" = 0 ] || fail "harness_mutate ran $(count controls) hooks and $(count probe_controls) probe controls for one hooks mutant"
# A survivor among the changed files fails the run.
printf 'KEEP4 SPARE2 changed\n' >"$hs/repo/h.txt" && git -C "$hs/repo" commit -qam h
out=$(shards 2 --changed "$base") && fail "harness_mutate --changed passed with a survivor: $out"
printf '%s\n' "$out" | grep -q "^FAIL  survives: planted spare2 #1$" || fail "harness_mutate --changed hid its survivor: $out"
# Every mutant is still built: a stale one of a file that did not change stops the run.
out=$(STALE=1 shards 2 --changed "$base") && fail "harness_mutate --changed passed with a stale mutant: $out"
printf '%s\n' "$out" | grep -q "planted stale: nothing to mutate" || fail "harness_mutate --changed did not check every mutant: $out"
[ "$(verdicts "$out")" = 0 ] || fail "harness_mutate --changed judged mutants beside a stale one: $out"
# Two blank lines in a suite ask for nothing (on harness-a, 704 mutants of 951); the run with no argument, which main
# requires, still judges every mutant --changed skipped: a test a branch weakens is seen there (Alexis, 2026-10-30).
base=$(git -C "$hs/repo" rev-parse HEAD)
printf '\n\n' >>"$hs/repo/scripts/test_hooks.sh" && git -C "$hs/repo" commit -qam suite
out=$(shards 2 --changed "$base") || fail "harness_mutate --changed failed on two blank lines in a suite: $out"
[ "$(verdicts "$out")" = 0 ] && printf '%s\n' "$out" | grep -q " 0 of 7 mutants" || fail "harness_mutate --changed asked for mutants for two blank lines in a suite: $out"
out=$(shards 2) && fail "harness_mutate passed with survivors, with no argument: $out"
[ "$(verdicts "$out")" = 7 ] || fail "harness_mutate with no argument did not judge every mutant --changed skipped: $out"
# A changed line asks for the mutants that rewrite it, not for the rest of its file's, whatever git's colours or external
# diff; a line removed touches the two beside it, in HEAD's numbers.
printf 'LINE1\nGONE\nLINE2\n' >"$hs/repo/m.txt" && git -C "$hs/repo" commit -qam "three lines"
git -C "$hs/repo" config color.ui always && git -C "$hs/repo" config diff.external false
base=$(git -C "$hs/repo" rev-parse HEAD)
printf 'LINE1\nLINE2\n' >"$hs/repo/m.txt" && git -C "$hs/repo" commit -qam "a line removed"
out=$(LINED=1 shards 2 --changed "$base") || fail "harness_mutate --changed failed on a removed line: $out"
[ "$(verdicts "$out")" = 2 ] && printf '%s\n' "$out" | grep -q " 2 of 9 mutants" || fail "harness_mutate --changed did not ask for the two lines beside a removed one: $out"
base=$(git -C "$hs/repo" rev-parse HEAD)
printf 'LINE1 changed\nLINE2\n' >"$hs/repo/m.txt" && git -C "$hs/repo" commit -qam "a line changed"
out=$(LINED=1 shards 2 --changed "$base") || fail "harness_mutate --changed failed on a changed line: $out"
printf '%s\n' "$out" | grep -q "killed: planted line1 #1$" || fail "harness_mutate --changed skipped the changed line's mutant: $out"
[ "$(verdicts "$out")" = 1 ] && printf '%s\n' "$out" | grep -q " 1 of 9 mutants" || fail "harness_mutate --changed asked for more than the changed line's mutant: $out"
git -C "$hs/repo" config --unset color.ui && git -C "$hs/repo" config --unset diff.external
# More than 100 to judge: --changed stops before any tree beyond the first, any control, any verdict, and says how many,
# from where, and the way on. A control that fails proves a run got past the limit with nothing judged: 100 goes on, and
# so does a run with no argument, and what the cache holds does not count.
base=$(git -C "$hs/repo" rev-parse HEAD)
printf 'KEEP1 KEEP2 KEEP3 SPARE many\n' >"$hs/repo/g.txt" && git -C "$hs/repo" commit -qam many
out=$(MANY=97 shards 2 --changed "$base") && fail "harness_mutate --changed went on with 101 mutants to judge: $out"
printf '%s\n' "$out" | grep -q "stops before judging 101 mutants" || fail "harness_mutate --changed did not say how many it stopped at: $out"
printf '%s\n' "$out" | grep -q "g.txt 101" || fail "harness_mutate --changed did not say which files they come from: $out"
printf '%s\n' "$out" | grep -q "check.sh --full" || fail "harness_mutate --changed did not name the way on: $out"
[ "$(verdicts "$out")" = 0 ] && [ ! -e "$hs/controls" ] && [ "$(count made)" = 1 ] && [ "$(count removed)" = 1 ] || fail "harness_mutate --changed did work past its limit: $out"
past() { printf '%s\n' "$1" | grep -q "fails on the untouched copy"; }
out=$(MANY=96 BREAK_SECOND=hooks shards 2 --changed "$base") || :
past "$out" || fail "harness_mutate --changed stopped at 100 mutants to judge: $out"
out=$(MANY=97 BREAK_SECOND=hooks shards 2) || :
past "$out" || fail "harness_mutate with no argument stopped at its limit: $out"
shards 1 >/dev/null || : # keep1 to keep3 cached, with many0 next
out=$(WARM=1 MANY=1 shards 1) || :
out=$(WARM=1 MANY=97 BREAK_SECOND=hooks shards 2 --changed "$base") || :
past "$out" || fail "harness_mutate --changed counted the verdicts of its cache against its limit: $out"
# A merge's own mutants are those of the guard files changed since the last /pre-merge pass, not since base: the
# pass judged what came before (as batch_size.py finds its base). i.txt changed before the pass, h.txt after it.
base=$(git -C "$hs/repo" rev-parse HEAD)
printf 'KEEP5 before the pass\n' >"$hs/repo/i.txt" && git -C "$hs/repo" commit -qam "before the pass"
mkdir -p "$hs/repo/docs" && printf '# passes\n' >"$hs/repo/docs/review-passes.txt"
(cd "$hs/repo" && python3 -I -c 'import sys; sys.dont_write_bytecode = True; sys.path.insert(0, sys.argv[1]); from repo_files import fingerprint
print("2026-10-27", fingerprint("HEAD"), "lenses")' "$here") >>"$hs/repo/docs/review-passes.txt"
git -C "$hs/repo" add docs && git -C "$hs/repo" commit -qm "the pass's record"
printf 'KEEP4 SPARE2 after the pass\n' >"$hs/repo/h.txt" && git -C "$hs/repo" commit -qam "after the pass"
out=$(shards 2 --changed "$base") && fail "harness_mutate --changed passed with a survivor changed after the pass: $out"
printf '%s\n' "$out" | grep -q "^FAIL  survives: planted spare2 #1$" || fail "harness_mutate --changed skipped the file changed after the pass: $out"
[ "$(verdicts "$out")" = 2 ] || fail "harness_mutate --changed judged more than the files changed after the pass: $out"
printf '%s\n' "$out" | grep -q "killed: planted keep5" && fail "harness_mutate --changed judged a file changed before the pass: $out"
printf '%s\n' "$out" | grep -q "2 of 7 mutants" || fail "harness_mutate --changed did not say how many it kept since the pass: $out"
# A record that matches no commit of the range is no pass: since base, every guard file changed.
printf '# passes\n2026-10-27 %s lenses\n' "$(printf x | git -C "$hs/repo" hash-object --stdin)" >"$hs/repo/docs/review-passes.txt"
git -C "$hs/repo" commit -qam "a record of other code"
out=$(shards 2 --changed "$base") && fail "harness_mutate --changed passed with a survivor and no pass: $out"
[ "$(verdicts "$out")" = 3 ] || fail "harness_mutate --changed did not judge every file changed since base when no pass matched: $out"
printf '%s\n' "$out" | grep -q "killed: planted keep5 #1$" || fail "harness_mutate --changed left out a file changed since base when no pass matched: $out"
# No passes file at all: the same.
git -C "$hs/repo" rm -q docs/review-passes.txt && git -C "$hs/repo" commit -qm "no record"
out=$(shards 2 --changed "$base") && fail "harness_mutate --changed passed with a survivor and no passes file: $out"
[ "$(verdicts "$out")" = 3 ] || fail "harness_mutate --changed did not judge every file changed since base with no passes file: $out"
# Nothing changed since the pass, so no mutant to judge: it says so and runs no control either.
out=$(shards 2 --changed "$(git -C "$hs/repo" rev-parse HEAD)") || fail "harness_mutate --changed failed with no mutant to judge: $out"
printf '%s\n' "$out" | grep -q "0 of 7 mutants" || fail "harness_mutate --changed did not say it kept none: $out"
[ ! -e "$hs/controls" ] && [ ! -e "$hs/probe_controls" ] || fail "harness_mutate --changed ran a control for no mutant: $out"
[ "$(count made)" = 1 ] || fail "harness_mutate --changed made $(count made) worktrees for no mutant to judge, two shards asked: $out"
# The controls run two at a time, never every tree's suites at once: beside the full gate's coverage lane, eight at once
# overran their 600 s limit where they take 96 s alone (F2138). Each control still runs, in every tree; each fake control
# waits for a second one beside it (5 s at most), so a serial run shows as one at once, not as a pass.
CONTROLS_SLOW=1 shards 4 >/dev/null || : # the planted survivors fail the run; only its controls are read here
[ "$(count controls)" = 4 ] || fail "harness_mutate did not run the control in each of its 4 trees: $(count controls)"
[ "$(sort -n "$hs/overlap" | tail -1)" = 2 ] || fail "harness_mutate ran $(sort -n "$hs/overlap" | tail -1) controls at once, not two (F2138)"
fi

if part harness_shards_signal; then
shards_fixture
# A Ctrl+C reaches the suite of every mutant in flight, which dies of the signal: that is no verdict, and none is kept. The run
# was reading it as "killed" and writing it to the cache, where the next run, --full too, passed with the survivor (F2526, from
# 2ca90ff6). The run is a group of its own, signalled from inside its surviving mutant's suite; the next run still fails on it.
printf 'import signal, subprocess, sys\nsignal.signal(signal.SIGINT, lambda *_: None)  # this section runs in the background, whose shell ignores INT: the run below must not\nsys.exit(subprocess.run(sys.argv[1:], start_new_session=True).returncode)\n' >"$hs/group.py"
out=$(INTR=group GROUPED=1 shards 1) && fail "harness_mutate passed after a signal cut its suite short: $out"
printf '%s\n' "$out" | grep -q "^ok    killed: planted spare #1$" && fail "harness_mutate read the signal that cut a suite short as a kill: $out"
out=$(WARM=1 shards 1) && fail "harness_mutate passed with a survivor after a run cut by a signal: $out"
printf '%s\n' "$out" | grep -q "^ok    killed (cached): planted spare #1$" && fail "harness_mutate cached the signal that cut a suite short as a kill: $out"
printf '%s\n' "$out" | grep -q "^FAIL  survives: planted spare #1$" || fail "harness_mutate lost its survivor after a run cut by a signal: $out"
# The codes a shell gives a suite it ends by a signal are no verdict either (INT, KILL, TERM).
for c in 130 137 143; do
	out=$(INTR=$c shards 1) && fail "harness_mutate passed after a suite ended with $c: $out"
	printf '%s\n' "$out" | grep -q "no verdict is kept" || fail "harness_mutate took the end of a suite with $c for a verdict: $out"
	printf '%s\n' "$out" | grep -q "killed: planted spare #1" && fail "harness_mutate read $c as a kill: $out"
done
# A Ctrl+C that reaches the run alone, its suites unharmed: the shard stops at once, starting no mutant and keeping no
# verdict after it (the suite of the survivor goes on to pass; four mutants had run, never the seven).
out=$(INTR=ppid GROUPED=1 shards 1) && fail "harness_mutate passed after an interrupt: $out"
[ "$(count ran)" = 4 ] || fail "harness_mutate went on judging after its interrupt: $(count ran) of 7 mutants ran"
grep -q survives "$hs"/home/.cache/gnoworld-tools/* 2>/dev/null && fail "harness_mutate kept the verdict of a mutant judged after its interrupt"
# Each suite is a process group of its own now (F3382, so that a hung one is stopped with its children and nothing else): a signal to the
# run no longer reaches them with it, so the run stops them itself. A suite that would run 30 s more is dead when the run is, on an INT
# (well before it could end by itself) and on a TERM, which would otherwise end the run alone and leave its suites behind.
for sig in ppidlong termlong; do
	rm -f "$hs/suite.pid"
	began=$(date +%s)
	out=$(INTR=$sig GROUPED=1 shards 1) && fail "harness_mutate passed after a $sig signal: $out"
	[ -s "$hs/suite.pid" ] || fail "the suite never ran ($sig): $out"
	[ $(($(date +%s) - began)) -lt 20 ] || fail "harness_mutate waited for the suite to end by itself after a $sig signal"
	for p in $(cat "$hs/suite.pid"); do kill -0 "$p" 2>/dev/null && { kill -9 "$p" 2>/dev/null; fail "harness_mutate left a suite running after a $sig signal"; }; done
done
# The same in the controls, run two at a time before any mutant (round 1, reviewer-1-3): the run waited for the two in flight to end by
# themselves, up to the limit of 600 s, with check.sh gone and its merge lock free. An INT or a TERM stops them; so does a control that fails
# or hangs, for the one beside it.
for sig in INT TERM; do
	rm -rf "$hs/suite.pid" "$hs/sig.lock"
	began=$(date +%s)
	out=$(CINTR=$sig GROUPED=1 shards 2) && fail "harness_mutate passed after a $sig signal in its controls: $out"
	[ "$(count suite.pid)" -ge 1 ] || fail "no control was in flight at the $sig signal: $out"
	[ $(($(date +%s) - began)) -lt 20 ] || fail "harness_mutate waited for its controls to end by themselves after a $sig signal ($(($(date +%s) - began)) s): $out"
	for p in $(cat "$hs/suite.pid"); do kill -0 "$p" 2>/dev/null && { kill -9 "$p" 2>/dev/null; fail "harness_mutate left a control running after a $sig signal"; }; done
done
rm -rf "$hs/suite.pid" "$hs/sig.lock"
began=$(date +%s)
out=$(CFAIL=1 CSLEEP=1 PROBED=1 shards 2) && fail "harness_mutate passed with a control failing: $out"
[ -s "$hs/suite.pid" ] || fail "no control was in flight beside the failing one: $out"
printf '%s\n' "$out" | grep -q "fails on the untouched copy" || fail "harness_mutate did not say which control failed: $out"
[ $(($(date +%s) - began)) -lt 20 ] || fail "harness_mutate waited for the control beside a failed one to end by itself ($(($(date +%s) - began)) s): $out"
for p in $(cat "$hs/suite.pid"); do kill -0 "$p" 2>/dev/null && { kill -9 "$p" 2>/dev/null; fail "harness_mutate left a control running after another failed"; }; done
fi

if part harness_shards_text; then
shards_fixture
# A file the branch marks `-diff` in .gitattributes (or one with a NUL byte) makes git print "Binary files differ", and a textconv
# can turn its text into another: the changed lines are read as text, as the file is (F2537; merge.sh and scan_secrets.sh do too).
base=$(git -C "$hs/repo" rev-parse HEAD)
printf '* -diff\n' >"$hs/repo/.gitattributes" && printf 'LINE1 again\nLINE2\n' >"$hs/repo/m.txt" && git -C "$hs/repo" add .gitattributes && git -C "$hs/repo" commit -qam "a line changed, diff off"
out=$(LINED=1 shards 2 --changed "$base") || fail "harness_mutate --changed failed on a file marked -diff: $out"
printf '%s\n' "$out" | grep -q "killed: planted line1 #1$" || fail "harness_mutate --changed skipped the changed line of a file marked -diff: $out"
[ "$(verdicts "$out")" = 1 ] && printf '%s\n' "$out" | grep -q " 1 of 9 mutants" || fail "harness_mutate --changed did not ask for the one changed line of a file marked -diff: $out"
base=$(git -C "$hs/repo" rev-parse HEAD)
printf 'm.txt diff=nc\n' >"$hs/repo/.gitattributes" && printf 'LINE1 once more\nLINE2\n' >"$hs/repo/m.txt" && git -C "$hs/repo" config diff.nc.textconv true && git -C "$hs/repo" commit -qam "a line changed, textconv"
out=$(LINED=1 shards 2 --changed "$base") || fail "harness_mutate --changed failed on a file with a textconv: $out"
printf '%s\n' "$out" | grep -q "killed: planted line1 #1$" || fail "harness_mutate --changed skipped the changed line of a file with a textconv: $out"
git -C "$hs/repo" config --unset diff.nc.textconv && git -C "$hs/repo" rm -q .gitattributes && git -C "$hs/repo" commit -qm "no attributes"
fi

if part harness_shards_records; then
shards_fixture
# The pass's record, on scratch clones of the first commit (F1430 to F1434): a record names a tree, not a commit,
# so the commit before it and its own both match; only the newest counts, and what changed after it is judged.
HR=$hs/r2 && git clone -q "$hs/repo" "$HR" && C0=$(git -C "$HR" rev-list --max-parents=0 HEAD) && main_b=$(git -C "$HR" branch --show-current)
fresh() { git -C "$HR" checkout -q "$main_b" && git -C "$HR" reset -q --hard "$C0" && git -C "$HR" branch -q -D side 2>/dev/null || :; }
edit() { printf '%s\n' "$2" >"$HR/$1" && git -C "$HR" commit -qam "$1: $2"; }
record() { # $1: the commit the pass was for (default HEAD); committed beside any other change in the tree
	mkdir -p "$HR/docs" && (cd "$HR" && python3 -I -c 'import sys; sys.dont_write_bytecode = True; sys.path.insert(0, sys.argv[1]); from repo_files import fingerprint
print("2026-10-27", fingerprint(sys.argv[2]), "lenses")' "$here" "${1:-HEAD}") >>"$HR/docs/review-passes.txt"
	git -C "$HR" add docs && git -C "$HR" commit -qm "the pass's record"
}
judges() { # $1: the guard files' mutants it must judge, as "<verdicts> <of 7>"; the rest of $out is read by the caller
	[ "$(verdicts "$out")" = "$1" ] || fail "harness_mutate --changed judged $(verdicts "$out") mutants, not $1: $out"
	printf '%s\n' "$out" | grep -q " $2 of ${3:-7} mutants" || fail "harness_mutate --changed did not say $2 of ${3:-7}: $out"
}
# Two records: i.txt changed before the first, h.txt between them, g.txt after the second. The newest match counts,
# not the oldest (the commit before a record and the record itself both match): only g.txt is judged (F1430, H1).
fresh && edit i.txt "KEEP5 a" && record && edit h.txt "KEEP4 SPARE2 b" && record && edit g.txt "KEEP1 KEEP2 KEEP3 SPARE c"
out=$(shards 2 --changed "$C0") && fail "harness_mutate --changed passed with a survivor changed after the newest record: $out"
judges 4 4
printf '%s\n' "$out" | grep -q "planted keep[45]\|spare2" && fail "harness_mutate --changed judged a file changed before the newest record: $out"
# A record at HEAD, older base: nothing since the pass, so no mutant and no control; the same when harness_mutate.py
# itself changed before the record (H3).
record
out=$(shards 2 --changed "$C0") || fail "harness_mutate --changed failed with a record at HEAD: $out"
judges 0 0
[ ! -e "$hs/controls" ] || fail "harness_mutate --changed ran a control for a record at HEAD: $out"
printf '\n# a change of its own\n' >>"$HR/harness_mutate.py" && git -C "$HR" commit -qam "itself" && record
out=$(shards 2 --changed "$C0") || fail "harness_mutate --changed failed with harness_mutate.py changed before the record: $out"
judges 0 0
[ ! -e "$hs/controls" ] || fail "harness_mutate --changed ran a control after the pass that saw harness_mutate.py change: $out"
# A record of a commit before the base (the normal state: the passes file holds main's history) is no pass of the
# range: since base, so i.txt, changed before the base, is left out and h.txt judged (H4).
fresh && record "$C0" && edit i.txt "KEEP5 d" && base=$(git -C "$HR" rev-parse HEAD) && edit h.txt "KEEP4 SPARE2 e"
out=$(shards 2 --changed "$base") && fail "harness_mutate --changed passed with a survivor after a base that follows an old record: $out"
judges 2 2
printf '%s\n' "$out" | grep -q "killed: planted keep5" && fail "harness_mutate --changed judged a file changed before its base: $out"
# A record commit that also edits a guard file: its tree is not the one the pass saw, so it is no record of itself;
# the pass is the commit before, and h.txt, changed in the record's commit, is judged (H5).
fresh && edit i.txt "KEEP5 f" && printf 'KEEP4 SPARE2 f\n' >"$HR/h.txt" && git -C "$HR" add h.txt && record
out=$(shards 2 --changed "$C0") && fail "harness_mutate --changed passed with a survivor changed in the record's own commit: $out"
judges 2 2
# A guard file renamed away counts as changed: git shows only the new name by default, and the old guard file's
# mutants must still be judged (H5).
fresh && git -C "$HR" mv i.txt i2.txt && git -C "$HR" commit -qm rename
out=$(shards 2 --changed "$C0") || fail "harness_mutate --changed failed on a renamed guard file: $out"
judges 1 1
printf '%s\n' "$out" | grep -q "killed: planted keep5 #1$" || fail "harness_mutate --changed left out the guard file that was renamed: $out"
# A guard file whose name git quotes (non-ASCII) is found: a line-split name-only is "\303\251.txt" with quotes (H9).
fresh && edit "$ac" "KEEP8 z"
out=$(SPACED=1 shards 2 --changed "$C0") || fail "harness_mutate --changed failed on a guard file with a quoted name: $out"
judges 1 1 8
printf '%s\n' "$out" | grep -q "killed: planted keep8 #1$" || fail "harness_mutate --changed missed a guard file whose name git quotes: $out"
# Merge commits: the record on a merge commit; then the record on the side branch only, with h.txt changed on the
# main side and never reviewed: it is judged (H6).
fresh && edit h.txt "KEEP4 SPARE2 g" && git -C "$HR" checkout -q -b side "$C0" && edit i.txt "KEEP5 g" && git -C "$HR" checkout -q "$main_b" &&
	git -C "$HR" merge -q --no-ff -m merge side && record && edit g.txt "KEEP1 KEEP2 KEEP3 SPARE g"
out=$(shards 2 --changed "$C0") && fail "harness_mutate --changed passed with a survivor after a record on a merge commit: $out"
judges 4 4
fresh && git -C "$HR" checkout -q -b side "$C0" && edit i.txt "KEEP5 h" && record && git -C "$HR" checkout -q "$main_b" && edit h.txt "KEEP4 SPARE2 h" &&
	git -C "$HR" merge -q --no-ff -m merge side
out=$(shards 2 --changed "$C0") && fail "harness_mutate --changed passed with a survivor changed beside a record on a side branch: $out"
judges 2 2
printf '%s\n' "$out" | grep -q "^FAIL  survives: planted spare2 #1$" || fail "harness_mutate --changed excluded a file changed on the main side after a side branch's record: $out"
# A passes file that is not one: a line with one field, or bytes that are no UTF-8, refuses with a message, before
# any worktree (H7).
fresh && mkdir -p "$HR/docs" && for bad in 'garbage\n' '2026-10-27 \377 lenses\n'; do
	printf "$bad" >"$HR/docs/review-passes.txt" && git -C "$HR" add docs && git -C "$HR" commit -qm "a bad record"
	out=$(shards 2 --changed "$C0") && fail "harness_mutate --changed went on with a passes file that is malformed ($bad): $out"
	printf '%s\n' "$out" | grep -q "cannot read the passes file" || fail "harness_mutate --changed refused a malformed passes file ($bad) without a message: $out"
	printf '%s\n' "$out" | grep -q "Traceback" && fail "harness_mutate --changed let a malformed passes file ($bad) raise: $out"
	[ ! -e "$hs/made" ] || fail "harness_mutate --changed made a worktree for a malformed passes file ($bad)"
done
# The full run (no argument) judges every mutant: none to judge there is a harness that lost its mutants, not a
# green run (F1431, H2). With --changed, none selected is the pass saying nothing changed.
out=$(NONE=1 shards 2) && fail "harness_mutate passed with no mutant to judge and no --changed: $out"
printf '%s\n' "$out" | grep -q "no mutant" || fail "harness_mutate did not say it had no mutant: $out"
[ "$(count removed)" = "$(count made)" ] || fail "harness_mutate left worktrees behind with no mutant"
unset HR
fi

if part harness_shards_changed; then
shards_fixture
# (Before the section z below: its if, last in the suite, would give every x mutant a passing exit.)
# A change inside one section of a suite asks for no mutant: only the lines a mutant rewrites do.
printf '%s\n' 'if part z; then' '	grep -q KEEP6 j.txt' 'fi' >"$hs/z"
cat "$hs/z" >>"$hs/src/scripts/test_hooks.sh" && cat "$hs/z" >>"$hs/repo/scripts/test_hooks.sh"
printf 'KEEP6\n' >"$hs/src/j.txt" && printf 'KEEP6\n' >"$hs/repo/j.txt"
git -C "$hs/repo" add -A && git -C "$hs/repo" commit -qm z
base=$(git -C "$hs/repo" rev-parse HEAD)
for f in "$hs/src/scripts/test_hooks.sh" "$hs/repo/scripts/test_hooks.sh"; do
	sed 's|^	grep -q KEEP6 j.txt$|	grep -q KEEP6 j.txt \&\& :|' "$f" >"$f.new" && mv "$f.new" "$f"
done
git -C "$hs/repo" commit -qam "z's line"
out=$(SCOPED=1 shards 2 --changed "$base") || fail "harness_mutate --changed failed on a changed section: $out"
[ "$(verdicts "$out")" = 0 ] && printf '%s\n' "$out" | grep -q " 0 of 8 mutants" || fail "harness_mutate --changed asked for mutants for a changed section: $out"
# A change inside one block of probe.py likewise: probe.py is a suite as test_hooks.sh is (G5).
base=$(git -C "$hs/repo" rev-parse HEAD)
for f in "$hs/src/scripts/probe.py" "$hs/repo/scripts/probe.py"; do
	sed 's|^        sys.exit(1)$|        sys.exit(2)|' "$f" >"$f.new" && mv "$f.new" "$f"
done
git -C "$hs/repo" commit -qam "y's line"
out=$(PROBED=1 shards 2 --changed "$base") || fail "harness_mutate --changed failed on a changed probe block: $out"
[ "$(verdicts "$out")" = 0 ] && printf '%s\n' "$out" | grep -q " 0 of 8 mutants" || fail "harness_mutate --changed asked for mutants for a changed probe block: $out"
# harness_mutate.py itself changed: the mutants it defines anew or otherwise than base's script (a label, a text, a
# suite) are judged, with those of the lines changed, not every mutant (Alexis, 2026-10-29: ~700 judged
# for two new ones, 32 minutes). Its own guards are mutants of a file it changed, so they are judged. A comment alone:
base=$(git -C "$hs/repo" rev-parse HEAD)
printf '\n# a change of its own\n' >>"$hs/repo/harness_mutate.py" && git -C "$hs/repo" commit -qam itself
out=$(shards 2 --changed "$base") || fail "harness_mutate --changed judged mutants after a comment of its own: $out"
[ "$(verdicts "$out")" = 0 ] && printf '%s\n' "$out" | grep -q " 0 of 7 mutants" || fail "harness_mutate --changed judged unchanged mutants after it changed itself: $out"
# A new mutant, and one whose text changed: those two alone. (Section z makes every x mutant survive, as above: the new
# one is a probe block's, which can be killed.)
plant_new_mutants
out=$(shards 2 --changed "$base") && fail "harness_mutate --changed passed with the survivor it defined otherwise: $out"
[ "$(verdicts "$out")" = 2 ] || fail "harness_mutate --changed did not judge only its new and changed mutants: $out"
printf '%s\n' "$out" | grep -q "killed: planted keep7 again #1$" || fail "harness_mutate --changed skipped a mutant it defined anew: $out"
printf '%s\n' "$out" | grep -q "^FAIL  survives: planted spare2 #1$" || fail "harness_mutate --changed skipped a mutant whose text it changed: $out"
printf '%s\n' "$out" | grep -q " 2 of 8 mutants" || fail "harness_mutate --changed did not say 2 of 8 mutants: $out"
# A mutant is also told by its label alone, by a section it lost and by its place in GAPS: one change each. Sections it only
# gained are no other definition: a mutant S kills, S and T kill. A branch that splits a section would otherwise ask for every
# mutant of the file (harness-a: 158 of check.sh's for one section added; harness-b, past 256).
for edit in label grown lost regrown gaps; do
	base=$(git -C "$hs/repo" rev-parse HEAD)
	python3 -I - "$hs/repo/harness_mutate.py" "$edit" <<'PY'
import sys
p, edit = sys.argv[1], sys.argv[2]
s = open(p).read()
old, new = {
    "label": ('"hooks", "planted keep4")', '"hooks", "planted keep4 renamed")'),
    "grown": ('"i.txt": "x",', '"i.txt": "x,z",'),
    "lost": ('"i.txt": "x,z",', '"i.txt": "z",'),
    "regrown": ('"i.txt": "z",', '"i.txt": "x,z",'),
    "gaps": ("GAPS = {\n", 'GAPS = {\n    "planted keep2 #1": "a planted gap",\n'),
}[edit]
assert s.count(old) == 1, f"the planted {edit} changed: update test_hooks.sh's harness_shards"
open(p, "w").write(s.replace(old, new))
PY
	git -C "$hs/repo" commit -qam "$edit alone"
	out=$(shards 2 --changed "$base") || :
	case $edit in grown | regrown) want=0 ;; *) want=1 ;; esac
	[ "$(verdicts "$out")" = "$want" ] && printf '%s\n' "$out" | grep -q " $want of 8 mutants" || fail "harness_mutate --changed did not judge $want mutant after its $edit alone: $out"
done
# A base script that does not run (a syntax error before its --dry line): every mutant.
cp "$hs/repo/harness_mutate.py" "$hs/hm.keep"
python3 -I -c 'import sys; p = sys.argv[1]; s = open(p).read(); open(p, "w").write(s.replace("\nif sys.argv[1:] == [\"--dry\"]:", "\ndef (:\nif sys.argv[1:] == [\"--dry\"]:", 1))' "$hs/repo/harness_mutate.py"
git -C "$hs/repo" commit -qam "a syntax error" && base=$(git -C "$hs/repo" rev-parse HEAD)
cp "$hs/hm.keep" "$hs/repo/harness_mutate.py" && git -C "$hs/repo" commit -qam "it runs again"
out=$(shards 2 --changed "$base") || :
[ "$(verdicts "$out")" = 8 ] || fail "harness_mutate --changed did not judge every mutant against a base script that does not run: $out"
# A base whose script it cannot read as definitions (no `--dry` line to cut it at): every mutant, as before.
cp "$hs/repo/harness_mutate.py" "$hs/hm.keep"
sed 's|^if sys.argv\[1:\] == \["--dry"\]:$|if ["--dry"] == sys.argv[1:]:|' "$hs/hm.keep" >"$hs/repo/harness_mutate.py"
git -C "$hs/repo" commit -qam "no dry line" && base=$(git -C "$hs/repo" rev-parse HEAD)
cp "$hs/hm.keep" "$hs/repo/harness_mutate.py" && git -C "$hs/repo" commit -qam "the dry line back"
out=$(shards 2 --changed "$base") && fail "harness_mutate --changed passed with survivors after a base it could not read: $out"
[ "$(verdicts "$out")" = 8 ] || fail "harness_mutate --changed did not judge every mutant against a base script it could not read: $out"
# A name base's script imports that this tree's suite_parts.py dropped: base's script reads base's helper, and still says its
# mutants (touched(), gone with the rule by lines, made all 973 of harness-a's look new, which only --full could then pass).
cp "$hs/repo/harness_mutate.py" "$hs/hm.keep" && cp "$hs/repo/suite_parts.py" "$hs/sp.keep"
printf '\n\ndef dropped():\n    pass\n' >>"$hs/repo/suite_parts.py"
sed 's|^from suite_parts import code, parts, select$|from suite_parts import code, dropped, parts, select|' "$hs/hm.keep" >"$hs/repo/harness_mutate.py"
git -C "$hs/repo" commit -qam "a helper base has" && base=$(git -C "$hs/repo" rev-parse HEAD)
cp "$hs/hm.keep" "$hs/repo/harness_mutate.py" && cp "$hs/sp.keep" "$hs/repo/suite_parts.py" && git -C "$hs/repo" commit -qam "the helper dropped"
out=$(shards 2 --changed "$base") || :
[ "$(verdicts "$out")" = 0 ] && printf '%s\n' "$out" | grep -q " 0 of 8 mutants" || fail "harness_mutate --changed took every mutant for new when base's helper had a name this tree's lacks: $out"
# A passes file it cannot read (a folder here): it refuses, before any worktree, and never judges fewer mutants.
mkdir -p "$hs/repo/docs/review-passes.txt" && : >"$hs/repo/docs/review-passes.txt/x" && git -C "$hs/repo" add docs && git -C "$hs/repo" commit -qm "an unreadable record"
rm -f "$hs/made"
out=$(shards 2 --changed "$base") && fail "harness_mutate --changed went on with a passes file it cannot read: $out"
printf '%s\n' "$out" | grep -q "cannot read the passes file" || fail "harness_mutate --changed did not say its passes file is unreadable: $out"
[ "$(verdicts "$out")" = 0 ] || fail "harness_mutate --changed judged mutants with a passes file it cannot read: $out"
[ ! -e "$hs/made" ] || fail "harness_mutate --changed made a worktree before reading its passes file"
# What it refuses, before any worktree: a base git cannot compare with, one read as an option, any
# other argument.
out=$(shards 2 --changed no-such-base) && fail "harness_mutate --changed took a base that is no commit: $out"
out=$(shards 2 --changed "--output=$hs/written") && fail "harness_mutate --changed took an option for its base: $out"
[ ! -e "$hs/written" ] || fail "harness_mutate --changed let git write a file"
for args in "--changed" "--changed a b" "--dry --changed x" "--bogus"; do
	out=$(shards 2 $args) && fail "harness_mutate took the arguments $args"
	printf '%s\n' "$out" | grep -q "usage\|--changed" || fail "harness_mutate did not say why it refused $args: $out"
	[ ! -e "$hs/made" ] || fail "harness_mutate made a worktree for the arguments $args"
done
fi

if part harness_shards_cache; then
shards_fixture
printf '%s\n' 'if part z; then' '	grep -q KEEP6 j.txt' 'fi' >"$hs/z"
cat "$hs/z" >>"$hs/src/scripts/test_hooks.sh" && cat "$hs/z" >>"$hs/repo/scripts/test_hooks.sh"
printf 'KEEP6\n' >"$hs/src/j.txt" && printf 'KEEP6\n' >"$hs/repo/j.txt"
git -C "$hs/repo" add -A && git -C "$hs/repo" commit -qm z
plant_new_mutants # the sections before it left them in the copy
# The verdicts' cache (Alexis, 2026-10-29): a killed mutant whose text, the sections that judge it, the suite's text
# outside its sections, every file of the tree that text names, and harness_mutate's own runner are as they were is not
# judged again; a survivor always is. It lives in ~/.cache/gnoworld-tools; the CI starts with none and judges all.
# (Here section x keeps its own failure, which section z, last in the suite, would otherwise turn into a pass.)
sed 's|^	grep -q KEEP1 g.txt \(.*\)$|	grep -q KEEP1 g.txt \1 \|\| exit 1|' "$hs/src/scripts/test_hooks.sh" >"$hs/s" && cp "$hs/s" "$hs/src/scripts/test_hooks.sh"
python3 -I -c 'import sys; p = sys.argv[1]; s = open(p).read(); open(p, "w").write(s.replace("    \"planted keep2 #1\": \"a planted gap\",\n", ""))' "$hs/repo/harness_mutate.py"
rm -rf "${hs:?}/home"
out=$(WARM=1 PROBED=1 shards 2) || :
[ "$(verdicts "$out")" = 9 ] || fail "harness_mutate did not judge every mutant with no cache: $out"
out=$(WARM=1 PROBED=1 shards 2) || :
cached=$(printf '%s\n' "$out" | grep -c "^ok    killed (cached): " || :)
[ "$cached" = 7 ] || fail "harness_mutate took $cached of its 7 killed mutants from the cache: $out"
printf '%s\n' "$out" | grep -q "^FAIL  survives: planted spare #1$" && printf '%s\n' "$out" | grep -q "^FAIL  survives: planted spare2 #1$" ||
	fail "harness_mutate took a survivor from the cache instead of judging it again: $out"
[ "$(count ran)" = 2 ] || fail "harness_mutate ran section x $(count ran) times with only its 2 survivors to judge: $out"
[ "$(count probe_controls)" = 0 ] || fail "harness_mutate controlled the probe with none of its mutants to judge: $out"
# A file the judging sections name, changed: their mutants are judged again; the probe block's, which does not name it, are not.
printf 'KEEP4 SPARE2 MORE\n' >"$hs/src/h.txt"
out=$(WARM=1 PROBED=1 shards 2) || :
[ "$(printf '%s\n' "$out" | grep -c "^ok    killed (cached): " || :)" = 2 ] && printf '%s\n' "$out" | grep -q "^ok    killed (cached): planted keep7 #1$" ||
	fail "harness_mutate kept a cached verdict whose section names a file that changed, or dropped one that does not: $out"
# A file nothing names, added: every cached verdict holds.
printf 'x\n' >"$hs/src/unnamed.txt"
out=$(WARM=1 PROBED=1 shards 2) || :
[ "$(printf '%s\n' "$out" | grep -c "^ok    killed (cached): " || :)" = 7 ] || fail "harness_mutate dropped cached verdicts for a file nothing names: $out"
# Two blank lines in a suite, outside its sections and inside the one that judges: every verdict holds (they missed the
# cache for 704 mutants). Comments do count: a `#` line in a heredoc or a multi-line string is text.
printf '\n\n' >>"$hs/src/scripts/test_hooks.sh"
awk '{ print } /^	pwd >>/ { print ""; print "" }' "$hs/src/scripts/test_hooks.sh" >"$hs/s" && cp "$hs/s" "$hs/src/scripts/test_hooks.sh"
out=$(WARM=1 PROBED=1 shards 2) || :
[ "$(printf '%s\n' "$out" | grep -c "^ok    killed (cached): " || :)" = 7 ] || fail "harness_mutate dropped cached verdicts for blank lines in a suite: $out"
# A blank line in a guard file keeps its own mutants' verdicts.
printf '\n' >>"$hs/src/g.txt"
out=$(WARM=1 PROBED=1 shards 2) || :
[ "$(printf '%s\n' "$out" | grep -c "^ok    killed (cached): planted keep[123] #1$" || :)" = 3 ] || fail "harness_mutate dropped its mutants' verdicts for a blank line in their file: $out"
# A section that judges them, changed: judged again.
sed 's|^	pwd >>"$SHARD_ROOT/ran"$|	pwd >>"$SHARD_ROOT/ran" # changed|' "$hs/src/scripts/test_hooks.sh" >"$hs/s" && cp "$hs/s" "$hs/src/scripts/test_hooks.sh"
out=$(WARM=1 PROBED=1 shards 2) || :
[ "$(printf '%s\n' "$out" | grep -c "^ok    killed (cached): " || :)" = 2 ] || fail "harness_mutate kept cached verdicts after the section that judges them changed: $out"
# A cache it cannot read is no cache: every mutant is judged, nothing raises.
printf 'not json' >"$hs/home/.cache/gnoworld-tools/harness-verdicts.json"
out=$(WARM=1 PROBED=1 shards 2) || :
[ "$(verdicts "$out")" = 9 ] && ! printf '%s\n' "$out" | grep -q Traceback || fail "harness_mutate did not judge every mutant beside a cache it cannot read: $out"
# The tools' lockfile, the suite's text outside its sections, and the runner that judges: each changed, every verdict goes.
printf 'lock 1\n' >"$hs/src/pnpm-lock.yaml"
WARM=1 PROBED=1 shards 2 >/dev/null || :
warm() { out=$(WARM=1 PROBED=1 shards 2) || :; printf '%s\n' "$out" | grep -c "^ok    killed (cached): " || :; }
[ "$(warm)" = 7 ] || fail "harness_mutate did not keep its verdicts beside a lockfile that did not change: $out"
printf 'lock 2\n' >"$hs/src/pnpm-lock.yaml"
[ "$(warm)" = 0 ] || fail "harness_mutate kept cached verdicts after the tools' lockfile changed: $out"
sed 's|^part() {|part() { # changed outside every section\n|' "$hs/src/scripts/test_hooks.sh" >"$hs/s" && cp "$hs/s" "$hs/src/scripts/test_hooks.sh"
[ "$(warm)" = 2 ] || fail "harness_mutate kept the hooks' cached verdicts after their suite changed outside its sections: $out"
python3 -I -c 'import sys; p = sys.argv[1]; s = open(p).read(); open(p, "w").write(s.replace("def judged(tree, label, path, mutated, test):\n", "def judged(tree, label, path, mutated, test):  # changed\n", 1))' "$hs/repo/harness_mutate.py"
[ "$(warm)" = 0 ] || fail "harness_mutate kept cached verdicts after the runner that judges them changed: $out"
rm -rf "${hs:?}/home"
fi

if part migrations; then
# check_migrations: a migration main has keeps its text and its place, since the server applies them by index
# (server/src/db.ts); F466's, edited in place, never reached a file made before. It reads the working tree, as
# the gate does; what it cannot read is refused, never passed over.
mig="$here"/check_migrations.py
r="$t/migrations"
mkdir -p "$r/server/src/login" && git -C "$r" init -q && git -C "$r" commit -q --allow-empty -m root && root=$(git -C "$r" rev-parse HEAD)
open_db() { printf 'const db = openDatabase(config.database, [\n  %s,\n]);\n' "$1" >"$r/server/src/main.ts"; }
table() { # $1: the constant, $2: its table (default: the constant's name), $3: its folder under server/src
	printf 'export const %s = `\n  CREATE TABLE %s (x TEXT) STRICT;\n`;\n' "$1" "${2:-$1}" >"$r/server/src/${3:-}$1.ts"
}
judge() { out=$(cd "$r" && python3 -I "$mig" "${1:-$base}" 2>&1); }
refuses() { # $1: what it is, $2: a name its message must give, $3: the base (default: $base)
	judge "${3:-}" && fail "check_migrations accepted $1"
	printf '%s' "$out" | grep -qF -- "$2" || fail "check_migrations refused $1 without naming $2: $out"
}
table LOGIN_TABLES "" login/ && table ROOM_TABLES && open_db "LOGIN_TABLES, ROOM_TABLES"
git -C "$r" add -A && git -C "$r" commit -qm base && base=$(git -C "$r" rev-parse HEAD)
judge || fail "check_migrations refused main's own migrations: $out"
judge "$root" || fail "check_migrations refused a branch from a main with no server: $out"
refuses "a base that names no commit" no_such_base no_such_base
table MUTE_TABLES && open_db "LOGIN_TABLES, ROOM_TABLES, MUTE_TABLES"
judge || fail "check_migrations refused a migration added after main's: $out"
table RENAMED LOGIN_TABLES && open_db "RENAMED, ROOM_TABLES, MUTE_TABLES"
judge || fail "check_migrations refused main's migration renamed, its text kept: $out"
table LOGIN_TABLES other login/ && open_db "LOGIN_TABLES, ROOM_TABLES, MUTE_TABLES" && refuses "a migration of main edited in place (F466)" LOGIN_TABLES
table LOGIN_TABLES "" login/
open_db "ROOM_TABLES, LOGIN_TABLES, MUTE_TABLES" && refuses "main's migrations reordered" LOGIN_TABLES
open_db "LOGIN_TABLES, MUTE_TABLES" && refuses "a migration of main removed" ROOM_TABLES
open_db "LOGIN_TABLES" && refuses "main's list cut short" ROOM_TABLES
rm "$r/server/src/main.ts" && refuses "main.ts gone" LOGIN_TABLES
printf 'const db = openDatabase(config.database, MIGRATIONS);\n' >"$r/server/src/main.ts" && refuses "a list it cannot read" main.ts
open_db 'LOGIN_TABLES, ROOM_TABLES, ...MORE' && refuses "a list holding a spread" main.ts
open_db 'LOGIN_TABLES, ROOM_TABLES, `CREATE TABLE z (x TEXT) STRICT;`' && refuses "a migration written in the list" main.ts
open_db "LOGIN_TABLES, ROOM_TABLES"
for form in '"\n  CREATE TABLE ROOM_TABLES (x TEXT) STRICT;\n"' 'sql`\n  CREATE TABLE ROOM_TABLES (x TEXT) STRICT;\n`' 'LOGIN_TABLES'; do
	printf "export const ROOM_TABLES = $form;\n" >"$r/server/src/ROOM_TABLES.ts" && refuses "main's migration as $form" ROOM_TABLES
done
table ROOM_TABLES && judge || fail "check_migrations refused main's migrations, restored: $out"
table ROOM_TABLES "" login/ && refuses "a migration defined twice" ROOM_TABLES
rm "$r/server/src/login/ROOM_TABLES.ts"
# One built from a value is refused on main too: the same source may hold another text.
printf 'export const ROOM_TABLES = `\n  CREATE TABLE ${ROOM} (x TEXT) STRICT;\n`;\n' >"$r/server/src/ROOM_TABLES.ts"
git -C "$r" add -A && git -C "$r" commit -qm valued && valued=$(git -C "$r" rev-parse HEAD)
refuses "a migration built from a value, the same on main" ROOM_TABLES "$valued"
# An escaped backtick ends the text early, hiding a change past it: an escape is refused.
printf 'export const ROOM_TABLES = `\n  CREATE TABLE \\`r\\` (x TEXT) STRICT;\n`;\n' >"$r/server/src/ROOM_TABLES.ts"
git -C "$r" add -A && git -C "$r" commit -qm escaped && escaped=$(git -C "$r" rev-parse HEAD)
printf 'export const ROOM_TABLES = `\n  CREATE TABLE \\`r\\` (y TEXT) STRICT;\n`;\n' >"$r/server/src/ROOM_TABLES.ts"
refuses "a migration with an escape, changed past it" ROOM_TABLES "$escaped"
# The list main.ts imports from server/src/migrations.ts (SV2), read there; main's own may still be in main.ts.
table ROOM_TABLES
held() { printf 'export const migrations: readonly string[] = [\n  %s,\n];\n' "$1" >"$r/server/src/migrations.ts"; }
named() { printf 'import { migrations } from "%s";\nconst db = openDatabase(config.database, migrations);\n' "${1:-./migrations.ts}" >"$r/server/src/main.ts"; }
named && held "LOGIN_TABLES, ROOM_TABLES, MUTE_TABLES" && judge || fail "check_migrations refused main's list moved to migrations.ts: $out"
held "ROOM_TABLES, LOGIN_TABLES, MUTE_TABLES" && refuses "main's migrations reordered in migrations.ts" LOGIN_TABLES
held "LOGIN_TABLES, ROOM_TABLES" && git -C "$r" add -A && git -C "$r" commit -qm moved && moved=$(git -C "$r" rev-parse HEAD)
held "LOGIN_TABLES" && refuses "main's list in migrations.ts cut short" ROOM_TABLES "$moved"
held "LOGIN_TABLES, ROOM_TABLES" && named ./other.ts && refuses "a list imported from another file" main.ts "$moved"
named && rm "$r/server/src/migrations.ts" && refuses "migrations.ts gone" main.ts "$moved"
fi

if part patch_coverage; then
# patch_coverage: the share of changed lines that the tests run, like a pull request's
# patch coverage, from Vitest's JSON report and git's diff.
patch="$here"/patch_coverage.py
c="$t/tests/cov" # under a folder named tests: only paths inside the repository count (F098)
mkdir -p "$c/src" "$c/coverage"
git -C "$c" init -q && printf 'one\n' >"$c/src/a.ts" && git -C "$c" add -A && git -C "$c" commit -qm base
printf 'one\ntwo\nthree\nfour\n' >"$c/src/a.ts"
cover() { # $1: hit count of line 3's statement
	printf '{"%s/src/a.ts":{"statementMap":{"0":{"start":{"line":2}},"1":{"start":{"line":3}},"2":{"start":{"line":4}}},"s":{"0":1,"1":%s,"2":1}}}' "$c" "$1" >"$c/coverage/coverage-final.json"
	(cd "$c" && python3 -I "$patch" HEAD 85 >/dev/null 2>&1)
}
unmeasured() { # each file, alone in the patch, must be measured
	for f; do
		printf 'x\n' >"$c/$f" && git -C "$c" add "$f"
		cover 1 && fail "patch_coverage let $f go unmeasured"
		git -C "$c" rm -q --cached "$f" && rm "$c/$f"
	done
}
cover 1 || fail "patch_coverage refused a patch whose lines are all run"
cover 0 && fail "patch_coverage accepted a patch at 67%, under 85%"
printf 'export const b = 1;\n' >"$c/src/b.ts" && git -C "$c" add src/b.ts
cover 1 && fail "patch_coverage accepted a changed file the coverage report does not measure"
git -C "$c" rm -q --cached src/b.ts && rm "$c/src/b.ts"
printf 'x\n' >"$c/src/a.test.ts" && printf 'x\n' >"$c/vitest.config.ts" && git -C "$c" add src/a.test.ts vitest.config.ts
cover 1 || fail "patch_coverage refused a changed test or config file, which coverage never measures"
# Playwright's tests and their helpers are tests; the app's document shell and server entry
# render only in the build, which the journeys walk; the app's other code is measured like any.
mkdir -p "$c/app/tests/e2e" "$c/app/src/routes"
printf 'x\n' >"$c/app/tests/e2e/a.spec.ts" && printf 'x\n' >"$c/app/tests/e2e/fixtures.ts"
printf 'x\n' >"$c/app/src/root.tsx" && printf 'x\n' >"$c/app/src/entry.server.tsx" && git -C "$c" add app
cover 1 || fail "patch_coverage asked coverage of a Playwright test, the document shell or the server entry"
unmeasured app/src/site.ts app/src/routes/a.tsx
git -C "$c" rm -rq --cached app && rm -r "$c/app"
# The server's entry runs in child processes, which coverage does not follow; its other files are measured.
mkdir -p "$c/server/src"
printf 'x\n' >"$c/server/src/main.ts" && git -C "$c" add server
cover 1 || fail "patch_coverage asked coverage of the server's entry, which runs in child processes"
git -C "$c" rm -rq --cached server && rm "$c/server/src/main.ts"
unmeasured server/src/app.ts
rm -r "$c/server"
# Storybook's config is a config and a test setup a test's, and its pages (the stories, the
# overview) the journeys shoot, so none is measured; code named alike is.
mkdir -p "$c/packages/ui/.storybook" "$c/packages/ui/src/Overview"
printf 'x\n' >"$c/packages/ui/.storybook/main.ts" && printf 'x\n' >"$c/packages/ui/.storybook/preview.ts"
printf 'x\n' >"$c/packages/ui/src/testSetup.ts" && printf 'x\n' >"$c/packages/ui/src/Card.stories.tsx"
printf 'x\n' >"$c/packages/ui/src/Overview/Overview.tsx" && git -C "$c" add packages
cover 1 || fail "patch_coverage asked coverage of Storybook's config, its pages or the tests' setup"
unmeasured packages/ui/src/storybook.ts packages/ui/src/setup.ts packages/ui/src/stories.tsx packages/ui/src/Overview.tsx
# A file named like a story outside the design system is no page Storybook builds: it is measured.
mkdir -p "$c/app/src" && unmeasured app/src/limit.stories.tsx && rm -r "$c/app/src"
# Beside the overview's page, its folder's other files are code like any.
mkdir -p "$c/packages/ui/src/Overview" && unmeasured packages/ui/src/Overview/Region.tsx
git -C "$c" rm -rq --cached packages && rm -r "$c/packages"
# A statement over several lines counts when any of its lines changed, not only its first.
git -C "$c" rm -q --cached src/a.test.ts vitest.config.ts && rm "$c/src/a.test.ts" "$c/vitest.config.ts" && git -C "$c" add src/a.ts && git -C "$c" commit -qm four
printf 'one\ntwo\nTHREE\nfour\n' >"$c/src/a.ts"
printf '{"%s/src/a.ts":{"statementMap":{"0":{"start":{"line":2},"end":{"line":4}}},"s":{"0":0}}}' "$c" >"$c/coverage/coverage-final.json"
(cd "$c" && python3 -I "$patch" HEAD 85 >/dev/null 2>&1) && fail "patch_coverage passed an untested statement whose inner line changed"
# A coverage run that failed leaves no report (Vitest deletes coverage/ and writes none): said plainly, with no traceback.
rm -f "$c/coverage/coverage-final.json"
out=$(cd "$c" && python3 -I "$patch" HEAD 85 2>&1) && fail "patch_coverage passed with no coverage report"
printf '%s\n' "$out" | grep -q "no coverage report" || fail "patch_coverage did not say that the coverage left no report: $out"
printf '%s\n' "$out" | grep -q Traceback && fail "patch_coverage ended on a traceback with no coverage report: $out"
fi

if part review_pass; then
# review_pass: /pre-merge records the tree it reviewed; a later change to the code voids it,
# the review log committed after it does not.
v="$t/review"
mkdir -p "$v/docs" "$v/src"
git -C "$v" init -q
commit() { git -C "$v" add -A && git -C "$v" commit -qm "$1"; }
echo one >"$v/src/a.ts" && echo log >"$v/docs/review-log.md" && commit base
(cd "$v" && python3 -I "$rp" check HEAD >/dev/null 2>&1) && fail "review_pass accepted a tree nobody reviewed"
(cd "$v" && python3 -I "$rp" record HEAD "test-auditor, code-review" >/dev/null) || fail "review_pass could not record a pass"
echo more >>"$v/docs/review-log.md" && commit log
(cd "$v" && python3 -I "$rp" check HEAD >/dev/null 2>&1) || fail "review_pass refused a tree whose only change is the review's own record"
echo two >>"$v/src/a.ts" && commit code
(cd "$v" && python3 -I "$rp" check HEAD >/dev/null 2>&1) && fail "review_pass accepted code changed after the review"
fi

if part pre_push; then
# pre-push: a work branch gets the fast gate and the secret scan, main the full gate and a
# review pass. A fake gate, a fake gitleaks and a throwaway repository stand in.
w="$t/push"
mkdir -p "$w/scripts" "$w/.githooks" "$w/docs" "$t/pushbin"
printf '#!/bin/sh\necho "gate $*" >>"$(dirname "$0")/../gate.log"\n' >"$w/scripts/check.sh"
printf '#!/bin/sh\necho scanned >>"%s/leaks.log"\nexit "${LEAKS:-0}"\n' "$w" >"$t/pushbin/gitleaks" && chmod +x "$t/pushbin/gitleaks"
printf 'gate.log\nleaks.log\n' >"$w/.gitignore"
cp "$rp" "$here/repo_files.py" "$w/scripts/" && cp "$hooks/pre-push" "$hooks/records.sh" "$w/.githooks/" && secrets_into "$w/.githooks/"
git -C "$w" init -q && echo x >"$w/a.ts" && git -C "$w" add -A && git -C "$w" commit -qm base
head=$(git -C "$w" rev-parse HEAD)
hook() { (cd "$w" && PATH="$t/pushbin:$PATH" sh .githooks/pre-push origin url >/dev/null 2>&1); }
push() { printf 'refs/heads/%s %s refs/heads/%s 0000000000000000000000000000000000000000\n' "$1" "$head" "$1" | hook; }
passed() { (cd "$w" && python3 -I scripts/review_pass.py record HEAD test >/dev/null) && git -C "$w" add -A && git -C "$w" commit -qm pass && head=$(git -C "$w" rev-parse HEAD); }
push slice-1a || fail "pre-push refused a work branch whose gate passes"
[ "$(tail -n 1 "$w/gate.log")" = "gate " ] || fail "pre-push ran more than the fast gate for a work branch"
grep -q scanned "$w/leaks.log" || fail "pre-push did not scan a work branch for secrets"
# In a subshell: sh keeps a variable set before a function call, which made every later push fail (F127).
(LEAKS=1 push slice-1a) && fail "pre-push let a work branch through with a secret found"
push main && fail "pre-push let main through with no review pass"
(cd "$w" && python3 -I scripts/review_pass.py record HEAD test >/dev/null)
push main && fail "pre-push let main through with a pass not yet committed"
git -C "$w" add -A && git -C "$w" commit -qm pass && head=$(git -C "$w" rev-parse HEAD)
push main || fail "pre-push refused main with a committed review pass"
[ "$(tail -n 1 "$w/gate.log")" = "gate --full" ] || fail "pre-push did not run the full gate for main"
# Main gets no harness change a commit does not declare: the branch's gate is its own harness (F089).
since() { printf 'refs/heads/main %s refs/heads/main %s\n' "$head" "$1" | hook; }
base=$head && printf 'allow = []\n' >"$w/scripts/gitleaks.toml" && echo z >"$w/c.ts"
git -C "$w" add -A && git -C "$w" commit -qm "loosen the scan" && passed
since "$base" && fail "pre-push let main take a harness change no commit declares"
since 1111111111111111111111111111111111111111 && fail "pre-push passed main against a remote commit it cannot read (F116)"
git -C "$w" commit -q --allow-empty -m "declare" -m "Harness-changed: scripts/gitleaks.toml" && passed
since "$base" && fail "pre-push took a declaration with no reason"
git -C "$w" commit -q --allow-empty -m "declare" -m "Harness-changed: scripts/gitleaks.toml - the test's own rules" && passed
since "$base" || fail "pre-push refused main with its harness change declared"
printf '#!/bin/sh\nexit 1\n' >"$w/scripts/check.sh"
git -C "$w" add -A && git -C "$w" commit -qm "failing gate" && head=$(git -C "$w" rev-parse HEAD)
push slice-1a && fail "pre-push let a push through a failing gate"

# pre-push refuses a push of anything but the checked-out commit, clean.
echo y >"$w/b.ts" && git -C "$w" add -A && git -C "$w" commit -qm more
printf '#!/bin/sh\nexit 0\n' >"$w/scripts/check.sh"
old=$(git -C "$w" rev-parse HEAD~1)
printf 'refs/heads/x %s refs/heads/x 0000000000000000000000000000000000000000\n' "$old" | hook && fail "pre-push let through a commit other than the checked-out one"
echo dirty >>"$w/b.ts"
head=$(git -C "$w" rev-parse HEAD) && push slice-1a && fail "pre-push let through a tree with uncommitted changes"
git -C "$w" checkout -q -- b.ts
touch "$w/stray.ts" && push slice-1a && fail "pre-push let through a tree with an untracked file"
rm "$w/stray.ts"
fi

if part pre_commit; then
# pre-commit runs the gate on the staged files, and a failing gate stops the commit.
c2="$t/precommit"
precommit() { (cd "$c2" && sh "$hooks/pre-commit" "$@" >/dev/null 2>&1); }
mkdir -p "$c2/scripts" && git -C "$c2" init -q && good_rules "$c2"
printf '#!/bin/sh\nexit 1\n' >"$c2/scripts/check.sh" && cp "$here/code_changed.sh" "$here/borrow_node_modules.sh" "$here/check_docs.py" "$here/repo_files.py" "$here/speeds.py" "$c2/scripts/" && secrets_into "$c2/scripts/" && git -C "$c2" add -A && git -C "$c2" commit -qm base
echo code >"$c2/a.ts" && git -C "$c2" add a.ts
precommit && fail "pre-commit let a commit through a failing gate"
[ ! -e "$c2/.claude/tmp/green-fast" ] || fail "pre-commit recorded code whose gate failed (F076)"
printf '#!/bin/sh\nexit 0\n' >"$c2/scripts/check.sh" && git -C "$c2" add -A
precommit || fail "pre-commit stopped a commit whose gate passes"
grep -qxF "$(cd "$c2" && . "$hooks/records.sh" && code_print "$(git write-tree)")" "$c2/.claude/tmp/green-fast" || fail "pre-commit did not record the code it passed (F076)"
# A secret in what is staged stops the commit, docs included.
mkdir -p "$t/leakbin" && printf '#!/bin/sh\nexit 1\n' >"$t/leakbin/gitleaks" && chmod +x "$t/leakbin/gitleaks"
(cd "$c2" && PATH="$t/leakbin:$PATH" sh "$hooks/pre-commit" >/dev/null 2>&1) && fail "pre-commit let a commit through a secret scan that found one"
git -C "$c2" commit -qm code && mkdir -p "$c2/docs" && echo prose >"$c2/docs/a.md" && git -C "$c2" add docs/a.md
precommit || fail "pre-commit stopped a docs-only commit with no secret"
(cd "$c2" && PATH="$t/leakbin:$PATH" sh "$hooks/pre-commit" >/dev/null 2>&1) && fail "pre-commit let a docs-only commit through a secret scan that found one"
# The staged gate is the one that runs: it must match the working tree's, or a commit gates itself.
git -C "$c2" commit -qm docs && printf '#!/bin/sh\nexit 1\n' >"$c2/scripts/check.sh" && git -C "$c2" add scripts/check.sh && git -C "$c2" commit -qm red
blob=$(printf '#!/bin/sh\nexit 0\n' | git -C "$c2" hash-object -w --stdin) && git -C "$c2" update-index --cacheinfo "100755,$blob,scripts/check.sh"
echo more >>"$c2/a.ts" && git -C "$c2" add a.ts
precommit && fail "pre-commit let a staged gate differ from the working tree's"
# An edit of the harness that is not staged is not in the commit: it does not stop one.
git -C "$c2" reset -q && printf '#!/bin/sh\nexit 0\n' >"$c2/scripts/check.sh" && git -C "$c2" add scripts/check.sh && git -C "$c2" commit -qm green
printf '#!/bin/sh\nexit 0\n# being edited\n' >"$c2/scripts/check.sh" && echo again >>"$c2/a.ts" && git -C "$c2" add a.ts
precommit || fail "pre-commit refused a commit for a harness edit it does not hold"
# The helpers it runs come from what is staged, not from the disk: an unstaged edit of one
# must not neuter the gate (finding F067).
git -C "$c2" checkout -q -- scripts/check.sh && printf '#!/bin/sh\nexit 1\n' >"$c2/scripts/check.sh" && git -C "$c2" add scripts/check.sh && git -C "$c2" commit -qm red
printf '#!/bin/sh\ncp /dev/null "$1/scripts/check.sh"\n' >"$c2/scripts/borrow_node_modules.sh"
echo yet >>"$c2/a.ts" && git -C "$c2" add a.ts
precommit && fail "pre-commit ran an unstaged helper that emptied the gate"
git -C "$c2" checkout -q -- scripts/borrow_node_modules.sh && printf '#!/bin/sh\nexit 1\n' >"$c2/scripts/code_changed.sh"
precommit && fail "pre-commit ran an unstaged code_changed.sh that skipped the gate"
git -C "$c2" checkout -q -- scripts/code_changed.sh
# Every staged harness file is compared, whatever its name: a space or an accent included.
printf '#!/bin/sh\nexit 0\n' >"$c2/scripts/check.sh" && git -C "$c2" add scripts/check.sh
for name in 'my file.sh' 'é.sh'; do
	echo 'exit 0' >"$c2/scripts/$name" && git -C "$c2" add "scripts/$name" && echo 'exit 1' >"$c2/scripts/$name"
	precommit && fail "pre-commit let a staged scripts/$name differ from the working tree's"
	git -C "$c2" rm -qf --cached "scripts/$name" && rm "$c2/scripts/$name"
done
# The hooks and the settings are harness too; a code file partly staged is not.
for f in .githooks/pre-push .github/workflows/gate.yml .claude/settings.json; do
	mkdir -p "$c2/${f%/*}" && echo '{}' >"$c2/$f" && git -C "$c2" add "$f" && echo '{"x":1}' >"$c2/$f"
	precommit && fail "pre-commit let a staged $f differ from the working tree's"
	git -C "$c2" rm -qf --cached "$f" && rm "$c2/$f"
done
echo partly >>"$c2/a.ts" && git -C "$c2" add a.ts && echo unstaged >>"$c2/a.ts"
precommit || fail "pre-commit refused a code file only partly staged"
# A code_changed.sh that fails is no proof of prose alone, in the sandbox too (F133).
git -C "$c2" checkout -q -- a.ts && printf 'exit 2\n' >"$c2/scripts/code_changed.sh" && git -C "$c2" add scripts/code_changed.sh
echo broken >>"$c2/a.ts" && git -C "$c2" add a.ts
precommit && fail "pre-commit took a failing code_changed.sh for prose alone (F133)"
git -C "$c2" checkout -q HEAD -- scripts/code_changed.sh a.ts
# It hands the staged gate what the commit changes, one path a line: a rename's two paths, what is
# staged only, so check.sh checks those areas alone.
printf '#!/bin/sh\nprintf "%%s" "$GATE_CHANGED" >"%s/gate-changed"\nprintf "%%s" "${GATE_MERGE-unset}" >"%s/gate-merge"\n' "$t" "$t" >"$c2/scripts/check.sh" && echo x >"$c2/c.ts" && echo x >"$c2/g.ts"
git -C "$c2" add -A && git -C "$c2" commit -qm listing
echo listed >>"$c2/a.ts" && git -C "$c2" add a.ts && git -C "$c2" mv c.ts d.ts && echo unstaged >>"$c2/g.ts" && echo untracked >"$c2/u.ts"
precommit || fail "pre-commit failed with a gate that passes"
[ "$(sort "$t/gate-changed" | paste -sd' ' -)" = "a.ts c.ts d.ts" ] || fail "pre-commit handed the gate another list than the commit's: $(cat "$t/gate-changed")"
# It tells the staged gate, which has no repository to ask, that a merge is being committed: pre-merge-commit's --merge (git
# writes MERGE_HEAD only after that hook) or a merge in progress (a conflict concluded by hand). A work commit says no
# (a merge commit has no time budget, a work commit keeps its own: Alexis, 2026-10-28).
[ "$(cat "$t/gate-merge")" = 0 ] || fail "pre-commit told the gate a work commit was a merge: $(cat "$t/gate-merge")"
precommit --merge || fail "pre-commit refused a merge with a gate that passes"
[ "$(cat "$t/gate-merge")" = 1 ] || fail "pre-commit did not tell the gate pre-merge-commit's merge was one: $(cat "$t/gate-merge")"
git -C "$c2" rev-parse HEAD >"$c2/.git/MERGE_HEAD" && precommit || fail "pre-commit refused a merge in progress with a gate that passes"
[ "$(cat "$t/gate-merge")" = 1 ] || fail "pre-commit did not tell the gate a merge in progress was one: $(cat "$t/gate-merge")"
rm -f "$c2/.git/MERGE_HEAD" "$c2/.claude/tmp/green-fast" # a work commit of a recorded tree would run no second gate to ask
GATE_MERGE=1 precommit && [ "$(cat "$t/gate-merge")" = 0 ] || fail "pre-commit passed on a GATE_MERGE of its caller: a work commit's budget would be off"
git -C "$c2" reset -q --hard && rm -f "$c2/u.ts"
# The staged copy holds what the commit holds, whatever store its caller names (F4923): git does not check an object against its
# name as it reads it, so a caller's GIT_OBJECT_DIRECTORY (the real store behind it as an alternate) or GIT_COMMON_DIR (a copy of
# .git) holding a planted object under the staged file's name had the gate pass code the commit does not hold.
c3="$t/precommit-store"
mkdir -p "$c3/scripts" && git -C "$c3" init -q && good_rules "$c3"
printf '#!/bin/sh\ncat "$(dirname "$0")/../a.ts" >"%s/store-saw"\n! grep -q bad "$(dirname "$0")/../a.ts"\n' "$t" >"$c3/scripts/check.sh"
cp "$here/code_changed.sh" "$here/borrow_node_modules.sh" "$here/check_docs.py" "$here/repo_files.py" "$here/speeds.py" "$c3/scripts/" && secrets_into "$c3/scripts/"
git -C "$c3" add -A && git -C "$c3" commit -qm base && echo bad >"$c3/a.ts" && git -C "$c3" add a.ts
blob=$(git -C "$c3" rev-parse :a.ts)
plant() { # $1: an objects folder, given a loose object named $blob that holds another text
	mkdir -p "$1/${blob%"${blob#??}"}" && rm -f "$1/${blob%"${blob#??}"}/${blob#??}"
	python3 -I -c 'import sys, zlib; b = b"good\n"; open(sys.argv[1], "wb").write(zlib.compress(b"blob %d\0" % len(b) + b))' "$1/${blob%"${blob#??}"}/${blob#??}"
}
stored() { # $@: the caller's environment; the gate must run, see the staged text and refuse it
	rm -f "$t/store-saw"
	(cd "$c3" && env "$@" sh "$hooks/pre-commit" >/dev/null 2>&1) && fail "pre-commit passed a gate that refuses the staged code, given $*"
	[ "$(cat "$t/store-saw" 2>/dev/null)" = bad ] || fail "pre-commit gated what the caller's store holds under the staged file's name ($(cat "$t/store-saw" 2>/dev/null || echo no gate ran)), not the staged file, given $*"
}
stored GIT_PAGER=cat
plant "$t/store"
stored GIT_OBJECT_DIRECTORY="$t/store" GIT_ALTERNATE_OBJECT_DIRECTORIES="$c3/.git/objects"
cp -R "$c3/.git" "$t/common" && plant "$t/common/objects"
stored GIT_COMMON_DIR="$t/common"
[ "$(git -C "$c3" cat-file -p "$blob")" = bad ] || fail "the store test planted its object in the repository itself"
fi

if part outside; then
# Outside the sandbox, in Alexis's shell, a hook runs only its own lines, git, gitleaks and the
# scripts Claude cannot edit; it takes the code the sandboxed gate recorded green (F076).
o="$t/outside"
mkdir -p "$o/scripts" "$o/.githooks" "$o/.claude/tmp" "$o/docs"
# The hooks run beside the scripts they run, as installed (F129).
cp "$hooks"/* "$here/code_changed.sh" "$here/install_hooks.sh" "$o/.githooks/" && secrets_into "$o/.githooks/"
# What Claude can edit, and a hook could reach, leaves a mark when it runs.
for f in check.sh borrow_node_modules.sh; do printf '#!/bin/sh\n: >"%s/ran"\n' "$o" >"$o/scripts/$f"; done
for f in review_pass.py check_docs.py repo_files.py; do printf 'open("%s/ran", "w")\n' "$o" >"$o/scripts/$f"; done
printf '.claude/tmp\nran\n' >"$o/.gitignore" && echo one >"$o/a.ts"
git -C "$o" init -q && git -C "$o" add -A && git -C "$o" commit -qm base
# Installed as Alexis does, so pre-push finds the hooks of the main it pushes (F129); the section
# runs each hook itself, so git, pointed at an empty folder, runs none at a commit.
(cd "$o" && sh .githooks/install_hooks.sh HEAD >/dev/null)
mkdir "$t/no-hooks" && git -C "$o" config core.hooksPath "$t/no-hooks"
out() { (cd "$o" && env -u SANDBOX_RUNTIME "$@" >/dev/null 2>&1); }
mark() { (cd "$o" && . .githooks/records.sh && p=$(code_print "$1") && put "$p" "$2" && if [ "$2" = full ]; then put "$p" fast; fi); } # as a gate records: the full one writes both
untouched() { [ ! -e "$o/ran" ] || fail "$1 ran the repository's code outside the sandbox (F076)"; }
echo two >>"$o/a.ts" && git -C "$o" add a.ts
out sh .githooks/pre-commit && fail "pre-commit outside the sandbox took code no gate passed"
(cd "$o" && SANDBOX_RUNTIME= sh .githooks/pre-commit >/dev/null 2>&1) && fail "pre-commit took an empty SANDBOX_RUNTIME for the sandbox"
untouched pre-commit
full=$(cd "$o" && . .githooks/records.sh && code_print "$(git write-tree)")
printf '%s\n\n%sx\n' "${full%??????????}" "$full" >>"$o/.claude/tmp/green-fast"
out sh .githooks/pre-commit && fail "pre-commit outside the sandbox took a partial or empty record"
out sh .githooks/pre-merge-commit && fail "pre-merge-commit outside the sandbox took code no gate passed"
mark "$(git -C "$o" write-tree)" fast
out sh .githooks/pre-commit || fail "pre-commit outside the sandbox refused code the gate passed"
out sh .githooks/pre-merge-commit || fail "pre-merge-commit outside the sandbox refused code the gate passed"
echo five >"$o/b.ts" && git -C "$o" add b.ts
mark "$(git -C "$o" write-tree)" full
out sh .githooks/pre-commit || fail "pre-commit outside the sandbox refused code its full gate passed"
git -C "$o" rm -qf --cached b.ts && rm "$o/b.ts"
for f in docs/n.md adr/figure.svg NOTES.md; do
	case $f in */*) mkdir -p "$o/${f%/*}" ;; esac
	echo prose >"$o/$f" && git -C "$o" add "$f"
done
out sh .githooks/pre-commit || fail "pre-commit outside the sandbox refused prose added to code the gate passed"
printf 'aws = "%s"\n' "$key" >"$o/leak.py" && git -C "$o" add leak.py && mark "$(git -C "$o" write-tree)" fast
out sh .githooks/pre-commit && fail "pre-commit outside the sandbox let a staged key through"
(cd "$o" && env -u SANDBOX_RUNTIME PATH=/usr/bin:/bin sh .githooks/pre-commit >/dev/null 2>&1) && fail "pre-commit outside the sandbox passed with no gitleaks"
git -C "$o" rm -qf --cached leak.py && rm "$o/leak.py"
printf 'p = "/Us''ers/alice/x"\n' >"$o/private.py" && git -C "$o" add private.py
mark "$(git -C "$o" write-tree)" fast
out sh .githooks/pre-commit && fail "pre-commit outside the sandbox let a home folder's path through"
git -C "$o" rm -qf --cached private.py && rm "$o/private.py"
printf 'fix: x\n\nSeen in /Us''ers/alice/notes\n' >"$t/outside-msg"
out sh .githooks/commit-msg "$t/outside-msg" && fail "commit-msg outside the sandbox let a home folder's path through"
git -C "$o" commit -qm two
untouched "pre-commit, pre-merge-commit"
# pre-push: a work branch wants a recorded gate; main the full gate, a review pass, its declarations.
head=$(git -C "$o" rev-parse HEAD)
push() { printf 'refs/heads/%s %s refs/heads/%s %s\n' "$1" "$head" "$1" "${2:-0000000000000000000000000000000000000000}" | out sh .githooks/pre-push origin url; }
push slice-1a || fail "pre-push outside the sandbox refused a branch the gate passed"
echo three >>"$o/a.ts" && git -C "$o" commit -qam three && head=$(git -C "$o" rev-parse HEAD)
echo prose >"$o/docs/m.md" && git -C "$o" add docs/m.md
out sh .githooks/pre-commit || fail "pre-commit outside the sandbox refused prose alone on code no gate passed"
git -C "$o" commit -qm prose && head=$(git -C "$o" rev-parse HEAD)
push slice-1a && fail "pre-push outside the sandbox took a branch no gate passed"
mark "$head" fast && push slice-1a || fail "pre-push outside the sandbox refused a branch once recorded"
pass() { p=$(cd "$o" && . .githooks/records.sh && review_print HEAD) && echo "2026-10-18 $p test" >>"$o/docs/review-passes.txt" && git -C "$o" add docs && git -C "$o" commit -qm pass && head=$(git -C "$o" rev-parse HEAD); }
pass
push main && fail "pre-push outside the sandbox took main the full gate never passed"
mark "$head" full && push main || fail "pre-push outside the sandbox refused main with its gate and review"
(cd "$o" && python3 -I "$here/review_pass.py" check HEAD >/dev/null) || fail "records.sh and review_pass.py print a tree differently"
echo log >>"$o/docs/review-log.md" && git -C "$o" add docs && git -C "$o" commit -qm log && head=$(git -C "$o" rev-parse HEAD)
push main || fail "pre-push outside the sandbox refused main once its review log was written"
base=$head
echo x >"$o/scripts/tool.sh"
git -C "$o" add scripts
git -C "$o" commit -qm tool
head=$(git -C "$o" rev-parse HEAD)
mark "$head" full
push slice-1a || fail "pre-push outside the sandbox refused a branch its full gate passed"
push main && fail "pre-push outside the sandbox took main whose review pass is for other code"
pass
push main "$base" && fail "pre-push outside the sandbox took an undeclared harness change"
push main 1111111111111111111111111111111111111111 && fail "pre-push outside the sandbox took a main it cannot compare"
git -C "$o" commit -q --allow-empty -m declare -m "Harness-changed: scripts/tool.sh - a test" && head=$(git -C "$o" rev-parse HEAD)
push main "$base" || fail "pre-push outside the sandbox refused main with its harness change declared"
printf 'aws = "%s"\n' "$key" >"$o/leak.py" && git -C "$o" add leak.py && git -C "$o" commit -qm leak && head=$(git -C "$o" rev-parse HEAD) && mark "$head" full && pass
push main && fail "pre-push outside the sandbox let main through with a key in its history"
push slice-1a && fail "pre-push outside the sandbox let a branch through with a key in its history"
untouched pre-push
# A merge of a branch onto the main it left gives the branch's code, which its gate recorded.
git -C "$o" checkout -q -b feature
echo four >>"$o/a.ts"
git -C "$o" commit -qam four
git -C "$o" checkout -q -
git -C "$o" merge -q --no-ff --no-commit feature >/dev/null 2>&1 || :
out sh .githooks/pre-merge-commit && fail "pre-merge-commit outside the sandbox took a merge no gate passed"
mark feature full
out sh .githooks/pre-merge-commit || fail "pre-merge-commit outside the sandbox refused a merge of a branch its gate passed"
git -C "$o" merge --abort
untouched pre-merge-commit
# A print is recorded once, however often its gate passes.
p=$(cd "$o" && . .githooks/records.sh && code_print HEAD)
(cd "$o" && . .githooks/records.sh && put "$p" once && put "$p" once) || fail "records.sh could not record a print"
[ "$(wc -l <"$o/.claude/tmp/green-once")" -eq 1 ] || fail "records.sh recorded the same print twice"
# A longer line that holds the print is no record of it: the print is still written, whole.
printf '%sx\n' "$p" >"$o/.claude/tmp/green-near"
(cd "$o" && . .githooks/records.sh && put "$p" near)
grep -qxF "$p" "$o/.claude/tmp/green-near" || fail "records.sh took a longer line for the print it records"
# The gate records the code it tested: the working tree's, prose aside and untracked files in,
# and nothing when that code changed while it ran (F133).
wt() { (cd "$o" && . .githooks/records.sh && worktree_print); }
[ "$(wt)" = "$p" ] || fail "records.sh printed a clean working tree unlike its HEAD"
echo prose >"$o/docs/w.md"
[ "$(wt)" = "$p" ] || fail "records.sh counted an untracked doc as code"
echo code >"$o/w.ts"
tested=$(wt)
[ "$tested" != "$p" ] || fail "records.sh left an untracked code file out"
echo more >>"$o/w.ts"
(cd "$o" && . .githooks/records.sh && gate_passed "$tested" true 2>/dev/null)
grep -qxF "$tested" "$o/.claude/tmp/green-fast" && fail "records.sh recorded code that changed while its gate ran (F133)"
tested=$(wt)
(cd "$o" && . .githooks/records.sh && gate_passed "$tested" true)
grep -qxF "$tested" "$o/.claude/tmp/green-full" && grep -qxF "$tested" "$o/.claude/tmp/green-fast" || fail "records.sh did not record a full gate's code in both records"
rm "$o/w.ts" "$o/docs/w.md"
(cd "$o" && . .githooks/records.sh && f=kept && p=kept && { green HEAD fast || :; } && [ "$f$p" = keptkept ]) || fail "records.sh left a variable set in the shell that sources it (F133)"
# A prose name with an accent stays prose, as code_changed.sh reads it (F133).
mark HEAD fast
mkdir -p "$o/adr" && echo prose >"$o/docs/café.md" && echo prose >"$o/adr/décision.md"
git -C "$o" add docs adr && git -C "$o" commit -qm accents
(cd "$o" && . .githooks/records.sh && green HEAD fast) || fail "records.sh took an accented doc for code (F133)"
# A code_changed.sh that fails, missing or broken, is no proof of prose alone (F133).
echo again >>"$o/a.ts" && git -C "$o" add a.ts
printf 'exit 2\n' >"$o/.githooks/code_changed.sh"
out sh .githooks/pre-commit && fail "pre-commit outside the sandbox took a failing code_changed.sh for prose alone (F133)"
rm "$o/.githooks/code_changed.sh"
out sh .githooks/pre-commit && fail "pre-commit outside the sandbox took a missing code_changed.sh for prose alone (F133)"
git -C "$o" checkout -q HEAD -- .githooks/code_changed.sh a.ts
untouched records
fi

if part installed; then
# The hooks live in .git/hooks, where no merge, checkout or sandboxed command writes, installed
# from main with the scripts they run: no branch brings its own into Alexis's shell (F129).
i="$t/installed"
mkdir -p "$i/scripts" "$i/.githooks" "$i/.claude/tmp" "$i/docs"
cp "$hooks"/* "$i/.githooks/"
cp "$here/code_changed.sh" "$here/install_hooks.sh" "$i/scripts/"
secrets_into "$i/scripts/"
printf '.claude/tmp\nran\n' >"$i/.gitignore"
echo one >"$i/a.ts"
git -C "$i" init -q -b main
git -C "$i" add -A
git -C "$i" commit -qm base
base=$(git -C "$i" rev-parse HEAD)
plant() { printf '#!/bin/sh\n: >"%s/ran"\n' "$i" >"$i/$1"; } # it leaves a mark when it runs
# Branches made before any hook is installed, so none runs at their commits:
# - planted: code where the hooks and their scripts are, a rule file that finds nothing, and a
#   script holding a NUL byte and an escape sequence, which a display could hide;
# - tweak: a hook changed and declared; settings: Claude Code's settings changed;
# - feature: code only; shadow: a script in the hooks folder named as one they run;
# - no-<hook>: one hook missing.
git -C "$i" checkout -q -b planted
for f in .githooks/pre-commit .githooks/pre-merge-commit .githooks/commit-msg .githooks/records.sh .githooks/merge.sh \
	scripts/scan_secrets.sh scripts/code_changed.sh scripts/install_hooks.sh; do
	plant "$f"
done
printf 'title = "finds nothing"\n' >"$i/scripts/gitleaks.toml"
printf 'echo hidden\0\n\033[1A\033[2Kecho covered\n' >"$i/scripts/nul.sh"
git -C "$i" add -A
git -C "$i" commit -qm plant
git -C "$i" checkout -q -b tweak main
echo '# a comment' >>"$i/.githooks/pre-push"
git -C "$i" commit -qam tweak -m "Harness-changed: .githooks/pre-push - a test"
git -C "$i" checkout -q -b settings main
echo '{}' >"$i/.claude/settings.json"
git -C "$i" add .claude/settings.json
git -C "$i" commit -qm settings
git -C "$i" checkout -q -b feature main
echo two >>"$i/a.ts"
git -C "$i" commit -qam feature
# cased: harness files spelled with capitals, which a case-blind disk takes for the real ones.
git -C "$i" checkout -q -b cased main
blob=$(echo 'echo planted' | git -C "$i" hash-object -w --stdin)
git -C "$i" update-index --add --cacheinfo "100644,$blob,Scripts/guard.py"
git -C "$i" update-index --add --cacheinfo "100644,$blob,.Claude/settings.json"
git -C "$i" commit -qm cased
git -C "$i" checkout -q -f main
# folded: a path whose letter this disk folds beyond ASCII (ſ is s there), unknown to git (F164).
git -C "$i" checkout -q -b folded main
git -C "$i" update-index --add --cacheinfo "100644,$blob,packageſ/evil/package.json"
git -C "$i" commit -qm folded
git -C "$i" checkout -q -f main
git -C "$i" checkout -q -b shadow main
plant .githooks/scan_secrets.sh
git -C "$i" add .githooks
git -C "$i" commit -qm shadow
for h in $hook_names; do
	git -C "$i" checkout -q -b "no-$h" main
	git -C "$i" rm -q ".githooks/$h"
	git -C "$i" commit -qm "no $h"
done
git -C "$i" checkout -q main
# As in Alexis's shell, with no mark of merge.sh and no hooks path of his own: from the root, or
# from a folder below it.
alexis() { env -u SANDBOX_RUNTIME -u GNOWORLD_MERGE GIT_CONFIG_GLOBAL=/dev/null GIT_MERGE_AUTOEDIT=no "$@"; }
in_i() { (cd "$i" && alexis "$@"); }
in_docs() { (cd "$i/docs" && alexis "$@"); }
mark_i() { (cd "$i" && . .git/hooks/records.sh && p=$(code_print "$1") && put "$p" "$2" && if [ "$2" = full ]; then put "$p" fast; fi); }
ran() { [ ! -e "$i/ran" ] || fail "$1 ran code a branch planted in the hooks or their scripts (F129)"; }
installed() { in_i sh .git/hooks/install_hooks.sh --check "${1:-main}" >/dev/null 2>&1; }
install() { in_i sh scripts/install_hooks.sh "$@" >/dev/null 2>&1; }
reinstall() { install && installed || fail "install_hooks.sh did not put main's hooks back"; }
untouched_main() { [ "$(git -C "$i" rev-parse HEAD)" = "$1" ] && [ ! -e "$i/.git/MERGE_HEAD" ]; }
# Alexis's own command, from a branch other than main and a folder below the root: main's hooks
# and scripts land in .git/hooks, executable, and git is taken off the repository's hooks, as
# prepare had pointed it, however many times; merges stop fast-forwarding, which runs no hook.
git -C "$i" config core.hooksPath .githooks
git -C "$i" config --add core.hooksPath .githooks
git -C "$i" checkout -q tweak
in_docs sh -c 'git --no-replace-objects show main:scripts/install_hooks.sh | sh' >/dev/null 2>&1 || fail "Alexis's install command failed"
git -C "$i" checkout -q main
[ "$(git -C "$i" rev-parse --git-path hooks)" = .git/hooks ] || fail "install_hooks.sh left git running the repository's hooks (F129)"
for f in $(git -C "$i" ls-tree -r --name-only main -- .githooks scripts/install_hooks.sh scripts/scan_secrets.sh scripts/code_changed.sh \
	scripts/gitleaks.toml scripts/gitleaks-private.toml scripts/.gitleaksignore); do
	git -C "$i" show "main:$f" | cmp -s - "$i/.git/hooks/${f##*/}" || fail "install_hooks.sh did not install main's $f"
done
for f in $hook_names; do [ -x "$i/.git/hooks/$f" ] || fail "install_hooks.sh left $f not executable, which git skips"; done
[ "$(git -C "$i" config merge.ff)" = false ] || fail "install_hooks.sh left merges free to fast-forward, which runs no hook (F129)"
[ "$(git -C "$i" config pull.ff)" = only ] || fail "install_hooks.sh left a pull free to make a merge commit"
# Every script a hook runs from its own folder is installed there.
for n in $(grep -oh 'dirname "$0")/[A-Za-z._-]*' "$hooks"/* | sed 's|.*/||' | sort -u); do
	[ -f "$i/.git/hooks/$n" ] || fail "install_hooks.sh leaves out $n, which a hook runs beside itself"
done
install || fail "install_hooks.sh failed with no override left to remove"
mv "$i/.git/hooks" "$t/hooks-away"
install || fail "install_hooks.sh failed where git's hooks folder was missing"
installed || fail "install_hooks.sh did not fill a missing hooks folder"
rm -r "$t/hooks-away"
printf '[core]\n\thooksPath = /elsewhere\n' >"$t/global-config"
in_i env GIT_CONFIG_GLOBAL="$t/global-config" sh scripts/install_hooks.sh >/dev/null 2>&1 && fail "install_hooks.sh passed with git's hooks still taken from elsewhere"
# --check: .git/hooks holds exactly a commit's files, real files, the hooks executable, nothing
# else that could run; it changes nothing.
installed || fail "install_hooks.sh --check refused the hooks it installed"
installed tweak && fail "install_hooks.sh --check took the hooks of another commit"
git -C "$i" config merge.ff true
installed && fail "install_hooks.sh --check took fast-forward merges back on, which run no hook (F159)"
git -C "$i" config merge.ff false
echo '# changed' >>"$i/.git/hooks/scan_secrets.sh"
installed && fail "install_hooks.sh --check took a changed scan_secrets.sh"
grep -q '# changed' "$i/.git/hooks/scan_secrets.sh" || fail "install_hooks.sh --check rewrote what it checks"
reinstall
rm "$i/.git/hooks/gitleaks-private.toml"
installed && fail "install_hooks.sh --check took a missing rule file"
reinstall
chmod a-x "$i/.git/hooks/pre-commit"
installed && fail "install_hooks.sh --check took a hook git would skip, not executable"
reinstall
ln -sf ../../.githooks/pre-commit "$i/.git/hooks/pre-commit"
installed && fail "install_hooks.sh --check took a link into the working tree, which a checkout changes"
reinstall
plant .git/hooks/post-checkout
chmod +x "$i/.git/hooks/post-checkout"
installed && fail "install_hooks.sh --check took a hook main does not hold"
reinstall
[ ! -e "$i/.git/hooks/post-checkout" ] || fail "install_hooks.sh left a hook main does not hold"
plant .git/hooks/prepare-commit-msg
chmod +x "$i/.git/hooks/prepare-commit-msg"
installed && fail "install_hooks.sh --check took prepare-commit-msg for commit-msg, a name inside it"
reinstall
[ ! -e "$i/.git/hooks/prepare-commit-msg" ] || fail "install_hooks.sh left prepare-commit-msg, which git runs at every commit"
# The install writes in place of a link, not through it into the working tree.
git -C "$i" checkout -q tweak
ln -sf ../../.githooks/pre-push "$i/.git/hooks/pre-push"
install
[ ! -L "$i/.git/hooks/pre-push" ] || fail "install_hooks.sh left a link for a hook"
git -C "$i" diff --quiet || fail "install_hooks.sh wrote through a link into the working tree"
git -C "$i" checkout -q main
# A commit with no hooks, or no pre-commit, or two files under one name: refused, and nothing
# installed changes.
empty=$(git -C "$i" hash-object -w -t tree /dev/null)
installed "$empty" && fail "install_hooks.sh --check took a commit that holds no hooks"
for h in $hook_names; do
	install "no-$h" && fail "install_hooks.sh installed hooks with no $h, so git would check nothing there"
done
install shadow && fail "install_hooks.sh installed two files under one name"
installed || fail "install_hooks.sh changed the hooks before refusing a commit"
# A replace ref makes git show other bytes for an object: the install, its check and Alexis's
# command read the objects themselves (F132's class).
evil=$(printf '#!/bin/sh\n: >"%s/ran"\n' "$i" | git -C "$i" hash-object -w --stdin)
for f in .githooks/pre-commit scripts/install_hooks.sh; do git -C "$i" replace "$(git -C "$i" rev-parse "main:$f")" "$evil"; done
install
git -C "$i" --no-replace-objects show main:.githooks/pre-commit | cmp -s - "$i/.git/hooks/pre-commit" || fail "install_hooks.sh installed what a replace ref shows (F132)"
git -C "$i" cat-file -p "$evil" >"$i/.git/hooks/pre-commit"
installed && fail "install_hooks.sh --check took what a replace ref shows for the commit (F132)"
in_docs sh -c 'git --no-replace-objects show main:scripts/install_hooks.sh | sh' >/dev/null 2>&1 || fail "Alexis's install command failed beside a replace ref"
git -C "$i" replace -d $(git -C "$i" replace -l) >/dev/null
installed || fail "Alexis's install command installed what a replace ref shows (F132)"
ran "install_hooks.sh"
# merge.sh merges no code its gate did not pass, then shows each harness file a branch changes,
# with its diff as text and its control bytes visible, and merges once the name is typed, from
# any folder of the repository.
echo planted | in_i sh .git/hooks/merge.sh planted >/dev/null 2>&1 && fail "merge.sh merged code no gate passed"
git -C "$i" merge --abort
mark_i planted fast
# A replace ref would show an innocent script where the branch holds a planted one.
innocent=$(echo 'echo innocent' | git -C "$i" hash-object -w --stdin)
git -C "$i" replace "$(git -C "$i" rev-parse planted:scripts/scan_secrets.sh)" "$innocent"
for answer in wrong '*' '' plante; do
	printf '%s\n' "$answer" | in_docs sh ../.git/hooks/merge.sh planted >"$t/merged" 2>&1 && fail "merge.sh merged on the answer '$answer'"
	untouched_main "$base" || fail "merge.sh began a merge on the answer '$answer'"
done
git -C "$i" replace -d $(git -C "$i" replace -l) >/dev/null
in_i sh .git/hooks/merge.sh planted </dev/null >/dev/null 2>&1 && fail "merge.sh merged with no answer"
for f in $(git -C "$i" diff --name-only main planted); do grep -qxF "$f" "$t/merged" || fail "merge.sh did not list $f"; done
grep -q '^+: >' "$t/merged" || fail "merge.sh did not show the harness's diff"
grep -q 'echo innocent' "$t/merged" && fail "merge.sh showed what a replace ref shows, not what merges (F132)"
grep -q 'echo hidden' "$t/merged" || fail "merge.sh showed a file holding a NUL byte as binary (F132)"
grep -q "$(printf '\033')" "$t/merged" && fail "merge.sh passed an escape sequence to the terminal, which can hide a line"
# What Alexis's own git would show instead: an external diff, a text conversion, colours.
printf '#!/bin/sh\necho NOTHING TO SEE\n' >"$t/fakediff"
chmod +x "$t/fakediff"
git -C "$i" config diff.external "$t/fakediff"
git -C "$i" config diff.fake.textconv "$t/fakediff"
echo '* diff=fake' >"$i/.git/info/attributes"
git -C "$i" config color.diff always
echo wrong | in_i sh .git/hooks/merge.sh planted >"$t/merged" 2>&1 || :
grep -q 'NOTHING TO SEE' "$t/merged" && fail "merge.sh showed a diff tool's rendering, not the text that merges (F156)"
grep -q '^+: >' "$t/merged" || fail "merge.sh showed no text of the harness's diff beside a diff tool (F156)"
grep -q '\^\[\[32m' "$t/merged" && fail "merge.sh showed colour codes, which can hide a line (F156)"
git -C "$i" config --unset diff.external
git -C "$i" config --unset diff.fake.textconv
git -C "$i" config --unset color.diff
rm "$i/.git/info/attributes"
# Capitals: on a case-blind disk, Scripts/guard.py is scripts/guard.py; merge.sh shows it (F151).
mark_i cased fast
echo wrong | in_i sh .git/hooks/merge.sh cased >"$t/cased" 2>&1 && fail "merge.sh merged harness files spelled with capitals unshown (F151)"
grep -qx 'Scripts/guard.py' "$t/cased" && grep -qx '.Claude/settings.json' "$t/cased" || fail "merge.sh did not show harness files spelled with capitals (F151)"
untouched_main "$base" || fail "merge.sh began a merge on a wrong answer"
# Beyond ASCII, git cannot tell what the disk folds: a path holding such a letter is refused,
# by merge.sh before it writes, and at the merge's commit (F164).
mark_i folded fast
echo folded | in_i sh .git/hooks/merge.sh folded >"$t/folded" 2>&1 && fail "merge.sh merged a path this disk may read as another (F164)"
grep -q 'non-ASCII' "$t/folded" || fail "merge.sh refused the folded path for another reason than its name (F164)"
untouched_main "$base" || fail "merge.sh began a merge of a path this disk may read as another"
in_i git merge -q --no-ff folded >"$t/out" 2>&1 && fail "a merge took a path this disk may read as another (F164)"
grep -q 'non-ASCII' "$t/out" && grep -q 'git reset --hard after a squash' "$t/out" || fail "pre-commit refused the folded path without saying why and how to undo it (F164)"
git -C "$i" merge --abort
# pre-push runs its own records and scan, not those of the branch it pushes.
git -C "$i" checkout -q planted
printf 'refs/heads/planted %s refs/heads/planted 0000000000000000000000000000000000000000\n' "$(git -C "$i" rev-parse HEAD)" |
	in_i sh .git/hooks/pre-push origin url >/dev/null 2>&1 || fail "pre-push refused a branch its gate passed"
git -C "$i" checkout -q main
ran "pre-push"
# merge.sh merges the commit it showed, even if the branch moves before the merge: a git that
# moves it when merge.sh asks for the status, after it read the branch.
shown=$(git -C "$i" rev-parse planted)
real_git=$(command -v git)
mkdir "$t/moving"
printf '#!/bin/sh\n[ "$1" != status ] || "%s" branch -f planted feature\nexec "%s" "$@"\n' "$real_git" "$real_git" >"$t/moving/git"
chmod +x "$t/moving/git"
echo planted | (PATH="$t/moving:$PATH" in_i sh .git/hooks/merge.sh planted) >/dev/null 2>&1 || fail "merge.sh refused to merge on the branch's name"
[ "$(git -C "$i" rev-parse HEAD^2)" = "$shown" ] || fail "merge.sh merged a commit other than the one it showed"
git -C "$i" branch -f planted "$shown"
ran "a merge"
# The working tree now holds the planted scripts and a rule file that finds nothing; the hooks
# scan with their own: a clean change passes, a key is refused by the scan.
echo clean >"$i/clean.ts"
git -C "$i" add clean.ts
mark_i "$(git -C "$i" write-tree)" fast
in_i sh .git/hooks/pre-commit >/dev/null 2>&1 || fail "pre-commit refused a clean change after the merge"
printf 'aws = "%s"\n' "$key" >"$i/leak.py"
git -C "$i" add leak.py
mark_i "$(git -C "$i" write-tree)" fast
in_i sh .git/hooks/pre-commit >"$t/out" 2>&1 && fail "pre-commit let a key through, with the working tree's rule file (F129)"
grep -q 'leaks found' "$t/out" || fail "pre-commit refused the key for another reason than the scan's"
git -C "$i" rm -qf --cached leak.py clean.ts
rm "$i/leak.py" "$i/clean.ts"
printf 'fix: x\n' >"$t/installed-msg"
in_i sh .git/hooks/commit-msg "$t/installed-msg" >/dev/null 2>&1 || fail "commit-msg refused a clean message after the merge"
printf 'fix: x\n\naws = %s\n' "$key" >"$t/installed-msg"
in_i sh .git/hooks/commit-msg "$t/installed-msg" >"$t/out" 2>&1 && fail "commit-msg let a key through, with the working tree's rule file (F129)"
grep -q 'the message holds' "$t/out" || fail "commit-msg refused the key for another reason than the scan's"
ran "pre-commit or commit-msg"
# merge.sh merges onto main only, with nothing uncommitted, staged or untracked, and starts
# nothing otherwise; with no harness change it asks for nothing.
git -C "$i" reset -q --hard "$base"
git -C "$i" checkout -q feature
echo planted | in_i sh .git/hooks/merge.sh planted >/dev/null 2>&1 && fail "merge.sh merged onto a branch other than main"
untouched_main "$(git -C "$i" rev-parse feature)" || fail "merge.sh began a merge onto a branch other than main"
git -C "$i" checkout -q main
for dirt in 'echo dirty >>a.ts' 'echo staged >>a.ts && git add a.ts' 'echo new >new.ts'; do
	(cd "$i" && sh -c "$dirt")
	echo planted | in_i sh .git/hooks/merge.sh planted >/dev/null 2>&1 && fail "merge.sh merged onto: $dirt"
	untouched_main "$base" || fail "merge.sh began a merge onto: $dirt"
	git -C "$i" reset -q --hard
	rm -f "$i/new.ts"
done
mark_i feature fast
in_i sh .git/hooks/merge.sh feature </dev/null >/dev/null 2>&1 || fail "merge.sh wanted a name for a merge with no harness change"
[ "$(git -C "$i" rev-parse HEAD^2)" = "$(git -C "$i" rev-parse feature)" ] || fail "merge.sh did not merge a branch with no harness change"
git -C "$i" reset -q --hard "$base"
# A merge that did not come through merge.sh has written the harness unseen: its commit is
# refused, whether git makes it or Alexis does after a conflict, and main does not
# fast-forward past every hook. A merge with no harness change needs no merge.sh.
in_i git merge -q planted >/dev/null 2>&1 && fail "a plain merge took harness changes merge.sh did not show (F129)"
[ "$(git -C "$i" rev-parse HEAD)" = "$base" ] || fail "a plain merge fast-forwarded main past every hook (F129)"
git -C "$i" merge --abort
mark_i settings fast
in_i git merge -q --no-ff settings >/dev/null 2>&1 && fail "a plain merge took a change of Claude Code's settings (F129)"
git -C "$i" merge --abort
for mark in "$base" ''; do
	in_i env GNOWORLD_MERGE="$mark" git merge -q --no-ff planted >/dev/null 2>&1 && fail "a merge took the mark '$mark' (F129)"
	git -C "$i" merge --abort
done
in_i git merge -q --no-ff --no-commit planted >/dev/null 2>&1 || :
in_i git commit -qm "Merge branch 'planted'" >/dev/null 2>&1 && fail "a merge concluded by hand took harness changes merge.sh did not show (F129)"
git -C "$i" merge --abort
# What is committed is the index: a harness file kept there, gone from the disk, still counts.
in_i git merge -q --no-ff --no-commit settings >/dev/null 2>&1 || :
rm "$i/.claude/settings.json"
in_i git commit -qm "Merge branch 'settings'" >/dev/null 2>&1 && fail "a merge took a harness change kept in the index only (F129)"
git -C "$i" merge --abort
# A squash merge writes the branch's files too, and leaves an ordinary commit to make: git
# refuses it once fast-forwards are off, and if it ran, the commit is refused.
in_i git merge -q --squash settings >/dev/null 2>&1 && fail "git took a squash merge with fast-forwards off"
in_i git -c merge.ff=true merge -q --squash settings >/dev/null 2>&1 || fail "the squash merge, allowed, did not run"
[ -e "$i/.git/SQUASH_MSG" ] || fail "the squash merge left no message to commit"
in_i git commit -qm "chore: squash settings" >"$t/out" 2>&1 && fail "a squash merge took harness changes merge.sh did not show (F129)"
grep -q 'git reset --hard' "$t/out" || fail "pre-commit told Alexis to abort a squash with git merge --abort, which cannot (F154)"
git -C "$i" reset -q --hard "$base"
rm -f "$i/.git/SQUASH_MSG"
ran "a refused merge"
in_i git merge -q --no-ff feature >/dev/null 2>&1 || fail "a merge with no harness change wanted merge.sh"
# pre-push wants .git/hooks to hold the hooks of the main it pushes, checked by the install
# script beside it: what runs is what was reviewed.
git -C "$i" reset -q --hard "$base"
mark_i tweak full
# The hooks checked are those of the commit pushed as main, not the local main's: tweak, with its
# gate and review, pushed as main from tweak.
git -C "$i" checkout -q tweak
p=$(cd "$i" && . .git/hooks/records.sh && review_print HEAD)
echo "2026-10-18 $p test" >"$i/docs/review-passes.txt"
git -C "$i" add docs
in_i git commit -qm "docs: pass" >/dev/null 2>&1 || fail "pre-commit refused a review pass"
printf 'refs/heads/tweak %s refs/heads/main %s\n' "$(git -C "$i" rev-parse HEAD)" "$base" | in_i sh .git/hooks/pre-push origin url >/dev/null 2>&1 &&
	fail "pre-push let a branch leave as main with hooks not installed from it (F129)"
git -C "$i" checkout -q main
echo tweak | in_i sh .git/hooks/merge.sh tweak >/dev/null 2>&1 || fail "merge.sh refused a declared harness change"
push_i() { printf 'refs/heads/main %s refs/heads/main %s\n' "$(git -C "$i" rev-parse HEAD)" "$base" | in_i sh .git/hooks/pre-push origin url >/dev/null 2>&1; }
push_i && fail "pre-push let main leave with hooks not installed from it (F129)"
install
push_i || fail "pre-push refused main once its hooks were installed"
mv "$i/.git/hooks/install_hooks.sh" "$t/install_hooks.sh"
push_i && fail "pre-push let main leave with nothing to check its hooks"
mv "$t/install_hooks.sh" "$i/.git/hooks/"
fi

if part check_hooks; then
# check.sh refuses git's hooks taken from elsewhere than .git/hooks; in the sandbox, a .git/hooks
# or a .git/config a command may write, and hooks not installed; a linked worktree's are the
# common folder's (F129).
ck="$t/checkhooks"
mkdir -p "$ck/scripts"
cp "$here/check.sh" "$ck/scripts/"
git -C "$ck" init -q
outer() { (cd "$1" && env -u SANDBOX_RUNTIME sh scripts/check.sh 2>&1); }
boxed() { (cd "$ck" && SANDBOX_RUNTIME=1 sh scripts/check.sh 2>&1); }
refused_any() { grep -q -e 'git runs hooks from' -e 'can write' -e 'so git checks no commit'; }
git -C "$ck" config core.hooksPath .githooks
outer "$ck" | grep -q "git runs hooks from" || fail "check.sh took git's hooks from the repository (F129)"
git -C "$ck" config --unset core.hooksPath
outer "$ck" | refused_any && fail "check.sh refused git's own hooks folder"
before=$(ls -A "$ck/.git/hooks")
cp "$ck/.git/config" "$t/config-before"
boxed | grep -q "a command in the sandbox can write" || fail "check.sh took a sandbox that lets a command write git's hooks and config (F129)"
[ "$(ls -A "$ck/.git/hooks")" = "$before" ] || fail "check.sh left its probe in .git/hooks"
cmp -s "$ck/.git/config" "$t/config-before" || fail "check.sh changed git's config while probing it"
chmod a-w "$ck/.git/config"
boxed | grep -q "a command in the sandbox can write" || fail "check.sh took a sandbox that lets a command write git's hooks (F129)"
[ "$(ls -A "$ck/.git/hooks")" = "$before" ] || fail "check.sh left in .git/hooks the file it probed with"
chmod u+w "$ck/.git/config"
chmod a-w "$ck/.git/hooks"
boxed | grep -q "a command in the sandbox can write" || fail "check.sh took a sandbox that lets a command write git's config (F129)"
chmod a-w "$ck/.git/config"
boxed | grep -q "so git checks no commit" || fail "check.sh took a repository whose hooks are not installed (F129)"
chmod u+w "$ck/.git/hooks"
for f in $hook_names; do
	printf '#!/bin/sh\n' >"$ck/.git/hooks/$f"
	chmod +x "$ck/.git/hooks/$f"
done
chmod a-w "$ck/.git/hooks"
boxed | refused_any && fail "check.sh refused a sealed sandbox with its hooks installed"
for f in $hook_names; do
	chmod u+w "$ck/.git/hooks"
	mv "$ck/.git/hooks/$f" "$t/$f.away"
	chmod a-w "$ck/.git/hooks"
	boxed | grep -q "so git checks no commit" || fail "check.sh took a repository with no $f installed (F129)"
	chmod u+w "$ck/.git/hooks"
	mv "$t/$f.away" "$ck/.git/hooks/$f"
done
chmod u+w "$ck/.git/hooks" "$ck/.git/config"
git -C "$ck" commit -q --allow-empty -m x
git -C "$ck" worktree add -q "$t/ckwt"
mkdir -p "$t/ckwt/scripts"
cp "$here/check.sh" "$t/ckwt/scripts/"
outer "$t/ckwt" | refused_any && fail "check.sh refused a linked worktree, whose hooks are the common folder's"
fi

# check.sh runs its steps in lanes side by side, prints each step's time and every lane that failed,
# and a fast run checks only the areas its change touches: everything when a config, the harness, a
# schema or any path outside the known areas changed, or outside a repository (Alexis, 2026-10-25:
# a check's cost follows the change). On a copy whose every step is a stub that logs its name.
# gate_fixture builds it in $g; gate runs its check.sh; ran tells whether a step ran.
gate_fixture() { # $1: its folder's name, one a section: the sections run side by side
g="$t/$1"
log="$g.log"
mkdir -p "$g/scripts" "$g/.githooks" "$g/bin" "$g/toolchain" "$g/gno/r/seal" "$g/app/src" "$g/app/tests" "$g/app/node_modules/@playwright/test" \
	"$g/server/src" "$g/packages/core/src" "$g/packages/ui/src" "$g/packages/schemas/src" "$g/deploy" "$g/lint"
cp "$here/check.sh" "$here/code_changed.sh" "$here/unsteady.py" "$here/related.py" "$g/scripts/" && cp "$hooks/records.sh" "$g/.githooks/" && cp "$here/../.node-version" "$here/../.gitignore" "$g/"
step="$g/bin/step"
# The one stub: it logs its name and arguments; it takes 2 s when SLOW_STEP names it, fails when FAIL
# does, and waits for each step MEET names to start too (30 s at most): steps run one after another
# never meet.
cat >"$step" <<'SH'
#!/bin/sh
n=$1
shift
echo "$n $*" >>"$GATE_LOG"
# check.sh raises the open-files limit its steps inherit (F2543): every step logs the one it got.
ulimit -n >>"$GATE_LOG.ulimit"
# The switches check.sh drops (a run must not trust a binary or measure a busy machine on a caller's say-so): what each step saw.
echo "$n sha=${NGINX_SHA256-} ceiling=${BENCH_WAIT_CEILING-} step=${BENCH_WAIT_STEP-} timeout=${NGINX_START_TIMEOUT-}" >>"$GATE_LOG.env"
# The merge lock a step runs under (harness-c): LOCKPEEK makes each step write the lock's pid (and whether it is alive), worktree and
# since; RUN_TAG tags the steps of one run among several sharing a log.
if [ -n "${LOCKPEEK:-}" ]; then
	l="$HOME/.cache/gnoworld-tools/merge.lock"
	p=$(cat "$l/pid" 2>/dev/null || :)
	if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then alive=live; else alive=dead; fi
	echo "$n pid=$p $alive worktree=$(cat "$l/worktree" 2>/dev/null || :) since=$(cat "$l/since" 2>/dev/null || :)" >>"$GATE_LOG.lockpeek"
fi
[ -z "${RUN_TAG:-}" ] || echo "$RUN_TAG $n" >>"$GATE_LOG.tags"
# The folder a build or a journey run is told to build and serve (F4249): GNOWORLD_BUILD, empty for app/build.
case "$n" in build:app | playwright) echo "$n build=${GNOWORLD_BUILD-}" >>"$GATE_LOG.build" ;; esac
[ "$n" != py:audit ] || echo "audit-answer ${AUDIT_ANSWER-unset}" >>"$GATE_LOG"
# The lint's arguments, one a line: a path with a space or a quote stays whole (the red pass, F4853).
[ "$n" != lint ] || printf '%s\n' "$@" >"$GATE_LOG.lint-args"
# The type check's incremental build: the folder it was told, and that folder's state as it ran.
[ "$n" != typecheck ] || echo "typecheck cache=${TSC_CACHE-unset} $(test -d "${TSC_CACHE:-/nowhere}" && echo there || echo missing)" >>"$GATE_LOG.tsc"
# The files a commit's lint reads: the changed paths it was given on stdin, and LINT_SCOPE's answer (a lint of the whole repository by
# default), LINT_SCOPE_EXIT its exit.
if [ "$n" = py:lint_scope ]; then
	cat >"$GATE_LOG.scope-in"
	printf '%s\n' "${LINT_SCOPE-.}"
	exit "${LINT_SCOPE_EXIT:-0}"
fi
# The merge check's lines for StrykerJS: STRYKER_LINES_EXIT its exit (3: no line), the config it writes otherwise.
if [ "$n" = py:stryker_lines ]; then
	[ "${STRYKER_LINES_EXIT:-0}" != 0 ] || printf '{"mutate":["app/src/a.tsx:1-1"]}' >"$2"
	exit "${STRYKER_LINES_EXIT:-0}"
fi
# The patch's coverage reads the report of a coverage run that passed (or passed on its retry); a failed one leaves none, and the real script fails.
[ "$n" != py:patch_coverage ] || grep -qx "done coverage" "$GATE_LOG" || { echo "patch_coverage: no coverage report" >&2; exit 1; }
[ "$n" != build:app ] || [ -z "${PW_EDIT:-}" ] || printf '\n' >>app/package.json # a build that installs edits a package file
if [ "$n" = py:load ]; then
	at=$(($(cat "$GATE_LOG.load" 2>/dev/null || echo 0) + 1)) && echo "$at" >"$GATE_LOG.load"
	eval "echo \"\${LOAD_$at:-0 160}\""
	exit 0
fi
case " ${MEET:-} " in
*" $n "*)
	: >"$GATE_LOG.met.$n"
	tries=0
	for m in $MEET; do
		until [ -e "$GATE_LOG.met.$m" ]; do
			tries=$((tries + 1))
			[ "$tries" -lt 300 ] || { echo "$n met no $m" >&2 && exit 1; }
			sleep 0.1
		done
	done
	;;
esac
[ "${SLOW_STEP:-}" != "$n" ] || sleep 2
# StrykerJS: logs the incremental file it starts from, then writes STRYKER_WRITES into it, as a run that ends would.
if [ "$n" = mutate ]; then
	f= && for a in "$@"; do [ "${prev:-}" != --incrementalFile ] || f=$a; prev=$a; done
	echo "stryker-start $(cat "$f" 2>/dev/null)" >>"$GATE_LOG"
	[ -z "${STRYKER_WRITES:-}" ] || printf '%s' "$STRYKER_WRITES" >"$f"
fi
# FAIL fails every run of a step; FLAKY only its first, as a test that fails once and then passes does. A failed Vitest
# run leaves the report its JSON reporter would (NOREPORT: none, as a crash leaves), naming a file that failed and one that passed.
down=
case ",${FLAKY:-}," in *,"$n",*) [ -e "$GATE_LOG.flaked.$n" ] || { : >"$GATE_LOG.flaked.$n"; down=1; } ;; esac
case ",${FAIL:-}," in *,"$n",*) down=1 ;; esac
if [ -n "$down" ]; then
	echo "$n failed here" >&2
	[ -z "${TAILPASS:-}" ] || echo "all checks passed in 3 s (budget 120 s)" >&2 # a nested fixture's log, which ends on a pass line
	for a in "$@"; do
		case $a in
		--outputFile.json=*)
			case ${NOREPORT:-} in
			empty) printf '{"testResults":[{"name":"%s/app/src/ok.test.ts","status":"passed","assertionResults":[]}]}' "$PWD" >"${a#*=}" ;;
			1) ;;
			*)
				# ALSO: what else the run had. errors: Vitest's unhandled error, which its JSON report never holds; noload: the
				# file failed with no failed test (it did not load); two: a second file fails too.
				a_tests='[{"fullName":"a works","status":"failed"},{"fullName":"a stays","status":"passed"}]' b_file=
				[ "${ALSO:-}" != noload ] || a_tests='[]'
				[ "${ALSO:-}" != two ] || b_file=",{\"name\":\"$PWD/app/src/b.test.ts\",\"status\":\"failed\",\"assertionResults\":[{\"fullName\":\"b works\",\"status\":\"failed\"}]}"
				printf '{"testResults":[{"name":"%s/app/src/a.test.ts","status":"failed","assertionResults":%s}%s,{"name":"%s/app/src/ok.test.ts","status":"passed","assertionResults":[]}]}' "$PWD" "$a_tests" "$b_file" "$PWD" >"${a#*=}"
				[ "${ALSO:-}" != errors ] || echo "Vitest caught 1 unhandled error during the test run." >&2
				;;
			esac
			;;
		esac
	done
	exit 1
fi
echo "done $n" >>"$GATE_LOG"
exit 0
SH
for tool in go gofmt; do printf '#!/bin/sh\nexec sh "%s" %s "$@"\n' "$step" "$tool" >"$g/bin/$tool"; done
# Vitest, as the test script and its related command run it: the step `test`, its arguments `run ...` or `related --run ...`.
printf '#!/bin/sh\nexec sh "%s" test "$@"\n' "$step" >"$g/bin/vitest" && chmod +x "$g/bin/vitest"
# python3, which fails check.sh's free_ports (its one script that says "in 200 tries") when PORTS_FAIL is set, as a machine with no free port would;
# PORTS_FAIL_ONE fails only an ask for one port (the stories' and the pictures'), the journeys' three still found.
printf '#!/bin/sh\ncase "$*" in *"free ports in 200 tries"*) [ -z "${PORTS_FAIL:-}" ] || { echo "check.sh: no run of free ports (stub)" >&2; exit 1; }; [ -z "${PORTS_FAIL_ONE:-}" ] || case "$*" in *" 1") echo "check.sh: no run of 1 free ports (stub)" >&2; exit 1 ;; esac ;; esac\nexec "%s" "$@"\n' "$(command -v python3)" >"$g/bin/python3"
chmod +x "$g/bin/python3"
printf '#!/bin/sh\nexec sh "%s" gno "$@"\n' "$step" >"$g/toolchain/gno"
chmod +x "$g/bin/go" "$g/bin/gofmt" "$g/toolchain/gno"
for py in check_css check_docs mutate probe bench batch_size load patch_coverage prove_fix check_regressions check_migrations audit harness_mutate check_nginx lint_scope stryker_lines; do
	printf 'import os, sys\nos.execvp("sh", ["sh", %s, "py:%s", *sys.argv[1:]])\n' "'$step'" "$py" >"$g/scripts/$py.py"
done
for sh in ergo test_hooks scan_secrets; do printf 'exec sh "%s" sh:%s "$@"\n' "$step" "$sh" >"$g/scripts/$sh.sh"; done
# The journeys' stub; with PW_EDIT, it edits a package file, as a build that installs would.
printf 'const { spawnSync } = require("node:child_process");\nconst { appendFileSync, writeFileSync } = require("node:fs");\nconst stories = process.argv.some((a) => a.includes("stories"));\nconst name = stories ? (process.env.PICTURES_OF ? "pictures" : "stories") : "playwright";\nif (process.env.PW_EDIT) appendFileSync("app/package.json", "\\n");\nconst status = spawnSync("sh", [%s, name, "port=" + process.env.E2E_PORT, "of=" + (process.env.PICTURES_OF ?? ""), "on=" + (process.env.STORIES_PORT ?? ""), "out=" + (process.env.STORIES_OUT ?? ""), ...process.argv.slice(2)], { stdio: "inherit" }).status;\nconst report = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;\nconst failing = process.env.NOREPORT === "empty" ? [] : [{ title: "a.spec.ts", file: "a.spec.ts", specs: [{ title: "journey", ok: false, file: "a.spec.ts" }] }];\nif (process.env.ALSO === "two") failing.push({ title: "b.spec.ts", file: "b.spec.ts", specs: [{ title: "second", ok: false, file: "b.spec.ts" }] });\nif (status && report && process.env.NOREPORT !== "1" && process.argv.some((a) => a.endsWith("json"))) writeFileSync(report, JSON.stringify({ config: { rootDir: process.cwd() + "/app/tests" }, errors: process.env.ALSO === "errors" ? [{ message: "globalSetup failed" }] : [], suites: [...failing, { title: "ok.spec.ts", file: "ok.spec.ts", specs: [{ title: "fine", ok: true, file: "ok.spec.ts" }] }] }));\nprocess.exit(status);\n' "'$step'" >"$g/app/node_modules/@playwright/test/cli.js"
mkdir -p "$g/node_modules/vitest" && printf 'import { spawnSync } from "node:child_process";\nprocess.exit(spawnSync("sh", [%s, "core_chromium", "switch=" + (process.env.CORE_CHROMIUM ?? ""), ...process.argv.slice(2)], { stdio: "inherit" }).status ?? 1);\n' "'$step'" >"$g/node_modules/vitest/vitest.mjs"
python3 -I - "$g/package.json" "$step" <<'PY'
import json, sys
names = ["build:app", "format:check", "typecheck", "lint", "test:compiled", "unused", "copies", "comments", "coverage", "mutate"]
scripts = {n: f"sh {sys.argv[2]} {n}" for n in names}
scripts["test"] = "vitest run --project node --project ui --project compiled"  # the related run keeps its projects (check.sh)
scripts["lint"] += " ."  # the whole repository, as package.json's: a commit's lint names its files in its place (check.sh)
json.dump({"scripts": scripts}, open(sys.argv[1], "w"))
PY
printf '{}\n' >"$g/app/package.json" && printf '{}\n' >"$g/server/package.json" && : >"$g/pnpm-lock.yaml" && : >"$g/gno/r/seal/vectors_test.gno"
for f in server/src/a.ts server/src/b.ts server/roles.json app/src/a.tsx app/tests/a.spec.ts packages/core/src/a.ts packages/ui/src/a.ts \
	packages/schemas/src/a.ts gno/r/a.gno deploy/a.conf lint/a.ts vitest.config.ts packages/ui/src/tokens.css packages/ui/src/base.css; do
	printf 'x\n' >"$g/$f"
done
git -C "$g" init -q && git -C "$g" add -A && git -C "$g" commit -qm x && git -C "$g" update-ref refs/remotes/origin/main HEAD
}
# Each run starts with no green --full on record, which would skip the next --full's probe and harness mutants (check.sh).
gate() { : >"$log" && rm -f "$log".met.* "$log.load" "$log".flaked.* "$log.build" "$g/.claude/tmp/green-harness" && (cd "$g" && env -u SANDBOX_RUNTIME GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" NVM_DIR="${NVM_DIR:-$HOME/.nvm}" HOME="$g.home" PATH="$g/bin:$PATH" sh scripts/check.sh "$@" 2>&1); }
ran() { grep -q "^$1\( \|$\)" "$log"; }
# A commit's gate that builds the app reads the first screen's budget with the budget spec alone (the dream of 2026-11-01, 6): that is no journey.
journeys() { grep '^playwright ' "$log" | grep -qv "app/tests/e2e/budgets.spec.ts"; }
before() { [ "$(grep -n "^$1\( \|$\)" "$log" | head -1 | cut -d: -f1)" -lt "$(grep -n "^$2\( \|$\)" "$log" | head -1 | cut -d: -f1)" ]; }
reset() { git -C "$g" reset -q --hard && git -C "$g" clean -qfd; }
fast_steps="format:check typecheck lint test unused copies comments py:check_css sh:ergo build:app gno py:mutate gofmt go py:check_docs sh:test_hooks"
full_steps=$(printf '%s' "$fast_steps" | sed 's/build:app/playwright/') # the merge check and --full walk the journeys, which build the app themselves
cheap="format:check unused copies comments py:check_css py:check_docs"
everything() { # $1: what the run was given
	for s in $fast_steps; do ran "$s" || fail "check.sh skipped $s on $1, which must run everything"; done
	grep -q '^test related ' "$log" && fail "check.sh ran only the related tests on $1, which must run every test"
	journeys && fail "check.sh walked the journeys on $1: a commit's gate walks none, but the first screen's budget"
	:
}
scoped() { # $1: what the run was given; then the steps it must run, "-", the steps it must not
	what=$1 && shift
	must=true
	for s in "$@"; do
		if [ "$s" = - ]; then must=false; elif $must; then ran "$s" || fail "check.sh skipped $s on $what"; elif [ "$s" = playwright ]; then journeys && fail "check.sh walked the journeys on $what"; else ran "$s" && fail "check.sh ran $s on $what"; fi
	done
	:
}
record() { (cd "$g" && . .githooks/records.sh && worktree_print); }
# ESLint never reads a cache: one is keyed on a file's own text, so a type changed elsewhere would
# hide the error it brings (the red pass reproduced it with no-floating-promises).
nocache() { if grep -q '^lint .*--cache' "$log"; then fail "check.sh linted from a cache on $1"; fi; }

if part gate_scope; then
gate_fixture gate_scope
# Nothing changed: everything runs, the lanes at once; each lane prints its time and each step's.
out=$(MEET="lint gno sh:test_hooks build:app test" gate) || fail "check.sh's lanes did not run side by side: $out"
everything "a tree with no change" && nocache "a tree with no change"
for lane in ts types tests gno docs; do
	printf '%s\n' "$out" | grep -qE "^lane $lane [0-9]+\.[0-9] s:" || fail "check.sh did not print lane $lane's time: $out"
done
[ -z "$(git -C "$g" status --porcelain)" ] || fail "check.sh left files git sees: $(git -C "$g" status --porcelain)"
grep -qxF "$(record)" "$g/.claude/tmp/green-fast" || fail "check.sh did not record the code it passed"
# Prose alone is no change of code: everything runs.
printf 'x\n' >>"$g/README.md"
gate >/dev/null || fail "check.sh failed on a prose change"
everything "a prose change"
reset
# The server: its types and lint, its related tests (scripts/related.py adds main.test.ts, which runs the server as a child), the
# cheap checks; never the app's journeys, gno or the hooks' tests. Budget 30 s.
rm -f "$g/.claude/tmp/green-full"
printf 'y\n' >>"$g/server/src/a.ts"
out=$(gate) || fail "check.sh failed on a server change: $out"
scoped "a server change" $cheap typecheck lint test - build:app gno py:mutate go sh:test_hooks
nocache "a server change"
printf '%s\n' "$out" | grep -q "(budget 30 s)$" || fail "check.sh gave a scoped run another budget than 30 s: $out"
[ ! -e "$g/.claude/tmp/green-full" ] || fail "a fast run recorded the full gate"
reset
# Prettier keeps its cache in the worktree's own .claude/tmp (a rerun of an unchanged tree costs 0.9 s of 7.5), not in pre-commit's staged
# copy, a new folder each time; and a file that changed is refused with the cache warm.
flags=$(sed -n 's/^format:check //p' "$log")
[ "$flags" = "--cache --cache-strategy content --cache-location=.claude/tmp/prettier-cache" ] || fail "check.sh gave Prettier no cache in the worktree's .claude/tmp: '$flags'"
pc="$t/prettier_cache" && mkdir -p "$pc" && cp "$here/../.prettierrc.json" "$pc/" 2>/dev/null
printf 'export const a = 1;\n' >"$pc/a.ts"
(cd "$pc" && "$here/../node_modules/.bin/prettier" --check --log-level warn $flags .) >/dev/null 2>&1 || fail "Prettier refused a formatted file with a cold cache"
(cd "$pc" && "$here/../node_modules/.bin/prettier" --check --log-level warn $flags .) >/dev/null 2>&1 || fail "Prettier refused a formatted file with a warm cache"
printf 'export   const a =   1\n' >"$pc/a.ts"
(cd "$pc" && "$here/../node_modules/.bin/prettier" --check --log-level warn $flags .) >/dev/null 2>&1 && fail "Prettier passed a changed, unformatted file with a warm cache"
[ -d "$pc/.claude/tmp" ] || fail "Prettier kept no cache under .claude/tmp"
# A server file deleted: its types still checked, which see what imported it.
git -C "$g" rm -q server/src/b.ts
gate >/dev/null || fail "check.sh failed on a deleted server file"
scoped "a deleted server file" typecheck lint test - build:app
reset
# A new TypeScript file of the app, untracked: the app's journeys and the related tests; the journeys
# after every reader of the build's output (F082); gno still not.
printf 'x\n' >"$g/app/src/b.tsx"
out=$(gate) || fail "check.sh failed on a new app file: $out"
# The app's step builds it and runs every journey, the work of a run of everything: its budget (slice-5a, F2162).
printf '%s\n' "$out" | grep -q "(budget 120 s)$" || fail "check.sh gave a run that builds the app another budget than 120 s: $out"
scoped "a new app file" $cheap typecheck lint test build:app - gno sh:test_hooks
# A commit's gate builds the app and reads its budget in a folder of its own, never app/build, which the journeys build and serve: a build
# empties its folder, and one run while a session's journeys were served emptied the site under them (33 ERR_EMPTY_RESPONSE, F4249).
# Both steps get the same folder, outside the worktree, and it is gone when the gate ends.
[ "$(wc -l <"$log.build")" -eq 2 ] || fail "check.sh did not build and read the budget once each at a commit: $(cat "$log.build")"
own=$(sed -n 's/^build:app build=//p' "$log.build")
[ -n "$own" ] && [ "$(sed -n 's/^playwright build=//p' "$log.build")" = "$own" ] || fail "check.sh's build and its budget run did not share a build folder of their own (GNOWORLD_BUILD): $(cat "$log.build")"
real=$(cd "$g" && pwd -P)
case "$own" in "$real"/app/build-gate/?*) ;; *) fail "check.sh's build folder is not app/build-gate/<run>, an absolute folder inside the app: $own" ;; esac
[ ! -e "$g/app/build-gate" ] || fail "check.sh left app/build-gate behind"
# A caller's own GNOWORLD_BUILD does not steer the gate to a folder it did not make.
GNOWORLD_BUILD=/elsewhere gate >/dev/null || fail "check.sh failed with GNOWORLD_BUILD set"
[ "$(sed -n 's/^build:app build=//p' "$log.build")" != /elsewhere ] || fail "check.sh built into the caller's GNOWORLD_BUILD"
grep -q '^test related ' "$log" || fail "check.sh did not run only the tests an app change touches"
for s in unused copies comments py:check_css; do before "$s" build:app || fail "check.sh built the app before $s read the tree (F082)"; done
reset
# The design system's TypeScript, and a journey: the same.
for f in packages/ui/src/a.ts app/tests/a.spec.ts; do
	printf 'y\n' >>"$g/$f"
	gate >/dev/null || fail "check.sh failed on a change of $f"
	scoped "a change of $f" typecheck lint test - gno sh:test_hooks playwright
	if [ "$f" = packages/ui/src/a.ts ]; then ran build:app || fail "check.sh did not build the app on a change of the design system"; else ran build:app && fail "check.sh built the app on a change of a journey"; fi
	grep -q '^test related ' "$log" || fail "check.sh did not run only the related tests on a change of $f"
	reset
done
# tokens.css: the tokens story lists every token, so a token changed moves its pictures (F1190, Alexis, 2026-10-27, after
# a95a764 added two and `check.sh --merge` found the pictures 30 minutes later). The fast gate also compares that story
# alone, at its three widths, in a lane of its own on a port of its own; the tests are the related ones (a story imports the
# stylesheet, and the map adds what reads it from disk); another stylesheet of the design system, and no change, do not.
printf 'y\n' >>"$g/packages/ui/src/tokens.css"
gate >/dev/null || fail "check.sh failed on a change of tokens.css"
scoped "a change of tokens.css" typecheck lint test build:app pictures - gno sh:test_hooks stories
grep -q '^pictures port=[^ ]* of=tokens-- on=[0-9]* out=[^ ]*/storybook test -c app/playwright.stories.config.ts --reporter=dot pictures$' "$log" ||
	fail "check.sh did not compare the tokens story's pictures alone, on a port of its own: $(grep '^pictures' "$log")"
pport=$(sed -n 's/^pictures .* on=\([0-9]*\) .*/\1/p' "$log")
[ -n "$pport" ] && [ "$pport" -ge 1024 ] && [ "$pport" -le 65535 ] && [ "$pport" != 6007 ] || fail "check.sh gave the pictures no free port of their own (not 6007, another gate's): $pport"
reset
# Beside another area's change, and under any comment: the stylesheet's text decides nothing, its path does.
printf '/* pictures: skip, gate: off */\n' >>"$g/packages/ui/src/tokens.css" && printf 'y\n' >>"$g/server/src/a.ts"
gate >/dev/null || fail "check.sh failed on a change of tokens.css beside a server change"
scoped "a change of tokens.css beside a server change, with a comment that asks to skip" typecheck lint test build:app pictures - gno
reset
printf 'y\n' >>"$g/packages/ui/src/base.css"
gate >/dev/null || fail "check.sh failed on a change of another stylesheet"
scoped "a change of base.css" typecheck test build:app - pictures gno
reset
# The tokens pictures failing fails the gate, which names the lane and shows what it printed; a gate recorded nothing.
rm -f "$g/.claude/tmp/green-fast"
printf 'y\n' >>"$g/packages/ui/src/tokens.css"
out=$(FAIL=pictures gate) && fail "check.sh passed with the tokens story's pictures failing"
printf '%s\n' "$out" | grep -q "^pictures failed here" || fail "check.sh hid the failure of the tokens story's pictures: $out"
printf '%s\n' "$out" | grep -q "^check.sh: lane pictures failed at pictures" || fail "check.sh did not name the lane pictures: $out"
[ ! -e "$g/.claude/tmp/green-fast" ] || fail "check.sh recorded a gate whose tokens pictures failed"
# Playwright missing, as a browser or its package missing leaves it: the lane fails, never passes on nothing.
mv "$g/app/node_modules/@playwright/test/cli.js" "$t/cli.away"
gate >/dev/null && fail "check.sh passed a change of tokens.css with no Playwright to compare the pictures"
mv "$t/cli.away" "$g/app/node_modules/@playwright/test/cli.js"
# What the environment brings: a PICTURES_OF or a STORIES_PORT is the gate's to set, never inherited, so a stale one
# neither narrows nor redirects any run (the full gate's whole walk included).
out=$(PICTURES_OF=nothing STORIES_PORT=6007 STORIES_OUT=/elsewhere gate) || fail "check.sh failed with PICTURES_OF and STORIES_PORT in its environment: $out"
grep -q '^pictures port=[^ ]* of=tokens-- on=[0-9]* out=[^ ]*/storybook ' "$log" && ! grep -q '^pictures .* on=6007 ' "$log" && ! grep -q '^pictures .* out=/elsewhere ' "$log" || fail "check.sh let its environment set the pictures' filter, port or folder: $(grep '^pictures' "$log")"
reset
# Nothing changed, a realm, the full gate: no tokens comparison; the full gate's stories walk them all, unfiltered.
for what in "a tree with no change" "a gno change"; do
	if [ "$what" = "a gno change" ]; then printf 'y\n' >>"$g/gno/r/a.gno"; fi
	gate >/dev/null || fail "check.sh failed on $what"
	ran pictures && fail "check.sh compared the tokens pictures on $what"
	reset
done
# Core: the server imports it: its related tests (scripts/related.py adds main.test.ts), and the app's build.
printf 'y\n' >>"$g/packages/core/src/a.ts"
gate >/dev/null || fail "check.sh failed on a core change"
scoped "a core change" typecheck lint test build:app - gno sh:test_hooks
reset
# A file of the app that is not TypeScript (a fixture, a stylesheet): the related tests, which the map gives what reads it from disk.
printf 'x\n' >"$g/app/src/b.json"
gate >/dev/null || fail "check.sh failed on an app fixture"
scoped "an app fixture" test build:app
reset
# A name with a space is one path, of its area.
printf 'x\n' >"$g/server/src/a b.ts"
gate >/dev/null || fail "check.sh failed on a path with a space"
scoped "a server path with a space" typecheck - sh:test_hooks build:app
reset
# A realm: gno, its mutations and the Go tools, the cheap checks, no other TypeScript step.
printf 'y\n' >>"$g/gno/r/a.gno"
gate >/dev/null || fail "check.sh failed on a gno change"
scoped "a gno change" $cheap gno py:mutate gofmt go - typecheck lint test build:app sh:test_hooks
reset
# Outside a repository (pre-commit's staged copy): everything.
cp -R "$g" "$g-copy" && rm -rf "$g-copy/.git"
: >"$log" && (cd "$g-copy" && env -u SANDBOX_RUNTIME GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" sh scripts/check.sh >/dev/null 2>&1) ||
	fail "check.sh failed outside a repository"
everything "a copy outside a repository"
# There, pre-commit lists what the commit changes in GATE_CHANGED: the run checks those areas, their related tests (Vitest's
# related command, given the paths, needs no git), and prose alone is no change.
outside() { : >"$log" && (cd "$g-copy" && env -u SANDBOX_RUNTIME -u GATE_MERGE GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED="$1" sh scripts/check.sh 2>&1); }
out=$(outside "server/src/a.ts
docs/x.md") || fail "check.sh failed outside a repository on pre-commit's list: $out"
scoped "pre-commit's list of a server change" $cheap typecheck lint test - build:app gno sh:test_hooks
outside "app/src/a.tsx" >/dev/null || fail "check.sh failed outside a repository on an app change"
scoped "pre-commit's list of an app change" typecheck build:app test - gno
outside "gno/r/a.gno" >/dev/null || fail "check.sh failed outside a repository on a gno change"
scoped "pre-commit's list of a gno change" gno - typecheck build:app
# The tokens story's pictures there too: pre-commit's list names the change, which a staged copy holds no repository to read.
outside "packages/ui/src/tokens.css" >/dev/null || fail "check.sh failed outside a repository on a change of tokens.css"
scoped "pre-commit's list of a change of tokens.css" typecheck test build:app pictures - gno
outside "packages/ui/src/base.css" >/dev/null || fail "check.sh failed outside a repository on a change of base.css"
scoped "pre-commit's list of a change of base.css" typecheck test build:app - pictures
# Prose is prose anywhere, and nothing else is: beside a server change, the run stays the server's.
for prose in adr/0001.txt docs/x.ts server/src/x.md; do
	outside "server/src/a.ts
$prose" >/dev/null || fail "check.sh failed outside a repository on $prose"
	scoped "pre-commit's list of a server change and $prose" typecheck - build:app sh:test_hooks
done
# Prose alone, an empty list, an unknown path, a line git quoted or that reads otherwise (an empty
# line, a space, a backslash): everything, as in a repository.
for list in "" "docs/x.md" "adr/x.md
README.md" "server/src/a.ts
package.json" "server/src/a.ts

deploy/a.conf" '"deploy/a\nb"
server/src/a.ts' " deploy/a.conf
server/src/a.ts" 'server/src/a.ts\
package.json' 'docs-x/a.ts
server/src/a.ts'; do
	outside "$list" >/dev/null || fail "check.sh failed outside a repository on the list: $list"
	everything "pre-commit's list: $list"
done
# A scoped run there records nothing: no record of a copy's code.
cp "$g-copy/.claude/tmp/green-fast" "$t/green-before" 2>/dev/null || : >"$t/green-before"
outside "server/src/a.ts" >/dev/null || fail "check.sh failed outside a repository on a server change"
cmp -s "$t/green-before" "$g-copy/.claude/tmp/green-fast" 2>/dev/null || [ ! -e "$g-copy/.claude/tmp/green-fast" ] || fail "check.sh recorded a copy's scoped run"
# --full there is never scoped.
: >"$log" && (cd "$g-copy" && env -u SANDBOX_RUNTIME -u GATE_MERGE GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED=gno/r/a.gno sh scripts/check.sh --full >/dev/null 2>&1) || : # it fails at merge-base, with no repository
for s in $full_steps; do [ "$s" = test ] || [ "$s" = build:app ] || ran "$s" || fail "check.sh --full took GATE_CHANGED's scope and skipped $s"; done
# In a repository, the run reads its change from git, never from GATE_CHANGED.
: >"$log" && (cd "$g" && env -u SANDBOX_RUNTIME -u GATE_MERGE GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED=gno/r/a.gno sh scripts/check.sh >/dev/null 2>&1) ||
	fail "check.sh failed in a repository with GATE_CHANGED set"
everything "a repository with no change and GATE_CHANGED naming a realm"
printf 'y\n' >>"$g/server/src/a.ts"
: >"$log" && (cd "$g" && env -u SANDBOX_RUNTIME -u GATE_MERGE GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED=deploy/a.conf sh scripts/check.sh >/dev/null 2>&1) ||
	fail "check.sh failed in a repository with a change and GATE_CHANGED set"
scoped "a server change in a repository and GATE_CHANGED naming the deployment" typecheck - build:app sh:test_hooks
reset
fi

if part gate_triggers; then
gate_fixture gate_triggers
# A config, the harness, a package file, or a path of no known area: everything.
for f in package.json pnpm-lock.yaml vitest.config.ts scripts/check_css.py .gitignore server/package.json app/package.json; do
	printf '\n' >>"$g/$f"
	gate >/dev/null || fail "check.sh failed on a change of $f"
	everything "a change of $f"
	reset
done
# Two areas at once run both: what is staged counts with what is not.
printf 'y\n' >>"$g/gno/r/a.gno" && git -C "$g" add gno && printf 'y\n' >>"$g/server/src/a.ts"
gate >/dev/null || fail "check.sh failed on a staged gno change beside a server one"
scoped "a staged gno change beside an unstaged server one" gno typecheck test - build:app sh:test_hooks
reset
# A rename keeps where it came from: the tests' config moved into the server runs everything.
git -C "$g" mv vitest.config.ts server/src/moved.ts
gate >/dev/null || fail "check.sh failed on the tests' config moved into the server"
everything "the tests' config moved into the server"
reset
# A deletion counts: the tests' config deleted beside a server change runs everything.
git -C "$g" rm -q vitest.config.ts && printf 'y\n' >>"$g/server/src/a.ts"
gate >/dev/null || fail "check.sh failed on a deleted config"
everything "the tests' config deleted beside a server change"
reset
# A worktree's borrowed node_modules is a link, which .gitignore's folder rule misses: no change of code. The fixture's own folder
# is moved away: `ln -s` would put the link inside it, git would see nothing, and the case would prove nothing.
mv "$g/node_modules" "$g.node_modules" && ln -s "$t" "$g/node_modules" && printf 'y\n' >>"$g/server/src/a.ts"
gate >/dev/null || fail "check.sh failed beside a linked node_modules"
scoped "a server change beside a linked node_modules" typecheck - build:app sh:test_hooks
rm "$g/node_modules" && mv "$g.node_modules" "$g/node_modules" && reset
# A git that cannot list the change fails the gate, rather than scoping it to nothing.
real_git=$(command -v git)
mkdir -p "$t/badgit" && printf '#!/bin/sh\ncase " $* " in *" diff --no-renames "*) exit 3 ;; esac\nexec "%s" "$@"\n' "$real_git" >"$t/badgit/git" && chmod +x "$t/badgit/git"
printf 'y\n' >>"$g/server/src/a.ts"
: >"$log" && (cd "$g" && env -u SANDBOX_RUNTIME GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$t/badgit:$g/bin:$PATH" sh scripts/check.sh >/dev/null 2>&1) &&
	fail "check.sh passed when git could not list the change"
reset
# A harness script that does not parse fails the gate, even when the change is the server's alone.
printf 'def (\n' >"$g/scripts/broken.py" && git -C "$g" add scripts/broken.py && git -C "$g" commit -qm broken && printf 'y\n' >>"$g/server/src/a.ts"
out=$(gate) && fail "check.sh passed a harness script that does not parse"
printf '%s\n' "$out" | grep -q "^check.sh: lane docs failed at parse" || fail "check.sh did not name the parse that failed: $out"
fi

if part gate_lanes; then
gate_fixture gate_lanes
# Two lanes fail: the gate fails, names both and shows what each printed; the others run to their end.
rm -f "$g/.claude/tmp/green-fast"
out=$(FAIL=lint,gno gate) && fail "check.sh passed with two failing steps"
for s in lint gno; do printf '%s\n' "$out" | grep -q "^$s failed here" || fail "check.sh hid $s's failure: $out"; done
printf '%s\n' "$out" | grep -q "^check.sh: lane types failed at lint" || fail "check.sh did not name the failed lane types and its step: $out"
printf '%s\n' "$out" | grep -q "^check.sh: lane gno failed at gno" || fail "check.sh did not name the failed lane gno: $out"
ran py:mutate && fail "a lane went on past its failed step"
[ ! -e "$g/.claude/tmp/green-fast" ] || fail "check.sh recorded a gate that failed"
# A failing run ends on its own last line, `check.sh: FAILED at <lane>:<step>`, whatever the failed lane's tail ended on (the first merge
# check of the sum read a nested fixture's `all checks passed in 3 s` as the run's last line, F2638); the exit path of a lane, of a step in
# the main shell, of a refused argument and of a signal each end on it.
last() { printf '%s\n' "$1" | tail -n 1; }
[ "$(last "$out")" = "check.sh: FAILED at types:lint" ] || fail "a run that failed at lint did not end on its FAILED line: $(last "$out")"
out=$(TAILPASS=1 FAIL=lint gate) && fail "check.sh passed with a failing lint whose tail says it passed"
printf '%s\n' "$out" | grep -q "^all checks passed in 3 s" || fail "the planted tail was not shown: $out"
[ "$(last "$out")" = "check.sh: FAILED at types:lint" ] || fail "a failing run whose tail ended on a pass line ended on '$(last "$out")', not its FAILED line (F2638)"
out=$(gate --merge --base 2>&1) && fail "check.sh passed a --base with no ref"
[ "$(last "$out")" = "check.sh: FAILED at main:start" ] || fail "a refused argument did not end on the FAILED line: $(last "$out")"
out=$(gate) || fail "check.sh failed on a copy whose every step passes: $out"
printf '%s\n' "$out" | grep -q "FAILED" && fail "a run that passed said FAILED: $out"
last "$out" | grep -q "^all checks passed in [0-9]* s" || fail "a run that passed did not end on its pass line: $(last "$out")"
# A lane that fails at once leaves a slow one to finish.
(SLOW_STEP=py:check_docs FAIL=lint gate) >/dev/null && fail "check.sh passed with a failing lint"
ran sh:test_hooks || fail "a lane's failure stopped another lane before its end"
# Each lane's first and last step fail the gate, name their lane, and stop it.
for case in format:check:ts build:app:ts typecheck:types lint:types sh:ergo:tests test:tests gno:gno go:gno py:check_docs:docs sh:test_hooks:docs; do
	s=${case%:*} lane=${case##*:}
	out=$(FAIL=$s gate) && fail "check.sh passed with $s failing"
	printf '%s\n' "$out" | grep -q "^check.sh: lane $lane failed" || fail "check.sh did not name lane $lane when $s failed: $out"
done
(FAIL=sh:ergo gate) >/dev/null && fail "check.sh passed with Ergo's build failing"
ran test && fail "check.sh ran the tests without the Ergo they start"
# A build that edits a package file fails the gate (F080).
out=$(PW_EDIT=1 gate) && fail "check.sh passed a build that edited app/package.json"
printf '%s\n' "$out" | grep -q "building the app changed package.json" || fail "check.sh did not say the build changed a package file: $out"
reset
out=$(PW_EDIT=1 gate --full) && fail "check.sh --full passed journeys whose build edited app/package.json"
printf '%s\n' "$out" | grep -q "building the app changed package.json" || fail "check.sh --full did not say the build changed a package file: $out"
reset
# GATE_BUDGET lowers the budget, never raises it, and a value that is no number leaves it.
GATE_BUDGET=999 gate | grep -q "(budget 120 s)$" || fail "check.sh let GATE_BUDGET raise its budget"
GATE_BUDGET=abc gate | grep -q "(budget 120 s)$" || fail "check.sh took a GATE_BUDGET that is no number"
GATE_BUDGET= gate | grep -q "(budget 120 s)$" || fail "check.sh took an empty GATE_BUDGET"
(GATE_BUDGET=-5 gate) 2>&1 | grep -q "over its -5 s budget: passed, and logged" || fail "check.sh took a negative GATE_BUDGET as no budget"
printf 'y\n' >>"$g/server/src/a.ts"
GATE_BUDGET=999 gate | grep -q "(budget 30 s)$" || fail "check.sh let GATE_BUDGET raise a scoped run's budget"
reset
# A Vitest file or a journey that fails runs once more, alone; if it passes the gate passes and the file is logged for
# /pre-merge, with its failed tests and the load; a file that fails twice, or a failure with no report, refuses (F1700).
unsteady=$g/.claude/tmp/unsteady.log
tries() { grep -c "^$1\( \|$\)" "$log"; }
unsteady_case() { # $1 the step, $2 the tool, $3 the file it fails in (and one that passes), $4 the failed test, $5 the file that passes
	gm= && [ "$1" != playwright ] || gm=--full # the journeys run in the merge check and --full alone
	rm -rf "${unsteady:?}"
	out=$(LOAD_1="305 160" LOAD_2="305 160" LOAD_3="305 160" LOAD_4="305 160" LOAD_5="305 160" LOAD_6="305 160" FLAKY=$1 gate $gm) || fail "check.sh failed a $2 run that passed the second time: $out"
	[ "$(tries "$1")" = 2 ] || fail "check.sh ran $1 $(tries "$1") times for one failure, not twice: $out"
	grep -qF "$6" "$log" || fail "check.sh did not give the failed file to the second $1 run"
	grep -qF "$5" "$log" && fail "check.sh ran a file that passed again ($1)"
	[ "$(grep -c "" "$unsteady")" = 1 ] || fail "check.sh did not log the one unsteady file of $1 once: $(cat "$unsteady")"
	grep -qF "$3" "$unsteady" && grep -qF "$2" "$unsteady" && grep -qF "$4" "$unsteady" || fail "the unsteady log lacks the tool, file or test of $1: $(cat "$unsteady")"
	grep -qF "load 30.5 on 16 cores" "$unsteady" || fail "the unsteady log lacks the load: $(cat "$unsteady")"
	grep -qF "$5" "$unsteady" && fail "the unsteady log names a file that passed ($1)"
	printf '%s\n' "$out" | grep -q "^unsteady: .*running them once more" || fail "check.sh did not say it ran $1 again: $out"
	# Fails twice: it refuses, after one more run only, and logs nothing.
	rm -rf "${unsteady:?}"
	out=$(FAIL=$1 gate $gm) && fail "check.sh passed with $1 failing twice"
	[ "$(tries "$1")" = 2 ] || fail "check.sh ran $1 $(tries "$1") times when it failed, not twice"
	printf '%s\n' "$out" | grep -q "failed twice" || fail "check.sh did not say $1 failed twice: $out"
	[ ! -e "$unsteady" ] || fail "check.sh logged a file of $1 that failed twice"
	# A failure with no report (a crash, a config error) is no flake: nothing runs again, and it is no pass.
	out=$(NOREPORT=1 FLAKY=$1 gate $gm) && fail "check.sh passed a $1 failure that left no report"
	[ "$(tries "$1")" = 1 ] || fail "check.sh ran $1 again after a failure with no report"
	[ ! -e "$unsteady" ] || fail "check.sh logged a $1 failure with no report"
	# A report that names no failed file would run every file again: it refuses, with nothing run again.
	out=$(NOREPORT=empty FLAKY=$1 gate $gm) && fail "check.sh passed a $1 failure whose report names no failed file"
	[ "$(tries "$1")" = 1 ] || fail "check.sh ran $1 again for a report that names no failed file"
	# A log that cannot be written (a folder where it goes): an unsteady test no one sees is not a pass.
	mkdir -p "$unsteady"
	out=$(FLAKY=$1 gate $gm) && fail "check.sh passed an unsteady $1 test it could not log"
	printf '%s\n' "$out" | grep -q "cannot be written" || fail "check.sh did not say it could not log $1: $out"
	rm -rf "${unsteady:?}"
}
# What else the first run had is no flake a second run of the failed files could clear: an unhandled error (Vitest's JSON report
# holds none: its console does), Playwright's own errors, a failed file with no failed test (it did not load, or a hook failed).
# The run refuses with nothing run again and nothing logged, even when the failed file itself passes the second time (R1).
unsteady_refuses() { # $1 the step, $2 what else the run had (ALSO), $3 what check.sh says
	gm= && [ "$1" != playwright ] || gm=--full # the journeys run in the merge check and --full alone
	rm -rf "${unsteady:?}"
	out=$(ALSO=$2 FLAKY=$1 gate $gm) && fail "check.sh passed a $1 run that also had: $2: $out"
	[ "$(tries "$1")" = 1 ] || fail "check.sh ran $1 again though the run also had: $2"
	printf '%s\n' "$out" | grep -qF "$3" || fail "check.sh did not say why it refused $1 with: $2: $out"
	[ ! -e "$unsteady" ] || fail "check.sh logged a $1 run that also had: $2"
	printf '%s\n' "$out" | grep -qF "$1 failed here" || fail "check.sh hid the first $1 run's own console when it refused: $out"
}
# Two files fail at once: both run again, in one run, and both are logged.
unsteady_two() { # $1 the step, $2 the first file, $3 the second, as the second run is given them
	gm= && [ "$1" != playwright ] || gm=--full # the journeys run in the merge check and --full alone
	rm -rf "${unsteady:?}"
	out=$(ALSO=two FLAKY=$1 gate $gm) || fail "check.sh failed two $1 files that passed the second time: $out"
	[ "$(tries "$1")" = 2 ] || fail "check.sh ran $1 $(tries "$1") times for two files failing at once: $out"
	grep -qF "$2" "$log" && grep -qF "$3" "$log" || fail "check.sh did not give both failed files to the second $1 run"
	[ "$(grep -c "" "$unsteady")" = 2 ] || fail "check.sh did not log both unsteady files of $1: $(cat "$unsteady")"
	rm -rf "${unsteady:?}"
}
unsteady_refuses test errors "an unhandled error"
unsteady_refuses test noload "failed with no failed test"
unsteady_refuses playwright errors "errors of its own"
unsteady_two test 'app/src/a.test.ts' 'app/src/b.test.ts'
unsteady_two playwright 'app/tests/a\.spec\.ts' 'app/tests/b\.spec\.ts'
unsteady_case test vitest app/src/a.test.ts "a works" app/src/ok.test.ts app/src/a.test.ts
unsteady_case playwright playwright app/tests/a.spec.ts "journey" app/tests/ok.spec.ts 'app/tests/a\.spec\.ts'
# Pre-commit's staged copy has no repository and a link for node_modules: its unsteady test is logged in the repository's folder,
# not in the copy, which is deleted after the run.
c=$g.copy r=$g.repo
rm -rf "${c:?}" "${r:?}" && cp -R "$g" "$c" && rm -rf "${c:?}/.git" "${c:?}/node_modules" && mkdir -p "$r/node_modules" && ln -s "$r/node_modules" "$c/node_modules"
(g=$c && FLAKY=test gate >/dev/null) || fail "check.sh failed an unsteady test in a staged copy"
grep -qF "app/src/a.test.ts" "$r/.claude/tmp/unsteady.log" || fail "check.sh did not log a staged copy's unsteady test in the repository"
[ ! -e "$c/.claude/tmp/unsteady.log" ] || fail "check.sh logged a staged copy's unsteady test in the copy, which is deleted"
# A run that passes the first time runs nothing again and logs nothing.
gate >/dev/null || fail "check.sh failed a clean run"
[ "$(tries test)" = 1 ] && [ "$(tries build:app)" = 1 ] || fail "check.sh ran a passing step twice"
gate --full >/dev/null || fail "check.sh --full failed a clean run"
[ "$(tries playwright)" = 1 ] || fail "check.sh --full ran the journeys $(tries playwright) times on a clean run"
[ ! -e "$unsteady" ] || fail "check.sh logged a clean run"
# The log keeps each run's files: two unsteady runs leave two lines.
FLAKY=test gate >/dev/null && FLAKY=test gate >/dev/null && [ "$(grep -c "" "$unsteady")" = 2 ] || fail "check.sh did not append to the unsteady log"
rm -rf "${unsteady:?}"
# free_ports that fails fails each lane that asks it for ports, before its tool starts: the journeys' (E2E_PORT) and the pictures'
# (STORIES_PORT, a prefix assignment that swallowed the failure once: the tool then started with no port). A change of tokens.css
# runs both lanes (CR8, R2).
printf '\n' >>"$g/packages/ui/src/tokens.css"
out=$(PORTS_FAIL=1 gate) && fail "check.sh passed with no free port: $out"
printf '%s\n' "$out" | grep -q "^check.sh: lane pictures failed at pictures" || fail "check.sh did not fail the pictures' lane when free_ports failed: $out"
ran pictures && fail "check.sh started the pictures with no free port"
reset
# The journeys of --full ask for three ports of their own (never the fixed 4173 another gate may hold), and a free_ports that fails stops them.
out=$(PORTS_FAIL=1 gate --full) && fail "check.sh --full passed with no free port: $out"
printf '%s\n' "$out" | grep -q "^check.sh: lane ts failed at app" || fail "check.sh --full did not fail the journeys' lane at its app step when free_ports failed: $out"
ran playwright && fail "check.sh --full started the journeys with no free port"
gate --full >/dev/null || fail "check.sh --full failed on a copy whose every step passes"
port=$(sed -n 's/^playwright port=\([0-9]*\) .*/\1/p' "$log")
[ -n "$port" ] && [ "$port" -ge 1024 ] && [ "$port" -le 65533 ] && [ "$port" != 4173 ] || fail "check.sh --full gave the journeys no free port of their own: $(grep '^playwright' "$log")"
reset
fi

if part gate_times; then
gate_fixture gate_times
# Past its budget, the fast gate passes and says so (Alexis, 2026-10-30: a budget that refused a run which had passed made
# agents run it again and again, three times in slice 5): it names its slowest step as printed, records the code it passed,
# and appends the run to the unsteady log with its time and the machine's two loads, which /pre-merge and the dream read; a
# log it cannot write fails it, a pass no one sees being no pass. Each step's time is its own: a 2 s step prints 2 s, a quick
# one less than 1 s, its lane at least 2 s.
unsteady=$g/.claude/tmp/unsteady.log
busy=170 idle=10
for slow in lint gno; do
	rm -f "$unsteady" "$g/.claude/tmp/green-fast" "$g/.claude/tmp/gate-green"
	out=$(LOAD_1="$idle 160" LOAD_2="$busy 160" SLOW_STEP=$slow GATE_BUDGET=0 gate) || fail "check.sh failed a run that passed, past its budget: $out"
	slowest=$(printf '%s\n' "$out" | sed -n 's/^lane [a-z]* [0-9.]* s: //p' | tr ',' '\n' | awk '{print $2, $1}' | sort -n | tail -1 | cut -d' ' -f2)
	printf '%s\n' "$out" | grep -q "over its 0 s budget: passed, and logged for /pre-merge; its slowest step, $slowest," || fail "check.sh did not say it passed past its budget, naming its slowest step, $slowest: $out"
	grep -qxF "$(record)" "$g/.claude/tmp/green-fast" || fail "check.sh did not record the gate it passed past its budget"
	[ "$(grep -c "" "$unsteady")" = 1 ] || fail "check.sh did not log its run past its budget, once: $(cat "$unsteady" 2>&1)"
	grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z	gate	' "$unsteady" && grep -q "over its 0 s budget" "$unsteady" && grep -q "load 1.0 then 17.0 on 16 cores" "$unsteady" && grep -q "slowest step, $slowest" "$unsteady" ||
		fail "the unsteady log lacks the time, the loads or the step of a run past its budget: $(cat "$unsteady")"
	[ "$slow" = lint ] || continue
	printf '%s\n' "$out" | grep -qE '^lane types ([2-9]|[1-9][0-9])\.[0-9] s: .*lint [2-9]\.[0-9]' || fail "check.sh did not time the slow lint: $out"
	printf '%s\n' "$out" | grep -qE '^lane gno [0-9.]+ s: gno [0-9]+\.[0-9], mutate.py [0-9]+\.[0-9], go [0-9]+\.[0-9]$' || fail "check.sh did not time the gno lane's steps: $out"
	format=$(printf '%s\n' "$out" | sed -n 's/^lane ts .*format \([0-9]*\)\.\([0-9]\).*/\1\2/p') lint=$(printf '%s\n' "$out" | sed -n 's/^lane types .*lint \([0-9]*\)\.\([0-9]\).*/\1\2/p')
	[ -n "$format" ] && [ "$format" -lt "$lint" ] || fail "check.sh gave a quick step a slow one's time: $out"
done
# The load is read twice: first as the lanes start, before any of them runs, then last, once they have all ended.
[ "$(grep -c '^py:load' "$log")" = 2 ] || fail "check.sh did not read the load twice: $(grep -c '^py:load' "$log")"
[ "$(sed -n 1p "$log" | cut -d' ' -f1)" = py:load ] || fail "check.sh read the load after a lane had started: $(sed -n 1p "$log")"
[ "$(tail -1 "$log" | cut -d' ' -f1)" = py:load ] || fail "check.sh read the end load before its lanes had ended: $(tail -1 "$log")"
# A merge commit has no budget (Alexis, 2026-10-28): it says its time and logs nothing, the full gate following it. A merge in
# progress is MERGE_HEAD, which git reads; the staged copy of pre-commit has no repository, so pre-commit tells it with
# GATE_MERGE=1, never read in a repository. A MERGE_HEAD git cannot read is no merge, and the run is logged as any other.
merge() { git -C "$g" rev-parse HEAD >"$g/.git/MERGE_HEAD"; }
rm -f "$unsteady" && merge
out=$(LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) || fail "check.sh failed a merge in progress past its budget: $out"
printf '%s\n' "$out" | grep -qE "the fast gate took [0-9]+ s, past its 0 s budget, which a merge commit has none of \(the full gate follows it\); its slowest step, [a-z.]+, took [0-9.]+ s" ||
	fail "check.sh did not say the time of a merge past its budget: $out"
[ ! -e "$unsteady" ] || fail "check.sh logged a merge's run past the budget a merge has not: $(cat "$unsteady")"
for garbage in "not a commit" ""; do
	printf '%s\n' "$garbage" >"$g/.git/MERGE_HEAD" && rm -f "$unsteady"
	out=$(LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) || fail "check.sh failed a run past its budget beside an unreadable MERGE_HEAD ('$garbage'): $out"
	[ -s "$unsteady" ] || fail "check.sh took an unreadable MERGE_HEAD ('$garbage') for a merge and logged nothing: $out"
done
rm -f "$g/.git/MERGE_HEAD" "$unsteady"
# GATE_MERGE is read in a staged copy alone: in a repository, a caller's variable makes no merge of a work commit.
(GATE_MERGE=1 LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) >/dev/null # a subshell: sh keeps a function's prefix assignments
[ -s "$unsteady" ] || fail "check.sh let GATE_MERGE=1 make a merge of a work commit in a repository"
c=$g.merge
rm -rf "${c:?}" && cp -R "$g" "$c" && rm -rf "${c:?}/.git"
out=$(g=$c GATE_MERGE=1 LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) || fail "check.sh failed a staged copy of a merge past its budget: $out"
printf '%s\n' "$out" | grep -q "which a merge commit has none of" || fail "check.sh did not say the time of a staged copy of a merge: $out"
for v in 0 ""; do
	out=$(g=$c GATE_MERGE=$v LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) || fail "check.sh failed a staged copy of a work commit past its budget: $out"
	printf '%s\n' "$out" | grep -q "passed, and logged for /pre-merge" || fail "check.sh took a staged copy of a work commit (GATE_MERGE='$v') for a merge: $out"
done
# A pass under its budget logs nothing.
rm -f "$unsteady" && gate >/dev/null
[ ! -e "$unsteady" ] || fail "check.sh logged a pass under its budget: $(cat "$unsteady")"
# A pass no one sees is not a pass: a log that cannot be written fails it, and records nothing.
rm -rf "${unsteady:?}" && rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/gate-green" && mkdir -p "$unsteady"
out=$(LOAD_1="$busy 160" LOAD_2="$busy 160" SLOW_STEP=lint GATE_BUDGET=0 gate) && fail "check.sh passed a slow run with a log it cannot write: $out"
printf '%s\n' "$out" | grep -q "cannot be written" || fail "check.sh did not say its unsteady log cannot be written: $out"
[ ! -e "$g/.claude/tmp/green-fast" ] || fail "check.sh recorded a slow pass it could not log"
rm -rf "${unsteady:?}"
# load.py reads the machine itself: its 1-minute load (the first of getloadavg's three) and its cores, in tenths.
# Run on a machine of known numbers, so the minute's average, the 5- and 15-minute ones and the scale each tell apart (G4).
loaded() { # $1: the cores os.cpu_count gives
	python3 -I -c 'import os, runpy, sys; os.getloadavg = lambda: (1.7, 5.0, 9.0); os.cpu_count = lambda: int(sys.argv[1]); runpy.run_path(sys.argv[2], run_name="__main__")' "$1" "$here/load.py"
}
[ "$(loaded 16)" = "17 160" ] || fail "load.py did not print a 1.7 load on 16 cores as '17 160': $(loaded 16)"
[ "$(loaded 0)" = "17 10" ] || fail "load.py did not count a machine that gives no core count as one: $(loaded 0)"
python3 -I "$here/load.py" | python3 -I -c 'import os, sys; load, cores = map(int, sys.stdin.read().split()); assert cores == (os.cpu_count() or 1) * 10 and load >= 0, (load, cores)' ||
	fail "load.py did not print the machine's load and cores in tenths"
# free_ports gives a base from which n ports in a row are free, and fails with a message when it finds none in its tries: an empty
# E2E_PORT went on to the journeys, whose config then refused it with a message about the port, not the cause (CR8). Run as
# check.sh defines it, on a machine that cannot bind: a limit of 24 descriptors, where a run of 40 ports never fits.
eval "$(sed -n '/^free_ports() {/,/^}/p' "$here/check.sh")"
port=$(free_ports 3) && [ "$port" -ge 20000 ] && [ "$port" -lt 60000 ] || fail "free_ports gave no base for three free ports: $port"
out=$( (ulimit -n 24 && free_ports 40) 2>&1) && fail "free_ports exited 0 with no run of free ports: $out"
printf '%s\n' "$out" | grep -qF "no run of 40 free ports" || fail "free_ports did not say it found no free ports: $out"
# check.sh runs under set -e: the assignment stops there.
sh -c 'set -e; eval "$1"; E2E_PORT=$( (ulimit -n 24 && free_ports 40) 2>/dev/null); echo "went on: $E2E_PORT"' sh "$(sed -n '/^free_ports() {/,/^}/p' "$here/check.sh")" >"$t/ports.out" 2>&1 &&
	fail "an assignment of free_ports went on after it found no free ports: $(cat "$t/ports.out")"
fi

if part gate_tsc_cache; then
gate_fixture gate_tsc_cache
# The type check builds incrementally from the worktree's own .claude/tmp/tsc in a repository's fast gate, --tests-all included (Alexis,
# 2026-11-04: "Oui, les trois"); pre-commit's staged copy, which does not hold that folder, --full and --merge build from a folder of
# their own run, there as the check runs and gone at its end: they read no writable cache, as Prettier's. A caller's TSC_CACHE counts for nothing.
cache() { sed -n 's/^typecheck cache=//p' "$log.tsc"; }
own="$(cd "$g" && pwd -P)/.claude/tmp/tsc"
for args in "" --tests-all; do
	rm -f "$log.tsc" && out=$(TSC_CACHE=/elsewhere gate $args) || fail "check.sh $args failed a run whose every step passes: $out"
	[ "$(cache)" = "$own there" ] || fail "check.sh $args did not build the types from the worktree's own cache, $own: $(cache)"
done
rm -f "$log.tsc" && echo 'y' >>"$g/server/src/a.ts" && out=$(gate) || fail "check.sh failed a change of the server: $out"
[ "$(cache)" = "$own there" ] || fail "check.sh did not build a change's types from the worktree's own cache: $(cache)"
reset
c=$g.copy && rm -rf "${c:?}" && cp -R "$g" "$c" && rm -rf "${c:?}/.git"
for run in staged full merge; do
	rm -f "$log.tsc"
	case $run in
	staged) out=$(g=$c TSC_CACHE="$own" gate) || fail "check.sh failed a staged copy whose every step passes: $out" ;;
	*) out=$(AUDIT_ANSWER=x TSC_CACHE="$own" gate --"$run") || fail "check.sh --$run failed a run whose every step passes: $out" ;;
	esac
	set -- $(cache)
	[ "${2:-}" = there ] && [ -n "$1" ] && [ "$1" != "$own" ] && [ "$1" != "$(cd "$c" && pwd -P)/.claude/tmp/tsc" ] || fail "check.sh's $run run built the types from a cache it keeps: $(cache)"
	case $1 in "${TMPDIR:-/tmp}"/check.*/tsc | "${TMPDIR%/}"/check.*/tsc) ;; *) fail "check.sh's $run run built the types elsewhere than in its own folder of \$TMPDIR: $1" ;; esac
	[ ! -e "$1" ] || fail "check.sh's $run run left its own type check's folder behind: $1"
done
fi

if part gate_lint_scope; then
gate_fixture gate_lint_scope
# A commit's lint reads the files it changed and every file that imports them, at any depth, from the type check's own graph
# (scripts/lint_scope.py, given the paths on stdin and the type check's folder): ESLint's own cache keys a file on its own text, so a
# type changed elsewhere would leave the verdict it holds stale (the chief, for Alexis, 2026-11-04, in place of "ESLint with its cache").
# Its answer `.`, or a run of it that fails, lints the whole repository; nothing to read, no lint. Everything that runs every test, a
# config, --tests-all and the full gate, lints the whole repository, never asking it. The files go to package.json's lint script in
# place of its `.`, ESLint told not to warn of a file it ignores; a script of another shape is refused, never run as it is.
lint() { sed -n 's/^lint //p' "$log"; }
own="$(cd "$g" && pwd -P)/.claude/tmp/tsc"
echo 'y' >>"$g/app/src/a.tsx"
# The files as lint_scope.py quotes them for the shell, each reaching ESLint whole, never run: a space, a quote, a command substitution.
out=$(LINT_SCOPE="app/src/a.tsx 'app/src/b c.tsx' 'it'\"'\"'s.tsx' 'a\$(touch pwned).tsx' 'b\`touch pwned\`;x.tsx'" gate) || fail "check.sh failed a change whose lint passes: $out"
[ "$(cat "$log.scope-in")" = app/src/a.tsx ] || fail "check.sh did not give lint_scope.py the changed paths: $(cat "$log.scope-in")"
grep -qx "py:lint_scope $own" "$log" || fail "check.sh did not give lint_scope.py the type check's folder, $own: $(grep '^py:lint_scope' "$log")"
before typecheck py:lint_scope || fail "check.sh read the lint's files before the type check had built its graph"
[ "$(cat "$log.lint-args")" = "$(printf '%s\n' --no-warn-ignored -- app/src/a.tsx 'app/src/b c.tsx' "it's.tsx" 'a$(touch pwned).tsx' 'b`touch pwned`;x.tsx')" ] ||
	fail "check.sh did not give ESLint the files lint_scope.py named, alone and whole: $(cat "$log.lint-args")"
# A name that reads as an option is a file: `--` ends ESLint's options (lot 1's security review, S3: `--suppressions-location=x.md` silenced
# every error).
out=$(LINT_SCOPE="'--suppressions-location=sup.md' app/src/a.tsx" gate) || fail "check.sh failed a change whose lint passes: $out"
[ "$(cat "$log.lint-args")" = "$(printf '%s\n' --no-warn-ignored -- --suppressions-location=sup.md app/src/a.tsx)" ] ||
	fail "check.sh gave ESLint a file's name where it reads its options: $(cat "$log.lint-args")"
[ ! -e "$g/pwned" ] && [ ! -e "$g/app/pwned" ] || fail "check.sh ran a command a file's name held"
nocache "a change of the app"
for answer in . "fail"; do
	if [ "$answer" = fail ]; then out=$(LINT_SCOPE= LINT_SCOPE_EXIT=1 gate) || fail "check.sh failed when lint_scope.py failed: $out"; else out=$(LINT_SCOPE=. gate) || fail "check.sh failed on lint_scope.py's '.': $out"; fi
	[ "$(lint)" = "." ] || fail "check.sh did not lint the whole repository when lint_scope.py answered '$answer': $(lint)"
done
printf '%s\n' "$out" | grep -q "lint_scope.py failed" || fail "check.sh did not say lint_scope.py failed: $out"
out=$(LINT_SCOPE= gate) || fail "check.sh failed a change whose lint reads nothing: $out"
ran lint && fail "check.sh ran ESLint with no file to read: $(lint)"
# The staged copy has no repository, the lint's files come from its list; a script of another shape is refused.
c=$g.copy && rm -rf "${c:?}" && cp -R "$g" "$c" && rm -rf "${c:?}/.git"
out=$(g=$c GATE_CHANGED=app/src/a.tsx LINT_SCOPE=app/src/a.tsx gate) || fail "check.sh failed a staged copy whose lint passes: $out"
[ "$(lint)" = "--no-warn-ignored -- app/src/a.tsx" ] || fail "check.sh did not lint a staged copy's files alone: $(lint)"
# A lint script of another shape, committed (a change of package.json runs everything): the change of a.tsx alone asks for its files.
python3 -I - "$g/package.json" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))
p["scripts"]["lint"] = p["scripts"]["lint"] + " app"
json.dump(p, open(sys.argv[1], "w"))
PY
git -C "$g" commit -qm "a lint script of another shape" package.json
out=$(LINT_SCOPE=app/src/a.tsx gate) && fail "check.sh named files to a lint script that does not end on its '.': $out"
printf '%s\n' "$out" | grep -q "package.json's lint script" || fail "check.sh did not say why it refused the lint script: $out"
ran lint && fail "check.sh ran a lint script of another shape: $(lint)"
git -C "$g" reset -q --hard HEAD~1
# Every test, every file: a config, --tests-all, --full and --merge never ask lint_scope.py.
for run in config --tests-all --full --merge; do
	case $run in
	config) echo '{}' >"$g/knip.json" && out=$(LINT_SCOPE=app/src/a.tsx gate) ;;
	*) out=$(AUDIT_ANSWER=x LINT_SCOPE=app/src/a.tsx gate "$run") ;;
	esac || fail "check.sh $run failed a run whose every step passes: $out"
	[ "$(lint)" = "." ] && ! ran py:lint_scope || fail "check.sh $run did not lint the whole repository: $(lint)"
	reset
done
fi

if part gate_step_log; then
gate_fixture gate_step_log
# Every step of every gate keeps its time (Alexis, 2026-11-04: "Oui, les trois"; the audit could see only the runs past their budget):
# one line a step in the tools' cache, which every worktree shares and none removes, tab-separated: the run's start (UTC), the
# repository, the mode, the lane, the step, its seconds as the run printed them, and the load read as the lanes started. A log it
# cannot write costs the measure, never the run.
times=$g.home/.cache/gnoworld-tools/gate-times.log
repo=$(cd "$g" && pwd -P)
kept() { # $1: the run's output; $2: its mode. Each step the run printed has its line, and every line is of that run
	printf '%s\n' "$1" | sed -n 's/^lane \([a-z]*\) [0-9.]* s: \(.*\)$/\1 \2/p' | tr ',' '\n' | awk 'NF == 3 {lane = $1; print lane, $2, $3; next} NF == 2 {print lane, $1, $2}' >"$t/printed"
	[ -s "$t/printed" ] || fail "the run printed no step's time: $1"
	while read -r lane name took; do
		grep -qxF "$(printf '%s\t%s\t%s\t%s\t%s' "$repo" "$2" "$lane" "$name" "$took")" "$t/kept" || fail "check.sh did not keep lane $lane's step $name, $took s, of its $2 run: $(cat "$t/kept")"
	done <"$t/printed"
	[ "$(grep -c "" "$t/kept")" = "$(grep -c "" "$t/printed")" ] || fail "check.sh kept $(grep -c "" "$t/kept") lines for the $(grep -c "" "$t/printed") steps its $2 run printed: $(cat "$t/kept")"
}
out=$(LOAD_1="23 160" gate) || fail "check.sh failed a run whose every step passes: $out"
[ -s "$times" ] || fail "check.sh kept no time of its steps"
awk -F '\t' 'NF != 7 || $1 !~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z$/ || $6 !~ /^[0-9]+\.[0-9]$/ || $7 != "load 2.3 on 16 cores" { bad = 1 } END { exit bad }' "$times" ||
	fail "check.sh's step log lacks the run's start, the seconds or the load as the lanes started: $(cat "$times")"
[ "$(cut -f1 "$times" | sort -u | grep -c .)" = 1 ] || fail "check.sh stamped the steps of one run with more than one time: $(cut -f1 "$times" | sort -u)"
cut -f2- "$times" | cut -f1-5 >"$t/kept" && kept "$out" fast
# Kept: a second run adds its own lines after the first's, which stay.
first=$(cat "$times")
sleep 1 && out=$(gate) || fail "check.sh failed a second run whose every step passes: $out"
case $(cat "$times") in "$first"*) ;; *) fail "check.sh's second run did not keep the first's lines: $(cat "$times")" ;; esac
[ "$(cut -f1 "$times" | sort -u | grep -c .)" = 2 ] || fail "check.sh's two runs share one start: $(cut -f1 "$times" | sort -u)"
# A run that fails keeps its times too, the failed lane's included: the slow gates of the audit were passes and failures alike.
rm -f "$times" && out=$(FAIL=lint gate) && fail "check.sh passed with lint failing: $out"
grep -q "	fast	types	typecheck	" "$times" || fail "check.sh kept no time of a run that failed: $(cat "$times" 2>&1)"
# The mode is the run's: --tests-all, the staged copy of pre-commit (no repository: the one whose packages it borrows, else its own
# path), --full and --merge, whose later phases keep theirs.
rm -f "$times" && out=$(gate --tests-all) || fail "check.sh --tests-all failed a run whose every step passes: $out"
cut -f2- "$times" | cut -f1-5 >"$t/kept" && kept "$out" tests-all
c=$g.copy && rm -rf "${c:?}" && cp -R "$g" "$c" && rm -rf "${c:?}/.git"
out=$(g=$c gate) || fail "check.sh failed a staged copy whose every step passes: $out" # gate() gives it the home $c.home
cut -f2- "$c.home/.cache/gnoworld-tools/gate-times.log" | cut -f1-5 >"$t/kept" && repo=$(cd "$c" && pwd -P) && kept "$out" staged
rm -rf "${c:?}/node_modules" "$c.home" && ln -s "$g/node_modules" "$c/node_modules"
out=$(g=$c gate) || fail "check.sh failed a staged copy that borrows its packages: $out"
cut -f2- "$c.home/.cache/gnoworld-tools/gate-times.log" | cut -f1-5 >"$t/kept" && repo=$(cd "$g" && pwd -P) && kept "$out" staged
for mode in full merge; do
	rm -f "$times" && out=$(AUDIT_ANSWER=x gate --"$mode") || fail "check.sh --$mode failed a run whose every step passes: $out"
	cut -f2- "$times" | cut -f1-5 >"$t/kept" && kept "$out" "$mode"
	grep -q "	$mode	history	batch_size	" "$times" || fail "check.sh --$mode kept no time of its later phases: $(cat "$times")"
done
# A log it cannot write (a folder in its place) costs the measure alone: the run passes, and records what it passed.
rm -f "$times" "$g/.claude/tmp/green-fast" && mkdir -p "$times"
out=$(gate) || fail "check.sh failed a run because its step log cannot be written: $out"
grep -qxF "$(record)" "$g/.claude/tmp/green-fast" || fail "check.sh recorded nothing of a run whose step log cannot be written"
rmdir "$times"
fi

if part gate_light; then
gate_fixture gate_light
# The radical mode's light gate (Alexis, 2026-11-04, until the hardening slice): while git's own hooks folder holds `radical-mode` reading
# `on`, a commit's or a turn's change of the interface alone (speeds.py --light: tier-3 folders, no tier-1 path; F4909's (a)) and no harness
# file (records.sh's list) runs the types, the importers' lint, the build with the first screen's cap and jscpd; no Vitest, no journey,
# nothing else. Only Alexis writes there: no sandboxed command does (check.sh refuses to run where one could). Absent, anything but `on`, a
# file of the worktree in its name, a path of no tier-3 folder, a tier-1 path, a harness file, a doubt, a part's end or the full gate: the
# whole gate as before. pre-commit's staged copy reads the mode of the repository whose packages it borrows, and its list of paths.
cp "$here/speeds.py" "$g/scripts/" && mkdir -p "$g/docs" "$g/app/tests/stories" "$g/app/src/features/world"
printf '| Tier | What | Written by | How |\n|---|---|---|---|\n| 1 | The CSP (`app/src/csp.ts`) | Alexis | every line |\n| 1 | The deploy folder (`deploy/`) | Claude | every line |\n| 3 | Interface: `app/src/features/world/` | Either | Run it |\n' >"$g/docs/REVIEW.md"
printf 'x\n' >"$g/app/src/csp.ts" && printf 'x\n' >"$g/app/tests/stories/pictures.spec.ts" && printf 'x\n' >"$g/app/src/features/world/w.tsx"
git -C "$g" add -A && git -C "$g" commit -qm "a tier-1 file, a picture spec, an interface file" && git -C "$g" update-ref refs/remotes/origin/main HEAD
w="$g/app/src/features/world/w.tsx" # the interface's file, a change of it alone light
mode="$g/.git/hooks/radical-mode"
light_steps="typecheck lint copies build:app playwright"
heavy_steps="test format:check unused comments py:check_css sh:ergo py:check_docs"
light() { # $1: what the run was given; the run's output in $out
	for s in $light_steps; do ran "$s" || fail "check.sh's light gate skipped $s on $1"; done
	for s in $heavy_steps; do ran "$s" && fail "check.sh's light gate ran $s on $1"; done
	printf '%s\n' "$out" | grep -q "^check.sh: the radical mode's light gate" || fail "check.sh did not say it ran the light gate on $1: $out"
}
whole() { # $1: what the run was given
	for s in test format:check unused; do ran "$s" || fail "check.sh skipped $s on $1, which the whole gate runs"; done
	printf '%s\n' "$out" | grep -q "light gate" && fail "check.sh said the light gate on $1: $out"
	:
}
printf 'on\n' >"$mode" && echo y >>"$w"
out=$(gate) || fail "check.sh's light gate failed a change whose every step passes: $out"
light "a change of the interface in the radical mode"
grep -qxF "$(record)" "$g/.claude/tmp/green-fast" || fail "check.sh's light gate did not record the code it passed"
reset && echo y >>"$g/app/src/a.tsx" && out=$(gate) || fail "check.sh failed a change of the app outside the interface in the radical mode: $out"
whole "a change of the app outside the interface in the radical mode"
for path in app/src/csp.ts app/tests/stories/pictures.spec.ts app/src/a.tsx; do
	reset && echo y >>"$g/$path" && echo y >>"$w" && out=$(gate) || fail "check.sh failed beside $path in the radical mode: $out"
	whole "a change of $path in the radical mode"
done
reset && git -C "$g" mv app/src/csp.ts app/src/renamed.ts && out=$(gate) || fail "check.sh failed on a tier-1 file renamed: $out"
whole "a tier-1 file renamed away in the radical mode"
# The table the change itself rewrites: its tier-1 row dropped in the same change still counts, as main's (lot 1's review, R1); with no
# main to read it from, the whole gate.
reset && grep -v csp.ts "$g/docs/REVIEW.md" >"$g/docs/r" && mv "$g/docs/r" "$g/docs/REVIEW.md" && echo y >>"$g/app/src/csp.ts" && out=$(gate) ||
	fail "check.sh failed on a tier-1 file whose row the change dropped: $out"
whole "a tier-1 file whose row the same change dropped"
reset && git -C "$g" update-ref -d refs/remotes/origin/main && echo y >>"$w" && out=$(gate) || fail "check.sh failed with no main to read: $out"
whole "a change of the interface with no main's table to read"
git -C "$g" update-ref refs/remotes/origin/main HEAD
reset && echo y >>"$w"
for state in missing off "on2" folder planted; do
	rm -rf "${mode:?}" "$g/.githooks/radical-mode" "$g/.claude/tmp/radical-mode"
	case $state in
	missing) ;;
	folder) mkdir "$mode" ;;
	planted) mkdir -p "$g/.claude/tmp" && printf 'on\n' >"$g/.claude/tmp/radical-mode" ;;
	*) printf '%s\n' "$state" >"$mode" ;;
	esac
	out=$(gate) || fail "check.sh failed with the mode $state: $out"
	whole "a change of the interface with the mode $state"
done
# git's own folders, a caller's to name: a common folder of another's holding the mode on is read as no mode (lot 1's security review, S5).
fake="$t/gate_light.common" && mkdir -p "$fake/hooks" && printf 'on\n' >"$fake/hooks/radical-mode"
for f in objects refs HEAD config; do ln -s "$g/.git/$f" "$fake/$f"; done
for hook in commit-msg pre-commit pre-merge-commit pre-push; do ln -s "$g/.git/hooks/$hook" "$fake/hooks/$hook" 2>/dev/null || :; done
out=$(GIT_COMMON_DIR="$fake" gate) || fail "check.sh failed with a caller's GIT_COMMON_DIR: $out"
whole "a change of the interface with a caller's GIT_COMMON_DIR holding the mode on"
rm -rf "${mode:?}" "$g/.claude/tmp/radical-mode" && printf 'on\n' >"$mode"
mv "$g/docs/REVIEW.md" "$g/docs/gone.md" && out=$(gate) || fail "check.sh failed with no tier-1 table: $out"
whole "a change of the interface with no tier table to read"
mv "$g/docs/gone.md" "$g/docs/REVIEW.md"
for run in --tests-all --full --merge; do
	out=$(AUDIT_ANSWER=x gate "$run") || fail "check.sh $run failed in the radical mode: $out"
	printf '%s\n' "$out" | grep -q "light gate" && fail "check.sh $run took the light gate: $out"
done
# pre-commit's staged copy: the mode of the repository it borrows its packages from, and the paths pre-commit lists.
c=$g.copy && rm -rf "${c:?}" && cp -R "$g" "$c" && rm -rf "${c:?}/.git" "${c:?}/node_modules" && ln -s "$g/node_modules" "$c/node_modules"
out=$(g=$c GATE_CHANGED=app/src/features/world/w.tsx gate) || fail "check.sh failed a staged copy in the radical mode: $out"
light "a staged copy's change of the interface"
out=$(g=$c GATE_CHANGED="$(printf 'app/src/features/world/w.tsx\napp/src/csp.ts')" gate) || fail "check.sh failed a staged copy of a tier-1 file: $out"
whole "a staged copy's change of a tier-1 file"
rm "$c/node_modules" && cp -R "$g/node_modules" "$c/node_modules"
out=$(g=$c GATE_CHANGED=app/src/features/world/w.tsx gate) || fail "check.sh failed a staged copy that borrows no repository: $out"
whole "a staged copy with no repository to read the mode of"
rm -f "$mode"
fi

full_fixture() { # $1: its folder's name
	gate_fixture "$1"
	# Core's Chromium run's stub, here alone: a fixture's node_modules folder would hide gate_triggers' linked one.
	mkdir -p "$g/node_modules/vitest"
	}
if part gate_full; then
full_fixture gate_full
# The full gate: every fast step but the plain tests, then the full ones in lanes, each told where the
# branch left main; harness_mutate only when the harness changed since main.
base=$(git -C "$g" rev-parse HEAD)
out=$(AUDIT_ANSWER=x PICTURES_OF=nothing STORIES_PORT=6007 STORIES_OUT=/elsewhere GNOWORLD_BUILD=/elsewhere gate --full) || fail "check.sh --full failed on a copy whose every step passes: $out"
# The stories' walk is every story's, whatever PICTURES_OF the environment carries, and the tokens comparison is the fast
# gate's alone (F1190).
# Its file server takes a free port of its own run, as the tokens' pictures do, never the caller's 6007 nor the config's: two
# worktrees' gates at once both took 6007, and one failed (slice-5c's and slice-5d's merge checks, 2026-10-29).
grep -q '^stories port=[^ ]* of= on=[0-9][0-9]* out= test -c app/playwright.stories.config.ts' "$log" && ! grep -q '^stories .* on=6007 ' "$log" ||
	fail "check.sh --full let its environment narrow or redirect the stories' walk, or gave it no port of its own: $(grep '^stories' "$log")"
ran pictures && fail "check.sh --full compared the tokens story's pictures beside its whole walk"
for s in $full_steps py:probe py:bench core_chromium stories coverage py:patch_coverage py:prove_fix mutate py:check_regressions sh:scan_secrets py:audit; do
	[ "$s" = test ] || ran "$s" || fail "check.sh --full skipped $s"
done
ran test && fail "check.sh --full ran the tests twice, with and without coverage"
# The journeys build and serve app/build: their run is told no other folder, whatever the caller's environment says (F4249).
grep -qx 'playwright build=' "$log.build" || fail "check.sh --full gave the journeys another build folder than app/build: $(cat "$log.build")"
# Core's tests run again in Chromium, whose engine reads some regexes and Unicode otherwise than Node's (F816): their
# project, which vitest.config.ts opens only when CORE_CHROMIUM is set.
grep -qx "core_chromium switch=1 run --project core_chromium" "$log" ||
	fail "check.sh --full did not run core's tests in Chromium, with their switch and project: $(grep '^core_chromium' "$log")"
ran test:compiled || fail "check.sh --full ran no render-count test: the coverage's Vitest leaves the compiled project out (F1350)"
# The coverage lane's tools take half the machine each, the harness lane beside them the rest: none starves the
# timing-bound tests of the other (F777).
half=$(($(node -p "require('os').availableParallelism()") / 2))
[ "$half" -ge 1 ] || half=1
grep -q "^coverage --maxWorkers=$half --reporter=default --reporter=json --outputFile.json=" "$log" || fail "check.sh --full let Vitest's coverage take the whole machine (F777): $(grep '^coverage' "$log")"
# StrykerJS's incremental file is one cache every tree shares, in the tools' cache: a worktree's own, copied from the main
# tree's (63 of 142 files, a week old), made each branch mutate again what others had judged (Alexis, 2026-10-29). Each run
# works on its own copy, taken only if the cache reads as JSON, and puts it back whole only if it reads as JSON in turn: a
# run cut short, or two at once, never leaves the cache half written for every tree to fail on. StrykerJS runs alone, after every other
# lane, so it takes every core (Alexis, 2026-11-04: "16 cœurs"; section gate_stryker_lines).
cores=$(node -p "require('os').availableParallelism()")
grep -qE "^mutate --concurrency $cores --incrementalFile /[^ ]*/stryker-incremental\.json$" "$log" && ! grep -q "incrementalFile $g.home" "$log" ||
	fail "check.sh --full did not give StrykerJS every core, or let it work on the shared cache itself: $(grep '^mutate' "$log")"
cache="$g.home/.cache/gnoworld-tools/stryker-incremental.json"
mkdir -p "${cache%/*}" && printf '{"files":{"a":1}}' >"$cache"
STRYKER_WRITES='{"files":{"b":2}}' gate --full >/dev/null || fail "check.sh --full failed with a cache StrykerJS reads and writes"
grep -qx 'stryker-start {"files":{"a":1}}' "$log" || fail "check.sh --full did not start StrykerJS from the shared cache: $(grep '^stryker-start' "$log")"
[ "$(cat "$cache")" = '{"files":{"b":2}}' ] || fail "check.sh --full did not put StrykerJS's file back in the shared cache: $(cat "$cache")"
printf '{"files":{"cut' >"$cache"
STRYKER_WRITES='{"files":{"c":3}}' gate --full >/dev/null || fail "check.sh --full failed beside a cache cut short"
grep -qx 'stryker-start ' "$log" || fail "check.sh --full started StrykerJS from a cache cut short: $(grep '^stryker-start' "$log")"
STRYKER_WRITES='{"files":{"d' gate --full >/dev/null
[ "$(cat "$cache")" = '{"files":{"c":3}}' ] || fail "check.sh --full put a file cut short in the shared cache: $(cat "$cache")"
out=$(FAIL=mutate STRYKER_WRITES='{"files":{"e":5}}' gate --full) && fail "check.sh --full passed with StrykerJS failing"
[ "$(cat "$cache")" = '{"files":{"e":5}}' ] || fail "check.sh --full lost the verdicts of a StrykerJS run that found survivors: $(cat "$cache")"
ran py:harness_mutate && fail "check.sh --full mutated a harness main already has"
for s in py:prove_fix py:patch_coverage py:check_regressions; do
	grep -q "^$s $base$" "$log" || fail "check.sh --full did not give $s the base $base"
done
# A slice's last merge is checked by --full, not --merge (pre-merge.md, step 8), and it is the merge that reaches main: --full
# sizes its batch too, from the same base, and a batch too large fails it (security-S2).
grep -qx "py:batch_size $base" "$log" || fail "check.sh --full did not size the batch from its base $base: $(grep batch_size "$log")"
before coverage py:patch_coverage || fail "check.sh --full measured the patch's coverage before the coverage run"
grep -qx "audit-answer unset" "$log" || fail "check.sh let AUDIT_ANSWER reach the audit"
grep -qxF "$(record)" "$g/.claude/tmp/green-full" || fail "check.sh --full did not record the code it passed"
rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/green-full"
out=$(FAIL=py:batch_size gate --full) && fail "check.sh --full passed with its batch size failing"
printf '%s\n' "$out" | grep -q "^py:batch_size failed here" || fail "check.sh --full hid the batch size's failure: $out"
[ ! -e "$g/.claude/tmp/green-full" ] || fail "check.sh --full recorded a gate whose batch was too large"
fi

if part gate_full_order; then
full_fixture gate_full_order
# probe.py plants its faults in the source tree: it runs alone, before any full lane reads the tree (the
# coverage's Vitest, check_regressions' list, StrykerJS, the stories' build), which saw its files come and go.
(SLOW_STEP=py:probe gate --full) >/dev/null || fail "check.sh --full failed with a slow probe"
before "done py:probe" py:bench || fail "check.sh --full ran the benches while probe.py was planting its faults"
# The benches run alone, before any full lane: a bench beside other work measures the machine's load.
(SLOW_STEP=py:bench gate --full) >/dev/null || fail "check.sh --full failed with slow benches"
for s in core_chromium stories coverage py:patch_coverage py:prove_fix mutate py:check_regressions; do
	before "done py:bench" "$s" || fail "check.sh --full ran $s beside the benches"
done
for s in core_chromium stories coverage py:patch_coverage py:prove_fix mutate py:check_regressions sh:scan_secrets py:audit; do
	before "done py:probe" "$s" || fail "check.sh --full ran $s while probe.py was planting its faults"
done
# The stories' journeys run beside the history lane alone, never beside the coverage's Vitest, StrykerJS or the harness's worktrees,
# whose load outlasted a Dialog's teardown in the browser (F815). F3384 put the coverage before them (it is done before they start);
# the patch's coverage and StrykerJS still start after they are done.
(SLOW_STEP=stories gate --full) >/dev/null || fail "check.sh --full failed with slow stories"
for s in py:patch_coverage mutate; do
	before "done stories" "$s" || fail "check.sh --full ran $s beside the stories' journeys (F815)"
done
before "done coverage" stories || fail "check.sh --full ran the coverage beside the stories' journeys (F815)"
(SLOW_STEP=coverage gate --full) >/dev/null || fail "check.sh --full failed with a slow coverage"
before "done coverage" stories && before "done coverage" core_chromium || fail "check.sh --full started the stories' lane before the coverage was done (F815)"
(MEET="stories py:prove_fix" gate --full) >/dev/null || fail "check.sh --full ran the stories and the history lane one after the other"
fi

if part gate_full_fail; then
full_fixture gate_full_fail
# A dirty tree of one area: --full still checks everything, and records it.
printf 'y\n' >>"$g/server/src/a.ts"
gate --full >/dev/null || fail "check.sh --full failed on a server change"
for s in $full_steps; do [ "$s" = test ] || ran "$s" || fail "check.sh --full with a server change skipped $s"; done
nocache "--full with a server change"
[ -z "$(sed -n 's/^format:check //p' "$log")" ] || fail "check.sh --full gave Prettier a cache, which the merge check must not read: '$(sed -n 's/^format:check //p' "$log")'"
grep -qxF "$(record)" "$g/.claude/tmp/green-full" || fail "check.sh --full did not record a dirty tree it passed"
reset
printf '\n' >>"$g/scripts/check_css.py" && git -C "$g" commit -qam y
(SLOW_STEP=stories gate --full) >/dev/null || fail "check.sh --full failed on a harness change"
ran py:harness_mutate || fail "check.sh --full did not mutate a changed harness"
before "done stories" py:harness_mutate || fail "check.sh --full mutated the harness beside the stories' journeys (F815)"
rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/green-full"
out=$(FAIL=stories,py:audit gate --full) && fail "check.sh --full passed with two failing steps"
for s in stories py:audit; do printf '%s\n' "$out" | grep -q "^$s failed here" || fail "check.sh --full hid $s's failure: $out"; done
# Each lane's failure alone fails the gate and shows.
for s in core_chromium stories py:prove_fix coverage py:harness_mutate; do
	out=$(FAIL=$s gate --full) && fail "check.sh --full passed with $s failing alone"
	printf '%s\n' "$out" | grep -q "^$s failed here" || fail "check.sh --full hid $s's failure: $out"
done
# A failure in the stories' and the history phase stops the gate there, saying which lanes did not run: the patch's coverage, StrykerJS
# and the harness lanes never start (the coverage ran before them, F3384); the phase's other lane runs to its end (Alexis, 2026-10-26,
# C.5, F823). A failed coverage stops it earlier still, before the stories and prove_fix.
for s in core_chromium stories py:prove_fix; do
	out=$(FAIL=$s gate --full) && fail "check.sh --full passed with $s failing"
	ran mutate && fail "check.sh --full started StrykerJS after $s's failure"
	ran py:patch_coverage && fail "check.sh --full started the patch's coverage after $s's failure"
	ran py:harness_mutate && fail "check.sh --full started harness_mutate after $s's failure"
	printf '%s\n' "$out" | grep -q "^check.sh: the lanes after stories history did not run" ||
		fail "check.sh --full did not say which lanes did not run after $s's failure: $out"
done
out=$(FAIL=coverage gate --full) && fail "check.sh --full passed with the coverage failing"
ran stories || ran py:prove_fix && fail "check.sh --full went on to the stories or prove_fix after the coverage failed"
printf '%s\n' "$out" | grep -q "^check.sh: the lanes after coverage did not run" || fail "check.sh --full did not say which lanes did not run after the coverage's failure: $out"
# The probe and the benches run alone before any lane: either one failing fails the gate, shows, and stops it there (G2).
for s in py:probe py:bench; do
	out=$(FAIL=$s gate --full) && fail "check.sh --full passed with $s failing"
	printf '%s\n' "$out" | grep -q "^$s failed here" || fail "check.sh --full hid $s's failure: $out"
	ran stories && fail "check.sh --full went on to the stories after $s's failure"
	ran coverage && fail "check.sh --full went on to the coverage after $s's failure"
done
(FAIL=core_chromium gate --full) >/dev/null && fail "check.sh --full passed with core's Chromium tests failing"
(FAIL=stories gate --full) >/dev/null && fail "check.sh --full passed with the stories failing"
ran py:audit || fail "check.sh --full stopped the history lane at the stories' failure: a phase's lanes run to their end"
[ ! -e "$g/.claude/tmp/green-full" ] || fail "check.sh --full recorded a gate that failed"
fi

if part gate_full_merge; then
full_fixture gate_full_merge
# A harness changed since main, as the sections before it left it: --merge then judges its mutants.
printf '\n' >>"$g/scripts/check_css.py" && git -C "$g" commit -qam y
# --merge, a merge's own review: the full gate's steps, the harness mutants of the merge's guard files
# alone, and no full record, which only --full writes (pre-push wants it for main).
rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/green-full"
base=$(git -C "$g" merge-base HEAD origin/main)
printf 'z\n' >>"$g/server/src/a.ts" && git -C "$g" commit -qam "product code"
out=$(gate --merge) || fail "check.sh --merge failed on a copy whose every step passes: $out"
for s in $full_steps py:probe core_chromium stories coverage py:patch_coverage py:prove_fix mutate py:check_regressions py:check_migrations sh:scan_secrets py:audit; do
	[ "$s" = test ] || ran "$s" || fail "check.sh --merge skipped $s"
done
grep -qx "py:harness_mutate --changed $base" "$log" || fail "check.sh --merge did not judge the merge's own harness mutants: $(grep harness_mutate "$log")"
grep -qx "py:batch_size $base" "$log" || fail "check.sh --merge did not measure the merge's batch from its base: $(grep batch_size "$log")"
# A batch past its limit fails the merge's gate, shows, and records nothing (G2).
rm -f "$g/.claude/tmp/green-fast"
out=$(FAIL=py:batch_size gate --merge) && fail "check.sh --merge passed with its batch size failing"
printf '%s\n' "$out" | grep -q "^py:batch_size failed here" || fail "check.sh --merge hid the batch size's failure: $out"
[ ! -e "$g/.claude/tmp/green-fast" ] || fail "check.sh --merge recorded a gate whose batch was too large"
rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/green-full"
out=$(gate --merge) || fail "check.sh --merge failed again on a copy whose every step passes: $out"
[ ! -e "$g/.claude/tmp/green-full" ] || fail "check.sh --merge recorded the full gate"
grep -qxF "$(record)" "$g/.claude/tmp/green-fast" || fail "check.sh --merge did not record the fast gate it passed"
gate --full >/dev/null || fail "check.sh --full failed after --merge"
grep -qxE "py:harness_mutate ?" "$log" || fail "check.sh --full did not judge every harness mutant"
# A merge with no product code since main (docs, the harness, the lint) has no coverage, mutant or fix of the product to
# judge: --merge skips the stories, the coverage lane and prove_fix, and says so; the probe, the history's other steps
# and the harness's mutants still run (Alexis, 2026-10-29). --full never skips them; a path it cannot place is product.
git -C "$g" update-ref refs/remotes/origin/main HEAD && base=$(git -C "$g" rev-parse HEAD)
mkdir -p "$g/docs" "$g/.claude/agents" "$g/adr" "$g/.github/workflows" && printf 'x\n' >"$g/docs/x.md" && printf '\n' >>"$g/scripts/check_css.py" &&
	printf '\n' >>"$g/.githooks/records.sh" && printf 'x\n' >"$g/.claude/agents/x.md" && printf '\n' >>"$g/lint/x.ts" && printf 'x\n' >"$g/README.md" &&
	printf 'x\n' >"$g/adr/x.md" && printf 'x\n' >"$g/.github/workflows/x.yml" && printf '\n' >>"$g/eslint.config.ts" && for f in knip.json .jscpd.json .prettierrc.json .prettierignore; do printf '\n' >>"$g/$f"; done &&
	git -C "$g" add -A && git -C "$g" commit -qm "no product"
out=$(gate --merge) || fail "check.sh --merge failed on a branch with no product code: $out"
for s in core_chromium stories coverage py:patch_coverage mutate py:prove_fix; do
	ran "$s" && fail "check.sh --merge ran $s on a branch with no product code"
done
for s in $full_steps py:probe py:batch_size py:check_regressions sh:scan_secrets py:audit; do
	[ "$s" = test ] || ran "$s" || fail "check.sh --merge skipped $s on a branch with no product code"
done
grep -qx "py:harness_mutate --changed $base" "$log" || fail "check.sh --merge did not judge the harness mutants of a branch with no product code"
printf '%s\n' "$out" | grep -q "no product code since" || fail "check.sh --merge did not say why it skipped the product's lanes: $out"
gate --full >/dev/null || fail "check.sh --full failed on a branch with no product code"
for s in core_chromium stories coverage mutate py:prove_fix; do ran "$s" || fail "check.sh --full skipped $s on a branch with no product code"; done
for change in deploy/x app/src/a.ts packages/schemas/src/a.ts gno/r/x/gnomod.toml pnpm-lock.yaml docsx/a.ts lintx/a.ts scriptsx/a.ts; do
	git -C "$g" reset -q --hard "$base" && mkdir -p "$g/$(dirname "$change")" && printf '\n' >>"$g/$change" && git -C "$g" add -A && git -C "$g" commit -qm "$change"
	gate --merge >/dev/null || fail "check.sh --merge failed on a change of $change"
	ran mutate && ran py:prove_fix && ran stories || fail "check.sh --merge skipped the product's lanes for a change of $change"
done
# Product code that leaves is a change of the product too: renamed into docs/, deleted, or added and not yet committed.
git -C "$g" reset -q --hard "$base" && mkdir -p "$g/docs" && git -C "$g" mv server/src/a.ts docs/a.md && git -C "$g" commit -qm "into docs"
gate --merge >/dev/null && ran mutate || fail "check.sh --merge read product code renamed into docs/ as no product"
git -C "$g" reset -q --hard "$base" && git -C "$g" rm -q server/src/a.ts && git -C "$g" commit -qm gone
gate --merge >/dev/null && ran mutate || fail "check.sh --merge read deleted product code as no product"
git -C "$g" reset -q --hard "$base" && printf 'x\n' >"$g/app/src/new.ts"
gate --merge >/dev/null && ran mutate || fail "check.sh --merge read an untracked product file as no product"
reset
# The stories' lane asks free_ports for its port: when that fails, the lane fails before Playwright starts (R2's rule, for the port
# of d11330a3), and the gate says which lane.
out=$(PORTS_FAIL_ONE=1 gate --full) && fail "check.sh --full passed with no free port for the stories: $out"
printf '%s\n' "$out" | grep -q "lane stories failed at stories" || fail "check.sh --full did not fail the stories' lane when free_ports failed: $out"
grep -q '^stories ' "$log" && fail "check.sh --full started the stories with no free port"
# No origin/main to compare with: --full fails, saying so.
git -C "$g" update-ref -d refs/remotes/origin/main
out=$(gate --full) && fail "check.sh --full passed with no origin/main"
printf '%s\n' "$out" | grep -q "needs origin/main" || fail "check.sh --full did not say it needs origin/main: $out"
fi

# A commit's gate walks no journey (Alexis, 2026-10-31): the audit measured 487 and 505 CPU s of journeys against 67 to 91 for
# the rest of a commit's gate. It still builds the app (the build fails on a route or an import the types do not see) and starts
# no browser for it; the merge check and --full walk every journey, unfiltered. A session that writes a journey runs it itself.
if part gate_journeys; then
gate_fixture gate_journeys
[ ! -e "$here/journeys.py" ] || fail "scripts/journeys.py still exists: nothing reads it since a commit's gate walks no journey"
ran_browser() { journeys || grep -q "^\(stories\|pictures\)\( \|$\)" "$log"; }
for f in app/src/a.tsx packages/ui/src/a.ts app/tests/a.spec.ts server/src/a.ts app/src/a.json; do
	printf 'y\n' >>"$g/$f"
	out=$(gate) || fail "check.sh failed on a change of $f: $out"
	journeys && fail "check.sh walked the journeys in a commit's gate on a change of $f"
	ran_browser && fail "check.sh started a browser in a commit's gate on a change of $f: $(grep '^\(playwright\|stories\|pictures\)' "$log")"
	reset
done
# What is built is the app: the build, in the app's step, for a change a page can load and for a run of everything; not for the server, a test of the
# app or a journey, which no page loads. Its budget stays the 120 s of a run that builds.
for f in app/src/a.tsx packages/ui/src/a.ts app/src/a.json; do
	printf 'y\n' >>"$g/$f"
	out=$(gate) || fail "check.sh failed on a change of $f: $out"
	ran build:app || fail "check.sh did not build the app on a change of $f"
	printf '%s\n' "$out" | grep -q "(budget 120 s)$" || fail "check.sh gave a run that builds the app another budget than 120 s: $out"
	reset
done
for f in server/src/a.ts app/tests/a.spec.ts app/tests/e2e/serve.mjs; do
	mkdir -p "$g/$(dirname "$f")" && printf 'y\n' >>"$g/$f"
	gate >/dev/null || fail "check.sh failed on a change of $f"
	ran build:app && fail "check.sh built the app on a change of $f, which no page loads"
	reset
done
printf 'y\n' >>"$g/app/src/a.test.ts"
gate >/dev/null || fail "check.sh failed on a change of a test of the app alone"
ran build:app && fail "check.sh built the app on a change of a test of the app alone"
ran test || fail "check.sh did not run the tests on a change of a test of the app alone"
reset
gate >/dev/null || fail "check.sh failed on a tree with no change"
ran build:app || fail "check.sh did not build the app on a run of everything"
journeys && fail "check.sh walked the journeys on a run of everything at a commit"
# A build that fails fails the gate, and names the lane and the step.
printf 'y\n' >>"$g/app/src/a.tsx"
out=$(FAIL=build:app gate) && fail "check.sh passed with the app's build failing"
printf '%s\n' "$out" | grep -q "^check.sh: lane ts failed at app" || fail "check.sh did not name the lane ts and its step app when the build failed: $out"
reset
# The merge check and --full walk every journey, whatever changed: unfiltered, on a port of their own, and they build only through Playwright.
for mode in --full --merge; do
	printf 'y\n' >>"$g/app/src/a.tsx"
	AUDIT_ANSWER=x gate $mode >/dev/null || fail "check.sh $mode failed on a copy whose every step passes"
	ran playwright || fail "check.sh $mode ran no journey"
	[ "$(sed -n 's/^playwright .* --reporter=dot,json *//p' "$log")" = "" ] || fail "check.sh $mode gave the journeys a filter: the merge check keeps every one"
	ran build:app && fail "check.sh $mode built the app beside the journeys, which build it themselves"
	reset
done
fi

# A commit that touches a test file runs check_regressions in the fast gate (a renamed test passed it in 5b and failed only
# the merge check), and a lockfile change runs the audit (lighthouse's advisories showed only at the merge check, 5e). The
# commit has no message yet: the base is where the branch left main (the merge base with origin/main), so a `Removed-test:` line
# of an earlier commit of the branch lets a later removal through; HEAD with no origin/main; none, and no check, with no commit
# yet or in a merge (its full gate follows and judges the whole).
if part gate_checks; then
gate_fixture gate_checks
printf 'test("a", () => {});\n' >"$g/server/src/a.test.ts" && printf 'func TestA(t *testing.T) {}\n' >"$g/gno/r/a_test.gno"
git -C "$g" add -A && git -C "$g" commit -qm "tests"
head=$(git -C "$g" rev-parse HEAD) base=$(git -C "$g" merge-base HEAD origin/main)
[ "$head" != "$base" ] || fail "the fixture's branch has no commit past main: the base cannot be told from HEAD"
git -C "$g" mv server/src/a.test.ts server/src/renamed.test.ts
gate >/dev/null || fail "check.sh failed on a renamed test"
grep -qx "py:check_regressions --quick $base" "$log" || fail "check.sh did not run check_regressions from where the branch left main on a renamed test (a Removed-test: line of a commit of the branch must count): $(grep check_regressions "$log")"
reset
# Every kind of file that is a test, a bench or an approved picture.
for f in server/src/a.test.ts gno/r/a_test.gno app/tests/a.spec.ts packages/core/src/new.test.ts app/src/home.test.tsx gno/tools/a_test.go app/tests/bench/a.bench.ts app/tests/bench/a.bench.tsx \
	"app/tests/e2e/home.spec.ts-snapshots/a-chromium.png" app/tests/e2e/__screenshots__/b.png; do
	mkdir -p "$g/$(dirname "$f")" && printf 'y\n' >>"$g/$f"
	gate >/dev/null || fail "check.sh failed on a change of $f"
	grep -qx "py:check_regressions --quick $base" "$log" || fail "check.sh did not run check_regressions on a change of $f"
	reset
done
# A merge being committed (MERGE_HEAD): the full gate follows and judges the whole, so the fast gate does not.
git -C "$g" rev-parse HEAD >"$g/.git/MERGE_HEAD"
git -C "$g" mv server/src/a.test.ts server/src/renamed.test.ts
gate >/dev/null || fail "check.sh failed on a renamed test in a merge"
ran py:check_regressions && fail "check.sh ran check_regressions in a merge commit, whose declarations sit in the merged branch's commits"
rm -f "$g/.git/MERGE_HEAD"
reset
# With no origin/main the base is HEAD.
git -C "$g" update-ref -d refs/remotes/origin/main
git -C "$g" mv server/src/a.test.ts server/src/renamed.test.ts
gate >/dev/null || fail "check.sh failed on a renamed test with no origin/main"
grep -qx "py:check_regressions --quick $head" "$log" || fail "check.sh did not fall back to HEAD with no origin/main: $(grep check_regressions "$log")"
git -C "$g" update-ref refs/remotes/origin/main "$base"
reset
git -C "$g" rm -q server/src/a.test.ts
gate >/dev/null || fail "check.sh failed on a deleted test"
ran py:check_regressions || fail "check.sh did not run check_regressions on a deleted test"
reset
git -C "$g" rm -q gno/r/a_test.gno
gate >/dev/null || fail "check.sh failed on a deleted gno test"
ran py:check_regressions || fail "check.sh did not run check_regressions on a deleted gno test"
reset
for f in server/src/a.ts app/src/a.tsx; do
	printf 'y\n' >>"$g/$f"
	gate >/dev/null || fail "check.sh failed on a change of $f"
	ran py:check_regressions && fail "check.sh ran check_regressions on a change of $f, which touches no test"
	reset
done
gate >/dev/null || fail "check.sh failed on a tree with no change"
ran py:check_regressions && fail "check.sh ran check_regressions on a tree with no change"
printf 'y\n' >>"$g/server/src/a.test.ts"
out=$(FAIL=py:check_regressions gate) && fail "check.sh passed with check_regressions refusing a test change: $out"
printf '%s\n' "$out" | grep -q "^py:check_regressions failed here" || fail "check.sh hid check_regressions's refusal: $out"
reset
# The audit: a lockfile change, and only it. It asks npm (AUDIT_ANSWER, the test switch, never inherited).
printf '\n' >>"$g/pnpm-lock.yaml"
AUDIT_ANSWER=x gate >/dev/null || fail "check.sh failed on a lockfile change"
ran py:audit || fail "check.sh did not run the audit on a lockfile change (5e: lighthouse's advisories showed at the merge check)"
grep -qx "audit-answer unset" "$log" || fail "check.sh let AUDIT_ANSWER reach the audit of a lockfile change"
# A merge being committed: the full gate follows and runs the audit whole.
git -C "$g" rev-parse HEAD >"$g/.git/MERGE_HEAD"
AUDIT_ANSWER=x gate >/dev/null || fail "check.sh failed on a lockfile change in a merge"
ran py:audit && fail "check.sh ran the audit in a merge commit, whose full gate follows"
rm -f "$g/.git/MERGE_HEAD"
out=$(FAIL=py:audit gate) && fail "check.sh passed a lockfile change whose audit found an advisory"
printf '%s\n' "$out" | grep -q "^py:audit failed here" || fail "check.sh hid the audit's failure: $out"
reset
printf '\n' >>"$g/pnpm-lock.yaml" && printf 'y\n' >>"$g/server/src/a.ts"
gate >/dev/null || fail "check.sh failed on a lockfile change beside a server one"
ran py:audit || fail "check.sh skipped the audit on a lockfile change beside a server one"
reset
for f in package.json app/package.json server/src/a.ts vitest.config.ts; do
	printf '\n' >>"$g/$f"
	gate >/dev/null || fail "check.sh failed on a change of $f"
	ran py:audit && fail "check.sh ran the audit on a change of $f, which leaves the lockfile alone"
	reset
done
gate >/dev/null || fail "check.sh failed on a tree with no change"
ran py:audit && fail "check.sh ran the audit on a tree with no change"
# Pre-commit's staged copy: the list names the lockfile; no repository there, so check_regressions is the hook's (below).
cp -R "$g" "$g-copy" && rm -rf "$g-copy/.git"
: >"$log" && (cd "$g-copy" && env -u SANDBOX_RUNTIME -u GATE_MERGE GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED="pnpm-lock.yaml" sh scripts/check.sh >/dev/null 2>&1) || fail "check.sh failed outside a repository on a lockfile change"
ran py:audit || fail "check.sh did not run the audit on a lockfile change outside a repository"
: >"$log" && (cd "$g-copy" && env -u SANDBOX_RUNTIME -u GATE_MERGE GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED="server/src/a.test.ts" sh scripts/check.sh >/dev/null 2>&1) || fail "check.sh failed outside a repository on a test change"
ran py:check_regressions && fail "check.sh ran check_regressions in a copy with no repository, where git has nothing to compare"
# pre-commit does, in the repository, before the staged copy's gate: a commit that touches a test file runs the staged copy's
# check_regressions.py from the repository, with the base check.sh takes (where the branch left main, else HEAD), and a refusal
# stops the commit. Not in a merge, not with no commit yet (nothing to compare).
c3="$t/precommit_regr"
precommit_in() { d=$1 code=$2 && shift 2 && (cd "$d" && REG_LOG="$t/reg.log" REG_EXIT="$code" sh "$hooks/pre-commit" "$@" >/dev/null 2>&1); }
precommit3() { code=${1:-0} && { [ $# -eq 0 ] || shift; } && precommit_in "$c3" "$code" "$@"; }
regr_fixture() { # $1: a folder
	mkdir -p "$1/scripts" "$1/server/src" && git -C "$1" init -q && good_rules "$1"
	printf '#!/bin/sh\nexit 0\n' >"$1/scripts/check.sh"
	printf 'import os, sys\nopen(os.environ["REG_LOG"], "a").write(os.getcwd() + " " + " ".join(sys.argv[1:]) + "\\n")\nsys.exit(int(os.environ["REG_EXIT"]))\n' >"$1/scripts/check_regressions.py"
	cp "$here/code_changed.sh" "$here/borrow_node_modules.sh" "$here/check_docs.py" "$here/repo_files.py" "$here/speeds.py" "$1/scripts/" && secrets_into "$1/scripts/"
	printf 'test("a", () => {});\n' >"$1/server/src/a.test.ts" && printf 'x\n' >"$1/server/src/a.ts"
}
logged() { grep -qx "$(cd "$c3" && pwd -P) $1" "$t/reg.log" 2>/dev/null || grep -qx "$c3 $1" "$t/reg.log" 2>/dev/null; }
regr_fixture "$c3"
[ -z "$(sed -n 's/^format:check //p' "$log")" ] || fail "check.sh gave Prettier a cache in a copy outside a repository, a new folder each time"
git -C "$c3" add -A && git -C "$c3" commit -qm base
head3=$(git -C "$c3" rev-parse HEAD) && rm -f "$t/reg.log"
git -C "$c3" mv server/src/a.test.ts server/src/b.test.ts
precommit3 || fail "pre-commit refused a renamed test with a check_regressions that passes"
logged "--quick $head3" || fail "pre-commit did not run check_regressions from the repository with HEAD as the base, there being no origin/main: $(cat "$t/reg.log" 2>&1)"
precommit3 1 && fail "pre-commit let a renamed test through, check_regressions refusing it (the fast gate passed it in 5b)"
git -C "$c3" reset -q --hard && rm -f "$t/reg.log"
printf 'y\n' >>"$c3/server/src/a.ts" && git -C "$c3" add server/src/a.ts
precommit3 1 || fail "pre-commit ran check_regressions on a commit that touches no test"
[ ! -e "$t/reg.log" ] || fail "pre-commit ran check_regressions on a commit that touches no test: $(cat "$t/reg.log")"
# Where the branch left main is the base, so an earlier commit's `Removed-test:` line counts.
git -C "$c3" update-ref refs/remotes/origin/main "$head3" && git -C "$c3" commit -qm "a commit of the branch"
head3b=$(git -C "$c3" rev-parse HEAD)
[ "$head3b" != "$head3" ] || fail "the fixture's branch has no commit past main"
git -C "$c3" mv server/src/a.test.ts server/src/b.test.ts
precommit3 || fail "pre-commit refused a renamed test with a check_regressions that passes, on a branch"
logged "--quick $head3" || fail "pre-commit did not take where the branch left main as the base: $(cat "$t/reg.log" 2>&1)"
! logged "--quick $head3b" || fail "pre-commit took HEAD as the base on a branch: a Removed-test: line of an earlier commit could not count"
# A merge being committed: the full gate follows.
rm -f "$t/reg.log"
precommit3 1 --merge || fail "pre-commit ran check_regressions in a merge commit"
[ ! -e "$t/reg.log" ] || fail "pre-commit ran check_regressions in a merge commit: $(cat "$t/reg.log")"
git -C "$c3" reset -q --hard
# Every kind of test file, bench and approved picture.
for f in app/src/home.test.tsx gno/tools/a_test.go app/tests/bench/a.bench.ts app/tests/bench/a.bench.tsx app/tests/a.spec.ts gno/r/a_test.gno "app/tests/e2e/home.spec.ts-snapshots/a.png" app/tests/e2e/__screenshots__/b.png; do
	rm -f "$t/reg.log" && mkdir -p "$c3/$(dirname "$f")" && printf 'y\n' >>"$c3/$f" && git -C "$c3" add "$f"
	precommit3 || fail "pre-commit refused a change of $f with a check_regressions that passes"
	logged "--quick $head3" || fail "pre-commit did not run check_regressions on a change of $f"
	git -C "$c3" reset -q --hard && git -C "$c3" clean -qfd
done
# No commit yet: nothing to compare, and the commit is not refused for it.
c4="$t/precommit_unborn" && regr_fixture "$c4" && rm -f "$t/reg.log"
git -C "$c4" add -A
precommit_in "$c4" 1 || fail "pre-commit refused the first commit of a repository, check_regressions having nothing to compare"
[ ! -e "$t/reg.log" ] || fail "pre-commit ran check_regressions with no commit yet: $(cat "$t/reg.log")"
fi

# StrykerJS's sandboxes: a timed-out dry run leaves .stryker-tmp, which Vitest's bench project measured (the bench at 27 to
# 41 ms instead of 2 to 4, 5n). Vitest ignores the folder, and check.sh empties it before StrykerJS starts.
if part gate_stryker; then
gate_fixture gate_stryker
mkdir -p "$g/node_modules/vitest"
# StrykerJS's step, here, fails when a sandbox is still there as it starts.
python3 -I - "$g/package.json" "$step" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))
p["scripts"]["mutate"] = f'test -z "$(ls -A .stryker-tmp 2>/dev/null)" || {{ echo "a sandbox was left in .stryker-tmp" >&2; exit 1; }}; sh {sys.argv[2]} mutate'
json.dump(p, open(sys.argv[1], "w"))
PY
git -C "$g" add -A && git -C "$g" commit -qm "mutate checks its folder"
mkdir -p "$g/.stryker-tmp/sandbox-1/app/src" "$g/.stryker-tmp/.vite" && printf 'x\n' >"$g/.stryker-tmp/sandbox-1/app/src/a.ts"
out=$(AUDIT_ANSWER=x gate --full) || fail "check.sh --full did not empty .stryker-tmp before StrykerJS started: $(printf '%s\n' "$out" | tail -5)"
ran mutate || fail "check.sh --full did not run StrykerJS"
[ -z "$(ls -A "$g/.stryker-tmp" 2>/dev/null)" ] || fail "check.sh --full left a sandbox in .stryker-tmp: $(ls -A "$g/.stryker-tmp")"
# Only that folder: another folder of a tree is never emptied.
mkdir -p "$g/.stryker-tmpx" "$g/keep" && printf 'x\n' >"$g/.stryker-tmpx/a" && printf 'x\n' >"$g/keep/a"
AUDIT_ANSWER=x gate --full >/dev/null || fail "check.sh --full failed with folders beside .stryker-tmp"
[ -e "$g/.stryker-tmpx/a" ] && [ -e "$g/keep/a" ] || fail "check.sh --full emptied a folder that is not .stryker-tmp"
# A link named .stryker-tmp is emptied no further than itself: what it leads to is not StrykerJS's.
rm -rf "$g/.stryker-tmp" && mkdir -p "$t/stryker-away" && printf 'x\n' >"$t/stryker-away/a" && ln -s "$t/stryker-away" "$g/.stryker-tmp"
AUDIT_ANSWER=x gate --full >/dev/null || fail "check.sh --full failed with .stryker-tmp as a link"
[ -e "$t/stryker-away/a" ] || fail "check.sh --full emptied what a link named .stryker-tmp leads to"
fi

if part gate_stryker_lines; then
full_fixture gate_stryker_lines
# StrykerJS runs alone, once every other lane of the gate has ended, on every core (Alexis, 2026-11-04: "16 cœurs"): it took half the
# machine while the coverage and the harness lanes ran beside it, whose load outlasted Ergo's 9 s auth script (F777); nothing runs beside it
# now. A merge check mutates the code the branch changed since its base alone ("Lignes de la tranche"): scripts/stryker_lines.py writes
# that config in the run's own folder and StrykerJS is given it; no line to mutate, no StrykerJS; a stryker_lines.py that fails, the
# whole control. --full mutates the whole, with no such config. Either way the shared cache gets the run's file back.
cores=$(node -p "require('os').availableParallelism()")
base=$(git -C "$g" rev-parse HEAD)
mkdir -p "$g/.claude" && echo '{}' >"$g/.claude/x.json" && echo 'y' >>"$g/app/src/a.tsx" && git -C "$g" add -A && git -C "$g" commit -qm "product and harness"
mutate() { sed -n 's/^mutate //p' "$log"; }
cache="$g.home/.cache/gnoworld-tools/stryker-incremental.json"
out=$(AUDIT_ANSWER=x SLOW_STEP=py:harness_mutate STRYKER_WRITES='{"files":{"lines":1}}' gate --merge) || fail "check.sh --merge failed a run whose every step passes: $out"
config=$(sed -n "s|^py:stryker_lines $base ||p" "$log")
case $config in /*/stryker.json) ;; *) fail "check.sh --merge did not ask stryker_lines.py for its base's lines, into a file of its own: $(grep '^py:stryker_lines' "$log")" ;; esac
[ "$(mutate)" = "$config --concurrency $cores --incrementalFile ${config%/*}/stryker-incremental.json" ] ||
	fail "check.sh --merge did not give StrykerJS the lines' config and every core, from its own copy of the cache: $(mutate)"
[ "$(cat "$cache")" = '{"files":{"lines":1}}' ] || fail "check.sh --merge did not put the lines' run's file back in the shared cache: $(cat "$cache" 2>&1)"
before "done py:harness_mutate" mutate && before "done py:patch_coverage" mutate || fail "check.sh --merge ran StrykerJS beside another lane"
printf '%s\n' "$out" | grep -qE '^lane stryker [0-9.]+ s: stryker [0-9.]+$' || fail "check.sh --merge did not print StrykerJS's lane apart: $out"
out=$(AUDIT_ANSWER=x STRYKER_LINES_EXIT=3 gate --merge) || fail "check.sh --merge failed with no line to mutate: $out"
ran mutate && fail "check.sh --merge ran StrykerJS with no line to mutate: $(mutate)"
printf '%s\n' "$out" | grep -q "no line StrykerJS mutates changed since $base" || fail "check.sh --merge did not say why StrykerJS did not run: $out"
for code in 1 2; do
	out=$(AUDIT_ANSWER=x STRYKER_LINES_EXIT=$code gate --merge) || fail "check.sh --merge failed when stryker_lines.py exited $code: $out"
	mutate | grep -qE "^--concurrency $cores --incrementalFile /[^ ]*/stryker-incremental\.json$" || fail "check.sh --merge did not mutate the whole control when stryker_lines.py exited $code: $(mutate)"
	printf '%s\n' "$out" | grep -q "stryker_lines.py failed: StrykerJS mutates the whole control" || fail "check.sh --merge did not say stryker_lines.py failed: $out"
done
out=$(AUDIT_ANSWER=x FAIL=mutate gate --merge) && fail "check.sh --merge passed with StrykerJS failing: $out"
printf '%s\n' "$out" | tail -1 | grep -qx "check.sh: FAILED at stryker:stryker" || fail "check.sh --merge did not name StrykerJS's lane last: $(printf '%s\n' "$out" | tail -1)"
out=$(AUDIT_ANSWER=x SLOW_STEP=py:harness_mutate gate --full) || fail "check.sh --full failed a run whose every step passes: $out"
ran py:stryker_lines && fail "check.sh --full narrowed StrykerJS to the branch's lines"
mutate | grep -qE "^--concurrency $cores --incrementalFile /[^ ]*/stryker-incremental\.json$" || fail "check.sh --full did not mutate the whole on every core: $(mutate)"
before "done py:harness_mutate" mutate || fail "check.sh --full ran StrykerJS beside the harness lane"
# A patch's coverage under its floor fails --full there, before StrykerJS's half hour; a merge check goes on, and says both.
out=$(AUDIT_ANSWER=x FAIL=py:patch_coverage gate --full) && fail "check.sh --full passed under the patch's floor: $out"
ran mutate && fail "check.sh --full ran StrykerJS after the patch's coverage failed"
out=$(AUDIT_ANSWER=x FAIL=py:patch_coverage gate --merge) && fail "check.sh --merge passed under the patch's floor: $out"
ran mutate || fail "check.sh --merge stopped before StrykerJS on the patch's coverage"
printf '%s\n' "$out" | grep -q "every failure above, in the order they came: mutation:patch_coverage" || fail "check.sh --merge did not name the patch's coverage among its failures: $out"
fi

if part stryker_lines; then
# stryker_lines.py: the merge check's StrykerJS config, its `mutate` the code the branch changed since its base: each changed line widened
# to the top-level statements it lies in (StrykerJS 10.0.0 mutates a node only inside one range: an `if (a &&\n b)` whose one line changed
# keeps its mutants), as `path:from-to`, in the files the config's own `mutate` selects (braces and negations read as git's glob pathspecs,
# a hidden part left out as minimatch leaves it), a new file whole, committed or not; a deletion or a comment touches no statement. Every
# other key is kept. No line: exit 3, nothing written; a config it cannot read or an odd pattern: exit 2; any other failure is no 0 nor 3.
sl="$t/stryker_lines" && mkdir -p "$sl/scripts" "$sl/app/src/.cache" "$sl/server/src/testing" "$sl/docs"
cp "$here/stryker_lines.py" "$here/repo_files.py" "$sl/scripts/" && ln -s "$(cd "$here/../node_modules" && pwd -P)" "$sl/node_modules"
cat >"$sl/stryker.config.json" <<'JSON'
{
  "testRunner": "vitest",
  "mutate": ["app/src/**/*.{ts,tsx}", "!app/src/**/*.test.{ts,tsx}", "server/src/**/*.ts", "!server/src/testing/**"],
  "incremental": true
}
JSON
printf 'node_modules\n' >"$sl/.gitignore"
for n in one two three four five; do printf 'export const %s = 1;\n' "$n"; done >"$sl/app/src/a.ts"
printf 'export function f(a: boolean, b: boolean): number {\n  if (\n    a &&\n    b\n  ) {\n    return 1;\n  }\n  return 0;\n}\nexport const apart = 0;\n' >"$sl/app/src/m.ts"
printf '// a note\nexport const c = 1;\n' >"$sl/app/src/c.ts"
printf 'export const x = 1;\nexport const y = 2;\nexport const z = 3;\n' >"$sl/app/src/b.tsx"
for f in app/src/a.test.ts server/src/s.ts server/src/testing/t.ts docs/d.ts app/src/.h.ts app/src/.cache/x.ts app/src/gone.ts app/src/r.ts; do printf 'export const v = 1;\n' >"$sl/$f"; done
git -C "$sl" init -q && git -C "$sl" add -A && git -C "$sl" commit -qm base && base=$(git -C "$sl" rev-parse HEAD)
lines() { (cd "$sl" && PATH="${NVM_DIR:-$HOME/.nvm}/versions/node/v$(cat "$here/../.node-version")/bin:$PATH" python3 -I scripts/stryker_lines.py "$@"); }
exits() { # $1: the exit it must give; then stryker_lines.py's arguments. It writes nothing but on 0
	want=$1 && shift && rm -f "$sl/out.json"
	code=0 && out=$(lines "$@" 2>&1) || code=$?
	[ "$code" = "$want" ] && [ ! -e "$sl/out.json" ] || fail "stryker_lines.py $* exited $code, not $want, or wrote its config: $out"
}
exits 3 "$base" "$sl/out.json"
for n in one two three four five six; do case $n in two) echo 'export const two = 22;' ;; three) echo 'export const three = 33;' ;; *) printf 'export const %s = 1;\n' "$n" ;; esac; done >"$sl/app/src/a.ts"
sed 's/^    b$/    !b/' "$sl/app/src/m.ts" >"$sl/m" && mv "$sl/m" "$sl/app/src/m.ts"
printf '// another note\nexport const c = 1;\n' >"$sl/app/src/c.ts" && printf 'export const x = 1;\nexport const z = 3;\n' >"$sl/app/src/b.tsx"
for f in app/src/a.test.ts server/src/s.ts server/src/testing/t.ts docs/d.ts app/src/.h.ts app/src/.cache/x.ts; do printf 'export const w = 2;\n' >"$sl/$f"; done
printf 'export const added = 1;\nexport const more = 2;\n' >"$sl/app/src/added.ts" && git -C "$sl" rm -q app/src/gone.ts && git -C "$sl" mv app/src/r.ts app/src/r2.ts
git -C "$sl" add -A && git -C "$sl" commit -qm change && printf 'export const n = 1;\nexport const m = 2;\n' >"$sl/app/src/n.tsx"
out=$(lines "$base" "$sl/out.json") || fail "stryker_lines.py failed on a change: $out"
printf '%s\n' "$out" | grep -qx "stryker_lines: 18 lines in 6 files changed since $base" || fail "stryker_lines.py did not say what it kept: $out"
python3 -I - "$sl/out.json" "$sl/stryker.config.json" <<'PY' || fail "stryker_lines.py's config is not the changed statements alone, the rest kept: $(cat "$sl/out.json")"
import json, sys
out, config = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
want = ["app/src/a.ts:2-3", "app/src/a.ts:6-6", "app/src/added.ts:1-2", "app/src/m.ts:1-9", "app/src/n.tsx:1-2", "app/src/r2.ts:1-1", "server/src/s.ts:1-1"]
assert out["mutate"] == want, out["mutate"]
assert {k: v for k, v in out.items() if k != "mutate"} == {k: v for k, v in config.items() if k != "mutate"}, out
PY
# What it cannot read is no green check: an unknown base, an output it cannot write, a config absent, not JSON, or whose mutate is no list.
exits 1 0000000000000000000000000000000000000000 "$sl/out.json"
code=0 && lines "$base" "$sl/nowhere/out.json" >/dev/null 2>&1 || code=$?
[ "$code" != 0 ] && [ "$code" != 3 ] && [ ! -e "$sl/nowhere" ] || fail "stryker_lines.py exited $code with an output it cannot write"
cp "$sl/stryker.config.json" "$t/stryker.good"
for bad in none 'not json' '{"mutate": "app/src/**/*.ts"}' '{"mutate": []}' '[]'; do
	if [ "$bad" = none ]; then rm "$sl/stryker.config.json"; else printf '%s' "$bad" >"$sl/stryker.config.json"; fi
	exits 2 "$base" "$sl/out.json"
	cp "$t/stryker.good" "$sl/stryker.config.json"
done
# A pattern git's pathspecs do not read as minimatch does refuses, alone or beside good ones: an extglob, a character class, a `?`.
for odd in 'app/src/**/+(a|b).ts' 'app/src/[ab].ts' 'app/src/?.ts'; do
	python3 -I - "$sl/stryker.config.json" "$odd" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
c["mutate"].append(sys.argv[2])
json.dump(c, open(sys.argv[1], "w"))
PY
	exits 2 "$base" "$sl/out.json"
	cp "$t/stryker.good" "$sl/stryker.config.json"
done
# On the repository's own config, git's reading of the patterns and StrykerJS's matcher (minimatch, hidden files left out) pick one set, of
# the repository's files: git's list, or the copy's own files in pre-commit's staged copy, which has no .git; git reads its patterns in a
# repository of those paths, empty.
nodebin="${NVM_DIR:-$HOME/.nvm}/versions/node/v$(cat "$here/../.node-version")/bin"
if git -C "$here/.." rev-parse --git-dir >/dev/null 2>&1; then
	(cd "$here/.." && git ls-files) >"$t/tracked"
else
	(cd "$here/.." && find . -path ./node_modules -prune -o -type f -print | sed 's|^\./||' | LC_ALL=C sort) >"$t/tracked"
fi
python3 -I - "$here" "$here/.." "$t/stryker_lines.mirror" "$t/tracked" >"$t/by_git" <<'PY' || fail "stryker_lines.py's pathspecs could not be read on the repository's config"
import json, os, subprocess, sys
sys.path.insert(0, sys.argv[1])
from stryker_lines import pathspecs
specs = pathspecs(json.load(open(os.path.join(sys.argv[2], "stryker.config.json")))["mutate"])
mirror = sys.argv[3]
os.makedirs(mirror)
for path in open(sys.argv[4]).read().splitlines():
    os.makedirs(os.path.join(mirror, os.path.dirname(path)), exist_ok=True)
    open(os.path.join(mirror, path), "w").close()
for args in (["init", "-q"], ["add", "-A"]):
    subprocess.run(["git", *args], cwd=mirror, check=True)
files = subprocess.run(["git", "ls-files", "--", *specs], cwd=mirror, capture_output=True, text=True, check=True).stdout.splitlines()
print("\n".join(sorted(f for f in files if not any(p.startswith(".") for p in f.split("/")))))
PY
(cd "$here/.." && PATH="$nodebin:$PATH" node --input-type=module -e 'import { readFileSync } from "node:fs";
import { FileMatcher } from "./node_modules/@stryker-mutator/core/dist/src/config/file-matcher.js";
const files = readFileSync(0, "utf8").split("\n").filter(Boolean);
const chosen = new Map(files.map((f) => [f, false]));
for (const p of JSON.parse(readFileSync("stryker.config.json", "utf8")).mutate) {
  const no = p.startsWith("!"), m = new FileMatcher(no ? p.slice(1) : p, false);
  for (const f of files) if (m.matches(f)) chosen.set(f, !no);
}
console.log([...chosen].filter(([, on]) => on).map(([f]) => f).sort().join("\n"));' <"$t/tracked") >"$t/by_stryker" || fail "StrykerJS's matcher could not be read"
[ -s "$t/by_git" ] && cmp -s "$t/by_git" "$t/by_stryker" || fail "stryker_lines.py's pathspecs and StrykerJS's matcher pick other files: $(diff "$t/by_git" "$t/by_stryker" | head -5)"
fi

if part lint_scope; then
# lint_scope.py on a real type check's graph, TypeScript's own .tsbuildinfo, so that an upgrade that moves its format fails here (the
# chief, 2026-11-04). A type changed in a.ts turns b.ts red, which imports it and did not change: the scope names a.ts and its importers at
# any depth, across two programs and through a folder in capitals, in their own case, and nothing apart; ESLint on its files fails on b.ts
# alone. TypeScript's references count as imports: an ambient module of a .d.ts, an augmentation, a JSON file. A file in no program (a
# stylesheet) is named itself; a path is quoted for the shell, one gone is left out. A change of the global scope, wherever it comes in
# the list, a graph it cannot read, or none, is the whole repository (`.`). Its folder is read as TypeScript wrote it, through a link.
ls_="$t/lint_scope" && mkdir -p "$ls_/src/Deep" "$ls_/other" "$ls_/cache"
nodebin="${NVM_DIR:-$HOME/.nvm}/versions/node/v$(cat "$here/../.node-version")/bin"
modules=$(cd "$here/../node_modules" && pwd -P)
cat >"$ls_/tsconfig.json" <<'JSON'
{ "compilerOptions": { "strict": true, "target": "es2024", "lib": ["es2024"], "module": "nodenext", "noEmit": true, "allowImportingTsExtensions": true, "resolveJsonModule": true, "types": [] }, "include": ["src"] }
JSON
printf '{ "extends": "../tsconfig.json", "include": ["."] }\n' >"$ls_/other/tsconfig.json"
# The type check names its files, as package.json's typecheck does: the graph is theirs alone (lot 1's review, R2).
printf '{ "type": "module", "scripts": { "typecheck": "tsc -p tsconfig.json --incremental --tsBuildInfoFile \\"${TSC_CACHE:-.claude/tmp/tsc}/root.tsbuildinfo\\" && tsc -p other/tsconfig.json --incremental --tsBuildInfoFile \\"${TSC_CACHE:-.claude/tmp/tsc}/other.tsbuildinfo\\"" } }\n' >"$ls_/package.json"
printf 'import tseslint from "%s/typescript-eslint/dist/index.js";\nexport default [{ files: ["**/*.ts"], languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } }, plugins: { "@typescript-eslint": tseslint.plugin }, rules: { "@typescript-eslint/no-floating-promises": "error" } }];\n' "$modules" >"$ls_/eslint.config.mjs"
printf 'export interface Shape {\n  x: number;\n}\nexport function later(): void {}\n' >"$ls_/src/a.ts"
printf 'import { later } from "./a.ts";\nexport function run(): void {\n  later();\n}\n' >"$ls_/src/b.ts"
printf 'import { run } from "./b.ts";\nexport const user = run;\n' >"$ls_/src/user.ts"
printf 'import { user } from "./user.ts";\nexport const deep = user;\n' >"$ls_/src/deep.ts"
printf 'import { later } from "./a.ts";\nexport const uses = later;\n' >"$ls_/src/Uses.ts"
printf 'import { later } from "../a.ts";\nexport const importer = later;\n' >"$ls_/src/Deep/Importer.ts"
printf 'import { later } from "../src/a.ts";\nexport const other = later;\n' >"$ls_/other/o.ts"
printf 'export const apart = 1;\n' >"$ls_/src/apart.ts"
printf 'import { two } from "./c2.ts";\nexport const one = (): number => two();\n' >"$ls_/src/c1.ts"
printf 'import { one } from "./c1.ts";\nexport const two = (): number => one();\n' >"$ls_/src/c2.ts"
printf 'declare module "virtual:planted" {\n  export const planted: number;\n}\n' >"$ls_/src/amb.d.ts"
printf 'import { planted } from "virtual:planted";\nexport const seen = planted;\n' >"$ls_/src/v.ts"
printf 'import type { Shape } from "./a.ts";\ndeclare module "./a.ts" {\n  interface Shape {\n    extra?: number;\n  }\n}\nexport type Augmented = Shape;\n' >"$ls_/src/aug.ts"
printf '{ "n": 1 }\n' >"$ls_/src/data.json" && printf 'import data from "./data.json" with { type: "json" };\nexport const n = data.n;\n' >"$ls_/src/j.ts"
printf 'declare global {\n  interface Planted {\n    x: number;\n  }\n}\nexport {};\n' >"$ls_/src/global.ts"
for odd in 'with space' "it's" 'a$(touch pwned)'; do printf 'export const odd = 1;\n' >"$ls_/src/$odd.ts"; done
printf 'a {\n  color: red;\n}\n' >"$ls_/src/style.css"
types() { # $1: the folder of the buildinfo files, as tsc is told it
	for project in root:tsconfig.json other:other/tsconfig.json; do
		(cd "$ls_" && PATH="$nodebin:$PATH" node "$modules/typescript/bin/tsc" -p "${project#*:}" --incremental --tsBuildInfoFile "${1:-cache}/${project%%:*}.tsbuildinfo") || fail "tsc failed on lint_scope's fixture ($project)"
	done
}
lint() { (cd "$ls_" && PATH="$nodebin:$PATH" node "$modules/eslint/bin/eslint.js" --max-warnings 0 --no-warn-ignored "$@") >"$t/lint_scope.out" 2>&1; }
scope() { printf '%s\n' "$@" | (cd "$ls_" && python3 -I "$here/lint_scope.py" "${SCOPE_IN:-cache}"); }
names() { # $1: the scope; then the files it must name, "-", the files it must not
	words=$(eval "printf '%s\n' $1")
	shift
	must=true
	for f in "$@"; do
		if [ "$f" = - ]; then must=false; elif $must; then printf '%s\n' "$words" | grep -qxF "$f" || fail "lint_scope.py did not name $f: $words"; else printf '%s\n' "$words" | grep -qxF "$f" && fail "lint_scope.py named $f: $words"; fi
	done
	:
}
types && lint src/b.ts || fail "ESLint failed on lint_scope's fixture before the change: $(cat "$t/lint_scope.out")"
printf 'export interface Shape {\n  x: number;\n}\nexport async function later(): Promise<void> {}\n' >"$ls_/src/a.ts" && types
s=$(scope src/a.ts)
names "$s" src/a.ts src/b.ts src/user.ts src/deep.ts src/Uses.ts src/Deep/Importer.ts other/o.ts - src/apart.ts src/c1.ts src/j.ts src/v.ts src/global.ts
lint src/a.ts || fail "ESLint failed on a.ts alone, which is sound: $(cat "$t/lint_scope.out")"
eval "set -- $s" && lint "$@" && fail "ESLint passed on the files lint_scope.py named, with b.ts's promise floating: $(cat "$t/lint_scope.out")"
grep -q "no-floating-promises" "$t/lint_scope.out" && grep -q "src/b.ts" "$t/lint_scope.out" || fail "ESLint did not fail b.ts on its floating promise: $(cat "$t/lint_scope.out")"
names "$(scope src/amb.d.ts)" src/v.ts - src/apart.ts
names "$(scope src/aug.ts)" src/b.ts - src/apart.ts
names "$(scope src/data.json)" src/j.ts - src/apart.ts
names "$(scope src/c1.ts)" src/c1.ts src/c2.ts - src/apart.ts
[ "$(scope src/style.css)" = src/style.css ] || fail "lint_scope.py did not name a changed file of no program: $(scope src/style.css)"
eval "set -- $(scope 'src/with space.ts' "src/it's.ts" 'src/a$(touch pwned).ts' src/gone.ts)"
[ "$*" = 'src/a$(touch pwned).ts src/it'"'"'s.ts src/with space.ts' ] && [ $# = 3 ] || fail "lint_scope.py did not quote each path whole, or named one that is gone: $#: $*"
[ ! -e "$ls_/pwned" ] && [ ! -e "$t/pwned" ] || fail "lint_scope.py's answer ran a command a file's name held"
[ -z "$(scope src/gone.ts)" ] || fail "lint_scope.py named a file that is gone: $(scope src/gone.ts)"
for list in src/global.ts "src/a.ts src/global.ts"; do
	[ "$(scope $list)" = . ] || fail "lint_scope.py did not lint the whole repository for a change of the global scope in '$list': $(scope $list)"
done
# The folder as tsc was told it, here through a link at another depth of the same tree (spelled physically: through /tmp, the names climb
# to the root and any reading lands): the names are relative to it, never to where it leads.
phys=$(cd "$t" && pwd -P) && mkdir -p "$phys/at/another" && ln -s "$phys/lint_scope/cache" "$phys/at/another/cache" && types "$phys/at/another/cache"
names "$(SCOPE_IN="$phys/at/another/cache" scope src/a.ts)" src/b.ts src/deep.ts other/o.ts
# A graph it cannot read, or none, is the whole repository: never fewer files, one bad among good ones too.
good=$(cat "$ls_/cache/root.tsbuildinfo")
for bad in 'not json' '[]' '{"fileNames": 1}' '{"fileNames": ["../src/a.ts"], "fileInfos": ["x"], "referencedMap": [[0, 1]], "fileIdsList": [[1]]}' '{"fileNames": ["../src/a.ts"], "fileInfos": ["x"], "referencedMap": [[1, 9]], "fileIdsList": [[1]]}' '{"fileNames": ["../src/a.ts"], "fileInfos": ["x"], "referencedMap": [[1, 1]], "fileIdsList": [[7]]}' '{"fileNames": ["../src/a.ts"], "fileInfos": [7]}'; do
	printf '%s' "$bad" >"$ls_/cache/root.tsbuildinfo"
	[ "$(scope src/a.ts 2>/dev/null)" = . ] || fail "lint_scope.py read a graph that is not one ($bad): $(scope src/a.ts 2>&1)"
done
rm "$ls_/cache/root.tsbuildinfo" "$ls_/cache/other.tsbuildinfo" && [ "$(scope src/a.ts 2>/dev/null)" = . ] || fail "lint_scope.py read no graph as an empty one: $(scope src/a.ts 2>&1)"
printf '%s' "$good" >"$ls_/cache/root.tsbuildinfo"
# Only the files package.json's typecheck names: one of them missing is the whole repository, a file of no name it gives (left by a hand
# run, never refreshed) is never read, and a typecheck that names none is the whole repository.
[ "$(scope src/a.ts 2>/dev/null)" = . ] || fail "lint_scope.py read a graph with one of the type check's files missing: $(scope src/a.ts 2>&1)"
types && printf '{"fileNames": ["../src/apart.ts", "../src/a.ts"], "fileInfos": ["x", "y"], "referencedMap": [[1, 1]], "fileIdsList": [[2]]}' >"$ls_/cache/stale.tsbuildinfo"
names "$(scope src/a.ts)" src/b.ts - src/apart.ts
cp "$ls_/package.json" "$t/lint_scope.package" && printf '{ "scripts": { "typecheck": "tsc -p tsconfig.json" } }\n' >"$ls_/package.json"
[ "$(scope src/a.ts 2>/dev/null)" = . ] || fail "lint_scope.py read a graph the type check names no file of: $(scope src/a.ts 2>&1)"
cp "$t/lint_scope.package" "$ls_/package.json"
fi

# Vitest does not bench what a StrykerJS sandbox holds: on a copy of the config, a bench in .stryker-tmp is not measured. Only a
# bench is reachable: the projects' includes (`app/src/**`, `packages/*/src/**`, `server/src/**`) are anchored at the root and
# match nothing under .stryker-tmp, with or without the exclusion (a `vitest list` check passed with it removed); BENCHES is a
# `**` glob, which does.
if part vitest_stryker; then
vt="$t/vt"
mkdir -p "$vt/lint" "$vt/app/tests/bench" "$vt/.stryker-tmp/sandbox-1/app/tests/bench" "$vt/.stryker-tmp/sandbox-1/app/src"
cp "$here/../vitest.config.ts" "$here/../.node-version" "$vt/" && cp "$here/../lint/shared.config.ts" "$vt/lint/" && cp "$here/../app/vitest.compiled.config.ts" "$vt/app/"
ln -s "$here/../node_modules" "$vt/node_modules" && ln -s "$here/../app/node_modules" "$vt/app/node_modules"
printf 'import { bench } from "vitest";\nbench("kept [1000 ms]", () => {});\n' >"$vt/app/tests/bench/ok.bench.ts"
printf 'import { bench } from "vitest";\nbench("stale [1000 ms]", () => {});\n' >"$vt/.stryker-tmp/sandbox-1/app/tests/bench/x.bench.ts"
printf 'import { test, expect } from "vitest";\ntest("stale", () => { expect(1).toBe(1); });\n' >"$vt/.stryker-tmp/sandbox-1/app/src/stale.test.ts"
nodebin="${NVM_DIR:-$HOME/.nvm}/versions/node/v$(cat "$here/../.node-version")/bin"
(cd "$vt" && PATH="$nodebin:$PATH" node node_modules/vitest/vitest.mjs bench --run --project node --outputJson "$vt/bench.json") >"$vt/bench.out" 2>&1 || fail "vitest bench failed on the copy of the config: $(tail -5 "$vt/bench.out")"
grep -q "kept" "$vt/bench.json" || fail "vitest bench did not measure the bench beside the config: $(tail -5 "$vt/bench.out")"
grep -q "stale" "$vt/bench.json" && fail "vitest bench measured a bench a StrykerJS sandbox left in .stryker-tmp (5n: Cmd-K at 27 to 41 ms instead of 2 to 4)"
:
fi

# F2414: the staged copy's lint once reported "14683 problems" and passed on retry; its first output was not kept. The one
# cause found by reading: borrow_node_modules.sh copies every node_modules folder it finds, those of a StrykerJS sandbox
# in .stryker-tmp too. This is hygiene, NOT the cause's proof: planted in such a copy, a sandbox's node_modules did not make
# `eslint --max-warnings 0 .` report anything (eslint.config.ts includes .gitignore, which names .stryker-tmp/). The ledger
# row stays `asked`; no test here reproduces "14683 problems".
if part borrow; then
b="$t/borrow" && mkdir -p "$b/src/node_modules/pkg" "$b/src/app/node_modules/@x" "$b/src/.stryker-tmp/sandbox-1/node_modules/pkg" "$b/src/.stryker-tmp/sandbox-1/app/node_modules/@x" "$b/copy"
printf 'x\n' >"$b/src/node_modules/pkg/i.js" && printf 'x\n' >"$b/src/.stryker-tmp/sandbox-1/node_modules/pkg/i.js"
(cd "$b/src" && sh "$here/borrow_node_modules.sh" "$b/copy") || fail "borrow_node_modules.sh failed"
[ -e "$b/copy/node_modules/pkg/i.js" ] && [ -d "$b/copy/app/node_modules" ] || fail "borrow_node_modules.sh did not borrow the packages"
[ ! -e "$b/copy/.stryker-tmp" ] || fail "borrow_node_modules.sh copied a StrykerJS sandbox into the staged copy (F2414): $(find "$b/copy/.stryker-tmp" -maxdepth 2 | head -5)"
fi

# The heavy sections are split (the brief, item 5): a change of harness_mutate.py rejudges its ~90 own mutants, each running
# its sections; one of 400 lines made each run the whole. No section of these two families is past 150 lines, each family
# holds more than one, and harness_mutate.py's SECTIONS (read as the data it is, not as text) names every section of this
# file for the guard files that matter to it: a mention in a comment proves nothing. A file lists a proper part of a split family
# unless it guards the whole of it, which `whole` lists.
if part sections_split; then
sizes=$(awk '/^if part /{n=$3; sub(/;$/, "", n); c=0} n!=""{c++} /^fi$/ && n!=""{print n, c; n=""}' "$here/test_hooks.sh")
for family in gate_full harness_shards; do
	names=$(printf '%s\n' "$sizes" | awk -v f="$family" 'index($1, f) == 1 {print $1}')
	[ "$(printf '%s\n' "$names" | grep -c .)" -ge 2 ] || fail "test_hooks.sh holds $(printf '%s\n' "$names" | grep -c .) section of $family: split it, so a mutant reruns its own case"
	printf '%s\n' "$sizes" | awk -v f="$family" 'index($1, f) == 1 && $2 > 150 {print $1, $2}' | grep . && fail "a section of $family is past 150 lines: split it"
done
printf '%s\n' "$sizes" | python3 -I -c '
import ast, re, sys
sizes = [line.split()[0] for line in sys.stdin.read().splitlines() if line]
src = open(sys.argv[1]).read()
tree = ast.parse(src)
table = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(getattr(t, "id", "") == "SECTIONS" for t in n.targets))
listed = {}  # file -> the hooks sections it names
for path, only in table.items():
    names = only.get("hooks", "") if isinstance(only, dict) else only
    listed[path] = set(names.split(",")) - {""}
problems = []
# What must guard what: the new guards, by file.
need = {
    "scripts/check.sh": {"gate_journeys", "gate_checks", "gate_stryker"},
    ".githooks/pre-commit": {"gate_checks"},
    "scripts/borrow_node_modules.sh": {"borrow"},
    "vitest.config.ts": {"vitest_stryker"},
}
for path, sections in need.items():
    missing = sections - listed.get(path, set())
    if missing:
        problems.append(path + " is not mapped to " + ",".join(sorted(missing)) + ": removing its guard would run no test that sees it")
whole = {"harness_shards": {"scripts/harness_mutate.py", "scripts/repo_files.py", "scripts/suite_parts.py", "scripts/test_hooks.sh"}, "gate_full": {"scripts/check.sh", "scripts/test_hooks.sh"}}
for family, owners in whole.items():
    members = {s for s in sizes if s.startswith(family)}
    if not any(members & l for l in listed.values()):
        problems.append(f"no file is mapped to any section of {family}")
    for path, l in listed.items():
        if members <= l and path not in owners:
            problems.append(f"{path} is mapped to every section of {family}: its mutants rerun them all; name the ones that see it")
    for path in owners - {"scripts/test_hooks.sh"}:
        if path in listed and not members & listed[path]:
            problems.append(f"{path} names no section of {family}")
    # The file the family tests whole names every section of it.
    main = "scripts/harness_mutate.py" if family == "harness_shards" else "scripts/check.sh"
    if members - listed.get(main, set()):
        problems.append(main + " is not mapped to " + ",".join(sorted(members - listed.get(main, set()))))
for s in sizes:
    if s != "sections_split" and not any(s in l for l in listed.values()):
        problems.append(f"no guard file is mapped to the section {s}: a mutant would never rerun it")
if problems:
    sys.exit("harness_mutate.py SECTIONS: " + "; ".join(problems))
' "$here/harness_mutate.py" || fail "harness_mutate.py's SECTIONS do not name the sections that see its guards"
:
fi

if part guard; then
# guard: no git hook skipped, no forced push, gno only through gnomcp. Exit 2 blocks the call.
gd="$here"/guard.py
printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{}}]}}\n' >"$t/plain.jsonl"
printf '{"type":"assistant","message":{"content":[{"type":"text","text":"I will call mcp__gnomcp__gno_read"}]}}\n' >"$t/says.jsonl"
printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__gnomcp__gno_packages","input":{}}]}}\n' >"$t/asked.jsonl"
printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__plugin_gnomcp_gnomcp__gno_read","input":{}}]}}\n' >"$t/plugin.jsonl"
skill='{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"gnomcp:gno-build"}}]}}'
{ cat "$t/asked.jsonl" && printf '%s\n' "$skill"; } >"$t/skilled.jsonl"
{ cat "$t/plugin.jsonl" && printf '%s\n' "$skill"; } >"$t/plugin_skilled.jsonl"
guarded() { # $1: the event as JSON, $2: the exit code expected, $3: what it is
	code=0
	printf '%s' "$1" | python3 -I "$gd" >/dev/null 2>&1 || code=$?
	[ "$code" = "$2" ] || fail "guard gave $code, not $2, for $3"
}
sh_() { # $1: a shell command, $2: the exit code expected, $3: the transcript (default: no gnomcp call)
	guarded "$(python3 -I -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]},"transcript_path":sys.argv[2]}))' "$1" "${3:-$t/plain.jsonl}")" "$2" "Bash: $1"
}
tool_() { # $1: the tool, $2: its input as JSON, $3: the transcript, $4: the exit code expected
	guarded "{\"tool_name\":\"$1\",\"tool_input\":$2,\"transcript_path\":\"$3\"}" "$4" "$1 $2 with $(basename "$3")"
}
sh_ "git commit --no-verify -m x" 2
sh_ "git commit -nm x" 2
sh_ "git -c core.hooksPath=/dev/null commit -m x" 2
sh_ "git merge --no-verify main" 2
sh_ "cd r && git commit -n -m x" 2
sh_ "sh -c 'git commit --no-verify -m x'" 2
sh_ "/usr/bin/git -C . commit -n -m x" 2
sh_ "git commit -m 'fix -n handling'" 0
sh_ "git commit -m x && git log -n 5" 0
sh_ "git merge -n main" 0
sh_ "git commit --amend -m x" 0
sh_ "git push --force origin slice-1a" 2
sh_ "git push -f origin slice-1a" 2
sh_ "git push --force-with-lease origin slice-1a" 2
sh_ "git push origin +slice-1a" 2
sh_ "git push origin +HEAD:main" 2
sh_ "git push --mirror origin" 2
sh_ "git push origin slice-1a" 0
sh_ "gnokey maketx call -pkgpath gno.land/r/x" 2
sh_ "cd gno && gnokey list" 2
sh_ "/usr/local/bin/gnokey list" 2
sh_ '"$GNO_TOOLCHAIN/gnokey" list' 2
sh_ "sh -c 'gnokey list'" 2
sh_ "grep -rn gnokey docs" 2 # 7w2's third lot: gnokey is refused at any word, failing closed; the Grep tool reads it
sh_ "git commit -m 'docs: never call gnokey'" 0
sh_ "curl -s https://rpc.gno.land:443/status" 2
sh_ "curl -s HTTPS://GNO.LAND/r/gnoland/home" 2
sh_ "rg 'https://rpc.gno.land' docs" 0
sh_ "cd gno && gno test ./r/..." 0
sh_ "cat > gno/r/slot/slot.gno <<EOF
package slot
EOF" 2
sh_ "cat > gno/r/slot/slot.gno <<EOF
package slot
EOF" 2 "$t/asked.jsonl"
sh_ "cat > gno/r/slot/slot.gno <<EOF
package slot
EOF" 0 "$t/skilled.jsonl"
sh_ "sed -i '' s/a/b/ gno/r/seal/seal.gno" 2
sh_ "cp /tmp/x.gno gno/r/seal/seal.gno" 2
sh_ "cat gno/r/seal/seal.gno" 0
tool_ Write '{"file_path":"/x/gno/r/slot/slot.gno"}' "$t/plain.jsonl" 2
tool_ Write '{"file_path":"/x/gno/r/slot/slot.gno"}' "$t/says.jsonl" 2
tool_ Edit '{"file_path":"/x/gno/p/util/util.gno"}' "$t/asked.jsonl" 2
tool_ Edit '{"file_path":"/x/gno/p/util/util.gno"}' "$t/skilled.jsonl" 0
tool_ Edit '{"file_path":"/x/gno/p/util/util.gno"}' "$t/plugin_skilled.jsonl" 0
tool_ Write '{"file_path":"/x/packages/core/src/a.ts"}' "$t/plain.jsonl" 0
tool_ WebFetch '{"url":"https://gno.land/r/gnoland/home"}' "$t/asked.jsonl" 2
tool_ WebFetch '{"url":"https://GNO.LAND/r/gnoland/home"}' "$t/asked.jsonl" 2
tool_ WebFetch '{"url":"https://rpc.onyx.testnets.gno.land/status"}' "$t/asked.jsonl" 2
tool_ WebFetch '{"url":"https://docs.gno.land/resources/gno-interrealm"}' "$t/plain.jsonl" 0
guarded 'not json' 2 "unreadable input"
guarded '{"tool_name":"Bash","tool_input":null}' 2 "a null tool_input"
# What a wrapper, an abbreviation or an environment variable used to slip past.
sh_ "git commit --no-veri -m x" 2
sh_ "HUSKY=0 git commit --no-verify -m x" 2
sh_ "git -c core.hookspath=/dev/null commit -m x" 2
sh_ "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x" 2
sh_ "env git commit --no-verify -m x" 2
sh_ "env -i PATH=/usr/bin git commit -n -m x" 2
sh_ "eval 'git commit --no-verify -m x'" 2
sh_ "echo x | xargs git commit --no-verify -m" 2
sh_ "nohup git commit -n -m x" 2
sh_ "timeout 60 git commit -n -m x" 2
sh_ "command git commit -n -m x" 2
sh_ 'echo $(gnokey list)' 2
sh_ 'echo `gnokey list`' 2
sh_ "git commit-tree HEAD^{tree} -m x" 2
sh_ "python3 -c \"open('gno/r/x/x.gno','w').write('package x')\"" 2
sh_ "node -e \"require('fs').writeFileSync('x.gno', '')\"" 2
sh_ "node -e \"require('fs').writeFileSync(process.argv[1], '')\" x.gno" 2
sh_ "node -e \"require('net').connect(6667, 'irc.gnoworld.test')\"" 0
sh_ "node -e \"require('net').connect(6667, 'irc.gnoworld.test'); require('fs').writeFileSync('x.gno', '')\"" 2
sh_ "python3 -c \"open('x.gno.bak','w')\"" 2
sh_ "python3 -c \"open('x.gno_bak','w')\"" 0
sh_ "python3 -c \"open('gno/r/x/x.gno','w').write('package x')\"" 0 "$t/skilled.jsonl"
sh_ "git commit -m 'note: --no-verify is refused'" 0
sh_ "GIT_PAGER=cat git log -n 3" 0
sh_ "python3 -I scripts/probe.py" 0
# Ordinary multi-line shell, which an agent writes without meaning to evade (findings F032, F036).
sh_ "git commit -m x \\
  --no-verify" 2
sh_ "git push origin main \\
  --force" 2
sh_ "git commit -m y --no-ver\\
ify" 2
sh_ "(git commit --no-verify -m y)" 2
sh_ "{ git commit --no-verify -m y; }" 2
sh_ "! git commit --no-verify -m y" 2
sh_ "if true; then git commit --no-verify -m y; fi" 2
sh_ 'bash -lc "git commit --no-verify -m y"' 2
sh_ "sudo git commit --no-verify -m y" 2
sh_ "(git push --force origin main)" 2
sh_ 'git commit -m "does -n; whatever"' 0
sh_ 'git commit -m "feat(core): a (b) {c}"' 0
sh_ "git log --oneline -n 3 2>&1 | head" 0
# An alias can carry any flag past the checks; send-pack pushes with no pre-push (finding F042).
sh_ "git -c alias.ci='commit --no-verify' ci -m x" 2
sh_ "git -c alias.p='push --force' p origin HEAD:main" 2
sh_ "git config alias.c 'commit -n'" 2
sh_ "git config --global alias.c 'commit -n'" 2
sh_ "git send-pack https://github.com/x/y.git HEAD:refs/heads/x" 2
sh_ "git http-push https://example.org/y.git main" 2
sh_ "git config --get user.name" 0
# git's own folders, never a command's (7y's lot 1, S5; F4924): a commit pointed at another common folder, git folder or work tree
# runs that folder's hooks, or none (GIT_COMMON_DIR=... git commit ran no hook). Given before the program, through env, exported or
# declared, inside sh -c, eval, $(...) or a function, or as git's own options: each is refused. Removing one and reading one pass.
for cmd in 'GIT_COMMON_DIR=/tmp/f git commit -m x' 'GIT_DIR=/tmp/f git commit -m x' 'GIT_WORK_TREE=/tmp/f git commit -m x' \
	'git --git-dir=/tmp/f commit -m x' 'git --git-dir /tmp/f commit -m x' 'git --work-tree=/tmp/f commit -m x' \
	'git --work-tree /tmp/f status' '/usr/bin/git -C . --git-dir=/tmp/f commit -m x' 'git -c user.name=t --work-tree=/tmp/f commit -m x' \
	'git -c core.worktree=/tmp/f commit -m x' 'git --config-env=core.worktree=HOME commit -m x' \
	'env GIT_COMMON_DIR=/tmp/f git commit -m x' 'env -i PATH=/usr/bin GIT_DIR=/tmp/f git commit -m x' \
	'timeout 60 env GIT_WORK_TREE=/tmp/f git commit -m x' "env -S 'GIT_DIR=/tmp/f git commit -m x'" \
	'export GIT_COMMON_DIR=/tmp/f; git commit -m x' 'GIT_DIR=/tmp/f; export GIT_DIR; git commit -m x' \
	'declare -x GIT_WORK_TREE=/tmp/f' 'typeset -x GIT_DIR=/tmp/f' 'readonly GIT_COMMON_DIR=/tmp/f' \
	"sh -c 'GIT_COMMON_DIR=/tmp/f git commit -m x'" "GIT_COMMON_DIR=/tmp/f sh -c 'git commit -m x'" \
	'eval "GIT_DIR=/tmp/f git commit -m x"' 'echo $(GIT_DIR=/tmp/f git rev-parse HEAD)' 'GIT_COMMON_DIR=/tmp/f sh scripts/check.sh' \
	'f() { local GIT_DIR=/tmp/f; git commit -m x; }; f' 'true;(GIT_DIR=/tmp/f git commit -m x)' \
	'GIT_DIR+=/tmp/f git commit -m x' 'export GIT_DIR+=/tmp/f' "env -S 'FOO=1 GIT_DIR=/tmp/f git commit -m x'" \
	"env -S'GIT_DIR=/tmp/f git commit -m x'" 'git --config-env core.worktree=HOME commit -m x' 'git -c Core.WorkTree=/tmp/f commit -m x'; do
	sh_ "$cmd" 2
done
for cmd in 'unset GIT_DIR GIT_COMMON_DIR GIT_WORK_TREE' 'env -u GIT_DIR -u GIT_COMMON_DIR git status' 'git rev-parse --git-dir --git-common-dir' \
	'git worktree list' 'grep -n GIT_COMMON_DIR scripts/check.sh' 'git commit -m "refuse GIT_DIR=x and --git-dir"' 'echo "$GIT_DIR"' \
	'GIT_DIRECTORY=1 git status' 'GIT_PAGER=cat GIT_INDEX_FILE=/tmp/i git status' 'git log --format=%h -- core.worktree' \
	'grep -rn GIT_COMMON_DIR= scripts' 'echo GIT_DIR=x'; do
	sh_ "$cmd" 0
done
# A global option whose argument came as the next word was taken for the subcommand (F4920): `commit -n` and a forced push passed,
# and a push got no ask. git 2.53 takes --namespace, --config-env, --attr-source and --shallow-file so, as -c and -C.
sh_ 'git --namespace x commit -n -m y' 2
sh_ 'git --config-env user.name=HOME commit -n -m y' 2
sh_ 'git --attr-source HEAD commit -n -m y' 2
sh_ 'git --shallow-file /tmp/f commit -n -m y' 2
sh_ 'git --namespace x push --force origin main' 2
sh_ 'git --namespace=x commit -m y' 0
# A function's body, a subshell or a process written against its separator, an env -S line and a `+=` before the program are commands
# like any other (F4922, F4924): each hid every call in it from the checks.
sh_ 'f() { git commit --no-verify -m x; }; f' 2
sh_ 'f(){ git push --force origin main; }; f' 2
sh_ 'function f { git commit -n -m x; }; f' 2
sh_ 'f()(git commit -n -m x); f' 2
sh_ 'true;(git commit -n -m x)' 2
sh_ 'a&&(git push --force origin main)' 2
sh_ 'false||(git commit --no-verify -m x)' 2
sh_ 'true;(gnokey list)' 2
sh_ 'cat <(git commit -n -m x)' 2
sh_ 'tee >(git commit -n -m x)' 2
sh_ "env -S 'git commit --no-verify -m x'" 2
sh_ "env -u HOME -S 'git commit -n -m x'" 2
sh_ "env --split-string='git commit -n -m x'" 2
sh_ 'X+=1 git commit --no-verify -m x' 2
# Read so, a clobbering >| stays one redirection, and -S among env's short options is still -S (7w2's review, S8, S9); a config file
# included sets hooksPath as -c would (S10).
sh_ 'git commit >|/dev/null -n -m x' 2
sh_ 'git push >|/tmp/log --force origin main' 2
sh_ "env -iS 'git commit --no-verify -m x'" 2
sh_ "env -vS'git commit -n -m x'" 2
sh_ 'git -c include.path=/tmp/x.cfg commit -m x' 2
sh_ 'git -c includeIf.gitdir:/tmp/.path=/tmp/x.cfg commit -m x' 2
sh_ 'git --config-env include.path=HOME commit -m x' 2
sh_ "env --split-string 'git commit -n -m x'" 2
sh_ "env -S 'FOO=1 GIT_CONFIG_COUNT=1 git commit -m x'" 2
# A mark in quotes is a word, never a separator (7w2's review, R1): `-m '{' -n` and `-m ';' -n` split the commit in two, its -n unread.
for cmd in "git commit -m '{' -n" "git commit -m '<(' -n" "git commit -m x ';(' -n" "git commit -m '(' -n" "git commit -m ';' -n" \
	"git commit -m '&&' --no-verify" 'git commit -m "|" --no-verify' 'git commit -m \; -n'; do
	sh_ "$cmd" 2
done
sh_ "git commit -m 'a; b (c) {d} <e> && f'" 0
sh_ "echo '\\;' \"a|b\" && git status" 0
# 7w2's second lot: `{` opens a command only where one starts (S2-1); -S among env's options that take no argument alone (S2-2); a `#`
# inside a word (S2-5); a substitution used as an argument, nested too, closed or not (S2-6); a newline in quotes (S2-7), a heredoc's
# body read line by line; env -S's escapes and variables (S2-8); $'...' (S2-11).
for cmd in 'git commit -m { -n' 'git commit -m x { -n' 'git commit -m { --no-verify' 'env -uSHELL git commit -n -m x' \
	'env -CSdir git commit -n -m x' 'echo a#; git commit -n -m x' 'git commit -m x#y -n' 'git commit -F <(echo x) -n' \
	'git commit -m $(echo x) -n' 'git commit -m "$(echo x)" -n' 'echo $(echo $(git commit -n -m x))' 'cat <(cat <(gnokey list))' \
	'cat <(git commit -n -m x' 'tee >(git commit -n -m x' "env -S'git\\_commit\\_-n'" "env -S 'git commit \$X'" \
	"git commit -m \$'\\';' -n" 'git commit -m "a

b" --no-verify' "git commit -m 'a
b' -n" "cat <<EOF
it's fine
EOF
git commit --no-verify -m x" "cat <<EOF
it's
\$(git commit -n -m x)
EOF" "cat <<EOF
it's
EOF
git commit -m \"a
b\" --no-verify"; do
	sh_ "$cmd" 2
done
for cmd in "cat <<EOF
it's fine
EOF
git status" "git log --format='%h #1'" 'echo "$(git rev-parse HEAD)"' 'echo x # a comment' '{ git status; }' \
	'function f { git status; }; f' 'find . -name x -exec echo {} +' "git commit -m 'subject

body'" "echo '\$((1+2))' && git status"; do
	sh_ "$cmd" 0
done
# 7w2's third lot: git is read wherever it stands, not only first (S3-1: a wrapper the guard does not know ran it; S3-2: git-core's
# dashed programs, `git-push`), so the guard fails closed: `echo git commit -n` is refused and `echo git push` asks. Each form the
# lot found, then one of each class it did not list, so the next form of a class fails a case.
for cmd in 'exec -a x git push --force origin main' 'repeat 1 { git push --force origin main; }' 'nocorrect git commit -n -m y' \
	'stdbuf -o L git commit -n -m y' 'echo | xargs -E eof git commit -n -m y' 'xargs -J % git commit -n -m y' 'arch -arm64 git commit -n -m y' \
	'script -q /dev/null git commit -n -m y' 'coproc git commit -n -m y' '{ true; } always { git commit -n -m y; }' \
	'if [[ -n x ]] { git commit -n -m y; }' '/opt/homebrew/opt/git/libexec/git-core/git-push --force origin main' \
	'/opt/homebrew/opt/git/libexec/git-core/git-commit -n -m y' '/opt/homebrew/opt/git/libexec/git-core/git-commit-tree HEAD^{tree} -m y' \
	'git remote-https origin https://github.com/a/b' 'git subtree push --force --prefix=app origin main' \
	'some-new-wrapper --flag git commit -n -m y' 'nice -n 5 caffeinate git push --force origin main' 'git-merge --no-verify x' \
	'/usr/libexec/git-core/git-am --no-verify' 'git remote-ext x y' 'echo git commit -n -m y'; do
	sh_ "$cmd" 2
done
sh_ 'git remote -v' 0
sh_ 'ls /opt/homebrew/opt/git/libexec/git-core' 0
# A heredoc's mark in quotes is no heredoc, and a here-string is none (S3-3); backticks and ${...} hold their separators (S3-4); the
# shells the guard did not read, -c anywhere among a shell's options, a shell or source reading a pipe, a here-string or a process
# (S3-5); zsh's glob qualifiers, which run code (S3-6). Each form, then one of each class unlisted.
for cmd in 'git commit -m "<<E
b" --no-verify' "echo '<<E'; git commit -m \"a
b\" --no-verify" ': <<E; git commit -m "a
b" --no-verify
E' 'git commit -m `true;` -n' 'git commit -m `echo x|cat` --no-verify' 'git commit -m ${x:-a;b} -n' 'git commit -m `true
` -n' 'git push ${x:-o;} --force' 'git commit -m ${x:-$(true)} -n' "sh -x -c 'git commit -n -m y'" \
	"bash -o posix -c 'git commit -n -m y'" "bash -c -- 'git commit -n -m y'" "ksh -c 'git commit -n -m y'" "tcsh -c 'git commit -n -m y'" \
	"fish -c 'git commit -n -m y'" "csh -c 'git commit -n -m y'" "sh <<EOF
git commit -m \"a
b\" --no-verify
EOF" "cat <<EOF
it's
EOF
git commit -m \"<<E
b\" --no-verify" "echo 'git commit -n -m y' | sh" "sh <<< 'git commit -n -m y'" "source <(echo 'git commit -n -m y')" \
	'printf x | zsh' '. <(echo x)' 'bash < /tmp/f.sh' "print -l *(e:'git commit -n -m y':)" "ls **/*(.e{'true'})" 'echo *(+myfunc)'; do
	sh_ "$cmd" 2
done
# gnokey, a recursive delete of an unguarded path, curl or wget to the chain and a .gno written are read at any word too, failing
# closed as git is (the chief, 2026-11-04): each behind a wrapper the guard knows, one it does not, and a spelling of its name.
for cmd in 'caffeinate gnokey list' 'some-new-wrapper gnokey list' 'exec -a x gnokey list' '=gnokey list' "\$'gnokey' list" 'echo gnokey' \
	'caffeinate rm -r "$d"' 'some-new-wrapper find "$d" -delete' 'exec -a x rm -rf $dir/*' '=rm -r "$d"' \
	'caffeinate curl -s https://rpc.gno.land:443/status' 'some-new-wrapper wget https://gno.land/r/x' '=curl https://rpc.gno.land:443/status' \
	'caffeinate cp /tmp/x.gno gno/r/x/x.gno' "some-new-wrapper sed -i '' s/a/b/ gno/r/x/x.gno" 'exec -a x tee gno/r/x/x.gno'; do
	sh_ "$cmd" 2
done
for cmd in 'some-new-wrapper rm -r "${d:?}"' 'echo rm -f x' 'some-new-wrapper curl https://github.com' 'echo curl'; do
	sh_ "$cmd" 0
done
sh_ 'caffeinate cp /tmp/x.gno gno/r/x/x.gno' 0 "$t/skilled.jsonl"
# Every program now read at any word, these hold the split into commands to its job through what a command's start alone decides,
# a shell's -c: after a keyword, in a function's body, past a process left open, past env's -u; and sh -s, and a substitution left
# open on a heredoc's line.
for cmd in "if true; then sh -c 'gnokey list'; fi" "function f { sh -c 'gnokey list'; }; f" "cat <(sh -c 'gnokey list'" \
	"tee >(sh -c 'gnokey list'" "env -uSHELL sh -c 'gnokey list'" "sudo sh -c 'gnokey list'" 'echo x | sh -s arg' "sh <<EOF
it's
rm -r \$(
pwd)/x
EOF"; do
	sh_ "$cmd" 2
done
for cmd in 'sh scripts/check.sh' "sh -c 'git status'" 'bash -lc "git log -n 1"' 'sh <<EOF
git status
EOF' '(git status)' '( exit 0 )' 'echo ${HOME:-x}/a && git status' 'source scripts/env.sh'; do
	sh_ "$cmd" 0
done
sh_ 'f() { git status; }; f' 0
sh_ 'git status >>/tmp/log 2>&1 && ls &>/dev/null' 0
sh_ 'echo x >|/tmp/f && git status' 0
# A recursive delete takes no path from a variable that may be empty (wt-3e's folder, emptied by a find -delete
# whose variable was unset): ${name:?} stops the shell first. BSD's and GNU's options before find's paths, a
# wrapper, or a :? in a comment or another command change nothing.
for cmd in 'find $dir -delete' 'find "$dir" -type f -delete' 'find -L "${dir}/x" -delete' 'find "$dir" -exec rm -f {} +' \
	'rm -r "$dir"' 'rm -fr $dir/*' 'rm -R -- "$1"' 'rm --recursive "$(git rev-parse --show-toplevel)/x"' \
	'find "${dir:-.}" -delete' "sh -c 'rm -r \"\$d\"'" 'rm -r $(pwd)/x' 'cd x && /usr/bin/find "$TMPDIR/x" -delete' \
	'find -x "$d" -delete' 'find -E "$d" -delete' 'find -d "$d" -delete' 'find -s "$d" -delete' 'find -Ex "$d" -delete' \
	'find -f "$d" -delete' 'find -D tree "$d" -delete' 'find -O3 "$d" -delete' 'find -- "$d" -delete' \
	'rm -rf `pwd`/x' 'find "$d" -execdir rm -rf {} \;' 'find "$d" -ok rm {} \;' 'find "$d" -exec /bin/rm {} +' \
	'rm -r "$d" # ${d:?}' ': "${d:?}"; rm -r "$d"' 'sudo rm -r "$d"' 'timeout 5 rm -r "$d"' 'VAR=1 rm -r "$d"' 'sh <<EOF
rm -r $(
pwd)/x
EOF'; do
	sh_ "$cmd" 2
done
for cmd in 'find "${dir:?}" -delete' 'rm -r "${dir:?no dir}/x"' 'find . -name "$pat" -delete' 'rm -f "$file"' \
	'find "$dir" -name x -print' "rm -r 'build'" 'find "${a:?}" "${b:?}" -delete' 'rm -r -- "${a:?}" x' \
	'find "$d" -exec cat {} \;' 'rm -- -r "$d"' 'find "${d:?}" -exec rm -r {} +'; do
	sh_ "$cmd" 0
done
# A push, in any form, waits for Alexis: the guard asks, since a rule cannot see every form.
asks() { # $1: a shell command
	python3 -I -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$1" | python3 -I "$gd" 2>/dev/null | grep -q '"permissionDecision": "ask"' || fail "guard did not ask before: $1"
}
asks "git push origin slice-1a"
asks "git -C . push origin slice-1a"
asks "cd gno && git push"
asks "git -c push.default=current push"
asks "git --namespace x push origin slice-1a"
asks "git --config-env user.name=HOME push origin slice-1a"
asks "git --attr-source HEAD push origin slice-1a"
asks "git --shallow-file /tmp/f push origin slice-1a"
# Wherever git stands, a push asks (7w2's third lot, S3-1, S3-2): each form the lot found, then a wrapper nobody listed, and a mention.
for cmd in "find . -maxdepth 0 -exec git push origin main ';'" 'caffeinate git push origin main' '- git push origin main' \
	'=git push origin main' "\$'git' push origin main" 'git subtree push --prefix=app origin main' 'git-push origin main' \
	'some-new-wrapper git push origin main' 'echo git push'; do
	asks "$cmd"
done
python3 -I -c 'import json; print(json.dumps({"tool_name":"Bash","tool_input":{"command":"git status"}}))' | python3 -I "$gd" | grep -q . && fail "guard printed a decision for git status"
fi

if part prove_fix; then
# prove_fix: a product fix's tests fail on the commit before it. A fake Vitest stands in: a
# test passes when the code holds what its `// expects:` line names.
pf="$t/prove"
mkdir -p "$pf/packages/x/src" "$pf/.claude/tmp" "$pf/node_modules"
git -C "$pf" init -q
printf '#!/bin/sh\necho "$*" >>"%s/runner.log"\nfor f in "$@"; do [ -f "$f" ] || continue; grep -qF "$(sed -n "s|^// expects: ||p" "$f")" packages/x/src/a.ts || exit 1; done\n' "$t" >"$t/fake_vitest" && chmod +x "$t/fake_vitest"
printf '.claude/tmp\nnode_modules\n' >"$pf/.gitignore" && printf 'export const twice = (n: number) => n * 3;\n' >"$pf/packages/x/src/a.ts"
git -C "$pf" add -A && git -C "$pf" commit -qm "feat: twice"
prove() { (cd "$pf" && PROVE_FIX_VITEST="$t/fake_vitest" PROVE_FIX_PLAYWRIGHT="$t/fake_vitest" python3 -I "$here/prove_fix.py" "$1" >/dev/null 2>&1); }
fix() { git -C "$pf" add -A && git -C "$pf" commit -qm "$1"; }
base=$(git -C "$pf" rev-parse HEAD)
printf 'export const twice = (n: number) => n * 2;\n' >"$pf/packages/x/src/a.ts" && printf '// expects: n * 2\n' >"$pf/packages/x/src/a.test.ts"
fix "fix(x): twice doubles"
prove "$base" || fail "prove_fix refused a fix whose test failed before it"
base=$(git -C "$pf" rev-parse HEAD)
printf 'export const twice = (n: number) => 2 * n;\n' >"$pf/packages/x/src/a.ts" && printf '// expects: export\n' >"$pf/packages/x/src/b.test.ts"
fix "fix(x): a test that passed already"
prove "$base" && fail "prove_fix accepted a fix whose test passed before it"
# A later commit of the range excuses that one fix, by its short sha (cf67ea7: a CSS fix whose Vitest test, beside its journey,
# could not fail before it, and a merged message cannot change). Another sha, or no reason, excuses nothing.
bad=$(git -C "$pf" rev-parse --short=7 HEAD)
git -C "$pf" commit -q --allow-empty -m "chore: a wrong sha" -m "No-test: 0000000 - not this fix"
prove "$base" && fail "prove_fix excused a fix by a sha that is not its"
git -C "$pf" commit -q --allow-empty -m "chore: no reason" -m "No-test: $bad"
prove "$base" && fail "prove_fix excused a fix by a sha with no reason"
git -C "$pf" commit -q --allow-empty -m "chore: the excuse" -m "No-test: $bad - its journey proves it, its unit test is beside the point"
prove "$base" || fail "prove_fix refused a fix a later commit excuses by its sha"
base=$(git -C "$pf" rev-parse HEAD)
printf 'export const twice = (n: number) => n + n;\n' >"$pf/packages/x/src/a.ts"
fix "fix(x): no test"
prove "$base" && fail "prove_fix accepted a fix with no test"
git -C "$pf" commit -q --amend -m "fix(x): no test" -m "No-test: the same sum, written as an addition"
prove "$base" || fail "prove_fix refused a fix that says why it has no test"
# A fix of a harness file under a product folder (a tool's config, records.sh's list) is the harness's: harness_mutate
# proves it, prove_fix leaves it (7a0ed4d, 504ed6e: app/playwright.stories.config.ts, probed in probe.py). One that also
# changes product code still wants its test.
base=$(git -C "$pf" rev-parse HEAD) && mkdir -p "$pf/app"
printf 'export default {};\n' >"$pf/app/playwright.x.config.ts"
fix "fix(gate): a tool's config"
prove "$base" || fail "prove_fix refused a fix of a harness file under app/ with no test"
base=$(git -C "$pf" rev-parse HEAD)
printf 'export default { a: 1 };\n' >"$pf/app/playwright.x.config.ts" && printf 'export const twice = (n: number) => n * 2 - 0;\n' >"$pf/packages/x/src/a.ts"
fix "fix(x): a config and the code"
prove "$base" && fail "prove_fix accepted a fix of product code with no test because it also touched a harness file"
# A journey proves a fix as a unit test does (F126).
base=$(git -C "$pf" rev-parse HEAD) && mkdir -p "$pf/app/tests"
printf 'export const twice = (n: number) => n * 2 + 0;\n' >"$pf/packages/x/src/a.ts" && printf '// expects: + 0\n' >"$pf/app/tests/a.spec.ts"
fix "fix(x): a journey shows it"
prove "$base" || fail "prove_fix refused a fix whose journey failed before it (F126)"
base=$(git -C "$pf" rev-parse HEAD)
printf 'export const twice = (n: number) => n * 2 + 1 - 1;\n' >"$pf/packages/x/src/a.ts" && printf '// expects: export\n' >"$pf/app/tests/b.spec.ts"
fix "fix(x): a journey that passed already"
prove "$base" && fail "prove_fix accepted a fix whose journey passed before it"
# A run that finds no test passes, and a stories journey runs under the stories' config: run under
# the app's, it found no test and exited 1, which read as failing before the fix.
base=$(git -C "$pf" rev-parse HEAD) && mkdir -p "$pf/app/tests/stories" && : >"$t/runner.log"
printf 'export const twice = (n: number) => n * 2 + 2 - 2;\n' >"$pf/packages/x/src/a.ts"
printf '// expects: + 2\n' >"$pf/app/tests/stories/a.spec.ts" && printf '// expects: + 2\n' >"$pf/app/tests/c.spec.ts" && printf '// expects: + 2\n' >"$pf/packages/x/src/c.test.ts"
fix "fix(x): a story's journey, a page's and a unit test show it"
prove "$base" || fail "prove_fix refused a fix whose tests failed before it"
grep -qxF -- "--pass-with-no-tests -c app/playwright.stories.config.ts app/tests/stories/a.spec.ts" "$t/runner.log" || fail "prove_fix ran a stories journey without the stories' config, or counted no test as a failure"
grep -qxF -- "--pass-with-no-tests -c app/playwright.config.ts app/tests/c.spec.ts" "$t/runner.log" || fail "prove_fix ran a page's journey without the app's config, or counted no test as a failure"
grep -qxF -- "--passWithNoTests packages/x/src/c.test.ts" "$t/runner.log" || fail "prove_fix counted a Vitest run that found no test as a failure"
base=$(git -C "$pf" rev-parse HEAD)
mkdir -p "$pf/scripts" && echo x >"$pf/scripts/tool.py" && fix "fix(harness): a harness fix"
prove "$base" || fail "prove_fix refused a harness fix, which harness_mutate proves"
base=$(git -C "$pf" rev-parse HEAD)
printf '// expects: export\n' >"$pf/packages/x/src/d.test.ts" && fix "fix(x): a test's own fault, and no product code"
prove "$base" || fail "prove_fix refused a fix of tests alone, which changes no product code"
# The journeys' folder holds their helpers, which are tests too: a fix of them alone changes no product code.
base=$(git -C "$pf" rev-parse HEAD)
mkdir -p "$pf/app/tests/e2e" && printf 'export const lines = 1;\n' >"$pf/app/tests/e2e/chat.ts" && printf '// expects: export\n' >"$pf/app/tests/e2e/d.spec.ts"
fix "fix(app): a journey's helper and its journey, no product code"
prove "$base" || fail "prove_fix took a journeys' helper for product code"
# Deleted code is product code too: a fix that drops a module needs a test that failed, or a reason.
printf 'export const gone = 1;\n' >"$pf/packages/x/src/gone.ts" && fix "feat(x): a module to drop"
base=$(git -C "$pf" rev-parse HEAD)
git -C "$pf" rm -q packages/x/src/gone.ts && printf '// expects: export\n' >"$pf/packages/x/src/e.test.ts" && fix "fix(x): the module goes, with a test that passed already"
prove "$base" && fail "prove_fix accepted a fix that deletes code, its test passing before it"
printf 'export const gone2 = 1;\n' >"$pf/packages/x/src/gone2.ts" && fix "feat(x): another module"
base=$(git -C "$pf" rev-parse HEAD)
git -C "$pf" rm -q packages/x/src/gone2.ts && fix "fix(x): it goes, untested"
prove "$base" && fail "prove_fix accepted a fix that deletes code with no test and no reason"
# A fix that drops an old test runs only the tests it leaves.
base=$(git -C "$pf" rev-parse HEAD)
git -C "$pf" rm -q packages/x/src/e.test.ts && printf 'export const twice = (n: number) => n * 2 + 3 - 3;\n' >"$pf/packages/x/src/a.ts"
printf '// expects: + 3\n' >"$pf/packages/x/src/f.test.ts" && fix "fix(x): a new test, an old one gone"
prove "$base" || fail "prove_fix ran a test the fix deleted"
# A journey that reproduces a race fails on the parent only sometimes (ca98dda, 4e's Alt+arrows): the fix is proven
# if any of 3 runs fails, refused only when all 3 pass, and the runs stop at the first failure. A fake counts its
# runs and fails on the one named in $t/fails_on (0: never).
printf '#!/bin/sh\nn=$(($(cat "%s/count" 2>/dev/null || echo 0) + 1)); echo $n >"%s/count"\n[ "$n" = "$(cat "%s/fails_on")" ] && exit 1\nexit 0\n' "$t" "$t" "$t" >"$t/fake_flaky" && chmod +x "$t/fake_flaky"
flaky() { echo "$1" >"$t/fails_on"; rm -f "$t/count"; (cd "$pf" && PROVE_FIX_VITEST="$t/fake_flaky" python3 -I "$here/prove_fix.py" "$base" 2>&1); }
base=$(git -C "$pf" rev-parse HEAD)
printf 'export const twice = (n: number) => n * 2 + 4 - 4;\n' >"$pf/packages/x/src/a.ts" && printf '// a race\n' >"$pf/packages/x/src/race.test.ts"
fix "fix(x): a race its test shows one run in three"
out=$(flaky 3) || fail "prove_fix refused a fix whose test failed on the third run before it"
[ "$(cat "$t/count")" = 3 ] || fail "prove_fix did not run the parent's test 3 times before accepting the last"
case "$out" in *"3 runs"*) ;; *) fail "prove_fix did not say how many runs it took: $out" ;; esac
out=$(flaky 1) || fail "prove_fix refused a fix whose test failed on the first run before it"
[ "$(cat "$t/count")" = 1 ] || fail "prove_fix went on running the parent's test after it had failed"
case "$out" in *"1 run"*) ;; *) fail "prove_fix did not say its one run: $out" ;; esac
out=$(flaky 0) && fail "prove_fix accepted a fix whose test passed on all 3 runs before it"
[ "$(cat "$t/count")" = 3 ] || fail "prove_fix gave up before the third run"
case "$out" in *"3 runs"*) ;; *) fail "prove_fix did not say its refusal came after 3 runs: $out" ;; esac
# The app reads a workspace package through its node_modules' link; the parent's copy must lead it
# to the parent's package: borrowed whole, the link led to the fixed one (F344).
base=$(git -C "$pf" rev-parse HEAD) && mkdir -p "$pf/app/node_modules/@g" && ln -s ../../../packages/x "$pf/app/node_modules/@g/x"
printf '#!/bin/sh\ngrep -qF "* 4" app/node_modules/@g/x/src/a.ts\n' >"$t/fake_linked" && chmod +x "$t/fake_linked"
printf 'export const twice = (n: number) => n * 4 / 2;\n' >"$pf/packages/x/src/a.ts" && printf '// reads the package through the app\n' >"$pf/app/tests/g.spec.ts"
fix "fix(x): a journey reads the package through the app's link"
(cd "$pf" && PROVE_FIX_PLAYWRIGHT="$t/fake_linked" python3 -I "$here/prove_fix.py" "$base" >/dev/null 2>&1) || fail "prove_fix ran the parent's journey on the working tree's package, not the parent's (F344)"
fi

if part audit; then
# audit: every locked package goes to npm's advisory database, and a moderate or worse
# advisory fails. A recorded answer stands in for the network (AUDIT_ANSWER).
au="$t/audit"
mkdir -p "$au"
printf "lockfileVersion: '9.0'\n\npackages:\n\n  qs@6.15.1:\n    resolution: {}\n\n  '@scope/tool@1.2.0':\n    resolution: {}\n\nsnapshots:\n\n  '@scope/tool@1.2.0(qs@6.15.1)':\n    dependencies: {}\n" >"$au/pnpm-lock.yaml"
audit() { printf '%s' "$1" >"$au/answer.json" && (cd "$au" && AUDIT_ANSWER="$au/answer.json" python3 -I "$here/audit.py" >/dev/null 2>&1); }
audit '{}' || fail "audit refused a lockfile with no advisory"
python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d == {"qs": ["6.15.1"], "@scope/tool": ["1.2.0"]}, d' "$au/answer.json.request" || fail "audit did not ask about every locked package and version"
audit '{"qs":[{"severity":"moderate","title":"DoS","url":"u","vulnerable_versions":"<6.16.0"}]}' && fail "audit let a moderate advisory through"
audit '{"qs":[{"severity":"low","title":"minor","url":"u","vulnerable_versions":"<6.16.0"}]}' || fail "audit refused a low advisory"
audit 'not json' && fail "audit passed on an answer it could not read"
printf "lockfileVersion: '10.0'\n\npackages:\n    \"lodash@4.17.20\":\n      resolution: {}\n" >"$au/pnpm-lock.yaml"
audit '{}' && fail "audit passed on a lockfile it read no package from"
fi

if part secrets; then
# scan_secrets: a secret is found whatever the repository or the environment says to ignore.
sc="$t/secrets"
mkdir -p "$sc/scripts" && git -C "$sc" init -q && secrets_into "$sc/scripts/"
scan() { (cd "$sc" && sh scripts/scan_secrets.sh --staged >/dev/null 2>&1); }
printf 'x = 1\n' >"$sc/ok.py" && git -C "$sc" add ok.py
scan || fail "scan_secrets refused a commit with no secret"
printf 'aws = "%s"\n' "$key" >"$sc/leak.py" && git -C "$sc" add leak.py
scan && fail "scan_secrets missed a staged key"
(cd "$sc" && GITLEAKS_CONFIG_TOML='title = "empty"' sh scripts/scan_secrets.sh --staged >/dev/null 2>&1) && fail "scan_secrets obeyed GITLEAKS_CONFIG_TOML"
printf 'title = "empty"\n' >"$sc/.gitleaks.toml" && scan && fail "scan_secrets obeyed the repository's .gitleaks.toml"
rm "$sc/.gitleaks.toml"
printf 'leak.py:aws-access-token:1\n' >"$sc/.gitleaksignore" && scan && fail "scan_secrets obeyed the repository's .gitleaksignore"
rm "$sc/.gitleaksignore"
printf 'aws = "%s" # gitleaks:allow\n' "$key" >"$sc/leak.py" && git -C "$sc" add leak.py && scan && fail "scan_secrets obeyed a gitleaks:allow comment"
# The repository will be public: no home folder's path, no service of the demo's host.
git -C "$sc" rm -qf --cached leak.py
# Each form a home folder takes, whatever the case, with or without what follows (F090).
for line in 'p = "/Us''ers/alice/x"' 'p = "/ho''me/alice/x"' 'host = "N''8N"' 'p = "/Us''ers/alice"' 'cd /Us''ers/alice' \
	"p = '/ho""me/alice'" 'p = "/us''ers/alice/x"' 'p = "/Us''ers/_alice/x"' 'p = "C:\\Us''ers\\alice"' 'p = "/ho''me/runner-alice/x"' \
	'u = "file:///Us''ers/alice/x"' 'PATH=/bin:/Us''ers/alice/bin'; do # split, so this file holds none
	printf '%s\n' "$line" >"$sc/private.py" && git -C "$sc" add private.py && scan && fail "scan_secrets let through: $line"
done
# A users folder inside a path or a route is no one's home: gno's name registry, an API (F117).
for line in 'p = "/home/runner/.cache"' 'q = "~/x"' 'r = "/api/user/1"' 'import "gno.land/r/gnoland/users/v1"' \
	'r = "GET /api/users/42"' 'r = "GET /users/42"' 'r = "/users/:id"'; do
	printf '%s\n' "$line" >"$sc/private.py" && git -C "$sc" add private.py && { scan || fail "scan_secrets refused: $line"; }
done
# A secret found does not hide a private name beside it: both rule sets run, then the scan fails (F120).
printf 'aws = "%s"\n' "$key" >"$sc/leak.py" && printf 'p = "/Us''ers/alice/x"\n' >"$sc/private.py" && git -C "$sc" add leak.py private.py
both=$(cd "$sc" && sh scripts/scan_secrets.sh --staged 2>&1) && fail "scan_secrets passed a key and a home folder"
[ "$(printf '%s\n' "$both" | grep -c 'leaks found')" = 2 ] || fail "scan_secrets stopped at the first rule set that found something"
# An attribute that makes git print a file as binary hides it from gitleaks: any is refused (F130).
git -C "$sc" rm -qf --cached private.py && rm "$sc/private.py"
for where in .gitattributes sub/.gitattributes; do
	mkdir -p "$sc/sub" && printf '* -diff\n' >"$sc/$where"
	scan && fail "scan_secrets passed beside an untracked $where (F130)"
	git -C "$sc" add "$where"
	scan && fail "scan_secrets passed beside a tracked $where (F130)"
	git -C "$sc" rm -qf --cached "$where" && rm "$sc/$where"
done
info="$(git -C "$sc" rev-parse --absolute-git-dir)/info"
mkdir -p "$info" && printf '* -diff\n' >"$info/attributes"
scan && fail "scan_secrets passed beside .git/info/attributes (F130)"
git -C "$sc" rm -qf --cached leak.py && rm "$sc/leak.py" && : >"$info/attributes"
scan || fail "scan_secrets refused an empty .git/info/attributes"
# Git hands gitleaks every change as text: no NUL byte, attributes file, diff driver, external
# diff or replace ref hides a key, staged or committed, on any branch; a lawful attributes file
# stops nothing (F132, F133).
tx="$t/text"
mkdir -p "$tx/scripts" && git -C "$tx" init -q && secrets_into "$tx/scripts/"
git -C "$tx" add scripts && git -C "$tx" commit -qm base
base=$(git -C "$tx" rev-parse HEAD)
hidden() { # $1: the case, its key staged in $tx; with $2, a replace ref hides the commit
	(cd "$tx" && sh scripts/scan_secrets.sh --staged >/dev/null 2>&1) && fail "scan_secrets missed a staged key: $1 (F132)"
	git -C "$tx" commit -qm "$1"
	[ -z "${2:-}" ] || git -C "$tx" replace HEAD HEAD~1
	(cd "$tx" && sh scripts/scan_secrets.sh >/dev/null 2>&1) && fail "scan_secrets missed a committed key: $1 (F132)"
	git -C "$tx" replace -l | xargs -r git -C "$tx" replace -d >/dev/null
	git -C "$tx" reset -q --hard "$base" && git -C "$tx" clean -qfdx
	: >"$tx/.git/info/exclude" && git -C "$tx" config --unset-all diff.x.textconv || :
	git -C "$tx" config --unset-all diff.external || :
}
leak() { printf 'aws = "%s"%s\n' "$key" "${2:-}" >"$tx/$1" && git -C "$tx" add "$1"; }
printf '\000' >"$tx/x.py" && printf 'aws = "%s"\n' "$key" >>"$tx/x.py" && git -C "$tx" add x.py && hidden "a NUL byte before it"
printf '* -diff\n' >"$tx/.gitattributes" && echo .gitattributes >>"$tx/.git/info/exclude" && leak x.py && hidden "an ignored .gitattributes"
mkdir -p "$tx/sub" && printf '* -diff\n' >"$tx/sub/.GitAttributes" && leak sub/x.py && hidden "a .GitAttributes"
printf '*.py diff=x\n' >"$tx/.gitattributes" && echo .gitattributes >>"$tx/.git/info/exclude"
git -C "$tx" config diff.x.textconv "sed s/AKIA/XXXX/" && leak x.py && hidden "a diff driver's textconv"
printf '#!/bin/sh\n' >"$t/nodiff" && chmod +x "$t/nodiff" && git -C "$tx" config diff.external "$t/nodiff" && leak x.py && hidden "an external diff"
leak x.py && hidden "a replace ref" replace
leak x.py ' # gitleaks:allow' && hidden "a gitleaks:allow comment"
printf 'p = "/Us''ers/alice/x"\n' >"$tx/home.py" && git -C "$tx" add home.py && hidden "a home folder's path"
leak x.py && printf 'p = "/Us''ers/alice/x"\n' >"$tx/home.py" && git -C "$tx" add home.py && git -C "$tx" commit -qm both
[ "$(cd "$tx" && sh scripts/scan_secrets.sh 2>&1 | grep -c 'leaks found')" = 2 ] || fail "scan_secrets stopped the history scan at its first rule set (F120)"
git -C "$tx" reset -q --hard "$base"
leak x.py && git -C "$tx" commit -qm ignored
printf '%s:x.py:aws-access-token:1\n' "$(git -C "$tx" rev-parse HEAD)" >"$tx/.gitleaksignore"
(cd "$tx" && sh scripts/scan_secrets.sh >/dev/null 2>&1) && fail "scan_secrets obeyed a root .gitleaksignore in the history"
rm "$tx/.gitleaksignore" && git -C "$tx" reset -q --hard "$base"
git -C "$tx" checkout -q -b side && leak x.py && git -C "$tx" commit -qm side && git -C "$tx" checkout -q -
(cd "$tx" && sh scripts/scan_secrets.sh >/dev/null 2>&1) && fail "scan_secrets missed a key on another branch"
printf '*.png binary\n' >"$tx/.gitattributes" && git -C "$tx" add .gitattributes
(cd "$tx" && sh scripts/scan_secrets.sh --staged >/dev/null 2>&1) || fail "scan_secrets refused a lawful .gitattributes"
# Names live in text: an image whose bytes spell a host's service by chance passes the private
# rules, staged and committed; a key in a staged image is still found (F139).
git -C "$tx" reset -q --hard "$base" && git -C "$tx" branch -qD side
printf 'x %s8%s x\n' n n >"$tx/img.png" && git -C "$tx" add img.png
(cd "$tx" && sh scripts/scan_secrets.sh --staged >/dev/null 2>&1) || fail "scan_secrets read an image's bytes for a name (F139)"
git -C "$tx" commit -qm image
(cd "$tx" && sh scripts/scan_secrets.sh >/dev/null 2>&1) || fail "scan_secrets read a committed image's bytes for a name (F139)"
leak img.png # gitleaks's own rules skip images in the history; the staged scan reads them
(cd "$tx" && sh scripts/scan_secrets.sh --staged >/dev/null 2>&1) && fail "scan_secrets missed a key in a staged image (F139)"
git -C "$tx" reset -q --hard "$base"
# gitleaks scans nothing, and passes, when git cannot read: the scan fails instead (F140).
mkdir -p "$t/badgit" && printf '#!/bin/sh\ncase " $* " in *" log "*|*" diff "*) exit 128 ;; esac\nexec "%s" "$@"\n' "$(command -v git)" >"$t/badgit/git" && chmod +x "$t/badgit/git"
(cd "$tx" && PATH="$t/badgit:$PATH" sh scripts/scan_secrets.sh >/dev/null 2>&1) && fail "scan_secrets passed a history git could not read (F140)"
(cd "$tx" && PATH="$t/badgit:$PATH" sh scripts/scan_secrets.sh --staged >/dev/null 2>&1) && fail "scan_secrets passed a staged diff git could not read (F140)"
fi

if part merge_lock; then
full_fixture merge_lock
# One merge check at a time on the machine (harness-c, Alexis 2026-10-31: five merge checks side by side at a load of 25 to 40
# on 16 cores failed by load alone). `check.sh --merge` takes a lock in the tools' cache, shared by every worktree: a folder
# `merge.lock` holding `pid`, `worktree` and `since` (seconds). It WAITS for a live holder, saying which worktree holds it and since
# when, and never refuses; a holder whose pid is gone (a Ctrl+C, a crash) leaves no wait. The fast gate and --full ignore it, and
# the run's time leaves the wait out. The same run also checks nginx (scripts/check_nginx.py), after the build, in --merge alone.
lockdir="$g.home/.cache/gnoworld-tools/merge.lock"
mkdir -p "${lockdir%/*}"
hold() { # $1: the holder's pid, $2: its worktree
	rm -rf "$lockdir" && mkdir "$lockdir" && printf '%s\n' "$1" >"$lockdir/pid" && printf '%s\n' "$2" >"$lockdir/worktree" && date +%s >"$lockdir/since"
}
took() { printf '%s\n' "$1" | sed -n 's/^all checks passed in \([0-9]*\) s.*/\1/p'; }
printf 'z\n' >>"$g/server/src/a.ts" && git -C "$g" commit -qam "product code"
out=$(gate --merge) || fail "check.sh --merge failed on a copy whose every step passes, with no lock held: $out"
[ ! -e "$lockdir" ] || fail "check.sh --merge left its lock behind after a pass: $(ls "$lockdir")"
printf '%s\n' "$out" | grep -qi "waiting" && fail "check.sh --merge waited with no lock held: $out"
solo=$(took "$out")
[ -n "$solo" ] || fail "check.sh --merge printed no time: $out"
# A running merge check HOLDS the lock (a check.sh that waited for a holder but never took the lock would let a second one start beside
# it, the failure this branch ends): each step it runs sees the lock, its pid alive and one for the whole run, this worktree, a recent since.
rm -f "$log.lockpeek"
out=$(LOCKPEEK=1 gate --merge) || fail "check.sh --merge failed with its lock peeked at: $out"
[ -s "$log.lockpeek" ] || fail "no step of check.sh --merge saw a lock (it holds none while it runs)"
gp=$(cd "$g" && pwd -P)
grep -q " dead " "$log.lockpeek" && fail "a step of check.sh --merge saw a lock whose pid is not alive: $(grep ' dead ' "$log.lockpeek" | head -1)"
bad=$(grep -v " live worktree=$gp since=[0-9][0-9]*$" "$log.lockpeek" | head -1)
[ -z "$bad" ] || fail "a step of check.sh --merge saw a lock with no pid, another worktree or no since: $bad"
[ "$(sed -n 's/^[^ ]* pid=\([0-9]*\) .*/\1/p' "$log.lockpeek" | sort -u | wc -l | tr -d ' ')" = 1 ] || fail "the steps of one merge check saw different lock holders: $(cat "$log.lockpeek")"
since_seen=$(sed -n 's/.* since=\([0-9]*\)$/\1/p' "$log.lockpeek" | sort -n | tail -1)
[ "$(($(date +%s) - since_seen))" -lt 600 ] || fail "the lock's since is not the time the merge check started: $since_seen"
# nginx -t and the served build: in the merge check, after the build, when what it reads changed since the base (here nginx.conf);
# never in the fast gate.
mkdir -p "$g/deploy/web" && printf 'x\n' >"$g/deploy/web/nginx.conf" && git -C "$g" add deploy/web && git -C "$g" commit -qm "nginx"
out=$(gate --merge) || fail "check.sh --merge failed on a change of nginx's config: $out"
ran py:check_nginx || fail "check.sh --merge did not run scripts/check_nginx.py (nginx -t and the served build's policies)"
before playwright py:check_nginx || fail "check.sh --merge checked nginx before the build the journeys make"
out=$(FAIL=py:check_nginx gate --merge) && fail "check.sh --merge passed with the nginx check failing: $out"
printf '%s\n' "$out" | grep -q "^py:check_nginx failed here" || fail "check.sh --merge hid the nginx check's failure: $out"
[ ! -e "$lockdir" ] || fail "check.sh --merge left its lock behind after a failure"
gate >/dev/null || fail "check.sh failed (fast)"
ran py:check_nginx && fail "check.sh's fast gate ran the nginx check, which needs a pinned binary and a build"
# rawrun execs check.sh in the job itself, so its pid is the job's.
rawrun() { # $1: a launcher or nothing; $2: the run's tag; then check.sh's arguments (the log is not truncated: runs share it)
	launch=$1 tag=$2
	shift 2
	cd "$g" && exec env -u SANDBOX_RUNTIME GATE_LOG="$log" RUN_TAG="$tag" LOCKPEEK=1 SLOW_STEP="${SLOW:-}" GNO_TOOLCHAIN="$g/toolchain" NVM_DIR="${NVM_DIR:-$HOME/.nvm}" HOME="$g.home" PATH="$g/bin:$PATH" $launch sh scripts/check.sh "$@"
}
# Taking the lock over is the way out of check.sh's wait, so one that does not take it never ends: this run has a limit, and a
# kill reaches check.sh itself. Without it the suite hung, and that ended two full gates at harness_mutate's 600 s (2026-11-01).
limited() { # $1: what holds the lock; its status is check.sh's, its output in $t/limited.out
	rawrun "" L --merge >"$t/limited.out" 2>&1 &
	job=$!
	tries=0
	while kill -0 "$job" 2>/dev/null; do
		tries=$((tries + 1))
		[ "$tries" -lt 1200 ] || { kill "$job" 2>/dev/null; fail "check.sh --merge never ended beside $1: $(cat "$t/limited.out")"; }
		sleep 0.1
	done
	wait "$job"
}
# A holder that died: no wait, the lock taken over.
sh -c 'exit 0' & dead=$!
wait "$dead" || :
hold "$dead" "/dead/worktree"
limited "a lock whose holder died" || fail "check.sh --merge failed beside a lock whose holder died: $(cat "$t/limited.out")"
grep -qi "waiting" "$t/limited.out" && fail "check.sh --merge waited for a holder that died: $(cat "$t/limited.out")"
[ ! -e "$lockdir" ] || fail "check.sh --merge kept a dead holder's lock"
# A folder with no pid (a run killed between making it and writing the pid) is nobody's: the next merge check takes it, after a short wait.
mkdir -p "$lockdir"
: >"$lockdir/pid"
limited "a lock folder with no pid" || fail "check.sh --merge failed beside a lock folder with no pid: $(cat "$t/limited.out")"
[ ! -e "$lockdir" ] || fail "check.sh --merge kept a pid-less lock"
# A holder another sandbox owns: a signal to it is refused (EPERM), which is a live process, not a dead one (F2616: each session runs its
# merge check in a Bash call of its own, and `kill -0` failing for either reason read the holder as dead). pid 1 is alive for every user
# and refuses the signal to any but root; the waiter must wait, say so, and leave the lock alone.
hold 1 "/other/sandbox"
# The waiter is the check.sh process itself (rawrun execs it): `gate` runs it in a subshell, whose pid a kill reaches alone, and the waiter
# lived on, took the lock the section removed next and held it through the sections after, a merge check waiting for a holder that was
# never killed (F2639: "waited for a holder killed by KILL", twice under load).
rawrun "" E --merge >"$t/eperm.out" 2>&1 &
eperm=$!
tries=0
until grep -q "/other/sandbox" "$t/eperm.out" 2>/dev/null; do
	tries=$((tries + 1))
	[ "$tries" -lt 100 ] || { kill "$eperm" 2>/dev/null; fail "check.sh --merge did not wait for a holder whose pid refuses a signal (EPERM, F2616): $(cat "$t/eperm.out")"; }
	if ! kill -0 "$eperm" 2>/dev/null; then break; fi
	sleep 0.1
done
grep -q "/other/sandbox" "$t/eperm.out" 2>/dev/null && kill -0 "$eperm" 2>/dev/null || fail "check.sh --merge took the lock of a live holder it was not allowed to signal (F2616): $(cat "$t/eperm.out")"
kill "$eperm" 2>/dev/null
wait "$eperm" 2>/dev/null && st=0 || st=$?
# check.sh answers TERM with its trap, exit 1; a subshell around it dies of the signal (143) and leaves check.sh waiting on.
[ "$st" = 1 ] || fail "the waiter that was killed ended with status $st, not check.sh's own 1: its pid is a wrapper's, and a kill leaves the waiter alive (F2639)"
[ "$(cat "$lockdir/pid" 2>/dev/null)" = 1 ] || fail "check.sh --merge dropped the lock of a holder it could not signal (F2616)"
rm -rf "${lockdir:?}"
# A live holder: the fast gate and --full go on, untouched; the lock stays the holder's.
sleep 120 & holder=$!
hold "$holder" "/other/worktree"
out=$(gate) || fail "check.sh's fast gate failed beside a held merge lock: $out"
printf '%s\n' "$out" | grep -qi "waiting" && fail "check.sh's fast gate waited for the merge lock: $out"
out=$(AUDIT_ANSWER=x gate --full) || fail "check.sh --full failed beside a held merge lock: $out"
printf '%s\n' "$out" | grep -qi "waiting" && fail "check.sh --full waited for the merge lock: $out"
[ "$(cat "$lockdir/pid" 2>/dev/null)" = "$holder" ] || fail "the fast gate or --full took or dropped the merge lock of another"
# A waiter that is interrupted (TERM, HUP, and Ctrl+C as a terminal sends it) takes nothing and drops nothing: the lock stays the
# holder's, and no step ran. A Ctrl+C reaches a background job of a script with its signal ignored, so the INT case starts through a
# launcher that restores it. rawrun execs check.sh in the job itself, so its pid is the job's.
printf 'import os, signal, sys\nsignal.signal(signal.SIGINT, signal.SIG_DFL)\nos.execvp(sys.argv[1], sys.argv[1:])\n' >"$t/unign.py"
for sig in TERM HUP INT; do
	launch=
	[ "$sig" != INT ] || launch="python3 -I $t/unign.py"
	: >"$log"
	rawrun "$launch" W --merge >"$t/w.out" 2>&1 &
	w=$!
	tries=0
	until grep -q "/other/worktree" "$t/w.out" 2>/dev/null; do
		tries=$((tries + 1))
		[ "$tries" -lt 200 ] || { kill "$w" "$holder" 2>/dev/null; fail "a merge check waiting for the lock never said so ($sig case): $(cat "$t/w.out")"; }
		sleep 0.1
	done
	kill "-$sig" "$w"
	tries=0
	while kill -0 "$w" 2>/dev/null; do
		tries=$((tries + 1))
		[ "$tries" -lt 100 ] || { kill -9 "$w" "$holder" 2>/dev/null; fail "a merge check waiting for the lock ignored $sig"; }
		sleep 0.1
	done
	wait "$w" 2>/dev/null || :
	[ "$(tail -n 1 "$t/w.out")" = "check.sh: FAILED at main:start" ] || fail "a merge check interrupted by $sig did not end on its FAILED line (F2638): $(tail -n 2 "$t/w.out")"
	[ "$(cat "$lockdir/pid" 2>/dev/null)" = "$holder" ] && [ "$(cat "$lockdir/worktree" 2>/dev/null)" = /other/worktree ] || fail "a merge check interrupted by $sig while it waited took or dropped the lock of the holder"
	[ ! -s "$log" ] || fail "a merge check interrupted by $sig while it waited ran a step: $(head -2 "$log")"
done
# --merge waits: it says which worktree holds the lock and since when, runs no step meanwhile, and starts when the holder dies;
# its time in the log and on screen leaves the wait out.
: >"$t/waiter.out"
began=$(date +%s)
gate --merge >"$t/waiter.out" 2>&1 &
waiter=$!
tries=0
until grep -q "/other/worktree" "$t/waiter.out" 2>/dev/null; do
	tries=$((tries + 1))
	[ "$tries" -lt 200 ] || { kill "$holder" "$waiter" 2>/dev/null; fail "check.sh --merge did not say which worktree holds the merge lock: $(cat "$t/waiter.out")"; }
	sleep 0.1
done
grep -qi "waiting" "$t/waiter.out" && grep -q "since" "$t/waiter.out" || { kill "$holder" "$waiter" 2>/dev/null; fail "check.sh --merge did not say it waits, and since when: $(cat "$t/waiter.out")"; }
sleep 5
kill -0 "$waiter" 2>/dev/null || { kill "$holder" 2>/dev/null; fail "check.sh --merge gave up waiting for a live holder: $(cat "$t/waiter.out")"; }
[ ! -s "$log" ] || { kill "$holder" "$waiter" 2>/dev/null; fail "check.sh --merge ran a step while another merge check held the lock: $(head -3 "$log")"; }
freed=$(date +%s)
kill "$holder"
wait "$holder" 2>/dev/null || :
tries=0
while kill -0 "$waiter" 2>/dev/null; do
	tries=$((tries + 1))
	[ "$tries" -lt 600 ] || { kill "$waiter" 2>/dev/null; fail "check.sh --merge did not start when the holder died: $(cat "$t/waiter.out")"; }
	sleep 0.1
done
wait "$waiter" || fail "check.sh --merge failed after its wait: $(cat "$t/waiter.out")"
# Measured against this run's own clock: against the first run's time, a load that slowed that run hid the 5 s (a mutant survived).
waited=$(took "$(cat "$t/waiter.out")")
[ -n "$waited" ] && [ "$waited" -le $(($(date +%s) - freed + 1)) ] || fail "check.sh --merge counted its $((freed - began)) s wait in its time: $waited s"
[ ! -e "$lockdir" ] || fail "check.sh --merge kept the lock after its pass"
# Two real merge checks side by side, one machine's cache: the second says it waits and runs no step until the first has ended.
rm -f "$log" "$log.tags" "$log.lockpeek"
: >"$log"
SLOW=py:probe rawrun "" A --merge >"$t/a.out" 2>&1 &
a=$!
tries=0
until [ "$(cat "$lockdir/pid" 2>/dev/null)" = "$a" ]; do
	tries=$((tries + 1))
	[ "$tries" -lt 200 ] || { kill "$a" 2>/dev/null; fail "a running check.sh --merge did not take the lock with its own pid: '$(cat "$lockdir/pid" 2>/dev/null)' for $a"; }
	sleep 0.1
done
rawrun "" B --merge >"$t/b.out" 2>&1 &
b=$!
wait "$a" || fail "the first of two merge checks failed: $(cat "$t/a.out")"
wait "$b" || fail "the second of two merge checks failed: $(cat "$t/b.out")"
grep -qi "waiting" "$t/b.out" && grep -q "since" "$t/b.out" || fail "the second merge check did not say it waited: $(cat "$t/b.out")"
grep -qi "waiting" "$t/a.out" && fail "the first merge check waited with no lock held: $(cat "$t/a.out")"
last_a=$(grep -n '^A ' "$log.tags" | tail -1 | cut -d: -f1)
first_b=$(grep -n '^B ' "$log.tags" | head -1 | cut -d: -f1)
[ -n "$last_a" ] && [ -n "$first_b" ] && [ "$last_a" -lt "$first_b" ] || fail "the second merge check ran a step before the first had ended: $(cut -c1-40 "$log.tags" | tr '\n' ' ')"
[ ! -e "$lockdir" ] || fail "two merge checks in turn left a lock behind"
# A holder killed (TERM: it frees the lock; KILL: it cannot, the next one finds its pid gone): the next merge check does not wait.
for sig in TERM KILL; do
	: >"$log"
	SLOW=py:probe rawrun "" H --merge >"$t/h.out" 2>&1 &
	h=$!
	tries=0
	until [ "$(cat "$lockdir/pid" 2>/dev/null)" = "$h" ]; do
		tries=$((tries + 1))
		[ "$tries" -lt 200 ] || { kill -9 "$h" 2>/dev/null; fail "a running check.sh --merge did not take the lock ($sig case)"; }
		sleep 0.1
	done
	kill "-$sig" "$h"
	wait "$h" 2>/dev/null || :
	[ "$sig" != TERM ] || [ ! -e "$lockdir" ] || fail "a merge check killed by TERM kept its lock"
	out=$(gate --merge) || fail "check.sh --merge failed after a holder was killed by $sig: $out"
	printf '%s\n' "$out" | grep -qi "waiting" && fail "check.sh --merge waited for a holder killed by $sig: $out"
	[ ! -e "$lockdir" ] || fail "check.sh --merge kept a lock after a holder killed by $sig"
done
sleep 3 # the killed runs' lanes finish on their own
fi

if part gate_limits; then
gate_fixture gate_limits
# check.sh raises its own open-files limit (F2543): the e2e web server dies of EMFILE under a low one, and each session had to
# remember `ulimit -n 10240`. It sets the soft limit to 10240, up or down; a limit it cannot set is said, never hidden.
# The lowest limit a step saw (a Node step raises its own soft limit to the hard one, whatever check.sh gave).
ul() { sort -n "$log.ulimit" 2>/dev/null | head -1; }
rm -f "$log.ulimit"
out=$( (ulimit -S -n 512 && gate) ) || fail "check.sh failed under a low soft limit of open files: $out"
[ "$(ul)" = 10240 ] || fail "check.sh did not raise the open-files limit to 10240 for its steps: got '$(ul)'"
rm -f "$log.ulimit"
out=$( (ulimit -n 512 && gate) ) || fail "check.sh failed when it could not raise the open-files limit: $out"
[ "$(ul)" = 512 ] || fail "check.sh changed a hard limit it could not raise: got '$(ul)'"
printf '%s\n' "$out" | grep -qi "open files" && printf '%s\n' "$out" | grep -q "512" || fail "check.sh did not say it could not raise the open-files limit (F2543): $out"
# The switches of the nginx check and the bench's wait are the tests': a caller's value reaches no step (a run would trust any binary,
# or measure a busy machine), whatever the order in check.sh. Each step logs what it saw.
rm -f "$log.env"
out=$(NGINX_SHA256=x BENCH_WAIT_CEILING=0 BENCH_WAIT_STEP=0 NGINX_START_TIMEOUT=0 gate) || fail "check.sh failed with the tests' switches set: $out"
[ -s "$log.env" ] || fail "no step logged the switches it saw"
leak=$(grep -v "^[^ ]* sha= ceiling= step= timeout=$" "$log.env" | head -1)
[ -z "$leak" ] || fail "check.sh passed one of NGINX_SHA256, BENCH_WAIT_CEILING, BENCH_WAIT_STEP, NGINX_START_TIMEOUT to a step: $leak"
# The soft limit is set to 10240, up or down (F2543 failed at 1048576, where a raise-only block did nothing): a limit above it is lowered.
for high in 20000 1048576; do
	if (ulimit -S -n "$high") 2>/dev/null; then
		rm -f "$log.ulimit"
		out=$( (ulimit -S -n "$high" && gate) ) || fail "check.sh failed under a high soft limit of $high: $out"
		[ "$(ul)" = 10240 ] || fail "check.sh did not set the open-files limit to 10240 from $high: got '$(ul)'"
	fi
done
fi

if part nginx_check; then
# scripts/check_nginx.py, in the merge check: the pinned nginx (1.30.6, the image's) from the tools' cache with its checksum
# checked, `nginx -t` on the image's deploy/web/nginx.conf with the build's table (app/build/csp.conf), then the build served on a
# free port, each page asked at its slashed, bare and index.html forms, each answering with its own policy (the build's _headers
# rule), never the bare one. 5f's two high findings passed the gate and the first read of the review: F2459 (a second
# map_hash_max_size, nginx refuses to start) and F2460 (a slashed address got the bare policy). The binary here is a stub that
# models what those faults hit: nginx's duplicate directive, its missing include, the map keyed by $uri after try_files joined
# without merging slashes. Docker stays refused in the sandbox (deploy/test.sh is Alexis's).
nc="$t/nginxchk"
mkdir -p "$nc/scripts" "$nc/deploy/web" "$nc/app/build/client/w/bubble" "$nc/tools/nginx-1.30.6/conf"
cp "$here/../deploy/web/nginx.conf" "$nc/deploy/web/nginx.conf"
bare="default-src 'none'; script-src 'self'"
home="default-src 'none'; script-src 'self' 'sha256-HOMEHOMEHOMEHOMEHOMEHOMEHOMEHOMEHOMEHOMEHOM='"
bub="default-src 'none'; script-src 'self' 'sha256-BUBBBUBBBUBBBUBBBUBBBUBBBUBBBUBBBUBBBUBBBU='"
printf '<html></html>\n' >"$nc/app/build/client/index.html" && printf '<html></html>\n' >"$nc/app/build/client/w/bubble/index.html"
printf '/*\n  Content-Security-Policy: %s\n/\n  ! Content-Security-Policy\n  Content-Security-Policy: %s\n/w/bubble\n  ! Content-Security-Policy\n  Content-Security-Policy: %s\n/w/bubble/\n  ! Content-Security-Policy\n  Content-Security-Policy: %s\n' \
	"$bare" "$home" "$bub" "$bub" >"$nc/app/build/client/_headers"
table() { # $1: extra rows
	printf 'map_hash_max_size 2048;\nmap_hash_bucket_size 64;\nmap $uri $csp {\n    default "%s";\n    "/" "%s";\n    "//index.html" "%s";\n    "/index.html" "%s";\n    "/w/bubble" "%s";\n    "/w/bubble/" "%s";\n    "/w/bubble//index.html" "%s";\n    "/w/bubble/index.html" "%s";\n%s}\n' \
		"$bare" "$home" "$home" "$home" "$bub" "$bub" "$bub" "$bub" "${1:-}" >"$nc/app/build/csp.conf"
}
table
: >"$nc/tools/nginx-1.30.6/conf/mime.types"
cat >"$nc/tools/nginx-1.30.6/nginx" <<'PY'
#!/usr/bin/env python3
import http.server, os, re, sys
a = sys.argv[1:]
conf_path = a[a.index("-c") + 1]
test = "-t" in a
log = open(os.environ["STUB_LOG"], "a")
conf = open(conf_path).read()
log.write(("test " if test else "serve ") + " ".join(a) + "\n---\n" + conf + "\n===\n")
log.flush()
texts, includes = [conf], re.findall(r"^\s*include\s+(\S+);", conf, re.M)
for inc in includes:
    if not os.path.exists(inc):
        print(f'nginx: [emerg] open() "{inc}" failed (2: No such file or directory) in {conf_path}', file=sys.stderr)
        sys.exit(1)
    texts.append(open(inc).read())
everything = "\n".join(texts)
if len(re.findall(r"^\s*map_hash_max_size\s", everything, re.M)) > 1:
    print(f'nginx: [emerg] "map_hash_max_size" directive is duplicate in {conf_path}:50', file=sys.stderr)
    sys.exit(1)
for m in re.finditer(r"^\s*proxy_pass\s+https?://([^:/;\s]+)", conf, re.M):
    host = m.group(1)
    if not (re.fullmatch(r"\d+\.\d+\.\d+\.\d+", host) or host == "localhost"):  # nginx resolves a literal host as it loads
        print(f'nginx: [emerg] host not found in upstream "{host}" in {conf_path}', file=sys.stderr)
        sys.exit(1)
if re.search(r"^\s*pid\s+/tmp/nginx\.pid;", conf, re.M):  # the image's pid file is in /tmp: the sandbox refuses it, or two runs collide
    print('nginx: [emerg] open() "/tmp/nginx.pid" failed (1: Operation not permitted)', file=sys.stderr)
    sys.exit(1)
if re.search(r"^\s*\w+_temp_path\s+/tmp/\w+_temp;", conf, re.M):
    print('nginx: [emerg] mkdir() "/tmp/client_temp" failed (1: Operation not permitted)', file=sys.stderr)
    sys.exit(1)
if re.search(r"^\s*(error|access)_log\s+/dev/std", conf, re.M):  # the real nginx -t fails on /dev/stderr under the sandbox (seen on 1.30.6)
    print('nginx: [emerg] open() "/dev/stderr" failed (6: Device not configured)', file=sys.stderr)
    sys.exit(1)
if os.environ.get("STUB_WARN"):
    print("nginx: [warn] " + os.environ["STUB_WARN"], file=sys.stderr)
if test:
    print(f"nginx: configuration file {conf_path} test is successful", file=sys.stderr)
    sys.exit(0)
open(os.environ["STUB_PID"], "w").write(str(os.getpid()))
if os.environ.get("STUB_NOSERVE") == "exit":  # a server that dies at once
    print("nginx: [emerg] bind() to 127.0.0.1 failed (98: Address already in use)", file=sys.stderr)
    sys.exit(1)
if os.environ.get("STUB_NOSERVE") == "hang":  # one that never listens
    import time
    time.sleep(60)
    sys.exit(1)
listen = re.search(r"^\s*listen\s+([^;]*);", conf, re.M).group(1)
port = int(re.search(r"(?:127\.0\.0\.1:)?(\d+)", listen).group(1))
needs_proxy_protocol = "proxy_protocol" in listen
needs_password = re.search(r"^\s*auth_basic\s+\"", conf, re.M) is not None
root = re.search(r"^\s*root\s+(\S+);", conf, re.M).group(1)
table_text = next(t for t, i in zip(texts[1:], includes) if not i.endswith("mime.types"))
default = re.search(r'default "([^"]*)";', table_text).group(1)
rows = dict(re.findall(r'^\s*"(/[^"]*)" "([^"]*)";', table_text, re.M))
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if needs_proxy_protocol:  # a plain request on a PROXY-protocol port is not understood
            self.send_response(400)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if needs_password:
            self.send_response(401)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        p = self.path.split("?")[0]
        uri = None
        if os.path.isfile(root + p):
            uri = p
        elif os.path.isfile(root + p + "/index.html"):
            uri = p + "/index.html"  # try_files joins without merging slashes: "/w/bubble/" + "/index.html"
        self.send_response(200 if uri else 404)
        self.send_header("Content-Security-Policy", rows.get(uri, default) if uri else default)
        if os.environ.get("STUB_DOUBLE"):  # a second policy header, as two add_header rules would send
            self.send_header("Content-Security-Policy", default)
        self.send_header("Content-Length", "0")
        self.end_headers()
    def log_message(self, *x):
        pass
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
PY
chmod +x "$nc/tools/nginx-1.30.6/nginx"
sha=$(python3 -I -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$nc/tools/nginx-1.30.6/nginx")
# SHA: UNSET runs with no NGINX_SHA256, EMPTY with an empty one (the pin file's digest then decides), a value is the digest to trust.
chk() {
	case "${SHA:-}" in UNSET) shaenv="-u NGINX_SHA256" ;; EMPTY) shaenv="NGINX_SHA256=" ;; "") shaenv="NGINX_SHA256=$sha" ;; *) shaenv="NGINX_SHA256=$SHA" ;; esac
	rm -f "$nc/stub.pid"
	(cd "$nc" && env $shaenv GNOWORLD_TOOLS="$nc/tools" STUB_LOG="$nc/stub.log" STUB_PID="$nc/stub.pid" STUB_WARN="${WARN:-}" STUB_NOSERVE="${NOSERVE:-}" STUB_DOUBLE="${DOUBLE:-}" python3 -I "$here/check_nginx.py" 2>&1)
}
# What a failed check leaves running is a server per failed merge check: the nginx it started is dead, whatever failed.
stopped() { # $1: what failed
	[ -s "$nc/stub.pid" ] || return 0
	if kill -0 "$(cat "$nc/stub.pid")" 2>/dev/null; then kill -9 "$(cat "$nc/stub.pid")"; fail "check_nginx left the nginx it started running after $1"; fi
}
rm -f "$nc/stub.log" "$nc/stub.pid"
out=$(chk) || fail "check_nginx refused the image's config with a good table, every page answering its own policy: $out"
grep -q "^test " "$nc/stub.log" || fail "check_nginx ran no nginx -t"
grep -q "^serve " "$nc/stub.log" || fail "check_nginx did not serve the build after nginx -t"
# Whole lines: `/index.html` is a part of `/w/bubble/index.html`, and a substring said it asked an address it never did (F2619).
for form in "/" "/index.html" "/w/bubble/" "/w/bubble" "/w/bubble/index.html"; do
	printf '%s\n' "$out" | grep -q "^ok    GET $form -> 200, " || fail "check_nginx did not say it asked $form: $out"
done
# The config tested is the image's, with the build's table: no path of the image's filesystem is left in it, the table is read
# from the build, and the served one answers a free port without the PROXY protocol or the password (a plain request has neither).
conf_tested=$(sed -n '/^test /,/^===$/p' "$nc/stub.log")
printf '%s\n' "$conf_tested" | grep -qF "worker_connections 4096" || fail "check_nginx tested another config than deploy/web/nginx.conf"
printf '%s\n' "$conf_tested" | grep -qF "/etc/nginx/csp.conf" && fail "check_nginx left the image's /etc/nginx/csp.conf in the config it tested"
conf_served=$(sed -n '/^serve /,/^===$/p' "$nc/stub.log")
printf '%s\n' "$conf_served" | grep -qE "^ *(listen +8080|listen .*proxy_protocol|auth_basic)" && fail "check_nginx served the config as the image has it (a fixed port, the PROXY protocol, the password file): a plain request cannot reach it"
if [ -s "$nc/stub.pid" ]; then kill -0 "$(cat "$nc/stub.pid")" 2>/dev/null && { kill "$(cat "$nc/stub.pid")"; fail "check_nginx left the nginx it started running"; }; fi
# F2460: a table with no row for the slashed address (try_files' $uri/index.html joins without merging slashes): the page gets
# the bare policy at /w/bubble/, and the check says so.
grep -v '//index.html' "$nc/app/build/csp.conf" >"$nc/c" && mv "$nc/c" "$nc/app/build/csp.conf"
out=$(chk) && fail "check_nginx passed a table with no row for a slashed address (F2460): $out"
printf '%s\n' "$out" | grep -qF "/w/bubble/" && printf '%s\n' "$out" | grep -qi "bare" || fail "check_nginx did not name the slashed address that got the bare policy: $out"
stopped "a page that got the bare policy (F2460)"
# Another page's policy is no more its own than the bare one.
table '' && sed -E 's#("/w/bubble[^"]*" )"[^"]*"#\1"'"$home"'"#' "$nc/app/build/csp.conf" >"$nc/c" && mv "$nc/c" "$nc/app/build/csp.conf"
out=$(chk) && fail "check_nginx passed a page answering another page's policy: $out"
printf '%s\n' "$out" | grep -qF "/w/bubble" || fail "check_nginx did not name the page that got another's policy: $out"
stopped "a page that got another's policy"
table
# F2619: the three address forms of a page come from the page files, not from _headers. A _headers that holds only a page's bare row
# (or only its slashed row) still has every form asked: a home that loses /index.html, or a page its slashed address, goes unseen
# when _headers names the address itself.
cp "$nc/app/build/client/_headers" "$nc/headers.good"
for only in bare slashed; do
	if [ "$only" = bare ]; then drop='^/w/bubble/$'; keep=/w/bubble/; else drop='^/w/bubble$'; keep=/w/bubble; fi
	python3 -I -c 'import re, sys; t = open(sys.argv[1]).read(); open(sys.argv[2], "w").write(re.sub(r"^" + sys.argv[3][1:-1] + r"\n  ! Content-Security-Policy\n  Content-Security-Policy: [^\n]*\n", "", t, flags=re.M))' "$nc/headers.good" "$nc/app/build/client/_headers" "$drop"
	grep -qx "$keep" "$nc/app/build/client/_headers" && fail "the fixture did not drop the row of the page's $only form"
	out=$(chk) || fail "check_nginx refused a _headers holding only the $only row of a page: $out"
	for form in "/" "/index.html" "/w/bubble/" "/w/bubble" "/w/bubble/index.html"; do
		printf '%s\n' "$out" | grep -q "^ok    GET $form -> 200, " || fail "check_nginx did not ask $form when _headers holds only the $only row of the page: $out"
	done
done
cp "$nc/headers.good" "$nc/app/build/client/_headers"
# A page of the build that _headers has no rule for gets none: the check names the page, not only a policy that differs.
mkdir -p "$nc/app/build/client/w/other" && printf '<html></html>\n' >"$nc/app/build/client/w/other/index.html"
out=$(chk) && fail "check_nginx passed a page that _headers has no Content-Security-Policy rule for: $out"
printf '%s\n' "$out" | grep -qF "has no Content-Security-Policy rule for the page w/other/index.html" || fail "check_nginx did not name the page with no rule: $out"
stopped "a page with no rule"
rm -r "$nc/app/build/client/w/other"
# A page answering two policies is not answering its own.
out=$(DOUBLE=1 chk) && fail "check_nginx passed a page answering two Content-Security-Policy headers: $out"
printf '%s\n' "$out" | grep -qF "headers, not one" || fail "check_nginx did not say a page answered two policies: $out"
stopped "a page answering two policies"
# The image changed: a line this check rewrites is gone. It fails naming the line and runs nginx on nothing.
cp "$nc/deploy/web/nginx.conf" "$nc/nginx.good"
grep -v 'listen 127.0.0.1:8081;' "$nc/nginx.good" >"$nc/deploy/web/nginx.conf"
rm -f "$nc/stub.log"
out=$(chk) && fail "check_nginx tested a config that lacks a line it rewrites: $out"
printf '%s\n' "$out" | grep -qF "has no line" || fail "check_nginx did not say the image's config changed: $out"
[ ! -e "$nc/stub.log" ] || fail "check_nginx ran nginx on a config it could not stage"
cp "$nc/nginx.good" "$nc/deploy/web/nginx.conf"
# A page the build's _headers lists and the build does not hold: nginx answers 404, and the check names the page and the status.
cp "$nc/app/build/client/_headers" "$nc/headers.good"
printf '/gone\n  ! Content-Security-Policy\n  Content-Security-Policy: %s\n' "$bare" >>"$nc/app/build/client/_headers"
out=$(chk) && fail "check_nginx passed a page of _headers that the build does not hold: $out"
printf '%s\n' "$out" | grep -qF "/gone" && printf '%s\n' "$out" | grep -qF "404" || fail "check_nginx did not name the missing page and its 404: $out"
stopped "a page that answered 404"
cp "$nc/headers.good" "$nc/app/build/client/_headers"
# A server that never answers: dead at once, or listening to nothing. The check fails in a bounded time, saying nginx did not start, and
# leaves nothing running.
t0=$(date +%s)
out=$(NOSERVE=exit chk) && fail "check_nginx passed with an nginx that died at once: $out"
[ "$(($(date +%s) - t0))" -lt 8 ] || fail "check_nginx waited $(($(date +%s) - t0)) s for an nginx that had already died"
printf '%s\n' "$out" | grep -qi "did not start" || fail "check_nginx did not say that nginx did not start: $out"
stopped "an nginx that died at once"
t0=$(date +%s)
out=$(NOSERVE=hang NGINX_START_TIMEOUT=2 chk) && fail "check_nginx passed with an nginx that never listens: $out"
[ "$(($(date +%s) - t0))" -lt 15 ] || fail "check_nginx waited $(($(date +%s) - t0)) s for an nginx that never listens"
printf '%s\n' "$out" | grep -qi "did not start" || fail "check_nginx did not say that nginx never answered: $out"
stopped "an nginx that never listens"
# A literal upstream host (deploy/web/nginx.conf's ergo and server) is one nginx -t refuses where no such host resolves: the check
# tests a config that names none. Docker's names are the image's own; the stub refuses any host that is no address.
sed -n '/^test /,/^===$/p' "$nc/stub.log" | grep -qE "proxy_pass +http://(ergo|server)[:;]" && fail "check_nginx left the image's upstream host names in the config it tested (nginx: host not found in upstream)"
# The image logs to /dev/stderr and /dev/stdout, which a real nginx -t cannot open under the sandbox: the check tests a config that logs
# to a file of its own folder (the stub refuses the device paths as nginx does).
sed -n '/^test /,/^===$/p' "$nc/stub.log" | grep -qE "^ *(error|access)_log +/dev/std" && fail "check_nginx left the image's /dev/stderr or /dev/stdout log in the config it tested"
# F2459: a second map_hash_max_size in the config nginx refuses; the check shows nginx's own words and serves nothing.
cp "$nc/deploy/web/nginx.conf" "$nc/nginx.good"
python3 -I -c 'import re, sys; t = open(sys.argv[1]).read(); open(sys.argv[2], "w").write(re.sub(r"^( *)(include /etc/nginx/csp\.conf;)", r"\1map_hash_max_size 4096;\n\1\2", t, flags=re.M))' "$nc/nginx.good" "$nc/deploy/web/nginx.conf"
[ "$(grep -c '^ *map_hash_max_size' "$nc/deploy/web/nginx.conf")" = 1 ] || fail "the fixture did not plant F2459's fault"
rm -f "$nc/stub.log"
out=$(chk) && fail "check_nginx passed a config nginx refuses to start with (F2459): $out"
printf '%s\n' "$out" | grep -qF '"map_hash_max_size" directive is duplicate' || fail "check_nginx did not show nginx's own error for F2459: $out"
grep -q "^serve " "$nc/stub.log" && fail "check_nginx served a build after nginx -t failed"
cp "$nc/nginx.good" "$nc/deploy/web/nginx.conf"
# A warning fails, the hash table's included: csp-fixes (F2454) sized the table, and nginx 1.30.6 builds it with none.
out=$(WARN='could not build optimal map_hash, you should increase either map_hash_max_size: 2048 or map_hash_bucket_size: 64' chk) && fail "check_nginx passed the hash table's warning, which csp-fixes' sizes removed (F2625): $out"
printf '%s\n' "$out" | grep -qF 'could not build optimal map_hash' || fail "check_nginx did not show the hash table's warning that failed it: $out"
out=$(WARN='the "user" directive makes sense only if the master process runs with super-user privileges, ignored' chk) && fail "check_nginx passed an unknown warning: $out"
printf '%s\n' "$out" | grep -qF 'the "user" directive' || fail "check_nginx did not show the warning that failed it: $out"
# What it cannot do fails, never skips: no binary, a binary whose checksum is not the pinned one, no build.
out=$(cd "$nc" && mkdir -p empty && GNOWORLD_TOOLS="$nc/empty" python3 -I "$here/check_nginx.py" 2>&1) && fail "check_nginx passed with no nginx in the tools' cache: $out"
printf '%s\n' "$out" | grep -qF "nginx-1.30.6" && printf '%s\n' "$out" | grep -qF "docs/DEVELOPMENT.md" || fail "check_nginx did not say where the pinned nginx comes from: $out"
out=$(SHA=0000 chk) && fail "check_nginx ran a binary whose checksum is not the pinned one: $out"
printf '%s\n' "$out" | grep -qi "checksum" || fail "check_nginx did not name the checksum: $out"
# The switch is the tests': with none (or an empty one), the pin committed beside the script decides, and a stub is not nginx 1.30.6.
for mode in UNSET EMPTY; do
	out=$(SHA=$mode chk) && fail "check_nginx ran a binary that is not the pinned nginx, with NGINX_SHA256 $mode: $out"
	printf '%s\n' "$out" | grep -qi "checksum" || fail "check_nginx did not name the checksum with NGINX_SHA256 $mode: $out"
	stopped "a binary that is not the pinned one"
done
pin=$(head -1 "$here/nginx.sha256" 2>/dev/null || :)
case "$pin" in
unrecorded) ;;
*[!0-9a-f]* | "") fail "scripts/nginx.sha256 holds neither a SHA-256 in hex nor the word 'unrecorded': '$pin'" ;;
*) [ ${#pin} -eq 64 ] || fail "scripts/nginx.sha256 is not 64 hex characters: '$pin'" ;;
esac
# The default location: nothing in GNOWORLD_TOOLS, the binary at $HOME/.cache/gnoworld-tools/nginx-1.30.6/nginx.
mkdir -p "$nc/home/.cache/gnoworld-tools/nginx-1.30.6/conf" && cp "$nc/tools/nginx-1.30.6/nginx" "$nc/home/.cache/gnoworld-tools/nginx-1.30.6/nginx" && : >"$nc/home/.cache/gnoworld-tools/nginx-1.30.6/conf/mime.types"
out=$(cd "$nc" && env -u GNOWORLD_TOOLS HOME="$nc/home" NGINX_SHA256="$sha" STUB_LOG="$nc/stub.log" STUB_PID="$nc/stub.pid" python3 -I "$here/check_nginx.py" 2>&1) || fail "check_nginx did not find the pinned nginx at \$HOME/.cache/gnoworld-tools/nginx-1.30.6/nginx: $out"
out=$(cd "$nc" && mkdir -p home2 && env -u GNOWORLD_TOOLS HOME="$nc/home2" python3 -I "$here/check_nginx.py" 2>&1) && fail "check_nginx passed with no nginx in the default location: $out"
mv "$nc/app/build/csp.conf" "$nc/csp.keep"
out=$(chk) && fail "check_nginx passed with no build's table: $out"
printf '%s\n' "$out" | grep -qi "csp.conf" || fail "check_nginx did not name the missing table: $out"
mv "$nc/csp.keep" "$nc/app/build/csp.conf"
# The pinned binary is documented where Alexis sets the tools up, and the harness doc says how the lock works.
grep -q "gnoworld-tools/nginx-1\.30\.6/nginx" "$here/../docs/DEVELOPMENT.md" && grep -q "scripts/nginx\.sha256" "$here/../docs/DEVELOPMENT.md" && grep -qi "sha256\|checksum" "$here/../docs/DEVELOPMENT.md" || fail "docs/DEVELOPMENT.md does not say how to get the pinned nginx 1.30.6 with its checksum"
grep -qi "merge.lock\|one merge check at a time" "$here/../docs/HARNESS.md" || fail "docs/HARNESS.md does not say that merge checks take a lock, one at a time"
# Its switches are the tests', never a run's: check.sh drops them (section gate_limits runs it with them set and shows the steps see none).
# A visitor's first load is twice its files at once (deploy/test.sh asks every file of the build twice): the burst of the visitors' zone must
# hold twice the build's files, or a first visit gets a 429 (F3385: 44 of 220 requests at a burst of 160). Docker is not needed to see it.
cp "$nc/deploy/web/nginx.conf" "$nc/nginx.good"
sed 's#zone=visitors burst=640#zone=visitors burst=4#' "$nc/nginx.good" >"$nc/deploy/web/nginx.conf"
grep -q 'zone=visitors burst=4 ' "$nc/deploy/web/nginx.conf" || fail "the fixture did not plant a burst of 4"
out=$(chk) && fail "check_nginx passed a burst of 4 for a build of 3 files, whose first load is 6 requests: $out"
printf '%s\n' "$out" | grep -qi "burst" || fail "check_nginx did not name the burst that a first load overruns: $out"
# The boundary (the red pass, finding 12): exactly twice the files holds, one under does not.
sed 's#zone=visitors burst=640#zone=visitors burst=6#' "$nc/nginx.good" >"$nc/deploy/web/nginx.conf"
out=$(chk) || fail "check_nginx refused a burst of 6, twice the 3 files of the build: $out"
sed 's#zone=visitors burst=640#zone=visitors burst=5#' "$nc/nginx.good" >"$nc/deploy/web/nginx.conf"
out=$(chk) && fail "check_nginx passed a burst of 5, under twice the 3 files of the build: $out"
printf '%s\n' "$out" | grep -qi "burst" || fail "check_nginx did not name the burst of 5: $out"
cp "$nc/nginx.good" "$nc/deploy/web/nginx.conf"
chk >/dev/null || fail "check_nginx refused the image's burst for a build of 3 files"
# The table the burst lives in (F3665, Alexis, 2026-11-02): the visitors' zone has two live lines, both at 640, and its rate is unchanged. Each
# line is read from its start, for a comment proves nothing: the faults under it are what a loose grep passed (7d1's security review).
burst_table() {
	[ "$(grep -Ec '^[[:space:]]*limit_req zone=visitors ' "$1")" = 2 ] &&
		[ "$(grep -Ec '^[[:space:]]*limit_req zone=visitors burst=640 nodelay;$' "$1")" = 2 ] &&
		grep -Eq '^[[:space:]]*limit_req_zone \$proxy_protocol_addr zone=visitors:1m rate=20r/s;$' "$1"
}
burst_table "$here/../deploy/web/nginx.conf" || fail "the visitors' zone in deploy/web/nginx.conf is not two lines at a burst of 640 and 20 a second (F3665)"
sed 's/burst=640 nodelay;/burst=64000 nodelay;/' "$nc/nginx.good" >"$nc/table.conf"
printf '# limit_req zone=visitors burst=640 nodelay;\n# limit_req zone=visitors burst=640 nodelay;\n' >>"$nc/table.conf"
burst_table "$nc/table.conf" && fail "the burst's table read two comments as its two lines"
cp "$nc/nginx.good" "$nc/table.conf"
printf '        limit_req zone=visitors burst=64000 nodelay;\n' >>"$nc/table.conf"
burst_table "$nc/table.conf" && fail "the burst's table passed a third line at another burst"
sed 's#rate=20r/s;#rate=2000r/s;#' "$nc/nginx.good" >"$nc/table.conf"
printf '# limit_req_zone $proxy_protocol_addr zone=visitors:1m rate=20r/s;\n' >>"$nc/table.conf"
burst_table "$nc/table.conf" && fail "the burst's table read a comment as its rate"
sed 's/limit_req zone=visitors burst=640 nodelay;/limit_req zone=visitors burst=320 nodelay;/' "$nc/nginx.good" >"$nc/table.conf"
burst_table "$nc/table.conf" && fail "the burst's table passed the old burst"
rm "$nc/table.conf"
fi

if part bench_load; then
# bench.py measures a quiet machine (harness-c, 4b): before it runs the benches it reads the load (scripts/load.py: tenths, "170 160"
# is a load of 17.0 on 16 cores) and waits, up to a ceiling, for it to fall under the cores; it prints what it waited and the load,
# and refuses, saying so, when the ceiling passes. No budget changes: an over-budget bench at a quiet load still fails. The tests' load
# is scripts/load.py's stub, a line a read; BENCH_WAIT_CEILING and BENCH_WAIT_STEP (seconds) are theirs and check.sh drops them.
bl="$t/benchload"
mkdir -p "$bl/scripts" "$bl/node_modules/.bin"
cp "$here/bench.py" "$here/repo_files.py" "$bl/scripts/"
printf '#!/bin/sh\necho ran >>"$BENCH_RAN"\nwhile [ $# -gt 0 ]; do [ "$1" = --outputJson ] && cp "$BENCH_FIXTURE" "$2"; shift; done\n' >"$bl/node_modules/.bin/vitest" && chmod +x "$bl/node_modules/.bin/vitest"
printf 'import os, sys\nlines = open(os.environ["LOAD_SEQ"]).read().split("\\n")\nlines = [l for l in lines if l]\nn = int(open(os.environ["LOAD_N"]).read()) if os.path.exists(os.environ["LOAD_N"]) else 0\nopen(os.environ["LOAD_N"], "w").write(str(n + 1))\nprint(lines[min(n, len(lines) - 1)])\n' >"$bl/scripts/load.py"
printf '{"files": [{"groups": [{"benchmarks": [{"name": "a line [0.2 ms]", "mean": %s}]}]}]}\n' 0.05 >"$bl/report.json"
bload() { # $1: the load lines, one a read, separated by commas
	rm -f "$bl/ran" "$bl/load.n" && printf '%s\n' "$1" | tr , '\n' >"$bl/seq"
	# Bounded: a bench.py that waits for ever on a busy machine fails the case, it does not hang the suite.
	(cd "$bl" && BENCH_FIXTURE="$bl/report.json" BENCH_RAN="$bl/ran" LOAD_SEQ="$bl/seq" LOAD_N="$bl/load.n" BENCH_WAIT_CEILING="${CEILING:-10}" BENCH_WAIT_STEP="${STEP:-0.05}" python3 -I -c 'import subprocess, sys
try:
    r = subprocess.run([sys.executable, "-I", "scripts/bench.py"], capture_output=True, text=True, timeout=40)
except subprocess.TimeoutExpired:
    print("bench.py was still running after 40 s")
    sys.exit(124)
print(r.stdout + r.stderr)
sys.exit(r.returncode)' 2>&1)
}
out=$(bload "10 160") || fail "bench.py refused a quiet machine: $out"
printf '%s\n' "$out" | grep -qF "load 1.0" && printf '%s\n' "$out" | grep -qF "16 cores" || fail "bench.py did not print the load it measured at: $out"
printf '%s\n' "$out" | grep -qi "waited" && fail "bench.py said it waited on a quiet machine: $out"
[ "$(wc -l <"$bl/ran")" -eq 1 ] || fail "bench.py did not run the benches once at a quiet load"
out=$(bload "900 160,900 160,100 160") || fail "bench.py did not wait for the load to fall: $out"
printf '%s\n' "$out" | grep -qi "waited" || fail "bench.py did not say it waited for the load: $out"
printf '%s\n' "$out" | grep -qF "load 90.0" && printf '%s\n' "$out" | grep -qF "16 cores" || fail "bench.py did not print the load it waited on, and the cores: $out"
[ "$(cat "$bl/load.n")" -ge 3 ] || fail "bench.py did not read the load again while it waited: $(cat "$bl/load.n") reads"
[ "$(wc -l <"$bl/ran")" -eq 1 ] || fail "bench.py ran the benches while the load was high"
# Under the cores means under: a load equal to them waits.
out=$(bload "160 160,159 160") || fail "bench.py did not wait at a load equal to the cores: $out"
printf '%s\n' "$out" | grep -qi "waited" || fail "bench.py measured at a load equal to the machine's cores: $out"
# A ceiling past: no verdict, said so, and the benches never run.
out=$(CEILING=1 bload "900 160") && fail "bench.py gave a verdict on a machine that never fell quiet: $out"
printf '%s\n' "$out" | grep -qF "needs a machine that can measure it" || fail "bench.py did not say why it refused (a machine that can measure): $out"
printf '%s\n' "$out" | grep -qF "90.0" || fail "bench.py did not print the load it gave up at: $out"
[ ! -e "$bl/ran" ] || fail "bench.py ran the benches on a machine past its ceiling"
# The pause between two reads is the step (F2620): over a 2 s ceiling with a step of 1 s the load is read a few times, not in a loop.
out=$(CEILING=2 STEP=1 bload "900 160") && fail "bench.py gave a verdict on a machine that never fell quiet (step 1 s): $out"
[ "$(cat "$bl/load.n")" -le 5 ] || fail "bench.py read the load $(cat "$bl/load.n") times in 2 s with a step of 1 s: it does not pause between two reads (F2620)"
[ "$(cat "$bl/load.n")" -ge 2 ] || fail "bench.py read the load once in 2 s with a step of 1 s: it did not read again"
# The defaults, with no switch: a ceiling of 60 s said (the harness audit, 2026-11-04: 600 s at loads of 48 to 142 ended on a refusal
# all the same), and a step of 10 s (one read in the first seconds). It is stopped once seen.
rm -f "$bl/ran" "$bl/load.n" && printf '900 160\n' >"$bl/seq"
(cd "$bl" && env -u BENCH_WAIT_CEILING -u BENCH_WAIT_STEP BENCH_FIXTURE="$bl/report.json" BENCH_RAN="$bl/ran" LOAD_SEQ="$bl/seq" LOAD_N="$bl/load.n" python3 -I scripts/bench.py >"$bl/dflt.out" 2>&1 & echo $! >"$bl/dflt.pid")
tries=0
until grep -q "up to" "$bl/dflt.out" 2>/dev/null; do
	tries=$((tries + 1))
	[ "$tries" -lt 300 ] || { kill "$(cat "$bl/dflt.pid")" 2>/dev/null; fail "bench.py with its defaults never said how long it waits: $(cat "$bl/dflt.out")"; }
	kill -0 "$(cat "$bl/dflt.pid")" 2>/dev/null || fail "bench.py with its defaults ended at a busy load before its ceiling: $(cat "$bl/dflt.out")"
	sleep 0.1
done
sleep 2
kill -0 "$(cat "$bl/dflt.pid")" 2>/dev/null || fail "bench.py with its defaults gave up within seconds at a busy load: $(cat "$bl/dflt.out")"
kill "$(cat "$bl/dflt.pid")" 2>/dev/null
grep -qF "up to 60 s" "$bl/dflt.out" || fail "bench.py's default ceiling is not 60 s (F2620, the harness audit): $(cat "$bl/dflt.out")"
[ "$(cat "$bl/load.n")" -le 2 ] || fail "bench.py's default step is not seconds long: $(cat "$bl/load.n") reads within 3 s (F2620)"
# A load that cannot be read is no quiet one: bench.py refuses, saying so, and runs no bench (it would measure a busy machine unannounced),
# whether load.py fails, prints nothing or garbage, or reports no core.
cp "$bl/scripts/load.py" "$bl/load.good"
for bad in 'import sys; sys.exit(1)' 'print("x")' 'print("")' 'print("10 0")' 'print("10")'; do
	printf '%s\n' "$bad" >"$bl/scripts/load.py"
	out=$(bload "10 160") && fail "bench.py measured with a load it could not read ($bad): $out"
	printf '%s\n' "$out" | grep -qi "cannot be read" || fail "bench.py did not say the load cannot be read ($bad): $out"
	printf '%s\n' "$out" | grep -qi "traceback" && fail "bench.py crashed with a traceback on an unreadable load ($bad): $out"
	[ ! -e "$bl/ran" ] || fail "bench.py ran the benches with a load it could not read ($bad)"
done
cp "$bl/load.good" "$bl/scripts/load.py"
# No budget changes: an over-budget bench at a quiet load fails as before.
printf '{"files": [{"groups": [{"benchmarks": [{"name": "a line [0.2 ms]", "mean": 0.25}]}]}]}\n' >"$bl/report.json"
out=$(bload "10 160") && fail "bench.py passed a bench over its budget at a quiet load: $out"
printf '%s\n' "$out" | grep -qF "a line [0.2 ms]: 0.2500 ms, over its 0.2 ms" || fail "bench.py did not name the bench over its budget at a quiet load: $out"
# check.sh drops BENCH_WAIT_CEILING and BENCH_WAIT_STEP, with which a run would measure a busy machine: section gate_limits runs it with them set.
fi

if part regressions; then
# check_regressions: its rules on small cases (the real run needs a base branch and Vitest).
python3 -I "$here/check_regressions.py" --self-test >/dev/null || fail "check_regressions's rules do not hold"
# F2523: an exclusion written with a name is read. `exclude: [...configDefaults.exclude, STRYKER_TMP]` added an ignore that
# ignores() never saw (it read only the quoted strings), so no `Lowered-floor:` line was asked for. A bare name in these lists is
# refused as an unread entry; a quoted entry is seen as before, and the spread of a tool's own defaults alone stays.
rx="$t/regrname" && mkdir -p "$rx/scripts"
cp "$here/check_regressions.py" "$here/repo_files.py" "$here/borrow_node_modules.sh" "$rx/scripts/"
git -C "$rx" init -q && printf 'node_modules/\n' >"$rx/.gitignore"
mkdir -p "$rx/node_modules/.bin" && printf '#!/bin/sh\necho "[]"\n' >"$rx/node_modules/.bin/vitest" && chmod +x "$rx/node_modules/.bin/vitest" # no test to list
printf 'const STRYKER_TMP = "**/.stryker-tmp/**";\nexport default { test: { exclude: ["a/**"] } };\n' >"$rx/vitest.config.ts"
printf 'export default [globalIgnores(["docs/"]), { ignores: ["packages/core/**"] }];\n' >"$rx/eslint.config.ts"
printf 'const SKIP = new Set(["a"]);\n' >"$rx/scripts/check_comments.mjs"
git -C "$rx" add -A && git -C "$rx" commit -qm base && xbase=$(git -C "$rx" rev-parse HEAD)
regx() { (cd "$rx" && python3 -I scripts/check_regressions.py "$xbase" 2>&1); }
nameback() { git -C "$rx" reset -q --hard "$xbase"; }
out=$(regx) || fail "check_regressions refused a branch that changed no ignore: $out"
printf 'const STRYKER_TMP = "**/.stryker-tmp/**";\nexport default { test: { exclude: ["a/**", STRYKER_TMP] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "an exclusion by name"
out=$(regx) && fail "check_regressions passed an exclude list with a name added to it, which it cannot read (F2523): $out"
printf '%s\n' "$out" | grep -qF "STRYKER_TMP" || fail "check_regressions did not name the unread entry STRYKER_TMP: $out"
nameback
printf 'const STRYKER_TMP = "**/.stryker-tmp/**";\nexport default { test: { exclude: [...configDefaults.exclude, STRYKER_TMP] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "the real shape of vitest.config.ts"
out=$(regx) && fail "check_regressions passed [...configDefaults.exclude, STRYKER_TMP], the shape F2523 hid an ignore in: $out"
printf '%s\n' "$out" | grep -qF "STRYKER_TMP" || fail "check_regressions did not name STRYKER_TMP behind a spread: $out"
nameback
printf 'export default [globalIgnores(["docs/", GENERATED]), { ignores: ["packages/core/**"] }];\n' >"$rx/eslint.config.ts" && git -C "$rx" commit -qam "a name in globalIgnores"
out=$(regx) && fail "check_regressions passed a bare name in globalIgnores: $out"
printf '%s\n' "$out" | grep -qF "GENERATED" || fail "check_regressions did not name the unread entry GENERATED: $out"
nameback
printf 'export default [globalIgnores(["docs/"]), { ignores: [OTHER] }];\n' >"$rx/eslint.config.ts" && git -C "$rx" commit -qam "a name alone in ignores"
out=$(regx) && fail "check_regressions passed a name alone in an ignores list: $out"
printf '%s\n' "$out" | grep -qF "OTHER" || fail "check_regressions did not name the unread entry OTHER: $out"
nameback
printf 'const SKIP = new Set(["a", HIDDEN]);\n' >"$rx/scripts/check_comments.mjs" && git -C "$rx" commit -qam "a name in SKIP"
out=$(regx) && fail "check_regressions passed a bare name in SKIP's list: $out"
printf '%s\n' "$out" | grep -qF "HIDDEN" || fail "check_regressions did not name the unread entry HIDDEN: $out"
nameback
# What was read before is read still: a quoted entry named after the spread, and the spread of the defaults on its own.
printf 'export default { test: { exclude: [...configDefaults.exclude, "a/**"] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "the defaults spread, nothing new"
out=$(regx) || fail "check_regressions refused the spread of a tool's own defaults beside an entry the base had: $out"
nameback
printf 'export default { test: { exclude: [...configDefaults.exclude, "b/**"] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "a quoted entry beside the spread"
out=$(regx) && fail "check_regressions passed a quoted exclusion added beside the spread of the defaults: $out"
printf '%s\n' "$out" | grep -qF "b/**" || fail "check_regressions did not name the quoted exclusion b/**: $out"
nameback
# Other shapes the reader could not see are refused too: a single-quoted entry is read (and named), a list passed by name with no
# bracket, a list with a method on it (`.concat`), a template literal.
printf "export default { test: { exclude: ['a/**', 'c/**'] } };\n" >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "a single-quoted entry"
out=$(regx) && fail "check_regressions passed a single-quoted exclusion added to a list: $out"
printf '%s\n' "$out" | grep -qF "c/**" || fail "check_regressions did not name the single-quoted entry c/**: $out"
nameback
for shape in 'exclude: ALL_EXCLUDES' 'exclude: ["a/**"].concat(MORE)' 'exclude: [...MORE]' 'exclude: ["a/**", `${DIR}/**`]'; do
	case $shape in
	'exclude: ALL'*) want=ALL_EXCLUDES ;;
	*concat*) want='.concat(MORE)' ;;
	*'[...MORE]') want='...MORE' ;;
	*) want='${DIR}/**' ;;
	esac
	printf 'export default { test: { %s } };\n' "$shape" >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "an exclusion written another way"
	out=$(regx) && fail "check_regressions passed an exclusion it cannot read, written as: $shape: $out"
	printf '%s\n' "$out" | grep -q "vitest.config.ts" || fail "check_regressions did not name vitest.config.ts for: $shape: $out"
	printf '%s\n' "$out" | grep -qF -- "$want" || fail "check_regressions did not name the entry $want of: $shape (F2618): $out"
	nameback
done
# A bare name is excused as a quoted entry is, by a line of a commit naming it: `Lowered-floor: ignore <file> <name> - why`.
printf 'const STRYKER_TMP = "**/.stryker-tmp/**";\nexport default { test: { exclude: ["a/**", STRYKER_TMP] } };\n' >"$rx/vitest.config.ts"
git -C "$rx" commit -qam "an exclusion by name" -m "Lowered-floor: ignore vitest.config.ts STRYKER_TMP - the sandboxes of StrykerJS are not tests"
out=$(regx) || fail "check_regressions refused a bare name that a commit names on a Lowered-floor line: $out"
nameback
# The real vitest.config.ts already holds a bare name at its base: a name that was there is no change. A new base with a name in each
# file, then: an unrelated line changed passes; a quoted entry added is the only entry named; a name taken away passes.
printf 'const STRYKER_TMP = "**/.stryker-tmp/**";\nexport default { test: { exclude: [...configDefaults.exclude, STRYKER_TMP] } };\n' >"$rx/vitest.config.ts"
printf 'export default [globalIgnores(["docs/", GENERATED]), { ignores: ["packages/core/**"] }];\n' >"$rx/eslint.config.ts"
printf 'const SKIP = new Set(["a", HIDDEN]);\n' >"$rx/scripts/check_comments.mjs"
git -C "$rx" add -A && git -C "$rx" commit -qm "a base that holds a name in each file" && xbase=$(git -C "$rx" rev-parse HEAD)
out=$(regx) || fail "check_regressions refused a branch that changed nothing, over a base that holds bare names: $out"
printf 'const STRYKER_TMP = "**/.stryker-tmp/**"; // the sandboxes\nexport default { test: { exclude: [...configDefaults.exclude, STRYKER_TMP] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "an unrelated line"
out=$(regx) || fail "check_regressions refused a bare name the base already held (the real vitest.config.ts has one): $out"
nameback
printf 'const STRYKER_TMP = "**/.stryker-tmp/**";\nexport default { test: { exclude: [...configDefaults.exclude, STRYKER_TMP, "b/**"] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "a quoted entry beside the name"
out=$(regx) && fail "check_regressions passed a quoted exclusion added beside a name the base held: $out"
printf '%s\n' "$out" | grep -qF "b/**" && ! printf '%s\n' "$out" | grep -qF "STRYKER_TMP" || fail "check_regressions named something other than the one entry added, b/**: $out"
nameback
printf 'export default { test: { exclude: [...configDefaults.exclude] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "the name taken away"
out=$(regx) || fail "check_regressions refused a name taken away: $out"
nameback
# F2622: a name stands for its value. A const the file holds behind a name or a spread is read: its value is the entry, so widening
# `STRYKER_TMP` to "**/*.test.ts", or adding to `SLOW`, shows though the list names the same words. Only the tool's own
# `...configDefaults.exclude` is the tool's: a lookalike (`...myConfigDefaults.list`) is an entry.
printf 'const STRYKER_TMP = "**/.stryker-tmp/**";\nconst SLOW = ["s/**"];\nexport default { test: { exclude: [...configDefaults.exclude, STRYKER_TMP, ...SLOW] } };\n' >"$rx/vitest.config.ts"
git -C "$rx" commit -qam "a base whose list holds a name and a spread of consts" && xbase=$(git -C "$rx" rev-parse HEAD)
out=$(regx) || fail "check_regressions refused a branch that changed nothing, over a base whose names are consts: $out"
printf 'const STRYKER_TMP = "**/*.test.ts";\nconst SLOW = ["s/**"];\nexport default { test: { exclude: [...configDefaults.exclude, STRYKER_TMP, ...SLOW] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "the name's value widened"
out=$(regx) && fail "check_regressions passed a const widened to every test, behind a name the base held (F2622): $out"
printf '%s\n' "$out" | grep -qF '**/*.test.ts' || fail "check_regressions did not name the value the const now holds: $out"
git -C "$rx" commit -q --amend -m "the name's value widened" -m "Lowered-floor: ignore vitest.config.ts STRYKER_TMP - tests are measured elsewhere"
out=$(regx) || fail "check_regressions refused a name's new value that a commit names on a Lowered-floor line: $out"
nameback
printf 'const STRYKER_TMP = "**/.stryker-tmp/**";\nconst SLOW = ["s/**", "t/**"];\nexport default { test: { exclude: [...configDefaults.exclude, STRYKER_TMP, ...SLOW] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "a list behind a spread grown"
out=$(regx) && fail "check_regressions passed an entry added to the list a spread names (F2622): $out"
printf '%s\n' "$out" | grep -qF 't/**' || fail "check_regressions did not name the entry added behind the spread: $out"
nameback
printf 'const STRYKER_TMP = "**/.stryker-tmp/**"; // reworded\nconst SLOW = ["s/**"];\nexport default { test: { exclude: [...configDefaults.exclude, STRYKER_TMP, ...SLOW] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "a comment"
out=$(regx) || fail "check_regressions refused a comment added beside consts that hold their values: $out"
nameback
printf 'const myConfigDefaults = { list: ["server/**"] };\nexport default { test: { exclude: [...myConfigDefaults.list, STRYKER_TMP, ...SLOW] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "a lookalike of the defaults"
out=$(regx) && fail "check_regressions passed a spread that only looks like the tool's defaults (F2627): $out"
printf '%s\n' "$out" | grep -qF 'myConfigDefaults.list' || fail "check_regressions did not name the lookalike spread: $out"
nameback
# F2627: the other forms of the same exclusion: shorthand (`{ exclude }`), a quoted key, and the list on the next line, as Prettier
# breaks a call of two arguments.
printf 'const exclude = ["z/**"];\nexport default { test: { exclude } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "shorthand"
out=$(regx) && fail "check_regressions passed an exclusion written as the shorthand { exclude } (F2627): $out"
printf '%s\n' "$out" | grep -qF 'z/**' || fail "check_regressions did not name the entry behind the shorthand: $out"
nameback
printf 'export default { test: { "exclude": ["z/**"] } };\n' >"$rx/vitest.config.ts" && git -C "$rx" commit -qam "a quoted key"
out=$(regx) && fail "check_regressions passed an exclusion under a quoted key (F2627): $out"
printf '%s\n' "$out" | grep -qF 'z/**' || fail "check_regressions did not name the entry under a quoted key: $out"
nameback
printf 'export default [globalIgnores(\n  ["docs/", "server/**"],\n  "name",\n), { ignores: ["packages/core/**"] }];\n' >"$rx/eslint.config.ts" && git -C "$rx" commit -qam "a list on the next line"
out=$(regx) && fail "check_regressions passed a globalIgnores list that starts on the next line (F2627): $out"
printf '%s\n' "$out" | grep -qF 'server/**' || fail "check_regressions did not name the entry on the next line: $out"
nameback
# F2623: a comment in a list is no entry. An apostrophe in one opened a string that ran across the list (the real vitest.config.ts has
# `// The server's entry`), so raising a floor was refused as an ignore added; a `]` in one ended the list early.
printf 'export default { test: { exclude: [\n  "a/**",\n  // The server'"'"'s entry, see [1]\n  "b/**",\n], coverage: { thresholds: { lines: 85 } } } };\n' >"$rx/vitest.config.ts"
git -C "$rx" commit -qam "a base with a comment in the list" && xbase=$(git -C "$rx" rev-parse HEAD)
sed 's/lines: 85/lines: 90/' "$rx/vitest.config.ts" >"$rx/v.tmp" && mv "$rx/v.tmp" "$rx/vitest.config.ts" && git -C "$rx" commit -qam "a floor raised"
out=$(regx) || fail "check_regressions refused a floor raised beside a comment with an apostrophe in a list (F2623): $out"
nameback
sed "s/The server's entry, see \[1\]/The entry, reworded/" "$rx/vitest.config.ts" >"$rx/v.tmp" && mv "$rx/v.tmp" "$rx/vitest.config.ts" && git -C "$rx" commit -qam "a comment reworded"
out=$(regx) || fail "check_regressions refused a comment reworded in a list (F2623): $out"
nameback
sed 's|^  "b/\*\*",|  "b/**",\n  "c/**",|' "$rx/vitest.config.ts" >"$rx/v.tmp" && mv "$rx/v.tmp" "$rx/vitest.config.ts" && git -C "$rx" commit -qam "an entry after the comment"
out=$(regx) && fail "check_regressions passed an entry added after a comment holding a bracket (F2623): $out"
printf '%s\n' "$out" | grep -qF 'c/**' || fail "check_regressions did not name c/** added after a comment: $out"
nameback
# The benches' budgets (G6), through the whole script on a small repository, which has no Vitest to list: a bench gone
# or given a longer budget fails unless a commit names it on a `Lowered-floor: bench <name> - why` line.
rg="$t/regr" && mkdir -p "$rg/scripts" "$rg/app/tests/bench" "$rg/app/src"
cp "$here/check_regressions.py" "$here/repo_files.py" "$here/borrow_node_modules.sh" "$rg/scripts/"
git -C "$rg" init -q
printf 'bench("a line [0.2 ms]", f);\nbench("a room [100 ms]", f);\n' >"$rg/app/tests/bench/a.bench.ts"
printf 'bench("a call in a file that is no bench [1 ms]", f);\n' >"$rg/app/src/x.ts" # only a `*.bench.ts(x)` file holds benches
git -C "$rg" add -A && git -C "$rg" commit -qm base && base=$(git -C "$rg" rev-parse HEAD)
reg() { (cd "$rg" && python3 -I scripts/check_regressions.py "$base" 2>&1); }
out=$(reg) || fail "check_regressions refused a branch that changed no bench: $out"
sed 's/\[100 ms\]/[1000 ms]/' "$rg/app/tests/bench/a.bench.ts" >"$rg/b" && mv "$rg/b" "$rg/app/tests/bench/a.bench.ts" && git -C "$rg" commit -qam "a longer budget"
out=$(reg) && fail "check_regressions passed a bench given a longer budget: $out"
printf '%s\n' "$out" | grep -qF "a room 100 ms -> 1000 ms" || fail "check_regressions did not name the bench with the longer budget: $out"
git -C "$rg" commit -q --allow-empty -m "says why" -m "Lowered-floor: bench a room - the plan moved it" && out=$(reg) || fail "check_regressions refused a longer budget a commit says why of: $out"
git -C "$rg" reset -q --hard "$base" && printf 'bench("a line [0.2 ms]", f);\n' >"$rg/app/tests/bench/a.bench.ts" && git -C "$rg" commit -qam "a bench gone"
out=$(reg) && fail "check_regressions passed a bench gone: $out"
printf '%s\n' "$out" | grep -qF "a room 100 ms -> gone" || fail "check_regressions did not name the bench gone: $out"
git -C "$rg" reset -q --hard "$base" && printf 'bench("a line [0.2 ms]", f);\nbench("a room [10 ms]", f);\nbench("a new one [5 ms]", f);\n' >"$rg/app/tests/bench/a.bench.ts" && git -C "$rg" rm -q app/src/x.ts && git -C "$rg" commit -qam "a shorter budget and a new bench"
out=$(reg) || fail "check_regressions refused a shorter budget and a new bench: $out"
# An approved picture changed or deleted in the index or the working tree, not yet committed, is judged too: the hook and the fast
# gate run this before the commit exists, so a diff of base..HEAD alone saw nothing (F2574). A picture the base never had is new.
git -C "$rg" reset -q --hard "$base"
mkdir -p "$rg/app/tests/e2e/home.spec.ts-snapshots" && printf 'one\n' >"$rg/app/tests/e2e/home.spec.ts-snapshots/a.png" && printf 'two\n' >"$rg/app/tests/e2e/home.spec.ts-snapshots/b.png"
git -C "$rg" add -A && git -C "$rg" commit -qm "two pictures" && base=$(git -C "$rg" rev-parse HEAD)
printf 'changed\n' >"$rg/app/tests/e2e/home.spec.ts-snapshots/a.png" && git -C "$rg" add -A
out=$(reg) && fail "check_regressions passed an approved picture changed in the index only (the commit does not hold it yet): $out"
printf '%s\n' "$out" | grep -qF "a.png" || fail "check_regressions did not name the picture changed in the index: $out"
git -C "$rg" reset -q --hard "$base" && git -C "$rg" rm -q app/tests/e2e/home.spec.ts-snapshots/b.png
out=$(reg) && fail "check_regressions passed an approved picture deleted in the index only: $out"
printf '%s\n' "$out" | grep -qF "b.png" || fail "check_regressions did not name the picture deleted in the index: $out"
git -C "$rg" reset -q --hard "$base" && printf 'changed\n' >"$rg/app/tests/e2e/home.spec.ts-snapshots/a.png"
out=$(reg) && fail "check_regressions passed an approved picture changed in the working tree only: $out"
git -C "$rg" reset -q --hard "$base" && printf 'new\n' >"$rg/app/tests/e2e/home.spec.ts-snapshots/c.png" && git -C "$rg" add -A
out=$(reg) || fail "check_regressions refused a new approved picture: $out"
git -C "$rg" reset -q --hard "$base"
# --quick, which the hook and the fast gate run per commit (F2579): the base's listing of tests is kept in the tools' cache, one per base commit,
# and a change of nothing but Vitest files, gno or Go sources, pictures and prose lists only the Vitest files it touches. A vitest that logs
# its calls stands for the real one; a listing with no file is a whole one. The merge check runs without it, whole and with no cache.
rq="$t/regq" && mkdir -p "$rq/scripts" "$rq/node_modules/.bin" "$rq/app/src"
cp "$here/check_regressions.py" "$here/repo_files.py" "$here/borrow_node_modules.sh" "$rq/scripts/"
cat >"$rq/node_modules/.bin/vitest" <<'EOF'
#!/usr/bin/env python3
import json, os, re, sys
a = sys.argv[1:]
out = next((x.split("=", 1)[1] for x in a if x.startswith("--json=")), None)
files = [x for x in a[1:] if not x.startswith("--")]
open(os.environ["VT_LOG"], "a").write(os.getcwd() + " " + " ".join(files) + "\n")
found = []
for d, ds, fs in os.walk("."):
    ds[:] = [x for x in ds if x not in ("node_modules", ".git")]
    for f in fs:
        p = os.path.join(d, f)
        if f.endswith(".test.ts") and (not files or any(x in p for x in files)):
            names = re.findall(r'test\("([^"]+)"', open(p).read())
            if os.path.exists(p[:-len(".test.ts")] + ".data"):  # names a test file generates from data, which a source file's change can rename
                names += open(p[:-len(".test.ts")] + ".data").read().split()
            found += [{"file": os.path.abspath(p), "name": n} for n in names]
json.dump(found, open(out, "w") if out else sys.stdout)
EOF
chmod +x "$rq/node_modules/.bin/vitest"
git -C "$rq" init -q && printf 'node_modules/\n' >"$rq/.gitignore" && : >"$rq/vitest.config.ts"
printf 'test("a one", f);\ntest("a two", f);\n' >"$rq/app/src/a.test.ts" && printf 'test("b one", f);\n' >"$rq/app/src/b.test.ts" && printf 'x\n' >"$rq/app/src/c.ts" && printf 'gen1 gen2\n' >"$rq/app/src/a.data"
git -C "$rq" add -A && git -C "$rq" commit -qm base && qbase=$(git -C "$rq" rev-parse HEAD)
reqq() { : >"$t/vt.log" && (cd "$rq" && VT_LOG="$t/vt.log" GNOWORLD_TOOLS="$t/rtools" python3 -I scripts/check_regressions.py "$@" 2>&1); }
wholes() { grep -c ' $' "$t/vt.log" || :; }
back() { git -C "$rq" reset -q --hard "$qbase" && git -C "$rq" clean -qfd; }
printf 'test("b new", f);\n' >"$rq/app/src/b.test.ts"
out=$(reqq --quick "$qbase") && fail "check_regressions --quick passed a test gone: $out"
printf '%s\n' "$out" | grep -qF "app/src/b.test.ts > b one" || fail "check_regressions --quick did not name the test gone: $out"
[ "$(wholes)" = 1 ] || fail "check_regressions --quick listed $(wholes) whole times, not once (the base's, which nothing cached yet): $(cat "$t/vt.log")"
grep -q ' app/src/b.test.ts$' "$t/vt.log" && ! grep -q 'a.test.ts' "$t/vt.log" || fail "check_regressions --quick did not list the one file the change touches: $(cat "$t/vt.log")"
[ -f "$t/rtools/regressions/base-$qbase.json" ] || fail "check_regressions --quick did not keep the base's listing in the tools' cache"
out=$(reqq --quick "$qbase") && fail "check_regressions --quick passed a test gone, with the base cached: $out"
[ "$(wholes)" = 0 ] || fail "check_regressions --quick listed the base again, though its listing is cached: $(cat "$t/vt.log")"
out=$(reqq "$qbase") && fail "check_regressions without --quick passed a test gone: $out"
[ "$(wholes)" = 2 ] || fail "check_regressions without --quick did not list the base and the tree whole ($(wholes) whole listings): $(cat "$t/vt.log")"
git -C "$rq" commit -qam "a test replaced" -m "Removed-test: app/src/b.test.ts > b one - replaced by b new"
out=$(reqq --quick "$qbase") || fail "check_regressions --quick refused a test gone that a commit says why of: $out"
back
rm -f "$rq/app/src/a.test.ts" && git -C "$rq" add -A
out=$(reqq --quick "$qbase") && fail "check_regressions --quick passed a test file deleted: $out"
printf '%s\n' "$out" | grep -qF "app/src/a.test.ts > a one" || fail "check_regressions --quick did not name the tests of the deleted file: $out"
back
printf 'test("b new", f);\n' >"$rq/app/src/b.test.ts" && printf 'y\n' >>"$rq/app/src/c.ts"
out=$(reqq --quick "$qbase") && fail "check_regressions --quick passed a test gone beside a change of another file: $out"
printf '%s\n' "$out" | grep -qF "app/src/b.test.ts > b one" || fail "check_regressions --quick did not name the test gone beside a change of another file: $out"
[ "$(wholes)" = 0 ] || fail "check_regressions --quick listed the tree whole for a change beside the test files, not the touched file alone ($(wholes) whole listings): $(cat "$t/vt.log")"
grep -q ' app/src/b.test.ts$' "$t/vt.log" && ! grep -q 'a.test.ts' "$t/vt.log" || fail "check_regressions --quick did not list the touched test file alone beside a change of another file: $(cat "$t/vt.log")"
back
# A non-test file that renames what a test generates: the quick run, which lists the touched test files alone, does not see it; the whole run does.
printf 'gen1 genX\n' >"$rq/app/src/a.data"
out=$(reqq --quick "$qbase") || fail "check_regressions --quick refused a rename its touched-files listing cannot see: $out"
out=$(reqq "$qbase") && fail "check_regressions without --quick passed a test renamed by a non-test file: $out"
printf '%s\n' "$out" | grep -qF "app/src/a.test.ts > gen2" || fail "check_regressions without --quick did not name the test a non-test file renamed: $out"
back
# A Playwright spec is no Vitest file: its names are not listed from the touched files, so the tree is listed whole.
mkdir -p "$rq/app/tests" && printf 'y\n' >"$rq/app/tests/a.spec.ts"
out=$(reqq --quick "$qbase") || fail "check_regressions --quick refused a new Playwright spec: $out"
[ "$(wholes)" = 1 ] || fail "check_regressions --quick did not list the tree whole for a change of a Playwright spec ($(wholes) whole listings): $(cat "$t/vt.log")"
back
printf 'test("new", f);\n' >"$rq/app/src/d.test.ts"
out=$(reqq --quick "$qbase") || fail "check_regressions --quick refused a new test file: $out"
grep -q ' app/src/d.test.ts$' "$t/vt.log" || fail "check_regressions --quick did not list a new, untracked test file: $(cat "$t/vt.log")"
back
fi

if part ergo; then
# ergo.sh builds the pinned Ergo once into the tools' cache, checks what it finds there, and refuses
# what it cannot build (slice 3b). Stubs stand for git and go; each logs its call.
e="$t/ergo" && mkdir -p "$e/repo/deploy/ergo" "$e/bin" "$e/nogo"
pin=0123456789abcdef0123456789abcdef01234567
printf 'v9.9.9 %s\n' "$pin" >"$e/repo/deploy/ergo/VERSION"
cat >"$e/bin/git" <<'EOF'
#!/bin/sh
echo "git $*" >>"$STUB_LOG"
case "$1" in
clone) for last; do :; done; mkdir -p "$last/.git" ;;
-C) echo "$STUB_COMMIT" ;;
esac
EOF
cat >"$e/bin/go" <<'EOF'
#!/bin/sh
echo "go CGO_ENABLED=$CGO_ENABLED $*" >>"$STUB_LOG"
[ -z "$STUB_GO_FAILS" ] || exit 2
printf '#!/bin/sh\necho ergo-%s\n' "$(printf '%s' "$*" | sed 's/.*main\.version=\([^ ]*\).*/\1/')" >ergo && chmod +x ergo
EOF
chmod +x "$e/bin/git" "$e/bin/go" && cp "$e/bin/git" "$e/nogo/git"
ergo_sh() { (cd "$e/repo" && GNOWORLD_TOOLS="$e/tools" STUB_LOG="$e/log" STUB_COMMIT="${commit:-$pin}" STUB_GO_FAILS="${go_fails:-}" PATH="${path:-$e/bin:$PATH}" /bin/sh "$here/ergo.sh" 2>"$e/err"); }
builds() { : >"$e/log" && out=$(ergo_sh) && grep -q '^go CGO_ENABLED=[^ ]* build ' "$e/log" && [ "$out" = "$e/tools/ergo-$1/ergo" ]; }
builds v9.9.9 || fail "ergo.sh did not build the pinned Ergo when none was cached: $(cat "$e/err")"
# The flags the spike found: static, paths trimmed, and the sqlite tag persistent history needs.
grep -q '^go CGO_ENABLED=0 build -trimpath -tags i18n mysql postgresql sqlite ' "$e/log" || fail "ergo.sh built without its flags: $(cat "$e/log")"
: >"$e/log" && [ "$(ergo_sh)" = "$e/tools/ergo-v9.9.9/ergo" ] && ! grep -q '^go' "$e/log" || fail "ergo.sh built again an Ergo it had"
printf '\n' >>"$e/tools/ergo-v9.9.9/ergo"
builds v9.9.9 || fail "ergo.sh ran a cached binary whose SHA-256 changed"
rm "$e/tools/ergo-v9.9.9/ergo.sha256"
builds v9.9.9 || fail "ergo.sh ran a cached binary with no SHA-256 beside it"
printf '#!/bin/sh\necho ergo-v0.0.1\n' >"$e/tools/ergo-v9.9.9/ergo" && (cd "$e/tools/ergo-v9.9.9" && shasum -a 256 ergo >ergo.sha256)
builds v9.9.9 || fail "ergo.sh ran a cached binary of another version"
printf 'v9.9.10 %s\n' "$pin" >"$e/repo/deploy/ergo/VERSION"
builds v9.9.10 || fail "ergo.sh did not build a changed pin"
rm -r "$e/tools"
# Each in a subshell: sh keeps an assignment made before a function's call once it returns.
(path="$e/nogo" ergo_sh) >/dev/null && fail "ergo.sh passed with no go to build"
grep -q 'go is needed' "$e/err" || fail "ergo.sh did not say go is missing: $(cat "$e/err")"
(go_fails=1 ergo_sh) >/dev/null && fail "ergo.sh passed a failed build"
grep -q 'building Ergo v9.9.10 failed' "$e/err" || fail "ergo.sh did not say the build failed: $(cat "$e/err")"
rm -r "$e/tools"
(commit=fedcba9876543210fedcba9876543210fedcba98 ergo_sh) >/dev/null && fail "ergo.sh built a clone at another commit than the pin"
grep -q "is not commit $pin" "$e/err" || fail "ergo.sh did not name the commit it wanted: $(cat "$e/err")"
# A pin it cannot trust names no folder and no commit: refused before anything runs.
for bad in "" "v9.9.9" "v9.9.9 $pin extra" "v9.9.9 0123" "v9.9.9 ${pin%?}G" "v9/../../x $pin" "9.9.9 $pin"; do
	printf '%s\n' "$bad" >"$e/repo/deploy/ergo/VERSION" && : >"$e/log"
	ergo_sh >/dev/null && fail "ergo.sh took the pin '$bad'"
	grep -q 'deploy/ergo/VERSION' "$e/err" && [ ! -s "$e/log" ] || fail "ergo.sh ran something on the pin '$bad', or did not name the file: $(cat "$e/err")"
done
fi

if part worktrees; then
# repo_files.worktree, which harness_mutate and prove_fix make their copies with: a run killed before its cleanup
# leaves its copy; the next run removes it, its owner's pid gone, and never a live run's (two merge checks may run
# at once), nor a copy no run marked.
w="$t/wt"
mkdir -p "$w/repo" "$w/tmp" && git -C "$w/repo" init -q && echo x >"$w/repo/a" && git -C "$w/repo" add a && git -C "$w/repo" commit -qm x
tmp="$w/tmp"
sh -c 'exit 0' &
dead=$!
wait "$dead"
mkdir -p "$tmp/dead" "$tmp/live" "$tmp/other"
git -C "$w/repo" worktree add -q --detach "$tmp/dead/tree" && echo "$dead" >"$tmp/dead/owner"
git -C "$w/repo" worktree add -q --detach "$tmp/live/tree" && echo "$$" >"$tmp/live/owner"
git -C "$w/repo" worktree add -q --detach "$tmp/other/tree"
# A run killed while it holds its copy: the next run clears it, by the pid it wrote.
(cd "$w/repo" && TMPDIR="$tmp" exec python3 -I -c 'import sys, time; sys.dont_write_bytecode = True; sys.path.insert(0, sys.argv[1]); from repo_files import worktree
with worktree("HEAD"): print("in", flush=True); time.sleep(60)' "$here" >"$w/killed" 2>&1) &
victim=$!
tries=0
until grep -q '^in$' "$w/killed" 2>/dev/null; do
	tries=$((tries + 1))
	[ "$tries" -lt 300 ] || fail "repo_files.worktree never held its copy: $(cat "$w/killed")"
	sleep 0.1
done
kill -9 "$victim"
wait "$victim" 2>/dev/null || :
[ "$(ls "$tmp" | grep -vc '^\(dead\|live\|other\)$')" = 1 ] || fail "the killed run left no copy to clear: $(ls "$tmp")"
# Two copies held at once, beside a dead run's `tree` entry: two names, and none is `tree` (F1191: from 2026-10-27
# the sandbox refuses to create exactly `.git/worktrees/tree`, so a copy named so failed every prove_fix).
(cd "$w/repo" && TMPDIR="$tmp" python3 -I -c 'import os, sys; sys.dont_write_bytecode = True; sys.path.insert(0, sys.argv[1]); from repo_files import worktree
with worktree("HEAD") as a, worktree("HEAD") as b: print(a); print(b); print(*os.listdir(".git/worktrees"))' "$here" >"$w/out" 2>&1) || fail "repo_files.worktree failed beside a dead run's copy: $(cat "$w/out")"
[ "$(basename "$(sed -n 1p "$w/out")")" != "$(basename "$(sed -n 2p "$w/out")")" ] || fail "two copies held at once got one name: $(cat "$w/out")"
for n in 1 2; do [ "$(basename "$(sed -n "${n}p" "$w/out")")" != tree ] || fail "a copy is named tree, which the sandbox may refuse: $(cat "$w/out")"; done
case " $(sed -n 3p "$w/out") " in *" tree "*) fail "a copy is registered as .git/worktrees/tree: $(cat "$w/out")" ;; esac
[ ! -e "$tmp/dead" ] || fail "a killed run's copy was left: $(ls "$tmp")"
[ "$(git -C "$w/repo" worktree list --porcelain | grep -c 'dead/tree')" = 0 ] || fail "a killed run's worktree stayed registered"
[ -d "$tmp/live/tree" ] || fail "a live run's copy was removed"
[ -d "$tmp/other/tree" ] || fail "a copy no run marked was removed"
[ "$(ls "$tmp" | grep -vc '^\(live\|other\)$')" = 0 ] || fail "repo_files.worktree left its own copy: $(ls "$tmp")"
fi

if part worktree_script; then
# worktree.sh: a worktree of a new branch, ready for the gate, from the tree it runs in: the packages linked one by
# one (a whole-folder link hides them from borrow_node_modules.sh), a workspace's @gnoworld links leading into the
# new tree, Vite's caches its own, StrykerJS's incremental file seeded.
ws="$t/ws"
mkdir -p "$ws/src/node_modules/pkg" "$ws/src/node_modules/.vite/deps" "$ws/src/app/node_modules/@gnoworld" "$ws/src/packages/core" "$ws/src/reports"
git -C "$ws/src" init -q
printf 'node_modules/\nreports/\n' >"$ws/src/.gitignore" && echo x >"$ws/src/packages/core/a.ts"
for f in pnpm-lock.yaml package.json app/package.json packages/core/package.json; do echo "$f" >"$ws/src/$f"; done
git -C "$ws/src" add -A && git -C "$ws/src" commit -qm x
echo pkg >"$ws/src/node_modules/pkg/index.js" && echo stale >"$ws/src/node_modules/.vite/deps/x"
ln -s ../../../packages/core "$ws/src/app/node_modules/@gnoworld/core"
(cd "$ws/src" && sh "$here/worktree.sh" "$ws/new" feature HEAD) >"$ws/out" 2>&1 || fail "worktree.sh failed: $(cat "$ws/out")"
[ "$(git -C "$ws/new" rev-parse --abbrev-ref HEAD)" = feature ] || fail "worktree.sh made no branch feature"
[ -d "$ws/new/node_modules" ] && [ ! -L "$ws/new/node_modules" ] || fail "worktree.sh linked node_modules whole, which borrow_node_modules.sh cannot see into"
[ -L "$ws/new/node_modules/pkg" ] && [ "$(cat "$ws/new/node_modules/pkg/index.js")" = pkg ] || fail "worktree.sh did not link the packages"
[ -d "$ws/new/node_modules/.vite" ] && [ ! -L "$ws/new/node_modules/.vite" ] && [ -z "$(ls -A "$ws/new/node_modules/.vite")" ] || fail "worktree.sh shared Vite's cache, which each tree writes"
[ -d "$ws/new/node_modules/.vite-temp" ] || fail "worktree.sh gave Vite no temp folder of its own"
[ "$(cd "$ws/new/app/node_modules/@gnoworld/core" && pwd -P)" = "$(cd "$ws/new/packages/core" && pwd -P)" ] || fail "worktree.sh's @gnoworld/core leads out of the new tree"
[ -z "$(git -C "$ws/new" status --porcelain)" ] || fail "worktree.sh left the new tree dirty: $(git -C "$ws/new" status --porcelain)"
(cd "$ws/src" && sh "$here/worktree.sh" "$ws/new" other HEAD) >/dev/null 2>&1 && fail "worktree.sh wrote over a folder that exists"
mkdir "$ws/empty" && (cd "$ws/src" && sh "$here/worktree.sh" "$ws/empty" another HEAD) >/dev/null 2>&1 && fail "worktree.sh took an empty folder that exists, which git would fill"
(cd "$ws/src" && sh "$here/worktree.sh" "$ws/x") >/dev/null 2>&1 && fail "worktree.sh ran with no branch named"
[ ! -e "$ws/x" ] || fail "worktree.sh made a folder for a call it refused"
# The packages are the source tree's, linked: a base whose lockfile or package files are not this tree's would run the gate on
# packages its own lockfile does not name, and a `pnpm install` there would write into this tree's install (security-S5).
# It is refused, whichever package file differs, and makes nothing: no folder, no branch. A base git cannot read refuses too.
installed=$(git -C "$ws/src" rev-parse HEAD)
for f in pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs .pnpmfile.mjs .npmrc package.json app/package.json packages/core/package.json; do
	echo changed >>"$ws/src/$f" && git -C "$ws/src" add -A && git -C "$ws/src" commit -qm "$f moves"
	out=$(cd "$ws/src" && sh "$here/worktree.sh" "$ws/old" "old-${f##*/}" "$installed" 2>&1) && fail "worktree.sh made a tree of a base whose $f is not this tree's: $out"
	printf '%s\n' "$out" | grep -qF "$f" || fail "worktree.sh did not name the package file $f that differs: $out"
	[ ! -e "$ws/old" ] && ! git -C "$ws/src" rev-parse -q --verify "old-${f##*/}" >/dev/null || fail "worktree.sh made a folder or a branch for a base whose $f differs"
	git -C "$ws/src" reset -q --hard "$installed"
done
echo changed >>"$ws/src/app/package.json"
out=$(cd "$ws/src" && sh "$here/worktree.sh" "$ws/dirty" dirty HEAD 2>&1) && fail "worktree.sh made a tree beside a package file of this one changed and not committed: $out"
git -C "$ws/src" checkout -q -- app/package.json
out=$(cd "$ws/src" && sh "$here/worktree.sh" "$ws/gone" gone nosuchbase 2>&1) && fail "worktree.sh made a tree of a base git cannot read: $out"
[ ! -e "$ws/gone" ] || fail "worktree.sh made a folder for a base git cannot read"
# An argument that starts with - is an option for git, never a name: a base `--output=<file>` made git diff truncate a file
# outside the scratch copy (CR6); a branch or a folder so named is as wrong. Each is refused, and makes nothing.
echo victim >"$ws/victim"
for args in "$ws/opt1 optbranch --output=$ws/victim" "$ws/opt2 --optbranch HEAD" "-optdir optbranch2 HEAD"; do
	set -- $args
	out=$(cd "$ws/src" && sh "$here/worktree.sh" "$@" 2>&1) && fail "worktree.sh took an argument that starts with a dash: $args: $out"
	printf '%s\n' "$out" | grep -qF "starts with -" || fail "worktree.sh did not say which argument starts with a dash: $args: $out"
done
[ "$(cat "$ws/victim")" = victim ] || fail "worktree.sh let a base of git's options write a file: $(cat "$ws/victim")"
[ ! -e "$ws/opt1" ] && [ ! -e "$ws/opt2" ] && [ ! -e "$ws/src/-optdir" ] || fail "worktree.sh made a folder for an argument that starts with a dash"
for b in optbranch --optbranch optbranch2; do ! git -C "$ws/src" rev-parse -q --verify "refs/heads/$b" >/dev/null || fail "worktree.sh made the branch $b for a refused call"; done
# A base that is no commit (a blob, a tree) is refused before anything is made; so is a root node_modules that is one link,
# which the script could not take apart once the tree stood (CR6).
out=$(cd "$ws/src" && sh "$here/worktree.sh" "$ws/blob" blobbranch HEAD:package.json 2>&1) && fail "worktree.sh made a tree of a base that is a blob: $out"
printf '%s\n' "$out" | grep -qF "is no commit" || fail "worktree.sh did not say a base is no commit: $out"
[ ! -e "$ws/blob" ] && ! git -C "$ws/src" rev-parse -q --verify blobbranch >/dev/null || fail "worktree.sh made a folder or a branch for a base that is no commit"
mv "$ws/src/node_modules" "$ws/src/real_modules" && ln -s real_modules "$ws/src/node_modules"
out=$(cd "$ws/src" && sh "$here/worktree.sh" "$ws/linked" linkedbranch HEAD 2>&1) && fail "worktree.sh made a tree of a root node_modules that is one link: $out"
printf '%s\n' "$out" | grep -qF "node_modules is a link" || fail "worktree.sh did not say the root node_modules is a link: $out"
[ ! -e "$ws/linked" ] && ! git -C "$ws/src" rev-parse -q --verify linkedbranch >/dev/null || fail "worktree.sh made a folder or a branch beside a node_modules that is one link"
rm "$ws/src/node_modules" && mv "$ws/src/real_modules" "$ws/src/node_modules"
# A step that fails once the tree stands undoes the tree and the branch: the next run names the same folder (CR6).
mkdir "$ws/scripts" && cp "$here/worktree.sh" "$ws/scripts/" && printf '#!/bin/sh\nexit 1\n' >"$ws/scripts/borrow_node_modules.sh"
out=$(cd "$ws/src" && sh "$ws/scripts/worktree.sh" "$ws/half" halfbranch HEAD 2>&1) && fail "worktree.sh went on after a step failed: $out"
[ ! -e "$ws/half" ] || fail "worktree.sh left the folder of a tree that failed half-made"
! git -C "$ws/src" rev-parse -q --verify halfbranch >/dev/null || fail "worktree.sh left the branch of a tree that failed half-made"
git -C "$ws/src" worktree list | grep -qF "$ws/half" && fail "worktree.sh left $ws/half registered"
# So does a signal that stops it once the tree stands (R6): the borrow step, here, sends its parent each in turn. In bash (macOS's sh)
# the EXIT trap runs even when a signal kills the shell, in dash (Linux's sh) only the trap on the signals makes it run: both are tried.
# SIGINT is ignored by a script started in the background, as this suite's sections are: python resets it to its default first.
for shell in sh dash; do
	command -v "$shell" >/dev/null || continue
	for sig in HUP INT TERM; do
		tag=$shell$sig
		printf '#!/bin/sh\nkill -%s "$PPID"\nsleep 1\n' "$sig" >"$ws/scripts/borrow_node_modules.sh"
		out=$(cd "$ws/src" && python3 -I -c 'import signal, subprocess, sys
signal.signal(signal.SIGINT, signal.SIG_DFL)
sys.exit(subprocess.run(sys.argv[1:]).returncode)' "$shell" "$ws/scripts/worktree.sh" "$ws/$tag" "$tag" HEAD 2>&1) && fail "worktree.sh finished a run that got SIG$sig in $shell: $out"
		[ ! -e "$ws/$tag" ] || fail "worktree.sh left the folder of a tree stopped by SIG$sig in $shell"
		! git -C "$ws/src" rev-parse -q --verify "$tag" >/dev/null || fail "worktree.sh left the branch of a tree stopped by SIG$sig in $shell"
		git -C "$ws/src" worktree list | grep -qF "$ws/$tag" && fail "worktree.sh left $ws/$tag registered after SIG$sig in $shell"
	done
done
(cd "$ws/src" && sh "$here/worktree.sh" "$ws/same" same HEAD) >/dev/null 2>&1 || fail "worktree.sh refused a base whose package files are this tree's"
# A workspace's .bin reached through a link (a tree whose packages were linked by hand) is borrowed as a folder of its own:
# the probe deletes a tool in its copy, which went through the link and deleted the main tree's (F2127).
mkdir -p "$ws/bins/.bin" "$ws/src/packages/core/node_modules" "$ws/borrowed" && echo tool >"$ws/bins/.bin/storybook"
ln -s "$ws/bins/.bin" "$ws/src/packages/core/node_modules/.bin"
(cd "$ws/src" && sh "$here/borrow_node_modules.sh" "$ws/borrowed") >"$ws/out" 2>&1 || fail "borrow_node_modules.sh failed on a linked .bin: $(cat "$ws/out")"
[ -d "$ws/borrowed/packages/core/node_modules/.bin" ] && [ ! -L "$ws/borrowed/packages/core/node_modules/.bin" ] || fail "borrow_node_modules.sh kept a workspace's .bin a link into the tree it borrows from"
[ "$(cat "$ws/borrowed/packages/core/node_modules/.bin/storybook")" = tool ] || fail "borrow_node_modules.sh left the linked .bin's tools behind"
rm "$ws/borrowed/packages/core/node_modules/.bin/storybook"
[ -f "$ws/bins/.bin/storybook" ] || fail "a tool deleted in the borrowed copy was deleted where its .bin's link led (F2127)"
# A relative link, as a hand-made one into another tree's store would be, borrowed the same way; a real .bin stays as it is.
mkdir -p "$ws/src/packages/ui/node_modules" "$ws/src/app/node_modules/.bin" "$ws/borrowed2" && echo own >"$ws/src/app/node_modules/.bin/vite"
ln -s ../../../../bins/.bin "$ws/src/packages/ui/node_modules/.bin"
[ -f "$ws/src/packages/ui/node_modules/.bin/storybook" ] || fail "the relative .bin link of this case leads nowhere"
(cd "$ws/src" && sh "$here/borrow_node_modules.sh" "$ws/borrowed2") >"$ws/out" 2>&1 || fail "borrow_node_modules.sh failed on a relative .bin link: $(cat "$ws/out")"
[ ! -L "$ws/borrowed2/packages/ui/node_modules/.bin" ] && rm "$ws/borrowed2/packages/ui/node_modules/.bin/storybook" && [ -f "$ws/bins/.bin/storybook" ] ||
	fail "a tool deleted in the borrowed copy of a relative .bin link was deleted where the link led (F2127)"
[ -d "$ws/borrowed2/app/node_modules/.bin" ] && [ ! -L "$ws/borrowed2/app/node_modules/.bin" ] && [ "$(cat "$ws/borrowed2/app/node_modules/.bin/vite")" = own ] ||
	fail "borrow_node_modules.sh did not keep a real .bin as it is"
fi

if part bench; then
# bench.py: each bench names its budget in brackets and the mean of its runs stays under it; one past it, one with no
# budget, none at all, or a run that fails, fails the gate. A fake Vitest writes the report it is given.
b="$t/bench"
mkdir -p "$b/node_modules/.bin" # bench.py runs the Vitest of its own root, where the stub stands
printf '#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = --outputJson ] && cp "$BENCH_FIXTURE" "$2"; shift; done\nexit "${BENCH_EXIT:-0}"\n' >"$b/node_modules/.bin/vitest" && chmod +x "$b/node_modules/.bin/vitest"
report() { python3 -I -c 'import json, sys
pairs = zip(sys.argv[2::2], sys.argv[3::2])
json.dump({"files": [{"filepath": "a.bench.ts", "groups": [{"fullName": "g", "benchmarks": [{"name": n, "mean": float(m)} for n, m in pairs]}]}]}, open(sys.argv[1], "w"))' "$b/report.json" "$@"; }
# A quiet machine's load, so these cases never wait on the real one (bench.py reads scripts/load.py before it measures; the cases of
# the wait itself are the section bench_load's): a copy of the script beside a load.py that says 1.0 on 16 cores.
mkdir -p "$b/scripts" && cp "$here/bench.py" "$here/repo_files.py" "$b/scripts/" && printf 'print("10 160")\n' >"$b/scripts/load.py"
bench() { (cd "$b" && BENCH_FIXTURE="$b/report.json" python3 -I scripts/bench.py 2>&1); }
report "a line [0.2 ms]" 0.05 "a room [100 ms]" 14.5
out=$(bench) || fail "bench.py refused benches within their budgets: $out"
printf '%s\n' "$out" | grep -q "0.0500 ms of 0.2 ms: a line" || fail "bench.py did not print a measure and its budget: $out"
report "a line [0.2 ms]" 0.25 "a room [100 ms]" 14.5
out=$(bench) && fail "bench.py passed a bench over its budget"
printf '%s\n' "$out" | grep -q "a line \[0.2 ms\]: 0.2500 ms, over its 0.2 ms" || fail "bench.py did not name the bench over its budget: $out"
report "a line" 0.05
out=$(bench) && fail "bench.py passed a bench with no budget"
printf '%s\n' "$out" | grep -q "names no budget" || fail "bench.py did not say a bench names no budget: $out"
report
(bench) >/dev/null && fail "bench.py passed a run with no bench"
report "a line [0.2 ms]" 0.05
(BENCH_EXIT=1 bench) >/dev/null && fail "bench.py passed a Vitest run that failed"
# A bench whose function throws stays in Vitest's report with no sample and no mean, and the run ends 0 (F1213): the
# gate fails, saying so, not with a traceback.
printf '{"files": [{"groups": [{"benchmarks": [{"name": "a line [0.2 ms]", "samples": []}, {"name": "a room [100 ms]", "mean": 14.5}]}]}]}\n' >"$b/report.json"
out=$(bench) && fail "bench.py passed a bench that took no sample: $out"
printf '%s\n' "$out" | grep -q "a line \[0.2 ms\]: took no sample" || fail "bench.py did not say which bench took no sample: $out"
printf '%s\n' "$out" | grep -q "Traceback" && fail "bench.py crashed on a bench with no mean: $out"
# A bench the sources name that the report lacks was switched off: `describe.skip(...)` around it, or `.only` on a
# neighbour, leaves it out of Vitest's report and the run ends 0 (security-S1). Each bench a `*.bench.ts(x)` source
# names must be in the report, whatever its folder; a file in node_modules is no source of the repository's.
mkdir -p "$b/app/tests/bench" "$b/node_modules/pkg"
printf 'bench("a line [0.2 ms]", f);\n' >"$b/app/tests/bench/a.bench.ts"
printf 'describe.skip("rooms", () => {\n  bench(\n    "a room [100 ms]",\n    f,\n  );\n});\n' >"$b/app/tests/bench/b.bench.tsx"
printf 'bench("a dependency [1 ms]", f);\n' >"$b/node_modules/pkg/c.bench.ts"
printf 'bench("a helper that is no bench file [1 ms]", f);\n' >"$b/app/tests/bench/helper.ts"
report "a line [0.2 ms]" 0.05 "a room [100 ms]" 14.5
out=$(bench) || fail "bench.py refused a report holding every bench the sources name: $out"
report "a line [0.2 ms]" 0.05
out=$(bench) && fail "bench.py passed with a bench of the sources (a switched-off describe) missing from its report: $out"
printf '%s\n' "$out" | grep -qF "a room [100 ms]: " || fail "bench.py did not name the bench missing from the report: $out"
printf '%s\n' "$out" | grep -qF "a dependency" && fail "bench.py read a bench of node_modules as the repository's: $out"
printf '%s\n' "$out" | grep -qF "a helper" && fail "bench.py read a file that is no bench file as one: $out"
report "a room [100 ms]" 14.5
out=$(bench) && fail "bench.py passed with a bench of the sources (the one a .only left out) missing from its report: $out"
printf '%s\n' "$out" | grep -qF "a line [0.2 ms]: " || fail "bench.py did not name the bench a .only left out: $out"
# A path git prints quoted, "caf\303\251/d.bench.ts", is no file: the list read it as one it could not open, and a switched-off
# bench in such a folder went unseen (CR5). Every listing of repo_files.git (ls-files, ls-tree, diff) prints names as they are.
mkdir -p "$b/app/tests/bench/café" && printf 'bench("a café bench [1 ms]", f);\n' >"$b/app/tests/bench/café/d.bench.ts"
git -C "$b" init -q && printf 'node_modules/\n' >"$b/.gitignore"
out=$(cd "$b" && python3 -I -c 'import sys; sys.path.insert(0, sys.argv[1]); from repo_files import git; print(git("ls-files", "--others", "--exclude-standard"))' "$here")
printf '%s\n' "$out" | grep -qF "app/tests/bench/café/d.bench.ts" || fail "repo_files.git printed a path with an accent quoted: $out"
report "a line [0.2 ms]" 0.05 "a room [100 ms]" 14.5
out=$(bench) && fail "bench.py passed with a bench of a folder git quotes (café) missing from its report: $out"
printf '%s\n' "$out" | grep -qF "a café bench [1 ms]: " || fail "bench.py did not name the bench of the café folder missing from the report: $out"
rm -r "${b:?}/.git" "${b:?}/app" "${b:?}/node_modules/pkg" && rm "$b/.gitignore"
fi

if part mutant_scope; then
# suite_parts.py: harness_mutate --changed judges the mutants that rewrite a changed line, not all of a file's or a suite's;
# a verdict's key reads a suite by sections. A section of test_hooks.sh ends at the fi that closes it, nested ifs at the
# margin counted; one of probe.py at the next line as little indented.
python3 -I - "$here" <<'PY' || fail "suite_parts.py misread which sections a change touched (above)"
import sys
sys.dont_write_bytecode = True  # a mutant of the same size, written in the same second, would be read from its .pyc
sys.path.insert(0, sys.argv[1])
from suite_parts import code, parts, rewritten, select
def touched(path, old, new):  # parts' reading of a change: the sections whose text differs, None outside them
    (old_parts, old_outside), (new_parts, new_outside) = parts(path, old), parts(path, new)
    return None if old_outside != new_outside else {name for name in old_parts.keys() | new_parts.keys() if old_parts.get(name) != new_parts.get(name)}
sh = "pre\nif part a; then\nx\nif y; then\nz\nfi\nafter\nfi\nhelper() { :; }\nif part b; then\nw\nfi\n\nif part a; then\nv\nfi\ntrailer\n"
cases = [
    (sh, set(), "no change"),
    (sh.replace("w\n", "w2\n"), {"b"}, "a line of b"),
    (sh.replace("z\n", "z2\n"), {"a"}, "a line inside a's nested if"),
    (sh.replace("after\n", "after2\n"), {"a"}, "a line after a's nested if"),
    (sh.replace("v\n", "v2\n"), {"a"}, "a's second block"),
    (sh.replace("helper", "helper2"), None, "a helper between sections"),
    (sh.replace("pre", "pre2"), None, "the preamble"),
    (sh.replace("trailer", "trailer2"), None, "the trailer"),
    (sh.replace("helper() { :; }\n", "helper() { :; }\nif part c; then\nq\nfi\n"), {"c"}, "a new section"),
]
for new, want, what in cases:
    got = touched("scripts/test_hooks.sh", sh, new)
    assert got == want, f"test_hooks.sh, {what}: {got} for {want}"
# A one-line `if ...; fi` at the margin opens nothing: the sections after it still end where they do (G9).
oneline = sh.replace("x\n", "x\nif q; then r; fi\n")
assert touched("scripts/test_hooks.sh", sh, oneline) == {"a"}, "a one-line if added to a"
assert touched("scripts/test_hooks.sh", oneline, oneline.replace("w\n", "w2\n")) == {"b"}, "a one-line if swallowed the sections after it"
py = 'def f():\n    pass\n\n\ntry:\n    if part("a"):\n        x\n        if y:\n            z\n\n    if part("b"):\n        w\nfinally:\n    pass\n'
for new, want, what in [
    (py.replace("        w", "        w2"), {"b"}, "a line of b"),
    (py.replace("            z", "            z2"), {"a"}, "a's nested line"),
    (py.replace("    pass\n\n\ntry", "    pass2\n\n\ntry"), None, "a helper"),
    (py.replace("finally:\n    pass", "finally:\n    pass2"), None, "the end"),
]:
    got = touched("scripts/probe.py", py, new)
    assert got == want, f"probe.py, {what}: {got} for {want}"
text = "a\nb\nc\n"
for new, want, what in [
    ("a\nB\nc\n", {2}, "a line rewritten"),
    ("a\nc\n", {2}, "a line removed"),
    ("a\nb\nx\nc\n", {2, 3}, "a line added: the two beside it"),
    ("x\n" + text, {0, 1}, "a line added before the first"),
    ("A\nb\nC\n", {1, 2, 3}, "two lines: from the first to the last"),
]:
    assert rewritten(text, new) == want, f"{what}: {rewritten(text, new)} for {want}"
assert rewritten("a\na\n", "a\na\na\n") == {2, 3}, "a line added among its like"
assert rewritten("a\na\na\n", "a\na\n") == {3}, "a line removed among its like counts once, from one end"
found = [("g1", "a.sh", "A\nb\nc\n", "hooks"), ("g2", "a.sh", "a\nb\nC\n", "hooks"), ("g3", "b.py", "x2\n", "probe"), ("g4", "a.sh", None, "hooks"), ("g5", "c.sh", None, "hooks")]
original = {"a.sh": text, "b.py": "x\n"}.__getitem__
labels = lambda chosen: [m[0] for m in chosen]
assert labels(select(found, {"a.sh": {3}}, original)) == ["g2", "g4"], "a changed line asks for its mutants, and one with no text for its file"
assert labels(select(found, {"a.sh": {1, 3}, "b.py": {1}}, original)) == ["g1", "g2", "g3", "g4"], "lines of two files"
assert labels(select(found, {"a.sh": {2}}, original)) == ["g4"], "a changed line no mutant rewrites"
assert labels(select(found, {"a.sh": set()}, original)) == ["g4"], "a file changed by no line"
assert labels(select(found, {}, original)) == [], "nothing changed"
assert code("a\n\n  \nb\n\n") == "a\nb\n", "a blank line runs nothing"
assert code("a\n# b\n") == "a\n# b\n", "a comment stays: it may be a heredoc's text"
PY
fi

if part workflow_branch; then
# The Workflow branch (.claude/workflows/branch.js), run by Node with its globals stubbed: each agent answers as the case
# says, and the loop's verdict must follow (the reviews of slice-5-loop). An agent that dies blocks the loop, never counts as
# a clean report; the harness and realms bring their lenses whatever the arguments; the script numbers the findings; a third
# round's fix stops for Alexis; a second round re-runs only the lens whose high tier-1 finding was fixed.
command -v node >/dev/null || fail "node is needed to run the Workflow branch's cases"
node - "$here/../.claude/workflows/branch.js" <<'JS' || fail "the Workflow branch broke a promise (above)"
const { readFileSync } = require("node:fs");
const src = readFileSync(process.argv[2], "utf8").replace("export const meta", "const meta");
const body = new Function("agent", "parallel", "phase", "log", "args", "budget", `return (async () => {${src}\n})();`);
const ok = (cond, why) => { if (!cond) { console.error("workflow_branch: " + why); process.exit(1); } };
const finding = (severity, file) => ({ severity, file, scenario: "s", evidence: "e", fix: "f", beyondPlan: false });
async function run(answer, extra = {}) {
  const calls = [];
  const agent = async (prompt, o) => { calls.push({ label: o.label, prompt, agentType: o.agentType, schema: o.schema }); return answer(o.label, prompt, o); };
  const parallel = async (ts) => Promise.all(ts.map((t) => t().catch(() => null)));
  const r = await body(agent, parallel, () => {}, () => {}, { branch: "b", worktree: "w", plan: "p", brief: "x", shared: "s", ids: "F9000-F9049", ...extra }, { spent: () => 0 });
  return { r, labels: calls.map((c) => c.label), calls };
}
const gateOf = (files) => ({ passed: true, failingLane: "", tail: "", lastLine: "all checks passed in 412 s (budget 120 s)", exit: 0, survivors: [], files, relaxations: [], seconds: 1, branch: "b" });
const base = (files) => (l) =>
  l === "tests" ? { files: ["t"], seenFailing: true, notes: "" }
  : l === "red pass" ? { findings: [] }
  : l === "merge check" ? gateOf(files)
  : l === "build" || (l || "").startsWith("ledger") ? { commits: ["c"], notes: "", branch: "b" }
  : l === "reviewer" || l === "security" || l === "gno-auditor" ? { findings: [] }
  : l === "design-reviewer" ? { findings: [], framesMissing: false } : null;
(async () => {
  let t = await run(base(["app/src/a.ts"]));
  ok(t.r.status === "ready for the chief", `a clean branch is not ready: ${t.r.status}`);
  ok(!t.labels.includes("security") && !t.labels.some((l) => (l || "").startsWith("fix")), `a clean product branch ran ${t.labels}`);
  // A merge check's verdict is the script's, not the agent's word (reviewer-1-2, F2617): a run killed, timed out or left in the background has
  // no `all checks passed in N s` last line, and an agent saying `passed: true` over any other last line does not pass the step.
  for (const last of ["", "check.sh: lane probe failed at nginx", "py:check_nginx failed", "all checks passed", "all checks passed in s", "  all checks passed in 5 s", "ok all checks passed in 5 s", "killed\nall checks passed in 5 s"]) {
    t = await run((l, p) => (l === "merge check" ? { ...gateOf(["app/src/a.ts"]), lastLine: last } : base(["app/src/a.ts"])(l, p)));
    ok(t.r.status.startsWith("blocked at the merge check") && !t.labels.includes("reviewer"), `a merge check whose last line was '${last}' passed on the agent's word: ${t.r.status} ${t.labels}`);
    ok(t.calls.some((c) => (c.label || "").startsWith("gate fix") && c.prompt.includes("last line")), `a merge check with no pass line was not sent to a fixer with the reason: ${t.labels}`);
  }
  // A real last line, with the run's own time in it, passes; so does the same line of a run past its budget.
  t = await run((l, p) => (l === "merge check" ? { ...gateOf(["app/src/a.ts"]), lastLine: "all checks passed in 5 s" } : base(["app/src/a.ts"])(l, p)));
  ok(t.r.status === "ready for the chief", `a merge check ending in its pass line did not pass: ${t.r.status}`);
  // The gate's exit code is the other half of the proof (F2638): a last line that reads as a pass over an exit code that is not 0, or over
  // none reported, never passes.
  for (const code of [1, 2, 130, null, undefined, "0"]) {
    t = await run((l, p) => (l === "merge check" ? { ...gateOf(["app/src/a.ts"]), lastLine: "all checks passed in 5 s", exit: code } : base(["app/src/a.ts"])(l, p)));
    ok(t.r.status.startsWith("blocked at the merge check") && !t.labels.includes("reviewer"), `a merge check with exit ${code} and a pass line passed: ${t.r.status} ${t.labels}`);
    ok(t.calls.some((c) => (c.label || "").startsWith("gate fix") && c.prompt.includes("exit code")), `a merge check with exit ${code} was not sent to a fixer with the reason: ${t.labels}`);
  }
  t = await run((l, p) => (l === "merge check" ? { ...gateOf(["app/src/a.ts"]), exit: 0 } : base(["app/src/a.ts"])(l, p)));
  ok(t.r.status === "ready for the chief", `a merge check with exit 0 and its pass line did not pass: ${t.r.status}`);
  ok(t.calls.some((c) => c.label === "merge check" && c.schema.required.includes("exit") && c.prompt.includes("exit code")), "the merge check's schema or brief does not ask for the exit code");
  // A failure stays a failure whatever the line says.
  t = await run((l, p) => (l === "merge check" ? { ...gateOf(["app/src/a.ts"]), passed: false, failingLane: "probe", lastLine: "all checks passed in 5 s" } : base(["app/src/a.ts"])(l, p)));
  ok(t.r.status.startsWith("blocked"), `a merge check the agent called failed passed on its line: ${t.r.status}`);
  t = await run((l, p) => (l === "red pass" ? null : base(["app/src/a.ts"])(l, p)));
  ok(t.r.status.startsWith("blocked") && !t.labels.includes("build"), `a dead red pass let the build run: ${t.r.status} ${t.labels}`);
  t = await run((l, p) => (l === "reviewer" ? null : base(["app/src/a.ts"])(l, p)));
  ok(t.r.status.startsWith("blocked"), `a dead reviewer counted as a clean review: ${t.r.status}`);
  t = await run((l, p) => (l === "reviewer" ? { findings: [finding("high", "app/src/a.ts")] } : base(["app/src/a.ts"])(l, p)));
  ok(t.r.status.startsWith("blocked") && t.r.status.includes("open"), `a dead fixer left a high finding open as ready: ${t.r.status}`);
  // The harness and the realms bring their lenses with no argument saying so.
  t = await run(base(["scripts/check.sh", "gno/r/seal/gnomod.toml"]));
  ok(t.labels.includes("security") && t.labels.includes("gno-auditor"), `a harness and realm branch ran no security or gno lens: ${t.labels}`);
  // Two lenses' findings both numbered 1 by their agents: the script's ids tell them apart, and both reach the fixer.
  t = await run((l, p, o) =>
    l === "reviewer" ? { findings: [finding("high", "scripts/a.sh")] }
    : l === "security" ? { findings: [finding("medium", "scripts/b.sh")] }
    : (l || "").startsWith("fix round") ? { fixed: [{ id: "security-1-1", commit: "f1" }, { id: "reviewer-1-1", commit: "f2" }], notes: "", branch: "b" }
    : base(["scripts/a.sh"])(l, p));
  const fix = t.calls.find((c) => (c.label || "").startsWith("fix round"));
  ok(fix && fix.prompt.includes("security-1-1") && fix.prompt.includes("reviewer-1-1"), `two lenses' findings numbered alike did not both reach the fixer, each by its own id: ${fix && fix.prompt}`);
  // A high tier-1 finding each round: round 2 runs only its lens, on the diff since its fix; after the third, Alexis decides.
  const highEveryRound = (extra) => run((l, p, o) =>
    l === "security" ? { findings: [finding("high", "scripts/a.sh")] }
    : (l || "").startsWith("fix round") ? { fixed: [{ id: p.match(/"id":"(security-\d-1)"/)[1], commit: "f" + l.slice(-1) }], notes: "", branch: "b" }
    : base(["scripts/a.sh"])(l, p), extra);
  t = await highEveryRound();
  ok(t.r.status.startsWith("reconsider with Alexis"), `three rounds of high tier-1 findings ended as ${t.r.status}`);
  ok(t.labels.filter((l) => l === "reviewer").length === 1, `round 2 ran the reviewer again: ${t.labels}`);
  ok(t.calls.some((c) => c.label === "security" && c.prompt.includes("since f1^")), "round 2 did not read the diff since its first fix");
  // Read-only agents are told to write nothing; writers get the shared files.
  for (const c of t.calls) {
    const readOnly = ["red pass", "reviewer", "security", "gno-auditor", "design-reviewer"].includes(c.label);
    ok(readOnly ? c.prompt.includes("write nothing") && !c.prompt.includes("learnings.md") : c.prompt.includes("learnings.md"), `${c.label} was told the wrong way to write`);
  }
  // Each Bash command of an agent starts in the main checkout (the shell goes back there after every call): every one begins
  // with the cd, and a writer that committed on another branch than its own blocks the loop (slice-5a's commit on main).
  for (const c of t.calls) ok(c.prompt.includes('every Bash command begins with `cd "w" || exit 1`'), `${c.label} was not told to cd in every command`);
  let u = await run((l, p) => (l === "build" ? { commits: ["c"], notes: "", branch: "main" } : base(["app/src/a.ts"])(l, p)));
  ok(u.r.status.startsWith("blocked") && u.r.status.includes("main"), `a build committed on main was taken: ${u.r.status}`);
  // The files changed are git's, never the agent's own: a list holding .claude/tmp or an absolute path blocks the loop
  // (slice-5a's security lens skipped, the list naming the diff file the agent wrote).
  u = await run(base([".claude/tmp/diff.patch", "/tmp/x/report.md"]));
  ok(u.r.status.startsWith("blocked") && u.r.status.includes("files"), `a merge check's list of its own files was taken: ${u.r.status}`);
  // The ledger's numbers come from the branch's own range, which the chief gives (two branches took the same F numbers).
  for (const c of t.calls.filter((c) => (c.label || "").startsWith("ledger"))) ok(c.prompt.includes("F9000-F9049"), "the scribe was not given the branch's range of F numbers");
  // Every round's findings go to the ledger, a refuted or low one included.
  ok(t.labels.filter((l) => (l || "").startsWith("ledger")).length === 3, `not every round wrote its findings to the ledger: ${t.labels}`);
  // Every tier-1 product path of docs/REVIEW.md's table that exists starts the security lens by itself, with no `tier1` argument
  // (5e and 5f launched the security-reviewer by hand).
  const lensOf = async (file) => {
    const only = await run((l, p, o) =>
      l === "security" ? { findings: [finding("medium", file)] }
      : base([file])(l, p));
    return only.labels;
  };
  // Two files of each folder, so a prefix cut to one file fails (server/src/login/ is also ticket.ts and routes.ts).
  for (const file of ["app/src/csp.ts", "app/src/cspOrigins.ts", "app/src/cspForms.ts", "app/src/lib/chain/evalCall.ts", "deploy/test.sh", "deploy/compose.yaml", "deploy/web/nginx.conf", "packages/core/src/markdown/inline.ts", "packages/core/src/markdown/scan.ts",
    "app/src/lib/adena/adena.ts", "app/src/lib/adena/digest.ts", "server/src/login/login.ts", "server/src/login/ticket.ts", "server/src/roles/roles.ts", "server/roles.json",
    "app/src/sw/worker.ts", "app/src/sw/register.ts", "server/src/ergo/auth.ts", "app/src/features/login/logIn.ts", "app/src/features/login/LoginView.tsx",
    "app/src/lib/api/login.ts", "app/src/lib/ergo/ergo.ts", "app/src/lib/ergo/handshake.ts"]) {
    const labels = await lensOf(file);
    ok(labels.includes("security"), `a change of ${file} alone ran no security lens: ${labels}`);
  }
  // A lookalike is no tier-1 file.
  for (const file of ["deploy-notes/x.md", "server/src/loginx.ts", "app/src/lib/adenax/a.ts", "app/src/sw.ts.md", "packages/core/src/markdown.md"]) {
    const labels = await lensOf(file);
    ok(!labels.includes("security"), `${file}, a lookalike of a tier-1 path, started the security lens: ${labels}`);
  }
  // The design-reviewer (Alexis, 2026-10-31): a read-only agent that renders each changed screen at 1728 by 1080 and compares it with
  // the video's frames. It starts by itself when a branch changes how space looks (the scene, the planets, the cosmos; Alexis,
  // 2026-11-04: another screen is the reviewer's, with the frames, in one combined review), reports like the other lenses (numbered
  // findings, high and medium fixed), and frames missing fail the step, never skip it.
  {
    const withDesign = (files, design) => run((l, p, o) =>
      l === "design-reviewer" ? (design ? design(p, o) : { findings: [], framesMissing: false })
      : (l || "").startsWith("fix round") ? { fixed: [{ id: "design-reviewer-1-1", commit: "fd" }], notes: "", branch: "b" }
      : base(files)(l, p, o));
    for (const file of ["app/src/scene/space.ts", "packages/core/src/planet/look.ts", "packages/core/src/cosmos/cosmos.ts", "packages/core/src/space/drift.ts"]) {
      const d = await withDesign([file]);
      ok(d.labels.includes("design-reviewer"), `a change of ${file} alone started no design-reviewer: ${d.labels}`);
      ok(d.r.status === "ready for the chief", `a clean design review of ${file} did not end ready: ${d.r.status}`);
    }
    for (const file of ["server/src/a.ts", "docs/x.md", "app/tests/e2e/a.spec.ts", "app/srcx/a.ts", "packages/ui/srcs/a.ts", "packages/core/src/a.ts", "scripts/check.sh",
      "packages/ui/src/Button.tsx", "app/src/features/home/Home.tsx", "app/src/scenery/a.ts"]) {
      const d = await withDesign([file]);
      ok(!d.labels.includes("design-reviewer"), `${file}, which is no screen, started the design-reviewer: ${d.labels}`);
    }
    const d = await withDesign(["app/src/scene/space.ts"]);
    const call = d.calls.find((c) => c.label === "design-reviewer");
    ok(call.agentType === "design-reviewer", `the design lens ran as ${call.agentType}`);
    for (const word of ["1728", "1080", "docs/design/video-screens.md", "video-frames", "write nothing"])
      ok(call.prompt.includes(word), `the design-reviewer was not told ${word}: ${call.prompt}`);
    ok(!call.prompt.includes("learnings.md"), "the read-only design-reviewer was told to write the learnings");
    ok(call.schema.properties.framesMissing && call.schema.properties.findings, "the design-reviewer's answer has no framesMissing, or no findings");
    // Its findings follow the loop: numbered by its label, a medium one fixed, the round's findings to the ledger.
    const f = await withDesign(["app/src/scene/a.ts"], () => ({ findings: [finding("medium", "app/src/scene/a.ts")], framesMissing: false }));
    const fixCall = f.calls.find((c) => (c.label || "").startsWith("fix round"));
    ok(fixCall && fixCall.prompt.includes("design-reviewer-1-1"), `a medium design finding was not given to the fixer: ${fixCall && fixCall.prompt}`);
    ok(f.labels.includes("ledger 1"), `a design finding never reached the ledger: ${f.labels}`);
    // A screen and a tier-1 path in one change start both lenses; a finding fixed in round 1 starts no second design review, and a
    // second round for a tier-1 high finding runs its lens alone.
    const both = await withDesign(["app/src/scene/a.ts", "app/src/csp.ts"]);
    ok(both.labels.includes("design-reviewer") && both.labels.includes("security"), `a screen and a tier-1 path did not start both lenses: ${both.labels}`);
    const hi = await withDesign(["app/src/scene/a.ts"], () => ({ findings: [finding("high", "app/src/scene/a.ts")], framesMissing: false }));
    ok(hi.r.status === "ready for the chief", `a high design finding, fixed, did not end ready: ${hi.r.status}`);
    ok(hi.labels.filter((l) => l === "design-reviewer").length === 1, `the design-reviewer ran again after its finding was fixed: ${hi.labels}`);
    let secRuns = 0;
    const two = await run((l, p, o) =>
      l === "security" ? (secRuns++ ? { findings: [] } : { findings: [finding("high", "app/src/csp.ts")] })
      : (l || "").startsWith("fix round") ? { fixed: [{ id: "security-1-1", commit: "fs" }], notes: "", branch: "b" }
      : base(["app/src/csp.ts", "app/src/scene/a.ts"])(l, p));
    ok(two.labels.filter((l) => l === "security").length === 2 && two.labels.filter((l) => l === "design-reviewer").length === 1 && two.labels.filter((l) => l === "reviewer").length === 1,
      `round 2 for a tier-1 high finding did not run its lens alone: ${two.labels}`);
    // Frames missing fail the step; so does an agent that dies.
    const m = await withDesign(["app/src/scene/a.ts"], () => ({ findings: [], framesMissing: true }));
    ok(m.r.status.startsWith("blocked") && m.r.status.includes("frames"), `missing frames did not stop the loop: ${m.r.status}`);
    const dead = await withDesign(["app/src/scene/a.ts"], () => null);
    ok(dead.r.status.startsWith("blocked"), `a dead design-reviewer counted as a clean review: ${dead.r.status}`);
    // The agent's own brief.
    const { dirname: dn } = require("node:path");
    const repoRoot = dn(dn(dn(process.argv[2])));
    let brief = "";
    try { brief = readFileSync(repoRoot + "/.claude/agents/design-reviewer.md", "utf8"); } catch { /* absent */ }
    ok(brief !== "", ".claude/agents/design-reviewer.md does not exist");
    ok(/^name: design-reviewer$/m.test(brief), "the design-reviewer's brief names another agent");
    const tools = ((brief.match(/^tools: (.*)$/m) || [])[1] || "");
    ok(/\bRead\b/.test(tools) && !/\b(Write|Edit|NotebookEdit)\b/.test(tools), `the design-reviewer is not read-only: tools: ${tools}`);
    for (const word of ["1728", "1080", "docs/design/video-screens.md", "~/.cache/gnoworld-tools/video-frames/", "position", "size", "spacing", "type", "colour", "radius", "both pictures"])
      ok(brief.includes(word), `the design-reviewer's brief lacks ${word}`);
    ok(/missing[^.]*fail[^.]*never skip/i.test(brief), "the design-reviewer's brief has no one sentence saying that missing frames fail the step, never skip it");
    ok(/git command that writes the index/.test(brief), "the design-reviewer's brief lacks the git-index rule");
  }
  // The list and docs/REVIEW.md's table agree: each path of its tier-1 rows (a backticked word with a "/") that names files in the
  // repository starts the lens through the first of them. A tier-1 area added to the table and not to the loop fails here.
  {
    const { readdirSync } = require("node:fs");
    const { dirname } = require("node:path");
    const root = dirname(dirname(dirname(process.argv[2])));
    // A walk, not git: pre-commit runs this in a staged copy that is no repository. .stryker-tmp holds full copies of the repo
    // (gitignored leftovers of a mutation run): their files are no tracked files.
    const walk = (dir) => readdirSync(root + "/" + dir, { withFileTypes: true }).flatMap((e) =>
      [".git", "node_modules", "dist", ".claude", ".stryker-tmp"].includes(e.name) ? [] : e.isDirectory() ? walk(dir + e.name + "/") : [dir + e.name]);
    const tracked = walk("");
    const table = readFileSync(root + "/docs/REVIEW.md", "utf8").split("\n").filter((l) => l.startsWith("| 1 |"));
    const paths = [...new Set(table.flatMap((l) => [...l.matchAll(/`([^`]*\/[^`]*)`/g)].map((m) => m[1])))];
    ok(paths.length >= 3, `the tier-1 rows of docs/REVIEW.md name no path I can read: ${paths}`);
    // Both ways, the table against TIER1 (F2530): scripts/check_docs.py, on every commit, prose alone included (F4928).
    for (const path of paths) {
      const files = tracked.filter((f) => (f.startsWith(path) || f.includes("/" + path)) && !f.endsWith(".test.ts"));
      if (!files.length) continue;
      const labels = await lensOf(files[0]);
      ok(labels.includes("security"), `docs/REVIEW.md names ${path} as tier 1, but a change of ${files[0]} starts no security lens: ${labels}`);
    }
  }
  // The loop's base: main when absent; an argument for a branch cut from an integration branch. The merge check's file list and
  // its diff file, the reviewer's and the security lens's diff all read from it, not from main (5f: 201 files from main).
  const promptOf = (x, label) => (x.calls.find((c) => c.label === label) || { prompt: "" }).prompt;
  const fromMain = /since main|main\.\.\.?HEAD/;
  t = await run(base(["scripts/check.sh"]));
  for (const label of ["merge check", "reviewer", "security"]) ok(fromMain.test(promptOf(t, label)), `${label} did not read from main when no base was given: ${promptOf(t, label)}`);
  ok(!promptOf(t, "merge check").includes("--base"), `the merge check was given a base when none was: ${promptOf(t, "merge check")}`);
  t = await run(base(["scripts/check.sh"]), { base: "slice-5-p2" });
  // check.sh reads the same base (F2531): the prompt's file list and diffs alone would leave every lane on origin/main.
  ok(promptOf(t, "merge check").includes("check.sh --merge --base slice-5-p2"), `the merge check was not told to run check.sh against the base: ${promptOf(t, "merge check")}`);
  ok(promptOf(t, "merge check").includes("slice-5-p2...HEAD") && promptOf(t, "merge check").includes("slice-5-p2..HEAD"), `the merge check did not list files and loosening commits from the base: ${promptOf(t, "merge check")}`);
  for (const label of ["merge check", "reviewer", "security"]) {
    ok(!fromMain.test(promptOf(t, label)), `${label} still read from main with base slice-5-p2: ${promptOf(t, label)}`);
    if (label !== "merge check") ok(promptOf(t, label).includes("since slice-5-p2"), `${label} did not read the diff since the base: ${promptOf(t, label)}`);
  }
  ok(promptOf(t, "reviewer").includes("holds the diff since slice-5-p2"), "the reviewer was told the diff file holds the diff since main, not since the base");
  // A round 2 still reads since its first fix, whatever the base.
  t = await highEveryRound({ base: "slice-5-p2" });
  ok(t.calls.some((c) => c.label === "security" && c.prompt.includes("since f1^")), "round 2 did not read since its first fix when a base was given");
  // StrykerJS's and harness_mutate's survivors reach the reviewer: the merge check is told to take the lines `check.sh --merge`
  // prints as `survivor: ...`, pass or fail, and hands them on.
  ok(promptOf(t, "merge check").includes("survivor: "), "the merge check was not told to report the `survivor: ` lines check.sh prints, a pass included");
  const gs = { ...gateOf(["app/src/a.ts"]), survivors: ["survivor: app/src/a.ts: line 3:5 [Survived] ConditionalExpression"] };
  t = await run((l, p) => (l === "merge check" ? gs : base(["app/src/a.ts"])(l, p)));
  ok(promptOf(t, "reviewer").includes("app/src/a.ts: line 3:5 [Survived] ConditionalExpression"), "a surviving mutant of a passing merge check did not reach the reviewer's brief");
  t = await run(base(["app/src/a.ts"]));
  ok(promptOf(t, "reviewer").includes("surviving mutants: []"), "a merge check with no survivor did not hand the reviewer an empty list");
})();
JS
fi

if part batch_size; then
# batch_size.py: a merge carries a small batch of product code (DORA; docs/REVIEW.md, about 400 lines with a tier-1
# file, 600 otherwise): the lines it adds since the newest commit /pre-merge reviewed, or since base. Past 600 it
# fails unless a commit says why (`Batch-size: <n> - why`); past 400 it says the tier-1 limit. Tests, stories and
# journeys are not product code.
bs="$t/batch"
mkdir -p "$bs/app/src" "$bs/docs" "$bs/server/src"
git -C "$bs" init -q
lines() { python3 -I -c 'import sys; print("\n".join(f"export const v{i} = {i};" for i in range(int(sys.argv[1]))))' "$1"; }
commit() { git -C "$bs" add -A && git -C "$bs" commit -qm "$1"; }
size() { (cd "$bs" && python3 -I "$here/batch_size.py" "$1" 2>&1); }
printf '# passes\n' >"$bs/docs/review-passes.txt" && commit "base"
base=$(git -C "$bs" rev-parse HEAD)
lines 700 >"$bs/app/src/old.ts" && commit "the last merge's code"
(cd "$bs" && python3 -I -c 'import sys; sys.dont_write_bytecode = True; sys.path.insert(0, sys.argv[1]); from repo_files import fingerprint
print("2026-10-26", fingerprint("HEAD"), "lenses")' "$here") >>"$bs/docs/review-passes.txt" && commit "its review's record"
lines 10 >"$bs/app/src/new.ts" && commit "this merge's code"
out=$(size "$base") || fail "batch_size.py refused 10 lines since the last reviewed commit: $out"
printf '%s\n' "$out" | grep -q "^batch_size: 10 lines of product code" || fail "batch_size.py counted code before the last reviewed commit: $out"
lines 700 >"$bs/server/src/a.test.ts" && lines 700 >"$bs/app/src/b.stories.tsx" && mkdir -p "$bs/app/tests" && lines 700 >"$bs/app/tests/c.spec.ts" && lines 700 >"$bs/app/tests/helper.ts" && commit "tests"
out=$(size "$base") || fail "batch_size.py counted tests, stories or journeys as product code: $out"
lines 450 >"$bs/server/src/more.ts" && commit "more code"
out=$(size "$base") || fail "batch_size.py refused 460 lines: $out"
printf '%s\n' "$out" | grep -q "past 400" || fail "batch_size.py did not say the tier-1 limit past 400: $out"
lines 200 >"$bs/server/src/much.ts" && commit "too much"
out=$(size "$base") && fail "batch_size.py passed 660 lines with no reason given"
printf '%s\n' "$out" | grep -q "660 lines" || fail "batch_size.py did not say how many lines: $out"
echo x >>"$bs/server/src/much.ts" && git -C "$bs" add -A && git -C "$bs" commit -qm "a reason" -m "Batch-size: 661 - one feature, cut no smaller"
out=$(size "$base") || fail "batch_size.py refused a merge whose commit says why it is large: $out"
git -C "$bs" checkout -q -b no-reason HEAD~1 && echo x >>"$bs/server/src/much.ts" && git -C "$bs" add -A && git -C "$bs" commit -qm "no reason" -m "Batch-size: 661 - "
out=$(size "$base") && fail "batch_size.py took a Batch-size line with no reason"
# No reviewed commit since base: everything since base counts.
git -C "$bs" checkout -q -b fresh "$base" && mkdir -p "$bs/app/src" && lines 610 >"$bs/app/src/first.ts" && commit "a first merge"
out=$(size "$base") && fail "batch_size.py passed 610 lines of a merge with no reviewed commit since base"
# The limits are exact: 600 lines pass, 601 fail; 400 say nothing of the tier-1 limit, 401 do (G8).
for n in 600 601 400 401; do
	git -C "$bs" checkout -q -f -b "at$n" "$base" && mkdir -p "$bs/app/src" && lines "$n" >"$bs/app/src/at.ts" && commit "exactly $n"
	out=$(size "$base") && ok=1 || ok=0
	printf '%s\n' "$out" | grep -q "^batch_size: $n lines" || fail "batch_size.py did not count $n lines: $out"
	case $n in 600 | 400) [ "$ok" = 1 ] || fail "batch_size.py refused $n lines: $out" ;; *) ;; esac
	[ "$n" != 601 ] || [ "$ok" = 0 ] || fail "batch_size.py passed 601 lines with no reason given: $out"
	case $n in 400) ! printf '%s\n' "$out" | grep -q "past 400" || fail "batch_size.py said the tier-1 limit at 400 lines, which is not past it: $out" ;; esac
	[ "$n" != 401 ] || printf '%s\n' "$out" | grep -q "past 400" || fail "batch_size.py did not say the tier-1 limit at 401 lines: $out"
done
# The line says how large the batch is: a number below the count is a reason for another merge (G8).
git -C "$bs" checkout -q -f -b stated "$base" && mkdir -p "$bs/app/src" && lines 700 >"$bs/app/src/big.ts" && git -C "$bs" add -A && git -C "$bs" commit -qm "a number too small" -m "Batch-size: 1 - one feature, cut no smaller"
out=$(size "$base") && fail "batch_size.py took a Batch-size line of 1 for 700 lines: $out"
printf '%s\n' "$out" | grep -q "700 lines" || fail "batch_size.py did not say how many lines past a too small Batch-size line: $out"
git -C "$bs" commit -q --amend -m "a number that fits" -m "Batch-size: 700 - one feature, cut no smaller"
out=$(size "$base") || fail "batch_size.py refused a Batch-size line giving the count: $out"
# ...and so is one far above it: `Batch-size: 99999` on an early commit would waive every line the merge adds after it, and
# the count Alexis reads would say nothing of the real size. It gives the count, to a tenth more at most (security-S4).
for n in 771 99999; do
	git -C "$bs" commit -q --amend -m "a number too large" -m "Batch-size: $n - one feature, cut no smaller"
	out=$(size "$base") && fail "batch_size.py took a Batch-size line of $n for 700 lines, which waives lines that come later: $out"
	printf '%s\n' "$out" | grep -q "700 lines" || fail "batch_size.py did not say how many lines past a Batch-size line of $n: $out"
done
git -C "$bs" commit -q --amend -m "a number a tenth above" -m "Batch-size: 770 - one feature, cut no smaller"
out=$(size "$base") || fail "batch_size.py refused a Batch-size line a tenth above the count: $out"
git -C "$bs" commit -q --amend -m "a number that fits" -m "Batch-size: 700 - one feature, cut no smaller"
# A file moved between folders keeps its new path's rule: a test moved into app/src is no product code, a helper
# moved into it is, and git's rename line (`app/{tests => src}/h.ts`) names neither (G8).
git -C "$bs" checkout -q -f -b moved "$base" && mkdir -p "$bs/app/src" "$bs/app/tests" && lines 1000 >"$bs/app/tests/h.ts" && lines 1000 >"$bs/app/src/was.test.ts" && commit "files to move"
moved=$(git -C "$bs" rev-parse HEAD)
git -C "$bs" mv app/tests/h.ts app/src/h.ts && lines 650 >>"$bs/app/src/h.ts"
mkdir -p "$bs/app/src/sub" && git -C "$bs" mv app/src/was.test.ts app/src/sub/was.test.ts && lines 50 >>"$bs/app/src/sub/was.test.ts"
commit "the moves"
out=$(size "$moved") && fail "batch_size.py passed a helper moved into app/src with 650 lines added: $out"
printf '%s\n' "$out" | grep -q "^batch_size: 650 lines" || fail "batch_size.py did not count what a moved file added, and only what a product path got: $out"
# Helpers that only tests use are no product code (G8).
git -C "$bs" checkout -q -f -b helpers "$base" && mkdir -p "$bs/server/src/testing" && lines 700 >"$bs/server/src/testing/kit.ts" && commit "a test helper"
out=$(size "$base") || fail "batch_size.py counted server/src/testing, a test helper's folder, as product code: $out"
fi

if part gate_full; then
# The merge check prints every surviving mutant, pass or fail (F2359, F2409): the lane logs are shown only on failure, and
# StrykerJS exits 0 with survivors (the config has no break threshold), so the Workflow loop's `survivors` was always empty. Each
# survivor of StrykerJS's clear-text report (`[Survived] Kind` or `[NoCoverage] Kind`, then `path:L:C`) is printed by
# `check.sh --merge` as one line `survivor: <path>: line L:C [Status] Kind`; a killed mutant is not.
gate_fixture gate_survivors
mkdir -p "$g/node_modules/vitest"
base=$(git -C "$g" merge-base HEAD origin/main)
# The branch changes the files its survivors are on (the report lists the survivors of the files it changed alone, F2529).
printf 'z\n' >>"$g/server/src/a.ts" && printf 'z\n' >>"$g/server/src/b.ts" && printf 'x\n' >"$g/app/src/a.ts" && git -C "$g" add app/src/a.ts && git -C "$g" commit -qam "product code"
cat >"$g/bin/survive" <<SH
#!/bin/sh
sh "$step" mutate "\$@" || exit \$?
cat "$g/survivors.txt"
SH
python3 -I - "$g/package.json" "$g/bin/survive" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
d["scripts"]["mutate"] = f"sh {sys.argv[2]}"
json.dump(d, open(sys.argv[1], "w"))
PY
git -C "$g" update-ref refs/remotes/origin/main HEAD~1
# StrykerJS 10's clear-text report as clear-text-reporter.js writes it (reportMutantResult, colorSourceFileAndLocation; stryker.config.json
# sets no reporters, so it is the default one, with no colour): `[Status] Mutator`, then `path:line:column`, the original lines
# after `-   ` and the mutated after `+   `. A Killed mutant is only in the debug log, but a report holding one must not make a survivor.
cat >"$g/survivors.txt" <<'TXT'

[Killed] ConditionalExpression
app/src/killed.ts:9:1
-   if (y) {
+   if (false) {
Killed by: a works

[Survived] ConditionalExpression
app/src/a.ts:3:5
-   if (x) {
+   if (true) {
Ran all tests for this mutant.

[NoCoverage] StringLiteral
server/src/b.ts:7:12
-   "kept"
+   ""

Ran 4.00 tests per mutant on average.
TXT
out=$(gate --merge) || fail "check.sh --merge failed with a surviving mutant, which StrykerJS does not fail on: $out"
printf '%s\n' "$out" | grep -qE '^survivor: app/src/a\.ts: line 3:5 .*Survived.*ConditionalExpression' || fail "check.sh --merge did not print StrykerJS's survivor on a passing run: $out"
printf '%s\n' "$out" | grep -qE '^survivor: server/src/b\.ts: line 7:12 .*NoCoverage.*StringLiteral' || fail "check.sh --merge did not print StrykerJS's NoCoverage mutant on a passing run: $out"
printf '%s\n' "$out" | grep -q '^survivor: .*killed\.ts' && fail "check.sh --merge printed a killed mutant as a survivor: $out"
[ "$(printf '%s\n' "$out" | grep -c '^survivor: ')" = 2 ] || fail "check.sh --merge did not print each survivor once: $out"
# On a failing run too, once each (the failed lane's log is printed as well): a lane that runs beside or after the coverage lane fails.
out=$(FAIL=py:harness_mutate gate --merge) && fail "check.sh --merge passed with its harness mutants failing"
[ "$(printf '%s\n' "$out" | grep -c '^survivor: ')" = 2 ] || fail "check.sh --merge did not print the survivors once each when a lane failed: $out"
# The mutation lane never ran (--full stops at the history lane's failure, batch_size is in it; --merge goes on, F3384's neighbour): there is
# nothing to print.
out=$(FAIL=py:batch_size gate --full) && fail "check.sh --full passed with its batch size failing"
printf '%s\n' "$out" | grep -q '^survivor: ' && fail "check.sh --full printed a survivor though the mutation lane never ran: $out"
out=$(FAIL=py:batch_size gate --merge) && fail "check.sh --merge passed with its batch size failing"
[ "$(printf '%s\n' "$out" | grep -c '^survivor: ')" = 2 ] || fail "check.sh --merge did not print the survivors of the lanes that ran after the history lane failed: $out"
# A survivor on a file this branch did not change is no line to read: the report is sized by the codebase, not the change (2794
# survivors, about 200 KB, on a branch of nine files that touched none of them, F2529), and the reviewer's brief by the change. It
# is counted in one line, so that the total is still known; a mutant of the harness is always listed.
cat >>"$g/survivors.txt" <<'TXT'

[Survived] ConditionalExpression
app/src/untouched.ts:4:1
-   if (q) {
+   if (true) {

[NoCoverage] StringLiteral
app/src/untouched.ts:8:2
-   "z"
+   ""
TXT
out=$(gate --merge) || fail "check.sh --merge failed with survivors on unchanged files: $out"
printf '%s\n' "$out" | grep -q '^survivor: .*untouched' && fail "check.sh --merge listed a survivor on a file the branch did not change: $out"
[ "$(printf '%s\n' "$out" | grep -c '^survivor: ')" = 2 ] || fail "check.sh --merge changed the survivors it lists when others sat on unchanged files: $out"
printf '%s\n' "$out" | grep -q '^survivors not listed: 2 .*unchanged' || fail "check.sh --merge did not count the survivors it left out, 2 on one unchanged file: $out"
# --base <ref>: the branch's own lines on an integration branch. Its range from main holds other branches' lines; every lane that reads
# the base (the batch, the fixes, the regressions, the migrations, the patch's coverage, the harness's mutants, what counts as product
# code) reads from the ref, and without the argument from origin/main (F2531).
printf 'survivors.txt\nnode_modules/\nbin/\n' >>"$g/.git/info/exclude" && git -C "$g" commit -qam "the fixture's stubs" # product code is judged on what git sees
git -C "$g" branch -f integ HEAD
printf 'own\n' >"$g/scripts/own.sh" && git -C "$g" add scripts/own.sh && git -C "$g" commit -qm "own lines"
integ=$(git -C "$g" rev-parse integ) main=$(git -C "$g" rev-parse origin/main)
out=$(gate --merge --base integ) || fail "check.sh --merge --base failed on a copy whose every step passes: $out"
for s in py:batch_size py:check_regressions; do
	grep -qx "$s $integ" "$log" || fail "check.sh --merge --base integ did not give $s the base integ: $(grep "^$s" "$log")"
	grep -qx "$s $main" "$log" && fail "check.sh --merge --base integ gave $s origin/main as its base"
done
printf '%s\n' "$out" | grep -q "no product code since $integ" || fail "check.sh --merge --base integ took other branches' product lines for its own: $out"
ran py:prove_fix && fail "check.sh --merge --base integ ran prove_fix on a branch with no product code of its own"
out=$(gate --merge) || fail "check.sh --merge failed on a copy whose every step passes: $out"
grep -qx "py:batch_size $main" "$log" || fail "check.sh --merge, with no argument, did not read from origin/main: $(grep '^py:batch_size' "$log")"
ran py:prove_fix || fail "check.sh --merge, with no argument, did not read the product code since origin/main"
grep -qx "py:patch_coverage $main" "$log" || fail "check.sh --merge, with no argument, gave the patch's coverage a base other than origin/main's: $(grep '^py:patch_coverage' "$log")"
out=$(gate --merge --base) && fail "check.sh --merge --base passed with no ref after it: $out"
printf '%s\n' "$out" | grep -q "wants a ref" || fail "check.sh --merge --base with no ref did not say it wants one: $out"
out=$(gate --merge --base no-such-ref) && fail "check.sh --merge --base passed with a ref that is none: $out"
printf '%s\n' "$out" | grep -q "no-such-ref" || fail "check.sh --merge --base did not name the ref it could not compare with: $out"
# No survivor, no line.
: >"$g/survivors.txt"
out=$(gate --merge) || fail "check.sh --merge failed with no survivor: $out"
printf '%s\n' "$out" | grep -q '^survivor: ' && fail "check.sh --merge printed a survivor when there was none: $out"
# harness_mutate's survivors (`FAIL  survives: <mutant>`) are survivors too, on a merge that fails on them.
printf 'import os, sys\nprint("FAIL  survives: planted spare2 #1")\nsys.exit(1)\n' >"$g/scripts/harness_mutate.py"
out=$(gate --merge) && fail "check.sh --merge passed with a harness mutant surviving"
printf '%s\n' "$out" | grep -q '^survivor: .*planted spare2 #1' || fail "check.sh --merge did not print a harness mutant's survivor as a survivor: $out"
fi

if part deploy_lock; then
# deploy/test.sh takes a lock (harness list item 10): two runs at once share the Docker project gnoworld-demo-test and each one's
# start removes the other's containers (2026-10-30: `FAIL ... No such container`). It needs Docker, which the sandbox refuses, so
# the tools it calls are stubs on PATH; the first run is held at its first `docker run` while a second starts beside it.
# Every process a run starts is recorded by pid (the stubs write them), killed by pid, and checked dead at the end: no pkill, which
# the sandbox refuses.
d="$t/lock" && mkdir -p "$d/bin" "$d/tmp" "$d/home"
for tool in curl openssl htpasswd git netstat route ifconfig arp ss ip dig; do printf '#!/bin/sh\nexit 0\n' >"$d/bin/$tool"; done
# macOS's mktemp -d ignores TMPDIR; the run's folder goes where the test can find it.
printf '#!/bin/sh\nexec /usr/bin/mktemp -d "$TMPDIR/tmp.XXXXXX"\n' >"$d/bin/mktemp"
# python3 records its pid (the canary's http.server is one) and becomes the real one.
printf '#!/bin/sh\necho $$ >>"$LOCK_DOCKER_LOG.pids"\nexec "%s" "$@"\n' "$(command -v python3)" >"$d/bin/python3"
cat >"$d/bin/docker" <<'SH'
#!/bin/sh
echo "$*" >>"$LOCK_DOCKER_LOG"
case $1 in
version) echo 28.0.0 ;;
run) echo $$ >>"$LOCK_DOCKER_LOG.pids"; exec sleep 20 ;;
compose)
	case $2 in
	ls) if [ -n "${LOCK_LEFTOVER:-}" ] && [ "${LOCK_LEFTOVER_VIA:-}" != network ]; then printf '[{"Name":"%s","Status":"running(2)","ConfigFiles":"/x/compose.yaml"}]\n' "$LOCK_LEFTOVER"; else echo '[]'; fi ;;
	esac
	;;
network) if [ -n "${LOCK_LEFTOVER:-}" ] && [ "${LOCK_LEFTOVER_VIA:-}" != compose ]; then echo "${LOCK_LEFTOVER}_default"; fi ;;
esac
exit 0
SH
chmod +x "$d/bin/"*
# deploy_run <log's name> <project> [VAR=value...]: runs deploy/test.sh in the background (with $mode as its argument) in its own TMPDIR,
# the same HOME as every run (the lock must not hang on TMPDIR, which a sandbox and a terminal do not share).
deploy_run() {
	name=$1 project=$2
	shift 2
	mkdir -p "$d/tmp.$name"
	: >"$d/$name.docker" && (env HOME="$d/home" TMPDIR="$d/tmp.$name" PATH="$d/bin:$PATH" LOCK_DOCKER_LOG="$d/$name.docker" TEST_PROJECT="$project" "$@" "$shell" "$here/../deploy/test.sh" $mode >"$d/$name.out" 2>&1 & echo $! >"$d/$name.pid")
}
alive() { kill -0 "$1" 2>/dev/null; }
gone() { ! alive "$1"; }
ended() { gone "$(cat "$d/$1.pid")"; }
began() { grep -q '^run ' "$d/$1.docker"; }
settled() { began "$1" || ended "$1"; }
# The runner starts every section at once, and a run's first steps took over 15 s of that at load 45 (3 full suites in 9 failed
# here): every wait ends on what it waits for, so only a fault reaches the ceiling, 2 minutes, and no clock decides a verdict.
soon() {
	tries=0
	until "$@"; do
		tries=$((tries + 1))
		[ "$tries" -lt 600 ] || return 1
		sleep 0.2
	done
}
reached() { soon settled "$1" && began "$1"; } # $1 the log's name: the run got past its checks to the first docker run
refused() { soon settled "$1" && ! began "$1"; } # $1 the log's name: the run ended on its own, before any docker run
stop_all() { # every process any run started is killed by its pid, then none may be alive
	for f in "$d"/*.pid "$d"/*.docker.pids; do [ -e "$f" ] || continue; for p in $(cat "$f"); do kill -9 "$p" 2>/dev/null || true; done; done
	for f in "$d"/*.pid "$d"/*.docker.pids; do
		[ -e "$f" ] || continue
		for p in $(cat "$f"); do soon gone "$p" || fail "a process of the lock test (pid $p, from $f) outlived it"; done
	done
	rm -f "$d"/*.pid "$d"/*.docker.pids
	rm -rf "${d:?}/home/.cache"
}
mode= shell=sh
p1=gnoworld-lock-a-$$
deploy_run first "$p1"
reached first || { stop_all; fail "the first deploy/test.sh never reached its first docker run (stubs): $(cat "$d/first.out")"; }
# A second run of the same project beside it, even from another TMPDIR (a sandbox's is not a terminal's), is refused at once, with a
# word naming the project, and starts nothing.
deploy_run second "$p1"
refused second || { stop_all; fail "a second deploy/test.sh ran beside a first holding the project $p1"; }
grep -q "$p1" "$d/second.out" || { stop_all; fail "the refused run did not name the project it found held: $(cat "$d/second.out")"; }
grep -qi 'already\|held\|in use\|another' "$d/second.out" || { stop_all; fail "the refused run did not say another run holds the project: $(cat "$d/second.out")"; }
grep -q '^run \|^compose .* up' "$d/second.docker" && { stop_all; fail "the refused run still started docker work: $(cat "$d/second.docker")"; }
grep -q 'down' "$d/second.docker" && { stop_all; fail "the refused run removed the first run's containers (compose down): $(cat "$d/second.docker")"; }
alive "$(cat "$d/first.pid")" || { stop_all; fail "the refused second run stopped the first: $(cat "$d/first.out")"; }
# The modes that start a stack take the same project: --mutants of it is refused too.
mode=--mutants
deploy_run mutants "$p1"
mode=
refused mutants || { stop_all; fail "deploy/test.sh --mutants ran beside a first run holding the project $p1"; }
grep -q "$p1" "$d/mutants.out" || { stop_all; fail "the refused --mutants did not name the project: $(cat "$d/mutants.out")"; }
grep -q '^run ' "$d/mutants.docker" && { stop_all; fail "the refused --mutants still started docker work: $(cat "$d/mutants.docker")"; }
# --demo starts and removes nothing of the test's: the lock does not stop it, and it goes on to its own checks' first docker run.
mode=--demo
deploy_run demo "$p1"
mode=
reached demo || { stop_all; fail "deploy/test.sh --demo was refused by a test run's lock: $(cat "$d/demo.out")"; }
# Another project is no one's lock.
deploy_run other "gnoworld-lock-b-$$"
reached other || { stop_all; fail "a run of another project was refused by the first's lock: $(cat "$d/other.out")"; }
stop_all
# A first run killed hard (no trap runs) leaves a stale lock: the next run takes it over.
deploy_run killed "$p1"
reached killed || { stop_all; fail "the run meant to be killed never started: $(cat "$d/killed.out")"; }
kill -9 "$(cat "$d/killed.pid")"
soon ended killed || { stop_all; fail "a run killed hard still runs"; }
deploy_run after "$p1"
reached after || { stop_all; fail "a run was refused by the lock of a run that is dead: $(cat "$d/after.out")"; }
stop_all
# A holder another sandbox owns (its pid refuses a signal, EPERM, F2616) is alive: pid 1 holds the lock, and the run is refused.
mkdir -p "$d/home/.cache/gnoworld-tools/deploy-test-$p1.lock" && printf '1\n' >"$d/home/.cache/gnoworld-tools/deploy-test-$p1.lock/pid"
deploy_run eperm "$p1"
refused eperm || { stop_all; fail "deploy/test.sh took over the lock of a live holder it was not allowed to signal (F2616): $(cat "$d/eperm.out")"; }
grep -q "$p1" "$d/eperm.out" || { stop_all; fail "the run refused for a holder it could not signal did not name the project: $(cat "$d/eperm.out")"; }
stop_all
# A first run stopped by TERM releases the lock, under a Linux host's shell too: dash, unlike macOS's sh, runs no EXIT trap for a
# signal with no trap of its own. The test waits for the run to end (after ending the stub `docker run` it waits on, which a
# shell's trap otherwise outlasts).
shell=$(command -v dash || echo sh)
deploy_run quit "$p1"
shell=sh
reached quit || { stop_all; fail "the run meant to end never started: $(cat "$d/quit.out")"; }
kill -TERM "$(cat "$d/quit.pid")"
for p in $(cat "$d/quit.docker.pids"); do kill -TERM "$p" 2>/dev/null || true; done
soon ended quit || { stop_all; fail "a run stopped by TERM never ended"; }
[ -z "$(find "$d/home/.cache/gnoworld-tools" -name "*$p1*" 2>/dev/null)" ] || { stop_all; fail "a run stopped by TERM left its lock: $(ls "$d/home/.cache/gnoworld-tools")"; }
deploy_run again "$p1"
reached again || { stop_all; fail "a run was refused by the lock of a run that was stopped: $(cat "$d/again.out")"; }
stop_all
# A run left by a Ctrl+C (5f's gnoworld-demo-mutant-18219, whose network held the test's 172.30.90.0/24) is named in the refusal
# with the command that removes it; nothing is started beside it.
left=gnoworld-demo-mutant-77777777
deploy_run left "gnoworld-lock-c-$$" LOCK_LEFTOVER="$left"
refused left || { stop_all; fail "deploy/test.sh started beside a mutant project a Ctrl+C left up"; }
grep -q "docker compose -p $left down -v" "$d/left.out" || { stop_all; fail "the refusal did not give the command that removes $left: $(cat "$d/left.out")"; }
grep -q '^run ' "$d/left.docker" && { stop_all; fail "deploy/test.sh went on after finding $left up"; }
stop_all
# Each source of a leftover is read alone (F2528: the stub printed it through both, so either guard passed without the other),
# and a refusal on a leftover releases the lock it took.
for via in compose network; do
	deploy_run "via$via" "gnoworld-lock-$via-$$" LOCK_LEFTOVER="$left" LOCK_LEFTOVER_VIA=$via
	refused "via$via" || { stop_all; fail "deploy/test.sh started beside a mutant project that only docker $via shows"; }
	grep -q "docker compose -p $left down -v" "$d/via$via.out" || { stop_all; fail "the refusal did not name the leftover docker $via shows: $(cat "$d/via$via.out")"; }
	[ -z "$(find "$d/home/.cache/gnoworld-tools" -name "*gnoworld-lock-$via-$$*" 2>/dev/null)" ] || { stop_all; fail "a run refused on a leftover (docker $via) kept its lock"; }
	stop_all
done
# --mutants runs each fault in a project of that name: a run never takes its own for a leftover.
own=gnoworld-demo-mutant-88888888
deploy_run own "$own" LOCK_LEFTOVER="$own"
reached own || { stop_all; fail "deploy/test.sh took its own project for a leftover: $(cat "$d/own.out")"; }
stop_all
# Another Compose project running on the machine is none of its business.
deploy_run unrelated "gnoworld-lock-d-$$" LOCK_LEFTOVER=myapp
reached unrelated || { stop_all; fail "deploy/test.sh was refused by an unrelated running project: $(cat "$d/unrelated.out")"; }
stop_all
# A run releases only a lock that holds its own pid: one another run took over (here, a live process's) stays when the first ends.
lockdir=$d/home/.cache/gnoworld-tools
deploy_run foreign "$p1"
reached foreign || { stop_all; fail "the run meant to lose its lock never started: $(cat "$d/foreign.out")"; }
sleep 60 &
echo $! >"$d/other.pid"
cat "$d/other.pid" >"$lockdir/deploy-test-$p1.lock/pid"
kill -TERM "$(cat "$d/foreign.pid")"
for p in $(cat "$d/foreign.docker.pids"); do kill -TERM "$p" 2>/dev/null || true; done
soon ended foreign || { stop_all; fail "the run that lost its lock never ended"; }
[ "$(cat "$lockdir/deploy-test-$p1.lock/pid" 2>/dev/null)" = "$(cat "$d/other.pid")" ] || { stop_all; fail "a run took down the lock of another run when it ended"; }
stop_all
# A real Ctrl+C, to a run in the foreground of a process group of its own (a section's shell, in the background, ignores INT):
# the run ends with 130 and its lock is gone. Without the INT trap a shell ends of the signal, its EXIT trap unrun.
py=$(command -v python3)
cat >"$d/intrun.py" <<'PYX'
import os, signal, subprocess, sys, time

signal.signal(signal.SIGINT, lambda *_: None)  # a handler, not SIG_IGN, which the run below would inherit
log, out = sys.argv[1], sys.argv[2]
run = subprocess.Popen(sys.argv[3:], start_new_session=True, stdout=open(out, "w"), stderr=subprocess.STDOUT)
for _ in range(600):
    if run.poll() is not None or (os.path.exists(log) and any(line.startswith("run ") for line in open(log))):
        break
    time.sleep(0.2)
os.killpg(run.pid, signal.SIGINT)
try:
    print(run.wait(timeout=60))
except subprocess.TimeoutExpired:
    os.killpg(run.pid, signal.SIGKILL)
    print("hung")
PYX
mkdir -p "$d/tmp.int" && : >"$d/int.docker"
code=$(env HOME="$d/home" TMPDIR="$d/tmp.int" PATH="$d/bin:$PATH" LOCK_DOCKER_LOG="$d/int.docker" TEST_PROJECT="$p1" "$py" "$d/intrun.py" "$d/int.docker" "$d/int.out" sh "$here/../deploy/test.sh")
[ "$code" = 130 ] || { stop_all; fail "a run stopped by Ctrl+C ended with [$code], not 130: $(cat "$d/int.out")"; }
[ -z "$(find "$lockdir" -name "*$p1*" 2>/dev/null)" ] || { stop_all; fail "a run stopped by Ctrl+C left its lock"; }
stop_all
# The run that made a lock is writing its pid: an empty lock is read again a second later (the stub sleep writes it there, at once
# and with no clock), and a live holder's refuses; a lock found dead and removed, then taken by another run that very moment, refuses.
mkdir -p "$d/bin2" "$d/bin3"
printf '#!/bin/sh\n[ -n "${LOCK_FILL:-}" ] && [ "$1" = 1 ] && cat "$LOCK_FILL_SRC" >"$LOCK_FILL"\nexec /bin/sleep "$@"\n' >"$d/bin2/sleep"
printf '#!/bin/sh\n/bin/rm "$@"\nstatus=$?\ncase "$*" in *deploy-test-*.lock*) [ -z "${LOCK_RETAKE:-}" ] || { mkdir -p "$LOCK_RETAKE"; cat "$LOCK_RETAKE_SRC" >"$LOCK_RETAKE/pid"; } ;; esac\nexit $status\n' >"$d/bin3/rm"
chmod +x "$d/bin2/sleep" "$d/bin3/rm"
sleep 60 &
echo $! >"$d/live.pid"
pw=gnoworld-lock-w-$$
mkdir -p "$lockdir/deploy-test-$pw.lock"
deploy_run waited "$pw" PATH="$d/bin2:$d/bin:$PATH" LOCK_FILL="$lockdir/deploy-test-$pw.lock/pid" LOCK_FILL_SRC="$d/live.pid"
refused waited || { stop_all; fail "a run took over a lock whose run had not yet written its pid: $(cat "$d/waited.out")"; }
grep -q "pid $(cat "$d/live.pid")" "$d/waited.out" || { stop_all; fail "the refusal did not name the holder that wrote its pid late: $(cat "$d/waited.out")"; }
sh -c 'echo $$' >"$d/dead.txt"
pr=gnoworld-lock-r-$$
mkdir -p "$lockdir/deploy-test-$pr.lock" && cp "$d/dead.txt" "$lockdir/deploy-test-$pr.lock/pid"
deploy_run retaken "$pr" PATH="$d/bin3:$d/bin:$PATH" LOCK_RETAKE="$lockdir/deploy-test-$pr.lock" LOCK_RETAKE_SRC="$d/live.pid"
refused retaken || { stop_all; fail "a run went on after another took the lock it had just removed: $(cat "$d/retaken.out")"; }
grep -q "took the project" "$d/retaken.out" || { stop_all; fail "the refusal did not say another run took the project: $(cat "$d/retaken.out")"; }
stop_all
fi

if part speeds; then
# scripts/speeds.py: the two speeds of the merge check (slice 7, question 21). A change of interface alone runs one review and no
# mutation; any path that touches keys, the CSP, chain reads, login, roles, the worker or deployment runs the full control. The paths
# that count as security are docs/REVIEW.md's tier-1 rows (backticks), those of interface its tier-3 rows': one place, read by the script.
# It reads the change's paths on stdin (check.sh's own $changes, a path a line), the repository's root as its argument, and prints `full`
# or `interface`, exit 0 in every case: a doubt, a table it cannot read, an empty list, a path it cannot place, is `full`.
sp="$here"/speeds.py
[ -f "$sp" ] || fail "scripts/speeds.py does not exist: the two speeds of the merge check have no script that decides them"
r="$t/speeds"
mkdir -p "$r/docs" "$r/app/src/features/chat" "$r/app/src/features/login" "$r/app/src/lib/chain" "$r/packages/ui/src/Button" "$r/server/src" "$r/gno/r/x"
printf '# Review\n\n| Tier | What | Written by | How it is reviewed |\n|---|---|---|---|\n| 1 | Realms (`gno/r/`, `gno/p/`) | Claude | Claude reads every line |\n| 1 | The CSP (`app/src/csp.ts`), the chain reads'"'"' builder (`app/src/lib/chain/evalCall.ts`) | Alexis | Alexis reads every line |\n| 1 | The login (`app/src/features/login/`, `app/src/lib/api/login.ts`, `server/src/login/`) | Claude | Alexis reads every line |\n| 1 | The deploy folder (`deploy/`) | Claude | Alexis reads every line |\n| 2 | Other TypeScript | Either | tests |\n| 3 | Interface, 3D, motion (`app/src/features/`, `packages/ui/src/`) | Either | Run it |\n' >"$r/docs/REVIEW.md"
cp "$r/docs/REVIEW.md" "$t/speeds.review"
: >"$r/app/src/lib/chain/evalCall.ts" && : >"$r/app/src/features/login/Form.tsx"
ln -s ../../lib/chain/evalCall.ts "$r/app/src/features/chat/link.ts"
ln -s ../login "$r/app/src/features/dirlink"
speed() { printf '%s\n' "$@" | python3 -I "$sp" "$r" 2>/dev/null || echo "crashed"; }
is() { [ "$(speed "$2")" = "$1" ] || fail "speeds.py: '$2' is not $1 (it said '$(speed "$2")')"; } # $1 the verdict, $2 the path
is interface "app/src/features/chat/Bubble.tsx"
[ "$(speed "app/src/features/chat/Bubble.tsx" "packages/ui/src/Button/Button.tsx")" = interface ] || fail "speeds.py: files of the interface alone are not interface"
accent=$(printf '\303\251')
is interface "app/src/features/chat/$accent.tsx"
# Where one path of the change is not interface, the control is whole: a tier-1 file beside interface files, a tier-1 file renamed into an
# interface folder (the list has both the old path and the new, check.sh's --no-renames), and the tier-1 file under an interface-looking folder.
for p in server/src/a.ts app/src/csp.ts app/src/lib/chain/evalCall.ts app/src/lib/other.ts app/src/features/login/Form.tsx app/src/lib/api/login.ts \
	gno/r/x/realm deploy/web/nginx.conf package.json pnpm-lock.yaml eslint.config.ts scripts/check.sh .claude/settings.json .githooks/records.sh docs/REVIEW.md packages/core/src/planet/a.ts; do
	is full "$p"
	[ "$(speed "packages/ui/src/Button/Button.tsx" "$p")" = full ] || fail "speeds.py: $p beside an interface file did not run the full control"
done
[ "$(speed "gno/r/x/realm" "app/src/features/chat/realm")" = full ] || fail "speeds.py: a realm file renamed into an interface folder was interface"
# A doubt is the full control: nothing to judge, a path git quotes, an absolute or a rewritten path, a path whose folder is a link, a link, a name
# that is not text, another case of a security folder (a Mac's disk reads them as one, F164), another spelling of the same letters.
[ "$(printf '' | python3 -I "$sp" "$r")" = full ] || fail "speeds.py: an empty change was not the full control"
[ "$(printf '\n\n' | python3 -I "$sp" "$r")" = full ] || fail "speeds.py: blank lines were not the full control"
is full '"app/src/features/chat/\303\251.tsx"'
is full "/app/src/features/chat/Bubble.tsx"
is full "./app/src/features/chat/Bubble.tsx"
is full "app/src/features/chat/../../lib/chain/evalCall.ts"
is full "app/src/features/./login/Form.tsx"
is full "app/src/features//login/Form.tsx"
is full "app\\src\\features\\chat\\x.tsx"
is full "app/src/features/chat/Bubble.tsx "
is full " app/src/features/chat/Bubble.tsx"
is full "app/src/features/chat/$(printf 'x\ty').tsx"
is full "app/src/features/chat/$(printf 'x\ry').tsx"
is full "App/src/features/chat/Bubble.tsx"
is full "app/src/Features/chat/Bubble.tsx"
is full "app/src/features/LOGIN/Form.tsx"
is full "APP/SRC/FEATURES/LOGIN/Form.tsx"
is full "app/src/features/chat/link.ts"
is full "app/src/features/dirlink/Form.tsx"
out=$(printf 'app/src/features/chat/\377.tsx\n' | python3 -I "$sp" "$r" 2>&1) || fail "speeds.py failed on a name that is not UTF-8: $out"
[ "$out" = full ] || fail "speeds.py read a name that is not UTF-8 as '$out', not the full control"
# A table it cannot read, or a list it reads empty, is the full control: no REVIEW.md, no table, no interface row, no tier-1 row.
rm "$r/docs/REVIEW.md"
is full "app/src/features/chat/Bubble.tsx"
printf '# Review\n\nNo table here.\n' >"$r/docs/REVIEW.md"
is full "app/src/features/chat/Bubble.tsx"
grep -v '^| 3 ' "$t/speeds.review" >"$r/docs/REVIEW.md"
is full "app/src/features/chat/Bubble.tsx"
grep -v '^| 1 ' "$t/speeds.review" >"$r/docs/REVIEW.md"
is full "app/src/features/chat/Bubble.tsx"
sed 's/(`app\/src\/features\/`, `packages\/ui\/src\/`)/()/' "$t/speeds.review" >"$r/docs/REVIEW.md"
is full "app/src/features/chat/Bubble.tsx"
cp "$t/speeds.review" "$r/docs/REVIEW.md"
is interface "app/src/features/chat/Bubble.tsx"
# The table is read, not remembered: a path the table adds to tier 1 is no longer interface, whatever the script was written with.
sed 's/`deploy\/`/`deploy\/`, `packages\/ui\/src\/Button\/`/' "$t/speeds.review" >"$r/docs/REVIEW.md"
is full "packages/ui/src/Button/Button.tsx"
is interface "packages/ui/src/Other.tsx"
cp "$t/speeds.review" "$r/docs/REVIEW.md"
# A sibling folder whose name starts with an interface entry's is no interface (the allowlist is the slice's security boundary): an entry
# is a folder with its slash, never a prefix of letters. Nor is the folder itself as a file, a folder's own path, or a file one level too high.
for p in app/src/features-evil/x.ts app/src/featuresx/x.ts app/src/featuresX/x.ts packages/ui/src-old/x.ts packages/ui/srcs/x.ts packages/ui/src.ts \
	app/src/features app/src/features/ app/src/x.ts app/x.ts packages/ui/x.ts; do
	is full "$p"
	[ "$(speed "app/src/features/chat/Bubble.tsx" "$p")" = full ] || fail "speeds.py: $p beside an interface file did not run the full control"
done
# A tier-3 row is itself read as hostile (round 1, reviewer-1-4): an entry that is a whole top folder (`app/`), has no slash, or is not a plain path
# (padding, `..`) allows nothing, so the answer stays the full control; and a line that is no table row is no row, whatever its first cell says.
tier3() { # $1: the tier-3 row's cell; then the tier-1 row `deploy/`, the table's other lines in $2 if any
	printf '# Review\n\n| Tier | What | Written by | How |\n|---|---|---|---|\n| 1 | Deploy (`deploy/`) | Claude | Alexis |\n| 3 | Interface (%s) | Either | Run it |\n%b' "$1" "${2:-}" >"$r/docs/REVIEW.md"
}
tier3 '`app/src/features/`'
is interface "app/src/features/chat/Bubble.tsx" # the control: this table allows it
tier3 '`app/`'
is full "app/src/lib/other.ts"
tier3 '`app/src/features`'
is full "app/src/features-evil/x.ts"
is full "app/src/features/chat/Bubble.tsx"
tier3 '`app/src/features /`'
is full "app/src/features /x.ts"
tier3 '`..//x/`'
is full "..//x/y.ts"
is full "x/y.ts"
tier3 '`app/src/features/`' '1 | Chat (`app/src/features/chat/`) | Claude | Alexis\n'
is interface "app/src/features/chat/Bubble.tsx" # a line that does not open with a pipe is no tier-1 row
tier3 '' '3 | Everything (`app/src/`) | Either | Run it\n'
is full "app/src/lib/other.ts" # nor a tier-3 one
cp "$t/speeds.review" "$r/docs/REVIEW.md"
# One argument, the root: another count is a doubt, whatever the path.
[ "$(printf 'app/src/features/chat/Bubble.tsx\n' | python3 -I "$sp" 2>&1)" = full ] || fail "speeds.py: no root argument was not the full control"
[ "$(printf 'app/src/features/chat/Bubble.tsx\n' | python3 -I "$sp" "$r" extra 2>&1)" = full ] || fail "speeds.py: two arguments were not the full control"
# The same letters spelled otherwise (a decomposed accent, which a Mac's disk reads as the composed one): a security folder whose name has an
# accent is still found, and an interface file with one is interface.
printf '# Review\n\n| Tier | What | Written by | How |\n|---|---|---|---|\n| 1 | The cafe (`app/src/features/caf\303\251/`) | Claude | Alexis |\n| 3 | Interface (`app/src/features/`) | Either | Run it |\n' >"$r/docs/REVIEW.md"
is full "app/src/features/caf$accent/x.ts"
is full "app/src/features/cafe$(printf '\314\201')/x.ts"
is full "app/src/features/CAFE$(printf '\314\201')/x.ts"
is interface "app/src/features/cafes/x.ts"
is interface "app/src/features/chat/cafe$(printf '\314\201').ts"
cp "$t/speeds.review" "$r/docs/REVIEW.md"
# The repository's own table: every tier-1 path it names is the full control, and its interface paths are named (a tier-3 row with no path
# leaves the script nothing to allow).
python3 -I - "$here/../docs/REVIEW.md" "$t/speeds.paths" <<'PY' || fail "docs/REVIEW.md: no tier-1 row names a path in backticks"
import re, sys
paths = []
for line in open(sys.argv[1]):
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if len(cells) >= 2 and cells[0] == "1":
        paths += re.findall(r"`([^`]+)`", cells[1])
assert paths, "no tier-1 path"
open(sys.argv[2], "w").write("\n".join(p + ("x.ts" if p.endswith("/") else "") for p in paths) + "\n")
PY
while IFS= read -r p; do
	[ "$(printf '%s\n' "$p" | python3 -I "$sp" "$here/.." 2>&1)" = full ] || fail "speeds.py: the repository's tier-1 path '$p' (docs/REVIEW.md) was not the full control"
done <"$t/speeds.paths"
[ "$(printf 'packages/ui/src/Button/Button.tsx\n' | python3 -I "$sp" "$here/.." 2>&1)" = interface ] || fail "docs/REVIEW.md's tier-3 row names no interface path speeds.py can read (packages/ui/src/ is one)"
[ "$(printf 'app/src/features/world/World.tsx\n' | python3 -I "$sp" "$here/.." 2>&1)" = interface ] || fail "docs/REVIEW.md's tier-3 row does not name app/src/features/ as interface"
[ "$(printf 'app/src/features/login/Form.tsx\n' | python3 -I "$sp" "$here/.." 2>&1)" = full ] || fail "the repository's login folder, under app/src/features/, was interface"
# Tier 3 fails closed folder by folder (round 1, security-1-1): the guards that sit in a feature or the design system's root (the embed host
# list and its iframe's sandbox, the exit warning for a realm page's links, the link that stops //host), a feature folder that does not exist
# yet (Jarvis's tool loop, the passport's signing) and a folder added tomorrow are the full control until the table names them one by one.
for p in app/src/features/chat/embeds.ts app/src/features/chat/Embed.tsx app/src/features/realms/useExternalLinks.tsx app/src/features/realms/useFunctions.ts \
	packages/ui/src/link.tsx packages/ui/src/roving.ts app/src/features/jarvis/toolLoop.ts app/src/features/passport/sign.ts app/src/features/newthing/Panel.tsx packages/ui/src/NewThing/NewThing.tsx; do
	[ "$(printf '%s\n' "$p" | python3 -I "$sp" "$here/.." 2>&1)" = full ] || fail "speeds.py: the repository's table let $p take the interface speed"
done
fi

if part speeds_light; then
# speeds.py --light <root> <main's table>: whether a change may take the radical mode's light gate, the interface's alone (Alexis,
# 2026-11-04, F4909's (a): "Léger pour l'interface seule"): `light` when every path is under a tier-3 folder that both docs/REVIEW.md's
# tables name, the tree's and main's, and none is a tier-1 path of either, read as the two speeds read them (case folded, a path it cannot
# place or one through a link is no light); `full` otherwise: the server, core, lib, a design-system file of no listed folder, a doc, a
# table it cannot read, an empty list. The harness files are check.sh's to judge, by records.sh's own list.
sp="$here"/speeds.py
r="$t/speeds_light" && mkdir -p "$r/docs" "$r/app/src/features/world" "$r/app/src/features/login" "$r/server/src"
printf '# Review\n\n| Tier | What | Written by | How it is reviewed |\n|---|---|---|---|\n| 1 | Realms (`gno/r/`, `gno/p/`) | Claude | every line |\n| 1 | The CSP (`app/src/csp.ts`) | Alexis | every line |\n| 1 | The login (`app/src/features/login/`), a guard (`app/src/features/world/guard.ts`) | Claude | every line |\n| 1 | The deploy folder (`deploy/`) | Claude | every line |\n| 2 | Other TypeScript | Either | tests |\n| 3 | Interface: `app/src/features/world/`, `app/src/features/home/`, `app/src/features/login/`, `packages/ui/src/Button/` | Either | Run it |\n' >"$r/docs/REVIEW.md"
ln -s ../../../server/src "$r/app/src/features/world/linked"
cp "$r/docs/REVIEW.md" "$t/main.review" # main's own table, which check.sh gives it beside the tree's (lot 1's review, R1)
light() { printf '%s\n' "$@" | python3 -I "$sp" --light "$r" "$t/main.review" 2>/dev/null || echo crashed; }
for p in app/src/features/world/Here.tsx app/src/features/world/Here.module.css app/src/features/home/deep/Home.tsx packages/ui/src/Button/Button.tsx; do
	[ "$(light "$p")" = light ] || fail "speeds.py --light: $p, in a tier-3 folder, is not light: $(light "$p")"
done
[ "$(light app/src/features/world/Here.tsx packages/ui/src/Button/Button.tsx)" = light ] || fail "speeds.py --light: two paths of tier-3 folders are not light"
# The rest keeps the whole gate: the server, core, the app's lib, a feature no row lists, the design system's own root, a doc, a test outside.
for p in server/src/a.ts packages/core/src/x.ts app/src/lib/other.ts app/src/features/chat/Bubble.tsx packages/ui/src/tokens.css \
	docs/DEVELOPMENT.md app/tests/e2e/home.spec.ts app/src/features/worldly/x.tsx app/src/features/world app/src/csp.ts \
	app/src/features/login/Form.tsx app/src/features/world/guard.ts app/src/features/WORLD/Guard.ts app/src/features/world/linked/a.ts \
	gno/r/x/realm deploy/web/nginx.conf /app/src/features/world/x.ts "app/src/features/world/../../csp.ts" '"app/src/features/world/x.ts"' \
	"app/src/features/world/x.ts "; do
	[ "$(light "$p")" = full ] || fail "speeds.py --light: $p is light"
	[ "$(light app/src/features/world/Here.tsx "$p")" = full ] || fail "speeds.py --light: $p beside a tier-3 path is light"
done
# A tier-1 file renamed away: the list holds its old path (check.sh's --no-renames), which is tier 1.
[ "$(light app/src/features/world/guard.ts app/src/features/world/renamed.ts)" = full ] || fail "speeds.py --light: a tier-1 file renamed away is light"
[ "$(printf '' | python3 -I "$sp" --light "$r" "$t/main.review")" = full ] || fail "speeds.py --light: an empty change is light"
# A tier-1 path is one of either table, a tier-3 folder one of both: a tier-1 row the tree drops is still main's (R1), one it adds counts
# at once; a tier-3 folder the tree adds is no interface until main names it, and one it drops is none at once.
sed 's/, a guard (`app\/src\/features\/world\/guard.ts`)//' "$t/main.review" >"$r/docs/REVIEW.md"
[ "$(light app/src/features/world/guard.ts)" = full ] || fail "speeds.py --light: a tier-1 row the tree dropped made its path, in a tier-3 folder, light"
cp "$t/main.review" "$r/docs/REVIEW.md" && printf '| 1 | The new guard (`app/src/features/home/guard.ts`) | Claude | every line |\n' >>"$r/docs/REVIEW.md"
[ "$(light app/src/features/home/guard.ts)" = full ] || fail "speeds.py --light: a tier-1 row the tree added is light"
cp "$t/main.review" "$r/docs/REVIEW.md" && printf '| 3 | More: `server/src/`, `app/src/features/chat/` | Either | Run it |\n' >>"$r/docs/REVIEW.md"
for p in server/src/a.ts app/src/features/chat/Bubble.tsx; do
	[ "$(light "$p")" = full ] || fail "speeds.py --light: $p, of a tier-3 row the tree added, is light"
done
sed 's/`app\/src\/features\/home\/`, //' "$t/main.review" >"$r/docs/REVIEW.md"
[ "$(light app/src/features/home/Home.tsx)" = full ] || fail "speeds.py --light: a tier-3 folder the tree dropped is light"
cp "$t/main.review" "$r/docs/REVIEW.md"
# Either table unreadable, or one it reads with no tier-1 row or no tier-3 row (a column renamed, R3), is no light; and so is a call with
# no main's table.
for broken in tree main; do
	for tier in 1 3; do
		cp "$t/main.review" "$t/main.saved"
		if [ "$broken" = tree ]; then grep -v "^| $tier " "$t/main.saved" >"$r/docs/REVIEW.md"; else grep -v "^| $tier " "$t/main.saved" >"$t/main.review"; fi
		[ "$(light app/src/features/world/Here.tsx)" = full ] || fail "speeds.py --light: the $broken's table with no tier-$tier row is light"
		cp "$t/main.saved" "$t/main.review" && cp "$t/main.saved" "$r/docs/REVIEW.md"
	done
done
[ "$(printf 'app/src/features/world/Here.tsx\n' | python3 -I "$sp" --light "$r")" = full ] || fail "speeds.py --light: a call with no main's table is light"
mv "$t/main.review" "$t/main.gone" && { [ "$(light app/src/features/world/Here.tsx)" = full ] || fail "speeds.py --light: no main's table to read is light"; }
mv "$t/main.gone" "$t/main.review"
mv "$r/docs/REVIEW.md" "$r/docs/gone.md" && { [ "$(light app/src/features/world/Here.tsx)" = full ] || fail "speeds.py --light: no table to read is light"; }
fi

if part gate_speeds; then
full_fixture gate_speeds
# check.sh --merge has two speeds (slice 7, question 21): a change of interface alone skips StrykerJS (coverage, the patch's coverage and prove_fix
# stay, and so do the stories), any other change runs it; --full, which main requires, stays whole. The decision is scripts/speeds.py's, given
# check.sh's own list of the change (committed paths, and untracked files) in its repository.
[ -f "$here/speeds.py" ] || fail "scripts/speeds.py does not exist: check.sh --merge has no second speed"
cp "$here/speeds.py" "$g/scripts/" && mkdir -p "$g/docs"
printf '# Review\n\n| Tier | What | Written by | How it is reviewed |\n|---|---|---|---|\n| 1 | Realms (`gno/r/`) | Claude | Claude |\n| 1 | The login (`app/src/features/login/`, `server/src/login/`), the chain reads'"'"' builder (`app/src/lib/chain/evalCall.ts`) | Claude | Alexis |\n| 1 | The deploy folder (`deploy/`) | Claude | Alexis |\n| 2 | The rest of the server | Claude | tests |\n| 3 | Interface, 3D, motion (`app/src/features/`, `packages/ui/src/`) | Either | Run it |\n' >"$g/docs/REVIEW.md"
git -C "$g" add -A && git -C "$g" commit -qm "the second speed" && git -C "$g" update-ref refs/remotes/origin/main HEAD
base=$(git -C "$g" rev-parse HEAD)
accent=$(printf '\303\251')
change() { # the paths given are appended to and committed
	git -C "$g" reset -q --hard "$base" && git -C "$g" clean -qfd
	for f in "$@"; do mkdir -p "$g/$(dirname "$f")" && printf 'y\n' >>"$g/$f"; done
	git -C "$g" add -A && git -C "$g" commit -qm "change"
}
merge_gate() { rm -f "$g/.claude/tmp/green-fast"; out=$(gate --merge) || fail "check.sh --merge failed on $1: $out"; }
change packages/ui/src/a.ts app/src/features/chat/b.ts
merge_gate "a change of interface alone"
ran mutate && fail "check.sh --merge ran StrykerJS on a change of interface alone"
for s in coverage py:patch_coverage py:prove_fix stories py:probe py:audit; do ran "$s" || fail "check.sh --merge skipped $s on a change of interface alone: only StrykerJS is skipped"; done
printf '%s\n' "$out" | grep -qi "interface" || fail "check.sh --merge did not say it took the interface speed: $out"
change "app/src/features/chat/$accent.ts" packages/ui/src/a.ts
merge_gate "an interface file with a non-ASCII name"
ran mutate && fail "check.sh --merge read a non-ASCII interface path as a doubt: its list of the change was quoted"
for what in server/src/a.ts app/src/features/login/x.ts app/src/lib/chain/evalCall.ts deploy/a.conf app/src/features/LOGIN/x.ts gno/r/b; do
	change packages/ui/src/a.ts "$what"
	merge_gate "interface beside $what"
	ran mutate || fail "check.sh --merge skipped StrykerJS on an interface change beside $what"
done
# A new file nothing has staged: a tier-1 one beside committed interface files runs the full control.
change packages/ui/src/a.ts && mkdir -p "$g/app/src/features/login" && printf 'x\n' >"$g/app/src/features/login/new.ts"
merge_gate "an untracked login file beside interface files"
ran mutate || fail "check.sh --merge skipped StrykerJS for an untracked file of the login"
# A tier-1 file renamed into an interface folder, a link to a tier-1 file, a table it cannot read.
change packages/ui/src/a.ts && git -C "$g" mv server/src/a.ts packages/ui/src/moved.ts && git -C "$g" commit -qm "moved"
merge_gate "a server file renamed into the design system"
ran mutate || fail "check.sh --merge skipped StrykerJS for a server file renamed into an interface folder"
change packages/ui/src/a.ts && mkdir -p "$g/app/src/features/chat" "$g/app/src/lib/chain" && ln -s ../../lib/chain/evalCall.ts "$g/app/src/features/chat/l.ts" && git -C "$g" add -A && git -C "$g" commit -qm "a link"
merge_gate "a link under an interface folder"
ran mutate || fail "check.sh --merge skipped StrykerJS for a link in an interface folder"
# --full stays whole.
change packages/ui/src/a.ts
gate --full >/dev/null || fail "check.sh --full failed on a change of interface alone"
ran mutate || fail "check.sh --full skipped StrykerJS for a change of interface alone: main requires the whole"
# Only the word `interface`, the one line speeds.py prints with a clean exit, lowers the control (the red pass, finding 4): a script that
# crashes, prints nothing, prints two lines, prints it and then fails, or is gone, runs StrykerJS on a change of interface alone. The broken
# script and the table are part of the BASE here, never of the change: a change that edits them is not a change of interface (finding 5).
base0=$base
broken() { # $1: what scripts/speeds.py becomes (its text, or `gone`), or `table` for no docs/REVIEW.md
	git -C "$g" reset -q --hard "$base0" && git -C "$g" clean -qfd
	case $1 in gone) git -C "$g" rm -q scripts/speeds.py ;; table) git -C "$g" rm -q docs/REVIEW.md ;; *) printf '%s\n' "$1" >"$g/scripts/speeds.py" ;; esac
	git -C "$g" add -A && git -C "$g" commit -qm "a broken second speed" && git -C "$g" update-ref refs/remotes/origin/main HEAD
	base=$(git -C "$g" rev-parse HEAD)
	change packages/ui/src/a.ts app/src/features/chat/b.ts
}
for what in "import sys; sys.exit(1)" "pass" "print('interface'); print('full')" "import sys; print('interface'); sys.exit(3)" "print('interface ')" "print('Interface')" gone table; do
	broken "$what"
	merge_gate "a change of interface alone, with speeds.py as: $what"
	ran mutate || fail "check.sh --merge skipped StrykerJS for a change of interface alone when speeds.py was: $what"
	printf '%s\n' "$out" | grep -qi "a change of interface alone" && fail "check.sh --merge said it took the interface speed when speeds.py was: $what: $out"
done
base=$base0 && git -C "$g" update-ref refs/remotes/origin/main "$base0"
fi

if part gate_full_coverage; then
full_fixture gate_full_coverage
# F3384: the full gate's coverage runs after the probe (which plants faults in the tree) and never beside it, before prove_fix (40 minutes of
# a gate that then lost an hour of work to one test failing under load, and was not retried there), and retries a failed test once, as the
# fast gate does: the second run is given the failed file alone, logged for /pre-merge; a run that fails twice fails.
tries() { grep -c "^$1\( \|$\)" "$log"; }
unsteady=$g/.claude/tmp/unsteady.log
gate --full >/dev/null || fail "check.sh --full failed on a copy whose every step passes"
before "done py:probe" coverage || fail "check.sh --full ran the coverage beside the probe or before it"
before "done py:bench" coverage || fail "check.sh --full ran the coverage beside the benches"
before "done coverage" py:prove_fix || fail "check.sh --full ran prove_fix before the coverage was measured (F3384)"
rm -rf "${unsteady:?}"
out=$(FLAKY=coverage gate --full) || fail "check.sh --full failed a coverage run that passed the second time: $out"
[ "$(tries coverage)" = 2 ] || fail "check.sh --full ran the coverage $(tries coverage) times for one failure, not twice: $out"
# The second run is the WHOLE coverage, never the failed file alone: the thresholds (85% everywhere, core 100%, vitest.config.ts) are measured
# on every file, and one file cannot meet them, so a retry of one file would fail, or pass with the floors switched off. It carries the
# same command and no file, and the patch's coverage then reads the report of that whole run. (The red pass, finding 2: this keeps the floors.)
half=$(($(node -p "require('os').availableParallelism()") / 2))
[ "$half" -ge 1 ] || half=1
[ "$(grep -c "^coverage --maxWorkers=$half\( \|$\)" "$log")" = 2 ] || fail "check.sh --full did not run the whole coverage twice, with its workers' share: $(grep '^coverage' "$log")"
grep '^coverage ' "$log" | grep -q "test\.ts" && fail "check.sh --full gave the coverage's second run a file to run alone: one file cannot meet the floors: $(grep '^coverage' "$log")"
grep '^coverage ' "$log" | grep -q "coverage\.thresholds\|--coverage\.enabled\|--no-coverage\|--coverage=false" && fail "check.sh --full switched the coverage's floors off for its second run: $(grep '^coverage' "$log")"
before "done coverage" py:patch_coverage && [ "$(grep -c '^py:patch_coverage' "$log")" = 1 ] || fail "check.sh --full did not read the patch's coverage once, after the second coverage run"
[ "$(grep -c "" "$unsteady")" = 1 ] && grep -qF "app/src/a.test.ts" "$unsteady" || fail "check.sh --full did not log the coverage's one unsteady file: $(cat "$unsteady" 2>&1)"
printf '%s\n' "$out" | grep -q "^unsteady: .*running them once more" || fail "check.sh --full did not say it ran the coverage again: $out"
rm -rf "${unsteady:?}"
out=$(FAIL=coverage gate --full) && fail "check.sh --full passed with the coverage failing twice"
[ "$(tries coverage)" = 2 ] || fail "check.sh --full ran the coverage $(tries coverage) times when it failed, not twice"
printf '%s\n' "$out" | grep -q "failed twice" || fail "check.sh --full did not say the coverage failed twice: $out"
[ ! -e "$unsteady" ] || fail "check.sh --full logged a coverage file that failed twice"
# What else the first run had is no flake a second run clears (R1, scripts/unsteady.py, as in the fast gate): an unhandled error, which
# Vitest's JSON report does not hold but its console does (the console is the coverage's own, not another step's), and a file that failed with
# no failed test. Nothing runs again, nothing is logged, the first run's console is shown.
for also in "errors:an unhandled error" "noload:failed with no failed test"; do
	out=$(ALSO=${also%%:*} FLAKY=coverage gate --full) && fail "check.sh --full passed a coverage run that also had: ${also%%:*}: $out"
	[ "$(tries coverage)" = 1 ] || fail "check.sh --full ran the coverage again though the run also had: ${also%%:*}"
	printf '%s\n' "$out" | grep -qF "${also#*:}" || fail "check.sh --full did not say why it refused the coverage with: ${also%%:*}: $out"
	[ ! -e "$unsteady" ] || fail "check.sh --full logged a coverage run that also had: ${also%%:*}"
	printf '%s\n' "$out" | grep -qF "coverage failed here" || fail "check.sh --full hid the coverage's own first console when it refused: $out"
done
# Two files fail at once and both pass the second time: both are logged, one rerun.
out=$(ALSO=two FLAKY=coverage gate --full) || fail "check.sh --full failed two coverage files that passed the second time: $out"
[ "$(tries coverage)" = 2 ] || fail "check.sh --full ran the coverage $(tries coverage) times for two files failing at once: $out"
[ "$(grep -c "" "$unsteady")" = 2 ] || fail "check.sh --full did not log both unsteady coverage files: $(cat "$unsteady")"
rm -rf "${unsteady:?}"
out=$(NOREPORT=1 FLAKY=coverage gate --full) && fail "check.sh --full passed a coverage failure that left no report"
[ "$(tries coverage)" = 1 ] || fail "check.sh --full ran the coverage again after a failure with no report"
fi

if part gate_merge_continues; then
full_fixture gate_merge_continues
# --merge reports every failure of the run, and the coverage and StrykerJS run whatever failed beside them (the dream of 2026-11-01, 5): a
# failed lane, or a bench refused for the load, no longer stops the 20 minutes that find the survivors; --full keeps stopping (C.5, F823).
printf '\n' >>"$g/scripts/check_css.py" && printf 'z\n' >>"$g/server/src/a.ts" && printf 'x\n' >"$g/app/src/b.tsx" && git -C "$g" add app/src/b.tsx && git -C "$g" commit -qam "product code and harness"
# The first phase (lint, types, tests, the build and its budget) carries its failure too (round 1, reviewer-1-1): a journey, a lint error or
# a type error ended the check before the survivors' run. py:patch_coverage, beside a Vitest that wrote no report, is the next case.
for f in py:probe stories core_chromium py:prove_fix py:audit py:batch_size playwright lint typecheck py:patch_coverage; do
	out=$(FAIL=$f gate --merge) && fail "check.sh --merge passed with $f failing"
	printf '%s\n' "$out" | grep -q "^$f failed here" || fail "check.sh --merge hid $f's failure: $out"
	for s in coverage mutate; do ran "$s" || fail "check.sh --merge did not run $s after $f failed: a failure beside it stops nothing"; done
	printf '%s\n' "$out" | grep -q "lanes did not run" && fail "check.sh --merge said lanes did not run after $f failed: $out"
	printf '%s\n' "$out" | tail -1 | grep -q "^check.sh: FAILED at " || fail "check.sh --merge did not end on its failure after $f failed: $(printf '%s\n' "$out" | tail -1)"
done
out=$(FAIL=py:patch_coverage gate --merge) && fail "check.sh --merge passed with the patch's coverage failing"
printf '%s\n' "$out" | tail -1 | grep -q "FAILED at mutation:patch_coverage$" || fail "check.sh --merge named another step than the patch's coverage when StrykerJS went on beside it: $(printf '%s\n' "$out" | tail -1)"
out=$(FAIL=py:probe,stories,coverage,py:audit gate --merge) && fail "check.sh --merge passed with four steps failing"
for s in py:probe stories coverage py:audit; do printf '%s\n' "$out" | grep -q "^$s failed here" || fail "check.sh --merge hid the failure of $s among four: $out"; done
ran mutate || fail "check.sh --merge did not run StrykerJS beside a failed coverage and probe"
printf '%s\n' "$out" | grep -q "every failure above, in the order they came: probe:probe coverage:coverage stories:stories history:audit mutation:patch_coverage$" || fail "check.sh --merge did not say, at its end, every lane that failed and where: $(printf '%s\n' "$out" | tail -3)"
out=$(FAIL=mutate gate --merge) && fail "check.sh --merge passed with StrykerJS failing"
ran py:harness_mutate || fail "check.sh --merge did not run the harness's mutants after StrykerJS failed"
# --full is unchanged: a failure in the first phase stops it there.
out=$(FAIL=stories gate --full) && fail "check.sh --full passed with the stories failing"
ran mutate && fail "check.sh --full went on to StrykerJS after the stories failed"
out=$(FAIL=py:patch_coverage gate --full) && fail "check.sh --full passed with the patch's coverage failing"
ran mutate && fail "check.sh --full went on to StrykerJS after the patch's coverage failed"
fi

if part merge_waits; then
full_fixture merge_waits
# The dream's measure, no lock (2026-11-01, 4): every --merge records how long it waited for another's lock, in a log of the tools' cache,
# so the waits are read before anything is built. A line a run: the UTC time, the worktree, the seconds waited, who held it. The fast gate
# and --full take no lock and write none.
printf 'z\n' >>"$g/server/src/a.ts" && git -C "$g" commit -qam "product code"
waits="$g.home/.cache/gnoworld-tools/merge-waits.log"
lockdir="$g.home/.cache/gnoworld-tools/merge.lock"
mkdir -p "${lockdir%/*}"
gate --merge >/dev/null || fail "check.sh --merge failed with no lock held"
[ -f "$waits" ] || fail "check.sh --merge recorded no wait in $waits"
[ "$(grep -c "" "$waits")" = 1 ] || fail "check.sh --merge wrote $(grep -c "" "$waits") lines for one run: $(cat "$waits")"
grep -qE "waited 0 s" "$waits" || fail "check.sh --merge did not record a wait of 0 s with no lock held: $(cat "$waits")"
grep -qF "$(cd "$g" && pwd -P)" "$waits" || fail "the wait's line does not name this worktree: $(cat "$waits")"
grep -qE "^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z" "$waits" || fail "the wait's line starts with no UTC time: $(cat "$waits")"
# The holder lives until the test says so, never for a guessed time (a machine at a load of 30 to 50 reaches the lock late): the test waits for
# the run to announce that it waits, lets two more seconds pass, and only then ends the holder. The wait recorded is at least those two.
: >"$g/hold"
(while [ -e "$g/hold" ]; do sleep 0.2; done) &
holder=$!
mkdir "$lockdir" && printf '%s\n' "$holder" >"$lockdir/pid" && printf 'another-worktree\n' >"$lockdir/worktree" && date +%s >"$lockdir/since"
(gate --merge >"$g/waiting.out" 2>&1; echo $? >"$g/waiting.code") &
runner=$!
n=0
until grep -q "waiting for the merge check of another-worktree" "$g/waiting.out" 2>/dev/null; do
	n=$((n + 1))
	[ "$n" -lt 900 ] || { rm -f "$g/hold"; fail "check.sh --merge never said it waited for the lock: $(cat "$g/waiting.out" 2>&1)"; }
	sleep 0.2
done
sleep 2
rm -f "$g/hold"
wait "$runner"
[ "$(cat "$g/waiting.code")" = 0 ] || fail "check.sh --merge failed waiting for a lock: $(cat "$g/waiting.out")"
[ "$(grep -c "" "$waits")" = 2 ] || fail "check.sh --merge did not append its second wait: $(cat "$waits")"
n=$(tail -1 "$waits" | sed -n 's/.*waited \([0-9][0-9]*\) s.*/\1/p')
[ -n "$n" ] && [ "$n" -ge 2 ] || fail "check.sh --merge recorded a wait of '$n' s behind a holder that lived at least 2 s after the announcement: $(tail -1 "$waits")"
tail -1 "$waits" | grep -qF "another-worktree" || fail "the wait's line does not name the worktree that held the lock: $(tail -1 "$waits")"
gate >/dev/null && gate --full >/dev/null || fail "the fast gate or --full failed"
[ "$(grep -c "" "$waits")" = 2 ] || fail "the fast gate or --full wrote in the merge waits' log: $(cat "$waits")"
fi

if part gate_budgets; then
gate_fixture gate_budgets
# The first screen's budget (the dream of 2026-11-01, 6): a commit's gate that builds the app also reads the first screen's JavaScript with the
# budget spec's own measure, the browser's gzip (app/tests/e2e/budgets.spec.ts), and nothing else of the journeys: the build alone left a
# budget broken to the merge check, 30 minutes later.
printf 'x\n' >"$g/app/src/b.tsx"
out=$(gate) || fail "check.sh failed on a new app file: $out"
[ "$(grep -c '^playwright ' "$log")" = 1 ] || fail "check.sh did not run one Playwright command on a build: $(grep '^playwright' "$log")"
grep '^playwright ' "$log" | grep -q "app/tests/e2e/budgets.spec.ts" || fail "check.sh's fast gate did not run the budget spec after its build: $(grep '^playwright' "$log")"
# Its tests tagged @gate alone: the first screens and the measure's own case, and the late chunks weighed from the built files with no page
# (chunks.spec.ts; Alexis, 2026-11-04, "Oui, les deux": their journeys, a scene on a software GPU, timed out at a load of 60).
grep '^playwright ' "$log" | grep -qF " app/tests/e2e/chunks.spec.ts" || fail "check.sh's fast gate did not weigh the late chunks from the build: $(grep '^playwright' "$log")"
grep '^playwright ' "$log" | grep -qE -- " --grep @gate( |$)" || fail "check.sh's fast gate walked the late chunks' journeys, not the @gate tests alone: $(grep '^playwright' "$log")"
before build:app playwright || fail "check.sh ran the budget spec before the build it measures"
# The budget spec gets a free port of its own (not the config's fixed 4173, another gate's), and a free_ports that fails stops it before it starts.
port=$(sed -n 's/^playwright port=\([0-9]*\) .*/\1/p' "$log")
[ -n "$port" ] && [ "$port" -ge 1024 ] && [ "$port" -le 65533 ] && [ "$port" != 4173 ] || fail "check.sh gave the budget spec no free port of its own: $(grep '^playwright' "$log")"
out=$(PORTS_FAIL=1 gate) && fail "check.sh passed with no free port for the budget spec: $out"
printf '%s\n' "$out" | grep -q "^check.sh: lane ts failed at app" || fail "check.sh did not fail the ts lane at its app step when free_ports failed for the budget spec: $out"
ran playwright && fail "check.sh started the budget spec with no free port"
out=$(FAIL=playwright gate) && fail "check.sh passed with the first screen's budget failing"
printf '%s\n' "$out" | grep -q "^playwright failed here" || fail "check.sh hid the budget's failure: $out"
reset
printf 'y\n' >>"$g/server/src/a.ts"
gate >/dev/null || fail "check.sh failed on a server change"
ran playwright && fail "check.sh read the first screen's budget with no build"
fi

if part gate_timing; then
gate_fixture gate_timing
# The tests tagged `timing`, a bound in wall-clock time (Alexis, 2026-11-04, "Oui, les deux": other gates' load failed them for nothing): a
# commit's gate leaves them, in its related run, a run of every test and a failed file's second run alike; --full runs them, in its coverage.
filtered() { # $1: what the run was given; every Vitest run of the fast gate leaves the timing tests
	grep -q '^test ' "$log" || fail "check.sh ran no Vitest on $1"
	grep '^test ' "$log" | grep -qvE -- " --tags-filter=!timing( |$)" && fail "check.sh ran the timing tests on $1: $(grep '^test ' "$log")"
	:
}
printf 'x\n' >"$g/app/src/b.tsx"
out=$(gate) || fail "check.sh failed on a new app file: $out"
filtered "an app change's related tests"
out=$(gate --tests-all) || fail "check.sh --tests-all failed: $out"
filtered "--tests-all"
out=$(FLAKY=test gate) || fail "check.sh failed a Vitest run that passed the second time: $out"
[ "$(grep -c '^test ' "$log")" = 2 ] || fail "check.sh did not run a failed Vitest file a second time: $(grep '^test ' "$log")"
filtered "a failed file's second run"
out=$(AUDIT_ANSWER=x gate --full) || fail "check.sh --full failed: $out"
grep -q '^coverage ' "$log" || fail "check.sh --full ran no coverage"
grep '^coverage ' "$log" | grep -q -- "--tags-filter" && fail "check.sh --full left the timing tests out of its coverage: $(grep '^coverage ' "$log")"
fi

if part stop_gate_pingpong; then
# The ping-pong (Alexis, 2026-11-04: each retouch seen live in two minutes, the tests, the gate and the review once the batch is accepted):
# while Alexis's own `pnpm workshop` serves this checkout, a turn ends without the gate, which pre-commit still runs on every commit. Its
# sign is one no sandboxed command can plant (the chief): a shell running this checkout's scripts/workshop.sh, from this checkout's folder,
# its parent alive, that macOS's sandbox_check finds in no sandbox. Here the hook runs as it is but for its system tools' paths, turned to
# stubs that read one table of processes, each answering for its own pid: several run at once, as on a machine of many checkouts (F4851).
r="$t/pp" && mkdir -p "$r/scripts" "$r/.claude/tmp" "$t/ppbin" "$t/pphome" && cp "$here/code_changed.sh" "$r/scripts/" && printf '.claude/tmp/\n' >"$r/.gitignore"
git -C "$r" init -q && git -C "$r" add -A && git -C "$r" commit -qm init && echo 'package x' >"$r/x.go"
root=$(cd "$r" && pwd -P) && python=$(command -v python3) && table="$t/pp.table"
turned() { # $1: the copy; the tools after it are turned to the stubs, each of which the hook must name by its system path
	from="$1" && shift
	cp "$here/stop_gate.sh" "$from"
	for tool in "$@"; do
		case $tool in ps) system=/bin/ps ;; lsof) system=/usr/sbin/lsof ;; python3) system=/usr/bin/python3 ;; esac
		grep -qF "$system -" "$from" || fail "stop_gate.sh no longer asks the system's own $tool by its path ($system): update stop_gate_pingpong"
		sed "s|$system -|$t/ppbin/$tool -|g" "$from" >"$from.new" && mv "$from.new" "$from"
	done
}
turned "$t/stop_gate.sh" ps lsof python3
turned "$t/stop_gate.real.sh" ps lsof # the real python3 and macOS's own sandbox_check
cat >"$t/ppbin/ps" <<SH
#!/bin/sh
while IFS='|' read -r pid ppid age cwd box cmd; do printf '%6s %5s %11s %s\n' "\$pid" "\$ppid" "\$age" "\$cmd"; done <"$table"
SH
cat >"$t/ppbin/lsof" <<SH
#!/bin/sh
want= prev=
for a in "\$@"; do [ "\$prev" != -p ] || want=\$a; prev=\$a; done
while IFS='|' read -r pid ppid age cwd box cmd; do [ -z "\$want" ] || [ "\$want" = "\$pid" ] || continue; printf 'p%s\nfcwd\nn%s\n' "\$pid" "\$cwd"; done <"$table"
SH
cat >"$t/ppbin/python3" <<SH
#!/bin/sh
case "\$*" in *sandbox_check*) ;; *) exec "$python" "\$@" ;; esac
for last; do :; done
while IFS='|' read -r pid ppid age cwd box cmd; do [ "\$pid" != "\$last" ] || exit "\$box"; done <"$table"
exit 1
SH
chmod +x "$t/ppbin/ps" "$t/ppbin/lsof" "$t/ppbin/python3"
procs() { printf '%s\n' "$@" >"$table"; } # each: pid|ppid|age|folder|sandbox_check's answer as an exit|command
hook() { rm -f "$r/.claude/tmp/gate-blocked"; printf '{"stop_hook_active":false}' | HOME="$t/pphome" PATH="$t/ppbin:$PATH" CLAUDE_PROJECT_DIR="$r" sh "${1:-$t/stop_gate.sh}" 2>/dev/null; }
ends() { code=0; hook "${2:-}" || code=$?; [ "$code" = 0 ] || fail "stop_gate blocked a turn while this checkout's workshop ran outside the sandbox, $1 (exit $code)"; }
blocks() { code=0; hook "${2:-}" || code=$?; [ "$code" = 2 ] || fail "stop_gate let a turn end without the gate when $1 (exit $code)"; }
procs "4001|4000|05:00|$root|0|sleep 600" && blocks "no workshop ran"
for form in "sh scripts/workshop.sh" "/bin/sh $root/scripts/workshop.sh" "bash ./scripts/workshop.sh" "zsh scripts/workshop.sh" "dash scripts/workshop.sh"; do
	procs "4001|4000|05:00|$root|0|$form" && ends "as '$form'"
done
# The gate's own record and its block are left as they were: the ping-pong ends a turn, it passes no gate.
[ ! -e "$r/.claude/tmp/gate-green" ] && [ ! -e "$r/.claude/tmp/gate-blocked" ] || fail "stop_gate wrote a record of the gate during a ping-pong"
# Beside others (F4851): a session's sandboxed workshop of this checkout, Alexis's of a sibling checkout whose folder this one's begins, a
# workshop's server in this checkout's app; then Alexis's own of this one, last.
w="sh scripts/workshop.sh"
n1="4001|4000|05:00|$root|1|$w" n2="4002|4000|05:00|${root}3|0|$w" n3="4003|4000|05:00|$root/app|0|$w"
procs "$n1" "$n2" "$n3" && blocks "a sandboxed workshop of this checkout ran beside Alexis's of another"
procs "$n1" "$n2" "$n3" "4004|4000|05:00|$root|0|$w" && ends "beside a sandboxed one and another checkout's"
# What a session could plant, or a sign that is not the workshop's: each blocks, as before.
procs "4001|4000|05:00|$root|1|$w" && blocks "the workshop ran in the sandbox"
procs "4001|4000|05:00|/elsewhere|0|$w" && blocks "the workshop ran from another folder"
procs "4001|4000|05:00|$root|0|sh /elsewhere/scripts/workshop.sh" && blocks "another checkout's workshop.sh ran from this folder"
procs "4001|4000|05:00|$root|0|vim scripts/workshop.sh" && blocks "an editor named the workshop's script"
procs "4001|4000|05:00|$root|0|sh -c sleep 1 # scripts/workshop.sh" && blocks "a comment named the workshop's script"
procs "4001|4000|05:00|$root|0|sh scripts/workshop.sh.old" && blocks "a file named like the workshop's script ran"
procs "4001|4000|05:00|$root|0|sh scripts/workshop.sh --again" && blocks "the workshop's script ran with an argument it takes none of"
procs "4001|4000|05:00|$root|0|node scripts/workshop.sh" && blocks "another program than a shell ran the workshop's script"
# F4852: a look-alike that code the workshop runs started, outliving the workshop's Ctrl+C, is launchd's (its parent gone).
procs "4001|1|05:00|$root|0|$w" && blocks "a workshop.sh whose parent is gone ran"
printf '4001 4001 5198\n' >"$r/.claude/tmp/workshop.pid" && procs "4001|4000|05:00|$root|0|sleep 600" && blocks "a pid file named a process outside the sandbox"
rm "$r/.claude/tmp/workshop.pid"
# Each tool it needs, missing (127) or failing (1).
for tool in ps lsof python3; do
	for status in 127 1; do
		cp "$t/ppbin/$tool" "$t/ppbin/$tool.saved" && printf '#!/bin/sh\nexit %s\n' "$status" >"$t/ppbin/$tool"
		procs "4001|4000|05:00|$root|0|$w" && blocks "$tool exited $status"
		mv "$t/ppbin/$tool.saved" "$t/ppbin/$tool"
	done
done
# F4852: the reaper runs at every turn's end, a ping-pong's too: a node of this project left by a dead parent an hour ago is stopped.
rm -f "$t/pphome/Library/Logs/gnoworld-reaped.log"
procs "4001|4000|05:00|$root|0|$w" "999999|1|01:00:00|/x|0|node /x/gnoworld/stray.js" && ends "with a stray node to reap"
grep -q '^999999 ' "$t/pphome/Library/Logs/gnoworld-reaped.log" 2>/dev/null || fail "stop_gate's reaper did not run at a ping-pong's end"
# macOS's own sandbox_check, asked by the real python3 (F4850): launchd, pid 1, is in no sandbox; this test's own process is in Claude
# Code's when the suite runs there. A module planted in the project's folder, as a session can, is never imported: Python runs isolated.
if [ "$(uname)" = Darwin ]; then
	printf 'open(%s, "w").write("imported")\nclass CDLL:\n    def __init__(self, path):\n        self.sandbox_check = lambda *a: 0\nc_int = c_char_p = int\n' "'$t/pp.planted'" >"$r/ctypes.py"
	procs "1|0|05:00|$root|x|$w" && ends "as pid 1, which macOS's sandbox_check finds in no sandbox" "$t/stop_gate.real.sh"
	sleep 600 </dev/null >/dev/null 2>&1 &
	held=$!
	procs "$held|$$|05:00|$root|x|$w" && hook "$t/stop_gate.real.sh" >/dev/null || :
	[ ! -e "$t/pp.planted" ] || fail "stop_gate's python3 imported a module planted in the project's folder"
	if "$python" -Ic 'import ctypes, sys; c = ctypes.CDLL("/usr/lib/libSystem.dylib").sandbox_check; c.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int]; sys.exit(c(int(sys.argv[1]), None, 0) == 0)' "$held"; then
		blocks "the real sandbox_check let a process of a sandbox pass" "$t/stop_gate.real.sh"
	fi
	kill "$held"
	rm "$r/ctypes.py"
fi
fi

if part harness_timeout; then
shards_fixture
# F3382: a suite past its limit (600 s) counts as a caught mutant and its process group is stopped, TERM then KILL; the verdict won by time
# is printed as such and not kept (the load can cause it); a control past the limit still fails the run, with a word and no traceback.
# The copy's limit is 2 s. The suite hangs on a mutant of KEEP1 (a child that outlives its parent, pid recorded) and on its control with HANG_CONTROL.
python3 -I - "$hs/repo/harness_mutate.py" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
s, n = re.subn(r"(?<![\d.])600(?![\d.])", "2", s)
assert n, "harness_mutate.py holds no 600 any more: update test_hooks.sh's harness_timeout"
open(p, "w").write(s)
PY
printf '%s\n' 'part() { case ",$ONLY," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }' \
	'[ -n "$ONLY" ] || { [ -z "${HANG_CONTROL:-}" ] || { sleep 15 & echo $! >>"$SHARD_ROOT/child.pid"; wait; }; exit 0; }' \
	'if part x; then' \
	'	pwd >>"$SHARD_ROOT/ran"' \
	'	grep -q KEEP1 g.txt || { [ -z "${TRAP:-}" ] || trap "" TERM; sleep 15 & echo $! >>"$SHARD_ROOT/child.pid"; wait; }' \
	'	grep -q KEEP2 g.txt && grep -q KEEP3 g.txt && grep -q " SPARE" g.txt && grep -q KEEP4 h.txt && grep -q " SPARE2" h.txt && grep -q KEEP5 i.txt' \
	'fi' >"$hs/src/scripts/test_hooks.sh"
reap() { [ ! -e "$hs/child.pid" ] || for p in $(cat "$hs/child.pid"); do kill -9 "$p" 2>/dev/null || true; done; }
out=$(shards 1) || { reap; fail "harness_mutate failed when a suite hung past its limit on a mutant: $out"; }
printf '%s\n' "$out" | grep -q "^ok    killed: planted keep1 #1" || { reap; fail "harness_mutate did not count the hung suite as a caught mutant: $out"; }
printf '%s\n' "$out" | grep "planted keep1 #1" | grep -qiE "time(d)? ?out|too long|limit" || { reap; fail "harness_mutate did not print that planted keep1 was won by time: $out"; }
printf '%s\n' "$out" | grep -q "Traceback" && { reap; fail "harness_mutate printed a traceback for a suite past its limit: $out"; }
[ -s "$hs/child.pid" ] || { reap; fail "the hung suite never started its child"; }
for p in $(cat "$hs/child.pid"); do
	n=0
	until ! kill -0 "$p" 2>/dev/null; do n=$((n + 1)); [ "$n" -lt 40 ] || { reap; fail "harness_mutate left the hung suite's child $p running: its process group was not stopped"; }; sleep 0.1; done
done
for k in keep2 keep3 keep4 keep5; do printf '%s\n' "$out" | grep -q "^ok    killed: planted $k #1" || { reap; fail "harness_mutate lost the verdict of planted $k after a hung suite: $out"; }; done
# Not kept: the next run judges the hung mutant again, and takes the others from the cache.
out=$(WARM=1 shards 1) || { reap; fail "harness_mutate failed on its second run: $out"; }
printf '%s\n' "$out" | grep -q "killed (cached): planted keep1 #1" && { reap; fail "harness_mutate kept in its cache a verdict won by time: $out"; }
printf '%s\n' "$out" | grep -q "killed (cached): planted keep2 #1" || { reap; fail "harness_mutate took no other verdict from the cache: $out"; }
reap
# A suite that traps TERM, as test suites do, and a child that ignores it too: only KILL stops them, and still no later than the others.
rm -f "$hs/child.pid"
out=$(TRAP=1 shards 1) || { reap; fail "harness_mutate failed when a suite that ignores TERM hung past its limit: $out"; }
printf '%s\n' "$out" | grep "planted keep1 #1" | grep -qiE "time(d)? ?out|too long|limit" || { reap; fail "harness_mutate did not stop a suite that ignores TERM, or did not print that planted keep1 was won by time: $out"; }
for p in $(cat "$hs/child.pid" 2>/dev/null); do
	n=0
	until ! kill -0 "$p" 2>/dev/null; do n=$((n + 1)); [ "$n" -lt 40 ] || { reap; fail "harness_mutate left the child $p of a suite that ignores TERM running: its group was not killed"; }; sleep 0.1; done
done
printf '%s\n' "$out" | grep -q "^ok    killed: planted keep2 #1" || { reap; fail "harness_mutate lost the verdicts after a suite that ignores TERM: $out"; }
reap
# A control past the limit is no pass: a hung control proves nothing about the mutants.
rm -f "$hs/child.pid"
out=$(HANG_CONTROL=1 shards 1) && { reap; fail "harness_mutate passed with a control suite that hung past its limit: $out"; }
printf '%s\n' "$out" | grep -q "Traceback" && { reap; fail "harness_mutate printed a traceback for a control past its limit: $out"; }
printf '%s\n' "$out" | grep -qiE "control|untouched" || { reap; fail "harness_mutate did not say a control hung: $out"; }
printf '%s\n' "$out" | grep -q "^ok    killed: " && { reap; fail "harness_mutate judged mutants after its control hung: $out"; }
n=0
for p in $(cat "$hs/child.pid" 2>/dev/null); do until ! kill -0 "$p" 2>/dev/null; do n=$((n + 1)); [ "$n" -lt 40 ] || { reap; fail "harness_mutate left the hung control's child running"; }; sleep 0.1; done; done
reap
fi

if part harness_named_in; then
# F3383: named_in names the files of the tree whose name a context holds, "more than it needs to, never less". A basename inside a longer
# word is not that file's name (`server/src/config.ts` is not named by `vitest.config.ts`, which voided all 1,141 verdicts when the
# recommendations changed it), a name with characters outside \w.- (React Router's `$id.tsx`, `[slug].tsx`, a space) still is, and the
# context is cut into names once, not searched by one regex a file.
python3 -I - "$here/harness_mutate.py" "$t/named" <<'PY' || fail "harness_mutate.py's named_in (F3383), above"
import ast, os, sys

path, tree_root = sys.argv[1], sys.argv[2]
ns = {"__name__": "named_in_probe"}
for node in ast.parse(open(path).read()).body:
    if isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef, ast.Assign)):
        try:
            exec(compile(ast.Module([node], []), path, "exec"), ns)
        except Exception:
            pass  # a definition that needs the run (its git, its own source) is none of named_in's
assert "named_in" in ns and "ALWAYS" in ns, "named_in or ALWAYS is not defined at the top of harness_mutate.py"
files = ["server/src/config.ts", "vitest.config.ts", "app/routes/$id.tsx", "app/routes/[slug].tsx", "docs/my file.md", "a.ts", "data.ts", "x.ts",
         "pnpm-lock.yaml", ".node-version", "scripts/x.py", "node_modules/pkg/config.ts"]
for f in files:
    os.makedirs(os.path.dirname(os.path.join(tree_root, f)) or tree_root, exist_ok=True)
    open(os.path.join(tree_root, f), "w").close()
ns["WORKTREE"] = tree_root


def named(context):
    return set(ns["named_in"](context))


got = named("run vitest.config.ts here")
assert "vitest.config.ts" in got, got
assert "server/src/config.ts" not in got, f"`vitest.config.ts` names server/src/config.ts: {got}"
assert "server/src/config.ts" in named("see config.ts"), "config.ts as a word does not name server/src/config.ts"
assert "server/src/config.ts" in named("'server/src/config.ts':12"), "a path with a colon after it does not name its file"
assert "a.ts" not in named("data.ts"), "`data.ts` names a.ts"
assert "data.ts" in named("(data.ts), x"), "a name in parentheses is not named"
assert "x.ts" in named("a/x.ts, b") and "a.ts" not in named("a/x.ts, b"), "a name after a slash and before a comma"
# "Never less": a name beside any punctuation of a sentence, a flag or a command is still named (a word cutter that keeps the full stop
# in the word names LESS, and a verdict would be reused after the file changed).
for context in ("edit scripts/x.py.", "see x.py.", "a=scripts/x.py;b", "--file=scripts/x.py", "x.py=1", "(scripts/x.py)", "scripts/x.py,", "'x.py'", "`x.py`", "x.py;", "x.py:3:1", "x.py\nnext", "-x.py", "run x.py!"):
    assert "scripts/x.py" in named(context), f"{context!r} does not name scripts/x.py"
assert "vitest.config.ts" in named("--config=vitest.config.ts") and "server/src/config.ts" not in named("--config=vitest.config.ts"), "a flag's value is not a name of its own"
assert "a.ts" not in named("a.tsx") and "a.ts" not in named("a.ts.orig") and "a.ts" not in named("xa.ts") and "a.ts" not in named("a.ts-old"), "a name inside a longer one is named"
assert "a.ts" in named("a.ts.") and "a.ts" in named("a.ts. Then b"), "a name that ends a sentence is not named"
assert "app/routes/$id.tsx" in named('cat "app/routes/$id.tsx"'), "a name with $ is not named"
assert "app/routes/[slug].tsx" in named("open app/routes/[slug].tsx now"), "a name with [] is not named"
assert "docs/my file.md" in named("docs/my file.md changed"), "a name with a space is not named"
assert "docs/my file.md" in named("'docs/my file.md'"), "a quoted name with a space is not named"
assert "docs/my file.md" in named("see docs/my file.md."), "a name with a space that ends a sentence is not named"
assert "docs/my file.md" not in named("xmy file.md") and "docs/my file.md" not in named("my file.md.orig") and "docs/my file.md" not in named("my file.mdx"), "a name with a space inside a longer one is named"
assert {"pnpm-lock.yaml", ".node-version"} <= named(""), "the tools' versions are not always named"
assert not [f for f in named("config.ts") if f.startswith("node_modules")], "node_modules is read"


# The context is cut into names once: the calls to `re` do not grow with the files.
class Counting:
    def __init__(self, real):
        self.real, self.calls = real, 0

    def __getattr__(self, name):
        attr = getattr(self.real, name)
        if not callable(attr):
            return attr

        def counted(*a, **k):
            self.calls += 1
            return attr(*a, **k)

        return counted


many = os.path.join(tree_root, "many")
os.makedirs(many)
for i in range(300):
    open(os.path.join(many, f"file{i}.ts"), "w").close()
real_re = ns.get("re")
if real_re is not None:
    counter = ns["re"] = Counting(real_re)
    ns["named_in"]("context with file7.ts and others, one more distinct context")
    assert counter.calls <= 20, f"named_in made {counter.calls} calls to re for 300 files: one regex a file"
    ns["re"] = real_re
PY
fi

if part check_docs_cells; then
# The findings ledger keeps seven cells a row (the dream of 2026-11-01, 3): a row of F<nnn> with six cells, or eight, was skipped by the checks
# that read it (1,992 rows read, 95 with more cells and 14 with fewer were not). A pipe in a cell is escaped, `\|`, as the splitter reads it.
docs="$here"/check_docs.py
c="$t/cells-root"
mkdir -p "$c/docs/review"
printf '' >"$c/CLAUDE.md"
good_rules "$c"
cells() { printf '| Id | Found | By | Where | Claim | Status | Evidence |\n|---|---|---|---|---|---|---|\n%s\n' "$1" >"$c/docs/review/findings.md"; python3 -I "$docs" "$c" 2>&1; }
cells '| F001 | 2026-10-17 | a | x.py:1 | a bug | rejected | why |' >/dev/null || fail "check_docs refused a row of seven cells"
out=$(cells '| F002 | 2026-10-17 | a | x.py:1 | a bug | rejected |') && fail "check_docs accepted a row of six cells"
printf '%s\n' "$out" | grep -q "F002" && printf '%s\n' "$out" | grep -qi "cells" || fail "check_docs did not name the row of six cells and say cells: $out"
out=$(cells '| F003 | 2026-10-17 | a | x.py:1 | a | b | rejected | why |') && fail "check_docs accepted a row of eight cells"
printf '%s\n' "$out" | grep -q "F003" || fail "check_docs did not name the row of eight cells: $out"
cells '| F004 | 2026-10-17 | a | x.py:1 | a \| b | rejected | why |' >/dev/null || fail "check_docs refused a row whose pipe is escaped"
out=$(cells '| F005 | 2026-10-17 | a | x.py:1 | a bug | rejected | why | |') && fail "check_docs accepted a row with a trailing empty cell (eight)"
printf '%s\n' "$out" | grep -q "F005" || fail "check_docs did not name the row with a trailing empty cell: $out"
printf '| Id | Found | By | Where | Claim | Status | Evidence |\n|---|---|---|---|---|---|---|\n| F006 | 2026-10-17 | a | x.py:1 | a bug | rejected | why |\n\nF007 | a sentence that starts like a row | and has pipes, but no row.\n' >"$c/docs/review/findings.md"
python3 -I "$docs" "$c" >/dev/null 2>&1 || fail "check_docs read a sentence with pipes as a ledger row"
fi

if part dream_due; then
# scripts/dream_due.sh: the SessionStart hook that says a dream is due when a slice was merged with no dream recorded (the dream of 2026-11-01,
# item 15 of slice 7's answers). It runs outside the sandbox as stop_gate.sh does: git, read-only, and text tools, no gate and no repository
# code; it blocks no session (exit 0 always), and a read that fails says it could not tell. It reads committed rows alone, never the worktree:
# main's docs/review-log.md, the last row `The dream of <sha>` (dream.md's step 5 writes it), and the rows of the branches main has not got
# (F4063); a dream is due when main has a merge after those shas. Its wiring in .claude/settings.json is Alexis's (apply-7s.sh); no test here reads it.
dds="$here"/dream_due.sh
[ -f "$dds" ] || fail "scripts/dream_due.sh does not exist: nothing says a dream is due"
r="$t/dream"
mkdir -p "$r/docs"
git -C "$r" init -q && git -C "$r" checkout -q -b main
printf '| Date | Review |\n|---|---|\n| 2026-10-01 | slice 1 |\n' >"$r/docs/review-log.md"
git -C "$r" add -A && git -C "$r" commit -qm base
ask() { # $1: the project folder, the repository by default
	code=0
	out=$(CLAUDE_PROJECT_DIR="${1:-$r}" sh "$dds" </dev/null 2>&1) || code=$?
	[ "$code" = 0 ] || fail "dream_due.sh ended with $code, and a SessionStart hook blocks nothing: $out"
}
merge_slice() { # $1: a name; main gets a real merge of a branch of one commit
	git -C "$r" checkout -q -b "$1" && printf '%s\n' "$1" >"$r/$1.txt" && git -C "$r" add "$1.txt" && git -C "$r" commit -qm "$1"
	git -C "$r" checkout -q main && git -C "$r" merge -q --no-ff -m "Merge branch '$1'" "$1"
}
recorded() { # $1: a commit; a row of the dream of it, on the branch checked out
	printf '| 2026-11-01 | The dream of %s (a slice), `/dream`: the dreamer | 9 proposals | not measured |\n' "$(git -C "$r" rev-parse --short=8 "$1")" >>"$r/docs/review-log.md"
	git -C "$r" commit -qam "dream of $1"
}
ask
[ -z "$out" ] || fail "dream_due.sh said something with no merge on main: $out"
merge_slice one
m1=$(git -C "$r" rev-parse HEAD)
ask
printf '%s\n' "$out" | grep -qi "dream" && printf '%s\n' "$out" | grep -qi "due" || fail "dream_due.sh did not say a dream is due after a merge with no dream recorded: $out"
recorded "$m1"
ask
[ -z "$out" ] || fail "dream_due.sh said a dream is due though main's last merge has its dream: $out"
merge_slice two
m2=$(git -C "$r" rev-parse HEAD)
ask
printf '%s\n' "$out" | grep -qi "dream" && printf '%s\n' "$out" | grep -qi "due" || fail "dream_due.sh did not say a dream is due after a merge past the last dream: $out"
# Committed rows alone: the row of the second merge on the disk, and staged, covers nothing.
printf '| 2026-11-02 | The dream of %s (uncommitted) | x |\n' "$(git -C "$r" rev-parse --short=8 "$m2")" >>"$r/docs/review-log.md"
git -C "$r" add docs/review-log.md
ask
printf '%s\n' "$out" | grep -qi "due" || fail "dream_due.sh read a row of the work tree or the index, not a committed one: $out"
git -C "$r" reset -q && git -C "$r" checkout -q docs/review-log.md
# Read-only: the index and the work tree are as they were.
touch "$t/dream.mark"
before_index=$(cksum <"$r/.git/index") && before_status=$(git -C "$r" status --porcelain)
ask
[ "$(cksum <"$r/.git/index")" = "$before_index" ] || fail "dream_due.sh wrote git's index"
[ "$(git -C "$r" status --porcelain)" = "$before_status" ] || fail "dream_due.sh changed the work tree"
[ -z "$(find "$r" -newer "$t/dream.mark" -type f -not -path '*/.git/*' 2>/dev/null)" ] || fail "dream_due.sh wrote a file in the work tree"
recorded "$m2"
ask
[ -z "$out" ] || fail "dream_due.sh said a dream is due though main's last merge has its dream (two rows): $out"
# A sha git does not know, a main that is not there, a log that is not there, a folder that is no repository: it could not tell, and blocks nothing.
printf '| 2026-11-03 | The dream of deadbee1 (a commit nobody has) | x |\n' >>"$r/docs/review-log.md" && git -C "$r" commit -qam "a dream of nothing"
ask
printf '%s\n' "$out" | grep -qi "could not tell" || fail "dream_due.sh did not say it could not tell for a sha git does not know: $out"
printf '%s\n' "$out" | grep -qi "is due" && fail "dream_due.sh said a dream is due on a sha it could not read: $out"
git -C "$r" reset -q --hard HEAD~1
# The sha is a value a session may have written in a file Alexis merges unread, and this hook runs outside the sandbox: whatever is not 7 to
# 40 hexadecimal digits is never given to git, as an option, a command or a pattern. Each ends "could not tell", exit 0, nothing created, the
# index and the work tree as they were (the red pass, finding 8).
mkdir -p "$r/trap" && : >"$r/trap/a" && git -C "$r" add trap/a && git -C "$r" commit -qm "a file for a glob to find" && keep=$(git -C "$r" rev-parse HEAD)
for hostile in "--output=$t/pwned" "-1" "--all" "-n1" "\$(touch $t/pwned)" ";touch $t/pwned" "\`touch $t/pwned\`" "*" "trap/*" "../../etc/passwd" "HEAD" "main" "deadbee1~1" "deadbee1^{commit}" "dead" "$(printf 'b%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41)"; do
	printf '| 2026-11-04 | The dream of %s (hostile) | x |\n' "$hostile" >>"$r/docs/review-log.md" && git -C "$r" commit -qam "a hostile row"
	before_index=$(cksum <"$r/.git/index")
	ask
	printf '%s\n' "$out" | grep -qi "could not tell" || fail "dream_due.sh did not say it could not tell for the sha '$hostile': $out"
	printf '%s\n' "$out" | grep -qi "is due" && fail "dream_due.sh said a dream is due on the sha '$hostile': $out"
	[ ! -e "$t/pwned" ] || fail "dream_due.sh ran what the sha '$hostile' said"
	[ "$(cksum <"$r/.git/index")" = "$before_index" ] || fail "dream_due.sh wrote git's index on the sha '$hostile'"
	git -C "$r" reset -q --hard "$keep"
done
{ printf '| 2026-11-04 | The dream of '; head -c 100000 /dev/zero | tr '\0' a; printf ' (a long word) | x |\n'; } >>"$r/docs/review-log.md" && git -C "$r" commit -qam "a long row"
ask
printf '%s\n' "$out" | grep -qi "could not tell" || fail "dream_due.sh did not say it could not tell for a word of 100,000 characters: $out"
git -C "$r" reset -q --hard "$keep"
# A sha git knows that main does not contain (a slice never merged) is none to count from; a plain commit of main after the last merge, once
# its dream is recorded, is covered; rows out of order cover what the newest of them covers.
git -C "$r" checkout -q -b unmerged && printf 'u\n' >"$r/unmerged.txt" && git -C "$r" add unmerged.txt && git -C "$r" commit -qm "unmerged" && um=$(git -C "$r" rev-parse HEAD) && git -C "$r" checkout -q main
recorded "$um"
ask
printf '%s\n' "$out" | grep -qi "could not tell" || fail "dream_due.sh did not say it could not tell for a commit main does not contain: $out"
printf '%s\n' "$out" | grep -qi "is due" && fail "dream_due.sh counted merges from a commit main does not contain: $out"
git -C "$r" reset -q --hard "$keep"
git -C "$r" branch -qD unmerged # its log holds main's rows, which a branch main has not got would keep covering in the cases below
printf 'note\n' >"$r/note.md" && git -C "$r" add note.md && git -C "$r" commit -qm "a plain commit after the last merge" && recorded "$(git -C "$r" rev-parse HEAD)"
ask
[ -z "$out" ] || fail "dream_due.sh said a dream is due though the plain commit after main's last merge has its dream: $out"
git -C "$r" reset -q --hard "$keep"
recorded "$m1"
ask
[ -z "$out" ] || fail "dream_due.sh read the older dream's row, listed last, as the newest: $out"
git -C "$r" reset -q --hard "$keep"
# An older row is read as hostile as the last (round 1, reviewer-1-4): a word git reads as a name (main, HEAD), a commit main does not contain,
# and a row past the last twenty each cover nothing; here the merge of m2 stays uncovered beside a valid last row naming m1.
log_with() { # rows (hostile or older) first, then the valid last row for m1
	printf '| Date | Review |\n|---|---|\n' >"$r/docs/review-log.md"
	for w in "$@"; do printf '| 2026-11-05 | The dream of %s (older) | x |\n' "$w" >>"$r/docs/review-log.md"; done
	recorded "$m1"
}
for older in main HEAD "$(git -C "$r" rev-parse --short=8 "$um")"; do
	log_with "$older"
	ask
	printf '%s\n' "$out" | grep -qi "is due" || fail "dream_due.sh let the older row '$older' cover merges it does not name: $out"
	git -C "$r" reset -q --hard "$keep"
done
many=
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do many="$many $(git -C "$r" rev-parse --short=8 "$m1")"; done
# shellcheck disable=SC2086 # the shas, one word each
log_with "$(git -C "$r" rev-parse --short=8 "$m2")" $many
ask
printf '%s\n' "$out" | grep -qi "is due" || fail "dream_due.sh read a row past the last twenty, which a newer dream has overtaken: $out"
git -C "$r" reset -q --hard "$keep"
git -C "$r" branch -m main trunk
ask
printf '%s\n' "$out" | grep -qi "could not tell" || fail "dream_due.sh did not say it could not tell with no main: $out"
git -C "$r" branch -m trunk main
r2="$t/dream2" && mkdir -p "$r2" && git -C "$r2" init -q && git -C "$r2" checkout -q -b main && printf 'x\n' >"$r2/a" && git -C "$r2" add a && git -C "$r2" commit -qm base
ask "$r2"
printf '%s\n' "$out" | grep -qi "could not tell" || fail "dream_due.sh did not say it could not tell with no docs/review-log.md on main: $out"
mkdir -p "$t/norepo"
ask "$t/norepo"
printf '%s\n' "$out" | grep -qi "could not tell" || fail "dream_due.sh did not say it could not tell outside a repository: $out"
# A dream's row lands on the next slice's branch and reaches main only with the next merge, itself past the sha, so main alone said a dream was
# due in every session (F4063): a committed row of a branch main has not got counts, when main contains its sha, and covers no later merge.
merge_slice three
m3=$(git -C "$r" rev-parse HEAD)
git -C "$r" checkout -q -b eight && recorded "$m3" && git -C "$r" checkout -q main
ask
[ -z "$out" ] || fail "dream_due.sh said a dream is due though a branch main has not got holds the row of main's last merge (F4063): $out"
merge_slice four
ask
printf '%s\n' "$out" | grep -qi "is due" || fail "dream_due.sh let a branch's row cover a merge after its sha: $out"
# Such a row is read as hostile as main's own: a word git reads as a name, and a commit main does not contain, cover nothing.
git -C "$r" checkout -q -b nine
printf '| 2026-11-06 | The dream of main (hostile) | x |\n| 2026-11-06 | The dream of %s (never merged) | x |\n' "$(git -C "$r" rev-parse --short=8 "$um")" >>"$r/docs/review-log.md"
git -C "$r" commit -qam "hostile rows on a branch" && git -C "$r" checkout -q main
ask
printf '%s\n' "$out" | grep -qi "is due" || fail "dream_due.sh let a hostile row of a branch cover main's merges: $out"
# Branches it cannot list: it could not tell.
mkdir -p "$t/dreambin"
printf '#!/bin/sh\nfor a in "$@"; do [ "$a" = for-each-ref ] && exit 1; done\nexec "%s" "$@"\n' "$(command -v git)" >"$t/dreambin/git"
chmod +x "$t/dreambin/git"
out=$(PATH="$t/dreambin:$PATH" CLAUDE_PROJECT_DIR="$r" sh "$dds" </dev/null 2>&1)
printf '%s\n' "$out" | grep -qi "could not tell" || fail "dream_due.sh did not say it could not tell with branches it cannot list: $out"
# A session writes branches, and this hook starts every session, so what a branch holds bounds its time (round 1 of its review, a 256 MiB log held
# one for minutes, 1,000 branches 265 s): a log past 4 MB is not read, and only the 20 newest branches are, by date, never by name.
git -C "$r" branch -qD eight nine
m4=$(git -C "$r" rev-parse HEAD)
git -C "$r" checkout -q -b big
{ head -c 4194400 /dev/zero | tr '\0' x | fold -w 1000; echo; printf '| 2026-11-07 | The dream of %s (past the cap) | x |\n' "$(git -C "$r" rev-parse --short=8 "$m4")"; } >>"$r/docs/review-log.md"
git -C "$r" commit -qam "a log past the cap" && git -C "$r" checkout -q main
ask
printf '%s\n' "$out" | grep -qi "is due" || fail "dream_due.sh read a log past 4 MB, which a session could make hold it for minutes: $out"
git -C "$r" branch -qD big
stamped() { # $1: a date, $2: a message; a commit of main's tree on a branch of its own, checked out
	GIT_COMMITTER_DATE="$1" git -C "$r" commit -q --allow-empty -m "$2"
}
git -C "$r" checkout -q -b old-stamp && stamped 2001-01-01T00:00:00Z "older than every branch below"
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20; do git -C "$r" branch "a$n"; done
git -C "$r" checkout -q main && git -C "$r" checkout -q -b zz-row && recorded "$m4" && git -C "$r" checkout -q main
ask
[ -z "$out" ] || fail "dream_due.sh read branches by name, not the newest by date: $out"
git -C "$r" checkout -q -b new-stamp && stamped 2031-01-01T00:00:00Z "newer than the row's branch"
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20; do git -C "$r" branch "b$n"; done
git -C "$r" checkout -q main
ask
printf '%s\n' "$out" | grep -qi "is due" || fail "dream_due.sh read past the 20 newest branches, so a session's branches could hold it for minutes: $out"
# What it may run: git read-only and text tools, nothing of the repository, no gate.
body=$(grep -v '^[[:space:]]*#' "$dds")
printf '%s\n' "$body" | grep -qE '(^|[^a-z_.-])(check\.sh|node|pnpm|npm|npx|python3?|ruby|perl|make|curl|wget)([^a-z_-]|$)' && fail "dream_due.sh runs a tool that is neither git nor a text tool"
printf '%s\n' "$body" | grep -qE 'git +(-C +[^ ]+ +)?(add|commit|checkout|switch|restore|reset|stash|merge|rebase|fetch|pull|push|config|update-ref|gc|worktree|tag|clean|rm|mv)([^a-z-]|$)' && fail "dream_due.sh runs a git command that writes"
printf '%s\n' "$body" | grep -qE '(^|[;&| ])(\.|source) ' && fail "dream_due.sh sources a file of the repository"
fi

if part deploy_stop; then
# deploy/test.sh --mutants: a mutant stops at its expected check (the dream of 2026-11-01, 7). Each mutant is told the check that must catch it
# (STOP_AT), and the run ends at that check's FAIL, with the other checks' failures shown before it; every check after it, hours of the full
# stack, is not run. The functions are read from the script, and run with no Docker. Not measured here: docker is refused in the sandbox.
ds="$here/../deploy/test.sh"
sed -n '/^pass() {/,/^is_public() {/p' "$ds" | sed '$d' >"$t/ds.fns"
[ -s "$t/ds.fns" ] || fail "deploy/test.sh no longer defines pass and fail before is_public: update test_hooks.sh's deploy_stop"
stop_case() { # $1: STOP_AT, then the script after the functions
	stop=$1
	shift
	{ printf 'set -eu\nfailed=0\n'; cat "$t/ds.fns"; printf '%s\n' "$@"; } >"$t/ds.sh"
	code=0
	out=$(STOP_AT="$stop" sh "$t/ds.sh" 2>&1) || code=$?
}
stop_case "the wanted check" 'fail "an other check: x"' 'echo after-other' 'fail "the wanted check: [a] [b]"' 'echo after-wanted'
[ "$code" = 1 ] || fail "deploy/test.sh's fail did not end the run (exit $code) at the check a mutant is meant to be caught by: $out"
printf '%s\n' "$out" | grep -q "^FAIL  an other check" && printf '%s\n' "$out" | grep -q "after-other" || fail "deploy/test.sh's fail stopped at a check that is not the wanted one: $out"
printf '%s\n' "$out" | grep -q "^FAIL  the wanted check" || fail "deploy/test.sh's fail did not print the wanted check's failure before it stopped: $out"
printf '%s\n' "$out" | grep -q "after-wanted" && fail "deploy/test.sh went on after the wanted check failed: $out"
stop_case "" 'fail "the wanted check: x"' 'echo after-wanted'
[ "$code" = 0 ] && printf '%s\n' "$out" | grep -q "after-wanted" || fail "deploy/test.sh's fail stopped with no STOP_AT, as a plain run must go through every check: $out"
stop_case "the wanted check" 'pass "the wanted check: ok"' 'echo after-pass'
[ "$code" = 0 ] && printf '%s\n' "$out" | grep -q "after-pass" || fail "deploy/test.sh's pass stopped the run: $out"
# Run, not read (the red pass, finding 12): mutant() and the first run of --mutants, taken from the script, with a `sh` that records the
# environment it is given in place of the stack's own run, which needs Docker.
dm="$t/deploy_mutant" && mkdir -p "$dm/bin"
printf '#!/bin/sh\nprintf "STOP_AT=[%%s] TEST_OVERRIDE=[%%s]\\n" "${STOP_AT-unset}" "${TEST_OVERRIDE-unset}" >>"%s/env.log"\necho "FAIL  an other check: x"\necho "FAIL  the wanted check: y"\nexit "${SH_EXIT:-1}"\n' "$dm" >"$dm/bin/sh"
chmod +x "$dm/bin/sh"
{
	printf 'set -eu\ntmp=%s\nfailed=0\nmissing() { echo "test.sh: $1" >&2; exit 2; }\n' "$dm"
	cat "$t/ds.fns"
	sed -n '/^\tmutant() {/,/^\t}$/p' "$ds"
	printf 'compose() { printf "%%s\\n" "$1"; }\nmutant "a fault" "the wanted check" compose "x"\nmutant "another fault" "no such check" compose "x"\necho "failed=$failed"\n'
} >"$dm/mutant.sh"
sed -n '/^if \[ "\${1:-}" = --mutants \]/,/^\t# The faults each check must catch/p' "$ds" | sed '$d' >"$dm/first.fns"
{ printf 'set -eu\ntmp=%s\nfailed=0\nmissing() { echo "test.sh: $1" >&2; exit 2; }\nset -- --mutants\nSTOP_AT=leaked\nexport STOP_AT\n' "$dm"; cat "$dm/first.fns"; printf 'fi\necho first-run-done\n'; } >"$dm/first.sh"
[ -s "$dm/first.fns" ] || fail "deploy/test.sh no longer opens --mutants with its first run: update test_hooks.sh's deploy_stop"
out=$(PATH="$dm/bin:$PATH" /bin/sh "$dm/mutant.sh" 2>&1) || fail "deploy/test.sh's mutant() failed under a stub run: $out"
[ "$(sed -n 1p "$dm/env.log")" = "STOP_AT=[the wanted check] TEST_OVERRIDE=[$dm/override.yaml]" ] || fail "deploy/test.sh's mutant() did not give its run the expected check as STOP_AT: $(cat "$dm/env.log")"
[ "$(sed -n 2p "$dm/env.log")" = "STOP_AT=[no such check] TEST_OVERRIDE=[$dm/override.yaml]" ] || fail "deploy/test.sh's mutant() gave the second mutant's run another check than its own: $(cat "$dm/env.log")"
printf '%s\n' "$out" | grep -q "killed: a fault, by" || fail "deploy/test.sh's mutant() did not count a run ended at its expected check as killed: $out"
printf '%s\n' "$out" | grep -q "failed=1" && printf '%s\n' "$out" | grep -q "survives\|killed by other checks than \"no such check\"" || fail "deploy/test.sh's mutant() lost the verdict of a run that stopped at another check: $out"
: >"$dm/env.log"
out=$(PATH="$dm/bin:$PATH" SH_EXIT=0 /bin/sh "$dm/first.sh" 2>&1) || fail "deploy/test.sh's first run under --mutants failed under a stub that passes: $out"
[ "$(sed -n 1p "$dm/env.log")" = "STOP_AT=[] TEST_OVERRIDE=[unset]" ] || fail "deploy/test.sh gave STOP_AT to the first run, which must pass with no fault planted and go through every check: $(cat "$dm/env.log")"
fi

if part workshop; then
# pnpm workshop (scripts/workshop.sh) serves the app's screens and the lab's pages, each on its dev server at 127.0.0.1, both put on the
# tailnet through the tailnet-preview skill's script under a name each (workshop-app, workshop-lab), each link said beside its name
# (Alexis, 2026-11-04: "il me faudra une adresse tailscale aussi pour regarder à distance"). One function starts each: a port held by
# another process is said and never taken, its pid and port go to .claude/tmp/workshop.pid, the last run of this checkout is stopped first
# (killed hard too), what it left on the tailnet taken down; its end, Ctrl+C, a closed terminal or either server stopping, takes both off
# the tailnet and stops them. The script itself stays in the checkout's folder. Here the servers are Python's.
w="$t/workshop" && want="v$(cat "$here/../.node-version")"
mkdir -p "$w/root/scripts" "$w/root/app/node_modules/.bin" "$w/home/.claude/skills/tailnet-preview/scripts" "$w/bin" "$w/nvm/versions/node/$want/bin"
cp "$here/workshop.sh" "$w/root/scripts/" && cp "$here/../.node-version" "$w/root/"
root=$(cd "$w/root" && pwd -P)
printf '#!/bin/sh\necho %s\n' "$want" >"$w/nvm/versions/node/$want/bin/node"
cat >"$w/server" <<'SH'
#!/bin/sh
echo "$(basename "$0") $* hosts=${WORKSHOP_HOSTS-unset} cwd=$(pwd -P)" >>"$W_LOG"
[ "${DIE:-}" != "$(basename "$0")" ] || exit 1
port= prev=
for a in "$@"; do [ "$prev" != --port ] || port=$a; prev=$a; done
exec python3 -Ic 'import http.server, sys; http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), http.server.BaseHTTPRequestHandler).serve_forever()' "$port"
SH
cp "$w/server" "$w/root/app/node_modules/.bin/react-router" && cp "$w/server" "$w/root/app/node_modules/.bin/vite"
printf '#!/bin/sh\ncase "$1" in status) echo %s ;; ip) echo 100.64.0.1 ;; *) exit 1 ;; esac\n' "'{\"BackendState\": \"Running\", \"Self\": {\"DNSName\": \"box.tail.ts.net.\"}}'" >"$w/bin/tailscale"
preview="$w/home/.claude/skills/tailnet-preview/scripts/tailnet-preview.sh"
printf '#!/bin/sh\necho "$*" >>"$W_LOG.preview"\n[ "$1" != up ] || [ "$2" != "${FAIL_UP:-}" ] || exit 1\n[ "$1" != up ] || echo "  https://box.tail.ts.net:$(($3 + 1000))  ->  127.0.0.1:$3"\n' >"$preview"
chmod +x "$w/nvm/versions/node/$want/bin/node" "$w/root/app/node_modules/.bin/react-router" "$w/root/app/node_modules/.bin/vite" "$w/bin/tailscale" "$preview"
eval "$(sed -n '/^free_ports() {/,/^}/p' "$here/check.sh")"
port=$(free_ports 2) && app_port=$port && lab_port=$((port + 1))
shop() { # $1: the run's name; in the background, its pid in $shop
	(cd "$t" && W_LOG="$w/log" HOME="$w/home" NVM_DIR="$w/nvm" PATH="$w/bin:$PATH" WORKSHOP_APP_PORT=$app_port WORKSHOP_LAB_PORT=$lab_port exec "${under:-sh}" "$root/scripts/workshop.sh") >"$w/$1.out" 2>&1 &
	shop=$!
}
serving() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null; } # the pid that listens on port $1
# Two minutes at most, as the script gives each server one to listen: at a load of 60 the lab's Python server took past 30 s (F4918).
until_() { n=0; until eval "$1"; do n=$((n + 1)); [ "$n" -lt 600 ] || return 1; sleep 0.2; done; }
up() { until_ 'grep -q "^up workshop-lab " "$w/log.preview" 2>/dev/null && [ -n "$(serving "$lab_port")" ]'; } # both servers up
ended() { gone=$1 && until_ '! kill -0 "$gone" 2>/dev/null' && until_ '[ -z "$(serving "$app_port")$(serving "$lab_port")" ]'; } # $1, the run, and its servers gone
order() { # down before up, for each name
	for name in workshop-app workshop-lab; do
		[ "$(grep -n "^down $name\$" "$w/log.preview" | head -1 | cut -d: -f1)" -lt "$(grep -n "^up $name " "$w/log.preview" | head -1 | cut -d: -f1)" ] ||
			fail "workshop.sh did not take down what a run cut short left under $name before putting it up: $(cat "$w/log.preview")"
	done
}
listen_on() { python3 -Ic 'import http.server, sys; http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), http.server.BaseHTTPRequestHandler).serve_forever()' "$1" >/dev/null 2>&1 & }
# The defaults, which every case below replaces: two ports, the lab's its config's preview's.
grep -q 'WORKSHOP_APP_PORT:-5198' "$here/workshop.sh" && grep -q 'WORKSHOP_LAB_PORT:-5199' "$here/workshop.sh" && grep -q 'port: 5199,' "$here/../app/lab.config.ts" ||
	fail "workshop.sh's default ports are not 5198 for the app and 5199 for the lab, as lab.config.ts's preview"
shop one && first=$shop
up || fail "workshop.sh did not put both servers on the tailnet: $(cat "$w/one.out")"
# The configs hold each server to 127.0.0.1 and its port (app/vite.config.ts's workshopServer); the script gives it its port and its names.
grep -qxF "react-router dev --port $app_port hosts=box.tail.ts.net,100.64.0.1 cwd=$root/app" "$w/log" ||
	fail "workshop.sh did not start the app's dev server on its port, the tailnet's names its hosts, from the app: $(cat "$w/log")"
grep -qxF "vite --config lab.config.ts --port $lab_port hosts=box.tail.ts.net,100.64.0.1 cwd=$root/app" "$w/log" ||
	fail "workshop.sh did not start the lab's dev server alike: $(cat "$w/log")"
order
grep -q "^workshop-app: .*https://box.tail.ts.net:$((app_port + 1000)) " "$w/one.out" && grep -q "^workshop-lab: .*https://box.tail.ts.net:$((lab_port + 1000)) " "$w/one.out" ||
	fail "workshop.sh did not say each tailnet link beside the name it opens: $(cat "$w/one.out")"
grep -q "workshop-app is the app's screens" "$w/one.out" && grep -q "workshop-lab is the lab.*realism.html" "$w/one.out" || fail "workshop.sh did not say what each name opens: $(cat "$w/one.out")"
[ "$(lsof -a -p "$first" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" = "$root" ] || fail "workshop.sh left its checkout's folder"
app_pid=$(serving "$app_port") && lab_pid=$(serving "$lab_port") || fail "workshop.sh's servers do not listen on their ports"
[ "$(cat "$root/.claude/tmp/workshop.pid")" = "$(printf '%s %s %s\n%s %s %s' "$first" "$app_pid" "$app_port" "$first" "$lab_pid" "$lab_port")" ] ||
	fail "workshop.sh did not write its pid, each server's and its port: $(cat "$root/.claude/tmp/workshop.pid")"
# A second run of the checkout stops the first, its servers and its tailnet names, and serves in its place.
: >"$w/log.preview" && shop two && second=$shop
up || fail "a second workshop.sh did not serve in place of the first: $(cat "$w/two.out")"
kill -0 "$first" 2>/dev/null && fail "a second workshop.sh left the first running"
! kill -0 "$app_pid" 2>/dev/null && ! kill -0 "$lab_pid" 2>/dev/null || fail "a second workshop.sh left the first's servers running"
head -n 1 "$root/.claude/tmp/workshop.pid" | grep -q "^$second " || fail "the second workshop.sh did not write its own pids: $(cat "$root/.claude/tmp/workshop.pid")"
# Either server that stops ends the run, saying so: the other stopped, both off the tailnet, its pid file gone.
for which in app lab; do
	[ "$which" = app ] || { : >"$w/log.preview" && shop again && second=$shop && up || fail "workshop.sh did not start again: $(cat "$w/again.out")"; }
	: >"$w/log.preview" && eval "kill \"\$(serving \"\$${which}_port\")\""
	ended "$second" || fail "workshop.sh lived on, or left a server, after its $which's server stopped"
	wait "$second" && fail "workshop.sh exited 0 after its $which's server stopped"
	grep -q "the $which's dev server stopped" "$w/$([ "$which" = app ] && echo two || echo again).out" || fail "workshop.sh did not say its $which's server stopped"
	grep -qx "down workshop-app" "$w/log.preview" && grep -qx "down workshop-lab" "$w/log.preview" || fail "workshop.sh did not take both off the tailnet at its end: $(cat "$w/log.preview")"
	[ ! -e "$root/.claude/tmp/workshop.pid" ] || fail "workshop.sh left its pid file at its end"
done
# A server that dies before it listens (a config it cannot load) ends the run, saying which, and puts nothing on the tailnet for it.
: >"$w/log.preview" && export DIE=vite && shop dies && dies=$shop
ended "$dies" || fail "workshop.sh lived on after its lab's server died before it listened"
unset DIE
grep -q "the lab's dev server stopped before it listened" "$w/dies.out" || fail "workshop.sh did not say its lab's server died before it listened: $(cat "$w/dies.out")"
grep -q "^up workshop-lab" "$w/log.preview" && fail "workshop.sh put a server that never listened on the tailnet"
# Ctrl+C (TERM here) and a closed terminal (HUP) end it alike; HUP under dash, which macOS can make its sh (/private/var/select/sh): bash
# runs the EXIT trap on HUP by itself, dash only through the script's own trap.
for signal in TERM HUP; do
	under=$([ "$signal" = TERM ] && echo sh || echo /bin/dash)
	: >"$w/log.preview" && shop "$signal" && run=$shop && up || fail "workshop.sh did not start again under $under: $(cat "$w/$signal.out")"
	unset under
	: >"$w/log.preview" && kill -s "$signal" "$run"
	ended "$run" || fail "workshop.sh lived through $signal, or left a server running"
	[ "$(grep -c '^down ' "$w/log.preview")" = 2 ] || fail "workshop.sh did not take both off the tailnet after $signal: $(cat "$w/log.preview")"
done
# A run killed hard leaves its servers and its tailnet names: the next run stops those servers, from this checkout's app, and takes the
# names down before it puts them up again.
: >"$w/log.preview" && shop hard && hard=$shop && up || fail "workshop.sh did not start again: $(cat "$w/hard.out")"
old_app=$(serving "$app_port") && kill -9 "$hard" && : >"$w/log.preview" && shop after && after=$shop
up || fail "workshop.sh did not serve after a run killed hard: $(cat "$w/after.out")"
kill -0 "$old_app" 2>/dev/null && fail "workshop.sh left the servers of a run killed hard"
order
kill "$after" && ended "$after" || fail "workshop.sh lived through TERM"
# A pid file the run left, or one naming a process of another folder: nothing of it is stopped but this checkout's own servers.
listen_on "$app_port" && other=$! && until_ '[ -n "$(serving "$app_port")" ]' || fail "the test's own server did not listen"
printf '%s %s %s\n' "$other" "$other" "$app_port" >"$root/.claude/tmp/workshop.pid"
shop named && named=$shop && until_ '! kill -0 "$named" 2>/dev/null' || fail "workshop.sh waited on a port another process holds"
kill -0 "$other" 2>/dev/null || fail "workshop.sh stopped a process of another folder its pid file named"
grep -q "port $app_port is held by another process" "$w/named.out" || fail "workshop.sh did not say its app's port is held: $(cat "$w/named.out")"
until_ '[ -z "$(serving "$lab_port")" ]' || fail "workshop.sh started its lab's server though the app's port was held"
kill "$other"
printf '999999 999998 %s\n' "$app_port" >"$root/.claude/tmp/workshop.pid" && : >"$w/log.preview" && shop stale && stale=$shop
up || fail "workshop.sh did not serve past a pid file of gone processes: $(cat "$w/stale.out")"
# A later run's pid file, written while this one ends, stays.
printf '1 2 %s\n' "$app_port" >"$root/.claude/tmp/workshop.pid" && kill "$stale" && ended "$stale" || fail "workshop.sh lived through TERM"
[ "$(cat "$root/.claude/tmp/workshop.pid" 2>/dev/null)" = "1 2 $app_port" ] || fail "workshop.sh removed a later run's pid file at its end"
# The lab's port held by another process: said, that process left as it is, no server of the run left behind.
listen_on "$lab_port" && other=$! && until_ '[ -n "$(serving "$lab_port")" ]' || fail "the test's own server did not listen"
shop four && four=$shop && until_ '! kill -0 "$four" 2>/dev/null' || fail "workshop.sh waited on a port another process holds"
wait "$four" && fail "workshop.sh exited 0 on a port another process holds"
grep -q "port $lab_port is held by another process" "$w/four.out" || fail "workshop.sh did not say its lab's port is held: $(cat "$w/four.out")"
kill -0 "$other" 2>/dev/null || fail "workshop.sh stopped a process it did not start"
until_ '[ -z "$(serving "$app_port")" ]' || fail "workshop.sh left its app's server running when the lab's port was held"
kill "$other"
# The tailnet refusing one name half way (F4759): the run goes on, that server here alone, and both names come down at its end.
: >"$w/log.preview" && export FAIL_UP=workshop-lab && shop refused && refused=$shop
until_ 'grep -q "the tailnet refused the lab" "$w/refused.out" && [ -n "$(serving "$lab_port")" ]' || fail "workshop.sh did not say the tailnet refused its lab: $(cat "$w/refused.out")"
unset FAIL_UP
kill "$refused" && ended "$refused" || fail "workshop.sh lived through TERM"
[ "$(grep -c '^down workshop-lab$' "$w/log.preview")" = 2 ] || fail "workshop.sh left on the tailnet a name whose up failed half way: $(cat "$w/log.preview")"
# With no Tailscale here, it serves on this machine alone and says the local addresses, no tailnet name asked.
: >"$w/log.preview" && printf '#!/bin/sh\nexit 1\n' >"$w/bin/tailscale" && shop five && five=$shop
until_ 'grep -q "127.0.0.1:$lab_port" "$w/five.out"' || fail "workshop.sh with no tailnet did not say its local addresses: $(cat "$w/five.out")"
grep -q "127.0.0.1:$app_port" "$w/five.out" || fail "workshop.sh with no tailnet did not say the app's local address: $(cat "$w/five.out")"
[ ! -s "$w/log.preview" ] || fail "workshop.sh asked the tailnet with no Tailscale running: $(cat "$w/log.preview")"
grep -q "hosts= cwd=" "$w/log" || fail "workshop.sh gave the servers hosts with no tailnet: $(cat "$w/log")"
kill "$five" && ended "$five" || fail "workshop.sh lived through TERM"
fi

[ -z "${ONLY:-}" ] || [ "${ran:-}" = 1 ] || fail "ONLY=$ONLY names no section"
echo "hooks: ok"
finished=1
