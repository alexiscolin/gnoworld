# Slice 2, merge 2f: what 2e's review put to Alexis

Part of [slice 2](slice-2.md). 2e's review read the range and, as the last merge of the slice,
`packages/ui` and `app` whole; it put 24 findings to Alexis, most in 2b to 2d's code. Alexis,
2026-10-21: "go" on each recommendation (docs/decisions.md). 2e keeps its recorded pass and
merges as it is; this merge starts from it. No new component, no new dependency.

## 1. Done when

Each row's test is written first and seen failing, then the code; one fix commit per finding.

| Finding | What changes | The test that fails first |
|---|---|---|
| F339 | The touch journeys set `hasTouch` and `isMobile` as Playwright's own options, and the sandbox's fixture builds its context from the options it is given, so both modes run the same context | A journey in the touch block reads `matchMedia("(pointer: coarse)")` |
| F331 | The flash joins the top layer (a manual popover, shown while it is on the page), placed at the top centre, as 2c's row says; above a modal dialog's scrim, seen but inert until the dialog closes, the browser's rule (Alexis kept it) | A journey raises a flash from a dialog and finds it as bright as alone, at the top centre |
| F338 | The update notice is a flash, so it shows at the top with F331, whatever its place in the shell | The update journey asserts the notice is in the viewport on a page taller than the screen |
| F330 | A dialog the browser closes by itself (a second Esc, a form's dialog method) tells its page, and shows again while the page keeps it open | A journey presses Esc twice on a dialog its page keeps |
| F332 | A cancel from a control inside the dialog (a file picker dismissed) is not taken for Esc | A unit case: a bubbling cancel from an input |
| F334 | The tooltip keeps the pointer's hold and the focus's apart, as the flash does (F260) | Two cases: the pointer leaves while the focus stays; a blur under a resting pointer |
| F335 | A field's error sits in a region always on the page, filled when it appears, so it is announced | A unit case: the region is there before the error, and holds it after |
| F329 | Home has its own error boundary, as ARCHITECTURE.md asks of every route; the journey proving the compiler's runtime ships reads its code, the bundler having moved it (Alexis) | A route test: a failure in home shows its alert |
| F325 | An error page's way out loads the document again; the not-found page's stays the router's. `EmptyState`'s action takes `reload` | Route tests: the error pages' link is a plain anchor marked to reload, the not-found page's is not |
| F342 | One module says how a file's digest is written; the build and the worker both use it | A unit case: the build's digest of some bytes equals the worker's |
| F343 | A failed update check is an expected result: not reported | The register test that expected it reported changes (declared) |
| F333 | `Unstyled` reads every member of a union | A type test (`expectTypeOf`), seen failing in the type check |
| F337 | The sparkline's plot is inset by half its stroke | A unit case: every point between half a stroke and the height less half |
| F305 | `Card.Header` takes `level`, 2, 3 or 4, 3 unless asked | A unit case per level |
| F317 | A lint rule refuses a raw `<a>` in `packages/ui/src` outside `link.tsx`, the tests, the stories and the overview | Its probe case in `scripts/probe.py`, and `harness_mutate.py` sees it fail when the rule is off |
| F319 | The avatar's face holds its night and is left as drawn under forced colours (`forced-color-adjust: none`, allowed by the lint as Alexis decided) | A journey compares the face's pixels inside its disc in both colour modes |
| F318 | The avatar's cache goes; `partsFrom` draws each time | Its two cache tests go (declared); the rest stay |
| F292 | The worker precaches the latin faces only (`geist-latin`, `geist-mono-latin`) | `precache.test.ts` and the PWA journey name those two faces |

## 2. Out of scope

F327 (the Close inside the live region) waits for Alexis's VoiceOver check. The backlog rows of
2026-10-21 (F340, F341, F326, F336, F322, F304) come with their slices.

## 3. Threat model

| Threat | Mitigation | Proof |
|---|---|---|
| A component of ui draws a raw `<a>` and reloads the app, or bypasses the slot's rule | The lint rule (F317) | Its probe case and harness mutation |
| An error page's way out keeps the app that failed | A document load (F325) | The route tests |
| A flash under a modal dialog goes unseen, its action unreachable | The top layer (F331) | The dialog-and-flash journey |

## 4. Tests, by level

Unit (Vitest): F332, F334, F335, F325, F329, F342, F343, F337, F305, F333 (types). Journeys
(Playwright): F339, F331, F338, F330, F319, F292. Harness: F317's probe and mutation. The
pictures change where the flash moves to the top layer, the card's level stays 3, and the
avatar's face draws its own night: each changed picture is declared.

## 5. Files

`packages/ui/src`: Flash, Dialog, Tooltip, Field, ActivityChart, Card, EmptyState, Button
(the `reload` link), Avatar (`parts.ts`, the face), `testing.tsx`. `app/src`: `routes/home.tsx`,
`features/errors/PageError.tsx`, `sw/` (the digest module, `register.ts`, `precache.ts`),
`vite.config.ts`. `app/tests`: the journeys and `fixtures.ts`. The harness: `eslint.config.ts`
(F317's rule, F319's exception), `scripts/probe.py`. Docs: DESIGN-SYSTEM.md (Browsers, the flash's
place).
