# The spike of "the chat for everyone" (part 0, D380)

Measured 2026-11-07 on Ergo v2.19.1, the pinned build (`~/.cache/gnoworld-tools/ergo-v2.19.1/`; source paths below are relative to its `irc/` folder), with a throwaway Ergo started from a render of `deploy/ergo/ircd.yaml.tmpl` on free loopback ports, killed after each run. The workshop's own Ergo was not touched. No repo code was changed. The scripts and the raw runs are in `/tmp/claude-501/ergo-spike/` (`lib.py`, `q2.py`, `q2b.py`, `q11.py`, `cost.py`, `unreg.py`, `chlen.py`, `rooms5k.py`, `join.py`, `worlds.mjs`).

Machine: macOS, Apple silicon, loopback only. RSS comes from `proc_pidinfo` (the sandbox refuses `ps`). The auth script of the runs is a small Python script (about 20 ms to start), not the server's socket: login times below include that start.

## Verdict, in one table

| Question | Answer | For the plan |
|---|---|---|
| Q2: can a direct message be refused for a guest that holds an account? | **No.** No setting, mode, list or oper class does it. | Part 2 as written (B: a guest is an Ergo account) **cannot go**. Re-plan: the proposal below (RELAYMSG). |
| Q11: can the bot unregister accounts, and what do 1,000 cost? | Yes, with the `accreg` capability (the bot lacks it today). 1,000 accounts cost 8.4 MB of RAM and 1.1 MB on disk, and the RAM is real (the whole datastore lives in memory). | Fine **only if** guest accounts stay, with a daily `ERASE` job. With RELAYMSG the question disappears. |
| `CHANNELLEN` and the room name | 64 including the `#`, a hard ceiling (SQLite history). The plan's name is legal, but it **does not fit**: 521 of the 743 onyx realms give a room name over 64. | Part 1 and part 5 must re-plan the name (proposal below). |
| 5,000 rooms | Cheap: +25 MB of RAM, 0.4 s to join them all, one read pass of 0.35 s in raw Ergo. | Go, with the caveat that the server's own pass was not run. |
| Q5: a throw-away account without a real user's SASL | **Yes.** Autocreate on the auth script's answer, as for logins. Ergo can even hand the script the WebSocket's cookies. | Go, if guests keep accounts. |

## 1. Q2: a guest's direct messages

**Source.** The only refusal of a direct message in Ergo is in `messageHandler`, `handlers.go:2547-2559`:

- `handlers.go:2547`: a sender with no account is refused while DEFCON is 3 or lower (an oper's emergency command, global, and it again looks only at "no account").
- `handlers.go:2552`: `details.account == "" && user.HasMode(modes.RegisteredOnly) && !server.accepts.MaySendTo(client, user)`: the sender must have **no account**. That is the whole test.
- `handlers.go:2556-2559`: a sender that is `+R` itself is auto-accepted by an accountless target (`accept.go`: ACCEPT only lifts the `+R` refusal for one sender).
- `handlers.go:2539`: `+T` only drops CTCP.

The user modes Ergo can change are `modes.go:19` (`Bot, Invisible, Operator, RegisteredOnly, ServerNotice, UserRoleplaying, UserNoCTCP`); none of them blocks sending. There is no `+g`-style "accept list only" mode, no per-account or per-class block, no `restrict-dm` setting (`default.yaml` mentions "direct messages" only for history). The auth script's answer carries `accountName`, `success` and `error` only (`authscript.go:36-40`), no class. Oper classes (`default.yaml:717-750`) are for opers, not for visitors.

**Measure** (`q2.py`, two clients with accounts, one account holder, two with no account, `+iR` as in our config):

| Sender -> target | Delivered |
|---|---|
| guest with an account -> account holder (`+RZi`) | **yes** |
| account holder -> guest with an account | yes |
| guest with an account -> guest with an account | yes |
| no account -> account holder (`+iR`) | no, `477 You must be registered to send a direct message` |
| no account -> no account (both `+iR`) | no, the same 477 |
| guest with an account, after the target ran `ACCEPT -guest` | **yes** (ACCEPT cannot refuse) |
| the bot's `SAMODE` on the guest: `+T`, `+B`, `-R`, `+s`, `+m` | all accepted, none stops sending |

So the plan's fear is confirmed: a guest with a throw-away account can message every account holder, and nothing in Ergo can say no to that class. The plan's line "the `+iR` default stops only senders with no account" is exactly right.

(Side result: a connection with no account, in a `+M` room, cannot speak, as today; the same guest with an account does.)

**A way out, tested: RELAYMSG** (`handlers.go:3595-3660`, "the bot speaks for the guest"). Ergo's own command for bridges. The bot, an oper with the `relaymsg` capability, sends `RELAYMSG #room anon/brave-otter :text`; the room sees a message from the nick `anon/brave-otter`. Measured in `q2b.py`, on a config with `server.relaymsg.enabled: true` and the capability added to the bot's class:

- It speaks in a `+M` room, with the guest holding no account and not being on Ergo at all.
- The line carries the tag `draft/relaymsg=gnoworld` (the account holder saw it).
- Nobody can answer by direct message: `401 anon/brave-otter :Relayed users cannot receive private messages` (`handlers.go:2457-2460`).
- The nick must contain the separator (`/`); a nick without one is refused (`INVALID_NICK`).
- A real account that is not the bot cannot use it: `FAIL RELAYMSG PRIVS_NEEDED` (with `available-to-chanops: false`; the default, true, would let a room's operator relay, so it is set off).
- Today the command is **off** (`NOT_ENABLED`): enabling it is a config change (the key `server.relaymsg`, the capability `relaymsg` on the bot's class), which is a Stop-and-ask item.

**Proposal: re-plan part 2 around RELAYMSG, not around a guest account in Ergo.** The guest keeps reading as today (an Ergo connection with no account, `+R`, cannot message). Speaking goes through the server: the page posts a line to a new route, the server checks the guest's cookie, its limits and the bot's rules **before** anything is relayed, then the bot relays it as `anon/<name>`. What this changes against the plan:

- No guest account in Ergo: Q11 and the datastore growth go away; no ticket, no auth-script branch, no `anon-` spelling to keep disjoint from addresses (the plan's 3.1 shrinks to a table of guests, a cookie, a route and the limits).
- No direct message, ever, by construction (and no reaction, edit or slash command: the guest has no Ergo session to send them).
- The server sees the line first, so the plan's "residual we cannot close" (3.2: a guest's line visible for the verdict's delay, then redacted) is closed: a line that breaks a rule is never relayed.
- Strikes and mutes work on the server's guest id, not on an Ergo account; no `m:anon-…` ban mask.
- Costs to name: a relayed line has no `account` tag (the bot's `said.account`, `moderation/check.ts`, is the bot's own, so moderation must key on the `draft/relaymsg` tag and the nick, or, better, check before sending); the bot's one connection carries every guest line (it is `nofakelag`; not measured under load); the bot must read its own echo for the msgid (`echo-message`, which it can request) if a later REDACT is needed; guests' lines count in "here" by the server's table, not by Ergo's presence (D374 becomes simpler, D353 too: no `anon-` nick ever shows in `present.seen()`).
- Not verified: the page's own echo of a line it posted (it needs the relayed line from the room, which it receives as any reader); history replay of relayed lines (they were in the room's history in my run only as far as the room's members saw them; `CHATHISTORY` was not run).

**Second option, not tested: a filter on the guest's WebSocket.** `deploy/web/nginx.conf:147` passes `/ws` straight to Ergo, so a raw client talks to Ergo itself. A server-side WebSocket proxy for guests that drops every `PRIVMSG <nick>`, `NS`, `CS`, `ACCEPT`, and other commands would also stop direct messages. It makes the server a parser of IRC for hostile input in front of Ergo (new tier-1 attack surface, all commands to list), and keeps the guest account and the Q11 cost. RELAYMSG is smaller. I recommend RELAYMSG.

**Option A of Q1 (no account, a nameless connection) is not repaired by this**: it still picks its own nick. Not retested.

## 2. Q11: unregistering and the cost of 1,000 accounts

**Source and measure** (`q11.py`):

- The bot's class today is `[sajoin, samode, chanreg, history, nofakelag]`. With it, `NS UNREGISTER <account>` answers `Insufficient oper privs` (`nickserv.go:1129`, the test is `accountName == client.AccountName() || client.HasRoleCapabs("accreg")`), and `NS SAREGISTER` answers `Command restricted`.
- With `accreg` added to the class, both `UNREGISTER` and `ERASE` work, in two steps: the first call prints a confirmation code, the second with the code does it (`nickserv.go:1095-1160`). The code is derived from the account name and its registration time (`ConfirmationCode`), so the bot reads it back from the reply; it is not a secret.
- `UNREGISTER` keeps the name **reserved for ever**: a later login of the same name is refused, measured `REFUSED`, source `accounts.go:447-448` (`errAccountAlreadyUnregistered`; the key `account.unregistered <name>` stays). `ERASE` removes every record: measured, the same name logged in again afterwards (autocreate made a new account). With random, never reused guest names, either works; `ERASE` leaves nothing behind.
- Both also kill the account's connections (`accounts.go:1936-1938`, `killClients`).
- **`accreg` is not narrow.** It is the only capability that unlocks `UNREGISTER` of another, and it also unlocks `NS LIST` (all accounts), `SADROP`, `SAREGISTER`, `SAVERIFY`, `SAGET`, `SASET`, `RENAME`, `ERASE` (`nickserv.go:124, 156, 169, 179, 214, 276, 353, 414`). A bot that holds it could rename or drop any account, a real person's included. It is a new power for the bot's class: tier 1, `security-reviewer`. There is no HTTP or other API in Ergo v2.19.1 for accounts (`default.yaml` has no such listener beyond pprof): the oper's IRC session is the only way.

**Cost of 1,000 accounts** (`cost.py`, same machine, sequential connect, SASL, `QUIT`; names `anon-brave-otter-NNNN`; the history store untouched):

| State | RSS | `ircd.db` (the accounts) | `history.db` |
|---|---|---|---|
| empty server | 24.9 MB | 0.4 KB | 4 KB |
| after 1,000 first logins (autocreate) | 33.3 MB | 1,126 KB | 4 KB |
| after `ERASE` of all 1,000 (0.1 s in all) | 33.9 MB (Go keeps its heap) | 1,471 KB (the file only grows: deletes are appended) | 4 KB |
| process stopped, then started again | 26.5 MB | 1,471 KB (not compacted) | 72 KB |

Per account: **8.4 KB of RAM, 1.1 KB on disk**. The datastore is `buntdb`, held whole in memory (`accounts.go` reads it through `server.store`); only a restart gives RAM back, and the file is never shrunk by a restart in my run. `UNREGISTER` instead of `ERASE` (`unreg.py`): 1,000 in 0.10 s, RSS 26.4 MB after a restart, `ircd.db` 1,559 KB; its reserved names were not distinguishable in RAM from `ERASE`'s residue at this size (a 1.4 MB difference from empty after either).

Login time: first login with autocreate 20.3 ms mean, 19.7 ms median (the Python script start is most of it), max 345 ms once; the first 100 against the last 100 accounts: 24.1 against 19.2 ms, so no growth with the count. A login of an existing account: 20.6 ms mean (200 of the 1,000). Flat.

At the plan's 600 a day: 219,000 a year is about **1.8 GB of RAM and 240 MB of file with no cleanup** (linear extrapolation of the above, not measured at that size). With a job that `ERASE`s a guest account 24 hours after its last use: about 600 to 1,200 live, 5 to 10 MB. The file still only grows by about 1.1 KB per account made and per erase (about 0.6 MB a day at 600), which is small, but a restart and a manual compaction have to be a known step; not measured past one restart.

**Meaning.** If guests keep Ergo accounts, the daily erase job and `accreg` are mandatory, not optional, and the fallback of Q11 (a bounded pool of leased names) is not needed. With the RELAYMSG proposal, no account is made and Q11 is closed.

## 3. `CHANNELLEN` and the room name

- Ergo advertises `CHANNELLEN=64` (measured, `005`; `config.go:1944`). The limit counts the `#` (`channelmanager.go:109`: `len(casefoldedName) > ChannelLen`, the casefolded name with its `#`), and a 65-character room is refused with `403`.
- The limit **cannot be raised**: with `channellen: 80` Ergo does not start: "to use SQLite, nick and channel length limits must be 64 or lower" (`config.go:1332`, `sqlite/config.go:13`). SQLite is on because of persistent history. Raising it means giving up the persistent history, which is out of the question.
- Legal characters: any but space, comma, `*` and `?` (`strings.go:72-78`). `/`, `-` and digits are fine; measured: `#gnoswap/gns-0123456789` joins. The plan's RFC claim holds in this narrower form.

**The plan's name fits only for a world slug of 30 characters or fewer** (`#` + world + `/` + 21 + `-` + 10 = 64, measured: a 30-character world joins, a 31-character one gets `403`). Our worlds do not: of the 743 paths of `onyxPaths.txt`, with `worldIdOf` (`worldId.ts`) and `/` written `-` (`worlds.mjs`):

- 533 worlds; **398 have a slug longer than 30**; 12 are longer than 62, so not even `#<world>` fits.
- 74 of the 91 namespaces are `g1…` addresses (40 characters). Every realm under one, generic `x/…` ones especially (`g1magld5ptgzaktqcexxq0pgq5lmdf0kz6re8hlv-x-daily-countminsketchdemo`, 67 characters), is far past the limit.
- With the plan's name at full width, **521 of 743 realm rooms exceed 64**. The longest made name is 101 characters and is refused (`403`).

This also means the existing `RoomId` (`packages/schemas/src/rooms.ts:12`, 64 maximum) already cannot name the main room of those 12 worlds; that is an existing gap, which I did not check against the live roles file.

**Proposal for part 1:** the world part of a realm room is **a short key, 30 characters at most**, kept in a lookup the server and the app both build from the same pure function: the world's slug when it is 30 or less, else its first 21 characters + `-` + 8 hex of its SHA-256 (the hash alone makes it unique). Then `#<key>/<tail ≤ 21>-<10 hex>` always fits (63 at most). `worldOf(room)` cannot read the world back from a shortened key, so the server needs the map key -> world (the worlds job already has every world; the roles file's hub slugs are already short). That removes the plan's "never read back from the id" rule for the long worlds, and the roles lookup (`typeOf`, `rooms/types.ts`) must go through the map. A room that is a realm's own tail with the 10-hex hash keeps the plan's collision argument. Alternative: a flat `#r-<16 hex of the path>` and the world by a table; shorter, but the room name then says nothing of its world; I prefer the first.

Guest names: Ergo's `nicklen` is 32 (our config); `anon-<adjective>-<animal>-<4>` fits if adjective + animal is at most 21 characters (plan 9: a test on the word lists). Not needed under RELAYMSG, where the nick is `anon/<name>` and the 32 applies the same way (not measured for relayed nicks).

## 4. 5,000 rooms

Throwaway Ergo with our config and no changes; the bot (an oper) joins 5,000 rooms of up to 64 characters (`#` + 28-character world + `/` + 21 + `-` + 10 hex, 62 characters), 8 per JOIN line like `irc/lines.ts` `joins()` (625 lines), then sets `+M`, `-i` on each, then reads each like `irc/state.ts` does (`MODE`, `SAMODE <room> I`, `NAMES`, one room at a time, waiting for the 366):

| Step | Time | RSS | `history.db` |
|---|---|---|---|
| empty | | 25.0 MB | 4 KB |
| bot joins 5,000 rooms | 0.43 s | 41.9 MB | 2,592 KB |
| `+M` and `-i` on each (10,000 `SAMODE`) | 0.40 s | 49.4 MB | 5,176 KB |
| **one read pass, 5,000 rooms** | **0.35 s** (0.07 ms a room, p99 0.12 ms, max 1.1 ms) | 49.8 MB | 5,176 KB |
| `LIST` with 5,000 rooms | 0.33 s, 5,000 entries | 50.6 MB | |

Per room: **about 5 KB of RAM and 1 KB of file**. The bot is not stopped by `max-channels-per-client: 100`: 300 and 5,000 rooms joined with no `405` (`join.py`; the plan's "not verified" in section 4 is settled). The server's own pass was **not run**: this is raw Ergo, read by a script with no Node, no promises, no `present.seen`, no `desired()`, and empty rooms; the plan's measurement of the real reconciler (Node, per-room awaits) stays for part 5. The raw read is 0.07 ms a room, so the plan's trigger (a pass past 10 s) would come from the server's side, not from Ergo, if it comes.

Join time for a visitor: unchanged by the room count. The first five JOINs of a connection take 0 ms and the following ones about 500 ms each, with 20, 300 and 5,000 rooms alike (`join.py`): that is Ergo's `fakelag` (burst 5, then one command per 500 ms for a client with no `nofakelag`), not the rooms. A page that joins one or two rooms is not touched.

## 5. Q5: a throw-away account without a real user's SASL

- The login's way works for guests as it is. Ergo calls the auth script with the SASL account name and passphrase; if the script answers `success` with an `accountName` that has no account, `autocreate: true` makes it (`accounts.go:1455-1470`, `loadWithAutocreation` calls `SARegister` with an empty passphrase). Measured: 1,000 `anon-…` accounts made by the first login, each in about 20 ms, with no password stored (the script's own ticket is the passphrase, as for logins). The script's answer is `success`, `accountName` and `error` only (`authscript.go:36-40`); there is nothing to add.
- Ergo can also hand the script the WebSocket's cookies: `listeners.go:161, 238` extract them and `accounts.go:2085-2100` passes them to the script on SASL EXTERNAL (`handlers.go:375`). The `__Host-guest` cookie of the plan could be the credential itself, with no ticket. Source only: not tested (a WebSocket and a cookie jar were not set up); nginx must forward the `Cookie` header on `/ws`.
- A hostile client names its own account: whatever is typed in the SASL, the script decides, so `named()` (`ergo/auth.ts`) keeps refusing every name that is not an address or the bot until part 2 adds a branch; a guest name must come from the server, as in the plan's 3.1.
- With the RELAYMSG proposal none of this is needed.

## What each part now does

- **Part 1 (names and rooms as pure functions):** re-plan. Add the world key (30 characters at most, hash when longer) to `realmRoom`; its test over the 743 paths now fails on the plan's form, so the test is a good first one. `guestName`'s lists matter less under RELAYMSG (the name is `anon/<name>`, an owner of the server's table).
- **Part 2 (admission):** **do not go as planned.** A guest with an Ergo account can message everyone and Ergo cannot stop it. Needs Alexis's word on the proposal: guests post through the server, the bot relays with `RELAYMSG` (a new Ergo config key and a bot capability, Stop-and-ask). If he prefers keeping guest accounts instead, the plan can go on only with the DM hole accepted and written down in the review card, and with `accreg` plus an erase job (part 2 grows by those, tier 1).
- **Part 3 (a guest's rules):** go in either case, and simpler under RELAYMSG (a rule is checked before the line is relayed, so nothing breaking a rule is ever seen; strikes use the server's guest id).
- **Part 4 (presence and trends):** simpler under RELAYMSG (no `anon-` nick on Ergo to filter); unchanged otherwise.
- **Part 5 (realm rooms):** go for the count: 5,000 rooms are cheap (about 25 MB, one raw pass 0.35 s), but the **room name must change first** (part 1). The reconciler pass in Node still has to be measured there.
- **Part 7:** the soak with 1,000 guests changes under RELAYMSG: 1,000 guests are table rows, not Ergo connections; only the bot's one connection is stressed.

## Not verified

- A guest's WebSocket cookie reaching the auth script (source only).
- The server's own reconciler pass over 5,000 rooms, with people in the rooms and the Node link.
- RELAYMSG with the bot under a sustained load, its `CHATHISTORY` replay and its REDACT (the msgid of a relayed line, from the echo), and nick length for `anon/…`.
- RAM and file past 1,000 accounts and 5,000 rooms (the 219,000 figure is a linear extrapolation).
- The existing gap of a world over 62 characters against `RoomId` (the live roles file was not read).
- Ergo's behaviour on a different machine or build; `unreg.py` against `cost.py` (UNREGISTER against ERASE) at a size where the reserved names would show.
