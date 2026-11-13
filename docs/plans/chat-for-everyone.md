# The chat for everyone, with a room for every realm

Plan of 2026-11-07, for Alexis's reading before any code. Decisions D351 (anyone speaks in every room, guest or account), D352 (the site's online total counts everyone), D353 (a world's trend counts no guest), D374 ("here" counts guests), D375 and D378 (a realm's page has its chat, read-only until this part). Backlog row "Anyone speaks in every room under a random name…". Tier 1: the relay's authorization, the login, the rate limits and the settings (`docs/REVIEW.md`). Nothing is built; every claim below cites a file, and what was not verified says so.

## Changed on 2026-11-09: a guest speaks through the server (Alexis, D430)

The spike (`chat-for-everyone-spike.md`) found that a guest holding an Ergo account can message every account and that Ergo cannot stop it
(Q2). Alexis chose its proposal: a guest is **no** Ergo account. It reads as today; it speaks by posting a line to the server, which checks
its cookie, its limits and a guest's rules (3.2) before anything is said, then the bot says the line with `RELAYMSG` as `anon/<name>`. This
replaces 3.1's ticket and auth-script branch (no guest ticket, no `anon-` account, Q11 closed); 3.2's rules are checked before the line is
relayed, so its "residual we cannot close" is closed; strikes key on the server's guest id and visitor; part 4 has no `anon-` nick on Ergo
to filter, only relayed lines to keep out of the trends. Ergo's config gains `server.relaymsg` and the bot's class `relaymsg`. Built on the
night of 2026-11-09, parts 2 to 6, tests first, each tier-1 part red-passed and security-reviewed.

Status on 2026-11-09 (morning): part 1 was built before; part 5 built (rooms made ahead, busiest worlds first, a 1,000 reserve for them, an
unlisted realm checked on the chain with bounded reads), red-passed, security-reviewed (no high, no medium; its lows fixed and re-red-passed);
parts 2 to 4 built (D430), red-passed; part 6 built (D432, radical mode); the whole under the security review and the combined review.
Measured: the reconciler's first pass over 5,000 rooms in real Ergo about 1.0 s, a steady server pass 9 to 13 ms. Not done: part 7 (journeys,
the soak with 1,000 guests, `deploy/test.sh` in Alexis's Terminal, mutation).

Later the same morning: a fix pass on both reviews' findings (a /48 limiter and mutes keyed on the /48, living within the hour, guests'
lines counted per room per hour so a guests-only room is never archived, reading guests' `Guest-` nicks never counted, one visitor helper
for five copies, one provider breaker, "unsure" for a relay that timed out), red-passed and security-reviewed: no high, no medium. Two
residuals for Alexis's word, accepted for now: a guest muted after 3 strikes mutes its whole IPv6 /48 in that world for the mute's 5 minutes
(a mobile carrier's /48 may hold many people; the other way, mutes per /64, lets an abuser hop /64s), and 600 new names an hour in all can be
spent by 60 IPv4 addresses (the cost ceiling the plan chose; an alert when it is full is a later step). The guest's line is refused while
no moderation key is set (fail closed), so the workshop, which has none, cannot relay a guest's line.

## Changed on 2026-11-08: every world's chat open by default (Alexis, D413)

Alexis: "tous doivent avoir un chat général ouvert par défaut", with guests speaking in them (D351), in one plan. What changes below:

1. **Every room is made ahead, none on a first open.** The server makes the main room of every hub and the room of every realm its worlds job lists (`worlds/list.ts`), at start and each time the job adds realms, joining them a few a second so Ergo's flood guard never trips. It replaces D390's "never ahead" (Q5 below): the spike measured 5,000 rooms at +25 MB of Ergo's RAM, 0.4 s to join them all and 0.35 s for one read pass (`chat-for-everyone-spike.md`, "5,000 rooms"); the server's own reconciler pass on them is still to measure (part 5). The 5,000 cap stays as the job's ceiling: past it the job makes none more and logs it, never silently.
2. **A realm the job does not list yet** (a system realm such as `gno.land/r/sys/namereg/v0`, which "Go explore" may pick, or one deployed since the job's last run) gets its room on its first open if it is on the chain: `POST /api/rooms/realm` reads the path from the chain with a timeout (the server's chain client; the query to use is checked with gnomcp in part 5), then takes the visitor's rate and the cap as today. A path not on the chain makes none (`not_found`).
3. **The app.** A realm's or a world's dock opens its room at once, as the Earth's does: "This place's chat opens soon" stays only for an unlisted realm while the server checks it, and for a real failure (`NoRoomYet`). The page asks the server nothing for a listed realm.
4. **Guests speak in every one of these rooms** (D351), through part 2 as the spike re-plans it (`RELAYMSG`: a guest is no Ergo account, so it can send no direct message, Q2).
5. **In development, the page's address.** The server's guard refuses every POST (a login, a room) from an `Origin` it does not list (`server/src/guard.ts`); the workshop's backend lists its own links alone (`scripts/workshop.sh`, the `origins` line). A page opened from another address cannot log in ("Not allowed here") nor make a room: by design, not a bug of this part.

Done when, added to section 1: every listed realm's room exists before anyone opens its page (a test with the job's 743 onyx paths and the cap); a listed realm's page asks no `POST`; an unlisted path on the chain gets its room on its first open, one not on the chain none; the job past the cap makes none more and logs it; the guest's lines reach a realm's room made ahead.

## 0. Open questions for Alexis, each with my recommendation

Q1 and Q2 block part 2; the spike (part 0) answers Q2 with a measurement before you decide.

1. **How does a guest get into Ergo?** Today a guest is an Ergo connection with no account, and every open room is `+M` (only accounts speak), set by the reconciler (`server/src/rooms/types.ts`, `desired()`). Option A: drop `+M` and let nameless connections speak. Option B: the server mints each guest a throw-away Ergo account, like a login ticket. **Recommend B.** A cannot meet D351: a nameless connection picks its own nick (Ergo only prefixes `Guest-`, `force-guest-format`, `deploy/ergo/ircd.yaml.tmpl`), so the name is not random or unique by us; the bot sees no account to key its verdicts, rate and mutes on (`moderation/check.ts` keys on `said.account`; `moderation/mute.ts` mutes `m:<account>`); and a rename escapes any mute.
2. **B's hole: a guest with an account can send direct messages.** The `+iR` default (`default-user-modes`, decision of 2026-10-26) stops only senders with no account (`irc/handlers.go:2552`, per that decision). A guest account is an account, so that guard stops guarding. I know of no Ergo setting that refuses one sender class (not verified; I have not read Ergo's source in this session). **Recommend:** part 0 reads Ergo v2.19.1 (`deploy/ergo/VERSION`) for such a setting (user mode `+g`/`ACCEPT`, a per-account block). If none: guests do not talk to Ergo directly but through a thin server-side relay that carries room messages only. That is a larger part, and I would then re-plan before you approve.
3. **Room per realm or per world?** The decision of 2026-11-01 says a world is a product with one chat, its realms below it with "no chat of their own"; D375 and the brief want a room for every realm. **Recommend per realm** (D375 is the later word), under its world: the world's main room stays the product's chat.
4. **A realm room's name.** A realm path (`gno.land/r/gnogolf/golf/v2`) is not a legal room id here: `RoomId` is `#slug` or `#slug/slug` (`packages/schemas/src/rooms.ts`), `worldOf` takes the text before the first `/`, and the roles file's `ownRoom` does the same, so `#gno.land/r/...` would read as world `gno.land`. Ergo itself would take it (RFC 2812 forbids only space, comma and BEL, up to 50 characters; ours is 64, `channellen`; the RFC is from memory, so part 1 checks the `CHANNELLEN` Ergo advertises). **Recommend `#<world>/<name>`, `<name>` = the path's tail as a slug cut at 21 characters + `-` + 10 hex of its SHA-256** (32 at most, `RoomName`'s cap), so any path fits, nothing collides (40 bits for at most 5,000 rooms), no schema changes, and the app derives it with the same pure function (never read back from the id).
5. **When a realm room is made.** (Superseded on 2026-11-08 by D413: every room ahead, see the section above.) Ahead from the worlds file (743 paths on onyx, `wc -l server/src/worlds/onyxPaths.txt`; mainnet adds more) means 743 rooms joined at start and read by the reconciler every minute. **Recommend on first open**, only for a realm the server's worlds file lists, with a cap (4.2).
6. **Moderators of a realm room.** **Recommend none in this part**: the team, the bot's rules, OpenAI and the auto-mute moderate. A deployer's claim is a later part: it needs a table of moderators beside `roles.json` (a new source of power, tier 1, its own plan).
7. **A guest's rules.** **Recommend stricter than an account:** no link, at most 1 mention, one line of 280 characters, 6 lines a minute (an account: 20, `check.ts`), no reaction, no direct message, no slash command in this part. They are in 3.2.
8. **What is kept of a guest.** **Recommend nothing new:** its lines follow the chat's 90 days (`history.restrictions.expire-time`; Ergo has one time for all), its guest record 24 hours after its last use, its verdicts 180 days hashed as today. No job to redact guest lines earlier.
9. **The roles file gains a key** (`defaults`, the rules of a world it does not list). Today an unlisted world gets `rulesOf` undefined and the checker answers `unchecked` ("unknown_room", `moderation/check.ts`, `checker.ts:35`): a realm room would be unmoderated. A schema in use changes: your word is needed (CLAUDE.md, "Stop and ask"). **Recommend yes**, strict values in 3.2.
10. **"Here" in a realm's plate:** the world's (D374 counts per world, `worlds/present.ts`, `stream/watching.ts`), not the single room's. **Recommend per world**; the room's own count is not asked for.
11. **Ergo keeps every guest account for ever** unless an oper may unregister it (not verified: `NS UNREGISTER` or `accreg` for the bot's class, `oper-classes` in the config). At the 600 a day I recommend below this is 219,000 accounts a year. Part 0 measures the cost; if it is real and no cleanup exists, the fallback is a bounded pool of names leased for 7 days (names still unique among the living; an old name can come back after its cooldown).

## 1. Done when

Each line is a test.

- A visitor with no Adena opens a room, gets a name nobody else holds (`anon-` + words and characters), speaks, and is heard by everyone, accounts and guests, in that room. Another visit, another name.
- Past its limits a guest is told so, in a word (`too_many`), and can still read.
- A guest's line breaking a rule never leaves moderation shown: it is hidden like an account's (`hide`), and strikes mute the guest and block its visitor from taking a new name for the mute's time.
- A guest cannot do what only an account does: send a direct message, react, edit or delete, declare a country, join a members room, speak where `+m` or `+i` holds.
- Opening a realm's page opens its room if the worlds file lists the realm, once, at the cap; a path no one lists makes none.
- The online total counts a guest once however many tabs (D352). A world's "here" counts guests as distinct visitors (D374). No trend, no history, no "rise" counts a guest or its lines (D353).
- Everything an account has today works as before (the regression run, `check_regressions.py`).
- A switch (`GUEST_CHAT=off`) returns the site to read-only guests in one step.

## 2. Out of scope

A deployer's claim of its realm's room; the chat's peek on a hover (backlog); reactions, edits and direct messages for guests; the app's look (decided live, by Alexis); any deploy or push (asked in the conversation).

## 3. Design, from the code

### 3.1 Admission: the guest ticket

The login already does this for accounts: `POST /api/login/ticket` mints 256 random bits for the session's account, stored as SHA-256, good once and 60 s (`login/ticket.ts`); Ergo's auth script redeems it (`ergo/auth.ts`, `named()` accepts only `Address` names or the bot). A guest gets the same, with its own table, never mixed with accounts:

- **A guest** = a row `guests(name PK, token_hash, visitor_hash, created_at, last_seen)` (a migration, `migrations.ts`). The name is generated server-side from a CSPRNG: `anon-<adjective>-<animal>-<4 base32>`; a duplicate (primary key) retries. It is never taken from the client.
- **`POST /api/guest`** (new, `server/src/login/` beside the others): a listed `Origin` and JSON (`guard.ts`), then limits before any work (3.3), then a name and a ticket; sets the cookie `__Host-guest` (HttpOnly, Secure, SameSite=Strict, no `Max-Age`: it lasts the browser's visit, so a reload keeps the name and a new visit takes a new one), whose value is 256 random bits stored as SHA-256 only. `POST /api/guest/ticket` mints a new one-use ticket for the cookie's name, for each reconnect of a tab (as `mintsByAccount`: 10 a minute).
- **The auth script** (`ergo/auth.ts`): a name that is not an address and matches `^anon-[a-z0-9-]{1,40}$` redeems from the guest tickets by one `DELETE … RETURNING` before any `await` (the login rule, `docs/ARCHITECTURE.md`, "Security: the checklist"). The failure counter per visitor stays. `autocreate: true` makes Ergo's account on the first success. `NICK`, an address and an `anon-` name are three disjoint spellings; a test proves no name is two of them, and that `Guest-…` (Ergo's own, case-insensitive) never equals one.
- **The kill switch:** with `GUEST_CHAT=off` the route answers 404 and the auth script refuses `anon-` names. Connected guests stay until Ergo restarts; the undo step does both (section 8).
- **A logged-in account** that uses the page never takes a guest name: the app asks `/api/guest` only when `/api/login/me` says nobody.

### 3.2 What a guest may say

Bounds, in the order the bot checks (`moderation/check.ts`): too fast, edit not its own, then the world's rules, then OpenAI.

- **Rules for a guest** (a second `Rules`, `moderation/rules.ts`; guest = the author matches `anon-`): `linksPerMessage: 0`, `mentionsPerMessage: 1`, a banned-words list the world's plus a default, one line (a multi-line message is hidden `unreadable`-style, never cut), 280 characters; `newAccount` is always true. An account's rules are unchanged. The default for a world the file does not list (Q9) is the strictest of the two: the same words as a guest's but 3 links for an account.
- **Rate:** per name 6 lines a minute (the existing `tooFast`, keyed by the guest's hash); per visitor, across names, 12 lines a minute (a second key on the `lineRate` pattern, `moderation/rate.ts`, bound 10,000 keys like it), because a private window takes a new name.
- **OpenAI's check** runs as for an account; its cost grows with the lines: counted in part 3's measurement.
- **A residual we cannot close:** Ergo relays a line to the room before the bot's verdict, which hides it after (REDACT). A guest's line is visible for the verdict's delay. Mitigation: no links, 280 characters, the rate, the strike mute; stated here, not hidden.
- **Strikes:** `moderation/strikes.ts` and `mute.ts` work by account name; a guest's mute names its `anon-` account (`m:anon-…`, an exact name; the whitelist in `irc/lines.ts` refuses wildcards on purpose and stays so). The mute row also records the visitor hash; while it lives, `/api/guest` gives that visitor no new name.
- **What Adena adds** (D351): its registered name (`r/sys/namereg`), direct messages, reactions, edits and deletes of its own lines, links and embeds, multi-line, mentions that notify, pins and follows, the declared country, the realm's `/read` and `/call` (D378; a call is signed in Adena only), and the account's own rate.

### 3.3 Limits, by visitor key (`visitor.ts`: an IPv4, or an IPv6 /64) and in all

| What | Per visitor | Room or total | Why |
|---|---|---|---|
| New guest names | 10 an hour (a household or an office shares one address) | 600 an hour, 5,000 living | `limit.ts` windows; the numbers are the config's (`config.ts`), tier 1 |
| Tickets (reconnects) | 30 a minute, as `mintsByVisitor` | 10 a minute a name | same shape as the login's (`login/routes.ts`) |
| Ergo connections | 16 at once, 32 in 10 min (`ip-limits`, already) | Ergo's own | exists |
| Lines | 6 a minute a name, 12 a visitor | 3 a minute a name in one room | 3.2 |
| Rooms followed by a stream | 25 a stream, 4 streams a visitor (`stream.ts`, `slots.ts`), already | 1,000 chat slots | exists; guests count there too |
| Rooms a guest joins in Ergo | 100 (`max-channels-per-client`) | none | the page joins 1 or 2; tightened only if the spike shows a raw client harms |

Every refusal answers `too_many` (429) as the login does; the log records the cause, never the name with the visitor.

### 3.4 A room for every realm

- **Name and world.** World = the hub's slug when a hub of `hubs.json` lists the realm and its world id matches (`hubWorldOf`, `packages/core/src/cosmos/worldId.ts`), else the world id (`worldIdOf`) written as a slug (`/` to `-`: Gno paths have no hyphen; to verify with `gno_packages`, so no two worlds meet). A realm alone in its namespace, or the realm a world is named for, takes the world's main room `#<world>` itself. Every other realm takes `#<world>/<tail>-<10 hex>`. One pure function in `packages/core` (`realmRoom(path, hubs)`), used by the server and the app: never two copies. A test runs it on all 743 onyx paths: valid `RoomId`, at most 64 characters, no collision.
- **Who makes it, when.** `POST /api/rooms/realm` `{ path }`, open to a guest or an account: listed `Origin` and JSON, then 20 a visitor an hour, then the path must be in the server's list of known realms (the worlds job's output, `worlds/list.ts`), then `create` (`rooms/create.ts`: it exists, a cap, JOIN, `SAMODE +M`, `-i`). Idempotent: a second call returns the existing room. Apart from the moderators' `ROOMS_PER_WORLD = 20` (`chat.ts:96`), the realm rooms have their own cap of 5,000 (4.2).
- **Roles.** The realm room is "open" like any room the roles file does not type (`rooms/types.ts`, `typeOf`): no moderators, no groups; the team's moderators act in it (`staff()` includes `team`). The default rules (Q9) moderate it.
- **How it counts.** Streams follow rooms, and a stream's world is `worldOf(room)`, so a realm room's guests count in its world's "here" (D374) with no change. Two things do change: (a) `present.seen()` must drop `anon-` nicks, or the reconciler counts a guest's Ergo connection as an account in the trends and the history (D353) and again among the open streams (the backlog's double count); (b) a world's messages an hour (`perHourIn`, from `activity`) feeds both the plate and the trend: the trend's must exclude guest lines, the plate's must not (D374). I have not read `server/src/activity/`; part 4 reads it first.
- **Rooms and search.** `GET /api/rooms?world=` lists the rooms that exist, to the guest too (open, not hidden); `RoomList` does not change. A realm room's label (its realm's name) comes from the app running `realmRoom` over the world's realms and matching ids. The palette indexes realms, not rooms: a realm result goes to `/r/<path>`, whose dock opens the room.
- **Spam and abuse.** Rooms are made only for listed realms (no room by typing a name); per visitor and total caps; the same guest rules and the same strike mute apply by world, and a world's mute covers its rooms made later (`mutes.putOn`, `rooms/wire.ts`).

## 4. Cost

1. **The relay:** one table write per visit, one `DELETE` per ticket: nothing next to the login's.
2. **Rooms:** the bot joins every room (`max-channels-per-client: 100` does not stop an operator, per the config's own comment, not verified); the reconciler reads every room each minute (`worlds/present.ts`, `STALE_MS`); presence keeps at most 10,000 (`ROOMS_MOST`) and Ergo's `LIST` is kept to 10,000 (`irc/handlers.ts`). With a cap of 5,000, part 5 measures one reconciler pass with 5,000 rooms on a seeded server (the same inputs before and after, both numbers in the card); if it passes 10 s, an empty room is read every 30 minutes, not every minute.
3. **Ergo:** 1,000 guests speaking is 1,000 more connections (`max-sendq: 96k` each at most). `server/src/testing/soak.ts` already soaks the stack: part 7 runs it with 1,000 guests and records Ergo's memory before and after. A guest account per visit grows Ergo's datastore (Q11).
4. **The stream:** `watchingIn` and `watchingOf` are counted at each ask over 2,000 clients (ponytail comments in `watching.ts`): unchanged.
5. **OpenAI:** the guests' lines are the new bill. The 600 names an hour and 6 lines a minute bound it to about 3,600 lines a minute at the worst; the real figure comes from the soak.

## 5. Scale

First limit: Ergo connections and the datastore of guest accounts. Next step if it holds: the same, bigger machine; if it does not: the leased pool (Q11) or the relay of Q2. A second Ergo or a second server is out (one process, ADR-0002 §7).

## 6. Tests to write first (the red pass by the `test-auditor`, on parts 1 to 5; the `security-reviewer` on each tier-1 part and on the merge)

Each test is seen failing before its code. Names say the bug.

- **Names:** unique over 100,000 draws (the primary key, a retry); never an address, `gnoworld` or `Guest-…`; a client-supplied name is ignored.
- **Ticket:** one use, 60 s, the wrong name refuses, the cookie's hash only is stored, a ticket for a guest never logs an account in, and an address's ticket never logs a guest in; the spend is one statement before an `await`.
- **Limits:** the 11th name an hour from one visitor, the 601st in all, the 5,001st alive, the 31st ticket a minute; an IPv6 /64 counts once; a visitor behind a trusted proxy by its header, never by one that is not.
- **Rules:** a link, two mentions, two lines, 281 characters, a banned word: each `hide` for a guest, each the account's old answer for an account; the 7th line a minute; a visitor on 13 lines across 3 names; a strike mutes the name and blocks a new name for the visitor.
- **What a guest cannot do:** a direct message (Q2's measured result, in a real Ergo test, `ergo.test.ts`), a REACT, an edit of another's line, `+m`, `+i`, a members room, a hidden room.
- **Presence:** a guest's two tabs count once in the total; a guest in a world counts once in "here"; a guest's Ergo nick counts 0 in the trend and the history; its line counts 0 in the trend's messages and 1 in the plate's; an account counts as before.
- **Realm rooms:** the mapping on all 743 paths; a path no list names makes no room; the cap; a second call returns the same room; a realm in a hub takes the hub's slug; default rules apply (a line with 4 links is hidden in an unlisted world); a moderator of the world is not made a moderator of a realm room; `RoomList` unchanged byte for byte.
- **Switch:** with `GUEST_CHAT=off`, the route is 404, a guest's ticket is refused, an account's login and chat are unchanged.
- **Mutation:** `pnpm run mutate` on the new files finds every guard; a survivor is killed or goes into `GAPS` with its reason.
- **`deploy/test.sh`** (Alexis's Terminal, from the checked copy of the reviewed commit, `docs/OPERATIONS.md`): it changes `deploy/ergo/ircd.yaml.tmpl` only if the spike needs a setting (then a mutant for it, as the file's others), and a guest's full journey on the stack: no account, a name, a line, hidden by the bot, a reconnect keeps the name, the 11th name refused.
- **Journeys** (Playwright, once Alexis has validated the screen): a guest speaks on the Earth and in a realm room; an account logs in and keeps its name. No new screenshot.

## 7. Files and branches

Tier 1: `server/src/ergo/`, `server/src/login/`, `server/src/roles/` and `server/roles.json`, `server/src/limit.ts`, `server/src/config.ts`, `server/src/guard.ts` (new env), `deploy/ergo/` if touched. The moderation and presence files are read as tier 1 for this part, since they decide who may speak.

| Part | Delivers | Kind | Waits on |
|---|---|---|---|
| 0, the spike | Numbers, no code in `main`: Ergo's guest-account cost, an oper's unregister, any per-sender DM refusal, `CHANNELLEN`, 5,000 rooms' reconciler pass | Measure | Alexis's answers to Q1; its result answers Q2 and Q11 |
| 1, names and rooms as pure functions | `guestName` and `realmRoom` in `packages/core`, Zod schemas for the names | Tier 2, tests first | Q4 |
| 2, admission | The table, `/api/guest`, the cookie, the ticket, the auth script's branch, the limits, the switch | Tier 1, red pass, security review | Q1, Q2, Q7, part 1 |
| 3, a guest's rules | Guest `Rules`, the visitor's rate, the strike block, `defaults` in the roles file | Tier 1, red pass, security review | Q9, part 2 |
| 4, presence and trends | The nick filter, the two message counts, the double count of two tabs and Ergo | Tier 1 reading, tests first | part 2 |
| 5, realm rooms | Every listed realm's room made ahead by the worlds job, a few a second, the cap; `/api/rooms/realm` for an unlisted path checked on the chain; the reconciler's cost on the made rooms, measured | Tier 1, red pass, security review | Q3, Q6, D413, parts 1 and 3 |
| 6, the app | The guest's composer in `GuestLoaded`, the page asking `/api/guest` only when nobody is logged in, the realm dock's room, the label from `realmRoom`; D378's `/` stays an account's | Radical mode (no tier-1 file): no test, no agent review until the hardening | parts 2 to 5 |
| 7, the hardening | Journeys, the soak with 1,000 guests, `check_regressions.py`, the security review of the whole, `deploy/test.sh` green | Review | all |

Parts 2 to 5 are a sequence (each reads the one before); 1 and 4's reading may run beside part 0. At most two sessions at once, never two on one worktree.

## 8. Risk and undo

- **Who could be hurt:** account holders (spam from guests; a direct message if Q2 is not answered); the site (Ergo's memory, OpenAI's bill); guests (a name seen in 90 days of history).
- **Undo:** one step, `GUEST_CHAT=off` and restart the server and Ergo: the route and the auth refuse, every connected guest drops and cannot return, an account's chat is untouched. Guest rows and Ergo accounts stay, and are of no use. The migration adds tables only; it is never rolled back. Realm rooms stay and are listed as any open room; with the switch off they are read-only for guests, as D375 says today.
- **What would make me stop and re-plan:** the spike finds no way to stop a guest's direct message (Q2), or Ergo's cost per guest account is real with no cleanup (Q11).
- **Stop and ask, from CLAUDE.md, met here:** a schema in use (the roles file's `defaults`, Q9); a new setting in the config; a realm's storage layout (none); a new dependency (none).

## 9. Dependencies

None. The words for names are a list in `packages/core` (200 adjectives, 200 animals, chosen and checked by a test for length and spelling), not a package.

## 10. What I did not verify

Ergo's own behaviour: guest-account cost, an oper's unregister, any per-sender refusal of direct messages, the operator's channel limit, `CHANNELLEN` (all part 0's). RFC 2812's channel rules (from memory). That Gno paths have no hyphen (`gno_packages` in part 1). How `activity` counts a world's messages (part 4). OpenAI's cost at this volume (part 7).
