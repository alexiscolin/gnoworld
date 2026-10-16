# The prototype

The prototype was approved on 2026-10-16. It is the reference for what gnoworld does and
how it feels. It is **not** a code base. Nothing here is imported, built or maintained.
Every concept is rebuilt slice by slice, test first, as `docs/plans/backlog.md` lists. The
scope and the decisions it changes are in [ADR-0002](../../adr/0002-validated-prototype.md).

## Where to see it

- Live prototype (private artifact):
  https://claude.ai/artifact/RyqhV8fFAJfNq8s14Fh9WL, version 57.
- Walkthrough videos (private artifact), recorded with real mouse and keyboard input:
  https://claude.ai/artifact/RwKWwKdK19K8pavLeSfWUD.
  - Essentials: 2:24.
  - Complete: 3:36.
- `source/`: the prototype's page and script, frozen as they were approved.
  - Run it: serve the folder, for example `python3 -m http.server`, then open
    `source/index.html`.
  - It needs media that are not in this repo:
    - Solar System Scope planet, Earth and sky maps (CC BY 4.0);
    - the sample photos and videos;
    - the preview captures;
    - the station thumbnails.

    Without them, planets render flat and media are missing. The live artifact has them
    all.

## What it is made of, and why none of it carries over

| In the prototype | In the product |
|---|---|
| One 4,000-line script with globals | Feature modules with one owner each (`docs/ARCHITECTURE.md`) |
| Sample data hard-coded in the script | Data from the chain, Ergo and the indexer, validated with Zod at the boundary |
| 20 font sizes, 11 control heights, 82 `!important` | Design tokens and a short scale (`docs/DESIGN-SYSTEM.md`) |
| Timers that fake activity, and fake replies | Real events only; empty states when there are none |
| State in `localStorage` | IndexedDB for what the device keeps, the chain for what is public |
| Fixes stacked on fixes, dead code from earlier versions | Each slice reviewed, with no dead code |
| No tests | Test first, with one gate (`scripts/check.sh`) |
| A modal for signatures | Inline transaction cards (ADR-0001 §7). The modal stood in for the card |
| Jarvis answers a routed question on its own, and its prompt still mentions code help | Jarvis speaks only when asked, and reads realms; it writes no contract (ADR-0002 §5) |
| Bubbles on every planet, voice rooms, a quiz, a pot clock | Cut or changed: ADR-0002 §1 and §8 |

## Reviews

Five reviews of version 43 of the prototype, by subagents, each with one angle. Their
findings were applied up to version 57, or recorded as decisions in ADR-0002.

- [UI](reviews/ui.md): visual craft, motion, overlaps, rhythm.
- [UX](reviews/ux.md): hierarchy, journeys, accessibility.
- [Game design](reviews/game-design.md): loops, cadence, rewards.
- [Product](reviews/product.md): coherence, phases, measurement.
- [Growth](reviews/growth.md): activation, retention, discoverability.
- [First round, 2026-10-15](reviews/first-round-2026-10-15.md): product, game, UI/UX,
  personas, chat benchmark.
