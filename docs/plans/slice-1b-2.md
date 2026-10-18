# Slice 1b-2: the PWA, the budgets, Lighthouse, tests that kill mutants

Status: planned, 2026-10-18; waits for Alexis's approval. The second merge of 1b
(`docs/decisions.md`, 2026-10-17), under about 400 lines of product code.

## 1. Done when

From slice 1's plan, word for word: "a page over budget fails the gate; the PWA installs and
asks before updating". Then:
- the app's two pages stay within ADR-0001 §12's budgets: at most 150 KB of compressed
  JavaScript before the first usable screen, 3 MB in all;
- Lighthouse, on a mid-range mobile profile, holds ADR-0002 §2's: LCP 2.5 s, CLS 0.1, TBT 200 ms;
- a test that kills no mutant fails the full gate (StrykerJS `disableBail`, `killedBy`);
- a failed render and a component the compiler cannot compile each fail the build (F106);
- the PWA follows ADR-0001 §12's rules: only the app's hashed files precached; updates explicit
  ("new version, reload"); no service worker in development; `?nosw` unregisters it.

## 2. Out of scope

Push (slice 4 and later), offline history (no history yet), textures (slice 7), screenshots
and benches (question 3), the field measures of INP (ADR-0002 §6).

## 3. Threat model

| Asset | Threat | Mitigation | Proof |
|---|---|---|---|
| What visitors run | A service worker serves stale or foreign code for good | Precache only the build's hashed files; a new version waits for a click; `?nosw` | Journey: a second build's worker waits, the prompt shows, the page changes only after the click; `?nosw` leaves no registration |
| Later chain and relay reads | Cached, so a visitor sees a false state | No runtime caching at all in 1b-2; a test reads the worker's routes | The built `sw.js` holds no runtime route |
| This machine | The two new packages and their trees (workbox-build: 37 dependencies; lighthouse: 28) | pnpm's day-old rule, no install scripts, `pnpm audit` in the full gate; both dev-only but workbox-window, which ships | `pnpm install` output; the audit |

## 4. Cost

The worker registers after the first paint. workbox-window ships to every visitor and counts
in the 150 KB, measured before and after. Lighthouse adds about a minute to the full gate, and
`disableBail` makes StrykerJS run every test on every mutant: both measured before and after.

## 5. Scale

The precache list grows with the app's files; textures stay out of it (slice 7). The first
limit is the full gate's time: StrykerJS without bail grows with tests times mutants.

## 6. Tests, by level

Written first, seen failing:
- **End-to-end** (`app/tests/e2e/pwa.spec.ts`): the manifest and its tags; the worker registers
  in the build; a second build waits and prompts; `?nosw` unregisters; nothing in development.
- **Budgets** (`app/tests/e2e/budgets.spec.ts`): the compressed JavaScript before the first
  screen and the total, both pages.
- **The probe** (`scripts/probe.py`): a page over each budget, a slow page for Lighthouse, a
  test that kills no mutant, a render that throws, a component the compiler refuses; each must
  fail its check. Each check's mutant in `harness_mutate.py`.
Nothing here is in `packages/core`: no `test.fails` for Alexis.

## 7. Files

New: `app/src/pwa.tsx` (the prompt), the two specs, `scripts/lighthouse.mjs`,
`scripts/killed_by.py`. Changed: `app/vite.config.ts`, `app/src/root.tsx`,
`stryker.config.json`, `scripts/check.sh` (the full gate's steps), `scripts/probe.py`,
`app/package.json` (Alexis's). Tier 1: none in the app; the gate's scripts are harness.

## 8. Dependencies to ask for (read on npm on 2026-10-18)

- `vite-plugin-pwa` 2.0.0 (MIT, 2026-10-03), named by ADR-0001 §12; it brings `workbox-build`
  7.4.1 and `workbox-window` 7.4.1. It has no React Router integration on npm (searched
  today): the first test proves it works with React Router's pre-rendered build, and if not,
  the plan comes back to you before any workaround.
- `lighthouse` 13.5.0 (Apache-2.0, 2026-09-18), named by ADR-0002 §2, driven over the
  Chromium Playwright already installs, so no second browser.

## 9. Questions for Alexis

1. The two new packages above?
2. The harness is frozen; the budget, Lighthouse and mutant checks add to the gate's scripts,
   as slice 1's approved plan said. Allowed as product checks, with the full gate's harness
   mutation, or should they wait?
3. Screenshots and benches wait for what they measure: screenshots for slice 2's designs (the
   pages are bare, and macOS and the CI's Linux render fonts differently), benches for the first
   hot path (your parser). Agreed?
