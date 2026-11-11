# Search: ⌘K finds where to go, the chat's search finds what was said

D13917 (`docs/decisions.md`, 2026-11-11), the canvas Alexis approved (https://claude.ai/artifact/MmYvckAYBK2p1jP8PzrsPo; the same screens as a
plain page, https://claude.ai/artifact/E3VhowNtZcpe7RkhbX3vx9; backlog row 4c, `docs/decisions.md` 2026-10-21: "public rooms first, through
`server`'s own index, which follows retention and erasure; a search never showing a line its reader cannot read"). Alexis: "implémente ça
proprement, en best practice, avec récupération du code existant, pas de copie ni de code mort, sans régression même visuelle ou UX".
A plan, no code. Every claim below cites a file I read in this session; what I did not verify is in section 10.

## 1. Done when

- **A, ⌘K.** The palette has the filters All, Places, Rooms, People; `#` finds rooms, `@` finds people and namespaces; a person's row has
  Message (it opens the DM as the chat already does); a room's row shows its preview at the right; the last row hands the typed words to
  the chat's search. The empty field (Discover), the chips, the sorts, `>` commands and `/r/` realms behave as today: no regression, no
  picture changed outside the new rows.
- **B, the index.** The server holds the lines of the world's *public* rooms for the 90 days Ergo keeps (`deploy/ergo/ircd.yaml.tmpl:137`),
  and answers `GET /api/search` for a reader only with the lines that reader may read. A line a moderator or its author removes, or the bot
  hides, leaves the index; an edit replaces the text; a DM, a members room or a hidden room is never in it. The index stays bounded.
- **C, the chat's search.** A field in the chat header (⌘F) opens a results panel in the info panel's place: results by day with In, From,
  Has a link and time filters; a click opens the room at the message, highlighted, with "Back to the latest"; full screen on a phone; the
  states of `States.dc.html` (before typing, nothing found, a conversation that is not searched).

## 2. What exists, and what the brief assumed that is not so

Reuse, with the evidence:

| Need | Exists | Where |
|---|---|---|
| The palette's modes and marks | `MARKS` `#` room, `@` namespace, `/r/`, `>` | `app/src/features/search/match.ts:8-13` |
| Rooms already indexed (as places' rooms) | `SearchIndex.rooms`, `namespaces` | `searchIndex.ts:17-26`; `SearchItem.rooms` in `types.ts` |
| Chips and sorts | `FILTERS`, `SORTS`, `SearchOptions` | `types.ts` |
| Results, left/right layout | `PaletteBody.tsx` (`TypedSheet`), `PlaceResults.tsx`, `PaletteLeft.tsx`, `PlacePreview.tsx`, `ToggleChips.tsx` | `app/src/features/search/` |
| Info panel slot | `ChatLayout`'s `info`, `infoFirst` (a thread already takes the panel's place) | `packages/ui/src/ChatLayout/ChatLayout.tsx:14`; `ChatScreen.tsx:93-183` |
| People and a DM's opening | `usePeople.tsx`, `People.tsx`, `Dms.tsx`, `dmOut.ts`, `names.ts` | `app/src/features/chat/` |
| Server route pattern with a reader's rule | `pinsRoutes`: `guard`, `refuserOf`, `limiter`, a `readable(room, who)` with no default, `session` cookie, Zod request, schemas in `@gnoworld/schemas` | `server/src/pins/routes.ts:1-70`; `server/src/stream/verdicts.ts:1-60` |
| The reader's rule | `mayRead(roles, room, who)`: open and announcement for anyone, accounts rooms for an account, members rooms for the invited | `server/src/rooms/types.ts:68-75` |
| Public-room tests | `publicRoom` (not members), `openRoom` (open and not hidden), `staffOf` | `server/src/rooms/types.ts:77-95` |
| The point where a line is known good | `passedLines(...)` runs after the bot's pass; `recent.passed` is its first call | `server/src/signals/signals.ts:108-115`; `server/src/chat.ts:167` |
| A line leaving or changed | `kept.onEdit(said)`, `recent.edited(said)` on hearing (an edit is a `Said` with `edits`); the pins' `drop`/`edited`/`check` and the link's REDACT handling | `server/src/chat.ts:136-147`; `server/src/pins/pins.ts:35-50`; `server/src/irc/reader.ts:39` |
| Retention's tick and 90 days | `ERGO_EXPIRE_MS`, one batch a tick, pins ended at `expire-time` | `server/src/retention/retention.ts:12-48` |
| Migrations | append-only `migrations` array, each SHA-256-pinned | `server/src/migrations.ts`, `migrations.test.ts` |
| Reads in the app | TanStack Query client and keys (D13973) | `app/src/lib/query/` (`client.ts`) |
| Tests' places for server routes | `server/src/*/routes.test.ts`, `limit.test.ts` | |

Corrections to the brief (read, not assumed):
1. **There is no jump to a line.** `lineFlash.ts` is the flash of a copy and a delete (`lineFlash.ts:1-2`); `lineFocus.ts` is the keyboard
   focus. Saved's "Open in room" is only a link to the room (`SavedView.tsx:44-49`, `roomHref`). Opening a room *at a message* is new work,
   and it needs an "around this message" history read the app does not have (it asks `CHATHISTORY BEFORE`, `app/src/features/chat/history.ts`,
   a window of `LINES_KEPT`). That is the heaviest part of C (section 5).
2. **The server does not "see" public rooms through the moderation's connection only**: it has one IRC link whose `onMessage` is `hearing`
   (`chat.ts:136`); a line is checked later by the queue, and only `passedLines` means "the bot passed it". The index must hang there, never
   on hearing (section 4).
3. **Ergo keeps 2048 items per room** (`channel-length: 2048`, `ircd.yaml.tmpl:132`) *and* 90 days. A busy room's ring is shorter than 90
   days, so the index can hold a line Ergo no longer serves: "open at the message" must have a fallback (section 5, question Q4).
4. Direct messages are `disabled` in Ergo's history (`ircd.yaml.tmpl:143`), and the link's room form is `#...` (`lines.ts:ROOM`); the server
   therefore never hears a DM. The test must still prove it (a `Said` of no `#` room is refused by the index).

## 3. The parts, in order

Order: **B, then A, then C** is the safest build order, but the brief's A, B, C are kept as the names. A has no dependency on B except its
last row; that row opens the chat's search, which only exists with C. **So A lands without the hand-off row, and C adds that row** (no dead
row, no stub). Three branches, two sessions at most; A and B can run side by side (disjoint files), C after B.

### A, ⌘K (app, tier 3: `app/src/features/search/` is a listed tier-3 folder in `docs/REVIEW.md`)

Radical mode (CLAUDE.md): no tier-1 file, so no test is written while it builds and no agent reviews it; the tests and journeys come at the
hardening slice. Still, test-first stays for **pure logic** (the new matching); display gets none.

Files:
- `match.ts`: `@` today means namespace; it gives people and namespaces. `MARKS` keeps one entry; `Parsed["mode"]` gains no new mark (the
  chip filters Rooms/People are the only new modes; `#` stays rooms). Reuse `fewestEdits`/`wordsOf`/the scorer, never a second matcher.
- `types.ts`: `SearchKind` gains `"room"` and `"person"`; `FILTERS` is a second axis (All, Places, Rooms, People) kept apart from the
  existing chips (which narrow places only: Worlds, DAO, Stations, Systems, People here...). Name collision: the existing chip "People here"
  vs the new filter "People": the canvas's `Main.dc.html` shows only the four kinds. Question Q1.
- `items.ts`, `searchIndex.ts`: rooms already come from `item.rooms`; people come from what the chat already knows (`usePeople.tsx`: the
  people present in the rooms; the worlds' file's namespaces for `@`). The index is built once per set of items, as today
  (`searchIndex.ts:1-2`); no per-keystroke work.
- `PlaceResults.tsx`: group headings "Places · 2", "Rooms · 3", "People · 2" (the canvas); a person's row with Message (calls the chat's
  existing DM opening, `Dms.tsx`/`dmOut.ts`, never a copy).
- `PlacePreview.tsx`: the room's preview (name, topic, here now, messages/hour, the last three lines): the chat's *lines' reading* (the
  line's text and author drawn as `Lines.tsx`/`LineView.tsx` draw them) is reused through one exported component, not copied; if the chat's
  line view is too tied to the room (it holds the menu), a small shared `LineText` is extracted in a refactor commit of its own first.
- `SearchPalette.tsx`: wiring only. The palette stays a lazy chunk (ARCHITECTURE.md:338).
- The activity numbers (here now, messages/h) come from the existing presence and activity reads (`server/src/presence/`, `activity/`; the
  app's `lib/api/presence.ts`, `activity.ts`) through TanStack Query; no new route.

Tests first (pure logic only): the mode of a query (`#`, `@`, no mark), the filter's effect on the results' kinds, the people's ranking with
the same scorer, `@` returning namespaces and people together with the kind in the result; the DM opening called with the person's address.
Existing `search.test.ts`, `SearchPalette.test.tsx` stay green unchanged (a test that must change is a stop-and-ask, CLAUDE.md).

### B, the index (server, tier 1: `server/src/` is "the rest of the server, tier 2", but the new route is a read guard over who may read what
at the edge, which `docs/REVIEW.md` lists as tier 1 for `guard.ts`, `limit.ts`, `config.ts`; the index is reviewed as tier 1 by choice:
red pass, `security-reviewer`, mutation check)

Files (all new unless marked):
- `server/src/search/index.ts`: `SEARCH_TABLES` (one migration, appended to `migrations.ts`, its SHA-256 added to `migrations.test.ts`),
  `makeSearch(db, {roles, now, ...})` returning `add(said)`, `remove(room, msgid)`, `edited(said)`, `expire(now)`, `query(...)`, `size()`.
- `server/src/search/routes.ts`: `GET /api/search`, built as `pins/routes.ts` and `stream/verdicts.ts` are (a `limiter`, `refuserOf`, Zod on the
  query, `readable` with no default, the `__Host-session` cookie). Mounted where `verdicts` are in `chat.ts:222` / `main.ts`.
- `server/src/search/wire.ts` or inside `routes.ts`: nothing else (no extra layer).
- `packages/schemas/src/search.ts` (+ `index.ts` export): `SearchQuery`, `SearchHit`, `SearchPage`; the app and the server both parse them.
- `server/src/chat.ts`: three one-line calls (see "Hooks"); `server/src/migrations.ts`: one line; `server/src/retention/retention.ts`:
  its tick calls `search.expire` (reuse its batch loop and `ERGO_EXPIRE_MS`, never a second timer).
- `server/src/config.ts`: the route's limits only if they are settings; otherwise constants in the module like `PINS_PER_MINUTE`.

**Storage.** `node:sqlite` is the server's database (backlog row 3). FTS5 and its `trigram` tokenizer are available in the Node 24.22.0 the
server builds on: I ran `create virtual table t using fts5(x, tokenize="trigram")` on 24.22.0 and it worked (no new dependency). Proposal:
- table `lines(rowid INTEGER PRIMARY KEY, room TEXT, msgid TEXT UNIQUE, account TEXT, at INTEGER, link INTEGER, text TEXT)`, indexes on
  `(room, at)` and `(account, at)`; an external-content FTS5 table `lines_fts(text)` over it with triggers (insert, delete, update) so the
  two never differ.
- `unicode61` with `remove_diacritics 2` for words (the chat is multilingual; ADR language). A `trigram` tokenizer finds substrings (`gov`
  matches `govdao`) and tolerates no operators; it costs about 3x the text in index size. Choice between them is Q3; recommendation:
  **`unicode61` with prefix search (`gov*`)**, which is what a person typing "quorum" expects and costs about the text's size, not three times it.
- Stores the **text as Ergo and the bot passed it** (the line is already public text in a public room; the pins table does the same,
  `pins.ts:15-23`), the account key as the verdicts keep it (the account's address, not the HMAC: the verdicts' HMAC exists to avoid keeping
  text and account together, `check.ts:3-4`; the index keeps both by design, which is a privacy change, Q2).

**Hooks (where a line enters, changes, leaves).**
1. *Enter:* `passedLines` (`signals.ts:108`) already runs only after the bot's `pass`. It is the single entry: wrap it once, as it wraps
   `recent.passed`, with `search.add`. A hidden or unchecked line never reaches it, so it is never indexed (a fault test: a hidden line is
   absent; an `unchecked` line (no key, queue full) is absent too, then indexed if a catch-up passes it later).
2. *Which rooms:* `add` asks `mayRead(roles, room, undefined) || room is an accounts room`, concretely: **index a room iff it is not
   members/members-write and not hidden/archived-secret** (`typeOf(...).hidden`, `+s`), i.e. `publicRoom && !hidden`. Today's helpers: `publicRoom`
   is *not* enough (it admits a hidden room and an accounts room); `openRoom` is too narrow (it excludes accounts and announcement rooms). So one
   new predicate `searchable(roles, room)` in `rooms/types.ts`, tested against all five room types and `hidden`. Q5.
3. *Reader's right at query time, not only at index time.* The index keeps one row per line; `GET /api/search` filters `room IN (rooms the
   reader may read)` using `mayRead(settings, room, who)` for each candidate *world* the request names, so a room's type changed after
   a line was indexed (open to members) hides its lines at once, with no re-index. A guest (no session) reads only rooms `mayRead(.., undefined)`.
4. *Edit:* a `Said` with `edits` (already seen by `kept.onEdit`/`recent.edited`): the replaced line's row gets the new text if and only if
   the same account wrote it (reuse `editsOwn`, `moderation/edits.ts`), else ignored. The edit is itself checked by the bot first (it comes
   through `passedLines` too), so an edit the bot hides never replaces the text.
5. *Erase:* the link's REDACT handling (`irc/reader.ts` `onRedact`, today feeding `pins.drop`) also calls `search.remove(room, msgid)`.
   A delete while the link was down: `pins.check` re-reads each pin from Ergo; the index has no such pass for a million lines, so
   erasures during an outage are caught by the **catch-up** (`moderation/catchup.ts`: lines after the mark are re-heard) only for new lines.
   Gap, named in section 5's threat model (E2): a line REDACTed in Ergo while the bot was down stays in the index until its 90 days. Mitigation:
   on each connection's "in the room" (`onIn`), the bot asks Ergo for the room's recent history and removes from the index the lines it
   no longer lists, bounded to the ring's 2048 items a room. Q6.
6. *Expire:* `expire(now)` deletes rows with `at < now - 90 d`, in the retention's tick batches (500 a batch), never one big delete.
7. *Moderation of an account:* a strike that mutes or bans does not erase old lines (Ergo keeps them); not in scope. An account erased
   by Ergo's account indexing erasure (ADR-0002): the index removes `WHERE account = ?` in one call `search.forget(account)`; its
   caller is the erasure flow if it exists in the server today. I did not find it in the files I read; Q7.

**The route.** `GET /api/search?q=...&world=...&room=...&from=...&link=1&since=...&until=...&page=...`
- Guard: `guard(origins, refuse)` like the others (a GET has no CSRF, but `cache-control: no-store` is set by it, and the results depend on the
  cookie); `session(getCookie(c,"__Host-session"))` is optional (a guest searches the open rooms), the visitor key for the limit is
  `visitor(c)` as in `verdicts.ts`, the account's address when there is a session.
- Zod (`SearchQuery`): `q` 2 to 100 characters after trimming, no control character, NFKC-normalised once; `world` is a `RoomName`-like slug
  (as `stream.ts`'s `RoomName`); `room` one of the world's rooms or absent; `from` an account address or a display name; `since`/`until` ISO
  dates within the 90 days; `page` an opaque cursor `(at,rowid)` signed? (no: a plain `before=<at>:<rowid>`; nothing secret in it, but it is
  validated as two integers and re-filtered by the reader's right on every page).
- The FTS query is **built from the words**, never passed through: each word quoted (`"word"*`), at most 8 words, joined by AND; the user's
  `"`, `*`, `NEAR`, `OR`, `-`, `:` and column names are neutralised by quoting. A raw `MATCH` with user text throws on syntax errors and
  exposes FTS5's operators (Q: tested with `"`, `*`, `NEAR(`, `a OR`, `x:y`, an empty word, a 100-character word).
- Answer: 20 hits a page, `{hits:[{room,msgid,account,at,text(snippet),link}], next, total?}`; the snippet is the line's text cut around the
  match, at most 240 characters, **plain text with the matched ranges as offsets** (never HTML from the server: the app marks it).
  `total` is a bounded count (up to 1000: "1000+"), a `count(*)` over a million rows is a cost.
- Limits: the visitor's `limiter` 20 a minute (a typing search is debounced to one call a 300 ms pause in the app), an account 60 a minute;
  query timeout is not available in `node:sqlite`, so the cost is bounded by the query (the `world` is mandatory: one world's rooms, the
  `(room, at)` index prefix, `LIMIT 21`), and by the `world`'s lines (O(rooms of the world x hits)).

**Cost and limits.** A line is about 120 bytes of text on average; with the FTS index (`unicode61`) about 2x: ~250 bytes/line. Capacity is
set by the database's own cap (256 MB, `retention.ts`'s `maxBytes`): the index shares that file. So the index needs a **row cap** like the
verdicts' (`maxVerdicts = 150_000` at about 1.2 KB each = 176 MB): proposal 400 000 lines (about 100 MB), the oldest first, *in addition* to the
90 days. It follows "retention (days and size)" (backlog 4c). Not measured: the lines per day of a real world (Q8); the plan's numbers are
estimates and the branch measures them on the onyx data before fixing the cap (a speed/size claim compares the same work before and after,
CLAUDE.md).

Tests first (each seen failing; red pass by the `test-auditor`; the mutation check on `server/src/search/`):
- the reader's right: a members room's line for a stranger, a guest, an account not invited (absent); the same for the invited (present); a
  room that becomes members after (absent at once); a hidden room (absent); an accounts room for a guest (absent) and an account (present).
- erasure: REDACT removes it; an edit by the author replaces the text; an edit by another account does not; an edit the bot hides does not;
  the replaced text is no more findable by its old words; a line hidden by the bot is never findable.
- the entry: an unchecked line absent; a `few` line (to operators alone, `lines.ts` `few`) absent; a `Said` whose room is no `#room` (a DM)
  absent; a bot's own or relayed line (D430) as the stream shows it today.
- the query: each operator character, an empty `q`, a one-character `q`, a 101-character `q`, 9 words, an emoji, an RTL text, a `q` of only
  stop characters; `world` missing, unknown or a room the reader may not read (403 or an empty page? Q9: 403 reveals existence; the stream
  and verdicts routes answer 403, so the same, `stream/verdicts.ts:36-38`); the page cursor tampered with (negative, text, huge).
- limits: the 21st request in a minute is 429; the limiter's key count is bounded (`limit.ts` `keys`).
- bounds: more lines than the cap leaves the cap and drops the oldest; 91-day-old rows go at the tick; the expiry batch never exceeds its size.
- the migration: appended last, SHA-256 pinned; a database at `user_version` N-1 migrates; the FTS triggers keep both tables equal after
  insert, update, delete (a test compares counts).
- enumeration (below): the same hits with and without the `account` filter for a reader who may read, nothing otherwise.

### C, the chat's search (app, tier 2: `app/src/features/chat/` is read as tier 2; the `ChatLayout` slot is tier 3 `packages/ui`)

Radical mode applies to the screens; the logic that decides *who may see what* is on the server (B), so C holds no tier-1 file.

Files:
- `app/src/features/chat/search/` (new folder, a late chunk): `ChatSearch.tsx` (the panel), `SearchField.tsx` (header field, or the existing
  `ChatHeader.tsx` slot: `ChatHeader.tsx` gets one button/field, nothing else), `filters.ts` (In, From, Has a link, Any time as pure functions
  from the field's words to the request, `in:#room`, `from:@kai`, `has:link` of `States.dc.html`), `useChatSearch.ts` (TanStack Query
  `useInfiniteQuery` on `GET /api/search`, the key including the world, the words and the filters; Zod through `SearchPage`; aborted by its
  signal; 15 s fresh, D13973), `Hit.tsx` (a result row: the author with `Person.tsx`, the room, the time as `LineHead.tsx` draws it, the
  snippet with its ranges marked).
- `app/src/lib/api/search.ts`: the call (as `lib/api/rooms.ts`/`pins.ts` are) with the schema from `@gnoworld/schemas`.
- `ChatScreen.tsx`: the `info` slot shows the search panel when a search is open, through the existing "thread takes the panel's place"
  mechanism (`ChatScreen.tsx:93-110`); no second switch.
- The jump (new, small, tested): `app/src/features/chat/jump.ts` plus a branch in the room's history reading: from a hit `(room, msgid)` the
  link asks `CHATHISTORY AROUND <room> msgid=<id> N` (IRCv3 draft/chathistory; **I did not verify Ergo v2.19.1 serves AROUND**, section 10),
  the window shows those lines, the line scrolled into view and highlighted (`aria-current` and the flash style of `lineFlash.ts` reused for
  the look), and the room's header shows "You are reading Nov 4, around a found message. Back to the latest ↓" (the canvas); the button
  returns to the live window (`LATEST`). `isCommandMsgid` (`history.ts:11`) guards the id before it goes into a command: a hit's msgid comes
  from the server's index, not from Ergo, so it is validated again (a msgid with a space or a comma would inject a second command).
- The phone's full screen: the panel is a `Dialog`-like full page under 900 px (the design system's `Dialog`/`Panel`, no new component);
  `infoFirst` is not enough (it puts the panel first, not over everything), to confirm with `Phone.dc.html`.
- States: before typing (recent searches kept on the device: `localStorage` through `lib/keep/`, as Saved is, with its `notKept`), nothing
  found (with "Remove from" and "Every world" actions), a DM / members room ("This conversation is not searched", shown when the current
  room is a DM or a members room: derived from the room's type the chat already knows).
- ⌘F: see Q10. The canvas says the browser's own find still reads the screen; if ⌘F is taken by the app, the browser's find is lost in the
  chat. Recommendation: **⌘F only when the focus is in the chat and not in a field, and the field's "/" like the palette's**
  (`chord.ts` already has "/" and ⌘K; reuse its `typedIn` test), keeping the browser's ⌘F elsewhere. The hand-off row of A (added here)
  opens the chat's search with the words and `chord.ts` unchanged.
- The hand-off row (A's last row, added in this branch): "Search messages for “gov” in the chat ⌘F" opens `/earth` or the world's chat with
  the panel and the words; it needs the world: from the current world, else the Earth (Q11).

Tests first (tier 2: tests read first by Alexis): `filters.ts` (the words to a request: `from:@kai treasury`, `in:#govdao`, `has:link`, a
quoted phrase, a `from:` with no name), `jump.ts` (the command built, the id refused when not a msgid, the "around" window and "back to
latest"), the hit's snippet marking (ranges beyond the text refused: a server answer is parsed, never trusted), the states.
One journey (Playwright), written by the session that writes C, when the screen is validated: type in the chat's field, a result opens its
room at the message, Back to the latest (CLAUDE.md "No regression": a critical flow only).

## 4. Threat model (the four of the brief, plus the rest)

Assets: what people said in rooms, who said it, and the server's time. Entry points: `GET /api/search`; the index's hooks in the link; the
app's jump command to Ergo.

- **T1, a search that reads a line its reader cannot.** Members and members-write rooms, hidden (+s) rooms, an accounts room for a guest, a
  DM (never heard). Mitigation: a room is indexed only if `searchable`; and at query time every candidate room is checked with `mayRead` for
  the *reader* (section 3, B.3), so a change of a room's type or a reader's invite applies at once; a guest reads only what a guest could
  read through the stream. `readable` has no default (as `pins/routes.ts:38` demands). Tests: section 3, B. Risk if wrong: a members room's
  lines leak to anyone, the worst failure of the feature (ADR-0002 private rooms promise).
- **T2, a removed line found again.** Delete (REDACT), hide, edit, expiry, an account's erasure, a line removed while the link was down.
  Mitigation: the hooks of B.4 to B.7; a removed line is deleted *from the index and the FTS table in one transaction*, never flagged; the
  snippet is read from the index only, so a line that left Ergo leaves the answer. The known gap (an offline redaction, B.5) has a bounded
  reconcile and a ceiling of 90 days; say it in the review card, not hide it. FTS5 deletions leave tokens in the index's segments until
  merged: the `delete` of external-content FTS5 removes the entries; a `PRAGMA secure_delete` or a periodic `optimize` is needed so freed pages
  do not keep removed text on disk (the retention's measures see used pages): to verify (section 10).
- **T3, a query that costs the server.** Long queries, many words, a wildcard-only `*`, a regex-like FTS operator, deep pages, a flood from
  one visitor or from many guests, a `COUNT` over everything. Mitigation: B's Zod caps, the quoted-word builder, a mandatory `world`, the
  `(room, at)` prefix, `LIMIT 21`, a bounded `total`, a per-visitor and a per-account `limiter`, one prepared statement per shape. The
  server is one process (ADR-0002 §7): a slow query blocks its event loop (`DatabaseSync` is synchronous), so the **worst case is timed**
  in a test on a database of the cap's size (400 000 lines): the plan sets a budget, e.g. 50 ms, and the branch measures it (a claim
  with a number needs both numbers, CLAUDE.md); if it fails, the answer is a worker thread or a smaller cap (Q8), never a raised budget.
- **T4, an enumeration of who said what.** `from:` plus time filters let anyone list every line of an account across a world's public rooms
  (all of which are public to read anyway), and `account` is shown in every hit. Public rooms are already readable by a guest, so no new
  secret, but search changes the *cost* of profiling a person (a stalker reads one account's lines over 90 days in seconds). Mitigations:
  `from` needs a `q` of its own (a search by author alone is refused: `q` is always required, 2+ characters); the per-account limiter;
  a hit shows the address as the chat shows it (`Person.tsx`/`shortAddress`, no new field); no export; no `from` without a world. A person's
  right to hide their lines from search is a product decision: Q2.
- **T5, an injection by the stored text.** The snippet is anyone's words: the app draws it as text and marks ranges by offsets, never as
  markup (the rule `SavedView.tsx:2-3` states for saved lines); the server never builds HTML; `q` is never put in the FTS syntax raw. A
  `msgid` from a hit goes into an IRC command: validated by `isCommandMsgid` (the injection of a second command), tested with a space, a
  comma, a newline and a leading colon.
- **T6, the index as a copy of text that moderation hid later.** The bot checks a line *before* the index sees it (B.1); but a later hide
  (a moderator's REDACT) is B.5. A line passed and later flagged by a moderator leaves through REDACT; a line passed by the bot on a second
  review is not a case today (the verdict is final: `verdicts` has one row per msgid).
- **T7, privacy by logs.** The route logs `route`, `status`, `error` (as `refuserOf` does) and never `q`: a search is what a person is
  curious about. A test reads the log of a successful and a refused request and finds no query text.
- **T8, availability.** The index failing (a full disk, a locked database) must not stop chat: `search.add` is wrapped so its error is
  logged (an alert, once a crossing, as `retention.ts` does) and the line still goes to the stream. The route answers 503 `not_ready`. A
  test: an `add` that throws leaves the stream's delivery intact.

## 5. Cost, weights and the first screen

- The search's code is a late chunk: the palette's additions are in the existing lazy `features/search` chunk (ARCHITECTURE.md:338; no new
  chunk for A); C's `features/chat/search/` is loaded on the first ⌘F or click of the header field (`lazy`, as `Discover` is,
  `PaletteBody.tsx:14`), **never imported from the chat's first-screen files**: the header button imports only an icon and a `lazy` loader.
  The size gate (`docs/ARCHITECTURE.md`, "Budgets the gate checks") must show the first screen's chunks unchanged, byte for byte: both
  numbers in the review card (a 256 B margin is allowed on a *late* chunk, never on the first screen, CLAUDE.md). The new TanStack
  `useInfiniteQuery` is in the already-installed `@tanstack/react-query`: no new dependency.
- No new third-party dependency anywhere: FTS5 is in `node:sqlite`, the grouping and the date headers are `Intl` and `Date` (reuse the chat's
  own day separator if `Lines.tsx` has one: to grep before writing).
- The server's cost: section 3 B, to be measured.

## 6. Journeys to write (by the session that writes the part, once the screen is validated; no picture, CLAUDE.md)

1. ⌘K: type `gov`, switch to Rooms, open a room's row; `@kai`, Message opens the DM. (A)
2. The chat's search: type a word, a result opens its room at the message highlighted, Back to the latest returns to the live end. (C)
3. A guest searches an open room and finds no members room's line: on the real stack through `deploy/test.sh` (a members room of the test
   realm, a line in it, a guest and a non-invited account see nothing). This one is the security journey and it is run by Alexis on the
   integration branch, as `deploy/test.sh` is (CLAUDE.md), because it touches the server's edge.
4. Erasure: send a line, find it, delete it, search again: gone. (B+C, the same stack.)

The pixel work: the canvas is the reference, read by eye with side-by-side crops per block (memory: build-to-the-proposal); no screenshot
is added to the baseline (CLAUDE.md).

## 7. Reviews, tiers and the merge

| Part | Tier | Red pass | Reviewer | security-reviewer | Mutation (StrykerJS) | `deploy/test.sh` |
|---|---|---|---|---|---|---|
| A | 3 (`features/search/`) | no (radical mode) | no | no | no (tier-3 only) | no |
| B | server; reviewed as tier 1 by this plan | yes | yes | yes (reader's right, erasure, query building) | yes; each guard in `GAPS` or killed | yes: touches the edge (a new public route) |
| C | 2 | no | yes at the part's end | no | no | no |

B is about 400 lines of product code or less, or it is cut again: **B1** the table, the hooks and expiry (no route), **B2** the route and
its limits. B1 is merged and reviewed first (the index exists and is tested, nothing can read it), B2 opens it. This keeps the 400-line
tier-1 cap (`docs/REVIEW.md`, item 3). `scripts/guard.py` and the harness are untouched (no harness change; if a check is wanted, it comes
with its fault, CLAUDE.md).

Decisions to record in `docs/decisions.md` as they are made (one row each): the room set (Q5), the tokenizer (Q3), the row cap (Q8), ⌘F (Q10).

## 8. Stop and ask (CLAUDE.md's list, applied)

- **A new dependency:** none planned. FTS5 is built into the server's `node:sqlite`; if the pinned Node ever lacks it, stop.
- **A store's shape / a schema in use / a realm's storage:** B adds a table and a migration (append only, no change to an existing one);
  stop and ask if an existing table must change.
- **A committed public signature:** `SearchItem`/`SearchKind` (app, internal) grow; `Said` and `hearing`'s `Heard` are *not* changed
  (the index hangs on `passedLines`); if `passedLines`'s signature must change to carry the index, stop and ask.
- **A test that must change:** any of `search.test.ts`, `SearchPalette.test.tsx`, `chat.test.ts`, `retention.test.ts` failing after a change.
- **Anything touching secrets, permissions, the sandbox or deployment security:** the route's reader rule; the `deploy/` files, if the
  server's CSP/`connect-src` or the proxy must know `/api/search` (check `deploy/` and `app/src/cspOrigins.ts` before; the route is
  same-origin under `/api`, like `/api/pins`, so none is expected: verify).
- A diff growing past the plan: B past 400 lines.
- The same problem corrected twice.

## 9. What Alexis must decide (questions, with my recommendation)

- **Q1.** The filters All, Places, Rooms, People next to today's chips (Worlds, DAO, Stations, Systems, People here, Active, New, Not
  visited): one row of both, or the four kinds as tabs and the chips only under Places? Recommendation: the four kinds as the canvas draws
  them; the chips show only while Places or All is active; "People here" stays a chip of places (people in a place), not the People kind.
- **Q2.** The index keeps *who said what* in clear (the account's address), where moderation deliberately keeps only an HMAC. Do you accept
  it for public rooms' lines, which are public anyway? Is there an opt-out for a person ("hide my lines from search")? Recommendation: accept;
  no opt-out now; an erasure removes the person's lines (B.7).
- **Q3.** Tokenizer: words with prefix (`unicode61`, small, finds "quor" as `quor*`) or substrings (`trigram`, finds "ovdao" in "govdao", about
  3x the size). Recommendation: words with prefix.
- **Q4.** A found line older than what Ergo's ring still serves (2048 items a room, so a busy room is shorter than 90 days): show the hit
  alone with "This message is older than the room's history" and no jump, or index only what Ergo still holds (and drop the line from the
  index when the ring pushes it out)? Recommendation: the second, simplest and consistent ("a message you can open"): the index follows
  `min(90 days, the ring)`; costs: the index has to learn the ring's drops (it cannot hear them), so in practice a cap by room of 2048 lines
  newest first. Needs your word.
- **Q5.** Which rooms are searched: open and announcement and accounts rooms, not hidden? (Accounts rooms read by an account only, so a guest
  finds none of them.) Or only `openRoom` (open, not hidden, what a guest sees and what "first words" use)? Recommendation: open,
  announcement and accounts, never hidden, never members; each filtered by `mayRead` at query time.
- **Q6.** The offline-redaction gap (B.5): accept it with the reconcile at each connection (bounded to the ring), or no reconcile and a
  documented ceiling of 90 days? Recommendation: the reconcile.
- **Q7.** Is there an account-erasure flow in the server today (ADR-0002's "export or erasure")? I found only Ergo's `enable-account-indexing`
  setting (`ircd.yaml.tmpl:147`). If an erasure exists or comes, the index must be in it; where is it?
- **Q8.** The index's cap (proposal 400 000 lines, about 100 MB of the 256 MB database) and the 50 ms worst case: accept as a starting point
  to measure, or give me your own numbers? If the measure fails: a smaller cap or a worker thread?
- **Q9.** A request for a world or room the reader may not read: 403 (as the stream and the verdicts do) or an empty page (reveals
  nothing)? Recommendation: 403 as today, for consistency; a hidden room's existence is then not told by an empty page vs 403 only if the
  room is hidden, so for a hidden room answer the same as an unknown one (an empty page).
- **Q10.** ⌘F: the app takes it in the chat (the browser's find is lost there, the canvas says "your browser's own find still reads what is on
  screen" in the not-searched state) or keeps the browser's ⌘F and uses ⌘⇧F / `/`? Recommendation: ⌘⇧F and `/` in the chat when not typing,
  ⌘F left to the browser. This differs from the decision's text ("⌘F"): you decide.
- **Q11.** The hand-off row from ⌘K, outside a world's page (home, space): search which world's rooms? The Earth, the last chat's world, or
  ask? Recommendation: the world the palette was opened from, else the Earth.
- **Q12.** One world at a time (the canvas: "Search messages in GovDAO", "Every world" as a button): confirm that "every world" is one request
  per world listed or one server-side fan-out, and its cost. Recommendation: no "every world" in the first version; the canvas's button is
  drawn but hidden until B can answer across worlds with a bounded cost. **This departs from the approved canvas**: say if you want it kept.

## 10. Not verified, to check before or in the branch

- That Ergo v2.19.1 answers `CHATHISTORY AROUND` with `msgid=` (the app only uses BEFORE and LATEST: `history.ts`); read the pinned Ergo's
  source or test it in 3b's way (`docs/plans/slice-3.md`). If not, the jump is a window of `BEFORE`/`AFTER` pages: more work in C.
- That FTS5 with `secure_delete` (or `optimize`) leaves no removed text on disk pages; measure with a copy of the file and `strings`.
- The lines a day of a real world, so the cap's real age; the query's real cost at the cap; both are measured on the same data before and
  after, in the branch.
- That `node:sqlite` on the server's runtime image has FTS5 (I ran it on 24.22.0 locally, not on the deployed image).
- The canvas's `Alt.dc.html` (an alternative) was not read in detail; the plan follows `Main`, `ChatSearch`, `Phone`, `States`.
- The existence of a day separator, a time format and a `LineHead` reuse in `Lines.tsx` for the results' day groups: grep when writing C.
- Whether the hand-off row can live in the existing `PaletteBody.tsx` or needs the router's route (`/earth?search=`): to read when writing C.

## Alexis's answers (2026-11-11, D13924)
Q4: the index holds only what a reader can open: `min(90 days, Ergo's 2,048 items a room)`, a cap by room of 2,048 lines newest first.
Q10: ⌘⇧F and `/` (when not typing) open the chat's search; ⌘F stays the browser's (this changes the canvas's "⌘F").
Q12: no "Every world" in the first version (one world at a time); the button comes when the server can answer across worlds at a bounded
cost (this departs from the approved canvas, with his word).
Q1-Q3, Q5, Q6, Q8, Q9, Q11: the plan's recommendations. Q7 (an account-erasure flow): none found today; the index joins it when it comes.
