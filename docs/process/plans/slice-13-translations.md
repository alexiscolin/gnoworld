# Slice 13: translations stored once (D13082)

A line's translation is made once on the server, kept by line and language for as long as the line lives, and sent with the line.

Read first: today each reader's page asks `POST /api/jarvis/translate` one line every 2.5 s (`app/src/translating.ts`); the door reads the text from
`server/src/door/lines.ts` (last 30 lines of a public room, in memory, so a restart loses them: 404, D194); jarvis caches by the text's hash for a day
(`jarvis/src/translate.ts`). Lines reach the page from Ergo's WebSocket, never through the server; what the server sends a page per line rides the
verdicts' SSE stream (`server/src/stream/stream.ts`: a ring of 64 events a room, replayed by id) and `GET /api/cards` for older lines
(`server/src/cards/routes.ts`). The link cards (L3) are the precedent: a table by `msgid`, a `CardEvent`, a GET for lines past the ring. The same shape here.

## Done when
- A line that passes moderation in a public room is translated, once, into each language in use by recent signed-in readers of its world, stored
  in the server's database by (room, msgid, language), and told on the stream as a `translation` event to the streams that asked that language.
- A page opening a room draws the stored translations of its lines with no ask per line: the stream's replay for the recent, one batch
  `GET /api/translations?room&ids&language` for the rest; a line with none stored is made on that first ask, once for all readers.
- A server restart loses no translation; a line taken (REDACT), edited or hidden loses its translations at once.
- `app/src/translating.ts`' per-reader pace, the door's translate route and the translation use of `door/lines.ts` (`line`) are deleted, no copy kept.
- No line shows a translation of another's text; none for a members room.

## Out of scope
Translating members rooms or DMs (D194's reason holds: their text never leaves for the model). Editing the 16 languages. A language picker change.
Admin screen for the budget (exists). Translating a line's edits (an edit replaces the line: its translations go, the new text is made on arrival).
Pre-translating the whole history of a room (only lines a reader asks, and new lines).

## Threat model
- Assets: the translation budget ($5 a day, $1 in the demo, D47); a members room's text; the line's author's right to delete.
- Abuse 1, a script opens streams or asks for 16 languages to spend the budget. Mitigation: the languages made on arrival come only from streams
  of signed-in accounts (guests' streams never add one), at most 4 a line, a language leaves the set 15 min after its last stream; a global
  breaker of 60 makings a minute; a GET asks 30 ids and 60 asks a minute a visitor (as the cards'), a making needing a session; jarvis's hard stop stays.
  Tests: a guest stream adds no language; the 5th language on a line makes nothing; the 61st making in a minute waits; a guest's GET makes nothing.
- Abuse 2, reading a room one may not: the GET and the stream refuse by `mayRead` (as the cards' GET); a members/hidden room is never made.
  Tests: forbidden room 403, members room made never.
- Abuse 3, a deleted or edited line still shows: `taken`/`edited` drop its rows; a making that finishes after the drop is not stored (as
  `kept.set`'s `from`). Tests: drop then late making leaves no row.
- The text sent to jarvis is the server's own (`lines.ts` or the search index row), never the page's; the answer goes through the existing wire
  schema (`JarvisTranslation`) and jarvis's own check (adds no link, account or number). The Jarvis switch off: nothing made, nothing sent.

## Cost
Per line: up to 4 Haiku calls on arrival (unmeasured: read jarvis's `translate` spend in `budget` after 100 real lines; the per-call price is
not known from this plan). Hot path added: one insert and one stream frame per translation; the GET is a primary-key read of 30 rows.
Budget in `deploy`-less terms: bench the GET (30 ids) under 2 ms, the arrival hook under 0.2 ms when no language is in use.

## Scale
First limit: jarvis's translation budget, then the model's concurrency (4 makings at once, a queue of 200, the oldest dropped). Rows: cap
200,000 and 30 days (retention tick, as `expireCards`); next step is fewer languages on a line when the budget runs low.

## Tests, by level (write these first, see them fail)
- schemas: `TranslationEvent` and `LineTranslations` strict, room and msgid as `StreamEvent`'s, text within `TRANSLATION_CAPS`.
- server unit: store (set, get many, drop by room/msgid, expire, caps); flow (arrival makes the languages in use; skips own-language, blank, a link-only
  line, a members room; a failure or `spent` stores nothing; `original` stored as such so it is not asked again); stream (a `translation` event
  only to clients whose `language` matches, replayed from the ring); routes (order of checks: site, rate, body, `mayRead`, then store; a miss makes).
- server integration: restart (new store on the same file) answers the stored text; REDACT removes it.
- app unit: the feed through its schema (a bad event dropped and said once); a line draws `done`/`same`/none from the store; a missing line is
  asked in one batch of at most 30, never one by one.
- Journey: one Playwright spec only for the critical flow once Alexis validates the look (a reload of a room shows translations with no `/translate` call).

## Files
Create: `packages/schemas/src/translations.ts`; `server/src/translations/{store,flow,routes}.ts` (+ tests); `app/src/lib/api/translations.ts`;
`app/src/lib/stream/translationFeed.ts`. Change: `server/src/migrations.ts` (append `TRANSLATION_TABLES`, never edit one; `migrations.test.ts` hash),
`server/src/chat.ts` (pass hook after `passed`, as `thenCards`), `server/src/stream/{stream,query}.ts` (event, `language` parameter, language set),
`server/src/door/{mount,translate,lines}.ts` (delete the route and `line`), `app/src/translating.ts` (replaced), `app/src/features/chat/LineTranslation.tsx`
and `translationItem.ts` (read the store). Tier 1 (docs/REVIEW.md): none of the table's paths by name; `server/src/door/` is treated as tier 1 by
D13067 and is not in the table (Alexis to add it), so the door deletions get the red pass and the `security-reviewer`; `server/src/limit.ts`,
`guard.ts`, `config.ts` are read, not changed (breaker uses `limiter` as is). Everything else tier 2; no tier 3.

## Branches
One branch `translations`, one agent, two lots in order: T1 server (failing tests, store, flow, routes, stream, deletion of the door route); T2 page
(feed, store reads, deleting `translating.ts`). T2 waits on T1. Nothing runs beside it except the unread branch (disjoint files but `chat.ts`: merge unread first).

## Dependencies
None. No new package tonight.

## Questions for Alexis (defaults taken, he is asleep)
1. Which languages on arrival? Default: the languages of signed-in streams open or seen in the last 15 min on the line's world, at most 4, never the line's own.
2. Guests see stored translations? Default: yes (public lines, public text); they never cause a making.
3. Members rooms? Default: never translated (D194).
4. Old lines (before this ships)? Default: made on a reader's first ask, then kept; no backfill.
5. Retention? Default: 30 days or the line's life, whichever is first.
6. Jarvis off? Default: nothing made and nothing sent; stored rows kept.
7. Keep jarvis's own hash cache (a day)? Default: yes, untouched (tier 1 `jarvis/src/`); it dedups identical texts across rooms.
