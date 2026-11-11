# Private rooms (D13989)

Decisions: D13989 (the row), D394 (the Earth's public rooms, the "+" and the small dialog), D13935 (the dock's "+"), D13930 (the order of
the big parts: this is the last), D13936 (the owners' moderation, whose maker's right this reuses), D13924 (the search skips members rooms),
all in `docs/decisions.md`. Written 2026-11-11 by reading the code named below; nothing here is built. A fact not read in this session
is marked "to verify" with the way. The plan's own numbers are proposals (section 11), not Alexis's words.

## 1. Done when

- A signed-in account makes a private room on the Earth ("Private" in the "+" dialog). It is its owner. Nobody else sees it, in a
  list, a count, a search, a stream, a history, a card, Jarvis, a signal or Ergo's `LIST`, until the owner invites them and they accept.
- The owner invites by name (`r/sys/users`) or by address. The invitee gets a notice in the bell, with the room, the inviter and
  Accept / Decline. Nothing is a member until it accepts.
- A member leaves. The owner removes a member. The owner closes the room (archive: read-only, still the members').
- The server's table is the list. Ergo holds it as `+i` and `+I` entries, put there by the reconciler from that table, as the roles
  file's members rooms are, and put back after a restart, a lost channel or an operator's drift.
- The room says "Not encrypted" with the words a direct message uses (`NOT_ENCRYPTED`, `app/src/features/chat/Dms.tsx:13`: "Not
  encrypted: the server can read these.", and the chip "Not encrypted"). It does not claim more: the operator can read it (section 7, row 12).
- First screen untouched; the chat chunk grows by 512 B at most, the rest in lazy chunks.

## 2. Out of scope

Encryption (MLS stays phase 1, `docs/plans/backlog.md` phase 2). A private room in a world other than the Earth. Turning a public room
private or the reverse (section 8, no toggle). Naming a second owner, transferring ownership. A person's block list. Reports to the team
about a private room (the team has no right in it, section 6). A private room's history export.

## 3. What the code does today (read; `file:line` where it matters)

- **A room's type is the roles file's alone.** `rooms/types.ts` answers `mayRead`, `listed`, `desired` (flags and invites), `publicRoom`,
  `openRoom`, `staffOf`, `hiddenRoom`, `searchable` from `typeOf(roles, room)`, a synchronous read of the file; a room it does not type is
  `open`. `Typed` is `{team, worlds}`. A `members` room's invite list is `staff + group(readers)`, so **today the team reads every
  members room**, and `staffOf` (team and the world's moderators) is also the pin right (`pins/wire.ts:41`) and the hidden-room
  right (`listed`). A private room must break both (section 6).
- **How a list reaches Ergo.** `desired()` gives `modes` (`Mi` for members, plus `s` when hidden), `invites` (sorted), `voiced`. The
  reconciler (`rooms/reconcile.ts`) reads each room's state, then sends `SAMODE +/-flag`, `+I` and `-I` (a wildcard an operator set
  included), strips powers above voice, and `KICK`s anyone present in a `+i` room who is not on the list ("not on this room's list").
  It runs every 60 s (`chat.ts:206`), on each JOIN of a room that voices someone, and `onReady` (`chatParts.ts:86`): `flags()` first
  (`+M +i ...` on every room before any state is read, so a room Ergo lost is closed from its first line), then `ask()`. A pass is
  one room at a time ("a pass lasts rooms x Ergo's answer", `ponytail:` in `reconcile.ts:104`). Ergo's invite list holds 100 entries
  (`limits.chan-list-modes`, `deploy/ergo/ircd.yaml.tmpl:123`; `roles.ts:118` checks it for the file).
- **Ergo's defaults** (`ircd.yaml.tmpl:88-98`): channels are born `+ntCMi`, only an operator creates one (the bot, which `SAJOIN`s and
  `SAMODE`s), a client may be in 100 channels, history is 90 days, persistent for unregistered channels too.
- **Making a room** (`rooms/routes.ts`, `rooms/create.ts`): `POST /api/rooms {world:"earth", name}` for a signed-in non-moderator goes to
  `publicRoom`: reserved-name check, `tries` limiter (10 an hour), `mayEarth` (name free, `EARTH_PER_DAY` 3, live 1,000, rows 5,000),
  the name through `nameCheck` (a paid OpenAI call among others), then `rooms.earth(maker, name)`: one `rooms` row, one `earth_rooms` row
  (`maker`), `JOIN`, `SAMODE +M`, `SAMODE -i`. `DELETE /api/rooms/earth/<name>` archives (`+m`, `+s`) for the maker (`rooms.maker`) and the
  moderators, and refuses a name `RoomName` refuses (32 characters).
- **The maker's right** (owners' moderation, landed): `mayModerate` (`roles/mayModerate.ts`) gives `{as:"maker"}` when
  `chat.rooms.maker(room) === who` (`roles/wire.ts:97`), `{as:"staff"}` from `chat.mayPin` (= `staffOf || maker`), `{as:"owner"}` from a chain
  namespace (`placeOf` is `undefined` for the Earth, so none there). Its routes: pin and unpin, hide (`REDACT`), mute
  (`moderation/routes.ts`). **The mute reaches every room of the room's world** (`routes.ts:102-105`: `roomsOf(world)` all
  `mayModerate`, else `refused`); on the Earth no maker holds every Earth room, so a private room's owner can never mute, which is the right
  answer here (a mute of the whole Earth for something said in a private room is not the owner's to give). The tool for an owner who
  wants a person gone is Remove.
- **Who reads, everywhere, goes through `mayRead(roles, room, who)`** (the stream's `visible`, the verdicts route, the pins' `readable`,
  `roles/wire.ts:72,115`, the search's `covered`, Jarvis's two doors, `chat.mayRead`) and, for a guest-readable test, through
  `mayRead(roles, room, undefined)` (cards, `cards/flow.ts:124`), `openRoom` (first signals), `publicRoom` (OpenAI's check,
  `moderation/check.ts:166`: a non-public room is judged by rules alone; Jarvis's recent lines, `door/lines.ts:68`),
  `searchable` (the index, `search/index.ts:120`) and `guestAccess` (a guest writes only in `type === "open"`).
  So a private room that answers these as a `members` room does is excluded from search, cards, OpenAI, first signals, guests and
  Jarvis's lines at once. What it does not do alone: two Jarvis doors that gate on `mayRead` (`door/ask.ts:76`, `door/translate.ts:34`) let a
  member ask from, and translate a line of, a private room, which sends its text to the model; they get an extra refusal (part 1).
- **Streams read the rule once, when they open** (`stream/stream.ts:201`: `seen = asked.rooms.filter(visible)`), keep `client.rooms` for
  the connection's life and replay each room's ring to a new client by the same filter. A member removed while a stream is open would
  keep receiving verdicts. Part 4 adds a revoke.
- **The search route** answers a hidden or unknown room with an empty page and a room the reader may not read with 403
  (`search/routes.ts:103-109`): for a private room, that difference is an existence oracle; `hiddenRoom` true makes it the empty page.
- **Names to addresses.** `packages/core/src/chain/evalName.ts` has `isName` (`r/sys/users`' grammar), `isAddress` and `evalOwner(name)`,
  which asks `ResolveName(name)` for the current, undeleted holder's address; `roles/owners.ts` `makeOwnerReaders` wraps it with a 5 s
  timeout, a 1 KiB cap, a 60 s cache, 4 reads in flight, 1,000 an hour, a few a visitor, two pools (`act`, `show`), so an invite by name
  reuses that reader (and a third pool of its own, so a flood of invites never starves an owner's right, F13831's lesson).
- **Notices (the bell) are the client's.** `Noticer` (`app/src/features/chat/noticing.ts`) makes a notice from each IRC line addressed to
  the account; the server stores none. An invite is not an IRC line, so it needs a server list the page asks for.
- **Accounts**: `accounts (address, first_seen)`; no account deletion route exists in the code (erasure is promised by ADR-0002, not
  built): a `forgetAccount` is written and tested, and called by whatever erasure comes.
- **Names the app already strips**: `roomLabel` removes a trailing `-[0-9a-f]{10}` (`names.ts:29`, made for realm rooms), so a room id
  `#earth/<label>-<10 hex>` already shows as `#<label>` with no client change.

## 4. The design in one paragraph

A private room is an ordinary `rooms` row (world `earth`) plus a row in `private_rooms` (its owner, its label) and one `private_members`
row for each member, owner included. Its id is server-made, `#earth/<label>-<10 random hex>`: the label the person typed (21 characters
at most, so the id fits `RoomName`'s 32), the hex from `crypto.randomBytes`. So nobody can ask "does this name exist", and no private
room takes a public name. `typeOf` learns a source beside the file: `Typed.privates`, a small object (`isPrivate(room)`,
`membersOf(room)`/`isMember(room, who)`) over prepared statements, so a private room answers as a members room whose list is its table
(statement per call, microseconds; `roomWorld` does the same per line: a `ponytail:` comment names the ceiling, an in-memory set if the
rate grows). Ergo's modes for it are `M i s` (accounts speak, invite-only, secret) and its `+I` list is exactly its members.
`staffOf` is false for it, so the team and the world's moderators neither read, list, pin nor hide in it; only the owner holds a right
(`as:"maker"`, the existing path), and that right is pin, unpin and hide, never mute.

## 5. The parts, in order

Each part: its own branch and session, at most two at once, tests first and failing, the `test-auditor` red pass, then the code, then the
`reviewer` and, for a tier-1 part, the `security-reviewer`. About 400 product lines a tier-1 part at most; the split follows that.

**On the tiers.** `docs/REVIEW.md`'s table names `server/src/roles/`, `server/src/login/`, `guard.ts`, `limit.ts`, `config.ts`, and not
`server/src/rooms/`; as written, `rooms/types.ts` (the file that decides who reads a room) is tier 2, and the branch workflow's security
lens and the mutation check key on that table. The plan treats parts 1 to 4 as tier 1 as the brief says, and asks (section 12, Q8) that
Alexis add `server/src/rooms/types.ts`, `server/src/rooms/private/` and `server/src/stream/stream.ts` to the table (a harness file).

| Part | What | Files | Tier |
|---|---|---|---|
| 0 | Alexis's answers (section 12); the table's three paths (Q8) | `docs/REVIEW.md`, `docs/decisions.md` | harness |
| 1 | **The store and the rule**: tables, the private source in `Typed`, every feature that excludes a private room, the Jarvis doors' refusal | `server/src/rooms/private/store.ts` (new), `rooms/types.ts`, `rooms/list.ts`, `chat.ts` + `chatParts.ts` (`listedTo`), `guest/access.ts` (no change, asserted), `door/ask.ts`, `door/translate.ts`, `search/routes.ts`, `migrations.ts` + pinned hash | 1 |
| 2 | **Making, and Ergo in step**: `POST /api/rooms/private`, the caps, the label's rules-only check, `Rooms.private`, `maker`, reconciler desired, the sweep | `rooms/private/routes.ts` (new), `rooms/create.ts`, `rooms/wire.ts`, `rooms/roomsBoot.ts`, `rooms/types.ts` (`desired`), `moderation/name.ts` (rules-only), `rooms/earth.ts` (sweep) | 1 |
| 3 | **Invites**: create (name or address), list mine, accept, decline, cancel; the name pool; expiry | `rooms/private/invites.ts`, `rooms/private/routes.ts`, `roles/owners.ts` (+ one pool), `retention/retention.ts` | 1 |
| 4 | **Members**: list, leave, remove, close; the stream's revoke; kick at once; `forgetAccount` | `rooms/private/routes.ts`, `rooms/private/store.ts`, `stream/stream.ts` (`revoke`), `chat.ts`, `rooms/wire.ts` | 1 |
| 5 | **The screens** (5a after part 2, 5b after 4) | `app/src/lib/api/privateRooms.ts` (new, Zod on every answer), `NewRoom.tsx`, `PrivateMembers.tsx`, `InviteDialog.tsx`, `features/notifications/` (invites in the bell), `ChatHeader` mark, `RoomView` menu | 2 (3 for pure views) |
| 6 | **Journeys, the real-Ergo checks, hardening** | `app/e2e` (to find), `server/src/testing/ergoChat.test.ts`'s pattern, `deploy/test.sh` run by Alexis | end |

Order: 1, 2, then 3 and 5a in parallel (two sessions, no shared file), then 4, 5b, 6. Each part stands alone: after part 1 nothing is
private yet (no way to make one); after 2 a person can make a room only they are in; 3 and 4 add the others.

### Part 1, the store and the rule

- **Tables** (section 8). `private/store.ts`: the prepared statements and `makePrivates(db)` returning `{isPrivate, isMember, membersOf,
  roomsOf(account), ownerOf}`; Zod on every row (the file's style).
- **`Typed`** gains `privates?: Privates | undefined` (optional: every existing caller and test that builds a `Typed` is untouched).
  In `types.ts`, `typeOf` returns `{type:"members", hidden:false}` for a private room, and `people()` gives its invites from
  `membersOf`: so `mayRead` (members only, a guest never), `publicRoom` (false), `openRoom` (false), `searchable` (false), `roomType`
  (`members`) and `guestAccess` (not `open`: no write, no read) follow with no new branch. Three explicit branches, each with its test:
  `staffOf` false for a private room (the team never reads, lists, pins or hides); `hiddenRoom` true (the search's empty page, the cards'
  exclusion); `desired`: modes `Mis` whatever, invites = members, voiced none (`m` when archived, as today's rule).
- **Listing.** `listed` for a private room: a member only. `listedTo` (`chatParts.ts:28`): an archived room is a hidden one for staff
  today; for a private room it stays the members' (read-only).
  `RoomList`'s `ListedRoom` is `z.object` (not strict) in `packages/schemas/src/rooms.ts`: it gains one optional field `private: true`
  (additive; an older client ignores it; the type stays `"members"`, so the enum is untouched and a stale PWA still parses the list).
  Q3 asks for the word.
- **Jarvis**: the two doors refuse a private room (`mayRead && !isPrivate`): a member may not ask from it or translate its lines.
- **Counts and presence**: `presentFor`'s `open` is `visible(room, undefined)`, false for a private room, so no count, no `here` and no
  trend sees it (to verify with a test: the trends' "usual" in `worlds/present.ts`, which reads `rooms: () => listRooms(db)`, filters by
  `open`; the test plants a private room with people and checks the world's numbers do not move).
- **Not touched**: `reconcile.ts`, `create.ts`.
- Lines: about 330.

### Part 2, making, and Ergo in step

- **Route** `POST /api/rooms/private {label}` (new sub-router mounted before `/api/rooms`, as `realm` is). Its order: `guard`
  (Origin, JSON), session, body (Zod strict; `label` is `RoomName`'s slug at 21 characters), reserved check not needed (the id is
  random), limiter (a `tries` of its own), caps, the label's check, then `rooms.private(owner, label)` in one SQLite transaction
  (`rooms` row, `private_rooms` row, owner's `private_members` row) before any `await` after the check. `201 {room}`.
- **Why a route of its own and not a flag on `CreateRoom`**: `CreateRoom` is a committed `strictObject`; its own route has its own
  guard, limits and refusals, and a failure of it cannot change the public route's behaviour.
- **The label's check**: the same rules as a message of the Earth (banned words, links, mentions) and **not** OpenAI: a private room's
  label may be the very thing it is private for, and a members room's lines already skip OpenAI (`check.ts:166`). `moderation/name.ts`
  (`makeNameChecker`) gains a rules-only mode (to verify: whether it already takes no provider; read it first). An unavailable check
  refuses (`not_ready`), as today.
- **Caps** (proposals): 3 a day an account for private rooms (a counter of its own, so private making never uses the public 3), 20 live
  owned rooms an account, 1,000 live private rooms in all, 5,000 rows ever (an archived room keeps its row, as the Earth's do).
  The in-all caps exist because the reconciler passes every room (cost, section 11).
- **`Rooms.private`** in `create.ts` beside `earth`: the same `open()` (a `rooms` row, `JOIN`) but its modes are `SAMODE +M`, `+i`, `+s`,
  never `-i`, and its `+I` is put by the reconciler. `keeping()` (`rooms/wire.ts`) puts the live mutes on it as for any room of the world
  (`mutes.putOn`: a world mute of the Earth already muted there stays muted) and asks the reconciler at once.
- **`maker(room)`** returns the owner for a private room (one `UNION ALL` statement), so `mayModerate`'s `as:"maker"` and the existing
  `DELETE /api/rooms/earth/<id>` (close = archive) serve it unchanged. Part 2 asserts the owner's pin and hide work, the owner's mute is
  refused, and a world moderator or a team member's pin, hide and archive of a private room are refused (`staffOf` false and `maker`
  is not them).
- **Ergo in step**: `desired` for a private room returns `Mis` plus `m` when archived, invites = members; `flags()` at `onReady` sends
  `+M +i +s` for every private room first, `ask()` after, which pushes `+I` for each member (section 6 of this plan, "How the server
  keeps Ergo in step", below).
- **Sweep**: `sweepIdle` joins `earth_rooms`; a private room idle for 60 days (proposal; Q6) is archived through
  `rooms.archive`, which already asks the reconciler. A private room is never swept by the public 14 days: a quiet group is not a dead room.
- Lines: about 380.

### Part 3, invites

- **`POST /api/rooms/private/<name>/invites {to}`**. Order: guard, session, body (`to`: a string of at most 64 characters, an address
  (`isAddress` and the schema's `Address`) or a name (`isName`); anything else `body`), the owner's right (`private_rooms.owner ===
  session`, else the same `not_found` as for a room that does not exist), limits, then the resolution: an address as is, a name through the
  invite pool's `lookup` (current, undeleted holder; "nobody" is `not_found`, a failed or limited read `not_ready`), then the insert.
  An invite to oneself, to an existing member and to an address with a pending invite to this room are `exists` (one refusal shape; it
  tells the owner, who knows their list). The invite stores the **address**, never the name (a name moves).
- **The insert** is one statement that holds the caps: pending invites in the room under 20, members under the room cap (50), the
  inviter's invites in the last hour under 30, the invitee's pending invites under 30 (`INSERT ... SELECT ... WHERE (SELECT count(*)
  ...) < ?`), as the links plan's member cap does. Expiry: 7 days. `id` is 128 random bits, hex.
- **`GET /api/rooms/private/invites`**: the account's pending, unexpired invites: `{id, room, label, from (address), at}`. No other
  field. `cache-control: private, no-store`. It tells an invitee the room's label and the inviter's address, which is the point; it
  tells nobody else anything.
- **`POST .../invites/<id>/accept`** and **`/decline`**: the id is not a secret (it is bound to the invitee's account), so it is stored
  as it is, and the check is the account: `DELETE FROM private_invites WHERE id = ? AND invitee = ? AND expires_at > ? RETURNING room`,
  one statement before the first `await`; zero rows is one refusal for unknown, expired, someone else's and already used. Accept then, in the
  same synchronous turn, inserts the member with the cap in the statement, and a room archived, or past its members cap, is a refusal
  that has already spent the invite (the owner re-invites). After the insert: `reconciler.ask(room)` (the `+I` goes to Ergo), the answer
  carries the room, and the page joins. Decline deletes the invite and writes a `declined` row kept 7 days (`private_declines (room,
  invitee, until)`), so the owner cannot invite that person again to that room within it (the answer to a harassing repeat, Q5).
- **`DELETE .../invites/<id>`** by the owner cancels.
- **The name pool**: `makeOwnerReaders` returns `{act, show}`; part 3 adds `invite` (one more `reader()`), 5 a visitor, in flight 4, 1,000
  an hour, shared cache (a name resolved by an owner's right is a cached answer for an invite too). One line in a tier-1 file
  (`roles/owners.ts`), with its test: a flood of invite reads leaves `act` and `show` untouched.
- **Retention**: `retention.ts` deletes invites past `expires_at` and declines past `until` on its existing pass.
- Lines: about 380.

### Part 4, members

- **`GET /api/rooms/private/<name>/members`**: members only (a stranger gets the answer a room that does not exist gets): addresses,
  who is the owner, join time, and nothing of Ergo (presence stays the room's `here`).
- **`POST .../leave`**: a member; the owner is refused (`forbidden`: close the room instead; there is no second owner in this part).
- **`DELETE .../members/<address>`**: the owner removes a member (not itself). Order for both: the row is deleted first (one statement),
  **then** the server acts on what the row's absence means, in this order and each even if the one before failed:
  1. `streamRevoke(account, room)` (new in `stream/stream.ts`: every open client of that account loses the room from `client.rooms`, so
     no further verdict, card or replay reaches it; `account` is lower-cased as `client.account` is);
  2. `reconciler.ask(room)`: the pass puts `-I`, strips powers and `KICK`s the person if present ("not on this room's list"), the
     existing outside-the-list path;
  3. the pending invites of that person in that room are deleted with the row.
- **`closing`** (the owner's `DELETE /api/rooms/earth/<id>`): existing; archived is read-only, still the members'.
- **`forgetAccount(address)`** in `store.ts`, tested, called by the future erasure: the account's memberships and invites go (each of
  its rooms' reconciler asked), an owned room is archived, a room with no member left is archived too. No call site exists yet, so this
  part adds none (a function with a test and no caller is the one thing that would trip the "no dead code" rule: it is called from the
  retention pass for an account row that no longer exists, which is a real caller; to confirm in the part: Q7).
- Lines: about 300.

### Part 5, the screens

- **Making.** `NewRoom.tsx` (the "+" dialog, D394, D13935): the name field stays; a choice under it, two radios "Public" (default) and
  "Private" with one line each ("Anyone can read and join" / "Only the people you invite. Not encrypted: the server can read it."). Choosing
  Private changes the dialog's kicker line, calls `POST /api/rooms/private`, and its refusal words (`SAID`) gain the new refusals
  (day cap, 20 rooms, name not allowed, session ended). A guest sees no "+" (unchanged). The dialog's form is reproduced to the video's
  frames (`build-to-the-proposal`: side-by-side crops of the dialog, each control working, the error states shown), not composed afresh.
- **The room.** A private room's header carries the chip "Not encrypted" (`mark`, as `dmShown` does) and a lock, and its menu gains
  "Members" (owner and members) and "Leave" (a member) or "Close room" (the owner). `PrivateMembers.tsx` is a `Dialog` (a lazy chunk): the
  list (short addresses, names where the page already knows them, the owner marked), for the owner an "Invite" field (a name or an
  address, one `Field`, the server's refusal said in words) and a "Remove" on each other member with a confirm (`danger` level 2: it is
  reversible by re-inviting but kicks at once). No other control. The room's note line reuses `NOT_ENCRYPTED` (not `PAGE_ONLY`: Ergo keeps
  a room's history, a DM's is not kept).
- **The list.** A private room is listed to its members only, in the Earth's "others" group at the top, as a room no account made is
  (the `byUse` rule: rooms with no `earth_rooms` row come first), with a lock; the chips' row (`RoomChips`) is unchanged.
- **The notice.** Invites in the bell: `lib/api/privateRooms.ts` asks `GET /api/rooms/private/invites` at a session's start, on the
  window's focus and every 2 minutes while the page is visible (a poll, ETag-less: a few hundred bytes), and the bell
  (`features/notifications/`) lists each as "<address or name> invited you to #<label>" with Accept and Decline, and counts them in
  its badge. Accept navigates to the room. A stream event for invites is the better push but needs an account-addressed event on a
  stream that is per room today: left for later, said here (Q4).
- **Guests** see nothing of any of it. The invite never names the invitee on the page of anyone else.
- First screen untouched: every new component is under the room's chunk or lazy; `size` before and after, both numbers shown.
- Tests: component tests for each state of the dialog's choice, the members dialog, the notice (no hook test); the client's Zod tests.

### Part 6, journeys, the real-Ergo checks, hardening

- Journeys (Playwright, by the session that writes them, once Alexis validates the screens): **make and invite** (account A makes
  "plans", invites account B by address, B sees the bell, accepts, both speak, the guest and a third account see nothing, in the list,
  by URL and by search), **remove** (A removes B: B's open page stops receiving, its next history read is refused, B cannot rejoin),
  **leave and close**. The fake wallet the login journeys use makes two accounts.
- **Real Ergo** (`server/src/testing/ergoChat.test.ts` is the pattern; the harness runs a real Ergo): the cases of section 7 that only
  Ergo can answer (rows 2, 4, 14): a stranger's `JOIN` of the room's id refused, `LIST` and `NAMES` and `WHOIS` not showing it, a removed
  member's `CHATHISTORY` refused or empty, a restart losing the channel and the room coming back closed.
- Part 6 closes with `deploy/test.sh` run by Alexis if a part touched `deploy/` (none is planned: Ergo's configuration is not changed,
  Q9 if a setting turns out to be needed).

## 6. How the server keeps Ergo's invite list and modes in step

The table is the truth; Ergo is made to match, by the existing reconciler, with no new command.

| Event | What the server does | If Ergo or the link is down |
|---|---|---|
| A room is made | row and `JOIN`; `SAMODE +M +i +s`; `reconciler.ask(room)` pushes `+I owner` | `send` returns false; the rows stand; at the link's `onReady`, `flags()` closes every private room, then `ask()` puts the lists. Closed until then, never open |
| An invite is accepted | member row; `reconciler.ask(room)` pushes `+I member` | The member cannot join until the link is back (fail closed); the invite is already spent and the row stands, so the next pass completes it |
| A member leaves or is removed | row deleted; `streamRevoke`; `reconciler.ask(room)`: `-I`, powers stripped, `KICK` | **The one window**: the row is gone, every HTTP route refuses at once, but Ergo still lists the person until the link returns, so a client already connected to Ergo, or reconnecting, may `JOIN`. With Ergo down nobody joins at all. The pass at `onReady` closes it. Section 7, row 6 names it, and a test pins that the person is refused at every server route during it |
| Restart | `onReady`: `flags()` then `ask()` for every room; Ergo may have forgotten an empty channel: the bot recreates it `+ntCMi`, then `+s` | Fail closed throughout |
| An operator adds `+I *`, or opens the room (`-i`) | the next pass (60 s) undoes it (`listChanges` removes a wildcard and any flag not wanted); `room_opened` alerts if an invite list was dropped | The drift lasts until the link is back |
| A room is archived | `+m`, `+s` as today; the members still read | none |

Ceiling stated, not hidden: the pass reads every room, so its length is rooms x Ergo's answer; the in-all cap of 1,000 live private
rooms (and 5,000 rows) bounds it, and part 6 measures a pass with 1,000 private rooms on the real Ergo and puts the number in the plan's
review card (not claimed here). A faster removal (a direct `SAMODE -I` and `KICK` before the pass) is what `reconciler.ask(room)` already
does for the one room, first in the queue; no new command is needed.

## 7. Threat model, with the test that proves each row (tests first, each named after its fault)

| # | Threat | Guard | Proving test (file: what) |
|---|---|---|---|
| 1 | A stranger or a guest reads a private room: list, count, stream, verdict, pin, card, search, history, signal, Jarvis, translation, presence | the one rule: `mayRead` is members only; `hiddenRoom`, `publicRoom`, `openRoom`, `searchable` false; Jarvis's doors refuse | `rooms/private/rule.test.ts`: a table over each reader (member, non-member, guest, team, a world's moderator) and each surface; the stranger's answer equals that for an id that exists nowhere (same status, same body), including the search's empty page |
| 2 | A stranger joins through IRC directly | `+i`, `+s`; `+I` exactly the members; the reconciler kicks any present non-member | real Ergo (part 6): a non-member's `JOIN` is refused; `LIST`, `NAMES`, `WHOIS` do not show the room; an `+I *` or `-i` by an operator is undone by the next pass (`reconcile.test.ts` unit case, real-Ergo case) |
| 3 | An invite forged (a guessed id, another account's id, an invite as a non-owner member, an invite by a name with a quote), or replayed (accepted twice, at once, after cancel, expiry, removal, room archived) | 128-bit random id; the spend is one `DELETE ... WHERE id AND invitee AND not expired RETURNING` before the first `await`; the owner right is the table's; `isName` and `Address` gate the field | `private/invites.test.ts`: two concurrent accepts, one member; B using A's id gets the refusal of an unknown id; a member who is not owner invites nothing; a name `a"b`, a 65-character name, an address with a bad checksum refused; cancel, expiry (injected clock), removal and archive each leave the invite unspendable |
| 4 | A removed member still reads: an open stream, a ring replay, the verdicts, pins, search, a cached list, Ergo history | the row is the rule everywhere; `streamRevoke`; `KICK` and `-I`; lists are `private, max-age=5` and `vary: cookie`; history (Ergo) | `stream/stream.test.ts`: an open stream of B loses the room at removal and receives none of the room's later events; a new stream and the verdicts route refuse at once; real Ergo: B's `CHATHISTORY` of the room after the kick (to verify what Ergo v2.19.1 answers: if it serves a non-member, `history.restrictions.query-cutoff` or a server-side step is a stop-and-ask item, Q9). What B saw before removal is theirs to keep: said in the dialog's confirm |
| 5 | The room's existence or members leak | random id (no name oracle); `+s`; the list, members, invites, stream, verdicts, pins and search answer a stranger as for an unknown room; members only to members | `rule.test.ts` (as row 1); `routes.test.ts`: `GET .../members` of a non-member equals an unknown id's; making two rooms with one label yields two ids and no `exists` refusal; the invite list of C never shows A's invite to B |
| 6 | The removal window with Ergo or the link down | section 6: every server route refuses at once; the pass after the link returns closes Ergo | `rooms/private/step.test.ts`: link down at removal, row gone, routes refuse, a fake link back, the `-I` and `KICK` are sent once; real Ergo: stop and start |
| 7 | The owner overreaches: muting a person world-wide, moderating another room, acting after losing the room, pinning in a private room they were removed from | the mute's whole-world rule; the right is per room (`maker`) and only the owner's | `moderation/routes.test.ts`: an owner's mute of a member is refused (`refused`); `mayModerate.test.ts`: an owner of room X has no right in room Y; a closed room keeps its owner's pin and hide (read-only but pinned lines), a leaver loses everything |
| 8 | The team, a world's moderator or a namespace owner reads or moderates a private room by their ordinary right | `staffOf` false for a private room; `placeOf` is none on the Earth; `isTeam` never feeds a private room | `types.test.ts`: `staffOf`, `listed`, `mayRead` for the team and a moderator are false; `mayModerate.test.ts`: `staff` is false; archive by a moderator of a private room refused |
| 9 | A flood: rooms, invites, name reads, accepts, a person invited into hundreds of rooms | the caps of sections 5 and 11, each in one statement; the invite pool is its own; declines are remembered | `rooms/private/caps.test.ts`: the 4th room in a day, the 21st live room, the 1,001st live room, the 21st pending invite to a room, the 31st for an invitee, the 31st in an hour from an inviter, the 51st member, each refused; 1,000 name reads leave `act` and `show` usable; a declined invite cannot be repeated in 7 days |
| 10 | Harassment by invite (a stranger invites a person to a room named to abuse them) | the label passes the rules; the inviter's address is shown; decline is remembered 7 days; the hourly cap | `invites.test.ts`: a label with a banned word is refused at making; the list shows the inviter's address and nothing the inviter did not type |
| 11 | A deleted account (erasure) | `forgetAccount` removes memberships and invites, archives an owned room and a room left empty, asks the reconciler | `store.test.ts`: after `forgetAccount(A)`: A reads nothing, an owned room is archived, B (a member) still reads it read-only, no row names A, Ergo's `-I A` is sent |
| 12 | Trust: the room is read by the operator, the model, a leak | the label and the room's lines never reach OpenAI or Jarvis (rules alone, `publicRoom` false); the words say "Not encrypted" and nothing stronger | `check.test.ts`: a private room's line gets `members_room` and no provider call; `door/*.test.ts`: ask and translate refuse a private room; the screen test: the chip and the note use `NOT_ENCRYPTED`, and "private" is never paired with "secure" or "encrypted" anywhere in the app's strings (a string test) |
| 13 | Data that leaked before: a public room cannot be made private | no toggle | `routes.test.ts`: no route changes a room's kind; the plan's section 8 |
| 14 | A lost channel or a restart opens the room | `+ntCMi` default modes and `flags()` first; `reconcile` puts `+s` and `+I` | real Ergo: restart, room comes back `+i` before any join; unit: `flags()` sends `+i` for every private room before any state read |
| 15 | A member of a deleted or swapped identity, or a lookalike address, gets a stranger's rights | `Address` Zod at every boundary; members are exact addresses (lower case as Ergo's account); a linked identity (`identityOf`) gives no membership | `rule.test.ts`: a linked address of a member is not a member; an upper-case address is the same account or refused, never two |
| 16 | A migration breaks a running database | new tables only, no `ALTER` of a table in use | `migrations.test.ts`: the new entry's hash; an old database takes it; rows of old tables unchanged |

## 8. Data model (one migration, appended after `KEPT_TABLES` in `server/src/migrations.ts`, its hash pinned in `migrations.test.ts`)

```
PRIVATE_TABLES
  private_rooms   (name TEXT PRIMARY KEY REFERENCES rooms (name),   -- #earth/<label>-<10 hex>
                   owner TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT
  INDEX private_rooms_by_owner ON private_rooms (owner, created_at)
  private_members (room TEXT NOT NULL REFERENCES private_rooms (name), account TEXT NOT NULL,
                   joined_at INTEGER NOT NULL, PRIMARY KEY (room, account)) STRICT
  INDEX private_members_by_account ON private_members (account)
  private_invites (id TEXT PRIMARY KEY, room TEXT NOT NULL REFERENCES private_rooms (name),
                   inviter TEXT NOT NULL, invitee TEXT NOT NULL, created_at INTEGER NOT NULL,
                   expires_at INTEGER NOT NULL, UNIQUE (room, invitee)) STRICT
  INDEX private_invites_by_invitee ON private_invites (invitee)
  private_declines (room TEXT NOT NULL, invitee TEXT NOT NULL, until INTEGER NOT NULL, PRIMARY KEY (room, invitee)) STRICT
```

- Expand-only: four new tables and four indexes; no `ALTER`, no column on `rooms`, `earth_rooms`, `nonces` or `accounts`. (Whether
  foreign keys are enforced on this database is to verify in `packages/service/src/db.ts`; the `REFERENCES` are as the `accounts` ones are.)
- `earth_rooms` is not reused: its counters (`earth`, `today`, `maker`) are the public rooms' caps, and a private room in it would spend them
  and change the Earth's public numbers. `rooms.world = 'earth'` for a private room, so `worldRooms` (the lists, the mutes' `roomsOf`) sees it;
  the list filters it by `visible`, the mute's reach test refuses an owner (row 7) and a team member's mute reaches it harmlessly.
- `private_members` holds the owner too: `mayRead` is one indexed lookup, no special case.
- The label is stored for the invite notice and the members dialog; the id alone is in `rooms`.
- Pinned by `migrations.test.ts`: the text's SHA-256; the migrations list is only appended to.
- **No toggle.** A room is born private or public. A public room's lines are already in the search index, OpenAI's requests, cards and
  Jarvis's recent lines; making it private later would claim a privacy it cannot give.
- Retention: Ergo keeps history 90 days (`ircd.yaml.tmpl:137`); the server's `verdicts` keep 180 days and are counted by the list's
  "messages" (members only). An archived private room keeps its rows (its id is a name never reused, as the Earth's are).

## 9. Routes (`/api/rooms/private`, `server/src/rooms/private/routes.ts`)

Every route: `guard` (a listed Origin; JSON for any non-GET, as `rooms/routes.ts`'s DELETE shows), the session from `__Host-session`, `cache-control: no-store`,
strict Zod bodies, one refusal shape (`refuserOf`, logged with its cause, no body echoed), the right checked before any work, limits
before the chain read. Mounted before `/api/rooms` in `roomsBoot.ts` (the latter answers every path under it).

| Route | Body | Who | Guard order | Answer |
|---|---|---|---|---|
| `POST /` | `{label}` (slug, 21 characters at most) | a signed-in account | Origin, JSON, session, body, limit, caps, name rules, make | `201 {room}` (`MadeRoom`) |
| `GET /invites` | none | the invitee | session | `{invites:[{id,room,label,from,at}]}`, 30 at most |
| `POST /invites/:id/accept`, `/decline` | none | the invitee | Origin, session, id shape, spend | `200 {room}` / `204` |
| `POST /:name/invites` | `{to}` | the owner | Origin, JSON, session, body, owner, limits, name read, insert | `201 {id}` |
| `DELETE /:name/invites/:id` | none | the owner | Origin, session, owner | `204` |
| `GET /:name/members` | none | a member | session, member | `{members:[{address,owner,at}]}`, 50 at most |
| `POST /:name/leave` | none | a member (not the owner) | Origin, session, member | `204` |
| `DELETE /:name/members/:address` | none | the owner (not itself) | Origin, session, owner | `204` |
| `DELETE /api/rooms/earth/:name` (existing) | none | the owner | as today | `204`: closes (archives) |

- A `:name` that is not a private room, or one the session is not allowed on, gets one answer (`404 not_found`), whichever it is. A stranger
  asking for a private room's members, invites or leave learns nothing.
- Refusals: `unauthenticated` 401, `forbidden` 403 (origin, a non-owner of an owner route that is a member), `not_found` 404, `refused` 400,
  `too_many` 429, `not_ready` 503 (the name read or the label check unavailable). The invite's duplicate, self and declined cases are one `refused`.
- The client (`lib/api/privateRooms.ts`) parses every answer with Zod, sends the cookie only, and calls only what this table lists.

## 10. What each other feature does in a private room (decided, each with its proving test in section 7)

| Feature | In a private room |
|---|---|
| Search (D13924) | not indexed (`searchable` false), not queried (`hiddenRoom` true: the empty page, as for an unknown room) |
| Link previews | no card (`cardRoom` is `mayRead(undefined)`, false); the existing plan's "never in a members room" holds |
| Jarvis | reads none of it; ask and translate are refused from a private room; `recent` and `line` give nothing (`isPublic` false) |
| OpenAI moderation | rules alone, as a members room; the room's label too |
| Pins | work for the owner (`as:"maker"`); read by members; a pin is `readable` by the stream's rule |
| The owner's rights | pin, unpin, hide; never mute; close the room; invite, remove. Nothing of the chain, the team or the roles file |
| The team and world moderators | no right at all in a private room (read, list, pin, hide, archive). The operator can still read in Ergo (section 7, row 12) |
| The bell | the invite's notice (new); a private room's lines notify its members as any room's |
| Guests | cannot read or write (`guestAccess` undefined), and the room is not in the guest's list, count, presence or signals |
| First signals, trends, "here now" counts | none (`open` is `visible(room, undefined)`) |
| The Earth's list | members see their private rooms first with a lock; nobody else sees the room's existence |
| Archiving | the owner closes it; idle 60 days archives it; the members keep reading; it frees its live place |

## 11. Weights and cost

- **First screen**: untouched. The private choice is in `NewRoom` (the chat chunk, +512 B at most by the cap above), the members and
  invite dialogs and the invites' notice in lazy chunks. Measured by `size` before and after, both numbers shown.
- **Server per call**: `mayRead` for a private room is one indexed read (members by `(room, account)`); the moderation of each line adds
  one `private_rooms` lookup (`publicRoom`), as `roomWorld` adds one. Measured at part 1 with 1,000 rooms: before and after, same
  lines, both numbers.
- **Reconciler**: one more kind of room in the pass; each private room costs one Ergo state read per minute. Cap 1,000 live private
  rooms (+ archived ones left in the pass: say 5,000 rows) makes the pass up to 6,000 reads; at part 6 measure a pass of 1,000 private
  rooms on the real Ergo and decide whether archived private rooms leave the pass (an archived room's state rarely changes: a candidate
  saving, not claimed).
- **Storage**: a member row about 100 bytes, 50 a room, 1,000 rooms live: 5 MB at the extreme. Invites: 30 pending an account, 7 days.
- **Chain reads**: an invite by name is one `vm/qeval`, the invite pool (5 a visitor, 1,000 an hour), shared 60 s cache.
- **Numbers proposed** (all Q5): 21-character label, 3 private rooms a day, 20 live owned, 1,000 live in all, 50 members, 20 pending
  invites a room, 30 pending an invitee, 30 invites an hour an inviter, 7 days an invite, 7 days a decline remembered, 60 days idle before archive.

## 12. What Alexis must decide

1. **No toggle** and a room is born private or public (section 8). Recommended: yes, no toggle.
2. **The team has no right in a private room** (no read, no list, no pin, no hide, no archive), and the operator can still read in Ergo,
   said in the words. Recommended. The cost: no moderation but the bot's rules and the owner's tools; a report path is a later part.
3. **The list's schema**: `ListedRoom` gains one optional `private: true`; the type stays `"members"`, the enum untouched. A schema in use, additive
   (D394 did the same for the counts with his word). Recommended; the alternative, `"private"` in the enum, breaks a stale client's whole list.
4. **The notice by a poll** (page start, focus, every 2 minutes) rather than a pushed event. Recommended for this part; a push is a later change.
5. **The numbers** of section 11, and the decline memory (7 days), which stops one owner re-inviting one person to one room, not a harassing
   owner's other rooms (20 live rooms x 30 an hour of invites). Say if a person needs a block-all switch (a new table and a Settings row).
6. **Idle archive at 60 days** for a private room (the public 14), or never. A dead private room holds a live place and a pass read.
7. **Account erasure**: no route exists. `forgetAccount` is written and tested; its caller is the retention's pass over accounts that no longer
   exist. Say if erasure is a separate part, and then whether this part ships the function with no caller (it is not dead: a test exercises it).
8. **The tiers' table** (`docs/REVIEW.md`): add `server/src/rooms/types.ts`, `server/src/rooms/private/` and `server/src/stream/stream.ts`
   as tier 1 so the red pass, the `security-reviewer` and the mutation check run on them (a harness file, so yours to change).
9. **Ergo's history for a removed member**: if Ergo v2.19.1 serves a channel's history to a non-member of a `+i` channel, the fix
   (`history.restrictions.query-cutoff` in `deploy/ergo/ircd.yaml.tmpl`, which is `deploy/`, tier 1) is a stop-and-ask item. Not known until part 6's
   real-Ergo test (or earlier: part 1's first session can read Ergo's source at the tag in `deploy/ergo/VERSION`).
10. **Who invites**: the owner only (this plan), or any member. Owner only keeps every cap and right on one account.

Stop and ask before: the `ListedRoom` field (Q3); the tiers' table (Q8); `deploy/ergo/ircd.yaml.tmpl` or any Ergo setting; a new dependency
(none planned); a limit larger than section 11's; a change to `CreateRoom`, `RoomType`, `Me` or another committed schema; the `roles/owners.ts`
pool (a tier-1 file, one line); a diff past the parts' line counts; a test that must change to pass; anything touching `guard.ts`, `limit.ts` or
the sandbox.

## 13. Not verified here, and how

- Whether `makeNameChecker` (`moderation/name.ts`) can run with no provider: part 2 reads it first. If not, the rules-only mode is a small new
  function there.
- What Ergo v2.19.1 does with `CHATHISTORY`, `LIST`, `NAMES`, `WHOIS` of a `+is` channel for a non-member and a kicked member: the real-Ergo test
  (part 6), or Ergo's source at the tag in `deploy/ergo/VERSION`. The `+I` list's real cap (100 per `chan-list-modes`; the plan stops at 50).
- That the app joins a room it newly sees listed (`joins.ts`, `RoomsView`): part 5a's session reads it; if joining needs a reload after an
  accept, the page's `roomsChanged()` (as `NewRoom` calls after making) is the signal.
- That the presence and trends skip a room a guest cannot see (`worlds/present.ts` reads `listRooms`): part 1's test.
- Whether foreign keys are enforced (`packages/service/src/db.ts`).
- Cost numbers (a pass, a lookup, the chunk): all measured in the parts, none claimed here.
- The Playwright folder and the fake wallet's name: found by the part 6 session.

Undo: no part changes a table in use or Ergo's configuration. Dropping the four tables (a later migration, never an edit of this one)
and the private source in `Typed` returns the server to today; a private room already made would then read as an open `#earth/<id>`
room in Ergo's modes only until the reconciler closes it with `-i`, so the undo step is: archive every private room first (one `UPDATE`
and `+m +s`), then ship the removal.
