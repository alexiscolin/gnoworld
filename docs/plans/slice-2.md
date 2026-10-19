# Slice 2: the design system

Status: draft, for Alexis's approval. Read first: `docs/DESIGN-SYSTEM.md` (the reference),
ADR-0001 §7 ("our own look"), ADR-0002 §9 (the test levels) and its closing note: the
prototype's style is kept, refined by this slice's designs; nothing in it changes without
Alexis's approval. What earlier work deferred here: 1b-2's real icons and screenshots, F177's
place for the update notice, F212 (`UpdatePrompt` leaves `ui/`), the component tests (decisions,
2026-10-17).

## 1. Done when

From the backlog's row, word for word: "Each component's states render and pass axe; the same
name gives the same astronaut, readable at 20 px; focus is visible; the keyboard works in
`Tabs`, `Popover` and `Dialog`; no `!important` and no raw colour (lint)". This plan adds:
- the designs of the panels and of a trip, approved by Alexis before any component's code;
- the gallery shows every component in every state, screenshotted at three container widths
  and with reduced motion, each picture approved by Alexis;
- DESIGN-SYSTEM.md's invariants hold on the gallery: nothing overlaps, targets of 44 px, the
  focus ring, no horizontal scroll from 320 px, text at 200% zoom, forced colours;
- `ui/` imports only `ui/`, by lint; the update notice is a `Flash`; the PWA has its icons.

## 2. Out of scope

The features that use the components (chat, the plate, the hero: slices 4 to 6); the 3D and
`FlightPanel` (slice 7); `PlanetThumb`'s look from the planet generator (slice 7: here it takes
a picture); the composer's editing and Markdown (slice 4: here its look); the avatar's parts
chosen by the person (phase 1); the CSP (with the first third party); Lighthouse.

## 3. Threat model

| Asset | Threat | Mitigation | Proof |
|---|---|---|---|
| A visitor's page | Markup from a name or a message injected through a component | Components take text, never HTML; no `dangerouslySetInnerHTML` in `ui/`; the avatar draws shapes from a hash of the name, and the name reaches the page only as text | Lint refuses the prop; a component test renders `<img onerror>` and a 10,000-character name as text |
| The page's look | A feature restyles a component from outside, or a raw value slips in | CSS Modules, layers, `check_css.py`, `@eslint/css` | The gate's lint, with a planted case each |
| A visitor's privacy | Fonts or icons fetched from a third party | Geist self-hosted from its package; icons inline | The journeys see no request off the origin |
| Accessibility | A state the CSS draws that the tree does not say | States read from ARIA attributes only | Component tests select by role; axe on the gallery |

## 4. Cost

No feature hot path yet. The avatar is drawn per name, memoised by name: a bench of 1,000 names
sets its baseline. The fonts and the CSS count in the build budget (3 MB in all, 150 KB of
first-screen JavaScript): the budget journeys measure them.

## 5. Scale

The pictures hit first: 17 components × their states × 3 widths × 2 motion settings make the
visual run long. The gate takes the gallery at its widths; the full gate and the CI, the rest.

## 6. Tests, by level

- **Component** (new: Vitest, jsdom, Testing Library): each component's states, its ARIA, the
  keyboard in `Tabs`, `Popover` and `Dialog` (arrow keys, `Esc`, focus on open and back).
- **Unit and property:** the avatar (fast-check: one name, one astronaut; names spread over the
  parts); `ActivityChart`'s scale.
- **Visual** (new): the gallery's pictures, approved one commit at a time (`Updated-baseline:`).
- **End-to-end:** the invariants and axe on the gallery; the update journey through `Flash`.
- **Lint:** `ui/`'s imports; the CSS rules, each proven by a planted case in `scripts/probe.py`.
- **Mutation:** StrykerJS on the avatar and the chart's scale. No `test.fails`: no core code.

## 7. Files

New: `app/src/ui/` (tokens, layers, base, the compositions, the 17 components, the icons, the
avatar), the gallery route (built for tests, left out of production), `app/public/` icons.
Changed: `root.tsx` (fonts, the update notice), `UpdatePrompt` (F212), `vite.config.ts`,
`vitest` and `eslint` configs, `package.json` (asked). No tier-1 file. Alexis writes no code
here. Cut in merges of about 400 lines: 2a the designs (no code); 2b tokens, base, the
compositions, the gallery and the new test levels, with `Button`, `IconButton`, `Kicker` and
the icons; 2c `Chip`, `Tabs`, `Popover`, `Dialog`, `Flash`, `EmptyState`, `Skeleton`; 2d `Card`,
`Row`, `Field`, `Stat`, `ActivityChart`, `PlanetThumb`; 2e `Avatar` and the PWA's icons.

## 8. Dependencies to ask for (read on npm, 2026-10-19)

- `jsdom` 30.1.3 (MIT, 2026-10-15; Node 24.15 or later), Vitest's component environment.
- `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event`
  14.6.8 (MIT; React 19 in their peers).
- `vite-css-modules` 1.16.0 (MIT, 2026-05-05; Vite 8 in its peers): typed modules.
- `geist` 1.8.1 (SIL Open Font Licence, 2026-10-16): the two families, self-hosted.
- Claude Code's `frontend-design` plugin, if the designs are made with it (question 1).

## 9. Questions for Alexis

1. The designs: as private claude.ai design artifacts, like the prototype, or in code with the
   `frontend-design` plugin? Recommended: artifacts, which you review on a page and comment on.
2. The new test levels change the harness (configs, `package.json`, the gate): thaw it for 2b,
   each change with its planted fault? Recommended: yes; the ADR asks for these levels.
3. The pictures: Playwright's Docker image (DESIGN-SYSTEM.md) cannot run in the sandbox.
   Recommended: the sandbox's Chromium in the gate, its pictures per platform; the CI's later.
4. The icons: our own set, drawn on DESIGN-SYSTEM.md's 16 px grid (recommended), or an open set
   (a 24 px grid, another stroke)?
5. The cut in five merges above.
