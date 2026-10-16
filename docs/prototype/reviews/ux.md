# gnoworld review: experience and hierarchy

Angle: what you see at once, hierarchy, entry points, links, progressive disclosure, accessibility basics.
I walked arrival, universe, search, List, BUBBLE, gnogolf, GovDAO (1280), Dev help, Earth, the stations, threads, saved, the `/` menu, the bell, the logbook, full chat and mobile at a true 390 px.
My screenshots and probes are in `scratchpad/review-ux/`.

**Note on mobile screenshots.** `--window-size=390` in headless Chrome lays the page out at 500 px and crops it. That is why the older mobile shots show the bell clipped and "Connect" missing. A real 390 px check needs `Emulation.setDeviceMetricsOverride`; see `review-ux/probe.mjs`.

**What works.** Arriving on a world is striking: a huge name, a big planet, and a chat that is already live. The chat feels lived in, with Jarvis cards that carry real actions, translations, pins, and empty states that teach you something (Saved, a new thread). Escape steps back one layer at a time, the flash message is announced to screen readers, and almost every icon button has a label.

---

## 1. Leaving a world closes your conversation and drops you back into #general

- **What and where:** `exitFocus()` sets `document.body.dataset.chat = ''` (app.js:1812). `home()` then calls `setRoom(null)`, which falls back to Earth (app.js:1138, `placeOf`). Clicking Universe, pressing Escape, or flying from one world to the next (`go()` calls `exitFocus()` first) slides the chat out. When you reopen it with the Chat pill, you are in #general, not in the room you were talking in.
- **Why:** the goal is to make people stay and chat, so the conversation is what should persist. The 3D is the backdrop.
- **Fix:**
  - Delete the `document.body.dataset.chat = '';` line in `exitFocus`.
  - In `home()`, change `setRoom(null)` to `if (!roomState.place) setRoom(null);`.
  - The chat header already says "BUBBLE · dApp", so the context stays clear over the universe.
  - Arriving on another world can keep switching the room as it does now.
- **Effort:** S

## 2. "Go explore", the first click, sends you to a random world instead of where things are happening

- **What and where:** the hero "Go explore" (app.js:3838) flies to the first unstamped stop of today's random expedition (app.js:2853). Today that is Adena, with 22 people, while BUBBLE has 214 and an AMA starts in 14 minutes. The live moments only appear as 10 px chips on labels and in the ticker. The button also starts a quest without saying so.
- **Why:** hype and discovery depend on the first click landing where people are.
- **Fix:**
  - If the AMA starts within 30 minutes, label the button "Join the AMA · 14 min" and run `go(devHelp)` plus `joinRoom()` on the event room.
  - Otherwise, go to the hottest world: `bodies.filter(focusable).sort((a, b) => heatOf(b).msgs - heatOf(a).msgs)[0]`.
  - Announce the expedition after arrival in the existing flash ("Today's expedition · BUBBLE is stop 1 of 3").
- **Effort:** S

## 3. The world plate reads like a dashboard, and its numbers disagree with each other

- **What and where:** the plate on the left of the focus view (shot108-bub, review-ux/thread.png) stacks:
  - 4 facts and a 24 h chart
  - 3 CTAs
  - 4 connected worlds
  - a preview, an X post and a realm card
  - 3 links

  It scrolls to between 1,100 and 1,970 px, and the scrollbar is hidden (index.html:657), so nothing tells you there is more below.

  The numbers contradict each other:
  - **Message rate for BUBBLE:** the universe label says "148/h" (`heatOf`, app.js:992). The plate fact says "126/h" (random, `facts4`, app.js:1649). The chart says "87 msgs/h now" (app.js:1696).
  - **Room count for BUBBLE:** "5 rooms" on the plate (`roomsFor`) and "3 rooms" in List (`facts().c` uses `b.rooms`, around app.js:1460).
- **Why:** it breaks the "lightness, no dashboard panels" rule. Contradictory numbers make the activity look fake.
- **Fix:**
  - Replace the 2×2 `#fFacts` with one line over the chart: `214 here · 87 msgs/h now · ▲17%`, taken from a single source (`heatOf(b)`).
  - Count rooms with `roomsFor(b).length` everywhere.
  - Under the CTA row, show only one context block: connected worlds for a realm, the station panel for a station, the member list for an ecosystem.
  - Put the realm card, the X post and the links inside a `<details>` titled "More about BUBBLE".
- **Effort:** M

## 4. Several buttons do the same thing (the general chat, Jarvis)

- **What and where:**
  - **#general on the universe screen has five ways in:**
    - the Earth tab in the nav (index.html:1064)
    - "Join the chat" (app.js:3829; it calls `setLens('earth')` and opens the chat, which is identical to the Earth tab on desktop because `enterFocus` opens the chat anyway)
    - the Chat pill, which opens #general docked without flying, so it behaves differently from "Join the chat"
    - the Earth label
    - Earth in the rail
  - **Jarvis:** the Jarvis pill (app.js:3827) and the "@jarvis" chip added to every quick-action row (app.js:3081) both prefill "@jarvis " in the composer.
- **Why:** "dedupe what should be deduped". The nav should name views, not one world. Two chat buttons that behave differently are confusing.
- **Fix:**
  - Remove Earth from `#hnav .links`; keep the Alt+E shortcut.
  - Make "Join the chat" run `setRoom(earth); chatMode('open')` without flying. The universe stays visible behind the chat, which is the hype shot.
  - Hide the @jarvis chip on desktop, where the pill exists: `@media (min-width: 901px) { #quick [data-cmd="@jarvis "] { display: none } }`.
  - Change the composer placeholder to `Message #bubble, or ask @jarvis`.
- **Effort:** S

## 5. Rooms have three switchers, and the one on the planet looks clickable but is not

- **What and where:** in the docked chat (shot108-bub):
  - The row of room chips shows two and a half chips, then clips (index.html:810). It will not scale to 40 rooms.
  - The title "#bubble ⌄" opens the searchable room switcher, which does the same job.
  - The room hotspots on the planet ("#bubble · 97", "#builders · 65") look like the white primary pill and pulse, but they have `pointer-events: none` and are hidden from screen readers (index.html:929-934, `renderStations` app.js:1797).
- **Why:** lists must scale, and an affordance that does nothing is a broken promise. Picking a room on the planet is also the most "space" way to do it.
- **Fix:**
  - Make the hotspots real buttons: `.station span { pointer-events: auto; cursor: pointer }`, and in `renderStations` add `el.lastElementChild.onclick = () => { openChat(); joinRoom(name); }`.
  - In the docked chat, hide the chips with `body:not([data-chat="full"]) #roomChips { display: none }` and show the count in the title ("#bubble ⌄ · 5 rooms").
  - Move the Media and Saved icons up to the title line, as the layout already does when the switcher is open (shot99-earth).
  - Full screen keeps its room column.
- **Effort:** S

## 6. Mobile (390 px): two chat buttons overlap, and the main action is below the fold

- **What and where:**
  - **Universe:** the floating "Chat" button (index.html:739, `bottom: 76px`) sits on top of "Join the chat" (review-ux/p-mob.png): two chat buttons 30 px apart.
  - **On a world** (review-ux/m-bubble.png): the plate starts at 46% of the height and opens with the 2×2 facts. The CTA and connected worlds are below the fold, and the floating Chat button covers "66%".
  - **Jarvis:** there is no Jarvis pill on mobile (`#hGuide` is hidden, index.html:950).
- **Why:** a public hub is mostly visited on phones. The first thing you see there should be "talk" or "use", not statistics.
- **Fix:**
  - Hide the floating button outside a world: `body:not([data-view="focus"]) #mChat { display: none }`.
  - Reorder the plate under `@media (max-width: 900px)`: `#fLeft > * { order: 3 } #fLeft > .kicker, #fName, #fText { order: 0 } #fActs { order: 1 } #fActivity { order: 2 } #fFacts { display: none }`.
  - Keep the @jarvis chip on mobile (see finding 4).
- **Effort:** S

## 7. Some links do not land where they say, and some actions lead nowhere

- **What and where:**
  - **Bell:** "kaito mentioned you in #builders" flies to BUBBLE and opens #bubble, because the click handler (app.js:3317) only calls `go(to)`.
  - **Plate, "8 people from Bug hunters are here →":** the text is about BUBBLE's visitors, but the arrow flies you away to Bug hunters (app.js:2813).
  - **List view:** the detail panel lists rooms as plain text, and its only action is "Show in space" (app.js:1968). The path without 3D cannot join a room.
  - **Follow:** the button switches to "Following", but nothing ever reads `state.followed` (app.js:1182). There is no feed, nothing in the bell, and nothing is saved.
- **Why:** links must do what they say. Follow is a natural hook for "come back" and currently does nothing.
- **Fix:**
  - Give each notification in `NOTES` a `room`, then set the room before flying (`roomState.place = to; roomState.name = n.room; go(to)`).
  - Label the visitors row "Bug hunters · 8 of them here now".
  - In the List detail, turn the rooms into buttons (`go(b)`, then `joinRoom(name)`). Make the primary action "Join #bubble" and "Show in space" the secondary one.
  - Make Follow add the world's events to `NOTES`, flash "BUBBLE's events will show in your bell", and save the choice with `keep.set`. Otherwise, hide Follow until it means something.
- **Effort:** S

## 8. The composer takes four rows of controls; show quick actions or formatting, not both

- **What and where:** at the bottom of the docked chat, the quick actions (index.html:319), the formatting row, the input and the tools row take about 180 of 780 px (23%), and 195 of 844 px on mobile. The formatting letters are 11.5 px at a 2.84:1 contrast (index.html:211).
- **Why:** messages are the content. Each tool should appear when it is needed.
- **Fix:** one slot, two states.
  - Empty composer: show the quick actions.
  - Typing: show the formatting row.
  - Use `.cbox:focus-within` so that clicking a format button does not close the row:

    ```css
    body:not([data-chat="full"]) #chat:has(.cbox:focus-within) #quick { display: none }
    body:not([data-chat="full"]) #chat:not(:has(.cbox:focus-within)) #fmtBar { display: none }
    ```
  - Keep both rows in full screen.
  - Set `#fmtBar button { color: var(--muted) }`, which gives about 6:1.
  - If "the formatting row is always visible" is a hard rule, apply only the first CSS line.
- **Effort:** S

## 9. The logbook and "site evolutions" have no permanent place in the interface

- **What and where:** the logbook opens only from:
  - the "Logbook" button in the stamp flash, which disappears after 5.2 s (app.js:2876)
  - the top block of the ⌘K drawer (index.html:1110; review-ux/search.png), which pushes the search field down and repeats "Go explore"
  - the `/logbook` command

  The visit counts disagree: "0 / 19" in the drawer (`HUBS.length`, app.js:1916), "0 of 18" in the logbook (app.js:2887), and "18 worlds" in the hero. "Site evolutions" is reachable only from Jarvis's first intro message, which appears once, or from `/evolve`.
- **Why:** the logbook is the "come back tomorrow" loop, and a hidden loop goes unused. An action that disappears on a timer also fails keyboard users (WCAG 2.2.1, timing).
- **Fix:**
  - Add a small pill with a line icon to `#hnavActs`, left of the bell, showing "2/18" and calling `openLog`.
  - Hide the progress block in the drawer (`#leftdock #explored { display: none }`) so the search field comes first.
  - Use one count everywhere: `bodies.filter(stampable).length`.
  - Show Jarvis's starter chips, including "Site evolutions", every time the Jarvis pill opens an empty composer, not only the first time.
- **Effort:** S

## 10. Button hierarchy: five white pills compete on one screen, and CTA rows wrap

- **What and where:**
  - **Five white filled pills on the focus view:**
    - the Chat pill in its active state, which uses the primary fill (index.html:504)
    - Connect Adena, the loudest control on the page even though wallet features come in phase 1
    - the main CTA
    - the active room chip
    - Send
  - **Wrapping and truncation:** the plate's CTA row wraps, pushing Share onto its own line, on Broadcast Moon at 1440 and GovDAO at 1280 (shot105-moon, review-ux/gov1280.png). The chat title truncates to "#broadcast-mo…".
- **Why:** hierarchy, and the rule of consistent heights and alignment.
- **Fix:**
  - Active Chat pill: `#hChat[aria-expanded="true"] { background: rgba(255,255,255,.12); color: var(--text); border-color: var(--edge-strong) }`.
  - Give Connect Adena the `.ghost` style until a write action needs it.
  - Turn Follow and Share into 44 px round line-icon buttons with `aria-label`, and set `#fActs { flex-wrap: nowrap }`.
  - Shorten the CTA to "Say hi"; the room is already named in the chat header.
- **Effort:** S

## 11. Keyboard and contrast basics

- **What and where:**
  - **Tab order in the docked chat:** each message has 8 tab stops (3 reactions, more reactions, reply, thread, pin, more; app.js:2075). From the room chips to the composer takes about 55 Tab presses (measured on BUBBLE).
  - **Videos in the chat** can take keyboard focus but have no name (app.js:2210).
  - **Person names** are `<b>` elements with a click handler (app.js:2631), so the person card works with a mouse only.
  - **Rail:** it has three items that are all called "Uncharted signal".
  - **Selected label:** the selected state turns "AMA in 14 min" teal on cream, about 1.3:1. index.html:357-359 has no `.heat` override (review-ux/crop-ama2.png).
  - **Zone caption:** "Earth and GovDAO, close to gno.land" sits on the sun glare and is unreadable.
- **Why:** these are accessibility basics, and the AMA chip is the hype signal itself.
- **Fix:**
  - **Message actions:** set `tabindex="-1"` on `.mact button`, give each message `tabindex="0"`, show the toolbar with `li:focus-within .mact { display: flex }`, and move inside it with the arrow keys.
  - **Names:** render them as `<button class="who">`.
  - **Videos:** add `aria-label` from `dataset.cap`.
  - **Selected label chips:** `.label.on .heat { background: rgba(0,0,0,.08); color: #7A4E10 } .label.on .heat.ev { color: #0B6B53 }`.
  - **Signals:** number them ("Signal 1, 2, 3").
  - **Zone captions:** `text-shadow: 0 1px 8px #000`.
- **Effort:** M

## 12. The universe lists places four ways on the first screen

- **What and where:** places are listed four ways: more than 12 labels with heat chips, the right rail (16 items in 2 tabs, sorted by how many people are there), the ⌘K drawer (the same list), and List. The hero, the ticker and 4 header actions sit on the same screen. That makes about 50 tab stops before the first planet label. The rail repeats the labels a few pixels away and hides the right edge of the scene (shot106-uni).
- **Why:** "not too many elements at once". Labels are the natural way to pick a place in space, and ⌘K is the list that scales to 40 or more.
- **Fix:**
  - Hide `#hRail` on the universe (`body:not([data-view="focus"]) #hRail { display: none }`) or show it only after the first flight. It still earns its place in the focus view, where it shows neighbours.
  - Give the ⌘K list the `thumbFor` thumbnails.
- **Effort:** S

---

## New ideas

1. **Following makes your worlds glow.** A followed world gets a thin ring on its universe label and an unread dot in the full-chat world rail, and its events go to the bell. This gives Follow a meaning and a reason to come back.
2. **Preview a room from its hotspot.** Hovering a planet hotspot shows that room's last two lines, reusing the existing telescope peek (`#peek`), so you choose a room by its conversation rather than its name.
3. **Room deep links.** Share copies `…#bubble/builders` and the link opens straight into that room. A shared link then lands people in a conversation, which is what spreads.
4. **A first-message nudge in the placeholder.** After about 20 s without posting, the composer placeholder becomes a starter specific to the room ("Ask: best boop streak today?"). No new element is needed.
5. **One live moment, one action.** When the AMA starts, dim the other labels for 10 s and let the meteor trail end on Dev help with a single "Live now · Join" chip.
