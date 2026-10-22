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
	# The faults each check must catch (CLAUDE.md: a guard lands with the fault that proves it).
	# Each fault names the check that must catch it: killed by another one, it proves nothing.
	mutant() {
		label=$1 wanted=$2
		shift 2
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
	mutant "no content security policy" "carries the policy" nginx sed '/include \/etc\/nginx\/csp.conf;/d'
	mutant "hashed files not kept" "is kept a year" nginx sed 's#public, max-age=31536000, immutable#no-cache#'
	mutant "an error on a hashed file kept a year" "a 401 on a hashed file revalidates" \
		nginx sed 's#~^(200|206|304)/assets/#~^[0-9]*/assets/#'
	mutant "no manifest type" "the manifest's type" nginx sed '/application\/manifest+json webmanifest;/d'
	mutant "nothing compressed" "is sent compressed" nginx sed '/gzip on;/d'
	mutant "no data type" "a world's data's type" nginx sed '/text\/x-script data;/d'
	mutant "no PROXY protocol" "the server is up and asks" nginx sed 's#listen 8080 proxy_protocol#listen 8080#'
	mutant "a page cached" "/ revalidates" nginx sed 's#default "no-cache";#default "max-age=600";#'
elif [ "${1:-}" != --demo ]; then
	# The static server and the guard, with a password of their own; no Tailscale key is needed.
	inside=${project}_inside
	outside=${project}_outside
	for file in "$here/compose.yaml" "$here/web/Dockerfile"; do
		unpinned=$(grep -nE '^[[:space:]]*(image:[[:space:]]*[^*[:space:]]|x-[a-z-]*image:|FROM )' "$file" | grep -v '@sha256:[0-9a-f]\{64\}' || true)
		expect "every image $(basename "$file") pulls is pinned by digest" "$unpinned" ""
	done
	for secret in demo_htpasswd ts_authkey; do
		if git -C "$repo" check-ignore -q "deploy/secrets/$secret"; then pass "git ignores deploy/secrets/$secret"; else fail "git would track deploy/secrets/$secret"; fi
	done
	expect "git tracks nothing in deploy/secrets" "$(git -C "$repo" ls-files deploy/secrets)" ""
	if grep -qx 'deploy/secrets' "$repo/.dockerignore"; then pass "the build leaves deploy/secrets out"; else fail "the build would send deploy/secrets"; fi
	if grep -qF 'Read(/deploy/secrets/**)' "$repo/.claude/settings.json"; then pass "Claude Code may not read the secrets"; else fail "Claude Code may read the secrets"; fi

	password=$(openssl rand -hex 16)
	htpasswd -nbB team "$password" | grep . >"$tmp/htpasswd"
	chmod 644 "$tmp/htpasswd"
	export DEMO_HTPASSWD_FILE="$tmp/htpasswd"
	printf 'not a key\n' >"$tmp/ts_authkey" # Compose wants each secret's file, even one no started service reads
	export TS_AUTHKEY_FILE="$tmp/ts_authkey"
	started=yes
	docker compose -p "$project" $files down -v >/dev/null 2>&1 || true # what an interrupted run left
	if ! docker compose -p "$project" $files up -d --build --wait web guard; then
		echo "test.sh: the static server or the guard did not start: $(docker compose -p "$project" $files logs --no-log-prefix --tail 1 guard web 2>&1 | tr '\n' ' ')" >&2
		exit 3
	fi
	web=$(docker compose -p "$project" $files ps -q web)
	guard=$(docker compose -p "$project" $files ps -q guard)

	hardened "$web" web
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
		grep -vx -e '-A OUTPUT -o [^ ]* -p tcp -m tcp --dport 8080 -j ACCEPT' -e '-A OUTPUT -p tcp -m multiport --dports 80,443 -j ACCEPT' \
			-e '-A OUTPUT -d [0-9.]*/32 -p [a-z]* -m [a-z]* --dport 53 -j ACCEPT' || true)" ""
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
	# Each answer's code with its Cache-Control: a browser keeps a 429 that says immutable.
	kept=$(docker run --rm --network "$inside" "$CURL" -s -o /dev/null -w '%{http_code} %header{cache-control}\n' --haproxy-protocol \
		--haproxy-clientip 198.51.100.4 -u "$auth" "http://web:8080$first?[1-200]" || true)
	at_least "a burst on a hashed file gets 429" "$(printf '%s\n' "$kept" | grep -c '^429 ' || true)" 100
	expect "a 429 on a hashed file revalidates" "$(printf '%s\n' "$kept" | grep '^429 ' | sort -u)" "429 no-cache"
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
	if [ -z "$ts" ] || [ -z "$guard" ] || [ -z "$web" ]; then
		echo "test.sh: the demo is not running (docker compose -f deploy/compose.yaml --profile demo up -d --build)" >&2
		exit 3
	fi
	hardened "$ts" tailscale "user network"
	expect "Tailscale's network is the guard's" "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$ts")" "container:$(docker inspect --format '{{.Id}}' "$guard")"
	reach "container:$ts" "Tailscale's network" yes "$(guard_dns)"
	memory=0 cpus=0
	for id in $ts $guard $web; do
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
