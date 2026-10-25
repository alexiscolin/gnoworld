# Operations

The runbook (ADR-0002 §7). It holds the demo: the client behind a password, published through
Tailscale Funnel from one Docker host, with Ergo (the chat), `server` (the login, the rooms, the bot)
and, in the demo, a way out to OpenAI alone (slice 3, 3e); `jarvis` and Grafana come with slice 10 (`docs/decisions.md:151`). Everything is in `deploy/`; nothing outside it is touched,
and no port of the host is opened. It runs on any Docker host: Linux with Docker Engine 28 or
later, Docker Desktop, or OrbStack.

## The services

| Service | Image | Listens | Health | Limits | State | Secret |
|---|---|---|---|---|---|---|
| `web` | built from `deploy/web/Dockerfile`: the client, on `nginx-unprivileged` 1.30.6, by digest | 8080, PROXY protocol, on `inside` only | `127.0.0.1:8081/health`, inside the container | 0.5 core, 128 MB, 64 processes | none | `demo_htpasswd` |
| `guard` (profile `demo`) | `tailscale/tailscale` v1.104.1, by digest, running `deploy/guard/guard.sh` | nothing | its rules loaded | 0.1 core, 32 MB, 16 processes | none | none |
| `tailscale` (profile `demo`) | the same image | Funnel on 443, forwarded to `web:8080` | `127.0.0.1:9002/healthz`, inside its network | 0.5 core, 256 MB, 128 processes | the `tailscale` volume (its node key) | `ts_authkey` |
| `ergo` | built from `deploy/ergo/Dockerfile`: Ergo's own image v2.19.1, by digest, with `render.sh` and a probe for its health; its auth script is the server's socket | 6667 (the bot) and 8097 (WebSocket, web's `/ws`), on `inside` only | its 6667 answers | 0.4 core, 512 MB, 1,024 processes (Go's threads count) | the `ergo` volume (accounts, history) | `ergo_oper_password` |
| `server` | built from `deploy/server/Dockerfile`: distroless Node 24, by digest | 8080 (web's `/api/`), on `inside` only; the `auth` volume's socket | `127.0.0.1:8080/health` | 0.4 core, 512 MB, 128 processes | the `server` volume (its SQLite) | `log_pepper`, `ergo_oper_password`, `openai_api_key` |
| `egress` (profile `demo`) | built from `deploy/egress/Dockerfile`: smokescreen v0.1.0 from its source, on distroless static | 4750 in `guard`'s network, reached from `inside` alone | its 4750 answers | 0.1 core, 64 MB, 64 processes | none | none |

All six have a read-only root with `/tmp` in memory, no new privilege, logs rotated at 3 × 10 MB,
and every capability dropped, except `guard`'s `NET_ADMIN`; `ergo`, `server` and `egress` run as
65532, the user the auth socket's volume belongs to.

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
- `egress` (smokescreen) lets the server reach `api.openai.com` (`deploy/egress/acl.yaml`, one
  file the test reads too) and refuses an address that resolves to a private one; it sits in
  `guard`'s network, so the kernel's rules hold whatever it resolves. The server finds it by
  `HTTPS_PROXY` and `NODE_USE_ENV_PROXY`; ops, with no `guard`, names its own in `EGRESS_PROXY`.

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
7. On Linux, a clone made with a umask of 077 leaves `deploy/guard` and `deploy/tailscale`
   unreadable to the containers: `chmod -R a+rX deploy/guard deploy/tailscale`.

`deploy/secrets/` is ignored by git, left out of every build (`.dockerignore`) and closed to
Claude Code (`.claude/settings.json`). Nothing in the repository names a host, an address or a
tailnet; keep it so.

## Run, test, stop

| What | Command, from the repository's root |
|---|---|
| Start, or rebuild after a merge | `docker compose -f deploy/compose.yaml --profile demo up -d --build` |
| Test the stack: web, the guard, Ergo, the server and the way out (no secret needed) | `sh deploy/test.sh` |
| Test that each check catches its fault | `sh deploy/test.sh --mutants` |
| Test the running demo | `sh deploy/test.sh --demo`, which asks for the password |
| Its logs | `docker compose -f deploy/compose.yaml --profile demo logs -f` |
| Stop | `docker compose -f deploy/compose.yaml --profile demo down` |
| Remove it all | `docker compose -f deploy/compose.yaml --profile demo down -v`, then delete the machine in the admin console |

Run `sh deploy/test.sh` after every change to `deploy/`, and when the app changes what it serves
(a new kind of file, many more files on a first load); `--mutants` in `/pre-merge` of a branch
that changes `deploy/`. App code alone needs neither: the gate's journeys test it.

The tests run on the host (macOS or Linux), outside Claude Code's sandbox, which refuses Docker's
socket. Their output names the host's addresses and ports: never commit it, nor paste it in public.

## When something goes wrong: cut the public URL

A flood meets the password, a limit per visitor (429 after a burst) and the containers' caps (2.0
cores and 1,248 MB in all, at and under the 2 cores and 2 GB the test holds as a ceiling: Docker
stops a container at its cap, not the host). To cut the public URL at once:

| Where | How | Back |
|---|---|---|
| On the host, in seconds | `docker compose -f deploy/compose.yaml --profile demo stop tailscale` | `... start tailscale` |
| From anywhere, a phone included | The admin console, Machines, the demo, Remove: its node key is revoked at once | A new auth key, then `down -v` and `up` |

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
  down`, then `up -d` (the node key stays in its volume) (F203).
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
  new one; the limit of new accounts per visitor (`NEW_ACCOUNTS_PER_HOUR`) only slows a farm
  (decision 144).
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
  32 characters at least. Unset, the server keeps no link: rooms exist, nobody's activity counts.
- **Rooms stay.** A world removed from the roles file keeps its room and history; removing one is a
  moderator's act (3l).
- **The bot's account.** The bot logs in by SASL as the account `gnoworld`, whose nick Ergo keeps for
  it (the server's auth takes the operator's password for that one name). After a link drops silently,
  its next connection joins the old session, which Ergo holds until its own ping timeout, as a second
  session of the account (multiclient). A refusal of the nick comes from a guest who took it before the
  account first logged in (a new Ergo database): the link logs `irc_refused` (`nick`), tries again, and
  raises the alert `irc_nick_taken` at the third in a row. A refused login logs `irc_refused` (`sasl`).
- **Ergo logs no address** (`-connect-ip`, slice 3's max review): its refusals by ip-limits go unlogged
  with it, so a visitor behind a shared address who meets the limit leaves no trace (slice 4).

Slice 3, the check (3i):

- **Its settings.** `OPENAI_API_KEY_FILE` holds OpenAI's key (one word, 32 characters at least);
  unset, nothing leaves the server, every message is unchecked and the alert says so at the start.
  `MODERATION_THRESHOLDS` (JSON, a score above 0 and at most 1 by category; 0 would hide every line of its
  category, so the server refuses it, F525) replaces OpenAI's own flag where set;
  `NEW_ACCOUNT_HOURS` (24) is how long an account counts as new.
- **What reaches OpenAI.** A message's text alone, with the model's name: no account, no room.
  The privacy policy must say so before a public launch (decision 154).
- **Bare links pass the link rule.** A link counts with its scheme or `www.`; `bit.ly/x` does not.
  Each scheme counts, however the links are joined: a link inside another's address is one more.
- **Banned words** match as whole words, but a word of a script written without spaces (Chinese,
  Japanese, Thai, Lao, Khmer, Myanmar) matches anywhere in a line.
- **A message caught in a restart** stays `pending` in the verdicts; 3j's catch-up checks it again.
- **OpenAI's rate limit.** One line a request, and OpenAI caps a key's requests a minute by its account's tier
  (`omni-moderation-latest`: 250 on Free, 500 on Build, 2,000 on Launch, 5,000 on Grow; its model page, read
  2026-10-24): past it, its refusals count as down, five open the breaker for 30 s, and lines pass unchecked
  meanwhile. The load run's 200 accounts, a line each every 5 s (2,400 a minute), left 1,810 of 2,200 unchecked
  (F692). Several lines a request is slice 4's (`docs/plans/backlog.md`).

Slice 3, the bot acts and the stream (3j):

- **A mistaken hide stays.** Nothing restores a hidden line until slice 12's console (decision 146);
  the verdict's row holds its scores and thresholds, and its author got the reason.
- **The catch-up.** After a reconnect or a restart the bot asks each room's history from the time of
  the last line it settled in a row, 50 at a time, each page once the check's queue is empty. Not
  caught up: a line the full queue drops (the log says so), a line left unchecked by a provider
  outage (its previews wait), a room's first lines said while the link was down, and, past a full
  page of 50 lines all in one millisecond, the rest of that millisecond (each next page starts in its
  last line's millisecond, F542).
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

- **Its settings.** `MUTE_STRIKES` (3) hides in `MUTE_WINDOW_MINUTES` (10) mute an account in that
  world's rooms for `MUTE_MINUTES` (5); `MUTE_MAX` (50) mutes at once a world, the one ending first
  lifted early to make room (Ergo's list holds 100: 3b). The roles file's team and trusted are never
  muted, their lines still hidden.
- **A line too fast** is the 21st of an account in a minute of Ergo's time: hidden, and a strike.
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
  message left unchecked, the queue full); `irc_nick_taken` (above); `redact_refused`, `unknown_room`
  and `room_opened` (the rooms, below). `scripts/check_docs.py` keeps this list whole.
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
  the demo machine's own address on to `127.0.0.1`, so a device the policy let in would reach the way
  out on 4750 (to OpenAI's API alone). `"acls": []` keeps every device out (F619).
- **No backup in the demo** (ADR-0002): Ergo's accounts and history live in the `ergo` volume and the
  server's records in `server`; `down -v` removes both. To upgrade Ergo, change its tag and digest in
  `deploy/ergo/Dockerfile` and `VERSION`, then `sh deploy/test.sh` before `up -d --build`.
- **`web`'s fixed address** is in `INSIDE_SUBNET`: a host with another network in that range refuses
  to start the stack (Compose names the overlap); set both in `deploy/.env`.

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
