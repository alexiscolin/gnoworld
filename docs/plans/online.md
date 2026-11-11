# Plan: gnoworld online in one command

Chief's brief, 2026-11-11, for a demo on 2026-11-12 evening. A plan only: no code, no account, nothing deployed, nothing sent to a
provider. Anything that touches secrets or deployment security is a stop-and-ask (CLAUDE.md), listed at the end.

## 1. What our stack needs (read in `deploy/compose.yaml`, `deploy/guard/guard.sh`, `deploy/web/nginx.conf`, `deploy/tailscale/serve.json`)

| Need | Where it comes from | What it rules out |
|---|---|---|
| Up to 12 containers, 8 internal networks with fixed subnets and addresses (`inside`, `jarvis`, `jarvis_out`, `reader`, `reader_out`, `links`, `links_out`, `admin`) | `networks:` with `internal: true`, `gateway_mode_ipv4: isolated` | A platform with one flat private network, or one network namespace for all |
| `guard`: `cap_add: NET_ADMIN`, `iptables-nft-restore` at start, other containers join its network (`network_mode: service:guard`: egress x4, tailscale) | `guard.sh`, the whole "the only way out" claim of `deploy/test.sh` | A platform with no raw Docker (no caps, no `network_mode`) |
| Ingress is Tailscale Funnel, TLS ended in `tailscale`, forwarded to `web:8080` **with PROXY protocol v2** (`serve.json`); `web` is `listen 8080 proxy_protocol` and takes the visitor's address from `$proxy_protocol_addr` for its rate limits, Ergo (`PROXY_FROM`) and the server (`TRUSTED_PROXY`) | `nginx.conf:93,39-50,164-181` | Any front that sends no PROXY protocol: every visitor would be refused or share one address |
| Volumes: `ergo`, `server` (SQLite), `jarvis`, `markets`, `auth` (a Unix socket shared by server and Ergo), `tailscale` | `volumes:` | Platforms with one volume per service or no shared volume |
| Secrets as files read by name: `demo_htpasswd`, `ts_authkey`, `ergo_oper_password`, `log_pepper`, `openai_api_key`, `anthropic_api_key`, `jarvis_door_key` (all `file:` entries; `deploy/.env.example` names the settings, never the values; I did not read `deploy/secrets/`) | `compose.yaml` bottom | Platforms with env-var secrets only |
| Settings in `deploy/.env`; `ORIGINS` is required and must be the public https origin | `.env.example` | nothing |
| Builds from source: web, ergo, server, jarvis, jarvis-reader (Go), egress (smokescreen from source), link-reader | `build:` x7 | A platform allowing one `build` |
| Profiles: `demo` (guard, egress, tailscale), `jarvis`, `links` | `profiles:` | nothing |
| Size: caps sum to 2 cores and 1,504 MB (demo), plus 0.7 core and 656 MB (Jarvis), plus the link reader (256 MB, 0.2 core) and its way out | OPERATIONS.md "When something goes wrong" | A host under 4 GB and 2 vCPU, which also has to build the images |

## 2. The providers, against that

Facts below are from the pages named, fetched in this session (WebFetch, 2026-11-11). "Not stated" means the page did not say it, not that
it is false.

### Fly.io
- Docker Compose maps only through "multi-container Machines": a `[build.compose]` section in `fly.toml`, flyctl 0.3.152 or later
  (<https://docs.fly.io/machines/guides-examples/multi-container-machines>). On that page: the containers of a Machine **share one network
  namespace** (so each reaches the others on `localhost`); exactly **one** compose service may have `build` (we have seven); compose `volumes:`
  are **ignored** at deploy (a Fly Volume is declared in `fly.toml` instead); `fly secrets` reach **every** container, no scoping; only **one**
  container takes inbound traffic; the feature is "currently available through the Machines API". Capabilities, NET_ADMIN, iptables and
  read-only roots are not covered by the page.
- Verdict for us: the isolation `deploy/test.sh` proves (eight separate networks, the guard, "the server's list and Jarvis's never mix",
  secrets scoped to one service) cannot be expressed. We would have to split into one Fly app per service, with Fly's private network, and
  rebuild the guard idea from nothing. Not for tomorrow, and it weakens the proofs. Price: shared-cpu-2x 2 GB $13.39 a month, volume $0.15
  per GB-month, dedicated IPv4 $2 (<https://docs.fly.io/about/pricing>); a split stack of eight to ten machines would cost more.

### Render
- The pages read name private services, a private network ("traffic between the services stays on their private network") and persistent
  disks; Docker is by Dockerfile or registry image; **no Compose** is mentioned
  (<https://render.com/docs/multi-service-architecture>, <https://render.com/docs/docker>). Capabilities (NET_ADMIN) are not stated on
  those pages, so I cannot say a guard runs there; it is not a container you control the way Docker does.
- Verdict: one service per container, rewritten by hand, our networks gone, the guard unproven. No.

### Railway
- Sources: Dockerfiles or images, variables and secrets (<https://docs.railway.com/overview/about-railway>); **one volume per service**, no
  replicas with a volume, redeploy with brief downtime (<https://docs.railway.com/reference/volumes>). No Compose and no capabilities stated.
  Non-root images need `RAILWAY_RUN_UID=0` for volumes, which undoes our 65532/65533/65531 users.
- Verdict: our `auth` socket volume shared by two services cannot exist. No.

### One small VM running our own `docker compose` (Hetzner, DigitalOcean, Scaleway)
- Everything runs unchanged except the **ingress** (Tailscale Funnel is replaced) and the guard's known limit F202 (below). Same Docker
  Engine, same compose file, same networks, same guard.
- Hetzner: shared vCPU plans "from EUR 5.49 to 5.99 a month" and a primary IPv4 at EUR 0.50 a month
  (<https://www.hetzner.com/cloud/>, <https://docs.hetzner.com/cloud/servers/overview>). The pages I fetched did not list the 4 GB plan's
  price: read it in the console when ordering (not verified here; expect a low single-digit to low double-digit euro a month). DigitalOcean
  and Scaleway: not fetched, so no figure; pick Hetzner unless Alexis already has an account elsewhere.
- Docker's own SSH context exists (`docker context create --docker host=ssh://user@host`,
  <https://docs.docker.com/reference/cli/docker/context/create/>; that page shows only the `unix://` example, so the ssh form is the same
  flag's documented shape, not demonstrated there). I do not rely on it: see section 4.

### Coolify (on such a VM)
- Open source, deploys from a Compose file, drives the server over SSH, handles domains, HTTPS, health checks
  (<https://coolify.io/docs/get-started/introduction>). It parses and **adds** labels, may rename volumes, creates its own per-resource
  network, services join a predefined network only if asked; "Raw (deploy file as-is)" skips most changes but then proxy labels and
  networking are ours (<https://coolify.io/docs/knowledge-base/docker/compose>). `cap_add`, `profiles` and `secrets: file:` are **not
  covered** by the page. Needs a first server install and a panel, itself a service holding the Docker socket.
- Verdict: gives a UI, rollback and logs, but adds a root-equivalent panel and unknowns on exactly our features. Not tomorrow. Revisit
  after the demo if Alexis wants a dashboard.

### Dokku
- Deploys by buildpack, Dockerfile or image; the page does not mention Compose (<https://dokku.com/docs/deployment/application-deployment/>).
  One app per Dockerfile: same problem as Render. No.

### Summary table

| | Compose unchanged | Isolation kept | Guard (NET_ADMIN) | Cost / month (demo) | First deploy | Secrets |
|---|---|---|---|---|---|---|
| Fly.io | partly (one build, volumes ignored) | no: one netns | not stated | $14+ and more once split | days (a rewrite) | global to the machine |
| Render | no | no | not stated | not fetched | days | provider env/files |
| Railway | no | no | not stated | not fetched | days | provider variables |
| **VM + our compose** | **yes** | **yes** | **yes** | **about EUR 6-15 (verify the 4 GB plan)** | **1-2 h** | **files on the VM, mode 700** |
| Coolify on a VM | mostly (rewrites) | to check | not stated | VM only | 2-3 h, unknowns | panel |
| Dokku | no | no | n/a | VM only | days | env |

## 3. Recommendation

**One Hetzner VM (Ubuntu LTS, 2 vCPU, 4 GB, 40 GB disk, Docker Engine 28 or later), our `deploy/compose.yaml` unchanged, and Caddy as the
only new piece, replacing `tailscale` as the front.** One command, `sh deploy/online.sh`, from the laptop, over SSH.

Why this and not the others: only this keeps every property `deploy/test.sh` proves (networks, guard, secrets scoped by service,
non-root users, volumes) with no rewrite, and a first deploy fits in a morning. The others change the isolation or are a rewrite.

### The ingress change, the one real design point
`web` accepts PROXY protocol v2 only. Caddy's `reverse_proxy` http transport has `proxy_protocol v1|v2` ("enables PROXY protocol on the
connection to the upstream"; <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy>; the page gives no introduction version:
pin the Caddy image to one at least two weeks old and test it). So:

- A `caddy` service takes `tailscale`'s place: `network_mode: service:guard`, `x-locked`, no secret, a volume `caddy` for its certificates,
  one `Caddyfile` in `deploy/caddy/` (`{$DOMAIN} { reverse_proxy web:8080 { transport http { proxy_protocol v2 } } }`). It reaches `web:8080`
  exactly as `tailscale` does today (guard's existing OUTPUT rule), and gets its certificate from Let's Encrypt through the guard's public
  80/443 rule. Caddy renews certificates itself.
- The guard publishes the host's 80 and 443 (`ports:` on `guard`, since Caddy shares its network). Binding 443 as a non-root user, with every
  capability dropped, needs `sysctls: net.ipv4.ip_unprivileged_port_start: 0`, as `jarvis_reader` already does (compose.yaml, same
  pattern); to be proven by a real run, not assumed.
- It lives in `deploy/compose.online.yaml`, an override file, so `deploy/compose.yaml` and the Tailscale path stay as they are (the
  Funnel demo from Alexis's own machine keeps working: it is also the fallback tomorrow, section 7).
- The demo password (`web`'s `auth_basic`) stays: it keeps strangers, and the OpenAI and Anthropic bills, out. Decision for Alexis (Q3).

### What changes, and does it weaken a proof
- `tailscale` is not started (and its `ts_authkey` is not needed); `test.sh` checks the guard and the way out, not Tailscale, in `--demo`
  only. No isolation proof is touched.
- Known limit F202 (OPERATIONS.md "A host whose own public address serves something"): on a rented server, the host's public address is on
  an interface, and the guard lets public TCP 80/443 out, so a guarded container could reach the VM's own ports 80/443 (that is Caddy itself,
  published). `sh deploy/test.sh` already fails there for TCP, by design. We do **not** run it on the VM; we run it on the laptop as before
  and accept the limit for a demo host that serves nothing else: the VM runs nothing on 80/443 but Caddy, and the firewall (below) closes
  every other port. This is a written, accepted weakening: Alexis decides (Q4).
- The VM's own SSH port is the one new public surface: key-only login, no password, Hetzner cloud firewall allowing 22 from Alexis's address
  only (or fail2ban), 80 and 443 from all. Docker publishes ports ahead of `ufw`, so the provider firewall is the control, not ufw.
- The guard's rules still refuse 169.254.0.0/16 (cloud metadata) and every private range for the guard's containers. The link reader's
  `open` ACL cannot reach the VM's metadata endpoint either.

## 4. The script

`deploy/online.sh` (POSIX sh, like `test.sh`), plus one config file `deploy/online.env` (ignored by git, like `deploy/.env`; no secret in
it): `ONLINE_HOST=root@1.2.3.4`, `ONLINE_DOMAIN=demo.example.com`, `ONLINE_PROFILES="demo jarvis links"`.

Subcommands: `online.sh` (= `up`), `status`, `logs [service]`, `rollback`, `down`. Each prints what it will do first.

**Why files over SSH, not a Docker context.** `compose.yaml` has bind mounts (`./guard:/guard:ro`, `./tailscale`) and `secrets: file:`;
with a remote Docker context those paths are read on the laptop or on the host depending on the Compose version, a trap I have not verified
here. So the script copies the release to the VM and runs `docker compose` there, over `ssh`: one rule, the paths are the VM's.

### `up`, in order, each step idempotent
1. Refuse a dirty or unnamed state: it ships `git archive <HEAD sha>`, never the working tree (same rule as OPERATIONS.md "Run test.sh from
   the commit you reviewed"), unless `--sha` is given. The sha is printed.
2. First run only, asks: the host, the domain (and checks its DNS A record equals the host's IP, with `dig`, else stops with the fix:
   Let's Encrypt would fail), and writes `deploy/online.env`.
3. Checks the VM over ssh: Docker Engine at least 28, compose plugin, 4 GB, 20 GB free; if Docker is absent, offers the one documented
   install line and stops for a yes. It creates `/opt/gnoworld/{releases,secrets}` with mode 700.
4. Secrets, derived from the compose file's own `secrets:` list (`docker compose config --format json` on the VM), so a future secret
   appears here by itself: for each name with no file in `/opt/gnoworld/secrets/`: random ones are made on the VM (`ergo_oper_password`,
   `log_pepper`, `jarvis_door_key`, as OPERATIONS.md step 6; `demo_htpasswd` from a password it prints once), and the external ones
   (`openai_api_key`, `anthropic_api_key`) are read from a prompt, silently, never echoed, never into history, never on argv. `ts_authkey`
   gets a placeholder (Compose wants the file; Tailscale is not started; whether Compose needs it with no service using it is to check).
   An existing file is never overwritten. Files get mode 644 where the containers' users need it, in a 700 folder, as the runbook says.
5. Ships the release to `/opt/gnoworld/releases/<sha>/` (tar over ssh, no rsync needed), writes the VM's `deploy/.env` from `online.env`
   (`ORIGINS=https://<domain>`, `DOMAIN`, `JARVIS`, `LINK_CARDS`, the file paths), and points `current` at it.
6. `docker compose -f deploy/compose.yaml -f deploy/compose.online.yaml --profile ... up -d --build --remove-orphans` over ssh. Volumes
   are named and survive.
7. Health check, up to 3 minutes: every service `healthy` (`docker compose ps --format json`), then from the laptop
   `curl https://<domain>/` returns 401 without the password (proving the gate and TLS) and 200 with it, and `/api/health` through `web`
   answers. Prints the URL, the release sha, and `rollback` as the last line. Non-zero exit and the failing service's last log lines if
   any step fails.

### `rollback`
Points `current` at the previous release directory (the script keeps the last 3, deletes older ones) and runs step 6 and 7 for it: the
images are cached so it takes seconds. It says plainly that data (SQLite, Ergo) is not rolled back: a release with a migration is not
undone by it. Before each `up` it copies the `server` volume's database aside (`docker run --rm -v ...` tar into
`/opt/gnoworld/backups/<sha>.tgz`, last 3 kept), so a bad migration has a manual undo.

### Adding a future service (one place)
Add it to `deploy/compose.yaml` (its network, its profile, its secrets under `secrets:`). Then: its profile goes in `ONLINE_PROFILES`
(only if it has a new one), nothing else. Secrets are discovered (step 4), the build is `--build`, the health check is "all services
healthy". A service that must be public goes in `compose.online.yaml` and the Caddyfile: the only second place, named in the doc.

### Safety rails in the script
`set -eu`; no `rm -rf` of a variable (memory: `find-delete-empty-var`, use `"${d:?}"`); secrets never printed, never on a command line,
never in the shipped archive (`deploy/secrets/` is already out of `git archive`, `.dockerignore`); a lock on the VM
(`/opt/gnoworld/.lock`) so two runs do not overlap; refuses to run if `ONLINE_HOST` is empty; never runs without Alexis having typed the
command (it is not wired to any hook or to `ship.sh`).

### Tests (the repository's rule: a guard lands with its proof)
- `deploy/test_online.sh`, no network, no provider: runs `online.sh` with `ssh` replaced by a stub on `PATH` and checks the refusals (dirty
  tree without `--sha`, empty host, DNS mismatch, missing Docker, a secret prompt never reaching argv, an existing secret file untouched,
  a failing health check giving a non-zero exit, rollback picking the previous release).
- A compose-level check that `docker compose -f compose.yaml -f compose.online.yaml config` is valid and that `tailscale` is absent from
  the online service set and `caddy` shares `guard`'s network.
- A real proof only on the VM, by Alexis's command: the health check above. `test.sh` stays the laptop's.

## 5. The doc to write in `docs/OPERATIONS.md`

A section "Online, on a rented VM" after "On another host": what it is (Caddy instead of Funnel, same everything else); the one-time list
(account, VM, firewall, DNS, `online.env`); the one command; `status`, `logs`, `rollback`, `down`; the secrets' place and who reads them;
where to add a service; the F202 limit as it applies; cut-off in seconds (`docker compose ... stop caddy`, or the provider's firewall
closing 443); and a "never run `deploy/test.sh` on this host" line. Also a pointer line in `deploy/.env.example` and in `deploy/compose.yaml`'s
header, and a row in `docs/decisions.md` for the choice (CLAUDE.md: a decision goes there at once).

## 6. What Alexis does himself

1. Create the cloud account and put a payment method (nothing can do this for him; 5 minutes, but account validation can take longer).
2. Order the VM (Ubuntu LTS, 4 GB, 2 vCPU, his SSH public key at creation, a firewall as above), tell the plan the IP.
3. A domain, or a name that resolves to the IP: a subdomain of one he owns (A record, TTL 300) is the safe route. A free wildcard-DNS
   name built from the IP (such as sslip.io) would avoid buying one, but I did not verify that service or its Let's Encrypt rate limits
   in this session: do not plan on it unchecked.
4. Type the external secrets when the script asks: OpenAI key, Anthropic key (workspace with its own spend limit, ADR-0002 §5), and the
   demo password he wants to give the audience.
5. Run the one command himself, from his Terminal; run `rollback` once before the demo to prove it.
6. After: the review commands in OPERATIONS.md for `test.sh` (laptop) on the commit shipped.

## 7. Risks for tomorrow's demo

| Risk | Effect | Mitigation |
|---|---|---|
| The Caddy-to-`web` PROXY protocol v2 handshake does not work as read in the docs | Site up but 400s or every visitor one address | First thing built and tried by `compose config` + a local run on the laptop with a self-signed name; Caddy pinned |
| Binding 443 as non-root, caps dropped, in the guard's namespace | Caddy will not start | The sysctl as `jarvis_reader` uses; fallback: `NET_BIND_SERVICE` on caddy alone (a caps change: stop-and-ask) |
| DNS not propagated, or Let's Encrypt refused | No TLS | Domain ordered tonight; script checks the A record; Caddy `tls internal` flag for a browser-warning fallback |
| Building seven images on a 4 GB VM | Slow or OOM first build (smokescreen from source, Node, Go) | First deploy tonight, not at noon; 4 GB plus a 2 GB swap file in the install step; or build on the laptop and `docker save`, only if it fails |
| Guard on a public-address host (F202) | `test.sh` red there; a guarded container could reach the VM's public 80/443 | Accepted for a host that serves only Caddy; documented |
| Docker publishes ports around the host firewall | A surprise open port | Provider firewall; only guard publishes 80/443 |
| Open to the internet with Jarvis on | Spend on two API keys | Keep the password; keep Jarvis budgets (`JARVIS_BUDGET_USD` 3 a day); switch Jarvis on only after its evals, per "Switching Jarvis on" |
| Data loss on rollback or a bad volume | Chat history gone | Database copied aside before every `up`; the demo's data is disposable |
| Slice's own rule: `main` takes nothing before hardening | The script would be on `pingpong` | Ship from the `pingpong` sha with `--sha`; no merge needed for the demo |
| Time: a morning for a plan this size | Slips | Cut line: skip tests of the script and `rollback` polish first; **never** cut the health check or the password |

Fallback that exists today and needs nothing: the current Funnel demo from Alexis's own machine (OPERATIONS.md), usable if the VM
slips, as long as that machine stays on during the demo.

Estimate, in order: compose override and Caddyfile with a local run (1.5 h), `online.sh` up and health check (1.5 h), secrets and
rollback (1 h), stub tests (1 h), doc and decision row (0.5 h), real first deploy by Alexis with the builder next to him (1 h): about
6.5 hours of work, so it fits "ready by tomorrow late morning" only if the account and the VM exist tonight. Over-run candidates are the
tests and the doc, never the deploy path.

## 8. Stop and ask (CLAUDE.md)

- A **new dependency, tool or image**: Caddy (the image, by digest), `dig` and `ssh`, `tar` on the laptop.
- **Deployment security and secrets**: the whole script, how secrets are made and stored on the VM, the SSH exposure, and the guard's
  `ports:` publication and F202 acceptance.
- A change to the guard's service (`ports`, `sysctls`) is in a tier-1/harness path: it gets the red pass and the `security-reviewer`
  (CLAUDE.md "How we work"); `deploy/test.sh` runs from the reviewed commit after it (OPERATIONS.md), `--mutants` included.
- Nothing is deployed until Alexis types the command; pushing a branch is separate and asked for.

## 9. Questions for Alexis

1. Provider: Hetzner (my recommendation, cheapest, I did not verify the 4 GB price) or an account you already have?
2. A domain you control for tomorrow, or do I plan on a bare IP name (unverified service)?
3. Keep the demo password on the public site? (I recommend yes.)
4. Accept known limit F202 for a rented host that serves only Caddy (and `test.sh` staying red there)?
5. Switch Jarvis and link cards on for the demo, or off to cut risk and spend?
6. Is the VM disposable after the demo (then no backups work)?
