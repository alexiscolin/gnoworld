# Operations

The runbook (ADR-0002 §7). In slice 1 it holds the demo: the static client behind a password,
published through Tailscale Funnel from one Docker host. Slice 3 adds Ergo and `server`, each with
its section here; `jarvis` and Grafana come with slice 10 (`docs/decisions.md:151`). Everything is in `deploy/`; nothing outside it is touched,
and no port of the host is opened. It runs on any Docker host: Linux with Docker Engine 28 or
later, Docker Desktop, or OrbStack.

## The services

| Service | Image | Listens | Health | Limits | State | Secret |
|---|---|---|---|---|---|---|
| `web` | built from `deploy/web/Dockerfile`: the client, on `nginx-unprivileged` 1.30.6, by digest | 8080, PROXY protocol, on `inside` only | `127.0.0.1:8081/health`, inside the container | 0.5 core, 128 MB, 64 processes | none | `demo_htpasswd` |
| `guard` (profile `demo`) | `tailscale/tailscale` v1.104.1, by digest, running `deploy/guard/guard.sh` | nothing | its rules loaded | 0.1 core, 32 MB, 16 processes | none | none |
| `tailscale` (profile `demo`) | the same image | Funnel on 443, forwarded to `web:8080` | `127.0.0.1:9002/healthz`, inside its network | 0.5 core, 256 MB, 128 processes | the `tailscale` volume (its node key) | `ts_authkey` |

All three have a read-only root with `/tmp` in memory, no new privilege, logs rotated at 3 × 10 MB,
and every capability dropped, except `guard`'s `NET_ADMIN`.

- `web` sits on `inside`, an internal network with no way out and no gateway, so it reaches no
  address of the host either.
- `guard` holds the only network that lets out, and `tailscale` shares it. Before anything else
  runs there, it loads its rules: web's port, Docker's DNS, then every private, local, carrier
  and reserved address refused, so neither reaches the host, its LAN or a tailnet; then public
  TCP 80 and 443 and UDP, which Tailscale needs. IPv6 is closed. When Compose restarts `guard`,
  `tailscale` restarts with it; when Docker restarts `guard` on its own, `tailscale` keeps a
  network with nothing in it, which fails closed, until `docker compose ... restart tailscale`.
- Funnel hides the host's address: the public name leads to Tailscale's relays, never to the host.

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
5. Optional: `cp deploy/.env.example deploy/.env`, to change the machine's name.
6. On Linux, a clone made with a umask of 077 leaves `deploy/guard` and `deploy/tailscale`
   unreadable to the containers: `chmod -R a+rX deploy/guard deploy/tailscale`.

`deploy/secrets/` is ignored by git, left out of every build (`.dockerignore`) and closed to
Claude Code (`.claude/settings.json`). Nothing in the repository names a host, an address or a
tailnet; keep it so.

## Run, test, stop

| What | Command, from the repository's root |
|---|---|
| Start, or rebuild after a merge | `docker compose -f deploy/compose.yaml --profile demo up -d --build` |
| Test the static server and the guard (no secret needed) | `sh deploy/test.sh` |
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

A flood meets the password, a limit per visitor (429 after a burst) and the containers' caps (1.1
cores and 416 MB in all, under the 2 cores and 2 GB the test holds as a ceiling: Docker stops a
container at its cap, not the host). To cut the public URL at once:

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
- **Open connections.** The limit counts requests per visitor, not open connections, and a team
  behind one address shares one limit (F208).

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

## Secrets: rotation and revocation

- **The password:** write a new file with `htpasswd -cB`, then `docker compose ... restart web`.
- **The auth key:** used once, at the first login; the node key then lives in the `tailscale`
  volume. Revoking the key does not remove the machine: remove the machine to revoke the demo.
