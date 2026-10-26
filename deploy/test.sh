#!/bin/sh
# deploy/test.sh: the demo's proofs (docs/plans/slice-1c.md §3), on the demo's host, macOS or
# Linux, with Docker Engine 28 or later. It needs Docker's socket, which Claude Code's sandbox
# refuses, so the operator runs it:
#   sh deploy/test.sh            builds the static server, starts it with the guard in a throwaway
#                                project and a password of its own, checks both, then removes it;
#   sh deploy/test.sh --mutants  the same against faults planted one at a time: each must fail;
#   sh deploy/test.sh --demo     checks the running demo: Tailscale, its tailnet, the public URL;
#                                it asks for the demo's password, which no command line shows.
# Its output names the host's own addresses and ports: never commit it, nor paste it in public.
# Exit: 0 every check passed, 1 a check failed, 2 a tool or a fact of the host is missing, 3 the
# stack did not start.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(dirname "$here")
CURL=curlimages/curl:8.23.0@sha256:a134550be58ab783810e613ae96fd253c38f7bdd16d9bf9be350700c7a29ac06
GOLANG=golang:1.26.2-alpine@sha256:f85330846cde1e57ca9ec309382da3b8e6ae3ab943d2739500e08c86393a21b1
project=${TEST_PROJECT:-gnoworld-demo-test}
os=$(uname -s)
failed=0

missing() {
	echo "test.sh: $1" >&2
	exit 2
}
case ${1:-} in "" | --mutants | --demo) ;; *) missing "no such mode [$1]: none, --mutants or --demo" ;; esac
case $os in
Darwin) host_tools="netstat route ifconfig arp" ;;
Linux) host_tools="ss ip" ;;
*) missing "it runs on macOS or Linux, not $os" ;;
esac
[ "${1:-}" != --demo ] || host_tools="$host_tools dig" # only --demo resolves the public name
for tool in docker curl python3 openssl htpasswd git $host_tools; do
	command -v "$tool" >/dev/null || missing "$tool is missing (htpasswd: apache2-utils or httpd-tools on Linux; dig: dnsutils)"
done
engine=$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)
[ "${engine%%.*}" -ge 28 ] 2>/dev/null || missing "Docker Engine 28 or later is needed (an isolated network's gateway), not [$engine]"

pass() { printf 'ok    %s\n' "$1"; }
fail() {
	printf 'FAIL  %s\n' "$1"
	failed=$((failed + 1))
}
expect() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1: wanted [$3], got [$2]"; fi; }
at_least() { if [ "$2" -ge "$3" ]; then pass "$1 ($2)"; else fail "$1: $2, under $3"; fi; }
is_public() { python3 -c "import ipaddress, sys; a = ipaddress.ip_address(sys.argv[1]); print(a.is_global and a not in ipaddress.ip_network('100.64.0.0/10'))" "$1" 2>/dev/null || echo False; }

# --- What the host offers: its services, its addresses, its router, its LAN, Docker's gateways. --

# Every user's listeners (netstat on macOS, where lsof lists one's own), and the ports of the
# services a system runs as root, listening or not: SSH, Kerberos, file and screen sharing, print.
host_ports() {
	{
		case $os in
		Darwin) netstat -an -p tcp 2>/dev/null | awk '$6 == "LISTEN" { sub(/.*\./, "", $4); print $4 }' ;;
		Linux) ss -ltnH 2>/dev/null | awk '{ sub(/.*:/, "", $4); print $4 }' ;;
		esac
		printf '%s\n' 22 88 445 548 631 2049 3283 5900
	} | grep -E '^[0-9]+$' | sort -un
}
host_addresses() { # every IPv4 address of the host, its tailnet's and its VPNs' included
	case $os in
	Darwin) ifconfig 2>/dev/null | awk '/inet / { print $2 }' ;;
	Linux) ip -4 -o addr show 2>/dev/null | awk '{ sub(/\/.*/, "", $4); print $4 }' ;;
	esac | grep -v '^127\.' | sort -u
}
default_gateway() {
	case $os in
	Darwin) route -n get default 2>/dev/null | awk '/gateway:/ { print $2 }' ;;
	Linux) ip route show default 2>/dev/null | awk '{ print $3; exit }' ;;
	esac
}
neighbours() {
	case $os in
	Darwin) arp -an | awk -F'[()]' '{ print $2 }' ;;
	Linux) ip -4 neigh | awk '{ print $1 }' ;;
	esac | grep . | sort -u
}
gateways() { docker network inspect --format '{{range .IPAM.Config}}{{.Gateway}} {{end}}' $(docker network ls -q) | tr ' ' '\n' | grep -E '^[0-9.]+$' | sort -u; }

# The targets a TCP connection reaches from a network (or from `container:<id>`, that container's
# own). A connect time of zero means none: refused, timed out or no such name; a service that
# accepts and stays silent still counts.
answering() {
	network=$1
	shift
	case $network in container:*) map="" ;; *) map=$hostmap ;; esac
	docker run --rm --network "$network" $map --entrypoint sh "$CURL" -c '
		for target in "$@"; do
			(
				t=$(curl --connect-timeout 3 -m 4 -s -o /dev/null -w "%{time_connect}" "http://$target/" 2>/dev/null)
				case $t in "" | 0 | 0.000000) ;; *) echo "$target" ;; esac
			) &
		done
		wait' sh "$@"
}

# A listener on the host, in an empty folder of its own: the network may reach it and must find
# nothing there. A plain container must see it and the internet first, or the probe is blind.
tmp=$(mktemp -d)
mkdir "$tmp/canary"
canary=$((20000 + $(od -An -N2 -tu2 /dev/urandom | tr -d ' ') % 10000))
python3 -m http.server --bind 0.0.0.0 --directory "$tmp/canary" "$canary" >/dev/null 2>&1 &
canary_pid=$!
files="-f $here/compose.yaml${TEST_OVERRIDE:+ -f $TEST_OVERRIDE} --profile demo" # down leaves a profile's services otherwise
cleanup() {
	kill "$canary_pid" 2>/dev/null || true
	wait "$canary_pid" 2>/dev/null || true
	if [ -n "${started:-}" ]; then
		docker compose -p "$project" $files down -v >/dev/null 2>&1 ||
			echo "test.sh: the project $project is still up: docker compose -p $project --profile demo down -v" >&2
	fi
	rm -r "$tmp"
}
trap cleanup EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$canary/" && break || sleep 0.3; done
expect "the canary serves nothing" "$(curl -s --max-time 3 "http://127.0.0.1:$canary/" | grep -c '<li>' || true)" 0
# Docker Desktop and OrbStack name the host host.docker.internal; Linux's Engine does on request.
hostmap=""
seen=$(answering bridge "host.docker.internal:$canary" 1.1.1.1:443 | sort | tr '\n' ' ')
if [ "$seen" != "1.1.1.1:443 host.docker.internal:$canary " ]; then
	hostmap="--add-host=host.docker.internal:host-gateway"
	seen=$(answering bridge "host.docker.internal:$canary" 1.1.1.1:443 | sort | tr '\n' ' ')
fi
[ "$seen" = "1.1.1.1:443 host.docker.internal:$canary " ] ||
	missing "a plain container sees [$seen], not the host's canary and the internet: the probe is blind"
host_ports | grep -qx "$canary" || missing "the host's listening ports cannot be read: the canary is not among them"
# The address a container reaches the host by, which no gateway or interface of the host may show.
hostip=$(docker run --rm --network bridge $hostmap "$CURL" -s -o /dev/null -w '%{remote_ip}' "http://host.docker.internal:$canary/" || true)

targets() {
	ports=$(host_ports) # the canary among them (checked above)
	router=$(default_gateway)
	addresses=$(host_addresses)
	if [ -z "$router" ] || [ -z "$addresses" ] || [ -z "$hostip" ]; then
		missing "cannot read the host's router, addresses or the address containers reach it by"
	fi
	for port in $ports; do
		printf 'host.docker.internal:%s\n%s:%s\n' "$port" "$hostip" "$port"
		for address in $addresses; do printf '%s:%s\n' "$address" "$port"; done
	done
	for gateway in $(gateways); do
		for port in $ports 22 53 80 443 2375 2376; do printf '%s:%s\n' "$gateway" "$port"; done
	done
	for port in 22 53 80 443; do printf '%s:%s\n' "$router" "$port"; done
	for neighbour in $(neighbours | grep -vx "$router"); do
		for port in 22 80 443; do printf '%s:%s\n' "$neighbour" "$port"; done
	done
}

# What a network reaches: no service of the host (the canary among them), its addresses, its LAN
# or Docker's gateways; the internet only when $3 says yes; $4, the DNS servers the guard lets out.
reach() {
	network=$1 name=$2 internet=$3 allowed=${4:-}
	if [ -z "${list:-}" ]; then
		targets >"$tmp/targets" # in this shell, not a subshell: a missing fact stops the run
		list=$(sort -u "$tmp/targets")
	fi
	# web:8080 rides along: if it is missing from the answers, the fan-out saw nothing at all.
	found=$(answering "$network" $list 1.1.1.1:443 web:8080)
	expect "$name: the probe sees web among its targets" "$(printf '%s\n' "$found" | grep -c '^web:8080$' || true)" 1
	for server in $allowed; do printf 'waived %s: %s, a DNS server the guard lets it ask\n' "$name" "$server"; done
	printf '%s\n' 1.1.1.1:443 web:8080 $allowed >"$tmp/expected"
	host=$(printf '%s\n' "$found" | grep -vxF -f "$tmp/expected" | grep . | sort | tr '\n' ' ' | sed 's/ $//' || true)
	expect "$name reaches nothing of the host, its LAN or Docker's networks ($(printf '%s\n' "$list" | grep -c .) tried, the canary among them)" "$host" ""
	out=$(printf '%s\n' "$found" | grep -c '^1\.1\.1\.1:443$' || true)
	if [ "$internet" = yes ]; then expect "$name reaches the internet" "$out" 1; else expect "$name has no way out to the internet" "$out" 0; fi
}

# A container's hardening as Docker holds it (ADR-0002 §7: locked down and capped). $3 lists what
# is waived for it, each printed: user (root, with no capability left unless listed), net-admin
# (NET_ADMIN and nothing else added back), network (another container's network).
hardened() {
	id=$1 name=$2 waived=" ${3:-} "
	field() { docker inspect --format "$1" "$id"; }
	waives() { case $waived in *" $1 "*) printf 'waived %s: %s\n' "$name" "$1" ;; *) return 1 ;; esac; }
	user=$(field '{{.Config.User}}')
	case $user in "" | 0 | 0:* | root | root:*) waives user || fail "$name runs as root ([$user])" ;; *) pass "$name runs as user $user" ;; esac
	expect "$name: read-only root" "$(field '{{.HostConfig.ReadonlyRootfs}}')" true
	expect "$name: every capability dropped" "$(field '{{json .HostConfig.CapDrop}}')" '["ALL"]'
	added=$(field '{{json .HostConfig.CapAdd}}')
	case $added in
	null | '[]') pass "$name: none added back" ;;
	'["NET_ADMIN"]' | '["CAP_NET_ADMIN"]') waives net-admin || fail "$name: NET_ADMIN added back" ;; # Docker may spell it either way
	*) fail "$name: $added added back" ;;
	esac
	case $(field '{{json .HostConfig.SecurityOpt}}') in *no-new-privileges:true*) pass "$name: no new privileges" ;; *) fail "$name may gain privileges" ;; esac
	case $(field '{{json .HostConfig.SecurityOpt}}') in *unconfined*) fail "$name: seccomp or AppArmor turned off" ;; *) pass "$name: seccomp and AppArmor as Docker sets them" ;; esac
	expect "$name: not privileged" "$(field '{{.HostConfig.Privileged}}')" false
	case $(field '{{.HostConfig.NetworkMode}}') in
	host | none) fail "$name: the host's network, or none" ;;
	container:*) waives network || fail "$name shares another container's network" ;;
	*) pass "$name: a network of its own project" ;;
	esac
	expect "$name: no host pid or ipc" "$(field '{{.HostConfig.PidMode}}|{{.HostConfig.IpcMode}}')" "|private"
	case $(field '{{json .HostConfig.Devices}}') in null | '[]') pass "$name: no device" ;; *) fail "$name: a device of the host" ;; esac
	case $(field '{{json .HostConfig.PortBindings}}') in null | '{}') pass "$name binds no port on the host" ;; *) fail "$name binds a port on the host" ;; esac
	mounts=$(field '{{range .Mounts}}{{.Type}} {{.Source}} {{.RW}};{{end}}')
	case $mounts in *docker.sock*) fail "$name holds Docker's socket" ;; *) pass "$name: no Docker socket" ;; esac
	# One mount at a time: a glob over the list matched a read-only bind with a writable volume.
	if printf '%s' "$mounts" | tr ';' '\n' | grep -q '^bind .* true$'; then fail "$name: a file of the host mounted writable"; else pass "$name: the host's files read-only"; fi
	case $(field '{{json .HostConfig.Tmpfs}}') in *'"/tmp"'*) pass "$name: /tmp in memory" ;; *) fail "$name: no /tmp in memory" ;; esac
	case $(field '{{index .HostConfig.LogConfig.Config "max-size"}}') in # an engine may rotate by default: the size counts
	*[0-9]k | *[0-9]m) pass "$name: its logs rotate, at a size in KB or MB" ;;
	*) fail "$name: its logs grow for good" ;;
	esac
	memory=$(field '{{.HostConfig.Memory}}')
	cpus=$(field '{{.HostConfig.NanoCpus}}')
	if [ "$memory" -gt 0 ] && [ "$memory" -le 1073741824 ]; then pass "$name: memory capped"; else fail "$name: memory [$memory]"; fi
	if [ "$cpus" -gt 0 ] && [ "$cpus" -le 1000000000 ]; then pass "$name: cpu capped"; else fail "$name: cpu [$cpus]"; fi
	case $(field '{{json .HostConfig.PidsLimit}}') in null | 0 | -1) fail "$name: no process cap" ;; *) pass "$name: processes capped" ;; esac
	expect "$name is healthy, by a check of its own" "$(field '{{if .Config.Healthcheck}}{{.State.Health.Status}}{{end}}')" healthy
}

networks_of() { docker inspect --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$1" | tr ' ' '\n' | grep . | sort | tr '\n' ' '; }
# The DNS servers guard.sh lets out, "<address>:53", as the kernel holds its rules. On a host whose
# resolver is its router, the router's port 53 is one: allowed by design, not a way to the host.
guard_dns() { docker exec "$guard" iptables-nft -S OUTPUT | sed -n 's#^-A OUTPUT -d \([0-9.]*\)/32 -p tcp -m tcp --dport 53 -j ACCEPT$#\1:53#p'; }

if [ "${1:-}" = --mutants ]; then
	# The stack as it is passes first: a check that always failed would kill every mutant naming it.
	TEST_PROJECT=gnoworld-demo-mutant-$$ sh "$0" >"$tmp/run.log" 2>&1 ||
		missing "the stack fails with no fault planted (first: $(grep '^FAIL' "$tmp/run.log" | head -1 | cut -c7-120)): fix it before the mutants"
	# The faults each check must catch (CLAUDE.md: a guard lands with the fault that proves it).
	# Each fault names the check that must catch it: killed by another one, it proves nothing.
	mutant() {
		label=$1 wanted=$2
		shift 2
		# ONLY_MUTANTS, an extended regular expression: the mutants whose label it matches, alone.
		[ -z "${ONLY_MUTANTS:-}" ] || printf '%s\n' "$label" | grep -qE -- "$ONLY_MUTANTS" || return 0
		"$@" >"$tmp/override.yaml"
		code=0
		TEST_PROJECT=gnoworld-demo-mutant-$$ TEST_OVERRIDE=$tmp/override.yaml sh "$0" >"$tmp/run.log" 2>&1 || code=$?
		if [ "$code" = 1 ] && grep '^FAIL' "$tmp/run.log" | grep -qF "$wanted"; then
			pass "killed: $label, by \"$wanted\""
		elif [ "$code" = 0 ]; then
			fail "survives: $label"
		elif [ "$code" = 1 ]; then
			fail "killed by other checks than \"$wanted\": $label; first: $(grep '^FAIL' "$tmp/run.log" | head -1 | cut -c7-120)"
		else
			fail "broken: $label, exit $code: $(tail -1 "$tmp/run.log")"
		fi
	}
	compose() { printf '%s\n' "$1"; }
	# Each edit goes to a new path: a file rewritten in place can reach the container with the
	# old one's size (seen on a host's file sharing: the guard's script cut at its previous length). Not mktemp,
	# whose 0600 nginx's user cannot read, nor the guard's root, which lacks CAP_DAC_OVERRIDE.
	n=0
	nginx() { # nginx.conf through one edit (a sed or awk command), mounted over the image's own
		n=$((n + 1))
		"$@" "$here/web/nginx.conf" >"$tmp/nginx.$n.conf"
		printf 'services:\n  web:\n    volumes:\n      - %s:/etc/nginx/nginx.conf:ro\n' "$tmp/nginx.$n.conf"
	}
	dockerfile() { # a service's Dockerfile through one edit (a sed or awk command), built in its place: $1 the service
		n=$((n + 1))
		service=$1
		shift
		"$@" "$here/$service/Dockerfile" >"$tmp/Dockerfile.$n"
		printf 'services:\n  %s:\n    build:\n      dockerfile: %s\n' "$service" "$tmp/Dockerfile.$n"
	}
	guard() { # the guard's script through one edit (a sed or awk command), mounted over deploy/guard
		n=$((n + 1))
		mkdir "$tmp/guard.$n"
		"$@" "$here/guard/guard.sh" >"$tmp/guard.$n/guard.sh"
		printf 'services:\n  guard:\n    volumes: !override\n      - %s:/guard:ro\n' "$tmp/guard.$n"
	}
	# Not planted, since they would hand the container the host for the run: the host's network,
	# its pid or ipc, privileged, a device, Docker's socket, seccomp or AppArmor off. Nor root:
	# nginx, with no capability, cannot drop to its workers' user, and does not start.
	mutant "the internal network let out" "the internal network has no way out to the internet" \
		compose 'networks: { inside: { internal: false, driver_opts: !reset {} } }'
	mutant "the internal network keeps its gateway" "the internal network has a gateway" \
		compose 'networks: { inside: { driver_opts: !reset {} } }'
	mutant "a writable root" "web: read-only root" compose 'services: { web: { read_only: false } }'
	mutant "capabilities kept" "web: every capability dropped" compose 'services: { web: { cap_drop: !reset [] } }'
	mutant "a capability added back" "added back" compose 'services: { web: { cap_add: [NET_RAW] } }'
	mutant "privileges may be gained" "web may gain privileges" compose 'services: { web: { security_opt: !reset [] } }'
	mutant "a port published on the host" "web binds a port on the host" \
		compose 'services: { web: { ports: ["127.0.0.1:18080:8080"] } }'
	mutant "a folder of the host mounted writable" "web: a file of the host mounted writable" \
		compose "services: { web: { volumes: [\"$tmp:/mnt/test\"] } }"
	mutant "no memory cap" "web: memory" compose 'services: { web: { mem_limit: 8g } }'
	mutant "no cpu cap" "web: cpu" compose 'services: { web: { cpus: 8 } }'
	mutant "no process cap" "web: no process cap" compose 'services: { web: { pids_limit: -1 } }'
	mutant "logs that grow for good" "web: its logs grow for good" compose 'services: { web: { logging: { options: { max-size: 50g } } } }'
	mutant "the guard loads no rule" "the guard's network, which Tailscale shares, reaches nothing" \
		compose 'services: { guard: { entrypoint: [sleep, "2147483647"], healthcheck: { test: [CMD, "true"] } } }'
	mutant "the guard forgets a private range" "the guard refuses 192.168.0.0/16" guard sed 's# 192\.168\.0\.0/16##'
	mutant "the guard forgets the tailnets' range" "the guard refuses 100.64.0.0/10" guard sed 's# 100\.64\.0\.0/10##'
	mutant "the guard lets UDP out before it refuses" "the guard lets something out before it refuses" \
		guard awk '!done && /--dport 8080 -j ACCEPT/ { print; print "\techo \"-A OUTPUT -p udp -j ACCEPT\""; done = 1; next } { print }'
	mutant "the guard lets every port out" "the guard lets out no other public port" \
		guard sed 's#-A OUTPUT -p tcp -m multiport --dports 80,443 -j ACCEPT#-A OUTPUT -p tcp -j ACCEPT#'
	mutant "the guard lets any DNS out" "the guard lets nothing else out" \
		guard awk '!done && /-A OUTPUT -o lo -j ACCEPT/ { print; print "\techo \"-A OUTPUT -p udp --dport 53 -j ACCEPT\""; done = 1; next } { print }'
	mutant "the guard leaves IPv6 open" "IPv6: the guard drops all but loopback" guard sed '/^printf/ s#:OUTPUT DROP#:OUTPUT ACCEPT#'
	mutant "web's port let out to any network" "the guard lets nothing else out" guard sed 's#-o $inside ##'
	mutant "web's port open to the whole network" "the guard's network reaches the server only through web" guard sed 's#-d $web ##'
	mutant "the way out's port answers what it did not accept" "the guard lets nothing else out" \
		guard sed 's# -m conntrack --ctstate ESTABLISHED##'
	mutant "no rate limit" "a burst with no password gets 429" nginx sed '/limit_req zone=/d'
	mutant "a flood answered 503" "a burst with no password gets 429" nginx sed '/limit_req_status 429/d'
	mutant "a first load cut short" "a visitor's first load" nginx sed 's#burst=60#burst=25#'
	mutant "one limit for every visitor" "a visitor is served right after another's burst" \
		nginx sed 's#limit_req_zone $proxy_protocol_addr#limit_req_zone $server_port#'
	mutant "no password at all" "no password, no /" nginx sed 's#auth_basic "gno.world demo";#auth_basic off;#'
	mutant "the worker served without the password" "no password, no /sw.js" \
		nginx awk 'index($0, "location / {") { print "        location = /sw.js { auth_basic off; }" } { print }'
	mutant "the server's own 404 page" "the app's own fallback" nginx sed '/error_page 404/d'
	mutant "the password logged" "no log holds the password" nginx sed 's#$status $body_bytes_sent#$status $body_bytes_sent $http_authorization#'
	mutant "noindex only on success" "the 401 is not indexed" nginx sed 's#X-Robots-Tag "noindex" always#X-Robots-Tag "noindex"#'
	mutant "sniffing allowed" "is never sniffed" nginx sed '/X-Content-Type-Options/d'
	mutant "the referrer sent along" "names no referrer to another site" nginx sed '/Referrer-Policy/d'
	mutant "no content security policy" "carries the policy" nginx sed '/include \/etc\/nginx\/csp.conf;/d'
	mutant "hashed files not kept" "is kept a year" nginx sed 's#public, max-age=31536000, immutable#no-cache#'
	mutant "an error on a hashed file kept a year" "a 401 on a hashed file revalidates" \
		nginx sed 's#~^(200|206|304)/assets/#~^[0-9]*/assets/#'
	mutant "no manifest type" "the manifest's type" nginx sed '/application\/manifest+json webmanifest;/d'
	mutant "nothing compressed" "is sent compressed" nginx sed '/gzip on;/d'
	mutant "no data type" "a world's data's type" nginx sed '/text\/x-script data;/d'
	mutant "no PROXY protocol" "the server is up and asks" nginx sed 's#listen 8080 proxy_protocol#listen 8080#'
	mutant "a page cached" "/ revalidates" nginx sed 's#default "no-cache";#default "max-age=600";#'
	# Slice 3's (3e): a file mounted over the image's own, through one edit.
	over() { # $1 the service, $2 its file, $3 the repository's; the rest the edit
		service=$1 target=$2 source=$3
		shift 3
		n=$((n + 1))
		"$@" "$source" >"$tmp/over.$n"
		printf 'services:\n  %s:\n    volumes:\n      - %s:%s:ro\n' "$service" "$tmp/over.$n" "$target"
	}
	template() { over ergo /ergo/ircd.yaml.tmpl "$here/ergo/ircd.yaml.tmpl" "$@"; }
	render_sh() { over ergo /ergo/render.sh "$here/ergo/render.sh" "$@"; }
	acl() { over egress /etc/smokescreen/acl.yaml "$here/egress/acl.yaml" "$@"; }
	proxy_config() { over egress /etc/smokescreen/config.yaml "$here/egress/config.yaml" "$@"; }
	mutant "Ergo's WebSocket open to another site" "a WebSocket from another site is refused" \
		compose 'services: { ergo: { environment: { ORIGINS: "http://gnoworld.test,https://evil.test" } } }'
	mutant "an origin of * taken" "Ergo starts with ORIGINS [*]" render_sh sed "s#'https?://\[A-Za-z0-9.-\]+(:\[0-9\]{1,5})?'#'.+'#"
	mutant "rooms without +M by default" "in a room Ergo made with its default modes" template sed 's#default-modes: .*#default-modes: +nt#'
	mutant "anyone makes a room" "a guest makes no room" template sed 's#operator-only-creation: true#operator-only-creation: false#'
	mutant "guests' DMs let in, +R gone from the user modes" "Ergo's settings set +i and +R at each connection" \
		template sed 's#default-user-modes: +iR#default-user-modes: +i#'
	mutant "registration open" "a hand-made account is refused" \
		template awk '/^  registration:/ { r = 1 } r && /enabled: false/ { sub(/false/, "true"); r = 0 } { print }'
	mutant "a short oper password taken" "Ergo starts with a short oper password" render_sh sed '/32 characters or more/d'
	mutant "a login by PASS" "login-via-pass-command: false" template sed 's#login-via-pass-command: false#login-via-pass-command: true#'
	mutant "every address believed as a proxy" "never a forged X-Forwarded-For" template sed 's#proxy-allowed-from: {{PROXY_FROM}}#proxy-allowed-from: ["0.0.0.0/0"]#'
	mutant "the auth script's socket lost" "the refusal came from the server" compose 'services: { server: { environment: { AUTH_SOCKET: /tmp/elsewhere.sock } } }'
	mutant "the server believes no proxy" "is its own visitor" compose 'services: { server: { environment: { TRUSTED_PROXY: 192.0.2.1 } } }'
	mutant "a forged X-Forwarded-For handed on" "never a forged X-Forwarded-For" \
		nginx sed 's#proxy_set_header X-Forwarded-For $proxy_protocol_addr;#proxy_set_header X-Forwarded-For $http_x_forwarded_for;#'
	mutant "a forged X-Real-IP handed on" "and the first naming another stays limited, by the server" nginx sed 's#proxy_set_header X-Real-IP $proxy_protocol_addr;#proxy_set_header X-Real-IP $http_x_real_ip;#'
	mutant "the password handed to the upstreams" "and never the demo's password" nginx sed '/proxy_set_header Authorization "";/d'
	mutant "the WebSocket open without the password" "no password, no WebSocket" \
		nginx awk '{ print } /location = \/ws \{/ { print "            auth_basic off;" }'
	mutant "the API open without the password" "no password, no API" \
		nginx awk '{ print } /location \/api\/ \{/ { print "            auth_basic off;" }'
	mutant "the stream buffered" "web's settings say proxy_buffering off" nginx sed '/proxy_buffering off;/d'
	mutant "no limit of web's own on the login" "a longer burst meets web's own limit" nginx sed '/limit_req zone=login/d'
	mutant "a backslash in a path handed on" "a backslash in a path is refused" nginx sed '/return 400;/d'
	mutant "no visitor's connection limit" "a visitor holds 32 requests at once" nginx sed '/limit_conn /d'
	mutant "a visitor's connections limited at 31" "a visitor holding 31 requests, streams among them, is served a 32nd" \
		nginx sed 's#limit_conn open 32;#limit_conn open 31;#'
	mutant "every visitor one connection key" "the 33rd refused, another visitor served" \
		nginx sed 's#limit_conn_zone $proxy_protocol_addr#limit_conn_zone $remote_addr#'
	mutant "the limit answered 503" "the 33rd refused" nginx sed '/limit_conn_status/d'
	mutant "web's room for 1,024 connections" "sixteen visitors at their 32 WebSockets each, and another is served" \
		nginx sed 's#worker_connections [0-9]*;#worker_connections 1024;#'
	mutant "web's files left to Docker's default" "web may hold 8,192 files" compose 'services: { web: { ulimits: !reset {} } }'
	mutant "the server may write Ergo's volume" "the server holds Ergo's volume read-only" \
		compose 'services: { server: { volumes: !override [ "server:/data", "auth:/run/gnoworld", "ergo:/ergo" ] } }'
	mutant "the server measures another volume" "and it is Ergo's own volume" \
		compose 'services: { server: { volumes: !override [ "server:/data", "auth:/run/gnoworld", "auth:/ergo:ro" ] } }'
	mutant "headers waited for a minute" "web closes a connection that never ends its headers" nginx sed '/client_header_timeout/d'
	mutant "a body waited for a minute" "web closes a connection that never sends its body" nginx sed '/client_body_timeout/d'
	mutant "an idle connection kept 75 s" "web closes a connection that stays idle between requests" nginx sed '/keepalive_timeout/d'
	mutant "a host added to the way out" "the way out lets one host out" acl awk '{ print } /- api.openai.com/ { print "    - example.com" }'
	mutant "the way out lets private addresses through" "the way out lets http://10.0.0.1.nip.io/ through" \
		proxy_config sed 's#^unsafe_allow_private_ranges:.*#unsafe_allow_private_ranges: true#'
	mutant "a quiet tunnel kept for good" "the way out's settings say idle_timeout: 60s" proxy_config sed '/^idle_timeout:/d'
	mutant "the server's requests straight out" "the server does not reach OpenAI's API" compose 'services: { server: { environment: { NODE_USE_ENV_PROXY: "0" } } }'
	mutant "the guard drops the way out's replies" "does not answer through the way out" guard sed '/--sport 4750/d'
	mutant "the way out open to the guard's other network" "the guard's rules refuse 4750 but from the inside" guard sed '/--dport 4750 -j REJECT/d'
	mutant "the stack past the ceiling" "the demo's caps pass" compose 'services: { ergo: { mem_limit: 1g }, server: { mem_limit: 1g } }'
	mutant "Ergo's root writable" "ergo: read-only root" compose 'services: { ergo: { read_only: false } }'
	mutant "the server's capabilities kept" "server: every capability dropped" compose 'services: { server: { cap_drop: !reset [] } }'
	mutant "the way out's process cap off" "egress: no process cap" compose 'services: { egress: { pids_limit: -1 } }'
	mutant "Ergo's folder closed to its user" "ergo's user may enter /ergo" dockerfile ergo sed 's#chmod 755 /ergo \&\& ##'
	mutant "the way out's folder closed to its user" "egress's user may enter /etc/smokescreen" dockerfile egress \
		sed 's#^COPY --from=build /out/etc/ /etc/smokescreen/$#COPY --chmod=644 deploy/egress/config.yaml deploy/egress/acl.yaml /etc/smokescreen/#'
elif [ "${1:-}" != --demo ]; then
	# The static server and the guard, with a password of their own; no Tailscale key is needed.
	inside=${project}_inside
	outside=${project}_outside
	for file in "$here/compose.yaml" "$here/web/Dockerfile" "$here/ergo/Dockerfile" "$here/server/Dockerfile" "$here/egress/Dockerfile"; do
		unpinned=$(grep -nE '^[[:space:]]*(image:[[:space:]]*[^*[:space:]]|x-[a-z-]*image:|FROM )' "$file" | grep -v '@sha256:[0-9a-f]\{64\}' || true)
		expect "every image $(basename "$file") pulls is pinned by digest" "$unpinned" ""
	done
	for secret in demo_htpasswd ts_authkey ergo_oper_password log_pepper openai_api_key; do
		if git -C "$repo" check-ignore -q "deploy/secrets/$secret"; then pass "git ignores deploy/secrets/$secret"; else fail "git would track deploy/secrets/$secret"; fi
	done
	expect "git tracks nothing in deploy/secrets" "$(git -C "$repo" ls-files deploy/secrets)" ""
	if grep -qx 'deploy/secrets' "$repo/.dockerignore"; then pass "the build leaves deploy/secrets out"; else fail "the build would send deploy/secrets"; fi
	if grep -qF 'Read(/deploy/secrets/**)' "$repo/.claude/settings.json"; then pass "Claude Code may not read the secrets"; else fail "Claude Code may read the secrets"; fi
	# deploy/k6/run.sh against a Docker that answers as a stack would and logs each call (3n-b): it never starts
	# on the demo's host, even with the demo stopped (F643), and a run stopped in a scenario leaves nothing behind
	# (F642).
	mkdir "$tmp/fake"
	cat >"$tmp/fake/docker" <<'FAKE'
#!/bin/sh
printf '%s\n' "$*" >>"$FAKE_LOG"
case "$*" in
"ps -aq --filter label=com.docker.compose.project=gnoworld-demo") [ -z "${FAKE_DEMO:-}" ] || echo d3m0 ;;
"compose "*" ps -q "*) echo c0ntainer ;;
"inspect "*) echo 1mage ;;
*" /k6/load.js") sleep 4 ;;
esac
FAKE
	chmod 755 "$tmp/fake/docker"
	# exec: the run is the process its caller signals, not a shell around it.
	load() { exec env FAKE_LOG="$tmp/fake.log" PATH="$tmp/fake:$PATH" FAKE_DEMO="$1" OPENAI_API_KEY_FILE= sh "$here/k6/run.sh" "$2"; }
	: >"$tmp/fake.log"
	code=0
	(load yes all) >"$tmp/load.log" 2>&1 || code=$?
	if [ "$code" = 2 ] && grep -q "the demo's containers are on this host" "$tmp/load.log" && ! grep -q '^compose ' "$tmp/fake.log"; then
		pass "the load runs refuse the demo's host, its containers stopped, before making anything"
	else
		fail "the load runs start on the demo's host (exit $code)"
	fi
	# Stopped by TERM (a shell in the background ignores INT), it removes its project, its folder, which holds the
	# operator's key, and its sampler.
	: >"$tmp/fake.log"
	(load "" logins) >"$tmp/load.log" 2>&1 &
	running=$!
	for _ in 1 2 3 4 5 6 7 8 9 10; do grep -q '/k6/load.js$' "$tmp/fake.log" && break || sleep 1; done
	kill -TERM "$running"
	wait "$running" || true
	sleep 3
	sampled=$(grep -c '^stats ' "$tmp/fake.log" || true)
	sleep 3
	folder=$(sed -n 's#.* -v \([^ ]*\)/out:/k6:ro .*#\1#p' "$tmp/fake.log" | head -n 1)
	expect "a stopped load run removes its project" "$(sed -n '/\/k6\/load.js$/,$p' "$tmp/fake.log" | grep -c '^compose .* down -v$' || true)" 1
	expect "and its folder, the operator's key with it" "$([ -n "$folder" ] && [ ! -e "$folder" ] && echo gone)" gone
	expect "and stops its sampler" "$(grep -c '^stats ' "$tmp/fake.log" || true)" "$sampled"
	# Sizes that are no whole number, or past the visitors' addresses, stop it before it makes anything (F650).
	for size in ACCOUNTS=abc CROWD=0 HOLD=1.5 RATE=-1 STREAMS=250001 ACCOUNTS=62501; do
		: >"$tmp/fake.log"
		code=0
		(export "$size" && load "" all) >"$tmp/load.log" 2>&1 || code=$?
		if [ "$code" = 2 ] && ! grep -q '^compose ' "$tmp/fake.log"; then
			pass "the load runs refuse $size before making anything"
		else
			fail "the load runs take $size (exit $code)"
		fi
	done
	# Without OpenAI's key the lines measure no check (F644): the messages alone are refused, among the rest skipped.
	: >"$tmp/fake.log"
	code=0
	(load "" messages) >"$tmp/load.log" 2>&1 || code=$?
	expect "the messages alone, with no key, are refused before anything is made" "$code $(grep -c '^compose ' "$tmp/fake.log" || true)" "2 0"
	(load "" all) >"$tmp/load.log" 2>&1 || true
	expect "and skipped among the rest, no line sent" \
		"$(grep -c 'messages: skipped' "$tmp/load.log" || true) $(grep -c 'SCENARIO=messages' "$tmp/fake.log" || true)" "1 0"

	password=$(openssl rand -hex 16)
	htpasswd -nbB team "$password" | grep . >"$tmp/htpasswd"
	chmod 644 "$tmp/htpasswd"
	export DEMO_HTPASSWD_FILE="$tmp/htpasswd"
	printf 'not a key\n' >"$tmp/ts_authkey" # Compose wants each secret's file, even one no started service reads
	export TS_AUTHKEY_FILE="$tmp/ts_authkey"
	# Slice 3's services (3e): secrets of their own, an origin, an internal network apart from the demo's.
	for secret in ergo_oper_password log_pepper openai_api_key; do
		openssl rand -hex 24 >"$tmp/$secret"
		chmod 644 "$tmp/$secret"
	done
	export ERGO_OPER_PASSWORD_FILE="$tmp/ergo_oper_password" LOG_PEPPER_FILE="$tmp/log_pepper" OPENAI_API_KEY_FILE="$tmp/openai_api_key"
	export ORIGINS=http://gnoworld.test SERVER_NAME=irc.gnoworld.test
	export INSIDE_SUBNET="${TEST_SUBNET:-172.30.90.0/24}" WEB_ADDRESS="${TEST_WEB_ADDRESS:-172.30.90.10}"
	# Each folder a service reads in its image lets every user in: a COPY --chmod with no execute bit gives the
	# folder it makes that mode (moby/buildkit#5943), which kept Ergo's user out of /ergo. Checked before the
	# start, which would only call the service unhealthy.
	docker compose -p "$project" $files build ergo egress >/dev/null || { echo "test.sh: Ergo's or the way out's image did not build" >&2; exit 3; }
	before=$failed
	for pair in ergo:ergo egress:etc/smokescreen; do
		box=$(docker create "$project-${pair%%:*}")
		expect "${pair%%:*}'s user may enter /${pair#*:}" "$(docker export "$box" | tar -tvf - "${pair#*:}" 2>/dev/null | awk 'NR == 1 { print substr($1, 8, 3) }')" r-x
		docker rm "$box" >/dev/null
	done
	[ "$failed" = "$before" ] || exit 1
	started=yes
	docker compose -p "$project" $files down -v >/dev/null 2>&1 || true # what an interrupted run left
	if ! docker compose -p "$project" $files up -d --build --wait web guard ergo server egress; then
		echo "test.sh: the stack did not start: $(docker compose -p "$project" $files logs --no-log-prefix --tail 1 guard web ergo server egress 2>&1 | tr '\n' ' ')" >&2
		exit 3
	fi
	web=$(docker compose -p "$project" $files ps -q web)
	guard=$(docker compose -p "$project" $files ps -q guard)

	hardened "$web" web
	# nginx's 4,096 connections take two files each, a limit Docker sets: nginx, no root, cannot raise it (F645).
	expect "web may hold 8,192 files" "$(docker inspect --format '{{range .HostConfig.Ulimits}}{{.Name}}={{.Soft}}/{{.Hard}} {{end}}' "$web")" "nofile=8192/8192 "
	expect "web sits on the internal network only" "$(networks_of "$web")" "$inside "
	expect "that network has no way out" "$(docker network inspect --format '{{.Internal}}' "$inside")" true
	case $(docker network inspect --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' "$inside") in
	"" | "invalid IP") pass "nor any gateway" ;; # an isolated network has none, which Docker prints as "invalid IP"
	*) fail "the internal network has a gateway" ;;
	esac
	expect "only :8080 listens beyond the container itself" \
		"$(docker exec "$web" netstat -ltn | awk '$6 == "LISTEN" && $4 !~ /^127\./ && $4 !~ /^::1/ { print $4 }' | sort -u | tr '\n' ' ')" "0.0.0.0:8080 "
	hash=$(cut -d: -f2- "$tmp/htpasswd")
	expect "Docker holds no copy of the password's hash" "$(docker inspect "$web" | grep -cF "$hash" || true)" 0
	expect "the image holds no secret file" \
		"$(docker run --rm --entrypoint sh "$(docker inspect --format '{{.Image}}' "$web")" -c 'find / -xdev \( -name "*htpasswd*" -o -name ts_authkey \) 2>/dev/null' || true)" ""
	reach "$inside" "the internal network" no

	hardened "$guard" guard "user net-admin"
	expect "the guard sits on the internal network and its own" "$(networks_of "$guard")" "$inside $outside "
	expect "its own network lets out" "$(docker network inspect --format '{{.Internal}}' "$outside")" false
	expect "it is alone there" "$(docker network inspect --format '{{len .Containers}}' "$outside")" 1
	reach "container:$guard" "the guard's network, which Tailscale shares," yes "$(guard_dns)"
	# Its rule for port 8080 names web: the server listens on 8080 too, behind web's password and limits (F618).
	expect "the guard's network reaches the server only through web" "$(answering "container:$guard" server:8080)" ""
	# TCP leaves on 80 and 443 only: a public port that a plain container reaches stays shut.
	expect "a plain container reaches a public port beside 80 and 443 (the next check sees)" "$(answering bridge 1.1.1.1:853)" 1.1.1.1:853
	expect "the guard lets out no other public port" "$(answering "container:$guard" 1.1.1.1:853)" ""
	# The rules as the kernel holds them, against ranges typed here, apart from guard.sh: each one
	# refused for every protocol, before anything leaves; nothing else let out; IPv6 closed.
	v4=$(docker exec "$guard" iptables-nft -S OUTPUT)
	v6=$(docker exec "$guard" ip6tables-nft -S OUTPUT)
	expect "the guard drops what no rule lets out" "$(printf '%s\n' "$v4" | grep -cx -- '-P OUTPUT DROP' || true)" 1
	for range in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 \
		192.168.0.0/16 198.18.0.0/15 224.0.0.0/4 240.0.0.0/4; do
		expect "the guard refuses $range, every protocol" "$(printf '%s\n' "$v4" | grep -c -- "^-A OUTPUT -d $range -j REJECT" || true)" 1
	done
	last_refusal=$(printf '%s\n' "$v4" | grep -n -- '-j REJECT' | tail -1 | cut -d: -f1)
	first_way_out=$(printf '%s\n' "$v4" | grep -n -e '--dports 80,443 -j ACCEPT' -e '^-A OUTPUT -p udp -j ACCEPT' | head -1 | cut -d: -f1)
	if [ -n "$last_refusal" ] && [ -n "$first_way_out" ] && [ "$last_refusal" -lt "$first_way_out" ]; then
		pass "the guard refuses before it lets anything out"
	else
		fail "the guard lets something out before it refuses"
	fi
	expect "the guard lets nothing else out" "$(printf '%s\n' "$v4" | grep -e '-j ACCEPT' | grep -vx -e '-A OUTPUT -o lo -j ACCEPT' -e '-A OUTPUT -p udp -j ACCEPT' |
		grep -vx -e "-A OUTPUT -d $WEB_ADDRESS/32 -o [^ ]* -p tcp -m tcp --dport 8080 -j ACCEPT" -e '-A OUTPUT -p tcp -m multiport --dports 80,443 -j ACCEPT' \
			-e '-A OUTPUT -d [0-9.]*/32 -p [a-z]* -m [a-z]* --dport 53 -j ACCEPT' \
			-e '-A OUTPUT -o [^ ]* -p tcp -m tcp --sport 4750 -m conntrack --ctstate ESTABLISHED -j ACCEPT' || true)" ""
	expect "IPv6: the guard drops all but loopback" "$(printf '%s\n' "$v6" | tr '\n' '|')" "-P OUTPUT DROP|-A OUTPUT -o lo -j ACCEPT|"

	# Requests as Tailscale sends them: through the PROXY protocol, with the visitor's address. Each
	# is sent once, and its headers answer every question about it.
	ask() {
		answer=$tmp/ask.$(printf '%s\n' "$@" | cksum | tr ' ' -)
		if [ ! -f "$answer" ]; then
			path=$1 client=$2
			shift 2
			docker run --rm --network "$inside" "$CURL" -s -o /dev/null -D - --haproxy-protocol \
				--haproxy-clientip "$client" "$@" "http://web:8080$path" | tr -d '\r' >"$answer"
		fi
		cat "$answer"
	}
	status() { ask "$@" | awk 'NR == 1 { print $2 }'; }
	header() {
		name=$1
		shift
		ask "$@" | awk -F': ' -v name="$name" 'tolower($1) == name { print $2 }'
	}
	codes() { # how many answers to one visitor's requests had this code
		code=$1 client=$2
		shift 2
		docker run --rm --network "$inside" "$CURL" -s -o /dev/null -w '%{http_code}\n' --haproxy-protocol \
			--haproxy-clientip "$client" "$@" | grep -c "^$code\$" || true
	}
	auth="team:$password"
	pages=$(docker exec "$web" find /usr/share/nginx/html -name index.html | sed 's#^/usr/share/nginx/html##; s#/index.html$##; s#^$#/#' | sort)
	assets=$(docker run --rm --network "$inside" "$CURL" -s -u "$auth" --haproxy-protocol --haproxy-clientip 203.0.113.1 \
		http://web:8080/sw.js | grep -oE '/assets/[A-Za-z0-9._-]+\.(js|css)' | sort -u || true)
	at_least "the pages found in the image" "$(printf '%s\n' "$pages" | grep -c . || true)" 2
	at_least "the hashed files the worker lists" "$(printf '%s\n' "$assets" | grep -c . || true)" 1
	first=$(printf '%s\n' "$assets" | head -1)

	expect "the server is up and asks (with the PROXY header)" "$(status / 203.0.113.1)" 401
	expect "a request without the PROXY header gets nothing" \
		"$(docker run --rm --network "$inside" "$CURL" -s -o /dev/null -w '%{http_code}' http://web:8080/ || true)" 000
	for path in $pages /sw.js /manifest.webmanifest "$first" /icon-192.png /nowhere; do
		expect "no password, no $path" "$(status "$path" 203.0.113.1)" 401
	done
	expect "a wrong password, no page" "$(status / 203.0.113.1 -u team:wrong)" 401
	expect "no password, no page for HEAD either" "$(status / 203.0.113.1 -I)" 401
	case $(header www-authenticate / 203.0.113.1) in Basic*) pass "the browser is asked for a password" ;; *) fail "no Basic challenge" ;; esac
	expect "the 401 is not indexed" "$(header x-robots-tag / 203.0.113.1)" noindex

	for path in $pages; do
		expect "the page $path" "$(status "$path" 203.0.113.1 -u "$auth")" 200
	done
	expect "a path no page has: the fallback, with a 404" "$(status /nowhere 203.0.113.1 -u "$auth")" 404
	body() { docker run --rm --network "$inside" "$CURL" -s --haproxy-protocol --haproxy-clientip 203.0.113.1 -u "$auth" "http://web:8080$1" | cksum; }
	expect "and that 404 is the app's own fallback, not the server's page" "$(body /nowhere)" "$(body /__spa-fallback.html)"
	expect "a path in another case is no page" "$(status /W/BUBBLE 203.0.113.1 -u "$auth")" 404
	case $(status '/..%2f..%2f..%2f..%2f..%2fetc/passwd' 203.0.113.1 -u "$auth") in
	400 | 404) pass "no path leads out of the site" ;;
	*) fail "a path out of the site gets something else than 400 or 404" ;;
	esac
	expect "a POST is refused" "$(status / 203.0.113.1 -u "$auth" -X POST)" 405
	world=$(printf '%s\n' "$pages" | grep -vx / | head -1)
	expect "a world's data's type" "$(header content-type "$world.data" 203.0.113.1 -u "$auth")" text/x-script
	for path in $pages /nowhere /sw.js /manifest.webmanifest /icon-192.png $assets; do
		expect "$path is not indexed" "$(header x-robots-tag "$path" 203.0.113.1 -u "$auth")" noindex
		expect "$path is never sniffed" "$(header x-content-type-options "$path" 203.0.113.1 -u "$auth")" nosniff
		expect "$path names no referrer to another site" "$(header referrer-policy "$path" 203.0.113.1 -u "$auth")" no-referrer
	done
	for path in $pages /nowhere /sw.js /manifest.webmanifest /icon-192.png; do
		expect "$path revalidates" "$(header cache-control "$path" 203.0.113.1 -u "$auth")" no-cache
	done
	# The build's policy, the one the image's include sets, on every answer: pages, files, errors.
	policy=$(docker exec "$web" cat /etc/nginx/csp.conf | sed -n 's/^add_header Content-Security-Policy "\(.*\)" always;$/\1/p')
	case $policy in "default-src 'none'; script-src 'self' 'sha256-"*) pass "the image holds the build's policy" ;; *) fail "no policy in the image's csp.conf" ;; esac
	for path in $pages /nowhere /sw.js /manifest.webmanifest /icon-192.png $assets; do
		expect "$path carries the policy" "$(header content-security-policy "$path" 203.0.113.1 -u "$auth")" "$policy"
	done
	expect "a 401 carries the policy" "$(header content-security-policy / 203.0.113.1)" "$policy"
	expect "a 405 carries the policy" "$(header content-security-policy / 203.0.113.1 -u "$auth" -X POST)" "$policy"
	for path in $assets; do
		expect "$path is kept a year" "$(header cache-control "$path" 203.0.113.1 -u "$auth")" "public, max-age=31536000, immutable"
	done
	for path in / "$first" /manifest.webmanifest "$world.data"; do
		expect "$path is sent compressed" "$(header content-encoding "$path" 203.0.113.1 -u "$auth" -H 'Accept-Encoding: gzip')" gzip
	done
	expect "the server names no version" "$(header server / 203.0.113.1 -u "$auth")" nginx
	case $(header content-type /sw.js 203.0.113.1 -u "$auth") in */javascript*) pass "the worker is a script" ;; *) fail "the worker is no script" ;; esac
	expect "the manifest's type" "$(header content-type /manifest.webmanifest 203.0.113.1 -u "$auth")" application/manifest+json
	expect "an icon's type" "$(header content-type /icon-192.png 203.0.113.1 -u "$auth")" image/png
	# The design system's sheet and fonts (slice 2b): CSS and woff2, kept a year as every hashed file.
	sheet=$(printf '%s\n' "$assets" | grep '\.css$' | head -1)
	font=$(docker exec "$web" find /usr/share/nginx/html/assets -name '*.woff2' | head -1 | sed 's#^/usr/share/nginx/html##')
	case $(header content-type "$sheet" 203.0.113.1 -u "$auth") in text/css*) pass "a style sheet is CSS" ;; *) fail "a style sheet ($sheet) is no CSS" ;; esac
	expect "a font's type" "$(header content-type "$font" 203.0.113.1 -u "$auth")" font/woff2
	expect "a font is kept a year" "$(header cache-control "$font" 203.0.113.1 -u "$auth")" "public, max-age=31536000, immutable"

	at_least "a burst with no password gets 429" "$(codes 429 198.51.100.1 'http://web:8080/[1-200]')" 100
	at_least "a burst with a wrong password gets 429" "$(codes 429 198.51.100.2 -u team:wrong 'http://web:8080/[1-200]')" 100
	at_least "a burst on the worker gets 429" "$(codes 429 198.51.100.3 -u "$auth" 'http://web:8080/sw.js?[1-200]')" 100
	# Each answer's code with its Cache-Control (a browser keeps a 429 that says immutable) and its policy.
	kept=$(docker run --rm --network "$inside" "$CURL" -s -o /dev/null -w '%{http_code} %header{cache-control}|%header{content-security-policy}\n' --haproxy-protocol \
		--haproxy-clientip 198.51.100.4 -u "$auth" "http://web:8080$first?[1-200]" || true)
	at_least "a burst on a hashed file gets 429" "$(printf '%s\n' "$kept" | grep -c '^429 ' || true)" 100
	expect "a 429 on a hashed file revalidates" "$(printf '%s\n' "$kept" | grep '^429 ' | cut -d'|' -f1 | sort -u)" "429 no-cache"
	expect "a 429 carries the policy" "$(printf '%s\n' "$kept" | grep '^429 ' | cut -d'|' -f2- | sort -u)" "$policy"
	expect "a 401 on a hashed file revalidates" "$(header cache-control "$first" 203.0.113.1)" no-cache
	urls=""
	for path in $pages /sw.js /manifest.webmanifest /icon-192.png /icon-512.png $assets; do urls="$urls http://web:8080$path"; done
	# A first visit loads the pages' files and the worker's precache, about twice the list at once.
	fetches="" # curl's -o holds for one URL: each gets its own, or the bodies reach the codes counted
	for url in $urls $urls; do fetches="$fetches -o /dev/null $url"; done
	load=$(docker run --rm --network "$inside" "$CURL" -s -w '%{http_code}\n' --haproxy-protocol \
		--haproxy-clientip 198.51.100.9 -u "$auth" --parallel --parallel-max 50 $fetches || true)
	expect "a visitor's first load, twice its files at once, gets no 429" "$(printf '%s\n' "$load" | grep -c '^429$' || true)" 0
	expect "and every request of it is served" "$(printf '%s\n' "$load" | grep -c '^200$' || true)" "$(printf '%s\n' $urls $urls | grep -c .)"
	# One container, two visitors, the second right after the first's burst: the limit is each one's.
	expect "a visitor is served right after another's burst" "$(docker run --rm --network "$inside" --entrypoint sh "$CURL" -c '
		curl -s -o /dev/null --haproxy-protocol --haproxy-clientip 198.51.100.11 -u "$1" "http://web:8080/[1-200]"
		curl -s -o /dev/null -w "%{http_code}" --haproxy-protocol --haproxy-clientip 198.51.100.12 -u "$1" http://web:8080/' sh "$auth")" 200
	expect "no log holds the password, its hash or the header that carries it" \
		"$(docker logs "$web" 2>&1 | grep -cF -e "$password" -e "$hash" -e "$(printf 'team:%s' "$password" | base64)" || true)" 0
	# --- Slice 3 (3e): Ergo, the server and the way out, as the demo runs them.
	ergo=$(docker compose -p "$project" $files ps -q ergo)
	server=$(docker compose -p "$project" $files ps -q server)
	egress=$(docker compose -p "$project" $files ps -q egress)
	hardened "$ergo" ergo
	hardened "$server" server
	hardened "$egress" egress network
	expect "Ergo sits on the internal network only" "$(networks_of "$ergo")" "$inside "
	expect "the server sits on the internal network only" "$(networks_of "$server")" "$inside "
	expect "the way out holds the guard's network, behind its rules" \
		"$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$egress")" "container:$(docker inspect --format '{{.Id}}' "$guard")"
	expect "web holds the address Ergo and the server believe" \
		"$(docker inspect --format "{{(index .NetworkSettings.Networks \"$inside\").IPAddress}}" "$web")" "$WEB_ADDRESS"
	reach "container:$ergo" "Ergo's network" no
	reach "container:$server" "the server's network" no
	# The demo's ceiling (OPERATIONS.md): every service's caps summed, the demo profile's whole.
	caps=$(docker compose -p "$project" $files config --format json | python3 -c '
import json, re, sys
units = {"": 1, "b": 1, "k": 2**10, "m": 2**20, "g": 2**30}
def size(value):
    number, unit = re.fullmatch(r"(\d+)([bkmg]?)b?", str(value).lower()).groups()
    return int(number) * units[unit]
services = list(json.load(sys.stdin)["services"].values())
print("%.2f %d" % (sum(float(s.get("cpus", 0)) for s in services), sum(size(s.get("mem_limit", 0)) for s in services)))')
	if python3 -c 'import sys; c, m = sys.argv[1].split(); sys.exit(float(c) > 2 or int(m) > 2**31)' "$caps"; then
		pass "the demo's caps fit 2 cores and 2 GB ($caps)"
	else
		fail "the demo's caps pass 2 cores or 2 GB ($caps)"
	fi
	expect "the server's image installs the lockfile's versions" "$(grep -c -- '--frozen-lockfile' "$here/server/Dockerfile")" 1

	# Ergo's rendered settings, read back (the plan's keys; docs/decisions.md for the history's days).
	# /tmp is in memory, which docker cp cannot see: read it through the container.
	docker exec "$ergo" cat /tmp/ircd.yaml >"$tmp/ircd.yaml"
	for line in "name: \"$SERVER_NAME\"" '":6667": {}' '":8097":' "proxy-allowed-from: [\"$WEB_ADDRESS\"]" \
		"allowed-origins: [\"$ORIGINS\"]" 'login-via-pass-command: false' 'operator-only-creation: true' \
		'default-modes: +ntCMi' 'expire-time: 90d' 'direct-messages: disabled' \
		'allow-truncation: false' 'max-concurrent-connections: 16' 'max-connections-per-window: 32' \
		'netname: gnoworld' 'messages-per-window: 2' 'max-attempts: 3' '"+draft/unreact"' \
		'capabilities: [sajoin, samode, chanreg, history, nofakelag]' \
		'allow-individual-delete: true' 'enable-account-indexing: true' 'command: ""' 'socket: "/run/gnoworld/auth.sock"'; do
		expect "Ergo's settings say $line" "$(grep -cF -- "$line" "$tmp/ircd.yaml")" 1
	done
	expect "Ergo's settings hold 100 channels a client" "$(grep -cE '^ +max-channels-per-client: 100$' "$tmp/ircd.yaml")" 1
	# The whole line: +i alone holds the words '+i' too (F1091).
	expect "Ergo's settings set +i and +R at each connection" "$(grep -cE '^ +default-user-modes: \+iR$' "$tmp/ircd.yaml")" 1
	expect "Ergo's settings close registration" "$(awk '/^  registration:/ { r = 1 } r && /enabled:/ { print $2; exit }' "$tmp/ircd.yaml")" false
	# Its start refuses an origin list that would let every site in (F422): checked by the service's own render.
	render() { docker compose -p "$project" $files run --rm --no-deps -e RENDER_ONLY=1 -e ORIGINS="$1" ergo 2>&1; }
	expect "Ergo's start takes a list of origins" "$(render "$ORIGINS" | tail -n 1)" "render: the settings are whole"
	for origins in "" "*" "$ORIGINS,*" "gnoworld.test" "http://gnoworld.test/path"; do
		case $(render "$origins") in *"render: ORIGINS"*) pass "Ergo's start refuses ORIGINS [$origins]" ;; *) fail "Ergo starts with ORIGINS [$origins]" ;; esac
	done
	# A short oper's password, which Ergo's genpasswd hashes all the same (F621).
	printf 'hunter2\n' >"$tmp/short_oper_password"
	chmod 644 "$tmp/short_oper_password"
	case $(ERGO_OPER_PASSWORD_FILE=$tmp/short_oper_password docker compose -p "$project" $files run --rm --no-deps -e RENDER_ONLY=1 ergo 2>&1) in
	*"render: the oper's password"*) pass "Ergo's start refuses a short oper password" ;;
	*) fail "Ergo starts with a short oper password" ;;
	esac

	# No secret of the stack's in Docker's records, a log or an image.
	oper=$(cat "$tmp/ergo_oper_password")
	pepper=$(cat "$tmp/log_pepper")
	key=$(cat "$tmp/openai_api_key")
	for id in $ergo $server $egress; do
		name=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")
		expect "Docker holds no secret of $name's" "$(docker inspect "$id" | grep -cF -e "$oper" -e "$pepper" -e "$key" || true)" 0
		box=$(docker create "$(docker inspect --format '{{.Image}}' "$id")")
		expect "$name's image holds no secret file" \
			"$(docker export "$box" | tar -t | grep -E '(^|/)secrets/|htpasswd|pepper|oper_password|api_key|authkey' || true)" ""
		docker rm "$box" >/dev/null
	done

	# Visitors' WebSockets to Ergo through web's /ws: this client, run in the server's image, which has Node.
	cat >"$tmp/test-ws.cjs" <<'CLIENT'
// The test's IRC client: a visitor's WebSocket to Ergo through web's /ws, as Tailscale hands it on (the
// PROXY protocol, the visitor's address), with the demo's password, an Origin and a forged X-Forwarded-For.
// It sends each line after the last one's pause and prints every line Ergo sends, then the HTTP status first.
// Usage (node 24): node test-ws.cjs <visitor address> <user:password> <origin> <line>...; a line "+" waits;
// "-" for no password or no origin. WS_TARGET (host:port, web:8080) and WS_PROXY=0 serve a check without web.
const net = require("node:net");
const crypto = require("node:crypto");

const [visitor, auth, origin, ...lines] = process.argv.slice(2);
const [host = "web", port = "8080"] = (process.env.WS_TARGET ?? "web:8080").split(":");
const socket = net.connect(Number(port), host);
let held = Buffer.alloc(0);
let upgraded = false;

// A client's frame is masked (RFC 6455, 5.3): one text frame a line, 65,535 bytes at most.
const frame = (text) => {
  const body = Buffer.from(text);
  const mask = crypto.randomBytes(4);
  const head = body.length < 126 ? [0x81, 0x80 | body.length] : [0x81, 0xfe, body.length >> 8, body.length & 255];
  return Buffer.concat([Buffer.from(head), mask, body.map((byte, i) => byte ^ mask[i % 4])]);
};

const send = (i) => {
  if (i >= lines.length) {
    setTimeout(() => socket.destroy(), 1500);
    return;
  }
  if (lines[i] !== "+") socket.write(frame(lines[i]));
  setTimeout(() => send(i + 1), 400);
};

socket.on("connect", () => {
  if (process.env.WS_PROXY !== "0") socket.write(`PROXY TCP4 ${visitor} 10.0.0.1 40000 8080\r\n`);
  const request = [
    "GET /ws HTTP/1.1",
    "Host: web",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString("base64")}`,
    "Sec-WebSocket-Version: 13",
    ...(origin === "-" ? [] : [`Origin: ${origin}`]),
    ...(auth === "-" ? [] : [`Authorization: Basic ${Buffer.from(auth).toString("base64")}`]),
    "X-Forwarded-For: 192.0.2.66",
    "",
    "",
  ];
  socket.write(request.join("\r\n"));
});

// The server's frames are not masked; a text frame holds one or more lines.
const frames = () => {
  while (held.length >= 2) {
    let length = held[1] & 127;
    let at = 2;
    if (length === 126) [length, at] = held.length < 4 ? [Infinity, 4] : [held.readUInt16BE(2), 4];
    else if (length === 127) [length, at] = held.length < 10 ? [Infinity, 10] : [Number(held.readBigUInt64BE(2)), 10];
    if (held.length < at + length) return;
    if ((held[0] & 15) === 1) {
      for (const line of held
        .subarray(at, at + length)
        .toString()
        .split(/\r?\n/))
        if (line !== "") console.log(line);
    }
    held = held.subarray(at + length);
  }
};

socket.on("data", (chunk) => {
  held = Buffer.concat([held, chunk]);
  if (!upgraded) {
    const end = held.indexOf("\r\n\r\n");
    if (end < 0) return;
    const status = held.subarray(0, end).toString().split("\r\n")[0];
    console.log(status);
    held = held.subarray(end + 4);
    upgraded = true;
    if (!status.includes(" 101 ")) {
      socket.destroy();
      return;
    }
    send(0);
  }
  frames();
});
socket.on("error", (error) => console.log(`ERROR ${error.message}`));
setTimeout(() => process.exit(0), 20_000).unref();
CLIENT
	chmod 644 "$tmp/test-ws.cjs"
	server_image=$(docker inspect --format '{{.Image}}' "$server")
	ws() { docker run --rm --network "$inside" -e WS_TARGET -e WS_PROXY -v "$tmp/test-ws.cjs:/test-ws.cjs:ro" --entrypoint /nodejs/bin/node \
		"$server_image" /test-ws.cjs "$@" 2>&1 || true; }
	first() { printf '%s\n' "$1" | head -n 1; }
	holds() { if printf '%s\n' "$2" | grep -qE -- "$3"; then pass "$1"; else fail "$1"; fi; }
	# The bot makes the worlds' rooms once it is in Ergo (3h): a guest can join none before.
	bot=""
	for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
		# In the room: Ergo lists an invisible (+i) member to the room's members alone.
		bot=$(ws 203.0.113.20 "$auth" "$ORIGINS" "NICK watch20" "USER w 0 * :w" + "JOIN #earth" "NAMES #earth" | grep ' 353 .*gnoworld' || true)
		[ -z "$bot" ] || break
		sleep 2
	done
	[ -n "$bot" ] || fail "no bot in #earth after 15 tries, about 90 s: the server's link to Ergo (its oper password, ERGO_HOST)"
	room="#made$(od -An -N2 -tu2 /dev/urandom | tr -d ' ')"
	marker="marker-$(openssl rand -hex 4)"
	# An operator makes a room and speaks in it, and stays while a guest comes: its history, its default modes.
	# Ergo makes a room invite-only (+i): the operator opens it, as the server opens an open room.
	ws 203.0.113.25 "$auth" "$ORIGINS" "NICK chief25" "USER c 0 * :c" + "OPER admin $oper" "JOIN $room" "MODE $room -i" "PRIVMSG $room :$marker" \
		+ + + + + + + + + + + + + + + >"$tmp/chief.txt" &
	chief=$!
	# The guest comes once the room is made and the marker said.
	for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
		grep -q " 366 chief25 $room " "$tmp/chief.txt" 2>/dev/null && break
		sleep 1
	done
	sleep 1
	guest=$(ws 203.0.113.21 "$auth" "$ORIGINS" "NICK guest21" "USER g 0 * :g" + "JOIN $room" "CHATHISTORY LATEST $room * 10" "PRIVMSG $room :a guest speaks" \
		"JOIN #byaguest$(openssl rand -hex 3)" "JOIN #earth" "PRIVMSG #earth :a guest speaks" "REGISTER * * a-password" \
		"NS REGISTER a-password" "AUTHENTICATE PLAIN" "AUTHENTICATE $(printf 'g1x\0g1x\0a-password' | base64)" "OPER admin wrong" "OPER admin wrong")
	wait "$chief" || true
	expect "a visitor's WebSocket reaches Ergo through web" "$(first "$guest")" "HTTP/1.1 101 Switching Protocols"
	holds "an operator logs in through the WebSocket and makes a room (a known limit, and the control)" "$(cat "$tmp/chief.txt")" " 366 chief25 $room "
	holds "a guest joins a room" "$guest" "^:guest21![^ ]+ JOIN $room\$"
	holds "and reads its history: the operator's line (CHATHISTORY)" "$guest" " PRIVMSG $room :$marker\$"
	holds "a guest is refused when it speaks, in a room Ergo made with its default modes" "$guest" " 404 guest21 $room "
	holds "and in a world's room" "$guest" ' 404 guest21 #earth '
	holds "a guest makes no room: only operators do" "$guest" ' 403 guest21 #byaguest[0-9a-f]+ :Only server operators can create new channels'
	holds "a hand-made account is refused: no registration" "$guest" 'FAIL REGISTER DISALLOWED'
	holds "nor through NickServ" "$guest" 'NickServ!.* NOTICE guest21 :This command has been disabled'
	holds "a password of one's own logs no one in: SASL refused" "$guest" ' 904 guest21 '
	holds "the refusal came from the server, through Ergo's auth script and its socket" \
		"$(docker logs "$server" 2>&1 | grep '"irc_login_refused"' || true)" '"error":"(ticket|account)"'
	holds "an OPER with a wrong password is refused" "$guest" ' 491 guest21 :OPER failed'
	holds "and the next one waits: Ergo's oper throttle" "$guest" ' 491 guest21 :You must wait'
	# A known limit (OPERATIONS.md): Ergo takes OPER on any listener; the password's length (render.sh) and the throttle hold it.
	expect "a WebSocket from another site is refused" "$(first "$(ws 203.0.113.22 "$auth" https://evil.test "NICK x")")" "HTTP/1.1 403 Forbidden"
	for origin in - "http://gnoworld.test.evil.test" "https://gnoworld.test" "http://gnoworld.test:81"; do
		expect "and one from [$origin]" "$(first "$(ws 203.0.113.23 "$auth" "$origin" "NICK y")")" "HTTP/1.1 403 Forbidden"
	done
	expect "no password, no WebSocket" "$(first "$(ws 203.0.113.24 - "$ORIGINS" "NICK z")")" "HTTP/1.1 401 Unauthorized"
	# The address Ergo sees, as a WHOIS of oneself shows it (338; its log holds none, connect-ip off: F702): the
	# visitor's own through web, and straight from another container of the internal network, never the forged
	# X-Forwarded-For. The variables are exported: docker run reads them from its environment.
	seen=$(ws 203.0.113.27 "$auth" "$ORIGINS" "NICK seen27" "USER s 0 * :s" + "WHOIS seen27" | grep ' 338 seen27 ' || true)
	if printf '%s\n' "$seen" | grep -qE ' 338 seen27 seen27 [^ ]+ 203\.0\.113\.27 '; then pass "Ergo sees the visitor's own address through web, never a forged X-Forwarded-For"; else fail "never a forged X-Forwarded-For, through web: [$seen]"; fi
	direct=$(export WS_TARGET=ergo:8097 WS_PROXY=0; ws 203.0.113.26 - "$ORIGINS" "NICK direct26" "USER d 0 * :d" + "WHOIS direct26" | grep ' 338 direct26 ' || true)
	if printf '%s\n' "$direct" | grep -qE ' 338 direct26 direct26 [^ ]+ [0-9.]+ ' && ! printf '%s\n' "$direct" | grep -qE '192\.0\.2\.66|203\.0\.113\.26'; then pass "and never a forged X-Forwarded-For, straight"; else fail "never a forged X-Forwarded-For, straight: [$direct]"; fi
	expect "and no address in Ergo's log" "$(docker logs "$ergo" 2>&1 | grep -cE '203\.0\.113\.|192\.0\.2\.66' || true)" 0

	# The server through web's /api: the password first, the visitor's address from web alone.
	expect "no password, no API" "$(status '/api/activity?worlds=earth' 203.0.113.1)" 401
	expect "the API answers with the password" "$(status '/api/activity?worlds=earth' 203.0.113.1 -u "$auth")" 200
	# A backslash is a separator to the server's URL parser alone: refused, or web's login limit is skipped (F617).
	for path in '/api/x/..\login/challenge' '/api/x/..%5Clogin/challenge'; do
		expect "a backslash in a path is refused: $path" "$(status "$path" 203.0.113.34 -u "$auth" --path-as-is)" 400
	done
	# A login challenge's code, and its body's error when it has one (the server's JSON, or web's own page). curl reads
	# a format that starts with @ as a file's name: the code's mark follows a newline.
	challenge() {
		client=$1
		shift
		docker run --rm --network "$inside" "$CURL" -s -w '\n@@%{http_code}\n' --haproxy-protocol --haproxy-clientip "$client" -u "$auth" \
			-H "Origin: $ORIGINS" -H 'Content-Type: application/json' -d '{"chainId":"onyx-1"}' "$@" | awk '{ body = body $0 }
			/@@[0-9]+$/ { kind = body ~ /"error":"too_many"/ ? "too_many" : body ~ /<html/ ? "html" : body ~ /"error":/ ? "error" : "ok"
				print kind, substr($0, index($0, "@@") + 2); body = "" }' || true
	}
	# The server's limit is 10 a minute a visitor (login/routes.ts); web's own, 20 at once and 1 a second, comes after it.
	burst=$(challenge 203.0.113.31 'http://web:8080/api/login/challenge?[1-15]')
	expect "a visitor's burst of challenges meets the server's limit: 10, then its 429" \
		"$(printf '%s\n' "$burst" | grep -c '^ok 200$' || true) $(printf '%s\n' "$burst" | grep -c '^too_many 429$' || true)" "10 5"
	expect "another visitor naming the first in X-Real-IP is its own visitor" \
		"$(challenge 203.0.113.32 -H 'X-Real-IP: 203.0.113.31' -H 'X-Forwarded-For: 203.0.113.31' http://web:8080/api/login/challenge)" "ok 200"
	expect "and the first naming another stays limited, by the server" \
		"$(challenge 203.0.113.31 -H 'X-Real-IP: 203.0.113.99' -H 'X-Forwarded-For: 203.0.113.99' http://web:8080/api/login/challenge)" "too_many 429"
	expect "straight to the server, a forged X-Real-IP is not believed" \
		"$(docker run --rm --network "$inside" "$CURL" -s -o /dev/null -w '%{http_code}' -H 'X-Real-IP: 203.0.113.31' -H "Origin: $ORIGINS" \
			-H 'Content-Type: application/json' -d '{"chainId":"onyx-1"}' http://server:8080/api/login/challenge || true)" 200
	at_least "a longer burst meets web's own limit on the login (nginx's page, not the server's JSON)" \
		"$(challenge 203.0.113.33 'http://web:8080/api/login/challenge?[1-40]' | grep -c '^html 429$' || true)" 1
	stream=$(docker run --rm --network "$inside" "$CURL" -s -N --max-time 20 --haproxy-protocol --haproxy-clientip 203.0.113.41 -u "$auth" \
		'http://web:8080/api/stream?rooms=%23earth' || true)
	holds "the stream comes through web: its heartbeat within 20 s" "$stream" '^:'
	# Buffered, nginx still passed the heartbeat on (the stream-buffered mutant, 2026-10-24): its setting, read back.
	expect "web's settings say proxy_buffering off" "$(docker exec "$web" cat /etc/nginx/nginx.conf | grep -c 'proxy_buffering off;')" 1
	# Connections that send nothing more are closed (F208): headers never ended, a body never sent, a kept-alive
	# connection left idle; each one's seconds until web closed it, printed as it closes (F639);
	# in the background while the holds below run (F651).
	docker run --rm --network "$inside" --entrypoint /nodejs/bin/node "$server_image" -e '
const net = require("node:net");
const started = Date.now();
const proxy = (ip) => `PROXY TCP4 ${ip} 192.0.2.1 40000 8080\r\n`;
const auth = `Basic ${Buffer.from(process.argv[1]).toString("base64")}`;
const probe = (name, text) =>
  new Promise((resolve) => {
    const socket = net.connect(8080, "web", () => socket.write(text));
    socket.on("data", () => {});
    socket.on("error", () => {});
    socket.on("close", () => {
      console.log(`${name}=${String(Math.round((Date.now() - started) / 1000))}`);
      resolve();
    });
  });
Promise.all([
  probe("headers", `${proxy("203.0.113.63")}GET / HTTP/1.1\r\nHost: web\r\n`),
  probe("body", `${proxy("203.0.113.64")}POST /api/login/challenge HTTP/1.1\r\nHost: web\r\nAuthorization: ${auth}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`),
  probe("idle", `${proxy("203.0.113.65")}GET / HTTP/1.1\r\nHost: web\r\nAuthorization: ${auth}\r\n\r\n`),
]).then(() => process.exit(0));
setTimeout(() => {
  console.log("still open after 40 s");
  process.exit(0);
}, 40_000).unref();' "$auth" >"$tmp/timed.out" 2>&1 &
	timing=$!
	# Each visitor holds 32 requests at once (F208; a request counts while it is served): $1 WebSockets (Ergo takes
	# 16 of one address), $2 streams (the server takes 4) and $7 POSTs whose body never comes, which web holds, of
	# visitor $3, held 12 s; then $3's next request and visitor $4's, how many of $3's were held to the end (a
	# WebSocket's 101, a stream's 200, a POST still waiting: web's 100 Continue, or 000), and $3's request once they ended. Two at once (F651).
	hold() {
		docker run --rm --network "$inside" --entrypoint sh "$CURL" -c '
			ws=$1 streams=$2 auth=$3 origin=$4 other=$6 posts=$7
			me="--haproxy-protocol --haproxy-clientip $5 -u $auth"
			api=http://web:8080/api/activity?worlds=earth
			key=$(head -c 16 /dev/urandom | base64)
			{
				while [ "$ws" -gt 0 ]; do
					curl -s -o /dev/null -w "%{http_code}\n" --max-time 12 --http1.1 $me -H "Connection: Upgrade" -H "Upgrade: websocket" \
						-H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: $key" -H "Origin: $origin" http://web:8080/ws &
					ws=$((ws - 1))
				done
				while [ "$streams" -gt 0 ]; do
					curl -s -N -o /dev/null -w "%{http_code}\n" --max-time 12 $me "http://web:8080/api/stream?rooms=%23earth" &
					streams=$((streams - 1))
				done
				while [ "$posts" -gt 0 ]; do
					sleep 13 | curl -s -o /dev/null -w "%{http_code}\n" --max-time 12 -X POST -T - $me "$api" &
					posts=$((posts - 1))
				done
				wait
			} >/tmp/held &
			sleep 5
			curl -s -o /dev/null -w "%{http_code} " $me "$api"
			curl -s -o /dev/null -w "%{http_code} " --haproxy-protocol --haproxy-clientip "$other" -u "$auth" "$api"
			wait
			printf "%s " "$(grep -cE "^(101|200|100|000)$" /tmp/held)"
			curl -s -o /dev/null -w "%{http_code}" $me "$api"' sh "$1" "$2" "$auth" "$ORIGINS" "$3" "$4" "$5" || true
	}
	hold 16 4 203.0.113.61 203.0.113.62 11 >"$tmp/hold.31" &
	first=$!
	hold 16 4 203.0.113.66 203.0.113.67 12 >"$tmp/hold.32" &
	wait "$first" "$!" || true
	expect "a visitor holding 31 requests, streams among them, is served a 32nd" "$(cat "$tmp/hold.31")" "200 200 31 200"
	expect "a visitor holds 32 requests at once: the 33rd refused, another visitor served, the slots freed after" \
		"$(cat "$tmp/hold.32")" "429 200 32 200"
	# Sixteen visitors each at their 32 WebSockets leave room for another (3NB-1, F638): a held request takes two
	# of web's connections, the visitor's and Ergo's, which nginx never reclaims (a silent one it closes when
	# short, which 256 already survived), so these need more than 1,024. How many were upgraded, then the other's
	# code, within 4 s.
	crowded=$(docker run --rm --network "$inside" --entrypoint /nodejs/bin/node "$server_image" -e '
const net = require("node:net");
const { randomBytes } = require("node:crypto");
const [user, origin] = process.argv.slice(1);
const auth = `Basic ${Buffer.from(user).toString("base64")}`;
const proxy = (ip) => `PROXY TCP4 ${ip} 192.0.2.1 40000 8080\r\n`;
const upgrade = `GET /ws HTTP/1.1\r\nHost: web\r\nAuthorization: ${auth}\r\nOrigin: ${origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\n\r\n`;
let upgraded = 0;
for (let visitor = 0; visitor < 16; visitor += 1) {
  for (let i = 0; i < 32; i += 1) {
    const socket = net.connect(8080, "web", () => socket.write(`${proxy(`203.0.113.${String(70 + visitor)}`)}${upgrade}`));
    socket.once("data", (chunk) => {
      if (chunk.toString().startsWith("HTTP/1.1 101")) upgraded += 1;
    });
    socket.on("error", () => {});
  }
}
setTimeout(() => {
  const other = net.connect(8080, "web", () =>
    other.write(`${proxy("203.0.113.99")}GET / HTTP/1.1\r\nHost: web\r\nAuthorization: ${auth}\r\nConnection: close\r\n\r\n`),
  );
  let answer = "";
  other.on("data", (chunk) => (answer += chunk));
  other.on("error", () => {});
  other.on("close", () => {
    console.log(`${String(upgraded)} ${answer.split(" ")[1] ?? "none"}`);
    process.exit(0);
  });
}, 3000);
setTimeout(() => {
  console.log(`${String(upgraded)} not served within 4 s`);
  process.exit(0);
}, 7000);' "$auth" "$ORIGINS" 2>&1 || true)
	expect "sixteen visitors at their 32 WebSockets each, and another is served" "$crowded" "512 200"
	# The server reads Ergo's volume and never writes it (3n-b): mounted read-only, named, and read with no fault.
	expect "the server holds Ergo's volume read-only" \
		"$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/ergo"}}{{.RW}}{{end}}{{end}}' "$server")" false
	expect "and measures it, ERGO_DATA naming it" \
		"$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$server" | grep -cx 'ERGO_DATA=/ergo' || true)" 1
	expect "and reads it: no unreadable alert" "$(docker logs "$server" 2>&1 | grep -c '"ergo_volume_unreadable"' || true)" 0
	# The volume itself, not only a read-only one: the server's /ergo and Ergo's /data are one (F633).
	mounted() { docker inspect --format "{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Name}}{{end}}{{end}}" "$1"; }
	expect "and it is Ergo's own volume" "$(mounted "$server" /ergo) $(mounted "$ergo" /data)" "${project}_ergo ${project}_ergo"
	wait "$timing" || true
	timed=$(cat "$tmp/timed.out")
	closes() { # $1 the probe, $2 the seconds web waits, $3 what the connection did
		seconds=$(printf '%s\n' "$timed" | sed -n "s/^$1=//p")
		if [ -n "$seconds" ] && [ "$seconds" -ge "$2" ] && [ "$seconds" -le $(($2 + 1)) ]; then
			pass "web closes a connection that $3 after $2 s"
		else
			fail "web closes a connection that $3 after $2 s: [$timed]"
		fi
	}
	closes headers 10 "never ends its headers"
	closes body 10 "never sends its body"
	closes idle 15 "stays idle between requests"
	# What web hands its upstreams, seen in their place by an echo: no password, the visitor's own address. A
	# second web of the same image and live settings, whose upstreams' names lead to the echo; high addresses of
	# the internal network, which Docker hands out from its low end.
	net=$(printf '%s' "$WEB_ADDRESS" | sed 's/\.[0-9]*$//')
	docker cp "$web:/etc/nginx/nginx.conf" - | tar -xO >"$tmp/nginx.live.conf"
	printf '%s\n' 'const { createServer } = require("node:http");' \
		'for (const port of [8080, 8097]) createServer((q, r) => { console.log(JSON.stringify(q.headers)); r.end("ok"); }).listen(port);' >"$tmp/echo.cjs"
	chmod 644 "$tmp/nginx.live.conf" "$tmp/echo.cjs"
	echo_box=$(docker run -d --rm --network "$inside" --ip "$net.250" -v "$tmp/echo.cjs:/echo.cjs:ro" --entrypoint /nodejs/bin/node "$server_image" /echo.cjs)
	mirror=$(docker run -d --rm --network "$inside" --ip "$net.251" --add-host "server:$net.250" --add-host "ergo:$net.250" \
		-v "$tmp/htpasswd:/run/secrets/demo_htpasswd:ro" -v "$tmp/nginx.live.conf:/etc/nginx/nginx.conf:ro" "$(docker inspect --format '{{.Image}}' "$web")")
	sleep 2
	for path in '/api/activity?worlds=earth' /ws; do
		docker run --rm --network "$inside" "$CURL" -s -o /dev/null --max-time 5 --haproxy-protocol --haproxy-clientip 203.0.113.51 -u "$auth" \
			-H 'X-Real-IP: 192.0.2.67' -H 'X-Forwarded-For: 192.0.2.67' "http://$net.251:8080$path" || true
	done
	heard=$(docker logs "$echo_box" 2>&1)
	docker stop "$echo_box" "$mirror" >/dev/null
	expect "web hands its upstreams both requests" "$(printf '%s\n' "$heard" | grep -c '^{' || true)" 2
	expect "and never the demo's password" "$(printf '%s\n' "$heard" | grep -ci '"authorization"' || true)" 0
	expect "but the visitor's own address, X-Real-IP and X-Forwarded-For alike" \
		"$(printf '%s\n' "$heard" | grep '"x-real-ip":"203.0.113.51"' | grep -c '"x-forwarded-for":"203.0.113.51"' || true) $(printf '%s\n' "$heard" | grep -c '192.0.2.67' || true)" "2 0"

	# The way out: OpenAI's API host through the proxy in the guard's network, nothing else, and no way around.
	via() { docker run --rm --network "${3:-$inside}" "$CURL" -s -o /dev/null -w '%{http_connect} %{http_code}' --max-time 15 -x "http://${2:-guard:4750}" "$1" || true; }
	result=$(via https://api.openai.com/v1/models)
	case $result in "200 "[1-5]*) pass "OpenAI's API answers through the way out" ;; *) fail "OpenAI's API does not answer through the way out: [$result]" ;; esac
	docker cp "$egress:/etc/smokescreen/acl.yaml" - | tar -xO >"$tmp/acl.yaml"
	expect "the way out lets one host out: OpenAI's API" "$(sed -n 's/^ *- *//p' "$tmp/acl.yaml" | tr -d '"' | sort | tr '\n' ' ')" "api.openai.com "
	# Refused by the proxy itself, 407 (smokescreen.go, rejectResponse), not a connection that failed (502, 504).
	refuses() {
		result=$(via "$@")
		case $result in *407*) pass "the way out refuses $1" ;; *) fail "the way out does not refuse $1: [$result]" ;; esac
	}
	for target in https://example.com/ https://platform.openai.com/ https://api.openai.com.evil.test/ https://1.1.1.1/ \
		https://10.0.0.1/ "https://$hostip:$canary/" http://169.254.169.254/; do
		refuses "$target"
	done
	# A known limit (OPERATIONS.md): smokescreen has no port rule, so port 80 reaches OpenAI's redirect alone.
	expect "the way out answers nothing from the guard's other network" "$(answering "$outside" "$(docker inspect --format \
		"{{(index .NetworkSettings.Networks \"$outside\").IPAddress}}" "$guard"):4750")" ""
	# Its replies to a private address are refused too, so the door's own rule shows in no answer: read back.
	expect "the guard's rules refuse 4750 but from the inside" "$(docker exec "$guard" iptables-nft -S INPUT | grep -c -- '--dport 4750 -j REJECT')" 1
	# The server's own requests take the way out: Node's proxy from its settings (NODE_USE_ENV_PROXY, Node 24).
	fetched() { docker exec "$server" /nodejs/bin/node -e "fetch('$1').then((r) => console.log(r.status), (e) => console.log('refused'))" 2>&1 || true; }
	case $(fetched https://api.openai.com/v1/models) in [1-5][0-9][0-9]) pass "the server reaches OpenAI's API through the way out" ;; *) fail "the server does not reach OpenAI's API" ;; esac
	expect "and nothing else" "$(fetched https://example.com/)" refused
	# It resolves before it connects (smokescreen.go, safeResolve): a public name for a private address is refused,
	# whatever its list says. An ad hoc proxy of the same image and the live settings, its list its own, in the
	# guard's network on 4751, asked from there: the guard's rules let only 4750's replies out to the network.
	mkdir "$tmp/egress"
	docker cp "$egress:/etc/smokescreen/config.yaml" - | tar -xO >"$tmp/egress/config.yaml"
	# Its tunnels close when quiet, and are capped (F627): read back, as Ergo's settings are.
	for line in 'idle_timeout: 60s' 'max_concurrent_connect_tunnels: 32' 'max_concurrent_requests: 32'; do
		expect "the way out's settings say $line" "$(grep -cxF -- "$line" "$tmp/egress/config.yaml")" 1
	done
	printf 'version: v1\nservices: []\ndefault:\n  project: test\n  action: enforce\n  allowed_domains:\n    - api.openai.com\n    - localtest.me\n    - 10.0.0.1.nip.io\n' >"$tmp/egress/acl.yaml"
	chmod 755 "$tmp/egress" && chmod 644 "$tmp/egress"/*
	for name in localtest.me:127.0.0.1 10.0.0.1.nip.io:10.0.0.1; do
		# Every answer, the DNS server's own line among them: localtest.me's A and AAAA come in either order.
		resolved=$(docker run --rm --network bridge --entrypoint nslookup "$CURL" "${name%%:*}" 2>/dev/null | sed -n 's/^Address: //p' | tr '\n' ' ')
		case " $resolved" in *" ${name#*:} "*) ;; *) missing "${name%%:*} resolves to [$resolved], not ${name#*:}: the resolution check is blind" ;; esac
	done
	box=$(docker run -d --rm --network "container:$guard" -v "$tmp/egress:/test:ro" --entrypoint /smokescreen \
		"$(docker inspect --format '{{.Image}}' "$egress")" --config-file /test/config.yaml --listen-port 4751 --egress-acl-file /test/acl.yaml)
	ad_hoc() { docker run --rm --network "container:$guard" "$CURL" -s --max-time 15 -x http://127.0.0.1:4751 -w '\n%{http_code}' "$1" || true; }
	for _ in 1 2 3 4 5 6 7 8 9 10; do case $(ad_hoc http://api.openai.com/ | tail -n 1) in 000) sleep 1 ;; *) break ;; esac; done
	case $(ad_hoc http://api.openai.com/ | tail -n 1) in 000 | 407 | 50[0-9]) fail "the ad hoc way out reaches no allowed host: the check is blind" ;; *) pass "the ad hoc way out reaches an allowed host (its control)" ;; esac
	for target in http://localtest.me/ http://10.0.0.1.nip.io/; do
		answer=$(ad_hoc "$target")
		case $answer in *"denied by rule"*407) pass "the way out refuses $target, a private address its list allows" ;; *) fail "the way out lets $target through: [$(printf '%s' "$answer" | tr '\n' ' ' | cut -c1-120)]" ;; esac
	done
	docker stop "$box" >/dev/null
	# The probe of Ergo's and the way out's health checks (deploy/probe), tested where Go is.
	expect "the health probe passes its tests" "$(docker run --rm -v "$here/probe:/src:ro" -w /src -e GOCACHE=/tmp \
		"$GOLANG" go test ./... 2>&1 | tail -n 1 | cut -c1-2)" ok
else
	# The running demo.
	if [ -z "${DEMO_PASSWORD:-}" ]; then # read, not typed on a command line: none in the shell's history
		printf "The demo's password (not shown): " >&2
		stty -echo 2>/dev/null || :
		read -r DEMO_PASSWORD
		stty echo 2>/dev/null || :
		echo >&2
	fi
	project=gnoworld-demo
	of() { docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$1"; }
	ts=$(of tailscale)
	guard=$(of guard)
	web=$(of web)
	ergo=$(of ergo) server=$(of server) egress=$(of egress)
	if [ -z "$ts" ] || [ -z "$guard" ] || [ -z "$web" ] || [ -z "$ergo" ] || [ -z "$server" ] || [ -z "$egress" ]; then
		echo "test.sh: the demo is not running (docker compose -f deploy/compose.yaml --profile demo up -d --build)" >&2
		exit 3
	fi
	hardened "$ts" tailscale "user network"
	expect "Tailscale's network is the guard's" "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$ts")" "container:$(docker inspect --format '{{.Id}}' "$guard")"
	reach "container:$ts" "Tailscale's network" yes "$(guard_dns)"
	memory=0 cpus=0
	for id in $ts $guard $web $ergo $server $egress; do
		memory=$((memory + $(docker inspect --format '{{.HostConfig.Memory}}' "$id")))
		cpus=$((cpus + $(docker inspect --format '{{.HostConfig.NanoCpus}}' "$id")))
	done
	if [ "$memory" -le 2147483648 ] && [ "$cpus" -le 2000000000 ]; then pass "the demo stays under 2 GB and 2 cores"; else fail "the demo: $memory bytes, $cpus nano-cpus"; fi

	json=$(docker exec "$ts" tailscale --socket=/tmp/tailscaled.sock status --json)
	read_json() { printf '%s' "$json" | python3 -c "import json, sys; d = json.load(sys.stdin); print($1)"; }
	expect "the demo machine is logged in and running" "$(read_json 'd["BackendState"]')" Running
	expect "it is online" "$(read_json 'd["Self"]["Online"]')" True
	expect "it carries the demo's tag" "$(read_json '" ".join(d["Self"].get("Tags") or [])')" tag:gnoworld-demo
	expect "it sees no device of the tailnet" "$(read_json 'len(d.get("Peer") or {})')" 0
	serve=$(docker exec "$ts" tailscale --socket=/tmp/tailscaled.sock serve status --json)
	expect "Funnel forwards 443 to web, with the visitor's address" \
		"$(printf '%s' "$serve" | python3 -c 'import json, sys; t = json.load(sys.stdin)["TCP"]; print(sorted(t), t["443"].get("TCPForward"), t["443"].get("ProxyProtocol"))')" "['443'] web:8080 2"
	expect "and only there, to the public" \
		"$(printf '%s' "$serve" | python3 -c 'import json, sys; print(list(json.load(sys.stdin).get("AllowFunnel", {}).values()))')" "[True]"

	name=$(read_json 'd["Self"]["DNSName"].rstrip(".")')
	address=$(dig +short @1.1.1.1 "$name" A | tail -1)
	expect "the public URL resolves, through public DNS, to a public address" "$(is_public "$address")" True
	visit() { curl -s --max-time 20 --resolve "$name:443:$address" "$@"; }
	# On stdin, quoted as curl's config wants: a " or a \ in the password is escaped.
	signed() { printf 'user = "team:%s"\n' "$(printf '%s' "$DEMO_PASSWORD" | sed 's/[\\"]/\\&/g')" | visit -K - "$@"; }
	expect "the public URL wants the password" "$(visit -o /dev/null -w '%{http_code}' "https://$name/")" 401
	expect "the public URL serves the site with it" "$(signed -o /dev/null -w '%{http_code}' "https://$name/")" 200
	expect "the public URL is not indexed" \
		"$(signed -o /dev/null -D - "https://$name/" | tr -d '\r' | awk -F': ' 'tolower($1) == "x-robots-tag" { print $2 }')" noindex
	expect "the public URL answers the API" "$(signed -o /dev/null -w '%{http_code}' "https://$name/api/activity?worlds=earth")" 200
	# A WebSocket's handshake from the app's own origin (ORIGINS in deploy/.env): 101, then curl gives up at its time.
	upgrade=$(signed -o /dev/null -w '%{http_code}' --max-time 5 --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
		-H 'Sec-WebSocket-Version: 13' -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" -H "Origin: https://$name" "https://$name/ws" || true)
	expect "the public URL opens a WebSocket to Ergo from the app's origin" "$upgrade" 101
	seen=$(docker logs --tail 1 "$web" 2>&1 | awk '{ print $1 }')
	expect "web sees the visitor's own address, not the tailnet's" "$(is_public "$seen")" True
	key=$(docker exec "$ts" cat /run/secrets/ts_authkey) # the key it was given, wherever its file lives
	expect "Docker holds no copy of the auth key" "$(docker inspect "$ts" | grep -cF "$key" || true)" 0
	expect "no log holds it" "$( (docker logs "$ts" 2>&1 && docker logs "$guard" 2>&1 && docker logs "$web" 2>&1) | grep -cF "$key" || true)" 0
fi

if [ "$failed" -gt 0 ]; then
	echo "test.sh: $failed check(s) failed" >&2
	exit 1
fi
echo "test.sh: every check passed"
