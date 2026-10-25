#!/bin/sh
# Ergo's start in the stack (slice 3's plan, 3e): ircd.yaml.tmpl rendered as the server's tests render it
# (server/src/testing/ergo.ts), each {{NAME}} a JSON value, from the settings and the oper's secret file; then
# Ergo runs. A missing setting, an origin that is none or a name left unfilled stops it before it listens.
set -euf # -f: an origin of * is a word, never the files it would match
fail() {
	echo "render: $1" >&2
	exit 1
}

# The sites a WebSocket may come from: an empty list would let every origin in (F422), so none is refused.
origins=""
for origin in $(printf '%s' "${ORIGINS:-}" | tr ',' ' '); do
	printf '%s\n' "$origin" | grep -Eqx 'https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?' || fail "ORIGINS: [$origin] is no origin"
	origins="$origins${origins:+,}\"$origin\""
done
[ -n "$origins" ] || fail "ORIGINS: required, the sites of the app"
printf '%s\n' "${SERVER_NAME:-}" | grep -Eqx '[a-z0-9-]+(\.[a-z0-9-]+)+' || fail "SERVER_NAME: required, a host name"
# web's address alone may say who a WebSocket's visitor is (X-Forwarded-For, listeners.go:159, F449).
printf '%s\n' "${PROXY_FROM:-}" | grep -Eqx '[0-9]{1,3}(\.[0-9]{1,3}){3}' || fail "PROXY_FROM: required, web's address"
# The server's socket, which Ergo dials for each login, with no command (irc/script.go, RunScript).
printf '%s\n' "${AUTH_SOCKET:-}" | grep -Eqx '/[A-Za-z0-9/._-]+' || fail "AUTH_SOCKET: required, the server's socket"
# The oper's password as the server takes it (config.ts): 32 characters or more, blanks aside. Ergo's
# genpasswd hashes any, an empty file too, and OPER is open on /ws (a known limit, OPERATIONS.md).
tr -d ' \t\r\n' </run/secrets/ergo_oper_password | grep -Eq '^.{32}' || fail "the oper's password: 32 characters or more"
hash=$(/ircd-bin/ergo genpasswd </run/secrets/ergo_oper_password | tail -n 1)
case $hash in '$2'*) ;; *) fail "the oper's password file gave no hash" ;; esac

export V_NAME="\"$SERVER_NAME\"" V_PLAIN='":6667"' V_WEBSOCKET='":8097"' V_PROXY_FROM="[\"$PROXY_FROM\"]"
export V_ORIGINS="[$origins]" V_AUTH_SCRIPT='""' V_SOCKET="\"$AUTH_SOCKET\"" V_AUTH_TIMEOUT='"9s"' V_OPER_HASH="\"$hash\""
export V_DATABASE='"/data/ircd.db"' V_HISTORY='"/data/history.db"' V_LOCK='"/data/ircd.lock"'
export V_LOG_TYPES='"* -userinput -useroutput"' V_LOG_LEVEL='"info"'
awk '
	# Each {{NAME}} with its V_NAME; one with none left as it is, for the check below.
	{
		line = $0
		out = ""
		while (match(line, /[{][{][A-Z_]+[}][}]/)) {
			name = substr(line, RSTART + 2, RLENGTH - 4)
			value = ("V_" name) in ENVIRON ? ENVIRON["V_" name] : substr(line, RSTART, RLENGTH)
			out = out substr(line, 1, RSTART - 1) value
			line = substr(line, RSTART + RLENGTH)
		}
		print out line
	}
' /ergo/ircd.yaml.tmpl >/tmp/ircd.yaml
if grep -q '{{' /tmp/ircd.yaml; then fail "a name of the template has no value: $(grep -o '{{[A-Z_]*}}' /tmp/ircd.yaml | head -n 1)"; fi
# deploy/test.sh asks the render alone, to see each refusal (RENDER_ONLY=1).
if [ "${RENDER_ONLY:-}" = 1 ]; then
	echo "render: the settings are whole" >&2
	exit 0
fi
exec /ircd-bin/ergo run --conf /tmp/ircd.yaml
