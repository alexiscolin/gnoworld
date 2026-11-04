#!/bin/sh
# workshop.sh (`pnpm workshop`): the app's screens and the lab's pages on Vite's dev servers, hot reload and the lab's tuning panel, put on the
# tailnet for the MacBook or a phone (docs/DEVELOPMENT.md, "The workshop"). Run it in your own terminal: the sandbox reaches neither
# Tailscale's socket nor a server it could stop. Ctrl+C stops both servers and takes them off the tailnet. It serves the checkout it sits
# in, each server on 127.0.0.1 at its port: it stops only its own last run, known by the pids it wrote and servers listening there from this
# checkout's app.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$root"
pidfile="$root/.claude/tmp/workshop.pid" # a line a server: this script's pid, the server's, its port
preview="$HOME/.claude/skills/tailnet-preview/scripts/tailnet-preview.sh"
want="v$(cat .node-version)"
PATH="${NVM_DIR:-$HOME/.nvm}/versions/node/$want/bin:$PATH"
[ "$(node -v 2>/dev/null)" = "$want" ] || { echo "workshop: Node $want is needed (.node-version)" >&2; exit 1; }
listens() { lsof -nP -a -p "$1" -iTCP:"$2" -sTCP:LISTEN >/dev/null 2>&1; } # pid $1 serves port $2

# The last run of this checkout, while a server of it still serves: its script stopped (its end stops its servers and the tailnet), then the server.
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
stop() {
	for name in $names; do "$preview" down "workshop-$name" >/dev/null 2>&1 || :; done
	for pid in $servers; do kill "${pid%%:*}" 2>/dev/null || :; done
	[ "$(head -n 1 "$pidfile" 2>/dev/null | cut -d' ' -f1)" != "$$" ] || rm -f "$pidfile" # a later run's file stays
}
# A run ends only on a signal or a server stopped, never well: an exit 0 is bash 3.2's (macOS's sh) after an unbound variable.
trap 'status=$?; stop; [ "$status" != 0 ] || status=1; exit "$status"' EXIT
trap 'exit 130' HUP INT TERM # a terminal closed ends it as Ctrl+C does
mkdir -p "$root/.claude/tmp" && : >"$pidfile"

# serve <name> <port> <command...>: the dev server of <name> of this checkout's app, on 127.0.0.1:<port> (a port held by any other process
# is said, never taken), its pid written, up to a minute to listen (a first run optimizes its dependencies), then on the tailnet as
# workshop-<name>, what a run cut short left under that name taken down first.
serve() {
	name=$1 port=$2 what="the $1's dev server"
	shift 2
	if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
		echo "workshop: port $port is held by another process, which this script did not start; stop it first:" >&2
		lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || :
		exit 1
	fi
	(cd app && WORKSHOP_HOSTS=$hosts exec "$@" --port "$port") &
	pid=$!
	servers="$servers $pid:$name" && echo "$$ $pid $port" >>"$pidfile"
	tries=0
	until listens "$pid" "$port"; do
		kill -0 "$pid" 2>/dev/null || { echo "workshop: $what stopped before it listened" >&2; exit 1; }
		tries=$((tries + 1))
		[ "$tries" -lt 120 ] || { echo "workshop: $what did not listen on $port within a minute" >&2; exit 1; }
		sleep 0.5
	done
	echo
	if [ -n "$shared" ]; then
		"$preview" down "workshop-$name" >/dev/null 2>&1 || :
		names="$names $name" # first: an `up` that fails half way leaves entries the end must take down
		if shown=$("$preview" up "workshop-$name" "$port"); then
			printf '%s\n' "$shown" | sed "s/^/workshop-$name: /" # each link beside the name it opens
		else
			echo "workshop: the tailnet refused $what; here alone: http://127.0.0.1:$port" >&2
		fi
	else
		echo "$what, here alone: http://127.0.0.1:$port"
	fi
}
serve app "${WORKSHOP_APP_PORT:-5198}" node_modules/.bin/react-router dev
serve lab "${WORKSHOP_LAB_PORT:-5199}" node_modules/.bin/vite --config lab.config.ts
echo
echo "workshop-app is the app's screens: the https link, then / for the home, /earth, /w/<world>. Each edit shows at once."
echo "workshop-lab is the lab: the https link with /realism.html after it (/realism.html?view=cosmos for the site's scene); T shows its tuning panel."
[ -n "$shared" ] || echo "From another device: run this where Tailscale runs and the tailnet-preview skill is installed (docs/DEVELOPMENT.md, \"The workshop\")."
# Either server that stops ends the run, and the other with it.
while :; do
	for each in $servers; do kill -0 "${each%%:*}" 2>/dev/null || { echo "workshop: the ${each#*:}'s dev server stopped" >&2; exit 1; }; done
	sleep 1
done
