# A shared link's image (D13934)

Draft of 2026-11-11, for Alexis's approval; nothing is built. Written by a planning agent (read-only), saved by the chief.

Sources read: D13934 and the 2026-10-17 row (Open Graph images left to later); `CLAUDE.md`, `docs/ARCHITECTURE.md` ("Search and pages" promises
"a build step renders one Open Graph image per world"; nothing does it yet), `docs/REVIEW.md`, `docs/DESIGN-SYSTEM.md` (not needed beyond
the tokens); `app/src/meta.ts`, `app/react-router.config.ts`, `app/src/prerender.ts`, `app/src/routes.ts`, `app/src/routes/world.tsx` and
its test, `app/src/features/share/ShareSheet.tsx` and `link.ts`, `app/src/space/portraits.ts` and `thumbs.ts`, `app/src/lib/worldPictures.ts`,
`app/tests/tools/planetPictures.spec.ts`, `packages/core/src/planet/{look,recipe,palette}.ts`, `packages/ui/src/Planet/Planet.tsx`,
`server/src/app.ts`, `limit.ts`, `worlds/group.ts`, `packages/schemas/src/worlds.ts`, `deploy/web/nginx.conf`, `deploy/web/Dockerfile`,
`deploy/server/Dockerfile`, `deploy/compose.yaml`, `link-reader/` and `docs/plans/link-previews.md`. One measure of my own, §2 (a
synthetic stand-in, run in a scratch folder, nothing in the repository).

## 0. What the reading found, before any plan

1. **A crawler gets a page's tags only for a page written at build.** `ssr: false`, `prerender` lists the places of `app/data/` (the
   hubs: 7 worlds today) and `/list`; any other path gets `__spa-fallback.html` with a 404 status (`nginx.conf`: `error_page 404`), whose
   tags are the generic ones. The chain's ~500 worlds (`worlds.json`, rewritten by the server's job, slice 7c) have **no `/w/<id>` page**
   (`routes/world.tsx`'s loader reads the data files alone); they live in the cosmos and as `/r/<realm>` client routes (no page written,
   `realmMeta` is `noindex`). So "automatic for every new world" has two halves, and only one is the picture: (i) the picture of any
   world id, from its seed; (ii) a link that says "use this picture" in the HTML a crawler reads. For a hub world (data file) (ii) is
   `meta.ts` at build. For a chain world there is no page to put the tag in. Q1 below.
2. **The demo is behind a password** (`nginx.conf`: `auth_basic`, `X-Robots-Tag: noindex`). No unfurler can fetch anything there: the
   feature can be built and tested on the demo but only seen working on a public host. `test.sh` can prove the route's headers and bytes,
   not a real Facebook or Slack card. I did not verify what a public host's nginx would be (ops names it, `OPERATIONS.md`).
3. **A planet's look is already pure and in core.** `worldLook(id, nature)` and `worldRecipe(id, nature)` (tier 1, `packages/core/src/planet/`)
   give, from `sha256("gnoworld/planet/v1" ‖ path)`: the anchor (one of 24 real kinds), a palette of three colours in Lab turned by the
   system's hue, `tilt`, `lean`, `rings` (inner, outer, tint, opacity), `sea`, `glow`, `rim`, the surface parameters. The shaders (GPU) then
   draw the surface; a 2D likeness needs the palette, the rings and the lighting, not the shaders. `nature` (nft, token, exchange, dao, game)
   leans the class and comes from `worlds.json` (`nature`), which the server holds: pass it, or the likeness can differ from the scene's
   for those worlds (to verify by test, §6).
4. **A world's id is safe text.** `RealmPath` is `^gno\.land/[pr]/[a-z0-9][a-z0-9_/-]*$`, so a chain world's id is `[a-z0-9_/-]` only. A
   hub's `name` ("GovDAO", "Bubble") is from our own data file, checked by Zod at build. Nothing a visitor types reaches the image.
5. **`@jsquash` is not installed in this tree.** `link-reader/package.json` names `@jsquash/jpeg` 1.6.0, `png` 3.1.1, `resize` 2.1.1, but
   there is no `node_modules` in `link-reader/` and `link-reader/src/picture.ts` is a stub ("not built"). It is a decoder and encoder
   for that service, in its own container (D184, a network of its own); the server's Dockerfile installs `--filter @gnoworld/server...`
   and carries none of it. Using it in the server is a new dependency of the server: stop-and-ask, §9.
6. **The existing build-time tool** `app/tests/tools/planetPictures.spec.ts` already takes the 7 hand-captured planets with a real
   browser (the scene's own `portraits` at 88 px, WebP) and writes `app/src/lib/worldPictures.json`. It is prior art for (b).
7. **`world.test.tsx` pins the opposite** ("a world with no capture shows no preview ... no og:image in its tags"), with a comment that
   a preview "must come with its capture, and with this test changed in its own commit". It changes first, in its own commit, with a line
   in the review card (CLAUDE.md: a test that must change).

## 1. Done when
- A link to the home, the Earth, a hub world's page or an ecosystem's page, pasted in a chat app or a social network, shows a 1200x630
  image: the home and the Earth a fixed one, a world its planet drawn from its seed with its name.
- A world born after the deploy has its picture with no build and no human step: its id appears in `worlds.json`, and its picture URL
  answers 200 at once (and its tag appears wherever a page can carry one, Q1).
- No request for an image ever makes more than one render per id per cache life, whatever is asked.
- The first screen's bytes are unchanged; `meta.ts` carries strings only.

## 2. The ways, compared

All four draw the same thing; they differ in where and when. "Weight" means what ships or what runs; "after the deploy" is a world born later.

| | (a) the server draws a 2D likeness from the seed | (b) a real browser at build, plus (a) for the rest | (c) a headless browser on the server | (d) a client-made image uploaded (rejected) |
|---|---|---|---|---|
| What makes the pixels | TypeScript on Node over core's look: a shaded sphere, bands from value noise in the palette's three colours, the ring as a tilted ellipse, glow and rim, the name from a glyph atlas; PNG by `node:zlib` | The scene's own shaders (the true planet) in Playwright's Chromium on the build machine, for the worlds of `data/` | Chromium and the scene on the server, a render per new world | A visitor's browser renders the scene and posts it |
| Fidelity to the real planet | Same palette, rings, tilt, class and colour family; **not** the surface's shapes (continents, cracks, clouds): a family likeness, like a stylised portrait. The most it can be judged: side by side with the scene on 24 random seeds | Exact, for those worlds | Exact | Exact, but unverifiable |
| Cost | A renderer of about 200 lines in a new `server/src/share/`, a glyph atlas, a PNG writer of about 40 lines, no dependency. Stand-in measure: a 1200x630 shaded, noisy sphere, per-pixel in plain JS, 29 ms including `deflate` level 9 (Node 26.12 on this machine, not the pinned 24.22.0; the real renderer, with its Lab-derived palette and rings, will be slower: the budget in §6 is 150 ms, over which it moves to a `worker_thread`) | Extends a tool that exists, but the build then needs the GPU path: Playwright's Chromium with software GL in CI and in the Docker build (`deploy/web/Dockerfile` builds with Node only, no browser: a browser in that image is heavy and a new tool, stop-and-ask). Pictures are committed files; `check_regressions` watches them | A Chromium of ~300 MB and a GPU or SwiftShader per render, in a distroless-image stack that grants 512 MB and 128 pids to the server; a second service with its own egress policy | Needs an account or a guest to upload: a way for anyone to put an image on our origin (ADR-0002 §6: "gnoworld hosts no media") |
| Weight (what ships) | The server image grows by the atlas (about 20 KB) and the code; the client by nothing | One 1200x630 file per world, ~100 to 175 KB each (my stand-in's size, PNG; WebP smaller but not every unfurler reads it), committed or built: 7 worlds ~1 MB | A browser image of hundreds of MB | none, and unsafe |
| Risk | The look can drift from the scene as the shaders are retouched (Alexis is still retouching them in the ping-pong): a test ties the likeness's palette to `worldRecipe` so a recipe change moves it, but a shader change cannot. A renderer that blocks the server's one Node process (login, chat) if slow | Pictures go stale when a recipe changes (the manifest hash of inputs, as `worldPictures.json` does, catches it); a world that is new after the build has none: needs (a) anyway | Heavy, an attack surface (a browser in a service that answers the public), slow cold start, memory pressure on a 512 MB limit | Hostile uploads, moderation |
| A world born after the deploy | Works at once | Falls back to (a) | Works, slowly | Works only if someone visits first |

**Encoder choice for (a).** PNG by `node:zlib` (stdlib, no dependency): lossless, every unfurler reads it. Size matters: WhatsApp drops
an `og:image` over about 300 KB (a figure I recall, not verified in this session; Q4 asks to check it on a phone), and my stand-in with
five octaves of noise was 174 KB, with one octave 104 KB (the stand-in has no text and a flat background; the real one has a starfield
and a name: unmeasured). So the first test caps the PNG at 250 KB, and the renderer keeps a bounded palette of noise octaves. If the
real image cannot stay under it, the next step is a JPEG, and the only encoders are `@jsquash/jpeg` (WebAssembly, ~100 to 200 KB, in
the lockfile for `link-reader`, not installed here: not verified) or a hand-written one (not recommended: hand-written codecs are the
tier-1 warning sign in `REVIEW.md`). That is a stop-and-ask, asked only if the 250 KB test fails.

**Text.** The name is drawn by us, never by a font parser or an SVG renderer: a world's id is `[a-z0-9_/-]` and a hub's name comes from
our data file, so the text set is small and known. A signed-distance-field atlas of those glyphs in Geist (the design system's font,
`@fontsource-variable/geist`) is generated once by a tool (the one tool that runs a font parser, never in the server) into a committed
PNG of about 20 KB, and the renderer samples it: crisp at any size, no dependency, no markup, nothing to escape. A character outside the
atlas is drawn as the id's slug, or skipped; it cannot throw, inject or exceed the canvas. (A resvg-wasm SVG route was the alternative:
a WebAssembly dependency of about 2.5 MB, a font file and an SVG built from text that must be escaped: more surface for no gain.)

**Recommendation: (a), plus two fixed pictures for the home and the Earth taken once by the existing Playwright tool (b) and committed
(2 files, not a build step).** (a) is the only one that is automatic for the next world, costs no dependency and no browser, and is
testable without a GPU. (b) for the hub worlds adds exactness for 7 worlds at the price of a browser in the build and stale files; I
recommend it only if Alexis finds (a)'s likeness not good enough on the 7 real hubs (Q3). (c) and (d) are no.

## 3. The route

`GET /api/share/w/<file>.png` in the server (`server/src/share/`). A world's id can hold `/` (`gov/dao`) and `_` (real underscores), so
the path carries the id's **file form**, slashes made underscores as `lib/pictureFile.ts` does for pictures (reuse it, moving it to a
shared place in a refactor commit of its own, CLAUDE.md), and the route **resolves it by lookup in the known-worlds table, keyed by file
form**, never by parsing it back: a candidate that is not a key is a 404. If two ids collapse to one file form, the table keeps the
first and logs the second at load (to verify on the real `worlds.json`).

- **Fixed pictures** `GET /api/share/home.png` and `/api/share/earth.png`: served by nginx as static files from the web image
  (`/share/home.<hash>.png`), no server route; their names carry their content hash like `/world-pictures/`, and `nginx.conf`'s
  `$cache_control` map already makes `/(textures|world-pictures)/` immutable: add `share` to that one regex (a one-word change in a
  tier-1 file).
- **Known worlds table:** built from `worlds.json` (the server's own job output, read as the server reads it for presence) plus
  `hubs.json`; refreshed when the job rewrites the file, never per request. A map capped at `WORLDS_CAPS`-sized counts, honouring the
  "no module-top Map" rule (F412: the table lives in a function's closure, as `limit.ts` does). An id not in the table: **404 with no render
  and no body beyond `{error: "not_found"}`**, so a flood of made-up names costs a table lookup, never a render, and the unknown names
  are never stored (no cache entry for a 404; the rate limit below covers the lookups).
- **Cache layers.** (1) In memory: an LRU of the rendered PNG buffers, capped by bytes (for example 32 MB, a figure to settle on the
  measured size, about 150 KB each: ~200 pictures), keyed by `id` plus a **look version** (a constant hashed from the core look's
  inputs, so a recipe change makes new keys). (2) On disk in the server's volume `/data/share/<hash>.png`, written through
  `replaceFile.ts` (atomic, exists), so a restart does not re-render 500 worlds. Retention: `retention/` already measures the volume against
  caps; add this folder to its measure with a cap (for example 128 MB, oldest first) rather than a second tick (to read its code
  before; I did not). (3) HTTP: the image's response says `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` and an
  `ETag` that is the look version plus the id's hash; `If-None-Match` gets a 304 with no render and no file read. The image never
  changes for an id unless the look version does, so a day is conservative; unfurlers keep their own copy for days or weeks anyway.
- **One render at a time, one per id.** An in-flight map (inside the closure, bounded) hands the second asker for an id the first's
  promise, so a burst on a new world renders once. A global limiter (`limit.ts`, the same module) caps renders: at most N misses a minute
  in total (for example 30), then **429 with `Retry-After`**; cached answers do not count. nginx's `limit_req` (20 r/s a visitor, burst
  640) already guards the door, and `/api/` is proxied with `proxy_buffering off`, fine for a 150 KB body.
- **Size caps.** The canvas is a constant 1200x630 (no size parameter, no query: a query string is ignored by the route and never in the
  cache key; nginx's log already drops queries). The PNG is capped at 250 KB by the renderer; over it, the render is refused and logged
  (`share_too_big`) and the route answers a 500 with the generic body (the card then has no picture; a CI test proves the cap on 24
  random seeds). A request body is not read (GET only); `bodyLimit` stays 16 KiB.
- **Headers.** `Content-Type: image/png`, `X-Content-Type-Options: nosniff` (already global in nginx and `secureHeaders`),
  `Content-Disposition: inline`, no cookies, no `Vary`. The image answers anyone, signed in or not, with no session: it exposes only what
  `worlds.json` and the hubs already publish (the id and its seed look). No address, no count, no message, no text a visitor wrote.
- **CSP.** Unchanged: the images are fetched by crawlers, never loaded by our pages (`img-src 'self' data:` stays). The share sheet's
  own preview is a different thing (the scene's canvas).
- **Rendering off the main thread, if needed.** The server is one Node process with login and chat. The test fixes a budget: the
  render of the slowest anchor's world, p95 over 24 seeds, under 150 ms on the pinned Node; over it, the renderer runs in a
  `worker_thread` (one, reused), not a rewrite. A worker is a Node built-in, not a dependency; the container's `pids_limit: 128` holds.
- **Never a gnomcp or a chain read** at request time: the route reads files the server wrote.

## 4. The meta tags, per page

`meta.ts` gets one optional field and one pure function; strings only, nothing to the first screen. `pageMeta` takes `image?: {url, alt}`
and, when present, adds `og:image`, `og:image:width` (1200), `og:image:height` (630), `og:image:alt`, `twitter:image`,
`twitter:image:alt`, switches `twitter:card` to `summary_large_image`, and adds `"image"` to the JSON-LD (React Router's JSON-LD escaping
already covers `<`, `>`, `&`). With no image it is unchanged. The image's URL is `ORIGIN + path`, never from data.

| Page | Image | Alt |
|---|---|---|
| Home (default universe or another) | `/share/home.<hash>.png`, fixed | "gno.world, the social hub of gno.land" |
| Earth | `/share/earth.<hash>.png`, fixed | "The Earth of <universe name>" |
| A hub world | `/api/share/w/<file id>.png` | "<name>, a world of gno.land" |
| An ecosystem | the home's, fixed (no planet of its own) | its name |
| A realm view, a not-found, a failed page, a list | none: they are `noindex` and carry no share tags today | |

A testnet universe's pages stay `noindex`; their share image is allowed (a shared link is a deliberate act, not indexing) but their
canonical differs: nothing new. The `og:image` URL is on the site's own origin, so `ORIGIN` is the one place a deploy to another origin
changes (as for every tag today).

**Chain worlds with no page (Q1).** Three honest options, cheapest first: (1) their share link is the cosmos system's page
(`/s/<namespace>`) or the realm's page; both come from the fallback with generic tags, so no per-world image is possible without a
per-request HTML; (2) a small server route `GET /api/share/page/w/<file id>` returning a 2 KB HTML with the tags and an immediate
redirect (`<meta http-equiv="refresh">`) to the canonical, and nginx sends a request for `/w/<id>` there only for the user agents of
the known unfurlers (a `map $http_user_agent`), only where no file exists; this is a change to `nginx.conf` (tier 1, `test.sh` from
Alexis's Terminal), and cloaking-adjacent, to read against each platform's policy; (3) give the chain worlds a page at build: the
build reads `worlds.json` (the server's job output) and writes one page per world; that is a larger change to ADR-0002 §2 ("planets
only, never dust, so the build stays bounded"), and it still leaves the worlds born after the deploy without one. I recommend (1) for
the first merge and Alexis decides on (2) after he has seen the picture (Q1). The picture route works for every world either way.

## 5. Parts (a part is a branch only if Alexis wants two; each is one session)

1. **Test-first: the renderer** (`server/src/share/`, tier 2; it reads core's tier-1 files and changes none).
2. **The route and its caches** (server).
3. **The glyph atlas tool and the two fixed pictures** (a one-off tool beside `app/tests/tools/`, outputs committed).
4. **`meta.ts` and `world.test.tsx`** (app): the test that pinned "no og:image" changes first, in its own commit, then the tags.
5. **`nginx.conf` and `deploy/web/Dockerfile`**: the `share` path in the cache map, the static files in the web image. Tier 1
   (`deploy/`): the `security-reviewer` and a `test.sh` run by Alexis from the reviewed commit ("Run test.sh from the commit you
   reviewed"); `nginx.conf` is the only tier-1 file the plan touches.

Order: 1, 2, 3, 4, 5. The weight of each is "Feature" (REVIEW.md), 5 "Sensitive" (red pass, `security-reviewer`, up to three rounds).
Under the radical mode the other parts write no test while building and are tested at the hardening slice; this plan lists the tests
anyway because §6 is cheap and the route is a public, unauthenticated endpoint on a CPU-bound path: I recommend that parts 1 and 2 be
done test first even in the radical mode (Q5).

## 6. Tests first (named after the fault)

Renderer (pure, no network, no GPU):
- the same id, `nature` and look version give the same bytes (a hash), run twice and on two Node processes;
- two different ids give different bytes; 24 random seeds (never a chosen few, CLAUDE.md) all decode as PNG 1200x630;
- each PNG is under 250 KB; p95 render under 150 ms on the pinned Node (a bench with its number in the card; a failing bench is a
  finding, not a loosened limit);
- the dominant colour of the planet's lit half equals the recipe's palette (within Lab 6 of `worldRecipe(id).palette`): a recipe change
  moves the picture;
- a world with rings has ring pixels on the ellipse of `rings.inner/outer`; one without has none; a world with no `glow` has no halo;
- the name: every glyph of `[a-z0-9_/-]` draws; a name wider than the safe box is scaled to fit, never clipped off the canvas nor past
  it; an empty name and a 64-character name both produce a valid image; a character outside the set (a name from a data file with an
  accent, a zero-width or a bidi character, `<script>`) draws the slug or nothing, never throws (the faults, as inputs);
- the PNG writer: signature, IHDR, one IDAT, IEND, CRC of each chunk, and a decoder (a test-only one, written in the test from
  `node:zlib` and the filter byte) reads back the pixels the renderer put in; no metadata chunk beyond the three (no `tEXt` carrying
  the id).
Route:
- an unknown id, a name with `..`, `%2e%2e`, a backslash (nginx already refuses `\`), a 10,000-character name, a name with a NUL, an
  uppercase variant of a known id, and `.PNG`: each a 404 with no render (a spy on the renderer proves zero calls);
- 10,000 distinct unknown ids in a burst: zero renders, the table untouched, the memory flat (the memory probe style of
  `link-reader/src/memoryProbe.ts`);
- 100 concurrent requests for one new known id: one render, 100 identical answers (the in-flight map);
- a second request is served from memory (no render), and after a restart from disk (no render, a test with a fresh closure over the
  same folder);
- `If-None-Match` gives 304 and neither renders nor reads the file; a changed look version changes the ETag;
- the 31st miss of a minute is a 429 with `Retry-After`, and cached ids are still served at that moment;
- the response headers: `image/png`, `nosniff`, the cache line; no `Set-Cookie`; GET only, `POST` is refused by the existing guard;
- the world list changing (`worlds.json` rewritten with a new world) makes that world answerable with no restart;
- the cache's byte cap: filling it past the cap evicts the oldest, never the one being served.
`meta.ts` (the unit tests beside `world.test.tsx`): the tags above, exactly; a page with no image is byte-identical to today's; the
JSON-LD carries `image`; a hostile world name in the data (`"`, `<`, `&`) stays text in every tag (the existing JSON-LD test pattern).
Journey: none (CLAUDE.md: a journey only for a critical flow). `deploy/test.sh` (Alexis): `GET /share/home.<hash>.png` is 200
`image/png` with `immutable`; `/api/share/w/<known>.png` is 200 with the headers; an unknown is 404; with no basic-auth the demo
refuses both, as every path.

The red pass (`test-auditor`) is for part 5 and for any server code kept in a tier-1 path; part 1 and 2 are tier 2 and get none unless
Alexis asks. A hand-written mutant is not needed: StrykerJS runs on `server/src/share/` at the merge check.

## 7. Weights

- First screen: unchanged. `meta.ts` adds strings in the pre-rendered HTML (about 400 B of tags a page, not JavaScript, so the
  150 KB budget is unaffected; the HTML is gzip-compressed by nginx); `meta.ts` itself is in the route modules' chunk already, so a
  few hundred bytes of code: below the 256 B margin only if the part holds it; measure in the card (`Lowered-floor:` if over).
- Server: the renderer and atlas about 25 KB on disk; memory: the LRU's cap (32 MB of the 512 MB limit; it shares the limit with
  everything else: the cap is checked against the memory the server uses at rest, to measure) and the in-flight map (a few entries).
- Volume: at most the disk cap (128 MB, §3), inside the retention tick's total.
- Static: 2 fixed PNGs of ~100 to 175 KB in the web image. The service worker precaches the build's files: the `share/` folder is
  excluded from the precache (a phone never needs them; the check is in `sw`'s manifest rule, to read before the part).
- CPU: a render is per id per cache life: 500 worlds, once each, ~30 to 150 ms: about a minute of CPU in total over the cache life, never
  per visit.

## 8. The look of the picture (decided live, never by the plan)

The composition is Alexis's: the planet large on the right with its ring and glow, the name set in Geist at the left over the design
system's dark ground, "gno.world" small under it, a faint starfield from the same seed. Colours, sizes and the type are the design system's
tokens (the page's CSS variables cannot be read by Node: a tiny table of the few token values in `server/src/share/`, checked by a
test against `packages/ui/src/tokens` so one change cannot leave the other behind; the path of the tokens file to confirm). Frame-by-frame
comparison with the video does not apply (no frame shows a share card); the first picture is a proposal Alexis reads side by side
with the scene on 24 random worlds and retouches in the workshop (CLAUDE.md: the design of a screen is decided by Alexis live).

## 9. Stop and ask (CLAUDE.md)

- **A new dependency of the server** only if the 250 KB PNG test fails and a JPEG encoder is needed (`@jsquash/jpeg`, WebAssembly, not
  installed here), or if an SVG renderer were chosen (not recommended). The recommended path adds none.
- **A new tool**: Playwright's Chromium in the web image's build, only if Alexis chooses (b) for the hubs (Q3); the tool exists for
  the app's capture, not in the Docker build.
- **A change to `deploy/` and `nginx.conf`** (tier 1: "what decides who may do what at the edge"): the cache map's regex, and, if Q1
  option (2), a user-agent route. Security-reviewed, `test.sh` from Alexis's Terminal.
- **A new public, unauthenticated endpoint on the server** that spends CPU: the threat model of §3 (renders capped, 404 on unknowns,
  one render per id) is what this asks Alexis to approve.
- **A store's shape / a schema in use:** none changed; `worlds.json` is read, not changed. The hub data file gets no new field.
- **A test that must change:** `world.test.tsx`'s "no og:image" (its own comment asks for it), changed first in its own commit.
- **Docs:** `ARCHITECTURE.md`'s line about "a build step renders one Open Graph image per world" becomes "a server route draws one from
  its seed (D13934)"; the 2026-10-17 row's "left to later" is closed by D13934. Done in the part that lands the tags.

## 10. Threat model

| Entry | Abuse | Mitigation | Proving test |
|---|---|---|---|
| The id in the path | `..`, encoded slashes, NUL, huge, case games | lookup in a closed table; no parsing, no file path from it (the disk file is named by a hash of the id and the look version, never by the id) | §6 route tests |
| A flood of unknown names | CPU, memory, disk | 404 before any work; nothing stored for a miss; nginx's limit | 10,000 ids: zero renders |
| A flood of real ids (500 worlds, each once) | CPU | one render per id per life; in-flight sharing; a global 30 a minute with 429; the LRU and disk caps | 100 concurrent; 31st miss |
| Text drawn | markup, a font parser's bug, bidi, overflow | no parser at runtime: a glyph atlas; a closed alphabet; fit-to-box; alt text is a meta string (React escapes) | the hostile-name tests |
| The PNG | a polyglot, metadata leaking | built from our own pixels by our writer: three chunks, nothing else | writer test |
| Cache poisoning | one id's picture served for another | key = id + look version, ETag the same; an `ETag` never from the request | ETag test |
| Cost of a slow render | the login blocked | the 150 ms budget; a worker if over | the bench |
| A crawler's strangeness | a card cached stale for days | a conservative `max-age`; the unfurlers keep their own; a recipe change renames the cache key and the ETag, and the tag's URL has no version: a stale card on a platform persists until it refetches (cannot be fixed by us; to say in the card) | none |
| The tag's URL | an attacker's host | built from `ORIGIN` and a known id, never from data | the `meta.ts` test |

## 11. What Alexis decides

- **Q1** A world born after the deploy has no `/w/<id>` page, so no tag can name its picture: for them (1) the picture exists but no
  page uses it yet, (2) an unfurler-only HTML route in nginx and the server (tier 1), or (3) pages at build for chain worlds (changes
  ADR-0002 §2). I recommend (1) now, (2) after he has seen the card. Which?
- **Q2** Is "the planet's family likeness" enough, or must the picture be the real planet? (a) draws palette, rings, glow, tilt and a
  noise surface, not the true continents and cracks. Real means (b) with a browser at build for the hubs and still (a) for the rest.
- **Q3** If (b) for the 7 hub worlds: accept a browser in the build or a hand-run tool with committed pictures (as `worldPictures.json`)?
- **Q4** The PNG ceiling: 250 KB (WhatsApp's, unverified here; Alexis can test a link on his phone once a public host exists). If
  the real image will not fit, is a JPEG encoder (a dependency) acceptable?
- **Q5** Radical mode: do parts 1 and 2 (a public CPU-bound endpoint) get their tests first despite it? I recommend yes.
- **Q6** The picture's look (name left, planet right, the ground colour, a starfield): proposed in the workshop, or one look chosen now?
- **Q7** The demo is behind a password and `noindex`: accept that the feature is proven only by bytes and headers on the demo, and by
  eye on a real public host after the move?
- **Q8** The name of an Earth card per universe, or one Earth image for all universes (I wrote one)?
