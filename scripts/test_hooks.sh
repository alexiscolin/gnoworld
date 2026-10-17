#!/bin/sh
# test_hooks.sh: the git hooks do what docs/DEVELOPMENT.md says. check.sh runs it.
set -eu
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE # a `commit -a` hands its own index down; the throwaway repos must not touch it
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
here=$(cd "$(dirname "$0")" && pwd)
hooks=$(cd "$here/../.githooks" && pwd)
rp="$here"/review_pass.py # review_pass and pre_push both use it
t=$(mktemp -d "${TMPDIR:-/tmp}/test_hooks.XXXXXX")
# bash 3.2, macOS's sh, exits 0 through an EXIT trap after an unbound variable: `finished`, set
# on the last line, tells a run that reached its end from one that died on the way.
trap 'status=$?; rm -rf "$t" || :; [ "$status" != 0 ] || [ "${finished:-}" = 1 ] || status=1; exit "$status"' EXIT
fail() {
	echo "test_hooks: $*" >&2
	exit 1
}

# ONLY=<section>[,<section>...] runs only those sections: harness_mutate runs the one a guard
# belongs to. Unset, every section runs.
part() { case ",${ONLY:-$1}," in *",$1,"*) ran=1 && return 0 ;; *) return 1 ;; esac; }

if part wiring; then
# The wiring: settings.json runs each Claude Code hook, and check.sh runs every step it promises.
python3 -I - "$here/../.claude/settings.json" <<'PY' || fail "settings.json no longer wires a Claude Code hook"
import json, sys
hooks = json.load(open(sys.argv[1]))["hooks"]
wired = {event: " ".join(h["command"] for entry in hooks.get(event, []) for h in entry["hooks"]) for event in hooks}
assert "scripts/guard.py" in wired["PreToolUse"] and "scripts/format_hook.sh" in wired["PostToolUse"] and "scripts/stop_gate.sh" in wired["Stop"]
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
assert {"scripts", ".githooks", "package.json"} <= set(box["filesystem"]["denyWrite"]), "a command can rewrite the harness"
assert not any("api.github.com" in d for d in box["network"]["allowedDomains"]), "the GitHub API is reachable"
ask, deny = set(s["permissions"]["ask"]), set(s["permissions"]["deny"])
assert {"Edit(/scripts/**)", "Edit(/.githooks/**)", "Edit(/.claude/**)", "Edit(/packages/core/**)"} <= ask, "an edit of the harness or core asks no one"
assert {f"mcp__{p}__gno_{t}" for p in ("gnomcp", "plugin_gnomcp_gnomcp") for t in ("addpkg", "call", "run", "key_send", "cla_sign")} <= ask, "a chain write asks no one"
assert {"Read(~/.ssh/**)", "Read(~/.config/gh/**)"} <= deny, "the Read tool can open a credential"
# The sandbox turns Read denies into its own: one on dist, coverage or reports stops the gate
# reading node_modules' code, the coverage report or StrykerJS's incremental file.
assert not [r for r in deny if any(w in r for w in ("dist", "coverage", "reports"))], "a deny rule hides from the sandboxed gate what it reads"
market = s.get("extraKnownMarketplaces", {}).get("gnoverse", {}).get("source", {})
assert market.get("repo") == "gnoverse/gno-mcp", "a teammate's Claude Code cannot find gnomcp's marketplace"
PY
# check.sh runs every step it promises: removing one fails here.
gate_file="$here/check.sh"
for step in "run format:check" "run typecheck" "run lint" "run test" "run unused" "run copies" \
	"python3 -I scripts/check_css.py" "run comments" '"$GNO" lint ./...' '"$GNO" test ./...' \
	"python3 -I ../scripts/mutate.py" "go vet ./tools/..." "go run ./tools/sealvec | cmp" "python3 -I scripts/check_docs.py" \
	"sh scripts/test_hooks.sh" "python3 -I scripts/probe.py" "run coverage" "python3 -I scripts/patch_coverage.py" \
	"run mutate" "gitleaks git" "python3 -I scripts/harness_mutate.py" "python3 -I scripts/check_regressions.py" \
	'[ "$took" -gt 60 ]' "python3 -I scripts/prove_fix.py" "python3 -I scripts/audit.py"; do
	grep -v '^[[:space:]]*#' "$gate_file" | grep -qF -- "$step" || fail "check.sh no longer runs: $step"
done
# An EXIT trap keeps a failure: under macOS's sh, a plain one turns an unbound variable into exit 0.
for f in "$here"/*.sh "$hooks"/*; do
	grep -n "^[[:space:]]*trap .* EXIT$" "$f" | grep -v '|| status=1; exit "$status"' | grep -q . && fail "$(basename "$f") has an EXIT trap that can hide a failure"
done
# A temporary file goes in $TMPDIR: macOS's mktemp, given no template, uses the system's temp
# folder, which the sandbox forbids.
for f in "$here"/*.sh "$hooks"/*; do
	grep -nE '^[[:space:]]*[A-Za-z_]+=\$\(mktemp' "$f" | grep -vE 'mktemp (-d )?"\$\{TMPDIR:-/tmp\}/' | grep -q . && fail "$(basename "$f") makes a temporary file outside \$TMPDIR"
done
# Every gno package is mutated, gno/p as well as gno/r: discovery names no area.
grep -qF 'glob.glob("**/gnomod.toml"' "$here/mutate.py" || fail "mutate.py no longer mutates every gno package"
fi

if part commit_msg; then
# commit-msg: a conventional subject of 72 characters at most, or git's own merge and revert
# subjects; no attribution line.
refused() {
	printf '%s\n' "$1" >"$t/msg"
	! "$hooks/commit-msg" "$t/msg" 2>/dev/null
}
refused "fix: x

Co-Authored-By: a <noreply@anthropic.com>" || fail "a co-author line was accepted"
refused "fix: x

🤖 Generated with [Claude Code](https://claude.com/claude-code)" || fail "a robot line was accepted"
refused "fix: x

Generated by Claude Code" || fail "'Generated by Claude' was accepted"
refused "fix: x

Assisted-by: Claude" || fail "'Assisted-by' was accepted"
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
# stop_gate: it passes on a second stop, and on docs-only changes; it blocks (exit 2)
# when code changed and the gate fails. A throwaway repo with a failing fake gate.
gate="$here"/stop_gate.sh
r="$t/repo"
mkdir -p "$r/scripts" "$r/docs"
printf '#!/bin/sh\nexit 1\n' >"$r/scripts/check.sh"
cp "$here/code_changed.sh" "$r/scripts/"
git -C "$r" init -q && git -C "$r" add -A && git -C "$r" commit -qm init
stop() { printf '%s' "$1" | CLAUDE_PROJECT_DIR="$r" sh "$gate" 2>/dev/null; }
echo note >"$r/docs/n.md"
stop '{"stop_hook_active":false}' || fail "stop_gate blocked a docs-only change"
echo 'package x' >"$r/x.go"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate did not block a code change with a failing gate (exit $code)"
stop '{"stop_hook_active":true}' || fail "stop_gate blocked a second stop in a row"
rm "$r/x.go" && mkdir -p "$r/.claude" && echo '{}' >"$r/.claude/settings.json"
code=0; stop '{"stop_hook_active":false}' || code=$?
[ "$code" = 2 ] || fail "stop_gate let a settings.json change through a failing gate (exit $code)"
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
row "| F001 | 2026-10-17 | a | x.py:1 | a | claimed | — |
| F001 | 2026-10-17 | b | y.py:1 | b | claimed | — |" && fail "check_docs accepted an id used twice"
rm -r "$d/docs/review"
fi

if part format_hook; then
# format_hook: after an edit, eslint --fix rewrites the file; it never blocks.
fmt="$here"/format_hook.sh
repo=$(cd "$(dirname "$0")/.." && pwd)
probe="$repo/packages/core/src/__format_probe__.ts"
printf 'export type Point = { x: number };\nexport const  origin={x:0}\n' >"$probe"
printf '{"tool_input":{"file_path":"%s"}}' "$probe" | CLAUDE_PROJECT_DIR="$repo" sh "$fmt" || { rm -f "$probe"; fail "format_hook blocked an edit"; }
grep -q "interface Point" "$probe" || { rm -f "$probe"; fail "format_hook did not run eslint --fix"; }
grep -q "export const origin = { x: 0 };" "$probe" || { rm -f "$probe"; fail "format_hook did not run prettier"; }
rm -f "$probe"
fi

if part patch_coverage; then
# patch_coverage: the share of changed lines that the tests run, like a pull request's
# patch coverage, from Vitest's JSON report and git's diff.
patch="$here"/patch_coverage.py
c="$t/cov"
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
cp "$rp" "$here/repo_files.py" "$w/scripts/" && cp "$hooks/pre-push" "$w/.githooks/pre-push"
git -C "$w" init -q && echo x >"$w/a.ts" && git -C "$w" add -A && git -C "$w" commit -qm base
head=$(git -C "$w" rev-parse HEAD)
push() { printf 'refs/heads/%s %s refs/heads/%s 0000000000000000000000000000000000000000\n' "$1" "$head" "$1" | (cd "$w" && PATH="$t/pushbin:$PATH" sh .githooks/pre-push origin url >/dev/null 2>&1); }
push slice-1a || fail "pre-push refused a work branch whose gate passes"
[ "$(tail -n 1 "$w/gate.log")" = "gate " ] || fail "pre-push ran more than the fast gate for a work branch"
grep -q scanned "$w/leaks.log" || fail "pre-push did not scan a work branch for secrets"
LEAKS=1 push slice-1a && fail "pre-push let a work branch through with a secret found"
push main && fail "pre-push let main through with no review pass"
(cd "$w" && python3 -I scripts/review_pass.py record HEAD test >/dev/null)
push main && fail "pre-push let main through with a pass not yet committed"
git -C "$w" add -A && git -C "$w" commit -qm pass && head=$(git -C "$w" rev-parse HEAD)
push main || fail "pre-push refused main with a committed review pass"
[ "$(tail -n 1 "$w/gate.log")" = "gate --full" ] || fail "pre-push did not run the full gate for main"
printf '#!/bin/sh\nexit 1\n' >"$w/scripts/check.sh"
git -C "$w" add -A && git -C "$w" commit -qm "failing gate" && head=$(git -C "$w" rev-parse HEAD)
push slice-1a && fail "pre-push let a push through a failing gate"



# pre-push refuses a push of anything but the checked-out commit, clean.
echo y >"$w/b.ts" && git -C "$w" add -A && git -C "$w" commit -qm more
printf '#!/bin/sh\nexit 0\n' >"$w/scripts/check.sh"
old=$(git -C "$w" rev-parse HEAD~1)
printf 'refs/heads/x %s refs/heads/x 0000000000000000000000000000000000000000\n' "$old" | (cd "$w" && sh .githooks/pre-push origin url >/dev/null 2>&1) && fail "pre-push let through a commit other than the checked-out one"
echo dirty >>"$w/b.ts"
head=$(git -C "$w" rev-parse HEAD) && push slice-1a && fail "pre-push let through a tree with uncommitted changes"
git -C "$w" checkout -q -- b.ts
touch "$w/stray.ts" && push slice-1a && fail "pre-push let through a tree with an untracked file"
rm "$w/stray.ts"
fi

if part pre_commit; then
# pre-commit runs the gate on the staged files, and a failing gate stops the commit.
c2="$t/precommit"
mkdir -p "$c2/scripts" && git -C "$c2" init -q
printf '#!/bin/sh\nexit 1\n' >"$c2/scripts/check.sh" && cp "$here/code_changed.sh" "$here/borrow_node_modules.sh" "$here/check_docs.py" "$here/repo_files.py" "$c2/scripts/" && git -C "$c2" add -A && git -C "$c2" commit -qm base
echo code >"$c2/a.ts" && git -C "$c2" add a.ts
(cd "$c2" && sh "$hooks/pre-commit" >/dev/null 2>&1) && fail "pre-commit let a commit through a failing gate"
printf '#!/bin/sh\nexit 0\n' >"$c2/scripts/check.sh" && git -C "$c2" add -A
(cd "$c2" && sh "$hooks/pre-commit" >/dev/null 2>&1) || fail "pre-commit stopped a commit whose gate passes"
# A secret in what is staged stops the commit, docs included.
mkdir -p "$t/leakbin" && printf '#!/bin/sh\nexit 1\n' >"$t/leakbin/gitleaks" && chmod +x "$t/leakbin/gitleaks"
(cd "$c2" && PATH="$t/leakbin:$PATH" sh "$hooks/pre-commit" >/dev/null 2>&1) && fail "pre-commit let a commit through a secret scan that found one"
git -C "$c2" commit -qm code && mkdir -p "$c2/docs" && echo prose >"$c2/docs/a.md" && git -C "$c2" add docs/a.md
(cd "$c2" && sh "$hooks/pre-commit" >/dev/null 2>&1) || fail "pre-commit stopped a docs-only commit with no secret"
(cd "$c2" && PATH="$t/leakbin:$PATH" sh "$hooks/pre-commit" >/dev/null 2>&1) && fail "pre-commit let a docs-only commit through a secret scan that found one"
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
prove() { (cd "$pf" && PROVE_FIX_VITEST="$t/fake_vitest" python3 -I "$here/prove_fix.py" "$1" >/dev/null 2>&1); }
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
fi

if part regressions; then
# check_regressions: its rules on small cases (the real run needs a base branch and Vitest).
python3 -I "$here/check_regressions.py" --self-test >/dev/null || fail "check_regressions's rules do not hold"
fi

[ -z "${ONLY:-}" ] || [ "${ran:-}" = 1 ] || fail "ONLY=$ONLY names no section"
echo "hooks: ok"
finished=1
