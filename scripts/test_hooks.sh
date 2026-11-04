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
# No git config from around this file reaches its throwaway repositories (F5012, F5022, section `unsigned`): Alexis's global
# one signs every commit with a key the sandbox cannot read; a system file, what `git -c` hands a hook, or a template folder
# could as well, and GIT_CONFIG would send `git config` out of the repository.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
unset GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_CONFIG GIT_TEMPLATE_DIR
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
agents="design-reviewer finding-verifier reviewer security-reviewer test-auditor"
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
# The worktrees sit in ~/Server/gnoworld-wt, outside every other session's writable folders (Alexis, 2026-11-04). A worktree's own
# .git, which names the folder worktree.sh takes git's config from outside the sandbox, is denied to its own session too (F5095).
assert "~/Server/gnoworld-wt/*/.git" in box["filesystem"]["denyWrite"], "a session can point its worktree's git at another config (F5095)"
# worktree.sh alone leaves the sandbox: it writes the trees it makes and removes, in its one root.
assert box.get("excludedCommands") == ["sh scripts/worktree.sh *"], "a command other than worktree.sh runs outside the sandbox"
assert not [p for p in box["filesystem"]["allowWrite"] if "pnpm" in p], "a command can rewrite the pnpm that Alexis's install runs"
assert not any("api.github.com" in d for d in box["network"]["allowedDomains"]), "the GitHub API is reachable"
ask, deny = set(s["permissions"]["ask"]), set(s["permissions"]["deny"])
# Claude works alone and asks only before a push or a chain write (Alexis, 2026-10-18). The files
# run outside the sandbox themselves cannot be edited at all: the hooks and their scripts,
# Claude Code's own settings, skills and agents (F068), what pnpm loads at Alexis's install
# (F087), git's own hooks folder and config, which bypass mode lets the file tools write
# otherwise (F129), worktree.sh with the scripts it runs, which leave the sandbox, every
# worktree's .git, which would point the git it runs at another config, and the main checkout's
# git hooks, config, scripts and .githooks, out of every worktree session's folder (F5058, F5095).
# A dependency is Alexis's to add, and rm -rf no one's.
assert {"Bash(git push)", "Bash(git push *)"} <= ask, "a push asks no one"
assert {"Bash(pnpm add *)", "Bash(rm -rf *)"} <= deny, "Claude can add a dependency or delete a tree"
outside = {"Edit(/scripts/guard.py)", "Edit(/scripts/stop_gate.sh)", "Edit(/scripts/code_changed.sh)", "Edit(/.githooks/**)",
           "Edit(/scripts/scan_secrets.sh)", "Edit(/scripts/gitleaks.toml)", "Edit(/scripts/gitleaks-private.toml)", "Edit(/scripts/.gitleaksignore)",
           "Edit(/scripts/install_hooks.sh)", "Edit(/.git/hooks/**)", "Edit(/.git/config)", "Edit(/.git/commondir)", "Edit(/.mcp.json)",
           "Edit(/.claude/settings.json)", "Edit(/.claude/settings.local.json)", "Edit(/.claude/agents/**)", "Edit(/.claude/commands/**)",
           "Edit(/.claude/skills/**)", "Edit(/.claude/rules/**)", "Edit(/.claude/hooks/**)", "Edit(/.claude/workflows/**)",
           "Edit(/package.json)", "Edit(/app/package.json)", "Edit(/packages/*/package.json)",
           "Edit(/server/package.json)", "Edit(/packages/schemas/package.json)",
           "Edit(/.npmrc)", "Edit(/pnpm-workspace.yaml)", "Edit(/.pnpmfile.cjs)", "Edit(/.pnpmfile.mjs)",
           "Edit(/scripts/worktree.sh)", "Edit(/scripts/borrow_node_modules.sh)", "Edit(~/Server/gnoworld-wt/*/.git)",
           "Edit(~/Server/gnoworld/.git/hooks/**)", "Edit(~/Server/gnoworld/.git/config)", "Edit(~/Server/gnoworld/scripts/**)", "Edit(~/Server/gnoworld/.githooks/**)"}
edits = lambda rules: {r for r in rules if r.split("(")[0] in {"Edit", "Write", "MultiEdit", "NotebookEdit"}}
assert edits(deny) == outside, "the edits refused are not exactly the files run outside the sandbox"
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
	'unset AUDIT_ANSWER PROVE_FIX_VITEST PROVE_FIX_GNO PROVE_FIX_GO' '[ "$took" -gt "$budget" ]' "python3 -I scripts/prove_fix.py" "python3 -I scripts/audit.py" \
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
# wants each declared on main, merge.sh shows each first (F129), worktree.sh checks out none other
# than its own tree's (F5098); every file harness_mutate guards is in it (F112, F114, F124), and
# what Claude Code starts, .mcp.json's servers.
python3 -I - "$gate_file" "$hooks/pre-push" "$hooks/merge.sh" "$hooks/records.sh" "$here/harness_mutate.py" "$here/worktree.sh" <<'PY' || fail "a harness list other than records.sh's, or one missing a file harness_mutate guards"
import ast, fnmatch, re, sys
text = lambda n: open(sys.argv[n]).read()
assert 'harness --quiet "$base"' in text(1), "check.sh has its own harness list"
assert 'harness --name-only "$remote_sha" "$local_sha"' in text(2), "pre-push has its own harness list"
assert 'harness --name-only HEAD..."$tip"' in text(3), "merge.sh shows no harness list"
assert 'harness --ignore-submodules=all --name-only "$base"' in text(6), "worktree.sh checks out a base's harness unseen"
assert not [n for n in (1, 2, 3, 6) if "pnpm-workspace.yaml" in text(n)], "a second harness list is left"
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
[ "$(at 'sh scripts/ergo.sh')" -lt "$(at '$full || run test')" ] || fail "check.sh runs the tests before it builds the Ergo they start"
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

if part mutate; then
# mutate.py, the realms' mutation check (ADR-0001 §14, backlog row 11): every guard removed and every operator or number
# flipped must fail a test. First its flips, read and never compiled: comments, strings and runes stay as they are, only whole
# operators flip (never a part of `++`, `+=` or `<<`), integers shift by one and other numbers never; a key names its line and
# its flip, and the occurrence when the same flip of the same text comes more than once, so a line moved elsewhere keeps it.
[ -x "${GNO:-}" ] || fail "the mutate section runs the gno check.sh exports as GNO: ${GNO:-unset}"
mu="$t/mutate" && mkdir -p "$mu/read" "$mu/moved"
cat >"$mu/read/listing.gno" <<'EOF'
package listing

// a < b in a comment, and 1 + 2
/* a block
comment: x == y, 3 - 4 */
func f(a, b int, s string) {
	_ = "a < b, 5 + 6" + s + `raw: c >= d,
7 - 8`
	_ = "a \"<\" b" + s
	_ = "http://x/*y" + s
	_ = '+' - b // a rune, and a comment that switches no flip off: a || b
	_ = '"' + '\'' - b
	_ = a /* c <= d */ <= b
	_ = a /* don't " */ - b
	// don't stop at this quote: "
	n >>= 1
	n <<= 1
	n &^= 1
	n := 0x1F + 0b101 + 0o17 + 017 + 1_000 + 1.5 + 2e3 + 0x1p-2 + 3i + x9
	n++
	n += 2
	n--
	n -= 3
	_ = n<<1 | n>>2 &^ 1
	_ = a >= b == true
	_ = a != b && a > b || a < b
	_ = n + n
	_ = n + n
	_ = -n
	var arr [32]byte
	_ = arr[0]
	_ = `\` + s
	_ = x[0x1E+1]
	_ = _1 + é1 + .5
}
EOF
printf 'package last\n\nvar x = 1 + 2' >"$mu/read/last.gno" # a last line without its newline
printf 'package end\n\nvar x = 1 // a last comment without its newline' >"$mu/read/end.gno"
sed 's|^package listing$|package listing\
\
// a line above moves every other|' "$mu/read/listing.gno" >"$mu/moved/listing.gno"
# mutate.py runs its check only as a script (`if __name__ == "__main__"`): imported, it gives its flips and runs nothing.
python3 -I - "$here" "$mu" <<'PY' || fail "mutate.py flipped what it should not, missed a flip, or never ended reading (above)"
import os, signal, sys
signal.alarm(20)  # a reader that loops (a last comment without its newline) fails here, not hangs the gate
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
import mutate
def read(folder):
    os.chdir(os.path.join(sys.argv[2], folder))
    src = open("listing.gno").read()
    return src, {label: (new, drop) for label, new, drop in mutate.flips("listing.gno")}
src, got = read("read")
lines = {
    '_ = "a < b, 5 + 6" + s + `raw: c >= d,': ["+ -> - #1", "+ -> - #2"],
    '_ = "a \\"<\\" b" + s': ["+ -> -"],
    '_ = "http://x/*y" + s': ["+ -> -"],
    "_ = '+' - b // a rune, and a comment that switches no flip off: a || b": ["- -> +"],
    "_ = '\"' + '\\'' - b": ["+ -> -", "- -> +"],
    "_ = a /* c <= d */ <= b": ["<= -> <"],
    "_ = a /* don't \" */ - b": ["- -> +"],
    "n >>= 1": ["1 -> 2", "1 -> 0"],
    "n <<= 1": ["1 -> 2", "1 -> 0"],
    "n &^= 1": ["1 -> 2", "1 -> 0"],
    "n := 0x1F + 0b101 + 0o17 + 017 + 1_000 + 1.5 + 2e3 + 0x1p-2 + 3i + x9": [f"+ -> - #{k}" for k in range(1, 10)]
    + ["0x1F -> 0x20", "0x1F -> 0x1e", "0b101 -> 0b110", "0b101 -> 0b100", "0o17 -> 0o20", "0o17 -> 0o16", "017 -> 020", "017 -> 016", "1_000 -> 1001", "1_000 -> 999"],
    "n += 2": ["2 -> 3", "2 -> 1"],
    "n -= 3": ["3 -> 4", "3 -> 2"],
    "_ = n<<1 | n>>2 &^ 1": ["1 -> 2 #1", "1 -> 0 #1", "1 -> 2 #2", "1 -> 0 #2", "2 -> 3", "2 -> 1"],
    "_ = a >= b == true": [">= -> >", "== -> !="],
    "_ = a != b && a > b || a < b": ["!= -> ==", "&& -> ||", "> -> >=", "|| -> &&", "< -> <="],
    "_ = n + n": ["+ -> - #1", "+ -> - #2"],
    "_ = -n": ["- -> +"],
    "var arr [32]byte": ["32 -> 33", "32 -> 31"],
    "_ = arr[0]": ["0 -> 1", "0 -> (-1)"],
    "_ = `\\` + s": ["+ -> -"],
    "_ = x[0x1E+1]": ["0x1E -> 0x1f", "0x1E -> 0x1d", "+ -> -", "1 -> 2", "1 -> 0"],
    "_ = _1 + é1 + .5": ["+ -> - #1", "+ -> - #2"],
}
want = {f"listing.gno: {line} [{flip}]" for line, flips in lines.items() for flip in flips}
assert set(got) == want, f"flips missing: {sorted(want - set(got))}; flips that should not be: {sorted(set(got) - want)}"
# Each mutant changes its own line only, and only that token; a comparison or a logic operator changes no type, so its
# flip always compiles, while a `+`, a `-` or a number may not (a string's `+`, an array's size).
def changed(label):
    old, new = src.split("\n"), got[label][0].split("\n")
    assert len(old) == len(new), label
    diff = [(a, b) for a, b in zip(old, new) if a != b]
    assert len(diff) == 1, f"{label}: {diff}"
    return diff[0][1]
for label in got:
    changed(label)
    flipped = label[label.rindex(" [") + 2 : label.rindex(" -> ")]
    assert got[label][1] == (flipped in ("+", "-") or flipped[0].isdigit()), f"{label}: may it be dropped? {got[label][1]}"
assert changed("listing.gno: _ = a /* c <= d */ <= b [<= -> <]") == "\t_ = a /* c <= d */ < b"
assert changed("listing.gno: _ = arr[0] [0 -> (-1)]") == "\t_ = arr[(-1)]"
assert changed("listing.gno: n := 0x1F + 0b101 + 0o17 + 017 + 1_000 + 1.5 + 2e3 + 0x1p-2 + 3i + x9 [017 -> 020]") == "\tn := 0x1F + 0b101 + 0o17 + 020 + 1_000 + 1.5 + 2e3 + 0x1p-2 + 3i + x9"
assert changed("listing.gno: _ = n<<1 | n>>2 &^ 1 [1 -> 0 #2]") == "\t_ = n<<1 | n>>2 &^ 0"
first, second = (i for i, line in enumerate(src.split("\n")) if line == "\t_ = n + n")
assert got["listing.gno: _ = n + n [+ -> - #2]"][0].split("\n")[second] == "\t_ = n - n", "#2 is the second line of that text"
assert got["listing.gno: _ = n + n [+ -> - #1]"][0].split("\n")[first] == "\t_ = n - n", "#1 is the first line of that text"
assert set(read("moved")[1]) == want, "a line moved changed a flip's key"
os.chdir(os.path.join(sys.argv[2], "read"))
last = {label for label, _, _ in mutate.flips("last.gno")}
assert last == {f"last.gno: var x = 1 + 2 [{flip}]" for flip in ("+ -> -", "1 -> 2", "1 -> 0", "2 -> 3", "2 -> 1")}, f"a last line without its newline: {sorted(last)}"
end = {label for label, _, _ in mutate.flips("end.gno")}
assert end == {f"end.gno: var x = 1 // a last comment without its newline [{flip}]" for flip in ("1 -> 2", "1 -> 0")}, sorted(end)
# A verdict reads its own mutant's lines, never m10's for m1: a flip m1 that survives beside an m10 that does not compile
# must not be dropped as one that does not compile, nor a mutant with no result read as m10's.
out = "m10/x.gno:1:1: e (code=gnoTypeCheckError)\nok      ./m1 \t0.10s\nFAIL    ./m10 \t0.00s\n"
assert (mutate.verdict(out, 1), mutate.verdict(out, 10)) == ("survives", "does not compile"), (mutate.verdict(out, 1), mutate.verdict(out, 10))
assert mutate.verdict("ok      ./m10 \t0.10s\n", 1) == "no result", "m10's pass read as m1's"
assert mutate.verdict("FAIL    ./m10 \t0.10s\n", 1) == "no result", "m10's failure read as m1's"
assert mutate.verdict("m1/x.gno:1:1: e (code=gnoTypeCheckError)\nFAIL    ./m1 \t0.00s\n", 1) == "does not compile"
assert mutate.verdict("FAIL    ./m1 \t0.00s\n", 1) == "killed"
PY
# Then the check, on a planted workspace and the real gno: a package whose every mutant is killed or a known gap passes,
# printing each verdict and the flips that do not compile; a guard's printed line and verdicts stay what they were before the
# flips, and its key is that line, which names its file as a flip's does (F5018).
for w in a b; do
	mkdir -p "$mu/$w/r/planted" && : >"$mu/$w/gnowork.toml"
	printf 'module = "gno.land/r/test/planted"\ngno = "0.9"\n' >"$mu/$w/r/planted/gnomod.toml"
	cat >"$mu/$w/r/planted/planted.gno" <<'EOF'
package planted

import "strconv"

func Max(a, b int) int {
	if a >= b {
		return a
	}
	return b
}

func Label(n int) string { return "n" + strconv.Itoa(n-1) }

func Pick(n int) int {
	mustPositive(n)
	if n > 3 || n == 2 {
		panic("out of range")
	}
	return n
}

func mustPositive(n int) {
	if n < 1 {
		panic("not positive")
	}
}

func Do(bad bool) int {
	if bad {
		panic("bad")
	}
	return 1
}
EOF
	cat >"$mu/$w/r/planted/planted_test.gno" <<'EOF'
package planted

import "testing"

func panics(f func()) (yes bool) {
	defer func() { yes = recover() != nil }()
	f()
	return
}

func TestPlanted(t *testing.T) {
	if Max(2, 1) != 2 || Max(1, 2) != 2 || Label(3) != "n2" || Do(false) != 1 {
		t.Fatal("a value")
	}
	if Pick(1) != 1 || Pick(3) != 3 {
		t.Fatal("Pick refused a good n")
	}
	if !panics(func() { Pick(0) }) || !panics(func() { Pick(2) }) || !panics(func() { Pick(4) }) {
		t.Fatal("Pick took a bad n")
	}
}
EOF
done
# b adds a package whose guard, removed, leaves a variable unused: a guard that does not compile is still an error; and an
# untested sum, whose `+` and number flips compile and survive: never dropped, so they fail.
mkdir -p "$mu/b/r/broken" && printf 'module = "gno.land/r/test/broken"\ngno = "0.9"\n' >"$mu/b/r/broken/gnomod.toml"
printf 'package broken\n\nfunc Check(n int) int {\n\tk := n\n\tmustSmall(k)\n\treturn n\n}\n\nfunc mustSmall(k int) {\n\tif k > 9 {\n\t\tpanic("big")\n\t}\n}\n\nfunc Spare(n int) int { return n + 5 }\n' >"$mu/b/r/broken/broken.gno"
printf 'package broken\n\nimport "testing"\n\nfunc panics(f func()) (yes bool) {\n\tdefer func() { yes = recover() != nil }()\n\tf()\n\treturn\n}\n\nfunc TestCheck(t *testing.T) {\n\tif Check(9) != 9 || !panics(func() { Check(10) }) {\n\t\tt.Fatal("check")\n\t}\n}\n' >"$mu/b/r/broken/broken_test.gno"
gapped() { # $1: the copy of mutate.py to write, $2: its GAPS as JSON, $3: its EXTRA as JSON, none (not seal's) when absent
	python3 -I - "$here/mutate.py" "$1" "$2" "${3:-[]}" <<'PY' || fail "the planted copy of mutate.py could not be written: GAPS or EXTRA is gone"
import ast, json, sys
src = open(sys.argv[1]).read()
lines = src.split("\n")
spans = {t.id: (n.lineno, n.end_lineno) for n in ast.parse(src).body if isinstance(n, ast.Assign) for t in n.targets if isinstance(t, ast.Name)}
new = {"GAPS": f"GAPS = {json.loads(sys.argv[3])!r}", "EXTRA": f"EXTRA = {json.loads(sys.argv[4])!r}"}
for name in sorted(new, key=lambda name: -spans[name][0]):
    lines[spans[name][0] - 1 : spans[name][1]] = [new[name]]
open(sys.argv[2], "w").write("\n".join(lines))
PY
}
checked() { (cd "$mu/$1" && shift && env "$@" python3 -I "$mu/check.py" 2>&1); } # $1: the workspace; then the environment
P=r/planted/planted.gno
gapped "$mu/check.py" '{"r/planted/planted.gno: if bad {": "planted guard gap", "r/planted/planted.gno: if a >= b { [>= -> >]": "equivalent: a equals b"}'
out=$(checked a GNO="$GNO") || fail "mutate.py failed a package whose every mutant is killed or a known gap: $out"
cat >"$mu/a.want" <<EOF
ok    killed: $P: mustPositive(n)
ok    killed: $P: n > 3
ok    killed: $P: n == 2
ok    killed: $P: if n < 1 {
ok    survives: $P: if bad {  (known gap: planted guard gap)
ok    survives: $P: if a >= b { [>= -> >]  (known gap: equivalent: a equals b)
ok    killed: $P: func Label(n int) string { return "n" + strconv.Itoa(n-1) } [- -> +]
ok    killed: $P: func Label(n int) string { return "n" + strconv.Itoa(n-1) } [1 -> 2]
ok    killed: $P: func Label(n int) string { return "n" + strconv.Itoa(n-1) } [1 -> 0]
ok    killed: $P: if n > 3 || n == 2 { [> -> >=]
ok    killed: $P: if n > 3 || n == 2 { [3 -> 4]
ok    killed: $P: if n > 3 || n == 2 { [3 -> 2]
ok    killed: $P: if n > 3 || n == 2 { [|| -> &&]
ok    killed: $P: if n > 3 || n == 2 { [== -> !=]
ok    killed: $P: if n > 3 || n == 2 { [2 -> 3]
ok    killed: $P: if n > 3 || n == 2 { [2 -> 1]
ok    killed: $P: if n < 1 { [< -> <=]
ok    killed: $P: if n < 1 { [1 -> 2]
ok    killed: $P: if n < 1 { [1 -> 0]
ok    killed: $P: return 1 [1 -> 2]
ok    killed: $P: return 1 [1 -> 0]
ok    1 of 17 flips do not compile, dropped: r/planted
EOF
sort "$mu/a.want" >"$mu/a.want.sorted" && printf '%s\n' "$out" | sort >"$mu/a.got.sorted"
diff "$mu/a.want.sorted" "$mu/a.got.sorted" >"$mu/a.diff" || fail "mutate.py's verdicts on the planted package, against the wanted ones (<):
$(cat "$mu/a.diff")"
# A survivor outside GAPS fails, guard or flip, a `+` or a number's as well; so does a gap a test now kills, guard or flip, a
# gap that does not compile, a key that names no mutant left, and a guard or an EXTRA line that does not compile. A flip in
# GAPS is never dropped: it must keep surviving.
gapped "$mu/check.py" '{"r/planted/planted.gno: gone(x)": "stale guard", "r/planted/planted.gno: gone [< -> <=]": "stale flip", "r/planted/planted.gno: mustPositive(n)": "now killed", "r/planted/planted.gno: if n < 1 { [< -> <=]": "now killed", "r/planted/planted.gno: func Label(n int) string { return \"n\" + strconv.Itoa(n-1) } [+ -> -]": "does not compile"}' \
	'[["r/planted/planted.gno", "return \"n\" + strconv", "return \"n\" - strconv"]]'
out=$(checked b GNO="$GNO") && fail "mutate.py passed survivors, stale keys and a guard that does not compile: $out"
B=r/broken/broken.gno
for line in "FAIL  survives: $P: if bad { (expected killed)" "FAIL  survives: $P: if a >= b { [>= -> >] (expected killed)" \
	"FAIL  survives: $B: func Spare(n int) int { return n + 5 } [+ -> -] (expected killed)" \
	"FAIL  survives: $B: func Spare(n int) int { return n + 5 } [5 -> 6] (expected killed)" \
	"FAIL  survives: $B: func Spare(n int) int { return n + 5 } [5 -> 4] (expected killed)" \
	"FAIL  killed: $P: mustPositive(n) (expected survives)" "FAIL  killed: $P: if n < 1 { [< -> <=] (expected survives)" \
	"FAIL  does not compile: $P: func Label(n int) string { return \"n\" + strconv.Itoa(n-1) } [+ -> -] (expected survives)" \
	"FAIL  does not compile: $B: mustSmall(k) (expected killed)" "FAIL  does not compile: $P: return \"n\" + strconv (expected killed)" \
	"FAIL  GAPS lists a mutant that no longer exists: $P: gone(x)" "FAIL  GAPS lists a mutant that no longer exists: $P: gone [< -> <=]"; do
	printf '%s\n' "$out" | grep -qxF -- "$line" || fail "mutate.py did not print: $line
$out"
done
# No count is printed for a package that drops no flip (r/broken's all compile; planted's one is in GAPS).
printf '%s\n' "$out" | grep -q "flips do not compile" && fail "mutate.py dropped a flip GAPS lists: $out"
# The command it runs failing (F116): a gno whose every mutant fails to compile cannot pass the check by dropping them all,
# as a comparison or a logic flip always compiles; a gno that stops before a mutant's result, fails the untouched copy, or
# times out on a mutant that loops forever (gno's -timeout ends the whole run, and no GAPS entry can hold such a flip),
# fails it. Like gno, the fake exits 1 when a package fails, which each of its modes has.
cat >"$mu/fakegno" <<'EOF'
#!/bin/sh
echo "$*" >>"$(dirname "$0")/fakegno.runs"
[ "$FAKE:$#" = "hangalone:4" ] && exec sleep 30 # a run of one copy never ends
[ "$FAKE" = binary ] && printf 'a failing test printed \377\n' >&2 # bytes that are no UTF-8
for d in "$@"; do
	case $FAKE:$d in
	control:./m0) printf 'FAIL    ./m0 \t0.01s\n' ;;
	*:./m0) printf 'ok      ./m0 \t0.01s\n' ;;
	compile:./m*) printf '%s/planted.gno:1:1: planted (code=gnoTypeCheckError)\nFAIL    %s \t0.00s\n' "${d#./}" "$d" ;;
	timeout:./m22) printf 'panic: test timed out after 60s\n' >&2 && exit 2 ;;
	timeout:./m*) printf 'FAIL    %s \t0.00s\n' "$d" ;;
	survive:./m* | hangalone:./m* | binary:./m*) printf 'ok      %s \t0.00s\n' "$d" ;;
	esac
done
exit 1
EOF
chmod +x "$mu/fakegno"
gapped "$mu/check.py" '{"r/planted/planted.gno: if bad {": "planted guard gap", "r/planted/planted.gno: if a >= b { [>= -> >]": "equivalent: a equals b"}'
out=$(checked a GNO="$mu/fakegno" FAKE=compile) && fail "mutate.py passed when no mutant compiled: $out"
# One gno run judges a package's guards and flips together: the untouched copy and its 5 guards and 17 flips, each once.
[ "$(grep -c '' "$mu/fakegno.runs")" = 1 ] || fail "mutate.py ran gno other than once for one package: $(cat "$mu/fakegno.runs")"
[ "$(tr ' ' '\n' <"$mu/fakegno.runs" | grep '^\./m' | sort)" = "$(i=0; while [ $i -le 22 ]; do echo "./m$i"; i=$((i + 1)); done | sort)" ] ||
	fail "mutate.py's one gno run did not judge the control and its 22 mutants each once: $(cat "$mu/fakegno.runs")"
[ "$(cut -d' ' -f1-3 "$mu/fakegno.runs")" = "test -timeout 60s" ] || fail "mutate.py's run of 23 copies has not 60 s, the least (34.5 rounded up is less): $(cat "$mu/fakegno.runs")"
for line in "FAIL  does not compile: $P: if n > 3 || n == 2 { [> -> >=] (expected killed)" "FAIL  does not compile: $P: mustPositive(n) (expected killed)" \
	"FAIL  does not compile: $P: if a >= b { [>= -> >] (expected survives)" "ok    12 of 17 flips do not compile, dropped: r/planted"; do
	printf '%s\n' "$out" | grep -qxF -- "$line" || fail "mutate.py did not print: $line
$out"
done
out=$(checked a GNO="$mu/fakegno" FAKE=crash) && fail "mutate.py passed when gno gave no mutant's result: $out"
printf '%s\n' "$out" | grep -qxF "FAIL  no result: $P: return 1 [1 -> 2] (expected killed)" || fail "mutate.py did not fail a flip with no result: $out"
out=$(checked a GNO="$mu/fakegno" FAKE=control) && fail "mutate.py passed when the untouched copy failed: $out"
printf '%s\n' "$out" | grep -q "^FAIL  control: r/planted's untouched copy does not pass" || fail "mutate.py did not name the failed control: $out"
out=$(checked a GNO="$mu/fakegno" FAKE=timeout) && fail "mutate.py passed when gno timed out: $out"
printf '%s\n' "$out" | grep -qxF "FAIL  no result: $P: return 1 [1 -> 0] (expected killed)" || fail "mutate.py did not fail the mutant gno timed out on: $out"
printf '%s\n' "$out" | grep -q "^FAIL  gno test timed out: " || fail "mutate.py did not say gno timed out, so a mutant loops forever: $out"
# A gno that never ends, its own timer passed or never started (it counts from after the copies are loaded), is stopped
# GRACE seconds past its limit and fails by name, never as a traceback, with no verdict and no GAPS key called stale (F5084).
# The constants are made small so it is stopped in 2 s.
printf '#!/bin/sh\nexec sleep 30\n' >"$mu/hanggno" && chmod +x "$mu/hanggno"
out=$(cd "$mu/a" && GNO="$mu/hanggno" python3 -I -c 'import sys; sys.dont_write_bytecode = True; sys.path.insert(0, sys.argv[1]); import check; check.LEAST, check.SECONDS_A_COPY, check.GRACE = 1, 0.01, 1; sys.exit(check.main())' "$mu" 2>&1) && fail "mutate.py passed a gno that never ended: $out"
[ "$out" = "FAIL  gno test did not end 1 s past its own time limit of 1 s, and was stopped: in r/planted, no mutant has a verdict" ] ||
	fail "mutate.py did not fail by name, alone, a gno that never ended (F5084): $out"
# The run's time limit grows with its copies, 1.5 s each and 60 s at least (F5051, D30): a busy machine slows a big package's
# one run without failing it, and a slow mutant takes the time the fast ones leave. 40 copies have 60 s, 41 have 62 (61.5
# rounded up), 80 have 120, each package in one run.
mkdir -p "$mu/d/r/many" && : >"$mu/d/gnowork.toml" && printf 'module = "gno.land/r/test/many"\ngno = "0.9"\n' >"$mu/d/r/many/gnomod.toml"
gapped "$mu/check.py" '{}'
for copies in 40:60 41:62 80:120; do
	i=1 && printf 'package many\n' >"$mu/d/r/many/many.gno"
	while [ $i -lt "${copies%:*}" ]; do printf '\nfunc F%s(bad bool) {\n\tif bad {\n\t\tpanic("bad")\n\t}\n}\n' "$i" >>"$mu/d/r/many/many.gno" && i=$((i + 1)); done
	: >"$mu/fakegno.runs"
	checked d GNO="$mu/fakegno" FAKE=compile >/dev/null || : # no mutant compiles in the fake: only its one run is read
	[ "$(grep -c '' "$mu/fakegno.runs")" = 1 ] && [ "$(cut -d' ' -f1-3 "$mu/fakegno.runs")" = "test -timeout ${copies#*:}s" ] ||
		fail "mutate.py's ${copies%:*} copies are not one run of ${copies#*:} s: $(cut -d' ' -f1-3 "$mu/fakegno.runs")"
done
# One GAPS key excuses one mutant of one file (F5014, F5018): a gap given for r/one's untested guard never excuses the same
# line in r/two, and the same guard line twice in one file cannot hide both behind one gap.
for p in one two; do
	mkdir -p "$mu/c/r/$p" && printf 'module = "gno.land/r/test/%s"\ngno = "0.9"\n' "$p" >"$mu/c/r/$p/gnomod.toml"
	printf 'package %s\n\nfunc Do(bad bool) bool {\n\tif bad {\n\t\tpanic("bad")\n\t}\n\treturn bad\n}\n' "$p" >"$mu/c/r/$p/$p.gno"
done
printf '\nfunc Again(bad bool) bool {\n\tif bad {\n\t\tpanic("bad")\n\t}\n\treturn bad\n}\n' >>"$mu/c/r/two/two.gno"
: >"$mu/c/gnowork.toml"
gapped "$mu/check.py" '{"r/one/one.gno: if bad {": "one gap, given for r/one"}'
: >"$mu/fakegno.runs"
out=$(checked c GNO="$mu/fakegno" FAKE=survive) && fail "mutate.py let a gap given for r/one excuse the same guard in r/two: $out"
printf '%s\n' "$out" | grep -qxF "ok    survives: r/one/one.gno: if bad {  (known gap: one gap, given for r/one)" || fail "mutate.py did not keep r/one's gap: $out"
[ "$(printf '%s\n' "$out" | grep -cxF "FAIL  survives: r/two/two.gno: if bad { (expected killed)")" = 2 ] || fail "mutate.py did not fail r/two's two untested guards: $out"
# A survivor GAPS does not list is judged again alone (F5050, below): r/two's two, each in a run of its own, never r/one's gap.
[ "$(grep -c '' "$mu/fakegno.runs")" = 4 ] && [ "$(grep -c ' \./m0$' "$mu/fakegno.runs")" = 2 ] ||
	fail "mutate.py did not judge again alone each survivor GAPS does not list, and only those: $(cat "$mu/fakegno.runs")"
gapped "$mu/check.py" '{"r/one/one.gno: if bad {": "one gap, given for r/one", "r/two/two.gno: if bad {": "one gap, for two guards"}'
out=$(checked c GNO="$mu/fakegno" FAKE=survive) && fail "mutate.py let one GAPS key excuse two guards of one file: $out"
printf '%s\n' "$out" | grep -qxF "FAIL  GAPS key names 2 mutants, one only: r/two/two.gno: if bad {" || fail "mutate.py did not name the key that excuses two mutants: $out"
# In the run of every copy, a test in the package runs against its own copy, but a filetest against the first copy of its
# module in the workspace, the untouched m0 (F5050). So a mutant that run lets survive, GAPS not listing it, is judged again
# alone, in a workspace of its own copy: the guard of a package with no unit test, which only its filetest catches, is
# killed. A gap is not judged again, and a run alone that never ends is said by name.
mkdir -p "$mu/f/r/only" && : >"$mu/f/gnowork.toml" && printf 'module = "gno.land/r/test/only"\ngno = "0.9"\n' >"$mu/f/r/only/gnomod.toml"
printf 'package only\n\nfunc Do(bad bool) string {\n\tif bad {\n\t\tpanic("bad")\n\t}\n\treturn "done"\n}\n' >"$mu/f/r/only/only.gno"
printf 'package main\n\nimport "gno.land/r/test/only"\n\nfunc main() {\n\tprintln(only.Do(true))\n}\n\n// Error:\n// bad\n' >"$mu/f/r/only/z_only_filetest.gno"
gapped "$mu/check.py" '{}'
out=$(checked f GNO="$GNO") || fail "mutate.py let survive a guard only a filetest catches (F5050): $out"
[ "$out" = "ok    killed: r/only/only.gno: if bad {" ] || fail "mutate.py did not kill, alone, the guard only a filetest catches (F5050): $out"
gapped "$mu/check.py" '{"r/only/only.gno: if bad {": "a gap"}'
out=$(checked f GNO="$GNO") || fail "mutate.py judged a gap again alone: $out"
[ "$out" = "ok    survives: r/only/only.gno: if bad {  (known gap: a gap)" ] || fail "mutate.py did not keep a gap as a gap: $out"
gapped "$mu/check.py" '{}'
out=$(cd "$mu/f" && GNO="$mu/fakegno" FAKE=hangalone python3 -I -c 'import sys; sys.dont_write_bytecode = True; sys.path.insert(0, sys.argv[1]); import check; check.LEAST, check.SECONDS_A_COPY, check.GRACE = 1, 0.01, 1; sys.exit(check.main())' "$mu" 2>&1) && fail "mutate.py passed a survivor whose run alone never ended: $out"
[ "$out" = "FAIL  stopped: r/only/only.gno: if bad { (expected killed)" ] || fail "mutate.py did not name the survivor whose run alone never ended: $out"
# gno's output may hold bytes that are no UTF-8, a failing test printing them: mutate.py reads them as U+FFFD and judges on,
# never stopping on a traceback (F5062).
out=$(checked f GNO="$mu/fakegno" FAKE=binary) && fail "mutate.py passed the survivor of a run whose output is no UTF-8: $out"
[ "$out" = "FAIL  survives: r/only/only.gno: if bad { (expected killed)" ] || fail "mutate.py did not read gno's output that is no UTF-8 (F5062): $out"
# The tool it needs missing (F125): no gno, or none where GNO points, fails the check.
out=$(checked a -u GNO) && fail "mutate.py passed with no GNO: $out"
out=$(checked a GNO="$mu/no-such-gno") && fail "mutate.py passed with no gno at GNO: $out"
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
mkdir -p "$cmr/scripts" && cp "$here/hidden.py" "$cmr/scripts/" && git -C "$cmr" add scripts/hidden.py # what it reads a message with
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
# A python3 that cannot count is no count (F5080): `[ "" -gt 72 ]` errs, and an 86-character subject passed.
mkdir -p "$t/badpy" && printf '#!/bin/sh\nexit 1\n' >"$t/badpy/python3" && chmod +x "$t/badpy/python3"
printf 'feat: %s\n' "$(printf 'a%.0s' $(seq 1 80))" >"$t/msg"
(cd "$cmr" && env -u SANDBOX_RUNTIME PATH="$t/badpy:$PATH" "$cm/commit-msg" "$t/msg") 2>"$t/err" && fail "commit-msg passed a long subject python3 could not count (F5080)"
grep -qF "python3 cannot count the subject's characters" "$t/err" || fail "commit-msg did not say python3 cannot count: $(cat "$t/err")"
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
(cd "$t/no-repo" && env -u SANDBOX_RUNTIME GIT_CEILING_DIRECTORIES="$t" "$cm/commit-msg" "$t/msg") 2>"$t/err" && fail "commit-msg passed a fix it could not compare with what is staged"
grep -q "git cannot list what is staged" "$t/err" || fail "commit-msg did not say git failed: $(cat "$t/err")"
# A hidden character in the message (F5085): in the sandbox, the staged scripts/hidden.py reads each message as it is
# written, a merge's and an amend's too, as pre-commit runs the staged scripts there; an emoji's look selector passes. With
# no staged rule, or a python3 that fails, nothing proves the message clean: it refuses.
refused "$(printf 'test: x\n\nRemoved-test: a\342\200\256b - why')" || fail "commit-msg accepted a hidden character in the message (F5085)"
grep -qxF "  message:3:16: U+202E RIGHT-TO-LEFT OVERRIDE" "$t/err" || fail "commit-msg did not name the message's hidden character: $(cat "$t/err")"
refused "$(printf 'docs: a heart \342\235\244\357\270\217')" && fail "commit-msg refused an emoji's look selector: $(cat "$t/err")"
blob=$(printf 'import sys\nsys.exit("the staged copy ran")\n' | git -C "$cmr" hash-object -w --stdin) && git -C "$cmr" update-index --cacheinfo "100644,$blob,scripts/hidden.py"
refused "docs: x" || fail "commit-msg ran another scripts/hidden.py than the staged one"
grep -qF "the staged copy ran" "$t/err" || fail "commit-msg did not run the staged scripts/hidden.py: $(cat "$t/err")"
git -C "$cmr" update-index --force-remove scripts/hidden.py
refused "docs: x" || fail "commit-msg passed a message with no staged scripts/hidden.py to read it"
grep -qF "git cannot read the staged scripts/hidden.py" "$t/err" || fail "commit-msg did not say it has no rule to read the message with: $(cat "$t/err")"
git -C "$cmr" add scripts/hidden.py
mkdir -p "$t/countpy" && printf '#!/bin/sh\ncase "$*" in *"print(len("*) echo 7 && exit 0 ;; esac\nexit 1\n' >"$t/countpy/python3" && chmod +x "$t/countpy/python3"
printf 'docs: x\n' >"$t/msg" # a python3 that counts the subject, then fails
(cd "$cmr" && PATH="$t/countpy:$PATH" "$cm/commit-msg" "$t/msg") 2>"$t/err" && fail "commit-msg passed a message with a python3 that fails"
grep -qF "scripts/hidden.py could not read it" "$t/err" || fail "commit-msg did not say the message could not be read: $(cat "$t/err")"
fi

if part unsigned; then
# No git config from around this file reaches its throwaway repositories (F5012, F5022): Alexis's global one signs every
# commit with a key Claude Code's sandbox cannot read, which failed 36 sections there. Planted: one config whose signer always
# fails, reaching git by each way there is: a global or a system file, a HOME's or an XDG folder's, what `git -c` hands a hook
# in either of its forms, and a template folder, which `git init` copies into each repository; and GIT_CONFIG, which sends
# `git config` to a file outside the repository.
us="$t/unsigned" && mkdir -p "$us/home" "$us/xdg/git" "$us/template" "$us/repos" "$us/scripts" "$us/.githooks"
printf '#!/bin/sh\necho "$*" >>"%s/signed"\nexit 1\n' "$us" >"$us/signer" && chmod +x "$us/signer"
printf '[commit]\n\tgpgsign = true\n[gpg]\n\tformat = openpgp\n\tprogram = %s\n' "$us/signer" >"$us/signs"
cp "$us/signs" "$us/home/.gitconfig" && cp "$us/signs" "$us/xdg/git/config" && cp "$us/signs" "$us/template/config"
# Each way alone makes a commit in a new repository call the signer, and fail: the plant proves something.
signs() { # $1: the way; then env's arguments for it, where no other way reaches git
	way=$1 && shift && rm -f "$us/signed"
	env GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null HOME="$us/nohome" XDG_CONFIG_HOME="$us/noxdg" env "$@" \
		sh -c 'git init -q "$1" && git -C "$1" commit -q --allow-empty -m x' - "$us/repos/$way" 2>/dev/null &&
		fail "a commit passed though $way signs: the plant proves nothing"
	[ -s "$us/signed" ] || fail "git did not call the signer $way names: the plant proves nothing"
}
signs "a global file" GIT_CONFIG_GLOBAL="$us/signs"
signs "a system file" GIT_CONFIG_SYSTEM="$us/signs"
signs "HOME's .gitconfig" -u GIT_CONFIG_GLOBAL HOME="$us/home"
signs "XDG's git/config" -u GIT_CONFIG_GLOBAL XDG_CONFIG_HOME="$us/xdg"
signs "git -c's parameters" GIT_CONFIG_PARAMETERS="'include.path'='$us/signs'"
signs "git -c's count" GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=include.path GIT_CONFIG_VALUE_0="$us/signs"
signs "a template folder" GIT_TEMPLATE_DIR="$us/template"
git init -q "$us/repos/file" && GIT_CONFIG="$us/elsewhere-alone" git -C "$us/repos/file" config planted.key yes
[ -s "$us/elsewhere-alone" ] || fail "GIT_CONFIG did not send git config to its file: the plant proves nothing"
# All at once around a copy of this file, whose one planted section sets a config and commits in a throwaway repository: it
# passes, unsigned, the setting in the repository. The section also wants the two file variables exported as /dev/null, which a
# system file it cannot plant needs.
printf 'if part commits; then\n[ "$(printenv GIT_CONFIG_GLOBAL):$(printenv GIT_CONFIG_SYSTEM)" = /dev/null:/dev/null ] || fail "git does not get the config files this file sets"\ngit init -q "$t/c" && git -C "$t/c" config planted.key yes && git -C "$t/c" commit -q --allow-empty -m x || fail "a throwaway repository could not commit"\n[ "$(git config --file "$t/c/.git/config" planted.key)" = yes ] || fail "git config wrote outside the throwaway repository"\nfi\n' >"$us/planted"
sed "/^part() {/r $us/planted" "$0" >"$us/scripts/test_hooks.sh"
grep -qx 'if part commits; then' "$us/scripts/test_hooks.sh" || fail "the planted section is not in the copy of test_hooks.sh"
rm -f "$us/signed"
out=$(env HOME="$us/home" XDG_CONFIG_HOME="$us/xdg" GIT_CONFIG_GLOBAL="$us/signs" GIT_CONFIG_SYSTEM="$us/signs" GIT_CONFIG_PARAMETERS="'include.path'='$us/signs'" \
	GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=include.path GIT_CONFIG_VALUE_0="$us/signs" GIT_TEMPLATE_DIR="$us/template" GIT_CONFIG="$us/elsewhere" \
	ONLY=commits sh "$us/scripts/test_hooks.sh" 2>&1) || fail "a throwaway repository took the git config around test_hooks.sh (F5012, F5022): $out"
[ ! -e "$us/signed" ] || fail "a throwaway repository called the signer of the git config around test_hooks.sh (F5012, F5022)"
[ ! -e "$us/elsewhere" ] || fail "a throwaway repository's git config went to the GIT_CONFIG file around test_hooks.sh (F5022)"
# Then with neither file variable around it, as in Alexis's shell: a value this file sets but does not export would never reach
# git, and HOME's .gitconfig would sign again (F5021).
out=$(env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM HOME="$us/home" XDG_CONFIG_HOME="$us/xdg" ONLY=commits sh "$us/scripts/test_hooks.sh" 2>&1) ||
	fail "a throwaway repository took the git config of HOME around test_hooks.sh, which signs (F5021): $out"
[ ! -e "$us/signed" ] || fail "a throwaway repository called the signer of HOME's git config (F5021)"
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
# A hidden character (F5053), a format character of Unicode's (Cf: a bidi control, a zero-width one, a BOM, a tag), in any
# file git tracks or would, prose and the prototype's docs included, fails, named by its file, line, column and code point;
# no comment allows it. Written as an escape it passes, as an accent or an emoji does; an image is no text, and what git
# ignores is not read. printf writes each from its UTF-8 bytes, so this file holds none.
h="$t/hidden" && mkdir -p "$h/src" "$h/r/x" "$h/docs/prototype" "$h/.claude/rules" "$h/ignored" "$h/node_modules/x" "$h/app/node_modules" && good_rules "$h"
git -C "$h" init -q && printf 'ignored/\nnode_modules/\n' >"$h/.gitignore"
hidden() { python3 -I "$docs" "$h" 2>&1; }
printf 'const x = "caf\303\251 \360\237\230\200";\n' >"$h/src/fine.ts"
printf 'const x = "\\u202e";\n' >"$h/src/escaped.ts"
# An image is known by its suffix and its format's first bytes, as each real one starts (F5082).
printf '\211PNG\r\n\032\n\342\200\256' >"$h/shot.png" && printf '\377\330\377\342\200\256' >"$h/shot.jpg"
# A file deleted from the work tree but still in the index is not read.
printf 'gone\n' >"$h/gone.txt" && git -C "$h" add gone.txt && git -C "$h" commit -qm gone && rm "$h/gone.txt"
# So is a source the alerts check reads (listed(), which lists only what is there).
mkdir -p "$h/server/src" && printf 'gone\n' >"$h/server/src/gone.ts" && git -C "$h" add server/src/gone.ts && git -C "$h" commit -qm gone2 && rm "$h/server/src/gone.ts"
hidden >/dev/null || fail "check_docs refused a root whose characters all show (an accent, an emoji, an escape, an image), or a file deleted from the work tree"
# A file it cannot read fails, never passes unread.
: >"$h/src/locked.ts" && chmod 000 "$h/src/locked.ts"
hidden >/dev/null && fail "check_docs passed a file it cannot read"
chmod 644 "$h/src/locked.ts"
# What is hidden is a table, not the Python's Unicode (F5083): Default_Ignorable_Code_Point, Cf, Zl and Zp as the pinned
# Node's ICU gives them, range by range, and the version hidden.py names.
node -e '
const set = /^[\p{Default_Ignorable_Code_Point}\p{Cf}\p{Zl}\p{Zp}]$/u;
const out = [process.versions.unicode];
for (let c = 0, start = -1; c <= 0x110000; c++) {
  const hit = c <= 0x10ffff && set.test(String.fromCodePoint(c));
  if (hit && start < 0) start = c;
  if (!hit && start >= 0) { out.push(start.toString(16) + " " + (c - 1).toString(16)); start = -1; }
}
console.log(out.join("\n"));' >"$h/table.node" || fail "node could not list Unicode's hidden characters"
python3 -I -c 'import sys; sys.dont_write_bytecode = True; sys.path.insert(0, sys.argv[1]); import hidden; print(hidden.UNICODE); print("\n".join(f"{a:x} {b:x}" for a, b in hidden.TABLE))' "$here" >"$h/table.py"
diff "$h/table.node" "$h/table.py" >"$h/diff" || fail "hidden.py's TABLE is not Unicode's hidden characters as the pinned Node gives them (<):
$(cat "$h/diff")"
rm "$h/table.node" "$h/table.py"
# Each end of the table's ranges and a point inside some (an unassigned tag, a variation selector) after a letter, and none
# of their neighbours. U+FE0E and U+FE0F, which pick an emoji's look, pass right after a character that shows and is no
# ASCII, or in a keycap; after a letter, alone, twice in a row, or any other selector, they hide bits (F5086).
python3 -I - "$h/table.txt" "$h/sel.txt" "$h/table.want" "$here" <<'PY'
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[4])
from hidden import TABLE
inside = lambda p: any(a <= p <= b for a, b in TABLE)
refused = sorted({p for a, b in TABLE for p in (a, b)} | {0x2065, 0xFE05, 0xE0080, 0xE0100})
shown = sorted({p for a, b in TABLE for p in (a - 1, b + 1) if not inside(p)} | {0x00A0, 0x200A, 0x2010})
points = refused + shown
open(sys.argv[1], "w", encoding="utf-8").write("".join(f"x{chr(p)}\n" for p in points))
heart, emoji, cap = chr(0x2764), chr(0x1F600), chr(0xFE0F) + chr(0x20E3)
lines = [  # (line, the columns it refuses)
    (heart + chr(0xFE0F) + " ok", []), (emoji + chr(0xFE0E), []), ("1" + cap + " #" + cap + " *" + cap, []),
    ("a" + chr(0xFE0F), [2]), (heart + chr(0xFE0F) + chr(0xFE0F), [3]), (chr(0xFE0F) + "x", [1]), ("1" + chr(0xFE0F) + "x", [2]),
    (heart + chr(0xFE00), [2]), (chr(0x4E00) + chr(0xE0100), [2]), (chr(0x200D) + chr(0xFE0F), [1, 2]),
]
open(sys.argv[2], "w", encoding="utf-8").write("".join(text + "\n" for text, _ in lines))
# One that starts a text follows nothing, whatever the text ends with.
open(sys.argv[2].replace("sel.txt", "start.txt"), "w", encoding="utf-8").write(chr(0xFE0F) + "a" + chr(0xE9))
want = [f"  table.txt:{n}:2: U+{p:04X}" for n, p in enumerate(points, 1) if p in refused] + ["  start.txt:1:1: U+FE0F"]
want += [f"  sel.txt:{n}:{col}: U+{ord(text[col - 1]):04X}" for n, (text, cols) in enumerate(lines, 1) for col in cols]
open(sys.argv[3], "w").write("".join(f"{w}\n" for w in sorted(want)))
PY
printf '// a header\nconst x = "ab\342\200\256cd"; // gitleaks:allow noqa eslint-disable-line prettier-ignore @ts-ignore nolint\n' >"$h/src/a.ts"
printf 'package x\n\nvar s = "\342\201\246"\n' >"$h/r/x/x.gno"
printf 'ab\342\200\213c\n' >"$h/docs/prototype/notes.md"
printf '\357\273\277# a file with a BOM\n' >"$h/README"
printf 'x\342\200\215y\n' >"$h/src/joined.ts"
printf '\330\234 a mark\n' >"$h/notes.txt"
printf 'Read this.\363\240\201\201\n' >"$h/.claude/rules/x.md"
printf '# co\302\255de\n' >"$h/a.py"
# What is no UTF-8 text is refused whole, from its first byte that is a NUL or no UTF-8: its characters cannot be read, as
# UTF-16 writes U+202E as `2E 20` (F5088), and a binary cannot write one as an escape (F5082). So is a text named as an
# image, which Vite's `?raw` reads.
printf '\000\342\200\256\n' >"$h/blob.txt"
printf 'caf\351 \342\200\256\n' >"$h/latin.txt"
printf '\377\376a\000\056\040b\000\n\000' >"$h/u16.md" && printf 'a\000\056\040b\000\n\000' >"$h/u16raw.md"
python3 -I -c 'import os, sys; open(sys.argv[1], "wb").write(os.urandom(65536))' "$h/font.woff2"
printf 'a\342\200\256\n' >"$h/text.png"
printf 'a\014b\342\200\256\nc\342\200\213d\342\200\215\n\303\251\360\237\230\200\342\200\256\n' >"$h/multi.txt"
printf '\342\200\256\n' >"$h/$(printf 'caf\303\251 notes.md')" && printf '\342\200\256\n' >"$h/q\"uote.md"
for f in ignored/x.ts node_modules/x/y.js app/node_modules/z.js; do printf 'const x = "\342\200\256";\n' >"$h/$f"; done
git -C "$h" add README && git -C "$h" commit -qm base
cat >"$h/want" <<'EOF'
  src/a.ts:2:14: U+202E RIGHT-TO-LEFT OVERRIDE
  r/x/x.gno:3:10: U+2066 LEFT-TO-RIGHT ISOLATE
  docs/prototype/notes.md:1:3: U+200B ZERO WIDTH SPACE
  README:1:1: U+FEFF ZERO WIDTH NO-BREAK SPACE
  src/joined.ts:1:2: U+200D ZERO WIDTH JOINER
  notes.txt:1:1: U+061C ARABIC LETTER MARK
  .claude/rules/x.md:1:11: U+E0041 TAG LATIN CAPITAL LETTER A
  a.py:1:5: U+00AD SOFT HYPHEN
  text.png:1:2: U+202E RIGHT-TO-LEFT OVERRIDE
  multi.txt:1:4: U+202E RIGHT-TO-LEFT OVERRIDE
  multi.txt:2:2: U+200B ZERO WIDTH SPACE
  multi.txt:2:4: U+200D ZERO WIDTH JOINER
  multi.txt:3:3: U+202E RIGHT-TO-LEFT OVERRIDE
  café notes.md:1:1: U+202E RIGHT-TO-LEFT OVERRIDE
  q"uote.md:1:1: U+202E RIGHT-TO-LEFT OVERRIDE
EOF
out=$(hidden) && fail "check_docs accepted hidden characters: $out"
printf '%s\n' "$out" | grep -qF "check_docs: these files hold a hidden character" || fail "check_docs did not say why it refused hidden characters: $out"
printf '%s\n' "$out" | grep ': U+' | grep -Ev '^  (table|sel|start)\.txt:' | sort >"$h/got" && sort "$h/want" >"$h/want.sorted"
diff "$h/want.sorted" "$h/got" >"$h/diff" || fail "check_docs's hidden characters, against the wanted ones (<):
$(cat "$h/diff")"
for no in blob.txt:1 latin.txt:4 u16.md:1 u16raw.md:2; do
	printf '%s\n' "$out" | grep -qxF "  ${no%:*}: no UTF-8 text, from its byte ${no#*:} (a NUL, or a byte that is no UTF-8)" || fail "check_docs did not refuse ${no%:*} as no UTF-8 text from its byte ${no#*:}: $out"
done
printf '%s\n' "$out" | grep -q '^  font\.woff2: no UTF-8 text, from its byte [0-9]* ' || fail "check_docs did not refuse a binary it knows no format of: $out"
[ "$(printf '%s\n' "$out" | grep -c '^  font\.woff2:')" = 1 ] || fail "check_docs named a binary's bytes as characters: $out"
printf '%s\n' "$out" | grep -E '^  (table|sel|start)\.txt:' | sed 's/^\(  [^ ]* U+[0-9A-F]*\) .*/\1/' | LC_ALL=C sort >"$h/table.got"
diff "$h/table.want" "$h/table.got" >"$h/diff" || fail "check_docs's hidden characters, one a line, against the wanted ones (<):
$(cat "$h/diff")"
# The tool it needs missing (F125), or the command it runs failing (F116): with no git, or a git that fails, it reads every
# file of the folder but git's own and the installed packages', and still refuses.
mkdir -p "$t/nogit" "$t/badgit" && printf '#!/bin/sh\nexit 1\n' >"$t/badgit/git" && chmod +x "$t/badgit/git"
printf '\342\200\256\n' >"$h/.git/planted"
py=$(command -v python3)
for path in "$t/nogit" "$t/badgit:$PATH"; do
	out=$(PATH=$path "$py" -I "$docs" "$h" 2>&1) && fail "check_docs accepted a hidden character with PATH=$path: $out"
	printf '%s\n' "$out" | grep -qxF "  src/a.ts:2:14: U+202E RIGHT-TO-LEFT OVERRIDE" || fail "check_docs, with PATH=$path, did not name the hidden character: $out"
	printf '%s\n' "$out" | grep -qF "  .git/" && fail "check_docs, with PATH=$path, read git's own folder: $out"
	printf '%s\n' "$out" | grep -qF "node_modules/" && fail "check_docs, with PATH=$path, read the installed packages: $out"
done
# A commit message is text the repository keeps too, which scripts parse (a `Removed-test:` line shown as one name, read as
# another): each message since the branch left origin/main is read, named by its commit (F5079); a message main holds
# already is not, nor any with no origin/main to compare with. With no git, or a git that fails, nothing proves the messages
# clean: it fails, never takes the failure for a branch with no origin/main.
m="$t/messages" && mkdir -p "$m" && good_rules "$m" && git -C "$m" init -q && git -C "$m" add -A
git -C "$m" commit -qm "$(printf 'docs: on main\n\nzero\342\200\213width')" && git -C "$m" update-ref refs/remotes/origin/main HEAD
messages() { python3 -I "$docs" "$m" 2>&1; }
messages >/dev/null || fail "check_docs read a message main holds already"
git -C "$m" commit -q --allow-empty -m "$(printf 'test: the branch\n\nRemoved-test: a\342\200\256b - why')"
out=$(messages) && fail "check_docs accepted a commit message holding a hidden character: $out"
printf '%s\n' "$out" | grep -qxF "  commit $(git -C "$m" rev-parse --short HEAD):3:16: U+202E RIGHT-TO-LEFT OVERRIDE" || fail "check_docs did not name the message's hidden character: $out"
# Every message of the branch, not its newest only (F5081): a clean commit on top hides nothing.
older=$(git -C "$m" rev-parse --short HEAD) && git -C "$m" commit -q --allow-empty -m "test: a clean top"
out=$(messages) && fail "check_docs accepted a hidden character in a message under a clean one (F5081): $out"
printf '%s\n' "$out" | grep -qxF "  commit $older:3:16: U+202E RIGHT-TO-LEFT OVERRIDE" || fail "check_docs did not name the older message's hidden character: $out"
out=$(PATH="$t/nogit" "$py" -I "$docs" "$m" 2>&1) && fail "check_docs passed the messages with no git to read them: $out"
printf '%s\n' "$out" | grep -qF "git cannot read the branch's commit messages" || fail "check_docs did not say git cannot read the messages: $out"
out=$(PATH="$t/badgit:$PATH" "$py" -I "$docs" "$m" 2>&1) && fail "check_docs passed the messages with a git that fails: $out"
printf '%s\n' "$out" | grep -qF "git cannot read the branch's commit messages" || fail "check_docs did not say a git that fails cannot read the messages: $out"
git -C "$m" update-ref -d refs/remotes/origin/main
messages >/dev/null || fail "check_docs read messages with no origin/main to say where the branch starts"
# What a commit takes is the index's copy (F5087): a hidden character staged under a clean work tree's copy is named, and
# one in the work tree's copy under a clean staged one, as `(work tree)`. A `.gitattributes` encoding keeps the work tree in
# another text than the one git stores (F5088): UTF-7 writes U+202E as `+IC4-`, plain ASCII. A name and a link's target are
# text too, a link deleted or pointing nowhere included (F5089); a gitlink (a submodule) holds none.
x="$t/staged" && mkdir -p "$x/docs" && good_rules "$x" && git -C "$x" init -q
staged() { python3 -I "$docs" "$x" 2>&1; }
printf 'a\342\200\256b\n' >"$x/docs/s.md" && git -C "$x" add docs/s.md && printf 'ab\n' >"$x/docs/s.md"
out=$(staged) && fail "check_docs passed a hidden character staged under a clean work tree (F5087): $out"
printf '%s\n' "$out" | grep -qxF "  docs/s.md:1:2: U+202E RIGHT-TO-LEFT OVERRIDE" || fail "check_docs did not name the staged copy's hidden character: $out"
printf '%s\n' "$out" | grep -qF "(work tree)" && fail "check_docs named a work tree's copy that holds none: $out"
printf 'ab\n' >"$x/docs/s.md" && git -C "$x" add docs/s.md && printf 'a\342\200\256b\n' >"$x/docs/s.md"
out=$(staged) && fail "check_docs passed a hidden character in the work tree under a clean staged copy: $out"
printf '%s\n' "$out" | grep -qxF "  docs/s.md (work tree):1:2: U+202E RIGHT-TO-LEFT OVERRIDE" || fail "check_docs did not name the work tree's hidden character: $out"
printf 'ab\n' >"$x/docs/s.md"
staged >/dev/null || fail "check_docs refused a staged and a work tree copy that hold none"
printf '*.txt working-tree-encoding=UTF-7\n' >"$x/.gitattributes" && printf 'a+IC4-b\n' >"$x/e.txt" && git -C "$x" add .gitattributes e.txt
out=$(staged) && fail "check_docs passed U+202E that git stores while the work tree writes it in UTF-7 (F5088): $out"
printf '%s\n' "$out" | grep -qxF "  e.txt:1:2: U+202E RIGHT-TO-LEFT OVERRIDE" || fail "check_docs did not name what git stores under UTF-7: $out"
git -C "$x" rm -qf e.txt .gitattributes
printf 'x\n' >"$x/$(printf 'a\342\200\256b.md')" && printf 'x\n' >"$x/$(printf 'c\342\200\256d.md')"
ln -s "$(printf 'c\342\200\256d.md')" "$x/link.md" && ln -s "$(printf 'e\342\200\256f')" "$x/staged-link" && git -C "$x" add staged-link && rm "$x/staged-link"
git -C "$x" update-index --add --cacheinfo "160000,$(printf '%040d' 1),sub"
out=$(staged) && fail "check_docs passed a hidden character in a name or a link's target (F5089): $out"
for line in "the name 'a\\u202eb.md':1:2: U+202E RIGHT-TO-LEFT OVERRIDE" "link.md (link):1:2: U+202E RIGHT-TO-LEFT OVERRIDE" "staged-link (link):1:2: U+202E RIGHT-TO-LEFT OVERRIDE"; do
	printf '%s\n' "$out" | grep -qxF "  $line" || fail "check_docs did not say $line: $out"
done
printf '%s\n' "$out" | grep -q '^  sub' && fail "check_docs read a gitlink as a file: $out"
out=$(PATH="$t/badgit:$PATH" "$py" -I "$docs" "$x" 2>&1) && fail "check_docs passed the index with a git that fails: $out"
printf '%s\n' "$out" | grep -qF "git cannot read the index" || fail "check_docs did not say git cannot read the index: $out"
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
	'[ -n "$ONLY" ] || { echo . >>"$SHARD_ROOT/controls"; [ -z "${CONTROLS_SLOW:-}" ] || { : >"$SHARD_ROOT/live.$$"; n=0; until [ "$(ls "$SHARD_ROOT" | grep -c "^live\.")" -ge 2 ] || [ "$n" -ge 50 ]; do n=$((n + 1)); sleep 0.1; done; sleep 0.3; ls "$SHARD_ROOT" | grep -c "^live\." >>"$SHARD_ROOT/overlap"; rm -f "$SHARD_ROOT/live.$$"; }; [ ! -e BROKEN_hooks ]; exit; }' \
	'if part x; then' \
	'	pwd >>"$SHARD_ROOT/ran"' \
	'	[ -n "${CUT:-}" ] && [ -n "$ONLY" ] && ! grep -q KEEP3 g.txt && kill -9 "$PPID"' \
	'	if [ -n "${INTR:-}" ] && ! grep -q " SPARE" g.txt; then' \
	'		case $INTR in group) kill -INT 0; sleep 5 ;; ppid) kill -INT "$PPID"; sleep 1 ;; *) exit "$INTR" ;; esac' \
	'	fi' \
	'	! grep -q " SPARE" g.txt && [ -n "${FLAKE:-}" ] && [ ! -e "$SHARD_ROOT/flaked" ] && { : >"$SHARD_ROOT/flaked"; exit 1; }' \
	'	if [ -n "${SHARDS_MEET:-}" ]; then' \
	'		: >"$SHARD_ROOT/met.${PWD##*/}" && n=0' \
	'		until [ "$(ls "$SHARD_ROOT" | grep -c "^met\.")" -ge "$SHARDS_MEET" ]; do n=$((n + 1)); [ "$n" -lt 100 ] || { : >"$SHARD_ROOT/lonely"; break; }; sleep 0.1; done' \
	'	fi' \
	'	grep -q KEEP1 g.txt && grep -q KEEP2 g.txt && grep -q KEEP3 g.txt && grep -q KEEP4 h.txt && grep -q KEEP5 i.txt && grep -q KEEP8 "$(printf "\303\251").txt" && grep -q LINE1 m.txt && grep -q LINE2 m.txt' \
	'fi' >"$hs/src/scripts/test_hooks.sh"
# probe.py's block y reads k.txt (a mutant of k.txt is a probe block's, G5); ONLY names the blocks to run, none for all.
printf 'import os, sys\n\n\ndef part(name):\n    return name in os.environ.get("ONLY", "").split(",")\n\n\nif part("y"):\n    if "KEEP7" not in open("k.txt").read():\n        sys.exit(1)\nif not os.environ.get("ONLY"):\n    open(os.environ["SHARD_ROOT"] + "/probe_controls", "a").write(".\\n")\nsys.exit(os.path.exists("BROKEN_probe"))\n' >"$hs/src/scripts/probe.py"
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
	printf '%s\n' "$out" | grep -q "no verdict of this mutant is kept" || fail "harness_mutate took the end of a suite with $c for a verdict: $out"
	printf '%s\n' "$out" | grep -q "killed: planted spare #1" && fail "harness_mutate read $c as a kill: $out"
done
# A Ctrl+C that reaches the run alone, its suites unharmed: the shard stops at once, starting no mutant and keeping no
# verdict after it (the suite of the survivor goes on to pass; four mutants had run, never the seven).
out=$(INTR=ppid GROUPED=1 shards 1) && fail "harness_mutate passed after an interrupt: $out"
[ "$(count ran)" = 4 ] || fail "harness_mutate went on judging after its interrupt: $(count ran) of 7 mutants ran"
grep -q survives "$hs"/home/.cache/gnoworld-tools/* 2>/dev/null && fail "harness_mutate kept the verdict of a mutant judged after its interrupt"
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
# (packages/service/src/db.ts); F466's, edited in place, never reached a file made before. It reads the working tree, as
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
printf '#!/bin/sh\nexit 1\n' >"$c2/scripts/check.sh" && cp "$here/code_changed.sh" "$here/borrow_node_modules.sh" "$here/check_docs.py" "$here/hidden.py" "$here/repo_files.py" "$c2/scripts/" && secrets_into "$c2/scripts/" && git -C "$c2" add -A && git -C "$c2" commit -qm base
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
# A hidden character stops a docs-only commit too, whose one check is check_docs (F5053).
printf 'a\342\200\256b\n' >"$c2/docs/hidden.md" && git -C "$c2" add docs/hidden.md
precommit && fail "pre-commit let a docs-only commit through with a hidden character (F5053)"
# What it reads is what the commit takes, the staged copy, not the work tree's (F5087).
printf 'ab\n' >"$c2/docs/hidden.md"
precommit && fail "pre-commit let a docs-only commit through with a hidden character staged under a clean work tree (F5087)"
git -C "$c2" rm -qf docs/hidden.md
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
rm -f "$c2/.git/MERGE_HEAD"
GATE_MERGE=1 precommit && [ "$(cat "$t/gate-merge")" = 0 ] || fail "pre-commit passed on a GATE_MERGE of its caller: a work commit's budget would be off"
git -C "$c2" reset -q --hard && rm -f "$c2/u.ts"
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
for f in review_pass.py check_docs.py repo_files.py hidden.py; do printf 'open("%s/ran", "w")\n' "$o" >"$o/scripts/$f"; done
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
# Outside, commit-msg runs no scripts/hidden.py, staged or not: the branch's messages are read at the next gate (F5085).
printf 'docs: x\n' >"$t/outside-msg"
out sh .githooks/commit-msg "$t/outside-msg" || fail "commit-msg outside the sandbox refused a clean message"
git -C "$o" commit -qm two
untouched "pre-commit, pre-merge-commit, commit-msg"
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
# As in Alexis's shell, with no mark of merge.sh and, as everywhere in this file, no git config of
# his own (no hooks path): from the root, or from a folder below it.
alexis() { env -u SANDBOX_RUNTIME -u GNOWORLD_MERGE GIT_MERGE_AUTOEDIT=no "$@"; }
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
cp "$here/check.sh" "$here/code_changed.sh" "$here/unsteady.py" "$g/scripts/" && cp "$hooks/records.sh" "$g/.githooks/" && cp "$here/../.node-version" "$here/../.gitignore" "$g/"
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
[ "$n" != py:audit ] || echo "audit-answer ${AUDIT_ANSWER-unset}" >>"$GATE_LOG"
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
# python3, which fails check.sh's free_ports (its one script that says "in 200 tries") when PORTS_FAIL is set, as a machine with no free port would;
# PORTS_FAIL_ONE fails only an ask for one port (the stories' and the pictures'), the journeys' three still found.
printf '#!/bin/sh\ncase "$*" in *"free ports in 200 tries"*) [ -z "${PORTS_FAIL:-}" ] || { echo "check.sh: no run of free ports (stub)" >&2; exit 1; }; [ -z "${PORTS_FAIL_ONE:-}" ] || case "$*" in *" 1") echo "check.sh: no run of 1 free ports (stub)" >&2; exit 1 ;; esac ;; esac\nexec "%s" "$@"\n' "$(command -v python3)" >"$g/bin/python3"
chmod +x "$g/bin/python3"
printf '#!/bin/sh\nexec sh "%s" gno "$@"\n' "$step" >"$g/toolchain/gno"
chmod +x "$g/bin/go" "$g/bin/gofmt" "$g/toolchain/gno"
for py in check_css check_docs mutate probe bench batch_size load patch_coverage prove_fix check_regressions check_migrations audit harness_mutate check_nginx; do
	printf 'import os, sys\nos.execvp("sh", ["sh", %s, "py:%s", *sys.argv[1:]])\n' "'$step'" "$py" >"$g/scripts/$py.py"
done
for sh in ergo test_hooks scan_secrets; do printf 'exec sh "%s" sh:%s "$@"\n' "$step" "$sh" >"$g/scripts/$sh.sh"; done
# The journeys' stub; with PW_EDIT, it edits a package file, as a build that installs would.
printf 'const { spawnSync } = require("node:child_process");\nconst { appendFileSync, writeFileSync } = require("node:fs");\nconst stories = process.argv.some((a) => a.includes("stories"));\nconst name = stories ? (process.env.PICTURES_OF ? "pictures" : "stories") : "playwright";\nif (process.env.PW_EDIT) appendFileSync("app/package.json", "\\n");\nconst status = spawnSync("sh", [%s, name, "port=" + process.env.E2E_PORT, "of=" + (process.env.PICTURES_OF ?? ""), "on=" + (process.env.STORIES_PORT ?? ""), "out=" + (process.env.STORIES_OUT ?? ""), ...process.argv.slice(2)], { stdio: "inherit" }).status;\nconst report = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;\nconst failing = process.env.NOREPORT === "empty" ? [] : [{ title: "a.spec.ts", file: "a.spec.ts", specs: [{ title: "journey", ok: false, file: "a.spec.ts" }] }];\nif (process.env.ALSO === "two") failing.push({ title: "b.spec.ts", file: "b.spec.ts", specs: [{ title: "second", ok: false, file: "b.spec.ts" }] });\nif (status && report && process.env.NOREPORT !== "1" && process.argv.some((a) => a.endsWith("json"))) writeFileSync(report, JSON.stringify({ config: { rootDir: process.cwd() + "/app/tests" }, errors: process.env.ALSO === "errors" ? [{ message: "globalSetup failed" }] : [], suites: [...failing, { title: "ok.spec.ts", file: "ok.spec.ts", specs: [{ title: "fine", ok: true, file: "ok.spec.ts" }] }] }));\nprocess.exit(status);\n' "'$step'" >"$g/app/node_modules/@playwright/test/cli.js"
mkdir -p "$g/node_modules/vitest" && printf 'import { spawnSync } from "node:child_process";\nprocess.exit(spawnSync("sh", [%s, "core_chromium", "switch=" + (process.env.CORE_CHROMIUM ?? ""), ...process.argv.slice(2)], { stdio: "inherit" }).status ?? 1);\n' "'$step'" >"$g/node_modules/vitest/vitest.mjs"
python3 -I - "$g/package.json" "$step" <<'PY'
import json, sys
names = ["build:app", "format:check", "typecheck", "lint", "test", "test:compiled", "unused", "copies", "comments", "coverage", "mutate"]
json.dump({"scripts": {n: f"sh {sys.argv[2]} {n}" for n in names}}, open(sys.argv[1], "w"))
PY
printf '{}\n' >"$g/app/package.json" && printf '{}\n' >"$g/server/package.json" && : >"$g/pnpm-lock.yaml" && : >"$g/gno/r/seal/vectors_test.gno"
for f in server/src/a.ts server/src/b.ts server/roles.json app/src/a.tsx app/tests/a.spec.ts packages/core/src/a.ts packages/ui/src/a.ts \
	packages/schemas/src/a.ts gno/r/a.gno deploy/a.conf lint/a.ts vitest.config.ts packages/ui/src/tokens.css packages/ui/src/base.css; do
	printf 'x\n' >"$g/$f"
done
git -C "$g" init -q && git -C "$g" add -A && git -C "$g" commit -qm x && git -C "$g" update-ref refs/remotes/origin/main HEAD
}
gate() { : >"$log" && rm -f "$log".met.* "$log.load" "$log".flaked.* && (cd "$g" && env -u SANDBOX_RUNTIME GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" NVM_DIR="${NVM_DIR:-$HOME/.nvm}" HOME="$g.home" PATH="$g/bin:$PATH" sh scripts/check.sh "$@" 2>&1); }
ran() { grep -q "^$1\( \|$\)" "$log"; }
before() { [ "$(grep -n "^$1\( \|$\)" "$log" | head -1 | cut -d: -f1)" -lt "$(grep -n "^$2\( \|$\)" "$log" | head -1 | cut -d: -f1)" ]; }
reset() { git -C "$g" reset -q --hard && git -C "$g" clean -qfd; }
fast_steps="format:check typecheck lint test unused copies comments py:check_css sh:ergo build:app gno py:mutate gofmt go py:check_docs sh:test_hooks"
full_steps=$(printf '%s' "$fast_steps" | sed 's/build:app/playwright/') # the merge check and --full walk the journeys, which build the app themselves
cheap="format:check unused copies comments py:check_css py:check_docs"
everything() { # $1: what the run was given
	for s in $fast_steps; do ran "$s" || fail "check.sh skipped $s on $1, which must run everything"; done
	grep -q '^test .*--changed' "$log" && fail "check.sh ran only the changed tests on $1, which must run every test"
	ran playwright && fail "check.sh walked the journeys on $1: a commit's gate walks none"
	:
}
scoped() { # $1: what the run was given; then the steps it must run, "-", the steps it must not
	what=$1 && shift
	must=true
	for s in "$@"; do
		if [ "$s" = - ]; then must=false; elif $must; then ran "$s" || fail "check.sh skipped $s on $what"; else ran "$s" && fail "check.sh ran $s on $what"; fi
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
# The server: its types and lint, every test (main.test.ts runs the server as a child, outside
# Vitest's graph), the cheap checks; never the app's journeys, gno or the hooks' tests. Budget 30 s.
rm -f "$g/.claude/tmp/green-full"
printf 'y\n' >>"$g/server/src/a.ts"
out=$(gate) || fail "check.sh failed on a server change: $out"
scoped "a server change" $cheap typecheck lint test - build:app gno py:mutate go sh:test_hooks
nocache "a server change"
grep -q '^test .*--changed' "$log" && fail "check.sh ran only Vitest's related tests on a server change"
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
grep -q '^test .*--changed' "$log" || fail "check.sh did not run only the tests an app change touches"
for s in unused copies comments py:check_css; do before "$s" build:app || fail "check.sh built the app before $s read the tree (F082)"; done
reset
# The design system's TypeScript, and a journey: the same.
for f in packages/ui/src/a.ts app/tests/a.spec.ts; do
	printf 'y\n' >>"$g/$f"
	gate >/dev/null || fail "check.sh failed on a change of $f"
	scoped "a change of $f" typecheck lint test - gno sh:test_hooks playwright
	if [ "$f" = packages/ui/src/a.ts ]; then ran build:app || fail "check.sh did not build the app on a change of the design system"; else ran build:app && fail "check.sh built the app on a change of a journey"; fi
	grep -q '^test .*--changed' "$log" || fail "check.sh did not run only the related tests on a change of $f"
	reset
done
# tokens.css: the tokens story lists every token, so a token changed moves its pictures (F1190, Alexis, 2026-10-27, after
# a95a764 added two and `check.sh --merge` found the pictures 30 minutes later). The fast gate also compares that story
# alone, at its three widths, in a lane of its own on a port of its own; every test runs (a stylesheet is outside
# Vitest's graph); another stylesheet of the design system, and no change, do not.
printf 'y\n' >>"$g/packages/ui/src/tokens.css"
gate >/dev/null || fail "check.sh failed on a change of tokens.css"
scoped "a change of tokens.css" typecheck lint test build:app pictures - gno sh:test_hooks stories
grep -q '^test .*--changed' "$log" && fail "check.sh ran only Vitest's related tests on a change of a stylesheet"
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
# Core: the server imports it, and main.test.ts runs the server as a child: every test, and the journeys.
printf 'y\n' >>"$g/packages/core/src/a.ts"
gate >/dev/null || fail "check.sh failed on a core change"
scoped "a core change" typecheck lint test build:app - gno sh:test_hooks
grep -q '^test .*--changed' "$log" && fail "check.sh ran only Vitest's related tests on a core change"
reset
# Jarvis and the two shared packages in a repository too (D110 to D112): every test, never Vitest's related ones alone, as
# Jarvis's and the server's own processes are children their graph misses; the app's build for the chain package alone.
for f in jarvis/src/a.ts packages/service/src/a.ts packages/chain/src/a.ts; do
	mkdir -p "$g/$(dirname "$f")" && printf 'y\n' >>"$g/$f"
	gate >/dev/null || fail "check.sh failed on a change of $f"
	case $f in
	packages/chain/*) scoped "a change of $f" typecheck lint test build:app - gno ;;
	*) scoped "a change of $f" typecheck lint test - build:app gno ;;
	esac
	grep -q '^test .*--changed' "$log" && fail "check.sh ran only Vitest's related tests on a change of $f"
	reset
done
# A file of the app that is not TypeScript (a fixture, a stylesheet) sits outside Vitest's graph: every test.
printf 'x\n' >"$g/app/src/b.json"
gate >/dev/null || fail "check.sh failed on an app fixture"
scoped "an app fixture" test build:app
grep -q '^test .*--changed' "$log" && fail "check.sh ran only Vitest's related tests on a change outside its graph"
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
# There, pre-commit lists what the commit changes in GATE_CHANGED: the run checks those areas, every
# test (Vitest finds the related ones through git), and prose alone is no change.
outside() { : >"$log" && (cd "$g-copy" && env -u SANDBOX_RUNTIME -u GATE_MERGE GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED="$1" sh scripts/check.sh 2>&1); }
out=$(outside "server/src/a.ts
docs/x.md") || fail "check.sh failed outside a repository on pre-commit's list: $out"
scoped "pre-commit's list of a server change" $cheap typecheck lint test - build:app gno sh:test_hooks
grep -q '^test .*--changed' "$log" && fail "check.sh asked Vitest for the related tests outside a repository"
outside "app/src/a.tsx" >/dev/null || fail "check.sh failed outside a repository on an app change"
scoped "pre-commit's list of an app change" typecheck build:app test - gno
grep -q '^test .*--changed' "$log" && fail "check.sh asked Vitest for the related tests outside a repository"
outside "gno/r/a.gno" >/dev/null || fail "check.sh failed outside a repository on a gno change"
scoped "pre-commit's list of a gno change" gno - typecheck build:app
# The tokens story's pictures there too: pre-commit's list names the change, which a staged copy holds no repository to read.
outside "packages/ui/src/tokens.css" >/dev/null || fail "check.sh failed outside a repository on a change of tokens.css"
scoped "pre-commit's list of a change of tokens.css" typecheck test build:app pictures - gno
outside "packages/ui/src/base.css" >/dev/null || fail "check.sh failed outside a repository on a change of base.css"
scoped "pre-commit's list of a change of base.css" typecheck test build:app - pictures
# Jarvis's workspace and the service package are the server's kind (D110, D111): every test, no page loads them; the chain
# package is core's kind, as the app imports it: every test and the app's build (D112).
for path in jarvis/src/a.ts packages/service/src/a.ts; do
	outside "$path" >/dev/null || fail "check.sh failed outside a repository on $path"
	scoped "pre-commit's list of a change of $path" typecheck lint test - build:app gno
done
outside "packages/chain/src/a.ts" >/dev/null || fail "check.sh failed outside a repository on a change of the chain package"
scoped "pre-commit's list of a change of the chain package" typecheck lint test build:app - gno
# Prose is prose anywhere, and nothing else is: beside a server change, the run stays the server's.
for prose in adr/0001.txt docs/x.ts server/src/x.md; do
	outside "server/src/a.ts
$prose" >/dev/null || fail "check.sh failed outside a repository on $prose"
	scoped "pre-commit's list of a server change and $prose" typecheck - build:app sh:test_hooks
done
# Prose alone, an empty list, an unknown path, a line git quoted or that reads otherwise (an empty
# line, a space, a backslash): everything, as in a repository.
for list in "" "docs/x.md" "adr/x.md
README.md" "deploy/a.conf" "server/src/a.ts
package.json" "server/src/a.ts

deploy/a.conf" '"deploy/a\nb"
server/src/a.ts' " deploy/a.conf
server/src/a.ts" 'server/src/a.ts\
deploy/a.conf' 'docs-x/a.ts
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
# A config, the lockfile, the harness, a schema both sides read, a package file, or a path of no
# known area: everything.
for f in package.json pnpm-lock.yaml vitest.config.ts lint/a.ts scripts/check_css.py packages/schemas/src/a.ts deploy/a.conf .gitignore \
	server/roles.json server/package.json app/package.json; do
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
# A rename keeps where it came from: a schema moved into the server runs everything.
git -C "$g" mv packages/schemas/src/a.ts server/src/moved.ts
gate >/dev/null || fail "check.sh failed on a schema moved into the server"
everything "a schema moved into the server"
reset
# A deletion counts: a schema deleted beside a server change runs everything.
git -C "$g" rm -q packages/schemas/src/a.ts && printf 'y\n' >>"$g/server/src/a.ts"
gate >/dev/null || fail "check.sh failed on a deleted schema"
everything "a deleted schema beside a server change"
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
out=$(AUDIT_ANSWER=x PICTURES_OF=nothing STORIES_PORT=6007 STORIES_OUT=/elsewhere gate --full) || fail "check.sh --full failed on a copy whose every step passes: $out"
# The stories' walk is every story's, whatever PICTURES_OF the environment carries, and the tokens comparison is the fast
# gate's alone (F1190).
# Its file server takes a free port of its own run, as the tokens' pictures do, never the caller's 6007 nor the config's: two
# worktrees' gates at once both took 6007, and one failed (slice-5c's and slice-5d's merge checks, 2026-10-29).
grep -q '^stories port=[^ ]* of= on=[0-9][0-9]* out= test -c app/playwright.stories.config.ts' "$log" && ! grep -q '^stories .* on=6007 ' "$log" ||
	fail "check.sh --full let its environment narrow or redirect the stories' walk, or gave it no port of its own: $(grep '^stories' "$log")"
ran pictures && fail "check.sh --full compared the tokens story's pictures beside its whole walk"
for s in $full_steps py:probe py:bench core_chromium stories coverage py:patch_coverage py:prove_fix mutate py:check_regressions py:check_migrations sh:scan_secrets py:audit; do
	[ "$s" = test ] || ran "$s" || fail "check.sh --full skipped $s"
done
ran test && fail "check.sh --full ran the tests twice, with and without coverage"
# Core's tests run again in Chromium, whose engine reads some regexes and Unicode otherwise than Node's (F816): their
# project, which vitest.config.ts opens only when CORE_CHROMIUM is set.
grep -qx "core_chromium switch=1 run --project core_chromium" "$log" ||
	fail "check.sh --full did not run core's tests in Chromium, with their switch and project: $(grep '^core_chromium' "$log")"
ran test:compiled || fail "check.sh --full ran no render-count test: the coverage's Vitest leaves the compiled project out (F1350)"
# The coverage lane's tools take half the machine each, the harness lane beside them the rest: none starves the
# timing-bound tests of the other (F777).
half=$(($(node -p "require('os').availableParallelism()") / 2))
[ "$half" -ge 1 ] || half=1
grep -qx "coverage --maxWorkers=$half" "$log" || fail "check.sh --full let Vitest's coverage take the whole machine (F777): $(grep '^coverage' "$log")"
# StrykerJS's incremental file is one cache every tree shares, in the tools' cache: a worktree's own, copied from the main
# tree's (63 of 142 files, a week old), made each branch mutate again what others had judged (Alexis, 2026-10-29). Each run
# works on its own copy, taken only if the cache reads as JSON, and puts it back whole only if it reads as JSON in turn: a
# run cut short, or two at once, never leaves the cache half written for every tree to fail on.
grep -qE "^mutate --concurrency $half --incrementalFile /[^ ]*/stryker-incremental\.json$" "$log" && ! grep -q "incrementalFile $g.home" "$log" ||
	fail "check.sh --full let StrykerJS take the whole machine (F777), or work on the shared cache itself: $(grep '^mutate' "$log")"
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
for s in py:prove_fix py:patch_coverage py:check_regressions py:check_migrations; do
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
for s in core_chromium stories coverage py:patch_coverage py:prove_fix mutate py:check_regressions py:check_migrations sh:scan_secrets py:audit; do
	before "done py:probe" "$s" || fail "check.sh --full ran $s while probe.py was planting its faults"
done
# The stories' journeys run beside the history lane alone, before the coverage's Vitest and StrykerJS and
# the harness's worktrees, whose load outlasted a Dialog's teardown in the browser (F815).
(SLOW_STEP=stories gate --full) >/dev/null || fail "check.sh --full failed with slow stories"
for s in coverage py:patch_coverage mutate; do
	before "done stories" "$s" || fail "check.sh --full ran $s beside the stories' journeys (F815)"
done
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
# A failure in the first phase stops the gate there, saying which lanes did not run: the coverage and the harness
# lanes never start; the first phase's other lane runs to its end (Alexis, 2026-10-26, C.5).
for s in core_chromium stories py:prove_fix; do
	out=$(FAIL=$s gate --full) && fail "check.sh --full passed with $s failing"
	ran mutate && fail "check.sh --full started StrykerJS after $s's failure"
	ran py:harness_mutate && fail "check.sh --full started harness_mutate after $s's failure"
	printf '%s\n' "$out" | grep -q "^check.sh: the coverage and harness lanes did not run" ||
		fail "check.sh --full did not say which lanes did not run after $s's failure: $out"
done
# The probe and the benches run alone before any lane: either one failing fails the gate, shows, and stops it there (G2).
for s in py:probe py:bench; do
	out=$(FAIL=$s gate --full) && fail "check.sh --full passed with $s failing"
	printf '%s\n' "$out" | grep -q "^$s failed here" || fail "check.sh --full hid $s's failure: $out"
	ran stories && fail "check.sh --full went on to the stories after $s's failure"
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
for s in $full_steps py:probe py:bench core_chromium stories coverage py:patch_coverage py:prove_fix mutate py:check_regressions py:check_migrations sh:scan_secrets py:audit; do
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
for s in $full_steps py:probe py:bench py:batch_size py:check_regressions py:check_migrations sh:scan_secrets py:audit; do
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
ran_browser() { grep -q "^\(playwright\|stories\|pictures\)\( \|$\)" "$log"; }
for f in app/src/a.tsx packages/ui/src/a.ts app/tests/a.spec.ts server/src/a.ts app/src/a.json; do
	printf 'y\n' >>"$g/$f"
	out=$(gate) || fail "check.sh failed on a change of $f: $out"
	ran playwright && fail "check.sh walked the journeys in a commit's gate on a change of $f"
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
ran playwright && fail "check.sh walked the journeys on a run of everything at a commit"
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
	cp "$here/code_changed.sh" "$here/borrow_node_modules.sh" "$here/check_docs.py" "$here/hidden.py" "$here/repo_files.py" "$1/scripts/" && secrets_into "$1/scripts/"
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
sh_ "grep -rn gnokey docs" 0
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
# A recursive delete takes no path from a variable that may be empty (wt-3e's folder, emptied by a find -delete
# whose variable was unset): ${name:?} stops the shell first. BSD's and GNU's options before find's paths, a
# wrapper, or a :? in a comment or another command change nothing.
for cmd in 'find $dir -delete' 'find "$dir" -type f -delete' 'find -L "${dir}/x" -delete' 'find "$dir" -exec rm -f {} +' \
	'rm -r "$dir"' 'rm -fr $dir/*' 'rm -R -- "$1"' 'rm --recursive "$(git rev-parse --show-toplevel)/x"' \
	'find "${dir:-.}" -delete' "sh -c 'rm -r \"\$d\"'" 'rm -r $(pwd)/x' 'cd x && /usr/bin/find "$TMPDIR/x" -delete' \
	'find -x "$d" -delete' 'find -E "$d" -delete' 'find -d "$d" -delete' 'find -s "$d" -delete' 'find -Ex "$d" -delete' \
	'find -f "$d" -delete' 'find -D tree "$d" -delete' 'find -O3 "$d" -delete' 'find -- "$d" -delete' \
	'rm -rf `pwd`/x' 'find "$d" -execdir rm -rf {} \;' 'find "$d" -ok rm {} \;' 'find "$d" -exec /bin/rm {} +' \
	'rm -r "$d" # ${d:?}' ': "${d:?}"; rm -r "$d"' 'sudo rm -r "$d"' 'timeout 5 rm -r "$d"' 'VAR=1 rm -r "$d"'; do
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
python3 -I -c 'import json; print(json.dumps({"tool_name":"Bash","tool_input":{"command":"git status"}}))' | python3 -I "$gd" | grep -q . && fail "guard printed a decision for git status"
# worktree.sh leaves the sandbox (settings.json's excludedCommands, `sh scripts/worktree.sh *`), so it runs alone, its words plain,
# from the project's root: from a subfolder those words run a script there, which the session can write, and behind a cd, an
# assignment, a redirect or another command they would run something else outside the sandbox, whatever Claude Code's matcher
# makes of them (F5058). No folder is no root.
root=$(cd "$here/.." && pwd -P)
at_() { # $1: the folder, $2: a shell command, $3: the exit code expected
	guarded "$(python3 -I -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]},"cwd":sys.argv[2]}))' "$2" "$1")" "$3" "Bash in $1: $2"
}
at_ "$root" "sh scripts/worktree.sh slice-11h slice-11h slice-11-realm" 0
at_ "$root" "sh scripts/worktree.sh remove slice-11h" 0
at_ "$root" "sh scripts/worktree.sh /srv/a/Server/gnoworld-wt/slice-11h slice-11h 77694b3d" 0
at_ "$root/docs/.." "sh scripts/worktree.sh remove x_1.b" 0
at_ "$root/docs" "grep -n root scripts/worktree.sh" 0
at_ "$root/docs" "sh scripts/check.sh" 0
for cmd in "sh scripts/worktree.sh x y z" "bash scripts/worktree.sh remove x" "./scripts/worktree.sh x y z" "sh -x scripts/worktree.sh x y z" \
	"env A=1 sh scripts/worktree.sh x y z" "sh -c 'sh scripts/worktree.sh x y z'"; do
	at_ "$root/docs" "$cmd" 2
done
for cmd in "cd docs && sh scripts/worktree.sh x y z" "pushd docs; sh scripts/worktree.sh x y z" "(cd docs; sh scripts/worktree.sh x y z)" \
	"sh scripts/worktree.sh x y z; cat /etc/hosts" "sh scripts/worktree.sh x y z > out" "sh scripts/worktree.sh x y z 2>&1" \
	"sh scripts/worktree.sh x y z | tee out" 'sh scripts/worktree.sh "$(cat f)" y z' "sh scripts/worktree.sh x y z &" \
	"PATH=/tmp/e:\$PATH sh scripts/worktree.sh x y z" "HOME=/tmp/e sh scripts/worktree.sh x y z" "sh -c 'cd docs && sh scripts/worktree.sh x y z'" \
	"bash scripts/worktree.sh x y z" "./scripts/worktree.sh x y z" "sh scripts/worktree.sh 'a b' y z" "sh scripts/worktree.sh ~/x y z" "sh scripts/worktree.sh x y z
sh scripts/worktree.sh u v w; true"; do
	at_ "$root" "$cmd" 2
done
sh_ "sh scripts/worktree.sh x y z" 2
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
# nginx -t and the served build: in the merge check, after the build; never in the fast gate.
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
# The defaults, with no switch: a ceiling of 600 s said, and a step of 10 s (one read in the first seconds). It is stopped once seen.
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
grep -qF "up to 600 s" "$bl/dflt.out" || fail "bench.py's default ceiling is not 600 s (F2620): $(cat "$bl/dflt.out")"
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
cp "$here/check_regressions.py" "$here/repo_files.py" "$here/hidden.py" "$here/borrow_node_modules.sh" "$rx/scripts/"
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
cp "$here/check_regressions.py" "$here/repo_files.py" "$here/hidden.py" "$here/borrow_node_modules.sh" "$rg/scripts/"
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
# A gap whose key holds ` - ` (a flip of `a - b`) is named by its line all the same (F5000): every cut before a ` - ` that a
# reason follows is read as an item, not the first alone.
git -C "$rg" reset -q --hard "$base" && printf 'GAPS = {\n    "r/x.gno: d := a - b [- -> +]": "equivalent",\n}\n' >"$rg/scripts/mutate.py"
git -C "$rg" add scripts/mutate.py && git -C "$rg" commit -qm "a gap on a - b"
out=$(reg) && fail "check_regressions passed a gap no commit names: $out"
git -C "$rg" commit -q --allow-empty -m "says why" -m "Lowered-floor: gap scripts/mutate.py r/x.gno: d := a - b [- -> +] - d is never read"
out=$(reg) || fail "check_regressions refused a gap holding ' - ' that a commit names (F5000): $out"
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
cp "$here/check_regressions.py" "$here/repo_files.py" "$here/hidden.py" "$here/borrow_node_modules.sh" "$rq/scripts/"
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
# new tree, Vite's caches its own.
ws="$t/ws"
mkdir -p "$ws/src/node_modules/pkg" "$ws/src/node_modules/.vite/deps" "$ws/src/app/node_modules/@gnoworld" "$ws/src/packages/core" "$ws/src/reports"
git -C "$ws/src" init -q
printf 'node_modules/\nreports/\n' >"$ws/src/.gitignore" && echo x >"$ws/src/packages/core/a.ts"
for f in pnpm-lock.yaml package.json app/package.json packages/core/package.json; do echo "$f" >"$ws/src/$f"; done
git -C "$ws/src" add -A && git -C "$ws/src" commit -qm x
echo pkg >"$ws/src/node_modules/pkg/index.js" && echo stale >"$ws/src/node_modules/.vite/deps/x"
ln -s ../../../packages/core "$ws/src/app/node_modules/@gnoworld/core"
# It runs outside the sandbox, so it makes and removes the folders of one root alone, $HOME/Server/gnoworld-wt, where no session
# writes but its own folder (Alexis, 2026-11-04). With this user's own home it refuses a folder anywhere else, naming that root,
# and makes nothing; the other cases give it a home of this run's ($home). The base is no commit, so a fence switched off (a
# harness mutant) stops there, never making a tree in the real root, and still fails on the message.
out=$(cd "$ws/src" && sh "$here/worktree.sh" "$ws/th-out-$$" outbranch nosuchbase 2>&1) && fail "worktree.sh made a tree outside \$HOME/Server/gnoworld-wt: $out"
printf '%s\n' "$out" | grep -qF "is not $HOME/Server/gnoworld-wt/<name>" || fail "worktree.sh did not name the root it requires: $out"
[ ! -e "$ws/th-out-$$" ] && ! git -C "$ws/src" rev-parse -q --verify outbranch >/dev/null || fail "worktree.sh made a folder or a branch outside its root"
wsr=$(cd "$ws" && pwd -P)
home="$wsr/home" wr="$wsr/home/Server/gnoworld-wt"
mkdir -p "$wr" "$ws/.githooks" && cp "$hooks/records.sh" "$ws/.githooks/"
wt() { (cd "$ws/src" && HOME="$home" sh "$here/worktree.sh" "$@"); }
wt "$wr/new" feature HEAD >"$ws/out" 2>&1 || fail "worktree.sh failed: $(cat "$ws/out")"
[ "$(git -C "$wr/new" rev-parse --abbrev-ref HEAD)" = feature ] || fail "worktree.sh made no branch feature"
[ -d "$wr/new/node_modules" ] && [ ! -L "$wr/new/node_modules" ] || fail "worktree.sh linked node_modules whole, which borrow_node_modules.sh cannot see into"
[ -L "$wr/new/node_modules/pkg" ] && [ "$(cat "$wr/new/node_modules/pkg/index.js")" = pkg ] || fail "worktree.sh did not link the packages"
[ -d "$wr/new/node_modules/.vite" ] && [ ! -L "$wr/new/node_modules/.vite" ] && [ -z "$(ls -A "$wr/new/node_modules/.vite")" ] || fail "worktree.sh shared Vite's cache, which each tree writes"
[ -d "$wr/new/node_modules/.vite-temp" ] || fail "worktree.sh gave Vite no temp folder of its own"
[ "$(cd "$wr/new/app/node_modules/@gnoworld/core" && pwd -P)" = "$(cd "$wr/new/packages/core" && pwd -P)" ] || fail "worktree.sh's @gnoworld/core leads out of the new tree"
[ -z "$(git -C "$wr/new" status --porcelain)" ] || fail "worktree.sh left the new tree dirty: $(git -C "$wr/new" status --porcelain)"
out=$(cd "$ws/src" && sh "$here/worktree.sh" remove "$wr/new" 2>&1) && fail "worktree.sh removed a tree outside \$HOME/Server/gnoworld-wt: $out"
[ -d "$wr/new" ] && git -C "$ws/src" worktree list --porcelain | grep -qxF "worktree $wr/new" || fail "worktree.sh's refused remove of a tree outside its root touched it"
wt "$wr/new" other HEAD >/dev/null 2>&1 && fail "worktree.sh wrote over a folder that exists"
mkdir "$wr/empty" && wt "$wr/empty" another HEAD >/dev/null 2>&1 && fail "worktree.sh took an empty folder that exists, which git would fill"
wt "$wr/x" >/dev/null 2>&1 && fail "worktree.sh ran with no branch named"
[ ! -e "$wr/x" ] || fail "worktree.sh made a folder for a call it refused"
for args in "$wr/two twobranch" "remove"; do
	code=0 && out=$(wt $args 2>&1) || code=$?
	[ "$code" = 2 ] && printf '%s\n' "$out" | grep -qF "usage:" || fail "worktree.sh took $args for a call ($code): $out"
done
# Whatever its spelling, a folder that does not resolve to <root>/<name>, <name> in a-z, 0-9 and -, is refused before anything is
# made: another absolute path, another home's root, a .. out of the root or a lone .., a link out of it on the way, a folder in a
# worktree, a name with a capital, a dot, an underscore, a space, or an accented letter, which sh's [a-z] takes in a UTF-8 locale
# (bash 3.2, macOS's sh: U and e-acute; dash, Linux's, reads bytes). The locale is set here, whatever the caller's.
mkdir -p "$ws/elsewhere" "$wsr/home2/Server/gnoworld-wt" && ln -s "$ws/elsewhere" "$wr/away"
n=0
for d in "$ws/elsewhere/a" "$wsr/home2/Server/gnoworld-wt/other" "$wr/../outside" "$wr/.." "$wr/away/b" "$wr/new/inner" "$wr/nosuch/x" "$ws/nosuch/x" \
	"$wr/Upper" "$wr/a.b" "$wr/a_b" "$wr/a b" "$wr/caf$(printf '\303\251')"; do
	n=$((n + 1))
	out=$(LC_ALL=en_US.UTF-8 && export LC_ALL && wt "$d" "fence$n" HEAD 2>&1) && fail "worktree.sh made a tree at $d, which is not <root>/<name>: $out"
	printf '%s\n' "$out" | grep -qF "is not $wr/<name>" || fail "worktree.sh refused $d for another reason than its root: $out"
	! git -C "$ws/src" rev-parse -q --verify "fence$n" >/dev/null || fail "worktree.sh made the branch of $d, which is not <root>/<name>"
done
[ -z "$(ls -A "$ws/elsewhere")" ] && [ -z "$(ls -A "$wsr/home2/Server/gnoworld-wt")" ] && [ ! -e "$wsr/home/Server/outside" ] && [ ! -e "$wr/new/inner" ] ||
	fail "worktree.sh made a folder out of its root"
[ "$(ls -A "$wr" | tr '\n' ' ')" = "away empty new " ] || fail "worktree.sh made a folder for a name it refuses: $(ls -A "$wr")"
# The root is compared as written, never resolved: through a home that is a link, a folder is refused.
ln -s "$home" "$ws/homelink"
out=$(cd "$ws/src" && HOME="$ws/homelink" sh "$here/worktree.sh" "$ws/homelink/Server/gnoworld-wt/via" via HEAD 2>&1) && fail "worktree.sh took a root that is a link: $out"
[ ! -e "$wr/via" ] || fail "worktree.sh made a folder through a root that is a link"
# A link named as the folder is refused, what it leads to untouched: git (2.50) makes the branch, then fails on it. So is it
# with a trailing slash, which leads through the link.
ln -s "$ws/nothere" "$wr/dangling"
for d in "$wr/dangling" "$wr/dangling/"; do
	out=$(wt "$d" dangling HEAD 2>&1) && fail "worktree.sh made a tree at a link ($d): $out"
	printf '%s\n' "$out" | grep -qF "is a link" || fail "worktree.sh did not say its folder is a link ($d): $out"
	! git -C "$ws/src" rev-parse -q --verify dangling >/dev/null && [ ! -e "$ws/nothere" ] || fail "worktree.sh made the branch or the folder of a link named as its folder ($d)"
done
# The root is this user's home's: with no home, nothing is made.
out=$(cd "$ws/src" && env -u HOME sh "$here/worktree.sh" "$wr/nohome" nohome HEAD 2>&1) && fail "worktree.sh made a tree with no home: $out"
[ ! -e "$wr/nohome" ] && ! git -C "$ws/src" rev-parse -q --verify nohome >/dev/null || fail "worktree.sh made a folder or a branch with no home"
# A relative path, or one whose .. stays in the root, is the folder it resolves to.
wt "../home/Server/gnoworld-wt/rel" rel HEAD >"$ws/out" 2>&1 || fail "worktree.sh refused a relative folder in its root: $(cat "$ws/out")"
git -C "$ws/src" worktree list --porcelain | grep -qxF "worktree $wr/rel" || fail "worktree.sh did not make the folder a relative path resolves to"
# remove <dir>: a clean worktree of this repository under the root, from another tree; its files deleted, ignored ones included,
# never what a link in it leads to; its branch kept; and no other tree's record touched, not even one whose folder is gone, which
# git worktree prune would take: a session can point another tree's record at nothing (reviewer, second review, item 4).
wt remove "$wr/../gnoworld-wt/rel" >"$ws/out" 2>&1 || fail "worktree.sh refused to remove a clean worktree: $(cat "$ws/out")"
[ ! -e "$wr/rel" ] || fail "worktree.sh left the folder it removed"
wt "$wr/stale" stale HEAD >/dev/null 2>&1 && rm -r "$wr/stale" || fail "the stale worktree of this case could not be made"
wt "$wr/clean" clean HEAD >/dev/null 2>&1 || fail "the clean worktree of this case could not be made"
mkdir -p "$ws/keep" "$wr/clean/reports" && echo kept >"$ws/keep/f" && ln -s "$ws/keep" "$wr/clean/reports/out" && echo r >"$wr/clean/reports/r"
wt remove "$wr/clean" >"$ws/out" 2>&1 || fail "worktree.sh refused to remove a clean worktree with ignored files: $(cat "$ws/out")"
listed=$(git -C "$ws/src" worktree list --porcelain)
[ ! -e "$wr/clean" ] && ! printf '%s\n' "$listed" | grep -qxF "worktree $wr/clean" || fail "worktree.sh left the tree it removed, or its record"
printf '%s\n' "$listed" | grep -qxF "worktree $wr/stale" || fail "worktree.sh's remove pruned the record of another tree"
[ "$(cat "$ws/keep/f")" = kept ] && [ "$(cat "$ws/src/node_modules/pkg/index.js")" = pkg ] || fail "worktree.sh's remove deleted what a link in the tree leads to"
git -C "$ws/src" rev-parse -q --verify clean >/dev/null || fail "worktree.sh's remove deleted the branch"
# A change, a staged file or a file git does not track refuses it, the tree and its record kept.
wt "$wr/unclean" unclean HEAD >/dev/null 2>&1 || fail "the unclean worktree of this case could not be made"
for change in "echo m >>packages/core/a.ts" "echo s >staged.txt && git add staged.txt" "echo u >untracked.txt"; do
	(cd "$wr/unclean" && eval "$change")
	out=$(wt remove "$wr/unclean" 2>&1) && fail "worktree.sh removed a tree with a change ($change): $out"
	[ -d "$wr/unclean" ] && git -C "$ws/src" worktree list --porcelain | grep -qxF "worktree $wr/unclean" || fail "worktree.sh's refused remove touched the tree ($change)"
	git -C "$wr/unclean" reset -q --hard && git -C "$wr/unclean" clean -qfd
done
# Its clean check enters no nested repository: git's own ran git status in one its index staged at that moment, which the tree's
# session can flip between git's two reads, so that its fsmonitor ran outside the sandbox (security-reviewer, third review). Here
# the nested repository's own clean filter, which git status runs to read a file changed at its size, and no setting of the script
# turns off.
wt "$wr/subm" subm HEAD >/dev/null 2>&1 || fail "the subm worktree of this case could not be made"
git init -q "$wr/subm/x" && echo x >"$wr/subm/x/x" && echo 'x filter=planted' >"$wr/subm/x/.gitattributes"
git -C "$wr/subm/x" add x .gitattributes && git -C "$wr/subm/x" commit -qm x
git -C "$wr/subm/x" config filter.planted.clean "sh -c 'touch \"$ws/pwned-subm\"; cat'" && echo y >"$wr/subm/x/x"
git -C "$wr/subm" add x 2>/dev/null
out=$(wt remove subm 2>&1) || :
[ ! -e "$ws/pwned-subm" ] || fail "worktree.sh's remove ran git in a nested repository of the tree: its clean filter ran: $out"
# The tree it runs in is refused, and kept: its removal would leave the run in no folder. Whatever the spelling of either: the
# folder through a .., the run entered through a link.
wt "$wr/inside" inside HEAD >/dev/null 2>&1 && ln -s "$wr/inside" "$ws/toinside" || fail "the inside worktree of this case could not be made"
for at in "$wr/inside/packages:$wr/inside" "$wr/inside:$wr/new/../inside" "$ws/toinside:$wr/inside"; do
	out=$(cd "${at%%:*}" && HOME="$home" sh "$here/worktree.sh" remove "${at#*:}" 2>&1) && fail "worktree.sh removed the tree it runs in ($at): $out"
	[ -d "$wr/inside" ] || fail "worktree.sh removed the tree it runs in ($at)"
done
# Refused and kept: a folder out of the root, one under it that is no worktree, another repository's worktree, a link to a
# worktree out of the root (git, 2.50, removes the tree a link leads to), and a name starting with -.
mkdir "$wr/plain" && echo p >"$wr/plain/p"
git init -q "$ws/other" && git -C "$ws/other" commit -q --allow-empty -m x && git -C "$ws/other" worktree add -q "$wr/foreign"
git -C "$ws/src" worktree add -q -b far "$ws/far" HEAD && ln -s "$ws/far" "$wr/tofar"
for d in "$ws/far" "$wr/plain" "$wr/foreign" "$wr/tofar" "$wr/tofar/" -x; do
	out=$(wt remove "$d" 2>&1) && fail "worktree.sh removed $d: $out"
done
for d in "$wr/tofar" "$wr/tofar/"; do
	printf '%s\n' "$(wt remove "$d" 2>&1)" | grep -qF "is a link" || fail "worktree.sh did not say the folder to remove is a link ($d)"
done
code=0 && out=$(wt remove -x 2>&1) || code=$?
[ "$code" = 2 ] && printf '%s\n' "$out" | grep -qF "starts with -" || fail "worktree.sh did not refuse, as a call, a folder to remove that starts with a dash ($code): $out"
[ -f "$wr/plain/p" ] && [ -d "$wr/foreign" ] && [ -d "$ws/far" ] && git -C "$ws/src" worktree list --porcelain | grep -qxF "worktree $wsr/far" ||
	fail "worktree.sh's refused remove touched a tree"
# Three words starting with remove are no call: remove names no tree, as a bare name would make it one.
code=0 && out=$(wt remove "$wr/rm3" HEAD 2>&1) || code=$?
[ "$code" = 2 ] && printf '%s\n' "$out" | grep -qF "usage:" && [ ! -e "$wr/remove" ] || fail "worktree.sh took remove and two words for a call ($code): $out"
# A worktree's commondir, which Claude Code protects only for the trees that stood when the session started, leads git at no
# other config when worktree.sh runs it outside the sandbox: there an fsmonitor of that config would run (reviewer, F5097).
wt "$wr/redirected" redirected HEAD >/dev/null 2>&1 || fail "the redirected worktree of this case could not be made"
admin=$(sed 's/^gitdir: //' "$wr/redirected/.git")
cp -R "$ws/src/.git" "$ws/evilgit" && printf '#!/bin/sh\ntouch "%s"\nexit 1\n' "$ws/pwned" >"$ws/fsmonitor" && chmod +x "$ws/fsmonitor"
git --git-dir="$ws/evilgit" config core.fsmonitor "$ws/fsmonitor" && echo "$ws/evilgit" >"$admin/commondir"
wt remove "$wr/redirected" >"$ws/out" 2>&1 || :
[ ! -e "$ws/pwned" ] || fail "worktree.sh ran git with the config a worktree's commondir led to: its fsmonitor ran (F5097): $(cat "$ws/out")"
[ ! -d "$admin" ] || echo ../.. >"$admin/commondir"
# Run from a worktree, as a part is cut from the chief's, it makes and removes trees of this repository; and when that worktree's
# own commondir leads elsewhere, it still reads this repository's config: the common folder comes from the tree's .git, which the
# settings deny every session, never from the commondir git would read (F5097). So from a worktree made with relative paths.
git -C "$ws/src" worktree add -q -b fromwt "$ws/fromwt" HEAD && mkdir "$ws/fromwt/node_modules"
git -C "$ws/src" worktree add -q -b fromrel "$ws/fromrel" HEAD && mkdir "$ws/fromrel/node_modules" && echo "gitdir: ../src/.git/worktrees/fromrel" >"$ws/fromrel/.git"
admin=$(sed 's/^gitdir: //' "$ws/fromwt/.git")
cp -R "$ws/src/.git" "$ws/evilgit2" && git --git-dir="$ws/evilgit2" config core.fsmonitor "$ws/fsmonitor" && echo "$ws/evilgit2" >"$admin/commondir"
out=$(cd "$ws/fromwt" && HOME="$home" sh "$here/worktree.sh" fromwt fromwt2 HEAD 2>&1) || fail "worktree.sh could not make a tree from a worktree: $out"
[ ! -e "$ws/pwned" ] || fail "worktree.sh, run from a worktree, took its config from the commondir: its fsmonitor ran (F5097): $out"
git -C "$ws/src" worktree list --porcelain | grep -qxF "worktree $wr/fromwt" || fail "worktree.sh, run from a worktree, made no tree of this repository"
out=$(cd "$ws/fromwt" && HOME="$home" sh "$here/worktree.sh" remove fromwt 2>&1) && [ ! -e "$wr/fromwt" ] || fail "worktree.sh could not remove a tree from a worktree: $out"
echo ../.. >"$admin/commondir"
out=$(cd "$ws/fromrel" && HOME="$home" sh "$here/worktree.sh" fromrel fromrel2 HEAD 2>&1) && [ -d "$wr/fromrel" ] || fail "worktree.sh could not make a tree from a worktree of relative paths: $out"
# So from the main checkout, whose .git folder holds no commondir unless one was planted there.
echo "$ws/evilgit2" >"$ws/src/.git/commondir"
out=$(wt "$wr/frommain" frommain HEAD 2>&1) || :
rm "$ws/src/.git/commondir"
[ ! -e "$ws/pwned" ] || fail "worktree.sh, run from the main checkout, took its config from a commondir planted there: its fsmonitor ran (F5097): $out"
[ -d "$wr/frommain" ] || fail "worktree.sh, run from the main checkout beside a planted commondir, made no tree: $out"
# Nor does it run a hook or an fsmonitor of this repository's common folder, which the file tools can still write (F5095): a
# post-checkout hook ran when the tree was made, an fsmonitor when the base was compared (security-reviewer, third review).
printf '#!/bin/sh\ntouch "%s"\n' "$ws/hookran" >"$ws/src/.git/hooks/post-checkout" && chmod +x "$ws/src/.git/hooks/post-checkout"
git -C "$ws/src" config core.fsmonitor "$ws/fsmonitor"
out=$(wt hooked hooked HEAD 2>&1) || :
rm "$ws/src/.git/hooks/post-checkout" && git -C "$ws/src" config --unset core.fsmonitor
[ ! -e "$ws/hookran" ] && [ ! -e "$ws/pwned" ] || fail "worktree.sh ran a hook or an fsmonitor of the common folder: $out"
[ -d "$wr/hooked" ] || fail "worktree.sh made no tree beside a planted hook and fsmonitor: $out"
# A nested repository staged in this tree, under a harness path the base check reads, is never entered when worktree.sh compares
# a base outside the sandbox: git would run its fsmonitor there (security-reviewer, F5097).
git init -q "$ws/src/.claude/nested" && echo n >"$ws/src/.claude/nested/n" && git -C "$ws/src/.claude/nested" add n
git -C "$ws/src/.claude/nested" commit -qm n && git -C "$ws/src/.claude/nested" config core.fsmonitor "$ws/fsmonitor"
git -C "$ws/src" add .claude/nested 2>/dev/null
out=$(wt "$wr/nested" nested HEAD 2>&1) || :
[ ! -e "$ws/pwned" ] || fail "worktree.sh ran git in a nested repository of this tree: its fsmonitor ran (F5097): $out"
[ -d "$wr/nested" ] || fail "worktree.sh made no tree beside a nested repository it need not enter: $out"
git -C "$ws/src" rm -q -f --cached .claude/nested && rm -r "$ws/src/.claude/nested"
# A bare name is a folder of the root: no caller writes its user's number.
wt bare bare HEAD >"$ws/out" 2>&1 && [ -d "$wr/bare" ] || fail "worktree.sh made no tree of a bare name in its root: $(cat "$ws/out")"
wt remove bare >"$ws/out" 2>&1 && [ ! -e "$wr/bare" ] || fail "worktree.sh removed no tree of a bare name: $(cat "$ws/out")"
# A folder name holding a newline is a name like another as node_modules are borrowed, outside the sandbox: read line by line it
# split, and a folder `a<newline>..` led a copy into another tree's scripts/ (security-reviewer, F5099), under the top or under a
# folder the borrowing leaves out only at the top (app/.claude, the reviewer's second review). The tree is made, nothing outside.
n=0
for at in . app/.claude app/.git app/.stryker-tmp; do
	n=$((n + 1))
	mkdir -p "$ws/src/$at/a
../b/scripts/planted/node_modules" "$ws/src/$at/a" "$wr/b"
	out=$(wt "nl-$n" "nl-$n" HEAD 2>&1) || fail "worktree.sh refused a tree holding a name with a newline under $at: $out"
	[ ! -e "$wr/b/scripts" ] || fail "worktree.sh made a folder through a name with a newline under $at: $out"
	rm -r "$ws/src/$at/a
.." "$ws/src/$at/a"
done
# Outside the sandbox, the borrowing follows no link it did not make: a link the base checks out on the way to a node_modules it
# copies (reviewer, second review, item 1b; security-reviewer, A), a node_modules the base tracks as a link (item 1c), or a
# workspace's .bin leading elsewhere than a node_modules/.bin, whose files it would copy where the session reads them (item 1a).
# Each is refused, its tree undone, what the link leads to untouched.
mkdir -p "$ws/outside" "$ws/outside2" "$ws/secret" && echo key >"$ws/secret/id"
installed=$(git -C "$ws/src" rev-parse HEAD)
ln -s "$ws/outside" "$ws/src/lnk" && git -C "$ws/src" add lnk && git -C "$ws/src" commit -qm "a link" && linked=$(git -C "$ws/src" rev-parse HEAD)
git -C "$ws/src" reset -q --hard "$installed" && mkdir -p "$ws/src/lnk/node_modules/x"
out=$(wt "$wr/lnkb" lnkb "$linked" 2>&1) && fail "worktree.sh borrowed through a link its base checks out: $out"
[ -z "$(ls -A "$ws/outside")" ] && [ ! -e "$wr/lnkb" ] || fail "worktree.sh wrote through a link its base checks out: $(ls -A "$ws/outside")"
rm -r "$ws/src/lnk"
nm=$(printf '%s' "$ws/outside2" | git -C "$ws/src" hash-object -w --stdin)
git -C "$ws/src" update-index --add --cacheinfo "120000,$nm,node_modules" && git -C "$ws/src" commit -qm "node_modules a link" && nmbase=$(git -C "$ws/src" rev-parse HEAD)
git -C "$ws/src" reset -q "$installed"
out=$(wt "$wr/nmlink" nmlink "$nmbase" 2>&1) && fail "worktree.sh borrowed into a node_modules its base tracks as a link: $out"
[ -z "$(ls -A "$ws/outside2")" ] && [ ! -e "$wr/nmlink" ] || fail "worktree.sh wrote through a node_modules its base tracks as a link: $(ls -A "$ws/outside2")"
mkdir -p "$ws/src/packages/core/node_modules" && ln -s "$ws/secret" "$ws/src/packages/core/node_modules/.bin"
out=$(wt "$wr/exf" exf HEAD 2>&1) && fail "worktree.sh copied a .bin that leads elsewhere than a node_modules/.bin: $out"
[ ! -e "$wr/exf" ] || fail "worktree.sh left the tree of a .bin that leads elsewhere"
rm "$ws/src/packages/core/node_modules/.bin"
# The packages are the source tree's, linked: a base whose lockfile or package files are not this tree's would run the gate on
# packages its own lockfile does not name, and a `pnpm install` there would write into this tree's install (security-S5).
# Its harness (records.sh's list) is this tree's too: worktree.sh may run outside the sandbox, so a base a session wrote by
# plumbing would check its own settings and hooks out into a tree a session is later started in (F5098).
# It is refused, whichever such file differs, and makes nothing: no folder, no branch. A base git cannot read refuses too.
mkdir -p "$ws/src/.claude" "$ws/src/scripts"
for f in pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs .pnpmfile.mjs .npmrc package.json app/package.json packages/core/package.json .claude/settings.json scripts/guard.py CLAUDE.md; do
	echo changed >>"$ws/src/$f" && git -C "$ws/src" add -A && git -C "$ws/src" commit -qm "$f moves"
	out=$(wt "$wr/old" "old-${f##*/}" "$installed" 2>&1) && fail "worktree.sh made a tree of a base whose $f is not this tree's: $out"
	printf '%s\n' "$out" | grep -qF "$f" || fail "worktree.sh did not name the package file $f that differs: $out"
	[ ! -e "$wr/old" ] && ! git -C "$ws/src" rev-parse -q --verify "old-${f##*/}" >/dev/null || fail "worktree.sh made a folder or a branch for a base whose $f differs"
	git -C "$ws/src" reset -q --hard "$installed"
done
echo changed >>"$ws/src/app/package.json"
out=$(wt "$wr/dirty" dirty HEAD 2>&1) && fail "worktree.sh made a tree beside a package file of this one changed and not committed: $out"
git -C "$ws/src" checkout -q -- app/package.json
out=$(wt "$wr/gone" gone nosuchbase 2>&1) && fail "worktree.sh made a tree of a base git cannot read: $out"
[ ! -e "$wr/gone" ] || fail "worktree.sh made a folder for a base git cannot read"
# An argument that starts with - is an option for git, never a name: a base `--output=<file>` made git diff truncate a file
# outside the scratch copy (CR6); a branch or a folder so named is as wrong. Each is refused, and makes nothing.
echo victim >"$ws/victim"
for args in "$wr/opt1 optbranch --output=$ws/victim" "$wr/opt2 --optbranch HEAD" "-optdir optbranch2 HEAD"; do
	set -- $args
	out=$(wt "$@" 2>&1) && fail "worktree.sh took an argument that starts with a dash: $args: $out"
	printf '%s\n' "$out" | grep -qF "starts with -" || fail "worktree.sh did not say which argument starts with a dash: $args: $out"
done
[ "$(cat "$ws/victim")" = victim ] || fail "worktree.sh let a base of git's options write a file: $(cat "$ws/victim")"
[ ! -e "$wr/opt1" ] && [ ! -e "$wr/opt2" ] && [ ! -e "$ws/src/-optdir" ] || fail "worktree.sh made a folder for an argument that starts with a dash"
for b in optbranch --optbranch optbranch2; do ! git -C "$ws/src" rev-parse -q --verify "refs/heads/$b" >/dev/null || fail "worktree.sh made the branch $b for a refused call"; done
# A base that is no commit (a blob, a tree) is refused before anything is made; so is a root node_modules that is one link,
# which the script could not take apart once the tree stood (CR6).
out=$(wt "$wr/blob" blobbranch HEAD:package.json 2>&1) && fail "worktree.sh made a tree of a base that is a blob: $out"
printf '%s\n' "$out" | grep -qF "is no commit" || fail "worktree.sh did not say a base is no commit: $out"
[ ! -e "$wr/blob" ] && ! git -C "$ws/src" rev-parse -q --verify blobbranch >/dev/null || fail "worktree.sh made a folder or a branch for a base that is no commit"
mv "$ws/src/node_modules" "$ws/src/real_modules" && ln -s real_modules "$ws/src/node_modules"
out=$(wt "$wr/linked" linkedbranch HEAD 2>&1) && fail "worktree.sh made a tree of a root node_modules that is one link: $out"
printf '%s\n' "$out" | grep -qF "node_modules is a link" || fail "worktree.sh did not say the root node_modules is a link: $out"
[ ! -e "$wr/linked" ] && ! git -C "$ws/src" rev-parse -q --verify linkedbranch >/dev/null || fail "worktree.sh made a folder or a branch beside a node_modules that is one link"
rm "$ws/src/node_modules" && mv "$ws/src/real_modules" "$ws/src/node_modules"
# A step that fails once the tree stands undoes the tree and the branch: the next run names the same folder (CR6).
mkdir "$ws/scripts" && cp "$here/worktree.sh" "$ws/scripts/" && printf '#!/bin/sh\ntouch "%s"\nexit 1\n' "$ws/ran-half" >"$ws/scripts/borrow_node_modules.sh"
out=$(cd "$ws/src" && HOME="$home" sh "$ws/scripts/worktree.sh" "$wr/half" halfbranch HEAD 2>&1) && fail "worktree.sh went on after a step failed: $out"
[ -e "$ws/ran-half" ] || fail "the half-made case never reached the step that fails: $out"
[ ! -e "$wr/half" ] || fail "worktree.sh left the folder of a tree that failed half-made"
! git -C "$ws/src" rev-parse -q --verify halfbranch >/dev/null || fail "worktree.sh left the branch of a tree that failed half-made"
git -C "$ws/src" worktree list | grep -qF "$wr/half" && fail "worktree.sh left $wr/half registered"
# So does a signal that stops it once the tree stands (R6): the borrow step, here, sends its parent each in turn. In bash (macOS's sh)
# the EXIT trap runs even when a signal kills the shell, in dash (Linux's sh) only the trap on the signals makes it run: both are tried.
# SIGINT is ignored by a script started in the background, as this suite's sections are: python resets it to its default first.
for shell in sh dash; do
	command -v "$shell" >/dev/null || continue
	for sig in HUP INT TERM; do
		tag=$shell-$(printf '%s' "$sig" | tr '[:upper:]' '[:lower:]')
		printf '#!/bin/sh\ntouch "%s"\nkill -%s "$PPID"\nsleep 1\n' "$ws/ran-$tag" "$sig" >"$ws/scripts/borrow_node_modules.sh"
		out=$(cd "$ws/src" && HOME="$home" python3 -I -c 'import signal, subprocess, sys
signal.signal(signal.SIGINT, signal.SIG_DFL)
sys.exit(subprocess.run(sys.argv[1:]).returncode)' "$shell" "$ws/scripts/worktree.sh" "$wr/$tag" "$tag" HEAD 2>&1) && fail "worktree.sh finished a run that got SIG$sig in $shell: $out"
		[ -e "$ws/ran-$tag" ] || fail "the SIG$sig case in $shell never reached the step it stops: $out"
		[ ! -e "$wr/$tag" ] || fail "worktree.sh left the folder of a tree stopped by SIG$sig in $shell"
		! git -C "$ws/src" rev-parse -q --verify "$tag" >/dev/null || fail "worktree.sh left the branch of a tree stopped by SIG$sig in $shell"
		git -C "$ws/src" worktree list | grep -qF "$wr/$tag" && fail "worktree.sh left $wr/$tag registered after SIG$sig in $shell"
	done
done
wt "$wr/same" same HEAD >/dev/null 2>&1 || fail "worktree.sh refused a base whose package files are this tree's"
# A workspace's .bin reached through a link (a tree whose packages were linked by hand, into another tree's node_modules/.bin)
# is borrowed as a folder of its own: the probe deletes a tool in its copy, which went through the link and deleted the main
# tree's (F2127).
mkdir -p "$ws/bins/node_modules/.bin" "$ws/src/packages/core/node_modules" "$ws/borrowed" && echo tool >"$ws/bins/node_modules/.bin/storybook"
ln -s "$ws/bins/node_modules/.bin" "$ws/src/packages/core/node_modules/.bin"
(cd "$ws/src" && sh "$here/borrow_node_modules.sh" "$ws/borrowed") >"$ws/out" 2>&1 || fail "borrow_node_modules.sh failed on a linked .bin: $(cat "$ws/out")"
[ -d "$ws/borrowed/packages/core/node_modules/.bin" ] && [ ! -L "$ws/borrowed/packages/core/node_modules/.bin" ] || fail "borrow_node_modules.sh kept a workspace's .bin a link into the tree it borrows from"
[ "$(cat "$ws/borrowed/packages/core/node_modules/.bin/storybook")" = tool ] || fail "borrow_node_modules.sh left the linked .bin's tools behind"
rm "$ws/borrowed/packages/core/node_modules/.bin/storybook"
[ -f "$ws/bins/node_modules/.bin/storybook" ] || fail "a tool deleted in the borrowed copy was deleted where its .bin's link led (F2127)"
# A relative link, as a hand-made one into another tree's store would be, borrowed the same way; a real .bin stays as it is.
mkdir -p "$ws/src/packages/ui/node_modules" "$ws/src/app/node_modules/.bin" "$ws/borrowed2" && echo own >"$ws/src/app/node_modules/.bin/vite"
ln -s ../../../../bins/node_modules/.bin "$ws/src/packages/ui/node_modules/.bin"
[ -f "$ws/src/packages/ui/node_modules/.bin/storybook" ] || fail "the relative .bin link of this case leads nowhere"
(cd "$ws/src" && sh "$here/borrow_node_modules.sh" "$ws/borrowed2") >"$ws/out" 2>&1 || fail "borrow_node_modules.sh failed on a relative .bin link: $(cat "$ws/out")"
[ ! -L "$ws/borrowed2/packages/ui/node_modules/.bin" ] && rm "$ws/borrowed2/packages/ui/node_modules/.bin/storybook" && [ -f "$ws/bins/node_modules/.bin/storybook" ] ||
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
const idOf = (o, n) => o.schema.properties.verdicts.items.properties.id.enum[n];
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
  // Two lenses' findings both numbered 1 by their agents: the script's ids tell them apart, a refutation drops only its own.
  t = await run((l, p, o) =>
    l === "reviewer" ? { findings: [finding("high", "scripts/a.sh")] }
    : l === "security" ? { findings: [finding("medium", "scripts/b.sh")] }
    : l === "verifier" ? { verdicts: [{ id: idOf(o, 0), verdict: "refuted", severity: "low", evidence: "e" }] }
    : (l || "").startsWith("fix round") ? { fixed: [{ id: "security-1-1", commit: "f1" }], notes: "", branch: "b" }
    : base(["scripts/a.sh"])(l, p));
  const fix = t.calls.find((c) => (c.label || "").startsWith("fix round"));
  ok(fix && fix.prompt.includes("security-1-1") && !fix.prompt.includes("reviewer-1-1"), `the refuted finding's twin was dropped, or the refuted one fixed: ${fix && fix.prompt}`);
  // A high tier-1 finding each round: round 2 runs only its lens, on the diff since its fix; after the third, Alexis decides.
  const highEveryRound = (extra) => run((l, p, o) =>
    l === "security" ? { findings: [finding("high", "scripts/a.sh")] }
    : l === "verifier" ? { verdicts: [{ id: idOf(o, 0), verdict: "reproduced", severity: "high", evidence: "e" }] }
    : (l || "").startsWith("fix round") ? { fixed: [{ id: p.match(/"id":"(security-\d-1)"/)[1], commit: "f" + l.slice(-1) }], notes: "", branch: "b" }
    : base(["scripts/a.sh"])(l, p), extra);
  t = await highEveryRound();
  ok(t.r.status.startsWith("reconsider with Alexis"), `three rounds of high tier-1 findings ended as ${t.r.status}`);
  ok(t.labels.filter((l) => l === "reviewer").length === 1, `round 2 ran the reviewer again: ${t.labels}`);
  ok(t.calls.some((c) => c.label === "security" && c.prompt.includes("since f1^")), "round 2 did not read the diff since its first fix");
  // Read-only agents are told to write nothing; writers get the shared files.
  for (const c of t.calls) {
    const readOnly = ["red pass", "reviewer", "security", "gno-auditor", "verifier", "design-reviewer"].includes(c.label);
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
  // Every tier-1 product path of docs/REVIEW.md's table that exists starts the security lens by itself, with no `tier1` argument, and
  // a finding in it reaches the finding-verifier (5e and 5f launched the security-reviewer by hand; no csp.ts finding was verified).
  const lensOf = async (file) => {
    const only = await run((l, p, o) =>
      l === "security" ? { findings: [finding("medium", file)] }
      : l === "verifier" ? { verdicts: [{ id: idOf(o, 0), verdict: "reproduced", severity: "low", evidence: "e" }] }
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
    ok(labels.includes("verifier"), `a security finding in ${file} never reached the finding-verifier: ${labels}`);
  }
  // A lookalike is no tier-1 file.
  for (const file of ["deploy-notes/x.md", "server/src/loginx.ts", "app/src/lib/adenax/a.ts", "app/src/sw.ts.md", "packages/core/src/markdown.md"]) {
    const labels = await lensOf(file);
    ok(!labels.includes("security"), `${file}, a lookalike of a tier-1 path, started the security lens: ${labels}`);
  }
  // The design-reviewer (Alexis, 2026-10-31): a read-only agent that renders each changed screen at 1728 by 1080 and compares it with
  // the video's frames. It starts by itself when a branch changes app/src/ or packages/ui/src/ (a `ui` change alone included), reports
  // like the other lenses (numbered findings, high and medium fixed), and frames missing fail the step, never skip it.
  {
    const withDesign = (files, design) => run((l, p, o) =>
      l === "design-reviewer" ? (design ? design(p, o) : { findings: [], framesMissing: false })
      : (l || "").startsWith("fix round") ? { fixed: [{ id: "design-reviewer-1-1", commit: "fd" }], notes: "", branch: "b" }
      : base(files)(l, p, o));
    for (const file of ["packages/ui/src/Button.tsx", "packages/ui/src/tokens.css", "app/src/features/home/Home.tsx", "app/src/routes/home.tsx"]) {
      const d = await withDesign([file]);
      ok(d.labels.includes("design-reviewer"), `a change of ${file} alone started no design-reviewer: ${d.labels}`);
      ok(d.r.status === "ready for the chief", `a clean design review of ${file} did not end ready: ${d.r.status}`);
    }
    for (const file of ["server/src/a.ts", "docs/x.md", "app/tests/e2e/a.spec.ts", "app/srcx/a.ts", "packages/ui/srcs/a.ts", "packages/core/src/a.ts", "scripts/check.sh"]) {
      const d = await withDesign([file]);
      ok(!d.labels.includes("design-reviewer"), `${file}, which is no screen, started the design-reviewer: ${d.labels}`);
    }
    const d = await withDesign(["packages/ui/src/Button.tsx"]);
    const call = d.calls.find((c) => c.label === "design-reviewer");
    ok(call.agentType === "design-reviewer", `the design lens ran as ${call.agentType}`);
    for (const word of ["1728", "1080", "docs/design/video-screens.md", "video-frames", "write nothing"])
      ok(call.prompt.includes(word), `the design-reviewer was not told ${word}: ${call.prompt}`);
    ok(!call.prompt.includes("learnings.md"), "the read-only design-reviewer was told to write the learnings");
    ok(call.schema.properties.framesMissing && call.schema.properties.findings, "the design-reviewer's answer has no framesMissing, or no findings");
    // Its findings follow the loop: numbered by its label, a medium one fixed, the round's findings to the ledger.
    const f = await withDesign(["app/src/a.ts"], () => ({ findings: [finding("medium", "app/src/a.ts")], framesMissing: false }));
    const fixCall = f.calls.find((c) => (c.label || "").startsWith("fix round"));
    ok(fixCall && fixCall.prompt.includes("design-reviewer-1-1"), `a medium design finding was not given to the fixer: ${fixCall && fixCall.prompt}`);
    ok(f.labels.includes("ledger 1"), `a design finding never reached the ledger: ${f.labels}`);
    // A screen and a tier-1 path in one change start both lenses; a finding fixed in round 1 starts no second design review, and a
    // second round for a tier-1 high finding runs its lens alone.
    const both = await withDesign(["packages/ui/src/a.ts", "app/src/csp.ts"]);
    ok(both.labels.includes("design-reviewer") && both.labels.includes("security"), `a screen and a tier-1 path did not start both lenses: ${both.labels}`);
    const hi = await withDesign(["packages/ui/src/a.ts"], () => ({ findings: [finding("high", "packages/ui/src/a.ts")], framesMissing: false }));
    ok(hi.r.status === "ready for the chief", `a high design finding, fixed, did not end ready: ${hi.r.status}`);
    ok(hi.labels.filter((l) => l === "design-reviewer").length === 1, `the design-reviewer ran again after its finding was fixed: ${hi.labels}`);
    let secRuns = 0;
    const two = await run((l, p, o) =>
      l === "security" ? (secRuns++ ? { findings: [] } : { findings: [finding("high", "app/src/csp.ts")] })
      : l === "verifier" ? { verdicts: [{ id: idOf(o, 0), verdict: "reproduced", severity: "high", evidence: "e" }] }
      : (l || "").startsWith("fix round") ? { fixed: [{ id: "security-1-1", commit: "fs" }], notes: "", branch: "b" }
      : base(["app/src/csp.ts"])(l, p));
    ok(two.labels.filter((l) => l === "security").length === 2 && two.labels.filter((l) => l === "design-reviewer").length === 1 && two.labels.filter((l) => l === "reviewer").length === 1,
      `round 2 for a tier-1 high finding did not run its lens alone: ${two.labels}`);
    // Frames missing fail the step; so does an agent that dies.
    const m = await withDesign(["app/src/a.ts"], () => ({ findings: [], framesMissing: true }));
    ok(m.r.status.startsWith("blocked") && m.r.status.includes("frames"), `missing frames did not stop the loop: ${m.r.status}`);
    const dead = await withDesign(["app/src/a.ts"], () => null);
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
    // Both ways (F2530): a path of TIER1 that no tier-1 row names is a review nobody asked for, and a row written in prose, with
    // no path in backticks, would pass the loop above unseen. The harness's folders and gno/ are tier 1 by the harness's own rule;
    // the realms' two folders are the table's `gno/r/` and `gno/p/`.
    {
      const src = readFileSync(root + "/.claude/workflows/branch.js", "utf8");
      const block = src.slice(src.indexOf("const TIER1 = ["), src.indexOf("...(A.tier1"));
      const listed = [...block.matchAll(/^\s+"([^"]+)",$/gm)].map((m) => m[1]).filter((e) => !["scripts/", ".githooks/", ".github/", ".claude/", "gno/"].includes(e));
      const named = paths.filter((e) => !["gno/r/", "gno/p/"].includes(e));
      ok(listed.length >= 10, `I read no TIER1 list in branch.js: ${listed}`);
      for (const e of listed) ok(named.includes(e), `branch.js's TIER1 holds ${e}, which no tier-1 row of docs/REVIEW.md names in backticks`);
      for (const e of named) ok(listed.includes(e), `docs/REVIEW.md names ${e} as tier 1 in backticks, which branch.js's TIER1 lacks`);
    }
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
# Jarvis's workspace since 10h (D110): its code is product, its test helpers are not.
git -C "$bs" checkout -q -f -b jarvis "$base" && mkdir -p "$bs/jarvis/src/testing" && lines 700 >"$bs/jarvis/src/testing/kit.ts" && commit "jarvis's test helper"
out=$(size "$base") || fail "batch_size.py counted jarvis/src/testing, a test helper's folder, as product code: $out"
lines 610 >"$bs/jarvis/src/loop.ts" && commit "jarvis's code"
out=$(size "$base") && fail "batch_size.py passed 610 lines of jarvis/src, which is product code: $out"
# A package's test helpers too, as the chain package's fake node (D112).
git -C "$bs" checkout -q -f -b package-helpers "$base" && mkdir -p "$bs/packages/chain/src/testing" && lines 700 >"$bs/packages/chain/src/testing/envelopes.ts" && commit "a package's test helper"
out=$(size "$base") || fail "batch_size.py counted packages/chain/src/testing, a test helper's folder, as product code: $out"
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
# The coverage lane never ran (the history lane failed first, batch_size is in it): there is nothing to print, and it says so.
out=$(FAIL=py:batch_size gate --merge) && fail "check.sh --merge passed with its batch size failing"
printf '%s\n' "$out" | grep -q '^survivor: ' && fail "check.sh --merge printed a survivor though the coverage lane never ran: $out"
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
for s in py:batch_size py:check_regressions py:check_migrations; do
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

[ -z "${ONLY:-}" ] || [ "${ran:-}" = 1 ] || fail "ONLY=$ONLY names no section"
echo "hooks: ok"
finished=1
