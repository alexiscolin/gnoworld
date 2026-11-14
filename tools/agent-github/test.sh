#!/bin/sh
# The agent's helper (agent-pr) against local stand-ins for GitHub, gh and its own state: what it pushes and opens, what it
# refuses, and that nothing the calling session controls (its environment, its repository, its files, its HOME) reaches the
# token or runs outside the sandbox. Usage: sh test.sh [agent-pr]; from the sandbox; it needs git, python3 and gitleaks.
set -u
here=$(cd "$(dirname "$0")" && pwd)
helper=${1:-$here/agent-pr}
t=$(mktemp -d "${TMPDIR:-/tmp}/agent-pr-test.XXXXXX")
t=$(cd "$t" && pwd -P)
fails=0
fail() { echo "FAIL: $*" >&2; fails=$((fails + 1)); }
TOKEN=ghp_$(printf '%036d' 7) # made here: a token's shape written out is a finding for the secret scan
newsecret() { python3 -I -c 'import secrets, string; print("ghp_" + "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(36)))'; }
SECRET=$(newsecret)
GIT=$(command -v git)
g() { "$GIT" -c user.name=t -c user.email=t@t -c init.defaultBranch=main -c core.hooksPath=/dev/null -c core.fsmonitor=false "$@"; }

# The shipped helper: GitHub itself, a fixed PATH, its state from the password database (never HOME), the caller's space by uid.
grep -qx 'GITHUB = "https://github.com"' "$helper" || fail "the shipped helper does not push to https://github.com"
grep -qx 'TOOLS = "/opt/homebrew/bin:/usr/bin:/bin"' "$helper" || fail "the shipped helper's PATH is not the fixed one"
grep -qx 'STATE = os.path.join(pwd.getpwuid(os.getuid()).pw_dir, ".local/share/agent-github")' "$helper" || fail "the shipped helper's state does not come from the password database"
grep -qx 'SPACE = f"/private/tmp/claude-{os.getuid()}/"' "$helper" || fail "the shipped helper's space is not the caller's by uid"
head -1 "$helper" | grep -qx '#!/usr/bin/env -S -i LC_ALL=C /opt/homebrew/bin/python3 -I' || fail "the shipped helper does not start from an empty environment"
grep -nE 'os\.environ|getenv|expanduser|expandvars|\$HOME' "$helper" && fail "the helper reads its caller's environment"

# GitHub's stand-in: alexis/proj with main, and decoys a name check must keep it from: ../proj, proj.git.git, -alexis.
mkdir -p "$t/github/alexis" "$t/github/-alexis" "$t/state" "$t/space" "$t/outside" "$t/bin" "$t/nogl" "$t/glbad" "$t/glzero" "$t/evilbin" "$t/evilhome"
g init -q "$t/seed" && echo one >"$t/seed/a.txt" && g -C "$t/seed" add a.txt && g -C "$t/seed" commit -qm one
for r in github/alexis/proj.git proj.git github/alexis/proj.git.git github/-alexis/proj.git github/alexis/x.git; do
	g init -q --bare "$t/$r" && g -C "$t/seed" push -q "$t/$r" main
done
g clone -q "$t/github/alexis/proj.git" "$t/s"
g -C "$t/s" checkout -qb agent/feat && echo two >"$t/s/b.txt" && g -C "$t/s" add b.txt && g -C "$t/s" commit -qm two
g -C "$t/s" bundle create -q "$t/space/feat.bundle" agent/feat
printf '%s\n' "$TOKEN" >"$t/state/token" && chmod 600 "$t/state/token"
printf 'alexis/proj\nalexis/empty\nalexis/missing\n' >"$t/state/repos.allow"

# A recording git (argv and environment per call) first on the helper's PATH; a fake gh that keeps its arguments, environment
# and the body as it was when gh ran; gitleaks failing (2) and gitleaks scanning nothing (0, no output).
cat >"$t/bin/git" <<EOF
#!/bin/sh
{ echo "--- argv"; printf '%s\n' "\$@"; echo "--- env"; /usr/bin/env; } >>"$t/git.log"
exec "$GIT" "\$@"
EOF
cat >"$t/bin/gh" <<EOF
#!/bin/sh
printf '%s\n' "\$@" >"$t/gh.args"
env >"$t/gh.env"
for a in "\$@"; do case \$a in --body-file=*) cat "\${a#--body-file=}" >"$t/gh.body" ;; esac; done
echo https://github.com/alexis/proj/pull/7
EOF
printf '#!/bin/sh\ncase $1 in git) echo "INF 1 commits scanned."; exit 2 ;; esac\nexit 0\n' >"$t/glbad/gitleaks"
printf '#!/bin/sh\nexit 0\n' >"$t/glzero/gitleaks"
for f in "$t/bin/git" "$t/bin/gh" "$t/glbad/gitleaks" "$t/glzero/gitleaks"; do chmod +x "$f"; done
ln -s "$t/bin/git" "$t/nogl/git" && ln -s "$t/bin/gh" "$t/nogl/gh"
for tool in git gitleaks gh python3 env stat cat mktemp grep sh; do
	printf '#!/bin/sh\ntouch %s/ran\nexit 0\n' "$t" >"$t/evilbin/$tool" && chmod +x "$t/evilbin/$tool"
done
make() { # make <copy> <TOOLS>: the helper pointed at the stand-ins
	sed -e "s|^GITHUB = .*|GITHUB = \"file://$t/github\"|" -e "s|^TOOLS = .*|TOOLS = \"$2\"|" \
		-e "s|^STATE = .*|STATE = \"$t/state\"|" -e "s|^SPACE = .*|SPACE = \"$t/space/\"|" "$helper" >"$1"
	chmod +x "$1"
}
make "$t/agent-pr" "$t/bin:/opt/homebrew/bin:/usr/bin:/bin"
make "$t/agent-pr-nogl" "$t/nogl"
make "$t/agent-pr-glbad" "$t/glbad:$t/bin:/opt/homebrew/bin:/usr/bin:/bin"
make "$t/agent-pr-glzero" "$t/glzero:$t/bin:/opt/homebrew/bin:/usr/bin:/bin"
grep -q "^GITHUB = \"file://" "$t/agent-pr" && grep -q "^STATE = \"$t/state\"" "$t/agent-pr" || fail "the helper's constants could not be pointed at the stand-ins"
alltext=""
# Every call runs from inside the session's clone, as a session would call it, with the session's PATH and variables planted.
call() { # call <copy> <args...>
	c=$1; shift
	(cd "$t/s" && PATH="$t/evilbin:$PATH" HOME="$t/evilhome" TMPDIR="$t/evilhome" GIT_DIR="$t/s/.git" GIT_CONFIG_COUNT=1 \
		GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0="$t/evilhooks" GIT_CONFIG_PARAMETERS="'core.fsmonitor'='touch $t/ran'" \
		GIT_EXEC_PATH="$t/evilbin" GIT_ASKPASS="$t/evilbin/sh" GIT_SSH_COMMAND="touch $t/ran" GIT_TEMPLATE_DIR="$t/evilhome" \
		GIT_TRACE="$t/trace" GITLEAKS_CONFIG="$t/allowall.toml" GH_HOST=evil.example GH_REPO=evil/x GH_CONFIG_DIR="$t/evilhome" \
		GITHUB_TOKEN=ghp_evil GH_ENTERPRISE_TOKEN=ghp_evil DYLD_INSERT_LIBRARIES="$t/evil.dylib" PAGER="touch $t/ran" \
		"$c" "$@") >"$t/out" 2>&1
	rc=$?
	alltext="$alltext$(cat "$t/out")"
	return $rc
}
run() { call "$t/agent-pr" "$@"; }
remote() { "$GIT" -C "${2:-$t/github/alexis/proj.git}" rev-parse -q --verify "refs/heads/$1" 2>/dev/null || echo none; }
stateview() { (cd "$t/state" && find . -path ./tmp -prune -o -print | sort && cat token); }
leftover() { [ -z "$(ls -A "$t/state/tmp" 2>/dev/null)" ] || fail "$1: the helper left files in its temporary folder"; }
printf '[allowlist]\nregexes = [".*"]\npaths = [".*"]\n' >"$t/allowall.toml"
mkdir -p "$t/evilhooks" && printf '#!/bin/sh\ntouch %s/ran\n' "$t" >"$t/evilhooks/pre-push" && chmod +x "$t/evilhooks/pre-push"
printf '#!/bin/sh\ntouch %s/ran\n' "$t" >"$t/s/.git/hooks/pre-push" && chmod +x "$t/s/.git/hooks/pre-push"
g -C "$t/s" config core.fsmonitor "touch $t/ran"

# 1. It pushes the bundle's one agent branch, again with nothing new, and new commits on top.
run push alexis/proj "$t/space/feat.bundle" || fail "a good push failed: $(cat "$t/out")"
[ "$(remote agent/feat)" = "$(g -C "$t/s" rev-parse agent/feat)" ] || fail "the remote's agent/feat is not the bundle's commit"
run push alexis/proj "$t/space/feat.bundle" || fail "pushing the same commit again failed: $(cat "$t/out")"
echo more >"$t/s/b.txt" && g -C "$t/s" commit -qam more && g -C "$t/s" bundle create -q "$t/space/more.bundle" agent/feat
run push alexis/proj "$t/space/more.bundle" || fail "a new commit on top was refused: $(cat "$t/out")"
[ "$(remote agent/feat)" = "$(g -C "$t/s" rev-parse agent/feat)" ] || fail "the new commit did not reach the remote"
leftover "a push"

# 2. Nothing the session controls ran: its PATH's tools, its hooks, its fsmonitor, its variables; git saw none of them.
[ ! -e "$t/ran" ] || fail "something the session planted ran outside the sandbox"
[ ! -e "$t/trace" ] || fail "the session's GIT_TRACE reached git"
grep "$TOKEN" "$t/git.log" | grep -vqx "AGENT_TOKEN=$TOKEN" && fail "the token reached git otherwise than as AGENT_TOKEN in its environment"
grep -qx "AGENT_TOKEN=$TOKEN" "$t/git.log" || fail "no git call got the token to reach the remote"
awk '/^--- argv/{a=1;next} /^--- env/{a=0} a' "$t/git.log" | grep -q "$TOKEN" && fail "the token is in git's arguments"
awk '/^--- env/{e=1;next} /^--- argv/{e=0} e' "$t/git.log" | grep -E "^(GIT_DIR|GIT_CONFIG_COUNT|GIT_CONFIG_PARAMETERS|GIT_EXEC_PATH|GIT_ASKPASS|GIT_SSH_COMMAND|GIT_TEMPLATE_DIR|GIT_TRACE|DYLD_INSERT_LIBRARIES|PAGER|GH_HOST|GITHUB_TOKEN)=" && fail "a variable of the session reached git"
[ "$(grep -c '^--- argv' "$t/git.log")" = "$(grep -c '^GIT_CONFIG_NOSYSTEM=1$' "$t/git.log")" ] || fail "a git call ran without GIT_CONFIG_NOSYSTEM=1"
[ "$(grep -c '^--- argv' "$t/git.log")" = "$(grep -c '^GIT_CONFIG_GLOBAL=/dev/null$' "$t/git.log")" ] || fail "a git call read a global git config"
python3 -I - "$t/git.log" <<'PY' || fail "a git call of the helper's ran with hooks, or gitleaks ran git for more than reading"
import sys
calls = [c.split("\n--- env\n")[0].split("\n") for c in open(sys.argv[1]).read().split("--- argv\n")[1:]]
ours = [c for c in calls if c[:2] == ["-c", "core.hooksPath=/dev/null"]]
# gitleaks's own calls: the log it reads and the remote's name, nothing that writes.
theirs = [c for c in calls if c not in ours]
sys.exit(not ours or not all(c[2:3] == ["log"] or c[:3] == ["ls-remote", "--quiet", "--get-url"] for c in theirs))
PY
grep -q "^HOME=$t/evilhome" "$t/git.log" && fail "git ran with the session's HOME"
grep -rl "$TOKEN" "$t/state" | grep -v "^$t/state/token$" && fail "the token was written into the helper's state"
rm -f "$t/git.log"

# 3. Never a forced push: a rewritten agent branch is refused and the remote keeps its commit.
before=$(remote agent/feat)
g -C "$t/s" commit -q --amend -m rewritten && g -C "$t/s" bundle create -q "$t/space/rewritten.bundle" agent/feat
run push alexis/proj "$t/space/rewritten.bundle" && fail "a rewritten agent branch was pushed (a force push)"
[ "$(remote agent/feat)" = "$before" ] || fail "the remote's agent/feat moved on a rewrite"

# 4. One agent/** branch, a well-formed name, a v2 bundle: anything else is refused before anything is pushed.
main_before=$(remote main)
g -C "$t/s" checkout -q main && echo three >"$t/s/c.txt" && g -C "$t/s" add c.txt && g -C "$t/s" commit -qm three
g -C "$t/s" bundle create -q "$t/space/main.bundle" main
run push alexis/proj "$t/space/main.bundle" && fail "a bundle of main was pushed"
[ "$(remote main)" = "$main_before" ] || fail "main moved"
g -C "$t/s" branch -q feature/x main && g -C "$t/s" bundle create -q "$t/space/other.bundle" feature/x
run push alexis/proj "$t/space/other.bundle" && fail "a branch outside agent/ was pushed"
g -C "$t/s" branch -q agent/two main && g -C "$t/s" bundle create -q "$t/space/two.bundle" agent/two agent/feat
run push alexis/proj "$t/space/two.bundle" && fail "a bundle of two refs was pushed"
[ "$(remote agent/two)" = none ] || fail "one of two refs was pushed"
g -C "$t/s" tag -a v1 -m v1 main && g -C "$t/s" bundle create -q "$t/space/tag.bundle" v1
run push alexis/proj "$t/space/tag.bundle" && fail "a tag was pushed"
g -C "$t/s" bundle create -q "$t/space/head.bundle" HEAD
run push alexis/proj "$t/space/head.bundle" && fail "a bundle of HEAD was pushed"
# Names git itself would refuse, written into a bundle's header by hand: each refused, nothing pushed, nothing run.
g -C "$t/s" branch -q agent/base main && g -C "$t/s" bundle create -q "$t/space/base.bundle" agent/base
for bad in 'agent/x.lock' 'agent/../../main' 'agent/a\001b' 'agent/a;b' 'agent/-x' 'agent/' 'agent/.x' 'agent//x' 'agent/x.' 'agent/a b'; do
	python3 -I - "$t/space/base.bundle" "$t/space/hand.bundle" "$bad" <<'PY'
import sys
src, dst, bad = sys.argv[1], sys.argv[2], sys.argv[3].replace("\\001", "\x01")
data = open(src, "rb").read()
open(dst, "wb").write(data.replace(b"refs/heads/agent/base", b"refs/heads/" + bad.encode(), 1))
PY
	run push alexis/proj "$t/space/hand.bundle" && fail "the branch name '$bad' was pushed"
done
[ "$(remote agent/base)" = none ] || fail "a hand-written bundle's commit reached the remote"
python3 -I - "$t/space/base.bundle" "$t/space/v3.bundle" <<'PY'
import sys
data = open(sys.argv[1], "rb").read()
open(sys.argv[2], "wb").write(data.replace(b"# v2 git bundle\n", b"# v3 git bundle\n@filter=blob:none\n", 1))
PY
run push alexis/proj "$t/space/v3.bundle" && fail "a v3 bundle was taken"
[ ! -e "$t/ran" ] || fail "a hand-written bundle made something run"

# 5. The repository: owner/name and nothing else; a decoy a loose check would reach gets nothing; its state is unchanged.
view=$(stateview)
for bad in "../proj" "alexis/proj.git" "-alexis/proj" "alexis/proj/x" "alexis/.." "alexis" "" "alexis/" "/proj" "a/b%2e" \
	"$(printf 'alexis/proj\nx')" "a:b@evil/x" "https://evil/alexis/proj" "alexis/pr oj" "alexis/.proj"; do
	run push "$bad" "$t/space/feat.bundle" && fail "the repository '$bad' was taken"
done
for decoy in proj.git github/alexis/proj.git.git github/-alexis/proj.git; do
	[ "$(remote agent/feat "$t/$decoy")" = none ] || fail "a push reached the decoy $decoy"
done
[ "$(stateview)" = "$view" ] || fail "a refused repository name changed the helper's state"
# A repository it can reach but its allow list does not name is refused; with no allow list, every one is.
run push alexis/x "$t/space/feat.bundle" && fail "a repository off the allow list was taken"
[ "$(remote agent/feat "$t/github/alexis/x.git")" = none ] || fail "a push reached a repository off the allow list"
g -C "$t/s" checkout -q -b agent/noallow origin/main && echo na >"$t/s/na.txt" && g -C "$t/s" add na.txt && g -C "$t/s" commit -qm na
g -C "$t/s" bundle create -q "$t/space/noallow.bundle" agent/noallow
mv "$t/state/repos.allow" "$t/repos.bak"
run push alexis/proj "$t/space/noallow.bundle" && fail "it pushed with no allow list"
mv "$t/repos.bak" "$t/state/repos.allow"
[ "$(remote agent/noallow)" = none ] || fail "a push went out with no allow list"
# A name the allow list holds by mistake is still refused when it is not owner/name: the list is no way around the check.
cp "$t/state/repos.allow" "$t/repos.bak"
printf '../proj\nalexis/proj.git\n-alexis/proj\n' >>"$t/state/repos.allow"
for bad in "../proj" "alexis/proj.git" "-alexis/proj"; do
	run push "$bad" "$t/space/noallow.bundle" && fail "a malformed name on the allow list was taken: $bad"
done
for decoy in proj.git github/alexis/proj.git.git github/-alexis/proj.git; do
	[ "$(remote agent/noallow "$t/$decoy")" = none ] || fail "a malformed name on the allow list reached $decoy"
done
mv "$t/repos.bak" "$t/state/repos.allow"

# 6. Files are read from the caller's space only, following no link at any step, and only a real bundle is taken. The
# bundle outside would push if it were read; the space written /tmp/... (the session's own spelling) is the same space.
g -C "$t/s" checkout -q -b agent/outside main && echo out >"$t/s/o.txt" && g -C "$t/s" add o.txt && g -C "$t/s" commit -qm out
g -C "$t/s" bundle create -q "$t/outside/out.bundle" agent/outside
mkdir -p "$t/space/sub" && ln -s "$t/outside" "$t/space/dirlink" && ln -s "$t/outside/out.bundle" "$t/space/link.bundle"
sibling="${t}/space-evil" && mkdir -p "$sibling" && cp "$t/outside/out.bundle" "$sibling/out.bundle"
for bad in "$t/outside/out.bundle" "$t/space/link.bundle" "$t/space/dirlink/out.bundle" "$t/space/sub/../../outside/out.bundle" \
	"$sibling/out.bundle" "/private/tmp/claude-0/x.bundle" "space/out.bundle" "$t/space/missing.bundle" /etc/hosts; do
	run push alexis/proj "$bad" && fail "a bundle outside the space was read: $bad"
done
[ "$(remote agent/outside)" = none ] || fail "a bundle from outside the space reached the remote"
printf 'not a bundle\n' >"$t/space/junk.bundle"
run push alexis/proj "$t/space/junk.bundle" && fail "a file that is no bundle was taken"
cp "$t/outside/out.bundle" "$t/space/out.bundle"
case $t in /private/tmp/*) run push alexis/proj "${t#/private}/space/out.bundle" || fail "the space written /tmp/... was refused: $(cat "$t/out")" ;; *) fail "the test's folder is not under /private/tmp" ;; esac
[ "$(remote agent/outside)" != none ] || fail "the bundle from the space written /tmp/... did not land"

# 7. The token: missing, a link, open to others, or not exactly one token line; nothing is pushed; 400 is taken.
tok="$t/state/token"
g -C "$t/s" checkout -q -b agent/tok main && echo tok >"$t/s/t.txt" && g -C "$t/s" add t.txt && g -C "$t/s" commit -qm tok
g -C "$t/s" bundle create -q "$t/space/tok.bundle" agent/tok
mv "$tok" "$tok.bak"
run push alexis/proj "$t/space/tok.bundle" && fail "it pushed with no token"
ln -s "$tok.bak" "$tok"
run push alexis/proj "$t/space/tok.bundle" && fail "it followed a link to the token"
rm "$tok"
for mode in 644 640 604 666 755; do
	cp "$tok.bak" "$tok" && chmod "$mode" "$tok"
	run push alexis/proj "$t/space/tok.bundle" && fail "it took a token file of mode $mode"
	rm -f "$tok"
done
for bad in "$(printf '%s\n%s' "$TOKEN" "$TOKEN")" "ghp_x\$(touch $t/ran)" "$(printf '%s\r' "$TOKEN")" "$TOKEN " "not a token" ""; do
	printf '%s\n' "$bad" >"$tok" && chmod 600 "$tok"
	run push alexis/proj "$t/space/tok.bundle" && fail "it took a token file holding: $bad"
done
[ "$(remote agent/tok)" = none ] || fail "a push went out without a usable token"
cp "$tok.bak" "$tok" && chmod 400 "$tok"
run push alexis/proj "$t/space/tok.bundle" || fail "a token file of mode 400 was refused: $(cat "$t/out")"
[ "$(remote agent/tok)" != none ] || fail "the control push after the token tests did not land"
chmod 600 "$tok"

# 8. A secret in any pushed commit stops the push: in a file, added then removed, hidden from diffs, allowed by the
# repository's own gitleaks files, by an allow comment, or brought in by a merge; and again with a clean commit on top.
leak() { # leak <branch> <commands...>: a branch from main where the commands put SECRET somewhere
	b=$1; shift
	g -C "$t/s" checkout -q -b "$b" main && (cd "$t/s" && eval "$@") && g -C "$t/s" bundle create -q "$t/space/leak.bundle" "$b"
	run push alexis/proj "$t/space/leak.bundle" && fail "a secret went out: $b"
	[ "$(remote "$b")" = none ] || fail "$b reached the remote"
}
S=$SECRET
leak agent/leak-txt "printf 'key = \"%s\"\n' $S >k.txt && g add k.txt && g commit -qm k"
leak agent/leak-history "printf 'key = \"%s\"\n' $S >k.txt && g add k.txt && g commit -qm k && g rm -q k.txt && g commit -qm gone"
leak agent/leak-nodiff "printf '* -diff\n' >.gitattributes && printf 'key = \"%s\"\n' $S >k.txt && g add .gitattributes k.txt && g commit -qm k"
leak agent/leak-config "printf '[allowlist]\nregexes = [\".*\"]\npaths = [\".*\"]\n' >.gitleaks.toml && printf 'key = \"%s\"\n' $S >k.txt && g add .gitleaks.toml k.txt && g commit -qm k"
leak agent/leak-ignore "printf 'key = \"%s\"\n' $S >k.txt && g add k.txt && g commit -qm k && printf '%s:k.txt:github-pat:1\n' \$(g rev-parse HEAD) >.gitleaksignore && g add .gitleaksignore && g commit -qm ignore"
leak agent/leak-allow "printf 'key = \"%s\" # gitleaks:allow\n' $S >k.txt && g add k.txt && g commit -qm k"
leak agent/leak-merge "echo m >m.txt && g add m.txt && g commit -qm m && g checkout -q -b agent/side main && echo s >s.txt && g add s.txt && g commit -qm s && g checkout -q agent/leak-merge && g merge -q --no-commit agent/side && printf 'key = \"%s\"\n' $S >k.txt && g add k.txt && g commit -qm merge"
leak agent/leak-replay "printf 'key = \"%s\"\n' $S >k.txt && g add k.txt && g commit -qm k"
g -C "$t/s" checkout -q agent/leak-replay && echo clean >"$t/s/clean.txt" && g -C "$t/s" add clean.txt && g -C "$t/s" commit -qm clean
g -C "$t/s" bundle create -q "$t/space/replay.bundle" agent/leak-replay
run push alexis/proj "$t/space/replay.bundle" && fail "a secret went out under a clean commit, after a first refusal"
[ "$(remote agent/leak-replay)" = none ] || fail "agent/leak-replay reached the remote"
# A clean merge pushes: every commit, the merge too, is read.
g -C "$t/s" checkout -q -b agent/merge main && echo m >"$t/s/mm.txt" && g -C "$t/s" add mm.txt && g -C "$t/s" commit -qm mm
g -C "$t/s" merge -q --no-edit agent/side && g -C "$t/s" bundle create -q "$t/space/merge.bundle" agent/merge
run push alexis/proj "$t/space/merge.bundle" || fail "a clean merge was refused: $(cat "$t/out")"

# 8b. A secret in what the commits say about themselves stops the push: a message, a file's name, an author, the branch's name.
leak agent/leak-message "echo m >m1.txt && g add m1.txt && g commit -qm 'the key $S'"
leak agent/leak-name "echo m >'$S.txt' && g add '$S.txt' && g commit -qm name"
leak agent/leak-author "echo m >m2.txt && g add m2.txt && \"\$GIT\" -c user.name=$S -c user.email=t@t -c core.hooksPath=/dev/null -c core.fsmonitor=false commit -qm author"
leak "agent/$S" "echo m >m3.txt && g add m3.txt && g commit -qm branch"
# 8c. What runs on GitHub (a workflow, an action) is a person's to push: refused, added, changed or removed.
leak agent/wf-add "mkdir -p .github/workflows && printf 'on: push\n' >.github/workflows/x.yml && g add .github && g commit -qm wf"
leak agent/wf-action "mkdir -p .github/actions/a && printf 'runs: {}\n' >.github/actions/a/action.yml && g add .github && g commit -qm act"
leak agent/wf-later "echo a >w1.txt && g add w1.txt && g commit -qm a && mkdir -p .github/workflows && printf x >.github/workflows/y.yml && g add .github && g commit -qm wf && g rm -q .github/workflows/y.yml && g commit -qm gone"
# 9. gitleaks missing, failing, or scanning nothing: nothing is pushed. With only git and gitleaks on its PATH it works.
g -C "$t/s" checkout -q -b agent/gl origin/main && echo gl >"$t/s/gl.txt" && g -C "$t/s" add gl.txt && g -C "$t/s" commit -qm gl
g -C "$t/s" bundle create -q "$t/space/gl.bundle" agent/gl
call "$t/agent-pr-nogl" push alexis/proj "$t/space/gl.bundle" && fail "it pushed with no gitleaks"
grep -q gitleaks "$t/out" || fail "a missing gitleaks was not named: $(cat "$t/out")"
call "$t/agent-pr-glbad" push alexis/proj "$t/space/gl.bundle" && fail "it pushed when gitleaks failed"
call "$t/agent-pr-glzero" push alexis/proj "$t/space/gl.bundle" && fail "it pushed when gitleaks scanned nothing"
[ "$(remote agent/gl)" = none ] || fail "a push went out unscanned"
ln -s "$(command -v gitleaks)" "$t/nogl/gitleaks"
call "$t/agent-pr-nogl" push alexis/proj "$t/space/gl.bundle" || fail "with git and gitleaks alone on its PATH it failed: $(cat "$t/out")"

# 9b. Its clean copy holding config or alternates it did not write (a redirect, a credential helper): refused, nothing pushed.
cache="$t/state/repos/alexis/proj.git"
cp "$cache/config" "$t/config.bak"
g -C "$t/s" checkout -q -b agent/cache main && echo cache >"$t/s/ca.txt" && g -C "$t/s" add ca.txt && g -C "$t/s" commit -qm cache
g -C "$t/s" bundle create -q "$t/space/cache.bundle" agent/cache
printf '[url "file://%s/"]\n\tinsteadOf = file://%s/github/alexis/\n' "$t" "$t" >>"$cache/config"
run push alexis/proj "$t/space/cache.bundle" && fail "it pushed through a clean copy whose config redirects the remote"
[ "$(remote agent/cache "$t/proj.git")" = none ] || fail "a redirect in the clean copy sent the push elsewhere"
cp "$t/config.bak" "$cache/config" && printf '[credential]\n\thelper = !touch %s/ran\n' "$t" >>"$cache/config"
run push alexis/proj "$t/space/cache.bundle" && fail "it pushed through a clean copy holding a credential helper"
cp "$t/config.bak" "$cache/config" && echo "$t/outside" >"$cache/objects/info/alternates"
run push alexis/proj "$t/space/cache.bundle" && fail "it pushed through a clean copy with alternates"
rm "$cache/objects/info/alternates"
run push alexis/proj "$t/space/cache.bundle" || fail "the clean copy restored, the push failed: $(cat "$t/out")"

# 10. A remote it cannot read, or with no default branch: nothing is pushed.
g init -q --bare "$t/github/alexis/empty.git"
run push alexis/empty "$t/space/gl.bundle" && fail "it pushed to a remote with no default branch"
run push alexis/missing "$t/space/gl.bundle" && fail "it pushed to a remote that does not exist"

# 11. Opening a pull request from one file (the title, a blank line, the body): gh gets the token in its environment alone,
# and the body as the helper copied it.
printf 'A title\n\nThe body\n' >"$t/space/pr.md"
run open alexis/proj agent/feat "$t/space/pr.md" || fail "opening a pull request failed: $(cat "$t/out")"
args=$(cat "$t/gh.args" 2>/dev/null)
printf '%s\n' "$args" | head -5 | tr '\n' ' ' | grep -qx 'pr create --repo=alexis/proj --head=agent/feat --title=A title ' || fail "gh was called with other arguments: $args"
case $args in *"--body-file=$t/space/"*) fail "gh read the session's file itself, not the helper's copy" ;; esac
[ "$(cat "$t/gh.body" 2>/dev/null)" = "The body" ] || fail "gh did not get the body as written: $(cat "$t/gh.body" 2>/dev/null)"
grep -qx "GH_TOKEN=$TOKEN" "$t/gh.env" || fail "gh did not get the token in its environment"
extra=$(sed 's/=.*//' "$t/gh.env" | grep -vxE 'PATH|HOME|LC_ALL|TMPDIR|GIT_CONFIG_NOSYSTEM|GIT_CONFIG_GLOBAL|GIT_TERMINAL_PROMPT|GH_TOKEN|GH_CONFIG_DIR|GH_PROMPT_DISABLED|GH_NO_UPDATE_NOTIFIER|NO_COLOR|PWD|SHLVL|_')
[ -z "$extra" ] || fail "gh got variables beyond its list: $extra"
grep -q "^GH_CONFIG_DIR=$t/state/tmp/" "$t/gh.env" || fail "gh's config folder is not the helper's own"
grep -q "$TOKEN" "$t/gh.args" && fail "the token is in gh's arguments"
leftover "opening a pull request"
printf -- '-x\n\nb\n' >"$t/space/dash.md"
run open alexis/proj agent/feat "$t/space/dash.md" || fail "a title starting with - was refused"
grep -qx -- "--title=-x" "$t/gh.args" || fail "a title starting with - did not reach gh as the title"
rm -f "$t/gh.args"
printf 'T\n\nThe key: %s\n' "$SECRET" >"$t/space/leak.md"
printf 'key %s\n\nb\n' "$SECRET" >"$t/space/leaktitle.md"
printf '\n\nno title\n' >"$t/space/notitle.md"
python3 -I -c 'import sys; open(sys.argv[1], "w").write("x" * 300 + "\n\nb\n")' "$t/space/long.md"
ln -s /etc/hosts "$t/space/link.md"
for args in "alexis/proj main $t/space/pr.md" "alexis/proj agent/ $t/space/pr.md" "alexis/proj agent/feat /etc/hosts" \
	"alexis/proj agent/feat $t/space/link.md" "alexis/proj agent/feat $t/outside/out.bundle" "../x agent/feat $t/space/pr.md" \
	"alexis/x agent/feat $t/space/pr.md" "alexis/proj agent/feat $t/space/leak.md" "alexis/proj agent/feat $t/space/leaktitle.md" \
	"alexis/proj agent/feat $t/space/notitle.md" "alexis/proj agent/feat $t/space/long.md" "alexis/proj agent/$SECRET $t/space/pr.md" \
	"alexis/proj agent/feat" "alexis/proj agent/feat $t/space/pr.md extra"; do
	# shellcheck disable=SC2086 # each case is its words
	run open $args && fail "open took: $args"
done
[ ! -e "$t/gh.args" ] || fail "gh ran on a refused call"

# 11b. Over HTTPS git asks its credential helper: the helper's answers the token from the environment, as x-access-token.
cred=$(python3 -I -c 'import ast, sys
for n in ast.parse(open(sys.argv[1]).read()).body:
    if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "CREDENTIAL":
        print(n.value.value)' "$helper")
got=$(printf 'protocol=https\nhost=github.com\npath=alexis/proj.git\n\n' | env -i PATH=/usr/bin:/bin AGENT_TOKEN="$TOKEN" GIT_TERMINAL_PROMPT=0 \
	GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null "$GIT" -c credential.helper= -c "credential.helper=$cred" credential fill 2>/dev/null)
printf '%s\n' "$got" | grep -qx "password=$TOKEN" && printf '%s\n' "$got" | grep -qx "username=x-access-token" ||
	fail "the credential helper does not answer the token from the environment"
got=$(printf 'protocol=https\nhost=evil.example\npath=alexis/proj.git\n\n' | env -i PATH=/usr/bin:/bin AGENT_TOKEN="$TOKEN" GIT_TERMINAL_PROMPT=0 \
	GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null "$GIT" -c credential.helper= -c "credential.helper=$cred" credential fill 2>/dev/null)
case $got in *"$TOKEN"*) fail "the credential helper gave the token to another host than github.com" ;; esac

# 13. Two pushes at once (a slow gitleaks widens the window): each pushes the commit it scanned; a secret never rides on the
# other's scan (the security review's race: a shared ref, pushed by name).
mkdir -p "$t/glslow" && printf '#!/bin/sh\n/opt/homebrew/bin/gitleaks "$@"; rc=$?; sleep 3; exit $rc\n' >"$t/glslow/gitleaks" && chmod +x "$t/glslow/gitleaks"
make "$t/agent-pr-slow" "$t/glslow:$t/bin:/opt/homebrew/bin:/usr/bin:/bin"
g -C "$t/s" checkout -q -b race-clean origin/main && echo clean >"$t/s/r.txt" && g -C "$t/s" add r.txt && g -C "$t/s" commit -qm clean
g -C "$t/s" branch -q -f agent/race race-clean && g -C "$t/s" bundle create -q "$t/space/raceA.bundle" agent/race
g -C "$t/s" checkout -q -b race-leak origin/main && printf 'key = "%s"\n' "$SECRET" >"$t/s/r.txt" && g -C "$t/s" add r.txt && g -C "$t/s" commit -qm leak
g -C "$t/s" branch -q -f agent/race race-leak && g -C "$t/s" bundle create -q "$t/space/raceB.bundle" agent/race
(cd "$t/s" && "$t/agent-pr-slow" push alexis/proj "$t/space/raceA.bundle") >"$t/outA" 2>&1 &
pa=$!
sleep 1
(cd "$t/s" && "$t/agent-pr-slow" push alexis/proj "$t/space/raceB.bundle") >"$t/outB" 2>&1 &
pb=$!
wait "$pa"; ra=$?
wait "$pb"; rb=$?
[ "$ra" = 0 ] || fail "the clean push of the race failed: $(cat "$t/outA")"
[ "$rb" != 0 ] || fail "the leaking push of the race went out"
[ "$(remote agent/race)" = "$(g -C "$t/s" rev-parse race-clean)" ] || fail "the race pushed another commit than the one scanned"
"$GIT" -C "$t/github/alexis/proj.git" grep -q "$SECRET" agent/race 2>/dev/null && fail "a secret reached the remote through the race"
alltext="$alltext$(cat "$t/outA" "$t/outB")"

# 14. The guard hook: a call naming the helper is taken in its one form alone; no reading tool names the state folder.
H=/opt/agent/.local/bin/agent-pr
U=$(id -u)
guard() { printf '%s' "$1" | python3 -I "$here/agent_pr_guard.py" "$H" >/dev/null 2>&1; }
bash_call() { python3 -I -c 'import json, sys; print(json.dumps({"tool_name": "Bash", "tool_input": {"command": sys.argv[1]}}))' "$1"; }
for ok in "$H push alexis/proj /tmp/claude-$U/a/b.bundle" "$H push alexis/proj /private/tmp/claude-$U/x.bundle" \
	"$H open alexis/proj agent/x /tmp/claude-$U/a/pr.md" "git status" "ls tools/agent-github"; do
	guard "$(bash_call "$ok")" || fail "the guard refused: $ok"
done
for bad in "$H push alexis/proj /tmp/claude-$U/a/b.bundle; cat x" "$H push alexis/proj /tmp/claude-$U/a/b.bundle && cat x" \
	"$H push alexis/proj /tmp/claude-$U/*.bundle" "$H push alexis/proj /tmp/claude-$U/*(e:'touch x':)" \
	"$H push alexis/proj \$(cat x)" "$H push alexis/proj /tmp/claude-$U/a/../../etc/hosts" "$H push alexis/proj /tmp/claude-0/a.bundle" \
	"HOME=/tmp $H push alexis/proj /tmp/claude-$U/a.bundle" "~/.local/bin/agent-pr push alexis/proj /tmp/claude-$U/a.bundle" \
	"$H push alexis/proj /tmp/claude-$U/a.bundle > /tmp/claude-$U/o" "$(printf '%s\n%s' "$H push alexis/proj /tmp/claude-$U/a.bundle" "cat x")" \
	"$H push alexis/proj /tmp/claude-$U/a.bundle extra" "$H open alexis/proj main /tmp/claude-$U/a/pr.md" \
	"cat ~/.local/share/agent-github/token" "sh -c 'cat /opt/agent/.local/share/agent-github/token'"; do
	guard "$(bash_call "$bad")" && fail "the guard took: $bad"
done
for reader in '{"tool_name": "Read", "tool_input": {"file_path": "/opt/agent/.local/share/agent-github/token"}}' \
	'{"tool_name": "Grep", "tool_input": {"pattern": "ghp_", "path": "../../.local/share/agent-github"}}' \
	'{"tool_name": "Glob", "tool_input": {"pattern": "**/*", "path": "/opt/agent/.local/share/agent-github"}}'; do
	guard "$reader" && fail "the guard let a tool read the state folder: $reader"
done
guard '{"tool_name": "Read", "tool_input": {"file_path": "tools/agent-github/agent-pr"}}' || fail "the guard refused reading the helper's source"
guard '{"tool_name": "Write", "tool_input": {"file_path": "notes.md", "content": "the state is ~/.local/share/agent-github"}}' ||
	fail "the guard refused a write that only names the folder"

# 12. Its usage, and the token never in anything it printed.
run && fail "no arguments passed"
run fetch alexis/proj && fail "an unknown command passed"
run push alexis/proj && fail "push with no bundle passed"
run push alexis/proj "$t/space/feat.bundle" extra && fail "push with an extra argument passed"
case $alltext in *"$TOKEN"*) fail "the token appeared in its output" ;; esac
[ ! -e "$t/ran" ] || fail "something the session planted ran outside the sandbox"

[ "$fails" = 0 ] && { rm -rf "$t"; echo "agent-pr: all passed"; } || { echo "agent-pr: $fails failed (kept: $t)" >&2; exit 1; }
