# Review of the 2a designs (2026-10-19)

Three independent reviews (Opus) of the first designs of slice 2a, each read against
`docs/DESIGN-SYSTEM.md`, the ADRs and the prototype's recorded tour; then Alexis's four decisions
(`docs/decisions.md`, 2026-10-19). The designs and `docs/DESIGN-SYSTEM.md` were changed after them.

## Verdicts

- **UX:** coherent and well crafted, but the screens contradicted the ADRs where trust is earned:
  direct messages said "end-to-end encrypted" (phase 2 only, ADR-0002 l.175), a refused call said
  "nothing was taken" (gno keeps the fee of a transaction that fails in a block:
  `tm2/pkg/sdk/baseapp.go` 943-980, gno v1.5.0; ADR-0002 §4), the phone had a composer (phase 0
  phones only read, l.174), sample names failed `r/sys/namereg` (`^nym-[a-z]{5,13}\d{3}$`, read on
  mainnet), a counter showed progress against the universe's total (forbidden, l.478).
- **UI:** the components read as one family, but the designs read no space or control token,
  mint had about twelve jobs and cream meant both primary and selected, four things overlapped,
  and the world view lost "space first" (the scene kept 29% of the width) and the prototype's own
  motifs.
- **Future fit (phases 1 to 3):** the token architecture scales by addition; four decisions would
  have forced rework: the astronaut's input, `ui` inside `app/`, `Card` holding domain kinds and
  chain states, and a colour model with no caution level and no destructive button; two concepts
  were missing (the network in the layout, trust states).

## What changed

- **Decided by Alexis:** the astronaut from the address; `packages/ui`; the safety and trust layer
  (three severity levels, a danger button, confirmation by reversibility, trust states, the
  network in the header with "Testnet", the view "Universe" renamed "Cosmos"); the prototype's
  identity restored (a plate that fades into space, its dot grid and vertical caption, the status
  ring, thin activity bars).
- **In the design system:** mint is `--color-mine` and means mine, focus and unread only; live is
  amber; one cream primary per region, none in the flash; selection on non-text is a ring, not the
  focus outline; the current row differs from hover; `SignPanel`, the one signing block; `Card`
  holds layout only, its kinds live in their features; density; data graphics at 3:1; words
  (sources for claims, one time rule, no total counter, realm and bot text attributed); the top
  layer stacks by opening order; i18n (`dir="auto"`, caps reset by script, fallback fonts); 55
  icons at two sizes; the flight panel moved to its feature.
- **In the designs:** rebuilt from token reads only; the false copy fixed; valid names; the phone
  reads; the header the same everywhere; no overlap; the signing block in all its states.

## Approved (2026-10-20)

Alexis approved the designs as they stand in the private design canvas
https://claude.ai/artifact/4jCyjV2cxNjadXsPuHa7k2, version 15: the system at a glance, before and
after, the face, the cosmos, a trip, an arrival, the full chat, its states, the rich cards and the
phone. Changed with him after the reviews: Jarvis's answers stand out in the violet tone; a room
shows people and help first; a person's face is a nebula with its constellation, its spread
measured; a country is its flag (`docs/decisions.md`, 2026-10-20).

## Left for later, by the review's own judgement

Table, Checkbox, Switch, Select (slices 8 and 12); QR codes and fingerprints (phase 2); amounts
and units in fields; voice-room states; game, escrow, event and satellite assemblies; a light
theme. Screens the designs do not draw yet, each designed in the slice that builds it: the first
visit and the name flow, the realm digest and the GovDAO proposal, the Earth view, the list view,
the ⌘K palette, notifications, the passport, the person card, the 1280 px layout.

## For the harness (Alexis decides at 2b)

How many pictures: each component declares which of its axes its stories cross, instead of the
full product, and `Updated-baseline:` may name a story folder with one reason (about 1,000 pictures
now, 3,000 at three times the components, by the review's rough count).
