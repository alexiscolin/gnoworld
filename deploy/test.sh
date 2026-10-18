#!/bin/sh
# deploy/test.sh: the demo's proofs (docs/plans/slice-1c.md §3), on the demo's host, macOS or
# Linux, with Docker Engine 28 or later. It needs Docker's socket, which Claude Code's sandbox
# refuses, so the operator runs it:
#   sh deploy/test.sh            builds the static server, starts it with the guard in a throwaway
#                                project and a password of its own, checks both, then removes it;
#   sh deploy/test.sh --mutants  the same against faults planted one at a time: each must fail;
#   DEMO_PASSWORD=... sh deploy/test.sh --demo
#                                checks the running demo: Tailscale, its tailnet, the public URL.
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
case $os in
Darwin) host_tools="lsof route ipconfig arp" ;;
Linux) host_tools="ss ip" ;;
*) missing "it runs on macOS or Linux, not $os" ;;
esac
for tool in docker curl python3 openssl htpasswd dig git $host_tools; do
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

host_ports() {
	case $os in
	Darwin) lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR > 1 { sub(/.*:/, "", $9); print $9 }' ;;
	Linux) ss -ltnH 2>/dev/null | awk '{ sub(/.*:/, "", $4); print $4 }' ;;
	esac | sort -un
}
default_route() { # "<gateway> <interface>"
	case $os in
	Darwin) route -n get default 2>/dev/null | awk '/gateway:/ { g = $2 } /interface:/ { i = $2 } END { print g, i }' ;;
	Linux) ip route show default 2>/dev/null | awk '{ print $3, $5; exit }' ;;
	esac
}
address_of() {
	case $os in
	Darwin) ipconfig getifaddr "$1" 2>/dev/null || true ;;
	Linux) ip -4 -o addr show dev "$1" 2>/dev/null | awk '{ sub(/\/.*/, "", $4); print $4; exit }' ;;
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

targets() {
	ports=$(host_ports)
	route=$(default_route)
	router=${route% *}
	address=$(address_of "${route#* }")
	if [ -z "$ports" ] || [ -z "$router" ] || [ -z "$address" ]; then
		missing "cannot read the host's ports, router or address"
	fi
	for port in $ports; do printf 'host.docker.internal:%s\n%s:%s\n' "$port" "$address" "$port"; done
	for gateway in $(gateways); do
		for port in $ports 22 53 80 443 2375 2376; do printf '%s:%s\n' "$gateway" "$port"; done
	done
	for port in 22 53 80 443; do printf '%s:%s\n' "$router" "$port"; done
	for neighbour in $(neighbours | grep -vx "$router"); do
		for port in 22 80 443; do printf '%s:%s\n' "$neighbour" "$port"; done
	done
}

# What a network reaches: no service of the host (the canary among them), its addresses, its LAN
# or Docker's gateways; the internet only when $3 says yes.
reach() {
	network=$1 name=$2 internet=$3
	list=$(targets | sort -u)
	found=$(answering "$network" $list 1.1.1.1:443)
	host=$(printf '%s\n' "$found" | grep -v '^1\.1\.1\.1:443$' | grep . | sort | tr '\n' ' ' | sed 's/ $//' || true)
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
	case $mounts in *"bind "*" true;"*) fail "$name: a file of the host mounted writable" ;; *) pass "$name: the host's files read-only" ;; esac
	case $(field '{{json .HostConfig.Tmpfs}}') in *'"/tmp"'*) pass "$name: /tmp in memory" ;; *) fail "$name: no /tmp in memory" ;; esac
	case $(field '{{json .HostConfig.LogConfig.Config}}') in *max-size*) pass "$name: its logs rotate" ;; *) fail "$name: its logs grow for good" ;; esac
	memory=$(field '{{.HostConfig.Memory}}')
	cpus=$(field '{{.HostConfig.NanoCpus}}')
	if [ "$memory" -gt 0 ] && [ "$memory" -le 1073741824 ]; then pass "$name: memory capped"; else fail "$name: memory [$memory]"; fi
	if [ "$cpus" -gt 0 ] && [ "$cpus" -le 1000000000 ]; then pass "$name: cpu capped"; else fail "$name: cpu [$cpus]"; fi
	case $(field '{{json .HostConfig.PidsLimit}}') in null | 0 | -1) fail "$name: no process cap" ;; *) pass "$name: processes capped" ;; esac
	expect "$name is healthy, by a check of its own" "$(field '{{if .Config.Healthcheck}}{{.State.Health.Status}}{{end}}')" healthy
}

networks_of() { docker inspect --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$1" | tr ' ' '\n' | grep . | sort | tr '\n' ' '; }

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
	nginx() { # nginx.conf through one edit (a sed or awk command), mounted over the image's own
		"$@" "$here/web/nginx.conf" >"$tmp/nginx.conf"
		printf 'services:\n  web:\n    volumes:\n      - %s:/etc/nginx/nginx.conf:ro\n' "$tmp/nginx.conf"
	}
	guard() { # the guard's script through one sed edit, mounted over deploy/guard
		mkdir -p "$tmp/guard"
		sed "$1" "$here/guard/guard.sh" >"$tmp/guard/guard.sh"
		printf 'services:\n  guard:\n    volumes: !override\n      - %s:/guard:ro\n' "$tmp/guard"
	}
	# Not planted: web on the host's own network, which would publish the site there for the run;
	# hardened() still refuses it, a guard no fault proves.
	mutant "the internal network let out" "the internal network has no way out to the internet" \
		compose 'networks: { inside: { internal: false, driver_opts: !reset {} } }'
	mutant "the internal network keeps its gateway" "the internal network has a gateway" \
		compose 'networks: { inside: { driver_opts: !reset {} } }'
	mutant "a writable root" "web: read-only root" compose 'services: { web: { read_only: false } }'
	mutant "capabilities kept" "web: every capability dropped" compose 'services: { web: { cap_drop: !reset [] } }'
	mutant "no memory cap" "web: memory" compose 'services: { web: { mem_limit: 8g } }'
	mutant "the guard loads no rule" "the guard's network, which Tailscale shares, reaches nothing" \
		compose 'services: { guard: { entrypoint: [sleep, "2147483647"], healthcheck: { test: [CMD, "true"] } } }'
	mutant "the guard lets a private range out" "the guard's network, which Tailscale shares, reaches nothing" \
		guard 's# 192\.168\.0\.0/16##'
	mutant "the guard lets every port out" "the guard lets out no other public port" \
		guard 's#-A OUTPUT -p tcp -m multiport --dports 80,443 -j ACCEPT#-A OUTPUT -p tcp -j ACCEPT#'
	mutant "no rate limit" "a burst with no password gets 429" nginx sed '/limit_req zone=/d'
	mutant "the worker served without the password" "no password, no /sw.js" \
		nginx awk '/location \/assets\// { print "    location = /sw.js { auth_basic off; }" } { print }'
	mutant "noindex only on success" "the 401 is not indexed" nginx sed 's#X-Robots-Tag "noindex" always#X-Robots-Tag "noindex"#'
	mutant "hashed files not kept" "is kept a year" nginx sed 's#public, max-age=31536000, immutable#no-cache#'
	mutant "no PROXY protocol" "the server is up and asks" nginx sed 's#listen 8080 proxy_protocol#listen 8080#'
	mutant "a page cached" "/ revalidates" nginx sed 's#"no-cache" always#"max-age=600" always#'
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
		echo "test.sh: the static server or the guard did not start" >&2
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
	expect "web answers its own network (the probe sees what is there)" "$(answering "$inside" web:8080)" web:8080
	reach "$inside" "the internal network" no

	hardened "$guard" guard "user net-admin"
	expect "the guard sits on the internal network and its own" "$(networks_of "$guard")" "$inside $outside "
	expect "its own network lets out" "$(docker network inspect --format '{{.Internal}}' "$outside")" false
	expect "it is alone there" "$(docker network inspect --format '{{len .Containers}}' "$outside")" 1
	expect "from the guard's network, web answers on its port" "$(answering "container:$guard" web:8080)" web:8080
	reach "container:$guard" "the guard's network, which Tailscale shares," yes
	# TCP leaves on 80 and 443 only: a public port that a plain container reaches stays shut.
	expect "a plain container reaches a public port beside 80 and 443 (the next check sees)" "$(answering bridge 1.1.1.1:853)" 1.1.1.1:853
	expect "the guard lets out no other public port" "$(answering "container:$guard" 1.1.1.1:853)" ""

	# Requests as Tailscale sends them: through the PROXY protocol, with the visitor's address.
	ask() {
		path=$1 client=$2
		shift 2
		docker run --rm --network "$inside" "$CURL" -s -o /dev/null -D - --haproxy-protocol \
			--haproxy-clientip "$client" "$@" "http://web:8080$path" | tr -d '\r'
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
	expect "a path in another case is no page" "$(status /W/BUBBLE 203.0.113.1 -u "$auth")" 404
	case $(status '/..%2f..%2fetc/passwd' 203.0.113.1 -u "$auth") in 200) fail "a path out of the site answers" ;; *) pass "no path leads out of the site" ;; esac
	case $(status / 203.0.113.1 -u "$auth" -X POST) in 2*) fail "a POST is answered" ;; *) pass "a POST is refused" ;; esac
	for path in $pages /nowhere /sw.js /manifest.webmanifest /icon-192.png $assets; do
		expect "$path is not indexed" "$(header x-robots-tag "$path" 203.0.113.1 -u "$auth")" noindex
		expect "$path is never sniffed" "$(header x-content-type-options "$path" 203.0.113.1 -u "$auth")" nosniff
	done
	for path in $pages /nowhere /sw.js /manifest.webmanifest /icon-192.png; do
		expect "$path revalidates" "$(header cache-control "$path" 203.0.113.1 -u "$auth")" no-cache
	done
	for path in $assets; do
		expect "$path is kept a year" "$(header cache-control "$path" 203.0.113.1 -u "$auth")" "public, max-age=31536000, immutable"
	done
	expect "the server names no version" "$(header server / 203.0.113.1 -u "$auth")" nginx
	case $(header content-type /sw.js 203.0.113.1 -u "$auth") in */javascript*) pass "the worker is a script" ;; *) fail "the worker is no script" ;; esac
	expect "the manifest's type" "$(header content-type /manifest.webmanifest 203.0.113.1 -u "$auth")" application/manifest+json
	expect "an icon's type" "$(header content-type /icon-192.png 203.0.113.1 -u "$auth")" image/png

	at_least "a burst with no password gets 429" "$(codes 429 198.51.100.1 'http://web:8080/[1-200]')" 100
	at_least "a burst with a wrong password gets 429" "$(codes 429 198.51.100.2 -u team:wrong 'http://web:8080/[1-200]')" 100
	at_least "a burst on the worker gets 429" "$(codes 429 198.51.100.3 -u "$auth" 'http://web:8080/sw.js?[1-200]')" 100
	at_least "a burst on a hashed file gets 429" "$(codes 429 198.51.100.4 -u "$auth" "http://web:8080$first?[1-200]")" 100
	urls=""
	for path in $pages /sw.js /manifest.webmanifest /icon-192.png /icon-512.png $assets; do urls="$urls http://web:8080$path"; done
	expect "a visitor's whole first load, at once, gets no 429" "$(codes 429 198.51.100.9 -u "$auth" --parallel --parallel-max 50 $urls)" 0
	expect "another visitor is still served" "$(status / 198.51.100.10 -u "$auth")" 200
else
	# The running demo.
	: "${DEMO_PASSWORD:?set it to the demo password, to check the public URL}"
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
	reach "container:$ts" "Tailscale's network" yes
	memory=0 cpus=0
	for id in $ts $guard $web; do
		memory=$((memory + $(docker inspect --format '{{.HostConfig.Memory}}' "$id")))
		cpus=$((cpus + $(docker inspect --format '{{.HostConfig.NanoCpus}}' "$id")))
	done
	if [ "$memory" -le 2147483648 ] && [ "$cpus" -le 2000000000 ]; then pass "the demo stays under 2 GB and 2 cores"; else fail "the demo: $memory bytes, $cpus nano-cpus"; fi

	json=$(docker exec "$ts" tailscale status --json)
	read_json() { printf '%s' "$json" | python3 -c "import json, sys; d = json.load(sys.stdin); print($1)"; }
	expect "the demo machine is logged in and running" "$(read_json 'd["BackendState"]')" Running
	expect "it is online" "$(read_json 'd["Self"]["Online"]')" True
	expect "it carries the demo's tag" "$(read_json '" ".join(d["Self"].get("Tags") or [])')" tag:gnoworld-demo
	expect "it sees no device of the tailnet" "$(read_json 'len(d.get("Peer") or {})')" 0
	serve=$(docker exec "$ts" tailscale serve status --json)
	expect "Funnel forwards 443 to web, with the visitor's address" \
		"$(printf '%s' "$serve" | python3 -c 'import json, sys; t = json.load(sys.stdin)["TCP"]; print(sorted(t), t["443"].get("TCPForward"), t["443"].get("ProxyProtocol"))')" "['443'] web:8080 2"
	expect "and only there, to the public" \
		"$(printf '%s' "$serve" | python3 -c 'import json, sys; print(list(json.load(sys.stdin).get("AllowFunnel", {}).values()))')" "[True]"

	name=$(read_json 'd["Self"]["DNSName"].rstrip(".")')
	address=$(dig +short @1.1.1.1 "$name" A | tail -1)
	expect "the public URL resolves, through public DNS, to a public address" "$(is_public "$address")" True
	visit() { curl -s --max-time 20 --resolve "$name:443:$address" "$@"; }
	expect "the public URL wants the password" "$(visit -o /dev/null -w '%{http_code}' "https://$name/")" 401
	expect "the public URL serves the site with it" "$(visit -o /dev/null -w '%{http_code}' -u "team:$DEMO_PASSWORD" "https://$name/")" 200
	expect "the public URL is not indexed" \
		"$(visit -o /dev/null -D - -u "team:$DEMO_PASSWORD" "https://$name/" | tr -d '\r' | awk -F': ' 'tolower($1) == "x-robots-tag" { print $2 }')" noindex
	seen=$(docker logs --tail 1 "$web" 2>&1 | awk '{ print $1 }')
	expect "web sees the visitor's own address, not the tailnet's" "$(is_public "$seen")" True
	key=$(cat "$here/secrets/ts_authkey")
	expect "Docker holds no copy of the auth key" "$(docker inspect "$ts" | grep -cF "$key" || true)" 0
	expect "no log holds it" "$( (docker logs "$ts" 2>&1 && docker logs "$guard" 2>&1 && docker logs "$web" 2>&1) | grep -cF "$key" || true)" 0
fi

if [ "$failed" -gt 0 ]; then
	echo "test.sh: $failed check(s) failed" >&2
	exit 1
fi
echo "test.sh: every check passed"
