# Backlog

Every concept of ADR-0002 §1 that is built, placed in a slice, in order, with ADR-0001's
rollout kept. One slice at a time, each with its own plan in `docs/plans/` before it starts
(CLAUDE.md).

"Human" marks the code Alexis writes after Claude writes the failing tests (CLAUDE.md,
pairing). "Asks" lists the dependencies to ask for in that slice. Each slice ends with the
review card and stops.

**Every slice also:**
- adds its tests at every level of ADR-0002 §9 that applies, failing first, with CI green
  before the merge, and passes the AI review of `docs/REVIEW.md`;
- answers ADR-0002 §9's three questions in its plan, before code: its threat model, the
  cost of its hot paths with their benches, and the limit it hits first;
- passes the memory and security checklists (`docs/ARCHITECTURE.md`) for what it adds;
- uses only design-system components and tokens (`docs/DESIGN-SYSTEM.md`);
- adds its Playwright journey, with axe;
- leaves no dead code.

## Phase 0: a public hub

Users sign their own calls in Adena. gnoworld's only write of its own is the slot realm
(ADR-0002 §8, row 11).

| # | Slice | Delivers | Tests first (the main ones) | Human | Asks |
|---|---|---|---|---|---|
| 0 | Harness and gate | Done (`slice-0-harness.md`) | — | — | — |
| 1 | Skeleton, routes, the gate and CI | CI running `scripts/check.sh` on every push (it runs once the repo has a remote); `app/` with React Router 8 (`ssr: false`, `prerender`) and the PWA; strict TypeScript; ESLint with the import boundaries; Vitest; Playwright with axe; the build budgets; the unused-code finder and the CSS linter in `check.sh`. Settles ADR-0002 §8's checks for slice 1 | `/` and one `/w/:world` pre-render with their own title, description, canonical and Open Graph tags; a forbidden import fails lint; an import cycle fails lint; the compiler flags of `docs/ARCHITECTURE.md` are on; a page over budget fails the gate; the PWA installs and asks before updating | `core/irc`: the IRCv3 line and tag parser | `react-router`, `@react-router/dev`, a CSS linter, an unused-code finder, a Lighthouse runner, an import-cycle check, Testing Library, a property-testing library, a TypeScript mutation tester |
| 2 | Design system | The designs of the panels and of a trip, approved before code (ADR-0001 §7). Then: tokens, layers, base; `Button`, `IconButton`, `Chip`, `Tabs`, `Popover`, `Dialog`, `Card`, `Row`, `Field`, `Avatar` (the astronaut generator), `PlanetThumb`, `Stat`, `ActivityChart`, `Kicker`, `Flash`, `EmptyState`, `Skeleton`; the icon set; a page that shows every component and state | Each component's states render and pass axe; the same name gives the same astronaut, readable at 20 px; focus is visible; the keyboard works in `Tabs`, `Popover` and `Dialog`; no `!important` and no raw colour (lint) | — | — |
| 3 | Ergo and the login | Ergo configured for WebSocket, `+M`, and `allow-individual-delete`; the Go login program on `auth-script` (one Adena signature, a gno name from `r/sys/users`) | A forged or replayed signature is refused; a name that does not resolve is refused; a guest can read but not speak | — | — |
| 4 | Public rooms in the browser | Rooms and the room switcher; history; replies, reactions, mentions, threads, pins (one through `TOPIC`; several if Ergo supports channel metadata); the rich composer (Markdown on the wire) with the format bar (no underline) and emoji; plain DMs, labelled "not encrypted", with block, report, and strangers off; slash commands with autocomplete and the Alt shortcuts; the message menu (copy, room link, save, report, delete your own); mark unread, saved messages and drafts on the device; place links; link embeds from the accepted services, with the gallery and lightbox; Who's here; the basic person card; in-app notifications filtered by kind and world; the opt-in country tag. Checks: Ergo `LIST` counts and history for a non-member | Markdown never produces HTML from data; a 100-room list stays usable; a reconnect resumes history with no duplicates; the chat history is windowed; only embeds from the accepted services render, and only after the moderation check; every DM shows "not encrypted"; a stranger's DM is refused when strangers are off | `core/markdown`: text to an allowlisted tree | — |
| 5 | Data and the 2D interface | The data files (universes, hubs, ecosystems, stations, genres, events, expedition, quests, news) checked with Zod at build time; the list view with genre filters; the phone layout, chat first, with planet thumbnails (ADR-0002 §8, row 10); ⌘K search; pages for the Earth, worlds and ecosystems in 2D, in every universe (facts, activity, connected worlds from data in their three kinds of row, the talk box, the real previews, realm facts, links); realm cards without a model (first lines, pinned actions, the link to gnoweb), the whole page in the realm view from its raw Markdown through `core/markdown` (gnoweb's extensions degraded), and the realm view's actions (read functions through `vm/qeval`; ADR-0002 §4); proposal cards; the status ring's data; contextual quick actions; the hero; the markets row from `markets.json` and its scheduled job; the block height and the ticker; every place pre-rendered, with its Open Graph image, `sitemap.xml` and `robots.txt`; the preview capture job | A malformed data file fails the build; every place has a page and a sitemap entry; Lighthouse SEO and accessibility at 100 on `/` and a world; a world with no capture shows no preview | `core/places`: places and their canonical URLs from the data | — |
| 6 | Bubbles on the Earth | `pickBubbles` and its rules file (ADR-0001 §7), with the far-side counts; the globe turns to your own message | Every rule of ADR-0001 §7 has a test: caps, one per country, per-speaker delay, order, cut, muted, far side | `core/pickBubbles` | — |
| 7 | The 3D space | The scene over the same data: the cosmos, ecosystems, stations, the universe switcher and its jump, the planet generator of ADR-0002 §3 (classes, surfaces, palettes, atmospheres, rings and moons, data layers, wonders; the anti-repetition golden; the GPU variety view), the map view, flights and the flight panel, the level-of-detail ladder of ADR-0002 §3 with its draw bound kept as a budget, labels with no overlap, the genre lens, heat from room counts, the telescope (if slice 4's check allows), embassies, rooms as moons, storms (log scales and caps, ADR-0002 §3), the status ring, the rail's dock magnification, the loader; the Earth with its bubbles and its hotspots per country | After 20 flights, GPU resources are at their baseline and the JS heap is within 10%; 60 fps while travelling on a mid-range phone profile; with reduced motion, flights become crossfades and nothing orbits; every place stays reachable with the 3D off; on a phone, nothing of the 3D loads before "View in space"; after a minute with no input the scene asks at most 10 frames a second, and none when hidden or covered; the Auto probe drops to Low above 20 ms and remembers it; "Reduce animations" freezes motion; the bench holds 60 fps with the CPU slowed 4× | `core/lod`: which labels show; `core/planet`: a seed to a planet's parameters | GSAP and camera-controls (in ADR-0001 §12; confirm the versions) |
| 8 | Discovery on the device | The menu and the settings screen (ADR-0002 §1), every setting saved on the device and applied at once; the passport (stamps, progress per constellation, never the total; "you charted it" and the first-visit moment); the daily expedition and its streak; quests (steps that call once slice 9 lands); "Go explore"; follow; share (share sheet, link, snapshot); the calendar from the data file, with reminders on the device | The expedition is the same for everyone on a given day; a stamp survives a reload; streaks count UTC days; a reminder survives a reload; every setting survives a reload and takes effect without one | `core/expedition` | — |
| 9 | Calls and the chain in rooms | The call card (preview, sign in Adena, landing in a block, result; ADR-0001 §11's warnings; the network checked); registering a name in the app (`r/sys/users`); votes, `<gno-form>`s and write functions; quick actions and quest steps that call; the client's subscription to the public indexer: activity lines in rooms, the ticker's chain events, new realms as signals, the Earth's realms deployed in 24 h; the Go binary's first signals: who charted first, first words | Nothing shows as done before its chain event; the preview names realm, function, arguments, network and fee before Adena opens; a call on the wrong network is stopped before signing; arguments follow the types a call carries; one first-to-chart per world | `core/args`: typed fields to a call's arguments | — |
| 10 | Jarvis | The service (ADR-0002 §5): the harness and its four locks; gnomcp, gnoscope and our MCP server; the skills; evals and observability (Grafana, Langfuse) first. Then concierge, realm reader, digests, chain questions, action proposals, catch up, automatic translation; its button and its answer buttons | A write tool is denied and logged; the injection suite passes; every number, link and function in a digest traces to its source; a proposal for a function that does not exist shows nothing; at 100% of the budget Jarvis answers with Haiku; a translation is made once per message and language | — | `@anthropic-ai/claude-agent-sdk`, the OpenTelemetry SDK; hosting Grafana and Langfuse |
| 11 | Satellites | The slot realm, written by Claude and audited (`gno-audit`, then external): a rent needs the moderation service's approval, verified in the realm (ed25519); 1, 3 or 7 days; one per world; 40 characters; takedown with the days left refunded. The rent card, the slot on the plate, the satellites in space, "Sponsored" in search. Mainnet's deploy approval requested | A rent without a valid approval, or with one for other text or another slot, is refused; a takedown refunds the days left; a second satellite on a world is refused; the mutation check finds every guard | — | Mainnet's deploy approval |
| 12 | Phase-0 exit | The admin console (ADR-0002 §6): roles from the repo, the moderation queue, curation as pull requests, the audit log. The moderation bot (ADR-0002 §6): OpenAI's Moderation API after posting, previews after the check, the reason shown, contests to a person, reports from the message menu; the rest of ADR-0001's question 5. PostHog: counts only, cookieless, with field Web Vitals. ADR-0001's and ADR-0002's exit criteria checked on a phone; a plain IRC client joins the same room | A flagged message is hidden and its author sees why; a contest reaches a person; a preview never renders before its check; no PostHog event carries text or a name; a person without a role cannot open the console; a sensitive action without a fresh signature is refused; every action lands in the audit log; a call lands; Jarvis's evals pass; a satellite shows only after its check; the exit criteria | — | `posthog-js`; a GitHub App |

## Phase 1: social on chain

ADR-0001's phase 1 stands, with ADR-0002's concepts added. Each slice gets its plan when
phase 0 is done. Realms are written by Claude and audited (`docs/REVIEW.md`, tier 1).

| Slice | Delivers |
|---|---|
| Hubs realm | `r/gnoworld/hubs`: store plus versioned rules (ADR-0001 §8, §14), on onyx, then mainnet after audit |
| Sessions and the sponsor | As ADR-0001 phase 1 |
| Profiles and follows | The profile realm on `r/sys/users` names (ADR-0001), with the astronaut's chosen parts and the stamp count if the person publishes it; `/@:name` pages; following people; friends on the map; opt-in Earth presence |
| Signals | The Go binary's signals role: heat with realm calls; auroras (ADR-0002 §3); the rank, the dust, the seasons and, when the count needs them, the tiles (ADR-0002 §3); routes; visitors from other worlds; the telescope if it was not possible in phase 0 |
| Namespace systems | One star per registered namespace, with its realms and packages (`vm/qpaths`); the `/n/`, `/r/` and `/p/` URLs; genres computed from imports (ADR-0002 §3) |
| Chat bots | Polls and comets (`TAGMSG`, `draft/relaymsg`), rate-limited; comets fly in space, merged and capped (ADR-0002 §3) |
| Voice rooms | Its ADR first; then a WebRTC voice room per world, with live moderation |
| Room games | Its ADR first, after sessions and the sponsor; a game bot and a game realm, results on chain, no money |
| Push | `draft/webpush` through the PWA: mentions, followed worlds, event reminders |
| Events by moderators | `/event` in a world, on the calendar and in its JSON-LD |
| Social details | "New here"; routed questions with opt-in helpers, "Thanks" and "helped N"; the weekly report, written by the team |
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

## Phase 3: mainnet

As ADR-0001's rollout.

## Not built

The cut items of ADR-0002 §1 and §8, and what waits for its own decision:
- message editing in phase 0;
- bubbles on worlds other than the Earth;
- the latest post on X, unless a source is decided;
- Jarvis writing or deploying contracts;
- hosted media uploads, until decided;
- pots in games, until decided.
