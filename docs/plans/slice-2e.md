# Slice 2, merge 2e: the avatar and the PWA's icons

Part of [slice 2](slice-2.md), whose plan Alexis approved; this file details its last merge (Alexis,
2026-10-21: 2e alone, after 2c-2 + 2d). Read first: DESIGN-SYSTEM.md, "Components" (`Avatar`),
ADR-0002 §1 and §8 row 9, and the approved face in the design canvas (version 15, "Avatars",
"Nebula + constellation, chosen"). **Draft: three questions for Alexis (§7) come before any code.**

## 1. Done when

Slice 2's row, for the avatar: "the same address gives the same nebula, readable at 20 px". With:
- `Avatar` at s, m and l (`--avatar-s` 20, `-m` 24, `-l` 48); kind person, assistant or bot; a
  presence slot; the speaking ring; named for assistive technology by the name it is given, never
  by the face;
- the face drawn from the address alone: three clouds of colour placed and hued by it, on night;
  its constellation over them, five stars, one in each fifth of the disc so the shape stays open,
  joined in one of three orders, one star bright; the same at every size, as the canvas draws it;
- the spread, measured in Chromium: each of 200 random addresses' faces at 20 px, blurred to 4 x 4
  zones; two faces alike (mean OKLab distance under 0.06) in under 1% of pairs (the canvas's
  generator: 0.2%);
- the face memoised by address, with a bench of 1,000 addresses for its baseline (slice 2, §4);
- the PWA's icons drawn, 192 and 512, and a maskable 512 inside its safe zone (§7, Q1).

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
- Bench: 1,000 addresses, first draw and memoised, its baseline recorded.
- Mutation: StrykerJS on the generator.

## 6. Files

New: `packages/ui/src/Avatar/` (the component, `parts.ts`, its stories and tests), the icons'
SVG source and their PNGs in `app/public/`. Changed: `tokens.css` (`--avatar-*`), `index.ts`, the
overview, `manifest.webmanifest`. No tier-1 file.

## 7. Questions for Alexis

1. **The PWA's icon.** Today's is a blue disc, a placeholder. Proposal: the prototype's mark (the
   orbits, the centre and two planets, `docs/prototype/source/index.html`) in cream on space,
   redrawn from the design system's tokens, with a maskable copy inside its safe zone. Or another
   mark of yours: `Logo` itself comes with the header's slice.
2. **The hues in phase 0.** Proposal: three hues from the address, round the whole wheel, at the
   canvas's 85% and 60%, as the canvas drew them. Or a set of hues of yours.
3. **The assistant's and a bot's mark.** DESIGN-SYSTEM.md wants each its own mark and a word, never
   mint. Proposal: the assistant, Jarvis's orb in violet; a bot, the `code` icon on night, with the
   word "Bot". Or yours.
