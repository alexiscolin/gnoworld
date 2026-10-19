# Slice 1c: the demo stack

Status: approved by Alexis, 2026-10-18, then grown by his decisions (`docs/decisions.md`): the guard, confidentiality
first, any Docker host. The last merge of slice 1. Read first: `slice-1.md`, ADR-0002 §7 (lines 978-1066), and what
`slice-1b-2.md` §2 deferred here.

## 1. Done when

From the backlog's row, word for word: "a demo container cannot reach its host's services".
From `slice-1.md` §3: the hardening is read back with `docker inspect`; a burst answers 429 and
the host stays idle; the secrets are gitignored and denied to Claude. From 1b-2: `sw.js` and the
HTML always revalidated (`Cache-Control: no-cache`), `/assets/*` immutable. This plan adds:
- one command starts the demo on any Docker host (Linux Engine 28+, Docker Desktop, OrbStack),
  binds no host port, and publishes the site through Funnel behind a password, with `noindex`;
- the visitor's real address reaches the static server (PROXY protocol), so the 429 is per visitor;
- from inside the demo, no service of the host, its LAN, Docker's gateways or a tailnet answers;
- the PWA installs and updates behind the password; one command cuts the public URL;
- no file names a host, an address, a port, a network or a tailnet.

## 2. Out of scope

The egress proxy for services that call out, `NODE_USE_ENV_PROXY` and smokescreen: slice 3's,
where they share the guard's list of refused ranges. Also slice 3's: Ergo, `server`, Grafana, the
distroless Node images. The CSP (with the first third party, `slice-1.md` §2). The self-updater,
the registry, signing, SBOMs (with a remote). A domain.

## 3. Threat model

| Asset | Threat | Mitigation | Proof (`deploy/test.sh`) |
|---|---|---|---|
| The demo's host | The static server reaches the host or the LAN | `web` on `inside`: internal, and its gateway isolated (measured: an internal network's gateway answered on the host's side); non-root, read-only, no capability, no host port, capped | From `inside`: the host's ports by every address, the router, the LAN, every Docker gateway, a canary on the host, and the internet fail; `web:8080` answers |
| The demo's host | Tailscale, which needs the internet, reaches the host | `guard` holds its network: deny by default, private, local, carrier and reserved ranges refused, IPv6 closed; Tailscale keeps no capability | The same probes from the guard's network: all fail but the internet; the guard's faults, planted, fail the test |
| A tailnet | The demo's machine reaches other devices | A tailnet of its own, a tagged key, a policy that lets the tag reach nothing; 100.64.0.0/10 refused | `--demo`: the machine sees no peer, carries the tag, runs |
| The secrets | A key or the password in the repo, an image or a log | `deploy/secrets/` (gitignored, out of the build, denied to Claude), read as files | `git check-ignore`; no secret file in the image; no copy in `docker inspect` or the logs |
| The public URL | Flooding; indexing; the host found | Basic auth; 429 per visitor; caps; `noindex`; Funnel hides the host; an off switch | Bursts with no, a wrong and the right password get 429; a visitor's first load gets none |

## 4. Cost

No hot path: nginx serves files. The images: about 9 MB (nginx) and 64 MB (Tailscale, twice used).

## 5. Scale

One host, capped at 2 cores and 2 GB. Slice 3 puts its outbound services behind the same guard.

## 6. Tests, by level

The sandbox refuses Docker's socket by design, so `deploy/test.sh` runs on the host (macOS or
Linux), by the operator; Claude writes it and reads its output, never committed. Default: `web`
and `guard` with a password of their own, no Tailscale key: the hardening read back, the probes
above (a canary first, or the probe is blind), the headers and types per path, 401s, 429s.
`--mutants`: 34 planted faults (the network, the hardening, the caps, the guard's rules, the rate
limit, the password, the headers, the fallback, the types, the logs, the PROXY protocol), each
killed by the check it names; those that would hand a container the host are not planted. `--demo`:
Tailscale, its tailnet and the public URL. In the gate: the manifest read behind a password
(Playwright). semgrep's Dockerfile and Compose rules in `/pre-merge`.

## 7. Files

New: `deploy/compose.yaml`, `deploy/.env.example`, `deploy/web/Dockerfile` and `nginx.conf`,
`deploy/guard/guard.sh`, `deploy/tailscale/serve.json`, `deploy/test.sh`, `.dockerignore`,
`docs/OPERATIONS.md`. Changed: `app/src/root.tsx` (the manifest's credentials), the journeys.
No tier-1 file; `deploy/` is security-sensitive, so `/pre-merge` adds the security reviewer.

## 8. Dependencies (read on the registries, 2026-10-18)

- `nginxinc/nginx-unprivileged:1.30.6-alpine-slim`, `sha256:4ac59c85…77a3` (nginx stable; BSD-2).
- `tailscale/tailscale:v1.104.1`, `sha256:87c55d6b…c41d` (BSD-3), for Tailscale and the guard.
- `node:24.22.0-alpine`, `sha256:44fce696…937f`, the client's build stage.
- For the tests: `curlimages/curl:8.23.0`, `sha256:a134550b…ac06`.

## 9. Questions for Alexis

Answered on 2026-10-18 (`docs/decisions.md`): the egress proxy waits for slice 3; the guard, with
`NET_ADMIN` as an exception; nginx; semgrep in `/pre-merge`; the client built inside its image;
confidentiality first; any Docker host. The operator creates the key, the policy and the password.
