# Review of the first designs

Three independent reviews (UX, UI, future fit) read the first designs against `docs/DESIGN-SYSTEM.md`, the ADRs and the prototype's
recorded tour. The designs and `docs/DESIGN-SYSTEM.md` follow them. What the reviews found stays here as rules to check a screen against.

## What a screen must not do

- **UX:** contradict the ADRs where trust is earned. Direct messages never say "end-to-end encrypted" (ADR-0002 l.175). A refused
  call never says "nothing was taken": gno keeps the fee of a transaction that fails in a block (`tm2/pkg/sdk/baseapp.go` 943-980,
  gno v1.5.0; ADR-0002 §4). The phone has no composer (phones only read, l.174). Sample names pass `r/sys/namereg`
  (`^nym-[a-z]{5,13}\d{3}$`, read on mainnet). A counter never shows progress against the universe's total (forbidden, l.478).
- **UI:** read no space or control token. Mint has one job, not twelve, and cream does not mean both primary and selected.
  Nothing overlaps. The world view keeps "space first" (the scene keeps more than 29% of the width) and the prototype's own
  motifs.
- **Future fit:** the token architecture scales by addition. Four decisions avoid rework: the astronaut's input, `ui` outside `app/`,
  `Card` holding no domain kind or chain state, and a colour model with a caution level and a destructive button. Two concepts are
  in the layout: the network, and trust states.

## What the design system holds

- **Decided:** the astronaut from the address; `packages/ui`; the safety and trust layer (three severity levels, a danger
  button, confirmation by reversibility, trust states, the network in the header with "Testnet", the view named "Cosmos"); the
  prototype's identity (a plate that fades into space, its dot grid and vertical caption, the status ring, thin activity bars).
- **In the design system:** mint is `--color-mine` and means mine, focus and unread only; live is amber; one cream primary per
  region, none in the flash; selection on non-text is a ring, not the focus outline; the current row differs from hover;
  `SignPanel`, the one signing block; `Card` holds layout only, its kinds live in their features; density; data graphics at 3:1;
  words (sources for claims, one time rule, no total counter, realm and bot text attributed); the top layer stacks by opening
  order; i18n (`dir="auto"`, caps reset by script, fallback fonts); icons at two sizes; the flight panel in its feature.
- **In the designs:** built from token reads only; true copy; valid names; the phone reads; the header the same everywhere; no
  overlap; the signing block in all its states.

## The approved designs

The designs live in the private design canvas https://claude.ai/artifact/4jCyjV2cxNjadXsPuHa7k2: the system at a glance, before and
after, the face, the cosmos, a trip, an arrival, the full chat, its states, the rich cards and the phone. Jarvis's answers stand out
in the violet tone; a room shows people and help first; a person's face is a nebula with its constellation, its spread measured; a
country is its flag.

## Not designed

Table and Checkbox (the admin console); QR codes and fingerprints; amounts and units in fields; voice-room states; game, escrow,
event and satellite assemblies; a light theme.

## For the harness

How many pictures: each component declares which of its axes its stories cross, instead of the full product, and `Updated-baseline:`
may name a story folder with one reason.
