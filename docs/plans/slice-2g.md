# Slice 2, merge 2g: what 2f's review put to Alexis

Part of [slice 2](slice-2.md). 2f's review read the range and, as the last merge of the slice,
`packages/ui` and `app` whole; it put 19 findings to Alexis with a recommendation each. Alexis,
2026-10-21: eleven in this merge, the rest to the backlog (docs/decisions.md). 2f keeps its recorded
pass and merges as it is; this merge starts from it. No new component, no new dependency.

## 1. Done when

Each row's test is written first and seen failing, then the code, committed with it; one fix commit per
finding.

| Finding | What changes | The test that fails first |
|---|---|---|
| F378 | ARCHITECTURE.md's import table and bans hold for app's folders: `sw` imports only `sw`; a feature imports another feature's `index.ts` only; `routes` never import `scene`; `fetch` and storage only in `lib` and `sw` (the worker runs alone, and its page side checks the host, F351), `console` only through the logger. The lint config splits into parts that compose, under 200 lines each | Probe cases, one per rule, each planted in its folder: `sw` importing a feature, a feature importing another's file, a bare `fetch` and `localStorage` in a feature, `console.log` in a route; `harness_mutate` drops each and sees the probe fail |
| F370 | `"sideEffects": ["*.css"]` in `packages/ui/package.json` (applied by Alexis: the file is closed to Claude), so an app ships only the CSS of the components it imports | A build test: an entry importing Button only emits no Card, Chip or Kicker sheet (14,745 B of CSS today, 10,738 B after, the verifier's numbers); F363's layer test stays green |
| F373 | No page scroll under a modal dialog | A journey: a wheel over the scrim of a dialog on a 3,000 px page leaves `scrollY` at 0 |
| F367 | The dialog's first field is the first visible text entry: never a button-typed input, never one hidden by CSS | A unit case per kind (submit, image, a hidden section before a visible field), and the journey on the story |
| F380 | The update notice remembers the worker it asked, not a page-wide flag: a later waiting worker is asked too | The verifier's register case: v2 asked, v3 waiting, the second click sends v3 `SKIP_WAITING` |
| F382 | The unknown world's unit test expects the 404 that selects the not-found page | The mutant throwing a plain Error fails it |
| F375 | A lone line Skeleton keeps its full width; the shorter last line belongs to a paragraph of lines | A stories case: `skeleton--lines` with one line after a heading measures 100% |
| F369 | A stronger hover veil on filled buttons (the cream primary, a pressed IconButton), so the hover shows (1.001:1 today) | A journey measuring the rest and hover pixels of `button--primary` and `iconbutton--pressed`, a contrast above a floor set with Alexis |
| F371 | Fields at 16 px under a coarse pointer, as controls grow there, so iOS Safari does not zoom on focus | A touch journey: a field's computed font size is 16 px under `pointer: coarse`, 14 px under a fine one |
| F355 | While a flash shows, the page's scroll padding keeps a focused element clear of it | A keyboard journey: a link at the top tabbed to while the update notice shows is not covered by the pill; if the browser ignores the padding for focus, the row ends in a backlog row on the notice's place |
| F354 | Documented, no code: a flash shown before a modal dialog stays under its scrim, dimmed and inert, and shows again when it closes | DESIGN-SYSTEM.md's Layers paragraph says so |

## 2. Out of scope

To the backlog, each with its slice (docs/decisions.md): F365, F366, F368, F372, F374, F376, F377,
and F350 with F379. F327 still waits for Alexis's VoiceOver check.

## 3. Threat model

| Threat | Mitigation | Proof |
|---|---|---|
| App code reaches the network, storage or another feature's internals past the folder that owns it, and a later slice builds on it | F378's lint, per folder | Its probe cases and harness mutants |
| A package marked free of side effects drops a sheet the page needs, or reorders the layers | The app imports the sheet itself (root.tsx), as a bundler may skip index.ts and its import; F370's build test on the app's entry | F363's and F370's build tests, and the built page's layer journey |

## 4. Tests, by level

Unit (Vitest): F367, F380, F382, F370's build. Journeys (Playwright): F373, F367, F375, F369, F371,
F355. Harness: F378's probe cases and mutants, the config's split under `harness_mutate`'s sections.
Pictures change where the hover or the field's size shows in a story under its pointer; each changed
picture is declared.

## 5. Files

`packages/ui/src`: Dialog, Skeleton, Button (its sheet), Field (its sheet), Flash (its sheet), base
CSS; `packages/ui/package.json` (Alexis). `app/src`: `sw/register.ts`, `routes/world.test.tsx`. The
harness: `eslint.config.ts` and its new part, `scripts/probe.py`, `scripts/harness_mutate.py`
(SECTIONS and the patterns that read the moved rules). Docs: ARCHITECTURE.md (the `sw` exception for
`fetch`), DESIGN-SYSTEM.md (Layers), `docs/plans/backlog.md` (the rows of section 2).
