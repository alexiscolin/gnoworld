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
agents="finding-verifier reviewer security-reviewer test-auditor"
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
           "Edit(/.claude/skills/**)", "Edit(/.claude/rules/**)", "Edit(/.claude/hooks/**)", "Edit(/.claude/workflows/**)",
           "Edit(/package.json)", "Edit(/app/package.json)", "Edit(/packages/*/package.json)",
           "Edit(/server/package.json)", "Edit(/packages/schemas/package.json)",
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
assert at("copies=$(run copies") < at("installed=$(packages)") < at("node app/node_modules/@playwright/test/cli.js test") < at('[ "$(packages)" = "$installed" ]')
PY
# The full gate walks the stories: a command of its own, not a line that names it and runs nothing.
grep -v '^[[:space:]]*#' "$gate_file" | grep -qE '^[[:space:]]*node app/node_modules/@playwright/test/cli\.js test -c app/playwright\.stories\.config\.ts( --[a-z]+(=[a-z]+)?)*$' ||
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

if part harness_shards; then
# harness_mutate judges its mutants over HARNESS_SHARDS worktrees side by side, each mutant once and in
# a tree put back after each one, after a control run of each suite in every tree; with --changed
# <base>, only the mutants of the guard files committed since base (a merge's own), all of them when a
# suite or harness_mutate itself changed; a survivor fails the run either way, and the worktrees go.
# On a copy whose worktrees are copies of a small tree, and whose mutants are planted.
hs="$t/shards" && mkdir -p "$hs/src/scripts" "$hs/repo/scripts"
# The suite: its section opens at the line's start, as harness_mutate reads it, which this file's
# runner must not; with SHARDS_MEET, a mutant's run waits for that many trees to run at once.
printf '%s\n' '# Each section reads the tree, never its .git file.' 'part() { case ",$ONLY," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }' \
	'[ -n "$ONLY" ] || { echo . >>"$SHARD_ROOT/controls"; [ -z "${CONTROLS_SLOW:-}" ] || { : >"$SHARD_ROOT/live.$$"; n=0; until [ "$(ls "$SHARD_ROOT" | grep -c "^live\.")" -ge 2 ] || [ "$n" -ge 50 ]; do n=$((n + 1)); sleep 0.1; done; sleep 0.3; ls "$SHARD_ROOT" | grep -c "^live\." >>"$SHARD_ROOT/overlap"; rm -f "$SHARD_ROOT/live.$$"; }; [ ! -e BROKEN_hooks ]; exit; }' \
	'if part x; then' \
	'	pwd >>"$SHARD_ROOT/ran"' \
	'	! grep -q " SPARE" g.txt && [ -n "${FLAKE:-}" ] && [ ! -e "$SHARD_ROOT/flaked" ] && { : >"$SHARD_ROOT/flaked"; exit 1; }' \
	'	if [ -n "${SHARDS_MEET:-}" ]; then' \
	'		: >"$SHARD_ROOT/met.${PWD##*/}" && n=0' \
	'		until [ "$(ls "$SHARD_ROOT" | grep -c "^met\.")" -ge "$SHARDS_MEET" ]; do n=$((n + 1)); [ "$n" -lt 100 ] || { : >"$SHARD_ROOT/lonely"; break; }; sleep 0.1; done' \
	'	fi' \
	'	grep -q KEEP1 g.txt && grep -q KEEP2 g.txt && grep -q KEEP3 g.txt && grep -q KEEP4 h.txt && grep -q KEEP5 i.txt && grep -q KEEP8 "$(printf "\303\251").txt"' \
	'fi' >"$hs/src/scripts/test_hooks.sh"
# probe.py's block y reads k.txt (a mutant of k.txt is a probe block's, G5); ONLY names the blocks to run, none for all.
printf 'import os, sys\n\n\ndef part(name):\n    return name in os.environ.get("ONLY", "").split(",")\n\n\nif part("y"):\n    if "KEEP7" not in open("k.txt").read():\n        sys.exit(1)\nif not os.environ.get("ONLY"):\n    open(os.environ["SHARD_ROOT"] + "/probe_controls", "a").write(".\\n")\nsys.exit(os.path.exists("BROKEN_probe"))\n' >"$hs/src/scripts/probe.py"
printf 'KEEP1 KEEP2 KEEP3 SPARE\n' >"$hs/src/g.txt" && printf 'KEEP4 SPARE2\n' >"$hs/src/h.txt" && printf 'KEEP5\n' >"$hs/src/i.txt" && printf 'KEEP7\n' >"$hs/src/k.txt" && ac=$(printf '\303\251').txt && printf 'KEEP8\n' >"$hs/src/$ac"
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


def every_mutant():'''
gaps = '''GAPS = {
    **({"planted spare #1": "planted gap"} if os.environ.get("GAPPED") else {}),
    **({"planted keep1 #1": "planted gap"} if os.environ.get("GAPPED_KEEP") else {}),
'''
for a, b in (("def mutants():", planted), ("GAPS = {  # label -> why no test can notice it yet\n", gaps), ("SECTIONS = {\n", 'SECTIONS = {\n    "g.txt": "x", "h.txt": "x", "i.txt": "x", "j.txt": "z", "k.txt": "y", "\\u00e9.txt": "x",\n')):
    assert s.count(a) == 1, f"harness_mutate.py no longer holds {a!r}: update test_hooks.sh's harness_shards"
    s = s.replace(a, b)
open(p, "w").write(s)
PY
cp "$hs/src/g.txt" "$hs/src/h.txt" "$hs/src/i.txt" "$hs/src/k.txt" "$hs/src/$ac" "$hs/repo/" && cp "$hs/src/scripts/test_hooks.sh" "$hs/src/scripts/probe.py" "$hs/repo/scripts/"
git -C "$hs/repo" init -q && git -C "$hs/repo" add -A && git -C "$hs/repo" commit -qm x
shards() { # $1: the shards; then harness_mutate's arguments
	n=$1 && shift
	rm -f "$hs/made" "$hs/removed" "$hs/ran" "$hs/controls" "$hs/probe_controls" "$hs/lonely" "$hs/flaked" "$hs"/met.* "$hs"/live.* "$hs/overlap"
	[ -n "${WARM:-}" ] || rm -rf "${hs:?}/home" # each run with no cache of verdicts, unless WARM keeps the last run's
	(cd "${HR:-$hs/repo}" && HOME="$hs/home" SHARD_ROOT="$hs" SHARD_SRC="$hs/src" HARNESS_SHARDS=$n python3 -I harness_mutate.py "$@" 2>&1)
}
count() { [ -e "$hs/$1" ] && wc -l <"$hs/$1" | tr -d ' ' || echo 0; }
verdicts() { printf '%s\n' "$1" | grep -c "killed: \|survives: " || :; }
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
# A suite changed: its cases may have weakened any guard's, so every mutant runs.
base=$(git -C "$hs/repo" rev-parse HEAD)
printf '\n' >>"$hs/repo/scripts/test_hooks.sh" && git -C "$hs/repo" commit -qam suite
out=$(shards 2 --changed "$base") && fail "harness_mutate --changed passed with survivors after a suite changed: $out"
[ "$(verdicts "$out")" = 7 ] || fail "harness_mutate --changed did not judge every mutant after a suite changed: $out"
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
# (Before the section z below: its if, last in the suite, would give every x mutant a passing exit.)
# A change inside one section of a suite judges that section's mutants alone, with those of the files it changed.
printf '%s\n' 'if part z; then' '	grep -q KEEP6 j.txt' 'fi' >"$hs/z"
cat "$hs/z" >>"$hs/src/scripts/test_hooks.sh" && cat "$hs/z" >>"$hs/repo/scripts/test_hooks.sh"
printf 'KEEP6\n' >"$hs/src/j.txt" && printf 'KEEP6\n' >"$hs/repo/j.txt"
git -C "$hs/repo" add -A && git -C "$hs/repo" commit -qm z
base=$(git -C "$hs/repo" rev-parse HEAD)
for f in "$hs/src/scripts/test_hooks.sh" "$hs/repo/scripts/test_hooks.sh"; do
	sed 's|^	grep -q KEEP6 j.txt$|	grep -q KEEP6 j.txt \&\& :|' "$f" >"$f.new" && mv "$f.new" "$f"
done
git -C "$hs/repo" commit -qam "z's line"
out=$(SCOPED=1 shards 2 --changed "$base") || fail "harness_mutate --changed failed on the mutant of the one section changed: $out"
printf '%s\n' "$out" | grep -q "killed: planted keep6 #1$" || fail "harness_mutate --changed skipped the changed section's mutant: $out"
[ "$(verdicts "$out")" = 1 ] || fail "harness_mutate --changed judged the mutants of sections a change did not touch: $out"
printf '%s\n' "$out" | grep -q "1 of 8 mutants" || fail "harness_mutate --changed did not say how many it kept: $out"
# A change inside one block of probe.py judges that block's mutants alone: probe.py is a suite as test_hooks.sh is (G5).
base=$(git -C "$hs/repo" rev-parse HEAD)
for f in "$hs/src/scripts/probe.py" "$hs/repo/scripts/probe.py"; do
	sed 's|^        sys.exit(1)$|        sys.exit(2)|' "$f" >"$f.new" && mv "$f.new" "$f"
done
git -C "$hs/repo" commit -qam "y's line"
out=$(PROBED=1 shards 2 --changed "$base") || fail "harness_mutate --changed failed on the mutant of the one probe block changed: $out"
printf '%s\n' "$out" | grep -q "killed: planted keep7 #1$" || fail "harness_mutate --changed skipped the changed probe block's mutant: $out"
[ "$(verdicts "$out")" = 1 ] || fail "harness_mutate --changed judged more than the changed probe block's mutant: $out"
printf '%s\n' "$out" | grep -q "1 of 8 mutants" || fail "harness_mutate --changed did not say how many it kept after a probe change: $out"
# harness_mutate.py itself changed: the mutants it defines anew or otherwise than base's script (a label, a text, a
# suite) are judged, with those of the files and sections changed, not every mutant (Alexis, 2026-10-29: ~700 judged
# for two new ones, 32 minutes). Its own guards are mutants of a file it changed, so they are judged. A comment alone:
base=$(git -C "$hs/repo" rev-parse HEAD)
printf '\n# a change of its own\n' >>"$hs/repo/harness_mutate.py" && git -C "$hs/repo" commit -qam itself
out=$(shards 2 --changed "$base") || fail "harness_mutate --changed judged mutants after a comment of its own: $out"
[ "$(verdicts "$out")" = 0 ] && printf '%s\n' "$out" | grep -q " 0 of 7 mutants" || fail "harness_mutate --changed judged unchanged mutants after it changed itself: $out"
# A new mutant, and one whose text changed: those two alone. (Section z makes every x mutant survive, as above: the new
# one is a probe block's, which can be killed.)
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
out=$(shards 2 --changed "$base") && fail "harness_mutate --changed passed with the survivor it defined otherwise: $out"
[ "$(verdicts "$out")" = 2 ] || fail "harness_mutate --changed did not judge only its new and changed mutants: $out"
printf '%s\n' "$out" | grep -q "killed: planted keep7 again #1$" || fail "harness_mutate --changed skipped a mutant it defined anew: $out"
printf '%s\n' "$out" | grep -q "^FAIL  survives: planted spare2 #1$" || fail "harness_mutate --changed skipped a mutant whose text it changed: $out"
printf '%s\n' "$out" | grep -q " 2 of 8 mutants" || fail "harness_mutate --changed did not say 2 of 8 mutants: $out"
# A mutant is also told by its label alone, by the sections that judge it and by its place in GAPS: one change each.
for edit in label sections gaps; do
	base=$(git -C "$hs/repo" rev-parse HEAD)
	python3 -I - "$hs/repo/harness_mutate.py" "$edit" <<'PY'
import sys
p, edit = sys.argv[1], sys.argv[2]
s = open(p).read()
old, new = {
    "label": ('"hooks", "planted keep4")', '"hooks", "planted keep4 renamed")'),
    "sections": ('"i.txt": "x",', '"i.txt": "x,z",'),
    "gaps": ("GAPS = {\n", 'GAPS = {\n    "planted keep2 #1": "a planted gap",\n'),
}[edit]
assert s.count(old) == 1, f"the planted {edit} changed: update test_hooks.sh's harness_shards"
open(p, "w").write(s.replace(old, new))
PY
	git -C "$hs/repo" commit -qam "$edit alone"
	out=$(shards 2 --changed "$base") || :
	[ "$(verdicts "$out")" = 1 ] && printf '%s\n' "$out" | grep -q " 1 of 8 mutants" || fail "harness_mutate --changed did not judge the one mutant whose $edit alone changed: $out"
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
# The controls run two at a time, never every tree's suites at once: beside the full gate's coverage lane, eight at once
# overran their 600 s limit where they take 96 s alone (F2138). Each control still runs, in every tree; each fake control
# waits for a second one beside it (5 s at most), so a serial run shows as one at once, not as a pass.
CONTROLS_SLOW=1 shards 4 >/dev/null || : # the planted survivors fail the run; only its controls are read here
[ "$(count controls)" = 4 ] || fail "harness_mutate did not run the control in each of its 4 trees: $(count controls)"
[ "$(sort -n "$hs/overlap" | tail -1)" = 2 ] || fail "harness_mutate ran $(sort -n "$hs/overlap" | tail -1) controls at once, not two (F2138)"
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
[ "$n" != py:audit ] || echo "audit-answer ${AUDIT_ANSWER-unset}" >>"$GATE_LOG"
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
# python3, which fails check.sh's free_ports (its one script that says "in 200 tries") when PORTS_FAIL is set, as a machine with no free port would.
printf '#!/bin/sh\ncase "$*" in *"free ports in 200 tries"*) [ -z "${PORTS_FAIL:-}" ] || { echo "check.sh: no run of free ports (stub)" >&2; exit 1; } ;; esac\nexec "%s" "$@"\n' "$(command -v python3)" >"$g/bin/python3"
chmod +x "$g/bin/python3"
printf '#!/bin/sh\nexec sh "%s" gno "$@"\n' "$step" >"$g/toolchain/gno"
chmod +x "$g/bin/go" "$g/bin/gofmt" "$g/toolchain/gno"
for py in check_css check_docs mutate probe bench batch_size load patch_coverage prove_fix check_regressions check_migrations audit harness_mutate; do
	printf 'import os, sys\nos.execvp("sh", ["sh", %s, "py:%s", *sys.argv[1:]])\n' "'$step'" "$py" >"$g/scripts/$py.py"
done
for sh in ergo test_hooks scan_secrets; do printf 'exec sh "%s" sh:%s "$@"\n' "$step" "$sh" >"$g/scripts/$sh.sh"; done
# The journeys' stub; with PW_EDIT, it edits a package file, as a build that installs would.
printf 'const { spawnSync } = require("node:child_process");\nconst { appendFileSync, writeFileSync } = require("node:fs");\nconst stories = process.argv.some((a) => a.includes("stories"));\nconst name = stories ? (process.env.PICTURES_OF ? "pictures" : "stories") : "playwright";\nif (process.env.PW_EDIT) appendFileSync("app/package.json", "\\n");\nconst status = spawnSync("sh", [%s, name, "port=" + process.env.E2E_PORT, "of=" + (process.env.PICTURES_OF ?? ""), "on=" + (process.env.STORIES_PORT ?? ""), "out=" + (process.env.STORIES_OUT ?? ""), ...process.argv.slice(2)], { stdio: "inherit" }).status;\nconst report = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;\nconst failing = process.env.NOREPORT === "empty" ? [] : [{ title: "a.spec.ts", file: "a.spec.ts", specs: [{ title: "journey", ok: false, file: "a.spec.ts" }] }];\nif (process.env.ALSO === "two") failing.push({ title: "b.spec.ts", file: "b.spec.ts", specs: [{ title: "second", ok: false, file: "b.spec.ts" }] });\nif (status && report && process.env.NOREPORT !== "1" && process.argv.some((a) => a.endsWith("json"))) writeFileSync(report, JSON.stringify({ config: { rootDir: process.cwd() + "/app/tests" }, errors: process.env.ALSO === "errors" ? [{ message: "globalSetup failed" }] : [], suites: [...failing, { title: "ok.spec.ts", file: "ok.spec.ts", specs: [{ title: "fine", ok: true, file: "ok.spec.ts" }] }] }));\nprocess.exit(status);\n' "'$step'" >"$g/app/node_modules/@playwright/test/cli.js"
python3 -I - "$g/package.json" "$step" <<'PY'
import json, sys
names = ["format:check", "typecheck", "lint", "test", "test:compiled", "unused", "copies", "comments", "coverage", "mutate"]
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
fast_steps="format:check typecheck lint test unused copies comments py:check_css sh:ergo playwright gno py:mutate gofmt go py:check_docs sh:test_hooks"
cheap="format:check unused copies comments py:check_css py:check_docs"
everything() { # $1: what the run was given
	for s in $fast_steps; do ran "$s" || fail "check.sh skipped $s on $1, which must run everything"; done
	grep -q '^test .*--changed' "$log" && fail "check.sh ran only the changed tests on $1, which must run every test"
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
out=$(MEET="lint gno sh:test_hooks playwright test" gate) || fail "check.sh's lanes did not run side by side: $out"
everything "a tree with no change" && nocache "a tree with no change"
for lane in ts types tests gno docs; do
	printf '%s\n' "$out" | grep -qE "^lane $lane [0-9]+\.[0-9] s:" || fail "check.sh did not print lane $lane's time: $out"
done
[ -z "$(git -C "$g" status --porcelain)" ] || fail "check.sh left files git sees: $(git -C "$g" status --porcelain)"
# The journeys get a base port of their own, three free ports from it, so gates of several worktrees
# run at once; never the fixed 4173 another gate may hold.
port=$(sed -n 's/^playwright port=\([0-9]*\) .*/\1/p' "$log")
[ -n "$port" ] && [ "$port" -ge 1024 ] && [ "$port" -le 65533 ] && [ "$port" != 4173 ] || fail "check.sh gave the journeys no free port of their own: $(grep '^playwright' "$log")"
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
scoped "a server change" $cheap typecheck lint test - playwright gno py:mutate go sh:test_hooks
nocache "a server change"
grep -q '^test .*--changed' "$log" && fail "check.sh ran only Vitest's related tests on a server change"
printf '%s\n' "$out" | grep -q "(budget 30 s)$" || fail "check.sh gave a scoped run another budget than 30 s: $out"
[ ! -e "$g/.claude/tmp/green-full" ] || fail "a fast run recorded the full gate"
reset
# A server file deleted: its types still checked, which see what imported it.
git -C "$g" rm -q server/src/b.ts
gate >/dev/null || fail "check.sh failed on a deleted server file"
scoped "a deleted server file" typecheck lint test - playwright
reset
# A new TypeScript file of the app, untracked: the app's journeys and the related tests; the journeys
# after every reader of the build's output (F082); gno still not.
printf 'x\n' >"$g/app/src/b.tsx"
gate >/dev/null || fail "check.sh failed on a new app file"
scoped "a new app file" $cheap typecheck lint test playwright - gno sh:test_hooks
grep -q '^test .*--changed' "$log" || fail "check.sh did not run only the tests an app change touches"
for s in unused copies comments py:check_css; do before "$s" playwright || fail "check.sh built the app before $s read the tree (F082)"; done
reset
# The design system's TypeScript, and a journey: the same.
for f in packages/ui/src/a.ts app/tests/a.spec.ts; do
	printf 'y\n' >>"$g/$f"
	gate >/dev/null || fail "check.sh failed on a change of $f"
	scoped "a change of $f" typecheck lint test playwright - gno sh:test_hooks
	grep -q '^test .*--changed' "$log" || fail "check.sh did not run only the related tests on a change of $f"
	reset
done
# tokens.css: the tokens story lists every token, so a token changed moves its pictures (F1190, Alexis, 2026-10-27, after
# a95a764 added two and `check.sh --merge` found the pictures 30 minutes later). The fast gate also compares that story
# alone, at its three widths, in a lane of its own on a port of its own; every test runs (a stylesheet is outside
# Vitest's graph); another stylesheet of the design system, and no change, do not.
printf 'y\n' >>"$g/packages/ui/src/tokens.css"
gate >/dev/null || fail "check.sh failed on a change of tokens.css"
scoped "a change of tokens.css" typecheck lint test playwright pictures - gno sh:test_hooks stories
grep -q '^test .*--changed' "$log" && fail "check.sh ran only Vitest's related tests on a change of a stylesheet"
grep -q '^pictures port=[^ ]* of=tokens-- on=[0-9]* out=[^ ]*/storybook test -c app/playwright.stories.config.ts --reporter=dot pictures$' "$log" ||
	fail "check.sh did not compare the tokens story's pictures alone, on a port of its own: $(grep '^pictures' "$log")"
pport=$(sed -n 's/^pictures .* on=\([0-9]*\) .*/\1/p' "$log")
[ -n "$pport" ] && [ "$pport" -ge 1024 ] && [ "$pport" -le 65535 ] && [ "$pport" != 6007 ] || fail "check.sh gave the pictures no free port of their own (not 6007, another gate's): $pport"
reset
# Beside another area's change, and under any comment: the stylesheet's text decides nothing, its path does.
printf '/* pictures: skip, gate: off */\n' >>"$g/packages/ui/src/tokens.css" && printf 'y\n' >>"$g/server/src/a.ts"
gate >/dev/null || fail "check.sh failed on a change of tokens.css beside a server change"
scoped "a change of tokens.css beside a server change, with a comment that asks to skip" typecheck lint test playwright pictures - gno
reset
printf 'y\n' >>"$g/packages/ui/src/base.css"
gate >/dev/null || fail "check.sh failed on a change of another stylesheet"
scoped "a change of base.css" typecheck test playwright - pictures gno
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
scoped "a core change" typecheck lint test playwright - gno sh:test_hooks
grep -q '^test .*--changed' "$log" && fail "check.sh ran only Vitest's related tests on a core change"
reset
# A file of the app that is not TypeScript (a fixture, a stylesheet) sits outside Vitest's graph: every test.
printf 'x\n' >"$g/app/src/b.json"
gate >/dev/null || fail "check.sh failed on an app fixture"
scoped "an app fixture" test playwright
grep -q '^test .*--changed' "$log" && fail "check.sh ran only Vitest's related tests on a change outside its graph"
reset
# A name with a space is one path, of its area.
printf 'x\n' >"$g/server/src/a b.ts"
gate >/dev/null || fail "check.sh failed on a path with a space"
scoped "a server path with a space" typecheck - sh:test_hooks playwright
reset
# A realm: gno, its mutations and the Go tools, the cheap checks, no other TypeScript step.
printf 'y\n' >>"$g/gno/r/a.gno"
gate >/dev/null || fail "check.sh failed on a gno change"
scoped "a gno change" $cheap gno py:mutate gofmt go - typecheck lint test playwright sh:test_hooks
reset
# Outside a repository (pre-commit's staged copy): everything.
cp -R "$g" "$g-copy" && rm -rf "$g-copy/.git"
: >"$log" && (cd "$g-copy" && env -u SANDBOX_RUNTIME GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" sh scripts/check.sh >/dev/null 2>&1) ||
	fail "check.sh failed outside a repository"
everything "a copy outside a repository"
# There, pre-commit lists what the commit changes in GATE_CHANGED: the run checks those areas, every
# test (Vitest finds the related ones through git), and prose alone is no change.
outside() { : >"$log" && (cd "$g-copy" && env -u SANDBOX_RUNTIME GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED="$1" sh scripts/check.sh 2>&1); }
out=$(outside "server/src/a.ts
docs/x.md") || fail "check.sh failed outside a repository on pre-commit's list: $out"
scoped "pre-commit's list of a server change" $cheap typecheck lint test - playwright gno sh:test_hooks
grep -q '^test .*--changed' "$log" && fail "check.sh asked Vitest for the related tests outside a repository"
outside "app/src/a.tsx" >/dev/null || fail "check.sh failed outside a repository on an app change"
scoped "pre-commit's list of an app change" typecheck playwright test - gno
grep -q '^test .*--changed' "$log" && fail "check.sh asked Vitest for the related tests outside a repository"
outside "gno/r/a.gno" >/dev/null || fail "check.sh failed outside a repository on a gno change"
scoped "pre-commit's list of a gno change" gno - typecheck playwright
# The tokens story's pictures there too: pre-commit's list names the change, which a staged copy holds no repository to read.
outside "packages/ui/src/tokens.css" >/dev/null || fail "check.sh failed outside a repository on a change of tokens.css"
scoped "pre-commit's list of a change of tokens.css" typecheck test playwright pictures - gno
outside "packages/ui/src/base.css" >/dev/null || fail "check.sh failed outside a repository on a change of base.css"
scoped "pre-commit's list of a change of base.css" typecheck test playwright - pictures
# Prose is prose anywhere, and nothing else is: beside a server change, the run stays the server's.
for prose in adr/0001.txt docs/x.ts server/src/x.md; do
	outside "server/src/a.ts
$prose" >/dev/null || fail "check.sh failed outside a repository on $prose"
	scoped "pre-commit's list of a server change and $prose" typecheck - playwright sh:test_hooks
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
: >"$log" && (cd "$g-copy" && env -u SANDBOX_RUNTIME GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED=gno/r/a.gno sh scripts/check.sh --full >/dev/null 2>&1) || : # it fails at merge-base, with no repository
for s in $fast_steps; do [ "$s" = test ] || ran "$s" || fail "check.sh --full took GATE_CHANGED's scope and skipped $s"; done
# In a repository, the run reads its change from git, never from GATE_CHANGED.
: >"$log" && (cd "$g" && env -u SANDBOX_RUNTIME GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED=gno/r/a.gno sh scripts/check.sh >/dev/null 2>&1) ||
	fail "check.sh failed in a repository with GATE_CHANGED set"
everything "a repository with no change and GATE_CHANGED naming a realm"
printf 'y\n' >>"$g/server/src/a.ts"
: >"$log" && (cd "$g" && env -u SANDBOX_RUNTIME GATE_LOG="$log" GNO_TOOLCHAIN="$g/toolchain" PATH="$g/bin:$PATH" GATE_CHANGED=deploy/a.conf sh scripts/check.sh >/dev/null 2>&1) ||
	fail "check.sh failed in a repository with a change and GATE_CHANGED set"
scoped "a server change in a repository and GATE_CHANGED naming the deployment" typecheck - playwright sh:test_hooks
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
scoped "a staged gno change beside an unstaged server one" gno typecheck test - playwright sh:test_hooks
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
# A worktree's borrowed node_modules is a link, which .gitignore's folder rule misses: no change of code.
ln -s "$t" "$g/node_modules" && printf 'y\n' >>"$g/server/src/a.ts"
gate >/dev/null || fail "check.sh failed beside a linked node_modules"
scoped "a server change beside a linked node_modules" typecheck - playwright sh:test_hooks
rm "$g/node_modules" && reset
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
# A lane that fails at once leaves a slow one to finish.
(SLOW_STEP=py:check_docs FAIL=lint gate) >/dev/null && fail "check.sh passed with a failing lint"
ran sh:test_hooks || fail "a lane's failure stopped another lane before its end"
# Each lane's first and last step fail the gate, name their lane, and stop it.
for case in format:check:ts playwright:ts typecheck:types lint:types sh:ergo:tests test:tests gno:gno go:gno py:check_docs:docs sh:test_hooks:docs; do
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
# GATE_BUDGET lowers the budget, never raises it, and a value that is no number leaves it.
GATE_BUDGET=999 gate | grep -q "(budget 120 s)$" || fail "check.sh let GATE_BUDGET raise its budget"
GATE_BUDGET=abc gate | grep -q "(budget 120 s)$" || fail "check.sh took a GATE_BUDGET that is no number"
GATE_BUDGET= gate | grep -q "(budget 120 s)$" || fail "check.sh took an empty GATE_BUDGET"
(GATE_BUDGET=-5 gate) >/dev/null && fail "check.sh took a negative GATE_BUDGET as no budget"
printf 'y\n' >>"$g/server/src/a.ts"
GATE_BUDGET=999 gate | grep -q "(budget 30 s)$" || fail "check.sh let GATE_BUDGET raise a scoped run's budget"
reset
# A Vitest file or a journey that fails runs once more, alone; if it passes the gate passes and the file is logged for
# /pre-merge, with its failed tests and the load; a file that fails twice, or a failure with no report, refuses (F1700).
unsteady=$g/.claude/tmp/unsteady.log
tries() { grep -c "^$1\( \|$\)" "$log"; }
unsteady_case() { # $1 the step, $2 the tool, $3 the file it fails in (and one that passes), $4 the failed test, $5 the file that passes
	rm -rf "${unsteady:?}"
	out=$(LOAD_1="305 160" LOAD_2="305 160" LOAD_3="305 160" LOAD_4="305 160" LOAD_5="305 160" LOAD_6="305 160" FLAKY=$1 gate) || fail "check.sh failed a $2 run that passed the second time: $out"
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
	out=$(FAIL=$1 gate) && fail "check.sh passed with $1 failing twice"
	[ "$(tries "$1")" = 2 ] || fail "check.sh ran $1 $(tries "$1") times when it failed, not twice"
	printf '%s\n' "$out" | grep -q "failed twice" || fail "check.sh did not say $1 failed twice: $out"
	[ ! -e "$unsteady" ] || fail "check.sh logged a file of $1 that failed twice"
	# A failure with no report (a crash, a config error) is no flake: nothing runs again, and it is no pass.
	out=$(NOREPORT=1 FLAKY=$1 gate) && fail "check.sh passed a $1 failure that left no report"
	[ "$(tries "$1")" = 1 ] || fail "check.sh ran $1 again after a failure with no report"
	[ ! -e "$unsteady" ] || fail "check.sh logged a $1 failure with no report"
	# A report that names no failed file would run every file again: it refuses, with nothing run again.
	out=$(NOREPORT=empty FLAKY=$1 gate) && fail "check.sh passed a $1 failure whose report names no failed file"
	[ "$(tries "$1")" = 1 ] || fail "check.sh ran $1 again for a report that names no failed file"
	# A log that cannot be written (a folder where it goes): an unsteady test no one sees is not a pass.
	mkdir -p "$unsteady"
	out=$(FLAKY=$1 gate) && fail "check.sh passed an unsteady $1 test it could not log"
	printf '%s\n' "$out" | grep -q "cannot be written" || fail "check.sh did not say it could not log $1: $out"
	rm -rf "${unsteady:?}"
}
# What else the first run had is no flake a second run of the failed files could clear: an unhandled error (Vitest's JSON report
# holds none: its console does), Playwright's own errors, a failed file with no failed test (it did not load, or a hook failed).
# The run refuses with nothing run again and nothing logged, even when the failed file itself passes the second time (R1).
unsteady_refuses() { # $1 the step, $2 what else the run had (ALSO), $3 what check.sh says
	rm -rf "${unsteady:?}"
	out=$(ALSO=$2 FLAKY=$1 gate) && fail "check.sh passed a $1 run that also had: $2: $out"
	[ "$(tries "$1")" = 1 ] || fail "check.sh ran $1 again though the run also had: $2"
	printf '%s\n' "$out" | grep -qF "$3" || fail "check.sh did not say why it refused $1 with: $2: $out"
	[ ! -e "$unsteady" ] || fail "check.sh logged a $1 run that also had: $2"
	printf '%s\n' "$out" | grep -qF "$1 failed here" || fail "check.sh hid the first $1 run's own console when it refused: $out"
}
# Two files fail at once: both run again, in one run, and both are logged.
unsteady_two() { # $1 the step, $2 the first file, $3 the second, as the second run is given them
	rm -rf "${unsteady:?}"
	out=$(ALSO=two FLAKY=$1 gate) || fail "check.sh failed two $1 files that passed the second time: $out"
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
rm -rf "${c:?}" "${r:?}" && cp -R "$g" "$c" && rm -rf "${c:?}/.git" && mkdir -p "$r/node_modules" && ln -s "$r/node_modules" "$c/node_modules"
(g=$c && FLAKY=test gate >/dev/null) || fail "check.sh failed an unsteady test in a staged copy"
grep -qF "app/src/a.test.ts" "$r/.claude/tmp/unsteady.log" || fail "check.sh did not log a staged copy's unsteady test in the repository"
[ ! -e "$c/.claude/tmp/unsteady.log" ] || fail "check.sh logged a staged copy's unsteady test in the copy, which is deleted"
# A run that passes the first time runs nothing again and logs nothing.
gate >/dev/null || fail "check.sh failed a clean run"
[ "$(tries test)" = 1 ] && [ "$(tries playwright)" = 1 ] || fail "check.sh ran a passing step twice"
[ ! -e "$unsteady" ] || fail "check.sh logged a clean run"
# The log keeps each run's files: two unsteady runs leave two lines.
FLAKY=test gate >/dev/null && FLAKY=test gate >/dev/null && [ "$(grep -c "" "$unsteady")" = 2 ] || fail "check.sh did not append to the unsteady log"
rm -rf "${unsteady:?}"
# free_ports that fails fails each lane that asks it for ports, before its tool starts: the journeys' (E2E_PORT) and the pictures'
# (STORIES_PORT, a prefix assignment that swallowed the failure once: the tool then started with no port). A change of tokens.css
# runs both lanes (CR8, R2).
printf '\n' >>"$g/packages/ui/src/tokens.css"
out=$(PORTS_FAIL=1 gate) && fail "check.sh passed with no free port: $out"
printf '%s\n' "$out" | grep -q "^check.sh: lane ts failed at app" || fail "check.sh did not fail the journeys' lane at its app step when free_ports failed: $out"
printf '%s\n' "$out" | grep -q "^check.sh: lane pictures failed at pictures" || fail "check.sh did not fail the pictures' lane when free_ports failed: $out"
ran playwright && fail "check.sh started the journeys with no free port"
ran pictures && fail "check.sh started the pictures with no free port"
reset
fi

if part gate_times; then
gate_fixture gate_times
# Past its budget, the fast gate fails, names its slowest step as printed, and records nothing; each
# step's time is its own: a 2 s step prints 2 s, a quick one less than 1 s, its lane at least 2 s.
for slow in lint gno; do
	rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/gate-green"
	out=$(SLOW_STEP=$slow GATE_BUDGET=0 gate) && fail "check.sh passed over its budget"
	slowest=$(printf '%s\n' "$out" | sed -n 's/^lane [a-z]* [0-9.]* s: //p' | tr ',' '\n' | awk '{print $2, $1}' | sort -n | tail -1 | cut -d' ' -f2)
	printf '%s\n' "$out" | grep -q "over its 0 s budget: its slowest step, $slowest," || fail "check.sh did not name its slowest step, $slowest: $out"
	[ ! -e "$g/.claude/tmp/green-fast" ] && [ ! -e "$g/.claude/tmp/gate-green" ] || fail "check.sh recorded a gate past its budget"
	[ "$slow" = lint ] || continue
	printf '%s\n' "$out" | grep -qE '^lane types ([2-9]|[1-9][0-9])\.[0-9] s: .*lint [2-9]\.[0-9]' || fail "check.sh did not time the slow lint: $out"
	printf '%s\n' "$out" | grep -qE '^lane gno [0-9.]+ s: gno [0-9]+\.[0-9], mutate.py [0-9]+\.[0-9], go [0-9]+\.[0-9]$' || fail "check.sh did not time the gno lane's steps: $out"
	format=$(printf '%s\n' "$out" | sed -n 's/^lane ts .*format \([0-9]*\)\.\([0-9]\).*/\1\2/p') lint=$(printf '%s\n' "$out" | sed -n 's/^lane types .*lint \([0-9]*\)\.\([0-9]\).*/\1\2/p')
	[ -n "$format" ] && [ "$format" -lt "$lint" ] || fail "check.sh gave a quick step a slow one's time: $out"
done
# Past its budget on a machine busy both when it started and when it ended, its 1-minute load above its cores at both
# readings, the fast gate says so and passes (Alexis, 2026-10-26, C.8; Alexis, 2026-10-27, on the review's CR10): it
# measured the machine, not the code. A start reading alone excused a run begun just after another heavy one on an idle
# machine, the 1-minute average lagging by about a minute; an end reading alone includes the gate's own lanes (Vitest
# takes cores - 1 workers, beside four lanes), which a change making its own tests CPU-bound raises (security-S3). Both
# above the cores: the machine was busy before the lanes, and still is after them. At its cores, not above, it still fails.
busy=170 idle=10
rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/gate-green"
out=$(LOAD_1="$busy 160" LOAD_2="$busy 160" SLOW_STEP=lint GATE_BUDGET=0 gate) || fail "check.sh failed past its budget on a machine busy at its start and at its end: $out"
printf '%s\n' "$out" | grep -q "over its 0 s budget on a machine busy when it started and when it ended (load 17.0 then 17.0 on 16 cores): passed" ||
	fail "check.sh did not say it passed past its budget, the machine busy at both readings: $out"
grep -qxF "$(record)" "$g/.claude/tmp/green-fast" || fail "check.sh did not record the gate it passed on a busy machine"
# The load is read twice: first as the lanes start, before any of them runs, then last, once they have all ended.
[ "$(grep -c '^py:load' "$log")" = 2 ] || fail "check.sh did not read the load twice: $(grep -c '^py:load' "$log")"
[ "$(sed -n 1p "$log" | cut -d' ' -f1)" = py:load ] || fail "check.sh read the load after a lane had started: $(sed -n 1p "$log")"
[ "$(tail -1 "$log" | cut -d' ' -f1)" = py:load ] || fail "check.sh read the end load before its lanes had ended: $(tail -1 "$log")"
# Busy at the start only (a load left by the run before, decaying), or at the end only (the gate's own lanes) is no excuse.
for pair in "$busy $idle" "$idle $busy" "$idle $idle"; do
	set -- $pair
	rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/gate-green"
	out=$(LOAD_1="$1 160" LOAD_2="$2 160" SLOW_STEP=lint GATE_BUDGET=0 gate) && fail "check.sh passed past its budget with the load $1 at its start and $2 at its end: $out"
	printf '%s\n' "$out" | grep -q "find what grew" || fail "check.sh did not fail past its budget with the load $1 at its start and $2 at its end: $out"
	[ ! -e "$g/.claude/tmp/green-fast" ] || fail "check.sh recorded a gate past its budget with the load $1 at its start and $2 at its end"
done
# At its cores, not above, it still fails, at either reading: the other reading above the cores alone does not excuse it.
for pair in "160 160" "160 $busy" "$busy 160"; do
	set -- $pair
	rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/gate-green"
	out=$(LOAD_1="$1 160" LOAD_2="$2 160" SLOW_STEP=lint GATE_BUDGET=0 gate) && fail "check.sh passed past its budget with the load $1 at its start and $2 at its end, one at its cores, not above: $out"
	printf '%s\n' "$out" | grep -q "find what grew" || fail "check.sh did not fail past its budget with the load $1 at its start and $2 at its end, one at its cores: $out"
done
# A merge commit has no time budget (Alexis, 2026-10-28): the full gate follows every merge, and a merge's checks run on the
# merged tree, not on a change a work commit's budget could blame. It still says the time. A merge in progress is MERGE_HEAD, which
# git reads; the staged copy of pre-commit has no repository, so pre-commit tells it with GATE_MERGE=1 (never read in a repository,
# where an environment variable would switch the budget off for any run). A MERGE_HEAD git cannot read is no merge: the budget holds.
merge() { git -C "$g" rev-parse HEAD >"$g/.git/MERGE_HEAD"; }
rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/gate-green"
merge
out=$(LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) || fail "check.sh failed a merge in progress past its budget: $out"
printf '%s\n' "$out" | grep -qE "the fast gate took [0-9]+ s, past its 0 s budget, which a merge commit has none of \(the full gate follows it\); its slowest step, [a-z.]+, took [0-9.]+ s" ||
	fail "check.sh did not say the time of a merge past its budget: $out"
rm -f "$g/.git/MERGE_HEAD"
out=$(LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) && fail "check.sh passed a work commit past its budget once the merge was over: $out"
printf '%s\n' "$out" | grep -q "find what grew" || fail "check.sh did not fail a work commit past its budget once the merge was over: $out"
for garbage in "not a commit" ""; do
	printf '%s\n' "$garbage" >"$g/.git/MERGE_HEAD"
	out=$(LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) && fail "check.sh took an unreadable MERGE_HEAD ('$garbage') for a merge and let the budget off: $out"
	printf '%s\n' "$out" | grep -q "find what grew" || fail "check.sh did not fail past its budget with an unreadable MERGE_HEAD ('$garbage'): $out"
done
rm -f "$g/.git/MERGE_HEAD"
# GATE_MERGE is read in a staged copy alone: in a repository, a caller's variable switches no budget off.
out=$(GATE_MERGE=1 LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) && fail "check.sh let GATE_MERGE=1 switch the budget off in a repository: $out"
c=$g.merge
rm -rf "${c:?}" && cp -R "$g" "$c" && rm -rf "${c:?}/.git"
out=$(g=$c GATE_MERGE=1 LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) || fail "check.sh failed a staged copy of a merge past its budget: $out"
printf '%s\n' "$out" | grep -q "which a merge commit has none of" || fail "check.sh did not say the time of a staged copy of a merge: $out"
for v in 0 ""; do
	out=$(g=$c GATE_MERGE=$v LOAD_1="$idle 160" LOAD_2="$idle 160" SLOW_STEP=lint GATE_BUDGET=0 gate) && fail "check.sh let a staged copy of a work commit (GATE_MERGE='$v') past its budget: $out"
done
# Every pass the machine's load excused is appended to the unsteady log, with its time and its two loads, which /pre-merge reads
# (F2070: an agent ran the journeys beside its own commit to raise the load, and its slow commit passed as a busy machine's).
unsteady=$g/.claude/tmp/unsteady.log
rm -f "$unsteady" "$g/.claude/tmp/green-fast" "$g/.claude/tmp/gate-green"
out=$(LOAD_1="$busy 160" LOAD_2="$((busy + 20)) 160" SLOW_STEP=lint GATE_BUDGET=0 gate) || fail "check.sh failed past its budget on a busy machine: $out"
[ "$(grep -c "" "$unsteady")" = 1 ] || fail "check.sh did not log the pass a busy machine excused, once: $(cat "$unsteady" 2>&1)"
grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z	gate	' "$unsteady" && grep -q "over its 0 s budget" "$unsteady" && grep -q "load 17.0 then 19.0 on 16 cores" "$unsteady" && grep -q "slowest step" "$unsteady" ||
	fail "the unsteady log lacks the time, the loads or the step of the pass a busy machine excused: $(cat "$unsteady")"
# A pass under its budget, or one a merge needed no excuse for, logs nothing.
rm -f "$unsteady" && gate >/dev/null && merge && LOAD_1="$busy 160" LOAD_2="$busy 160" SLOW_STEP=lint GATE_BUDGET=0 gate >/dev/null; rm -f "$g/.git/MERGE_HEAD"
[ ! -e "$unsteady" ] || fail "check.sh logged a pass nothing excused: $(cat "$unsteady")"
# A pass no one sees is not a pass: a log that cannot be written fails it.
rm -rf "${unsteady:?}" "$g/.claude/tmp/green-fast" "$g/.claude/tmp/gate-green" && mkdir -p "$unsteady"
out=$(LOAD_1="$busy 160" LOAD_2="$busy 160" SLOW_STEP=lint GATE_BUDGET=0 gate) && fail "check.sh passed a busy machine's slow run with a log it cannot write: $out"
printf '%s\n' "$out" | grep -q "cannot be written" || fail "check.sh did not say its unsteady log cannot be written: $out"
[ ! -e "$g/.claude/tmp/green-fast" ] || fail "check.sh recorded a busy machine's pass it could not log"
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

if part gate_full; then
gate_fixture gate_full
# Core's Chromium run's stub, here alone: a fixture's node_modules folder would hide gate_triggers' linked one.
mkdir -p "$g/node_modules/vitest"
printf 'import { spawnSync } from "node:child_process";\nprocess.exit(spawnSync("sh", [%s, "core_chromium", "switch=" + (process.env.CORE_CHROMIUM ?? ""), ...process.argv.slice(2)], { stdio: "inherit" }).status ?? 1);\n' "'$step'" >"$g/node_modules/vitest/vitest.mjs"
# The full gate: every fast step but the plain tests, then the full ones in lanes, each told where the
# branch left main; harness_mutate only when the harness changed since main.
base=$(git -C "$g" rev-parse HEAD)
out=$(AUDIT_ANSWER=x PICTURES_OF=nothing STORIES_PORT=6007 STORIES_OUT=/elsewhere gate --full) || fail "check.sh --full failed on a copy whose every step passes: $out"
# The stories' walk is every story's, whatever PICTURES_OF the environment carries, and the tokens comparison is the fast
# gate's alone (F1190).
grep -q '^stories port=[^ ]* of= on= out= test -c app/playwright.stories.config.ts' "$log" || fail "check.sh --full let its environment narrow or redirect the stories' walk: $(grep '^stories' "$log")"
ran pictures && fail "check.sh --full compared the tokens story's pictures beside its whole walk"
for s in $fast_steps py:probe py:bench core_chromium stories coverage py:patch_coverage py:prove_fix mutate py:check_regressions py:check_migrations sh:scan_secrets py:audit; do
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
# A dirty tree of one area: --full still checks everything, and records it.
printf 'y\n' >>"$g/server/src/a.ts"
gate --full >/dev/null || fail "check.sh --full failed on a server change"
for s in $fast_steps; do [ "$s" = test ] || ran "$s" || fail "check.sh --full with a server change skipped $s"; done
nocache "--full with a server change"
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
# --merge, a merge's own review: the full gate's steps, the harness mutants of the merge's guard files
# alone, and no full record, which only --full writes (pre-push wants it for main).
rm -f "$g/.claude/tmp/green-fast" "$g/.claude/tmp/green-full"
base=$(git -C "$g" merge-base HEAD origin/main)
printf 'z\n' >>"$g/server/src/a.ts" && git -C "$g" commit -qam "product code"
out=$(gate --merge) || fail "check.sh --merge failed on a copy whose every step passes: $out"
for s in $fast_steps py:probe py:bench core_chromium stories coverage py:patch_coverage py:prove_fix mutate py:check_regressions py:check_migrations sh:scan_secrets py:audit; do
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
for s in $fast_steps py:probe py:bench py:batch_size py:check_regressions py:check_migrations sh:scan_secrets py:audit; do
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
# No origin/main to compare with: --full fails, saying so.
git -C "$g" update-ref -d refs/remotes/origin/main
out=$(gate --full) && fail "check.sh --full passed with no origin/main"
printf '%s\n' "$out" | grep -q "needs origin/main" || fail "check.sh --full did not say it needs origin/main: $out"
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

if part regressions; then
# check_regressions: its rules on small cases (the real run needs a base branch and Vitest).
python3 -I "$here/check_regressions.py" --self-test >/dev/null || fail "check_regressions's rules do not hold"
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
bench() { (cd "$b" && BENCH_FIXTURE="$b/report.json" python3 -I "$here/bench.py" 2>&1); }
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
# suite_parts.py: harness_mutate --changed judges the mutants of the sections a change touched, not all ~660 (twenty
# minutes) whenever a suite changed. A section of test_hooks.sh ends at the fi that closes it, nested ifs at the
# margin counted; one of probe.py at the next line as little indented; a change outside every section touches all.
python3 -I - "$here" <<'PY' || fail "suite_parts.py misread which sections a change touched (above)"
import sys
sys.dont_write_bytecode = True  # a mutant of the same size, written in the same second, would be read from its .pyc
sys.path.insert(0, sys.argv[1])
from suite_parts import select, touched
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
found = [("g1", "a.sh", "x", "hooks"), ("g2", "b.sh", "x", "hooks"), ("g3", "c.py", "x", "probe"), ("g4", "d.sh", "x", "hooks")]
names = {"a.sh": "a", "b.sh": "b,c", "c.py": "p", "d.sh": "d"}
labels = lambda chosen: [m[0] for m in chosen]
sections = lambda path, test: names[path]
assert labels(select(found, {"d.sh"}, {"hooks": {"c"}}, sections)) == ["g2", "g4"], "a changed guard file and a touched section"
assert labels(select(found, set(), {"hooks": None}, sections)) == ["g1", "g2", "g4"], "a suite changed outside its sections"
assert labels(select(found, set(), {}, sections)) == [], "nothing changed"
assert labels(select(found, set(), {"probe": {"p"}}, sections)) == ["g3"], "a probe block"
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
async function run(answer) {
  const calls = [];
  const agent = async (prompt, o) => { calls.push({ label: o.label, prompt, agentType: o.agentType, schema: o.schema }); return answer(o.label, prompt, o); };
  const parallel = async (ts) => Promise.all(ts.map((t) => t().catch(() => null)));
  const r = await body(agent, parallel, () => {}, () => {}, { branch: "b", worktree: "w", plan: "p", brief: "x", shared: "s", ids: "F9000-F9049" }, { spent: () => 0 });
  return { r, labels: calls.map((c) => c.label), calls };
}
const gateOf = (files) => ({ passed: true, failingLane: "", tail: "", survivors: [], files, relaxations: [], seconds: 1, branch: "b" });
const base = (files) => (l) =>
  l === "tests" ? { files: ["t"], seenFailing: true, notes: "" }
  : l === "red pass" ? { findings: [] }
  : l === "merge check" ? gateOf(files)
  : l === "build" || (l || "").startsWith("ledger") ? { commits: ["c"], notes: "", branch: "b" }
  : l === "reviewer" || l === "security" || l === "gno-auditor" ? { findings: [] } : null;
const idOf = (o, n) => o.schema.properties.verdicts.items.properties.id.enum[n];
(async () => {
  let t = await run(base(["app/src/a.ts"]));
  ok(t.r.status === "ready for the chief", `a clean branch is not ready: ${t.r.status}`);
  ok(!t.labels.includes("security") && !t.labels.some((l) => (l || "").startsWith("fix")), `a clean product branch ran ${t.labels}`);
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
  t = await run((l, p, o) =>
    l === "security" ? { findings: [finding("high", "scripts/a.sh")] }
    : l === "verifier" ? { verdicts: [{ id: idOf(o, 0), verdict: "reproduced", severity: "high", evidence: "e" }] }
    : (l || "").startsWith("fix round") ? { fixed: [{ id: p.match(/"id":"(security-\d-1)"/)[1], commit: "f" + l.slice(-1) }], notes: "", branch: "b" }
    : base(["scripts/a.sh"])(l, p));
  ok(t.r.status.startsWith("reconsider with Alexis"), `three rounds of high tier-1 findings ended as ${t.r.status}`);
  ok(t.labels.filter((l) => l === "reviewer").length === 1, `round 2 ran the reviewer again: ${t.labels}`);
  ok(t.calls.some((c) => c.label === "security" && c.prompt.includes("since f1^")), "round 2 did not read the diff since its first fix");
  // Read-only agents are told to write nothing; writers get the shared files.
  for (const c of t.calls) {
    const readOnly = ["red pass", "reviewer", "security", "gno-auditor", "verifier"].includes(c.label);
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

[ -z "${ONLY:-}" ] || [ "${ran:-}" = 1 ] || fail "ONLY=$ONLY names no section"
echo "hooks: ok"
finished=1
