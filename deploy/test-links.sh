# deploy/test-links.sh: the link reader's proofs (slice 13, L1; D13919; docs/plans/link-previews.md §4), sourced by deploy/test.sh with its
# helpers, as test-jarvis.sh is: in --mutants, its faults; else, once the demo is proven, it starts the reader and its way out under
# the `links` profile and proves them. Not run where Docker is unreachable (the build sandbox): link-reader/src/deploy.test.ts reads the
# same files as text; this proves them on Docker. Needs the network for its controls (example.com).
if [ "${1:-}" = --mutants ]; then
	links_acl() { over egress_links /etc/smokescreen/links-acl.yaml "$here/egress/links-acl.yaml" "$@"; }
	# The server's own list opened, the link way out kept from refusing a private address, the guard's rule for 4754 dropped, the reader
	# put where it must not be, given a secret or a volume, root, writable.
	mutant "an open list on the server's way out" "the server's own proxy holds its list" acl sed 's/action: enforce/action: open/'
	mutant "private ranges let through on the link way out" "the link way out refuses http://10.0.0.1.nip.io/" \
		over egress_links /etc/smokescreen/config.yaml "$here/egress/config.yaml" sed 's#^unsafe_allow_private_ranges:.*#unsafe_allow_private_ranges: true#'
	mutant "the link way out closed to a public host" "the link reader reaches example.com through its way out" links_acl sed 's/action: open/action: enforce/'
	mutant "the link way out open to other networks" "the guard's rules refuse 4754 but from the link reader's network" guard sed '/--dport 4754 -j REJECT/d'
	mutant "the guard drops the link reader's replies" "the link reader reaches example.com through its way out" guard sed '/--sport 4754/d'
	mutant "the link reader on the internal network" "the link reader sits on its two networks only" compose 'services: { link_reader: { networks: { inside: {} } } }'
	mutant "OpenAI's key given to the link reader" "the link reader holds no secret" compose 'services: { link_reader: { secrets: [openai_api_key] } }'
	mutant "the server's volume given to the link reader" "the link reader mounts no volume and no file" compose 'services: { link_reader: { volumes: ["server:/data"] } }'
	mutant "the link reader's root writable" "link_reader: read-only root" compose 'services: { link_reader: { read_only: false } }'
	mutant "the link reader as root" "link_reader runs as root" compose 'services: { link_reader: { user: "0:0" } }'
	mutant "a port of the link reader published on the host" "link_reader binds a port on the host" compose 'services: { link_reader: { ports: ["127.0.0.1:18084:8084"] } }'
	mutant "the link reader listening on all its addresses" "the link way out's network reaches no listener of the link reader's" compose 'services: { link_reader: { environment: { LINKS_LISTEN: "0.0.0.0:8084" } } }'
	mutant "a container joined to the link reader's network" "the link reader's network holds the reader and the server alone" compose 'services: { web: { networks: { links: {} } } }'
	mutant "the link reader back in the demo" "the demo profile holds no link reader, nor its way out" compose 'services: { link_reader: { profiles: [demo] } }'
	# The server's API bound to every address (reaching the link reader's network): the reader would then reach the server, which holds OpenAI's
	# key. And a hole in both layers of the link way out for web's network (smokescreen's private-range refusal off, the guard's 172.16/12 narrowed).
	mutant "the server listening on every address" "the link reader reaches no port of the server's" compose 'services: { server: { environment: { HOST: 0.0.0.0 } } }'
	web_open() {
		n=$((n + 1))
		mkdir "$tmp/guard.$n"
		sed 's#172.16.0.0/12#172.16.0.0/13#' "$here/guard/guard.sh" >"$tmp/guard.$n/guard.sh"
		sed 's#^unsafe_allow_private_ranges:.*#unsafe_allow_private_ranges: true#' "$here/egress/config.yaml" >"$tmp/over.$n"
		printf 'services:\n  guard:\n    volumes: !override\n      - %s:/guard:ro\n  egress_links:\n    volumes:\n      - %s:/etc/smokescreen/config.yaml:ro\n' "$tmp/guard.$n" "$tmp/over.$n"
	}
	mutant "web's network allowed in both layers of the link way out" "the link way out refuses http://web:8080/" web_open
	mutant "the guard's blanket refusal of the link way out's network gone" "the link way out's network reaches only its own proxy of the guard's ports" \
		guard sed '/-i $links_out -j REJECT/d'
	return 0
fi

# The demo profile holds neither the reader nor its way out: they are outside its ceiling, as Jarvis (D184).
expect "the demo profile holds no link reader, nor its way out" \
	"$(docker compose -p "$project" $files config --services | grep -c -E '^(link_reader|egress_links)$' || true)" 0

# --no-deps: the demo's services, proven already, are neither rebuilt nor recreated under the checks.
if ! docker compose -p "$project" $files --profile links up -d --build --wait --no-deps link_reader egress_links; then
	echo "test-links.sh: the link reader did not start: $(docker compose -p "$project" $files --profile links logs --no-log-prefix --tail 1 link_reader egress_links 2>&1 | tr '\n' ' ')" >&2
	exit 3
fi
reader=$(docker compose -p "$project" $files --profile links ps -q link_reader)
egress_links=$(docker compose -p "$project" $files --profile links ps -q egress_links)
hardened "$reader" link_reader
hardened "$egress_links" egress_links network
links_net=${project}_links
links_out=${project}_links_out

# What is in it: no secret, no volume, no file, a user of its own, two networks, none with a way out or a gateway.
expect "the link reader holds no secret" "$(docker exec "$reader" /nodejs/bin/node -e "console.log(require('node:fs').existsSync('/run/secrets') ? require('node:fs').readdirSync('/run/secrets').length : 0)" 2>&1 || true)" 0
expect "the link reader mounts no volume and no file" "$(docker inspect --format '{{range .Mounts}}{{.Type}} {{.Destination}};{{end}}' "$reader")" ""
case $(docker inspect --format '{{.Config.User}}' "$reader") in
65530:65530) pass "the link reader runs as its own user" ;;
*) fail "the link reader runs as its own user" ;;
esac
expect "the link reader's environment names no key" "$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$reader" | grep -c -i -E 'KEY|SECRET|PASSWORD|TOKEN' || true)" 0
expect "the link reader sits on its two networks only" "$(networks_of "$reader")" "$links_net $links_out "
no_way_out "$links_net" "$links_out"
expect "the link reader's network holds the reader and the server alone" "$(members "$links_net")" "link_reader server "
expect "the link way out's network holds the reader and the guard alone" "$(members "$links_out")" "guard link_reader "
LINK_READER_ADDRESS=$(docker inspect --format "{{(index .NetworkSettings.Networks \"$links_net\").IPAddress}}" "$reader")

# No key is asked of POST /card: the reader holds no secret, and the network is its gate, which only the server joins (members above).
# The server reaches it by its name (through no proxy, the name being in NO_PROXY) and asks for a card; nothing else does.
server_ask() { docker exec -e URL="$1" "$server" /nodejs/bin/node -e "fetch('http://link_reader:8084/card', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: process.env.URL }) }).then(async (r) => console.log(r.status, (await r.text()).slice(0, 300)), () => console.log('refused'))" 2>&1 || true; }
expect "the server reaches the link reader by its name" "$(docker exec "$server" /nodejs/bin/node -e "fetch('http://link_reader:8084/health').then((r) => console.log(r.status), () => console.log('refused'))" 2>&1 || true)" 200
case $(server_ask https://example.com/) in
"200 {"*'"title":'*) pass "POST /card https://example.com/ answers a card" ;;
*) fail "POST /card https://example.com/ does not answer a card: [$(server_ask https://example.com/)]" ;;
esac
expect "the reader refuses a private address in the URL it is given, as the server's rule does (it trusts nothing)" "$(server_ask https://10.0.0.1/ | cut -c1-3)" 422
expect "and a name that resolves private (the way out refuses it)" "$(server_ask https://10.0.0.1.nip.io/ | cut -c1-3)" 422
expect "and the metadata address, http, and a port other than 443" \
	"$(server_ask http://169.254.169.254/ | cut -c1-3) $(server_ask http://example.com/ | cut -c1-3) $(server_ask https://example.com:8443/ | cut -c1-3)" "422 422 422"
expect "the link reader reaches no port of the server's, from its network or from the reader itself" \
	"$(answering "$links_net" server:8080 server:8082 "$SERVER_ADDRESS:8080" "$ADMIN_ADDRESS:8082") $(answering "container:$reader" server:8080 server:8082 "$SERVER_ADDRESS:8080" "$ADMIN_ADDRESS:8082")" " "
expect "nothing on the internal network, nor on the link way out's network, reaches the link reader's port" \
	"$(answering "$inside" "$LINK_READER_ADDRESS:8084") $(answering "$links_out" "$LINK_READER_ADDRESS:8084")" " "
expect "the link reader reaches no address of the host or the internet but through its way out, nor any service of the demo" \
	"$(answering "container:$reader" "$hostip:$canary" 1.1.1.1:443 "$(default_gateway):80" "$SERVER_ADDRESS:8080" web:8080 ergo:6667 "$LINK_READER_ADDRESS:8084")" "$LINK_READER_ADDRESS:8084"

# Its way out, on 4754: any public https host, no private target; from its own network alone. The server's list stays closed.
case $(via https://example.com/ guard:4754 "$links_out") in
"200 "[1-5]*) pass "the link reader reaches example.com through its way out" ;;
*) fail "the link reader does not reach example.com through its way out" ;;
esac
# curl globs the brackets of an IPv6 address unless told (-g).
lvia() { docker run --rm --network "${3:-$links_out}" "$CURL" -g -s -o /dev/null -w '%{http_connect} %{http_code}' --max-time 15 -x "http://${2:-guard:4754}" "$1" || true; }
# Controls first: each name that proves a private answer is refused must resolve to the private address it claims, from here, or its refusal
# proves nothing (a resolver that filters them would make the refusal a resolution failure).
resolves() { python3 -I -c 'import socket, sys; print(socket.gethostbyname(sys.argv[1]))' "$1" 2>/dev/null || echo unresolved; }
expect "the control: localtest.me resolves to 127.0.0.1" "$(resolves localtest.me)" 127.0.0.1
expect "the control: 10.0.0.1.nip.io resolves to 10.0.0.1" "$(resolves 10.0.0.1.nip.io)" 10.0.0.1
expect "the control: 192.168.1.1.sslip.io resolves to 192.168.1.1" "$(resolves 192.168.1.1.sslip.io)" 192.168.1.1
# (A name that answers public, then private, is not proved here: it needs a resolver of ours, which the stack has not; smokescreen resolves
# once and connects to what it checked, and the guard checks every packet.)
for target in http://10.0.0.1/ https://10.0.0.1/ http://127.0.0.1/ http://0.0.0.0/ http://localhost/ http://169.254.169.254/latest/meta-data/ http://192.168.1.1/ http://100.64.0.1/ http://172.16.0.1/ \
	"http://[::1]/" "http://[fc00::1]/" "http://[fe80::1]/" "http://[::ffff:10.0.0.1]/" "http://[::ffff:169.254.169.254]/" "https://[::1]/" \
	http://localtest.me/ https://localtest.me/ http://10.0.0.1.nip.io/ https://10.0.0.1.nip.io/ http://192.168.1.1.sslip.io/ \
	http://web:8080/ "http://$WEB_ADDRESS:8080/" https://web:8080/ http://server/ "http://$SERVER_ADDRESS:8080/" http://guard/ http://ergo:6667/ http://link_reader:8084/ "http://$LINK_READER_ADDRESS:8084/"; do
	case $(lvia "$target") in *407*) pass "the link way out refuses $target" ;; *) fail "the link way out does not refuse $target" ;; esac
done
# The host's own addresses, the LAN's, the tailnet's, on 80 and 443.
for address in $(host_addresses); do
	for scheme in http https; do
		case $(lvia "$scheme://$address/") in *407*) pass "the link way out refuses the host's $scheme://$address/" ;; *) fail "the link way out does not refuse the host's $scheme://$address/" ;; esac
	done
done
# A public port that answers (1.1.1.1:853, which a plain container reaches: test.sh's control) never opens a tunnel through the link way
# out: the guard lets 80 and 443 out alone. How the refused tunnel ends (no answer, or smokescreen's 504 once its own wait is up) is the
# timing's; a tunnel opened (200) is the fault.
case $(via https://1.1.1.1:853/ guard:4754 "$links_out" | cut -c1-3) in
200) fail "the link way out reaches a public port beside 80 and 443 (1.1.1.1:853)" ;;
*) pass "the link way out reaches no port but 80 and 443 (1.1.1.1:853 opens no tunnel)" ;;
esac
expect "the server's own proxy holds its list: example.com via 4750 is 407, and via jarvis's and the gnomcp reader's ways out nothing" \
	"$(via https://example.com/ guard:4750 "$inside" | cut -c1-3) $(via https://example.com/ guard:4751 "$links_out" | cut -c1-3) $(via https://example.com/ guard:4753 "$links_out" | cut -c1-3)" "407 000 000"
expect "nothing but the link reader's network reaches the link way out" \
	"$(via https://example.com/ guard:4754 "$inside" | cut -c1-3) $(via https://example.com/ guard:4754 "${project}_jarvis_out" | cut -c1-3) $(via https://example.com/ guard:4754 "${project}_reader_out" | cut -c1-3) $(via https://example.com/ guard:4754 "${project}_jarvis" | cut -c1-3)" "000 000 000 000"
expect "the guard's rules refuse 4754 but from the link reader's network" "$(docker exec "$guard" iptables-nft -S INPUT | grep -c -- '--dport 4754 -j REJECT')" 1
expect "the link way out's network reaches only its own proxy of the guard's ports: not the server's, jarvis's or the reader's, nor Tailscale's" \
	"$(answering "$links_out" guard:4750 guard:4751 guard:4753 guard:9002 guard:80 guard:443 guard:41641)" ""
expect "the link way out's network reaches no listener of the link reader's" \
	"$(answering "$links_out" "$LINK_READER_ADDRESS:8084")" ""
expect "the link way out's network reaches no address of the host or the internet" "$(answering "$links_out" "$hostip:$canary" 1.1.1.1:443 "$(default_gateway):80")" ""
expect "and reaches its proxy (the control)" "$(answering "$links_out" guard:4754)" guard:4754
expect "the link way out's list names no host" "$(docker cp "$egress_links:/etc/smokescreen/links-acl.yaml" - | tar -xO | grep -c -E '^ +- ' || true)" 0
