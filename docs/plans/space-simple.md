# Space, simple: the header, the tags, the Map (pingpong, 2026-11-08)

Alexis's "go" (2026-11-08) on the proposal page's simple version (https://claude.ai/artifact/LnRHmz7848Qa7wQ6asmMoH, sections
"La version simple" to "À trancher"; D424, D425). Built in the workshop, part by part, each seen live before the next; tests at the end
(the radical mode, CLAUDE.md), tier-1 files excepted.

## Rules for every part

- No regression on what moves today (Alexis: "pas de régression du côté des animations"). Checked live after each part:
  - the flight (van Wijk–Nuij), the lens shift riding it, the scan's undraw, the plate's arrival (GSAP, `arrival.ts`), the page's
    rise and its ghost (`rise.ts`), the rail's rise-in, the labels' declutter and the rail's magnify;
  - the chat's grow from its dock and shrink back (`fullMove.ts`), the views' sliding cream fill (D369), the Earth's signs and its
    turn to a sign with no zoom-out (D420);
  - V and the Plan's open (`viewKeys.ts`), Escape and the wheel going up a level.
- Everything new moves with the same care (Alexis: "animé avec la même qualité et soin … smooth"): the design system's motion tokens
  (`--motion-fast/base/slow`, `--ease-standard/in`), GSAP where a sequence needs it as `arrival.ts` does, a dim or a glow eased, never
  snapped; nothing that loops for ever; reduced motion gives the end state at once.
- Nothing jumps or moves at once, anywhere (Alexis: "partout … rien ne doit sauter ou bouger d'un coup"): what appears fades or rises
  in, what goes fades out, what changes size or place eases to it; a control that comes and goes keeps its room or folds smoothly.
- One question, one place; one number per fact; mint for mine or unread alone, cream for lit or chosen, amber for people here now.

## Defaults for the page's open questions (Alexis may change any)

| Question | Default | Why |
|---|---|---|
| The four kinds shown | Games, Tokens, DAOs, Social, then More ⌄ | ADR-0002 §3's own examples |
| Active | called on chain in the last 7 days | Discover's window already |
| The markets row | removed from the hero, not moved | the tags take its place; no second home for prices |
| The kinds' classifier | the search's (`styleOf`, D373), its noise kept for now | one classifier; cleaning is its own part |
| Tags at once | one | the search combines |
| On a system | a tag that lights nothing there is hidden | no dead control |
| The Earth's plate | titled Earth again | Chat is the mode's name now |
| Space or Chat kept on the device | yes, a device field | the page's "mode retenu"; a store's shape, approved with the "go" |

## Parts, in order

1. **Clean-ups (S). Done 2026-11-08.** The pages' breadcrumbs become plain kickers (the bar and Escape go up); the chat's Expand and Shrink go (Space and
   Chat do it); the Earth's plate is Earth again; the scene's labels carry names alone (no "N worlds"); the bell counts what is the
   reader's alone; the ticker's kinds leave mint (NEW coral, ON AIR amber).
2. **The tags (M). Done 2026-11-08; a system's own row 2026-11-09 (D428), its counts its own worlds'.** The hero's foot: Live, Active, Games, Tokens, DAOs, Social, More ⌄, in place of the markets row; one picked at a
   time, in the address (`?lens=`); space dims what it does not light (eased), labels the lit systems "name · n"; the rail lists the lit
   worlds; Go explore flies to the next lit place; a legend line while a tag is on.
3. **The honest sky (S-M). Done 2026-11-08, but the size's smoothing over days and the address labels on hover alone.** A planet's size follows its use (callers and importers, log scale); the galaxy ranks systems by callers and
   importers; an address-named system takes its first world's name; such a system's label shows on hover alone.
4. **The rail by level (S). Done 2026-11-09 (D428).** On a system, its own worlds, all of them, fading out and in as it changes.
5. **The hover card and Built on / Used by (S-M).** One card for a label, a mark or a rail row; the plate's links, folded.
6. **The Map (M-L). Done 2026-11-09 (D427).** Space | Map | Chat in the header; one flat map for the galaxy (Atlas), a system and a world's
   links, from space's own layout, in space's look (stars, the planets' pictures, the scene's pills); zoom − + ⤢ in Map alone. The Plan
   stays beside 3D (Alexis, 2026-11-09), its two views in a system's hero (D428); the rail's icons are gone. Rebuilt on 2026-11-09 as space seen from above with the links (D433). To rework later (Alexis, 2026-11-09): on a world's page the Map, a small system between the plate and the chat, is "not a possible view"; its shape (full screen, the system's level, or none on a world) is still to choose.
7. **The first visit (S).** A banner after the first landing, "New here? Show me around", the tour in four steps; Menu › Help.
8. **The chat's small planet (M). Done 2026-11-09 (D439).** Space's planet in the full chat's panel, 3D or Map, hidden by a control and remembered, off on phones; the Earth's signs stay the page's.
9. **Later (M-L).** Space or Chat kept on the device; the unread count on Chat; Your trail as a tag; the 24 h / 7 d / 30 d pulse.
10. **The phone (S).** View in space off Share, the bottom bar off the text, /s/<namespace> showing its system, the header's height.
