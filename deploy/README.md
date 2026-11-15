# deploy

The stack's images, its Compose file, the guard and its ways out, and the checks that prove them. Everything the stack needs
is here, apart from the secrets, which are files in `deploy/secrets/` (git ignores them).

The runbook is [docs/OPERATIONS.md](../docs/OPERATIONS.md). Every setting, secret and switch is in
[docs/CONFIGURATION.md](../docs/CONFIGURATION.md). Running the stack for testers is [docs/DEMO.md](../docs/DEMO.md).

## What is here

| Path | What it is |
| --- | --- |
| `compose.yaml` | The stack: services, networks, volumes and secrets. Its header has the start command. |
| `.env.example` | Every setting `compose.yaml` reads, commented out. Copy it to `deploy/.env`. |
| `web/` | `Dockerfile` (the client built, served by nginx as an unprivileged user) and `nginx.conf` (password, limits, headers, proxies to Ergo and the server). |
| `server/` | `Dockerfile` of the server: Node 24 on a distroless image. |
| `ergo/` | The chat: `Dockerfile`, `ircd.yaml.tmpl`, `render.sh` (renders the config at start), `VERSION` (Ergo's tag and digest). |
| `guard/` | `guard.sh`: the only network that lets traffic out. It refuses every private address and allows public TCP 80 and 443. |
| `egress/` | The proxies behind the guard (smokescreen): `Dockerfile`, `config.yaml`, and one host list for each way out: `acl.yaml`, `jarvis-acl.yaml`, `reader-acl.yaml`, `links-acl.yaml`. |
| `jarvis/` | `Dockerfile` of Jarvis and `gnomcp.toml`, its chain profiles. |
| `jarvis-reader/` | gnomcp in a container of its own: a bridge and a relay in Go, with their tests. |
| `link-reader/` | `Dockerfile` of the link reader, which fetches a public page for a chat line's card. |
| `probe/` | A small Go program for health checks: it exits 0 when something listens on `host:port`. |
| `k6/` | `run.sh`, the load runs, in a stack of its own (project `gnoworld-load`). |
| `test.sh` | The stack's checks. It sources `test-jarvis.sh` and `test-links.sh`. |
| `jarvis-on.sh`, `jarvis-evals-gate.py` | Switch Jarvis on, and only when the last evals result passes the gate. |

## Run and stop

Run every command from the repository's root, on a host with Docker Engine 28 or later. Before the first start, do "Before the
first start" in the runbook: the secret files and `deploy/.env`.

```sh
docker compose -f deploy/compose.yaml up -d --build                     # web, ergo, server, guard, egress
docker compose -f deploy/compose.yaml --profile jarvis up -d --build    # with Jarvis (JARVIS=on)
docker compose -f deploy/compose.yaml --profile links up -d --build     # with the link cards (LINK_CARDS=1)
docker compose -f deploy/compose.yaml --profile jarvis --profile links logs -f
docker compose -f deploy/compose.yaml --profile jarvis --profile links down       # stop; add -v to remove the volumes
```

## The checks

- `sh deploy/test.sh` starts the stack in a throwaway project with a password of its own, checks it, then removes it.
- `sh deploy/test.sh --mutants` runs the same checks against faults planted one at a time. Each must fail.
- `sh deploy/k6/run.sh [logins|crowd|streams|messages]` runs the load scenarios.

`test.sh` needs Docker's socket, so it runs on the host, outside Claude Code's sandbox. Run it from a checked copy of the commit
you reviewed (runbook, "Run test.sh from the commit you reviewed"). Its output names the host's addresses and ports: never commit
it or paste it in public. Exit codes: 0 all passed, 1 a check failed, 2 a tool or a fact of the host is missing, 3 the stack did
not start.

## The switches

- **Jarvis** is off unless `JARVIS=on` in `deploy/.env`. Switch it on with `sh deploy/jarvis-on.sh`, never by hand, then start the
  `jarvis` profile. The order is in the runbook, "Switching Jarvis on".
- **The link cards** are off unless `LINK_CARDS=1` in `deploy/.env`. Start the `links` profile with it. See the runbook,
  "Switching the link cards on".

## Public access

Nothing publishes the stack: `web` listens on an internal network. The public TLS front comes with the automatic deploy's part
(D13172).
