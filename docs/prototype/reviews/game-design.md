# gnoworld: game design review (play, loops, cadence)

Reviewer angle: live and social games, spatial exploration. Sources: `universe/app.js`, `universe/index.html`, the ready-made shots, plus two runs of my own (`review-game/bubble-play.png`, `review-game/gov-proposal.png`).

**What works:** the expedition is seeded by `dayKey`, so everyone gets the same one each day. Shared rooms, connected-worlds rows, place links and the realm card's callable functions are the right bridges from chat to realms. The signal reveal and the ring countdowns give the map real "something is happening here" moments.

**The loop today:** notice (heat, meteor) → fly → stamp → logbook. Flying and stamping get rewarded. Chatting barely does: 3 quest steps. Using a realm never does. And because every timer counts from page load, the prototype has no real daily or weekly cadence yet.
**The loop it needs:** notice (true numbers, a live moment) → arrive → act in the room (say, vote, boop; visible to everyone) → get pulled to the next world (connected worlds, comet, a routed helper) → come back (tomorrow's expedition, followed worlds in the bell) → each week (quests rotate, course winner, proposal results).

---

## 1. Every countdown restarts on reload, and the AMA never happens
- **Where:** `EVENT.at = Date.now() + 14 min` (app.js:930). `eventIn()` clamps to 1, so the label shows "AMA in 1 min" forever (931, 985). Memba's vote and the gnogolf course count from `t0 = Date.now()` (1619–1624). Meteors fly toward Dev help forever (2769–2772). "Remind me" pushes a "starts in 5 min" note right away (3031). Nothing has a *live* or *ended* state.
- **Why:** appointments are what make a live hub worth staying in or coming back to: an AMA going live, a vote closing, a course ending, a pot popping. A timer that resets on reload is fake urgency, which is a dark pattern, and people notice by the second visit.
- **Fix:** anchor times to absolute UTC and give events phases.
  ```js
  const nextAt = (dow, h) => { const d = new Date(); d.setUTCHours(h, 0, 0, 0); d.setUTCDate(d.getUTCDate() + ((dow - d.getUTCDay() + 7) % 7)); if (+d < Date.now() - 45 * 60000) d.setUTCDate(d.getUTCDate() + 7); return +d; };
  const EVENT = { place: 'Dev help', title: '…', at: /[?&]demo\b/.test(location.search) ? Date.now() + 3 * 60000 : nextAt(4, 16), len: 45 * 60000 };
  const eventPhase = () => { const d = EVENT.at - Date.now(); return d > 0 ? 'soon' : d > -EVENT.len ? 'live' : 'done'; };
  ```
  - **renderLabel:** show the chip only when soon (under 60 min) or live (`LIVE · AMA`).
  - **featureFrame:** `EVENT.next = phase === 'live' ? 3 : 4 + Math.min(14, eventIn() / 2)`, so meteors thicken as the start nears and stop when it is done.
  - **The 60 s interval (3874):** on a phase change, call `flash('The AMA is live in Dev help', …, ['Go there', …])`, add a line to Earth #general and a NOTE. After the AMA, Jarvis posts a recap (`catchUp()`).
  - **"Remind me":** `setTimeout(addNote, EVENT.at - 5 * 60000 - Date.now())`.
  - **MOMENTS:** use `nextAt` for Memba and gnogolf.
  - **Demos:** a `?demo` flag shows the whole lifecycle in 3 minutes, which convinces more than a frozen "14 min".
- **Effort:** M

## 2. The daily expedition dies within a week, and it is only sightseeing
- **Where:** `stamp()` returns early once a world was *ever* stamped (2862). Expedition progress reads all-time `log.stamps` (2864, 2884–2888, 3823). With 18 worlds and 3 stops a day, most expeditions are already complete by about day 4, with nothing to do. The hero "Go explore" then just opens the logbook (3824). Stops are random (2845), and the first one can be Adena, a wallet hub, as a newcomer's first stop. Every stop only asks you to *visit*.
- **Why:** the expedition is the daily return reason and the onboarding path at once. It has to ask people to talk, because staying and chatting is the goal.
- **Fix:**
  - Track the day separately. After loading `log`: `if (log.today?.day !== dayKey) log.today = { day: dayKey, seen: [] }`. In `stamp()`, push to `log.today.seen` *before* the early return. All the expedition checks use `log.today.seen`.
  - Give each stop a verb that `progress()` already sees: `{ b, verb: 'Say something in #bubble', test: (e) => e.type === 'post' && e.place === b.name }`.
  - Pick the 3 stops from live things, still seeded by `dayKey`: one MOMENTS or DAO world, one of the busiest, one not yet stamped.
  - When `log.stamps` is empty, use a fixed day one: Earth (say hi), the busiest world, GovDAO (read the open proposal).
- **Effort:** S for the per-day fix, M for the verbs

## 3. Merge "realm birth" and "signals" into one loop: a new realm appears as a signal
- **Where:**
  - `birth()` (2988) makes Fresh Mint fully visible with a "Fly there" button.
  - The 3 signals are hard-coded (445–447) and never renew, so "first to chart" happens once per player.
  - Signals come back after every reload: `discovered: !hub.signal` (504) is never restored from `log.charted`. Each new arrival overwrites `log.charted` (1114), so you are "first" on every reload.
  - In phase 0, everyone is "first" in their own browser.
- **Why:** every deploy becomes a public race to chart it. That is hype for the author, first visitors for the realm, and a reason to watch the map. The design rewards the exact behavior the goal wants: going to a brand-new realm.
- **Fix:**
  - In `birth()`, add `signal: true` to `hub`. Flash: "A new signal near the belt · be the first to chart it". Ticker and notes must not name it, and must call `go(w)` directly, because `findPlace` skips hidden worlds (2442).
  - Move the reveal lines (1106–1111) into `reveal(b)`. After `log` loads (2842), run `bodies.filter((b) => b.signal && log.charted[b.name]).forEach(reveal)`.
  - On charting, post "@noor charted Fresh Mint" to Earth #general. In phase 0 the IRC bot does this, and the first message on the server wins.
  - Phase 2: a logbook realm whose `Chart(cur realm, path)` keeps the first address.
  - Anti-bot: charting counts only for a name holder who also says something in the new world.
- **Effort:** S–M

## 4. Card actions are private: make realm use visible in the room
- **Where:** Boop, Vote, Call and "I am going" only write a system line that you alone see (3017, 3025, 3031, 3038). Vote yes and Vote no can *both* be pressed, and the bar never moves (3025).
- **Why:** the loop that leads to realm use is chat → act → the room sees it → others try. "kaito booped, clock back to 01:00" is the best ad a realm can get.
- **Fix:**
  - Add `actLine(text)`: a compact line in the current room, reactable like a message. "alexis voted yes on Proposal 15 · sample", "alexis booped", "alexis is going · 15". In phase 1 the same line links the Adena transaction.
  - Make the vote exclusive: `bt.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = true; })`, then nudge the bar by 1%.
  - Call `progress({ type: 'call', realm: b.name })` from Boop, Vote and the realm card's Call buttons (feeds #8).
- **Effort:** S

## 5. BUBBLE has no climax: the pot never pops, and its clocks disagree
- **Where:** the ring loops every 240 s with the pot fixed at 72.9 (1621). The Play card shows a frozen "Clock: 00:42", and a boop sets "01:00", which never ticks (3016–3017).
- **Why:** the winner moment is the most shareable event on the map, and watching it together in chat is a reason to stay.
- **Fix:**
  - The card reads `MOMENTS.BUBBLE()` and ticks every second while `c.isConnected`.
  - When the loop hits 0: `burst()` on BUBBLE, a line in #bubble ("kaito won 72.9 GNOT · a new pot opens"), and a POT ticker item. Flash only people who follow BUBBLE or are in Games.
  - After your boop, have a sample "minji booped after you" arrive 5–10 s later. That is the tension of the real game.
  - Health: this pot is money. Keep it out of onboarding and the expedition. Put the play quest's realm step on gnogolf (skill), not BUBBLE (stakes).
- **Effort:** S–M

## 6. One world, three different "messages an hour": heat must be true
- **Where:** BUBBLE shows **148/h** on its label (heatOf, 952), **126/h** on the plate (facts4 uses a random factor, 1647) and **87 msgs/h now** in the activity chart (1690). The heat trend is a sine of `Date.now()` (952), not activity.
  - GovDAO: the ring says **YES 33%** (1622), the card **58% yes** (3021), the tile "vote ends **in 2 days**" (438), the ticker and notes "closes in **2 h**" (3442, 3281).
  - The ticker's "DeFi +34%" is a topic that heatOf never scores (956).
  - Each sample message flashes a burst on a random hot world (2215).
- **Why:** heat is the discovery compass. If its numbers disagree, people stop trusting it. If it sends people into quiet rooms, they leave.
- **Fix:**
  - One `rateOf(b) → { now, usual }` feeds heatOf (trend = now / usual − 1), the third tile in facts4, the last bar of the chart and `pickRing`.
  - One `PROPOSALS = { GovDAO: { id: 15, yes: 33, need: 66.66, closes: nextAt(…) } }` feeds MOMENTS, the card, the tile, the ticker and the notes.
  - Bursts go to the world where the message actually landed, or are cut.
  - Phase 0: count IRC messages per channel (last 10 min × 6, against the hourly average).
- **Effort:** S

## 7. The logbook contradicts itself and spoils the signals
- **Where:**
  - The left-panel gauge counts `state.explored`, which lasts one session (1054, 1116, 1910). The logbook counts the persisted `log.stamps` (2879). After a reload the gauge says 0 while the logbook says 7.
  - There are two "Go explore" buttons with different rules: `#exploreBtn` goes to the nearest signal (1894), `#hExplore` to today's expedition (3822).
  - The stamps grid shows Night Owls, Deep Field and Validators by real name and thumbnail, titled "Not yet: fly to Night Owls" (2898–2900; visible in shot106-log.png).
  - Arriving at a signal fires a toast (1112), a stamp flash (2865) and Jarvis's welcome (1706) within 1.2 s.
- **Why:** these are two ways of keeping score that contradict each other. The signal mystery is spoiled by the very screen that rewards discovery, and the one reward that matters gets buried.
- **Fix:**
  - `updateExplored` counts `bodies.filter(stampable)` against `log.stamps`.
  - Both buttons call one `nextStop()`: the unfinished expedition stop, then the nearest signal, then the nearest unstamped world.
  - The gauge opens the logbook. Drop the separate "Open the logbook" text button (index.html:1119).
  - In `openLog`, use `nameOf(w)` and `hidden(w) ? span.thumbp.unknown : thumbFor(w)`.
  - In `stamp()`, skip the flash when this arrival charted a signal: the toast is the reward.
- **Effort:** S

## 8. Quests are one-shot, hidden, and never reach a realm
- **Where:**
  - 3 fixed quests (2846–2849). You only see the next step by opening the logbook.
  - Citizen's "Vote in a poll" is satisfied by the Earth trivia `/quiz` (3138).
  - No step uses a realm.
  - `stamp()` calls `progress()` *before* its own flash (2861 vs 2865). When a visit finishes a quest, the "Quest done" flash is replaced 0 ms later by "Stamped".
- **Why:** a quest should be the funnel: visit → talk → call one realm function.
- **Fix:**
  - When `progress()` ticks a step, flash the *next* step with a button that does it, e.g. "Citizen · 1 of 3 · next: say something in #governance" with ['Go', () => joinRoom('#governance')].
  - Add a final phase-1 step to each quest, fed by the `type: 'call'` events from #4:
    - Citizen: "Vote on Proposal 15", tested with `e.place === 'GovDAO'`.
    - Player one: "Submit a try to gnogolf".
    - Second pair of eyes: "Call a function from the realm card".
  - Rotate by ISO week from a pool of about 9 quests (same `rng(hash(week))` as the expedition).
  - Call `progress()` after the stamp flash.
  - Badges go on chain in phase 2. Stamps stay off chain: 18 transactions per player is gas spent on noise.
- **Effort:** S–M

## 9. Follow does nothing
- **Where:** `state.followed` lives for one session and has no effect (1054, 1180–1184, 1845).
- **Why:** follow is *the* return trigger. Following a world should bring you back for its moments.
- **Fix:**
  - Persist it with `keep('gw.follow')`.
  - The moments of followed worlds go to the bell: vote closing, event soon (#1), pot popped (#5), a new room.
  - Followed worlds get priority in tomorrow's expedition and a small dot on their label.
- **Effort:** S

## 10. Comets: two meanings, no reply, no limit
- **Where:** `launchComet` sends a comet from Earth on *every* message that names a world, sample lines included (2216, 2482, 3429). The sky fills with comets that mean nothing, so a real `/comet` (2921) does not stand out. `/comet` is reachable only by typing it, the sender never hears back, and nothing stops someone sending comets into every world's main room.
- **Why:** comets could be the cross-world social mechanic ("gm from GovDAO" landing in BUBBLE), but only if they are rare and get an answer.
- **Fix:**
  - Delete the 2 `launchComet` calls and keep the visuals for `/comet` only.
  - Limit to one comet per 10 min ("your next comet is ready in 7 min"): healthy scarcity and anti-spam in one line.
  - A sample reply comet comes back 20–40 s later ("BUBBLE answered your comet").
  - Add a "Send a comet" action to each Connected worlds row (renderConn, 2802).
- **Effort:** S

## 11. Routed questions: a strong idea, but the helpers' identities don't add up and nothing rewards helping
- **Where:**
  - `routeQuestion` (2976) picks 2 random people and says they come "from Adena". Their person cards (2954, 2962) list other random worlds.
  - It fires once per world per session.
  - The helper gains nothing.
- **Why:** this is the best "people meet people" mechanic in the prototype. It needs a reputation loop so helpers keep coming.
- **Fix:**
  - One shared `worldsOf(name)`, used by both functions. Route only to people whose worlds include `exp`.
  - Add a "Thanks" button on the helper's message. Thanks feed the person card: "Helped 14 people in Realm Review". That makes the "Helps people in" line earned.
  - Phase 0: helpers opt in ("ping me about X"). Never ping anyone who has not opted in.
- **Effort:** M

## 12. Cut the satellite "relay": no paid text inside conversations
- **Where:** "Also relay it to" posts the rented text into another world's main room (index.html:1298; app.js:1343, 1363–1365). "Free satellite" and "Free slot · rent me" cost 1 GNOT a day (672, 689, 705, 981, 1044).
- **Why:** a paid line in the chat stream makes a room feel like a billboard. That works against "stay and chat" and adds moderation work. In orbit, the satellite is fine as a phase-2 sink.
- **Fix:** remove the `rentRelay` label and select and the deliver branch. Rename "Free" to "Open slot".
- **Effort:** S

---

## New ideas (only ones that serve the goal)

1. **People you know, on the map.**
   - Labels show "noor + 2 you know".
   - The person card's second button becomes "Join noor in Dev help" (where they are *now*), not "Fly to <their usual world>" (2965).
   - Presence comes from IRC channel membership and is opt-in.
   - Social gravity is the first reason people stay in a hub.
2. **The expedition as a shareable daily puzzle.** Everyone has the same 3 stops, so show "1,204 finished today". At the end, offer a no-spoiler share card: 3 stamps drawn as a tiny constellation, made with `openShare`. This is a Wordle-style loop for discovery.
3. **Constellations as badges, drawn in the sky.** Stamping every world of an ecosystem draws its constellation above the cluster (Games: BUBBLE plus gnogolf). The reward lives in space, not in a panel, and it pulls you toward the missing world. It becomes a badge in phase 2.
4. **A weekly sky report in Earth (Monday).**
   - Jarvis drafts, and a person validates, as with site evolutions. EVOS already lists "A weekly digest pinned in Earth".
   - Contents: the week's new realms and who charted them, the gnogolf winner, proposal results, the top helpers.
   - Each line is a place link.
5. **A launch kit for realm authors.** When a realm is born (#3), its author can schedule a launch AMA in the new world. Meteors fly to it (#1), and the first 10 people to chat there get "founding crew" on their person cards. That gives builders a reason to launch on gnoworld, and keeps the hype pipeline fed.
