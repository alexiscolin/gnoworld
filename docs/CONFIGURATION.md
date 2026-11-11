# Configuration

Every setting of the site in one place: what to create, what to set, what each knob changes, and what cannot be set. Each row was read
in the code (the file is named in each section's heading). Nothing here is a secret value or a real address; `docs/OPERATIONS.md` is how to run it.

A bad value never starts the service: it stops at start and names the setting, never its value (`packages/service/src/settings.ts`, `parseSettings`).
A setting is read once at start: change it, then recreate the service (`docker compose ... up -d --force-recreate <service>`).

## 1. To put the site online

In this order (details: `docs/OPERATIONS.md`, "Before the first start"):

1. A tailnet for the demo, with MagicDNS and HTTPS on, the tag `tag:gnoworld-demo` and Funnel for it, `"acls": []`.
2. `mkdir -m 700 deploy/secrets`, then the secret files of section 2 (each `chmod 644`).
3. `cp deploy/.env.example deploy/.env`, and set `ORIGINS` to the app's own https origin (required: compose refuses to start without it, `compose.yaml` lines 71 and 113).
4. `docker compose -f deploy/compose.yaml --profile demo up -d --build`. Add `--profile links` with `LINK_CARDS=1`, and `--profile jarvis` with `JARVIS=on` (section 4).
5. `sh deploy/test.sh` from the commit you reviewed; `sh deploy/test.sh --demo` on the running demo.

## 2. Secrets (files in `deploy/secrets/`, declared in `compose.yaml` lines 628 to 645)

A secret is only ever read from a file; `.env` holds the file's path, never its value. Every file below must exist before `up`, even for a feature that is off.

| File | For | Read by | Create | Required |
|---|---|---|---|---|
| `demo_htpasswd` | The demo's password (nginx basic auth) | `web` | `htpasswd -cB deploy/secrets/demo_htpasswd team` | yes |
| `ts_authkey` | Tailscale's single-use auth key, tag `tag:gnoworld-demo` | `tailscale` | Tailscale admin console, Settings, Keys | yes (spent at the first login) |
| `ergo_oper_password` | The chat operator's password, 48 characters | `ergo`, `server` | `openssl rand -hex 24 > deploy/secrets/ergo_oper_password` | yes |
| `log_pepper` | Hashing key of the logs' accounts and visitors | `server` | `openssl rand -hex 32 > deploy/secrets/log_pepper` | yes (32 bytes at least) |
| `openai_api_key` | OpenAI moderation (and the previews' check) | `server` | one line, the key | yes as a file; the server reads it when `OPENAI_API_KEY_FILE` is set, which compose always does |
| `anthropic_api_key` | Anthropic key of a workspace with its own spend limit | `jarvis`, only when on | one line, the key | the file yes, any text when Jarvis is off |
| `jarvis_door_key` | The shared key the server sends and Jarvis asks of every request | `server`, `jarvis` (and its health check) | `openssl rand -hex 32 > deploy/secrets/jarvis_door_key` | yes, whatever `JARVIS` says: a missing or short file stops the whole stack |

Rules every secret file passes (`settings.ts`, `readSecret`, `readWord`): readable, 32 bytes at least once trimmed, one word of printable ASCII, 256 characters at most.
Where each file lives is overridable by `*_FILE` in `.env` (section 3, "Compose"). Rotation: `docs/OPERATIONS.md`, "Secrets: rotation and revocation".

## 3. Environment variables by service

"Compose" sets a value in `deploy/compose.yaml`; "default" is the code's when the variable is unset. A variable marked `.env` can be set in `deploy/.env`.

### Compose (`deploy/.env`, `deploy/.env.example`)

| Name | Default | Effect |
|---|---|---|
| `ORIGINS` | none, required | The app's own https origin: Ergo's WebSocket and the server's POSTs accept it alone |
| `TS_HOSTNAME` | `gnoworld-demo` | The machine's name on the tailnet (`<name>.<tailnet>.ts.net`) |
| `SERVER_NAME` | `irc.gnoworld.example` | Ergo's name for itself, a name nobody resolves |
| `DEMO_HTPASSWD_FILE`, `TS_AUTHKEY_FILE`, `ERGO_OPER_PASSWORD_FILE`, `LOG_PEPPER_FILE`, `OPENAI_API_KEY_FILE`, `ANTHROPIC_API_KEY_FILE`, `JARVIS_DOOR_KEY_FILE` | `./secrets/<name>` | Where each secret file is |
| `EGRESS_PROXY` | `http://guard:4750` | The server's way out (ops names its own) |
| `JARVIS_EGRESS_PROXY` | `http://guard:4751` | Jarvis's way out |
| `ERGO_DATA_MB` | `1024` | Megabytes Ergo's volume may fill before the server's alert at 80% |
| `WEB_ADDRESS`, `SERVER_ADDRESS`, `JARVIS_ADDRESS`, `READER_ADDRESS`, `LINK_READER_ADDRESS`, `ADMIN_ADDRESS` | `172.30.89.10`, `.89.11`, `172.30.91.10`, `172.30.97.10`, `172.30.101.10`, `172.30.92.10` | Fixed addresses of the services on their networks |
| `GUARD_JARVIS_ADDRESS`, `GUARD_READER_ADDRESS`, `GUARD_LINKS_ADDRESS` | `172.30.95.2`, `172.30.99.2`, `172.30.103.2` | The guard's address on each way-out network (it finds the network by it) |
| `INSIDE_SUBNET`, `JARVIS_SUBNET`, `JARVIS_OUT_SUBNET`, `READER_SUBNET`, `READER_OUT_SUBNET`, `LINKS_SUBNET`, `LINKS_OUT_SUBNET`, `ADMIN_SUBNET` | `172.30.89.0/24`, `.91.0/24`, `.95.0/24`, `.97.0/24`, `.99.0/24`, `.101.0/24`, `.103.0/24`, `.92.0/24` | Each network's subnet; change an address and its subnet together |
| `JARVIS` | `off` | Section 4 |
| `LINK_CARDS` | `0` | Section 4 |
| `JARVIS_GNOSCOPE` | `off` | Jarvis's gnoscope tools: `on` or `off` |
| `JARVIS_BUDGET_USD`, `JARVIS_TRANSLATION_BUDGET_USD` | `3`, `1` | A day's budgets in whole dollars, kept from the first start (an admin changes them after) |
| `GUEST_CHAT`, `GUEST_NAMES_PER_VISITOR_HOUR`, `GUEST_NAMES_PER_HOUR`, `GUEST_LIVING` | `on`, `10`, `600`, `5000` | Guest chat and its limits, below |
| `ADMIN_ORIGINS` | empty | The console's sites, below |

### `server` (`server/src/config.ts`, `cards/settings.ts`, `door/settings.ts`)

The server's own defaults apply to what `compose.yaml` does not set. Compose forwards only the names in its `server` block (lines 109 to 156): a variable absent there (`CHAINS`, `NEW_ACCOUNTS_PER_HOUR`, `FIRST_TO_CHART_WORLDS`, `MODERATION_THRESHOLDS`, `NEW_ACCOUNT_HOURS`, `MUTE_*`, `JARVIS_QUOTA*`, `JARVIS_UNLIMITED`, `JARVIS_TIMEOUT_S`, `JARVIS_QUESTION_CHARS`, `JARVIS_NAMES_*`, `HUBS_FILE`, `ROLES_FILE`) cannot be set from `deploy/.env`; add it to that block first. The same holds for jarvis's block (lines 201 to 224).

| Name | Default | Allowed | Effect, and when missing |
|---|---|---|---|
| `HOST` | `127.0.0.1` (compose: the server's address) | name or address, 253 characters at most | Where the API binds |
| `PORT` | `8080` | 0 to 65535 | API port (compose: fixed `8080`) |
| `DATABASE` | required | path, 1 to 1024 characters, or `:memory:` | SQLite file (compose: `/data/gnoworld.db`, volume `server`) |
| `TRUSTED_PROXY` | none | an IP address | The one address whose forwarded visitor address is believed (compose: web's) |
| `LOG_PEPPER_FILE` | required | secret file | Section 2 |
| `ROLES_FILE` | `server/roles.json` | path | The roles file, section 6 |
| `CHAINS` | `onyx-1,gnoland-1` | comma list of chain ids, `^[a-z0-9][a-z0-9.-]{0,49}$` | Chains a login may name |
| `ORIGINS` | none | comma list of origins (scheme, host, port) | Sites a POST may come from: none, so every POST is refused |
| `NEW_ACCOUNTS_PER_HOUR` | `5` | 1 to 1000 | New accounts an hour |
| `GUEST_CHAT` | `on` | `on`, `off` | `off`: both guest routes answer 404, nothing is relayed |
| `GUEST_NAMES_PER_VISITOR_HOUR` | `10` | 1 to 1000 | New guest names an hour for one visitor |
| `GUEST_NAMES_PER_HOUR` | `600` | 1 to 10000 | New guest names an hour in all |
| `GUEST_LIVING` | `5000` | 1 to 50000 | Guests alive at once |
| `FIRST_TO_CHART_WORLDS` | unset: every world | comma list of world slugs | Worlds that can be first charted |
| `AUTH_SOCKET` | none | absolute path, 100 bytes at most | The socket Ergo's login script dials (compose: `/run/gnoworld/auth.sock`) |
| `ERGO_HOST` / `ERGO_PORT` | `127.0.0.1` / `6667` | host / 1 to 65535 | Ergo's internal listener; either set without `ERGO_OPER_PASSWORD_FILE` stops the server |
| `ERGO_OPER_PASSWORD_FILE` | none: no IRC link | secret file | Without it there is no link to Ergo |
| `ERGO_DATA` | none | absolute path, no `.` or `..` part | Ergo's data folder, measured against its cap (compose: `/ergo`, read-only) |
| `ERGO_DATA_MB` | `1024` | 1 to 1048576 | The cap; set without `ERGO_DATA` stops the server |
| `MARKETS_FILE`, `WORLDS_FILE`, `PREVIEWS_FILE` | none: no timer or job | absolute path | Files the prices timer, the worlds job and the preview job write (compose: `/markets/markets.json`, `worlds.json`, `previews.json`) |
| `UNIVERSES_FILE` | none | absolute path | The universes' data file (compose: `/app/app/data/universes.json`) |
| `HUBS_FILE` | none | absolute path | The hubs' data file; set without `UNIVERSES_FILE` stops the server. Not set by compose (finding 3) |
| `OPENAI_API_KEY_FILE` | none: no moderation | secret file | OpenAI's key |
| `MODERATION_THRESHOLDS` | `{}` | JSON, a score above 0 and at most 1 per category | A score that hides a category instead of OpenAI's own flag; `sexual/minors` always hides on OpenAI's flag. Categories: `harassment`, `harassment/threatening`, `hate`, `hate/threatening`, `illicit`, `illicit/violent`, `self-harm`, `self-harm/instructions`, `self-harm/intent`, `sexual`, `sexual/minors`, `violence`, `violence/graphic` |
| `NEW_ACCOUNT_HOURS` | `24` | 1 to 720 | How long an account is "new" |
| `MUTE_STRIKES`, `MUTE_WINDOW_MINUTES`, `MUTE_MINUTES`, `MUTE_MAX` | `3`, `10`, `5`, `50` | up to 99, 1440, 10080, 100 | Hidden `STRIKES` times in `WINDOW` minutes mutes for `MINUTES`, `MAX` mutes at once a world (Ergo's ban list holds 100 a room) |
| `LINK_CARDS`, `LINK_READER_URL` | `0`, none | `0`, `1`, empty; `http://<name>[:port]` | Section 4 |
| `JARVIS_URL` | none: no door | https or http origin | Jarvis's address; any other `JARVIS_*` set without it stops the server |
| `JARVIS` | off | exactly `on` | Any other value or none is off, never an error |
| `JARVIS_DOOR_KEY_FILE` | none | secret file | Required once `JARVIS=on` |
| `JARVIS_TIMEOUT_S` | `900` | 1 to 900 | How long the door waits for an answer |
| `JARVIS_QUESTION_CHARS` | `500` | 1 to 8000 | A question's length |
| `JARVIS_QUOTA`, `JARVIS_QUOTA_UNNAMED` | `20`, `5` | 1 to 1000 | First values of a day's questions per account (named, unnamed); the database keeps them after the first start |
| `JARVIS_UNLIMITED` | none | comma list of addresses, 1000 at most, no duplicate | Accounts with no quota (first value) |
| `JARVIS_NAMES_RPC`, `JARVIS_NAMES_CHAIN` | `https://rpc.gno.land`, `gnoland-1` | https origin; chain id | Where an account's name is read, and the chain id that node must name |
| `ADMIN_PORT` | none: no admin API | 0 to 65535 | Admin API's own listener (compose: `8082`); `ADMIN_HOST` or `ADMIN_ORIGINS` without it stops the server |
| `ADMIN_HOST` | `127.0.0.1` (compose: the admin address) | host | Where it binds |
| `ADMIN_ORIGINS` | none | origins | The console's sites; one on a host of `ORIGINS` is refused (cookies ignore scheme and port) |
| `HTTPS_PROXY`, `NO_PROXY`, `NODE_USE_ENV_PROXY` | compose | | Node's own: the way out. Compose sets them; `NO_PROXY` lists `ergo,jarvis,link_reader,localhost,127.0.0.1` |

### `jarvis` (`jarvis/src/config.ts`, `tracing.ts`, `model.ts`)

Read on or off: `JARVIS` (exactly `on`), `JARVIS_HOST` (default `127.0.0.1`), `JARVIS_PORT` (`8081`), `JARVIS_HOSTNAMES` (`127.0.0.1,localhost`; the names a request's Host may give), `JARVIS_DATABASE` (required, absolute path), `JARVIS_DOOR_KEY_FILE` (required when on), `JARVIS_BUDGET_USD` (1 to 500, `3`), `JARVIS_TRANSLATION_BUDGET_USD` (1 to 500, `1`), `JARVIS_DRAIN_S` (1 to 600, `20`).
Read when on alone:

| Name | Default | Allowed | Effect |
|---|---|---|---|
| `ANTHROPIC_API_KEY_FILE` | required | secret file | Anthropic's key |
| `JARVIS_QUESTION_CHARS` | `2000` | 1 to 8000 | A question's cap at jarvis |
| `JARVIS_TURNS` | `4` | 1 to 4 | Model turns of one question |
| `JARVIS_OUTPUT_TOKENS` | `1000` | 1 to 1000 | Output tokens of a call |
| `JARVIS_CALL_TIMEOUT_S` | `60` | 1 to 600 | A model call's time |
| `JARVIS_RETRIES` | `2` | `0`, `1`, `2` | Retries of a call |
| `JARVIS_TOOL_RESULT_KIB` | `16` | 1 to 64 | A tool result's size |
| `JARVIS_MODEL`, `JARVIS_MODEL_FAST`, `JARVIS_MODEL_DEEP` | `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5` | the models of `jarvis/src/prices.ts` | The answering, sorting and hard-code models |
| `JARVIS_GNOSCOPE` | off | `on`, `off` | gnoscope's tools |
| `JARVIS_GNOSCOPE_URL` | `https://gnoscope.com/mcp` | https, no credentials | gnoscope's server |
| `JARVIS_GNOSCOPE_TIMEOUT_S` | `10` | 1 to 60 | A gnoscope call's time |
| `JARVIS_GNOSCOPE_NETWORKS` | `mainnet,onyx` | gnoscope's network names | Networks its tools may name |
| `JARVIS_DATA_DIR`, `JARVIS_SKILLS_DIR` | `app/data`, `jarvis/skills` | absolute path | The places' data and the skills' folders |
| `JARVIS_GNOMCP_ADDRESS` | none | `host:port` | The reader's bridge (compose: reader address `:8083`); replaces the two below |
| `JARVIS_GNOMCP_COMMAND`, `JARVIS_GNOMCP_CONFIG` | none | absolute path | A gnomcp child it spawns; both required without the address |
| `JARVIS_PROFILES` | required | comma list of profile names | Chain profiles gnomcp may read (compose: `onyx,gnoland`) |
| `JARVIS_INDEXER_PROFILES` | none | each in `JARVIS_PROFILES` | Those with an indexer |
| `JARVIS_TRACES_URL` | none: no export | http or https URL | OTLP/HTTP collector for Jarvis's traces. Not in compose or `.env.example` (finding 2) |

`ANTHROPIC_CUSTOM_HEADERS`, if set in jarvis's environment, stops it (`model.ts` line 29): it would add headers to every request.

### `link_reader` (`link-reader/src/config.ts`)

| Name | Default | Allowed | Effect |
|---|---|---|---|
| `LINKS_LISTEN` | required | `host:port` | Where it listens (compose: its address, port `8084`) |
| `LINKS_PROXY` | required | `host:port` | The link way out (compose: `guard:4754`); empty is refused |
| `LINKS_DIRECT` | unset | `1` | Development only: no proxy, and `LINKS_PROXY` must then be unset |
| `LINKS_MAX` | `2` | 1 to 16 | Pages served at once |

### `jarvis_reader` (`deploy/jarvis-reader/main.go` line 43; compose lines 267 to 275)

All required: `READER_LISTEN` (`host:port`), `READER_PROXY` (`guard:4753`), `READER_HOSTS` (comma list, the four chain hosts), `READER_GNOMCP` (the binary), `READER_CONFIG` (its profiles file), `READER_MAX` (whole number, 1 at least; `2`). Without one the reader stops.

### `ergo`, `guard`, `tailscale`, app tooling

- `ergo` (compose lines 69 to 74): `SERVER_NAME`, `ORIGINS`, `PROXY_FROM` (web's address), `INSIDE_SUBNET`, `AUTH_SOCKET`.
- `guard` (lines 348 to 355): `JARVIS_OUT_ADDRESS`, `READER_OUT_ADDRESS`, `LINKS_OUT_ADDRESS` (it stops without them), `XTABLES_LOCKFILE`.
- `tailscale` (lines 509 to 519): `TS_AUTHKEY` (file), `TS_HOSTNAME`, `TS_AUTH_ONCE`, `TS_EXTRA_ARGS` (the tag), `TS_STATE_DIR`, `TS_USERSPACE`, `TS_SOCKET`, `TS_SERVE_CONFIG`, `TS_ENABLE_HEALTH_CHECK`, `TS_LOCAL_ADDR_PORT`: Tailscale's own, fixed by compose.
- Development and tests only: `GNOWORLD_DATA`, `GNOWORLD_BUILD`, `WORKSHOP_HOSTS`, `WORKSHOP_API_PORT`, `WORKSHOP_WS_PORT`, `WORKSHOP_DATA_DIR`, `GNOWORLD_TOOLS`, `VITE_GNOWORLD_TEST_GPU`, `JARVIS_TEST_OUTBOUND`, `LEAK` (section 7 and the files named there).

## 4. Feature switches and their profiles

| Switch | Off by default | To turn on | Undo |
|---|---|---|---|
| Guest chat | on by default | `GUEST_CHAT=off` is the undo: read-only guests | remove the line |
| Link cards | `LINK_CARDS=0` | `LINK_CARDS=1` in `.env`, and `--profile links` beside `--profile demo`. The server stops at start with `LINK_CARDS=1` and no `LINK_READER_URL` (compose sets it) | `LINK_CARDS=0` |
| Jarvis | `JARVIS=off` | The evals gate (D13987) passes, then `sh deploy/jarvis-on.sh`, which writes `JARVIS=on` in `deploy/.env` only then (never by hand); then `--profile jarvis` beside `--profile demo`. Without the profile the door answers `not_ready` | `JARVIS=off`, drop the profile |
| gnoscope tools | `JARVIS_GNOSCOPE=off` | `JARVIS_GNOSCOPE=on` | `off` |
| Admin API | off without `ADMIN_PORT` | compose sets port `8082` on its own network; `ADMIN_ORIGINS` names the console | empty `ADMIN_ORIGINS` |

Profiles (compose): `demo` (guard, egress, tailscale), `jarvis` (jarvis, jarvis_reader, egress_jarvis, egress_reader), `links` (link_reader, egress_links). `web`, `ergo` and `server` have none and start with any profile.
The evals gate is `deploy/jarvis-evals-gate.py` (`python3 -I deploy/jarvis-evals-gate.py evals/results evals/cases`): see `docs/OPERATIONS.md`, "Switching Jarvis on".

## 5. Limits and thresholds

| Where | Limit | Value | Source |
|---|---|---|---|
| Moderation | a card's `sexual` score hides it from | 0.3, never above the lines' own threshold | `cards/settings.ts` line 6 |
| Moderation | mute | section 3 (`MUTE_*`) | `config.ts` |
| Rules of a world | links, mentions per message; links for a new account | 3, 5, 2 (defaults) | `server/roles.json` |
| Jarvis | question, answer, buttons, quota, dollars, unlimited accounts (ceilings) | 8000, 8000, 5, 1000, 500, 1000 | `packages/schemas/src/jarvis.ts` line 81 |
| Jarvis | the door's and the page's wait | 900 s, 910 s | same, line 93 |
| Jarvis | room lines carried to a question | 30 lines, 8192 bytes | same, line 96 |
| Jarvis | memory | 384 MiB, heap 268 MiB (70%), 128 processes | `compose.yaml` lines 230 and 231; `deploy/jarvis/Dockerfile` line 32 |
| Cards | title, description, site, host, picture, side | 200, 500, 100, 253 characters; 16384 bytes; 160 px | `packages/schemas/src/cards.ts` line 10 |
| Link reader | a page, a picture (bytes, time) | 256 KiB and 5 s, 1 MiB and 5 s | `link-reader/src/fetch.ts` line 39 |
| Link reader | a picture's side, pixels | 64 to 4096 px, 2,000,000 px at most (D13943) | `link-reader/src/picture.ts` lines 34 to 36 |
| Link reader | memory | 256 MiB, 48 processes, measured peak 210 MiB (F13951) | `compose.yaml` lines 303 to 321 |
| Link way out | tunnels | 32 (smokescreen's `max_concurrent_connect_tunnels`) | `deploy/egress/config.yaml` |
| Search | lines kept per room, rows in all, edits per line | 2048, 400000, 50 | `server/src/search/index.ts` lines 15 to 18 |
| Search | requests a minute per visitor, per account; a second in all | 20, 60, 10 | `server/src/search/routes.ts` lines 19 to 22 |
| Search | words, results counted, matches | 8, 1000, 5000 | `server/src/search/query.ts` lines 29 to 32 |
| Guest | a line's length | 280 characters, 400 bytes | `server/src/guest/rules.ts` |
| nginx | requests a visitor | 20 a second, burst 640 (Alexis, F3665) | `deploy/web/nginx.conf` lines 44 and 97 |
| nginx | login | 1 a second, burst 20, besides the server's 10 a minute | lines 46 and 191 |
| nginx | connections a visitor, per worker | 32; 4096 | lines 98 and 12 |
| nginx | API body | 16 KiB | line 184 |
| nginx | timeouts | header and body 10 s, keep-alive 15 s; API stream and `/ws` 1 h | lines 52 to 54, 170, 186 |
| Egress | connect, idle | 10 s, 60 s; 32 tunnels and requests | `deploy/egress/config.yaml` |
| Containers | cpus, memory, processes | web 0.5, 128m, 64; ergo 0.4, 512m, 1024; server 0.4, 512m, 128; jarvis 0.3, 384m, 128; reader 0.2, 160m, 48; links 0.2, 256m, 48; guard 0.1, 32m, 16; egress 0.1, 64m, 64; egress_reader and egress_links 0.1, 48m, 32; tailscale 0.5, 256m, 128 | `compose.yaml` |

## 6. Data files and what editing each changes

| File | Holds | Editing it |
|---|---|---|
| `server/roles.json` | `team`, `trusted` (addresses), `defaults` (rules), `worlds` (each slug with `moderators` and `rules`, and optional groups and room types) | Who may do what: read whole in review. Read at the server's start: restart `server` |
| `app/data/universes.json` | The chains: `id`, `name`, `chainId`, `rpc`, `gnoweb`, `indexer`, `testnet`, one `default` | The chains the app and the server read. Its hosts must match `deploy/egress/acl.yaml`, `jarvis-acl.yaml`, `reader-acl.yaml`, `READER_HOSTS` and `extra_hosts`: tests fail when they differ. Rebuild |
| `app/data/hubs.json` | The worlds: slug, name, description, universe, realms, actions, kind | Which worlds exist and what they offer. Rebuild |
| `app/data/{bubbles,earthOrbit,earthRooms,ecosystems,events,expedition,genres,news,onAir,quests}.json` | Content of the home, Earth and the quests | What the pages show. Rebuild |
| `deploy/egress/acl.yaml`, `jarvis-acl.yaml`, `reader-acl.yaml`, `links-acl.yaml` | The hosts each way out allows (`links-acl.yaml`: any public https host, `action: open`) | What a service may reach. Restart its egress service |
| `deploy/egress/config.yaml` | smokescreen's limits | Section 5 |
| `deploy/tailscale/serve.json` | Funnel on 443, terminated, forwarded to `web:8080` with the PROXY protocol | How the demo is public. Change with `docs/OPERATIONS.md` |
| `evals/results/`, `evals/cases/` | Jarvis's evals | The gate of `JARVIS=on` |

## 7. The app's build-time settings

The app reads no `VITE_*` setting for production. What it reads:

| Name | Where | Effect |
|---|---|---|
| `GNOWORLD_DATA` | `app/react-router.config.ts` line 14, `app/vite.config.ts` line 55 | The data folder (default `app/data`) |
| `GNOWORLD_BUILD` | `app/react-router.config.ts` line 26 | The build folder (default `build`) |
| `import.meta.env.BASE_URL`, `MODE`, `PROD` | `app/src/` | Vite's own: the base path of the files and of the data, the mode |
| `VITE_GNOWORLD_TEST_GPU` | `app/src/features/universe/gpu.ts` line 24 | `1`: lets a test use the GPU path outside development |
| `WORKSHOP_HOSTS`, `WORKSHOP_API_PORT`, `WORKSHOP_WS_PORT`, `WORKSHOP_DATA_DIR` | `app/vite.config.ts` lines 91 to 149 | The workshop's dev server |

## 8. Not configurable, and where it is fixed

| What people look for | Where it is fixed |
|---|---|
| The CSP of each page | built from the app: `app/src/csp.ts`, `/etc/nginx/csp.conf` |
| Security headers (`noindex`, `nosniff`, `no-referrer`) | `deploy/web/nginx.conf` lines 104 to 110 |
| Cache lifetimes (hashed files a year; the data files a minute) | `nginx.conf` lines 71 to 90 |
| The link reader's URL rule (https, 443, three redirects) | `link-reader/src/url.ts`, `fetch.ts` |
| Jarvis's price table and its allowed models | `jarvis/src/prices.ts` |
| The demo password's name `team`, the Funnel port 443 | `docs/OPERATIONS.md`; `deploy/tailscale/serve.json` |
| The ports 8080, 8081, 8082, 8083, 8084, 4750 to 4754, 6667, 8097 | `deploy/compose.yaml`, `nginx.conf`, `deploy/guard/guard.sh`, `deploy/egress/` |
| The retention of Jarvis's kept explanations (7 days) | server database; `docs/OPERATIONS.md` |
| Ergo's own configuration | rendered at its start from the variables above: `deploy/ergo/` |
| Whether the container is read-only, capabilities, restart | `x-locked` in `compose.yaml` (lines 9 to 17) |

## Not verified here

Values of `deploy/ergo/`, `deploy/guard/guard.sh` rules beyond the header, `deploy/web/Dockerfile`'s generated `csp.conf`, and `retention` and `jobs` intervals (prices every 5 minutes, worlds every half hour, previews every six hours) are taken from the comments of `compose.yaml` and `nginx.conf`, not from the code that runs them.
