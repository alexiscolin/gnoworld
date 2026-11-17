# Slice 2, merge 2e: the avatar and the PWA's icons

Part of [slice 2](slice-2.md), whose plan Alexis approved; this file details its last merge (Alexis,
2026-10-21: 2e alone, after 2c-2 + 2d). Read first: DESIGN-SYSTEM.md, "Components" (`Avatar`),
ADR-0002 §1 and §8 row 9, and the approved face in the design canvas (version 15, "Avatars",
"Nebula + constellation, chosen"). Alexis answered §7's three questions on 2026-10-21: yes to each.

## 1. Done when

Slice 2's row, for the avatar: "the same address gives the same nebula, readable at 20 px". With:
- `Avatar` at s, m and l (`--avatar-s` 20, `-m` 24, `-l` 48); kind person, assistant or bot;
  `here`, a presence dot, and `speaking`, a ring, each said in its name ("Ada, here now,
  speaking") and drawn as a border in the text's colour, so forced colours keep it (a box-shadow
  they drop; an outline is the focus ring's; mint is "mine"); named for assistive technology by the
  name it is given, never by the face; `decorative` beside a name that says it already, as
  `PlanetThumb`. The word "Bot" or "Assistant" beside the name is the name's line's (`Row`'s
  subtitle now, `Message` in slice 4); the avatar says it to assistive technology;
- the face drawn from the address alone: three clouds of colour placed and hued by it, on night;
  its constellation over them, five stars, one in each fifth of the disc so the shape stays open,
  joined in one of three orders, one star bright; the same at every size, as the canvas draws it;
- the spread, measured in Chromium: each of 200 random addresses' faces at 20 px, blurred to 4 x 4
  zones; two faces alike (mean OKLab distance under 0.06) in under 1% of pairs (the canvas's
  generator: 0.2%);
- the face's parts memoised by address in a cache of the last 1,024, so a stranger's addresses never
  grow it without end, with a bench of 1,000 addresses for its baseline (slice 2, §4), measured by a
  scratch script and recorded here until slice 1b-2's benches run it;
- the PWA's icons drawn, 192 and 512, and a maskable 512 inside its safe zone (§7, Q1).
- a link inside the app never reloads the page (Alexis, F259): `ui` offers a link slot the app
  fills once, in `root.tsx`'s `Layout`, around the root's error boundary too, with React Router's
  `Link`; `Button` and `Row` (and `EmptyState`, through its `Button`) use it for a path from the
  site's root (`/…`, not `//…`); any other `href` (another site, a mail, `#…`, a relative path, a
  script) stays a plain anchor, as everywhere without the slot (Storybook); a journey clicks the way
  home and sees no document load. Known gap: no journey reaches the root's error boundary. The not-found and world routes catch
  their own errors; home has no boundary (F329, put to Alexis), so a render error there reaches
  the root's, which no journey makes. The slot's place in `Layout` is read in review.
- the flash (Alexis, F260, F262): a Close on every flash, held while the focus is in it as while the
  pointer is over it (WCAG 2.2.1); its panel opaque, the surface's night, until the blur is widely
  Baseline.

## 2. The generator (Claude's proposal, for Alexis to read)

- `partsFrom(address)`: a 32-bit hash of the address (FNV-1a, then a mixing step), read as a
  stream of numbers: three hues spread round the wheel at least 60 degrees apart, three cloud
  centres in the disc, a star's angle and radius in each fifth, the order (one of three), the bright
  star (one of five). Pure, no randomness, no network; an address that is not `g1` and 38 letters
  of bech32 draws the night disc with no stars, the name still said.
- `draw(parts, size)`: SVG, as the canvas's faces: a disc of night, three radial gradients, the
  polyline at 55% white, five stars, the bright one with its halo. The ids inside the SVG are
  `useId()`'s, so two faces on a page never share a gradient.
- The palette's saturation and lightness are the canvas's (85%, 60%) until phase 1 lets a person
  choose (ADR-0002 §8, row 9).

## 3. Out of scope

The chosen palette (phase 1, the profile realm); the person card and the passport; a face for a
name without an address.

## 4. Threat model

| Threat | Mitigation | Proof |
|---|---|---|
| A name made of markup, or 10,000 letters | The name is text and the label; the face takes only the address | `staysText` |
| An address made to look like another's face | The face tells people apart at a glance, never who they are: the name and the short address identify (DESIGN-SYSTEM.md) | The spread journey; no component shows a face without its name |
| An address that is not one | The night disc, no stars, no throw | A property test over arbitrary strings |

## 5. Tests, by level

- Property (fast-check, installed): the same address gives the same parts; parts in their ranges;
  hues 60 degrees apart; one star in each fifth; arbitrary strings never throw.
- Component (Vitest): sizes, kinds, presence, the speaking ring, the label, ids unique per face.
- Stories in Chromium: the spread journey; every story through the walks; the pictures.
- Bench: 1,000 addresses, first draw and memoised, its baseline recorded. Baseline (2026-10-21,
  Node 24.22 on an Apple-silicon laptop, best of 20 runs, a scratch script calling `partsFrom`): 1.18 ms for
  1,000 first draws, 0.06 ms for 1,000 from the cache. The cache saves about 1 ms per 1,000 faces;
  drawing the SVG, not measured here, costs more, and is the React Compiler's to memoise.
- Mutation: StrykerJS on the generator.

## 6. Files

New: `packages/ui/src/Avatar/` (the component, `parts.ts`, its stories and tests), the icons'
SVG source and their PNGs in `app/public/`. Changed: `tokens.css` (`--avatar-*`), `index.ts`, the
overview, `manifest.webmanifest`. No tier-1 file.

## 7. Alexis's answers (2026-10-21)

1. The PWA's icon: the prototype's mark, redrawn from the tokens in cream on space, and a maskable
   copy inside its safe zone. The SVG also serves as the page's icon.
2. The hues in phase 0: three from the address, round the whole wheel, at 85% and 60%.
3. The assistant's face: Jarvis's orb in violet; a bot's: the `code` icon on night, the word
   "Bot" beside its name. Never mint.
