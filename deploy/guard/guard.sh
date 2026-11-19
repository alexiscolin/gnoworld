#!/bin/sh
# The only way out. This container holds the network the egress proxies share, and loads its rules before anything
# else runs there: each proxy's port, open from its own network alone (smokescreen listens here on 4750 for the
# internal network, 4751 for jarvis's, 4753 for the reader's, 4754 for the link reader's). In: each proxy's port is refused
# from every other interface, and jarvis's, the reader's and the link reader's networks get nothing else in; the internal
# network and the outside bridge are not walled, INPUT's policy being ACCEPT, so any other port the guard held a listener
# on would be open to them (none is). Out, from each proxy's port: replies to connections it opened, nothing else. The DNS servers
# Docker forwards to from this network; then
# every private, local, carrier and reserved address refused, so the host, its LAN and any VPN stay out of reach, and the
# host's own public addresses (HOST_PUBLIC_ADDRESSES), where a public front on it listens; then
# public TCP 80 and 443, and nothing else: no UDP, no other port. Nothing in this network starts a connection to web
# or to any container of the stack. IPv6 is closed. deploy/test.sh proves each line.
set -eu

# HOST_PUBLIC_ADDRESSES: IPv4 addresses, spaces between, none by default. Read as words, never as patterns, and each
# one checked before anything else, so a typo stops the guard instead of becoming a rule.
set -f
addresses=${HOST_PUBLIC_ADDRESSES:-}
for address in $addresses; do
	if ! printf '%s\n' "$address" | grep -Eqx '((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'; then
		echo "guard: HOST_PUBLIC_ADDRESSES: $address is not an IPv4 address" >&2
		exit 1
	fi
done

# The internal network is the one web is on: its interface is the route to web's address.
web=$(getent hosts web | awk '{ print $1 }')
inside=$(ip route get "$web" | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") print $(i + 1) }')
if [ -z "$web" ] || [ -z "$inside" ]; then
	echo "guard: cannot find web's network" >&2
	exit 1
fi
# jarvis's way out's network, by the guard's own fixed address in it (JARVIS_OUT_ADDRESS, compose.yaml), never by
# jarvis's name, which may resolve elsewhere or not yet; refused if it is the internal network or the one that lets out.
jarvis_out=$(ip -4 -o addr show to "$JARVIS_OUT_ADDRESS/32" | awk '{ print $2 }')
# The reader's the same way, by its own address (READER_OUT_ADDRESS), a network of its own: 4753 from it alone.
reader_out=$(ip -4 -o addr show to "$READER_OUT_ADDRESS/32" | awk '{ print $2 }')
# The link reader's the same way, by its own address (LINKS_OUT_ADDRESS): 4754 from it alone.
links_out=$(ip -4 -o addr show to "$LINKS_OUT_ADDRESS/32" | awk '{ print $2 }')
outside=$(ip route show default | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") print $(i + 1) }')
if [ -z "$jarvis_out" ] || [ "$jarvis_out" = "$inside" ] || [ "$jarvis_out" = "$outside" ]; then
	echo "guard: cannot find jarvis's network" >&2
	exit 1
fi
if [ -z "$reader_out" ] || [ "$reader_out" = "$inside" ] || [ "$reader_out" = "$outside" ] || [ "$reader_out" = "$jarvis_out" ]; then
	echo "guard: cannot find the reader's network" >&2
	exit 1
fi

if [ -z "$links_out" ] || [ "$links_out" = "$inside" ] || [ "$links_out" = "$outside" ] || [ "$links_out" = "$jarvis_out" ] || [ "$links_out" = "$reader_out" ]; then
	echo "guard: cannot find the link reader's network" >&2
	exit 1
fi

# Docker's resolver writes its upstreams here; one marked host(...) is reached from the host's
# own network, so no rule of this one applies to it. IPv4 only: IPv6 is closed, and an IPv6
# server would fail the whole restore below.
dns=$(sed -n 's/^# ExtServers: \[\(.*\)\]$/\1/p' /etc/resolv.conf | tr ' ' '\n' | grep -E '^[0-9]+(\.[0-9]+){3}$' || true)

{
	echo '*filter'
	echo ':INPUT ACCEPT [0:0]'
	echo ':FORWARD DROP [0:0]'
	echo ':OUTPUT DROP [0:0]'
	echo '-A INPUT -i lo -j ACCEPT'
	echo "-A INPUT -i $inside -p tcp --dport 4750 -j ACCEPT"
	echo '-A INPUT -p tcp --dport 4750 -j REJECT'
	echo "-A INPUT -i $jarvis_out -p tcp --dport 4751 -j ACCEPT"
	echo "-A INPUT -i $jarvis_out -j REJECT"
	echo '-A INPUT -p tcp --dport 4751 -j REJECT'
	echo "-A INPUT -i $reader_out -p tcp --dport 4753 -j ACCEPT"
	echo "-A INPUT -i $reader_out -j REJECT"
	echo '-A INPUT -p tcp --dport 4753 -j REJECT'
	echo "-A INPUT -i $links_out -p tcp --dport 4754 -j ACCEPT"
	echo "-A INPUT -i $links_out -j REJECT"
	echo '-A INPUT -p tcp --dport 4754 -j REJECT'
	echo '-A OUTPUT -o lo -j ACCEPT'
	echo "-A OUTPUT -o $inside -p tcp --sport 4750 -m conntrack --ctstate ESTABLISHED -j ACCEPT"
	echo "-A OUTPUT -o $jarvis_out -p tcp --sport 4751 -m conntrack --ctstate ESTABLISHED -j ACCEPT"
	echo "-A OUTPUT -o $reader_out -p tcp --sport 4753 -m conntrack --ctstate ESTABLISHED -j ACCEPT"
	echo "-A OUTPUT -o $links_out -p tcp --sport 4754 -m conntrack --ctstate ESTABLISHED -j ACCEPT"
	for server in $dns; do
		echo "-A OUTPUT -d $server -p udp --dport 53 -j ACCEPT"
		echo "-A OUTPUT -d $server -p tcp --dport 53 -j ACCEPT"
	done
	for range in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 \
		192.0.0.0/24 192.168.0.0/16 198.18.0.0/15 224.0.0.0/4 240.0.0.0/4; do
		echo "-A OUTPUT -d $range -j REJECT"
	done
	for own in $addresses; do
		echo "-A OUTPUT -d $own/32 -j REJECT"
	done
	echo '-A OUTPUT -p tcp -m multiport --dports 80,443 -j ACCEPT'
	echo 'COMMIT'
} | iptables-nft-restore

printf '*filter\n:INPUT ACCEPT [0:0]\n:FORWARD DROP [0:0]\n:OUTPUT DROP [0:0]\n-A OUTPUT -o lo -j ACCEPT\nCOMMIT\n' |
	ip6tables-nft-restore

echo "guard: the rules are in"
exec sleep 2147483647
