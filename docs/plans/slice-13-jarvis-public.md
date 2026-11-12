# Slice 13, Jarvis's public, kept answers (D13067, D13089) - TIER 1

Read first: `guest/say.ts` (a guest's line: access, mute, 3 limiters, rules, provider, `relay`), `irc/relay.ts` + `irc/lines.ts`'s
`relayForm` (the only RELAYMSG the link may send: a guest nick, one line, 510 bytes), `cards/` (the model: a line heard, data kept by
msgid, streamed, expired, dropped on edit), `door/ask.ts` + `calls.ts` (quota, strikes, `forRelay`), `door/lines.ts` (recent lines, `taken`).

## Done when
1. A person's `@jarvis <q>` asked in a PUBLIC room that gets an `answered` shows, for every reader, one line under `jarvis/bot` after the question, and the
   same line from the history after a reload or a restart (its full answer and buttons kept by msgid).
2. That line is drawn as Jarvis's card (text, buttons) for every reader; any other IRC client reads a short plain line.
3. The line went through the room's rules and the provider like a guest's; one refused stays the asker's private card, nothing in the room.
4. A deleted or edited line (REDACT, edit) drops its kept answer; a members room never gets a public answer.
5. The asker's own card stands right after its question line (the line whose words are the question, heard after the ask); the 5 s wait is only the fallback.

## Out of scope
Catch-up, "here" and function asks (fixed asks stay private cards); answers in members rooms; Jarvis replying to Jarvis; an answer longer than one
line shown in the plain line (the card has it); edit-in-place of an answer; per-room off switch; any new dependency; threading (reply tags).

## Threat model
Assets: the room's trust in the bot's name; the bot's one RELAYMSG power; private rooms; the model budget.
- Injection or a link in an answer: the line text is a flattened plain excerpt (<=280 chars, no markdown); `guestVerdict` (links, mentions, control,
  banned words) runs on the excerpt AND the full markdown, with links allowed only to the door's `hosts`; provider check on the full text; a fault
  keeps it private. Test: `said.test.ts` "an answer with a foreign link, a mention or a banned word is not relayed".
- Making Jarvis "say" chosen words: the asker's question is public beside it, the line carries the asker's guest-style name, the answer passes the
  same moderation, and a model answer that echoes the prompt is a moderation case like any line; strikes (`day.strike`) apply to a refused public
  answer, so it costs the asker. No endpoint takes text from a client: the door relays only what `calls.ts` got from jarvis. Test: "no route relays a client's text".
- Spam by asks: the quota and the share already count each ask; add per room (3/min) and per account (6/min) limiters on public relays, taken before the
  first await like `say.ts`; the relay's 500 waiting cap holds. Test: "the fourth answer in a minute stays private".
- A private room's answer leaking: `mayRead` is checked at the ask, the public relay only if the room is public (`isPublic`) and goes to the ask's room alone;
  the provider never sees a members room's text. Test: "a members room's answer is not relayed nor sent to the provider".
- Kept after deletion: `door/said` store keyed by (room, msgid), dropped by the same `taken`/`onEdit` hooks as `recent`; read route re-checks `mayRead`;
  expired with the cards' retention. Test: "a taken line's answer is gone; the route answers 404".
- The relay's identity: one fixed nick `jarvis/bot` added to `relayForm` (a "/" nick no account can take, `ircd.yaml.tmpl:41`); no new command, no
  new class, same bot connection; RELAYMSG text still one line, 510 bytes. Jarvis's lines never enter `recent` (no prompt loop). Tests: `lines.test.ts`,
  "a line of jarvis/bot is not a line Jarvis reads".
- Injected "jarvis/bot" nick by a guest: guests keep `anon/` only (`guestNick` unchanged). Test: "a guest cannot relay as jarvis/bot".

## Cost
One RELAYMSG per answered personal question (about 1 an ask, behind quota), one provider call (the same as a guest line), one SQLite insert
(<=8 KB), one GET per card shown (cached by msgid, immutable). No hot path of the room read; `recent` gains one string compare.

## Scale
First limit: the rows (cap 5,000 or 16 Mo like `jarvis_kept`, oldest out) and the bot's relay queue. Next: cap per room, or the answer inside the history.

## Tests, by level (write first, see them fail)
Unit: `server/src/door/said.test.ts` (new), `server/src/irc/lines.test.ts`, `server/src/door/lines.test.ts`, `server/src/door/ask.test.ts`,
`app/src/features/chat/jarvisEntries.test.tsx`. Route: `server/src/door/said.test.ts` (GET: 200 member, 404 non-reader, 404 unknown/taken).
Component: `app/src/features/jarvis/JarvisSaid.test.tsx`. Journey: none tonight. Failing first:
1. `lines.test.ts` "relayForm accepts jarvis/bot and no other nick with a slash" and "a guest cannot relay as jarvis/bot".
2. `said.test.ts` the five threat tests above, plus "an answered personal question is relayed once under jarvis/bot and kept by msgid" and
   "a refused answer leaves the private card and strikes".
3. `ask.test.ts` "a fixed ask is never relayed".
4. `door/lines.test.ts` "jarvis/bot's line is not in recent" and "taken drops the kept answer".
5. `jarvisEntries.test.tsx` "a card stands after the asker's line that holds its question, whatever the delay" and "falls back to 5 s with no such line".

## Files (T1 = tier 1)
- `server/src/irc/lines.ts` T1 (the relay form); `packages/core/src/chat/jarvisNick.ts` new (the nick, shared by server and app).
- `server/src/door/said.ts` new T1 (judge, limit, relay, keep); `door/ask.ts` T1 (hook after an answered `question`); `door/mount.ts` (route, wire);
  `door/lines.ts` (skip the bot, drop on taken); `chat.ts`/`main` wire for the `relay`, the table (`KEPT_TABLES` sibling) and the expiry.
- `packages/schemas/src/jarvis.ts` (the read route's reply reuses `JarvisAnswer`, none new).
- `app/src/features/chat/jarvisEntries.tsx`, `Person.tsx` (the nick drawn as Jarvis), `app/src/features/jarvis/JarvisSaid.tsx` new, `app/src/lib/api/` read hook.
- `docs/decisions.md` (a row per default below). No `ergo/` file nor `deploy/` change: relaymsg is already on for the bot.

## Branches
One branch, one agent: tests + red pass (about 1.5 h), then code (about 2 h): server (nick, said, wire) then app. Security review beside the merge
check; Alexis reads `lines.ts`, `said.ts`, `ask.ts`'s hook. `deploy/test.sh` not needed (no `deploy/` change). Dependencies: none.

## Questions for Alexis (default taken, he sleeps)
1. Members rooms get no public answer (private card only). Default yes.
2. Only personal questions go public, never `here`/catch-up/function. Default yes.
3. Links in a public answer only to the door's hosts, else private. Default yes.
4. The line is a short plain excerpt, the card (buttons) drawn from the kept full answer. Default yes.
5. A refused public answer strikes the asker. Default yes (same as a refused guest line).
6. Retention equals the link cards'. Default yes.
7. If the review cannot happen this morning (D13089), it ships after the deploy; the code stays on its branch.
