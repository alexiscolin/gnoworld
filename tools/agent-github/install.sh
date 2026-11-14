#!/bin/sh
# Installs the agent's helper for every project and every Claude profile on this Mac (gnoworld's D13159, D13160), from one
# reviewed commit: agent-pr, its guard hook, its skill, its state folder and allow list, and in each profile's settings the
# denies, the exclusion and the hook. Then it asks for the agent account's token, which nothing shows. Run it in your own
# Terminal, from the repository, never from Claude Code:
#   sh <(git show <commit>:tools/agent-github/install.sh) <commit> <owner/repo>...    (the token alone again: ... --token)
set -eu
state="$HOME/.local/share/agent-github"
helper="$HOME/.local/bin/agent-pr"
hook="$HOME/.claude/hooks/agent_pr_guard.py"

ask_token() {
	printf 'Paste the agent account token (classic, scope repo only, never workflow); nothing shows; Enter alone to skip: '
	trap 'stty echo' EXIT INT TERM
	stty -echo
	IFS= read -r token || token=
	stty echo
	trap - EXIT INT TERM
	echo
	if [ -z "$token" ]; then
		echo "no token written; later: the same command with --token"
		return 0
	fi
	case $token in
	ghp_*) ;;
	*) echo "that is not a classic token (ghp_...); nothing written" >&2; return 1 ;;
	esac
	(umask 077 && printf '%s\n' "$token" >"$state/token.new" && mv "$state/token.new" "$state/token")
	echo "token written ($state/token, mode 600). Clear the clipboard, and restart Claude Code's sessions."
}

if [ "${1:-}" = --token ]; then
	ask_token
	exit 0
fi
sha=${1:-}
case $sha in
[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) ;;
*) echo "usage: install.sh <commit> <owner/repo>... (the commit you reviewed, as git names it)" >&2; exit 2 ;;
esac
shift
[ $# -ge 1 ] || { echo "name at least one repository the agent may push to (owner/repo)" >&2; exit 2; }
for repo in "$@"; do
	printf '%s\n' "$repo" | grep -Eqx '[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_][A-Za-z0-9._-]{0,99}' ||
		{ echo "not a repository written owner/name: $repo" >&2; exit 2; }
done
show() { git show "$sha:tools/agent-github/$1"; }
show agent-pr >/dev/null

install -d -m 755 "$HOME/.local/bin" "$HOME/.claude/hooks"
install -d -m 700 "$state"
show agent-pr >"$helper.new" && chmod 755 "$helper.new" && mv "$helper.new" "$helper"
show agent_pr_guard.py >"$hook.new" && chmod 644 "$hook.new" && mv "$hook.new" "$hook"
touch "$state/repos.allow" && chmod 600 "$state/repos.allow"
for repo in "$@"; do grep -qx "$repo" "$state/repos.allow" || printf '%s\n' "$repo" >>"$state/repos.allow"; done

for profile in "$HOME/.claude" "$HOME"/.claude-*; do
	[ -f "$profile/settings.json" ] || continue
	install -d -m 755 "$profile/skills/agent-github"
	show SKILL.md | sed "s|@HELPER@|$helper|g" >"$profile/skills/agent-github/SKILL.md"
	cp "$profile/settings.json" "$profile/settings.json.bak-agent-github-$(date +%Y%m%d%H%M%S)"
	/opt/homebrew/bin/python3 -I - "$profile" "$helper" "$hook" <<'PY'
import json, os, sys, tempfile
profile, helper, hook = sys.argv[1:4]
path = os.path.join(profile, "settings.json")
with open(path) as f:
    s = json.load(f)
def add(lst, item):
    if item not in lst:
        lst.append(item)
home = os.path.expanduser("~")
tilde = lambda p: p.replace(home, "~", 1)
deny = s.setdefault("permissions", {}).setdefault("deny", [])
for rule in ("Read(~/.local/share/agent-github/**)", "Edit(~/.local/share/agent-github/**)", "Edit(~/.local/**)",
             "Edit(~/.claude/hooks/**)", f"Edit({tilde(profile)}/settings.json)", f"Edit({tilde(profile)}/settings.local.json)",
             f"Edit({tilde(profile)}/skills/**)"):
    add(deny, rule)
sandbox = s.setdefault("sandbox", {})
add(sandbox.setdefault("excludedCommands", []), f"{helper} *")
add(sandbox.setdefault("filesystem", {}).setdefault("denyRead", []), "~/.local/share/agent-github")
entry = {"matcher": "Bash|Read|Grep|Glob", "hooks": [{"type": "command", "command": f"/opt/homebrew/bin/python3 -I {hook} {helper}"}]}
add(s.setdefault("hooks", {}).setdefault("PreToolUse", []), entry)
fd, tmp = tempfile.mkstemp(dir=profile, prefix=".settings.")
with os.fdopen(fd, "w") as f:
    json.dump(s, f, indent=2, ensure_ascii=False)
    f.write("\n")
os.replace(tmp, path)
PY
	echo "settings: $profile (a copy kept beside it)"
done
echo "installed from $sha: $helper, $hook, the skill in each profile, $state (allowed: $*)"
ask_token
