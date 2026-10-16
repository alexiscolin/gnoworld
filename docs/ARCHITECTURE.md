# Architecture

How the code is laid out, which way dependencies point, and the rules that keep it fast,
safe and leak-free. The decisions behind it are in [ADR-0001](../adr/0001-gnoworld.md) §12–14
and [ADR-0002](../adr/0002-validated-prototype.md).

## The pieces

```
Browser: the static client (React Router 8, pre-rendered pages, one three.js scene)
  ├─ Ergo over WebSocket .................. rooms, history, presence (IRCv3)
  ├─ gno.land RPC ......................... free reads: vm/qrender, vm/qeval, vm/qfile, vm/qpaths
  ├─ indexer.gno.land (graphql-ws) ........ chain events, live (phase 1)
  ├─ Adena (extension) .................... the login signature; signed calls (phase 1)
  ├─ the Go binary ........................ login for Ergo (phase 0); signals, maybe Jarvis (phase 1)
  └─ the media service .................... uploads (phase 1, ADR-0002 §5)
```

The client is a static site. Anyone can host it, and it never holds a secret.

## Repository layout

```
app/                         the web client
  react-router.config.ts     ssr: false; prerender lists every place from data/
  data/                      hubs, ecosystems, systems, stations, events, expedition stops, quests,
                             news, bubble rules (Zod-checked at build, ADR-0002 §5)
  public/                    fonts, KTX2 textures, preview captures, generated OG images
  src/
    root.tsx                 document shell, providers, top error boundary
    routes/                  one module per URL: meta, build-time loader, the screen
    core/                    pure rules: no DOM, no React, no three, no network
    lib/                     the boundaries: Ergo client, chain reads, indexer, Adena, IndexedDB, schemas
    store/                   the one Zustand store, one slice per feature
    scene/                   three.js only: renderer, loop, flights, bodies, level of detail, labels
    ui/                      the design system: tokens, layers, components (docs/DESIGN-SYSTEM.md)
    features/                one folder per feature: chat, universe, world, realms, jarvis,
                             passport, notifications, events, search, profile
  tests/e2e/                 Playwright: journeys, axe, budgets (bundle, Web Vitals, memory)
cmd/gnoworld/                the Go binary, one role per package
r/gnoworld/                  realms (phase 1 on): a permanent store plus versioned rules (ADR-0001 §14)
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

Lint enforces it with ESLint's built-in `no-restricted-imports`, configured per folder.

| Folder | May import | Never imports |
|---|---|---|
| `core` | `core` | Anything else, and no globals (`window`, `document`, `Date.now()`: time is a parameter) |
| `lib` | `core`, Zod, the chain client libraries | React, `scene`, `features`, `ui` |
| `store` | `core`, `lib` types | React, `scene`, `features` |
| `scene` | `core`, `store` (read and subscribe), three, camera-controls, GSAP | React, `features`, `ui` |
| `ui` | `ui` | `features`, `scene`, `store`, `lib` |
| `features/x` | `ui`, `core`, `lib`, `store`, another feature's `index.ts` | Another feature's files |
| `routes` | `features`, `ui`, `lib` (build-time loaders), `store` (to set the place) | `scene` directly: the canvas is mounted by the universe feature |

This is ADR-0001 §12's split, kept: a bug is either in the scene or in the interface, and
the store is where they meet.

## State

| Kind | Lives in | Read by |
|---|---|---|
| Where you are, what is selected, panels open | The store (`store/`), and the URL for the place | React with `useStore(selector)`; the scene with `store.subscribe(selector, fn)` |
| Chain and service data | TanStack Query. The key is the request; events from the indexer invalidate it | React |
| Live rooms | The store's chat slice, fed by `lib/ergo` | React; the scene for bubbles and heat |
| Device data: passport, saved, drafts, follows | IndexedDB through `lib/storage`, Zod on read | The store at start, written back on change |
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
  (ADR-0002 §6, item 4 checks the setup).
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

## The scene

- One `WebGPURenderer` with its WebGL2 fallback. One render loop.
- It renders on demand:
  - 60 fps while travelling;
  - 30 fps idle;
  - nothing when the page is hidden or the chat is full screen;
  - no idle orbit under reduced motion (ADR-0001 §12).
- Bodies are instanced. Textures are KTX2. The pixel ratio is capped at 2.
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

- [ ] **CSP:** no inline script, no `eval`, `connect-src` limited to the hosts above, and
      JSON-LD allowed by hash.
- [ ] **Markdown** becomes DOM nodes from an allowlist (bold, italic, underline, strike,
      code, block, lists, quote, links, mentions). Nothing from data reaches `innerHTML`.
- [ ] **Links and media:**
  - https only;
  - media from an allowlist of hosts;
  - links open with `rel="noopener noreferrer"`.
- [ ] **Zod** at every boundary: Ergo, RPC, indexer, data files, IndexedDB.
- [ ] **Realm text, rendered pages and messages are untrusted**, for Jarvis too
      (ADR-0002 §4).
- [ ] **Calls are signed in Adena only**, after an inline preview, with ADR-0001 §11's
      warnings. Nothing is sent from sample data.
- [ ] **No secret in the client.** Services rate-limit by account and by address.
- [ ] **Dependencies:** locked, audited in the gate, and every new one asked for
      (CLAUDE.md).

## Search and pages

- `react-router.config.ts` lists the places from `data/`. In phase 1, `r/gnoworld/hubs`
  is read at build time.
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
| Lighthouse SEO and accessibility | 100 | ADR-0002 §7 |
| The PWA installs and updates explicitly | — | ADR-0001 §12 |
| Unused code, exports and dependencies | 0 | ADR-0002 §7 |

## Naming

- Components: `PascalCase.tsx`, one per file, named exports. Route modules default-export
  their screen, as React Router requires.
- Hooks: `useThing.ts`. Slices: `thingSlice.ts`. Tests: next to the code, `*.test.ts(x)`.
- CSS Modules next to their component, `Thing.module.css`.
- Code, comments and commits in English (CLAUDE.md).
