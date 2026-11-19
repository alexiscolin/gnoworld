#!/bin/sh
# Installs the agent's helper on this Mac, each file from GitHub at one reviewed, pushed commit (never from this machine's .git,
# which sessions can write): agent-pr, its guard hook, its state folder and allow list. It writes nothing into a Claude profile
# (D14000 C): the exclusion, the denies, the hook and the skill are the project's own settings and skill, committed (D14013).
# agent-pr holds the python3, git, gh and gitleaks your PATH finds, each refused where a session could have put it first (D13412).
# It keeps no copy of your own token: agent-pr asks your gh login for it at each call (D14012, D14013); an agent account's token,
# where a repository names one, it asks where a terminal is, and nothing shows it. Run it in your own Terminal, never from Claude Code:
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

# One GitHub token line, as agent-pr reads it (scripts/agent_pr.py's TOKEN): a classic, a fine-grained, or a gh login's token.
is_token() { case $1 in *'
'*) return 1 ;; esac && printf '%s\n' "$1" | grep -Eqx 'gh[po]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,255}'; }
write_token() { # write_token <file> <token>: owner-only, in one rename
	install -d -m 700 "$state"
	(umask 077 && printf '%s\n' "$2" >"$state/$1.new" && mv "$state/$1.new" "$state/$1")
}
ask_token() { # ask_token <name>: the token named, an agent account's; your own is your gh login's, never kept (D14013)
	file=token.$1
	[ -t 0 ] || { echo "no terminal on stdin: no token asked (later: install.sh --token $1)"; return 0; }
	printf 'Paste the %s token (the agent account: classic, scope repo only, never workflow); nothing shows; Enter alone to skip: ' "$1"
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
	is_token "$token" || { echo "that is not a GitHub token (ghp_..., gho_... or github_pat_...); nothing written" >&2; return 1; }
	write_token "$file" "$token"
	echo "token written ($state/$file, mode 600). Clear the clipboard, and restart Claude Code's sessions."
}

# python3, git, gh and gitleaks as the owner's PATH finds them (D13412), each written in through its folder's real path, never a
# link to it a session could point elsewhere later. Each is refused when its real file or its folder lies under the home folder or
# a temporary one, where a session could have put it first, or when a copy could not carry its path as written (a shebang, a
# Python string). Sets py, tools (their folders, then the system's own PATH) and prefixes (the folder above each one's folder
# outside the system's, the real file's too: what --stamp asks every profile to deny, for land till 14a-2 removes it).
found() {
	[ -d "${HOME:-}" ] || { echo "no home folder: ${HOME:-}" >&2; exit 1; }
	system=$(command -p getconf PATH) py= tools= prefixes=
	for name in python3 git gh gitleaks; do
		at=$(command -v "$name") || { echo "no $name on your PATH" >&2; exit 1; }
		d=$(command -p realpath "${at%/*}") && p=$d/${at##*/} && r=$(command -p realpath "$p") || exit 1
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
	case ${2:-} in [a-z0-9]*) ;; *) echo "--token <name>: an agent account's token, its name lower case letters, digits and -; yours is your gh login's (D14013)" >&2; exit 2 ;; esac
	ask_token "$2"
	exit 0
fi
found
profiles=
for p in "$HOME/.claude" "$HOME"/.claude-*; do [ -f "$p/settings.json" ] && profiles="$profiles $p"; done
if [ "${1:-}" = --stamp ]; then
	shift
	# land runs these tools too: every profile's sessions must be kept from their folders, by denies the owner writes (no install
	# writes a profile since D14000 C).
	"$py" -I - "$prefixes" $profiles <<'PY' || exit 1
import json, os, sys
want = [f"Edit(/{x}/**)" for x in sys.argv[1].split()]
missing = [f"{p}: {w}" for p in sys.argv[2:] for w in want if w not in json.load(open(os.path.join(p, "settings.json"))).get("permissions", {}).get("deny", [])]
if missing:
    sys.exit("these profiles' sessions may write the tools found; add these denies to each by hand (no install writes a profile, D14000 C):\n  " + "\n  ".join(missing))
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
for f in scripts/agent_pr.py tools/agent-github/agent_pr_guard.py; do
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
        if not str(e).startswith(("/", "~/")):
            print(f"warning: {profile} runs '{e}' outside the sandbox, found through PATH: write it from / or ~/", file=sys.stderr)
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

echo "installed from $src at $sha: $helper, $hook, $state (allowed: $*); no profile written: the project's settings name them"
echo "Before adding a repository to $state/repos.allow, read its workflows: one that runs on push to any branch, or holds secrets"
echo "a pull request can reach, runs the agent's code with them."
rm -rf "$fetched"
trap - EXIT
# No copy of your own token is kept (D14013): agent-pr asks your gh login at each call. One an earlier install wrote goes.
[ ! -e "$state/token" ] || { rm -f "$state/token" && echo "removed $state/token: agent-pr asks your gh login for your token at each call"; }
case " $* " in *":agent "*) ask_token agent ;; esac
