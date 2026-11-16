#!/bin/sh
# Installs the agent's helper for every project and every Claude profile on this Mac, each file
# from GitHub at one reviewed, pushed commit (never from this machine's .git, which sessions can write): agent-pr, its guard
# hook, its skill, its state folder and allow list, and in each profile's settings the denies, the exclusion and the hook.
# agent-pr holds the python3, git, gh and gitleaks your PATH finds, each refused where a session could have put it first (D13412).
# Then it asks for the agent account's token, which nothing shows. Run it in your own Terminal, never from Claude Code:
#   sh <(curl -fsSL https://raw.githubusercontent.com/<src>/<commit>/tools/agent-github/install.sh) <src> <branch> <commit> <owner/repo>...
#   (<src>: the repository holding the tool; <commit>: its full id, on <branch> (checked); a repository written owner/repo uses your token, and
#   owner/repo:agent the agent account's. A token alone again: ... install.sh --token [agent]. The tools found written into a
#   copy of land or agent-pr: ... install.sh --stamp <file>..., which install_hooks.sh runs for land)
set -eu
state="$HOME/.local/share/agent-github"
helper="$HOME/.local/bin/agent-pr"
hook="$HOME/.claude/hooks/agent_pr_guard.py"
raw=https://raw.githubusercontent.com
api=https://api.github.com

ask_token() { # ask_token [name]: your token (the default), or the one named, the agent account's for one
	file=token${1:+.$1}
	[ -t 0 ] || { echo "no terminal on stdin: no token asked (later: install.sh --token${1:+ $1})"; return 0; }
	if [ -z "${1:-}" ]; then
		printf 'Paste YOUR fine-grained token (only the repositories you name; Contents and Pull requests read and write; no\n'
		printf 'Administration, no Workflows); nothing shows; Enter alone to skip: '
	else
		printf 'Paste the %s token (the agent account: classic, scope repo only, never workflow); nothing shows; Enter alone to skip: ' "$1"
	fi
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
	ghp_* | github_pat_*) ;;
	*) echo "that is not a GitHub token (ghp_... or github_pat_...); nothing written" >&2; return 1 ;;
	esac
	install -d -m 700 "$state"
	(umask 077 && printf '%s\n' "$token" >"$state/$file.new" && mv "$state/$file.new" "$state/$file")
	echo "token written ($state/$file, mode 600). Clear the clipboard, and restart Claude Code's sessions."
}

# python3, git, gh and gitleaks as the owner's PATH finds them (D13412), each written in through its folder's real path, never a
# link to it a session could point elsewhere later. Each is refused when its real file or its folder lies under the home folder or
# a temporary one, where a session could have put it first, or when a copy could not carry its path as written (a shebang, a
# Python string). Sets py, tools (their folders, then the system's own PATH) and prefixes (the folder above each one's folder
# outside the system's, the real file's too: what a deny keeps from every session).
found() {
	[ -d "${HOME:-}" ] || { echo "no home folder: ${HOME:-}" >&2; exit 1; }
	system=$(command -p getconf PATH) py= tools= prefixes=
	for name in python3 git gh gitleaks; do
		at=$(command -v "$name") || { echo "no $name on your PATH" >&2; exit 1; }
		r=$(command -p realpath "$at") && d=$(command -p realpath "${at%/*}") || exit 1
		p=$d/${at##*/}
		for x in "$p" "$r"; do
			printf '%s\n' "$x" | grep -Eqx '(/[A-Za-z0-9._@+-]+){2,}' ||
				{ echo "$name: $x holds a character a copy cannot carry (letters, digits and ._@+- alone)" >&2; exit 1; }
			dir=${x%/*} && pre=${dir%/*}
			case :$system: in *":$dir:"*) ;; *) prefixes="$prefixes${pre:-$dir}
" ;; esac
		done
		for w in "$HOME" "${TMPDIR:-/tmp}" /tmp /var/tmp; do
			w=$(command -p realpath "$w" 2>/dev/null) || continue
			case "$r/ $d/" in "${w%/}"/* | *" ${w%/}"/*) echo "$name: $at is under $w, which a session can write: install it elsewhere" >&2 && exit 1 ;; esac
		done
		[ "$name" = python3 ] && py=$p || case :$tools: in *":${p%/*}:"*) ;; *) tools=$tools${p%/*}: ;; esac
	done
	tools=$tools$system
	prefixes=$(printf '%s' "$prefixes" | sort -u | awk '{ for (k in s) if (index($0, k "/") == 1) next; s[$0]; print }')
}

stamp() { # stamp <file>...: py and tools written into each copy, which runs nowhere before
	for f; do
		sed -e "1s|@PYTHON3@|$py|" -e "s|^TOOLS = \"@TOOLS@\"|TOOLS = \"$tools\"|" "$f" >"$f.new" && mv "$f.new" "$f"
		head -1 "$f" | grep -qxF "#!/usr/bin/env -S -i LC_ALL=C $py -I" || { echo "$f: no placeholder took python3" >&2; exit 1; }
	done
}

if [ "${1:-}" = --token ]; then
	case ${2:-} in '' | [a-z0-9]*) ;; *) echo "a token's name is lower case letters, digits and -" >&2; exit 2 ;; esac
	ask_token "${2:-}"
	exit 0
fi
found
profiles=
for p in "$HOME/.claude" "$HOME"/.claude-*; do [ -f "$p/settings.json" ] && profiles="$profiles $p"; done
if [ "${1:-}" = --stamp ]; then
	shift
	# land runs these tools too: every profile's sessions must be kept from their folders already, by this installer's run.
	"$py" -I - "$prefixes" $profiles <<'PY' || exit 1
import json, os, sys
want = [f"Edit(/{x}/**)" for x in sys.argv[1].split()]
missing = [f"{p}: {w}" for p in sys.argv[2:] for w in want if w not in json.load(open(os.path.join(p, "settings.json"))).get("permissions", {}).get("deny", [])]
if missing:
    sys.exit("these profiles' sessions may write the tools found; run agent-github's installer first:\n  " + "\n  ".join(missing))
PY
	stamp "$@"
	exit 0
fi
[ $# -ge 4 ] || { echo "usage: install.sh <owner/repo holding the tool> <its branch> <full commit id> <owner/repo allowed>..." >&2; exit 2; }
src=$1 branch=$2 sha=$3
shift 3
repo_re='[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_][A-Za-z0-9._-]{0,99}'
printf '%s\n' "$src" | grep -Eqx "$repo_re" || { echo "not a repository written owner/name: $src" >&2; exit 2; }
printf '%s\n' "$sha" | grep -Eqx '[0-9a-f]{40}|[0-9a-f]{64}' || { echo "the commit is given by its full id, 40 or 64 hex digits" >&2; exit 2; }
for repo in "$@"; do
	printf '%s\n' "$repo" | grep -Eqx "$repo_re(:[a-z0-9][a-z0-9-]{0,31})?" ||
		{ echo "not a repository written owner/name, or owner/name:token: $repo" >&2; exit 2; }
done
printf '%s\n' "$branch" | grep -Eqx '[A-Za-z0-9._/-]{1,200}' || { echo "not a branch name: $branch" >&2; exit 2; }
# The commit is on the branch named, as GitHub holds it (not a fork's, not a branch a session pushed): what was reviewed.
state_of=$(curl -fsSL "$api/repos/$src/compare/$branch...$sha" | "$py" -I -c 'import json, sys; print(json.load(sys.stdin).get("status", ""))') ||
	{ echo "GitHub could not compare $sha with $src's $branch" >&2; exit 1; }
case $state_of in identical | behind) ;; *) echo "$sha is not on $src's $branch ($state_of): nothing installed" >&2; exit 1 ;; esac
fetched=$(mktemp -d "${TMPDIR:-/tmp}/agent-pr-install.XXXXXX")
trap 'rm -rf "$fetched"' EXIT
for f in scripts/agent_pr.py tools/agent-github/agent_pr_guard.py tools/agent-github/SKILL.md; do
	curl -fsSL --proto '=https' "$raw/$src/$sha/$f" -o "$fetched/${f##*/}" || { echo "could not fetch $f at $sha" >&2; exit 1; }
done
stamp "$fetched/agent_pr.py"

# Every profile, and a refusal while one holds a setting that would undo this (planted before, by a session of it).
"$py" -I - "$prefixes" $profiles <<'PY' || exit 1
import json, os, sys
bad = []
prefixes = sys.argv[1].split()
for profile in sys.argv[2:]:
    with open(os.path.join(profile, "settings.json")) as f:
        s = json.load(f)
    sandbox = s.get("sandbox", {})
    if s.get("disableAllHooks") is True:
        bad.append(f"{profile}: hooks off")
    granted = s.get("permissions", {}).get("allow", []) + sandbox.get("filesystem", {}).get("allowRead", []) + sandbox.get("filesystem", {}).get("allowWrite", [])
    for g in granted:
        if any(k in str(g) for k in ("agent-github", ".local", ".claude/hooks", *prefixes)):
            bad.append(f"{profile}: grants {g}")
    for e in sandbox.get("excludedCommands", []):
        if not str(e).startswith("/"):
            print(f"warning: {profile} runs '{e}' outside the sandbox, found through PATH or ~: write it with its absolute path", file=sys.stderr)
if bad:
    print("refused, remove these first:\n  " + "\n  ".join(bad), file=sys.stderr)
    sys.exit(1)
PY

install -d -m 755 "$HOME/.local/bin" "$HOME/.claude/hooks"
install -d -m 700 "$state"
install -m 755 "$fetched/agent_pr.py" "$helper"
install -m 644 "$fetched/agent_pr_guard.py" "$hook"
touch "$state/repos.allow" && chmod 600 "$state/repos.allow"
for repo in "$@"; do
	line=$(printf '%s' "$repo" | tr ':' ' ')
	name=${line%% *}
	awk -v n="$name" '$1 != n' "$state/repos.allow" >"$state/repos.allow.new"
	printf '%s\n' "$line" >>"$state/repos.allow.new" && mv "$state/repos.allow.new" "$state/repos.allow"
done

for profile in $profiles; do
	install -d -m 755 "$profile/skills/agent-github"
	sed "s|@HELPER@|$helper|g" "$fetched/SKILL.md" >"$profile/skills/agent-github/SKILL.md"
	cp "$profile/settings.json" "$profile/settings.json.bak-agent-github-$(date +%Y%m%d%H%M%S)"
	"$py" -I - "$profile" "$helper" "$hook" "$py" "$prefixes" $profiles <<'PY'
import json, os, sys, tempfile
profile, helper, hook, py, prefixes, everyone = *sys.argv[1:5], sys.argv[5].split(), sys.argv[6:]
path = os.path.join(profile, "settings.json")
with open(path) as f:
    s = json.load(f)
def add(lst, item):
    if item not in lst:
        lst.append(item)
home = os.path.expanduser("~")
tilde = lambda p: p.replace(home, "~", 1)
deny = s.setdefault("permissions", {}).setdefault("deny", [])
# What the helper runs and reads, and every profile's configuration: no profile's session may write any of them.
rules = ["Read(~/.local/share/agent-github/**)", "Edit(~/.local/share/agent-github/**)", "Edit(~/.local/**)", "Edit(~/.claude/hooks/**)",
         "Edit(~/.claude.json)"] + [f"Edit(/{p}/**)" for p in prefixes]
for p in everyone:
    rules += [f"Edit({tilde(p)}/{name})" for name in ("settings.json", "settings.local.json", "skills/**", "hooks/**", ".claude.json", "plugins/**")]
    # And whatever any profile denies already (~/.opencode, ~/.config, the shell's files): the union in each.
    with open(os.path.join(p, "settings.json")) as f:
        rules += [r for r in json.load(f).get("permissions", {}).get("deny", []) if isinstance(r, str)]
for rule in rules:
    add(deny, rule)
# The sandbox in every project: the token is out of reach only of a sandboxed session.
sandbox = s.setdefault("sandbox", {})
sandbox["enabled"] = True
sandbox["allowUnsandboxedCommands"] = False
add(sandbox.setdefault("excludedCommands", []), f"{helper} *")
add(sandbox.setdefault("filesystem", {}).setdefault("denyRead", []), "~/.local/share/agent-github")
entry = {"matcher": "Bash|Read|Grep|Glob", "hooks": [{"type": "command", "command": f"{py} -I {hook} {helper}"}]}
add(s.setdefault("hooks", {}).setdefault("PreToolUse", []), entry)
fd, tmp = tempfile.mkstemp(dir=profile, prefix=".settings.")
with os.fdopen(fd, "w") as f:
    json.dump(s, f, indent=2, ensure_ascii=False)
    f.write("\n")
os.replace(tmp, path)
PY
	echo "settings: $profile (a copy kept beside it)"
done
echo "installed from $src at $sha: $helper, $hook, the skill in each profile, $state (allowed: $*)"
echo "Before adding a repository to $state/repos.allow, read its workflows: one that runs on push to any branch, or holds secrets"
echo "a pull request can reach, runs the agent's code with them."
rm -rf "$fetched"
trap - EXIT
ask_token
case " $* " in *":agent "*) ask_token agent ;; esac
