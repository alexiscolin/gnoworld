# gnoworld chat features: Slack, Discord, Discourse, ADR-0002, Ergo

Written on 2026-10-21 (branch `slice-2f`) for the list that `docs/decisions.md:112,140,148` ask for; it lands with
slice 3's merge 3a (`docs/plans/slice-3.md`, 3a, "The feature list"). Every claim about a product, Ergo or IRCv3
cites a source read in that session (keys at the end, each marked F = page fetched, X = seen only as a search
excerpt of that official page); what could not be verified is in §5. Every claim about Ergo stays a claim until a
test of 3b passes against the real binary (`docs/plans/slice-3.md`, 3b).

## What Alexis chose (2026-10-21)

The rows of §1 below are the draft's recommendations, written before he chose. Where a row says otherwise, this
table wins. A feature that is in no row of this table (the forum rows F1 to F6 among them) is not decided. The
decisions name merges by the first draft's letters (3f for the bot, 3h for the CSP); this table names them as
the plan's section "The merges" has them: 3g lands with 3b, 3k with 3j, 3m with 3l.

| Choice | Row of `docs/decisions.md` | Rows of §1 | Built by |
|---|---|---|---|
| This list is written during 3a, and Alexis chooses from it | `docs/decisions.md:140` (and `:112`, `:148`: forums are in scope) | all | 3a |
| Roles: "team" (moderator of every world, trusted) and "trusted" (spared the automatic mute, nothing more), in a file the server reads; a realm's deployer becomes its world's moderator once `server` reads the indexer | `docs/decisions.md:147`, `:149` | P2 | 3g (with 3b) |
| Every world has its main room, the Earth its general room; a world's further rooms are created by its moderators and the team only; the server gives each account its IRC nick, the app shows the account | `docs/decisions.md:147` | R1, R2, P1 | 3d (nick), 3h (main rooms), 3l (further rooms) |
| Rights earned by activity: later, from what `server` sees, never from the device; first, rooms: an account that proved itself may create one | `docs/decisions.md:148`, `:149`, `:162` | P7, X7, R2 | 3l (by moderators); the earned rule is a later slice, not scheduled |
| Verdicts: the hide and its reason through IRC, "checked" through a stream; no contest before slice 12 | `docs/decisions.md:145`, `:146` | X1, X8, M11 | 3j; slice 4 shows the pill and the "why" button |
| An automatic mute for repeat offenders, with a whitelist | `docs/decisions.md:146` | X4 | 3k (with 3j) |
| Simple anti-spam rules before any provider call, per world; slow mode later | `docs/decisions.md:159` | X2, X3 | 3i |
| Rooms by role: groups per world, five room types, any of them hidden, reconciled into Ergo by `server`; no Discord-like matrix | `docs/decisions.md:155` | R4, R7, P2, P3, P5 | 3m (with 3l) |
| Editing your own message, by our own convention (a new line tagged with the id it replaces); the bot checks every version | `docs/decisions.md:156` | M8, X10 | 3k (the bot's part), slice 4 (the display) |
| Searching messages, in a slice of its own after slice 4's chat | `docs/decisions.md:157` | D1 | the backlog's row 4c |
| A preview can be removed without its message | `docs/decisions.md:158` | M12 | slice 4 (3j's stream leaves the state to it) |
| Four comforts in slice 4: notifications per room and group mentions, a topic and a description per room, typing and the reading place, a threads view | `docs/decisions.md:161` | D4, M7, R5, M17, M16, M3 | slice 4 |
| No upload in phase 0 (`docs/decisions.md:160`), replaced the same day: images and files in a slice of their own after slice 4; slice 4 keeps code as Markdown blocks and an image shown by link once checked | `docs/decisions.md:167` (replaces `:160`) | M13 | the backlog's row 4b, slice 4 |

§2's six corrections to ADR-0002 are Alexis's to apply: the ADR is his, and nothing here edits it.

How to read the table:

- Slack, Discord, Discourse: `yes` and `no` mean the cited page says so; `n/c` means not checked in any official page
  in that session (not a claim either way).
- ADR-0002 column: the verdict in `adr/0002-validated-prototype.md` (`A:line`); `A1:` is ADR-0001; a line of
  `docs/decisions.md` is cited with its path. The backlog (`docs/plans/backlog.md`) is cited by the name of its row,
  because its line numbers move. Verdicts: phase 0, later (phase 1 or 2), cut, absent (the ADR says nothing).
- Ergo/IRCv3 column: Ergo is v2.19.1 (released 2026-08-05, E9). Spec status: `ratified` only where a dated post says it
  (reply, WebSocket: I11). `stable` = the spec page has no work-in-progress banner and ircv3.net lists it with no label (I1);
  the pages never use the word ratified. `WIP` = the page says "work-in-progress". `PR` = no spec page, an open pull request.
- Cost, in merges (one merge is about 400 lines, `docs/decisions.md:57`; 600 when it touches no tier-1 file,
  `docs/decisions.md:169`): S = under about 150 lines, rides in another merge;
  M = one merge; L = two or more merges, or a new store, service or ADR. My estimates, with no measurement.

## 1. The table

### Messages

| # | Feature | Slack | Discord | Discourse | ADR-0002 | Ergo / IRCv3 | Cost | Recommendation |
|---|---|---|---|---|---|---|---|---|
| M1 | Formatting and long messages | n/c | n/c | n/c | phase 0, Markdown on the wire, multiline (A:148) | `draft/multiline` WIP (I8); Ergo allows 4096 bytes and 100 lines by default (E2) | S | Keep as the ADR has it. |
| M2 | Reply to a message | thread reply only (S2) | yes, type REPLY, ping toggle (D2, D17) | yes, replies in a topic (F7) | phase 0, tag `+draft/reply` (A:147) | `+reply` ratified Feb 2026 (I6, I11); needs `msgid`, wants `echo-message` (I6). The ADR's `+draft/reply` name is the old one | S | Keep. Send `+reply`, also read `+draft/reply`: no source I read says the draft name was renamed (an inference, section 5). |
| M3 | Threads | yes, "also send to channel", Threads view, follow rules (S2) | yes, public and private threads, auto-archive 60, 1440, 4320 or 10080 min, lock (D1, D4) | a topic is the unit (F8) | phase 0, "built from reply chains" (A:147) | No thread object. A thread is a `+reply` chain; CHATHISTORY `AROUND msgid` fetches the root (I2). Our own folding | M | Keep, minimal: group by `+reply` root, no follow state. Follow and a Threads view are gap 10 in section 3. |
| M4 | Emoji reactions, and removing one | yes; limits on distinct emoji per item and per person (S8, S9) | yes; `ADD_REACTIONS`, removing others' needs `MANAGE_MESSAGES` (D2) | likes only (F8); other reactions n/c | phase 0 (A:147) | `+draft/react` and `+draft/unreact` WIP (I7). Ergo stores a tag-only message only if the tag is whitelisted; default whitelist `+draft/react`, `+react`, not `+draft/unreact` (E2) | S | Keep. In 3b add `+draft/unreact` to the whitelist and test a replay, or a removed reaction comes back after a reconnect. |
| M5 | Custom emoji, stickers | yes, custom emoji and aliases, guests too (S8, S7) | yes, `CREATE_GUILD_EXPRESSIONS`, stickers, sounds (D3) | n/c | absent (the emoji picker is in the backlog's slice 4 row; flags `docs/decisions.md:90`) | A reaction value "has no restrictions" (I7), so `:name:` is possible; the image needs hosting | L | Cut for now: an image from a person needs hosting and a check (A:163, A:898-904). Unicode only. |
| M6 | Mention a person, and be notified | yes; non-members of a private channel are not notified (S10) | yes; edit rebuilds the mention list (D2) | n/c | phase 0, `@name` completion (A:149), notifications from "Ergo mentions" (A:161) | Plain text only; Ergo keeps no mention index. Nick equals account (E2: `force-nick-equals-account`), and the app shows the name (`docs/decisions.md:147`) | S | Keep. Write the nick in the text, render it as the name; the server indexes mentions for the inbox. |
| M7 | Group mentions: @channel, @here, @everyone, user groups | yes, restrictable per channel; user groups on paid plans (S11 X, S18, S7) | `MENTION_EVERYONE` permission (D3) | n/c | absent | Nothing native | S | Later, and only for a world's moderators. A free address (`docs/decisions.md:144`) makes it a spam tool. |
| M8 | Edit your message, "(edited)" mark | yes, window set by owners (S3; S20 X); "(edited)" shown for human edits (S4) | yes, author only; `edited_timestamp` (D2) | yes, with history (F6); editing time is limited by level (F1) | **cut** in phase 0, "no IRCv3 capability" (A:153, backlog "Not built") | No spec. IRCv3 PR #425 is open since 2020, back to draft in March 2026, design undecided (I13). The redaction spec defines no edit (I3). Own convention needed | M | Add as our own tag, e.g. `+gnoworld/edit=<msgid>` on a new PRIVMSG; clients fold it only if the account tag matches the original's (I14). The bot must check each edit or an edit bypasses the check. Details in section 3, gap 1. |
| M9 | Delete your own message | yes, owners may restrict; unsend within 15 s on desktop (S3, S7) | yes (D2) | n/c | phase 0, needs `allow-individual-delete` (A:150) | `REDACT`, `draft/message-redaction` WIP (I3). Ergo advertises it only when `allow-individual-delete` is on (E8, 2.16.0); default off (E2). Own message: `canDeleteSelf` (E5) | S | Keep. Pin Ergo at 2.19.1 or later: 2.19.1 fixed wrong redaction permissions (E9). |
| M10 | Delete someone else's message (moderator) | yes, owner and admin (S7, S3) | yes, `MANAGE_MESSAGES` (D2) | yes, staff and level 4 edit all posts (F1) | bot hides (A:796); moderators act through the console, which sends Ergo's commands (A:848, slice 12) | `REDACT` is allowed for a channel operator when `allow-individual-delete` is on, or for an oper with capability `history`, which is in `server-admin`, not `chat-moderator` (E5, E2) | S | Decide in 3b which the bot is: op in every room, or an oper with `history`. Test both against real Ergo. |
| M11 | Link preview, embed | yes, from OpenGraph tags (S6) | yes, `EMBED_LINKS` (D3) | n/c | phase 0, accepted services only, on click, after the check (A:163, A:799, A:898-904) | None in IRC. The server holds the state and tells clients through its stream (`docs/decisions.md:145`) | L | ADR stands (slice 4). |
| M12 | Remove a preview without deleting the message | yes, the x on the preview (S5); the composer can drop it before sending (S6) | yes, flag `SUPPRESS_EMBEDS`, set and unset by edit; for another person's message `MANAGE_MESSAGES` (D2) | n/c | **absent** (`docs/decisions.md:112` names it) | Nothing. Same road as the verdict signal (`docs/decisions.md:145`): a server table `suppressed(msgid)` pushed on the stream | M | Add with previews: the author and any world moderator may remove one, reversibly. Plain IRC clients never had previews. |
| M13 | File and image upload | yes (S7) | `ATTACH_FILES` (D3) | n/c | **cut**: no uploads (A:163, A:904, backlog "Not built") | None | L | Keep cut. Gap 5 in section 3. |
| M14 | Pins | yes, `too_many_pins` error (S12); 100 per channel (help article, X) | yes, `PIN_MESSAGES` (D2, D3); 250 per channel (D9 X) | pin a topic, level 4 (F1) | phase 0, one through `TOPIC`, several through channel metadata if Ergo has it (A:154) | Ergo ships `draft/metadata-3` (E7, E8) with 100 keys per client by default (E2); channel metadata is for members only since 2.19.0 (E8). `TOPIC` holds 390 bytes (E2). Metadata spec page is for `-2`, WIP (I15) | M | Several pins as metadata keys holding msgids, the topic left for the description. |
| M15 | Room bookmarks (links in the header) | yes, 100 per conversation (S13) | n/c | n/c | absent; realm card actions are close (A:183) | A metadata key | S | Cut. Pins and the realm card cover it. |
| M16 | Saved messages, drafts, mark unread | yes, `is:saved` (S15) | n/c | n/c | phase 0, on the device (A:152, A:155) | `draft/read-marker` WIP, supported by Ergo (I4, E7); keeps a read time per account across devices | S | ADR stands; consider read-marker for unread across a person's devices (gap 9). |
| M17 | Typing indicator | n/c | n/c | n/c | not in the table; only "typing and presence updates throttled" (A:1222) | `+typing`, 3 s throttle, `active` expires after 6 s (I5), a TAGMSG. Ergo does not store it (E2 whitelist) | S | Add late. Fakelag allows 2 messages per second (E2), so keep to the 3 s rule. |
| M18 | History, scroll-back, catch-up | yes, guests see history of their channels (S17) | `READ_MESSAGE_HISTORY` is its own permission (D3) | topics persist | phase 0, windowed list (A:146), catch-up after an outage (A:792) | CHATHISTORY WIP (I2); up to 1000 per request, in-memory history of 2048 per channel, persistent history off by default, `expire-time` 1 week (E2). **A client that has not joined a channel cannot read its history** (E3, section 4) | M | Switch persistent history on and set retention (`docs/plans/slice-3.md`, 3n). The telescope's "history for a non-member" (A:118) fails: use the server's feed. |
| M19 | Polls | n/c (a help article exists, seen by title only) | yes, `SEND_POLLS` (D3) | n/c | later, phase 1, `TAGMSG`, one vote per account (A:164) | TAGMSG plus `account-tag` (I14) | M | Keep phase 1. |

### Rooms and structure

| # | Feature | Slack | Discord | Discourse | ADR-0002 | Ergo / IRCv3 | Cost | Recommendation |
|---|---|---|---|---|---|---|---|---|
| R1 | Public rooms | yes, public or private channels (S1) | yes, `GUILD_TEXT` (D1) | categories (F8) | phase 0, per world (A:146, `docs/decisions.md:147`) | A channel; default modes `+ntC` (E2) | S | Keep. |
| R2 | Who creates rooms | members by default, owners may restrict (S1, S7) | `MANAGE_CHANNELS` (D3) | admin, or moderator if allowed (F9 X) | a world's moderators only (`docs/decisions.md:147`) | `channels.operator-only-creation` (default off) limits creation to opers with `chanreg` (E2). Each account may register 15 channels (E2); whether an oper is exempt is unverified | S | Switch `operator-only-creation` on and raise the 15 (3b). |
| R3 | Groups of rooms (categories, sections) | n/c | yes, a category holds up to 50 channels, permissions sync (D1, D3) | yes, with subcategories (F9 X) | phase 0, "groups set by the world's moderators" (A:146) | None; the data file or the server | S | ADR stands. |
| R4 | Private rooms (members only) | yes, by invitation; convert public to private (S1, S22 X, S7) | yes, `VIEW_CHANNEL` overwrite; private threads (D3, D1) | yes, a category visible only to chosen groups (F10) | later: encrypted private rooms are phase 2 (A:176, A1:524) | `+i` with exception lists and persistent voice, enforced by Ergo (E1, E4); not encrypted | M | See section 4. Call it "restricted, not encrypted", never "private". |
| R5 | Topic, description, guidelines | n/c | topic 1024 bytes, forum guidelines 4096 (D1) | n/c | absent; `TOPIC` is taken by the pin (A:154) | `TOPIC`, 390 bytes (E2), `+t` by default (E6) | S | Topic is the description. Pins go to metadata (M14). |
| R6 | Rename, archive, read-only room | yes: archive (S7), posting permissions (S18) | threads archive and lock (D4); permissions | close a topic, level 4 (F1) | absent | `draft/channel-rename` WIP (I9, E7); archive = `+m` plus a server flag | S | Archive = `+m` and hidden. Avoid renames: room URLs are canonical (A:228). |
| R7 | Read-only (announcement) room | yes, posting permissions, up to 100 people (S18) | yes, announcement type (D1), deny `SEND_MESSAGES` (D3) | yes, a group with See only (F10) | absent (the teammate says mods have read-only rooms) | `+m`; voice and above speak (E6) | S | Native. Section 4. |
| R8 | Shared rooms across worlds | yes, Slack Connect (S21 X) | yes, announcement channels are followable (D1) | n/c | phase 0 "embassies" (A:120); comets later (A:167) | One channel listed by two worlds; comets need `draft/relaymsg`, a PR that may stay a draft, shipped by Ergo (I12, E12) | S | ADR stands. |
| R9 | Hundreds of rooms | n/c | n/c | n/c | phase 0, switcher, windowed (A:146) | A client may join 100 channels by default (E2) | M | Do not auto-join every room; list with `LIST`. |
| R10 | Direct and group messages | yes, group DMs (S3, S17) | yes, `GROUP_DM` (D1) | n/c | plain DMs phase 0 (A:175); group DMs absent | Private messages; stored for logged-in clients, default opt-out (E2); a DM can be redacted by its sender only (E10) | M | Groups later. |

### People and roles

| # | Feature | Slack | Discord | Discourse | ADR-0002 | Ergo / IRCv3 | Cost | Recommendation |
|---|---|---|---|---|---|---|---|---|
| P1 | Identity: name and face | n/c | n/c | n/c | address plus nebula (A:160) | Nick = account (E2). `limits.nicklen` is 32 (E2); an address is 40 characters (`docs/decisions.md:42`): raise it or derive a shorter nick (`docs/plans/slice-3.md`, 3d). `setname`, metadata (E7) | S | Check the limit in 3b. |
| P2 | Roles | owner/admin, member, guest; Enterprise system roles (S7) | roles with permission bits and a hierarchy (D3) | staff, moderators, groups (F10) | admin, moderator, curator in a file (A:821-830); team, trusted, world moderator (`docs/decisions.md:147`, `docs/decisions.md:149`) | Five prefixes: founder, admin, op, halfop, voice (E1) | M | See section 4. |
| P3 | Custom roles, per-room overrides | Enterprise custom roles (S7); channel managers on Business+ (S19) | yes, eight-step overwrite order (D3) | yes, See, Reply, Create per group and category (F10) | absent | None beyond the five prefixes | L | Do not copy the matrix. Four room types (section 4). |
| P4 | Guests | yes, paid plans, scoped to chosen channels (S17) | temporary-membership invites (D14 X) | "everyone" includes anonymous (F10) | phase 0, guests read, cannot speak (A1:233, backlog slice 3 row) | An unlogged client; `+M` (E6) | S | Keep. |
| P5 | Invites and approval | yes (S7) | invites; Membership Screening (D3, D6) | n/c | absent; owner invites in ADR-0001 (A1:486) | `+i`, `INVITE` lasts 24 h (E2) | M | With restricted rooms. |
| P6 | Onboarding, welcome | n/c | yes: prompts assign channels and roles, welcome screen of up to 5 channels (D6, D12 X) | n/c | later: "New here" and a welcome, phase 1 (A:170) | None; a server tag | M | Phase 1 stands. Question-based routing is Discord's idea to borrow. |
| P7 | Rights earned by activity (trust levels) | no, roles are assigned (S7) | no; a server's verification level asks email, 5 min, 10 min or phone (D6) | yes, levels 0 to 4 with thresholds (F1) | absent; ADR-0001 tier 2 asks account age (A1:542); undecided, `docs/decisions.md:148`, `docs/decisions.md:149` | None. Account age is known (E2: `registration-time` cutoff); the rest comes from what `server` sees | L | Phase 0 none. If spam shows, an account-age gate first (S). Levels later, from server counters. |

### Moderation

| # | Feature | Slack | Discord | Discourse | ADR-0002 | Ergo / IRCv3 | Cost | Recommendation |
|---|---|---|---|---|---|---|---|---|
| X1 | Automatic check, hide, reason | n/c | AutoMod: block, alert, timeout, custom reason of 150 characters (D5) | flags hide by score (F3) | phase 0, OpenAI after posting, reason shown (A:786-802) | `REDACT` plus a NOTICE (`docs/decisions.md:145`) | M | Slice 3f as planned. |
| X2 | Keyword, spam, mention-spam rules | n/c | yes, six keyword rules, one each of spam, preset, mention-spam; 20 exempt roles (D5) | n/c | absent (a name filter, A:862) | None; in the bot | S | Add cheap rules to the bot: links per message, mentions, repeats. No provider call. |
| X3 | Slow mode | n/c | yes, 0 to 21600 s, `BYPASS_SLOWMODE` (D1, D3) | n/c | absent; a rate limit per account (`docs/decisions.md:144`) | **None**: the manual lists no channel slow mode (E6); fakelag is per connection (E2) | M | Later. It would be post-then-hide; prefer the per-account limit. |
| X4 | Timed mute | n/c | yes, `MODERATE_MEMBERS` (D3) | silence (F3) | ladder: hide, mute, person (A:808, `docs/decisions.md:146`) | Mute extban `m:` (E6); the bot removes it on time | S | As the ADR. |
| X5 | Kick, ban | remove from channels (S7) | `KICK_MEMBERS`, `BAN_MEMBERS` (D3) | n/c | console, slice 12 (A:860) | `+b`, kick; oper `ban` can suspend accounts (E6, E2) | S | Slice 12. |
| X6 | Report a message | Enterprise "content admin" reviews flagged content (S7) | n/c | yes, flag types, from level 1 (F3) | in the message menu, queue in slice 12 (A:150, backlog slice 12 row) | None; the server | M | As the ADR. |
| X7 | Community flags that hide | n/c | n/c | yes, weighted score, level-3 flags hide level-0 posts (F3) | absent | `REDACT` by the bot | M | Only with levels (P7). It is the one way to moderate with no staff (`docs/decisions.md:146`). |
| X8 | Reason shown, appeal | n/c | custom block reason (D5) | the author is told by message (F3) | reason yes, contest slice 12 (A:801, `docs/decisions.md:146`) | NOTICE | S | As the ADR. |
| X9 | Audit log | Enterprise audit logs role (S7) | `VIEW_AUDIT_LOG` (D3) | n/c | slice 12 (A:855) | n/a | M | Slice 12. |
| X10 | Edit history for others | n/c | only a timestamp (D2) | yes, public by default, 5 min grace (F6); wikis always (F4) | cut with editing | None | S | If edits ship, keep every version in the server for moderators. |

### Discovery and search

| # | Feature | Slack | Discord | Discourse | ADR-0002 | Ergo / IRCv3 | Cost | Recommendation |
|---|---|---|---|---|---|---|---|---|
| D1 | Message search with filters | yes: `from:`, `in:`, `has:`, `before:`, `is:thread` and more (S15, S16) | yes: `from:`, `in:`, `mentions:`, `has:`, dates (D13 X) | search exists, `status:solved` (F7) | **absent**: ⌘K searches worlds, ecosystems, stations, genres (A:138) | No SEARCH spec found (search excerpt, X); CHATHISTORY has no text query (I2) | L | Own index in the server (SQLite) with a room ACL. Stopgap: search the loaded window on the device (S). Gap 2. |
| D2 | Find rooms and people | yes (S15) | n/c | n/c | worlds yes, people absent (A:138) | `LIST` | S | Add people to ⌘K. |
| D3 | Activity inbox | yes, an Activity view (S10) | n/c | n/c | notifications by kind and by world (A:161) | None; the server indexes mentions | M | Add with M6. |
| D4 | Per-room notification settings, mute a room | yes, per thread and per channel (S2) | server default: all messages or mentions only (D6) | n/c | by kind and world only (A:140, A:161) | n/a | S | Add per-room mute on the device. |
| D5 | Push | n/c | n/c | n/c | phase 1 (A:162) | `draft/webpush`: an open PR (I16 X); off by default, "experimental" (E8); 2.19.1 fixed a blind SSRF in it (E9) | M | Phase 1; Ergo at 2.19.1 or later. |
| D6 | Events | n/c | yes, stage, voice or external, 100 active (D7) | n/c | phase 0 from a file, moderators add in phase 1 (A:168) | None | S | ADR stands. |

### Presence and voice

| # | Feature | Slack | Discord | Discourse | ADR-0002 | Ergo / IRCv3 | Cost | Recommendation |
|---|---|---|---|---|---|---|---|---|
| V1 | Who is here | n/c | n/c | n/c | phase 0, `NAMES` (A:158) | `NAMES`; `+s` hides members from non-members (E6) | S | Keep. |
| V2 | Away, status text | n/c | n/c | n/c | absent | `away-notify` (E7), `draft/pre-away` (E7), awaylen 390 (E2), a `status` metadata key (I15) | S | Later. |
| V3 | Voice rooms | yes, huddles: 2 people free, 50 paid, 25 with video (S14) | yes, `GUILD_VOICE` (D1) | n/a | later, phase 1, its own ADR (A:173) | None; WebRTC elsewhere | L | ADR stands. |
| V4 | Screen share | yes, two at a time (S14) | `STREAM` (D3) | n/a | absent | None | L | With voice. |
| V5 | Stage, audience | n/c | yes, moderators need three permissions (D8, D16 X) | n/a | absent | None | L | Cut. |

### Forum-like

| # | Feature | Slack | Discord | Discourse | ADR-0002 | Ergo / IRCv3 | Cost | Recommendation |
|---|---|---|---|---|---|---|---|---|
| F1 | Topics in categories (long posts) | n/c | forum channels hold only threads (D4, D1) | yes (F8) | absent; a "Harbor" station of long reads (A:114); forums added to scope (`docs/decisions.md:148`) | None; a server store | L | A product surface, not a chat feature: decide it before slice 4. |
| F2 | Tags, required tag, pinned post, guidelines | n/c | yes, 20 tags per forum, 5 per post, `REQUIRE_TAG`, one pinned post (D1, D10 X) | tags (F8) | absent | None | M | With F1. |
| F3 | Likes | reactions (S8) | reactions (D2) | yes (F8) | reactions only (A:147) | `+draft/react` with one agreed value (I7) | S | A heart reaction; the counts per distinct account feed levels. |
| F4 | Accepted answer | n/c | n/c | yes, the author or staff marks a reply (F7) | later: routed questions, "Thanks" (A:171) | A server state | M | With routed questions (phase 1). |
| F5 | Wiki posts | n/c | n/c | yes (F4) | absent | None | L | Cut. A world's living page is its realm (A:182). |
| F6 | Badges | n/c | n/c | yes, bronze, silver, gold, automatic or manual (F5) | no NFT badges (A1:573, `docs/decisions.md:92`); passport on the device (A:208) | None | M | Later, computed by the server, never on chain (`docs/decisions.md:149`). |

Rows: 63 (messages 19, rooms 10, people 7, moderation 10, discovery 6, presence and voice 5, forum-like 6).

## 2. Things the reading changed in the docs (ADR-0002 is Alexis's: he applies these six)

1. ADR-0002:147 names `+draft/reply`; the spec is now `+reply`, ratified on 2026-02-23 (I6, I11). `+draft/react` is still draft (I7).
2. ADR-0002:118 hopes Ergo serves channel history to a non-member (slice 4 check). In v2.19.1 it does not (E3, section 4). The telescope's fallback in the ADR ("otherwise phase 1, through the signals feed") is the one that holds.
3. `limits.nicklen` defaults to 32 (E2) and an address is 40 characters, with nick equal to account (`docs/plans/slice-3.md`, 3d).
4. Several things the plan rests on are WIP specs: chathistory, redaction, multiline, read-marker, react, channel-rename, metadata (I2, I3, I8, I4, I7, I9, I15). Ergo implements them under `draft/` names (E7). They may change without warning (I3).
5. ADR-0002:154 uses `TOPIC` for the one pin; a room also needs a description (R5).
6. Ergo's own default is `operator-only-creation: false` (E2). The first draft's Q11, on who creates rooms (`docs/plans/slice-3.md`, 3b and 3e), is answered by that key, which is real.

## 3. The 10 features that matter most for people coming from Slack or Discord, and that ADR-0002 leaves out or cuts

Ordered by how often a Slack or Discord user reaches for it, then by cost of leaving it out.

1. **Edit your own message.** Cut (A:153, backlog "Not built"). Both products have it (S3, D2); `docs/decisions.md:112` already says so. Ergo cannot edit stored history (I3 defines no edit; I13 is an undecided draft). Own tag, with the account tag checked by the client (M8). Cost M. Risk: the bot must check each edit, and the old text must stay for moderators (X10).
2. **Search messages.** Absent (A:138 is a place search). Slack has eleven modifiers (S15), Discord four filters (D13 X). Ergo has no search (I2). Needs an index and a room ACL, so retention (`docs/plans/slice-3.md`, 3n) first. Cost L.
3. **Per-room access by role.** Phase 2 for private rooms (A:176). Slack and Discourse and Discord all have it (S1, F10, D3). Ergo does it natively for join and write, at the price of its limits (section 4). Cost M.
4. **Remove a preview without the message.** Absent (M12). Slack has it (S5), Discord has it and lets a moderator set it (D2). Cost M, with previews.
5. **Upload an image or a file.** Cut (A:163, A:904). Both products have it (S7, D3). The cut is sound while no one can moderate uploads (A:898); it will be the first thing people ask for. Cost L.
6. **Notification control per room, and group mentions.** The ADR filters by kind and world only (A:140, A:161). Slack notifies per thread and per channel (S2); Discord has a default per server (D6). Cost S.
7. **Spam controls that need no provider call.** The ADR has the AI check and a mute ladder (A:786-808); no keyword, link or mention rules (X2), no slow mode (X3). Discord's AutoMod has them (D5) and Ergo has no slow mode (E6). Addresses are free (`docs/decisions.md:144`). Cost S to M.
8. **Room topic and description.** Absent, and `TOPIC` is used for the pin (R5, A:154). Cost S.
9. **Typing indicator and read position across devices.** Typing is implied only by a performance note (A:1222); unread is "on the device" (A:152). `+typing` is a stable spec (I5), `draft/read-marker` is WIP but in Ergo (I4, E7). Cost S.
10. **A Threads and Activity view, and following a thread.** ADR gives threads and no follow (A:147). Slack has a Threads view with unread at the top and follow rules (S2) and an Activity feed (S10). Cost M.

Also worth a decision, though not from Slack or Discord: how rights are earned (P7, X7, `docs/decisions.md:148`).

## 4. Per-room access by role

The need (a teammate's Discord bridge): Discord lets a team make a channel readable or writable by chosen groups; gno.world has public and private rooms and read-only rooms made by mods. Do we want roles, and how do they work over IRC?

### 4.1 What the three products do

**Discord** (D3, D1). A channel, or a category, carries overwrites; each overwrite names a role or a member and holds an allow set and a deny set (D1, "Overwrite Object"). `VIEW_CHANNEL` lets a member see the channel and read its messages; `READ_MESSAGE_HISTORY` is a separate permission for past messages; `SEND_MESSAGES` sends (D3). Denying `VIEW_CHANNEL` disables the other permissions on that channel; denying `SEND_MESSAGES` also disables `MENTION_EVERYONE`, `ATTACH_FILES` and `EMBED_LINKS` (D3). The order, each step overriding the one before (D3): @everyone base, the member's roles' permissions, @everyone deny, @everyone allow, role deny, role allow, member deny, member allow. A channel is "synced" to its category while it has the same overwrites, and "de-synced" as soon as it differs (D3, D15 X). The administrator permission and the owner skip all of it (D3).

**Slack** (S1, S7, S18, S19, S17). Two channel types: public (every member may join) and private (invitation; S1, S22 X). Writing: "posting permissions" limit who may post and reply to chosen people, up to 100 per channel (S18). A "channel manager" role exists on Business+ and Enterprise only (S19). A guest sees only the channels an admin gives them (S17). There is no overwrite model; the unit is a list of people.

**Discourse** (F10). A category's security tab gives each group any of See, Reply, Create. A new category gives all three to "everyone" (anonymous included); `trust_level_0` is "all logged-in users"; a group with See only cannot start a topic. Moderators need to be listed. Groups, not roles, are the unit; the trust-level groups are among them (F1).

### 4.2 What Ergo does natively (v2.19.1, E1 to E5 unless noted)

| Want | Ergo mechanism | Evidence |
|---|---|---|
| Read = may join | Join is refused by `+i` (unless on `+I`, or persistent voice, or half-op and above, or invited), by `+R` (needs an account), by `+b` (unless on `+e` or `+I`), by `+l` | `Join` in `channel.go` (E4): `hasPrivs := isSajoin || founder || (persistentMode != 0 && != Voice) || CheckInvited`; `+i` test has `persistentMode == 0`; comment "#1901: +h and up exempt from all restrictions, but +v additionally exempts from +i" |
| Read history | CHATHISTORY needs membership: `GetHistorySequence` returns `errInsufficientPrivs` when `joinTimeCutoff` says the client is not in the channel. Joined members read history, cut by `history.restrictions.query-cutoff` (`none`, `registration-time` or `join-time`), a global value "it can be overridden by channel owners" | `server.go` (E3), `channel.go` (E4: `joinTimeCutoff` sets `present` only inside `channel.members[client]`), `default.yaml` (E2) |
| Write, everyone with an account | `+M` ("only users that have logged into an account will be able to speak"; voiced users exempt) | E1 |
| Write, chosen people | `+m`; voice, half-op, op, admin and founder speak | E1 |
| One account, persistently | `AMODE` through ChanServ on a registered channel: `+v`, `+h`, `+o` (and admin, founder) | E1: "amode #example +v alice"; only registered channels keep modes, an empty unregistered one is removed (E4: `IsClean`) |
| One account in a list | `+I`, `+e`, `+b` take masks; with `nick-reservation: strict` and `force-nick-equals-account`, a nick or account name is a valid entry: `/mode #example +I alice`. Lists hold 100 entries (`limits.chan-list-modes`) | E1 FAQ "How do I make a private channel?", E2 |
| Hide a room from a list | `+s`: hides it from `LIST` and `WHOIS`, and hides members from `NAMES` and `WHO`, for non-members. It does not stop a join | E6; no `+s` test in the join code (E4) |
| Let the server add someone | `INVITE` (an op's), lasting 24 h by default (`invite-expiration`); `SAJOIN` lets an oper join channels despite restrictions "or forcibly join another user" | E2, E1; `sajoin` is in `chat-moderator` (E2) |
| Send a refused joiner elsewhere | `+f` forward: "Users who are unable to join this channel are forwarded to the provided channel instead" | E6 (master manual; not read at the tag) |
| Only the server creates rooms | `channels.operator-only-creation: true`, for opers with `chanreg` (`server-admin` class) | E2 |
| Delete another's message | op of the channel with `allow-individual-delete`, or oper with `history` | `deletionPolicy` (E5) |

Five prefix levels only: founder, admin, op, half-op, voice (E1). A half-op can kick, set the topic and give voice; an op can change channel modes (E6), so a human moderator with `+o` could open a restricted room. Moderators act through the console (A:848, A:1140), so the server should hold founder and op, and moderators get voice at most.

### 4.3 Mapping proposal

Roles file (already planned for slice 3: moderators per world and trusted accounts, `docs/decisions.md:147`, `docs/decisions.md:149`) gains two things:

- `groups`: named lists of accounts, per world, edited by the world's moderators;
- `rooms`: for each room, `read` in {everyone, account, group G} and `write` in {account, mods, group G}.

A reconciler in `server` (over the bot's operator connection, `docs/plans/slice-3.md`, 3h) turns each room into Ergo state, compares with Ergo's, and fixes drift (run at start, on every change to the file, and on a timer). Ergo then enforces it for every client, plain IRC clients included (a test in slice 12 joins one: backlog slice 12 row).

| Room type (read / write) | Ergo state | Notes |
|---|---|---|
| Open (everyone / account) | `+ntC +M` | The default (E2). Guests join and read. |
| Announcement (everyone / mods) | `+ntC +m`; AMODE `+v` for the world's moderators | The read-only room the teammate has. Bot is op (M10). |
| Logged-in only (account / account) | `+R +M` | Refuses guests at the join. |
| Members (group / the same group) | `+i`; AMODE `+v` for every member; no `+m` | `+v` joins past `+i` and, with no `+m`, speaks. List size under AMODE is unverified. |
| Members read, some write (group / subgroup) | `+i +m`; readers by `+I` (at most 100) or a server `INVITE`; writers by AMODE `+v` | Under `+m` voice means "write", so a reader-only member must not get `+v`. |
| Hidden (any of the above) | add `+s` | Hidden from IRC lists; the app's list comes from the roles file anyway. |

Ergo cannot carry, so `server` must check or the feature waits:

1. **A group over 100 people** in `+I`. Use the server: `INVITE` or `SAJOIN` at each login and role change (the 3d script sees each login, `docs/plans/slice-3.md`, 3d). Invites last 24 h (E2).
2. **A group computed from facts** (levels, account age): `server` computes it and reconciles it like any group.
3. **Anything finer than join and speak**: embeds, reactions, mentions, threads, uploads, slow mode, per-person limits. Ergo has none (E6). The bot enforces after the fact (it hides) and the app hides the control, which a plain IRC client ignores. Whether `+m` stops a reaction TAGMSG from a non-voiced person is unverified.
4. **Read the room but not its past**: `READ_MESSAGE_HISTORY` has no counterpart. A member reads all history from the join, or none before it (`join-time`, global, channel owners may override).
5. **A person who is not a gnoworld account**: a Discord role holder has no address. A bridge needs a link from Discord user to account before any group can name them.
6. **The room's secrecy**: a restricted room is readable by the server, the operators and the moderation bot, and is stored in Ergo's history, like a public one. Decide whether the bot sends such a room's text to the provider (DMs are never sent, A:809).
7. **A moderator who changes modes by IRC**: avoid it (above), and let the reconciler undo drift.
8. **Registration capacity**: AMODE needs registered rooms, 15 per account by default (E2). Raise it, or find out whether an oper with `chanreg` is exempt (unverified).

For the bridge: a Discord overwrite that allows `VIEW_CHANNEL` for role R and denies it for @everyone is `read = group R`; `SEND_MESSAGES` the same for `write`; a member-level overwrite is a group of one; a category is a set of rooms in one world. `READ_MESSAGE_HISTORY` denied with `VIEW_CHANNEL` allowed has no equivalent. Bridged messages would use `RELAYMSG` (Ergo's `draft/relaymsg`; on by default; separator `/`; chanops may use it; opers with `relaymsg` anywhere, E2): the bot speaks as `alice/discord`. Whether RELAYMSG bypasses `+m` is unverified.

Recommendation: yes to groups per world and to the five room types above; no to Discord's permission matrix. Cost M for the reconciler (roles-file schema, an idempotent diff, drift check, tests against real Ergo built from source, `docs/decisions.md:138`), S more for the over-100 path, L if levels come. It needs `core/irc` to format its lines (pairing: Alexis), so it lands as merge 3m (`docs/plans/slice-3.md`), after `core/irc`.

### 4.4 What a bridge to Discord also asks (a teammate's message, 2026-10-21)

The teammate's bridge, run with Jarvis, already carries edits and attachments both ways, and they ask for roles with
per-room rights and a visible organisation of rooms. It is not in this repository: what it does today is unverified.
What is decided answers the first two asks (rooms by role: `docs/decisions.md:155`, merge 3m; sections of rooms set by
a world's moderators, shown in the room switcher: `adr/0002-validated-prototype.md:146`, slice 4). The bridge itself is not planned in
slice 3: 3m leaves out a bridge's user-to-account link and `RELAYMSG` (`docs/plans/slice-3.md`, 3m). It has a row of
its own in the backlog (4d), with these conditions, which are my proposals and not decisions:

- Edits: the bridge sends a Discord edit as our own tag (`docs/decisions.md:156`), or the edit escapes the bot's check.
- Attachments: from Discord, an attachment arrives as a link whose preview shows only after the check, like any link;
  from gno.world, none until slice 4b's protection (`docs/decisions.md:167`). To confirm with the teammate.
- Room by room, chosen by the world's moderators, never by default; the room's header says it is bridged, so a person
  knows their line goes to a third party.
- A line reaches Discord only once the bot has checked it, or the bridge deletes there what the bot hides.
- Discord keeps what it is sent under its own rules: an author's erasure here deletes the copy there, and the privacy
  notice says what cannot be undone.
- Never a restricted room (`docs/decisions.md:155`) unless to a Discord channel restricted alike, never a DM.

## 5. What I could not verify

Sources and how they were read:
- `support.discord.com` returned 403 to every fetch. Every Discord help-center claim (D9 to D17: 250 pins, forum FAQ, slow-mode presets, onboarding minimums, search filters, temporary membership, stage limits, category sync, reply ping) comes from the search tool's excerpt of that official page, not a read of it. Discord claims from `docs.discord.com` (D1 to D8) were read as pages.
- `slack.com` help pages often returned 429. Fetched: S1 to S3, S5, S7, S8, S10, S14, S15, S17 to S19 (through the `intl/en-gb` and `intl/en-in` copies) and the `docs.slack.dev` pages. Seen only as excerpts: the 100-pin limit (the `pins.add` page gives no number), the edit window (S20), the notify-a-channel article (S11), private channels' invitation rule (S22), Slack Connect (S21), polls and channel topics (titles only).
- Not checked in any official page: Slack and Discord typing, presence, custom status; Discord reports, the "(edited)" label, a per-message reaction cap (users report 20; nothing official seen); Slack sections; Discourse group mentions, watched words, events, chat.
- Discourse: the trust-level thresholds (F1) are from the 2018 post; its summary says features moved to groups between 2023 and 2025 (search excerpt) and the permissions table (F2) was not read. Wiki editing is level 1 in the guide and level 2 in a reply (F4). Edit history and the 5 minute grace period come from a Meta support thread (F6), not a doc. Subcategory inheritance is not confirmed (F10).
- IRCv3: only reply and WebSocket are confirmed ratified by a dated post (I11). The 2016 to 2024 round-ups were not read (guessed URLs returned 404), so "stable" for message-tags, account-tag, echo-message, labeled-response, batch, server-time, msgid, typing, setname, bot-mode, monitor means only "no work-in-progress label". The ircv3.net server table (I17) shows `draft/chathistory` and `draft/multiline` as "No" for Ergo while Ergo's own source lists both (E7); I trust the source. The ircv3.net table has no typing, reply, react, relaymsg or webpush column for Ergo.
- That `+draft/reply` became `+reply` on ratification: the registry and the spec page show only `+reply` (I6, I11); no post I read says "renamed". Other software still sends `+draft/reply` (search excerpt only).
- The `account-extban` spec exists (I18). The Ergo manual documents only the mute extban `m:` (E6), and I read no Ergo source for an account extban. I did not rely on it: nick equals account makes `+I alice` enough.

Ergo, read at tag v2.19.1 (E1 to E5) unless the key says master (E6 to E11; E10 and E11 not compared to the tag):
- The code and config were read through WebFetch, which summarises with a small model and quotes at most 125 characters; they are not a local checkout. 3b's spike must confirm each of these with a test against real Ergo.
- Unverified in source: whether `+m` blocks a reaction TAGMSG from a non-voiced person; whether an oper with `chanreg` is exempt from `max-channels-per-account: 15`; how many entries AMODE holds; whether `limits.nicklen` can be raised above 32 and what that does to a 40-character account; whether client tags on a PRIVMSG (`+reply`, our `+gnoworld/edit`) are stored and replayed (the 2.19.0 changelog line about RELAYMSG client tags suggests it, E8); whether replaying reactions needs `draft/event-playback`; whether RELAYMSG bypasses `+m`; who may set channel metadata in Ergo (the spec says channel administrators, I15; the config key `operator-only-modification` is off by default).
- Ergo's REDACT handler and `DeleteMessage` were read from master (E10, E11); the broadcast to channel members was not visible in what I read.
- `+f` forward is from the master manual (E6); the tagged manual was read for `+m`, `+M`, `+R`, `+i`, `+I`, `+s`, `+U`, prefixes, AMODE and SAJOIN only.

Mine: every cost is an estimate by analogy (`docs/decisions.md:57`'s 400-line merge), not a measurement. The recommendation column is my opinion; a decision is only what the table at the top says Alexis chose.

## 6. Sources

Keys: F = fetched and read; X = seen only as a search excerpt. Tag-pinned Ergo files are at `v2.19.1`.

Slack
- S1 F https://slack.com/intl/en-gb/help/articles/201402297-Create-a-channel
- S2 F https://slack.com/intl/en-gb/help/articles/115000769927-Use-threads-to-organise-discussions
- S3 F https://slack.com/intl/en-gb/help/articles/202395258-Edit-or-delete-messages
- S4 F https://docs.slack.dev/messaging/modifying-messages/
- S5 F https://slack.com/intl/en-gb/help/articles/204399343-Share-links-and-set-preview-preferences
- S6 F https://docs.slack.dev/messaging/unfurling-links-in-messages/
- S7 F https://slack.com/intl/en-gb/help/articles/201314026-Permissions-by-role-in-Slack
- S8 F https://slack.com/intl/en-gb/help/articles/202931348-Use-emoji-and-reactions
- S9 F https://docs.slack.dev/reference/methods/reactions.add/
- S10 F https://slack.com/intl/en-gb/help/articles/205240127-Use-mentions-in-Slack
- S11 X https://slack.com/help/articles/202009646-Notify-a-channel-or-workspace
- S12 F https://docs.slack.dev/reference/methods/pins.add/ ; X https://slack.com/intl/en-fi/help/articles/205239997-Pin-messages (100 pins)
- S13 F https://docs.slack.dev/reference/methods/bookmarks.add/
- S14 F https://slack.com/intl/en-gb/help/articles/4402059015315-Use-huddles-in-Slack
- S15 F https://slack.com/intl/en-gb/help/articles/202528808-Search-in-Slack
- S16 F https://docs.slack.dev/reference/methods/search.messages/
- S17 F https://slack.com/intl/en-gb/help/articles/202518103-Understand-guest-roles-in-Slack
- S18 F https://slack.com/intl/en-in/help/articles/360004635551-Manage-channel-posting-permissions
- S19 F https://slack.com/intl/en-in/help/articles/360047512554-Use-channel-management-tools
- S20 X https://slack.com/help/articles/115004868646-Manage-permissions-for-message-editing-and-deletion
- S21 X https://docs.slack.dev/apis/slack-connect/
- S22 X https://slack.com/blog/collaboration/what-to-post-where-in-slack

Discord
- D1 F https://docs.discord.com/developers/resources/channel
- D2 F https://docs.discord.com/developers/resources/message
- D3 F https://docs.discord.com/developers/topics/permissions
- D4 F https://docs.discord.com/developers/topics/threads
- D5 F https://docs.discord.com/developers/resources/auto-moderation
- D6 F https://docs.discord.com/developers/resources/guild
- D7 F https://docs.discord.com/developers/resources/guild-scheduled-event
- D8 F https://docs.discord.com/developers/resources/stage-instance
- D9 X https://support.discord.com/hc/en-us/articles/221421867-Pin-Messages-FAQ
- D10 X https://support.discord.com/hc/en-us/articles/6208479917079-Forum-Channels-FAQ
- D11 X https://support.discord.com/hc/en-us/articles/360016150952-Slowmode-FAQ
- D12 X https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ
- D13 X https://support.discord.com/hc/en-us/articles/115000468588-How-to-Use-Search-on-Discord
- D14 X https://support.discord.com/hc/en-us/articles/208866998-Invites-101
- D15 X https://support.discord.com/hc/en-us/articles/115001580171-Channel-Categories-101
- D16 X https://support.discord.com/hc/en-us/articles/1500005513722-Stage-Channels-FAQ
- D17 X https://support.discord.com/hc/en-us/articles/360057382374-Replies-FAQ

Discourse
- F1 F https://blog.discourse.org/2018/06/understanding-discourse-trust-levels/
- F2 F https://meta.discourse.org/t/understanding-discourse-trust-levels/90752 (links only)
- F3 F https://meta.discourse.org/t/what-are-flags-and-how-do-they-work/32783
- F4 F https://meta.discourse.org/t/editing-and-creating-wiki-posts/30801
- F5 F https://meta.discourse.org/t/understanding-and-using-badges/32540
- F6 F https://meta.discourse.org/t/how-long-are-user-edits-visible-to-the-public/180483
- F7 F https://meta.discourse.org/t/discourse-solved-accepted-answer-plugin/30155
- F8 X https://meta.discourse.org/t/understanding-discourse-for-new-users/96331
- F9 X https://meta.discourse.org/t/create-a-category-in-discourse/197224
- F10 F https://meta.discourse.org/t/understanding-groups-and-category-permissions-security-settings/87678

IRCv3
- I1 F https://ircv3.net/irc/
- I2 F https://ircv3.net/specs/extensions/chathistory
- I3 F https://ircv3.net/specs/extensions/message-redaction
- I4 F https://ircv3.net/specs/extensions/read-marker
- I5 F https://ircv3.net/specs/client-tags/typing
- I6 F https://ircv3.net/specs/client-tags/reply
- I7 F https://ircv3.net/specs/client-tags/react
- I8 F https://ircv3.net/specs/extensions/multiline
- I9 F https://ircv3.net/specs/extensions/channel-rename
- I10 F https://ircv3.net/specs/extensions/message-tags
- I11 F https://ircv3.net/2026/02/23/round-up.html (reply and WebSocket ratified); WebSocket PR https://github.com/ircv3/ircv3-specifications/pull/548
- I12 F https://github.com/ircv3/ircv3-specifications/pull/417 (relaymsg, open)
- I13 F https://github.com/ircv3/ircv3-specifications/pull/425 (edit and delete, open draft)
- I14 F https://ircv3.net/specs/extensions/account-tag
- I15 F https://ircv3.net/specs/extensions/metadata
- I16 X https://github.com/ircv3/ircv3-specifications/pull/471 (webpush)
- I17 F https://ircv3.net/software/servers
- I18 F https://ircv3.net/specs/extensions/account-extban

Ergo (tag v2.19.1)
- E1 F https://raw.githubusercontent.com/ergochat/ergo/v2.19.1/docs/MANUAL.md
- E2 F https://raw.githubusercontent.com/ergochat/ergo/v2.19.1/default.yaml
- E3 F https://raw.githubusercontent.com/ergochat/ergo/v2.19.1/irc/server.go
- E4 F https://raw.githubusercontent.com/ergochat/ergo/v2.19.1/irc/channel.go
- E5 F https://raw.githubusercontent.com/ergochat/ergo/v2.19.1/irc/histserv.go

Ergo (master, or release metadata)
- E6 F https://raw.githubusercontent.com/ergochat/ergo/master/docs/MANUAL.md
- E7 F https://raw.githubusercontent.com/ergochat/ergo/master/irc/caps/defs.go
- E8 F https://raw.githubusercontent.com/ergochat/ergo/master/CHANGELOG.md
- E9 F https://api.github.com/repos/ergochat/ergo/releases/latest (v2.19.1, 2026-08-05)
- E10 F https://raw.githubusercontent.com/ergochat/ergo/master/irc/handlers.go
- E11 F https://raw.githubusercontent.com/ergochat/ergo/master/irc/server.go
- E12 F https://ergo.chat/specs
