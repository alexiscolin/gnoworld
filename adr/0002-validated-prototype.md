# ADR-0002: The validated prototype — scope, addresses, and what it changes in ADR-0001

| | |
|---|---|
| Status | Proposed. The prototype was approved by the lead on 2026-10-16; the decisions marked "to decide" below wait for Alexis |
| Date | 2026-10-16 |
| Author | Alexis Colin |
| Builds on | [ADR-0001](0001-gnoworld.md). Amends its §7 (levels and two navigation rules), §12 (routing, rendering), §13 (pieces and hosting from phase 1) and its "Ideas to place" |
| Prototype | [docs/prototype](../docs/prototype/README.md): live artifact (version 57), two walkthrough videos, five reviews |
| Verified | npm on 2026-10-16: `react-dom` 19.3.1 exports `react-dom/static`; `react-router` and `@react-router/dev` 8.4.0. React Router's pre-rendering guide read on 2026-10-16. `gno.land/r/gov/dao` read on onyx with gnomcp on 2026-10-16: `Render`, `GetProposal` (free reads) and `MustVoteOnProposalSimple(cur realm, pid int64, option string)` (a call) |

## Summary

A clickable prototype was built and approved: 57 versions over two days, reviewed from five
angles (UI, UX, game design, product, growth). It keeps ADR-0001's principles and makes
them concrete. gnoworld is a **live, hyper-social map of gno.land**:

- every realm is a world with its own rooms;
- groups of worlds fly together as ecosystems;
- the map shows where people are and what is moving;
- every world leads to its realm: read it for free, call it with Adena.

This ADR records four things:

1. **The concepts.** What the product does, each concept placed in a phase with the pieces
   it needs (§1).
2. **Addresses and search.** Every place has a URL and a pre-rendered page, with no server
   in production (§2).
3. **Realm calls and Jarvis.**
   - Realm reads are free.
   - Calls are inline cards signed in Adena (§3).
   - Jarvis reads realms with you and never signs (§4).
4. **What changes in ADR-0001.** Where the prototype and ADR-0001 differ, and how each
   difference resolves (§6). Each resolution waits for Alexis.

**The prototype's code is not reused.** Every concept is rebuilt slice by slice, test first
(§7, `docs/plans/backlog.md`).

**A word on words.** The product says "world" where ADR-0001 says "hub". The code and the
realm (`r/gnoworld/hubs`) keep "hub". "Satellite" now means a sponsored slot (§1); people
are not drawn as satellites (§6).

## Context

- **ADR-0001** set the principles: social first, on chain and decentralized, highly
  graphical, integrated with gno. It also set phase 0: a public hub on Ergo, with the chain
  read but never written.
- **The prototype was built to find the product inside those principles.** It is a single
  page with sample data and a script. It uses the network only for:
  - its libraries from a CDN;
  - an optional Adena connection;
  - an optional Claude model behind Jarvis.

  It was approved on 2026-10-16.
- **The goal confirmed with it:** a hyper-social chat that makes the ecosystem's activity
  visible, creates momentum, helps people find their way, makes them want to stay and talk,
  and leads them to use realms.
- **A reply from the team asked for "No Man's Sky vibes":** one star per registered
  namespace, with its realms and packages in orbit. ADR-0001 §8 already derives project
  hubs from realm paths, so this fits (§1, "Space").
- **Alexis set Jarvis's scope on 2026-10-16:** it reads and explains realms and prepares
  calls. It does not write or deploy contracts.

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
| The cosmos | gno.land as the sun; worlds as planets generated from their path (same path, same planet), on stable orbits; the asteroid belt; the uncharted frontier | 0 | Scene; the hubs data file, then `r/gnoworld/hubs` | Read |
| Ecosystems | Worlds of one topic flying in formation, with a group view | 0 | Ecosystems data file | — |
| Other systems | Onyx and community systems, each a star with its worlds | 0 | Systems data file | Read |
| Namespace systems | One star per registered namespace, its realms and packages in orbit | 1 | `vm/qpaths` by namespace; level of detail in the scene | Read |
| Stations | Places curated by the team for its topics: AI Ring (something built with AI), Broadcast Moon (a moon of screens), Harbor (long reads). Not realms, and labelled so; realistic 3D | 0 | Stations data file. Broadcast Moon's videos need hosting (question 16); until then, its posters | — |
| Map view | The same space from above, with zone captions | 0 | Scene | — |
| Level of detail | From afar, only key labels: groups, Earth, GovDAO, systems, signals, the two hottest worlds, what you follow, the next event. The rest appear on approach. Labels never overlap | 0 | Scene, labels layer | — |
| Heat | A steady warm glow on the busiest worlds, stronger with activity, with a "▲ 24% · 148/h" badge. No rings, no lines | 0 from room user counts; 1 adds realm calls | Ergo `LIST` counts (checked in slice 4); the indexer | Read |
| Telescope | Hover a world's name to read its room's last lines without flying there | 0 if Ergo serves history to a non-member (checked in slice 4), otherwise 1 through the signals feed | Ergo history | — |
| Routes | On hover, lines to the realms a world calls or imports, with traffic moving on them | 1 | Indexer for calls; `vm/qfile` for imports | Read |
| Embassies | A room shared by two worlds, drawn as a small station between them | 0 | One Ergo channel listed by two worlds | — |
| Focus view | The plate: name, two facts, activity chart, one main action, connected worlds, a real capture of the world's page, links. The planet sits on the plate's edge; the chat is docked | 0 | — | Read |
| Status ring | A thin arc around a world for what the realm itself says: a proposal's tally, a deadline the realm defines. gnoworld invents no timer (§6, row 2) | 0 | Realm reads | Read |
| Room markers | A world's rooms as markers on its surface, each opening its room | 0 | — | — |
| Talk box | With the chat closed, the last lines of the world's room on its plate | 0 | — | — |
| Realm facts | Path, deployer, first block, calls in 24 h | 0 for the path; 1 for the rest | The indexer | Read |
| Latest post on X | — | Cut, unless a source is decided | — | — |
| The Earth | Bubbles where people speak from, with counts for the far side ("Japan · 12, far side"); the globe turns to show your own message | 0 | `pickBubbles` and its rules file (ADR-0001 §7) | — |
| Bubbles on other worlds | The prototype pops messages on any planet | Cut: bubbles are the Earth's, by country (ADR-0001 §7). Room markers and heat carry activity elsewhere | — | — |
| Hero | The number of people online, one line, two big actions | 0 | Ergo counts | — |
| Markets row | GNOT, ATONE and BTC with a 24 h line; the block height | 0 for the block height; the prices wait on question 14 | A price source | Read |
| Ticker | A pausable line of what is happening: votes, events, new worlds | 0 from data and rooms; 1 adds chain events | — | Read |
| Rail | The worlds or the groups, magnified like a dock under the pointer | 0 | — | — |
| List view | Everything as panels, no 3D | 0 | — | — |
| Search | ⌘K over worlds, ecosystems, systems and stations | 0 | — | — |
| Loader | Real texture progress, then the space opens like an iris | 0 | — | — |

**Chat** (Ergo in phase 0, ADR-0001 §1)

| Concept | Phase | Needs |
|---|---|---|
| Rooms, a room switcher with search (scales past 40 rooms), shared rooms | 0 | Ergo channels |
| Replies, reactions, mentions, threads built from reply chains | 0 | `+draft/reply`, `+draft/react` (message-tags) |
| Rich composer: bold and italic show as such; Markdown on the wire; code blocks and lists | 0 | `draft/multiline` |
| Slash commands with autocomplete; `#room` and `@name` completion; Alt+↑↓ between rooms | 0 | — |
| Message menu: copy, room link, save, report, delete your own | 0. Delete needs `allow-individual-delete` on (it is off by default); report goes to moderation (slice 9) | `draft/message-redaction` |
| Mark unread | 0, on the device | — |
| Edit a message | Cut in phase 0: no IRCv3 capability (product review) | — |
| Pins | 0 | Channel `TOPIC` |
| Saved messages and drafts | 0 | Device |
| Place links (`#bubble/arcade` flies there) | 0 | — |
| Contextual quick actions: Who's here, Calendar, Realm, Proposal, Play, Station, Catch up, Poll | 0 for those that read; 1 for those that call (Play, votes), and for Catch up and Poll | — |
| Who's here: the people in the room | 0 | Ergo `NAMES` |
| Person card: the worlds a person belongs to, message them, fly to them | 0 for the worlds they are in; 1 for the profile realm and "helped N" | Ergo; `r/sys/users` |
| Your name and face | 0: a gno name read from `r/sys/users` and a generated identicon (ADR-0001 §10). Registering a name happens on gno.land. 1: an uploaded picture, if decided with the media service | — |
| Notifications filtered by kind (messages, worlds, news) and by world | 0 in the app. News comes from a curated file (question 19) | Ergo mentions |
| Push notifications | 1 | `draft/webpush`, and the PWA (ADR-0001 §12) |
| Photos and videos, gallery and lightbox | 0: links to https images and videos render as embeds; 1: uploads | The media service (§5) |
| Polls | 1 | A bot, `TAGMSG`, one vote per account (`account-tag`) |
| Quiz | Cut | — |
| Comets: a message sent to another world's room | 1 | A bot relaying it (`draft/relaymsg`), rate-limited |
| Events and calendar, with reminders | 0 from a data file, reminders on the device; 1: added by each world's moderators, reminders by push. Events happen in text rooms or at a link | — |
| "New here" on a first message, and a welcome | 1 | A server-side tag |
| Routed questions: an unanswered question reaches people from the world that knows; a "Thanks" counts toward "helped N" | 1 | Opt-in helpers |
| Translation | Question 15 | A translation service, opt-in |
| Direct messages, and the seal | 2 (ADR-0001) | MLS |
| Voice rooms | Cut (§6) | — |

**Realms** (§3)

| Concept | Phase | Chain |
|---|---|---|
| Realm card: free reads (`Render`, getters) and their results | 0 | `vm/qrender`, `vm/qeval` |
| Calls from a card: a vote, a boop, any function with `cur realm` | 1 | Signed by the user in Adena (§3) |
| On-chain activity in a room ("kaito voted yes on proposal 15", with "Vote" next to it) | 1 | Indexer events |
| Proposal cards (GovDAO, Memba). GovDAO is a world near the sun: ADR-0001's "galactic council" | 0 to read; 1 to vote | Votes stay in their realms (ADR-0001 §11) |
| A new realm appears as a signal; the first to fly there charts it, and the first to speak there leaves "first words" | 1 | Indexer (`addpkg` events, once live); the signals feed knows who came first |
| Real previews: a capture of the world's public page | 0 | None: a build job captures gnoweb or the world's site |
| Satellites: sponsored words in orbit around a world, rented by the day | 2 | A slot realm paid in GNOT (ADR-0001, "Ideas to place"), moderated |

**Jarvis** (§4)

| Concept | Phase |
|---|---|
| Concierge: where to go, who to meet | 1 |
| Realm reader: what a realm does, what can be read for free, what can be called | 1 |
| Catch up: what you missed in a room | 1 |
| Weekly report: drafted by Jarvis, approved by a person, posted in Earth | 1 |
| Site evolutions: Jarvis prebuilds a change, a person reviews it | Later. Not in the product before the review process exists |
| Writing or deploying contracts | Cut (Alexis, 2026-10-16) |

**Discovery and play**

| Concept | Phase | Where |
|---|---|---|
| Passport: a stamp per world visited, constellations per ecosystem | 0 | Device. On chain is a later decision. These are not ADR-0001's paid stamps, which travel with a tip |
| "You charted it": the uncharted worlds you were the first on your device to visit | 0 | Device. The shared "first to chart" is phase 1 (Realms, above) |
| Daily expedition: the same three stops for everyone, the first where something is live; a streak; a shareable route | 0 | Device; the stops from a data file |
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
| `/s/:system` | A system and its worlds | Yes | Yes |
| `/list` | Everything as panels | Yes | Yes |
| `/events` | The calendar | Yes, rebuilt when the events file changes | Yes, with `Event` structured data |
| `/@:name` | A person (phase 1) | Yes, from `r/sys/users` at build time | Yes |
| `/passport`, `/saved` | Device-only views, shown as dialogs over the current place | No: the SPA fallback | `noindex` |

**Pre-rendering, with no server in production.**
- React Router 8 in framework mode, with `ssr: false` and an async `prerender` that lists
  every place from the data files. In phase 1 it lists them from `r/gnoworld/hubs` at
  build time.
- The build writes one HTML file per place, plus `__spa-fallback.html` for the device-only
  paths. The host serves the fallback where no file exists.
- The client hydrates. Production stays a static site, as ADR-0001 §13 requires.
- The PWA (ADR-0001 §12) stays from the first build. Whether `vite-plugin-pwa` works with
  React Router's framework mode is checked in slice 1.
- Requires `react-router` and `@react-router/dev` (to decide, §6).

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

**Live data is not indexed.** Messages, heat and counts arrive on the client. Whether
public room archives become indexable pages is question 17.

**Core Web Vitals are budgets:**

| Metric | Budget | Checked |
|---|---|---|
| LCP | 2.5 s | In the gate, by Lighthouse on a mid-range mobile profile |
| CLS | 0.1 | In the gate, by Lighthouse on a mid-range mobile profile |
| TBT, the lab stand-in for INP | 200 ms | In the gate, by Lighthouse on a mid-range mobile profile |
| INP | 200 ms | In the field, once a counter exists (question 18). Lighthouse does not report INP on a page load |

### 3. Realm calls: read for free, sign inline

- **Reads cost nothing and need no wallet:**
  - a realm's page (`vm/qrender`);
  - an exported getter or value (`vm/qeval`);
  - its source (`vm/qfile`).

  Their results show in the card with "read on chain, free, no signature".
- **A call is a transaction the user signs in Adena.** It shows as an inline card in the
  room or on the plate, in four steps (ADR-0001 §7):
  1. the preview: realm, function, arguments, network, fee;
  2. "sign in Adena": the wallet opens;
  3. "landing in a block";
  4. the result.
- **The prototype's dialog stood in for this card.** It is not a modal in the product.
- **ADR-0001 §11's warnings apply to every call**, for example "gnoworld does not check
  what this realm does" and "this text goes to {realm} on gno.land, publicly and forever".
- **Nothing is optimistic.** The room shows "kaito voted yes" only from the chain event.
- **gnoworld never signs, and Jarvis never signs.** No call is ever sent from sample data.

### 4. Jarvis

Jarvis is the concierge in every room. `@jarvis` calls it, and so does one button. It
reads and explains, and it prepares calls the user signs.

- **Its tools are read-only queries:**
  - the packages under a namespace (`vm/qpaths`);
  - a realm's outline and functions (`vm/qfile`);
  - its page (`vm/qrender`);
  - an exported value (`vm/qeval`);
  - a room's recent public history.

  These are the reads gnomcp offers (`gno_packages`, `gno_read`, `gno_render`,
  `gno_eval`). It has no write tool and no key.
- **Everything it reads is untrusted:** realm source, rendered pages and messages.
  - It reaches the model as quoted data, never as instructions.
  - Jarvis's answers are rendered like any message: Markdown to DOM, with no HTML.
- **It runs on our server, never in the client.** The model key stays there.
- **Its limits:**
  - per-user and daily caps;
  - a budget alert;
  - it speaks only when asked (`@jarvis`, a quick action, its button);
  - it never answers on its own in a public room, not even to a routed question (product
    review).
- **Model and host:** question 15.

### 5. New pieces

| Piece | Phase | What it does | Notes |
|---|---|---|---|
| Data files | 0 | Hubs, ecosystems, systems, stations, events, expedition stops, quests, news, the bubble rules (ADR-0001 §7) | Versioned in the repo; validated with Zod at build time |
| Preview captures | 0 | A build job (Playwright) captures each world's public page | Refreshed on a schedule; no capture, no preview |
| Signals | 1 | Heat with realm calls, routes, new realms, who charted first. It reads Ergo and the public indexer and serves a small JSON feed | A role of the Go binary. ADR-0001 §13 holds: we run no indexer |
| Jarvis | 1 | §4 | In the Go binary or beside it: question 15 |
| Media service | 1 | Accepts uploads, re-encodes them server-side (stripping metadata), stores them, and returns a URL for IRC | Size and type limits; moderation queue: question 16 |

**ADR-0001 §13 changes from phase 1.**
- It had two pieces: the static client and one Go binary.
- In phase 0 it stays at three: the client, Ergo, and the login program.
- From phase 1, the Go binary gains the signals role, and possibly Jarvis.
- The media service is new.
- Phase 0 stays at 0 € hosting. From phase 1, Jarvis's model and the media storage cost
  money (questions 15 and 16).

### 6. Differences with ADR-0001

| # | ADR-0001 says | The prototype does | Proposed | Status |
|---|---|---|---|---|
| 1 | §7: transactions are inline, with no modals | A modal signature request | Inline cards (§3); the modal was a placeholder | To decide |
| 2 | §7: "dropped from the concept: pots, boops, timers, claims and payout bars" | A Play card with BUBBLE's pot, a boop, and a pot clock on the status ring | gnoworld builds no game and invents no timer. The card composes BUBBLE's own realm (ADR-0001 §11), its call comes in phase 1, and the ring shows only what the realm reports | To decide |
| 3 | §7: distance to the sun is activity; rooms are moons; people are satellites | Stable orbits; activity as heat; rooms as markers on the surface; "satellite" means a sponsored slot; people in lists, not in the sky | Keep the prototype. Stable places help people find their way; heat shows activity without moving the map | To decide |
| 4 | §12: no router and no server framework; the URL holds the camera state. §13: `/h/<hub>` | A URL per place, for search | React Router 8 framework mode, static pre-rendering, no Node server; the camera follows the URL (§2). Two new dependencies | To decide |
| 5 | Phase 0 has no private messages | DMs and the seal | Unchanged: phase 2 | Kept |
| 6 | No voice | Voice rooms, and events in a "voice lounge" | Cut: no phase delivers voice (product review) | To decide |
| 7 | "Ideas to place": phase 0 takes none of them; ads tier 2 in phase 2; short videos in phase 3 or later | Satellites, Broadcast Moon, the GovDAO world, the person card, video embeds | Satellites in phase 2. Broadcast Moon is a curated station in phase 0; its videos need hosting (question 16). The person card is phase 0 in its basic form. Embeds are links in phase 0; uploads in phase 1 | To decide |
| 8 | Rollout: "tips and stamps in the same transaction" | Passport stamps | Two different things: passport stamps record visits on the device; ADR-0001's stamps travel with a tip | Clarified |

**Checks for slice 1**, which are not differences with the prototype:
- **The React Compiler.** ADR-0001 §12 plugs it through `@vitejs/plugin-react`, while
  React Router's framework mode uses its own Vite plugin. Check how the compiler plugs in.
  If it does not, record the trade-off before writing any `memo` by hand.
- **TypeScript.** ADR-0001 §12 holds TypeScript at 6.0 for typescript-eslint, but npm
  shows 7.0.2 on 2026-10-16. Stay on 6.x until typescript-eslint supports 7.
- **The PWA plugin** with React Router's framework mode (§2).

### 7. The engineering bar

ADR-0001 §14 stands: test first, one gate, strict TypeScript, Zod at boundaries, review by
risk. This adds what the prototype showed was needed.

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
- A strict CSP with no inline script and no `eval`. Pre-rendered JSON-LD is allowed by
  hash.
- Markdown is built into DOM nodes from an allowlist. No data ever reaches `innerHTML`.
- Links and media are https only, and media from an allowlist of hosts.
- Zod checks Ergo, the indexer, realm reads and every data file.
- Realm text and chat are untrusted, for Jarvis too (§4).
- The client holds no secret. Services have rate limits.
- Dependencies are locked, and the gate audits them.

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

**No dead code:**
- unused exports, files and dependencies fail the gate;
- the TypeScript flags `noUnusedLocals` and `noUnusedParameters`.

**Dependencies to ask for, each in its slice:**
- `react-router` and `@react-router/dev`;
- a CSS linter;
- an unused-code finder;
- a Lighthouse runner;
- the media service's image encoder.

## Consequences

**Phase 0 grows** to hold:
- the URLs and the pre-rendering;
- the design system;
- the passport and the expedition, on the device;
- worlds, ecosystems, systems and stations from data files;
- the map view, the hero, the ticker and the rail;
- the preview captures.

**Its exit criteria add three:**
- a world's page is found by its own name, with its own title and image;
- the Core Web Vitals and memory budgets hold;
- a person reaches every place with the 3D off.

**Phase 1 gets:**
- Jarvis;
- the signals: heat with calls, routes, new realms, "first to chart" and "first words";
- realm calls from cards, with the on-chain activity in rooms;
- uploads;
- polls and comets;
- events added by moderators;
- push notifications;
- namespace systems;
- friends on the map;
- "new here";
- routed questions.

**Phase 2 gets** satellites, with DMs and the seal as before.

The prototype stays the reference for the look and the feel until slice 2's designs replace
it (ADR-0001 §7: "our own look").

## Open questions

They follow ADR-0001's.

14. **The markets row.** Which source for GNOT, ATONE and BTC prices, or do we drop the
    prices and keep the block height?
15. **Jarvis.** Which model and host, what budget, and does translation use the same
    service?
16. **Media.** Where are uploads and the stations' videos stored, with what budget, and
    who moderates them (with question 5)?
17. **Public room archives.** Should they be indexable pages, with consent and moderation?
18. **Measurement.** Which privacy-first counter, if any, in phase 0? Counts only: no text,
    no names (product review). It also measures INP in the field.
19. **Curation.** Who curates the stations, the expedition's live stops, the news and the
    weekly report?
20. **Satellites.** Price, moderation and legal exposure (with question 5).

## References

- [The prototype, its videos and its reviews](../docs/prototype/README.md)
- [ADR-0001](0001-gnoworld.md)
- React Router, [pre-rendering](https://reactrouter.com/how-to/pre-rendering)
- The architecture: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- The design system: [docs/DESIGN-SYSTEM.md](../docs/DESIGN-SYSTEM.md)
- The backlog: [docs/plans/backlog.md](../docs/plans/backlog.md)
