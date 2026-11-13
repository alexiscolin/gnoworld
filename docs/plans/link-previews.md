# Link previews: a card under a chat line (D13906)

Draft of 2026-11-11, for Alexis's approval; nothing is built. Written by a planning agent (read-only), saved by the chief.

Sources read: D13906 and the 2026-10-21 rows (verdicts reach pages two ways; an answer of unknown shape counts as unchecked; a preview
can be removed; no uploads, "sexual/minors" text only), the egress rows (D181, D183, D184); ADR-0002 §6 ("Link previews wait for the
check"; "Media: gnoworld hosts no media") and §7; `docs/ARCHITECTURE.md`, `docs/REVIEW.md`, `docs/DESIGN-SYSTEM.md`; smokescreen v0.1.0's
`acl.go`, `yaml_loader.go`, `smokescreen.go`; OpenAI's moderation guide; the npm registry and the Go module proxy (§9); `go doc` at
go1.26.2.

## 1. Done when
- A line in a guest-readable public room has a first https link to a page with Open Graph tags: under the line, a card shows the link's
  host, the site name, the title, the description and the picture; the card links to the line's own URL.
- The card shows only once the line's verdict is `pass` and the card's own check passed (its text and picture in one OpenAI call); an
  unchecked, hidden or failed card never shows, not even for a moment.
- The reader's browser reaches only our origin: the picture is a JPEG the link reader re-encoded, served at `/api/cards/<key>/picture`;
  `app/src/csp.ts` unchanged (`img-src 'self' data:`).
- The line's author or the room's moderators can remove the card; the removal reaches every reader at once, is logged, never returns.
- Never in a DM, a members room or an accounts room, never for a guest's line (Q7, Q8).
- One fetch per URL per TTL, whoever posts it; limits per account, per host and in total; no reader's request ever triggers a fetch.
- The first screen's bytes unchanged; the chat chunk grows by 256 B at most.

## 2. Out of scope
Telling the author why no card showed; a card for an http link or for a link past the first; `og:video` (the players stay
`embeds.ts`'s); oEmbed and robots.txt; the console's queue for cards; a per-reader hide of one card (Q6); WebP and AVIF pictures unless
Q2 takes `x/image` (without it the card shows with no picture).

## 3. How it works
1. A line passes: `moderate` calls `passed` (`server/src/moderation/way.ts:41`); the cards' part takes it if its room is a card room and
   its author no guest, and finds the first https link with core's `cardLinkOf` (the same function the page uses).
2. Cache: the key is the SHA-256 of the normalised URL (host lower case, no fragment, no `:443`) in `link_cards`: fresh and passed, the
   line is tied and a `card` event goes; pending, tied and waits; fresh but failed, hidden or unchecked, nothing; missing or stale, the
   limits are taken (account, host, global) and the key queued.
3. Fetch: a cards queue reuses `makeQueue` (`server/src/moderation/queue.ts`: fair per account, capped, one at a time) and sends
   `POST /card {url}` to the link reader over a network only the two share; the reader fetches the page through its own way out, reads
   the head only, fetches `og:image` through the same guard, re-encodes it, answers JSON or the kind of failure.
4. Check: the server parses the answer with Zod (`ReaderCard`), sends title, description, site and the picture (a data URL) to OpenAI in
   one call through the chat's single breaker, decides with `decide` and the card thresholds, stores the outcome; on `pass` it publishes
   `card {msgid, room, key}` for every line tied to the key.
5. Page: `card` events kept in a cards slice; lines in view said before the stream's `since` are asked of `GET /api/cards?room=&ids=` as
   `askVerdicts.ts` asks verdicts; content by key from `GET /api/cards/<key>` through TanStack Query (lines sharing a URL cost one
   request); the picture from `GET /api/cards/<key>/picture`.
6. Remove: `POST /api/cards/remove {room, msgid}` from the line's author (the author's HMAC under the pepper, as verdicts store it) or
   anyone who may pin in that room (`mayPin`, `server/src/pins/wire.ts`); the line's card is marked removed and `card {msgid, room,
   key: null}` published; other lines sharing the URL keep theirs.

## 4. Threat model
| Entry | Abuse | Mitigation | Proving test |
|---|---|---|---|
| A link to a private address, or a name resolving to one | `10.0.0.1`, `169.254.169.254`, `::1`, `fc00::/7`, `100.64/10`, the host's own, `localtest.me`, `10.0.0.1.nip.io` | `egress_links` (smokescreen v0.1.0, `action: open`, `unsafe_allow_private_ranges: false`) resolves the name then refuses anything not global unicast, private, CGNAT or an IPv6 embedding (`smokescreen.go:302-330`); the guard refuses those ranges on every packet (`deploy/guard/guard.sh:62`); the reader's URL rule refuses IP literals, local names (`isPublicOrigin`, `packages/core/src/chain/origin.ts:8`) and userinfo; with no proxy set, `net.Dialer.Control` refuses a non-public address | `test.sh`: each through `guard:4754` gets 407; Go: the URL rule and the dialer refuse each; mutant `unsafe_allow_private_ranges: true` on 4754 caught |
| DNS rebinding | public first, private second | smokescreen resolves once and connects to the address it checked (`smokescreen.go:1290-1314`, `475-525`); the guard checks every packet; `Control` sees the dialled address | Go: a stub resolver public then private is refused; `test.sh`: `localtest.me`, `nip.io` on 4754 |
| Our host used to probe | many links to ports, IPs, subdomains | https on 443 only in the reader; the guard lets only 80 and 443 out (`guard.sh:66`); no IP literals; the only outcome is a card or nothing; limits per account, host, global; one fetch at a time; logs keep the failure kind, never the URL | Server: past an account's or a host's limit nothing is fetched; Go: `:8443` refused |
| Redirects | another host, http, another port, endless | 3 hops at most, each same host, https, 443 (`CheckRedirect`); else no card | Go: cross-host, downgrade, port, 4 hops |
| Huge or slow pages | a trickle, an endless body, a lying length | `http.Client.Timeout` 5 s page, 5 s picture; a `Content-Length` over the cap refused; `io.LimitReader` 256 KB of decoded body; stop at `</head>` or `<body`; 200 and HTML only; `LINKS_MAX` at once, else 503 | Go: trickle, 10 MB no length, false length, 206, `text/plain` |
| Decompression bombs | 1 GB gzipped zeros; a header of 100,000 px | the cap counts decoded bytes; `image.DecodeConfig` before `Decode`: over 4,096 px a side or 4 Mpx, under 64 px refused; GIF first frame only; the container's memory cap | Go: the bomb stops at the cap; the huge header refused undecoded |
| SVG, HTML or a polyglot as `og:image` | script, markup, EXIF/GPS | only JPEG, PNG, GIF by magic bytes, never SVG; always a fresh JPEG from pixels; `image/jpeg` with `nosniff` (`deploy/web/nginx.conf:104`); the server re-checks magic, size, dimensions | Go: SVG, HTML named `.jpg`, a JPEG+ZIP polyglot: no picture or a clean JPEG with no `Exif` |
| Malicious text in og fields | `<script>`, double entities, bidi, zero-width, 100 KB title | decoded once (`html.UnescapeString`), never markup; Cc/Cf removed (one rule moved from `bubbles/cut.ts:2` and `schemas/call.ts:15`); caps in the reader and in Zod; React text with `dir="auto"`, never Markdown | Go and Zod: one past each bound; App: `<img src=x onerror=…>` as text |
| Phishing through the card | `og:url` or `og:site_name` naming another site | the card's link is always the line's URL, never `og:url`; the real host always shown, the site name beside it | App: `og:url` ignored, real host shown |
| Tracking pixels, readers' privacy | a 1x1 beacon | browsers never reach the site; no cookies, no Referer, a fixed User-Agent, no Accept-Language; pictures under 64 px dropped | Go: headers checked; a 1x1 GIF gives no picture |
| Shocking or illegal pictures | abuse, violence, sexual | no picture before its check; text and picture in one call, anything flagged drops the card; OpenAI scores sexual, violence, self-harm on images, "sexual/minors" on text only (guide read 2026-11-11): a stricter `sexual` threshold for cards (Q1); removable; a picture lives no longer than its card; OpenAI asks that no known or suspected CSAM be sent, and nothing before the call can know | Server: a flagged picture gives no card, no event, nothing at `/picture`; an unknown-shape answer counts as unchecked and alerts |
| Moderation cost, starving line checks | a flood of links | one call per URL per TTL; none for hidden or unchecked lines, members rooms, DMs, guests; the cards queue one at a time behind the lines' four; a global cap a minute; breaker open: the card stays unchecked till its short TTL | Server: 50 cards queued while lines arrive, every line settles first; breaker open, no card call |
| Removal abuse | removing others' cards | `guard.ts` (listed Origin, JSON body), session, right (author HMAC or `mayPin`), 30 a minute per account, before any work | Routes: 403 another account, 401 guest, 403 wrong Origin, 429 the 31st, 404 unknown line |
| Links acting on a GET | a magic login, an unsubscribe | a known limit (Slack's and Discord's unfurlers spend them too), written in `OPERATIONS.md` | — |
| The open way out leaking | the server or jarvis reaching any host | `egress_links` on 4754 accepted only from `links_out`; the server keeps its allowlist on 4750 | `test.sh`: `example.com` via 4750 still 407; 4754 refused from `inside` and jarvis's networks; mutants |
| A compromised reader | a decoder bug | Go's decoders are memory-safe; no secret, no volume, read-only root, own user, public hosts only; its answer untrusted: Zod, caps, base64 size, JPEG magic | Server: a wrong shape, an oversized picture, non-JPEG bytes give no card |
| Storage growth | unbounded cards | 30 days, at most 2,000 rows and 32 MB of pictures, oldest first, on the retention tick (`server/src/retention/retention.ts`, its 256 MB cap counts them) | Retention tests |

## 5. Weights and cost
- First screen untouched: the `card` listener in `lib/stream/verdicts.ts` hands the data on unread (as `chain` and `realms` do); `LinkCard`,
  its CSS and the schemas load in a lazy chunk on the first card (as `features/previews/plug.ts`); the chat chunk +256 B at most.
- Per card: the event about 120 B, the content about 0.6 KB, the picture at most 12 KB at 160 px or 64 KB at 640 px (Q5), lazy with width
  and height set (no layout shift), not loaded for a reader saving data.
- Server: cards in SQLite, no new in-memory map beyond the limiters' caps; the stream's ring keeps frames of about 120 B, 64 per room.
- Containers: `link_reader` 0.2 core and 64 MiB, `egress_links` 0.1 core and 48 MiB, in a profile `links` outside the demo's ceiling as
  jarvis is (D184, Q11).
- OpenAI: moderation is free; the number of calls is what matters, bounded by the caps.

## 6. Scale
OpenAI's rate limit first (shared with line checks; the cards' queue gives way), then the reader's concurrency; then more readers behind
the server, a per-domain limit (the public suffix list: a dependency; a `ponytail:` comment marks it), pictures moved to files served by
`web` if their requests show in the server's CPU.

## 7. Parts, in order
| Part | What | Kind | Waits on |
|---|---|---|---|
| L1 | the link reader and its way out (deploy) | sensitive | — |
| L2 | the card-link rule and the schemas (core, schemas) | feature (red pass with L3) | — |
| L3 | the server: store, flow, check, routes, stream, retention | sensitive | L2 |
| L4 | the page: the card under a line, and its Remove | feature | L3 |
| L5 | docs | docs | L1-L4 |
L1 and L2 side by side, then L3, then L4. With Q1 "text first", the picture path moves to L3b/L4b.

### L1. The link reader (tier 1: `deploy/`)
`deploy/link-reader/`: `main.go` (`POST /card` only, `LINKS_MAX`), `fetch.go` (URL rule, `CheckRedirect`, `Timeout`, `LimitReader`,
`Control`), `head.go` (meta property/name/content, `<title>`, `html.UnescapeString`, Cc/Cf removal, caps, skips `<script>` and comments),
`picture.go` (magic bytes, `DecodeConfig`, `Decode`, an area-average downscale, `image/draw` over the card's surface, `jpeg.Encode`, the
output cap), `main_test.go`, `testdata/`, `go.mod` (`go 1.26.2`, no `require`), `Dockerfile` (`golang:1.26.2-alpine` then
`distroless/static nonroot`, by digest, `deploy/probe` for health). `deploy/egress/links-acl.yaml` (`action: open`). `deploy/compose.yaml`:
`link_reader` (profile `links`, own user, `x-locked`, networks `links` and `links_out`, `LINKS_PROXY=guard:4754`, `LINKS_MAX=2`, no secret,
no volume), `egress_links` (4754, own acl, 8 tunnels), internal isolated networks, the guard's `LINKS_OUT_ADDRESS`, the server on `links`
with `LINK_CARDS` and `LINK_READER_URL`. `deploy/guard/guard.sh`: 4754 from `links_out` alone. `deploy/.env.example`. `deploy/test.sh` (or
a sourced `test-links.sh`): the proofs, and `go test` for both readers where Go is available.
Tests first: Go with httptest TLS servers and a stub resolver (every "Go" row of §4, golden answers L2's Zod test reads too); `test.sh` on
4754 (`example.com`, a picture CDN, every private target 407, 8443 refused) and isolation (`example.com` via 4750 still 407; 4754 refused
from `inside` and jarvis's networks; the reader: no secret, no volume, read-only root, non-root, two networks; the server reaches
`link_reader:8084`, `web` and `ergo` do not; `POST /card https://example.com/` answers a card); mutants (an open list on 4750, private
ranges on 4754, the guard's rule dropped, the reader on `inside`, OpenAI's key given to it, root).

### L2. The rule and the shapes
`packages/core/src/chat/cardLink.ts`: `cardLinkOf(text)` (the first Markdown link: https, 443 or none, no userinfo, `isPublicOrigin`, at
most 2,048 characters) and `normalisedUrl(url)`. One Cc/Cf rule shared by `bubbles/cut.ts`, `schemas/call.ts` and the card (a refactor
commit of its own if identical). `packages/schemas/src/cards.ts`: `ReaderCard`, `CardEvent`, `LineCards`, `LinkCard`, `CardRemove`.
Tests first: `cardLinkOf`'s table (bare URL, Markdown link, code span, `http:`, `:8443`, userinfo, IP, `localhost`, `.internal`, 2,049
characters, a first http then an https), normalisation, each schema one past each bound, the Go golden answers parse.

### L3. The server (`config.ts` tier 1; `server/src/cards/` proposed tier 1, Q13)
`server/src/cards/`: `store.ts` (`link_cards`, `line_cards`), `flow.ts` (`heard`, `run`), `routes.ts` (`GET /` room readable, 60 a minute
per visitor; `GET /:key` pass only, `no-cache` and an ETag; `GET /:key/picture`; `POST /remove`), `wire.ts` (as `pins/wire.ts`).
`moderation/provider.ts`: `input` a string or parts (text, image_url); `withBreaker` and `Ask` widened, callers unchanged. `stream/stream.ts`:
`card(event)`, the rings keep frames so card events replay after a reconnect. `chat.ts`, `chatParts.ts`, `main.ts`: `passed` calls
`cards.heard`, `/api/cards` mounted. `config.ts`: `LINK_CARDS` (off by default), `LINK_READER_URL`, the card thresholds.
`retention/retention.ts`: cards by age and cap. `migrations.ts`: the tables, expand only.
Tests first: the server rows of §4; triggers (a card only after `pass`; members and accounts rooms, guests, hidden and unchecked lines
make no reader call; one call for two lines with one URL, two events; a stale entry refetches once; the reader down: no card, a negative
TTL; a passing card publishes for every waiting line); routes (pass only, not removed, line passed; removal by author HMAC and `mayPin`;
no GET ever calls the reader); lifecycle (an edit and a REDACT drop the card; the cards queue never delays line checks; retention).

### L4. The page (`csp.ts`, `embeds.ts`, `Embed.tsx` untouched)
`lib/stream/verdicts.ts`: a `card` listener; `lib/api/cards.ts` (Zod); `store/cards.ts` (an added slice); `askVerdicts.ts`, `linked.ts`,
`useVerdicts.ts` also ask `GET /api/cards`; `features/chat/LinkCard.tsx` and its CSS, a lazy chunk, after `<Embed>` and `<LinePreview>` in
`LineView.tsx`: one card per line (player, realm capture, link card), none in a DM or for a hidden line, the link through `Message.tsx`'s
`LINK` (`rel="noopener noreferrer"`); Remove for the author and moderators; the design system's components, tried live.
Tests: text as text; the link is the line's URL and the host shows; no card before its event, none for a hidden line; the picture only
from `/api/cards/<64 hex>/picture`, not for data savers; Remove for the author and moderators only; a removal event takes the card away.

### L5. Docs
`OPERATIONS.md` (the reader, ports, caps, health, `LINK_CARDS` kill switch, known limits), ADR-0002 §6 and §7 amended after Q1, the
decisions' rows, `REVIEW.md`'s tier-1 row (Q13), `ARCHITECTURE.md`, the privacy policy's line once it exists.

## 8. Tiers
| Tier | Files |
|---|---|
| 1 | everything in `deploy/`; `server/src/config.ts`; proposed `server/src/cards/` (Q13) |
| 2 | `server/src/moderation/provider.ts`, `stream/stream.ts`, `chat.ts`, `chatParts.ts`, `main.ts`, `retention/retention.ts`, `migrations.ts`; `packages/core/src/chat/cardLink.ts`; `packages/schemas/src/cards.ts`; `app/src/lib/stream/verdicts.ts`, `lib/api/cards.ts`, `store/cards.ts`; `features/chat/{LinkCard,LineView,askVerdicts,linked,useVerdicts}` |
| 1, untouched | `app/src/csp.ts`, `features/chat/embeds.ts`, `Embed.tsx` |

## 9. Dependencies
The recommended way needs none: Go's standard library (`net/http`, `net`, `net/netip`, `html`, `image`, `image/jpeg`, `image/png`,
`image/gif`, `image/draw`, read with `go doc` at go1.26.2); a hand-written head scan (about 80 lines) and scaler (about 25).
Otherwise (npm `latest`, read 2026-11-11, each package's unpacked size): `htmlparser2` 12.0.0 MIT 235 KB with `domhandler`, `domutils`,
`dom-serializer`, `domelementtype`, `entities`; `parse5` 8.1.1 MIT 387 KB (published 2026-11-07, too young; 8.0.1 already in the lockfile
as a dev dependency through jsdom); `sharp` 0.35.5 Apache-2.0 962 KB with native `@img/sharp-libvips-linux-*` (about 18 MB, LGPL-3.0, native
code decoding hostile input); `@jsquash/jpeg` 1.6.0, `png` 3.1.1, `webp` 1.5.0, `resize` 2.1.1 (Apache-2.0, WebAssembly); `wasm-vips` 0.0.19
MIT 13 MB. Go: `golang.org/x/image` v0.48.0 (2026-11-09, too young; BSD-3-Clause) only for WebP and a finer scaler.

## 10. Stop and ask
A way out open to any public host (deployment security); the reader in Go beside the server's TypeScript (ADR-0002 §7), as
`jarvis_reader`; pictures hosted on our origin, against ADR-0002 §6 and the 2026-10-21 no-upload row; the store's `cards` slice;
`moderationClient`'s function widened to take parts; the stream's rings keeping frames; the demo's ceiling (D184) if `links` joins it;
any dependency of §9.

## 11. Found on the way
- `deploy/jarvis-reader/main_test.go` runs nowhere (no `go test` for it in `scripts/`, `.github/`, `.githooks/`, `deploy/test.sh`): L1
  wires both readers' tests.
- Suspected, not reproduced: `linked.ts:6` asks verdicts only for lines with a player link, so a line linking only to a realm page and
  older than the stream's replay never gets its `checked`, and its 8f capture never shows (`LinePreview.tsx:22`).
- `packages/schemas/src/stream.ts:2` promises the preview's own states (decision 158), never added.

## Questions for Alexis
1. Pictures from our origin (against ADR-0002 §6 and the 2026-10-21 reasoning; OpenAI scores no "sexual/minors" on images and asks that
   no suspected CSAM be sent): text cards first and the picture as a last part, or pictures now with a stricter `sexual` threshold?
   Recommendation: text first.
2. The reader in Go's standard library, its own container, or TypeScript with sharp, @jsquash or htmlparser2? Recommendation: Go; no
   `x/image` yet.
3. Any public host, or an allowlist? Recommendation: any, with the limits.
4. TTL and caps: 24 h, 1 h after a failure, 5 min after unchecked; 30 days, 2,000 cards, 32 MB of pictures?
5. A thumbnail up to 160 px (about 12 KB) or a picture up to 640 px (about 64 KB)? Recommendation: thumbnail.
6. A device setting "Show link previews" (and off for data savers)? Recommendation: yes.
7. Guest-readable rooms only, or accounts rooms too? Recommendation: guest-readable only.
8. Guests' links: recommendation: no card.
9. User-Agent: an honest name of ours (some sites will refuse it) or a known bot's? Recommendation: honest.
10. One card per line, in this order: player, realm capture, link card?
11. A `links` profile with `LINK_CARDS` off by default, as Jarvis; the ceiling plus 0.3 core and 112 MiB?
12. Rates: 10 new URLs per account per 10 minutes, 20 per host a minute, 60 a minute in total, one fetch at a time?
13. `server/src/cards/` in `REVIEW.md`'s tier-1 row, as D13906 says?

## Alexis's answers (2026-11-11, D13919)
1. Pictures now (not text first), re-encoded by the reader and checked by OpenAI with a stricter `sexual` threshold for cards; the risk
   named to him: OpenAI scores no "sexual/minors" on images.
2. TypeScript with libraries, not Go. The chief's choice within it: the reader stays a container of its own with no secret (the plan's
   isolation kept), in Node: `htmlparser2` for the head (12.0.0, MIT, 2026-03-20) and the `@jsquash` WebAssembly codecs (`jpeg` 1.6.0,
   `png` 3.1.1, `resize` 2.1.1, Apache-2.0; WebAssembly's sandboxed memory rather than `sharp`'s native libvips decoding hostile
   input); each version two weeks old at least, installed by Alexis (app/package.json and the lockfile are harness files).
3. Any public https host, with the limits.
4-13. The plan's recommendations.
