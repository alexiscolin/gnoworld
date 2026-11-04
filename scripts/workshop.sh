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
preview="$HOME/.claude/skills/tailnet-preview/scripts/tailnet-preview.sh"
want="v$(cat .node-version)"
PATH="${NVM_DIR:-$HOME/.nvm}/versions/node/$want/bin:$PATH"
[ "$(node -v 2>/dev/null)" = "$want" ] || { echo "workshop: Node $want is needed (.node-version)" >&2; exit 1; }
app_port=${WORKSHOP_APP_PORT:-5198} lab_port=${WORKSHOP_LAB_PORT:-5199}
api_port=${WORKSHOP_API_PORT:-5195} irc_port=${WORKSHOP_IRC_PORT:-5196} ws_port=${WORKSHOP_WS_PORT:-5197} # the server's, Ergo's, Ergo's WebSocket
unset WORKSHOP_APP_PORT WORKSHOP_LAB_PORT WORKSHOP_API_PORT WORKSHOP_IRC_PORT WORKSHOP_WS_PORT # each process is given its own, below
listens() { lsof -nP -a -p "$1" -iTCP:"$2" -sTCP:LISTEN >/dev/null 2>&1; } # pid $1 serves port $2

# The last run of this checkout, while a process of it still serves: its script stopped (its end stops the rest and the tailnet), then the process.
if [ -f "$pidfile" ]; then
	while read -r old_script old_server old_port; do
		[ -n "${old_port:-}" ] && listens "$old_server" "$old_port" && lsof -a -p "$old_server" -d cwd -Fn 2>/dev/null | grep -qxF "n$root/app" || continue
		kill "$old_script" 2>/dev/null || kill "$old_server" 2>/dev/null || :
		tries=0
		while listens "$old_server" "$old_port" && [ "$tries" -lt 40 ]; do sleep 0.25 && tries=$((tries + 1)); done
	done <"$pidfile"
fi

# The names the servers answer, exactly (app/vite.config.ts's workshopServer): this machine's tailnet name and address, when Tailscale runs here.
hosts=
if command -v tailscale >/dev/null 2>&1 && name=$(tailscale status --json 2>/dev/null | python3 -c 'import sys, json
d = json.load(sys.stdin)
assert d["BackendState"] == "Running"
print(d["Self"]["DNSName"].rstrip("."))' 2>/dev/null); then
	hosts="$name,$(tailscale ip -4 2>/dev/null | head -n 1)"
fi
shared=$([ -x "$preview" ] && [ -n "$hosts" ] && echo 1 || :)

servers= names= # what this run started and put on the tailnet, for its end
what() { case $1 in backend) echo "the backend (the server and Ergo)" ;; *) echo "the $1's dev server" ;; esac; }
stop() {
	for name in $names; do "$preview" down "workshop-$name" >/dev/null 2>&1 || :; done
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
# start <name> <port> <command...>: <name>'s process, run from this checkout's app, listening on 127.0.0.1:<port>, its pid written, up to a
# minute to listen (a first run optimizes its dependencies).
start() {
	name=$1 port=$2
	shift 2
	held "$port"
	(cd app && WORKSHOP_HOSTS=$hosts exec "$@") &
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
		"$preview" down "workshop-$1" >/dev/null 2>&1 || :
		names="$names $1" # first: an `up` that fails half way leaves entries the end must take down
		if shown=$("$preview" up "workshop-$1" "$2"); then
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
start app "$app_port" env WORKSHOP_API_PORT="$api_port" WORKSHOP_WS_PORT="$ws_port" node_modules/.bin/react-router dev --port "$app_port"
share app "$app_port"
# The origins the backend allows, a POST's and a WebSocket's: this machine's address of the app and the tailnet's links to it.
origins="http://127.0.0.1:$app_port $(printf '%s\n' "$shown" | grep -oE 'https?://[^ ]+' | tr '\n' ' ')"
start lab "$lab_port" node_modules/.bin/vite --config lab.config.ts --port "$lab_port"
share lab "$lab_port"
echo
sh scripts/ergo.sh >/dev/null || { echo "workshop: scripts/ergo.sh could not build the Ergo the chat runs on" >&2; exit 1; }
# shellcheck disable=SC2086 # each origin a word
start backend "$api_port" node tests/e2e/workshopBackend.mjs "$api_port" "$irc_port" "$ws_port" $origins
echo "the backend: the server on 127.0.0.1:$api_port, Ergo on $irc_port and its WebSocket on $ws_port, behind the app's /api and /ws"
echo
echo "workshop-app is the app's screens: the https link, then / for the home, /earth, /w/<world>. Each edit shows at once."
echo "workshop-lab is the lab: the https link with /realism.html after it (/realism.html?view=cosmos for the site's scene); T shows its tuning panel."
echo "The chat, who is here and the rooms run on the backend; the worlds job and the prices' timer do not, so what they write stays empty:"
echo "the worlds read from the chain (worlds.json), the hero's prices and block (markets.json)."
[ -n "$shared" ] || echo "From another device: run this where Tailscale runs and the tailnet-preview skill is installed (docs/DEVELOPMENT.md, \"The workshop\")."
# Any process that stops ends the run, and the others with it.
while :; do
	for each in $servers; do kill -0 "${each%%:*}" 2>/dev/null || { echo "workshop: $(what "${each#*:}") stopped" >&2; exit 1; }; done
	sleep 1
done
