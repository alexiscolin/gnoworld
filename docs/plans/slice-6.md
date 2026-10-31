# Slice 6: bubbles on the Earth, the rule (pure logic, no 3D)

Draft of 2026-10-31, for Alexis's approval (nothing is built). Sources: backlog row 6, ADR-0001 §7 ("Who speaks from where"), ADR-0002 §3 (the far side, reduced motion), `docs/design/video-screens.md` (frames 43 to 55), `docs/ARCHITECTURE.md` ("The scene"). It runs beside slice 7 and meets it at one seam: slice 7's branch 7f draws what this slice picks.

## 1. Done when
Row 6, word for word: Every rule of ADR-0001 §7 has a test: caps, one per country, per-speaker delay, order, cut, muted, far side. The row's other half, "the globe turns to your own message", is split: the choice of the facing is here (`turnTo`), the turning is 7f's.
Added:
- Same input, same output: no clock read, no `Math.random`, the input never changed; `now` is a parameter.
- A message of a direct message, a private room or a room the viewer has not joined is never picked; a message the moderation bot hid is never picked.
- A text is shown as plain text, cut at 80 characters by grapheme, links left as text, no bidi or control character in what comes out.
- A message with no declared country is never picked and never counted; the function never guesses a country.
- Countries on the far side show only as counts ("Japan · 12"), one count a country; a country with a bubble on screen adds its other messages to its count.
- The rules come from `app/data/bubbles.json`, checked by Zod at build (a malformed file fails the build); no number of ADR-0001 §7 is written in code.
Rules, as ADR-0001 §7 starts them: 6 bubbles on screen, 5 s each, one a country at a time, one a speaker every 30 s, order: a mention of you, then your hub, then the rest, newest first; 80 characters.

## 2. Out of scope
The scene, the HTML bubbles, the globe, the far-side counts' drawing and reduced motion's "no pop" (7f); the country tag on the wire and the opt-in (7j); a world-wide feed sampled by the server (ADR-0001 §7, when traffic needs it); bubbles on worlds other than the Earth (backlog, "Not built").

## 3. Threat model (ADR-0002 §9)
| Asset / entry | Abuse | Mitigation | Proving test |
|---|---|---|---|
| A message's text (anyone's) | HTML or script, a link to click, a bidi override or zero-width text that flips what is read, a megabyte of text | Output is a plain string, never markup; the input is cut before it is segmented; Cc and Cf characters removed; React draws it as text | Property (fast-check): at most 80 graphemes, no Cc/Cf; a 1 MB text costs what 1 KB does; a combining-mark stack stays whole or is cut whole |
| A speaker's country and name | A bubble tells where a person is: a lone speaker in a small country is findable | Opt-in only (7j); never finer than a country; none from the browser, the time zone or an address; a DM or private room never reaches the function | A private, DM or not-joined message is never picked (type and runtime check); no tag, no bubble, no count |
| Muted, banned, hidden | A muted person or a hidden line shown on the globe | The function drops a muted account, a banned account and a hidden line before any rule | One test each; the hidden line also leaves the counts |
| Flooding the globe | 10,000 people at once, a speaker with many names, a name change to dodge the 30 s | The caps; the delay is keyed by account, never by display name; only the newest 500 messages are read | Property: never more than `maxOnScreen`, never two a country, never two a speaker inside the delay, for any input; the 501st oldest changes nothing |
| `bubbles.json` | A rule of 0, a negative, or a huge cap that drowns the globe | Zod bounds (proposed: 1 to 12 on screen, 1 to 15 s, 1 to 120 s delay, 20 to 160 characters); build fails | Build tests at each bound and one past |

## 4. Cost
`pickBubbles` runs when a message arrives and once a second, never per frame. One pass over at most 500 messages, a sort of that many: O(m log m), m capped at 500, so flat for any room size. Far-side classification O(k), k at most 250 countries. Bench at m = 125, 500, 2000 (the cap makes 2000 cost what 500 does): budget under 1 ms at 500 on the gate's machine (proposed, set from the first measure, both numbers shown).

## 5. Scale
First limit: the stream's window. The client reads only the rooms it joined, so a room of thousands gives it at most what the cap holds; the next step is the server's sampled world-wide feed (ADR-0001 §7), which feeds the same function. The country table is fixed (about 250 rows).

## 6. Tests, by level (ADR-0002 §9)
Apply: unit and property (every rule; the cut; determinism), data-file build tests, security (the properties above), performance (the bench), mutation (every guard; one no test can catch goes into `GAPS` with its reason). Do not: component, end-to-end, visual, contract, load, AI (no screen, no boundary, no model).
First failing tests, per rule: caps; one a country and the overflow count; per-speaker delay at 29.9 s and 30 s; order; the 80-character cut (a surrogate pair, an emoji family, a link); muted; hidden; far side (a country just past the horizon, the facing's own country, the antipode); the own message; the data-file bounds.

## 7. Files and branches
New: `packages/core/src/bubbles/` (`pickBubbles.ts`, `rules.ts`, `cut.ts`, `farSide.ts`, `turn.ts`, each under 200 lines), `app/data/bubbles.json`, `BubbleRules` in `packages/schemas/src/data.ts` (a new schema, none in use changes), the file listed in `app/src/dataFiles.ts`, the country table (`packages/core/src/bubbles/countries.ts`: code, name, a centre in degrees). Changed: `scripts/mutate.py` only if a guard cannot be caught. Tier 1: none (a display filter); tier 2, `core`: Alexis reads the tests first, then every line (docs/REVIEW.md).
The design choice: ADR-0001 gives `pickBubbles(messages, now, viewer, rules)`, but "one a country at a time" and "one a speaker every 30 s" need what is already on screen. Replaying the messages cannot give the same answer from a sliding window. So the function is `pickBubbles(messages, now, viewer, rules, shown)` and returns `{ bubbles, counts, shown }` (question 2).
| Branch | Delivers | Tests first | Waits on |
|---|---|---|---|
| 6a | `rules.ts`, `bubbles.json`, its schema, `cut.ts`, `pickBubbles` with the six rules and the muted and hidden filters | Each rule above; the properties; the bounds | nothing |
| 6b | `farSide.ts`, the counts by country, `turn.ts` (the facing that centres the viewer's country), the country table | Far side at the horizon; counts; `turnTo` for the own message | 6a |
Both run in sequence, one session each, about a day in all. Slice 7's 7j and 7f need only 6a's types: they can start from its first merge. `pickBubbles` is the row's Human code: Alexis writes it after the red pass (question 1).

## 8. Dependencies to ask for
None: `fast-check` is already used in `packages/core`; the country table is data written here, `Intl.Segmenter` is the platform's (its support in Node 24 and the browsers to be read in MDN and Node's docs in 6a, not verified here).

## 9. Questions for Alexis
1. Who writes `pickBubbles`: you (the row's Human code, after the red tests) or Claude? Recommended: you, it is small and pure, and it runs beside slice 7 so it blocks nothing; 7f needs only the types.
2. The fifth parameter `shown` (state in, state out) instead of ADR-0001's four? Recommended: yes, it is the only way to hold "one at a time" and the delay with a pure function; a row in `docs/decisions.md` amends §7's line.
3. Where do the countries' centres come from? Recommended: a table in the repository written from a public-domain source read in 6b (for instance Natural Earth, not verified yet), with its source in the file's header; no dependency.
4. Your own message: always shown, exempt from the 30 s delay, still counted in your country's one slot? Recommended: yes, as the video's frame 45 shows it; the cut at 80 stays.
