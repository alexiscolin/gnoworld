# Slice 1b-2: the PWA and the budgets

Status: approved by Alexis, 2026-10-18: the PWA now, and what else is needed, without touching
the gate (the harness is frozen); the worker written here, with no dependency (below). The second
merge of 1b, under about 400 lines of product code.

## 1. Done when

From slice 1's plan, word for word: "a page over budget fails the gate; the PWA installs and
asks before updating". The budget is a journey, which the gate already runs. Then, ADR-0001
§12's PWA rules:
- Chromium reads the manifest with no error, its icons are PNGs of their stated sizes, and a
  worker controls the page (Chromium's own installability check answers nothing in the
  sandbox's one-process browser, so it proves nothing there);
- only the app's hashed files are precached, each held only while its bytes match the digest
  the build gave it, and the worker caches nothing at run time;
- updates are explicit: a new worker waits, "New version, reload" shows, the page changes
  only after the click, in each open tab; an open page asks for a new version each time it
  is shown again;
- no service worker in development; `?nosw`, on any request, makes the worker drop its cache
  and unregister before the host answers, so it works when the pages cannot start (the next
  visit without it registers again);
- the two pages stay within ADR-0001 §12's budgets: at most 150 KB of compressed JavaScript
  before the first usable screen, 3 MB in all.

## 2. Out of scope

Waiting for the gate to move (it is frozen): Lighthouse, the check that every test kills a
mutant, and F106's planted build failures. The production host's headers (`sw.js` always
revalidated, ADR-0001 §13) come with 1c's host. Registration after hydration holds by
construction (an effect), with no test of its own. Later slices: push, offline history, textures,
the real icons (slice 2's designs; these are placeholders), screenshots (slice 2), benches
(the first hot path, Alexis's parser).

## 3. Threat model

| Asset | Threat | Mitigation | Proof |
|---|---|---|---|
| What visitors run | A worker serves stale or foreign code for good | Precache only hashed files, each with its digest, which the browser checks at install and the worker checks on what it holds; a new version waits for a click; `?nosw` handled by the worker itself | Journeys: the update waits for the click; a changed file fails the install; a file changed in the cache is replaced at the next update; `?nosw` frees a site whose cached entry is broken |
| Later chain and relay reads | Cached, so a visitor sees a false state | The worker answers only the precache list, and its cache type has no `put` | Unit: a miss is fetched, not stored; journey: after browsing, the cache holds the list only, and offline a page has no answer |
| This machine | A build dependency taken over | No dependency: `workbox-build` 7.4.1 pulls a pre-release fork from one person's scope, which pnpm refused as a possible takeover (`docs/decisions.md`) | The worker is our code, under the gate's lint, tests and mutations |

## 4. Cost

The worker registers after hydration, from a few hundred bytes in the first screen's
JavaScript (114 KB of the 150 KB before this slice). The journeys add a few seconds to the fast gate (its 60 s
budget holds; measured before and after).

## 5. Scale

The precache list grows with the app's files; textures stay out of it (slice 7). One cache holds
every version, keyed by URL: a hashed name never holds other bytes, so a deploy fetches only the
files it changed, and the new version drops the rest once it takes over.

## 6. Tests, by level

Written first, seen failing, then strengthened by the test-auditor's red pass (17 findings):
units for the worker's rules, the page's side and the precache list (`app/src/sw/*.test.ts`), with
fakes of the Service Worker API; `app/tests/e2e/pwa.spec.ts` (the manifest as Chromium reads it,
with a control that it sees a missing one; the icons' real sizes; files answered by the worker;
nothing else cached, offline proof; the update on a second worker, in one tab and in two; `?nosw`)
and `app/tests/e2e/budgets.spec.ts` (both pages, both budgets, the precache counted; seen failing
with a budget lowered by hand, since the gate's probe is frozen). No `packages/core` code.

## 7. Files

New: `app/src/sw/` (`worker.ts`, the worker's rules, `precache()` and `takeOver()` apart, so
push and an outbox add their own beside them; `sw.ts`, its entry; `precache.ts`, the list;
`register.ts`, the page's side), `app/src/ui/UpdatePrompt.tsx`, `app/public/manifest.webmanifest`
and two placeholder icons, the specs. Changed: `app/vite.config.ts` (a plugin builds `sw.js` on
its own once the whole build is done, one classic script with its list as a define, so code it
shares with the pages stays in it), `app/src/root.tsx`, `app/tests/e2e/serve.mjs` (the
manifest's and icons' types; port 4174 for the update journeys). No tier-1 file; no package
added.

## 8. Dependencies

None. `vite-plugin-pwa` 2.0.0, named by ADR-0001 §12, needs `workbox-build` 7.4.1, which since
May 2026 pulls `@trickfilm400/rollup-plugin-off-main-thread` 3.0.0-pre1 (one maintainer, no
provenance) where 7.4.0 pulled `@surma/...`; pnpm refused it as a possible package takeover
(2026-10-18). Workbox's browser modules (e.g. `workbox-background-sync`) stay open for later
slices: the refused package is only in the build tool.
