# Operations

The runbook (ADR-0002 §7). It holds the demo: the client behind a password, published through
Tailscale Funnel from one Docker host, with Ergo (the chat), `server` (the login, the rooms, the bot)
and, in the demo, a way out to OpenAI alone (slice 3, 3e); `jarvis`, off by default and under a profile of its own, comes with slice 10 (10j, 10j-4), and
Grafana later (`docs/decisions.md:151`). Everything is in `deploy/`; nothing outside it is touched,
and no port of the host is opened. It runs on any Docker host: Linux with Docker Engine 28 or
later, Docker Desktop, or OrbStack. Every setting, secret and switch is listed in [CONFIGURATION.md](CONFIGURATION.md).

## The services

| Service | Image | Listens | Health | Limits | State | Secret |
|---|---|---|---|---|---|---|
| `web` | built from `deploy/web/Dockerfile`: the client, on `nginx-unprivileged` 1.30.6, by digest | 8080, PROXY protocol, on `inside` only | `127.0.0.1:8081/health`, inside the container | 0.5 core, 128 MB, 64 processes | none | `demo_htpasswd` |
| `guard` (profile `demo`) | `tailscale/tailscale` v1.104.1, by digest, running `deploy/guard/guard.sh` | nothing | its rules loaded | 0.1 core, 32 MB, 16 processes | none | none |
| `tailscale` (profile `demo`) | the same image | Funnel on 443, forwarded to `web:8080` | `127.0.0.1:9002/healthz`, inside its network | 0.5 core, 256 MB, 128 processes | the `tailscale` volume (its node key) | `ts_authkey` |
| `ergo` | built from `deploy/ergo/Dockerfile`: Ergo's own image v2.19.1, by digest, with `render.sh` and a probe for its health; its auth script is the server's socket | 6667 (the bot) and 8097 (WebSocket, web's `/ws`), on `inside` only | its 6667 answers | 0.4 core, 512 MB, 1,024 processes (Go's threads count) | the `ergo` volume (accounts, history) | `ergo_oper_password` |
| `server` | built from `deploy/server/Dockerfile`: distroless Node 24, by digest | 8080 (web's `/api/`) on its own address of `inside` (`SERVER_ADDRESS`); the `auth` volume's socket | `SERVER_ADDRESS:8080/health` | 0.4 core, 512 MB, 128 processes | the `server` volume (its SQLite) | `log_pepper`, `ergo_oper_password`, `openai_api_key` |
| `egress` (profile `demo`) | built from `deploy/egress/Dockerfile`: smokescreen v0.1.0 from its source, on distroless static | 4750 in `guard`'s network, reached from `inside` alone | its 4750 answers | 0.1 core, 64 MB, 64 processes | none | none |
| `jarvis` (profile `jarvis`) | built from `deploy/jarvis/Dockerfile`: its package and the packages it imports, on distroless Node 24; no gnomcp (the reader's) | 8081 on its address of `jarvis` (`JARVIS_ADDRESS`), the network it shares with the server alone | `GET /budgets`, by the name `jarvis` | 0.3 core, 384 MB, 128 processes | the `jarvis` volume (its budgets, its caches) | `anthropic_api_key`, read only when on; `jarvis_door_key` |
| `egress_jarvis` (profile `jarvis`) | the same image as `egress` | 4751 in `guard`'s network, reached from `jarvis_out` alone | its 4751 answers | 0.1 core, 64 MB, 64 processes | none | none |
| `jarvis_reader` (profile `jarvis`) | built from `deploy/jarvis-reader/Dockerfile`: gnomcp 0.11.0 (its release image, by digest), a bridge and a relay in Go (standard library alone) | 8083 on its address of `reader` (`READER_ADDRESS`), the network it shares with jarvis alone | its 8083 answers | 0.2 core, 160 MB, 48 processes | none, a 32 MB tmpfs | none |
| `egress_reader` (profile `jarvis`) | the same image as `egress` | 4753 in `guard`'s network, reached from `reader_out` alone | its 4753 answers | 0.1 core, 48 MB, 32 processes | none | none |
| `link_reader` (profile `links`) | built from `deploy/link-reader/Dockerfile`: its package and the two it imports, on distroless Node 24 | 8084 on its address of `links` (`LINK_READER_ADDRESS`), the network it shares with the server alone | `GET /health` on its address | 0.2 core, 256 MB, 48 processes | none | none |
| `egress_links` (profile `links`) | the same image as `egress` | 4754 in `guard`'s network, reached from `links_out` alone | its 4754 answers | 0.1 core, 48 MB, 32 processes | none | none |

All twelve have a read-only root with `/tmp` in memory, no new privilege, logs rotated at 3 × 10 MB,
and every capability dropped, except `guard`'s `NET_ADMIN`; `ergo`, `server`, `egress` and `egress_jarvis` run as
65532 (`egress_reader` and `egress_links` too), the user the auth socket's volume belongs to, `jarvis` as 65533, `jarvis_reader` as 65531
and `link_reader` as 65530, users of their own.

- `web` sits on `inside`, an internal network with no way out and no gateway, so it reaches no
  address of the host either.
- `guard` holds the only network that lets out, and `tailscale` shares it. Before anything else
  runs there, it loads its rules: web's port, Docker's DNS, then every private, local, carrier
  and reserved address refused, so neither reaches the host, its LAN or a tailnet; then public
  TCP 80 and 443 and UDP, which Tailscale needs. IPv6 is closed. When Compose restarts `guard`,
  `tailscale` restarts with it; when Docker restarts `guard` on its own, `tailscale` keeps a
  network with nothing in it, which fails closed, until `docker compose ... restart tailscale`.
- Funnel hides the host's address: the public name leads to Tailscale's relays, never to the host.
- `web` holds a fixed address on `inside` (`WEB_ADDRESS`, in `INSIDE_SUBNET`), the only one Ergo
  (`proxy-allowed-from`) and `server` (`TRUSTED_PROXY`) believe about a visitor's address; it sends
  the PROXY protocol's address on, overwriting the client's, and never the demo's password.
- `egress` (smokescreen) lets the server reach `api.openai.com`, `api.coingecko.com` and the default universe's RPC host (`deploy/egress/acl.yaml`, one
  file the test reads too; the RPC's host is `app/data/universes.json`'s default, and `server/src/prices/universes.test.ts` fails when they differ) and refuses an address that resolves to a private one; it sits in
  `guard`'s network, so the kernel's rules hold whatever it resolves. The server finds it by
  `HTTPS_PROXY` and `NODE_USE_ENV_PROXY`; ops, with no `guard`, names its own in `EGRESS_PROXY`. The list also
  holds the mainnet's node, `rpc.gno.land`, where the door reads an account's name (D120).
- `jarvis` (10j) is off unless `JARVIS=on` in `deploy/.env`, the one setting the server's door reads too: off, it
  serves its budgets and answers `off`, reads no key and reaches no gnomcp. It, `jarvis_reader` and the two ways out sit in the profile
  `jarvis`, out of the demo's (10j-4): started only with Jarvis switched on, `--profile demo --profile jarvis`. Ops, who
  run the file without the demo's profile, start it by its name, `docker compose up -d jarvis`, which switches its
  profile on, with their own way out in `JARVIS_EGRESS_PROXY`; `--profile jarvis` alone is refused, as `egress_jarvis`
  needs the guard. Switching it on has an order (below, "Switching Jarvis on"): the door's key, the evals, then `JARVIS=on`.
  It listens on its fixed address of
  `jarvis` (`JARVIS_ADDRESS`, in `JARVIS_SUBNET`), a network it shares with the server alone; its `/ask` and
  `/budgets` ask no session, so that network is their wall (10i). It goes out through `egress_jarvis` alone, a
  smokescreen of its own on 4751 in `guard`'s network, which takes 4751 from `jarvis_out` alone and sends that network
  nothing but its replies: Anthropic's API, each universe's node and gnoscope (`deploy/egress/jarvis-acl.yaml`).
  The indexers left that list (10u-g2): only gnomcp read them (`gno_history`, `gno_activity`, `jarvis/src/gnomcpTools.ts`,
  `indexerReads`), and gnomcp runs in the reader now. The lists never mix. Its stop waits 35 s, its drain's 20 and 15 more.
- `jarvis_reader` (10u-g2, D13987) is gnomcp alone, in a container of its own: no Node, no secret, no volume but a tmpfs,
  a user of its own (65531), `x-locked`, a network shared with jarvis alone (`reader`, `READER_ADDRESS` in
  `READER_SUBNET`) and one of its own to the guard (`reader_out`, `GUARD_READER_ADDRESS` in `READER_OUT_SUBNET`).
  gnomcp speaks over stdio, so the reader's bridge (`deploy/jarvis-reader/main.go`) serves it on 8083, one gnomcp a
  connection, two at most (jarvis keeps one, a restart overlaps by one), its environment two names alone, ended with the
  connection, its audit cut to tool, result and duration before it reaches the reader's log; jarvis reaches it by
  `JARVIS_GNOMCP_ADDRESS`. gnomcp ignores `HTTPS_PROXY` (below), so all four chain hosts are named in `/etc/hosts` to one
  loopback address (127.0.0.2), where a relay reads the TLS hello's server name (nothing else), refuses a name off
  `READER_HOSTS` and opens a CONNECT tunnel to the rest through `egress_reader`, a smokescreen on 4753 in `guard`'s network
  that takes 4753 from `reader_out` alone: the TLS stays between gnomcp and the host, and the list
  (`deploy/egress/reader-acl.yaml`) lets out each universe's node and indexer, never Anthropic's API, never a private
  address. A host added to the universes is added in four places, in any order: `gnomcp.toml`, `reader-acl.yaml`, the
  reader's `READER_HOSTS` and its `extra_hosts`; `jarvis/src/config.test.ts` derives the hosts from
  `app/data/universes.json` and fails when one of them differs. The reader's caps (0.2 core, 160 MB, 48 processes; its
  way out 0.1 core, 48 MB, 32 processes) are a ceiling chosen for two gnomcp, not measured on a running stack:
  `deploy/test.sh --demo` checks the four containers of Jarvis together under 656 MiB and 0.7 core.
- `link_reader` (slice 13, D13919) fetches a public page's head and picture for a chat line's card, so it holds nothing worth taking:
  no secret, no volume, a read-only root, a user of its own, and two networks, `links` (shared with the server alone, which asks it
  `POST /card`) and `links_out` (its way out). It has no DNS: it goes out through `egress_links`, a smokescreen on 4754 in `guard`'s network
  that takes 4754 from `links_out` alone, lets any public https host out (`deploy/egress/links-acl.yaml`, `action: open`) and refuses
  every private answer; `guard`'s rules refuse every private range on each packet too, and the reader refuses a non-global address itself
  (`link-reader/src/address.ts`). The server stays off the reader's network but for its API, which listens on its address of `inside`
  alone. The reader serves 2 pages at once (`LINKS_MAX`), decodes one picture at a time, and its 256 MB is measured (210 MiB at the
  2,000,000-pixel cap, `link-reader/src/memory.test.ts`). It is in a profile of its own, out of the demo's cap, as Jarvis: its 0.3 core
  and 304 MB (reader and way out) come on top. "Switching the link cards on", below.
- The server's API listens on 8080 at its own address of `inside` alone (`SERVER_ADDRESS`, in `INSIDE_SUBNET`), so
  jarvis's network reaches no port of the server's (10j's review, V12); web and the tests ask it as `server:8080`.
  The guard finds `jarvis_out` by its own address there (`GUARD_JARVIS_ADDRESS`, in `JARVIS_OUT_SUBNET`) and waits for
  no jarvis: without it, the demo runs, and the door answers `off` while Jarvis is off, never asking jarvis; switched
  on without jarvis's profile, or with a jarvis that fails to start, the door answers `not_ready` (503) (10l-1).
- The admin API (10g) listens on 8082 at the server's address of `admin` (`ADMIN_ADDRESS`, in `ADMIN_SUBNET`), a
  network nobody else joins: the admin console joins it (slice 12); its sites are `ADMIN_ORIGINS`.

## Before the first start (once)

1. A tailnet made for the demo, with MagicDNS and HTTPS certificates on (Funnel needs both).
   Funnel's certificate publishes the machine's and the tailnet's names in public certificate
   logs, so a tailnet of its own keeps every other name out of them; and the demo is alone there.
2. In that tailnet's policy file, the tag, Funnel for it, and nothing it may reach:

   ```json
   "tagOwners": { "tag:gnoworld-demo": ["autogroup:admin"] },
   "nodeAttrs": [{ "target": ["tag:gnoworld-demo"], "attr": ["funnel"] }]
   ```

   A new tailnet's policy lets every device reach every other: replace its default rule with
   `"acls": []`, an empty list (with no `acls` section at all, Tailscale allows everything), and
   let no grant name the tag as a source or a destination, nor `*`, which would let the demo
   reach every device.
3. `mkdir -m 700 deploy/secrets` (a fresh clone has none). A single-use auth key with that tag
   (Settings, Keys), into `deploy/secrets/ts_authkey`, then `chmod 644` it: on Linux, Tailscale's
   root, with every capability dropped, cannot read a file another user owns; the folder keeps
   the host's other users out, and the key is spent at the first login.
4. The demo's password: make a strong one (`openssl rand -base64 24`), then
   `htpasswd -cB deploy/secrets/demo_htpasswd team` (`htpasswd` comes with macOS, and with
   `apache2-utils` or `httpd-tools` on Linux), then `chmod 644 deploy/secrets/demo_htpasswd`:
   nginx reads it as its own user, and it holds a hash, not the password.
5. `cp deploy/.env.example deploy/.env` and set `ORIGINS` to the app's own origin,
   `https://<machine>.<tailnet>.ts.net` (required: Ergo refuses a WebSocket from any other site,
   and the server any POST); the machine's name and the internal network's addresses may change there.
6. Slice 3's secrets, each with `chmod 644`: `openssl rand -hex 24 > deploy/secrets/ergo_oper_password`
   (the bot's operator password: 48 characters, Ergo takes it on any listener), `openssl rand -hex 32 >
   deploy/secrets/log_pepper` (the logs' hashing key), and OpenAI's key, one line, in
   `deploy/secrets/openai_api_key`.
   Slice 10's: Anthropic's key, one line, in `deploy/secrets/anthropic_api_key`, a key of a workspace with its own
   spend limit (ADR-0002 §5); with Jarvis off, any line (Compose wants the file, jarvis reads it only when on).
   The door's key, which the server and jarvis alone hold (10u-g2): `openssl rand -hex 32 > deploy/secrets/jarvis_door_key`,
   then `chmod 644 deploy/secrets/jarvis_door_key`. Make it before the next `up`, Jarvis off or on: the server and jarvis read
   the file whenever Compose names it, which is always, and refuse to start on no file or a key under 32 bytes. A
   placeholder line like Anthropic's key's stops the whole stack, the server included.
7. On Linux, a clone made with a umask of 077 leaves `deploy/guard` and `deploy/tailscale`
   unreadable to the containers: `chmod -R a+rX deploy/guard deploy/tailscale`.

`deploy/secrets/` is ignored by git, left out of every build (`.dockerignore`) and closed to
Claude Code (`.claude/settings.json`). Nothing in the repository names a host, an address or a
tailnet; keep it so.

## Run, test, stop

| What | Command, from the repository's root |
|---|---|
| Start, or rebuild after a merge | `docker compose -f deploy/compose.yaml --profile demo up -d --build` |
| The same with Jarvis switched on (`JARVIS=on`) | `docker compose -f deploy/compose.yaml --profile demo --profile jarvis up -d --build` |
| The same with the link cards switched on (`LINK_CARDS=1`, "Switching the link cards on") | `docker compose -f deploy/compose.yaml --profile demo --profile links up -d --build` |
| Test the stack: web, the guard, Ergo, the server and the way out (no secret needed) | `sh deploy/test.sh`, from the commit you reviewed (below) |
| Test that each check catches its fault | `sh deploy/test.sh --mutants`, from the commit you reviewed (below) |
| Test the running demo | `sh deploy/test.sh --demo`, which asks for the password |
| Its logs, jarvis's with them if it runs | `docker compose -f deploy/compose.yaml --profile demo --profile jarvis --profile links logs -f` |
| Stop, jarvis with it if it runs | `docker compose -f deploy/compose.yaml --profile demo --profile jarvis down` |
| Stop, with the link reader too when the cards are on | `docker compose -f deploy/compose.yaml --profile links --profile demo --profile jarvis down` |
| Remove it all | `docker compose -f deploy/compose.yaml --profile demo --profile jarvis down -v`, then delete the machine in the admin console (with the cards on: `--profile links` first, as above) |

Run `sh deploy/test.sh` after every change to `deploy/`, and when the app changes what it serves
(a new kind of file, many more files on a first load); `--mutants` in `/pre-merge` of a branch
that changes `deploy/`. App code alone needs neither: the gate's journeys test it.

The tests run on the host (macOS or Linux), outside Claude Code's sandbox, which refuses Docker's
socket. Their output names the host's addresses and ports: never commit it, nor paste it in public.

### Run test.sh from the commit you reviewed

`deploy/test.sh` runs with Docker's socket, which is root on the host, and every session can write a
worktree's `deploy/` (F204) and the shared `.git`'s objects: git does not check an object against its
name as it reads it, so even `git archive <sha>` writes a planted object's text (F152's class,
F4921). So run it neither from a worktree nor from a bare archive, but from a copy of the commit you
reviewed whose commit and files hash to that commit's name. Paste this in your own Terminal, `sha`
set to that commit (read it once, right after you reviewed it: a session can move a branch), and
add `--mutants` to the last line when the branch changes `deploy/`:

```sh
( repo=~/Server/gnoworld sha=$(/usr/bin/git -C ~/Server/gnoworld rev-parse --verify '<the commit you reviewed>^{commit}')
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 PYTHONNOUSERSITE=1 # no git config of the home folder, no python3 user site
/bin/mkdir -p ~/.local/state && d=$(/usr/bin/mktemp -d ~/.local/state/gnoworld-test.XXXXXX) &&
	/usr/bin/git -C "$repo" archive "$sha" | /usr/bin/tar -x -C "$d" &&
	[ "$(/usr/bin/git -C "$repo" cat-file commit "$sha" | /usr/bin/git hash-object -t commit --stdin)" = "$sha" ] &&
	(cd "$d" && /usr/bin/git init -q && /usr/bin/git add -A -f && [ "$(/usr/bin/git write-tree)" = "$(/usr/bin/git -C "$repo" rev-parse "$sha^{tree}")" ]) &&
	echo "test.sh runs from $sha, checked, in $d" && (cd "$d" && /bin/sh deploy/test.sh)
status=$?; [ -z "${d:-}" ] || /bin/rm -rf "$d"; exit "$status" )
```

It runs in a subshell of its own, so nothing it sets stays in the Terminal; it calls the system's
programs by path, and the copy holds a repository of its own, for test.sh's checks of what git
ignores, and is removed at the end. A run that prints no "test.sh runs from" line means the copy is
not that commit: run nothing more, and tell the chief. It takes about 15 s before test.sh. The copy
lives under `~/.local`, which Alexis's user settings of 2026-11-04 (7w2's `apply-7w2-user.sh`) close
to every session's file tools, as they close the programs test.sh calls (docker and its config,
python3's user site, sh's startup files); the sandbox closes it to commands. Without those settings,
anything on `PATH` outside `/usr/bin` and `/bin` is the sessions' to rewrite.

## When something goes wrong: cut the public URL

A flood meets the password, a limit per visitor (429 after a burst) and the containers' caps (2
cores and 1,504 MB in all, under the 2 cores and 2 GB the test holds as a ceiling: Docker stops a container at its
cap, not the host). Jarvis, under its own profile, is out of that cap (10j-4): 0.7 core and 656 MB more when on (jarvis, its
reader and their two ways out). The
limit lets one address 640 requests at once and 20 a second after that (F3665); `auth_basic` runs after it, so a
burst with a wrong password costs about 640 password checks, at the name in the file, before the 429s begin. To cut the public URL at once:

| Where | How | Back |
|---|---|---|
| On the host, in seconds | `docker compose -f deploy/compose.yaml --profile demo stop tailscale` | `... start tailscale` |
| From anywhere, a phone included | The admin console, Machines, the demo, Remove: its node key is revoked at once | A new auth key, then the table's Remove it all and Start, above |

## On another host

Nothing lives only on the host: the repository holds everything but the two secrets, which take
two minutes to make again. Clone it, write a new password file, make a new auth key (the old one
was used once, and the old machine's identity stayed in its `tailscale` volume), remove the old
machine in the admin console, so the new one keeps the name, then start it and test it.

## Known limits

Alexis, 2026-10-19: written here, each with its backlog row, not fixed in 1c.

- **A host whose own public address serves something.** The guard refuses private addresses,
  then lets out TCP 80 and 443 and UDP to the rest: on a host with a public address on an
  interface (a rented server), Tailscale's network would reach that address's services.
  `sh deploy/test.sh` fails there for TCP, and probes no UDP. Run the demo on a host behind a
  router, as at home or in an office (F202).
- **A restart of the whole host, or of Docker.** Docker restarts the three containers itself,
  without Compose's order: for a moment, Tailscale may run before the guard's rules are in, and
  if `web` is not up yet the guard stops, leaving Tailscale on a network with nothing in it.
  After such a restart, Compose's order again: `docker compose -f deploy/compose.yaml --profile demo
  --profile jarvis down`, then `up -d` with the profiles it ran with (the node key stays in its volume) (F203).
- **DNS through the router.** On a host whose resolver is its router or a LAN server, the guard
  lets that server's port 53 out, for Tailscale's name lookups: an exception to "every private
  address refused" (F205).
- **Open connections.** A visitor holds 32 requests at once, a WebSocket and a stream counting while
  they last, and a team behind one address shares them; `web` holds 4,096 connections, two for each
  held request (the visitor's and its upstream's): about 64 visitors at their 32 at once, by division;
  `deploy/test.sh` proves 16 at once (more than 1,024), the rest is a margin, and `web`'s 128 MB is not
  measured past those 512 held requests (F645). A connection
  that sends nothing more is closed, 10 s into its headers or its body, 15 s idle between requests
  (F208, sized before the first k6 run: 3n-b). Still a limit: a connection is counted for its visitor
  only once its headers are whole, and nginx takes back a silent or idle one when short, never one
  half-way through its headers; so one address opening about 410 such connections a second holds all
  4,096 and nobody else is served (F641, measured on nginx 1.30.6 at 64).

Slice 3, the login (3c; `docs/decisions.md`, 2026-10-22):

- **The login's settings.** `ORIGINS` names the site's origins (`https://host`, no path): unset,
  every login is refused. `TRUSTED_PROXY` names `web`, whose `X-Real-IP` gives the visitor
  (3e): unset behind `web`, every visitor shares one limit of 10 login calls a minute.
- **A flood of challenges.** At most 100,000 nonces wait at once; a visitor holds 50 at most, so
  2,000 addresses (IPv6 /64s, which one provider's /48 holds by thousands) can fill it, and then
  every new login is refused until theirs expire, 5 minutes after each. Logins already made
  keep working.
- **New accounts are free.** An address costs nothing, so a banned person comes back with a
  new one; the limit of new accounts per visitor only slows a farm (decision 144).
- **Ten tokens an account.** An account keeps its 10 newest logins; an eleventh logs the oldest
  device out. Accounts are free, so the tokens are bounded by the accounts, ten each, not by a
  fixed number (F435).
- **A logout or a ban leaves the IRC side for a while** (3d). A ticket minted before the logout logs in
  until its 60 seconds end, and a connection already open lasts until it drops: only new tickets are
  refused. A moderator's revoke that cuts live connections is slice 12's.
- **Ergo's socket.** `AUTH_SOCKET` names the socket Ergo's auth script dials; unset, Ergo lets nobody
  log in, guests still read. A socket left by a crash is removed at the next start, never a file. The
  sandbox binds no Unix socket, so the tests reach the same handler over TCP: the bind itself is proven
  by 3e's operator tests.

Slice 9h, the first signals (`docs/decisions.md`, D210 to D218):

- **First to chart.** The first logged-in account to open a world is recorded once, in `first_signals`
  (its own migration), with the first line of a public room that passed moderation (first words).
  Every listed world can be charted (D210; the journeys' server names `govdao` alone, D218). An account's
  chart calls are 20 an hour, a refused one counted (D211).
- **A restart** tells the stream every first the database holds, so a page opened after it still
  names who charted; a banner's day is counted from the record's own time (D213).
- **Failed IRC logins** count per visitor, 10 a minute, never per account; lines Ergo sends with no
  address share one count, so a burst of them refuses all such lines for a minute (logged as `limit`).
- **A relayed login.** Another site, or its server, can ask for our text, show it to a person
  and send the signature itself, so the cookie lands with it. The server cannot tell; only a
  wallet that shows the requesting site and refuses another domain's text can, which slice
  4's first merge checks against the real Adena. The 90-day cap and logout bound it.

Slice 3, the content security policy (3f):

- **One policy, built.** The build writes it from its pages' inline scripts, so a page changed by
  hand on a host breaks until the next build; nginx serves `/_headers`, the policy itself, as a
  file (it is public anyway). A browser that does not read CSP 3's `'self'` as the page's `wss:`
  refuses the chat's WebSocket: slice 4's first one checks Firefox and Safari.

Slice 3, the bot's link and the rooms (3h):

- **The link's settings.** `ERGO_HOST` and `ERGO_PORT` name Ergo's internal listener (127.0.0.1:6667
  by default); `ERGO_OPER_PASSWORD_FILE` holds the operator's password, one word of printable ASCII,
  32 to 72 characters (bcrypt keeps 72 bytes, so Ergo's start refuses more; the server alone takes 256); Ergo's
  start refuses any other shape, a blank line before the word included (F706). Unset, the server keeps no link: rooms exist, nobody's activity counts.
- **Rooms stay.** A world removed from the roles file keeps its room and history; removing one is a
  moderator's act (3l).
- **The bot's account.** The bot logs in by SASL as the account `gnoworld`, whose nick Ergo keeps for
  it (the server's auth takes the operator's password for that one name). After a link drops silently,
  its next connection joins the old session, which Ergo holds until its own ping timeout, as a second
  session of the account (multiclient). A refusal of the nick comes from a guest who took it before the
  account first logged in (a new Ergo database): the link logs `irc_refused` (`nick`), tries again, and
  raises the alert `irc_nick_taken` at the third in a row. A refused login logs `irc_refused` (`sasl`).
- **The inside network is exempt from Ergo's connection limits** (`INSIDE_SUBNET`, F720): the server's link
  and web's own connections never meet the 16-at-once or the 32-in-10-minutes limit, so a crash loop of the
  server cannot lock the bot out. A visitor is limited by the address web passes, never one of that network.
- **Ergo logs no address** (`-connect-ip`, slice 3's max review): its refusals by ip-limits go unlogged
  with it, so a visitor behind a shared address who meets the limit leaves no trace (slice 4).

Slice 3, the check (3i):

- **Its settings.** `OPENAI_API_KEY_FILE` holds OpenAI's key (one word, 32 characters at least);
  unset, nothing leaves the server, every message is unchecked and the alert says so at the start.
  The thresholds that replace OpenAI's own flag and the hours an account counts as new are the server's defaults: compose does not
  forward `MODERATION_THRESHOLDS` or `NEW_ACCOUNT_HOURS`, so `deploy/.env` cannot set them
  ([CONFIGURATION.md](CONFIGURATION.md), section 3).
- **What reaches OpenAI.** A message's text alone, with the model's name: no account, no room.
  The privacy policy must say so before a public launch (decision 154).
- **Bare links pass the link rule.** A link counts with its scheme or `www.`; `bit.ly/x` does not.
  Each scheme counts, however the links are joined: a link inside another's address is one more.
- **Banned words** match as whole words, but a word of a script written without spaces (Chinese,
  Japanese, Thai, Lao, Khmer, Myanmar) matches anywhere in a line.
- **A message caught in a restart** stays `pending` in the verdicts; 3j's catch-up checks it again.
- **OpenAI's rate limit.** One line a request, and OpenAI caps a key's requests a minute by its account's tier
  (`omni-moderation-latest`: 250 on Free, 500 on Build, 2,000 on Launch, 5,000 on Grow; its model page, read
  2026-10-24): past it, its refusals count as down (logged `moderation_unchecked` with `rate_limited`, an outage's
  `down`), five open the breaker for 30 s, and lines pass unchecked meanwhile. The load run's 200 accounts, a line each every 5 s (2,400 a minute), left 1,810 of 2,200 unchecked
  (F692). Several lines a request is slice 4's (`docs/plans/backlog.md`), once OpenAI's rules for an array
  input are read from a live answer (its reference states no maximum and no order of the results). The
  checks run four at a time, so the ceiling is 4 over OpenAI's latency a second (about 13 lines a second
  at 300 ms, measured): a faster crowd waits in the queue, and past a full queue its lines pass unchecked,
  with the alert.

Slice 3, the bot acts and the stream (3j):

- **A mistaken hide stays.** Nothing restores a hidden line until slice 12's console (decision 146);
  the verdict's row holds its scores and thresholds, and its author got the reason.
- **The catch-up.** After a reconnect or a restart the bot asks each room's history from the time of
  the last line it settled in a row, 50 at a time, each page once the check's queue is empty. Not
  caught up: a line the full queue drops (the log says so), a line left unchecked by a provider
  outage (its previews wait), a room's first lines said while the link was down, and, past a full
  page of 50 lines all in one millisecond, the rest of that millisecond (each next page starts in its
  last line's millisecond, F542). A room's history is asked once Ergo says the bot is in it, one page at
  a time across the rooms, and a room's mark stays where its catch-up starts while it runs, so a live line
  checked meanwhile loses no older line (F707, F708). A room Ergo refuses the history of keeps its mark
  until the next start.
- **A line to a room's voices or operators** (`+#room`, STATUSMSG) is read as the room's line: checked,
  counted, struck, and its author muted as for any line. Ergo keeps no history of it (#959), so its REDACT is
  refused and the line stays on the screens it reached (F723). Ergo relays such a line by rank, so the bot reads
  it only where it holds the prefix's power: in the rooms it made (it is their operator), not yet in a members
  room it re-entered by SAJOIN after a restart, where it is a plain member (put to Alexis).
- **A hide Ergo refuses** raises the alert `redact_refused`; its verdict still says hidden, the line
  stays shown, and the author's notice and strike stand: the alert is for ops to look.
- **`GET /api/stream`** is public: 25 rooms a stream, 4 streams a visitor, 1,000 in all, a beat every
  15 s, a client 64 events behind dropped; each room's last 64 events are kept, which a new client gets
  and a client coming back gets after its `Last-Event-ID`. nginx must not buffer it (3e). A HEAD is
  refused with 405 and takes no place (F709).

Slice 3, the mute and the edits (3k):

- **Its settings.** 3 hides in 10 minutes mute an account in that world's rooms for 5 minutes; 50 mutes at once
  a world, the one ending first lifted early to make room (Ergo's list holds 100: 3b). These are the server's defaults
  (`MUTE_*`), which compose does not forward ([CONFIGURATION.md](CONFIGURATION.md), section 3). The roles file's team and trusted are never
  muted, their lines still hidden.
- **A line too fast** is the 21st of an account in a minute of Ergo's time: hidden, and a strike.
- **A message of several lines the bot cannot hold whole** (a part holding a CTCP's mark, or from another
  sender; more than 40 parts; a 17th open at once on its connection) is hidden as `unreadable` by the id of
  its opening line, before any rule or provider, and is a strike (G1, G5 of slice 4's green pass). Ergo
  relays and keeps such a batch first (its +C refuses only a part that starts with a CTCP's mark): a
  reader with draft/multiline sees none of it, a later one finds none in the history, but a client without
  the capability got the parts as lines, the id on the first alone, so its REDACT hides that first line only.
- **What the mutes table keeps:** a muted account's address in clear, its world and its end, while
  the mute lasts; the extban names it.
- **Known limits.** A mute is evaded with a new address (decision 144). A mute lifts within 10 s of its
  end (the timer). An edit of a line the bot never checked (one the full queue dropped, one said
  before the bot, one the catch-up missed) is hidden as `unknown_edit`, its owner unknown, and counts
  no strike (F549). The hides that brought a mute still count after it lifts: one more hide within
  the window mutes again.

Slice 3, the moderators' rooms (3l):

- **Who makes rooms.** A world's moderators and the team, through `POST /api/rooms`; 20 rooms a world
  besides its main one, archived rooms counted; 10 an hour per account. Ergo lets no one else create a
  channel (`operator-only-creation`).
- **Archiving** makes a room read-only (`+m`) and unlisted (`+s`); its history keeps its retention.
  Nothing removes a room: an operator does it by hand in Ergo, then in the `rooms` table.
- **The alert `unknown_room`** names a channel in Ergo the server did not make: an operator made it.

Slice 3, rooms by role (3m):

- **The roles file's rooms.** Each world may list `groups` of accounts and `rooms`, each `#<world>` or
  `#<world>/<name>` with a `type`: `open`, `announcement` (its moderators and the team speak),
  `accounts` (no guest joins), `members` (its `readers` group joins and speaks) or `members-write` (its
  `readers` join, its `writers` speak), and `hidden` to keep it out of the lists. A change waits for a
  restart. The server makes the file's rooms at start.
- **The roles file's sections (4b).** Each world may list `sections`, an ordered list of a `name` (1 to
  64 characters, once in the world) and the `rooms` it holds (the world's own room ids, each in one
  section at most, a moderator's room included; 50 sections and 500 rooms a section at most). `GET
  /api/rooms?world=<slug>` answers a reader the rooms it may see in that order, then the world's other
  rooms in a section named `null`: a reader sees no section it sees no room of. A change waits for a
  restart.
- **Restricted, not encrypted.** A members room keeps guests and strangers out in Ergo, for every
  client, but its lines are read by the server, the bot and Ergo's operators, and stored in Ergo's
  history like any other. Its lines are never sent to OpenAI: the world's rules alone check them.
- **100 accounts a members room.** Its readers, its writers, the world's moderators and the team,
  each once, are Ergo's invite list, which holds 100 (`chan-list-modes`): a file past it stops the
  server. Nobody is invited at login: Ergo invites only a connected client.
- **The reconciler.** At each connection, every minute and when someone joins, the bot reads each
  room from Ergo (its flags, its invite list, who is in it) and sends only what differs: an
  operator's change is undone, anyone on a members room no longer on its list is put out (`KICK`),
  every power above voice is taken from anyone but the bot. Its flags go with its JOINs, before any
  read, since Ergo keeps a channel's history across its own restart. It logs `room_reconciled` for
  each room it changed.
- **The alert `room_opened`** names a room the reconciler took out of invite-only: the roles file made
  a members room open, or no longer names it. Its history is then open to whoever joins.
- **A room that refuses the bot** (invite-only, accounts only, or an operator's limit, key or ban) is
  joined by `SAJOIN`; Ergo's oper log then names it.

Slice 3, the server's retention (3n):

- **The verdicts** (ids, rooms, hashed accounts, categories and scores, never a text) are kept 180 days
  and 150,000 at most (about 1.2 KB each with their indexes, 176 MB), the oldest going first; a verdict
  still waiting on OpenAI stays. A job runs at start and every five minutes, removing 500 rows at
  most a run (6 to 29 ms measured on a 190,000-row file on disk; 10,000 rows in one run held the server's
  event loop about 400 ms, F710), and runs again at once while a backlog is left, the server free
  between runs. A verdict removed by the cap before its 180 days makes an edit of its line unknown:
  the edit is hidden (`unknown_edit`), with no strike.
- **The pins** end with Ergo's history: the same job removes each pin whose line is more than 90 days old
  (Ergo's `expire-time`), a link that stays up included, since the re-read of a pin runs only when the bot
  joins a room.
- **The search index** (slice 13; `lines`, `line_edits` and a full-text table in the server's database): the lines moderation let through,
  2,048 a room, 400,000 in all and 90 days (Ergo's `expire-time`), the oldest going first at the same retention tick; a line leaves with its
  REDACT. SQLite's `secure_delete` is on for the connection, so a removed line's text is zeroed in its pages. No rebuild of it from Ergo's
  history is written (read for: none found in `server/src/search/`).
- **The alerts** `verdicts_near_cap` and `database_near_cap` fire once when the verdicts reach 80% of
  their cap, or the database's used pages 80% of 256 MB, and again only after a fall below. The
  database's file does not shrink: freed pages are reused, and its `-wal` file is not counted. A table
  held at its cap, the cap removing verdicts before their 180 days, says nothing more after its one
  alert (put to Alexis: an alert of its own).
- **The other stores** purge themselves (nonces, tokens, tickets, mutes) or hold a row a room or an
  account; the accounts' addresses are kept for the new-account rule, until slice 12's erasure path.
- **Ergo's volume** is measured by the server, read-only (`ERGO_DATA`, the volume mounted at `/ergo`
  with `:ro`), against `ERGO_DATA_MB` (1024, `deploy/.env`): the alert `ergo_volume_near_cap` fires once
  at 80% and again only after a fall below, and `ergo_volume_unreadable` once while the folder cannot be
  read. It is measured every five minutes, never during a backlog's runs. Ergo deletes history by age
  alone (its one `expire-time`, 90 days), not by size: at the alert, give the disk room and raise
  `ERGO_DATA_MB`, or shorten `expire-time` in `deploy/ergo/ircd.yaml.tmpl` and restart Ergo; whether
  Ergo then frees the space at once is not verified.
- **The prices** (`MARKETS_FILE`, `/markets/markets.json` in the `markets` volume, 5l): every five minutes, counted from
  the end of the last read, the server asks CoinGecko's keyless `api.coingecko.com` (through the egress proxy, which
  lets that host out by its full name) for GNOT, ATONE and BTC and writes `markets.json` by renaming a temporary file.
  Any failure keeps the last file and logs `{"event":"prices_failed","error":"<kind>"}`, the kind one of `rate_limited`
  (a 429: the free tier's limit is per IP and shared, so a run of them means another user of the address),
  `status`, `timeout`, `unresolved` (no address for a name: the way out's, before it starts), `refused` (nothing listening there yet),
  `proxy` (the way out refused the host, or could not reach it), `request` (a fault whose cause has no name), `too_large`, `not_json`,
  `shape`, `no_price` or `write` (the volume): never the answer, nor an error's message. One that reached nothing (`unresolved`,
  `refused`) or whose cause has no name (`request`) is asked again 15 s later, then twice as long for each such failure in a row, up to
  the five minutes: the stack starts the server before its way out (F4872).
  A file that stops changing means the failures repeat in the log; `updated` in the file is the time of the last good read.
  With `UNIVERSES_FILE` (`/app/app/data/universes.json`, copied into the image) the same read also asks the default universe's RPC
  for `/status` and writes the latest block's `height`, `time` and `host` as `block`, which the home draws: no visitor's browser asks a
  chain. A failed height leaves `block` out and logs `{"event":"height_failed","error":"<kind>"}`, never what the answer held; a data
  file that is bad stops the server at boot, naming the file. Changing the default universe's RPC means changing `acl.yaml` with it.
- **The worlds** (`WORLDS_FILE`, `/markets/worlds.json`, served at `/worlds.json`, 7c): with `UNIVERSES_FILE`, every half hour from
  the end of the last pass the server reads the default universe's realm list (`vm/qpaths`), each new package once (`vm/qdoc`,
  `vm/qfile`), each new deployer's name, and every call of the chain from the universe's indexer, by pages of 2,000 transactions in
  height order (7k3), one call at a time, each started at least a quarter-second after the last began, and writes the worlds by
  renaming a temporary file, at most 4 MiB; each pass that wrote logs `{"event":"worlds_written","ms":<its length>}`. Beside it the same pass writes their count
  (`/markets/worlds-count.json`, served at `/worlds-count.json`, 7n2): the file's universe and time and the worlds the cosmos draws
  with the Earth, which the home's hero reads, so a phone asks nothing of the cosmos before View in space. Both temporaries are written
  before either is renamed: a failed write keeps both last files and logs `write`. A failed list keeps the last file and logs
  `{"event":"worlds_failed","error":"<kind>"}`, and a pass whose list reached nothing (`unresolved`, `refused`) runs again 15 s later,
  then twice as long for each such pass in a row, up to the half hour (F4872: Compose starts the server before its way out); a list the
  chain cuts at its limit is read by prefix, up to 2,000 requests. A world
  keeps its first 512 realms, and a file past the byte cap loses the lists of its heaviest worlds, then whole worlds: each logs
  `worlds_shed` with `error` one of `realms`, `lists` or `worlds`. A fault of any indexer request (the network, an answer of the
  wrong shape, a page past 4 MiB even at one transaction, more than 500 requests) logs `worlds_indexer_failed` once and every realm
  keeps its earlier counts (null on a first pass): none is counted from half the chain; a read past 32 MiB of answers gives up as
  `too_many`. A call that names no realm is left out and one whose caller is no address is counted with none; either logs
  `worlds_history_skipped` once. The kinds
  are `unresolved`, `refused`, `proxy` and `request` (as the prices'), `timeout`, `status`, `rate_limited`, `too_large`, `too_many`,
  `not_json`, `shape`, `chain_refused`, `empty`, `write` and `stopped`, never what an answer held. The indexers' hosts are on the way out by name (`acl.yaml`); the first live proof
  of the realm list's and `vm/qdoc`'s answers in the stack is `deploy/test.sh`, which Alexis runs: it waits for the running job's own
  first pass, asks for a realm with a deployer, functions and counts, and prints the job's log lines. The indexer's queries are those
  onyx-1's answered on 2026-11-04 (`server/src/worlds/onyxIndexer.json`); 7c's per-realm filter was refused there (422), so no count
  was read before 7k3. A first pass of onyx-1's 767 realms, measured outside Docker on 2026-11-04: 1,628 calls in 13.2 minutes and no
  count before 7k3; 1,634 calls (7 of them the indexer's) in 7.0 minutes after, every realm counted.
- **The previews** (`PREVIEWS_FILE`, `/markets/previews.json`, served at `/previews.json`, 8f): with `UNIVERSES_FILE` and
  `OPENAI_API_KEY_FILE` (the server refuses to start with the file named and either missing), at start and then every six hours from
  the end of the last pass, the server reads the home page (`vm/qrender` of `<path>:`) of every realm the default universe's hubs list in
  `app/data/hubs.json`, 32 at most, through the default universe's RPC (already on the way out: no host is added for it), one call at a
  time a quarter-second apart, each within 10 s and 64 KiB. It keeps a page's first 4,096 bytes, cut at a line's end, has OpenAI's
  moderation read exactly that text with its thresholds, and writes the captures that passed by renaming a temporary file, 1 MiB
  at most; each pass that wrote logs `{"event":"previews_written","ms":<its length>}`. A page the check hides, that the chain says is
  gone, that is too large, empty or no text has no capture; a page whose read failed on the way, whose read the chain refused, or that the
  check could not read keeps its last checked capture, with its own time; each logs `{"event":"previews_skipped","error":"<kind>"}`, the
  kind one of `hidden`, `unchecked`, `empty`, `unresolved`, `refused`, `proxy`, `request` (as the prices'), `timeout`, `status`,
  `rate_limited`, `too_large`, `shape` or `chain_refused`. A
  pass none of whose reads reached anyone (`unresolved`, `refused`: the way out not there yet) writes nothing, keeps the last file, logs
  `previews_failed` with that kind and runs again 15 s later, then twice as long for each such pass in a row, up to the six hours
  (F4872); one read that reached the chain, or whose cause has no name (`request`), makes it a pass as any other. A pass that cannot write logs `previews_failed` (`write`, `stopped`, `shape`, `too_large`, `internal`) and keeps the
  last file. No
  capture, no preview: a world's plate and a chat line linking that realm's home on the default universe's gnoweb show the capture, and
  a line only once its own check passed; the browser asks the site's file alone, never the address a line holds. To take a page's
  capture down at once, remove its realm from `hubs.json` and redeploy: the next pass drops it, and so does a restart.
- **The load runs** are the operator's: `sh deploy/k6/run.sh` (Docker) builds a stack of its own, in the
  project `gnoworld-load`, and refuses to start while the demo runs on the host. From inside its network,
  each scenario's numbers: every account logging in at once (`ACCOUNTS`, 200), guests in a world's room
  (`CROWD`, 2,000), the rooms' streams (`STREAMS`, 1,000), the accounts' lines every 5 s (with
  `OPENAI_API_KEY_FILE`, OpenAI's checks of them); the containers' peak memory, processes and CPU, their
  restarts and Ergo's last fatal lines, Ergo's volume before and after, the verdicts and the server's errors.
  The numbers are in slice 3's plan (3n's As built): Ergo holds 2,000 guests joining one room at 341 MiB and
  311 threads, under its 512 MiB and 1,024, but at its 0.4 core, so the last of them waits up to a minute to
  be in; the runs go straight to the server and Ergo, so `web`'s limits are not theirs to size.
- **Logs** have a size and a count (3 × 10 MB a container), no age: decision 154's 14 days hold only
  where ops' log backend sets them.
- **Every alert**, each a log line `{"event":"alert","error":"<name>"}` that ops matches:
  `verdicts_near_cap`, `database_near_cap`, `ergo_volume_near_cap` and `ergo_volume_unreadable` (above);
  `moderation_off` (no key: every message unchecked), `moderation_refused` (OpenAI refused the key or the
  call), `moderation_shape` (an answer of an unknown shape), `moderation_breaker` (checks paused 30 s
  after five failures), `moderation_backlog` (a check waits two minutes or more), `moderation_queue_full` (a
  message left unchecked, the queue full); `card_shape` (the link reader answered a shape no schema takes),
  `card_backlog` and `card_queue_full` (the link cards' queue, as the two above); `irc_nick_taken` (above); `redact_refused`, `unknown_room`
  and `room_opened` (the rooms, below); `presence_write` (who is here could not write its history, or its
  messages' (7t3), beside the database: rising and Trending by the rooms stay dark until the folder takes it);
  `trends_write` (the worlds job could not write the chain's habits, trends-transactions.json and
  trends-addresses.json, beside the database: Trending by the chain loses what the pass learned until the folder
  takes it). `scripts/check_docs.py` keeps this list whole.
- **Before a public launch** (decision 154): the privacy policy, which says what reaches OpenAI and what
  is kept and how long, and the erasure path (slice 12) are blockers.

Slice 3, the stack (3e):

- **The operator's password works on any listener.** Ergo checks an OPER by its password or a client
  certificate, never by the listener it comes through (irc/handlers.go, v2.19.1), so the bot's
  password would work through `/ws` too: it is 48 random characters (Ergo's start refuses one under
  32, F621), and Ergo answers one OPER a connection every 10 seconds. A certificate for the bot alone would close it (a later slice).
- **One time for all history.** Ergo keeps rooms' and messages' history the same 90 days
  (`history.restrictions.expire-time`); decision 154's 30 days for direct messages cannot be set
  apart, so direct messages are not stored at all (`persistent.direct-messages: disabled`) until
  slice 4 makes them a product. History fills the `ergo` volume, which has no quota.
- **A thousand rooms a client, guests too.** Ergo has one `max-channels-per-client` for every client
  (its config.go:1937), and the bot needs 1,000: a guest may join every world's room and receive each one's
  names. Load, not a hole; k6's crowd measures it (F631).
- **The way out has no port rule.** smokescreen v0.1.0 matches a host, not a port: plain HTTP to
  `api.openai.com` on port 80 is let out too, and meets OpenAI's redirect alone.
- **A restart of `ergo` or `server` by Compose restarts `web`**, which reads its upstreams' addresses
  once: the public URL answers nothing for those seconds. One Docker makes itself, after a crash, does
  not, nor does `egress` follow `guard` then: if `/ws` or `/api/` answer 502, or the checks stop
  reaching OpenAI, `docker compose ... restart web egress` (F622, beside F203).
- **The tailnet's policy stays closed.** In userspace mode, Tailscale hands a device's connection to
  the demo machine's own address on to `127.0.0.1`, so a device the policy let in would reach both ways
  out, the server's on 4750 (its six hosts, `acl.yaml`), jarvis's on 4751 (its four, `jarvis-acl.yaml`) and the reader's
  on 4753 (its four, `reader-acl.yaml`).
  `"acls": []` keeps every device out (F619; 10j's review, S8).
- **No backup in the demo** (ADR-0002): Ergo's accounts and history live in the `ergo` volume and the
  server's records in `server`; `down -v` removes both. To upgrade Ergo, change its tag and digest in
  `deploy/ergo/Dockerfile` and `VERSION`, then `sh deploy/test.sh` from the commit you reviewed (in "Run, test, stop") before
  `up -d --build`.
- **`web`'s fixed address** is in `INSIDE_SUBNET`: a host with another network in that range refuses
  to start the stack (Compose names the overlap); set both in `deploy/.env`.

Slice 4, pins and what an account keeps (4d):

- **Pins live in the server's database** (the `pins` table), not in Ergo, which writes a channel's metadata back for
  registered channels alone and ours are not (`unregistered-channels: true`). A world's moderators and the team pin,
  10 a room, 30 pin or unpin requests a minute an account; the server reads the line from Ergo by its id
  (`CHATHISTORY AROUND`), never from what the page sent, and keeps its text, author and time.
- **A pin ends with its line.** An author's delete, the bot's hide (Ergo sends the bot each REDACT of its rooms,
  `draft/message-redaction`) and the author's edit drop it. Each time the bot is back in a room, its pins there are
  asked of Ergo again and those Ergo no longer holds are dropped, so a pin also ends with Ergo's history (90 days,
  above). A question Ergo does not answer keeps its pin; a re-read that throws logs `pins_unchecked` (no alert).
- **Saved messages and "Mark unread" are on the reader's device** (ADR-0002) and nowhere on the server: nothing
  to back up, and a cleared browser loses them.

- **gnomcp reaches the chain through the reader's relay** (10j, F5296, question 10j-2; built by 10u-g2). gnomcp never
  sees `HTTPS_PROXY`, and its node reads go through gno's own RPC client (tm2), which dials the node itself and would
  ignore the proxy anyway, so the reader names each chain host to a loopback address in `/etc/hosts` and a relay there
  tunnels it through `egress_reader` (see `jarvis_reader` above). Proven by `deploy/test-jarvis.sh` (gnomcp's reads
  through the reader), with its mutants.
- **gnomcp no longer runs where Anthropic's key is** (10j, question 10j-3, closed by 10u-g2). It is the reader's, a
  container with no secret and no volume, so it cannot read `/run/secrets/anthropic_api_key`, which is jarvis's alone;
  jarvis's image holds no gnomcp. What the reader can still do is read the public chain: its worst case is a read of
  any public realm, through the four hosts of its list.
- **The door's key** (10u-g2). The server sends it to jarvis in one header (`x-jarvis-key`) and jarvis answers 401 to
  every request without it, on every route, before it reads a body. Both read `jarvis_door_key`; the network's wall stays.
- **A model call past a minute of silence** (10j). `egress_jarvis` shares `config.yaml`'s `idle_timeout: 60s` with the
  server's way out: a request to Anthropic quiet for longer than a minute is cut, whatever jarvis's own
  `JARVIS_CALL_TIMEOUT_S` says (60 s by default, up to 600 s; compose does not forward it, so it is the code's 60 s unless
  `compose.yaml` lists it). Raise both together, or neither.

## Switching Jarvis on

Jarvis is off until all three steps are done, in this order (10u-g2, D13987):

1. **The door's key**: step 6 of the set-up above, `openssl rand -hex 32 > deploy/secrets/jarvis_door_key`, then
   `chmod 644` on it. Without it, `docker compose` refuses to start the stack.
2. **The evals**, on a machine with Anthropic's key in a file nobody pastes (`evals/run.sh`'s header names the command),
   and their result committed in `evals/results/`: the last result must pass the gate, `python3 -I
   deploy/jarvis-evals-gate.py evals/results evals/cases`, which prints `ok` or says why not: every `injection` case, every
   `allowlist` case, every `ground` decline passes, a case seen twice passes only if every row did, and at least 9 of the
   `ground` suite's `on-topic-*` cases in 10. Only files named by their UTC time are read; a result it cannot read, one
   that lacks a case of those suites, or none at all is a refusal.
3. **`sh deploy/jarvis-on.sh`**, which runs that gate and writes `JARVIS=on` in `deploy/.env` only when it passes. Never
   write that line by hand. Then `--profile jarvis` beside `--profile demo` (the table above).

A green `deploy/test.sh` with its `skip  jarvis switched on is not started` line does not prove Jarvis on: those proofs (its
start checks over the reader, the 401 when on) run only once the gate passes, and nothing but `jarvis-on.sh` and your own care
stop `JARVIS=on` being written without it.

The door's key changes by writing a new file and recreating the two that read it, the server and jarvis, together:
`openssl rand -hex 32 > deploy/secrets/jarvis_door_key`, then `docker compose -f deploy/compose.yaml --profile demo --profile
jarvis up -d --force-recreate server jarvis`. Between the two restarts the door's requests may meet a 401 (not checked: how the door answers one is the code's, 10u-g2's G2-code);
`web` restarts with the server (F622). Nothing else holds it. A key that leaked is changed the same way at
once: it opens jarvis's routes to anyone who can also reach jarvis's network, which is the server's alone.

### Forget Jarvis's kept explanations (D13920)

A function's explanation is kept 7 days in the server's database, in the table `jarvis_kept`; its key holds the explain prompt's
version, so a new prompt never serves an old row. To drop rows by hand (a wrong answer, a realm whose source changed on a chain that
was reset), stop nothing and run, on the host, against the `server` volume's file (its folder is `docker volume inspect -f
'{{.Mountpoint}}' <project>_server`; `<project>` is the compose project's name, `deploy` by default):

```sh
DB="$(docker volume inspect -f '{{.Mountpoint}}' deploy_server)/gnoworld.db"
sqlite3 "$DB" "DELETE FROM jarvis_kept WHERE key LIKE '[\"explain\",%';"                          # every explanation
sqlite3 "$DB" "DELETE FROM jarvis_kept WHERE key LIKE '[\"explain\",%,\"gnoland-1\",%';"        # one chain
sqlite3 "$DB" "DELETE FROM jarvis_kept WHERE key LIKE '[\"explain\",%,\"gno.land/r/gov/dao\",%';" # one realm
```

The kept rows are capped at 5,000 and 16 MiB, the oldest going first at the retention's tick. The next ask of that function calls the model again and keeps its answer. A room's kept "What can I do here?" rows
(`key LIKE '[\"here\",%'`) last an hour and go by themselves.

## Switching the link cards on

The link cards (a card under a chat line that links a public page, slice 13, D13919) are off until three steps are done, in this order:

1. **`sh deploy/test.sh`, first**, from the commit you reviewed (the box in "Run, test, stop"). It starts the reader and its way out under the
   `links` profile and proves their isolation and the way out's refusals (`deploy/test-links.sh`, sourced by `test.sh`; it needs the network for
   its controls, `example.com`); add `--mutants` when `deploy/` changed. Docker is needed, so the build sandbox cannot run it.
2. **`LINK_CARDS=1`** in `deploy/.env` (`deploy/.env.example` names it, commented). It is the kill switch: `0` or unset, the server asks the reader
   nothing and no card shows. The server stops at start with it on and no `LINK_READER_URL` (compose always sets it).
3. **`--profile links`** beside `--profile demo`: `docker compose -f deploy/compose.yaml --profile demo --profile links up -d --build`. The
   reader and its way out are in that profile alone, so without it the cards are on and the reader is not there: a page the server cannot
   reach the reader for is believed down for an hour, and no card shows for it.

To switch them off, set `LINK_CARDS=0` and recreate `server`; the profile can stay up. A card is held for a day (a refusal too), at most
30 days, and the pages (2,000) and their picture bytes (32 MiB) are capped, oldest first, by the retention (`cards/expire.ts`); a REDACT, an edit or the author's or a
moderator's removal takes a line's card away at once. The alerts `card_shape`, `card_backlog` and `card_queue_full` (above) are the ones to watch.

Linked accounts, which the owners' moderation uses, need no switch: they live in the server's database (`identities` and `links`, up to ten
addresses an identity). A person unlinks an address with their own session, or releases a command-line key with a file that key signs
(`/api/links`, `login/release.ts`): ops write no row by hand, since the last link of an identity takes its identity with it.

## Secrets: rotation and revocation

- **The password:** write a new file with `htpasswd -cB`, then `docker compose ... restart web`.
- **The auth key:** used once, at the first login; the node key then lives in the `tailscale`
  volume. Revoking the key does not remove the machine: remove the machine to revoke the demo.
- **The operator's password:** write a new file, then `docker compose ... restart ergo server`: Ergo
  hashes it at its start, and the bot logs in with it.
- **OpenAI's key:** write the new one, `restart server`, then revoke the old one at OpenAI.
- **The pepper:** it keys the logs' hashed accounts and visitors, and the verdicts' accounts (3i, 3k): a
  new one matches none of the older ones, so the strikes toward a mute start again and an edit's owner
  is unknown. Change it only when it may have leaked, then `restart server`.
