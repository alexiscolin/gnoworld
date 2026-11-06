# Slice 9: calls and the chain in rooms

Approved by Alexis question by question on 2026-11-05 (section 9); nothing is built. Sources: backlog row 9 and "From the video's audit" ("first words"), ADR-0001 §10 and §11, ADR-0002 §1 ("Your name and face") and §4, `docs/design/coherence.md` (decision 8: transactions are call cards in the thread), `docs/design/video-screens.md`, the frames 9 to 15, 20 to 35, 90 to 97 and 108 to 114, `@adena-wallet/sdk` 0.1.1's types as installed (`bin/index.d.ts:556-681`). Slices 7 and 8 run at the same time on the Mac Studio; section 7 names what 9 shares with them.

## 1. Done when
Row 9's tests, word for word: Nothing shows as done before its chain event; the preview names realm, function, arguments, network and fee before Adena opens; a call on the wrong network is stopped before signing; a second request waits for the first; arguments follow the types a call carries; one first-to-chart per world; Adena's answers that fail their schema become an error state.
Added: the preview and the message Adena receives are built from one value, so they cannot differ; no call is ever sent from sample data; every chain fact shown carries the block height it was read at; every free-text argument shows "This text goes to {realm} on gno.land, publicly and forever" and every call "gnoworld does not check what this realm does" (ADR-0001 §11); a call never attaches coins; a proposed action whose function or types are not in `vm/qfuncs` shows nothing; each screen is compared with its frames by the design-reviewer, its approved pictures made on the Mac Studio (decision `4238523f`).

## 2. Out of scope
Phones that sign (phase 1: Adena has no mobile signing); sessions and the sponsor (phase 1); the profile realm and a chosen palette (phase 1); polls and room games (phase 1); pots ("Boop the pot", frames 108 to 114, is cut by ADR-0002: only its card's look is taken); attaching coins (gnoweb's actions page stays the way); the 3D side of signals (auroras, heat: slice 7 and phase 1); Jarvis's proposals' server half (slice 10 made it; 9 only draws a checked proposal as a card).

## 3. Threat model (ADR-0002 §9)
| Asset / entry | Abuse | Mitigation | Proving test |
|---|---|---|---|
| The person's signature (`window.adena`) | A preview that says one thing and a transaction that does another | One value, `CallRequest`, builds both the preview and `DoContract`'s message; no field outside the preview | The message sent equals the preview's fields, property-tested |
| The network | Signing on mainnet a call meant for Onyx | `GetNetwork` read again right before signing, compared with the universe's chain; else `SwitchNetwork`, or `AddNetwork` then switch; still wrong, stop | A fake Adena on the wrong chain: no `DoContract` |
| Adena's answers | A hostile or broken extension, a page script posing as it | Every answer through Zod by its type; unknown types are errors; one listener a page; one request at a time | Each error code (1000, 1001, 2000, 3001, 3002, 4000, 4001, 4005) and a malformed answer as a state |
| A planted button (a chat line, a page's `<gno-form>`, a proposal) | A message forging "Vote yes" that calls something else | Function and types checked against `vm/qfuncs` before a card shows; every field visible and editable; no hidden field; ADR-0001 §11's warnings | A planted proposal for a missing function shows nothing |
| Arguments (`core/args`) | A value that reads one way and converts another (`1e3`, ` 12`, overflow, a non-UTF-8 string) | Only gno's primitive kinds and bytes (`convert.go`), strict parsing per kind, bounds per width, anything else "open in gnoweb" | Property tests over every kind's edge |
| Chain events (the indexer) | A hostile realm's text in a room; a flood of events | Text only, capped; events coalesced and capped a second; nothing shown before its height | Hostile and flooding recordings in contract tests |
| First to chart, first words (the server) | A bot charting every new world first | Recorded only for a logged-in account, once a world (a unique key), a rate an account; the name drawn as text | A race test: two at once, one wins; the rate test |
| The CSP | A wider `connect-src` for the indexer's WebSocket | None: the server relays (answer 4), `csp.ts` unchanged | The CSP tests unchanged; a journey with zero violations |
| A name on the wrong chain | Spending real GNOT while testing | The name registers on the universe's own chain, named in the card with its fee (answer 2) | The card names the chain; Onyx's universe never asks gnoland-1 |

## 4. Cost
The queue and the card: O(1) a request, no polling while Adena's popup is open; once Adena answers, one `tx` read of the hash for its height and result. Chain events: one HTTP read a universe once a block (answer 9g-4: a poll, no WebSocket), for the whole server (answer 4), fanned out on the existing stream, coalesced to 4 a second a room at most; bench: 1,000 events a minute into 100 rooms keeps the store's update under 2 ms a batch on the 4× slowed CPU. The first screen's JS budget is unchanged: the call card and `lib/adena`'s calls load on the first wallet gesture (ADR-0002 §4).

## 5. Scale
The first limit is the public indexer: one reader a client would be N readers on a host we do not run; one on the server is one, polling once a block. Next: the server's stream fan-out, sized by row 12's capacity test. Adena allows one popup, so a person's calls are serial by nature.

## 6. Tests, by level
Apply: unit and property (`core/args` with fast-check; the queue; the error map), contract (Adena's answers from the SDK's types, then one recording of the real extension on Onyx; `r/sys/namereg/v0` on Onyx and mainnet and the indexers' events recorded through gnomcp from this MacBook once its network is open, answer 5; Adena's real answers recorded by Alexis on Onyx at 9b's end, answer 6), component (the card's four steps and every failure, with axe), feature (realm view's write functions, `<gno-form>` to card, the name dialog, the banners), end-to-end with a fake `window.adena` at 390 and 1280 px, faults (Adena missing, locked, popup already open, refused, tx failed, node down after the hash), security (planted proposal, wrong network, preview equals message), mutation, visual (the card, the dialog, the banners, on the Mac Studio). Not: realms, AI, load beyond the fan-out bench.
Failing first: the row's seven tests above, each where it lives (`lib/adena`, `core/args`, the card, the server's signals).

## 7. Files and branches
New: `app/src/lib/adena/{wallet,queue,call}.ts`, `packages/core/src/args/`, `app/src/features/calls/` (the call card, its store `app/src/store/calls.ts`), `app/src/features/names/` (the name dialog), `server/src/signals/` (first to chart, first words, the chain events' relay), the banners in `app/src/features/world/`. Changed: `app/src/features/realms/{RealmFunctions,RealmForm,RealmView}.tsx` (write functions and forms become cards), `app/src/store/index.ts` (one line), `packages/schemas` (Adena's call answers, the signals, the events), the ticker, `deploy/egress/acl.yaml` for the server's indexer poll (slice 7c already adds the indexer hosts), the name shown (mainnet, else Onyx, else the short address: answer 2).
Tier 1: `app/src/lib/adena/` and `packages/core/src/args/` (Alexis reads every line, answer 3), `deploy/`.
Shared with 7 and 8, kept small and apart: `store/index.ts` (7 adds a camera state, 8 settings: 9 adds one import line); the world page (7e changes it: 9 mounts its banner as one element, its code in its own file); the shell header (8's menu: 9 adds the name dialog's opener only); `app/data/quests.json` and `packages/schemas/src/data.ts` (8's quests: 9 adds an optional `call` to a step, in 9i after 8's merge); `deploy/egress/acl.yaml` (7c).
| Branch | Delivers (frames) | Tests first | Waits on |
|---|---|---|---|
| 9b | `lib/adena`, the rest: detection and version, one listener, the queue, `GetAccount` and `GetNetwork` before each action, switch and add network, `DoContract`, every error code a state. Tier 1 | The queue; each code; wrong network stops; malformed answers | nothing |
| 9c | `core/args`: a call's typed fields to its arguments, per gno's kinds | Every kind's edges, property-tested | nothing |
| 9h | The server's first signals: who charted first, first words; the two arrival banners (90 to 97) | One per world under a race; the rate; the banner from the signal only | nothing |
| 9d | The call card: preview with the fee as an estimate, sign in Adena, landing in a block, the result; the warnings; the network switched or added (31 to 33, 108 to 114 for the look) | Preview equals message; nothing done before the chain event; every failure state | 9b, 9c |
| 9g | Chain events: the server reads each universe's indexer by HTTP once a block (answer 9g-4), relayed on its stream; activity lines in rooms, the ticker's chain events, new realms as signals, the Earth's realms of 24 h | Recorded events; flood and hostile text; height on every line | answer 5's recording |
| 9e | The realm view's write functions, calls with more than two fields, `<gno-form>` as a Form block then a card, votes, quick and pinned actions that call (20 to 35) | A planted proposal shows nothing; a non-primitive type says "open in gnoweb" | 9d |
| 9f | Registering a name on the universe's chain: the dialog, `r/sys/namereg/v0.Register`, the astronaut as the face (9 to 15); the name shown, mainnet else Onyx | The `nym-` format before Adena opens; the name shown only once the chain has it; the chain is the universe's | 9d, answer 5's recording |
| 9i | Quest steps that call | A step done only from its chain event | 9d, slice 8's merge |
Order, two at once: 9b with 9h; 9c with 9g (once recorded); 9d alone; 9e with 9f; 9i last. Cut first if time runs out: 9i, then 9g's Earth count. Estimate (not a promise): 8 branches at 1.6 to 4 h, about 7 to 16 h of wall time two at once, before fixes and reviews.

## 8. Dependencies to ask for
None. The browser talks to `window.adena` directly through `lib/adena` (ADR-0002 §4), as the login does; `@adena-wallet/sdk` stays the server's.

## 9. Alexis's answers (2026-11-05, rows in `docs/decisions.md`)
1. The call card sits in the thread or on the plate, with the video's look; never a dialog.
2. Two universes, one for Onyx (later the other devnets), one for mainnet, the main one: a name registers on the universe's chain; the name shown is mainnet's, else Onyx's, else the short address.
3. Claude writes `core/args`; Alexis reads it.
4. The server reads the indexers and relays; the CSP is unchanged. Amended 2026-11-06 (9g-4): by HTTP once a block through the existing capped read, no WebSocket.
5. The recordings are made from this MacBook once Alexis opens gnomcp's network here (his sandbox setting).
6. Alexis records Adena's real answers once, on Onyx, at 9b's end.
