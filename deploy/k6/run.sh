#!/bin/sh
# deploy/k6/run.sh: slice 3's first load runs (docs/plans/slice-3.md, 3n), on the operator's host with Docker,
# which Claude Code's sandbox refuses. A stack of its own in a throwaway project, never the demo (ADR-0002: load
# tests never run on it), driven from inside its internal network: k6 for the logins, Ergo's crowd and the
# messages, Node for the streams (k6 reads a response whole, and a stream never ends). It prints k6's summaries,
# each container's memory and CPU at the peak, Ergo's volume and the verdicts, then removes the project.
#   sh deploy/k6/run.sh             every scenario, at its default size
#   sh deploy/k6/run.sh messages    one: logins, crowd, streams or messages
# Sizes: ACCOUNTS (200), CROWD (2000), STREAMS (1000), HOLD (60 s), RATE (a message an account every 5 s).
# OPENAI_API_KEY_FILE names a real key for the messages' checks; without one the messages are not run (F644).
# Exit: 0 it ran, 1 k6 found a threshold missed, 2 a tool or a fact is missing, 3 the stack did not start.
set -eu
umask 022 # what the run writes, the containers' users read
deploy=$(cd "$(dirname "$0")/.." && pwd)
repo=$(dirname "$deploy")
K6=grafana/k6:2.3.0@sha256:9c2dee7f8ed74d317e4027c06a10f169b625638189de8d4555d0b3486a5aeb34
project=gnoworld-load
ACCOUNTS=${ACCOUNTS:-200} CROWD=${CROWD:-2000} STREAMS=${STREAMS:-1000} HOLD=${HOLD:-60} RATE=${RATE:-5}
missing() {
	echo "run.sh: $1" >&2
	exit 2
}
only=${1:-all}
case $only in all | logins | crowd | streams | messages) ;; *) missing "no such scenario [$only]: logins, crowd, streams or messages" ;; esac
for size in ACCOUNTS CROWD STREAMS HOLD RATE; do
	eval "value=\$$size"
	case $value in "" | *[!0-9]* | 0*) missing "$size: a whole number from 1, not [$value]" ;; esac
done
# Each visitor's address is one of 250 x 250 (setup.ts, load.js), a stream's four to one (F650).
[ "$ACCOUNTS" -le 62500 ] && [ "$CROWD" -le 62500 ] && [ "$STREAMS" -le 250000 ] ||
	missing "ACCOUNTS and CROWD 62,500 at most, STREAMS 250,000: the visitors' addresses"
# Without OpenAI's key every line is unchecked and the breaker stops calling: the messages measure nothing (F644).
key=${OPENAI_API_KEY_FILE:-}
[ "$only" != messages ] || [ -n "$key" ] || missing "messages: set OPENAI_API_KEY_FILE, OpenAI's key, which checks each line"
for tool in docker openssl htpasswd; do command -v "$tool" >/dev/null || missing "$tool is missing"; done
# Never on the demo's host (ADR-0002): none of its containers, running or stopped, may be here (F643).
[ -z "$(docker ps -aq --filter label=com.docker.compose.project=gnoworld-demo)" ] ||
	missing "the demo's containers are on this host: run the load on another (ADR-0002: never on the demo's host)"

tmp=$(mktemp -d "${TMPDIR:-/tmp}/gnoworld-load.XXXXXX")
files="-f $deploy/compose.yaml -f $tmp/load.yaml"
cleanup() {
	kill "${sampler:-}" 2>/dev/null || true
	docker compose -p "$project" $files down -v >/dev/null 2>&1 || echo "run.sh: docker compose -p $project down -v" >&2
	rm -r "$tmp"
}
trap cleanup EXIT
# dash runs no EXIT trap when a signal ends it: a signal ends the run through exit, so cleanup runs (F642).
trap 'exit 130' INT
trap 'exit 143' TERM
# The stack's own secrets; OpenAI's key the operator's, if given.
htpasswd -nbB team "$(openssl rand -hex 16)" | grep . >"$tmp/htpasswd"
printf 'not a key\n' >"$tmp/ts_authkey"
for secret in ergo_oper_password log_pepper openai_api_key; do openssl rand -hex 24 >"$tmp/$secret"; done
# cat, not cp: a copy would keep the key's own 0600, which the server's user cannot read; the folder is 0700.
[ -z "${OPENAI_API_KEY_FILE:-}" ] || cat "$OPENAI_API_KEY_FILE" >"$tmp/openai_api_key"
export DEMO_HTPASSWD_FILE="$tmp/htpasswd" TS_AUTHKEY_FILE="$tmp/ts_authkey" ERGO_OPER_PASSWORD_FILE="$tmp/ergo_oper_password"
export LOG_PEPPER_FILE="$tmp/log_pepper" OPENAI_API_KEY_FILE="$tmp/openai_api_key"
export ORIGINS=http://gnoworld.test SERVER_NAME=irc.gnoworld.test INSIDE_SUBNET=172.30.91.0/24 WEB_ADDRESS=172.30.91.10
# The load comes from one address of the internal network, which the server and Ergo believe in web's place:
# each virtual user is a visitor of its own (X-Real-IP, X-Forwarded-For).
load=172.30.91.240
printf 'services:\n  server:\n    environment:\n      TRUSTED_PROXY: %s\n  ergo:\n    environment:\n      PROXY_FROM: %s\n' \
	"$load" "$load" >"$tmp/load.yaml"
docker compose -p "$project" $files down -v >/dev/null 2>&1 || true
docker compose -p "$project" $files up -d --build --wait web guard ergo server egress || exit 3
inside=${project}_inside
of() { docker compose -p "$project" $files ps -q "$1"; }
ergo=$(of ergo) server=$(of server)
server_image=$(docker inspect --format '{{.Image}}' "$server")
# Ergo's and the server's memory and CPU at their most during a run, sampled every 2 s (web stands aside: the load
# goes to them straight).
peak() {
	awk '{ mem = $2; unit = mem; sub(/^[0-9.]+/, "", unit); sub(/[A-Za-z]+$/, "", mem)
		mib = unit == "GiB" ? mem * 1024 : unit == "KiB" ? mem / 1024 : unit == "B" ? mem / 1048576 : mem
		cpu = $NF; sub(/%/, "", cpu)
		if (mib + 0 > m[$1] + 0) m[$1] = mib
		if (cpu + 0 > c[$1] + 0) c[$1] = cpu }
		END { for (n in m) printf "peak  %s %.0f MiB, %s%% CPU\n", n, m[n], c[n] }' "$1"
}
# Ergo's files' bytes as the server sums them (retention.ts, sizeOf): all but folders, a link as itself.
volume() { docker exec "$ergo" sh -c 'find /data ! -type d -exec ls -ldn {} \; | awk "{ s += \$5 } END { print s + 0 }"'; }

# The accounts, each logged in as a person is, from an address of its own, with the tests' wallet.
mkdir -m 777 "$tmp/out"
cat >"$tmp/setup.ts" <<'SETUP'
// The load run's accounts: a challenge, the tests' wallet's proof, the cookie; each from its own address.
import { writeFileSync } from "node:fs";
import { wallet } from "./testing/signer.ts";

const [count = "0", origin = ""] = process.argv.slice(2);
const login = `${process.env["SERVER"] ?? "http://server:8080"}/api/login`;
const accounts: { address: string; cookie: string; ip: string }[] = [];
const times: number[] = [];
for (let i = 0; i < Number(count); i += 1) {
  const ip = `198.18.${String(Math.floor(i / 250))}.${String((i % 250) + 1)}`;
  const headers = { origin, "content-type": "application/json", "x-real-ip": ip };
  const post = (path: string, body: unknown) =>
    fetch(`${login}/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const who = wallet();
  const started = performance.now();
  const made = (await (await post("challenge", { chainId: "onyx-1" })).json()) as { nonce: string; text: string };
  const verified = await post("verify", { nonce: made.nonce, address: who.address, proof: who.sign("onyx-1", made.text) });
  times.push(performance.now() - started);
  if (verified.status !== 200) throw new Error(`login ${String(i)}: ${String(verified.status)}`);
  accounts.push({ address: who.address, cookie: (verified.headers.get("set-cookie") ?? "").split(";")[0] ?? "", ip });
}
writeFileSync(`${process.env["OUT"] ?? "/out"}/accounts.json`, JSON.stringify(accounts));
times.sort((a, b) => a - b);
const at = (q: number): string => (times[Math.min(times.length - 1, Math.floor(q * times.length))] ?? 0).toFixed(1);
console.log(`setup: ${String(accounts.length)} logins one after another, median ${at(0.5)} ms, p95 ${at(0.95)} ms`);
SETUP
docker run --rm --network "$inside" --ip "$load" -v "$repo/server/src/testing/signer.ts:/app/server/src/testing/signer.ts:ro" \
	-v "$tmp/setup.ts:/app/server/src/load-setup.ts:ro" -v "$tmp/out:/out" --entrypoint /nodejs/bin/node "$server_image" \
	/app/server/src/load-setup.ts "$ACCOUNTS" "$ORIGINS"

cat >"$tmp/out/load.js" <<'LOAD'
// The load run's scenarios (deploy/k6/run.sh): SCENARIO picks one; its size comes from the environment.
// A virtual user holds several connections (k6/websockets' event loop), so a crowd costs few of them.
import http from "k6/http";
import encoding from "k6/encoding";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";
import { WebSocket } from "k6/websockets";

// The stack's names unless a run says otherwise.
const { SCENARIO, ORIGIN, SERVER = "http://server:8080", ERGO = "ws://ergo:8097", ACCOUNTS_FILE = "/k6/accounts.json" } = __ENV;
const accounts = JSON.parse(open(ACCOUNTS_FILE));
const [HOLD, RATE, CROWD] = [Number(__ENV.HOLD), Number(__ENV.RATE), Number(__ENV.CROWD)];
const EACH = 20;
const loginTime = new Trend("irc_login_ms", true);
const echoTime = new Trend("message_echo_ms", true);
const sent = new Counter("messages_sent");
const size = { logins: accounts.length, crowd: CROWD, messages: accounts.length }[SCENARIO];
export const options = {
  scenarios: {
    [SCENARIO]: {
      executor: "per-vu-iterations",
      vus: Math.ceil(size / EACH),
      iterations: 1,
      maxDuration: `${String(HOLD + 120)}s`,
      exec: SCENARIO,
    },
  },
  // First budgets, to be set from this run's numbers (the plan's 3n): nearly every login and line goes through.
  thresholds: { checks: ["rate>0.99"] },
};
// This virtual user's share: EACH connections, by their numbers.
const mine = () => {
  const first = (__VU - 1) * EACH;
  return Array.from({ length: Math.max(0, Math.min(EACH, size - first)) }, (_, i) => first + i);
};

// One IRC connection through Ergo's WebSocket, as the visitor at `ip`: `on.line` sees each line Ergo sends, and
// `on.close` whether the connection had reached its goal. One still open a minute past the hold is closed, so
// every connection is counted, a stuck one as missed (F635).
const irc = (ip, first, on) => {
  const ws = new WebSocket(ERGO, null, { headers: { Origin: ORIGIN, "X-Forwarded-For": ip } });
  const deadline = setTimeout(() => ws.close(), (HOLD + 60) * 1000);
  ws.onopen = () => first.forEach((line) => ws.send(line));
  ws.onmessage = (event) => {
    const line = String(event.data);
    if (line.startsWith("PING ")) ws.send(`PONG ${line.slice(5)}`);
    else on.line(line, ws);
  };
  ws.onclose = () => {
    clearTimeout(deadline);
    on.close();
  };
  return ws;
};

// An account logged in by SASL with a fresh ticket; `welcome` runs once Ergo welcomes it.
const enter = (account, caps, welcome, more = () => {}) => {
  const answer = http.post(`${SERVER}/api/login/ticket`, "{}", {
    headers: { Origin: ORIGIN, "Content-Type": "application/json", Cookie: account.cookie, "X-Real-IP": account.ip },
  });
  const pass = answer.status === 200 ? answer.json("ticket") : "";
  const started = Date.now();
  let welcomed = false;
  irc(account.ip, ["CAP LS 302", `CAP REQ :${caps}`], {
    line: (line, ws) => {
      if (line.includes(" ACK ")) ws.send("AUTHENTICATE PLAIN");
      else if (line.endsWith(" AUTHENTICATE +")) ws.send(`AUTHENTICATE ${encoding.b64encode(`\0${account.address}\0${pass}`)}`);
      else if (line.includes(" 903 ")) ["CAP END", "NICK x", "USER u 0 * :u"].forEach((next) => ws.send(next));
      else if (line.includes(" 904 ")) ws.close();
      else if (line.includes(" 001 ") && !welcomed) {
        welcomed = true;
        loginTime.add(Date.now() - started);
        welcome(ws);
      } else more(line, ws);
    },
    close: () => check(null, { "a ticket logs in": () => welcomed }),
  });
};

// Every account at once, as after Ergo's restart: a ticket, then SASL with it.
export function logins() {
  for (const i of mine()) enter(accounts[i], "sasl", (ws) => ws.close());
}

// Guests, each joining a world's room and staying there, reading.
export function crowd() {
  for (const i of mine()) {
    let joined = false;
    irc(`198.19.${String(Math.floor(i / 250))}.${String((i % 250) + 1)}`, ["CAP LS 302", "CAP END", `NICK g${String(i)}`, "USER g 0 * :g", "JOIN #earth"], {
      line: (line, ws) => {
        if (/ 366 \S+ #earth /.test(line) && !joined) {
          joined = true;
          setTimeout(() => ws.close(), HOLD * 1000);
        }
      },
      close: () => check(null, { "a guest joins and stays": () => joined }),
    });
  }
}

// Accounts in a world's room, each saying a line every RATE seconds; Ergo's echo times each, and a line never
// echoed by the end counts as lost.
export function messages() {
  for (const i of mine()) {
    const waiting = new Map();
    enter(
      accounts[i],
      "sasl echo-message",
      (ws) => {
        ws.send("JOIN #earth");
        const every = setInterval(() => {
          const text = `load ${String(i)} ${String(Date.now())}`;
          waiting.set(text, Date.now());
          ws.send(`PRIVMSG #earth :${text}`);
          sent.add(1);
        }, RATE * 1000);
        setTimeout(() => {
          clearInterval(every);
          setTimeout(() => {
            for (const _ of waiting) check(null, { "a line comes back": () => false });
            ws.close();
          }, 5000);
        }, HOLD * 1000);
      },
      (line) => {
        const text = / PRIVMSG #earth :(load .*)$/.exec(line)?.[1];
        if (text !== undefined && waiting.has(text)) {
          echoTime.add(Date.now() - waiting.get(text));
          check(null, { "a line comes back": () => true });
          waiting.delete(text);
        }
      },
    );
  }
}
LOAD
# The streams, held by one Node process (a curl each would take a few MB apiece): four a visitor, the server's
# share; a stream counts as held when it answered 200 and sent its heartbeat before the hold ended.
cat >"$tmp/out/streams.cjs" <<'STREAMS'
const [count, hold] = process.argv.slice(2).map(Number);
let held = 0;
const read = async (i) => {
  const visitor = Math.floor(i / 4);
  const ip = `198.20.${String(Math.floor(visitor / 250))}.${String((visitor % 250) + 1)}`;
  // A heartbeat is a line that starts with ":", wherever the chunks part it (F648).
  let beat = false;
  let last = "\n";
  try {
    const answer = await fetch(`${process.env.SERVER ?? "http://server:8080"}/api/stream?rooms=%23earth`, {
      headers: { "x-real-ip": ip },
      signal: AbortSignal.timeout(hold * 1000),
    });
    for await (const chunk of answer.body) {
      const text = last + Buffer.from(chunk).toString();
      beat ||= answer.status === 200 && text.includes("\n:");
      last = text.slice(-1);
    }
  } catch {
    // The hold's end aborts the stream; a refused or broken one never beat.
  }
  if (beat) held += 1;
};
// As k6's checks: 99% of them, or the run says a threshold was missed (F635).
Promise.all(Array.from({ length: count }, (_, i) => read(i))).then(() => {
  console.log(`streams that answered and beat: ${String(held)} of ${String(count)}`);
  process.exit(held >= count * 0.99 ? 0 : 1);
});
STREAMS
k6() {
	docker run --rm --network "$inside" --ip "$load" -v "$tmp/out:/k6:ro" -e SCENARIO="$1" -e ORIGIN="$ORIGINS" \
		-e HOLD="$HOLD" -e RATE="$RATE" -e CROWD="$CROWD" "$K6" run --quiet /k6/load.js
}
# A scenario, the containers sampled all through it; its own exit code.
# A file each: a docker stats under way when its sampler stops still writes, into its own scenario's file (F647).
during() {
	runs=$((${runs:-0} + 1))
	while :; do
		docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' "$ergo" "$server"
		sleep 2
	done >"$tmp/stats.$runs" 2>/dev/null &
	sampler=$!
	code=0
	"$@" || code=$?
	kill "$sampler"
	peak "$tmp/stats.$runs"
	return "$code"
}
missed=0
scenario() { [ "$only" = all ] || [ "$only" = "$1" ]; }
if scenario logins; then
	echo "== logins: $ACCOUNTS accounts at once, a ticket each, then SASL"
	during k6 logins || missed=1
fi
if scenario crowd; then
	echo "== crowd: $CROWD guests in #earth for $HOLD s"
	during k6 crowd || missed=1
fi
if scenario streams; then
	echo "== streams: $STREAMS readers of #earth's stream for $HOLD s, four a visitor"
	during docker run --rm --network "$inside" --ip "$load" -v "$tmp/out:/k6:ro" --entrypoint /nodejs/bin/node "$server_image" \
		/k6/streams.cjs "$STREAMS" "$HOLD" || missed=1
fi
if scenario messages && [ -z "$key" ]; then
	echo "== messages: skipped, OPENAI_API_KEY_FILE names no key"
elif scenario messages; then
	before=$(volume)
	echo "== messages: $ACCOUNTS accounts, a line each every $RATE s for $HOLD s"
	during k6 messages || missed=1
	after=$(volume)
	echo "ergo's volume: ${before} bytes before, ${after} after"
	docker exec "$server" /nodejs/bin/node -e '
const db = new (require("node:sqlite").DatabaseSync)("/data/gnoworld.db", { readOnly: true });
console.log("verdicts:", JSON.stringify(db.prepare("SELECT action, count(*) AS n FROM verdicts GROUP BY action").all()));'
	echo "moderation backlog alerts: $(docker logs "$server" 2>&1 | grep -c '"moderation_backlog"' || true)"
fi
exit "$missed"
