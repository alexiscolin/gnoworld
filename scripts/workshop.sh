#!/bin/sh
# workshop.sh (`pnpm workshop`): the app's screens and the lab's pages on Vite's dev servers, hot reload and the lab's tuning panel, put on the
# tailnet for the MacBook or a phone, the chat with them: a local Ergo and the server behind the app's /ws and /api (docs/DEVELOPMENT.md,
# "The workshop"). Run it in your own terminal: the sandbox reaches neither Tailscale's socket nor a server it could stop. Ctrl+C stops it
# all and takes it off the tailnet. It serves the checkout it sits in, each process on 127.0.0.1 at its port: it stops only its own last run,
# known by the pids it wrote and processes listening there from this checkout's app.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$root"
pidfile="$root/.claude/tmp/workshop.pid" # a line a process: this script's pid, the process's, its port
# Each process it starts runs under the workshop's own Seatbelt profile, by the system's sandbox-exec: Vite's servers, the backend and
# ergo.sh's check run code a session writes, Vite's again at each edit (lot 2's S1, F4962). They write their own folders alone and read of
# the home folder the code alone they run; the profile is given its folders as their real paths. It cannot hold where they listen
# (F4977): 127.0.0.1 is their configs' (app/vite.config.ts's workshopServer, the server's and Ergo's).
seatbelt="$root/scripts/workshop.sb" scratch=$(cd "${TMPDIR:-/tmp}" && pwd -P)
home=$(cd "$HOME" && pwd -P)
# The tailnet-preview skill's script, run from /: its python3 -c, as this script's own would without -I, imports first a module a
# session planted in the folder it runs from (F4962).
preview="$HOME/.claude/skills/tailnet-preview/scripts/tailnet-preview.sh"
# This runs out of the sandbox, and a session writes .node-version: it is a version and nothing else (a `24.22.0/../../x` led PATH, and every
# bare command after it, to a planted Node, F5540), and its Node a file of the user's own, never a link, found under nvm's folder.
version=$(head -n 1 .node-version 2>/dev/null || :) want="v$version"
printf '%s\n' "$version" | grep -qxE '[0-9]+\.[0-9]+\.[0-9]+' && [ "$(cat .node-version)" = "$version" ] || { echo "workshop: .node-version must be a version, as 24.22.0" >&2; exit 1; }
node_bin="${NVM_DIR:-$HOME/.nvm}/versions/node/$want/bin"
[ -f "$node_bin/node" ] && [ ! -L "$node_bin/node" ] && [ -O "$node_bin/node" ] && [ "$("$node_bin/node" -v 2>/dev/null)" = "$want" ] ||
	{ echo "workshop: Node $want is needed (.node-version), as a file of yours at $node_bin/node" >&2; exit 1; }
PATH="$node_bin:$PATH"
node_dir=$(cd -P "$node_bin/.." && pwd -P) # Node's own folder, its binary and its modules
# The checkout the profile may read whole: the main one, a worktree's node_modules leading to its own. It is the parent of git's common
# folder, found as worktree.sh finds it from this tree's .git (a folder here, or the file of a worktree naming <common>/worktrees/<id>),
# never where node_modules/.pnpm leads, a link any session writes: one to a folder two levels under the home folder, or under /, made MAIN
# the home folder or /, and the profile read the keys (F5539). It is a git checkout holding the profile, and neither the home folder nor above.
if [ -d "$root/.git" ]; then common=$root/.git
else common=$(gitdir=$(sed -n 's/^gitdir: //p' "$root/.git" 2>/dev/null) && [ -n "$gitdir" ] && cd "$gitdir/../.." 2>/dev/null && pwd -P) || common=; fi
case $common in */.git) main=${common%/.git} ;; *) main= ;; esac
[ -n "$main" ] && [ -d "$main/.git" ] && [ -f "$main/scripts/workshop.sb" ] || { echo "workshop: no git checkout of this repository behind $root/.git" >&2; exit 1; }
case "$home/" in "$main"/*) echo "workshop: $main is the home folder or holds it, which the profile must not read whole" >&2; exit 1 ;; esac
# Its node_modules lead into that checkout's, a worktree's to the main one's; the tools' cache, where ergo.sh keeps the Ergo a gate built.
pnpm=$(cd -P "$root/node_modules/.pnpm" 2>/dev/null && pwd -P) || { echo "workshop: no node_modules here: pnpm install first" >&2; exit 1; }
case $pnpm in "$main"/node_modules/*) ;; *) echo "workshop: node_modules/.pnpm leads outside $main/node_modules: pnpm install here" >&2; exit 1 ;; esac
tools=${GNOWORLD_TOOLS:-$HOME/.cache/gnoworld-tools} && mkdir -p "$tools" && tools=$(cd "$tools" && pwd -P)
# boxed <command...>: the command exec'd under the profile, from a subshell of its caller's.
boxed() {
	exec /usr/bin/sandbox-exec -f "$seatbelt" -D HOME="$home" -D ROOT="$root" -D MAIN="$main" -D NODE="$node_dir" -D TOOLS="$tools" \
		-D TMP="$scratch" -D CHECKOUT_TMP="$root/.claude/tmp" -D VITE_CACHE="$root/app/node_modules/.vite" \
		-D VITE_TEMP="$root/app/node_modules/.vite-temp" -D ROUTER_TYPES="$root/app/.react-router" "$@"
}
app_port=${WORKSHOP_APP_PORT:-5198} lab_port=${WORKSHOP_LAB_PORT:-5199}
api_port=${WORKSHOP_API_PORT:-5195} irc_port=${WORKSHOP_IRC_PORT:-5196} ws_port=${WORKSHOP_WS_PORT:-5197} # the server's, Ergo's, Ergo's WebSocket
unset WORKSHOP_APP_PORT WORKSHOP_LAB_PORT WORKSHOP_API_PORT WORKSHOP_IRC_PORT WORKSHOP_WS_PORT # each process is given its own, below
# Process $1 serves port $2 when the listener is it or one of its descendants: the backend's server is a child of the process this starts
# (F4961). Parents from lsof -R, as ps is refused where the hooks' tests run.
listens() {
	lsof -nP -a -p "$1" -iTCP:"$2" -sTCP:LISTEN >/dev/null 2>&1 && return 0
	for listener in $(lsof -nP -iTCP:"$2" -sTCP:LISTEN -t 2>/dev/null); do
		up=$listener depth=0
		while [ -n "$up" ] && [ "$up" != 1 ] && [ "$depth" -lt 8 ]; do
			[ "$up" = "$1" ] && return 0
			up=$(lsof -nP -a -p "$up" -d cwd -R -FR 2>/dev/null | sed -n 's/^R//p' | head -n 1) depth=$((depth + 1))
		done
	done
	return 1
}

# The last run of this checkout, while a process of it still serves: stopped, which ends its script (its end stops the rest and the tailnet).
# The script's own pid is never killed: any session writes the pid file, and a pid in it may be anything of the user's (H9).
if [ -f "$pidfile" ]; then
	while read -r old_script old_server old_port; do
		[ -n "${old_port:-}" ] && listens "$old_server" "$old_port" && lsof -a -p "$old_server" -d cwd -Fn 2>/dev/null | grep -qxF "n$root/app" || continue
		kill "$old_server" 2>/dev/null || :
		tries=0
		while { listens "$old_server" "$old_port" || kill -0 "$old_script" 2>/dev/null; } && [ "$tries" -lt 40 ]; do sleep 0.25 && tries=$((tries + 1)); done
	done <"$pidfile"
fi

# The names the servers answer, exactly (app/vite.config.ts's workshopServer): this machine's tailnet name and address, when Tailscale runs here.
hosts=
if command -v tailscale >/dev/null 2>&1 && name=$(tailscale status --json 2>/dev/null | python3 -I -c 'import sys, json
d = json.load(sys.stdin)
assert d["BackendState"] == "Running"
print(d["Self"]["DNSName"].rstrip("."))' 2>/dev/null); then
	hosts="$name,$(tailscale ip -4 2>/dev/null | head -n 1)"
fi
shared=$([ -x "$preview" ] && [ -n "$hosts" ] && echo 1 || :)

# The folder the backend's worlds job and prices timer write and the app's dev server serves their files from (app/tests/e2e/workshopData.mjs).
# Kept from one run to the next, so a run serves the last files at once while its jobs read the chain again (Alexis, 2026-11-07).
data="$root/.claude/tmp/workshop-data"
mkdir -p "$data" || exit 1
servers= names= # what this run started and put on the tailnet, for its end
what() { case $1 in backend) echo "the backend (the server and Ergo)" ;; *) echo "the $1's dev server" ;; esac; }
stop() {
	for name in $names; do (cd / && "$preview" down "workshop-$name") >/dev/null 2>&1 || :; done
	for pid in $servers; do kill "${pid%%:*}" 2>/dev/null || :; done
	[ "$(head -n 1 "$pidfile" 2>/dev/null | cut -d' ' -f1)" != "$$" ] || rm -f "$pidfile" # a later run's file stays
}
# A run ends only on a signal or a process stopped, never well: an exit 0 is bash 3.2's (macOS's sh) after an unbound variable.
trap 'status=$?; stop; [ "$status" != 0 ] || status=1; exit "$status"' EXIT
trap 'exit 130' HUP INT TERM # a terminal closed ends it as Ctrl+C does
mkdir -p "$root/.claude/tmp" && : >"$pidfile"

# Each port, held by any other process, is said and never taken.
held() {
	lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1 || return 0
	echo "workshop: port $1 is held by another process, which this script did not start; stop it first:" >&2
	lsof -nP -iTCP:"$1" -sTCP:LISTEN >&2 || :
	exit 1
}
# start <name> <port> <command...>: <name>'s process, run from this checkout's app under the profile, listening on 127.0.0.1:<port>, its
# pid written, up to a minute to listen (a first run optimizes its dependencies).
start() {
	name=$1 port=$2
	shift 2
	held "$port"
	(cd app && export WORKSHOP_HOSTS="$hosts" && boxed "$@") &
	pid=$!
	servers="$servers $pid:$name" && echo "$$ $pid $port" >>"$pidfile"
	tries=0
	until listens "$pid" "$port"; do
		kill -0 "$pid" 2>/dev/null || { echo "workshop: $(what "$name") stopped before it listened" >&2; exit 1; }
		tries=$((tries + 1))
		[ "$tries" -lt 120 ] || { echo "workshop: $(what "$name") did not listen on $port within a minute" >&2; exit 1; }
		sleep 0.5
	done
}
# share <name> <port>: on the tailnet as workshop-<name>, what a run cut short left under that name taken down first; its links in $shown.
share() {
	echo
	shown=
	if [ -n "$shared" ]; then
		(cd / && "$preview" down "workshop-$1") >/dev/null 2>&1 || :
		names="$names $1" # first: an `up` that fails half way leaves entries the end must take down
		if shown=$(cd / && "$preview" up "workshop-$1" "$2"); then
			printf '%s\n' "$shown" | sed "s/^/workshop-$1: /" # each link beside the name it opens
		else
			shown=
			echo "workshop: the tailnet refused $(what "$1"); here alone: http://127.0.0.1:$2" >&2
		fi
	else
		echo "$(what "$1"), here alone: http://127.0.0.1:$2"
	fi
}
# The app's dev server proxies /api and /ws to the backend's ports (vite.config.ts's workshopBackend); the lab's proxies nothing.
held "$api_port" && held "$irc_port" && held "$ws_port"
start app "$app_port" env WORKSHOP_API_PORT="$api_port" WORKSHOP_WS_PORT="$ws_port" WORKSHOP_DATA_DIR="$data" node_modules/.bin/react-router dev --port "$app_port"
share app "$app_port"
# The origins the backend allows, a POST's and a WebSocket's: this machine's address of the app and the tailnet's links to it.
origins="http://127.0.0.1:$app_port $(printf '%s\n' "$shown" | grep -oE 'https?://[^ ]+' | tr '\n' ' ')"
start lab "$lab_port" node_modules/.bin/vite --config lab.config.ts --port "$lab_port"
share lab "$lab_port"
echo
# ergo.sh under the profile too: it runs the Ergo binary of the tools' cache, which a session can write; there it builds none.
(boxed sh scripts/ergo.sh) >/dev/null || { echo "workshop: no Ergo built for the chat; a gate builds it (scripts/check.sh)" >&2; exit 1; }
# shellcheck disable=SC2086 # each origin a word
start backend "$api_port" env WORKSHOP_DATA_DIR="$data" node tests/e2e/workshopBackend.mjs "$api_port" "$irc_port" "$ws_port" $origins
echo "the backend: the server on 127.0.0.1:$api_port, Ergo on $irc_port and its WebSocket on $ws_port, behind the app's /api and /ws"
echo
echo "workshop-app is the app's screens: the https link, then / for the home, /earth, /w/<world>. Each edit shows at once."
echo "workshop-lab is the lab: the https link with /realism.html after it (/realism.html?view=cosmos for the site's scene); T shows its tuning panel."
echo "The chat, who is here and the rooms run on the backend, and so do the worlds job and the prices' timer: their files (worlds.json, worlds-count.json,"
echo "markets.json) are read from the chain and CoinGecko and served by the app's dev server; the last run's stay served till this run's are written."
[ -n "$shared" ] || echo "From another device: run this where Tailscale runs and the tailnet-preview skill is installed (docs/DEVELOPMENT.md, \"The workshop\")."
# Any process that stops ends the run, and the others with it.
while :; do
	for each in $servers; do kill -0 "${each%%:*}" 2>/dev/null || { echo "workshop: $(what "${each#*:}") stopped" >&2; exit 1; }; done
	sleep 1
done
