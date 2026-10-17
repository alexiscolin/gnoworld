# Slice 1 — skeleton, routes, the gate and CI

Status: plan, waiting for Alexis's approval (2026-10-17).

Three merges, each under about 400 lines of diff and each with its own `/pre-merge`:
**1a** the monorepo and the gate; **1b** the app's routes, pre-rendering and PWA; **1c** the
demo stack. CI and the automatic deployment wait for a remote (backlog).

## 1. Done when

The backlog's tests, word for word: `/` and one `/w/:world` pre-render with their own title,
description, canonical and Open Graph tags; a forbidden import fails lint; an import cycle
fails lint; the compiler flags of `docs/ARCHITECTURE.md` are on; a page over budget fails
the gate; the PWA installs and asks before updating; a demo container cannot reach the
homelab's services. This plan adds:
- the fast gate (the Stop hook and pre-commit) stays under 60 s; the full set runs in `/pre-merge`;
- `pnpm install` runs no package script, and the lockfile is frozen;
- gitleaks finds no secret in the whole history before the first push, then runs on each staged change; semgrep runs in `/pre-merge`;
- Claude Code's sandbox is on, and the gate passes inside it;
- `core/irc`'s tests are committed `test.fails`, and StrykerJS records `core`'s first score as its floor.

## 2. Out of scope

Any feature, the design system (slice 2), Ergo and the server (slice 3), a hosted CI, the
auto-deployment, the CSP (it arrives with the first third party).

## 3. Threat model

| Asset | Threat | Mitigation | Proof |
|---|---|---|---|
| The homelab | A demo container reaches its services or the host | Internal networks; the only exit is the egress proxy, which refuses private addresses; no Docker socket, no privilege, every capability dropped, read-only root, caps of 2 cores and 2 GB | A test from inside the demo: n8n through `host.docker.internal`, the LAN and the host's ports all fail; the proxy allows only its list |
| This machine | A package's install script, or an agent misled by repo content | pnpm runs no scripts and refuses packages younger than a day; the sandbox limits writes to the project and the network to a list | `pnpm install` output; a sandboxed write outside the project is refused |
| The demo's secrets | The Tailscale key or the demo password in the repo or a log | `*_FILE` secrets in `deploy/secrets/`, gitignored and unreadable by Claude Code | `git check-ignore`; `deny` rules in `.claude/settings.json` |
| The public URL | Flooding | Caps; rate limits at the proxy; `noindex`; the shared password | A burst test answers 429, the host stays idle |

## 4. Cost

The one hot path is `core/irc`'s parser, per message: a bench parses 10,000 recorded lines,
and its budget is set from the first measurement. The gate's own time is a budget too.

## 5. Scale

The first limit is the gate's time as the code grows. Next step: ESLint's cache, `vitest
--changed`, StrykerJS's incremental mode.

## 6. Tests, by level

- **Unit:** `core/irc`, the IRCv3 line and tag parser: tag escaping, the 512-byte and
  8,191-byte limits, malformed lines; properties with fast-check (serialize, then parse,
  gives back the message). Committed `test.fails`: **Alexis writes the parser** (`.claude/rules/core.md`).
- **The harness probe:** fixtures the gate must refuse: a forbidden import, a cycle, an empty
  `catch`, a log-only `catch`, a rethrow without `cause`, a floating promise, a copied block,
  an unused export, a near-copy of an existing function with its names changed, a block
  module that lays out with `display: flex` and `gap`, and two modules sharing the same
  three declarations.
- **End-to-end:** the two pages' tags; the PWA's install and its update prompt; axe on both.
- **Budgets:** JavaScript before the first screen, total size, Lighthouse.
- **Mutation:** StrykerJS on `core`; `mutate.py` stays for realms.
- **Infrastructure:** the isolation test, the hardening read back with `docker inspect`, the burst test.
- **Hooks:** `test_hooks.sh` covers the new `eslint --fix` hook.

## 7. Files

New: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.ts`,
`app/`, `packages/core/src/irc/`, `deploy/compose.yaml`, `deploy/.env.example`,
`.claude/hooks/` (the format hook). Changed: `scripts/check.sh` (fast and full),
`.claude/settings.json` (the sandbox, the hook), `docs/DEVELOPMENT.md`. Security-sensitive:
`deploy/` (the security reviewer reads it). **Alexis writes** `packages/core/src/irc/`.

## 8. Dependencies to ask for (read on npm on 2026-10-17)

- **1a:** pnpm 12.14.0; typescript 6.0.3 (typescript-eslint 8.71.2 caps it below 6.1; TypeScript 7.0.2 waits); eslint 10.13.0; typescript-eslint 8.71.2; eslint-plugin-import-x 4.17.1 (cycles); vitest 5.0.5 with @vitest/coverage-v8; fast-check 4.10.2 with @fast-check/vitest 0.5.0; @stryker-mutator/core, vitest-runner and typescript-checker 10.0.0; knip 6.41.0; jscpd 5.4.1 (copies); @eslint/css 2.0.1 (CSS linted by ESLint itself; it replaces stylelint and its three plugins), with `scripts/check_css.py` for tokens, unused classes, layout kept in compositions and copied rules. CUBE CSS: approved (2026-10-17).
- **1b:** react and react-dom 19.3.1; react-router and @react-router/dev 8.4.0; vite 8.3.4; @vitejs/plugin-react 6.1.2 with babel-plugin-react-compiler 1.0.0 (ADR-0002 §8's compiler check); vite-plugin-pwa 2.0.0; vite-css-modules 1.16.0 (typed modules); eslint-plugin-react-hooks 7.1.1; jsdom 30.1.3; @testing-library/react 16.3.3; @playwright/test 1.64.1; @axe-core/playwright 4.14.0; lighthouse 13.5.0 (@lhci/cli's last release is 0.15.1, from June 2025).
- **Tools, as binaries (Homebrew and CI), not packages:** gitleaks 8.30.1 (MIT); semgrep 1.181.0 (LGPL-2.1, its community rules); similarity-ts 0.5.0 (crates.io, AST clones).
- **1c (images, pinned by digest):** Node 24 distroless, the static server, Tailscale, the egress proxy (chosen and verified in 1c).

## 9. Questions for Alexis

1. Three merges (1a, 1b, 1c) rather than one? **Yes.**
2. A fast gate for the Stop hook and pre-commit, the full set in `/pre-merge`? **Yes.**
3. Move the load-testing tool (k6) to slice 3, where Ergo first needs it? **Yes.**
4. The sandbox in the project's settings, so it applies to every session in this repo?
5. You create the Tailscale auth key and the demo password, as files in `deploy/secrets/`; Claude never reads them. Agreed?
