#!/bin/sh
# test_hooks.sh: the git hooks do what docs/DEVELOPMENT.md says. check.sh runs it.
set -eu
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE # a `commit -a` hands its own index down; the throwaway repos must not touch it
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
assert not [p for p in box["filesystem"]["allowWrite"] if "pnpm" in p], "a command can rewrite the pnpm that Alexis's install runs"
assert not any("api.github.com" in d for d in box["network"]["allowedDomains"]), "the GitHub API is reachable"
ask, deny = set(s["permissions"]["ask"]), set(s["permissions"]["deny"])
# Claude works alone and asks only before a push or a chain write (Alexis, 2026-10-18). The files
# run outside the sandbox themselves cannot be edited at all: the hooks and their scripts,
# Claude Code's own settings, skills and agents (F068), what pnpm loads at Alexis's install
# (F087), and git's own hooks folder and config, which bypass mode lets the file tools write
# otherwise (F129). A dependency is Alexis's to add, and rm -rf no one's.
assert {"Bash(git push)", "Bash(git push *)"} <= ask, "a push asks no one"
assert {"Bash(pnpm add *)", "Bash(rm -rf *)"} <= deny, "Claude can add a dependency or delete a tree"
outside = {"Edit(/scripts/guard.py)", "Edit(/scripts/stop_gate.sh)", "Edit(/scripts/code_changed.sh)", "Edit(/.githooks/**)",
           "Edit(/scripts/scan_secrets.sh)", "Edit(/scripts/gitleaks.toml)", "Edit(/scripts/gitleaks-private.toml)", "Edit(/scripts/.gitleaksignore)",
           "Edit(/scripts/install_hooks.sh)", "Edit(/.git/hooks/**)", "Edit(/.git/config)", "Edit(/.git/commondir)", "Edit(/.mcp.json)",
           "Edit(/.claude/settings.json)", "Edit(/.claude/settings.local.json)", "Edit(/.claude/agents/**)", "Edit(/.claude/commands/**)",
           "Edit(/.claude/skills/**)", "Edit(/.claude/rules/**)", "Edit(/.claude/hooks/**)",
           "Edit(/package.json)", "Edit(/app/package.json)", "Edit(/packages/*/package.json)",
           "Edit(/.npmrc)", "Edit(/pnpm-workspace.yaml)", "Edit(/.pnpmfile.cjs)", "Edit(/.pnpmfile.mjs)"}
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
for step in "run format:check" "run typecheck" "run lint" "run test" "run unused" "run copies" \
	"python3 -I scripts/check_css.py" "run comments" '"$GNO" lint ./...' '"$GNO" test ./...' \
	"node app/node_modules/@playwright/test/cli.js test -c app/playwright.config.ts" '[ "$(packages)" = "$installed" ]' \
	"node app/node_modules/@playwright/test/cli.js test -c app/playwright.stories.config.ts" \
	"ast.parse(open(f).read(), f) for f in sys.argv[1:]]' scripts/*.py" \
	"python3 -I ../scripts/mutate.py" "go vet ./tools/..." "go run ./tools/sealvec | cmp" "python3 -I scripts/check_docs.py" \
	"sh scripts/test_hooks.sh" "python3 -I scripts/probe.py" "run coverage" "python3 -I scripts/patch_coverage.py" \
	"run mutate" "sh scripts/scan_secrets.sh" "python3 -I scripts/harness_mutate.py" "python3 -I scripts/check_regressions.py" \
	'unset AUDIT_ANSWER PROVE_FIX_VITEST PROVE_FIX_GNO PROVE_FIX_GO' '[ "$took" -gt 60 ]' "python3 -I scripts/prove_fix.py" "python3 -I scripts/audit.py"; do
	grep -v '^[[:space:]]*#' "$gate_file" | grep -qF -- "$step" || fail "check.sh no longer runs: $step"
done
# The app's step comes after the copy and dead-code checks (F082), and its guard (F080) snapshots
# every package file before the build and compares after it.
python3 -I - "$gate_file" <<'PY' || fail "check.sh's app step lost its order or its package guard"
import sys
lines = [l.strip() for l in open(sys.argv[1]) if not l.lstrip().startswith("#")]
at = lambda text: next(i for i, l in enumerate(lines) if l.startswith(text))
assert "packages() { cat package.json app/package.json pnpm-lock.yaml | cksum; }" in lines
assert at("copies=$(run copies") < at("installed=$(packages)") < at("node app/node_modules/@playwright/test/cli.js test") < at('[ "$(packages)" = "$installed" ]')
PY
# The full gate walks the stories: a command of its own, not a line that names it and runs nothing.
grep -v '^[[:space:]]*#' "$gate_file" | grep -qE '^[[:space:]]*node app/node_modules/@playwright/test/cli\.js test -c app/playwright\.stories\.config\.ts( |$)' ||
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
# check.sh prints the code it tests before its first step, and records it after its last one,
# through records.sh, whose own cases are in the section `outside` (F076, F133).
at() { grep -nF -- "$1" "$gate_file" | head -1 | cut -d: -f1; }
[ "$(at '. .githooks/records.sh && tested=$(worktree_print)')" -lt "$(at 'run format:check')" ] || fail "check.sh prints its code after a step ran (F133)"
[ "$(at 'gate_passed "$tested" "$full"')" -gt "$(at 'python3 -I scripts/harness_mutate.py')" ] || fail "check.sh records its code before its last step (F076)"
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
assert not re.search(r"^\s+(- )?if:", ci, re.M), "a CI step can be skipped"
has(r"    runs-on: ubuntu-24\.04", "the CI runs on a machine it does not name")
has(r"        run: sh scripts/check\.sh --full", "the CI does not run the full gate, or lets it fail")
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

if part commit_msg; then
# commit-msg: a conventional subject of 72 characters at most, or git's own merge and revert
# subjects; no attribution line. It runs as installed, beside its rule files (F129).
cm="$t/commit-msg"
mkdir "$cm"
cp "$hooks/commit-msg" "$cm/"
secrets_into "$cm/"
refused() {
	printf '%s\n' "$1" >"$t/msg"
	! "$cm/commit-msg" "$t/msg" 2>/dev/null
}
refused "fix: x

Co-Authored-By: a <noreply@anthropic.com>" || fail "a co-author line was accepted"
refused "fix: x

🤖 Generated with [Claude Code](https://claude.com/claude-code)" || fail "a robot line was accepted"
refused "fix: x

Generated by Claude Code" || fail "'Generated by Claude' was accepted"
refused "fix: x

Assisted-by: Claude" || fail "'Assisted-by' was accepted"
# gitleaks reads files, not messages: a message holds no home folder either (F090).
refused "fix: x

Seen in /Us""ers/alice/notes." || fail "a message naming a home folder was accepted"
refused "fix: x

Seen in /Us""ers/alice/notes gitleaks:allow" || fail "gitleaks:allow let a home folder through a message (F113)"
refused "fix: x

aws = $key" || fail "a message holding a key was accepted"
printf 'fix: x\n' >"$t/msg"
PATH=/usr/bin:/bin "$cm/commit-msg" "$t/msg" 2>"$t/err" && fail "commit-msg passed with no gitleaks to scan the message"
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
LC_ALL=C "$cm/commit-msg" "$t/msg" 2>/dev/null || fail "commit-msg counted bytes, not characters, under the C locale"
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
green && { stop '{"stop_hook_active":false}' || fail "stop_gate blocked a state the gate passed"; }
echo 'package y' >"$r/x.go"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate let through a change made after the gate passed (exit $code)"
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
fi

if part check_docs; then
# check_docs: a harness doc that names a missing harness file fails the gate.
docs="$here"/check_docs.py
d="$t/docs-root"
mkdir -p "$d/scripts" "$d/.claude/rules"
touch "$d/scripts/real.sh"
printf 'Run `scripts/real.sh`, see `docs/plans/slice-$ARGUMENTS.md`.\n' >"$d/CLAUDE.md"
python3 -I "$docs" "$d" >/dev/null 2>&1 || fail "check_docs refused a doc whose files exist"
printf 'Run `scripts/gone.sh`.\n' >"$d/.claude/rules/x.md"
python3 -I "$docs" "$d" >/dev/null 2>&1 && fail "check_docs accepted a doc naming a missing file"
rm "$d/.claude/rules/x.md"
git -C "$d" init -q && printf '.claude/tmp/\n' >"$d/.gitignore" && mkdir -p "$d/.claude/tmp/copy"
printf 'Run `scripts/gone.sh`.\n' >"$d/.claude/tmp/copy/x.md"
python3 -I "$docs" "$d" >/dev/null 2>&1 || fail "check_docs read a doc in a folder git ignores"
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
for f in app/src/site.ts app/src/routes/a.tsx; do
	printf 'x\n' >"$c/$f" && git -C "$c" add "$f"
	cover 1 && fail "patch_coverage let $f go unmeasured"
	git -C "$c" rm -q --cached "$f" && rm "$c/$f"
done
git -C "$c" rm -rq --cached app && rm -r "$c/app"
# Storybook's config is a config and a test setup a test's, so neither is measured; code named alike is.
mkdir -p "$c/packages/ui/.storybook" "$c/packages/ui/src"
printf 'x\n' >"$c/packages/ui/.storybook/main.ts" && printf 'x\n' >"$c/packages/ui/.storybook/preview.ts"
printf 'x\n' >"$c/packages/ui/src/testSetup.ts" && git -C "$c" add packages
cover 1 || fail "patch_coverage asked coverage of Storybook's config or the tests' setup"
for f in packages/ui/src/storybook.ts packages/ui/src/setup.ts; do
	printf 'x\n' >"$c/$f" && git -C "$c" add "$f"
	cover 1 && fail "patch_coverage let $f go unmeasured"
	git -C "$c" rm -q --cached "$f" && rm "$c/$f"
done
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
precommit() { (cd "$c2" && sh "$hooks/pre-commit" >/dev/null 2>&1); }
mkdir -p "$c2/scripts" && git -C "$c2" init -q
printf '#!/bin/sh\nexit 1\n' >"$c2/scripts/check.sh" && cp "$here/code_changed.sh" "$here/borrow_node_modules.sh" "$here/check_docs.py" "$here/repo_files.py" "$c2/scripts/" && secrets_into "$c2/scripts/" && git -C "$c2" add -A && git -C "$c2" commit -qm base
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
# A push, in any form, waits for Alexis: the guard asks, since a rule cannot see every form.
asks() { # $1: a shell command
	python3 -I -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$1" | python3 -I "$gd" 2>/dev/null | grep -q '"permissionDecision": "ask"' || fail "guard did not ask before: $1"
}
asks "git push origin slice-1a"
asks "git -C . push origin slice-1a"
asks "cd gno && git push"
asks "git -c push.default=current push"
python3 -I -c 'import json; print(json.dumps({"tool_name":"Bash","tool_input":{"command":"git status"}}))' | python3 -I "$gd" | grep -q . && fail "guard printed a decision for git status"
fi

if part prove_fix; then
# prove_fix: a product fix's tests fail on the commit before it. A fake Vitest stands in: a
# test passes when the code holds what its `// expects:` line names.
pf="$t/prove"
mkdir -p "$pf/packages/x/src" "$pf/.claude/tmp" "$pf/node_modules"
git -C "$pf" init -q
printf '#!/bin/sh\nfor f in "$@"; do grep -qF "$(sed -n "s|^// expects: ||p" "$f")" packages/x/src/a.ts || exit 1; done\n' >"$t/fake_vitest" && chmod +x "$t/fake_vitest"
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
base=$(git -C "$pf" rev-parse HEAD)
printf 'export const twice = (n: number) => n + n;\n' >"$pf/packages/x/src/a.ts"
fix "fix(x): no test"
prove "$base" && fail "prove_fix accepted a fix with no test"
git -C "$pf" commit -q --amend -m "fix(x): no test" -m "No-test: the same sum, written as an addition"
prove "$base" || fail "prove_fix refused a fix that says why it has no test"
# A journey proves a fix as a unit test does (F126).
base=$(git -C "$pf" rev-parse HEAD) && mkdir -p "$pf/app/tests"
printf 'export const twice = (n: number) => n * 2 + 0;\n' >"$pf/packages/x/src/a.ts" && printf '// expects: + 0\n' >"$pf/app/tests/a.spec.ts"
fix "fix(x): a journey shows it"
prove "$base" || fail "prove_fix refused a fix whose journey failed before it (F126)"
base=$(git -C "$pf" rev-parse HEAD)
printf 'export const twice = (n: number) => n * 2 + 1 - 1;\n' >"$pf/packages/x/src/a.ts" && printf '// expects: export\n' >"$pf/app/tests/b.spec.ts"
fix "fix(x): a journey that passed already"
prove "$base" && fail "prove_fix accepted a fix whose journey passed before it"
base=$(git -C "$pf" rev-parse HEAD)
mkdir -p "$pf/scripts" && echo x >"$pf/scripts/tool.py" && fix "fix(harness): a harness fix"
prove "$base" || fail "prove_fix refused a harness fix, which harness_mutate proves"
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

if part regressions; then
# check_regressions: its rules on small cases (the real run needs a base branch and Vitest).
python3 -I "$here/check_regressions.py" --self-test >/dev/null || fail "check_regressions's rules do not hold"
fi

[ -z "${ONLY:-}" ] || [ "${ran:-}" = 1 ] || fail "ONLY=$ONLY names no section"
echo "hooks: ok"
finished=1
