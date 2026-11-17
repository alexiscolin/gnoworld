# Slice 13: each world's unread pill (D13081)

Each world in the full chat's worlds column (`app/src/features/chat/Worlds.tsx`) shows its unseen lines in a pill, `99+` past 99.

Read first: Ergo keeps each account's reading place per room (`draft/read-marker`); only that account's own session can read it
(`MARKREAD <room>`, answered `timestamp=…` or `*`); the server's bot holds the bot's places alone, so the server cannot read anyone's from Ergo
(`grep` finds `MARKREAD` only in `app/src`, `packages/core/src/chat/marker.ts` and test kits, never in `server/src` handlers). The page follows
only the open world's rooms (`ChatPanel` `follow(roomIds(sections))`) and sets/forwards places through `Places` (`link.ts` `markRead`, `places.tell`).
The server already holds each passed line's room, account and time: the search index's `lines` table (`server/src/search/index.ts`, index
`lines_by_room (room, at)`; searchable rooms only, 2,048 a room, 90 days, a REDACT removes its row).

## Done when
- Another world's pill shows the number of lines past the account's reading place in that world's rooms, by others, in rooms it may read, `99+` past 99;
  none when zero, none for a guest, none for a world where no place is known (never a false number: a never-read room counts nothing, as `PAGE_OPENED`'s rule).
- The open world shows its own count from the store as `placeCounts` already does; reading a room lowers the count within one refresh.
- The count refreshes on opening the full chat, on focus, and every 30 s while it shows; none runs when the chat is closed.

## Out of scope
Counts for rooms not in the search index (members rooms, DMs: DMs keep their notices); mentions-only counts (the pill is lines); a count in the
rail or the dock; per-room pills in the column; a push when a count changes; places for rooms the account never read in this page's life
(Ergo's place for them is not asked: 16 fakelag points a MARKREAD, `deploy/ergo/ircd.yaml.tmpl:171`).

## Design
The server keeps a copy of the places Ergo confirmed: the page forwards the `MARKREAD room timestamp=T` Ergo echoed (never one it asked for), the
server stores the later of the row and T. `GET /api/unread` (session) counts, per room of the copy the account may read, the lines past the place
by others (`LIMIT 100` a room), sums them by world, and answers `{ worlds: { slug: n } }` with n capped at 100. Alternative rejected: the page
asking Ergo a getter per room of every world (rate cost, needs the room lists of all worlds loaded). Cost of the choice: a second copy of a place;
it never leads Ergo's (only echoes are sent), and an account that has read nothing since this ships has no pill until it reads (the page also
uploads the places it already holds on load).

## Threat model
- Assets: an account's reading habits (new server-side data), the rooms it may read.
- Abuse 1, one account forging another's places: the route takes the session's address alone, no account in the body. Test: a body naming another account is ignored.
- Abuse 2, learning a room's activity one may not read: rows are counted only where `mayRead(room, account)`; a room made hidden later counts nothing.
  Test: place stored, room turned members/hidden, count absent.
- Abuse 3, a place far in the future hides a world forever or fills the table: times past now + 5 min refused (as `PLACE_AHEAD_MS`); 500 rows an
  account, the oldest read dropped; 600 writes and 60 counts a minute an account (`limiter`); a row expires at 90 days with the lines.
- Abuse 4, cost: 500 indexed counts at most per call, cached 5 s an account. Test: the 61st call in a minute refused; two calls within 5 s count once.

## Cost
`unread` read: up to 500 rooms x an index range stopped at 100: bench under 20 ms worst case on 400,000 lines, 1 ms for a typical 10 rooms.
Write: one upsert per place, batched by the page (at most one POST every 5 s). Page: one GET every 30 s while the full chat shows.

## Scale
First limit: the index scan on a very busy room (stopped at 100) and 500 rows an account. Next step: a counter per (room) updated on arrival.

## Tests, by level (write these first, see them fail)
- schemas: `UnreadPlaces` (rooms of `RoomId`, ISO times, at most 100 a call) and `Unread` (slug to 0..100).
- server unit: store (later place wins, earlier ignored, future refused, cap and expiry, one account's rows never in another's count); count (others'
  lines only, own lines excluded, REDACTed line absent, cap 100, sum by world, room not readable skipped, no place gives none); routes (session
  required, rate, cache, body strict).
- app unit: the pill component (0 none, 7, 99, 100 shows `99+`, label for a screen reader); the hook (stops when the chat closes, refetches on
  focus, a failed fetch keeps the last number); the link forwards only echoed places, batched.
- Journey: one spec only for the critical flow after Alexis validates the look: a line in another world raises its pill, reading it there lowers it.

## Files
Create: `packages/schemas/src/unread.ts`; `server/src/unread/{store,routes}.ts` (+ tests); `app/src/lib/api/unread.ts`;
`app/src/features/chat/useUnread.ts`. Change: `server/src/migrations.ts` (append `UNREAD_TABLES`; `migrations.test.ts` hash), `server/src/chat.ts` or `main.ts`
(mount), `app/src/features/chat/{Worlds.tsx,link.ts}` (pill from `Badge`, forward echoed places), retention tick for expiry. Tier 1 (docs/REVIEW.md): none
(no change to `guard.ts`, `limit.ts`, `config.ts`, `server/src/login/`, `app/src/lib/ergo/`; `limiter` and `sessionOf` are used as they are). The route
reads accounts and rights, so it gets the `security-reviewer` by choice. The pill's look is Alexis's, live; no pixel test.

## Branches
One branch `unread`, one agent, two lots: U1 server (tests first, store, count, route), U2 page (pill, hook, forwarding). U2 waits on U1. It touches
`server/src/chat.ts` like the translations branch: merge this one first (smaller), then translations rebases.

## Dependencies
None. No new package tonight.

## Questions for Alexis (defaults taken, he is asleep)
1. Is a copy of the places on the server acceptable (reading habits kept 90 days)? Default: yes, the account's own rows only, deleted with the account's data; if no, the feature waits.
2. Own world's pill: show it too? Default: no (its rooms already show counts); the open world shows nothing on its planet.
3. Counts mentions or all lines? Default: all lines by others in rooms the account may read.
4. Worlds with no known place? Default: no pill (never a false number).
5. Refresh rhythm? Default: 30 s while the full chat shows, on focus, on opening.
6. Pill look? Default: ui's `Badge`, top-right of the planet, 99+ cap; Alexis changes it live in the workshop.
