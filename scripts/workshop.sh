#!/bin/sh
# workshop.sh (`pnpm workshop`): the lab's pages on Vite's dev server, hot reload and the tuning panel, put on the tailnet for the
# MacBook or a phone (docs/DEVELOPMENT.md, "The workshop"). Run it in your own terminal: the sandbox reaches neither Tailscale's
# socket nor a server it could stop. Ctrl+C stops the server and takes it off the tailnet.
# It serves the checkout it sits in, on 127.0.0.1:5199 (app/lab.config.ts, strictPort): it stops only its own last run, known by
# the pids it wrote and a server listening there from this checkout's app; a port held by anything else is said, never taken.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$root"
pidfile="$root/.claude/tmp/workshop.pid"
port=5199
preview="$HOME/.claude/skills/tailnet-preview/scripts/tailnet-preview.sh"
want="v$(cat .node-version)"
PATH="${NVM_DIR:-$HOME/.nvm}/versions/node/$want/bin:$PATH"
[ "$(node -v 2>/dev/null)" = "$want" ] || { echo "workshop: Node $want is needed (.node-version)" >&2; exit 1; }
listens() { lsof -nP -a -p "$1" -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; } # pid $1 serves the port

# The last run of this checkout, if it still serves: its script stopped (its cleanup stops the server and the tailnet), then its server.
if read -r old_script old_server <"$pidfile" 2>/dev/null && [ -n "${old_server:-}" ] && listens "$old_server" &&
	lsof -a -p "$old_server" -d cwd -Fn 2>/dev/null | grep -qxF "n$root/app"; then
	kill "$old_script" 2>/dev/null || kill "$old_server" 2>/dev/null || :
	tries=0
	while listens "$old_server" && [ "$tries" -lt 40 ]; do sleep 0.25 && tries=$((tries + 1)); done
fi
if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
	echo "workshop: port $port is held by another process, which this script did not start; stop it first:" >&2
	lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || :
	exit 1
fi

# The names the server answers, exactly (app/lab.config.ts): this machine's tailnet name and address, when Tailscale runs here.
hosts=
if command -v tailscale >/dev/null 2>&1 && name=$(tailscale status --json 2>/dev/null | python3 -c 'import sys, json
d = json.load(sys.stdin)
assert d["BackendState"] == "Running"
print(d["Self"]["DNSName"].rstrip("."))' 2>/dev/null); then
	hosts="$name,$(tailscale ip -4 2>/dev/null | head -n 1)"
fi

cd app
LAB_HOSTS=$hosts node_modules/.bin/vite --config lab.config.ts &
server=$!
mkdir -p "$root/.claude/tmp" && echo "$$ $server" >"$pidfile"
shared=
stop() {
	[ -z "$shared" ] || "$preview" down workshop >/dev/null 2>&1 || :
	kill "$server" 2>/dev/null || :
	[ "$(cat "$pidfile" 2>/dev/null)" != "$$ $server" ] || rm -f "$pidfile" # a later run's file stays
}
# bash 3.2, macOS's sh, exits 0 through an EXIT trap after an unbound variable: `finished`, set on the last line, tells the two apart.
trap 'status=$?; stop; [ "$status" != 0 ] || [ "${finished:-}" = 1 ] || status=1; exit "$status"' EXIT
trap 'exit 130' INT TERM

# Up to a minute for its own server to listen (a first run optimizes its dependencies).
tries=0
until listens "$server"; do
	kill -0 "$server" 2>/dev/null || { echo "workshop: the dev server stopped before it listened" >&2; exit 1; }
	tries=$((tries + 1))
	[ "$tries" -lt 120 ] || { echo "workshop: the dev server did not listen on $port within a minute" >&2; exit 1; }
	sleep 0.5
done

echo
here="http://127.0.0.1:$port/realism.html (/realism.html?view=cosmos for the site's scene)"
if [ -x "$preview" ] && [ -n "$hosts" ]; then
	"$preview" down workshop >/dev/null 2>&1 || : # what a run cut short left under this name, and nothing else
	shared=1 # set first: an `up` that fails half way leaves entries the cleanup must take down
	if "$preview" up workshop "$port"; then
		echo
		echo "Open the https link above with /realism.html after it (/realism.html?view=cosmos for the site's scene)."
	else
		echo "workshop: the tailnet refused it; here alone: $here" >&2
	fi
else
	echo "Here: $here"
	echo "From another device: run this where Tailscale runs and the tailnet-preview skill is installed (docs/DEVELOPMENT.md, \"The workshop\")."
fi
echo "T shows the tuning panel; Copy gives the values you changed, Reset puts the code's back."
wait "$server"
finished=1
