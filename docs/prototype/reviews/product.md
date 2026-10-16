# gnoworld prototype: product review

Angle: the whole product against the goal (hype and discoverability, people stay and chat, people end up using realms). I read all of `index.html` and `app.js`, looked at the ready-made screenshots, and took two of my own (`scratchpad/review-product/`).

**What works:** the universe → focus → docked chat path is a clear spine. Connected worlds (calls, imports, shared rooms), the telescope peek and the live-moment ring (pot clock, vote split) are real discovery and hype devices built on chain data. Jarvis's gno facts (`GNO_FACTS`) are accurate and well scoped.

**The main gap:** almost every path ends in "chat more". The third part of the goal (people use realms) gets the fewest exits, and phase 0 does not appear anywhere in the prototype.

---

## Findings (most important first)

### 1. Phase 0 is not in the prototype, and the plan contradicts ADR-0001
- **What and where.** Every screen asks for phase 1 and 2 actions:
  - "Connect Adena" is the main button in the header (`index.html:1102`).
  - The name dialog says "Register · 0 GNOT … one Adena transaction" (`index.html:1292`).
  - Seal (`:1212`), renting a satellite (`:1298`), the Vote buttons (`app.js:3025`) and the Call buttons (`app.js:3038`).
  - DMs with a note about MLS (`index.html:1216`).
  - Nothing mentions IRC or Ergo. Separately, `gw/adr/0001-gnoworld.md` still puts Adena sessions, MLS and Seal in phase 0 (lines 931–947) and rejects an IRC gateway (alternative 11, lines 830–838).
- **Why it matters.** The team cannot scope phase 0 from a prototype that shows phase 2. The ADR and the brief disagree on what ships first, so the build will follow whichever document someone opens.
- **Fix.**
  1. Record the decision first. Write an ADR-0002, "Phase 0 on Ergo", that replaces the ADR-0001 rollout and alternative 11. It should cover:
     - Public rooms only, over TLS websocket.
     - Ergo accounts as names, unverified until a nick is bound to a gno address in phase 1.
     - No DMs until MLS. Plaintext DMs are the reason ADR-0001 rejected IRC.
  2. Then add one flag to `app.js` and gate on it:
     ```js
     const PHASE = Number(new URLSearchParams(location.search).get('phase') ?? 0); // 0 Ergo, 1 Adena, 2 on chain
     const at = (n) => PHASE >= n;
     ```
     - Phase 0 header button: "Pick a name". It opens `openProfile()` with the copy "free, your name in every room" (`connectBtn` handler, `app.js:3374`).
     - Hide `#sealBtn` in `openDM` (`:2335`) unless `at(2)`.
     - Hide the rent buttons in `renderMain` (`:1378`) unless `at(2)`.
     - In `placeCard`, the vote and call buttons open gnoweb (the realm page, or its `$help` page for functions) unless `at(1)`.
     - Hide `#dmList` and the "Message" button on the person card unless `at(2)`.
  3. `?phase=1` and `?phase=2` then demo the roadmap from the same build.
- **Phase 0 on Ergo, mapped to the capabilities in `scratchpad/ergo/caps.go`:**

  | Prototype feature | Phase 0 on Ergo |
  |---|---|
  | Rooms, shared rooms (#arcade) | Channels. One channel listed by two worlds. |
  | History, catch up | `draft/chathistory`, plus a summary from the Jarvis bot. |
  | Unread across devices | `draft/read-marker` |
  | Reply, reactions | `+draft/reply` and `+draft/react` client tags (message-tags, TAGMSG). |
  | Threads | Replies grouped by root msgid, client-side. |
  | Delete / edit | `draft/message-redaction` for delete. Edit has no capability in this list: cut it in phase 0. |
  | Code blocks | `draft/multiline` |
  | Names, avatars | `draft/account-registration` + SASL; `draft/metadata-2`. |
  | Notifications | `draft/webpush` |
  | Comets | `draft/relaymsg`, sent by the bot and rate-limited. |
  | Pins | Channel TOPIC (one pin). |
  | Polls, quiz | Bot + TAGMSG, one vote per account (`account-tag`). |
  | Media upload | Not in IRC. Links only, or a small upload host. |
  | Saved, drafts | Browser only (as now). |
  | Voice, Seal, satellites, DMs | Not in phase 0. |
  | Votes, realm calls | "Open on gnoweb" links. Adena arrives in phase 1. |
- **Effort.** ADR note: S. Phase flag: M.

### 2. The main button sends people back to the chat instead of to the realm
- **What and where.** `renderMain` (`app.js:1374`) only gives a realm or dApp button to the five names in `DAPP` (`:1249`). Every other world, ecosystem and station gets "Say hi in #room" (`:1381`). On desktop the chat is already docked open beside it, so that button duplicates the composer: Art Hall, Launchpad, Harbor and Earth in the screenshots.
  - The quests (`:2846`) end on "vote in a poll" and "talk in #arcade". None of them ends on a realm.
- **Why it matters.** This is the one link from "chat" to "use realms", and on most worlds it is missing.
- **Fix.**
  - Add a branch before the "Say hi" fallback in `renderMain`: if the world has a `/r/` path and is not a topic, the label is "Open the realm" and `href` is `https://${realmOf(b)}`. Use the `out` icon and call `progress({ type: 'realm', b })` on click.
  - Ecosystems get "Enter <busiest member>", the same branch systems already use (`:1377`).
  - Keep "Say hi" only for Earth, or when the chat is closed (mobile).
  - Give each quest a last step that is a realm action: "Read proposal 15 on gnoweb", "Open BUBBLE", "Open a realm's source". Test it with `e.type === 'realm'`.
  - Drop the GNOT price from Earth's facts (`facts4`, `:1642`) and use "new realms this week" instead.
- **Effort.** S.

### 3. Jarvis talks too much in public rooms
- **What and where.** Jarvis posts in public rooms without being asked:
  - It replies to any of your messages that contains "?" (`app.js:2717`, `:1843`).
  - It replies to other people's sample questions (`:2220`). In `shot102-earth`, mia asks "who is up for the GovDAO call tonight?" and Jarvis answers with GovDAO's statistics.
  - It greets you on your first visit to every world (`:1706`) and posts "Quiet right now" (`:2316`).
- **Why it matters.** People stay in a chat when other people answer them. A bot that answers first takes that reward away and fills the room with noise.
- **Fix.**
  - Jarvis speaks in a room only when someone @-mentions it, `/ask` is used, or a quick action asks for it. Delete the three auto-answer calls.
  - Unanswered questions:
    - Keep `routeQuestion` (`:2976`): it brings humans in.
    - If no human has answered after about 2 minutes, Jarvis replies **in a thread** under the question (`li._thread.replies`), not in the room. In phase 0 on IRC this is a `+draft/reply` or a NOTICE to the asker.
  - Make the per-world welcome a single `sys()` line, once per session.
  - Offer catch up automatically: in `swapTo` (`:2240`), when a room has more than about 20 unread messages, insert the `li.unread` divider with a "Catch me up" button that calls `catchUp()`. Today catch up is a chip you have to know about.
- **Effort.** S.

### 4. Follow does nothing, there are no unread counts, and the full-chat world list will not scale
- **What and where.**
  - `state.followed` is written (`app.js:1182`) and never read, so Follow has no effect.
  - Room chips show member counts, not unread counts (`:2370`).
  - In full chat, the world column (`renderPlaceRail`, `:2346`) shows every world as a bare thumbnail, sorted by population, with no names or badges. With 40 realms it stops working.
  - The full chat is Discord's layout: server icons, then channels, then members (`shot103-full`). That goes against the rule "never copy reference UIs".
- **Why it matters.** "Where is it happening, and what did I miss" is what brings people back to a chat. Nothing in the chat navigation answers it.
- **Fix.**
  - Rename Follow to "Join / Joined" (an IRC JOIN in phase 0).
  - The full-chat world column shows Earth, then the worlds you joined, then a Find button that opens ⌘K.
    - Use the labelled thumbnail buttons from `renderHRail` (`:3832`) instead of bare icons.
    - Show an unread dot and a mention count on each world.
  - Track unread messages with a `Map` keyed by `roomKey`: incremented in `deliver()` and by the sample timer for joined worlds, cleared in `swapTo`. Show the unread count in the chip's `.cnt` when it is above 0. In phase 0 this comes from `draft/read-marker`.
  - Replace the right-hand member list (`renderSide`, `:2399`) with the realm block and the main button from finding 2, so full chat also leads to the realm.
- **Effort.** M.

### 5. Nothing is measured
- **What and where.** There is no tracking. `progress(e)` (`app.js:2851`) already receives post, visit, vote and code events, so it can carry the tracking.
- **Why it matters.** Without numbers the team cannot tell whether hype turns into chatting, or chatting into realm use. It also cannot tell which of the eight navigation surfaces actually move people.
- **Fix.**
  - One function, called inside `progress()`, in `go()`, on the realm button, in `openShare`, `ask` and `sendComet`:
    ```js
    const track = (type, p = {}) => navigator.sendBeacon?.('/t', JSON.stringify({ type, ...p, t: Date.now() })); // ponytail: no text, no nick; batch when volume grows
    ```
    - For `go()`, send `via: document.activeElement?.closest('[id]')?.id`. That says which surface was used: labels, hRailList, fConn, chatList, tickerTrack, placeList.
  - North star: **weekly people who post at least one message and open at least one realm.**
  - Funnel: land (direct, deep link or share) → first flight → first message → named account within 7 days → second visit within 7 days → realm opened.
  - Health:
    - Human reply rate for questions within 5 minutes, and median time to the first human reply. Jarvis must not lower these.
    - Share of messages posted outside Earth: is the chat spreading to the worlds?
    - Worlds visited per session, and the mix of `via` values. Cut surfaces nobody uses.
    - Jarvis answers that end in a flight or a code copy.
    - Evolutions: how many are submitted and shipped, and how long shipping takes.
  - Guardrails: reports per 1,000 messages, comets per person per day, Jarvis cost per daily user.
- **Effort.** S.

### 6. Hype points to the AMA, but arriving at Dev help shows nothing about it
- **What and where.** The AMA is announced five times: the label chip (`app.js:985`), the meteors (`:2771`), the ticker (`:3442`), the bell (`:3279`) and Jarvis. When you arrive in Dev help:
  - The plate has no event.
  - The ring is off for ecosystems (`pickRing`, `:1628`).
  - The main button says "Say hi in #dev-help".
  - The event card only appears behind the "Events" chip (`:3061`).
- **Why it matters.** Each announcement makes a promise. If the destination does not keep it, people learn to ignore the next one.
- **Fix.**
  - In `pinsFor` (`:1406`), when `b.name === EVENT.place`, put "AMA · interrealm with the core team · starts in N min · Voice lounge" first.
  - In `renderMain`, the same place gets "Remind me · AMA in N min", which runs the existing "Remind me" action.
  - In `openShare` (`:3466`), use `ringText` when it is set ("Pot 72.9 GNOT · 02:22") so share cards carry the live moment instead of "214 here now".
- **Effort.** S.

### 7. Shared message links do not open the message
- **What and where.** "Copy message link" builds `#bubble/bubble/12` (`app.js:2096`). Deep links are read with `bodies.find((b) => slug(b) === want)` (`:3871`), which never matches that string, so the link opens the home screen.
- **Why it matters.** In a chat, a link to a message is what people share. Today that link goes nowhere.
- **Fix.**
  - Read the link as `const [ps, rs, mid] = want.split('/')`, find the world by `ps`, then call `go()`.
  - After arrival, run `joinRoom('#' + rs, true)` and scroll to and highlight `[data-id="${mid}"]`.
  - In phase 0 the id is the IRC `msgid`, fetched with CHATHISTORY AROUND.
- **Effort.** S.

### 8. Stations look and behave like realms
- **What and where.** AI Ring, Broadcast Moon and Harbor are meant to be team-curated topics, not realms. Yet:
  - They get the generic rooms `#builders` and "Voice lounge" (`roomNames`, `app.js:1204`) and the generic chat lines ("gm from Lagos").
  - Their plate shows the realm statistics (regulars %, msgs/h, 24 h chart) and "Say hi" (`shot105-harbor`).
  - They take heat slots from real worlds: `updateHot` (`:956`) puts the "▲ 27%" chip on Broadcast Moon in `shot106-uni`.
  - They sit in the Worlds tab of the rail (`:3836`) and in today's expedition (`:2845`).
  - The curated content (the realmscope build, the screens, the long reads) is below the fold.
- **Why it matters.** It blurs what a realm is, and a team-curated item takes discovery space from the community's realms.
- **Fix.**
  - Exclude `kind === 'station'` from the `updateHot` pool, from the Worlds tab (move stations to the Groups tab) and from `expedition`.
  - Add `rooms` to each `STATIONS` entry: `#show-and-tell` for AI Ring, `#watch-party` for Broadcast Moon, `#reading-club` for Harbor. Make `roomNames` use `b.rooms` when set, and add topical `PLACE_LINES` for stations.
  - Give stations their content as the main button: "Open this week's build", "Watch the screens", "Today's long read". Each runs `placeCard('station')`.
  - Station facts: here now, plus "Curated by the gno.land team · not a realm".
  - Each station item links to the world it is about. For example, the BUBBLE replay links to BUBBLE (add a 4th field to `CHANNELS`).
- **Effort.** S.

### 9. Three progress counts disagree, and two "Go explore" buttons do different things
- **What and where.**
  - Progress is counted three ways:
    - The search drawer says "Worlds you visited 0 / 19". It counts the session's `state.explored` against `HUBS`, including the five ecosystems (`app.js:1908–1916`).
    - The logbook says "0 of 18 worlds stamped" (stored, a different set).
    - The hero says "across 18 worlds".
  - "Go explore" in the hero starts today's expedition (`:3822`). The same label in the drawer flies to the nearest signal (`:1894`).
  - The logbook, which is the retention loop, can only be reached from that drawer, the flash messages and `/logbook`.
- **Why it matters.** When counts disagree, the numbers look fake, and a retention loop people cannot find does not retain anyone.
- **Fix.**
  - `updateExplored` reads `log.stamps` and counts `bodies.filter(stampable).length`.
  - Delete `state.explored`.
  - Both buttons run the hero's expedition handler.
  - Add one line under the hero buttons: "Today's expedition · 1 of 3 · Logbook". The `#hero .explored` style already exists, with no element using it.
- **Effort.** S.

### 10. Cut what no phase can deliver, and what pushes content into the chat
- **What and where.**
  - Voice rooms in every world with two or more rooms, and on Earth (`app.js:2223`, `:2227`), with fake people talking (`:2421`). No phase has a voice transport.
  - The satellite rental's "Also relay it to" (`index.html:1298`, `app.js:1363`) posts paid text into a world's chat.
  - "Regulars this week %" on every plate (`:1647`): an analytics number for the team, not for visitors.
  - Generic `#trading` rooms in Dev help and Memba (`ROOMS`, `:1202`).
- **Why it matters.**
  - Fake voice rooms promise something no phase delivers.
  - Paid messages in chat feel like spam and drive people out.
  - Statistics with no use make the plate read like a dashboard, which the lead does not want.
- **Fix.**
  - Drop the voice entries in `roomsFor`/`EARTH_ROOMS` and the voice bar.
  - Drop `#rentRelay` and its `deliver` call.
  - Replace the regulars fact with the live moment (`MOMENTS` text) or "N people you know here".
  - Give rooms defaults per kind: DAO → `#proposals`, game → `#strategy`, ecosystem → its own list.
- **Effort.** S.

### 11. The old dashboard still runs on every flight
- **What and where.** `go()`, `arrive()` and the frame loop call `showCard()` (`app.js:1095`, `:1113`, `:3667`), which renders an invisible left-dock card: Overview/People/Rooms tabs, pulse orb, gauge, relief, range slider (`index.html:1128–1187`, `app.js:1456–1556`). `#topbar`/`#bottombar` (`index.html:1086`, `:1241`, both `display: none !important`), `#guide` and `#bigTitle` are also still in the code.
- **Why it matters.**
  - Two information architectures live side by side, and the dead one is exactly the dashboard the lead rejected.
  - It caused the "/ 19" count in finding 9.
  - Every flight pays for its animations.
- **Fix.** Delete it in one pass, but keep the pieces still in use:
  - `#search` and `#placeList` (the ⌘K drawer).
  - `#bellBtn` and `#connectBtn` (moved into `#hnav`).
  - The `followBtn` logic (fold it into `fFollow`).
- **Effort.** M (careful, but mechanical).

### 12. Site evolutions have no feedback loop
- **What and where.**
  - Anyone, including guests, can submit an evolution (`app.js:3089`), with no limit.
  - People cannot +1 an idea.
  - Nothing shows who reviewed a change.
  - Nothing happens when a change ships (`EVOS`, `:3070`).
  - The window is only reachable from the Jarvis intro and `/evolve`.
- **Why it matters.** A suggestion box with no answer makes people stop suggesting. "Your idea shipped" is a strong reason to come back and to share.
- **Fix.**
  - Only named accounts can submit, at most one idea per day.
  - Add a "+1 · N" button to each idea, sorted by votes.
  - From the Reviewed step on, show "Reviewed by @name" and a link to the preview or diff.
  - When an idea reaches Live:
    - post "Shipped: <idea>, asked by @noor" in Earth `#general`;
    - add a notification for the person who asked;
    - offer a share card.
- **Effort.** S.

---

## New ideas that serve the goal

1. **Your realm becomes a planet.**
   - Jarvis's "write a realm with me" ends on "Deploy it on onyx".
   - The indexer sees the `addpkg` and runs `birth()` with the user's realm: it appears in the Onyx system with "first to chart" for its author.
   - On mainnet it moves into the main system.
   - This is the strongest loop from chat to realm, and every part of it already exists: `birth`, the Onyx system, `GNO_START`.
2. **The expedition follows live moments.** Today's three stops are picked from `MOMENTS`, `EVENT` and new births (a vote closing, a pot, an AMA), not from a random seed (`app.js:2845`). The daily habit then lands where things are happening.
3. **The Monday frontier report.**
   - Jarvis pins a weekly digest in Earth, already an evolution in `EVOS` (`:3073`).
   - It covers new realms, the three busiest threads, shipped evolutions and next week's events, with a share card.
4. **Events belong to world owners.** Turn `EVENT` into a list fed by a bot command, `/event <time> <title>`, from each world's moderators. Meteors and the ring then announce the ecosystem's own moments, not only the team's.
5. **First words.** For 24 h, a newborn world's label shows who spoke first there, the same way "first to chart" credits whoever found an uncharted world. It gives people a reason to visit new realms right away.

## Priority order
1. Phase decision: ADR-0002 and the `PHASE` flag (1).
2. Tracking, before any user test (5).
3. Lead to realms: the main button and quest steps (2).
4. Jarvis quiet by default (3).
5. Make hype land: AMA pin and live share card (6), message links (7).
6. Join, unread counts and a world column that scales (4).
7. Stations (8), counts (9), cuts (10).
8. Dead dashboard (11), evolutions loop (12).
