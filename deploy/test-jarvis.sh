# deploy/test-jarvis.sh: jarvis's proofs in the stack (10j; ADR-0002 §5, §7), sourced by deploy/test.sh once the
# server's way out is proven, with its helpers and the running stack's containers ($jarvis, $egress_jarvis, $server,
# $guard). jarvis stays off (JARVIS unset): it serves its budgets and answers off, reads no key and starts no gnomcp.
# jarvis/src/deploy.test.ts and image.test.ts read the same files as text; this proves them on Docker.
jarvis_net=${project}_jarvis
jarvis_out=${project}_jarvis_out
admin_net=${project}_admin

# Its networks: the one it shares with the server alone, and its way out's with the guard alone; the admin API's has the
# server alone. None lets out, none has a gateway.
expect "jarvis sits on its two networks only" "$(networks_of "$jarvis")" "$jarvis_net $jarvis_out "
for net in "$jarvis_net" "$jarvis_out" "$admin_net"; do
	expect "$net has no way out" "$(docker network inspect --format '{{.Internal}}' "$net")" true
	case $(docker network inspect --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' "$net") in
	"" | "invalid IP") pass "$net has no gateway" ;;
	*) fail "$net has a gateway" ;;
	esac
done
members() { docker network inspect --format '{{range .Containers}}{{.Name}} {{end}}' "$1" | tr ' ' '\n' | grep . | sed "s/^${project}-//; s/-[0-9]*$//" | sort | tr '\n' ' '; }
expect "jarvis's network holds jarvis and the server alone" "$(members "$jarvis_net")" "jarvis server "
expect "its way out's network holds jarvis and the guard alone" "$(members "$jarvis_out")" "guard jarvis "
expect "the admin API's network holds the server alone" "$(members "$admin_net")" "server "
expect "jarvis holds its address on its network" \
	"$(docker inspect --format "{{(index .NetworkSettings.Networks \"$jarvis_net\").IPAddress}}" "$jarvis")" "$JARVIS_ADDRESS"
expect "the server holds the admin API's address on its network" \
	"$(docker inspect --format "{{(index .NetworkSettings.Networks \"$admin_net\").IPAddress}}" "$server")" "$ADMIN_ADDRESS"

# Who reaches jarvis: the server by its name; nothing on the internal network, nor the guard's network (Tailscale's),
# where jarvis's way out's address is no listener of its own.
on_jarvis=$(docker exec "$server" /nodejs/bin/node -e "fetch('http://jarvis:8081/budgets').then(async (r) => console.log(r.status, await r.text()), () => console.log('refused'))" 2>&1 || true)
expect "the server reads jarvis's budgets by its name, not through its way out" "$on_jarvis" '200 {"ask":3,"translate":1}'
asked=$(docker exec "$server" /nodejs/bin/node -e "fetch('http://jarvis:8081/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'hi', room: '#gnoworld', lines: [] }) }).then(async (r) => console.log(r.status, await r.text()), () => console.log('refused'))" 2>&1 || true)
expect "jarvis, off by default, answers a question off" "$asked" '200 {"status":"off"}'
expect "nothing on the internal network reaches jarvis" "$(answering "$inside" "$JARVIS_ADDRESS:8081" jarvis:8081)" ""
out_address=$(docker inspect --format "{{(index .NetworkSettings.Networks \"$jarvis_out\").IPAddress}}" "$jarvis")
expect "the guard's network reaches no listener of jarvis's" "$(answering "container:$guard" "$out_address:8081")" ""
expect "the admin API answers on its own network alone" "$(answering "$inside" server:8082) $(answering "$jarvis_net" server:8082)" " "
expect "jarvis's names: a request naming another host reaches no route" \
	"$(docker exec "$server" /nodejs/bin/node -e "fetch('http://$JARVIS_ADDRESS:8081/budgets').then((r) => console.log(r.status), () => console.log('refused'))" 2>&1 || true)" 404

# Its way out: its own proxy on 4751, from its own network alone, to its own list; the server's proxy and list never.
docker cp "$egress_jarvis:/etc/smokescreen/jarvis-acl.yaml" - | tar -xO >"$tmp/jarvis-acl.yaml"
expect "jarvis's way out lets six hosts out: Anthropic's API, gnoscope and each universe's node and indexer" \
	"$(sed -n 's/^ *- *//p' "$tmp/jarvis-acl.yaml" | tr -d '"' | sort | tr '\n' ' ')" \
	"$(python3 -I -c 'import json, sys, urllib.parse as u
rows = json.load(open(sys.argv[1]))
hosts = ["api.anthropic.com", "gnoscope.com"] + [u.urlparse(row[key]).hostname for row in rows for key in ("rpc", "indexer")]
print(" ".join(sorted(hosts)) + " ")' "$repo/app/data/universes.json")"
case $(via https://api.anthropic.com/v1/models guard:4751 "$jarvis_out") in
"200 "[1-5]*) pass "jarvis reaches Anthropic's API through its way out" ;;
*) fail "jarvis does not reach Anthropic's API through its way out" ;;
esac
for target in https://api.openai.com/ https://api.coingecko.com/ https://example.com/ https://api.anthropic.com.evil.test/ http://169.254.169.254/; do
	case $(via "$target" guard:4751 "$jarvis_out") in *407*) pass "jarvis's way out refuses $target" ;; *) fail "jarvis's way out does not refuse $target" ;; esac
done
expect "jarvis cannot use the server's way out" "$(via https://api.openai.com/ guard:4750 "$jarvis_out" | cut -c1-3)" 000
expect "nor the internal network jarvis's" "$(via https://api.anthropic.com/ guard:4751 "$inside" | cut -c1-3)" 000
expect "the guard's rules refuse 4751 but from jarvis's network" "$(docker exec "$guard" iptables-nft -S INPUT | grep -c -- '--dport 4751 -j REJECT')" 1
jarvis_fetch() { docker exec "$jarvis" /nodejs/bin/node -e "fetch('$1').then((r) => console.log(r.status), () => console.log('refused'))" 2>&1 || true; }
case $(jarvis_fetch https://api.anthropic.com/v1/models) in [1-5][0-9][0-9]) pass "jarvis's own requests take its way out" ;; *) fail "jarvis's own requests do not take its way out" ;; esac
expect "and nothing else" "$(jarvis_fetch https://example.com/)" refused

# Its file, on a volume only it mounts; its key, a secret the server never holds; its stop, past its drain.
expect "jarvis keeps its file on its own volume" "$(mounted "$jarvis" /data)" "${project}_jarvis"
expect "no other service mounts it" "$(docker ps -q --filter "label=com.docker.compose.project=$project" | while read -r id; do mounted "$id" /data; done | grep -cx "${project}_jarvis" || true)" 1
expect "jarvis holds its key read-only" "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/run/secrets/anthropic_api_key"}}{{.RW}}{{end}}{{end}}' "$jarvis")" false
expect "the server holds no Anthropic key" "$(docker inspect --format '{{range .Mounts}}{{.Destination}} {{end}}' "$server" | grep -c anthropic || true)" 0
expect "jarvis waits 35 s for its drain" "$(docker inspect --format '{{.Config.StopTimeout}}' "$jarvis")" 35
expect "jarvis runs as its own user" "$(docker inspect --format '{{.Config.User}}' "$jarvis")" 65533:65533
expect "init reaps its children" "$(docker inspect --format '{{.HostConfig.Init}}' "$jarvis")" true
expect "jarvis is started with its flag" "$(docker inspect --format '{{json .Config.Cmd}}' "$jarvis" | grep -c -- '--disallow-code-generation-from-strings' || true)" 1
expect "and no NODE_OPTIONS" "$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$jarvis" | grep -c '^NODE_OPTIONS=' || true)" 0

# Its image: gnomcp 0.11.0, jarvis's code, no server code, no test, no test helper.
expect "the image holds gnomcp 0.11.0" "$(docker exec "$jarvis" /gnomcp/gnomcp version 2>&1)" 0.11.0
image_files=$(docker exec "$jarvis" /nodejs/bin/node -e "
const { readdirSync } = require('node:fs');
for (const entry of readdirSync('/app', { recursive: true, withFileTypes: true }))
  if (entry.isFile() && !entry.parentPath.includes('/node_modules')) console.log(entry.parentPath + '/' + entry.name);
" 2>&1 || true)
expect "the image holds jarvis's entry" "$(printf '%s\n' "$image_files" | grep -cx /app/jarvis/src/main.ts || true)" 1
expect "the image holds no test, bench or test helper" "$(printf '%s\n' "$image_files" | grep -cE '\.(test|bench)\.ts$|/testing/' || true)" 0
expect "the image holds no server code, script or eval" "$(printf '%s\n' "$image_files" | grep -cE '^/app/(server|scripts|evals|\.claude)/' || true)" 0
