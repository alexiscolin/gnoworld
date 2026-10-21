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
  ├─ PostHog, EU cloud .................... counts only, cookieless (ADR-0002 §6)
  ├─ indexer.gno.land (graphql-ws) ........ chain events, live
  ├─ Adena (extension, `window.adena`) .... the login signature; calls the user signs (desktop only)
  ├─ server (TypeScript on Node) ......... login for Ergo, moderation and the activity API, signals, prices, the admin API
  └─ jarvis (same image) .................. Jarvis, gnomcp as a child process, translation
```

The client is a static site. Anyone can host it, and it never holds a secret. The services
export OpenTelemetry to whatever backend ops chooses: Grafana in the demo, Langfuse Cloud
for Jarvis from phase 1 (ADR-0002 §5, §7).

## Repository layout

**One monorepo.** The client, the admin console, the server, the shared packages, the realms
and the deployment live in one repository, with one lockfile and one gate:
- each of `app/`, `admin/`, `server/`, `packages/core`, `packages/ui` and `packages/schemas` is
  a workspace: the applications at the root, the libraries they import under `packages/`;
- a workspace imports another only through its `package.json` name (`@gnoworld/core`,
  `@gnoworld/schemas`), never by a relative path across folders;
- no build orchestrator: each workspace has its own scripts, and `scripts/check.sh` runs
  them all, with the realms and the Go reference client;
- a change that spans the client and the server lands in one commit, tested together;
- `admin/` stays in the monorepo; it is hidden on the network, never by splitting the repo
  (ADR-0002 §6);
- the repository is private, but nothing relies on that: no secret ever lives in the code,
  and every protection holds as if the code were public.

```
app/                         the web client
  react-router.config.ts     ssr: false; prerender lists every place from data/
  data/                      universes, hubs, ecosystems, stations, events, expedition stops, quests,
                             news, bubble rules (Zod-checked at build, ADR-0002 §7)
  public/                    fonts, KTX2 textures, preview captures, generated OG images
  src/
    root.tsx                 document shell, providers, top error boundary
    routes/                  one module per URL: meta, build-time loader, the screen
    meta.ts                  each page's title, description, canonical and Open Graph tags
    worlds.ts                the worlds slice 1 pre-renders, until data/ holds them (slice 5)
    lib/                     the boundaries: Ergo client, chain reads, indexer, Adena (`lib/adena`), IndexedDB;
                             they parse with `@gnoworld/schemas` and apply `@gnoworld/core`
    store/                   the one Zustand store, one slice per feature
    scene/                   three.js only: renderer, loop, flights, bodies, level of detail, labels
    sw/                      the service worker, and the page's side of it (ADR-0001 §12)
    features/                one folder per feature: chat, universe, world, realms, jarvis,
                             passport, notifications, events, search, profile, settings; today
                             update (the new version's notice) and errors (a page that failed)
  tests/e2e/                 Playwright: journeys, axe, budgets (bundle, Web Vitals, memory)
packages/core/               pure rules, shared by app, admin and server: no DOM, no React, no network
packages/ui/                 the design system: tokens, layers, compositions, components, Storybook
                             (docs/DESIGN-SYSTEM.md); shared by app and admin
packages/schemas/            Zod schemas for every boundary, shared the same way
server/                      the server: TypeScript on Node (ADR-0002 §7), one folder per role
  login/ moderation/ signals/ prices/ admin/
  jarvis/                    the harness, its skills (SKILL.md folders) and its evals
deploy/                      compose.yaml (the demo stack, the reference wiring for ops), .env.example
admin/                       the admin console, on its own origin (ADR-0002 §6): reuses ui and lib
gno/r/gnoworld/              realms: the slot realm (phase 0), then hubs and profiles; a store plus versioned rules (ADR-0001 §14)
```

Inside a feature:

```
features/chat/
  index.ts                   the feature's public surface; nothing else is imported from outside
  ChatDock.tsx               components, one per file, named exports
  ChatDock.module.css        its styles, next to it
  useRoom.ts                 hooks
  chatSlice.ts               its store slice
  *.test.ts                  Vitest, next to what it tests
```

## Which way dependencies point

Lint enforces it per folder, one part of `eslint.config.ts` per area in `lint/`: `core` and `ui`
since slice 1, `app`'s folders since 2g (F378: `sw`, `features`, `routes`); `lib`, `store` and
`scene` get theirs with the slice that makes the folder.

| Folder | May import | Never imports |
|---|---|---|
| `core` (`packages/core`) | `core` | Anything else, and no globals (`window`, `document`, `Date.now()`: time is a parameter) |
| `lib` | `core`, Zod, the chain client libraries | React, `scene`, `features`, `ui` |
| `store` | `core`, `lib` types | React, `scene`, `features` |
| `scene` | `core`, `store` (read and subscribe), three, camera-controls, GSAP | React, `features`, `ui` |
| `ui` | `ui` | `features`, `scene`, `store`, `lib` |
| `features/x` | `ui`, `core`, `lib`, `store`, `sw` (the update notice), another feature's `index.ts` | Another feature's files |
| `sw` | `sw` | Anything else: the worker runs alone, before the page |
| `server` | `core`, `schemas`, Node's built-ins, its framework | React, `scene`, `ui`, `features` |
| `routes` | `features`, `ui`, `lib` (build-time loaders), `store` (to set the place) | `scene` directly: the canvas is mounted by the universe feature |

This is ADR-0001 §12's split, kept: a bug is either in the scene or in the interface, and
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
`fetch` and storage only in `lib` and `sw` (the worker fetches and caches; its page side asks whether
the host answers, F351), `Intl` formatting only in `core`'s formatters, no clock
in `core`, `console` only through the logger. **A map for agents:** the gate regenerates
`docs/generated/exports.md`, every exported function and type with its signature, from the
TypeScript compiler; a reviewer reads the map to see the whole repo without reading it all. **Dead code:** knip, at zero.

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
- Functions are verbs (`pickBubbles`, `placeSystem`), types are nouns, booleans read as
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
| Device data: passport, saved, drafts, follows, settings | IndexedDB through `lib/storage`, Zod on read | The store at start, written back on change |
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

## React

- React 19 with the React Compiler: no hand-written `memo`, `useMemo` or `useCallback`
  (ADR-0002 §8, checks for slice 1).
- **Effects only synchronize with something outside React:**
  - the socket;
  - the scene;
  - a media query;
  - IndexedDB.

  Each returns its cleanup. Derived state is computed during render, never set in an
  effect.
- **Server data comes from TanStack Query,** never from `useEffect` with `fetch`.
- **Each route has its own error boundary and suspense fallback.** The 3D chunk is loaded
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

## The scene

- One `WebGPURenderer` with its WebGL2 fallback. One render loop.
- It renders on demand, by what happens (ADR-0002 §9, rendering):
  - 60 fps while travelling or interacting, 30 when only scenery moves, 10 after a minute
    with no input, never above 60;
  - nothing when the tab is hidden, an opaque view covers the scene, or the window is
    blurred and still;
  - no idle orbit under reduced motion or "Reduce animations".
- The low-power GPU. The pixel ratio is capped at 1.25 on desktop and 1 on touch; the Low
  tier takes 1 and 0.8. Auto drops to Low from a 2 s frame probe.
- Bodies are instanced, static meshes merged per material. Textures are KTX2. Shaders are
  compiled before a flight arrives. Generation runs in workers.
- Each part (a world, a station, the belt, the labels) registers what it creates with one
  disposer. Leaving disposes everything it registered: geometry, material, texture, render
  target, listener.
- Text is HTML anchored to the scene (ADR-0001 §7), never 3D geometry.
- `?debug` shows fps, draw calls and `renderer.info.memory`.

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
- [ ] **Markdown** becomes DOM nodes from an allowlist (bold, italic, strike, code, block,
      lists, quote, links, mentions). Nothing from data reaches `innerHTML`.
- [ ] **Links and media:**
  - https only;
  - embeds only from the accepted services (ADR-0002 §6), shown once the moderation check
    passes;
  - links open with `rel="noopener noreferrer"`.
- [ ] **Zod** at every boundary: Ergo, RPC, indexer, data files, IndexedDB.
- [ ] **Realm text, rendered pages and messages are untrusted**, for Jarvis too
      (ADR-0002 §5).
- [ ] **Calls are signed in Adena only**, after an inline preview, with ADR-0001 §11's
      warnings. Nothing is sent from sample data.
- [ ] **No secret in the client.** The Claude and OpenAI keys live only in their services,
      which rate-limit by account and by address.
- [ ] **Dependencies:** locked, audited in the gate, and every new one asked for
      (CLAUDE.md).

## Search and pages

- `react-router.config.ts` lists the places from `data/`. In phase 1, `r/gnoworld/hubs`
  and the signals are read at build time. Only planets are pre-rendered; dust uses the
  fallback and is `noindex` (ADR-0002 §3).
- Each route exports its `meta`: title, description, canonical, Open Graph, Twitter Card
  and JSON-LD.
- A build step renders one Open Graph image per world from its planet. It writes
  `sitemap.xml` and `robots.txt`.
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
- Hooks: `useThing.ts`. Slices: `thingSlice.ts`. Tests: next to the code, `*.test.ts(x)`.
- CSS Modules next to their component, `Thing.module.css`.
- Code, comments and commits in English (CLAUDE.md).
