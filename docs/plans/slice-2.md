# Slice 2: the design system

Draft, for Alexis's approval. Read first: DESIGN-SYSTEM.md, ADR-0001 §7, ADR-0002 §9 and its last
note (no style change without Alexis). Deferred here: 1b-2's icons and pictures, F177, F212.

## 1. Done when

From the backlog's row, word for word: "Each component's states render and pass axe; the same
address gives the same nebula, readable at 20 px; focus is visible; the keyboard works in
`Tabs`, `Popover` and `Dialog`; no `!important` and no raw colour (lint)". This plan adds:
- the designs of the panels and of a trip, approved by Alexis before any component's code;
- Storybook shows at a glance every token (colours, type, space, sizes, radii, layers, motion)
  and every component on one page, then each one's states (its stories) and props; each story
  is screenshotted at three container widths and with reduced motion, approved by Alexis;
- DESIGN-SYSTEM.md's invariants hold on every story: nothing overlaps, targets of 44 px, the
  focus ring, no horizontal scroll from 320 px, text at 200% zoom, forced colours;
- `ui` is the `packages/ui` workspace and imports only itself, by lint; the update notice is a
  `Flash`; the PWA has its icons; the 2a designs follow `docs/design/review-2a.md`.

## 2. Out of scope

The features that use them (slices 4 to 6); the 3D and `FlightPanel`, and `PlanetThumb`'s look
from the planet generator (slice 7: here it takes a picture); the composer's editing (slice 4);
the avatar's parts chosen by the person (phase 1); the CSP (first third party); Lighthouse.

## 3. Threat model

| Asset | Threat | Mitigation | Proof |
|---|---|---|---|
| A visitor's page | Markup from a name or a message injected through a component | Components take text, never HTML; no `dangerouslySetInnerHTML` in `ui/`; the avatar draws shapes from a hash of the name, and the name reaches the page only as text | Lint refuses the prop; a component test renders `<img onerror>` and a 10,000-character name as text |
| The page's look | A feature restyles a component from outside, or a raw value slips in | CSS Modules, layers, `check_css.py`, `@eslint/css` | The gate's lint, with a planted case each |
| A visitor's privacy | Fonts or icons fetched from a third party | Geist self-hosted from its package; icons inline | The journeys see no request off the origin |
| Accessibility | A state the CSS draws that the tree does not say | States read from ARIA attributes only | Component tests select by role; axe on every story |

## 4. Cost

No feature hot path. The avatar, memoised by name: a bench of 1,000 names sets its baseline.
The fonts and the CSS count in the budgets the journeys measure (3 MB; 150 KB of first JS).

## 5. Scale

Pictures first: the gate renders stories as tests; the full gate shoots them (`review-2a.md`).

## 6. Tests, by level

- **Component** (new: Vitest, jsdom, Testing Library): every story rendered, its ARIA, the
  keyboard in `Tabs`, `Popover` and `Dialog` (arrow keys, `Esc`, focus on open and back). The
  stories render through `storiesOf` (`packages/ui/src/testing.tsx`), since Storybook's runtime
  stops Vitest counting assertions.
- **Stories in a browser** (new, the full gate: `app/tests/stories`): what jsdom cannot see, as
  `docs/DESIGN-SYSTEM.md`, "Testing the CSS", lists it.
- **Unit and property:** the avatar (fast-check: an address, one nebula); its spread, a journey since it draws in the browser: each face at 20 px blurred to 4 × 4 zones, two random addresses look alike (mean OKLab distance under 0.06) in under 1% of pairs (0.2% on the 2a generator, 200 addresses); the chart's.
- **Visual** (new): every story's pictures, approved one commit at a time (`Updated-baseline:`).
- **End-to-end:** the invariants and axe on every story; the update journey through `Flash`.
- **Lint:** `ui/`'s imports; the CSS rules, each proven by a planted case in `scripts/probe.py`.
- **Mutation:** StrykerJS on the avatar and the chart's scale. No `test.fails`: no core code.

## 7. Files

New: `packages/ui/` (tokens, layers, base, compositions, the components with their stories and
`SignPanel`, 55 icons, the avatar), Storybook, the PWA's icons. Changed: `root.tsx`, F212, the
configs, the `package.json` files. No tier-1 file; no code of Alexis's. Merges of ~400 lines: 2a designs; 2b
tokens, base, compositions, Storybook, the new test levels, `Button`, `IconButton`, `Kicker`,
icons, the token page and the page of every component; 2c `Chip`, `Tabs`, `Popover`, `Dialog`,
`Flash`, `EmptyState`, `Skeleton`, and `Tooltip`, which `IconButton` then wears; 2d `Card`,
`Row`, `Field`, `Stat`, `ActivityChart`, `PlanetThumb`; 2e `Avatar` and the PWA's icons.
The designs' 2a merge folds into 2b's: it holds only documents, and one review round covers
both. `IconButton` shares `Button`'s folder and module, since it is the same control without its
label (`check_css.py` refuses three declarations copied between modules).

## 8. Dependencies to ask for (read on npm, 2026-10-19)

- `jsdom` 30.1.3 (MIT, 2026-10-15; Node 24.15+); `@testing-library/react` 16.3.3, `/dom` 10.4.2,
  `/user-event` 14.6.8 (MIT; React 19 in peers); `@fontsource-variable/geist` and `/geist-mono`
  5.3.0 (OFL-1.1, 2026-07-19, no peers); `storybook`, `@storybook/react-vite` 10.6.2 (MIT,
  2026-10-12; Vite 8, React 19 in peers). Approved by Alexis, 2026-10-20.
- Not added: `geist` 1.8.1, whose only exports are Next.js loaders and which requires `next`;
  `vite-css-modules`, since `check_css.py` checks that each class a component names exists in
  its module.

## 9. Questions for Alexis

1. The designs: as private claude.ai design artifacts. Answered: artifacts; approved 2026-10-20
   (`docs/design/review-2a.md`).
2. The new test levels change the harness (configs, `package.json`, the gate): thaw it for 2b,
   each change with its planted fault? Answered: yes (Alexis, 2026-10-20).
3. The pictures: the sandbox's Chromium, per platform, as Playwright's image cannot run there?
   Answered: one baseline per platform, the Mac's sandbox Chromium and the CI's Linux; each
   component declares the axes its stories cross, and `Updated-baseline:` may name a story
   folder with one reason (Alexis, 2026-10-20).
4. The icons: our own set on DESIGN-SYSTEM.md's 16 px grid. Answered: our own, the 55 drawn in
   the approved designs.
5. Storybook in place of DESIGN-SYSTEM.md's hand-made gallery (Alexis's question, 2026-10-19):
   its stories are the one list of states the component tests, the pictures and axe read, with
   the props to play with and a tokens page. Answered: yes (Alexis, 2026-10-19). And the five
   merges above.
