# Slice 2, merge 2c-2 + 2d: the interface's components

Part of [slice 2](slice-2.md), whose plan Alexis approved; this file details one merge (Alexis,
2026-10-21: 2c-2 and 2d together, then 2e alone). Read first: DESIGN-SYSTEM.md, "Components".

## 1. Done when

Slice 2's row, for these components: each one's states render and pass axe; focus is visible;
the keyboard works in `Tabs`, `Popover` and `Dialog`; no `!important` and no raw colour. This
merge adds: `IconButton` wears a `Tooltip` with its label; StrykerJS mutates `packages/ui`'s `.tsx`
(F225); the worker precaches the fonts, and the first screen's face is preloaded.

## 2. The components (DESIGN-SYSTEM.md's table, and the choices it leaves)

- `Chip`: a button (selected: `aria-pressed`, the cream fill; a count in its words) or a static
  mark at `--control-xs`, toned neutral, mine, warm, signal or danger.
- `Tabs`: an ARIA `tablist`; roving focus; the arrow keys move and select (automatic activation),
  `Home` and `End`; counts; icon-only tabs named, with their `Tooltip`; none selected.
- `Popover`: the native `popover` attribute (light dismiss and `Esc` are the browser's); placed
  under its trigger in script, as CSS anchoring is not widely Baseline; a menu: `role="menu"`,
  the arrow keys, `Home`, `End`, `Enter`, and focus back to the trigger.
- `Tooltip`: the icon-only control's label above it, on hover and on keyboard focus, after a
  short delay; `Esc` hides it, and it stays while hovered (WCAG 1.4.13); hidden from assistive
  technology, which has the label already.
- `Dialog`: the native `<dialog>`, standard (460) or wide (760); a title and a Close button;
  focus to the first field or the title, never to a primary button; `Esc` and Close call its
  `onClose`; the scrim is `--color-scrim`; focus goes back to the opener.
- `Skeleton`: line and card; shown only after 300 ms; still under reduced motion; hidden from
  assistive technology, while what it stands for says `aria-busy`.
- `Card`: `Card.Header` (icon, kicker, title, state), `Card.Body`, `Card.Actions`; tone neutral or
  signal (Jarvis's violet); dashed; compact density.
- `Row`: lead (a picture, an icon or an avatar's slot), title, subtitle, activity, trail; plain,
  divided or boxed; current (`aria-current`).
- `Field`: text, search and date (`datetime-local`); label, help, error (`aria-invalid` and
  `aria-describedby`), prefix. The composer is slice 4's.
- `Stat`: a tabular number, unit, caption; a delta with its word, coral when it falls; the heat
  badge; it counts up on arrival, and stands at its value under reduced motion.
- `ActivityChart`: 24 hourly bars or a sparkline, in SVG; past bars muted, the current one in
  text; the peak and the current value written in `--font-data`, and every value as text.
- `PlanetThumb`: a picture in a disc, by kind (world, cluster, star, station, signal); the dock's
  magnification under the pointer, off under reduced motion. Its look from the planet
  generator is slice 7's.

Tokens join with their first reader: `--control-xs`, `--radius-m`, `--radius-l`, `--color-scrim`,
the accents' `-soft` and `-line`, `--shadow-popover`, `--motion-base`, `--popover-w`, `--dialog-wide`.

## 3. Out of scope

`ChoiceGroup`, `Combobox` (and with it the listbox popover), `Toolbar`, `Panel`, `SignPanel`,
`Progress`, `Logo`: not in slice 2's row, each with the slice that first needs it.

## 4. Threat model

| Threat | Mitigation | Proof |
|---|---|---|
| Markup through a prop | Every text prop is text | `staysText` on each |
| A focus trap with no way out | `Esc` closes every popover and dialog, and focus goes back | Journeys, per component |
| A picture from another host (`PlanetThumb`, a row's lead) | The stories' guard fails any off-site request | The guard, on every story |
| A link to `javascript:` | React 19 refuses it (checked in 2c-1's red pass) | `Row.test.tsx`, four spellings |

## 5. Tests, by level

- Component (Vitest, jsdom): ARIA, props, states; the keyboard of `Tabs` and the menu; the
  tooltip's delay and `Esc` on fake timers; `Stat`'s and `ActivityChart`'s words. jsdom has no
  `showModal` and no `popover`: the test setup gives a dialog a `showModal` that only opens it,
  and those behave in the browser. An open dialog's story is tagged `viewport`: its pictures are
  the whole screen, the top layer outside the story's root.
- Stories in Chromium: `Dialog` (open, focus, `Esc`, scrim, focus back), `Popover` (light
  dismiss, `Esc`, focus back, inside the viewport at 320 px), the tooltip on focus, the
  skeleton's 300 ms, `Stat`'s count and reduced motion, the magnification off under reduced
  motion; and every story through the walks already there (axe, targets, ring, states drawn,
  200%, forced colours, no off-site request), then the pictures.
- Mutation: StrykerJS on `packages/ui/src/**/*.tsx`, its time measured before and after.

## 6. Files

New: `packages/ui/src/{Chip,Tabs,Popover,Tooltip,Dialog,Skeleton,Card,Row,Field,Stat,
ActivityChart,PlanetThumb}/`. Changed: `tokens.css`, `tokens.ts`, `index.ts`, the overview,
`IconButton` (its tooltip), `stryker.config.json`; the fonts: `app/src/sw/precache.ts`,
`app/vite.config.ts`, `app/src/root.tsx`, ADR-0001 §12's precache line. No tier-1 file.

## 7. Claude's choices, for Alexis to read

Waiting for his answers to 2c-1's review: F259 (a link-button through the router: `Row`'s and
`Card`'s links are plain anchors until then), F260 (a timed flash for the keyboard), F262 (the
blur and the panel's contrast).


The listbox waits for `Combobox`; the popover placed in script; the tooltip hidden from
assistive technology; the dialog's focus on its title when it has no field; `PlanetThumb` takes
a picture until slice 7 draws one.

Made during the work (docs/decisions.md, 2026-10-21): a figure counts in the browser only, grouped
in English; a popover unseen until placed; one shared pill for the controls with words and one
surface for what floats; `--color-surface` and the three thumb sizes. The preload of the first
screen's face waits for `@gnoworld/ui/fonts`, ui's `package.json` being Alexis's to change
(`.claude/tmp/apply-2cd-fonts.sh`); the precache of the fonts lands in this merge.
