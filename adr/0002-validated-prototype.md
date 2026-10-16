# ADR-0002: The validated prototype — scope, addresses, scale, Jarvis, and what it changes in ADR-0001

| | |
|---|---|
| Status | Proposed. The lead approved the prototype on 2026-10-16. Alexis made the open decisions on 2026-10-17 (§8, questions 14–20). This text waits for his reading |
| Date | 2026-10-16, revised 2026-10-17 |
| Author | Alexis Colin |
| Builds on | [ADR-0001](0001-gnoworld.md). Amends its §7 (levels and two navigation rules), §10 (the generated face), §12 (routing, rendering), §13 (pieces and hosting) and its "Ideas to place". Answers part of its question 5 (moderation of public rooms) |
| Prototype | [docs/prototype](../docs/prototype/README.md): live artifact (version 57), two walkthrough videos, five reviews |
| Verified | **2026-10-16:**<br>- npm: `react-dom` 19.3.1 exports `react-dom/static`; `react-router` and `@react-router/dev` are at 8.4.0.<br>- React Router's pre-rendering guide.<br>- `gno.land/r/gov/dao` on onyx with gnomcp: `Render` and `GetProposal` are free reads; `MustVoteOnProposalSimple(cur realm, pid int64, option string)` is a call.<br>**2026-10-17:**<br>- The Claude Agent SDK docs: MCP, permissions, skills, hooks, observability, cost.<br>- gnomcp 0.12.0's `docs/security.md`: a read-only chain has no write path.<br>- seedfall's ADR-002 §2.2, §2.6 and ADR-008 §12.3.<br>- gnomcp's `docs/tools.md`: `gno_status`, `gno_history`, `gno_activity` (the tx-indexer has no transaction time yet).<br>- gno's `gno.land/pkg/sdk/vm/convert.go` (2026-10-15): a call's arguments are primitive types and bytes only.<br>- gnoweb serves a realm's page as raw Markdown on `Accept: text/markdown` (gno PR #5794).<br>**Secondary sources only, to confirm in their slice:** OpenAI's Moderation API and PostHog |

## Summary

A clickable prototype was built and approved: 57 versions over two days, reviewed from five
angles (UI, UX, game design, product, growth). It keeps ADR-0001's principles and makes
them concrete. gnoworld is a **live, hyper-social map of gno.land**:

- every realm is a world with its own rooms;
- groups of worlds fly together as ecosystems;
- the map shows where people are and what is moving;
- every world leads to its realm: read it for free, call it with Adena.

This ADR records:

1. **The concepts.** What the product does, each concept placed in a phase with the pieces
   it needs (§1).
2. **Addresses and search.** Every place has a URL and a pre-rendered page, with no server
   in production (§2).
3. **The universe at scale.** Millions of realms stay readable: one stable place each, a
   rank from real signals, and a bounded level of detail (§3).
4. **Realm calls.** Reads are free; calls are inline cards signed in Adena (§4).
5. **Jarvis.** It reads realms with you and never signs. It runs on a Claude key, gnomcp,
   skills and a harness, with evals and full observability (§5).
6. **Moderation and measurement.** A moderation bot with contests, no hosted media,
   cookieless product analytics (§6).
7. **What changes in ADR-0001.** Every difference with the prototype is decided (§8).

**The prototype's code is not reused.** Every concept is rebuilt slice by slice, test first
(§9, `docs/plans/backlog.md`).

**A word on words.** The product says "world" where ADR-0001 says "hub". The code and the
realm (`r/gnoworld/hubs`) keep "hub". "Satellite" means a sponsored slot (§1); people are
not drawn as satellites (§8). People are astronauts: an avatar is never a planet, since
planets are worlds (§1).

## Context

- **ADR-0001** set the principles: social first, on chain and decentralized, highly
  graphical, integrated with gno. It also set phase 0: a public hub on Ergo, with the chain
  read but never written.
- **The prototype was built to find the product inside those principles.** It is a single
  page with sample data and a script. It uses the network only for:
  - its libraries from a CDN;
  - an optional Adena connection;
  - an optional Claude model behind Jarvis.

  The lead approved it on 2026-10-16.
- **The goal confirmed with it:** a hyper-social chat that makes the ecosystem's activity
  visible, creates momentum, helps people find their way, makes them want to stay and talk,
  and leads them to use realms.
- **A reply from the team asked for "No Man's Sky vibes":** one star per registered
  namespace, with its realms and packages in orbit. ADR-0001 §8 already derives project
  hubs from realm paths, so this fits (§1, §3).
- **The chain may hold millions of realms**, most of them tests or unused. seedfall, a
  sibling project, solved the same problem for islands in a sky. Its rules are reused here,
  adapted (§3).
- **Alexis set Jarvis's scope on 2026-10-16:** it reads and explains realms and prepares
  calls. It does not write or deploy contracts.
- **Alexis set Jarvis's stack on 2026-10-17:** a Claude key, MCP, skills and a harness,
  with evals and complete observability (§5).

## Decision

### 1. The concepts, by phase

Phases are ADR-0001's:
- **0**: a public hub; the chain is read, never written.
- **1**: social on chain.
- **2**: private, and depth.
- **3**: mainnet.

"Device" means IndexedDB on the user's device. "Cut" means not built in any phase.

**Space**

| Concept | What it is | Phase | Needs | Chain |
|---|---|---|---|---|
| The cosmos | gno.land as the sun; namespaces as star systems, realms as planets generated from their path (same path, same planet), placed by §3; the asteroid belt; the uncharted frontier | 0 from the hubs data file; 1 from the chain (§3) | Scene; the hubs data file, then `r/gnoworld/hubs` and the signals | Read |
| Ecosystems | Curated regions: the namespaces of one project or topic placed together, with a group view | 0 | Ecosystems data file, curated by the team | — |
| Universes | One per chain, never shown together. Mainnet (`gnoland-1`) is the default; Onyx, the testnet, and community chains are other universes, reached by a switcher with a jump, not a flight. A testnet is always labelled "Testnet", so test tokens never pass for real ones. Each universe reads and calls its own chain. The Earth and its general room live in the main universe | 0 | The universes data file; one RPC per chain | Read |
| Namespace systems | One star per registered namespace, its realms and packages in orbit | 1 | `vm/qpaths` by namespace; §3 | Read |
| Genres | What a realm is: token, DAO, game, social… A realm can have several. A lens on the map lights one genre wherever it is | 0 from the data file; 1 computed from imports (§3) | The genre classifier | Read |
| Visibility rank and dust | Realms with real signals are planets; quiet realms are dust around their star, still found by search, by URL and in the list (§3) | 1. In phase 0, every world in the data file is a planet | The signals (§7) | Read |
| Stations | Places the team designs and builds in full, then open to everyone: anyone visits, talks in their rooms and uses their content. Not realms, and not necessarily tied to one; labelled as stations. Hand-made realistic 3D, never generated. The team places them in well-defined zones of the map, and they always show, outside the rank (§3). Today: AI Ring (something built with AI), Broadcast Moon (a moon of screens), Harbor (long reads) | 0 | Stations data file and their 3D models, by the team. Broadcast Moon's videos are embeds from accepted services (§6) | — |
| Map view | The same space from above, condensed: distances shortened so the universe fits one screen; each cluster (an ecosystem, a namespace system, a region) one mark with its count; only the landmarks named (rank and curation, stations, the Earth, GovDAO, what you follow); zone captions. Never every planet. A click on a cluster flies into it | 0 | Scene; the ladder of §3 | — |
| Level of detail | The ladder of §3. Key labels from afar: groups, Earth, GovDAO, systems, signals, the two hottest worlds, what you follow, the next event. The rest appear on approach. Labels never overlap | 0 | Scene, labels layer | — |
| Heat | A steady warm glow on the busiest worlds, stronger with activity, with a "24% · 148/h" badge and a rising icon. No rings, no lines | 0 from room user counts; 1 adds realm calls | Ergo `LIST` counts (checked in slice 4); the indexer | Read |
| Telescope | Hover a world's name to read its room's last lines without flying there | 0 if Ergo serves history to a non-member (checked in slice 4), otherwise 1 through the signals feed | Ergo history | — |
| Routes | On hover, lines to the realms a world calls or imports, with traffic moving on them | 1 | Indexer for calls; `vm/qfile` for imports | Read |
| Embassies | A room shared by two worlds, drawn as a small station between them | 0 | One Ergo channel listed by two worlds | — |
| Focus view | The plate: name, two facts, activity chart, one main action, connected worlds, a real capture of the world's page, links. The planet sits on the plate's edge; the chat is docked | 0 | — | Read |
| Status ring | A thin arc around a world for what the realm itself reports: a proposal's tally, a deadline the realm defines. gnoworld invents no timer (§8, row 2) | 0 | Realm reads | Read |
| Rooms as moons | The busiest rooms orbit as moons, four at most, and the room you are in is always one: a moon's size follows the people present, it flares when someone speaks, a click joins the room. A "+96" chip beside them opens the room switcher. The Earth keeps one moon, the real Moon, for its busiest room after the general one (§3) | 0 | Ergo counts | — |
| Storms | A conversation speeding up forms a storm's eye on the planet, growing with the pace of messages; a click joins that room | 0 | Ergo | — |
| Auroras | The poles light with calls to the realm, stronger with calls per minute | 1 | The indexer | Read |
| Comets in space | A message sent to another world's room crosses space as a comet (Chat, comets) | 1 | The comets bot | — |
| Talk box | With the chat closed, the last lines of the world's room on its plate | 0 | — | — |
| Realm facts | Path, deployer, first block, calls in 24 h | 0 for the path; 1 for the rest | The indexer | Read |
| Latest post on X | — | Cut, unless a source is decided | — | — |
| The Earth | Bubbles where people speak from, with counts for the far side ("Japan · 12, far side"); the globe turns to show your own message | 0 | `pickBubbles` and its rules file (ADR-0001 §7) | — |
| Bubbles on other worlds | The prototype pops messages on any planet | Cut: bubbles are the Earth's, by country (ADR-0001 §7). Moons, storms, auroras and heat carry activity elsewhere (§3) | — | — |
| Hero | The number of people online, one line, two big actions | 0 | Ergo counts | — |
| Markets row | GNOT, ATONE and BTC with a 24 h line; the block height | 0 | The prices file (§6) | Read |
| Ticker | A pausable line of what is happening: votes, events, new worlds | 0 from data and rooms; 1 adds chain events | — | Read |
| Rail | The worlds or the groups, magnified like a dock under the pointer. By default, the most used worlds right now (social and realm), after the ones you follow: 25 at most, scrolling, then a "See all" button to the list view. The order changes at most once a minute, only when a world stays clearly ahead, and never under the pointer | 0 | Ergo counts; the signals in phase 1 | — |
| List view | Everything as panels, no 3D, filterable by genre | 0 | — | — |
| Search | ⌘K over the current universe's worlds, ecosystems, stations and genres; in phase 1 over every realm, dust included | 0 | — | — |
| Loader | Real texture progress, then the space opens like an iris | 0 | — | — |

**Chat** (Ergo in phase 0, ADR-0001 §1)

| Concept | Phase | Needs |
|---|---|---|
| Rooms, shared rooms, and a room switcher that scales to hundreds: groups set by the world's moderators, pinned, joined, "active now", then the rest; search, unread counts, the keyboard, a windowed list | 0 | Ergo channels; groups in the hubs data file, then `r/gnoworld/hubs` |
| Replies, reactions, mentions, threads built from reply chains | 0 | `+draft/reply`, `+draft/react` (message-tags) |
| Rich composer: bold and italic show as such; Markdown on the wire; code blocks and lists | 0 | `draft/multiline` |
| Slash commands with autocomplete; `#room` and `@name` completion; Alt+Up and Alt+Down between rooms | 0 | — |
| Message menu: copy, room link, save, report, delete your own | 0. Delete needs `allow-individual-delete` on (it is off by default); report goes to moderation (§6) | `draft/message-redaction` |
| Moderation: a bot checks each public message; a hidden message says why and can be contested | 0 | The moderation bot (§6) |
| Mark unread | 0, on the device | — |
| Edit a message | Cut in phase 0: no IRCv3 capability (product review) | — |
| Pins | 0 | Channel `TOPIC` |
| Saved messages and drafts | 0 | Device |
| Place links (`#bubble/arcade` flies there) | 0 | — |
| Contextual quick actions: Who's here, Calendar, Realm, Proposal, Station, Catch up, Poll | 0 for those that read; 1 for those that call (votes), and for Catch up and Poll | — |
| Who's here: the people in the room | 0 | Ergo `NAMES` |
| Person card: the worlds a person belongs to, message them, fly to them | 0 for the worlds they are in; 1 for the profile realm and "helped N" | Ergo; `r/sys/users` |
| Your name and face | 0: a gno name read from `r/sys/users`, and an astronaut generated from the name: a stylized, futuristic suit and helmet with few details, readable at 20 px. The same name gives the same astronaut everywhere. Registering a name happens on gno.land. 1: choose the suit, helmet, visor and emblem, saved in the profile realm. Never a planet; no uploaded picture (§6) | The astronaut generator (SVG from parts); the profile realm |
| Notifications filtered by kind (messages, worlds, news) and by world | 0 in the app. News comes from a file the team curates | Ergo mentions |
| Push notifications | 1 | `draft/webpush`, and the PWA (ADR-0001 §12) |
| Photos and videos, gallery and lightbox | 0: links from accepted services render as embeds once the moderation check passes. gnoworld hosts no uploads (§6) | The embed allowlist |
| Polls | 1 | A bot, `TAGMSG`, one vote per account (`account-tag`) |
| Room games: social mini-games in a room (a quiz, an emoji race, "guess the realm"), with no money. Results are kept on chain in a game realm; each move is signed by the player's session key, with the gas sponsored | 1, after phase 0, with its own ADR first | A game bot; sessions and the sponsor (ADR-0001 phase 1); a game realm |
| Pots and stakes in games | Not planned. A separate decision, after room games | — |
| Comets: a message sent to another world's room | 1 | A bot relaying it (`draft/relaymsg`), rate-limited |
| Events and calendar, with reminders | 0 from a data file, reminders on the device; 1: added by each world's moderators, reminders by push. Events happen in text or voice rooms, or at a link | — |
| Weekly report, posted in the Earth's room | 1 | Written by the team (question 19) |
| "New here" on a first message, and a welcome | 1 | A server-side tag |
| Routed questions: an unanswered question reaches people from the world that knows; a "Thanks" counts toward "helped N" | 1 | Opt-in helpers |
| Translation | 1, on request | Jarvis's service with Haiku, within Jarvis's budget (§5) |
| Voice rooms | 1, after phase 0, with its own ADR first | WebRTC: a media server, TURN, live moderation |
| Direct messages, and the seal | 2 (ADR-0001) | MLS |

**Realms** (§4)

| Concept | Phase | Chain |
|---|---|---|
| Realm card: a digest of the realm in simple chat blocks (facts, chart, links, form, announcement, text), never its whole page; the full page on gnoweb. Its functions as forms in the realm view (§4). BUBBLE gets the same card as any realm | 0 without a model (first lines, the whole page in the realm view, pinned actions, read functions); 1 with Jarvis's digest and calls, and the whole page whenever no digest is available | `vm/qrender`, `vm/qfuncs`, `vm/qeval` |
| Proposed actions: one or two per world pinned by the team; one fitting the conversation proposed by Jarvis, prefilled (§4) | 0 for pinned reads; 1 for calls and Jarvis | `vm/qfuncs` |
| Calls from a card: a vote, a `<gno-form>`, any function with `cur realm` | 1 | Signed by the user in Adena (§4) |
| On-chain activity in a room ("kaito voted yes on proposal 15", with "Vote" next to it) | 1 | Indexer events |
| Proposal cards (GovDAO, Memba). GovDAO is a world near the sun: ADR-0001's "galactic council" | 0 to read; 1 to vote | Votes stay in their realms (ADR-0001 §11) |
| A new realm appears as a signal; the first to fly there charts it, and the first to speak there leaves "first words" | 1 | Indexer (`addpkg` events, once live); the signals feed knows who came first |
| Real previews: a capture of the world's public page | 0 | None: a build job captures gnoweb or the world's site |
| Satellites: sponsored words in orbit around a world, rented by the day (rules in §8, row 7) | 2 | A slot realm paid in GNOT, approved by the team |

**Jarvis** (§5)

| Concept | Phase |
|---|---|
| Concierge: where to go, who to meet | 1 |
| Realm reader: what a realm does, what can be read for free, what can be called | 1 |
| Catch up: what you missed in a room | 1 |
| Chain questions: blocks, transactions, a realm's activity and state, a transaction explained (§5) | 1 |
| Realm digests: a realm's page turned into simple chat blocks (§4) | 1 |
| Translation, on request | 1 |
| Site evolutions: Jarvis prebuilds a change, a person reviews it | Later. Not in the product before the review process exists |
| Writing or deploying contracts | Cut (Alexis, 2026-10-16) |

**Discovery and play**

| Concept | Phase | Where |
|---|---|---|
| Passport: a stamp per world visited, constellations per ecosystem | 0 | Device. On chain is a later decision. These are not ADR-0001's paid stamps, which travel with a tip |
| "You charted it": the uncharted worlds you were the first on your device to visit | 0 | Device. The shared "first to chart" is phase 1 (Realms, above) |
| Daily expedition: the same three stops for everyone, the first where something is live; a streak; a shareable route | 0 | Device; the stops from a data file the team curates |
| Quests across worlds, each ending on a realm action. Rewards stay on the device: no NFT badges (ADR-0001 §11) | 0 to read; 1 for steps that call | Device; the quests data file |
| "Go explore": the live moment if one is near, otherwise the expedition | 0 | — |
| Follow: followed worlds first in the rail, their activity in the bell | 0 on the device; 1 on chain (profile realm, ADR-0001 phase 1) | — |
| Friends on the map ("noor is here") | 1 | Following people, on chain |
| Share a moment: the phone's share sheet, a copied link, a snapshot of the view with its caption | 0 | Web Share API |

### 2. Addresses and search

**Every place has one canonical URL.** The camera follows the URL, not the reverse. This
changes ADR-0001 §12, where the URL held the camera state. It replaces ADR-0001 §13's
`/h/<hub>`.

| Path | Shows | Pre-rendered | Indexed |
|---|---|---|---|
| `/` | The cosmos | Yes | Yes |
| `/earth` | The Earth and its general room | Yes | Yes |
| `/w/:world` | A world's focus view, chat on its main room. Stations are worlds of kind "station" | Yes, one page per world | Yes |
| `/w/:world/:room` | A world on one of its public rooms | Yes, for public rooms | Yes |
| `/e/:ecosystem` | An ecosystem and its worlds | Yes | Yes |
| `/n/:namespace` | A namespace system (phase 1) | Yes | Yes |
| `/r/*`, `/p/*` | A realm or a package by its path, as on gnoweb (phase 1). A realm that is also a world points its canonical to `/w/:world` | Planets only; dust uses the SPA fallback | Planets only; dust is `noindex` until it becomes a planet |
| `/list` | Everything as panels | Yes | Yes |
| `/events` | The calendar | Yes, rebuilt when the events file changes | Yes, with `Event` structured data |
| `/@:name` | A person (phase 1) | Yes, from `r/sys/users` at build time | Yes |
| `/passport`, `/saved` | Device-only views, shown as dialogs over the current place | No: the SPA fallback | `noindex` |
| `/net/:network/…` | Another universe (Onyx, a community chain): the same paths under its prefix, for example `/net/onyx/w/bubble` | Yes | Mainnet only. A testnet's pages are `noindex`, as gnoweb does for testnets (gno PR #6256) |

The `/n/`, `/r/` and `/p/` paths are proposed here and confirmed in the namespace-systems
slice.

**Pre-rendering, with no server in production.**
- React Router 8 in framework mode, with `ssr: false` and an async `prerender` that lists
  every place from the data files. In phase 1 it lists them from `r/gnoworld/hubs` and the
  signals at build time.
- It lists planets, never dust, so the build and the sitemap stay bounded at any size
  (§3).
- The build writes one HTML file per place, plus `__spa-fallback.html` for every other
  path. The host serves the fallback where no file exists.
- The client hydrates. Production stays a static site, as ADR-0001 §13 requires.
- The PWA (ADR-0001 §12) stays from the first build. Slice 1 checks that `vite-plugin-pwa`
  works with React Router's framework mode.
- `react-router` and `@react-router/dev` are asked for in slice 1 (§8, row 4).

**Each page carries:**
- `<title>`, `meta description` and `link rel="canonical"`;
- Open Graph and Twitter Card tags, with an image per world generated at build time from
  the world's own planet;
- JSON-LD structured data:
  - `WebSite` with a `SearchAction` on `/`;
  - `BreadcrumbList` on worlds and rooms;
  - `Event` on events.

**Also generated at build time:** `sitemap.xml` and `robots.txt`.

**Text first.**
- The pre-rendered HTML holds the place's name, description, rooms and links as real text.
- The canvas loads after it and never blocks the first paint, so the largest contentful
  paint is text.
- Search engines get the same page people do.

**Live data is not indexed.** Messages, heat and counts arrive on the client. Public room
archives are not indexed pages (question 17).

**Core Web Vitals are budgets:**

| Metric | Budget | Checked |
|---|---|---|
| LCP | 2.5 s | In the gate, by Lighthouse on a mid-range mobile profile; in the field (§6) |
| CLS | 0.1 | In the gate, by Lighthouse on a mid-range mobile profile |
| TBT, the lab stand-in for INP | 200 ms | In the gate, by Lighthouse on a mid-range mobile profile |
| INP | 200 ms | In the field (§6). Lighthouse does not report INP on a page load |

### 3. The universe at scale

The chain may hold millions of realms. The map must stay readable and light. Realms nobody
uses must not crowd it. Good ones must stand out, and every realm must stay reachable. The
rules come from seedfall's sky, adapted: they are seedfall's ADR-002 §2.2 and §2.6, and its
ADR-008 §12.3.

**Where a realm is: one place, stable.**
- **Three levels:**
  - an ecosystem: a curated region, which is optional;
  - a namespace: a star system;
  - a realm: a planet, or dust.
- **One place per namespace.** A namespace sits in its ecosystem, or in the open field when
  it has none.
- **Placement is local.** Each system claims a cell on a power-of-two ladder, sized to what
  it holds. Cells are laid out ring by ring from the centre (gno.land). A large namespace
  opens further blocks instead of growing into a shapeless mass. Placing one system never
  depends on the others, so the cost per system stays flat: seedfall measured 1.8 µs per
  island from ten thousand to a million.
- **Density is constant.** The universe grows with the count instead of packing tighter.
- **The lattice never shows.** Each system is offset inside its cell by a value derived from
  its path.
- **Positions are a pure function** of the set of realms. The same set gives the same map
  on every device, with golden tests.

**Nothing jumps.**
- Once a season (a fixed number of blocks, about a month), the signals job computes target
  positions for the grown universe.
- Systems drift there over the next season, too slowly to see.
- A movement always reads as growth.
- Activity never moves anything. It shows as heat (§1).

**What is drawn: a ladder of detail, bounded.**

| Distance | Drawn |
|---|---|
| Far | An ecosystem or a region as one glow |
| Middle | A system: its star, its planets as points, its dust as one cloud |
| Near | Planets as simplified bodies |
| Close | One world in full |

- **The draw count depends on view distance alone,** because density is constant: never on
  the size of the universe. Slice 7 measures the bound, and it becomes a budget.
- **At scale, positions stream as spatial tiles** from a static index the signals job
  writes. The client never downloads the whole map. Tiles are built only when the number of
  worlds passes what one file serves within the budgets.

**Who becomes a planet: signals plus curation.**
- **The rank comes from signals that are hard to fake:**
  - distinct callers over 30 days who have a registered name, the deployer excluded;
  - imports from other namespaces;
  - distinct people speaking in its rooms;
  - follows;
  - the team's curation (ecosystems, featured worlds), as a boost.
- **Stations are outside the rank.** The team places them and they always show (§1).
- **Counting rules:**
  - each account counts once per signal;
  - calls a namespace makes to itself do not count;
  - imports from inside the same namespace do not count.
- **The rank is relative** to the universe of the day, on a logarithmic ladder. An absolute
  threshold would leave the top empty or crowded. The top rungs become landmarks, labelled
  from afar (§1, level of detail).
- **Realms without signals are dust:** one cloud around their star.
  - Search finds them, every one has a URL (§2), and the list shows them with "show all".
- **Promotion is automatic.** When a dust realm gains signals, it condenses into a planet,
  and that moment is a "new world" signal.
- **No word passes a verdict.** A quiet realm is "quiet" or "resting", never "spam" or
  "dead".
- **Abuse is not a matter of rank.** Hiding an illegal realm is moderation (§6).

**Genres: several per realm, never a place.**
- **Computed per realm** from its imports and exported functions: `grc20` gives "token", a
  DAO package gives "DAO", and so on.
  - The classifier is deterministic and versioned, with golden tests.
  - The team can correct a genre in the data.
- **A namespace's genres** are its realms' genres, weighted: "mostly DAO, some games".
- **Where they show:**
  - as icons on the planet and the plate;
  - as filters in the list and in ⌘K;
  - as a lens on the map: pick "games", the rest dims, and game realms light up where they
    are, with a count per system.
- **Placement never depends on genre.** A realm with two genres appears in both lenses and
  stays in one place.

**Planets: every world a different place.** The bar is seedfall's and No Man's Sky's: as
many kinds of world as there are worlds, some of them breathtaking. The look stays
realistic, like space photography, never cartoon (docs/DESIGN-SYSTEM.md).
- **The space is the seed, not a catalogue.** A planet's look comes from
  `sha256("gnoworld/planet/v1" ‖ path)`. Its 256 bits feed continuous parameters at every
  layer, so no two planets repeat. The named lists below are anchors an artist can paint,
  never the number of possible planets. A look never depends on the neighbours.
- **Layer 1, the class.** About twelve anchors, each a data row:
  - rocky and cratered;
  - temperate, with oceans and continents;
  - desert;
  - ocean;
  - ice, cracked like Europa;
  - volcanic, like Io;
  - gas giant, banded with storms;
  - ice giant;
  - a world under a thick cloud deck, like Venus;
  - tidally locked: one side scorched, the other frozen;
  - dark carbon;
  - shattered, with its debris in orbit.

  The strange ones stay rare, about 10%, so they stay memorable. A planet draws a dominant
  class and a minor one, and the dominant never falls below about 60%, so it reads as one
  place from afar.
- **Layer 2, the surface.** Continuous: continent scale, warp, erosion, crater density,
  sea level, ice caps, band count and turbulence, storms, cloud cover and speed, rifts.
  Real planetary maps from NASA and USGS are the anchors: public domain, or CC BY with
  credit. They are warped, recoloured and mixed by noise.
- **Layer 3, the palette.** Interpolated between anchors taken from real planets (Mars's
  rusts, Neptune's blues, Io's sulphur, Titan's haze). A namespace shifts the hue by ±12°,
  so a system's planets look related. The grade keeps every colour plausible, never neon.
- **Layer 4, atmosphere, rings and moons.**
  - The rim's scattering colour and thickness, and haze layers. No decorative aurora: an
    aurora always means calls (below).
  - Rings: common on giants, rare elsewhere, with a tilt, gaps and a density.
  - Moons are the busiest rooms (§1). A world with no active room has none.
- **Layer 5, what the data says.** Data never passes a verdict, and a quiet world looks
  resting, never decayed.
  - **Size** follows use, half social (distinct people speaking in its rooms, follows) and
    half realm (distinct callers, imports from other namespaces), on a log scale relative
    to the universe. It moves a few percent a day at most, so it never jumps. The Earth,
    hand-made, keeps its size.
  - **Genre nudges the class weights** without fixing them:
    - tokens lean to giants;
    - DAOs lean to temperate worlds;
    - games lean to volcanic and strange worlds;
    - pure packages (`/p/`) lean to mineral worlds.
  - **Lights on the night side** show people in its rooms now.
  - **Heat** stays the warm glow (§1).
- **Layer 6, wonders.** About one planet in fifty carries a rare trait, for example:
  - a storm larger than a continent;
  - a ring standing on edge;
  - a double planet;
  - a rogue world lit only by its own volcanoes;
  - an evaporating world with a tail.

  **A wonder never outranks the rank or the curation.** Far away, only landmarks show
  (above):
  - on a ranked or curated world, a wonder adds to its landmark;
  - on any other planet, it is a surprise found up close;
  - dust has no look, so no wonder;
  - the team may give a curated world a chosen wonder.

  The passport keeps the wonders found, never out of a total (above).
- **Hand-made, not generated:** the Earth (real maps), GovDAO and the stations.
- **Variety is measured, not counted.** Each planet has a feature vector:
  - class;
  - the palette's centre in Lab;
  - surface statistics;
  - rings and atmosphere.

  A golden test requires a minimum perceptual distance between any two planets in a system
  or in one view. It is tuned on the real list and on a synthetic universe ten times
  larger.
- **Performance.**
  - A class is data, not a shader. A few material graphs carry everything as uniforms:
    solid surface, gas bands, cloud deck, rings, atmosphere.
  - Surface maps stream as KTX2 only near a planet. Far away, the ladder above draws
    points.
  - The GPU bench adds a variety view: eight planets of different classes and a wonder in
    frame, within the frame budget.

**What a planet shows from afar, bounded.** A planet is seen whole, so its signs read at
that scale: moons for rooms, night lights for people, storms and auroras for pace, comets
between worlds. None may saturate the map:
- **Log scales.** Every intensity (a moon's size, a storm's, an aurora's, the night lights)
  follows the logarithm of its count, relative to the busiest world of the day, and is
  capped. A quiet world still shows a little; the busiest never floods the view.
- **Caps per planet:** four moons, one on the Earth, drawn as it really is; one large
  storm and two small ones.
- **Moons stay steady.** The set changes at most once a minute, and a room takes a moon's
  place only when it stays clearly busier for several minutes, so moons never flicker.
- **Moons never cover the plate.** In a world's focus view they orbit only in the free
  space beside the planet, away from the plate; a moon reaching the plate's edge fades
  out. Their labels follow the no-overlap rule (§1, level of detail).
- **Auroras merge.** Calls add to one smoothed intensity; there is no flash per call.
- **Comets merge and queue.** Messages on the same route within a minute fly as one brighter
  comet, with the count on hover. At most twelve comets are in view at once: the place you
  are, what you follow and the highest ranks first.
- **Reduced motion:** nothing flies or flares; counts show instead.
- **Budgets:** these effects count in the frame budget, and the GPU variety view includes
  them at their caps.

**The infinite, felt.**
- Haze closes the view before any edge.
- No counter announces the total, as in "42 of 551".
- The rim thins instead of stopping.

### 4. Realm calls: read for free, sign inline

- **Reads cost nothing and need no wallet:**
  - a realm's page (`vm/qrender`);
  - an exported getter or value (`vm/qeval`);
  - its source (`vm/qfile`).

  Their results show in the card with "read on chain, free, no signature".
- **A call is a transaction the user signs in Adena.** It shows as an inline card in the
  room or on the plate, in four steps (ADR-0001 §7):
  1. the preview: realm, function, arguments, network, fee. The network is the universe's
     chain, and Adena must be on it;
  2. "sign in Adena": the wallet opens;
  3. "landing in a block";
  4. the result.
- **It is never a modal** (§8, row 1). The prototype's dialog stood in for this card.
- **ADR-0001 §11's warnings apply to every call**, for example "gnoworld does not check
  what this realm does" and "this text goes to {realm} on gno.land, publicly and forever".
- **Nothing is optimistic.** The room shows "kaito voted yes" only from the chain event.
- **gnoworld never signs, and Jarvis never signs.** No call is ever sent from sample data.

**What a realm shows: a digest, not its page.** gnoworld stays a chat. A realm appears as a
few simple blocks; its whole page stays one link away, on gnoweb.

**gnoweb is the source of truth.** Every realm card, digest and realm view carries a link
to the realm on gnoweb. A digest is a reading aid, never the reference.

| Block | What it holds | Design-system pieces |
|---|---|---|
| Facts | A few labelled values | `Stat`, `Row` |
| Chart | A series of numbers from the page or the realm's state | `ActivityChart` |
| Links | Realms, which fly to their world; external pages, behind a warning | `Row` |
| Form | One action, prefilled (Actions, below) | `Field`, then the call card |
| Announcement | One short notice the realm states: a vote closing, a launch | `Card` |
| Text | A few sentences, Markdown from the allowlist | — |

- **Without a digest, the whole page.** In phase 0, and in phase 1 whenever Jarvis cannot
  give one (down, an error, the budget spent):
  - the card shows the page's first heading and paragraph, the team's pinned actions and
    the link to gnoweb;
  - the realm view shows the whole page, built from its raw Markdown by `core/markdown`'s
    allowlist, with no model;
  - gnoweb's extensions degrade simply: an alert becomes a quote, columns stack, a
    `<gno-form>` becomes a Form block, and any other tag shows as plain text;
  - images come only from the accepted hosts.
- **Phase 1, Jarvis's digest:** Jarvis reads the page's raw Markdown (`vm/qrender`; gnoweb
  also serves it as `text/markdown`) and the realm's functions. It returns the digest as
  data: a list of blocks from the table, checked with Zod. Never HTML, never interface
  code.
- **Grounded:** every number, link and function in a digest appears in the page, the
  state or `vm/qfuncs`. The server checks this by string match before caching; the evals
  check it too.
- **Cached** per realm and per page hash, refreshed at most every 10 minutes. The card
  shows the block height it was read at. One digest serves every reader. A digest of an
  older page is never shown: its numbers would be stale, so the whole page shows instead.
- **By place:**
  - in the chat, a compact card: a few blocks and "View the page";
  - on the plate, the same with more room;
  - in the realm view (a full page over the chat, with a back button and its own URL), the
    digest, or the whole page when there is none, and every action.
- **A `<gno-form exec="Func">` in the page** is a transaction on gnoweb, so it becomes a
  Form block and then a call card (phase 1). No hidden field: gnoweb strips them so people
  see all they submit, and so do we.

**Actions: every function as a form,** like gnoweb's actions page.
- `vm/qfuncs` (free) lists the exported functions, their parameters and their doc.
- **Read functions** (no `cur realm`): a form, and the result at once through `vm/qeval`.
  Free, from phase 0.
- **Write functions** (`cur realm`): a form, then the call card, then Adena. Phase 1.
- **Fields follow the types.** A call carries only primitive types and bytes (gno's
  `gno.land/pkg/sdk/vm/convert.go`). Any other parameter shows "open in gnoweb".
- The list is searchable when it is long.

**Proposed actions.**
- **Pinned by the team:** one or two per world, in the data file ("Vote", "Answer the
  poll"). They show as quick actions.
- **Proposed by Jarvis** (phase 1): one action that fits the conversation, prefilled, for
  example `addPollAnswer` with its own field. It arrives as a Form block.
  - Jarvis returns a structured proposal, never interface code: realm, function, arguments,
    one sentence of why.
  - Zod checks it on the server. The client checks the function and its types against
    `vm/qfuncs` before showing the card. Anything else shows nothing, so a planted message
    cannot forge a button.
- **Before signing,** every field stays visible and editable, and ADR-0001 §11's warnings
  show.

### 5. Jarvis

Jarvis is the concierge in every room. `@jarvis` calls it, and so does one button. It reads
and explains, and it prepares calls the user signs. It speaks only when asked: `@jarvis`, a
quick action, or its button. It never answers on its own in a public room, not even to a
routed question (product review).

**The stack.**

| Part | What | Why |
|---|---|---|
| Harness | The Claude Agent SDK (TypeScript), in a small service of its own beside the Go binary | It gives the agent loop, MCP, skills, hooks and limits. It exists in TypeScript and Python only, so Jarvis is not a role of the Go binary |
| Key | The Anthropic API key, in the service's environment only | The client holds no secret (§9) |
| Tools | **gnomcp** over stdio, seven read tools allowed: `gno_packages`, `gno_read`, `gno_render`, `gno_eval`, `gno_status`, `gno_history`, `gno_activity`. **Our own MCP server**: a room's recent public history; the places and their URLs; the latest transactions and blocks from the public indexer and the RPC; the digests and action proposals of §4, checked before they reach the client. **gnoscope** (`https://gnoscope.com/mcp`, remote, read-only by design): a transaction explained, a realm's decoded state, an address, search over all code on chain | Free reads only, and nothing that writes |
| Skills | `SKILL.md` folders versioned in the repo: gnomcp's `gno` skill (Apache-2.0), to read realms correctly; ours: concierge, realm reader, catch up, translation. Text only, no scripts | Loaded on demand; part of the prompt version |
| Models | Sonnet 5.5 by default. Haiku 5.5 to sort, summarise and translate. Opus 5.5 for hard realm code | Cost and quality per task |

**It can write nothing. Four locks:**
1. **No key.** gnomcp runs with no agent key. On mainnet, gnomcp has no write path at all
   (its `docs/security.md`).
2. **An allowlist.** Only the read tools listed above are allowed. The SDK's built-in tools
   are removed: the shell, file writing, the web. File reading is allowed only inside the
   skills folder.
3. **A hook.** A `PreToolUse` hook denies any other tool and logs every call. A denial holds
   in every permission mode.
4. **The permission mode.** It is `dontAsk`: whatever is not allowed is denied, since no
   person approves tool calls on a server.

To act, Jarvis proposes an action that opens the call card (§4). The user signs in Adena.

**Chain questions** ("what block are we at?", "the last transaction?", "explain this tx").
- Every answer states the block height it holds for, and says when the index lags.
  gnoscope returns that lag with each result.
- The current tx-indexer has no transaction time, so time windows go by block height.
- gnoscope is a third party whose operator we do not know. If it is down, Jarvis says so
  and answers from gnomcp and our server.

**Everything it reads is untrusted:** realm source, rendered pages and messages.
- It reaches the model inside marked data blocks, never as instructions.
- Jarvis's answers render like any message: Markdown to DOM, with no HTML.
- An injected instruction finds no write tool and no key. At worst it causes a wrong
  answer, and the evals look for exactly that.

**Limits.**
- 20 questions per person per day.
- **A budget of 50 $ a day.**
  - An alert fires at 80%.
  - At 100%, Jarvis answers with Haiku until the next UTC day.
- A maximum number of turns and a timeout per question.
- The tools, the system prompt and the skills are frozen per version, so prompt-cache
  reads cost a twentieth of the input price on Sonnet and Opus 5.5.

**Evals.** A suite lives in the repo. CI runs it whenever any of these changes:
- the model;
- the prompt;
- a skill;
- a tool;
- the gnomcp version.

A drop below a threshold fails the run. It checks:
- **Tool use:** the right tool with the right arguments, and never a tool off the
  allowlist, read from the hook log.
- **Grounding:** every fact traces to a tool result. A different model grades this against
  a rubric.
- **Prompt injection:** realms and messages with planted instructions.
- **Refusals:** writing or deploying a contract, signing, sending coins. The answer points
  to the call card instead.
- **Chain facts:** the block height cited, no invented figure, an honest answer when the
  index lags.
- **Digests and action proposals:** every number, link and function traces to the page, the
  state or `vm/qfuncs`; arguments have the right types.
- **Format:** canonical links, the question's language, length.
- **Cost and latency** per case, under ceilings.

Chain answers are recorded at a fixed block height, so a run is reproducible. A short live
pass runs on onyx. In production, a nightly sample is graded the same way, beside people's
thumbs up and down. Results go to Langfuse with the prompt version.

**Observability.** The service exports OpenTelemetry. The SDK's own traces are in beta; if
they change, our own spans wrap each turn.
- **One trace per question**, recording:
  - the model and the prompt version: a hash of the prompt, skills and tool list;
  - each model request: tokens, cache, latency, stop reason;
  - each tool call: duration, error;
  - each hook denial.
- **From each result:** the estimated cost, tokens per model, turns and duration. The
  estimate is reconciled with Anthropic's usage report.
- **Metrics:**
  - p50 and p95 latency, and the time to first word;
  - cost per question, per person and per day;
  - cache hit rate;
  - tool errors, denials and flagged injections;
  - feedback.
- **Alerts:** the budget at 80% and 100%; spikes in errors or denials.
- **Where it goes:**
  - Grafana (Tempo, Loki, Prometheus) for operations across Ergo, the Go binary and Jarvis;
  - Langfuse for conversations, prompt versions, eval scores and feedback.

  Both are open source and self-hosted. OpenTelemetry keeps either one replaceable.
- **Privacy:**
  - a question's text is kept only with the person's consent, and deleted after a fixed
    period;
  - account ids are hashed;
  - Jarvis never reads DMs: from phase 2 they are encrypted end to end.

**Rejected: the Messages API's MCP connector.** It needs a remote MCP server, and gnomcp
runs over stdio. It is not eligible for zero data retention, and it has no hook to block a
call.

### 6. Moderation, media, prices and measurement

**Moderation of public rooms** (phase 0). This answers part of ADR-0001's question 5;
jurisdiction and retention stay open there.
- **A moderation bot,** a role of the Go binary, checks each public message with OpenAI's
  Moderation API (`omni-moderation-latest`: text and images, free of charge; slice 9
  confirms both against OpenAI's docs).
- **Text is checked after it is posted.** A message appears at once, and the check follows
  within a second. A flagged message is hidden with `draft/message-redaction`. Holding
  every message until the check returns would end the live chat, and an outage would stop
  it.
- **Link previews wait for the check.** An image or a video preview shows only once the
  check passes, so a shocking image never appears, even briefly.
- **The author is told why,** in plain words ("hidden: harassment"), with a link to the rules
  and a **Contest** button.
- **A contest reaches a person**: the world's moderators or the team.
  - That person decides, and the author is told.
  - The bot reposts a restored message, marked "restored after review".
- **Thresholds:**
  - the bot acts only on high scores, and always on anything involving minors;
  - repeat offences escalate: hide and explain, then a timed mute, then a person.
- **What is never sent:** DMs. From phase 2 they are encrypted end to end, and the server
  cannot read them.
- **The privacy policy** says public messages are checked by this service.
- **The key stays on the server,** and the bot rate-limits by account.

**Media.** gnoworld hosts no media, because it cannot moderate uploads alone.
- Links and embeds come from an allowlist of accepted services that moderate their own
  content: YouTube, Vimeo, Imgur and Giphy, for example.
- Broadcast Moon's videos come from the same services.
- Uploads are a later decision.

**Prices.**
- A scheduled job reads a public source (CoinGecko) every 5 minutes and writes a static
  `markets.json`.
- The client reads only that file: no third-party call, no rate limit.
- The row shows the source and the time.
- A token with no public price is not shown.

**Measurement.** PostHog, on its EU cloud: free up to 1 million events a month.
- **Cookieless** (memory persistence), so no consent banner.
- **Explicit events only.** Autocapture is off, since it records element text, and so is
  session replay.
- **Counts only:** no message text, no names.
- **Retention** is measured only for logged-in people who accepted once.
- **Loading:** after the first usable screen, within the JavaScript budget.
- **Field Web Vitals** (INP, LCP) come from PostHog if it measures them. Otherwise we send
  them as our own events (slice 9 checks).
- **The events:**
  - first visit;
  - first flight;
  - joined a room;
  - first message;
  - came back;
  - shared a link;
  - opened a realm card;
  - signed a call (phase 1).

### 7. New pieces

| Piece | Phase | What it does | Notes |
|---|---|---|---|
| Data files | 0 | Universes, hubs, ecosystems, stations, events, expedition stops, quests, news, the bubble rules (ADR-0001 §7) | Versioned in the repo; curated by the team through reviewed pull requests; validated with Zod at build time |
| Preview captures | 0 | A build job (Playwright) captures each world's public page | Refreshed on a schedule; no capture, no preview |
| Moderation bot | 0 | §6 | A role of the Go binary. An OpenAI API key, server-side |
| Prices job | 0 | Writes `markets.json` every 5 minutes (§6) | The host's scheduler |
| PostHog | 0 | Product analytics (§6) | A third party, in the CSP's `connect-src` |
| Signals | 1 | Heat with realm calls, routes, new realms, who charted first; the rank, the dust, the seasons and the tiles of §3. It reads Ergo and the public indexer and serves a small JSON feed | A role of the Go binary. ADR-0001 §13 holds: we run no indexer |
| Jarvis | 1 | §5 | A TypeScript service beside the Go binary |
| Observability | 1 | Grafana and Langfuse, fed by OpenTelemetry (§5) | Self-hosted |
| Voice | 1 | A WebRTC media server and TURN | Its own ADR first |
| Room games | 1 | A game bot and a game realm (§1) | Its own ADR first. Needs sessions and the sponsor |
| Satellites | 2 | The slot realm (§8, row 7) | Audited before mainnet |

**ADR-0001 §13 changes.**
- It had two pieces: the static client and one Go binary.
- **Phase 0:**
  - the pieces are the client, Ergo, the Go binary (login and moderation) and the prices
    job;
  - the third parties are OpenAI's moderation and PostHog, both free at this size;
  - hosting stays near 0 €.
- **Phase 1:**
  - Jarvis, the signals, observability, voice and room games are added;
  - costs: Jarvis at up to 50 $ a day, the voice server, and hosting Grafana and Langfuse.

### 8. Differences with ADR-0001

All decided by Alexis on 2026-10-17.

| # | ADR-0001 says | The prototype does | Decided |
|---|---|---|---|
| 1 | §7: transactions are inline, with no modals | A modal signature request | Inline cards (§4). The modal was a placeholder |
| 2 | §7: "dropped from the concept: pots, boops, timers, claims and payout bars" | A Play card with BUBBLE's pot, a boop, and a pot clock on the status ring | gnoworld builds social room games, with no money and with results on chain (§1, Chat), after phase 0, with its own ADR first. No pots: a separate, later decision. gnoworld invents no timer: the ring shows only what a realm reports. BUBBLE gets the same realm card as any realm |
| 3 | §7: distance to the sun is activity; rooms are moons; people are satellites | Stable orbits; activity as heat; rooms as markers on the surface; people in lists | Stable places, with the scale rules of §3: one place per namespace, a slow seasonal drift, a rank from signals and curation, dust, and genres as lenses. Activity is heat, storms and auroras. The busiest rooms are moons, the others are in the room switcher; people are in lists; "satellite" means a sponsored slot |
| 4 | §12: no router and no server framework; the URL holds the camera state. §13: `/h/<hub>` | A URL per place, for search | React Router 8 framework mode, static pre-rendering, no Node server; the camera follows the URL (§2). Its two dependencies are asked for in slice 1 |
| 5 | Phase 0 has no private messages | DMs and the seal | Kept in phase 2 |
| 6 | No voice | Voice rooms, and events in a "voice lounge" | A WebRTC voice room in phase 1, after phase 0, with its own ADR first |
| 7 | "Ideas to place": phase 0 takes none of them; ads tier 2 in phase 2; short videos in phase 3 or later | Satellites, Broadcast Moon, the GovDAO world, the person card, video embeds | **Satellites, phase 2:**<br>- a fixed daily price in GNOT, set by the team in the slot realm;<br>- the payment is held until the team approves, and refunded if refused;<br>- at most one per world;<br>- labelled "Sponsored", as advertising law requires.<br>**Broadcast Moon:** a curated station in phase 0, with videos embedded from accepted services (§6).<br>**The person card:** phase 0 in its basic form.<br>**Embeds:** links in phase 0. No uploads are hosted (§6) |
| 8 | Rollout: "tips and stamps in the same transaction" | Passport stamps | Two different things. Passport stamps record visits on the device. ADR-0001's stamps travel with a tip |
| 9 | §10: a generated identicon | A planet chosen as an avatar | An astronaut generated from the name; its parts chosen in phase 1 and saved in the profile realm. Never a planet (§1) |

**Checks for slice 1.** These are not differences with the prototype:
- **The React Compiler.** ADR-0001 §12 plugs it in through `@vitejs/plugin-react`, while
  React Router's framework mode uses its own Vite plugin. Check how the compiler plugs in.
  If it does not, record the trade-off before writing any `memo` by hand.
- **TypeScript.** ADR-0001 §12 holds TypeScript at 6.0 for typescript-eslint, but npm
  showed 7.0.2 on 2026-10-16. Stay on 6.x until typescript-eslint supports 7.
- **The PWA plugin** with React Router's framework mode (§2).

### 9. The engineering bar

ADR-0001 §14 stands: test first, one gate, strict TypeScript, Zod at boundaries, review by
risk. This section adds what the prototype showed was needed.

**Architecture.** It is laid out in `docs/ARCHITECTURE.md`:
- feature modules with one owner each;
- a pure `core` for the rules;
- the scene kept out of React;
- one store between them;
- a dependency direction that lint enforces.

**Memory.** A long session must not grow.
- One render loop, owned by the scene. React never runs in it.
- Every GPU resource has one owner that disposes it: geometry, material, texture, render
  target.
- **Gate check:** after 20 flights, `renderer.info.memory` is back to its baseline and the
  JS heap is within 10% of where it started (Playwright).
- Every effect cleans up:
  - listeners are added with an `AbortSignal`;
  - fetches and sockets are aborted on unmount;
  - timers are cleared;
  - object URLs are revoked;
  - videos pause and unload off screen.
- HTML labels are pooled, never recreated each frame.

**Security.**
- **CSP:** strict, with no inline script and no `eval`. Pre-rendered JSON-LD is allowed by
  hash. `frame-src` lists only the accepted embed services.
- **Rendering:** Markdown is built into DOM nodes from an allowlist. No data ever reaches
  `innerHTML`.
- **Links and media:** https only, and only from the accepted services (§6).
- **Validation:** Zod checks Ergo, the indexer, realm reads and every data file.
- **Untrusted text:** realm text and chat, for Jarvis too (§5).
- **Secrets:** the client holds none. The Claude and OpenAI keys live only on their
  services, which rate-limit by account.
- **Dependencies:** locked, and the gate audits them.

**Accessibility.**
- Every place is reachable without the 3D, from the keyboard.
- Reduced motion swaps flights for crossfades and stops the idle orbit.
- Text contrast is at least 4.5:1.
- axe runs in the gate, and Lighthouse's accessibility score is 100.

**Search.** Lighthouse runs in the gate on `/` and on one world page:
- an SEO score of 100;
- the budgets of §2.

**CSS.** It follows `docs/DESIGN-SYSTEM.md`:
- tokens and a short scale;
- CSS Modules per component;
- cascade layers;
- no `!important` (lint).

**Jarvis.** Its evals gate any change to its model, prompt, skills or tools (§5).

**No dead code:**
- unused exports, files and dependencies fail the gate;
- the TypeScript flags `noUnusedLocals` and `noUnusedParameters`.

**Dependencies to ask for, each in its slice:**
- `react-router` and `@react-router/dev` (slice 1);
- a CSS linter, an unused-code finder and a Lighthouse runner (slice 1);
- `posthog-js` (slice 9);
- `@anthropic-ai/claude-agent-sdk` and the OpenTelemetry SDK (Jarvis, phase 1).

## Consequences

**Phase 0 grows** to hold:
- the URLs and the pre-rendering;
- the design system;
- the passport and the expedition, on the device;
- universes, worlds, ecosystems, stations and genres from data files;
- the map view, the hero, the ticker and the rail;
- the preview captures and the prices file;
- the moderation bot, with contests;
- product analytics.

**Its exit criteria add five:**
- a world's page is found by its own name, with its own title and image;
- the Core Web Vitals and memory budgets hold;
- a person reaches every place with the 3D off;
- a hidden message tells its author why, and a contest reaches a person;
- PostHog receives counts only: no text, no names.

**Phase 1 gets:**
- Jarvis, with its evals and observability;
- the signals: heat with calls, routes, new realms, "first to chart" and "first words";
- the universe at scale (§3): namespace systems, the rank and dust, computed genres, the
  seasons, and tiles when the count needs them;
- realm calls from cards, with the on-chain activity in rooms;
- polls, comets and translation;
- voice rooms and room games, each after its own ADR;
- events added by moderators;
- push notifications;
- friends on the map;
- "new here";
- routed questions;
- the weekly report, written by the team.

**Phase 2 gets** satellites under the rules of §8, with DMs and the seal as before.

The prototype stays the reference for the look and the feel until slice 2's designs replace
it (ADR-0001 §7: "our own look").

## Questions answered

They follow ADR-0001's numbering. Alexis answered them on 2026-10-17.

| # | Question | Answer |
|---|---|---|
| 14 | The markets row's source | A scheduled job reads CoinGecko into `markets.json`; the client reads only that file (§6) |
| 15 | Jarvis: model, host, budget, translation | Sonnet 5.5 by default, Haiku 5.5 and Opus 5.5 by task; a TypeScript service on the Agent SDK beside the Go binary; 50 $ a day; translation through the same service with Haiku; chain data from gnomcp, the public indexer and gnoscope (§5) |
| 16 | Media: storage, budget, moderation | No hosted media at first: embeds from accepted services. Messages are moderated by a bot on OpenAI's Moderation API, checked after posting, with contests (§6) |
| 17 | Public room archives as indexed pages | No, at first (§2) |
| 18 | Measurement | PostHog, EU cloud, cookieless, counts only (§6) |
| 19 | Curation of stations, expedition stops, news and the weekly report | The team alone, through the data files and pull requests |
| 20 | Satellites | Rules set in §8, row 7. Built in phase 2 |

**Decisions still to come, each with its own ADR:**
- voice rooms (phase 1);
- room games on chain (phase 1);
- hosted uploads;
- pots in games.

ADR-0001's question 5 keeps its jurisdiction and retention parts.

## References

- [The prototype, its videos and its reviews](../docs/prototype/README.md)
- [ADR-0001](0001-gnoworld.md)
- React Router, [pre-rendering](https://reactrouter.com/how-to/pre-rendering)
- **The Claude Agent SDK:**
  - [MCP](https://code.claude.com/docs/en/agent-sdk/mcp)
  - [permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
  - [skills](https://code.claude.com/docs/en/agent-sdk/skills)
  - [hooks](https://code.claude.com/docs/en/agent-sdk/hooks)
  - [observability](https://code.claude.com/docs/en/agent-sdk/observability)
  - [cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking)
- **The Claude API:**
  - [MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
  - [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
  - [developing tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
- gnomcp 0.12.0, `docs/security.md` and `docs/tools.md` (github.com/gnoverse/gno-mcp)
- seedfall, `adr/adr-002-sky.md` §2.2 and §2.6, and `adr/adr-008-engine.md` §12.3 (a
  sibling repository)
- OpenAI, [moderation guide](https://platform.openai.com/docs/guides/moderation)
- PostHog, [EU cloud](https://posthog.com/eu)
- The architecture: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- The design system: [docs/DESIGN-SYSTEM.md](../docs/DESIGN-SYSTEM.md)
- The backlog: [docs/plans/backlog.md](../docs/plans/backlog.md)
