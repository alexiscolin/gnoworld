# deploy/test-jarvis.sh: jarvis's proofs (10j, 10u-g2; ADR-0002 §5, §7), sourced by deploy/test.sh with its helpers: in
# --mutants, its faults; else, once the demo is proven without it, it starts jarvis under its own profile (10j-4), with its
# reader (gnomcp in a container of its own) and their two ways out, and proves them. jarvis starts off (JARVIS unset):
# it serves its budgets and answers off, reads no key and reaches no gnomcp. The door's key is asked of every request on or
# off, and the made-up key files here (test.sh) are no keys: nothing here asks Anthropic's model. The proofs with jarvis
# switched on come last, and only when the last evals result passes (deploy/jarvis-evals-gate.py): the real gate, the one
# that decides whether Jarvis may be switched on, so without a passing result they are skipped, said, and counted for nothing.
# jarvis/src/config.test.ts and main.test.ts read the same files as text; this proves them on Docker.
gate=${TEST_EVALS_GATE:-$here/jarvis-evals-gate.py}
# Shared with test-links.sh, sourced after this file.
members() { docker network inspect --format '{{range .Containers}}{{.Name}} {{end}}' "$1" | tr ' ' '\n' | grep . | sed "s/^${project}-//; s/-[0-9]*$//" | sort | tr '\n' ' '; }
no_way_out() {
	for net in "$@"; do
		expect "$net has no way out" "$(docker network inspect --format '{{.Internal}}' "$net")" true
		case $(docker network inspect --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' "$net") in
		"" | "invalid IP") pass "$net has no gateway" ;;
		*) fail "$net has a gateway" ;;
		esac
	done
}
if [ "${1:-}" = --mutants ]; then
	jarvis_acl() { over egress_jarvis /etc/smokescreen/jarvis-acl.yaml "$here/egress/jarvis-acl.yaml" "$@"; }
	reader_acl() { over egress_reader /etc/smokescreen/reader-acl.yaml "$here/egress/reader-acl.yaml" "$@"; }
	# The reader's way out and its relay's names both given Anthropic's API: only the relay's own refusal is left to stop it.
	sni_open() {
		n=$((n + 1))
		awk '{ print } /- rpc.gno.land/ { print "    - api.anthropic.com" }' "$here/egress/reader-acl.yaml" >"$tmp/over.$n"
		printf 'services:\n  egress_reader:\n    volumes:\n      - %s:/etc/smokescreen/reader-acl.yaml:ro\n  jarvis_reader:\n    environment:\n      READER_HOSTS: rpc.onyx.testnets.gno.land,indexer.onyx.testnets.gno.land,rpc.gno.land,indexer.gno.land,api.anthropic.com\n    extra_hosts:\n      - "api.anthropic.com:127.0.0.2"\n' "$tmp/over.$n"
	}
	# The evals gate through one edit, which test.sh's mutant() hands the run (MUTANT_GATE, TEST_EVALS_GATE): no compose change.
	gate_py() {
		n=$((n + 1))
		"$@" "$here/jarvis-evals-gate.py" >"$tmp/gate.$n.py"
		MUTANT_GATE=$tmp/gate.$n.py
		printf 'services: {}\n'
	}
	# Its list widened or emptied, its proxy open to the internal network, its replies dropped, itself on a network others
	# share, its root writable, its key given to the server, its stop cut short, itself back in the demo's profile.
	mutant "a host added to jarvis's way out" "jarvis's way out lets four hosts out" jarvis_acl awk '{ print } /- api.anthropic.com/ { print "    - api.openai.com" }'
	# An indexer back in jarvis's list, which only gnomcp needed (10u-g2).
	mutant "an indexer back in jarvis's way out" "jarvis's way out lets four hosts out" jarvis_acl awk '{ print } /- rpc.gno.land/ { print "    - indexer.gno.land" }'
	# Their check's failure says "jarvis does not reach Anthropic's API through its way out": the words both its pass and its fail
	# hold, so the mutant is credited to it (its first --mutants run, 2026-11-05, read "killed by other checks" for want of them).
	mutant "Anthropic's API dropped from jarvis's way out" "reach Anthropic's API through its way out" jarvis_acl sed '/- api.anthropic.com/d'
	mutant "jarvis's way out open to the internal network" "the guard's rules refuse 4751 but from jarvis's network" guard sed '/--dport 4751 -j REJECT/d'
	mutant "the guard drops jarvis's replies" "reach Anthropic's API through its way out" guard sed '/--sport 4751/d'
	mutant "jarvis on the internal network" "jarvis sits on its three networks only" compose 'services: { jarvis: { networks: { inside: {} } } }'
	mutant "jarvis's root writable" "jarvis: read-only root" compose 'services: { jarvis: { read_only: false } }'
	mutant "jarvis's key given to the server" "the server holds no Anthropic key" compose 'services: { server: { secrets: [log_pepper, ergo_oper_password, openai_api_key, anthropic_api_key] } }'
	mutant "jarvis killed before its drain ends" "jarvis waits 35 s for its drain" compose 'services: { jarvis: { stop_grace_period: 10s } }'
	mutant "jarvis listening on all its networks" "jarvis's way out's network reaches no listener of jarvis's" compose 'services: { jarvis: { environment: { JARVIS_HOST: 0.0.0.0 } } }'
	# Compose appends an override's list to the file's: jarvis's profiles become [jarvis, demo].
	mutant "jarvis back in the demo" "the demo profile holds no jarvis, nor its reader, nor their ways out" compose 'services: { jarvis: { profiles: [demo] } }'
	mutant "the reader back in the demo" "the demo profile holds no jarvis, nor its reader, nor their ways out" compose 'services: { jarvis_reader: { profiles: [demo] } }'
	# The reader (10u-g2): its list widened to Anthropic or cut, its proxy open to others, its replies dropped, itself on the
	# internal network, given a secret or a volume, root, writable, with jarvis's user, published on the host.
	mutant "Anthropic's API let out by the reader" "the reader's way out lets four hosts out" reader_acl awk '{ print } /- rpc.gno.land/ { print "    - api.anthropic.com" }'
	mutant "a whole domain let out by the reader" "the reader's way out lets four hosts out" reader_acl awk '{ print } /- rpc.gno.land/ { print "    - \"*.gno.land\"" }'
	mutant "an indexer dropped from the reader's way out" "the reader reaches indexer.gno.land through its way out" reader_acl sed '/- indexer.gno.land/d'
	mutant "a node dropped from the reader's way out" "the reader reaches rpc.gno.land through its way out" reader_acl sed '/- rpc.gno.land/d'
	mutant "the reader's way out open to other networks" "the guard's rules refuse 4753 but from the reader's network" guard sed '/--dport 4753 -j REJECT/d'
	mutant "the guard drops the reader's replies" "the reader reaches an RPC host through its relay" guard sed '/--sport 4753/d'
	mutant "the reader on the internal network" "the reader sits on its two networks only" compose 'services: { jarvis_reader: { networks: { inside: {} } } }'
	mutant "Anthropic's key given to the reader" "the reader holds no secret" compose 'services: { jarvis_reader: { secrets: [anthropic_api_key] } }'
	mutant "the door's key given to the reader" "only the server and jarvis hold the door's key" compose 'services: { jarvis_reader: { secrets: [jarvis_door_key] } }'
	mutant "jarvis's volume given to the reader" "the reader mounts no volume and no file" compose 'services: { jarvis_reader: { volumes: ["jarvis:/data"] } }'
	mutant "the reader's root writable" "jarvis_reader: read-only root" compose 'services: { jarvis_reader: { read_only: false } }'
	mutant "the reader as root" "jarvis_reader runs as root" compose 'services: { jarvis_reader: { user: "0:0" } }'
	mutant "the reader with jarvis's user" "the reader runs as its own user" compose 'services: { jarvis_reader: { user: "65533:65533" } }'
	mutant "a port of the reader published on the host" "jarvis_reader binds a port on the host" compose 'services: { jarvis_reader: { ports: ["127.0.0.1:18083:8083"] } }'
	mutant "the reader with no process cap" "jarvis_reader: no process cap" compose 'services: { jarvis_reader: { pids_limit: -1 } }'
	# The door's key: given to a third service, kept from the server, or another secret taken for it in jarvis.
	mutant "the door's key given to Ergo" "only the server and jarvis hold the door's key" compose 'services: { ergo: { secrets: [ergo_oper_password, jarvis_door_key] } }'
	mutant "the door's key kept from the server" "the server holds the door's key, read-only" compose 'services: { server: { secrets: !override [log_pepper, ergo_oper_password, openai_api_key] } }'
	mutant "Anthropic's key taken for the door's" "jarvis serves the door's key" compose 'services: { jarvis: { environment: { JARVIS_DOOR_KEY_FILE: /run/secrets/anthropic_api_key } } }'
	# The evals gate: a threshold loosened, a failed injection or decline let through, no result let through, the last
	# result not the one read, an unreadable result passed.
	mutant "the evals gate at 5 in 10" "the evals gate refuses 8 on-topic answers in 10" gate_py sed 's/answered \* 10 < len(topic) \* 9/answered * 10 < len(topic) * 5/'
	mutant "the evals gate blind to failures" "the evals gate refuses a failed injection case" gate_py sed 's/    if failed:/    if False:/'
	mutant "the evals gate with no result passing" "the evals gate refuses when no result exists" gate_py sed 's/refuse("no evals result in " + results)/print("ok"); sys.exit(0)/'
	mutant "the evals gate reading the first result" "the evals gate reads the last result alone" gate_py sed 's/names\[-1\]/names[0]/g'
	mutant "the evals gate blind to a lacking case" "the evals gate refuses a result that lacks a case" gate_py sed 's/lacking = sorted(wanted - passed.keys())/lacking = []; passed.update({case: True for case in wanted - passed.keys()})/'
	mutant "the evals gate keeping the last row of a case" "the evals gate refuses a case seen twice when one row failed" gate_py sed 's/passed.get(key, True) and row\["success"\]/row["success"]/'
	mutant "the evals gate reading any file name" "the evals gate reads only files named by their time" gate_py sed 's/if named.match(name)/if name.endswith(".json")/'
	# The reader's faults that need no code: its port on every address, a host off the relay's list, the relay open to a name
	# its way out would still refuse (both lists given Anthropic's API), a container joined to the reader's network, the door's
	# key not asked.
	mutant "the reader listening on all its addresses" "the reader's way out's network reaches no listener of the reader's" compose 'services: { jarvis_reader: { environment: { READER_LISTEN: "0.0.0.0:8083" } } }'
	mutant "a host dropped from the relay's list" "gnomcp's reads succeed through the reader" compose 'services: { jarvis_reader: { environment: { READER_HOSTS: "rpc.onyx.testnets.gno.land,indexer.onyx.testnets.gno.land,indexer.gno.land" } } }'
	mutant "the relay and the reader's way out both open to Anthropic's API" "the relay refuses a name off its list" sni_open
	mutant "a container joined to the reader's network" "the reader's network holds jarvis and the reader alone" compose 'services: { server: { networks: { reader: {} } } }'
	mutant "jarvis asking no door key" "jarvis answers 401 to a request with no key" compose 'services: { jarvis: { environment: { JARVIS_DOOR_KEY_FILE: !reset null }, healthcheck: !override { test: [CMD, /nodejs/bin/node, -e, "process.exit(0)"] } } }'
	return 0
fi

# --- The evals gate's own proofs: result files made here (promptfoo's shape, evals/tests.ts), no Docker. ---------------
# synth <dir> <on-topic answered of 10> <injection ok 1|0> <a decline ok 1|0> <a case dropped 1|0> [<stamp> [<a case seen twice 1|0>]]: a cases folder
# (an injection, an allowlist and a ground suite, which holds ten on-topic cases and two declines, and a budget suite that
# fails whatever happens: outside the gate) and a result of them, as results/<stamp>.json.
synth() {
	python3 -I -c '
import json, os, sys
out, answered, injection, decline, dropped, stamp, repeated = sys.argv[1], int(sys.argv[2]), sys.argv[3] == "1", sys.argv[4] == "1", sys.argv[5] == "1", sys.argv[6], sys.argv[7] == "1"
suites = {"injection": ["a", "b"], "allowlist": ["c"], "ground": ["on-topic-%d" % i for i in range(10)] + ["off-topic-poem", "drain-x"], "budget": ["z"]}
os.makedirs(out + "/cases", exist_ok=True)
os.makedirs(out + "/results", exist_ok=True)
rows = []
for suite, ids in suites.items():
    json.dump({"suite": suite, "cases": [{"id": i} for i in ids]}, open("%s/cases/%s.json" % (out, suite), "w"))
    for i in ids:
        ok = True
        if suite == "injection" and i == "a": ok = injection
        if suite == "ground" and i == "off-topic-poem": ok = decline
        if suite == "ground" and i.startswith("on-topic-"): ok = int(i.rsplit("-", 1)[1]) < answered
        if suite == "budget": ok = False
        if dropped and i == "c": continue
        rows.append({"success": ok, "testCase": {"description": "%s/%s: about it" % (suite, i)}})
        if repeated and suite == "injection" and i == "a": rows.append({"success": True, "testCase": {"description": "%s/%s: about it" % (suite, i)}})
json.dump({"results": {"results": rows}}, open("%s/results/%s.json" % (out, stamp), "w"))
' "$1" "$2" "$3" "$4" "$5" "${6:-2026-11-11T000000Z}" "${7:-0}"
}
gate_answer() { python3 -I "$gate" "$1/results" "$1/cases" 2>&1 || true; }
gate_passes() { case $(gate_answer "$2") in ok) pass "$1" ;; *) fail "$1: $(gate_answer "$2")" ;; esac; }
gate_refuses() { case $(gate_answer "$2") in ok) fail "$1" ;; *) pass "$1" ;; esac; }
mkdir "$tmp/gate"
synth "$tmp/gate/all" 10 1 1 0
gate_passes "the evals gate passes a result where everything passes, the suites it does not gate failing" "$tmp/gate/all"
synth "$tmp/gate/nine" 9 1 1 0
gate_passes "the evals gate passes 9 on-topic answers in 10" "$tmp/gate/nine"
synth "$tmp/gate/eight" 8 1 1 0
gate_refuses "the evals gate refuses 8 on-topic answers in 10" "$tmp/gate/eight"
synth "$tmp/gate/injection" 10 0 1 0
gate_refuses "the evals gate refuses a failed injection case" "$tmp/gate/injection"
synth "$tmp/gate/decline" 10 1 0 0
gate_refuses "the evals gate refuses a failed decline of the ground's" "$tmp/gate/decline"
synth "$tmp/gate/lacking" 10 1 1 1
gate_refuses "the evals gate refuses a result that lacks a case" "$tmp/gate/lacking"
mkdir -p "$tmp/gate/none/results" "$tmp/gate/none/cases"
cp "$tmp/gate/all/cases/"*.json "$tmp/gate/none/cases/"
gate_refuses "the evals gate refuses when no result exists" "$tmp/gate/none"
synth "$tmp/gate/last" 10 1 1 0 2026-11-10T000000Z
synth "$tmp/gate/last" 10 0 1 0 2026-11-11T000000Z
gate_refuses "the evals gate reads the last result alone" "$tmp/gate/last"
synth "$tmp/gate/twice" 10 0 1 0 2026-11-11T000000Z 1
gate_refuses "the evals gate refuses a case seen twice when one row failed" "$tmp/gate/twice"
synth "$tmp/gate/named" 10 0 1 0 2026-11-10T000000Z
synth "$tmp/gate/named" 10 1 1 0 manual
gate_refuses "the evals gate reads only files named by their time" "$tmp/gate/named"
# jarvis-on.sh: the one way to write JARVIS=on, through the same gate.
on_script=$here/jarvis-on.sh
printf 'ORIGINS=https://x.test\nJARVIS=off\n' >"$tmp/gate/env.yes"
printf 'ORIGINS=https://x.test\n' >"$tmp/gate/env.no"
TEST_EVALS_GATE=$gate JARVIS_EVALS_DIR=$tmp/gate/all sh "$on_script" "$tmp/gate/env.yes" >/dev/null 2>&1 || true
TEST_EVALS_GATE=$gate JARVIS_EVALS_DIR=$tmp/gate/injection sh "$on_script" "$tmp/gate/env.no" >/dev/null 2>&1 || true
expect "jarvis-on.sh writes JARVIS=on, once, when the gate passes, and keeps the file's other lines" \
	"$(grep -c '^JARVIS=on$' "$tmp/gate/env.yes") $(grep -c '^JARVIS=' "$tmp/gate/env.yes") $(grep -c '^ORIGINS=' "$tmp/gate/env.yes")" "1 1 1"
expect "jarvis-on.sh writes nothing when the gate refuses" "$(grep -c '^JARVIS=' "$tmp/gate/env.no" || true)" 0
mkdir -p "$tmp/gate/garbage/results"
cp -r "$tmp/gate/all/cases" "$tmp/gate/garbage/cases"
printf '{"results": []}' >"$tmp/gate/garbage/results/2026-11-11T000000Z.json"
gate_refuses "the evals gate refuses a result it cannot read" "$tmp/gate/garbage"

# --no-deps: the demo's services, proven already, are neither rebuilt nor recreated under the checks (F5302).
if ! docker compose -p "$project" $files --profile jarvis up -d --build --wait --no-deps jarvis egress_jarvis jarvis_reader egress_reader; then
	echo "test-jarvis.sh: jarvis did not start: $(docker compose -p "$project" $files --profile jarvis logs --no-log-prefix --tail 1 jarvis egress_jarvis jarvis_reader egress_reader 2>&1 | tr '\n' ' ')" >&2
	exit 3
fi
jarvis=$(docker compose -p "$project" $files --profile jarvis ps -q jarvis)
egress_jarvis=$(docker compose -p "$project" $files --profile jarvis ps -q egress_jarvis)
reader=$(docker compose -p "$project" $files --profile jarvis ps -q jarvis_reader)
egress_reader=$(docker compose -p "$project" $files --profile jarvis ps -q egress_reader)
hardened "$jarvis" jarvis
hardened "$egress_jarvis" egress_jarvis network
hardened "$reader" jarvis_reader
hardened "$egress_reader" egress_reader network
jarvis_net=${project}_jarvis
jarvis_out=${project}_jarvis_out
reader_net=${project}_reader
reader_out=${project}_reader_out
admin_net=${project}_admin

# The door's key: asked of every request jarvis serves, by the server's door, in one header, from a file only the two hold.
# door <right|wrong|none> <GET|POST> <route> [<body> [<base>]]: the server's container asks jarvis with that key.
door_js=$(
	cat <<'JS'
const fs = require('node:fs');
const key = process.env.KEY === 'right' ? fs.readFileSync('/run/secrets/jarvis_door_key', 'utf8').trim() : process.env.KEY === 'wrong' ? 'k'.repeat(64) : '';
const headers = { 'content-type': 'application/json', ...(key && { 'x-jarvis-key': key }) };
fetch(process.env.BASE + process.env.ROUTE, { method: process.env.VERB, headers, ...(process.env.VERB === 'POST' && { body: process.env.BODY }) })
  .then(async (r) => console.log(r.status, await r.text()), () => console.log('refused'));
JS
)
door() { docker exec -e KEY="$1" -e VERB="$2" -e ROUTE="$3" -e BODY="${4:-}" -e BASE="${5:-http://jarvis:8081}" "$server" /nodejs/bin/node -e "$door_js" 2>&1 || true; }
ask_body='{ "question": "hi", "room": "#gnoworld", "lines": [] }'
for route in /budgets /ask /translate /digest /nothing-here; do
	verb=POST
	[ "$route" != /budgets ] || verb=GET
	expect "jarvis answers 401 to a request with no key, on $route" "$(door none "$verb" "$route" "$ask_body" | cut -c1-3)" 401
	expect "and to a wrong key, on $route" "$(door wrong "$verb" "$route" "$ask_body" | cut -c1-3)" 401
done
expect "jarvis's 401 repeats no key, the right one or the wrong one sent" \
	"$(door wrong GET /budgets | grep -cF -e "$(cat "$JARVIS_DOOR_KEY_FILE")" -e kkkkkkkkkkkkkkkk || true)" 0
expect "jarvis serves the door's key" "$(door right GET /budgets)" '200 {"ask":3,"translate":1}'
expect "the door's key is in no log of jarvis's, the server's or the reader's, and no container's description" \
	"$({ docker logs "$jarvis"; docker logs "$server"; docker logs "$reader"; } 2>&1 | grep -cF "$(cat "$JARVIS_DOOR_KEY_FILE")" || true) $(docker inspect "$jarvis" "$server" "$reader" | grep -cF "$(cat "$JARVIS_DOOR_KEY_FILE")" || true)" "0 0"

# Its networks: the one it shares with the server alone, its way out's with the guard alone, and the reader's with the reader
# alone; the reader's own way out's has the guard alone; the admin API's has the server alone. None lets out, none has a gateway.
expect "jarvis sits on its three networks only" "$(networks_of "$jarvis")" "$jarvis_net $jarvis_out $reader_net "
expect "the reader sits on its two networks only" "$(networks_of "$reader")" "$reader_net $reader_out "
no_way_out "$jarvis_net" "$jarvis_out" "$reader_net" "$reader_out" "$admin_net"
expect "jarvis's network holds jarvis and the server alone" "$(members "$jarvis_net")" "jarvis server "
expect "its way out's network holds jarvis and the guard alone" "$(members "$jarvis_out")" "guard jarvis "
expect "the reader's network holds jarvis and the reader alone" "$(members "$reader_net")" "jarvis jarvis_reader "
expect "the reader's way out's network holds the reader and the guard alone" "$(members "$reader_out")" "guard jarvis_reader "
expect "the admin API's network holds the server alone" "$(members "$admin_net")" "server "
expect "jarvis holds its address on its network" \
	"$(docker inspect --format "{{(index .NetworkSettings.Networks \"$jarvis_net\").IPAddress}}" "$jarvis")" "$JARVIS_ADDRESS"
expect "the reader holds its address on its network, the one jarvis is told" \
	"$(docker inspect --format "{{(index .NetworkSettings.Networks \"$reader_net\").IPAddress}}" "$reader"):8083" \
	"$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$jarvis" | sed -n 's/^JARVIS_GNOMCP_ADDRESS=//p')"
expect "the server holds the admin API's address on its network" \
	"$(docker inspect --format "{{(index .NetworkSettings.Networks \"$admin_net\").IPAddress}}" "$server")" "$ADMIN_ADDRESS"

# Who reaches jarvis: the server by its name, with the door's key; nothing on the internal network, nor the guard's network
# (Tailscale's), where jarvis's way out's address is no listener of its own.
expect "the server reads jarvis's budgets by its name, not through its way out" "$(door right GET /budgets)" '200 {"ask":3,"translate":1}'
expect "jarvis, off by default, answers a question off" "$(door right POST /ask "$ask_body")" '200 {"status":"off"}'
expect "nothing on the internal network reaches jarvis" "$(answering "$inside" "$JARVIS_ADDRESS:8081" jarvis:8081)" ""
out_address=$(docker inspect --format "{{(index .NetworkSettings.Networks \"$jarvis_out\").IPAddress}}" "$jarvis")
# From a container on jarvis's way out's network, not the guard's own namespace, whose rules refuse every private address
# first (10j's review, V9, S5): its proxy answers there (the control), jarvis's port never.
expect "jarvis's way out's network reaches no listener of jarvis's" "$(answering "$jarvis_out" "$out_address:8081")" ""
expect "and reaches its proxy (the control)" "$(answering "$jarvis_out" guard:4751)" guard:4751
expect "the admin API answers on its own network" "$(answering "$admin_net" "$ADMIN_ADDRESS:8082")" "$ADMIN_ADDRESS:8082"
expect "and on no other" "$(answering "$inside" server:8082) $(answering "$jarvis_net" server:8082)" " "
expect "jarvis's network reaches no port of the server's" "$(answering "$jarvis_net" server:8080 server:8082)" ""
# Neither network reaches the host, its LAN or the internet, but jarvis's own port as its control (10j's review, V11).
expect "jarvis's way out's network reaches no address of the host or the internet" \
	"$(answering "$jarvis_out" "$hostip:$canary" 1.1.1.1:443 "$(default_gateway):80")" ""
expect "jarvis reaches no address of the host or the internet but through its way out" \
	"$(answering "container:$jarvis" "$hostip:$canary" 1.1.1.1:443 "$JARVIS_ADDRESS:8081")" "$JARVIS_ADDRESS:8081"
# Nor Ergo, the server, web or their addresses inside, nor a private address: jarvis's own namespace has the server's network
# and no other of the demo's, and its way out's rules refuse private addresses, so each of these answers nothing but its own port.
expect "jarvis reaches no Ergo, no server, no web and no private address" \
	"$(answering "container:$jarvis" ergo:6667 server:8080 web:8080 "$SERVER_ADDRESS:8080" "$WEB_ADDRESS:8080" 10.0.0.1:80 192.168.1.1:80 169.254.169.254:80 "$JARVIS_ADDRESS:8081")" "$JARVIS_ADDRESS:8081"
expect "jarvis's names: a request naming another host reaches no route" "$(door right GET /budgets "" "http://$JARVIS_ADDRESS:8081" | cut -c1-3)" 404

# Its way out: its own proxy on 4751, from its own network alone, to its own list; the server's proxy and list never.
docker cp "$egress_jarvis:/etc/smokescreen/jarvis-acl.yaml" - | tar -xO >"$tmp/jarvis-acl.yaml"
expect "jarvis's way out lets four hosts out: Anthropic's API, gnoscope and each universe's node, no indexer" \
	"$(sed -n 's/^ *- *//p' "$tmp/jarvis-acl.yaml" | tr -d '"' | sort | tr '\n' ' ')" \
	"$(python3 -I -c 'import json, sys, urllib.parse as u
rows = json.load(open(sys.argv[1]))
hosts = ["api.anthropic.com", "gnoscope.com"] + [u.urlparse(row["rpc"]).hostname for row in rows]
print(" ".join(sorted(hosts)) + " ")' "$repo/app/data/universes.json")"
case $(via https://api.anthropic.com/v1/models guard:4751 "$jarvis_out") in
"200 "[1-5]*) pass "jarvis reaches Anthropic's API through its way out" ;;
*) fail "jarvis does not reach Anthropic's API through its way out" ;;
esac
for target in https://api.openai.com/ https://api.coingecko.com/ https://example.com/ https://api.anthropic.com.evil.test/ http://169.254.169.254/ https://indexer.gno.land/ https://indexer.onyx.testnets.gno.land/; do
	case $(via "$target" guard:4751 "$jarvis_out") in *407*) pass "jarvis's way out refuses $target" ;; *) fail "jarvis's way out does not refuse $target" ;; esac
done
expect "jarvis cannot use the server's way out" "$(via https://api.openai.com/ guard:4750 "$jarvis_out" | cut -c1-3)" 000
expect "nor the internal network jarvis's" "$(via https://api.anthropic.com/ guard:4751 "$inside" | cut -c1-3)" 000
expect "nor the reader's way out" "$(via https://rpc.gno.land/ guard:4753 "$jarvis_out" | cut -c1-3)" 000
expect "the guard's rules refuse 4751 but from jarvis's network" "$(docker exec "$guard" iptables-nft -S INPUT | grep -c -- '--dport 4751 -j REJECT')" 1
jarvis_fetch() { docker exec "$jarvis" /nodejs/bin/node -e "fetch('$1').then((r) => console.log(r.status), () => console.log('refused'))" 2>&1 || true; }
case $(jarvis_fetch https://api.anthropic.com/v1/models) in [1-5][0-9][0-9]) pass "jarvis's own requests take its way out" ;; *) fail "jarvis's own requests do not take its way out" ;; esac
expect "and nothing else" "$(jarvis_fetch https://example.com/)" refused

# The reader: gnomcp alone, no secret, no volume, a user of its own; its way out lets exactly the nodes and indexers of the
# universes (deploy/egress/reader-acl.yaml) out, from its own network alone, and never Anthropic, never a private address.
reader_list() { docker cp "$egress_reader:/etc/smokescreen/reader-acl.yaml" - | tar -xO | sed -n 's/^ *- *//p' | tr -d '"' | sort | tr '\n' ' '; }
expect "the reader's way out lets four hosts out: each universe's node and indexer" "$(reader_list)" \
	"$(python3 -I -c 'import json, sys, urllib.parse as u
rows = json.load(open(sys.argv[1]))
hosts = [u.urlparse(row[key]).hostname for row in rows for key in ("rpc", "indexer")]
print(" ".join(sorted(hosts)) + " ")' "$repo/app/data/universes.json")"
for host in rpc.onyx.testnets.gno.land indexer.onyx.testnets.gno.land rpc.gno.land indexer.gno.land; do
	case $(via "https://$host/" guard:4753 "$reader_out") in
	"200 "[1-5]*) pass "the reader reaches $host through its way out" ;;
	*) fail "the reader does not reach $host through its way out" ;;
	esac
done
for target in https://api.anthropic.com/ https://api.openai.com/ https://example.com/ https://gnoscope.com/ https://api.anthropic.com.evil.test/ http://169.254.169.254/ http://10.0.0.1.nip.io/; do
	case $(via "$target" guard:4753 "$reader_out") in *407*) pass "the reader's way out refuses $target" ;; *) fail "the reader's way out does not refuse $target" ;; esac
done
expect "the reader cannot use the server's way out, nor jarvis's" \
	"$(via https://rpc.gno.land/ guard:4750 "$reader_out" | cut -c1-3) $(via https://api.anthropic.com/ guard:4751 "$reader_out" | cut -c1-3)" "000 000"
expect "nothing but the reader's network reaches the reader's way out" \
	"$(via https://rpc.gno.land/ guard:4753 "$inside" | cut -c1-3) $(via https://rpc.gno.land/ guard:4753 "$jarvis_out" | cut -c1-3)" "000 000"
expect "the guard's rules refuse 4753 but from the reader's network" "$(docker exec "$guard" iptables-nft -S INPUT | grep -c -- '--dport 4753 -j REJECT')" 1
# The relay: gnomcp resolves every host to one loopback address, where a listener reads the TLS hello's server name, refuses a name
# off its list and tunnels to the rest through the way out, the TLS end to end (curl verifies the host's own certificate).
# Asked from the reader's own namespace.
from_reader() { docker run --rm --network "container:$reader" "$CURL" -s -o /dev/null -w '%{http_code}' --max-time 20 "$@" || true; }
case $(from_reader --resolve rpc.gno.land:443:127.0.0.2 https://rpc.gno.land/status) in
200) pass "the reader reaches an RPC host through its relay, its certificate checked" ;;
*) fail "the reader does not reach an RPC host through its relay" ;;
esac
case $(from_reader --resolve indexer.onyx.testnets.gno.land:443:127.0.0.2 https://indexer.onyx.testnets.gno.land/) in
[234][0-9][0-9]) pass "and an indexer" ;;
*) fail "the reader does not reach an indexer through its relay" ;;
esac
expect "the relay refuses a name off its list" \
	"$(from_reader --resolve api.anthropic.com:443:127.0.0.2 https://api.anthropic.com/)" 000
expect "the reader's way out's network reaches no listener of the reader's" \
	"$(answering "$reader_out" "$(docker inspect --format "{{(index .NetworkSettings.Networks \"$reader_out\").IPAddress}}" "$reader"):8083")" ""
expect "and reaches its proxy (the control)" "$(answering "$reader_out" guard:4753)" guard:4753
expect "the reader reaches no address of the host or the internet but through its relay" \
	"$(answering "container:$reader" "$hostip:$canary" 1.1.1.1:443 "$(default_gateway):80" "$SERVER_ADDRESS:8080" "$JARVIS_ADDRESS:8081" "$READER_ADDRESS:8083")" "$READER_ADDRESS:8083"
expect "nothing on the internal network, nor on jarvis's way out's, reaches the reader's port" \
	"$(answering "$inside" "$READER_ADDRESS:8083") $(answering "$jarvis_out" "$READER_ADDRESS:8083")" " "
# gnomcp's reads through the reader, from jarvis (which holds the address): one MCP session over the bridge's connection, as
# jarvis's own client makes it, a read of the nodes of both chains and one of the mainnet's indexer.
read_js=$(
	cat <<'JS'
const net = require('node:net');
const [host, port] = process.env.JARVIS_GNOMCP_ADDRESS.split(':');
const socket = net.connect(Number(port), host);
const send = (message) => socket.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
let buffer = '';
socket.on('data', (chunk) => {
  buffer += chunk;
  for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
    const message = JSON.parse(buffer.slice(0, at));
    buffer = buffer.slice(at + 1);
    if (message.id === 1) {
      send({ method: 'notifications/initialized' });
      send({ id: 2, method: 'tools/call', params: { name: process.env.TOOL, arguments: JSON.parse(process.env.ARGS) } });
    } else if (message.id === 2) {
      console.log(message.result && message.result.isError !== true ? 'read' : 'failed');
      process.exit(0);
    }
  }
});
socket.on('error', () => { console.log('refused'); process.exit(0); });
setTimeout(() => { console.log('timeout'); process.exit(0); }, 40000);
send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'proof', version: '1' } } });
JS
)
gnomcp_read() { docker exec -e TOOL="$1" -e ARGS="$2" "$jarvis" /nodejs/bin/node -e "$read_js" 2>&1 || true; }
expect "gnomcp's reads succeed through the reader: Onyx's node, gno.land's node, gno.land's indexer" \
	"$(gnomcp_read gno_status '{"profile":"onyx"}') $(gnomcp_read gno_status '{"profile":"gnoland"}') $(gnomcp_read gno_history '{"profile":"gnoland","realm":"gno.land/r/gnoland/home"}')" \
	"read read read"
# gnomcp's audit reaches the reader's log as tool, result and duration alone: a planted argument of a read never does.
planted=zzplantedargumentzz
gnomcp_read gno_render "{\"profile\":\"gnoland\",\"realm\":\"gno.land/r/$planted/home\"}" >/dev/null
reader_log=$(docker logs "$reader" 2>&1)
expect "the reader's log shows gnomcp's tool and never a planted argument" \
	"$(printf '%s\n' "$reader_log" | grep -c '"tool":"gno_render"' | sed 's/^[1-9][0-9]*$/some/') $(printf '%s\n' "$reader_log" | grep -c "$planted" || true)" "some 0"
# Docker's own DNS answers no outside name on these networks: neither the reader nor jarvis can send data out in a lookup. Each
# has its control, a name of its own network, which resolves.
dns_outside() { docker run --rm --network "container:$1" --entrypoint nslookup "$CURL" "$2" 2>/dev/null | sed -n 's/^Address: //p' | grep -vc '^127\.' || true; }
expect "neither the reader nor jarvis resolves an outside name" "$(dns_outside "$reader" example.com) $(dns_outside "$jarvis" example.com)" "0 0"
case $(dns_outside "$reader" guard)$(dns_outside "$jarvis" server) in [1-9]*) pass "and each resolves a name of its own network (the control)" ;; *) fail "the DNS check is blind: no name of their own network resolves" ;; esac

# What it holds: nothing of jarvis's or the server's, no volume, no file of the host; a user nobody else runs as.
expect "the reader mounts no volume and no file" "$(docker inspect --format '{{range .Mounts}}{{if ne .Type "tmpfs"}}{{.Destination}} {{end}}{{end}}' "$reader")" ""
expect "the reader holds no secret" \
	"$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$reader" | grep -ciE 'key|token|secret|password' || true) $(docker inspect --format '{{range .Mounts}}{{println .Destination}}{{end}}' "$reader" | grep -c '^/run/secrets/' || true)" "0 0"
expect "the reader's only sysctl opens its ports below 1024 to its own user, in its own namespace" \
	"$(docker inspect --format '{{json .HostConfig.Sysctls}}' "$reader")" '{"net.ipv4.ip_unprivileged_port_start":"0"}'
expect "the reader runs as its own user" "$(docker inspect --format '{{.Config.User}}' "$reader")" 65531:65531
expect "no other service runs as it" "$(docker ps -q --filter "label=com.docker.compose.project=$project" | while read -r id; do docker inspect --format '{{.Config.User}}' "$id"; done | grep -cx 65531:65531 || true)" 1
expect "the image holds gnomcp 0.11.0, as the reader's" "$(docker exec "$reader" /usr/local/bin/gnomcp version 2>&1)" 0.11.0

# Its file, on a volume only it mounts; its keys, secrets the server never holds, the door's the server's and its own; its stop,
# past its drain; nothing else of the server's, no database of it.
mounted() { docker inspect --format "{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Name}}{{end}}{{end}}" "$1"; }
expect "jarvis keeps its file on its own volume" "$(mounted "$jarvis" /data)" "${project}_jarvis"
expect "no other service mounts it" "$(docker ps -q --filter "label=com.docker.compose.project=$project" | while read -r id; do mounted "$id" /data; done | grep -cx "${project}_jarvis" || true)" 1
expect "jarvis mounts its file and its two keys, nothing of the server's" \
	"$(docker inspect --format '{{range .Mounts}}{{if ne .Type "tmpfs"}}{{.Destination}} {{end}}{{end}}' "$jarvis" | tr ' ' '\n' | grep . | sort | tr '\n' ' ')" \
	"/data /run/secrets/anthropic_api_key /run/secrets/jarvis_door_key "
expect "jarvis holds its key read-only" "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/run/secrets/anthropic_api_key"}}{{.RW}}{{end}}{{end}}' "$jarvis")" false
expect "the server holds no Anthropic key" "$(docker inspect --format '{{range .Mounts}}{{.Destination}} {{end}}' "$server" | grep -c anthropic || true)" 0
holders() { docker ps -q --filter "label=com.docker.compose.project=$project" | while read -r id; do
	case $(docker inspect --format '{{range .Mounts}}{{.Destination}} {{end}}' "$id") in *"$1"*) docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id" ;; esac
done | sort | tr '\n' ' '; }
expect "only the server and jarvis hold the door's key" "$(holders /run/secrets/jarvis_door_key)" "jarvis server "
expect "the server holds the door's key, read-only" "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/run/secrets/jarvis_door_key"}}{{.RW}}{{end}}{{end}}' "$server")" false
expect "and jarvis too" "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/run/secrets/jarvis_door_key"}}{{.RW}}{{end}}{{end}}' "$jarvis")" false
expect "jarvis waits 35 s for its drain" "$(docker inspect --format '{{.Config.StopTimeout}}' "$jarvis")" 35
expect "jarvis runs as its own user" "$(docker inspect --format '{{.Config.User}}' "$jarvis")" 65533:65533
expect "init reaps its children" "$(docker inspect --format '{{.HostConfig.Init}}' "$jarvis")" true
expect "jarvis is started with its flag" "$(docker inspect --format '{{json .Config.Cmd}}' "$jarvis" | grep -c -- '--disallow-code-generation-from-strings' || true)" 1
expect "and no NODE_OPTIONS" "$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$jarvis" | grep -c '^NODE_OPTIONS=' || true)" 0

# Its image: jarvis's code, no gnomcp (it is the reader's, over the network: nothing jarvis runs starts it, nor reads its
# keys through it), no server code, no test, no test helper.
expect "jarvis's image holds no gnomcp" "$(docker exec "$jarvis" /nodejs/bin/node -e "console.log(require('node:fs').existsSync('/gnomcp') || require('node:fs').existsSync('/app/deploy/jarvis/gnomcp.toml'))" 2>&1)" false
image_files=$(docker exec "$jarvis" /nodejs/bin/node -e "
const { readdirSync } = require('node:fs');
for (const entry of readdirSync('/app', { recursive: true, withFileTypes: true }))
  if (entry.isFile() && !entry.parentPath.includes('/node_modules')) console.log(entry.parentPath + '/' + entry.name);
" 2>&1 || true)
expect "the image holds jarvis's entry" "$(printf '%s\n' "$image_files" | grep -cx /app/jarvis/src/main.ts || true)" 1
expect "the image holds no test, bench or test helper" "$(printf '%s\n' "$image_files" | grep -cE '\.(test|bench)\.ts$|/testing/' || true)" 0
expect "the image holds no server code, script or eval" "$(printf '%s\n' "$image_files" | grep -cE '^/app/(server|scripts|evals|\.claude)/' || true)" 0

# Jarvis switched on: only when the last evals result passes (deploy/jarvis-evals-gate.py), which says why when it does not.
# On, jarvis reads its key and the door's, reaches gnomcp through the reader and checks it (our seven tools, every profile
# read-only) before it answers: healthy is that start. Its key is no key: the model is not asked.
allowed=$(python3 -I "$gate" "$repo/evals/results" "$repo/evals/cases" 2>&1 || true)
if [ "$allowed" = ok ]; then
	if ! JARVIS=on docker compose -p "$project" $files --profile jarvis up -d --force-recreate --wait --no-deps jarvis; then
		echo "test-jarvis.sh: jarvis did not start switched on: $(docker compose -p "$project" $files --profile jarvis logs --no-log-prefix --tail 3 jarvis 2>&1 | tr '\n' ' ')" >&2
		exit 3
	fi
	jarvis=$(docker compose -p "$project" $files --profile jarvis ps -q jarvis)
	expect "jarvis switched on starts, its start checking gnomcp through the reader" "$(docker inspect --format '{{.State.Health.Status}}' "$jarvis")" healthy
	expect "jarvis on answers 401 to a request with no key" "$(door none POST /ask "$ask_body" | cut -c1-3)" 401
	expect "jarvis on serves the door's key" "$(door right GET /budgets)" '200 {"ask":3,"translate":1}'
else
	echo "skip  jarvis switched on is not started: $allowed; its proofs wait for the evals (docs/OPERATIONS.md, \"Switching Jarvis on\")"
fi
