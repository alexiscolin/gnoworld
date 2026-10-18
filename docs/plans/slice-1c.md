# Slice 1c: the demo stack

Status: approved by Alexis, 2026-10-18, every answer as recommended. The last merge of slice 1, under about 400 lines. Read first: `slice-1.md`,
ADR-0002 §7 (lines 978-1066), what `slice-1b-2.md` §2 deferred here, and the decisions and ledger rows naming 1c.

## 1. Done when

From the backlog's row, word for word: "a demo container cannot reach the homelab's services".
From `slice-1.md` §3: the hardening is read back with `docker inspect`; a burst answers 429 and
the host stays idle; the secrets are gitignored and denied to Claude. From 1b-2: `sw.js` and the
HTML always revalidated (`Cache-Control: no-cache`), `/assets/*` immutable. This plan adds:
- the demo starts with one command, `docker compose --profile demo up -d`, binds no host port,
  and publishes the site through Tailscale Funnel behind the shared password, with `noindex`;
- the visitor's real address reaches the static server (PROXY protocol), so the 429 is per visitor;
- from inside the demo, the Mac's services, the LAN and Alexis's other tailnet devices do not answer;
- the PWA installs and updates behind the password (the manifest and `sw.js` fetched with it).

## 2. Out of scope

The egress proxy: nothing in 1c calls out, so the static server sits on an `internal` network
with no way out at all, which proves more than a proxy's list; the proxy, `NODE_USE_ENV_PROXY`
and smokescreen come with slice 3's services. Also slice 3's: Ergo, `server`, Grafana, the
distroless Node images, PROXY protocol to them. The CSP (with the first third party,
`slice-1.md` §2). The self-updater, the registry, signing, SBOMs (with a remote). A domain.

## 3. Threat model

| Asset | Threat | Mitigation | Proof (`deploy/test.sh`) |
|---|---|---|---|
| Alexis's Mac | The static server reaches the host or the LAN | `web` on an `internal` network only; non-root, read-only root, `tmpfs` for `/tmp`, every capability dropped, no new privileges, no host port, caps (2 cores, 2 GB, pids) | A throwaway container on that network: `host.docker.internal`, the gateway, the LAN and `1.1.1.1` fail, `web:8080` answers; `docker inspect` reads each setting back |
| Alexis's Mac | The Tailscale container, which needs the internet, reaches the host | Alone on its own bridge network and on `internal`; the same hardening where userspace networking allows it (to check first) | The same probes from its bridge network; what answers is reported, and a host answer stops the merge |
| His tailnet | The demo's machine reaches his devices | A tagged auth key; the policy lets the tag reach nothing, with Funnel's `nodeAttr` | From the container, `tailscale ping` to his other devices fails |
| The secrets | The auth key or the password in the repo or a log | Files in `deploy/secrets/` (gitignored, denied to Claude), read as `file:` and `auth_basic_user_file` | `git check-ignore`; `docker inspect` holds no secret value |
| The public URL | Flooding; indexing | Basic auth; `limit_req` per PROXY address, 429; `X-Robots-Tag: noindex` | A burst from one address gets 429, another address still 200 |

## 4. Cost

No hot path: nginx serves files. The images: about 9 MB (nginx) and 64 MB (Tailscale).

## 5. Scale

One machine, capped at 2 cores and 2 GB. Slice 3 adds its services behind the same front.

## 6. Tests, by level

The sandbox refuses Docker's socket by design, so the infrastructure tests are a script Alexis
runs (`sh deploy/test.sh`), as he runs the hooks; Claude writes it, reads its output, and the
review card says so. It checks, with busybox and curl pinned by digest: the isolation above, the
hardening read back, the headers and types per path, the 404 fallback, 401 without the password,
the 429 burst (curl's `--haproxy-clientip`). In the gate: semgrep's Dockerfile and Compose rules
if Alexis approves the tool (Q4). The PWA behind the password: first a check in Chromium of
whether the manifest and `sw.js` carry the password; if the manifest does not, its link gets
`crossorigin="use-credentials"`, with a unit test.

## 7. Files

New: `deploy/compose.yaml`, `deploy/.env.example`, `deploy/web/Dockerfile` and `nginx.conf`,
`deploy/tailscale/serve.json`, `deploy/test.sh`, `docs/OPERATIONS.md` (its first runbook: each
service, its limits, its secrets, start, stop and removal). Maybe `app/src/root.tsx` (Q in §6).
No tier-1 file; `deploy/` is security-sensitive, so `/pre-merge` adds the security reviewer.

## 8. Dependencies to ask for (read on the registries, 2026-10-18)

- `nginxinc/nginx-unprivileged:1.30.6-alpine-slim`, `sha256:4ac59c85…77a3` (nginx stable; BSD-2).
- `tailscale/tailscale:v1.104.1`, `sha256:87c55d6b…c41d` (BSD-3), userspace networking.
- For the tests: `busybox:1.38.0-musl`, `sha256:ea2b9914…be8`; `curlimages/curl:8.23.0`, `sha256:a134550b…ac06`.
- The client built inside the image, or copied from the host's build (Q5): the builder `node:24.22.0`, digest read when written.

## 9. Questions for Alexis

Answered on 2026-10-18 (`docs/decisions.md`): the egress proxy waits for slice 3; Tailscale alone
on its own bridge network, tested; nginx; semgrep's registry rules in `/pre-merge` only; the
client built inside its image. Alexis creates the key, the policy lines and the password file.
