# Architecture

How the code is laid out, which way dependencies point, and the rules that keep it fast,
safe and leak-free. The decisions behind it are in [ADR-0001](../adr/0001-gnoworld.md) §12–14
and [ADR-0002](../adr/0002-validated-prototype.md).

## The pieces

```
Browser: the static client (React Router 8, pre-rendered pages, one three.js scene)
  ├─ Ergo over WebSocket .................. rooms, history, presence (IRCv3)
  ├─ gno.land RPC ......................... free reads: vm/qrender, vm/qeval, vm/qfile, vm/qpaths
  ├─ markets.json ......................... prices, written every 5 minutes by the server's timer
  ├─ indexer.gno.land (graphql-ws) ........ chain events, live
  ├─ Adena (extension, `window.adena`) .... the login signature; calls the user signs (desktop only)
  ├─ server (TypeScript on Node) ......... login for Ergo and linked accounts, moderation (the bot's and the owners'), search, link cards,
  │                                        the activity API, signals, prices, the worlds' rollup (people, tokens, network, calls),
  │                                        the realms' explanations, the admin API (Jarvis's settings)
  ├─ jarvis (its own image) ............... Jarvis, translation; reached through the server alone; reads chains through its reader
  │    └─ jarvis_reader (its own image) ... gnomcp alone, no secret; jarvis's only way to a node
  └─ link_reader (its own image) .......... a public page's head and picture for a link card; reached through the server alone
```

The client is a static site. Anyone can host it, and it never holds a secret. The services
export OpenTelemetry to whatever backend ops chooses: Grafana in the demo, Langfuse Cloud
for Jarvis from phase 1 (ADR-0002 §5, §7).

## Repository layout

**One monorepo.** The client, the admin console, the server, the shared packages, the realms
and the deployment live in one repository, with one lockfile and one gate:
- each of `app/`, `server/`, `jarvis/`, `link-reader/`, `packages/core`, `packages/ui`, `packages/schemas`,
  `packages/service` and `packages/chain` is a workspace: the applications at the root, the libraries
  they import under `packages/`;
- a workspace imports another only through its `package.json` name (`@gnoworld/core`,
  `@gnoworld/schemas`), never by a relative path across folders;
- no build orchestrator: each workspace has its own scripts, which `scripts/check.sh` runs for what a commit touches
  and GitHub's gate (`.github/workflows/gate.yml`) for a pull request, with the realms and the Go reference client;
- a change that spans the client and the server lands in one commit, tested together;
- the admin console (`admin/`, not built yet) will stay in the monorepo; it is hidden on the network, never by splitting the repo
  (ADR-0002 §6);
- the repository is private, but nothing relies on that: no secret ever lives in the code,
  and every protection holds as if the code were public.

```
app/                         the web client
  react-router.config.ts     ssr: false; prerender lists every place from data/
  data/                      universes, hubs, ecosystems, the Earth's orbit and rooms, genres, events, expedition stops, quests,
                             news, on-air, bubble rules (Zod-checked at build, ADR-0002 §7)
  public/                    the manifest, the icons, WebP textures (`textures/`) and the worlds' pictures (`world-pictures/`)
  src/
    root.tsx                 document shell, providers, top error boundary
    routes/                  one module per URL: meta, build-time loader, the screen; `routes/plate/` builds a place's plate (hero, talk bar,
                             figures, calls, who calls, what it can do, tokens, around it) from one model for the Earth, a hub and a realm
    meta.ts                  each page's title, description, canonical and Open Graph tags
    lib/                     the boundaries: Ergo client, the realm reads around `@gnoworld/chain` (`lib/chain`,
                             with evalCall's checks), the server's routes (`lib/api`), Adena (`lib/adena`), what the device keeps
                             (`lib/keep`, `lib/drafts`: the browser's `localStorage`, each field through its schema); they parse with
                             `@gnoworld/schemas` and apply `@gnoworld/core`
    store/                   the one Zustand store, one slice per feature, kept here: the store imports
                             no feature (`store/login.ts`); React reads it through `storeContext.tsx`
    space/                   three.js only: renderer, loop, flights, the cosmos, the
                             planets (`planet/`, `earth/`, `parts/`, `shaders/`), the rig, level of detail, labels
    sw/                      the service worker, and the page's side of it (ADR-0001 §12)
    features/                one folder per feature: chat, universe, home, world, realms, jarvis, explain (a realm's or world's
                             explanation), calls (the call card), passport, quests, expedition, follow, notifications, events, search (the
                             palette and the chat's search), previews (a realm's capture), names, account, login (with its Get started
                             dialog), welcome, share, settings, credits, list; update (the new version's notice) and errors (the one
                             error view and every route's boundary). The chat holds the composer (on Lexical, loaded with it alone) and
                             the cards under a line (link, market, trending, proposals, call detail, person, Jarvis's)
  tests/e2e/                 Playwright: journeys, axe, budgets (bundle, Web Vitals, memory)
packages/core/               pure rules, shared by app, admin and server: no DOM, no React, no network
packages/ui/                 the design system: tokens, layers, compositions, components, Storybook
                             (docs/DESIGN-SYSTEM.md); shared by app and admin
packages/schemas/            Zod schemas for every boundary, shared the same way
packages/service/            what the server and Jarvis share, on Node: settings, db, log, net (the one way out)
packages/chain/              every read of a chain's node or the indexer, for app, server and Jarvis: the capped
                             GET, the read through a schema, the node's reads with its universe check, the indexer's
server/                      the server: TypeScript on Node (ADR-0002 §7); `roles.json`, the roles file (3g)
  src/                       `main`, `app`, `config`, `limit`, `visitor`, `flights` (a read's bounded flights), then one folder per role:
                             login/ (the login, `links` linked accounts, `linkRoutes`, `cliProof`, `release`), ergo/ irc/ rooms/ guest/
                             (guests who speak with no account) pins/ moderation/ (the bot's and `/api/moderation/hide`, `/mute`),
                             roles/ (the roles file, `owners` and `mayModerate`, the owner's right), stream/ activity/ retention/ testing/,
                             search/ (the index, `/api/search`), cards/ (the link cards' flow, store, routes, retention), prices/
                             signals/ previews/ calls/ (`/api/calls`, a call's detail), worlds/ (the worlds job: rollup, trending,
                             people at `/api/people`, tokens at `/api/tokens`, the network line at `/api/network`), explain/ (the realms'
                             and worlds' explanations, `/api/explanations`, with the seed shipped in `onyxSeed.json`), jobs/ (the timed
                             jobs made at start) and door/ (Jarvis's door, its quotas, its kept answers in `kept.ts`, its admin API)
link-reader/                 the link reader (its own workspace and image): it imports `core` and `schemas` alone, so no
                             `server`, `jarvis`, `chain`, `service` or app; it holds the SSRF rules (`address.ts`, `url.ts`, `transport.ts`,
                             `fetch.ts`), the page's head (`head.ts`), the picture's decode and resize (`picture.ts`) and the card (`card.ts`)
jarvis/                      Jarvis (its own workspace and image): it imports nothing of server/
  src/                       the loop, its locks, limits, checks and tools; testing/, its fakes
  skills/                    Jarvis's skills, one SKILL.md folder each, read by its loader only (ADR-0002 §5)
evals/                       Jarvis's evals (10j): promptfoo apart from the workspace, its own lockfile; cases/ plain JSON,
                             chains/ the recorded realms, provider.ts through jarvis's real entry; never in an image
deploy/                      compose.yaml (the demo stack, the reference wiring for ops), .env.example; jarvis/ its image
                             and gnomcp's read-only profiles, jarvis-reader/ gnomcp's container, link-reader/ the reader's image,
                             egress/ one smokescreen list per way out (the server's, jarvis's, its reader's, the link reader's)
admin/                       not built yet: the admin console, on its own origin (ADR-0002 §6), reusing ui and lib
gno/r/                       the realms: `seal` and `satellite` (the slot realm); hubs and profiles come later (ADR-0001 §14)
gno/tools/                   Go tools around the chain (`sealvec`)
```

Inside a feature:

```
features/chat/
  index.ts                   the feature's public surface; nothing else is imported from outside
  ChatDock.tsx               components, one per file, named exports
  ChatDock.module.css        its styles, next to it
  useRoom.ts                 hooks
  *.test.ts                  Vitest, next to what it tests
```

## Which way dependencies point

Lint enforces it per folder, one part of `eslint.config.ts` per area in `lint/`: `core` (`lint/core.config.ts`), `app`'s folders, `sw`, `features`,
`routes`, `lib`, `store` and the scene (`lint/app.config.ts`), `ui` (`lint/react.config.ts`), and `jarvis`, `service`, `link-reader` and `chain` (`lint/server.config.ts`,
`lint/chain.config.ts`), each wall proven by `scripts/probe.py`'s `walls` block.
The scene's folder is `space/`, but `lint/app.config.ts` still names `app/src/scene`: until it names `space/`, the `space` wall below is
kept by review alone.

| Folder | May import | Never imports |
|---|---|---|
| `core` (`packages/core`) | `core` | Anything else, and no globals (`window`, `document`, `Date.now()`: time is a parameter) |
| `lib` | `core`, Zod, the chain client libraries | React, `space`, `features`, `ui` |
| `store` | `core`, `lib` types | React, `space`, `features` |
| `space` | `core`, `store` (read and subscribe), three, GSAP | React, `features`, `ui` |
| `ui` | `ui` | `features`, `space`, `store`, `lib` |
| `features/x` | `ui`, `core`, `lib`, `store`, `sw` (the update notice), another feature's `index.ts` | Another feature's files |
| `sw` | `sw` | Anything else: the worker runs alone, before the page |
| `server` | `core`, `schemas`, `service`, `chain`, Node's built-ins, its framework | React, `space`, `ui`, `features`, `jarvis`, `link-reader` |
| `jarvis` | `core`, `schemas`, `service`, `chain`, Node's built-ins, its dependencies | `server`, `link-reader`, React, `space`, `ui`, `features` |
| `link-reader` | `core`, `schemas`, Node's built-ins, its decoders and parser | `server`, `jarvis`, `chain`, `service`, the app: it holds nothing of the stack's |
| `service` (`packages/service`) | `core`, `schemas`, Node's built-ins | `server`, `jarvis`, the app, `chain`, React |
| `chain` (`packages/chain`) | `core`, `schemas`, the browser's `fetch` (which Node has too) | `server`, `jarvis`, the app, React, the store; a read's words anywhere else (D113) |
| `routes` | `features`, `ui`, `lib` (build-time loaders), `store` (to set the place) | `space` directly: the canvas is mounted by the universe feature |

This is ADR-0001 §12's split, kept: a bug is either in the space or in the interface, and
the store is where they meet.

## TypeScript

Fully typed, safe, and easy to find your way in. The compiler and lint enforce what they
can; review checks the rest.

**The compiler** (`tsconfig.json`): `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`,
`verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly` and
`allowImportingTsExtensions` with `noEmit` (imports name their `.ts` file; nothing is compiled): Node runs the server's TypeScript directly, so only
syntax it can erase is allowed (no enums, no namespaces with code, no parameter
properties).

**Lint:** typescript-eslint's `strict-type-checked` and `stylistic-type-checked` (they
already refuse a floating or misused promise, a thrown non-error and an untyped `catch`
value), plus `switch-exhaustiveness-check`; ESLint's `no-empty`, `no-useless-catch` and
`preserve-caught-error` (a rethrow keeps its `cause`), and a `catch` that only logs; the
import boundaries above; no import cycles (`eslint-plugin-import-x`). **Copies:** jscpd fails the gate on a new copied block, including a function copied with its names changed or a line added (its `similarity`
option compares syntax trees). **One way to
do each thing,** enforced per folder by `no-restricted-globals` and `no-restricted-syntax`:
`fetch` and storage only in `lib`, and in `sw` only `fetch` and the cache (the worker fetches and caches;
its page side asks whether the host answers, F351), a read of a chain's node or the indexer only in
`packages/chain`, however it is written (`gnoworld/chain-read`, D113), `Intl` formatting only in `core`'s formatters, no clock
in `core`, `console` only through the logger, no `Map`, `WeakMap` or `Set` at a module's top in `server/src` or a
package's `src` (F412). **Dead code:** knip, at zero.

**Types carry the meaning:**
- **No `any`, no `@ts-ignore`, no `!`, and no `as` on outside data** (CLAUDE.md). `satisfies`
  checks literal tables and configs; `as const` keeps them literal.
- **Outside data has one schema.** Each boundary's Zod schema lives in `packages/schemas`,
  and its type is `z.infer` of it: one source, never a hand-written twin. `lib` parses with
  it.
- **Branded types for ids and units,** made only by their parser: `WorldId`, `RoomName`,
  `Address`, `BlockHeight`, `Ugnot`. A room name can never be passed where an address is
  expected, nor ugnot where GNOT is.
- **States are discriminated unions,** switched on exhaustively with an `assertNever`: a
  connection, a call card's four steps, a digest's blocks. A missing case fails to compile.
- **Readonly by default:** `readonly` properties and `ReadonlyArray` in `core` and in the
  store's public types.
- **Expected failures are values.** A `lib` function that can fail for a known reason (a
  refused call, a node that does not answer, a schema mismatch) returns a typed result
  (`{ ok: true, value } | { ok: false, error }`). Exceptions are for bugs only.
- **Time, randomness and I/O are parameters in `core`,** so every rule is a pure function
  with a test.

**Files that read well:**
- One concept per file, named after what it exports. A file past about 300 lines is split.
- Named exports only, except route modules (React Router). No barrel files, except each
  feature's `index.ts`, its public surface.
- Imports by package name across workspaces (`@gnoworld/core`, `@gnoworld/schemas`) and by
  `#` subpath imports inside one (`#lib/adena`), with `import type` for types. Never tsconfig
  `paths`: Node ignores them.
- Functions are verbs (`pickBubbles`, `placeSystems`), types are nouns, booleans read as
  questions (`isLive`, `hasDigest`). No abbreviations a newcomer would have to guess.
- Exported functions in `core` and `lib` carry a one-line TSDoc: what it returns and when it
  fails. Comments say why, never what.
- Classes only where an object owns a lifecycle (a scene part and its disposer); elsewhere,
  functions and plain data.

## State

| Kind | Lives in | Read by |
|---|---|---|
| Where you are, what is selected, panels open | The store (`store/`), and the URL for the place | React with `useStore(selector)`; the scene with `store.subscribe(selector, fn)` |
| Chain and service data | TanStack Query. The key is the request; events from the indexer invalidate it | React |
| Live rooms | The store's chat slice, fed by `lib/ergo` | React; the scene for bubbles and heat |
| Device data: passport, saved, drafts, follows, settings | The device's `localStorage` through `lib/keep` and `lib/drafts`, Zod on read | The store at start, written back on change |
| The canonical place | The URL (ADR-0002 §2) | The router puts it in the store, and the scene flies there |

Rules:
- **One source per fact.** Derived values are computed, never stored. For example, a
  world's heat comes from presence and calls, and is not saved beside them.
- **Outside data goes through Zod once, in `lib`.** Past `lib`, types are trusted.
- **No `as` on outside data**, and no `any` (CLAUDE.md).

## Data flow, two examples

**A message arrives.**
1. `lib/ergo` gets a line on the socket, and `core/irc` parses it.
2. Zod validates it, and the chat slice appends it.
3. React renders the list, windowed for long histories.
4. The scene, subscribed to the slice, asks `core/pickBubbles` which bubbles to show.

**You open a world.**
1. A link to `/w/bubble`, or a click on the planet that navigates there.
2. The route loader, pre-rendered at build time, already gave the world's text.
3. The router sets the place in the store.
4. The scene flies the camera there.
5. The chat joins the world's main room.
6. Back, `Esc` and the breadcrumb are history moves.

**A link gets its card** (slice 13, `docs/plans/link-previews.md`; off unless `LINK_CARDS=1`).
1. A line passes the bot's check and reaches `cards/flow.ts`, which finds its first https link.
2. The server asks the link reader, `POST /card {url}` and nothing else: no cookie, no account, no room.
3. The reader fetches the page through its own way out (`egress_links`), 256 KiB and 5 s at most, three redirects at most, public
   hosts only; it reads the head, decodes and shrinks the picture, and answers a card or `422 {error}`.
4. The server checks the card's text and picture in one call with the same moderation provider; a card that has not passed never
   exists. It stores the page once (a day for a card or a refusal) and ties each line to it by key, never by its text.
5. The stream tells the line its card; the app draws `LinkCard` (a chunk of its own) and loads its picture from `/api/cards/<key>/picture`
   unless the reader saves data. A REDACT, an edit or the author's or a moderator's removal takes the card away.

**A search** (`docs/plans/search.md`). The chat's search is the server's: `search/index.ts` keeps the lines moderation let through
(2,048 a room, 90 days, SQLite full text) and drops a line with its REDACT. `GET /api/search` answers one world's rooms for the reader
alone, asking the room's right again on every page; a members or hidden room is never in it. The palette (⌘K) finds places on the device.

**An owner moderates** (`docs/plans/owners-moderation.md`). The owner of a world is the account (or one linked to it) that holds its
namespace on the default chain (`roles/owners.ts`, read by the server and kept 60 s). `roles/mayModerate.ts` is the one place that gives
the right; `POST /api/moderation/hide` and `/mute` and the pins ask it, then use the bot's own means. Accounts join one identity through
`/api/links` (a code, then the other account's proof, from Adena or by a command-line signature rebuilt server-side, `login/cliProof.ts`);
a key linked by phishing is released by its own file (`login/release.ts`).

## React

- React 19 with the React Compiler: no hand-written `memo`, `useMemo` or `useCallback`
  (ADR-0002 §8).
- **Effects only synchronize with something outside React:**
  - the socket;
  - the scene;
  - a media query;
  - the device's storage.

  Each returns its cleanup. Derived state is computed during render, never set in an
  effect.
- **Server data comes from TanStack Query,** never from `useEffect` with `fetch`.
- **Each route has its own error boundary and suspense fallback.** Every failure is sorted into one kind (not found, gone, forbidden,
  too many requests, offline, unavailable, new version, crash, `features/errors/kind.ts`) and drawn by one view in three sizes (the page, the
  place, inline in a card); a route's boundary is the shared `RouteError`. The 3D chunk is loaded
  lazily after the text, so its failure never blanks a page.
- **Lists:**
  - stable keys;
  - the chat history windowed, so ten thousand lines cost what fifty do;
  - HTML labels on the scene pooled and reused.
- **Forms** use the platform: `<form>`, `<button type="submit">`, native validation where
  it fits.
- **Composable before configurable.** Many small components that fit together, not few
  big ones with many switches:
  - content goes in through `children` and named slots, not through text and boolean props;
  - a widget with parts is a compound component (`<Dialog>`, `<Dialog.Title>`,
    `<Dialog.Actions>`), its parts sharing state through a context of their own;
  - one `variant` prop, a union type, instead of several booleans that can contradict;
  - logic lives in hooks without markup (`useRoom`, `useFlight`), so the same behaviour
    can wear another look;
  - every `ui` component works alone: Storybook renders it with no store, no network
    and no feature around it;
  - features build screens from `ui` and their own small parts; a second look for the same
    thing is a new variant of the component, never a copy.
- **Sizes that lint holds** (ESLint's own rules): a file under 200 lines, a function under
  80, a cyclomatic `complexity` of 10 at most, a nesting depth of 3, three parameters at
  most (more go in one object). Past these, the code splits into parts that compose.

## The scene (`app/src/space/`)

- One `WebGLRenderer` (ADR-0002 §10). One render loop.
- It draws a frame only when the frame would differ from the last (`space/redraw.ts`; ADR-0002 §9, rendering):
  - 60 Hz at most, 30 where the window has no focus (`space/pace.ts`);
  - a still view with something moving on it by itself (a planet's turn, a sun's face) draws at 15 Hz;
  - a view with nothing moving sleeps, with a heartbeat every 2 s (`space/rest.ts`);
  - nothing when the tab is hidden or an opaque view covers the scene;
  - no idle motion under reduced motion or "Reduce animations".
- The pixel ratio is the screen's, 2 at most on desktop (a Retina screen is drawn sharp) and 1 on touch; the Low setting takes 1, and 0.8 on
  touch (`core/frame/device.ts`). It steps down by itself where the frames miss their beat unevenly over 3 s, and back up after 30 s of frames
  that keep up (`space/pace.ts`).
- Bodies are instanced, static meshes merged per material. Textures are WebP. Shaders are
  compiled before a flight arrives. Generation runs in workers.
- Each part (a world, a station, the belt, the labels) registers what it creates with one
  disposer. Leaving disposes everything it registered: geometry, material, texture, render
  target, listener.
- The camera stays at the origin and the world comes to it (slice 7 §5): the eye is a position in doubles, and the GPU gets only what
  remains of it, so a far coordinate is as steady as home.
- The scenery (`core/space`, drawn by `space/`) is computed from a position and tied to no data (ADR-0002 §10): the mood is a smooth field,
  a cell's stars come from its hash, and both sit in tori of cells that follow the eye, so a step writes only what entered. The sky is
  marched at half the buffer's size a side, shows through the image's one grade (`space/renderer.ts`), and is added to the stage's black.
- What runs on a frame makes nothing: `ON_A_FRAME` in `lint/shared.config.ts` holds it by name, in the scene and in core's `frame` and
  `space`; a function a frame reaches joins that list as it is written.
- The planets carry their depth (D13993): relief shadows from a height map near the terminator (the Earth and the Moon from real maps, a
  light version on generated worlds), a sea mask, ambient occlusion, rings that turn faster inside than outside; every effect is off
  under Low. The Earth shows the real hour (D13947): its sun stands over the place where it is noon now, from UTC (`space/earth/light.ts`).
- Text is HTML anchored to the scene (ADR-0001 §7), never 3D geometry.
- A page that shows space calls `useSpace` (`features/universe`). That door is all it holds of the scene: the universe comes after the
  text, in a React root of its own that outlives the route, so leaving covers the scene and the way back finds it. three is in the
  `scene` chunk, which the worker does not precache: a phone fetches it on "View in space". A test build (`VITE_GNOWORLD_TEST_GPU`, the
  journeys') lets `?test-gpu` pass the software GPU the gate has; a production build holds no trace of it.
- A page asks for the Earth with `useSpace("earth")` and keeps an empty `[data-globe]` box, laid out by its own stylesheet: the host
  measures it and the scene stands the globe in that circle, so a breakpoint moves the planet with what is around it. The box's
  `data-earth` says how far it came: `loading` keeps the box's room, `drawn` opens the plate's mask round it, for the opaque canvas lies under the plate.
- A development or test-GPU build sets `__gnoworldSpace` (the engine, with
  `portraits`, the picture tool's entry: `features/universe/spaceHook.ts`); a production build holds no trace of it.

## Memory: the checklist

Each slice that adds a resource proves it is released:

- [ ] Every `addEventListener` passes `{ signal }` from an `AbortController` that is aborted
      on cleanup.
- [ ] Every `fetch` and socket is aborted on unmount; TanStack Query does this for its own
      requests.
- [ ] Every `setInterval` and `setTimeout` is cleared; every `requestAnimationFrame` goes
      through the scene's single loop.
- [ ] Every `URL.createObjectURL` is revoked.
- [ ] Every `<video>` pauses and drops its `src` when off screen.
- [ ] Every three.js object is registered with its part's disposer.
- [ ] Store subscriptions from the scene are unsubscribed on dispose.
- [ ] The gate's memory run: 20 flights there and back. Afterwards `renderer.info.memory` is
      at its baseline, and the JS heap is within 10% (Playwright, `performance.memory` in
      Chromium).

## Security: the checklist

- [ ] **CSP:** no inline script, no `eval`, `connect-src` limited to the hosts above,
      `frame-src` limited to the accepted embed services, and JSON-LD allowed by hash.
- [ ] **Markdown** becomes DOM nodes from an allowlist (bold, italic, strike, underline, code,
      block, lists, quote, links, mentions). Nothing from data reaches `innerHTML`.
- [ ] **Links and media:**
  - https only;
  - embeds only from the accepted services (ADR-0002 §6), shown once the moderation check
    passes;
  - links open with `rel="noopener noreferrer"`.
- [ ] **Zod** at every boundary: Ergo, RPC, indexer, data files, the device's storage.
- [ ] **Realm text, rendered pages and messages are untrusted**, for Jarvis too
      (ADR-0002 §5).
- [ ] **Calls are signed in Adena only**, after an inline preview, with ADR-0001 §11's
      warnings. Nothing is sent from sample data.
- [ ] **No secret in the client.** The Claude and OpenAI keys live only in their services,
      which rate-limit by account and by address.
- [ ] **Dependencies:** locked, audited in the gate, and every new one asked for
      (CLAUDE.md).
- [ ] **The login** (`server/src/login/`, tier 1; slice 3's 3c, and 3d's ticket):
  - a nonce or a ticket is spent by one statement before the first `await`, and the request
    goes on only if it removed a row;
  - the verifier gets the signer, the chain and the text the server stored, never the
    client's, all three required;
  - a token or a ticket is 256 random bits, stored as its SHA-256 only, never logged, never in
    a body; the cookie is `__Host-`, HttpOnly, Secure, SameSite=Strict;
  - every request but GET and HEAD comes from a listed `Origin` and in JSON; each visitor's
    calls are limited before any work; every failed login gets the same answer.

- [ ] **The link reader** (`link-reader/`, `deploy/link-reader/`; slice 13; it fetches what strangers link):
  - its container holds no secret, no volume, a read-only root, a user of its own, and two networks: one it shares with the server alone,
    one to its way out; the stack's other services reach neither (`deploy/test-links.sh` proves each, with its mutants);
  - it has no DNS of its own: `egress_links` resolves each name and refuses a private answer, the guard's rules refuse every private
    range on each packet, and the reader refuses a non-global address itself (`address.ts`), so three layers hold, not one;
  - https only, port 443, three redirects, a page 256 KiB and a picture 1 MiB, 5 s each, a picture at 2,000,000 px at most, one
    picture decoded at a time; its answer is a schema-checked card, read by the server up to a cap before it is parsed;
  - a card exists only after its text and picture passed moderation in one call, and the page is shown from the server's own copy,
    never fetched by a visitor's browser (a visitor's address never reaches the page's host).
- [ ] **Search never shows what its reader cannot read:** the right to the room is asked again on every page (`search/routes.ts`), a
  members, hidden or archived room is empty, and a REDACT, an expiry or the room's cap removes the line (FTS5's `secure-delete`).
- [ ] **Linked accounts and the owner's right** (`login/links.ts`, `roles/mayModerate.ts`; tier 1): a link code is a nonce of its own kind,
  spent by one statement; the signed text names every account the link joins; the namespace comes from the server's tables and the
  chain, never from a request; each moderation act is logged with the acting account and the owner.
- [ ] **Kept answers** (`door/kept.ts`): only an `answered` is kept; a function's explanation reads code alone (no room lines, no live
  tool), so it can be shared across rooms; a part of a key is validated before it exists.

## Search and pages

- `react-router.config.ts` lists the places from `data/`. In phase 1, `r/gnoworld/hubs`
  and the signals are read at build time. Only planets are pre-rendered; dust uses the
  fallback and is `noindex` (ADR-0002 §3).
- Search is one palette (`features/search`, D355), a chunk of its own: ⌘K, `/`, the header's button, the rail's
  "See all" and `/list` (which goes to `/#search`) open it. `searchIndex.ts` indexes the site's places and the
  worlds' file's systems and realms (and the functions each realm exports) once; `search.ts` answers a keystroke with the best 50 and the count. The
  palette's empty field is Discover (`search/discover`): shelves, cards and a realm's detail. What was said in a room is the server's search (`search/`, above), which the
  palette hands a query to (`handOff.ts`, `chatItems.ts`, `filters.ts`).
- Each route exports its `meta`: title, description, canonical, Open Graph, Twitter Card
  and JSON-LD.
- A build step writes `sitemap.xml` and `robots.txt`; a page's Open Graph tags carry no image yet (`docs/plans/share-image.md`).
- The host serves the pre-rendered file, or `__spa-fallback.html` for the device-only
  paths.

## Budgets the gate checks

| Budget | Limit | Where |
|---|---|---|
| JavaScript before the first usable screen | 150 KB compressed | ADR-0001 §12 |
| Total on mobile | 3 MB | ADR-0001 §12 |
| LCP, CLS, TBT (the lab stand-in for INP) on a mid-range mobile profile | 2.5 s, 0.1, 200 ms | ADR-0002 §2. INP itself is measured in the field |
| Frames while travelling | 60 fps on a mid-range phone | ADR-0001 §12 |
| Memory after 20 flights | GPU resources at baseline, JS heap within 10% | Above |
| Lighthouse SEO and accessibility | 100 | ADR-0002 §9 |
| The PWA installs and updates explicitly | — | ADR-0001 §12 |
| Unused code, exports and dependencies | 0 | ADR-0002 §9 |

## Naming

- Components: `PascalCase.tsx`, one per file, named exports. Route modules default-export
  their screen, as React Router requires.
- Hooks: `useThing.ts`. Store slices: `store/thing.ts`. Tests: next to the code, `*.test.ts(x)`.
- CSS Modules next to their component, `Thing.module.css`.
- Code, comments and commits in English (CLAUDE.md).
