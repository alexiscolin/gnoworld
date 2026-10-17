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
- leaves no dead code;
- runs in the demo stack (`docker compose up`), with its service's image, settings and
  runbook notes (ADR-0002 §7, where it runs).

## Phase 0: a public hub

Users sign their own calls in Adena, on a computer. gnoworld's only write of its own is the
slot realm, on Onyx (ADR-0002 §8, row 11). Phones read (ADR-0002 §1).

| # | Slice | Delivers | Tests first (the main ones) | Human | Asks |
|---|---|---|---|---|---|
| 0 | Harness and gate | Done (`slice-0-harness.md`); the review agents and `/pre-merge` added on 2026-10-17 | — | — | — |
| 1 | Skeleton, routes, the gate and CI | The monorepo: workspaces for `app`, `admin`, `server`, `packages/core`, `packages/schemas`, one lockfile, the gate running them all. The compose file with its `dev` and `demo` profiles and the client's image; the demo published for the team at its demo URL through its own Tailscale container, sealed behind its egress proxy (ADR-0002 §7); CI running `scripts/check.sh` on every push, and the automatic deployment of the demo after a merge (both once the repo has a remote); `app/` with React Router 8 (`ssr: false`, `prerender`) and the PWA; strict TypeScript; ESLint with the import boundaries; Vitest; Playwright with axe; the build budgets; the unused-code finder and the CSS linter in `check.sh`. Settles ADR-0002 §8's checks for slice 1 | `/` and one `/w/:world` pre-render with their own title, description, canonical and Open Graph tags; a forbidden import fails lint; an import cycle fails lint; the compiler flags of `docs/ARCHITECTURE.md` are on; a page over budget fails the gate; the PWA installs and asks before updating; a demo container cannot reach the homelab's services | `core/irc`: the IRCv3 line and tag parser | `react-router`, `@react-router/dev`, a CSS linter, an unused-code finder, a Lighthouse runner, an import-cycle check, Testing Library, a property-testing library, a TypeScript mutation tester, a load-testing tool |
| 2 | Design system | The designs of the panels and of a trip, approved before code (ADR-0001 §7). Then: tokens, layers, base; `Button`, `IconButton`, `Chip`, `Tabs`, `Popover`, `Dialog`, `Card`, `Row`, `Field`, `Avatar` (the astronaut generator), `PlanetThumb`, `Stat`, `ActivityChart`, `Kicker`, `Flash`, `EmptyState`, `Skeleton`; the icon set; a page that shows every component and state | Each component's states render and pass axe; the same name gives the same astronaut, readable at 20 px; focus is visible; the keyboard works in `Tabs`, `Popover` and `Dialog`; no `!important` and no raw colour (lint) | — | — |
| 3 | Ergo, the server, the login and moderation | Ergo configured for WebSocket, `+M`, `allow-individual-delete`, account indexing, and the PROXY protocol from the demo's proxy; the server's skeleton (TypeScript on Node, Hono, `node:sqlite`, `packages/core` and `packages/schemas` shared with the app) in its `server` container; the login: Ergo's `auth-script` in socket mode, Adena's `verifyArbitrarySignature` with the signer, the chain id and the exact text pinned, the nonce and domain checked by the server, then a token for reconnects; the account is the address, the name shown from mainnet's `r/sys/users`. The moderation bot (ADR-0002 §6): in every public room, OpenAI's Moderation API after posting, previews after the check, the reason shown, catch-up with `CHATHISTORY AFTER`; its message counts and the activity API | A forged or replayed signature is refused; a proof made for another network is refused; a spent or expired nonce is refused; a reconnect needs no new signature; a guest can read but not speak; a flagged message is hidden and its author sees why; a preview never renders before its check; after an outage the bot checks what it missed; the activity API answers only for the worlds asked | — | `hono`, `@hono/node-server`, `@hono/zod-validator`, `@adena-wallet/sdk` |
| 4 | Public rooms in the browser | Rooms and the room switcher; history; replies, reactions, mentions, threads, pins (one through `TOPIC`; several if Ergo supports channel metadata); the rich composer (Markdown on the wire) with the format bar (no underline) and emoji; plain DMs, labelled "not encrypted", with block, report, "only from people I have talked with" and their retention; on a phone, reading only, with "To speak, log in on a computer"; slash commands with autocomplete and the Alt shortcuts; the message menu (copy, room link, save, report, delete your own); mark unread, saved messages and drafts on the device; place links; link embeds from the accepted services, with the gallery and lightbox; Who's here; the basic person card; in-app notifications filtered by kind and world; the opt-in country tag. Checks: Ergo `LIST` counts and history for a non-member | Markdown never produces HTML from data; a 100-room list stays usable; a reconnect resumes history with no duplicates; the chat history is windowed; only embeds from the accepted services render, and only after the moderation check; every DM shows "not encrypted"; a DM from someone you never talked with is refused when that setting is on | `core/markdown`: text to an allowlisted tree | — |
| 5 | Data and the 2D interface | The Broadcast Moon viewer (categories, the team's generative pieces, embeds loaded on a click). The data files (universes, hubs, ecosystems, stations, genres, events, expedition, quests, news) checked with Zod at build time; the list view with genre filters; the phone layout, chat first, with planet thumbnails (ADR-0002 §8, row 10); ⌘K search; pages for the Earth, worlds and ecosystems in 2D, in every universe (facts, activity, connected worlds from data in their three kinds of row, the talk box, the real previews, realm facts, links); realm cards without a model (first lines, pinned actions, the link to gnoweb), the whole page in the realm view from its raw Markdown through `core/markdown` (gnoweb's extensions degraded), and the realm view's actions (read functions through `vm/qeval`; ADR-0002 §4); proposal cards; the status ring's data; contextual quick actions; the hero; the markets row from `markets.json` (the server's timer writes it in slice 3); the block height and the ticker; every place pre-rendered, with its Open Graph image, `sitemap.xml` and `robots.txt`; the preview capture job | A malformed data file fails the build; every place has a page and a sitemap entry; Lighthouse SEO and accessibility at 100 on `/` and a world; a world with no capture shows no preview | `core/places`: places and their canonical URLs from the data | — |
| 6 | Bubbles on the Earth | `pickBubbles` and its rules file (ADR-0001 §7), with the far-side counts; the globe turns to your own message | Every rule of ADR-0001 §7 has a test: caps, one per country, per-speaker delay, order, cut, muted, far side | `core/pickBubbles` | — |
| 7 | The 3D space | The hand-made art, from slice 2's approved designs: the Earth, GovDAO and the three stations. Storms, moon flares and rates from the activity API, near a world only; labels that follow every frame; data saver; a test switch for the gate's software renderer. The scene over the same data: the cosmos, ecosystems, stations, the universe switcher and its jump, the planet generator of ADR-0002 §3 (classes, surfaces, palettes, atmospheres, rings and moons, data layers, wonders; the anti-repetition golden; the GPU variety view), the map view, flights and the flight panel, the level-of-detail ladder of ADR-0002 §3 with its draw bound kept as a budget, labels with no overlap, the genre lens, heat from room counts, the telescope (if slice 4's check allows), embassies, rooms as moons, storms (log scales and caps, ADR-0002 §3), the status ring, the rail's dock magnification, the loader; the Earth with its bubbles and its hotspots per country | After 20 flights, GPU resources are at their baseline and the JS heap is within 10%; 60 fps while travelling on a mid-range phone profile; with reduced motion, flights become crossfades and nothing orbits; every place stays reachable with the 3D off; on a phone, nothing of the 3D loads before "View in space"; after a minute with no input the scene asks at most 10 frames a second, and none when hidden or covered; the Auto probe drops to Low above 20 ms and remembers it; "Reduce animations" freezes motion; the bench holds 60 fps with the CPU slowed 4× | `core/lod`: which labels show; `core/planet`: a seed to a planet's parameters | GSAP and camera-controls (in ADR-0001 §12; confirm the versions) |
| 8 | Discovery on the device | The menu and the settings screen (ADR-0002 §1), every setting saved on the device and applied at once; the passport (stamps, progress per constellation, never the total; "you charted it" and the first-visit moment); the daily expedition and its streak; quests (steps that call once slice 9 lands); "Go explore"; follow; share (share sheet, link, snapshot); the calendar from the data file, with reminders on the device | The expedition is the same for everyone on a given day; a stamp survives a reload; streaks count UTC days; a reminder survives a reload; every setting survives a reload and takes effect without one | `core/expedition` | — |
| 9 | Calls and the chain in rooms | `lib/adena` over `window.adena` (ADR-0002 §4, Adena): detection and version, `GetAccount` and `GetNetwork` before each action, one listener per page, one request at a time, every error code as a state; the call card (preview with the fee as an estimate, sign in Adena, the hash followed to its block, the result; ADR-0001 §11's warnings; the network read again and switched or added); calls with more than two fields in the realm view; registering a name in the app (`r/sys/namereg/v0.Register`); votes, `<gno-form>`s and write functions; quick actions and quest steps that call; the client's subscription to the public indexer: activity lines in rooms, the ticker's chain events, new realms as signals, the Earth's realms deployed in 24 h; the server's first signals: who charted first, first words | Nothing shows as done before its chain event; the preview names realm, function, arguments, network and fee before Adena opens; a call on the wrong network is stopped before signing; a second request waits for the first; arguments follow the types a call carries; one first-to-chart per world; Adena's answers that fail their schema become an error state | `core/args`: typed fields to a call's arguments | — |
| 10 | Jarvis | The `jarvis` container (ADR-0002 §5, §7): the loop on `@anthropic-ai/sdk`, its allowlist and its log; one long-lived gnomcp, started read-only; our tools; gnoscope behind a switch; the skills; the hard budget, translation's own budget, timeouts; evals and traces in Grafana first. Then concierge, realm reader, digests, chain questions, action proposals, catch up, automatic translation; its button and its answer buttons | A tool off the allowlist is refused and logged; the injection suite passes; every number, link and function in a digest traces to its source; a proposal for a function that does not exist shows nothing; at 100% of the budget Jarvis stops and every feature falls back to its form without a model; a translation is made once per message and language; `jarvis` holds no key but Anthropic's | — | `@anthropic-ai/sdk`, `@modelcontextprotocol/client`, `@opentelemetry/api`, `@opentelemetry/sdk-trace-node`, `@opentelemetry/exporter-trace-otlp-http` |
| 11 | Satellites, on Onyx | The slot realm, written by Claude and audited (`gno-audit`), deployed on Onyx: a rent needs the moderation service's approval, verified in the realm (ed25519) and bound to everything it allows; 1, 3 or 7 days; one per world; 40 characters; the operator key's takedown with the days left refunded; the owner multisig's rotation and pause. The rent card, the slot on the plate, the satellites in space in the Onyx universe only, "Sponsored" and "Testnet" labels | A rent without a valid approval, or with one for other text, another slot or past its expiry, is refused; a takedown refunds the days left; a second satellite on a world is refused; only the multisig rotates or pauses; the mutation check finds every guard | — | — |
| 12 | Phase-0 exit | The admin console on its own origin, on the private network only (ADR-0002 §6): roles from the repo, the moderation queue with reports and contests, curation as pull requests, kill switches, the audit log shipped to the log backend. PostHog: counts only, cookieless, with field Web Vitals and the field frame rate. The hand-off to ops: every image (multi-architecture, SBOM, pinned), `.env.example`, `docs/OPERATIONS.md`, backups with a restore test, the outside probe and its alerts, checked by bringing the whole stack up from scratch on a clean machine. The red-team pass on Jarvis and the penetration test of the console. ADR-0001's and ADR-0002's exit criteria checked on a computer and on a phone; a plain IRC client joins the same room on the private network | A contest reaches a person; no PostHog event carries text or a name; a person without a role cannot open the console; a sensitive action without a fresh signature is refused; every action lands in the audit log; a call lands; Jarvis's evals pass; a satellite shows on Onyx only after its check; a backup restores; the exit criteria | — | `posthog-js`; a GitHub App |

## Phase 1: social on chain

ADR-0001's phase 1 stands, with ADR-0002's concepts added. Each slice gets its plan when
phase 0 is done. Realms are written by Claude and audited (`docs/REVIEW.md`, tier 1).

| Slice | Delivers |
|---|---|
| Hubs realm | `r/gnoworld/hubs`: store plus versioned rules (ADR-0001 §8, §14), on onyx, then mainnet after audit |
| Sessions and the sponsor | As ADR-0001 phase 1 |
| Langfuse | Langfuse Cloud's free tier for Jarvis; a question's text only with consent (ADR-0002 §5) |
| Satellites on mainnet | The external audit, mainnet's approval, the revenue's recipient named, then the same realm on mainnet (ADR-0002 §8, row 7) |
| Phones that speak and sign | A decision first: Adena's mobile app when it ships, or the SDK's social login (ADR-0002 §4) |
| Profiles and follows | The profile realm on `r/sys/users` names (ADR-0001), with the astronaut's chosen parts and the stamp count if the person publishes it; `/@:name` pages; following people; friends on the map; opt-in Earth presence |
| Signals | The server's signals role: heat with realm calls; auroras (ADR-0002 §3); the rank, the dust, the seasons and, when the count needs them, the tiles (ADR-0002 §3); routes; visitors from other worlds; the telescope if it was not possible in phase 0 |
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
