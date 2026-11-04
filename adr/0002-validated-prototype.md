# ADR-0002: The validated prototype — scope, addresses, scale, Jarvis, and what it changes in ADR-0001

| | |
|---|---|
| Status | Proposed. The lead approved the prototype on 2026-10-16. Alexis made the open decisions on 2026-10-17 (§8, questions 14–20). This text waits for his reading |
| Date | 2026-10-16, revised 2026-10-17; the slot realm amended 2026-11-03 (§8 row 7, §9: no approval, no multisig) |
| Author | Alexis Colin |
| Builds on | [ADR-0001](0001-gnoworld.md). Amends its §1 and §2 (the login program), §7 (levels and navigation rules, mobile included), §9 (moderation), §10 (the generated face, the tiers), §12 (routing, rendering, a Node server), §13 (pieces and hosting), its "Ideas to place" and its rollout (§8). Answers part of its question 5 (moderation of public rooms) and its question 12 (where the servers run) |
| Prototype | [docs/prototype](../docs/prototype/README.md): live artifact (version 57), two walkthrough videos, five reviews |
| Verified | **2026-10-16:**<br>- npm: `react-dom` 19.3.1 exports `react-dom/static`; `react-router` and `@react-router/dev` are at 8.4.0.<br>- React Router's pre-rendering guide.<br>- `gno.land/r/gov/dao` on onyx with gnomcp: `Render` and `GetProposal` are free reads; `MustVoteOnProposalSimple(cur realm, pid int64, option string)` is a call.<br>**2026-10-17:**<br>- gnomcp 0.12.0: a read-only chain has no write path (`docs/security.md`); `gno_status`, `gno_history`, `gno_activity` (`docs/tools.md`); its audit file is written under `$HOME` (`cmd/gnomcp/main.go`).<br>- gno: a call's arguments are primitive types and bytes (`gno.land/pkg/sdk/vm/convert.go`); gnoweb serves pages as `text/markdown` (PR #5794); onyx approves deploys automatically, mainnet by approvers (the gno skill's `networks.md`); names are registered with `r/sys/namereg/v0.Register`.<br>- Adena: SDK 0.1.1 and extension 1.22.3, read in their source and tested in Node (sign-in, its verifier, errors, networks, events, fees, mobile, sessions).<br>- The server's stack on npm and in Docker on arm64: Node 24.22.0, Hono 4.13.13, `node:sqlite`, pnpm 12.14.0, `@anthropic-ai/sdk` 0.135.0, `@modelcontextprotocol/client` 2.3.1, a distroless Node 24 image.<br>- The demo host's Docker setup.<br>- seedfall's ADR-002 §2.2, §2.6 and ADR-008 §12.3.<br>**Secondary sources only, to confirm in their slice:** OpenAI's Moderation API and PostHog |

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
2. **Addresses and search.** Every place has a URL and a pre-rendered page, with no
   rendering server in production (§2).
3. **The universe at scale.** Millions of realms stay readable: one stable place each, a
   rank from real signals, and a bounded level of detail (§3).
4. **Realm calls.** Reads are free; calls are inline cards signed in Adena (§4).
5. **Jarvis.** It reads realms with you and never signs. It runs on a Claude key, gnomcp,
   skills and a harness, with evals and full observability (§5).
6. **Moderation, admin and measurement.** A moderation bot with contests, an admin console
   with roles and an audit log, no hosted media, cookieless product analytics (§6).
7. **What changes in ADR-0001.** Every difference with the prototype is decided (§8).

**The prototype's code is not reused.** Every concept is rebuilt slice by slice, test first
(§9, `docs/plans/backlog.md`).

**A word on words.** One meaning per word:
- **world:** a place with rooms, shown as a planet: a realm's world, or a station. The code
  and the realm (`r/gnoworld/hubs`) say "hub", as ADR-0001 does.
- **realm:** a gno.land package with state. Every realm has a URL; only those with signals
  are worlds drawn as planets, the others are **dust** (§3).
- **system:** a namespace's star and its realms. **Universe:** one chain (§1).
- **station:** a world the team builds, not a realm.
- **moon:** one of a world's busiest rooms. The Earth's Moon, and Broadcast Moon (a
  station), keep their names.
- **status ring:** the tilted orbit a realm's state draws. **Rings:** a planet's own. AI Ring is a
  station.
- **signal:** a new realm not yet charted.
- **satellite:** a sponsored slot (§1); people are not drawn as satellites (§8). People are
  **nebulae** (astronauts until 2026-10-20, `docs/decisions.md`): an avatar is never a planet.

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
- **Alexis set the server on 2026-10-17:** TypeScript on Node, sharing its rules and schemas
  with the client; Ergo stays, as an image (§7).
- **Alexis set identity and phones on 2026-10-17:** an account is its address, the same on
  every chain; phones read in phase 0, since Adena cannot sign on a phone yet (§1, §4).
- **Alexis set the delivery on 2026-10-17:** a simple stack for demos inside the company,
  then everything handed to ops in Docker; ops decides where it runs (§7).
- **On 2026-10-17 Alexis moved into phase 0:** Jarvis, calls signed by users (names, votes,
  any function), the chain's activity in rooms, new realms and firsts, plain DMs, automatic
  translation and satellites (§8, rows 5, 7 and 11).

## Decision

### 1. The concepts, by phase

Phases are ADR-0001's:
- **0**: a public hub. Users sign their own calls; gnoworld's only write of its own is the
  slot realm, on Onyx (§8, row 11).
- **1**: social on chain.
- **2**: private, and depth.
- **3**: mainnet.

"Device" means IndexedDB on the user's device. "Cut" means not built in any phase.

**Space**

| Concept | What it is | Phase | Needs | Chain |
|---|---|---|---|---|
| The cosmos | gno.land as the sun; namespaces as star systems, realms as planets generated from their path (same path, same planet), placed by §3; the asteroid belt; the uncharted frontier | 0 from the hubs data file; 1 from the chain (§3) | Scene; the hubs data file, then `r/gnoworld/hubs` and the signals | Read |
| Ecosystems | Curated regions: the namespaces of one project or topic placed together, with a group view | 0 | Ecosystems data file, curated by the team | — |
| Universes | One per chain, never shown together. Mainnet (`gnoland-1`) is the default; Onyx, the testnet, and community chains are other universes, reached by a switcher with a jump, not a flight. A testnet is always labelled "Testnet", so test tokens never pass for real ones. Each universe reads and calls its own chain. People belong to no chain, so the Earth and its general room appear in every universe. The demo opens on Onyx | 0 | The universes data file; one RPC per chain | Read |
| Namespace systems | One star per registered namespace, its realms and packages in orbit | 1 | `vm/qpaths` by namespace; §3 | Read |
| Genres | What a realm is: token, DAO, game, social… A realm can have several. A lens on the map lights one genre wherever it is | 0 from the data file; 1 computed from imports (§3) | The genre classifier | Read |
| Visibility rank and dust | Realms with real signals are planets; quiet realms are dust around their star, still found by search, by URL and in the list (§3) | 1. In phase 0, every world in the data file is a planet | The signals (§7) | Read |
| Stations | Places the team designs and builds in full, then open to everyone: anyone visits, talks in their rooms and uses their content. Not realms, and not necessarily tied to one; labelled as stations. Hand-made realistic 3D, never generated. The team places them in well-defined zones of the map, and they always show, outside the rank (§3). Today: AI Ring (something built with AI), Broadcast Moon (a moon of screens: videos embedded from accepted services and generative pieces the team makes, in categories, with a viewer), Harbor (long reads) | 0 | Stations data file and their 3D models, by the team. Broadcast Moon's videos are embeds from accepted services (§6) | — |
| Map view | The same space from above, condensed: distances shortened so the universe fits one screen; each cluster (an ecosystem, a namespace system, a region) one mark with its count; only the landmarks named (rank and curation, stations, the Earth, GovDAO, what you follow); zone captions. Never every planet. A click on a cluster flies into it | 0 | Scene; the ladder of §3 | — |
| Level of detail | The ladder of §3. Key labels from afar: groups, Earth, GovDAO, systems, signals, the two hottest worlds, what you follow, the next event. The rest appear on approach. Labels never overlap | 0 | Scene, labels layer | — |
| Heat | A steady warm glow on the busiest worlds, stronger with activity, with a "24% · 148/h" badge and a rising icon. No rings, no lines | 0 from the people present, which the client reads from Ergo's `LIST` (checked in slice 4); 1 adds realm calls | Ergo; the signals | Read |
| Telescope | Hover a world's name to read its room's last lines without flying there | 0 if Ergo serves history to a non-member (checked in slice 4), otherwise 1 through the signals feed | Ergo history | — |
| Routes | On hover, lines to the realms a world calls or imports, with traffic moving on them | 1 | Indexer for calls; `vm/qfile` for imports | Read |
| Embassies | A room shared by two worlds, drawn as a small station between them | 0 | One Ergo channel listed by two worlds | — |
| Focus view | The plate: name, two facts, activity chart, one main action, connected worlds, a real capture of the world's page, links. The planet sits on the plate's edge; the chat is docked. A connected world is one of three rows: a realm it calls or that calls it, with calls a day; a shared room; "N people from X are here now · say hi". Each row flies there or sends a comet (phase 1) | 0 | — | Read |
| Flight panel | During a flight: "In transit", the target, distance, speed, arrival and a progress bar; "Course plotted" on leaving, "Entering orbit" on arrival | 0 | Scene | — |
| Status ring | A tilted orbit around a world, passing behind it and in front of it, for what the realm itself reports: a proposal's tally, a deadline the realm defines. A small moon on its front half marks the state, the arc up to the moon is lit, a mark stands at the threshold, the orbit's shadow falls on the planet, and a pill under the planet carries the numbers, so the state never rests on the ring alone (Alexis, 2026-10-31: the flat ring was a third party's concept's, ADR-0001). gnoworld invents no timer (§8, row 2). Activity trends belong to the heat badge, never the ring | 0 | Realm reads | Read |
| Rooms as moons | The busiest rooms orbit as moons, four at most, and the room you are in is always one: a moon's size follows the people present, it flares when someone speaks (the activity API, near a world), a click joins the room. A "+96" chip beside them opens the room switcher. The Earth keeps one moon, the real Moon, for its busiest room after the general one (§3) | 0 | Ergo counts | — |
| Storms | A conversation speeding up forms a storm's eye on the planet, growing with the pace of messages; a click joins that room. Shown near a world or a system, never from afar | 0 | The activity API (§7) | — |
| Auroras | The poles light with calls to the realm, stronger with calls per minute | 1 | The signals at scale (§7) | Read |
| Comets in space | A message sent to another world's room crosses space as a comet (Chat, comets) | 1 | The comets bot | — |
| Talk box | With the chat closed, the last lines of the world's room on its plate | 0 | — | — |
| Realm facts | Path, deployer, first block; the calls in 24 h wait for an indexer with dates (F2974: it has no time field) | 0 | The public indexer | Read |
| Latest post on X | — | Cut, unless a source is decided | — | — |
| The Earth | Bubbles where people speak from, with counts for the far side ("Japan · 12, far side"); hotspots per country with the last hour's trend ("+15% · 1 h", from the activity API); the globe turns to show your own message; "N realms deployed in 24 h" from the indexer | 0 | `pickBubbles` and its rules file (ADR-0001 §7) | — |
| Bubbles on other worlds | The prototype pops messages on any planet | Cut: bubbles are the Earth's, by country (ADR-0001 §7). Moons, storms, auroras and heat carry activity elsewhere (§3) | — | — |
| Hero | The number of people online, one line, two big actions | 0 | Ergo counts | — |
| Markets row | GNOT, ATONE and BTC with a 24 h line; the block height | 0 | The prices file (§6) | Read |
| Ticker | A pausable line of what is happening: votes, events, new worlds | 0, chain events included | The public indexer | Read |
| Rail | The worlds or the groups, magnified like a dock under the pointer. By default, the worlds with the most people present right now, after the ones you follow; phase 1 adds realm calls. 25 at most, scrolling, then a "See all" button to the list view. The order changes at most once a minute, only when a world stays clearly ahead, and never under the pointer | 0 | Ergo's `LIST`; the signals in phase 1 | — |
| List view | Everything as panels, no 3D, filterable by genre | 0 | — | — |
| Search | ⌘K over the current universe's worlds, ecosystems, stations and genres, grouped with their counts, with "Go explore" on top; satellites labelled "Sponsored"; in phase 1 over every realm, dust included | 0 | — | — |
| Loader | Real texture progress, then the space opens like an iris | 0 | — | — |
| Menu and settings | The account button (your nebula) opens a menu: passport, saved, settings, help, log out; on a phone, a menu button holds it with the navigation. Settings gather every choice in one place: **display** (quality Auto, High or Low; reduce animations; the 3D on a phone), **language** (yours, and automatic translation on or off), **notifications** (by kind and by world; push), **privacy** (DMs only from people you have talked with; Earth presence; the country tag; analytics; keeping your Jarvis questions), **account** (your name, your astronaut), **this device** (export or clear the passport, saved messages and drafts) | 0 | The device, and the server for DMs and push | — |

**Chat** (Ergo in phase 0, ADR-0001 §1)

| Concept | Phase | Needs |
|---|---|---|
| Rooms, shared rooms, and a room switcher that scales to hundreds: groups set by the world's moderators, pinned, joined, "active now", then the rest; search, unread counts, the keyboard, a windowed list | 0 | Ergo channels; groups in the hubs data file, then `r/gnoworld/hubs` |
| Replies, reactions, mentions, threads built from reply chains | 0 | `+draft/reply`, `+draft/react` (message-tags) |
| Rich composer with a format bar: bold, italic, strikethrough, code, quote and lists show as such; Markdown on the wire. No underline: Markdown has none | 0 | `draft/multiline` |
| Slash commands with autocomplete; `#room` and `@name` completion; Alt+Up and Alt+Down between rooms | 0 | — |
| Message menu: copy, room link, save, report, delete your own | 0. Delete needs `allow-individual-delete` on (it is off by default); report goes to moderation (§6) | `draft/message-redaction` |
| Moderation: a bot checks each public message; a hidden message says why and can be contested | 0 | The moderation bot (§6) |
| Mark unread | 0, on the device | — |
| Edit a message | Cut in phase 0: no IRCv3 capability (product review) | — |
| Pins: the room's moderators pin; the room shows a stack of pins | 0: one pin through `TOPIC`; several through channel metadata if Ergo supports it (checked in slice 4), otherwise 1 | Channel `TOPIC` |
| Saved messages and drafts | 0 | Device |
| Place links (`#bubble/arcade` flies there) | 0 | — |
| Contextual quick actions: Who's here, Calendar, Realm, Proposal, Station, Catch up, Poll | 0, votes and Catch up included; Poll in 1 | — |
| Who's here: the people in the room | 0 | Ergo `NAMES` |
| Person card: the worlds a person belongs to, message them, fly to them | 0 for the worlds they are in and "Message", a plain DM (below); 1 for the profile realm, "helped N" and the stamp count if the person publishes it | Ergo; `r/sys/users` |
| Your name and face | 0: your account is your address `g1…`, the same on every chain. The name shown is your mainnet name (`r/sys/users`), or your short address if you have none. Your nebula is generated from the address: three clouds of colour and your constellation over them (five stars and their line), readable at 20 px, the same everywhere. Registering a name happens in the app from phase 0: a call card to `r/sys/namereg/v0.Register` (`nym-` names), signed in Adena (§4). 1: choose its palette, saved in the profile realm; where its clouds and stars sit always comes from the address. Never a planet; no uploaded picture (§6) | The nebula generator (SVG from the address and the palette); `r/sys/users`, `r/sys/namereg/v0`; the profile realm |
| Notifications filtered by kind (messages, worlds, news) and by world | 0 in the app. News comes from a file the team curates | Ergo mentions |
| Push notifications | 1, through the PWA: desktop, Android, and the iPhone from iOS 16.4 once the site is added to the home screen. Native apps come only when measurement justifies them, with their own ADR: Capacitor on mobile, Tauri on desktop, both wrapping the same React code. Never a rewrite such as React Native | `draft/webpush`, and the PWA (ADR-0001 §12) |
| Photos and videos, gallery and lightbox | 0: links from accepted services render as embeds once the moderation check passes. gnoworld hosts no uploads (§6) | The embed allowlist |
| Polls | 1 | A bot, `TAGMSG`, one vote per account (`account-tag`) |
| Room games: social mini-games in a room (a quiz, an emoji race, "guess the realm"), with no money. Results are kept on chain in a game realm; each move is signed by the player's session key, with the gas sponsored | 1, after phase 0, with its own ADR first | A game bot; sessions and the sponsor (ADR-0001 phase 1); a game realm |
| Pots and stakes in games | Not planned. A separate decision, after room games | — |
| Comets: a message sent to another world's room | 1 | A bot relaying it (`draft/relaymsg`), rate-limited |
| Events and calendar, with reminders | 0 from a data file, reminders on the device; 1: added by each world's moderators, reminders by push. Events happen in text or voice rooms, or at a link | — |
| Weekly report, posted in the Earth's room | 1 | Written by the team (question 19) |
| "New here" on a first message, and a welcome | 1 | A server-side tag |
| Routed questions: an unanswered question reaches people from the world that knows; a "Thanks" counts toward "helped N" | 1 | Opt-in helpers |
| Translation: a message in another language arrives translated, with "show original"; anyone can turn it off | 0 | Jarvis's service with Haiku: one translation per message and language serves every reader, within its own budget; the original shows when it is spent (§5) |
| Voice rooms | 1, after phase 0, with its own ADR first | WebRTC: a media server, TURN, live moderation |
| On a phone | 0: read and follow; speaking, Jarvis and signing happen on a computer, said in place ("To speak, log in on a computer"). Adena cannot sign on a phone yet; this opens again when it can (§4) | — |
| Plain direct messages: between logged-in people, through the server and not encrypted, labelled "not encrypted: the server can read these"; block, report, and "only from people I have talked with" (the server knows past DM partners). Kept for a fixed number of days. The moderation bot does not read them; a report sends the reported messages to a person | 0 | Ergo private messages; a login |
| Encrypted direct messages, and the seal | 2 (ADR-0001 §2–§4). A seal records a conversation's Merkle root and both signatures, never the messages. Putting messages themselves on chain is the user's explicit choice: an encrypted archive, or a public excerpt (ADR-0001 §4). Public rooms are not sealed: they are public already | MLS; `r/seal` |

**Realms** (§4)

| Concept | Phase | Chain |
|---|---|---|
| Realm card: a digest of the realm in simple chat blocks (facts, chart, links, form, announcement, text), never its whole page; the full page on gnoweb. Its functions as forms in the realm view (§4). BUBBLE gets the same card as any realm | 0, with Jarvis's digest and calls; the first lines and the whole page whenever no digest is available | `vm/qrender`, `vm/qfuncs`, `vm/qeval` |
| Proposed actions: one or two per world pinned by the team; one fitting the conversation proposed by Jarvis, prefilled (§4) | 0 | `vm/qfuncs` |
| Calls from a card: a name, a vote, a `<gno-form>`, any function with `cur realm` | 0 | Signed by the user in Adena (§4) |
| On-chain activity in a room ("kaito voted yes on proposal 15", with "Vote" next to it) | 0 | Indexer events, read by the client from the public indexer |
| Proposal cards (GovDAO, Memba). GovDAO is a world near the sun: ADR-0001's "galactic council" | 0, to read and to vote | Votes stay in their realms (ADR-0001 §11) |
| A new realm appears as a signal; the first to fly there charts it, and the first to speak there leaves "first words" | 0 | Indexer (`addpkg` events, once live); the signals role knows who came first; Ergo's history gives the first words |
| Real previews: a capture of the world's public page | 0 | None: a build job captures gnoweb or the world's site |
| Satellites: sponsored words in orbit around a world, rented by the day (rules in §8, row 7) | 0 on Onyx, where deploys are approved automatically, shown only in the Onyx universe; mainnet after an external audit and mainnet's approval, without holding back phase 0's exit | A slot realm paid in GNOT; the moderation service's approval |

**Jarvis** (§5)

| Concept | Phase |
|---|---|
| Concierge: where to go, who to meet. It suggests people; it never contacts anyone for you | 0 |
| Realm reader: what a realm does, what can be read for free, what can be called | 0 |
| Catch up: what you missed in a room | 0 |
| Chain questions: blocks, transactions, a realm's activity and state, a transaction explained (§5) | 0 |
| Realm digests: a realm's page turned into simple chat blocks (§4) | 0 |
| Translation, automatic and cached (Chat) | 0 |
| Site evolutions: Jarvis prebuilds a change, a person reviews it | Later. Not in the product before the review process exists |
| Writing or deploying contracts | Cut (Alexis, 2026-10-16) |

**Discovery and play**

| Concept | Phase | Where |
|---|---|---|
| Passport: a stamp per world visited, constellations per ecosystem | 0 | Device. Progress shows per constellation, never against the universe's total (§3). A person may publish their stamp count on their profile (phase 1); otherwise nobody else sees it. These are not ADR-0001's paid stamps, which travel with a tip |
| "You charted it": the uncharted worlds you were the first on your device to visit. On a first visit a scan sweeps the planet, then "Stamped" and, for the first in the universe, "First to chart · your name stays on it · Share" | 0 | Device. Only a first visit to an uncharted world reaches the server, for the shared "first to chart" (Realms, above); nothing else of the passport leaves the device |
| Daily expedition: the same three stops for everyone, the first where something is live; a streak; a shareable route | 0 | Device; the stops from a data file the team curates |
| Quests across worlds, each ending on a realm action. Rewards stay on the device: no NFT badges (ADR-0001 §11) | 0 | Device; the quests data file |
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
| `/@:name` | A person by their mainnet name, or `/@g1…` by address (phase 1) | Yes, from `r/sys/users` at build time | Yes |
| `/passport`, `/saved`, `/settings` | Device-only views, shown as dialogs over the current place | No: the SPA fallback | `noindex` |
| `/net/:network/…` | Another universe (Onyx, a community chain): the same paths under its prefix, for example `/net/onyx/w/bubble` | Yes | Mainnet only. A testnet's pages are `noindex`, as gnoweb does for testnets (gno PR #6256) |

The `/n/`, `/r/` and `/p/` paths are proposed here and confirmed in the namespace-systems
slice.

**Pre-rendering, with no rendering server in production.**
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
- On phones, the chat comes first, read-only in phase 0, and the 3D loads only on request
  (§8, row 10).
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

Amended by §10.

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

  A golden test bounds the share of near-identical neighbours in any view: looks stay a
  pure function of the path, so a few close pairs are expected, never many. It is tuned
  on the real list and on a synthetic universe ten times larger.
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
  place only when it stays clearly busier for several minutes, so moons never flicker. The
  room you are in has its own slot, outside that rule.
- **Near, not far.** From afar a planet shows only the people present, as heat. Storms,
  moon flares and message rates appear near a world or a system, where they are big enough
  to see; only then does the client ask the activity API (§7), for the worlds in view.
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
- No counter announces the total, as in "42 of 551". Progress shows per constellation
  ("DeFi 3/5"), per session or as a rank.
- The rim thins instead of stopping.

### 4. Realm calls: read for free, sign inline

- **Reads cost nothing and need no wallet:**
  - a realm's page (`vm/qrender`);
  - an exported getter or value (`vm/qeval`);
  - its source (`vm/qfile`).

  Their results show in the card with "read on chain, free, no signature".
- **From phase 0, users sign their own calls in Adena:** a name, a vote, any function (§8,
  row 11).
- **A call is a transaction the user signs in Adena.** It shows as an inline card in the
  room or on the plate, in four steps (ADR-0001 §7):
  1. the preview: realm, function, arguments, network, fee. The network is the universe's
     chain, and Adena must be on it;
  2. "sign in Adena": the wallet opens;
  3. "landing in a block": Adena answers once the network accepts the transaction, so
     the card follows its hash until the block and its result;
  4. the result.
- **A call with more than two fields** opens in the realm view, a full page over the chat;
  the chat keeps only the compact card.
- **It is never a modal** (§8, row 1). The prototype's dialog stood in for this card.
- **ADR-0001 §11's warnings apply to every call**, for example "gnoworld does not check
  what this realm does" and "this text goes to {realm} on gno.land, publicly and forever".
- **Nothing is optimistic.** The room shows "kaito voted yes" only from the chain event.
- **gnoworld never signs for a user, and Jarvis never signs.** gnoworld's server holds no
  chain key: a satellite's takedown is signed by the admin who is the slot realm's owner or
  operator (§8, row 7). No call is ever sent from sample data.

**Adena, by its rules.** The browser talks to the extension through its injected API,
`window.adena`, wrapped in `lib/adena`: a small typed adapter whose every answer passes
Zod. Nothing of Adena loads before the first wallet gesture. The server verifies logins
with the SDK's own verifier (`@adena-wallet/sdk`). Both are pinned, with contract tests,
since Adena's SDK is young (0.1.x) and its docs lag its code.
- **Detect it first.** Without `window.adena`, the app says how to install it. The
  extension's version is read at start; one too old for a request (sign-in needs 1.22.2)
  asks for an update.
- **Check, never assume.** The connection is checked with `GetAccount` and `GetNetwork`
  before each action; a refused connection returns no error, so the state is read again.
  A connection belongs to one account and one site.
- **One listener per page.** Adena's events cannot be removed, and only the first listener
  hears them, so `lib/adena` registers once and passes account and network changes to the
  store. A change of account or network ends the old account's session.
- **One request at a time.** A new popup closes the open one, so requests queue.
- **Sign-in is `signArbitrary`** over plain words the person reads: "Sign in to gnoworld",
  the domain, a single-use nonce from the server, the issue and expiry times (4096 bytes at
  most). The server checks it with `verifyArbitrarySignature`, always passing the signer,
  the chain id (`gnoland-1`, `onyx-1`) and the exact text, since with nothing to check it
  says yes. The server then checks the nonce (unused, unexpired) and the domain itself.
  Session and multisig accounts cannot sign in.
- **A login lasts 30 days on a device,** renewed on use and revocable in the settings and
  by moderators. Ergo checks a token the server issued, so a reconnect needs no new
  signature and no chain read (§7).
- **Before "sign in Adena",** the network is read again and compared with the universe's
  chain. Adena is asked to switch, or to add a community chain and then switch; it never
  signs on the wrong one.
- **The fee is an estimate.** Adena simulates again and sets the gas and fee itself
  (gas used × 1.1 by default), so the preview labels its fee an estimate. gno charges the
  whole fee, not the gas used.
- **Every failure is a state with its next step,** from Adena's error codes: connect (1000),
  finish the open request (1001), unlock (2000), the wrong account (3001), set up Adena
  (3002), refused (4000), failed, with its log (4001), Adena too old or the account type
  unsupported (4005).
- **Phones:** Adena has no mobile signing today (no app, no WalletConnect, no deep link),
  so phones read in phase 0 (§1). The SDK's social login, with a key kept in the page, is
  a later decision.

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

- **Without a digest, the whole page.** Whenever Jarvis cannot give one (down, an error,
  the budget spent):
  - the card shows the page's first heading and paragraph, the team's pinned actions and
    the link to gnoweb;
  - the realm view shows the whole page, built from its raw Markdown by `core/markdown`'s
    allowlist, with no model;
  - gnoweb's extensions degrade simply: an alert becomes a quote, columns stack, a
    `<gno-form>` becomes a Form block, and any other tag shows as plain text;
  - images come only from the accepted hosts.
- **Jarvis's digest:** Jarvis reads the page's raw Markdown (`vm/qrender`; gnoweb
  also serves it as `text/markdown`) and the realm's functions. It returns the digest as
  data: a list of blocks from the table, checked with Zod. Never HTML, never interface
  code.
- **Grounded:** every number, link and function in a digest appears in the page, the
  state or `vm/qfuncs`. The server checks this by string match before caching; the evals
  check it too.
- **Cached** per realm, refreshed in the background at most every 10 minutes. One digest
  serves every reader. The card always shows the block height it was read at, with
  "refresh", so a number is never shown without its age.
- **By place:**
  - in the chat, a compact card: a few blocks and "View the page";
  - on the plate, the same with more room;
  - in the realm view (a full page over the chat, with a back button and its own URL), the
    digest, or the whole page when there is none, and every action.
- **A `<gno-form exec="Func">` in the page** is a transaction on gnoweb, so it becomes a
  Form block and then a call card. No hidden field: gnoweb strips them so people
  see all they submit, and so do we.

**Actions: every function as a form,** like gnoweb's actions page.
- `vm/qfuncs` (free) lists the exported functions, their parameters and their doc.
- **Read functions** (no `cur realm`): a form, and the result at once through `vm/qeval`.
  Free.
- **Write functions** (`cur realm`): a form, then the call card, then Adena.
- **Fields follow the types.** A call carries only primitive types and bytes (gno's
  `gno.land/pkg/sdk/vm/convert.go`). Any other parameter shows "open in gnoweb".
- The list is searchable when it is long.

**Proposed actions.**
- **Pinned by the team:** one or two per world, in the data file ("Vote", "Answer the
  poll"). They show as quick actions.
- **Proposed by Jarvis:** one action that fits the conversation, prefilled, for
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

- **Its button** opens with an introduction and suggestions ("What can I do here?", "What
  is new today?"). Its answers carry buttons that fly to a place or open a card, built from
  the same checked proposals as actions (§4).
- **Who to talk to:** Jarvis suggests people and worlds. It never contacts anyone for you;
  you write.

**The stack.**

| Part | What | Why |
|---|---|---|
| Harness | Our own small loop, in its own container `jarvis`, from an image of its own (§7; its own package `jarvis/`, which imports nothing of `server/`, by Alexis on 2026-11-04), on Anthropic's official TypeScript SDK (`@anthropic-ai/sdk`) and the official MCP client (`@modelcontextprotocol/client`, v2). Not the Agent SDK: it starts a Claude Code process per conversation (about 1 GiB each), with its own file, shell and web tools to lock away (Alexis, 2026-10-17) | One API key, light. The model only ever sees the tools we hand it, and the container holds no other key |
| Key | The Anthropic API key, in the service's environment only | The client holds no secret (§9) |
| Tools | **gnomcp** over stdio, one long-lived process for every conversation, seven read tools allowed: `gno_packages`, `gno_read`, `gno_render`, `gno_eval`, `gno_status`, `gno_history`, `gno_activity`. It starts read-only: an empty working directory, no agent key, its audit log on stderr. **Our own tools,** defined in the loop: a room's recent public history; the places and their URLs; the latest transactions and blocks from the public indexer and the RPC; the digests and action proposals of §4, checked before they reach the client. **gnoscope** (`https://gnoscope.com/mcp`, remote, read-only by design, behind a switch): a transaction explained, a realm's decoded state, an address, search over all code on chain | Free reads only, and nothing that writes |
| Skills | `SKILL.md` folders versioned in the repo: gnomcp's `gno` skill (Apache-2.0), to read realms correctly; ours: concierge, realm reader, catch up, translation. Text only, no scripts | Loaded on demand; part of the prompt version |
| Models | Sonnet 5.5 by default. Haiku 5.5 to sort, summarise and translate. Opus 5.5 for hard realm code | Cost and quality per task |

**It can write nothing. Four locks:**
1. **No key.** gnomcp runs with no agent key. On mainnet, gnomcp has no write path at all
   (its `docs/security.md`). On Onyx it does offer write tools, so there the next three
   locks are what hold.
2. **Only our tools exist.** The model is offered the read tools listed above, and nothing
   else: no shell, no file writing, no web. Skills are loaded by our own loader, from the
   skills folder only.
3. **Every call is checked and logged.** Before running a tool call, the loop checks its
   name against the allowlist and its arguments against the tool's schema, refuses
   anything else, and logs every call and refusal.
4. **No one to ask, nothing to approve.** There is no permission prompt to answer: what is
   not on the allowlist does not exist for the model, and what is refused stays refused.

To act, Jarvis proposes an action that opens the call card (§4). The user signs in Adena.

**Chain questions** ("what block are we at?", "the last transaction?", "explain this tx").
- Every answer states the block height it holds for, and says when the index lags.
  gnoscope returns that lag with each result.
- The current tx-indexer has no transaction time, so time windows go by block height.
- gnoscope is a third party whose operator we do not know. If it is down, Jarvis says so
  and answers from gnomcp and our server.

**Prompt injection: defence in depth.** Everything Jarvis reads is untrusted: realm source,
rendered pages, messages, indexer data. Any of it may hold instructions written to steer
it. No single layer is trusted to stop that; each layer limits what the next one has to
catch.
1. **Nothing to steal, nothing to do.** The model sees only public data and the asker's own
   question: no keys, no tokens, no DMs, nobody else's data, no memory across people. It
   has no write tool and no key (the four locks above). An injection can only change words.
2. **Data stays data.** Untrusted text reaches the model inside blocks marked with a random
   tag per turn, after the instructions, with the rule that nothing inside is an
   instruction. gnomcp and gnoscope already wrap their results as untrusted. Tool results
   are cut to a size limit.
3. **No way out through the answer.**
   - Answers render as Markdown to DOM from the allowlist, with **no images**, so an answer
     can never make the browser fetch an address that carries data away.
   - Links go only to gnoworld places, gnoweb and the accepted hosts. Any other link shows
     its full domain behind a warning.
   - Jarvis never follows a link it reads: it has no web tool.
4. **Effects pass checks the model cannot bend.** Digests, proposals and answer buttons are
   structured data, checked with Zod, grounded by string match against their sources
   (§4), and checked again by the client against `vm/qfuncs`.
   - A proposal never carries coins: if a function takes a payment, the person types the
     amount in the call card themselves.
   - The person sees and can edit every field, with ADR-0001 §11's warnings, and signs in
     Adena. Jarvis never signs.
5. **Translations are checked too.** A translation may not add a link, a mention or a
   number that the original lacks; one that does is dropped and the original shows.
6. **Watched.** A screen flags text that looks like an instruction aimed at an assistant.
   It is quoted with a note, and the turn is logged for review. A spike in flags or denials
   raises an alert (§5, observability).
7. **Tested.** The injection suite grows with every incident and every published technique.
   A red-team pass runs before launch, and the nightly sample includes injection checks.

**The service itself, hardened:**
- it runs in its own container, `jarvis`, not as root, on a read-only file system, holding
  only its own key;
- its network reaches only the Anthropic API, the chain's nodes, the public indexer and
  gnoscope, through the egress proxy (§7);
- it accepts only requests carrying a gnoworld session, with per-person rate limits and a
  size limit on every request;
- secrets come from the secret store; logs redact them;
- Jarvis's answers in a public room pass the moderation check like any message.

**Limits.**
- 20 questions per account per day by default; an account with no mainnet name gets
  fewer, since addresses are free. The team can raise it for a person (moderators,
  builders, partners), in the service's settings.
- **A budget of 50 $ a day, a hard cap.**
  - An alert fires at 80%.
  - At 100%, Jarvis stops until the next UTC day, and every feature falls back to its
    form without a model (§4).
  - An Anthropic workspace spend limit per environment backs it.
- **Every model call has its own timeout** and at most two retries (the SDKs wait ten
  minutes by default), and each question a maximum number of turns.
- **Translation:** one per message and language, cached, serves every reader, with Haiku.
  It has its own budget and the same hard stop: the original shows.
- The tools, the system prompt and the skills are frozen per version, so prompt-cache
  reads cost a tenth of the input price on Sonnet 5.5 and a twentieth on Opus 5.5.

**Evals.** A suite lives in the repo, run with promptfoo (MIT; owned by OpenAI since March
2026, its licence unchanged). It sits in its own `evals/` workspace, a development tool
that never enters an image. It calls our real loop through a small provider file, grades
with a model other than the one that answered, keeps every answer in its cache so an
unchanged case costs nothing, and carries the red team below. Our cases stay plain JSON
files, so the suite outlives the tool. CI runs it whenever any of these changes:
- the model;
- the prompt;
- a skill;
- a tool;
- the gnomcp version.

A drop below a threshold fails the run. It checks:
- **Tool use:** the right tool with the right arguments, and never a tool off the
  allowlist, read from the loop's log.
- **Grounding:** every fact traces to a tool result. A different model grades this against
  a rubric.
- **Prompt injection:** realms and messages with planted instructions; promptfoo's red team
  adds indirect injection, data exfiltration, excessive agency, goal hijacking, tool
  discovery, prompt extraction, MCP attacks and cross-session leaks, on every tool change
  and before launch.
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
thumbs up and down. Results are kept with the prompt version, as JSON files in the repo
that CI compares run to run; from phase 1, in Langfuse too.

**Observability.** The server exports OpenTelemetry; our own spans wrap each turn.
- **One trace per question**, recording:
  - the model and the prompt version: a hash of the prompt, skills and tool list;
  - each model request: tokens, cache, latency, stop reason;
  - each tool call: duration, error;
  - each refused tool call.
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
  - phase 0: Grafana (Tempo, Loki, Prometheus), for Jarvis as for Ergo and the server;
  - phase 1: Langfuse Cloud's free tier too, for conversations, prompt versions, eval
    scores and feedback. A question's text goes there only with the person's consent;
    otherwise only numbers: cost, time, tools called, scores (Alexis, 2026-10-17).

  OpenTelemetry keeps every backend replaceable; in production ops chooses (§7).
- **Privacy:**
  - a question's text is kept only with the person's consent, and deleted after a fixed
    period;
  - account ids are hashed with a secret key (§6, personal data);
  - Jarvis never reads DMs, plain or encrypted.

**Rejected: the Messages API's MCP connector.** It needs a remote MCP server, and gnomcp
runs over stdio. It is not eligible for zero data retention, and it has no hook to block a
call.

### 6. Moderation, admin, media, prices and measurement

**Moderation of public rooms** (phase 0). This answers part of ADR-0001's question 5;
jurisdiction and retention stay open there.
- **A moderation bot,** a role of the server, checks each public message with OpenAI's
  Moderation API (`omni-moderation-latest`: text and images, free of charge; slice 3
  confirms both against OpenAI's docs).
  - It sits in every public room: Ergo's channel cap is raised for it, and its operator
    credential is a secret (§9).
  - It catches up after an outage: it keeps the last message it checked in each room and
    replays the rest with `CHATHISTORY AFTER`.
  - It also counts messages per room and per minute, for the activity API (§7). Counting
    costs nothing: no service is called for it.
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
- **DMs are never sent to it.** Plain DMs (phase 0) are not checked; a report sends the
  reported messages to a person. From phase 2, DMs are encrypted end to end and the server
  cannot read them.
- **Satellites are checked before the app shows them** (§8, row 7): the realm takes any rent,
  the app shows one only once the chat's moderation passed its text, and its owner or operator
  takes one down after a report.
- **Preview captures** of worlds' pages pass the same check at build time before they are
  published.
- **The privacy policy** says public messages are checked by this service, and that
  translation and Jarvis go through Anthropic.
- **The key stays on the server,** and the bot rate-limits by account.

**Admin: roles, the console and the log.** Curation and moderation are a lot of work, done
by few hands, so they get the safest path.
- **Three roles**, each seeing and doing only its part:
  - **admin:** gno's core team;
  - **moderator:** for every world or for one;
  - **curator.**

  The admins choose the moderators and curators.
- **Where the roles live:**
  - in phase 0, a file in the repo, changed only by a pull request that two admins approve;
  - in phase 1, on chain in `r/gnoworld/hubs`, where a world's owner also names its
    moderators.
- **The console is its own small app, on its own origin** (`admin.` the site's domain), never
  part of the public client, so a flaw in a public page can never reach an admin session.
  It reuses the design system and `lib`, is `noindex`, and loads no third-party script.
- **Hidden from the internet.** The console and the admin API are never reachable from the
  public internet: only through the team's private network (Tailscale in the demo; a VPN
  or an access gateway in production, as ops chooses). That barrier comes before the Adena
  login, the roles and the log.
- **Hidden, but not secret code.** The console stays in the monorepo. Its safety never
  depends on its code being hidden, and no secret ever lives in the code.
- **Login:**
  - the same Adena signature, for a session of one hour;
  - a fresh signature for each sensitive action: a takedown with refund, hiding a realm, a
    quota, anything about roles;
  - the slot realm's owner actions are signed by its owner, one address that hands the realm
    over in two steps (§8, row 7).
- **The moderation queue:** reports, contests, flagged messages and satellites, each with
  its context and one-click actions.
  - Moderators act through the server, which sends the commands to Ergo, so nobody needs
    IRC operator rights.
  - Actions are rate-limited.
- **Curation:** the console edits the data files and opens the pull request through a
  GitHub App limited to this repo. Nothing goes live without review.
- **Kill switches** in the console: Jarvis, translation, satellites, and read-only chat;
  a moderator's rights can be revoked at once.
- **The audit log:** every action, with who, what, when and why, signed and append-only.
  Each entry is also shipped to the log backend, and the latest hash is published every
  month, so the server alone cannot rewrite it.
  - The person affected always sees the reason.
  - A monthly transparency summary, counts only, is public.
- **Complete:** the queue; people (history, mute, ban, reported DMs); worlds and realms
  (hide, feature, pinned actions); satellites; curation, with a preview before the pull
  request; Jarvis (quotas, budget, use); settings (moderation thresholds, the name
  filter); roles, read-only, since they change by pull request; the audit log, searchable.
- **Simple, with no frills, and the best UX:**
  - the queue comes first, sorted by urgency;
  - each item shows its context: the message and the thread around it, the author's
    history, the score and the reason;
  - each action shows its effect before it is confirmed, and can be undone where it is
    reversible;
  - keyboard shortcuts, bulk actions, an empty state for every list;
  - it works in a narrow window beside the chat; not on a phone in phase 0, since Adena
    cannot sign there;
  - design-system components only, no 3D and no decoration, accessible like the rest.
- **Hardened:**
  - the signed message for a sensitive action is the action itself, in words ("hide this
    message in #bubble/general: harassment"), so the log proves who decided what;
  - the session cookie is `HttpOnly`, `Secure` and `SameSite=Strict`, bound to the
    signer's address;
  - every right is checked on the server, never trusted from the client;
  - inputs pass Zod; the log is a hash chain, so a removed or edited line shows;
  - the admin API is not on the public API's host; a new login alerts the admins;
  - hardware wallets are recommended for admins;
  - the console is tier-1 code in review (`docs/REVIEW.md`), with a penetration test
    before launch.

**Personal data.**
- **An account is an address** (§1). Account ids in logs, traces and analytics are hashed
  with a secret key (HMAC with a pepper), never a plain hash, which anyone could reverse
  from a public address.
- **Each store has a retention:** Ergo's public history, plain DMs, logs and traces,
  backups. Ergo's account indexing is on from the start, so a person's messages can be
  found.
- **Erasure reaches everything:** Ergo, the server's database, caches, logs and backups.
  The audit log refers to people by id, so erasing them never breaks its chain.
- **Subprocessors are listed** in the privacy policy: Anthropic (Jarvis, translation),
  OpenAI (moderation), PostHog, gnoscope, and the hosts ops chooses.

**Media.** gnoworld hosts no media, because it cannot moderate uploads alone.
- Links and embeds come from an allowlist of accepted services that moderate their own
  content: YouTube, Vimeo, Imgur and Giphy, for example.
- An embed loads on a click, so no third party is reached before it (and no consent banner
  is needed); YouTube through its no-cookie domain.
- Broadcast Moon's videos come from the same services.
- Uploads are a later decision.

**Prices.**
- A timer in the server reads a public source (CoinGecko) every 5 minutes and writes a
  static `markets.json`.
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
  them as our own events (slice 12 checks).
- **The events:**
  - first visit;
  - first flight;
  - joined a room;
  - first message;
  - came back;
  - shared a link;
  - opened a realm card;
  - signed a call.

### 7. New pieces

| Piece | Phase | What it does | Notes |
|---|---|---|---|
| Data files | 0 | Universes, hubs, ecosystems, stations, events, expedition stops, quests, news, the bubble rules (ADR-0001 §7) | Versioned in the repo; curated by the team through reviewed pull requests; validated with Zod at build time |
| Preview captures | 0 | A build job (Playwright) captures each world's public page | Refreshed on a schedule; checked like a link preview (§6); no capture, no preview |
| The server | 0 | Login for Ergo, the moderation bot, the activity API, the first signals, the prices timer, the admin API, the satellites' moderation check | TypeScript on Node (below); one container, `server`, a singleton |
| Jarvis | 0 | §5 | Its own container, `jarvis`, from an image of its own: its built package `jarvis/` and its dependencies alone, no `server/` code, no script, no test (Alexis, 2026-11-04) |
| The activity API | 0 | Message rates per room, for the worlds in view, from the moderation bot's counters (§3) | A route of the server, cached a few seconds |
| PostHog | 0 | Product analytics (§6) | A third party, in the CSP's `connect-src` |
| Admin console | 0 | Roles, the moderation queue, curation edits as pull requests, settings, kill switches, the audit log (§6) | Its own origin, on the private network only; a GitHub App to open pull requests |
| Signals | 0 for new realms, first to chart and first words; 1 for the rest | Heat with realm calls, routes, new realms, who charted first; the rank, the dust, the seasons and the tiles of §3. It reads Ergo and the public indexer and serves a small JSON feed | A role of the server. ADR-0001 §13 holds: we run no indexer |
| Observability | 0 | Grafana, fed by OpenTelemetry; Langfuse Cloud from phase 1 (§5) | In the demo stack; in production where ops decides |
| Satellites | 0 on Onyx; mainnet after its audit and approval | The slot realm (§8, row 7) | Onyx approves deploys automatically; mainnet's approval is item 6 of ADR-0001's "What the chain needs" |
| Voice | 1 | A WebRTC media server and TURN | Its own ADR first |
| Room games | 1 | A game bot and a game realm (§1) | Its own ADR first. Needs sessions and the sponsor |

**ADR-0001 §13 changes.**
- It had two pieces: the static client and one Go binary. The server is now TypeScript on
  Node (below).
- **Phase 0:**
  - the pieces are the static client and the admin console, Ergo, `server`, `jarvis`,
    observability, and the slot realm on Onyx;
  - the third parties are Anthropic, OpenAI's moderation, PostHog, gnoscope and CoinGecko;
  - costs: Jarvis at up to 50 $ a day; hosting as ops chooses (below).
- **Phase 1:** the signals at scale, Langfuse Cloud, voice, room games, and satellites on
  mainnet once approved.

**Containers.** One image for the server's code, run as two containers, each with only its
own secrets and its own way out:

| Container | Roles | Secrets | Reaches |
|---|---|---|---|
| `server` | Login, moderation and activity, signals, prices, the admin API, the satellites' check | OpenAI, the bot's Ergo credential, the GitHub App, the session secret, the pepper | Ergo, the chain's nodes, the indexer, OpenAI, CoinGecko, GitHub |
| `jarvis` | Jarvis, gnomcp as a child process, translation | Anthropic | The Anthropic API, the chain's nodes, the indexer, gnoscope |

- `server` is a singleton: the moderation bot, the timers and SQLite. It takes a lock at
  start, and the runbook says never two replicas.
- **Ergo logs people in through the server:** its `auth-script` runs in socket mode, on a
  socket the server serves on a shared volume. The first login checks the Adena proof (§4);
  the server then issues a token, and every reconnect presents it, checked locally, with
  no new signature and no chain read. Clients reconnect with jittered backoff, so a restart
  of Ergo is never a storm of logins.
- **gnomcp** is copied into the `jarvis` image from its signed release, pinned by digest,
  and started once with an explicit configuration, an empty read-only working directory,
  its audit log on stderr, and its key and session paths empty. `init: true` reaps it.

**Where it runs: delivered in Docker, placed by ops** (Alexis, 2026-10-17). gnoworld does
not choose its hosts.
- **Demos:** one `docker compose up` runs everything on one machine, for demos inside the
  company: the client and the console served as static files, Ergo, `server`, `jarvis`, and
  Grafana's all-in-one OpenTelemetry image, capped and with its retention set.
- **The team's demo URL:** a Tailscale container inside the demo project joins the tailnet
  as its own machine and publishes the public site with Funnel. The demo binds no port on
  the host, and the host's own services are never touched.
- **The demo never harms the host, and never touches its installation:**
  - **Apart:** its own folder and Compose project, networks and volumes. It never edits the
    host's own Compose files, its proxy's configuration or its certificates.
  - **Sealed:** every service sits on internal networks. The only way out is the demo's own
    proxy, which allows a list of hosts and refuses private addresses (`NODE_USE_ENV_PROXY`
    is set, since Node's `fetch` ignores proxies otherwise). A test proves that the
    host's services, through `host.docker.internal` or the LAN, cannot be reached.
  - **Capped:** CPU, memory and process limits on every container, the whole demo under 2
    cores and 2 GB. A container that hits its limit is stopped by Docker; the host is not.
    Logs rotate; histories and Grafana keep a fixed number of days, since Docker volumes
    have no size quota.
  - **Locked down:** no privileged container, no host network, no Docker socket, a
    read-only root file system, a non-root user, every Linux capability dropped, no new
    privileges.
  - **Guarded at the door:** a shared demo password; `noindex`; the visitor's real address
    reaches Ergo and the server through the PROXY protocol from Funnel to the demo's proxy,
    so per-address limits work; rate limits; Jarvis's demo budget capped at a few dollars a
    day; moderation on.
  - **Private parts stay private:** the admin console, Grafana and a plain IRC port are
    reachable on the tailnet only, never through Funnel, and only from Alexis's own
    devices. The team uses the public URL.
  - **Shut in the tailnet too:** the demo machine joins with a tagged key, and the
    tailnet's access rules let that tag reach nothing: Funnel brings visitors in, and
    nothing leaves it for the host or any other device. A test from inside the demo
    proves it.
  - **Turnkey for ops:** `deploy/` holds everything: `compose.yaml` is what ops runs, the
    `demo` profile only adds the Tailscale machine, the egress proxy and the caps;
    `.env.example` and a list of the secret files; `docs/OPERATIONS.md`. One command
    starts each: `docker compose --profile demo up -d` here, `docker compose up -d` with
    their own settings and secrets there.
  - **Safe to try:** the default universe is Onyx, so calls spend test tokens.
  - **Disposable:** no backups. Load tests never run on it. Removing it is
    `docker compose down -v` and deleting its tailnet machine.

  Once a domain exists, a Cloudflare Tunnel can replace Funnel with the same stack.
- **The hand-off to ops:**
  - each service is an image, multi-architecture (amd64 and arm64), with its SBOM and
    provenance, pinned by digest: a multi-stage build, a non-root user, a read-only root
    file system with a `tmpfs` for `/tmp`, a health check that never depends on a third
    party;
  - the compose file is the reference wiring;
  - every setting is an environment variable in `.env.example`, with its meaning, its
    default and whether it is required; a secret is only ever a `*_FILE` path;
  - volumes are named: Ergo's `ircd.db` and history, the server's SQLite;
  - backups use `VACUUM INTO` (or `backup()`), encrypted and kept off the host, with a
    restore tested every month; Ergo is backed up before each upgrade, since its schema
    upgrade is one-way;
  - migrations are expand, then contract, so a rollback stays possible;
  - one source for the CSP, written both into the static host's headers and the demo's
    proxy; it lists each universe's RPC from the universes data file;
  - `docs/OPERATIONS.md` is the runbook. For each service: its image, ports, what health
    and readiness check, its limits, whether it is a singleton, the state it holds. Then:
    recovery targets, backup and restore, deploy, migrate, roll back, drain; each secret,
    its scope, its rotation and its emergency revocation; ingress, egress and how the
    client's address arrives; each third party with its timeout, retries, breaker,
    fallback and alert; SLOs, alerts and who is paged; log fields, redaction and
    retention; erasing a person's data; the kill switches; removing the demo.
- **On call:** a probe from outside opens a WebSocket, logs in, joins a room and hears its
  own echo. It pages when the probe fails, logins fail, the moderation backlog is older
  than two minutes, satellite rents spike, Jarvis hits its hard stop, a disk passes 80%, or the
  last backup is older than 26 hours. A moderation on-call is named.
- **Working locally, simply** (one compose file, three uses):
  - **develop:** `pnpm dev` serves the client with hot reload, and
    `docker compose --profile dev up` starts Ergo, `server` and `jarvis` beside it, with the
    same images as everywhere else;
  - **demo:** `docker compose --profile demo up -d` adds the Tailscale container, the egress
    proxy and the caps above;
  - **ops:** the same file is the reference wiring they adapt.
- **Deploying on its own, after a merge:**
  - a merge to `main` with the CI green builds the images, signs them and pushes them to a
    private registry; the static client goes to its host the same way;
  - the demo updates itself: an updater inside the demo project, limited to the demo's own
    containers by label, pulls new images within minutes. Nothing reaches into the machine
    from outside, and the host's own updater is left alone;
  - each pull request gets a preview of the static client at its own address, against the
    demo's services;
  - a rollback is the previous image digest; migrations run at start and are written expand
    then contract, so the previous image still works;
  - production uses the same images, promoted by ops with an approval;
  - this starts once the repository has a remote; until then the local gate is the CI.
- **Ops decides:** where each piece runs (a server, a platform such as Fly.io, a cluster),
  which backend receives OpenTelemetry, and where secrets live. Nothing in the code
  assumes a host.

**The server: TypeScript on Node** (Alexis, 2026-10-17; amends ADR-0001 §12 and §13).
Everything gnoworld writes for the server is TypeScript, beside the client; Ergo stays, as
an image we configure and never write. Versions were read on npm on 2026-10-17 and run in
Docker on arm64.

| Need | Choice | Why |
|---|---|---|
| Runtime | Node 24 LTS, pinned exactly (24.22.0) in `engines`, `.node-version` and the image digest; supported to 2028-04-30. Node 26 once it is LTS and Adena's SDK passes on it | Node runs TypeScript directly (stable since 24.12), so the server has no build step |
| Types | TypeScript 6 (`tsc --noEmit`), with `erasableSyntaxOnly`, `verbatimModuleSyntax` and `allowImportingTsExtensions` (no emit). TypeScript 7 waits for typescript-eslint | Node only strips types: no enums, no namespaces with code, no parameter properties, no tsconfig `paths` |
| Monorepo | pnpm 12 workspaces, one catalog of versions, `--frozen-lockfile`. Shared packages export their `.ts` sources; imports go by package name and `#` subpath imports. The image copies the workspace as it is, never `pnpm deploy` | pnpm installs no package scripts and no package younger than a day by default. Node refuses `.ts` inside `node_modules` |
| HTTP | Hono 4 with `@hono/node-server` 2 and `@hono/zod-validator` | No dependencies of its own; secure headers, body limit, timeout, CSRF and SSE built in; tested with `app.request()`, no server started; about 59 MB at rest |
| Rate limits | About twenty lines of ours, in memory, with a size cap | One process, nothing to share |
| Logins | Adena's SDK, `verifyArbitrarySignature` (§4, Adena) | The wallet's own verifier: no crypto written by us |
| Moderation bot | Our `core/irc` parser over a WebSocket to Ergo | The client's code, reused |
| Storage | `node:sqlite`, built in (release candidate on Node 24; it works on a read-only root and under the permission model). `better-sqlite3` if it stalls | One file, nothing to run beside it, no native module |
| Scheduled work | A timer in the process | No cron library |
| Claude and MCP | `@anthropic-ai/sdk` and `@modelcontextprotocol/client` (§5) | — |
| Tracing | `@opentelemetry/api`, `sdk-trace-node` and `exporter-trace-otlp-http`: spans by hand, one per request and one per Jarvis turn | 14 packages, against 71 for the full Node SDK |
| Logs | JSON lines on stdout | The log backend reads the containers' output |
| Tests | Vitest, as in the client; integration with `docker compose up --wait` against a real Ergo; load with k6 (HTTP and WebSocket), never on the demo's host | One set of tools everywhere |
| Image | Distroless Node 24, `nonroot`, pinned by digest (amd64 and arm64) | No shell, 162 MB |

**Node, fast and calm:**
- nothing heavy on the event loop: CPU work goes to worker threads;
- every outbound call carries `signal: AbortSignal.timeout(ms)`;
- every map, queue and list of streaming clients has a cap, with back-pressure;
- the heap follows the container's limit, set by hand to about 70% of it, since gnomcp
  shares the `jarvis` container's memory;
- the HTTP server's own timeouts are tightened; `--disallow-code-generation-from-strings`
  is on;
- SQLite: one connection, WAL mode, `STRICT` tables, short indexed queries only;
- `SIGTERM` drains connections and stops cleanly; health and readiness endpoints;
- no floating promise (lint), and a rejection that escapes stops the process loudly.

**Scale: each piece's first limit, and the next step.**

| Piece | First limit | Next step |
|---|---|---|
| The static client | None in practice: a CDN serves it | — |
| The build | One page per place | Planets only, never dust (§2) |
| Ergo | About 10,000 clients per instance, 2,000 per room (ADR-0001 §1) | More instances, each hub naming its server (ADR-0001 §8). Several instances split DMs, so that step needs its own design |
| The server | A singleton: the moderation bot, the timers, SQLite | Roles split into their own processes; SQLite to Postgres when two instances are needed |
| Moderation bot | The Moderation API's rate limit, measured in slice 3 | Batch messages per request; a queue with back-pressure. Previews wait; text never does |
| Jarvis | 50 $ a day; quotas per account | Digests and translations cached per content hash; more `jarvis` containers. Load-tested against a fake model |
| The public indexer | A third party's rate limits and uptime | The server caches and fans out; the client subscribes only to what it shows |
| The chain's RPC (`rpc.gno.land`) | A public node's limits | The server caches reads; ops may run its own node |
| gnoscope | A third party | Behind a switch; Jarvis answers without it |
| Signals | One JSON feed | Spatial tiles and per-region feeds (§3) |
| The slot realm | Gas per rent; one slot per world, and a closed rental leaves no record, so storage holds live rentals only | Ended rentals are closed and their slot rented again |
| PostHog | 1 million events a month free | Sampling, or the paid plan |

### 8. Differences with ADR-0001

All decided by Alexis on 2026-10-17.

| # | ADR-0001 says | The prototype does | Decided |
|---|---|---|---|
| 1 | §7: transactions are inline, with no modals | A modal signature request | Inline cards (§4). The modal was a placeholder |
| 2 | §7: "dropped from the concept: pots, boops, timers, claims and payout bars" | A Play card with BUBBLE's pot, a boop, and a pot clock on the status ring | gnoworld builds social room games, with no money and with results on chain (§1, Chat), after phase 0, with its own ADR first. No pots: a separate, later decision. gnoworld invents no timer: the ring shows only what a realm reports. BUBBLE gets the same realm card as any realm |
| 3 | §7: distance to the sun is activity; rooms are moons; people are satellites | Stable orbits; activity as heat; rooms as markers on the surface; people in lists | Stable places, with the scale rules of §3: one place per namespace, a slow seasonal drift, a rank from signals and curation, dust, and genres as lenses. Activity is heat, storms and auroras. The busiest rooms are moons, the others are in the room switcher; people are in lists; "satellite" means a sponsored slot |
| 4 | §12: no router and no server framework; the URL holds the camera state. §13: `/h/<hub>` | A URL per place, for search | React Router 8 framework mode, static pre-rendering, no rendering server; the camera follows the URL (§2). Its two dependencies are asked for in slice 1 |
| 5 | Phase 0 has no private messages; DMs arrive encrypted in phase 2 | DMs and the seal | Plain DMs from phase 0, labelled "not encrypted" (§1, Chat). Encrypted DMs and the seal stay in phase 2 |
| 6 | No voice | Voice rooms, and events in a "voice lounge" | A WebRTC voice room in phase 1, after phase 0, with its own ADR first |
| 7 | "Ideas to place": phase 0 takes none of them; ads tier 2 in phase 2; short videos in phase 3 or later | Satellites, Broadcast Moon, the GovDAO world, the person card, video embeds | **Satellites:** on Onyx in phase 0, shown only in the Onyx universe; on mainnet after an external audit and mainnet's approval, without holding back phase 0's exit (Alexis, 2026-10-17).<br>- a fixed daily price in GNOT, set by the slot realm's owner; 40 characters at most, for 1, 3 or 7 days; at most one per world; a limit per address; anyone may rent, from the app, gnoweb or gnokey;<br>- no approval and no server in the realm (Alexis, 2026-11-03: "un realm simple et si possible sans serveur", "un truc simple mais sécure"): the app shows a satellite only once its text passed the name filter and the chat's moderation, and the realm's owner or its operator takes one down after a report, refunding the days left;<br>- its owner is one address, no multisig, handed over in two steps (the new owner accepts); it sets the price and the operator, pauses renting and withdraws only what live rentals no longer hold; the operator, an address the owner names, may only take down;<br>- on mainnet, the revenue's recipient is named in the realm before launch;<br>- labelled "Sponsored", as advertising law requires.<br>**Broadcast Moon:** a curated station in phase 0, with videos embedded from accepted services (§6).<br>**The person card:** phase 0 in its basic form.<br>**Embeds:** links in phase 0. No uploads are hosted (§6) |
| 8 | Rollout: "tips and stamps in the same transaction" | Passport stamps | Two different things. Passport stamps record visits on the device. ADR-0001's stamps travel with a tip |
| 9 | §10: a generated identicon | A planet chosen as an avatar | A nebula generated from the address (an astronaut as §1 said, until Alexis chose the nebula on 2026-10-20, `docs/decisions.md`): where its clouds and stars sit always comes from the address; its palette is chosen in phase 1 and saved in the profile realm. Never a planet (§1) |
| 10 | §7: "mobile is the same space" | The full 3D on a phone | Chat first on phones: the chat full screen, the places as a list with planet thumbnails (the Open Graph images of §2), and the 3D only on request ("View in space"), loaded when asked and when the device can. Nothing of three.js or its textures loads before that |
| 11 | Rollout: in phase 0 "the chain is read, never written" | Calls, votes, a name registered in the app, satellites | From phase 0, users sign their own calls in Adena (§4). gnoworld's own writes in phase 0 are the slot realm's owner and operator actions on Onyx, signed by the admins who hold those addresses (§8, row 7) |
| 12 | §1, §2, §12 and §13: a small Go program on `auth-script`; "no Node server in production"; one Go binary (the stdlib, `coder/websocket`, `gnoclient`) | — | One TypeScript server on Node, sharing `core` and the schemas with the client, run as two containers (`server`, `jarvis`); still no rendering server. Adena's SDK verifies logins; Ergo stays, as an image (§7) |
| 13 | §9: "the hub's operators moderate with Ergo's tools" | — | Moderators act in the admin console; the server sends Ergo's commands (§6) |
| 14 | §10: tier 0 includes DMs; tier 2 gates votes | — | Plain DMs need a login (tier 1). Votes are calls the realm itself authorises: gnoworld gates nothing on them. An account is an address, its name shown from mainnet (§1) |

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

**At the core: security, performance and scale.** Every slice's plan answers three
questions before any code, and its review card checks the answers:
1. **Threat model.** What it adds (assets, entry points, who could abuse it and how), the
   mitigations, and the tests that prove each one.
2. **Cost.** The work per item on every hot path: per frame, per message, per call, per
   realm. Hot paths never grow with the size of the universe or the history, and never
   exceed O(n log n) in what a person can see. Each hot path has a bench, and its budget
   is in the gate.
3. **Scale.** The limit it hits first, and the next step (§7, scale).

**The slot realm's roles** (§8, row 7; amended 2026-11-03, no approval and no multisig):
- gnoworld's server holds no key for it: its owner and its operator are addresses held by
  admins, who sign in Adena or gnokey, never in the client's code or the repo;
- the owner hands the realm over in two steps (the new owner accepts), sets the price and
  the operator, pauses renting, and withdraws only what live rentals no longer hold, so every
  takedown can refund;
- the operator may only take a satellite down, refunding the days left to its payer;
- every rent and every takedown is an event, logged and observable (§5, observability).

**Architecture.** It is laid out in `docs/ARCHITECTURE.md`:
- feature modules with one owner each;
- a pure `core` for the rules;
- the scene kept out of React;
- one store between them;
- a dependency direction that lint enforces;
- TypeScript rules for types that carry meaning and files that read well (its
  "TypeScript" section).

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

**Rendering: smooth, calm, and light on the battery.** The scene must never lag, never heat
a machine and never drain a battery, even open for hours beside the chat. The rules come
from gno-golf's engine, measured there.
- **The GPU:** the low-power adapter where there are two, so the fans stay off; no stencil.
- **The pixel ratio** is capped at 1.25 on desktop and 1 on touch screens; Low takes 1 and
  0.8. The cap is applied again when the window moves to another screen.
- **The frame rate follows what happens, never above 60:**
  - 60 fps while flying or interacting;
  - 30 fps when only scenery moves;
  - 10 fps after a minute with no input;
  - 0 fps under reduced motion once nothing changes.

  A frame budget carried over keeps 75 to 165 Hz screens at exactly those rates.
- **Nothing is drawn** when the tab is hidden, when an opaque view covers the scene (the
  full-screen chat, a realm view, the list), or when the window is blurred and nothing is
  moving.
- **The full-screen chat costs what a plain chat app costs:**
  - the scene stops: no frame, no animation clock, no store subscription;
  - after five minutes covered, the scene releases its GPU memory beyond the current place,
    and reloads it behind a crossfade on return;
  - the chat itself stays light: a windowed history, embeds loaded only in view, no video
    playing by itself, typing and presence updates throttled;
  - only the chat socket stays open; nothing else polls.
- **Quality: Auto, High or Low**, in the settings. Low thins the dust and the effects, drops
  far glows and simplifies atmospheres.
  - **Auto** times the first 2 s or 90 busy frames. Above 20 ms a frame on average, the
    slowest tenth ignored, it drops to Low and remembers it on the device.
  - A steady 33 ms reads as the browser's battery saver, and is not remembered.
  - A known weak GPU (software renderers, old mobile and integrated chips, by the
    renderer's name) gets the list and planet stills, never WebGL. The gate's browsers
    use a software renderer, so a test switch turns this off there; the GPU bench runs on
    a real GPU.
- **"Reduce animations" on demand.** It is a setting in the app, as well as the system's
  reduced motion:
  - the shader clock and idle orbits freeze;
  - flights become crossfades;
  - effects become counts (§3).
- **Data saver** (`saveData`, a 2G link) shows stills instead of embeds, and never
  autoloads the 3D.
- **Few draw calls:**
  - static meshes are merged per material;
  - planets, dust, moons and comets are instanced;
  - materials are shared, and static objects skip matrix updates.
- **No hitch on arrival.** The shaders a flight will need are compiled ahead
  (`compileAsync`, 2 s at most), and a scene shows only when ready. Heavy building waits
  for idle time.
- **Off the main thread:** planet parameters and tiles are computed in workers.
- **Labels follow the scene every frame**, as cheap position updates; their text and the
  interface over the scene change 10 times a second at most.
- **A second renderer** (a shared snapshot) runs only when asked, then releases its
  context.
- **Measured in the field,** once per visit, never per frame, through PostHog: median fps,
  the slowest tenth, frames over 50 ms, heap size.
- **Checked in the gate:**
  - **a bench:** 60 fps and at most 33 ms of main-thread work per frame with the CPU slowed
    4×;
  - **an idle test:** a minute with no input asks no frame, or at most 10 a second, and
    uses next to no CPU;
  - **a hidden-tab test and a full-screen-chat test:** no frame at all, and the full-screen
    chat's CPU close to a plain chat page's;
  - **the GPU variety view of §3.**

**Tests in every direction.** Each slice adds its tests at every level that applies:

| Kind | What it proves | Tool | When |
|---|---|---|---|
| Unit | Every rule in `core`, and every parser; properties for parsers, placement and ranking (any input, the invariant holds), and every parser of untrusted input fuzzed with many more runs each night | Vitest; fast-check | Every commit; the long fuzz nightly |
| Component | Each design-system component in each state, the keyboard, axe | Vitest with Testing Library | Every commit |
| Feature | A feature with its store and its boundaries, against fakes: a fake Ergo, recorded chain answers, a fake model | Vitest | Every commit |
| Contract | Each Zod schema against recorded real answers (Ergo, the RPC, the indexer, gnoscope, Adena); live again each night, so a change outside fails loudly | Vitest | Every commit; nightly live |
| End-to-end | Every journey in a real browser against a local stack: Ergo, a local chain (gnodev), Jarvis with a recorded model, Adena's test double | Playwright, axe | Every pull request; nightly |
| Visual | Key screens and every component, as screenshots compared with the approved ones | Playwright | Every pull request |
| Faults | Ergo drops, the indexer is down, Jarvis is down, the moderation API is slow: each degrades as written | Playwright | Every pull request |
| Performance and memory | The bench, idle, hidden tab, full-screen chat, 20 flights, the bundle sizes, Lighthouse's budgets, the GPU variety view | Playwright, Lighthouse | Every pull request; the GPU bench nightly on a machine with a GPU |
| Algorithms | Every hot path has a bench with a stored baseline; a slowdown past 10% fails. Its growth is measured at n, 4n and 16n, so an O(n²) hiding in an O(n log n) path fails too | Vitest bench | Every pull request |
| Scale | Synthetic universes at 10×, 100× and a million realms: placement time per system stays flat, tiles stay bounded, the draw count stays bounded, ⌘K answers within budget; a 100,000-message history and a 1,000-room switcher stay smooth | Vitest bench, Playwright | Nightly |
| Load | Ergo with thousands of clients, Jarvis with concurrent questions against a fake model, the moderation queue at peak: latency and errors within budget | k6, against a local stack, never the demo | Before launch |
| Mutation | Every guard fails a test when removed: realms (`scripts/mutate.py`), and all TypeScript with tests (StrykerJS: its TypeScript checker drops mutants that would not compile, so the score is honest; incremental mode reruns only what changed) | `mutate.py`; StrykerJS | The changed lines before each merge; everything nightly. A score below its floor fails, the floor set from slice 1's first run and only ever raised |
| Realms | Tests, filetests, `gno-audit` | gno | Every commit |
| AI | Jarvis's evals (§5), non-hallucination first: every number, name, link and function in an answer is checked by string match against the tool results; an answer with nothing to ground it must say it does not know; a different model grades the rest. A grounded rate below the threshold fails | promptfoo, with our grounding check as a JavaScript assertion | On every change to it; nightly sample |
| Security | Dependency audit; secrets in the staged change and, before the first push, in the whole history; static analysis for TypeScript, Docker and the compose file; the CSP; the injection suite; races on every single-use proof (nonces, approvals); the admin console's penetration test | `pnpm audit`, gitleaks, semgrep, Vitest, the gate; a penetration tester before launch | Every commit; the full scan in `/pre-merge`; before launch |

`core` keeps 100% of lines and functions covered and 95% of branches; coverage alone never
counts as proof, mutation does.

**The CI measures, and fails on a regression:** speed, algorithmic growth, scale, memory,
bundle size, Web Vitals and hallucination. Every run stores its numbers, so a trend shows
before a budget breaks. Everything runs locally first: the pre-commit hook and Claude
Code's Stop hook run the gate, and `/pre-merge` runs the full set on the development
machine, the GPU bench included. A hosted CI runs the same script once the repo has a
remote.

**CI first, for code written by AI.**
- The CI and the gate come before the first feature (slice 1). The gate is
  `scripts/check.sh`, and CI runs the same script on every push, so there is one truth.
- Every change starts with its failing test, seen failing, then the code (ADR-0001 §14).
  A failing test is committed marked as expected to fail (`test.fails`), which the gate and
  the Stop hook accept; the commit with the code removes the mark.
- Nothing merges without a green CI. An agent never merges, never pushes on its own, and
  never skips a hook.
- A test is never edited to pass. A plan that proves wrong stops the slice and goes to
  Alexis.
- **The agent invents nothing.** A claim about a library, a browser API or a gno package
  comes from the installed types or source at the pinned version, docs read in the session,
  or a live query of the chain, never from memory; review cards cite their evidence
  (CLAUDE.md).

**Review, with AI and people** (`docs/REVIEW.md`):
- **the tests are reviewed before the code:** once the failing tests are written, a fresh
  agent checks them against the slice plan (every case and boundary, behaviour rather than
  build, the riskiest paths first, the threat model's abuse cases), and its findings are
  fixed before any code;
- **what costs no tokens runs first:** the gate, then the mutation tester on the changed
  code, so a missing test is found without a model;
- **the tests are audited next,** by a fresh agent whose only job is to catch tests that
  pass while the code is wrong (below), and a slice is not reviewed further until they
  are sound;
- **one review pass, sized by risk:** Claude Code's own `/code-review` reads the change in a
  fresh context (it follows `CLAUDE.md`, which sends it to `docs/REVIEW.md`'s checklists:
  correctness, security, performance, accessibility and UX, simplicity); a change to a
  tier-1 file adds one agent on the strongest model, for security alone;
- each finding is checked against the code before it is fixed; fixes are re-checked by the
  gate and the mutation tester, and a second pass runs only for a high finding fixed in
  tier-1 code;
- every finding left is fixed or put to Alexis;
- Alexis reviews blind first, and the review log keeps what each side caught or missed,
  so a repeated miss becomes a rule, a lint or a test, and a lens whose findings are
  mostly dropped is narrowed or removed.

**The test audit: no false green.** A test is worthless when a wrong change to the code
leaves it green. The auditor checks every new or changed test:
- **It breaks the code on purpose:** it runs the mutation tester on the changed code, and a
  surviving mutant is a missing test;
- **tautologies:** an expected value computed by the code under test, or copied from its
  output, instead of stated independently;
- **mocks that hide the truth:** the thing under test mocked, or a fake that cannot fail;
- **empty assertions:** "it was called", "it is defined", a snapshot nobody reads, a matcher
  so loose anything passes;
- **missing cases:** no failure path, no boundary (empty, zero, maximum, malformed, the
  wrong network), no refusal for the wrong caller;
- **flaky or hidden:** timing guesses instead of waiting on a state, `.skip`, `.only`, a
  test changed to pass;
- **checked it fails:** each new test was seen failing before its code, in CI.

Its findings are fixed before any other lens runs.

**Security.**
- **CSP:** strict, with no inline script and no `eval`. Pre-rendered JSON-LD is allowed by
  hash. `frame-src` lists only the accepted embed services.
- **Rendering:** Markdown is built into DOM nodes from an allowlist. No data ever reaches
  `innerHTML`.
- **Links and media:** https only, and only from the accepted services (§6).
- **Validation:** Zod checks Ergo, the indexer, realm reads and every data file.
- **Untrusted text:** realm text and chat, for Jarvis too (§5).
- **Secrets:** the client holds none. Each container holds only its own (§7): the Claude
  key in `jarvis`; in `server` the OpenAI key, the bot's Ergo
  credential, the GitHub App's key, the session secret and the pepper.
  Services rate-limit by account and by address.
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

**No dead code, no copy, no swallowed error, no drift, nothing invented:**
- unused exports, files and dependencies fail the gate (knip), with the TypeScript flags
  `noUnusedLocals` and `noUnusedParameters`;
- a copied block fails the gate (jscpd); an agent that cannot see the whole repo searches it
  before writing a helper, and review checks reuse;
- lint refuses an empty or log-only `catch`, a rethrow that drops its `cause`, a floating
  promise and a `switch` that misses a case;
- a refactor is its own commit and changes no test; the mutation score never drops;
- leaks: the 20-flight test and memlab on the client's journeys; a soak test on the server,
  whose heap after collection stays flat;
- drift: the harness's docs name only files that exist (`scripts/check_docs.py`, even on a
  docs-only commit); the green test pass flags a test weakened since the red pass; a merge
  names every file it changes outside its plan;
- nothing invented: a wrong API fails `tsc` or `gno lint`; a finding without its `file:line`
  and scenario is dropped; a claim comes with its evidence or is not made.

**Dependencies to ask for, each in its slice:**
- slice 1: `react-router`, `@react-router/dev`, `vite-plugin-pwa`, a CSS linter, an
  unused-code finder, a Lighthouse runner, an import-cycle check, Testing Library, fast-check, and StrykerJS (`@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `@stryker-mutator/typescript-checker`);
- slice 3: `hono`, `@hono/node-server`, `@hono/zod-validator`, `@adena-wallet/sdk` (the
  server's verifier);
- slice 10: `@anthropic-ai/sdk`, `@modelcontextprotocol/client`, `@opentelemetry/api`,
  `@opentelemetry/sdk-trace-node`, `@opentelemetry/exporter-trace-otlp-http`, and `promptfoo` in `evals/`;
- slice 12: `posthog-js`.

k6 runs as a binary or an image, not as a package.

### 10. What slice 7's validation changes (Alexis, 2026-11-01)

This section overrides the text above where they differ. The reasons and the numbers are in `docs/decisions.md`.

- **A world is a product, not a realm.** One planet and one room for `gnogolf`; its realms and versions sit under it, shown as you zoom in, with no room of their own. A namespace is a star. A hub with no realm is a world. The grouping reads paths, and a hub's `realms` list corrects it. This replaces "every realm is a world" (Summary, "A word on words", §3).
- **A world evolves with its use, little by little.** Two gauges: a vitality that remembers and moves a few percent a day, and the people present. Its stages run from seed through rest, living, inhabited and busy to beacon. Each class shows a stage its own way: a sign keeps its meaning, where it shows and how it grows, and varies its form.
- **Dust comes after a year.** A world turns to dust after one year with no transaction, no message and no import, coming apart over the last three months, and it becomes a planet again at the first sign of life, with the same look. A hub never does. This replaces "realms without signals are dust" (§3).
- **New realms.** A new family is a seed until its first visit, or 7 days; a new version wakes its planet instead. Nothing is sorted or hidden by its name.
- **Two layers.** Signs always mean real data. The scenery is generative art from a cell's position, unbounded, tied to no data, and never imitates a sign.
- **Rising worlds.** A world is rising against its own last 14 days, so a small world can stand out. The order is the Earth, trends, rising, seeds.
- **Auroras** mean a run of calls, then fade; they are never always on.
- **The Earth** stays one place, the general chat, with one Moon; its side rooms are points on the globe.
- **Dependencies are not positions.** A world stays with its namespace's star; its dependencies show as lines on hover.
- **Mechanics of discovery are in; money and competition are out.** This refines ADR-0001's "not a game".
- **Textures:** WebP from real maps, Solar System Scope's under CC BY 4.0, not KTX2, so no page's CSP widens.

## Consequences

**Phase 0 grows** to hold:
- the URLs and the pre-rendering;
- the design system;
- the passport and the expedition, on the device;
- universes, worlds, ecosystems, stations and genres from data files;
- the map view, the hero, the ticker and the rail;
- the preview captures and the prices file;
- the moderation bot, with contests, and the activity API;
- product analytics;
- Jarvis, with its evals and observability, digests, chain questions and translation;
- calls signed by users (names, votes, any function), with the chain's activity in rooms,
  new realms and firsts;
- plain DMs;
- satellites on Onyx;
- phones that read; speaking and signing on a computer.

**Its exit criteria add:**
- a world's page is found by its own name, with its own title and image;
- the Core Web Vitals and memory budgets hold;
- a person reaches every place with the 3D off;
- a hidden message tells its author why, and a contest reaches a person;
- PostHog receives counts only: no text, no names;
- a call signed in Adena lands, and its room shows it only from the chain event;
- Jarvis's evals pass their thresholds;
- the app shows a satellite on Onyx only after its moderation check.

**Phase 1 gets:**
- the signals at scale: heat with calls, routes;
- the universe at scale (§3): namespace systems, the rank and dust, computed genres, the
  seasons, and tiles when the count needs them;
- polls and comets;
- voice rooms and room games, each after its own ADR;
- events added by moderators;
- push notifications;
- friends on the map;
- "new here";
- routed questions;
- the weekly report, written by the team;
- the profile realm: the nebula's palette, the stamp count if published;
- Langfuse Cloud for Jarvis;
- satellites on mainnet, once audited and approved;
- speaking and signing on phones, when Adena can sign there (a decision first).

**Phase 2 gets** encrypted DMs and the seal, as before.

**The prototype's style is kept, and only rebuilt cleanly.** It is the reference for the look and the feel, and the
design system takes its values from it. Slice 2's designs refine it (ADR-0001 §7: "our own
look"); nothing in the style changes without Alexis's approval. Only the code underneath
is rebuilt.

## Questions answered

They continue ADR-0001's numbering, which stops at 13, and close its question 12. Alexis
answered them on 2026-10-17.

| # | Question | Answer |
|---|---|---|
| 12 (ADR-0001) | Where Ergo and the servers run | In Docker: demos on one Docker host, production where ops decides (§7) |
| 14 | The markets row's source | A timer in the server reads CoinGecko into `markets.json`; the client reads only that file (§6) |
| 15 | Jarvis: model, host, budget, translation | Sonnet 5.5 by default, Haiku 5.5 and Opus 5.5 by task; its own container `jarvis`, on the official Anthropic and MCP SDKs; 50 $ a day as a hard cap; automatic, cached translation with Haiku, on its own budget; chain data from gnomcp, the public indexer and gnoscope; Langfuse Cloud from phase 1 (§5) |
| 16 | Media: storage, budget, moderation | No hosted media at first: embeds from accepted services. Messages are moderated by a bot on OpenAI's Moderation API, checked after posting, with contests (§6) |
| 17 | Public room archives as indexed pages | No, at first (§2) |
| 18 | Measurement | PostHog, EU cloud, cookieless, counts only (§6) |
| 19 | Curation of stations, expedition stops, news and the weekly report | The team alone, through the data files and pull requests |
| 20 | Satellites | Rules in §8, row 7: checked by the moderation API before the app shows them. On Onyx in phase 0; mainnet after audit and approval |

**Decisions still to come, each with its own ADR:**
- voice rooms (phase 1);
- room games on chain (phase 1);
- hosted uploads;
- pots in games;
- native apps (Capacitor, Tauri), when measurement justifies them;
- signing on phones: Adena's mobile app when it ships, or the SDK's social login.

ADR-0001's question 5 keeps its jurisdiction and retention parts.

## References

- [The prototype, its videos and its reviews](../docs/prototype/README.md)
- [ADR-0001](0001-gnoworld.md)
- React Router, [pre-rendering](https://reactrouter.com/how-to/pre-rendering)
- **The Claude Agent SDK, considered and set aside:** [MCP](https://code.claude.com/docs/en/agent-sdk/mcp), [permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
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
