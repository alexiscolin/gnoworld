# Coherence review of the prototype (slice 2a)

Status: approved by Alexis, 2026-10-19 ("go": every recommendation below), and written into
`docs/DESIGN-SYSTEM.md`; the visible changes are shown again on the before/after designs of 2a
(decision 36). Each value and element of the approved prototype (`docs/prototype/`) was mapped to
one token and one component, so the design system can be rebuilt with nothing duplicated.

## Coverage

| Source | Items | Mapped |
|---|---|---|
| CSS rules of `index.html` (lines 6-1174) | 1,160 | 1,160, each once (178 dead: 15%) |
| Styles the script sets (`app.js`) | 102 | 102 |
| Icons (markup and script) | 62 | to a set of 44 |
| Screens and states | 76 | 76 |
| Class names the script assigns | 227 | 227 |
| The recorded tour (3 min 36, one frame per second) | 216 frames | 216 |
| Files of the live prototype | 39 | 39 (its script is byte-identical to `app.js`) |

The per-rule maps are in `docs/design/audit/`: `selectors.json` (every rule and its line),
`lot1-map.json` to `lot4-map.json` (each rule's target: token, base, utility, composition,
component and variant, region, feature, scene or dead; its off-token values and their snap; its
duplicates), `script-map.json` (inline styles, icons, screens, classes), and `brief.md` (the
targets and rules the mapping used).

## What the prototype does today

- 36 font sizes, 33 spacings, 17 control heights, 16 radii, 6 weights, 20 letter-spacings, 13 line
  heights, 27 durations, 157 literal colours (10 white alphas for the same fills, 20 dark
  translucent surfaces, 9 blurs, 21 shadows); 141 `!important`, 814 ID selectors.
- 341 elements styled one by one fall into 23 families: the same pill button at 8 heights,
  "selected" drawn four ways, fields with 4 radii and 4 heights, the message styled three times,
  the dialog box six times, the caps label 26 times, ellipsis 20 times.

## The scale (proposed)

- **Colour:** nine base colours (space #05070D, night #0B0F18, text #F4F6FA, muted #9DA8BC, cream
  #F2EFEA, mint #5CF2C8, amber #FFC46B, violet #B79CFF, coral #FF8A7A); everything else computed
  with `color-mix()`: fills at 5 and 10% of text, line 10%, strong line 20%; panel night at 86%,
  glass at 60%, scrim space at 70%; tints of each accent (12% soft, 50% line). One ink (space) on
  every light fill: 8.8:1 on coral to 17.6:1 on cream. Each world's colour is data (`--world`); a
  surface over a world is `color-mix(--world 12%, night)`.
- **Type:** 11 (label, mono caps 0.14em), 12, 13, 14, 16, 20, 28, 36, display and hero clamps;
  weights 300/400/500/600; tracking caps 0.14em, tight -0.03em, display -0.04em, hero -0.06em;
  leading 0.9, 1, 1.4, 1.5; `--text-data` 12 px mono for addresses, code, the ticker.
- **Space:** steps 4 to 64 named by step (`--space-3xs` … `--space-2xl`); section space and titles
  fluid with `clamp()`, interface text and controls fixed.
- **Radius:** 8, 12, 24, pill. **Controls:** 24, 32, 40, 56 (40 grows to 44 on touch).
- **Motion:** 120 / 200 / 400 ms, flights 1.3-3.2 s, spin 0.8 s, ambient loops 3 s; arrival
  choreography within 1.2 s; lifetimes (flash and scene bubble 5 s). **Blur:** surface 24, glass
  12. **Shadows:** popover, float. **Layers:** scene, labels, chrome, dock, popover, toast.

## Architecture (proposed)

- Three tiers: primitives (never read by a component, lint refuses it), semantic roles made only
  of primitives, and private custom properties inside a component (`--_h`).
- CUBE CSS in `@layer reset, tokens, base, compositions, components, utilities`; the six
  compositions (Stack, Cluster, Grid, Sidebar, Switcher, Center) do all layout; a variant sets
  private properties only; states are ARIA attributes; no `!important`; utilities from the audit
  (truncate, list-reset, scroll-body, visually-hidden, flow).
- Components compose with named parts (Card.Header, Row's lead and trail, Field's label, help and
  error); variants are closed TypeScript unions; no component accepts `className` or `style`;
  context cascades from a container (`data-tone`, `data-density`, surface level).
- Heights are minimums with padding, never fixed. Baseline "widely available", plus two named
  exceptions from 2024 (`popover`, `@starting-style`); popovers positioned by a small function of
  ours until CSS anchor positioning (2026) is widely available.
- Storybook reads the tokens from the CSS; DESIGN-SYSTEM.md states the rules and points to it.

## Components

DESIGN-SYSTEM.md's set covers the 341 elements, plus seven new in slice 2: Panel, ChoiceGroup,
Progress (bar, steps, spinner, wave, arc), Tooltip, Toolbar, Logo, Combobox. Later, each in its
slice: Message (4), Breadcrumb and the ⌘K palette (5), the scene Label (7). Menu is a Popover,
Badge a static Chip, Dot an Avatar slot, Divider a base `hr`. A component exists once two places
use it; otherwise it is a variant. Every interactive structure of the chat (calendar, who's here,
catch up, realm and vote, station, quest, poll, room games, contest) is one Card: a header (type
icon, kicker, title, state), a body of blocks (Row, ChoiceGroup, Progress, Stat, Grid, Field, media
Card, Avatar), a footer (actions, meta). The calendar is an agenda of Rows; a date is typed in the
browser's own `datetime-local` field.

## What the recorded tour adds

- Elements: the expedition pill, the arrival banners (first to chart, first words, stamped, the
  pot popped), the arc gauge, the header's live counters, signing in three states, the on-chain
  activity line, the station panel's three bodies, and the scene's bubbles, signs, comet, meteors,
  heat markers, far-side pills, ring captions and screen belt.
- States the prototype lacks: a message sending, sent, failed; typing; send disabled when empty;
  an image loading or broken, useful alt text; a video's poster, pause off screen, captions; a
  signature too late, refused or failed; tabs with no selection; a tooltip on every icon button; a
  backdrop behind the header's pills over a bright planet; a scroll cue when the plate cuts off.
- Media: chat photo and video, library tile, lightbox, link preview, station thumbnail, planet
  texture and sky, each with the loading, error and fallback states it lacks.

## Not to rebuild

The prototype's bugs: the flash under a dialog's scrim; "Signed" after the pot already popped; a
search that filters one field and shows another; a card clock frozen at 00:06; the message toolbar
covering its author and outliving the pointer; a fixed person card over the composer; a shared
room with no tab selected; the texture credit shown only in the cosmos ticker; "Sample" copy. And
the dead UI: the side card, the old Jarvis panel, the toast, the top and bottom bars, the
evolutions board, the range slider, avatar upload.

## Not covered by this review

The phone layout in pictures (the tour is filmed wide), keyboard paths, anything shorter than a
second between two frames, the 3D art (slice 7), a voice-and-tone guide.

## Decisions (approved, 2026-10-19)

1. One secondary grey. 2. One label style (mono 11 caps 0.14em), the header's links included.
3. Selected is the cream fill; current row a quiet fill. 4. Targets 24 px with a pointer, 44 by
touch. 5. Spacing on the 4 px grid, no 2 px token. 6. Panel and dialog titles 28/300 (26/300 since answer 9k-3, the video's).
7. The astronaut from the name replaces planets and uploads (ADR-0002 §6). 8. Transactions are
call cards in the thread (ADR-0002 §4). 9. No blue in the system. 10. Seven new components, the
rule of two uses. 11. Search becomes a ⌘K palette. 12. The dead UI is not rebuilt. 13. Three tiers
of tokens. 14. Tints computed with `color-mix()`. 15. Step names; fluid only where it helps.
16. CUBE without repetition. 17. Nine base colours. 18. Four radii (8, 12, 24, pill). 19. Four
control heights. 20. Components with named parts. 21. Closed variants, no free style. 22. Context
cascades. 23. Combobox. 24. No calendar widget. 25. One rich card, blocks. 26. Each world's colour
tints its surfaces. 27. Three meanings: selected cream, mine mint, about me amber, never colour
alone. 28. The missing states get their stories. 29. Motion as a system. 30. The flash above
everything, or held during a dialog. 31. A very light credit: one 11 px "Credits" link, wherever
textures show, opening the full attributions (CC BY 4.0 §3(a)(2) allows a link). 32. Minimum
heights. 33. The browser target, with two named exceptions. 34. Glass holds its contrast on the
brightest planet. 35. Blur on small surfaces, measured in slice 7. 36. Visible changes approved on
before/after designs. 37. One source for the tokens. 38. Long text and a font that does not shift
the page.
