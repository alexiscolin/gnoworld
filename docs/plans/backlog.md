# Backlog

Every concept of ADR-0002 §1 that is built, placed in a slice, in order, with ADR-0001's
rollout kept. One slice at a time, each with its own plan in `docs/plans/` before it starts
(CLAUDE.md).

"Human" marks the code Alexis writes after Claude writes the failing tests (CLAUDE.md,
pairing). "Asks" lists the dependencies to ask for in that slice. Each slice ends with the
review card and stops.

**Every slice also:**
- passes the memory and security checklists (`docs/ARCHITECTURE.md`) for what it adds;
- uses only design-system components and tokens (`docs/DESIGN-SYSTEM.md`);
- adds its Playwright journey, with axe;
- leaves no dead code.

## Phase 0: a public hub

The chain is read, never written.

| # | Slice | Delivers | Tests first (the main ones) | Human | Asks |
|---|---|---|---|---|---|
| 0 | Harness and gate | Done (`slice-0-harness.md`) | — | — | — |
| 1 | Skeleton, routes and the gate | `app/` with React Router 8 (`ssr: false`, `prerender`) and the PWA; strict TypeScript; ESLint with the import boundaries; Vitest; Playwright with axe; the build budgets; the unused-code finder and the CSS linter in `check.sh`. Settles ADR-0002 §6's checks for slice 1 | `/` and one `/w/:world` pre-render with their own title, description, canonical and Open Graph tags; a forbidden import fails lint; a page over budget fails the gate; the PWA installs and asks before updating | `core/irc`: the IRCv3 line and tag parser | `react-router`, `@react-router/dev`, a CSS linter, an unused-code finder, a Lighthouse runner |
| 2 | Design system | The designs of the panels and of a trip, approved before code (ADR-0001 §7). Then: tokens, layers, base; `Button`, `IconButton`, `Chip`, `Tabs`, `Popover`, `Dialog`, `Card`, `Row`, `Field`, `Avatar`, `PlanetThumb`, `Stat`, `ActivityChart`, `Kicker`, `Flash`, `EmptyState`, `Skeleton`; the icon set; a page that shows every component and state | Each component's states render and pass axe; focus is visible; the keyboard works in `Tabs`, `Popover` and `Dialog`; no `!important` and no raw colour (lint) | — | — |
| 3 | Ergo and the login | Ergo configured for WebSocket, `+M`, and `allow-individual-delete`; the Go login program on `auth-script` (one Adena signature, a gno name from `r/sys/users`) | A forged or replayed signature is refused; a name that does not resolve is refused; a guest can read but not speak | — | — |
| 4 | Public rooms in the browser | Rooms and the room switcher; history; replies, reactions, mentions, threads, pins; the rich composer (Markdown on the wire) with the format bar and emoji; slash commands with autocomplete and the Alt shortcuts; the message menu (copy, room link, save, report, delete your own); mark unread, saved messages and drafts on the device; place links; link embeds with the gallery and lightbox; Who's here; the basic person card; in-app notifications filtered by kind and world; the opt-in country tag. Checks: Ergo `LIST` counts and history for a non-member | Markdown never produces HTML from data; a 40-room list stays usable; a reconnect resumes history with no duplicates; the chat history is windowed; only https embeds from allowed hosts render | `core/markdown`: text to an allowlisted tree | — |
| 5 | Data and the 2D interface | The data files (hubs, ecosystems, systems, stations, events, expedition, quests, news) checked with Zod at build time; the list view; ⌘K search; pages for the Earth, worlds, ecosystems and systems in 2D (facts, activity, connected worlds from data, the talk box, the real previews, realm facts, links); realm cards with free reads; read-only proposal cards; the status ring's data; contextual quick actions that read; the hero, the block height and the ticker; every place pre-rendered, with its Open Graph image, `sitemap.xml` and `robots.txt`; the preview capture job | A malformed data file fails the build; every place has a page and a sitemap entry; Lighthouse SEO and accessibility at 100 on `/` and a world; a world with no capture shows no preview | `core/places`: places and their canonical URLs from the data | — |
| 6 | Bubbles on the Earth | `pickBubbles` and its rules file (ADR-0001 §7), with the far-side counts; the globe turns to your own message | Every rule of ADR-0001 §7 has a test: caps, one per country, per-speaker delay, order, cut, muted, far side | `core/pickBubbles` | — |
| 7 | The 3D space | The scene over the same data: the cosmos, ecosystems, systems, stations, the map view, flights, level of detail, labels with no overlap, heat from room counts, the telescope (if slice 4's check allows), embassies, room markers, the status ring, the rail's dock magnification, the loader; the Earth and its bubbles | After 20 flights, GPU resources are at their baseline and the JS heap is within 10%; 60 fps while travelling on a mid-range phone profile; with reduced motion, flights become crossfades and nothing orbits; every place stays reachable with the 3D off | `core/lod`: which labels show | GSAP and camera-controls (in ADR-0001 §12; confirm the versions) |
| 8 | Discovery on the device | The passport (stamps, constellations, "you charted it"); the daily expedition and its streak; quests (read steps); "Go explore"; follow; share (share sheet, link, snapshot); the calendar from the data file, with reminders on the device | The expedition is the same for everyone on a given day; a stamp survives a reload; streaks count UTC days; a reminder survives a reload | `core/expedition` | — |
| 9 | Phase-0 exit | Moderation and its legal side (question 5), with reports from the message menu; ADR-0001's and ADR-0002's exit criteria checked on a phone; a plain IRC client joins the same room | The exit criteria | — | — |

## Phase 1: social on chain

ADR-0001's phase 1 stands, with ADR-0002's concepts added. Each slice gets its plan when
phase 0 is done. Realms are written by Claude and audited (`docs/REVIEW.md`, tier 1).

| Slice | Delivers |
|---|---|
| Hubs realm | `r/gnoworld/hubs`: store plus versioned rules (ADR-0001 §8, §14), on onyx, then mainnet after audit |
| Sessions and the sponsor | As ADR-0001 phase 1 |
| Profiles and follows | The profile realm on `r/sys/users` names (ADR-0001); `/@:name` pages; following people; friends on the map; opt-in Earth presence |
| Realm calls | Call cards: preview, sign in Adena, landing in a block, result (ADR-0002 §3); votes and the BUBBLE boop as calls; quick actions that call; on-chain activity lines in rooms, from the indexer; the ticker's chain events |
| Signals | The Go binary's signals role: heat with realm calls; routes; new realms as signals, with "first to chart" and "first words"; visitors from other worlds; the telescope if it was not possible in phase 0 |
| Namespace systems | One star per registered namespace, with its realms and packages (`vm/qpaths`), and the level of detail that scales it |
| Jarvis | The service (ADR-0002 §4): concierge, realm reader, catch up, weekly report. Question 15 decided first; translation with it if decided |
| Chat bots | Polls and comets (`TAGMSG`, `draft/relaymsg`), rate-limited |
| Media | The upload service (ADR-0002 §5), uploads in rooms, and an uploaded avatar if decided. Question 16 decided first |
| Push | `draft/webpush` through the PWA: mentions, followed worlds, event reminders |
| Events by moderators | `/event` in a world, on the calendar and in its JSON-LD |
| Social details | "New here"; routed questions with opt-in helpers, "Thanks" and "helped N" |
| On-chain extras of ADR-0001 | Globe beacons as a ring buffer; tips and stamps in the same transaction |

## Phase 2: private, and depth

ADR-0001's phase 2 stands:
- MLS for DMs and private rooms, with the chat key, device keys, KeyPackages and the relay
  role;
- `r/seal` split into its store and `seal/v1` (`docs/plans/seal-store.md`), then seals on
  private conversations;
- DAO adapters;
- escrow cards;
- group seals, measured first;
- encrypted archives;
- the weshnet evaluation.

ADR-0002 adds:
- satellites: the slot realm (question 20 decided first);
- passport stamps on chain, if decided.

## Phase 3: mainnet

As ADR-0001's rollout.

## Not built

The cut items of ADR-0002 §1 and §6:
- voice rooms;
- the quiz;
- message editing in phase 0;
- bubbles on worlds other than the Earth;
- the latest post on X, unless a source is decided;
- Jarvis writing or deploying contracts.
