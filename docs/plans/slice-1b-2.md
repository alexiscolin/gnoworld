# Slice 1b-2: the PWA and the budgets

Status: approved by Alexis, 2026-10-18: the PWA now, and what else is needed, without touching
the gate (the harness is frozen). The second merge of 1b, under about 400 lines of product code.

## 1. Done when

From slice 1's plan, word for word: "a page over budget fails the gate; the PWA installs and
asks before updating". The budget is a journey, which the gate already runs. Then, ADR-0001
§12's PWA rules:
- Chromium reports the built site installable: a manifest, its icons, a service worker;
- only the app's hashed files are precached, and the worker caches nothing at run time;
- updates are explicit: a new worker waits, "New version, reload" shows, the page changes
  only after the click;
- no service worker in development; `?nosw` unregisters it;
- the two pages stay within ADR-0001 §12's budgets: at most 150 KB of compressed JavaScript
  before the first usable screen, 3 MB in all.

## 2. Out of scope

Waiting for the gate to move (it is frozen): Lighthouse, the check that every test kills a
mutant, and F106's planted build failures. Later slices: push, offline history, textures,
the real icons (slice 2's designs; these are placeholders), screenshots (slice 2), benches
(the first hot path, Alexis's parser).

## 3. Threat model

| Asset | Threat | Mitigation | Proof |
|---|---|---|---|
| What visitors run | A worker serves stale or foreign code for good | Precache only hashed files; a new version waits for a click; `?nosw` | Journeys: the update waits for the click; `?nosw` leaves no registration |
| Later chain and relay reads | Cached, so a visitor sees a false state | No runtime caching in the worker | A journey reads the built `sw.js`: no runtime route |
| This machine | The new packages' trees (workbox-build: 37 dependencies) | pnpm's day-old rule, no install scripts, `pnpm audit` in the full gate | `pnpm install` output; the audit |

## 4. Cost

The worker registers after hydration; workbox-window loads then, in a chunk of its own,
outside the first screen's 150 KB. The journeys add a few seconds to the fast gate (its 60 s
budget holds; measured before and after).

## 5. Scale

The precache list grows with the app's files; textures stay out of it (slice 7).

## 6. Tests, by level

Written first, seen failing: `app/tests/e2e/pwa.spec.ts` (installable through Chromium's own
check, the precache list, no runtime route, the update prompt on a second worker, `?nosw`) and
`app/tests/e2e/budgets.spec.ts` (both pages, both budgets; seen failing with a budget lowered by
hand, since the gate's probe is frozen). No `packages/core` code: no `test.fails`.

## 7. Files

New: `app/src/ui/UpdatePrompt.tsx`, `app/public/manifest.webmanifest` and two icons, the two
specs. Changed: `app/vite.config.ts`, `app/src/root.tsx`, `app/tests/e2e/serve.mjs` (the
manifest's and icons' types; a copy served apart for the update journey), `app/package.json`
(Alexis's). No tier-1 file.

## 8. Dependencies (read on npm on 2026-10-18; Alexis installs them)

- `vite-plugin-pwa` 2.0.0 (MIT, 2026-10-03), a dev dependency, named by ADR-0001 §12. No
  React Router integration is published (npm, searched today): the first journey proves it
  works with React Router's pre-rendered build, or the plan comes back to Alexis.
- `workbox-window` 7.4.1 (MIT, 2026-05-04), a dependency: the plugin's `registerSW` imports
  it at run time (its `dist/client/build/register.js`, read today), so it ships to visitors.
