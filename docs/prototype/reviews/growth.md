# gnoworld: growth review

Angle: hype and virality, activation, retention, discoverability, conversion to realm use. Everything below is based on `universe/app.js` and `universe/index.html`, the ready-made screenshots, and two mobile runs in `scratchpad/review-growth/`.

**What works:** The live countdown rings (pot, vote, course), heat chips, the telescope peek, shared rooms, place links, comets and a daily expedition that is the same for everyone are real hype and retention mechanics, and they sit in the right places. Guests can post without a wallet, and Jarvis's welcome plus the "quiet room, say hi" nudge make the first message cheap.

---

## 1. The URL never says where you are, and message links are broken. Every viral loop depends on this.
- **Where:** The hash is read once at load (`app.js:3871`). `go()` (1089) and `home()` (1123) never update the URL, and nothing listens for `hashchange`. If you copy the address bar on BUBBLE, you share the home page. "Copy message link" (`2096`) builds `#bubble/arcade/12`, which line 3871 can't match, so it lands on the home page without a word. The `12` is a local counter (`msgSeq`), so another client could never resolve it anyway. `roomState.name.slice(1)` also turns the voice room "Lounge" into `ounge`.
- **Why:** Shares, invites, notifications, digests and SEO all end on a URL. Right now only the Share dialog makes a working one.
- **Fix (S):**
  ```js
  // go(): after state.focus = b
  if (!hidden(b)) history.replaceState(null, '', `${location.search}#${slug(b)}`);
  // home(): history.replaceState(null, '', location.pathname + location.search);
  // joinRoom(name): history.replaceState(null, '', `${location.search}#${slug(roomState.place)}/${name.replace(/^#/, '')}`);
  // 3871: parse place and room, reuse goPlace()
  const [want, wantRoom] = location.hash.slice(1).split('/'), deepTarget = want && bodies.find((b) => slug(b) === want);
  //   in onLoaded: setTimeout(() => goPlace(deepTarget.name, wantRoom ? `#${wantRoom}` : null), 300)
  addEventListener('hashchange', () => { const [s, r] = location.hash.slice(1).split('/'); const b = bodies.find((x) => slug(x) === s); if (b) goPlace(b.name, r ? `#${r}` : null); });
  ```
  `replaceState` does not fire `hashchange`, so this can't loop. Until messages carry an IRCv3 `msgid`, make "Copy message link" copy the room link. Ergo already sends `msgid`, and `CHATHISTORY AROUND` can scroll to the message later. Use `.replace(/^#/, '')` instead of `slice(1)`.
- **Experiment and metric:** % of sessions that start from a deep link, and how far those sessions get (first message, time on site), compared with home-page landings.

## 2. Shared links unfurl as bare URLs, and public rooms are invisible to search
- **Where:** In `index.html`, the head is only `<title>` (line 1). There is no description, Open Graph tags (`og:*`), Twitter card or canonical link. Worlds live in the hash, which never reaches a server, so a world can't have its own preview. The share card image is generated (`openShare`, `3457`) and then thrown away.
- **Why:** On X, Telegram and Discord, a link without an image card gets a fraction of the clicks. The List view (`renderBoard`) already holds a crawlable index of everything, but only as JS.
- **Fix:**
  - **(S)** Add global meta now: description, `og:title`, `og:description`, `og:image` (a 1200×630 universe shot), `twitter:card=summary_large_image`. Add a "Download image" link to the share dialog (`<a download href=img>`). An image posted on its own gets seen even when the link has no preview.
  - **(M)** Add path routes `/w/<slug>`. A build script writes one tiny HTML per entry in `HUBS` with its own OG tags, then boots the app on `#<slug>`. Take the OG images once a day with the same headless-Chrome `--screenshot` recipe used here. In plain HTML, each page carries the description, the realm path linked to gnoweb, the rooms and the next event. For channels that opt in as "public and logged", it also carries the last 20 public messages from Ergo history, and the room header says so. Add a `sitemap.xml` built from `HUBS`.
- **Experiment and metric:** CTR from X/Telegram posts with and without the card (same text, alternating weeks). Organic sessions landing on `/w/*`.

## 3. Sharing is a dead end: one button, no inviter, no native sheet, no share at the peak moments
- **Where:** Share exists only on the plate (`fShare`, 3491). The link has no inviter (3465). The X text is "BUBBLE on gnoworld: 214 here" (3466), even though a live moment like "Pot 72.9 GNOT · 02:57" sits in `MOMENTS`. Moments that should prompt a share don't offer one: first to chart (`arrive`, 1105–1115), quest done (`progress`, 2855), expedition done (`stamp`, 2865), a world being born (`birth`, 2997).
- **Fix (S):**
  - **Invites with gno names:**
    ```js
    const via = state.name ? `?via=${encodeURIComponent(state.name)}` : '';
    const link = `${location.origin}${location.pathname}${via}#${slug(b)}`;
    ```
    At load, read `new URLSearchParams(location.search).get('via')` and validate it with `/^nym-[a-z]{5,13}\d{3}$/`. Then `flash(\`${via} invited you\`, nameOf(target), ['Say hi', openChat])`. When the invitee sends their first message, mention the inviter once in that room. Reward only invitees who actually talk (for example, a "Guide" stamp after 3 of them), never clicks.
  - **Native share:** add `if (navigator.share) … navigator.share({ title, text, url: link })`. On phones this reaches WhatsApp and Telegram, where crypto communities live.
  - **Share text:** `const m = MOMENTS[b.name]?.(); text = \`${b.name} on gnoworld${m ? \` · ${m.text}\` : \`: ${f.a[0]} ${f.a[1]}\`}\``.
  - **Share at moments:** pass `['Share', () => openShare(b)]` as the `act` of those four `flash()` calls.
- **Experiment and metric:** K-factor = invites sent × the share of invitees who post. Shares per 100 sessions, by moment.

## 4. Follow does nothing, and a returning visitor gets no "since you left"
- **Where:** `state.followed` is an in-memory `Set` (`1054`). It isn't saved and nothing reads it except the button labels (`1182`, `1694`, `1878`). Notifications are global samples. Clicking one flies to the world but not to the room ("kaito mentioned you in #builders" opens #bubble, `3301`). Follow also shows on Earth, where it means nothing.
- **Why:** Follow is the retention primitive: it should decide what pulls you back.
- **Fix (S):**
  - **Persist:** `state.followed = new Set(keep.get('gw.follow', []))` and `keep.set('gw.follow', [...state.followed])` in the handler.
  - **Use it in the rail:** in `renderHRail`, sort followed worlds first.
  - **Return digest:** on load, if `gw.follow` is not empty, call `flash('Welcome back', 'BUBBLE +42 messages · GovDAO vote closes in 2 h', ['Catch up', catchUp])`. In phase 0 that comes from Ergo `CHATHISTORY` since `gw.seen`.
  - **Notifications:** give NOTES a `room` and open them with the existing `openKey(\`${where}/${room}\`)`.
  - **Earth:** hide `fFollow` on Earth.
- **Experiment and metric:** D1/D7 return rate of people who follow vs those who don't. Follows per focus view. Click-through on the return digest.

## 5. Realm use: realm paths are dead text, links go to home pages, and the main CTA leaves the hub
- **Where:**
  - `renderAbout` (1288) shows "Realm · from the explorer" as plain text.
  - `linksFor` (1246) gives every world "Explorer → gnoscan.io" (the home page) and "Docs" (the home page). Only 5 worlds get a gnoweb link.
  - `renderMain` (1379) makes "Boop a bubble" open gno.world in a new tab, even though the in-room Play card (`placeCard('play')`, 3015) does the same thing where others can see it. The same goes for Memba's "Open a quest ↗".
- **Fix (S):**
  - **Link the realm:** make the path an `<a href="https://${realmOf(b)}">`. Add "How to call it" → `https://${realmOf(b)}$help` and "Source" → `…$source` (gnoweb serves both; check the current syntax).
  - **Explorer link:** deep-link to the realm's page, e.g. `https://gnoscan.io/realms/details?path=${realmOf(b)}` (check the route).
  - **Main CTA:** for worlds in `GAMES` or with `dao`, make the main CTA run `placeCard('play' | 'proposal')`, so the action happens in the room. Keep "Open the dApp ↗" as the second link.
  - **Phase 1:** have the card buttons call Adena `DoContract` with `memo: 'gnoworld:<slug>'`. Attribution then lives on chain, honest and measurable, with no tracking.
- **Experiment and metric:** realm card opens → "Call" clicks → signed transactions carrying the memo, per 100 chatters. Weekly chatters who made at least one call (the north star I'd use).

## 6. The daily expedition has Wordle's shape but not its loop
- **Where:** `expedition` (2845) is seeded by the UTC day, so it is meant to be the same for everyone. But `sort(() => r() - 0.5)` depends on each engine's sort, so Safari and Chrome can serve different expeditions. "Today's expedition: done" (2865) ends the loop: no share, no time, no streak, no "next one in". The first stop can be a quiet world.
- **Fix (S):**
  - **Same for everyone:** `.sort((a, c) => hash(dayKey + a.name) - hash(dayKey + c.name))`, the same in every browser.
  - **Lively first stop:** order the 3 stops by `here`, highest first, so the first stop has people talking.
  - **Close the loop:** store `log.expStart` and `log.streak`. When done, flash with Share. Share text: "gnoworld expedition 2026-10-16 · 3/3 in 4 min · BUBBLE → Adena → Broadcast Moon" plus the link. Emoji are fine there, because they are message content, not interface. Show "Next expedition in 9 h" in the logbook.
  - **No guilt mechanics:** no streak-loss nags.
- **Experiment and metric:** completion rate, share rate on completion, D1 return of people who finished.

## 7. Activation in the first 60 seconds: weight, identity, value
- **Where and fixes (S each):**
  - **Load weight:** about 5.2 MB of textures load before the iris opens, with a 9 s fallback (`app.js:34`). Serve WebP or AVIF; `sky.jpg` alone is 1.8 MB. Use a smaller sky under 900px. Measure the reveal at p75.
  - **No value proposition:** the hero says "671 online / People in 31 countries" (`index.html:1067–1068`), but nothing tells cold traffic what this is. A/B the line: "The live chat of gno.land. Each planet is an app on chain: talk there, then use it."
  - **Everyone is "guest" with a French flag:** `post()` hardcodes `'FR'` (2478) and `me()` falls back to `'guest'` (2120). In phase 0, let people pick a nickname inline on their first send ("Posting as guest-4821 · change"), with no wallet. The on-chain `nym-` name then becomes an upgrade. Countries off by default, as Earth itself promises ("Countries are opt-in").
  - **First messages go unseen:** tag a person's first message "new here" so regulars greet them.
  - **Phones:** the chat only opens itself above 1200px (`1708`). On ≤900px, the mini chat `#fTalk` sits at the bottom of the plate. Move it right after `#fActs` (CSS `order`), so someone arriving from a link sees live messages and an input above the fold.
- **Experiment and metric:** % of new visitors who post within 5 min. % of first messages with a human reply within 2 min. Loader abandonment (`visibilitychange` before the reveal).

## 8. Keep the hype honest when the sample data becomes real
- **Where:**
  - **Fake social signals:** a fresh guest gets "kaito mentioned you", "mia mentioned you" every 30 s, and DMs from strangers (`NOTES`/`MORE`/`DMS`, 3278–3328).
  - **Fabricated helper reply:** `routeQuestion` (2976–2983) writes "came over from X: happy to help" in a real person's name.
  - **Unlabelled paid text:** a rented satellite's text lands in a room as "comet from … satellite, relayed" (1364), with no "sponsored" label.
  - **Free vs paid:** the rent dialog says "rent a **free** satellite" (`index.html:1298`), while its button says "Rent · 3 GNOT". The label "Free satellite" (981) actually means "available".
  - **Bad news on the home chat:** Earth's ring reads "▼ 17% vs a usual hour" (`pickRing`, 1630–1632).
- **Why:** Fake mentions and unlabelled ads win one click and lose the community. A mega chat lives on trust.
- **Fix (S):**
  - **Bell:** carries real events only; a new visitor starts with the next event and 0 DMs.
  - **Routed questions:** notify helpers who opted in ("I help in Dev help") and show "2 helpers notified". Never write in someone's name.
  - **Satellites:** relay once per rental, labelled "Sponsored · rented by X". Rename "Free satellite" to "Open satellite".
  - **Earth's ring:** show the trend only when it is up; otherwise show "51 msgs/h now". The chart still tells the whole story.
- **Metric:** report and mute rates, notification CTR (should rise once real), satellite complaints.

## 9. Events are the best density tool, and there is one, hard-coded
- **Where:**
  - `EVENT` is a single constant (930).
  - "Remind me" (3031) pushes an in-memory note that a reload wipes.
  - During the 14 minutes before the AMA, Dev help's main CTA still says "Say hi" (`renderMain`, 1381).
- **Fix (S):**
  - **More events:** turn `EVENT` into `EVENTS[]` on a weekly rhythm: office hours in Dev help, gnogolf course end, GovDAO vote close. `MOMENTS` already counts these down.
  - **Add to calendar:** an ICS file as `data:text/calendar` (6 lines). Keep "Remind me" in `keep('gw.remind')`.
  - **CTA before the event:** within 30 min, the main CTA becomes "Join the AMA · in 14 min" and opens its voice room.
- **Metric:** unique chatters in the event room during the event, % who came from a reminder or ICS, D7 return of attendees.

## 10. Cross-world moments don't link back: comets, first to chart, births
- **Where:**
  - The comet note "comet from GovDAO" is plain text (`cometParts`, 2913).
  - First to chart is stored per browser as `by: me()`, which reads "guest", and is never announced (1114).
  - A newborn world (`birth`, 2988) offers "Fly there" but nothing to do once you arrive.
- **Fix (S):**
  - **Comets:** make the note a `.plink` with `dataset.place = from`. The click handler at 2948 already exists, so the recipient can fly back and answer. Rate-limit to 1 comet per 10 minutes per name.
  - **First to chart:** announce it once in #general ("ines charted Night Owls first"), with a Share action. In phase 0, an IRC bot is the global source of truth.
  - **Births:** a newborn world's main CTA becomes "Be the first to say hi", with a "Witness" stamp for the first 10 visitors.
- **Metric:** comet round trips (the recipient posts in the origin room within 10 min), visits to a newborn world within 10 min of its birth.

## 11. Cold start: real launch numbers will be small, and the map spreads people thin
- **Where:**
  - **Spread:** 18 worlds × up to 5 rooms + voice + shared rooms.
  - **Room choice:** "Say hi in …" uses `rooms[0]` (1381), not the busiest room.
  - **Hero number:** the giant "671 online" becomes anti-hype at 12.
- **Fix (S):**
  - **Busiest room:** the CTA and the expedition send newcomers to the busiest room (`max` of `roomsFor(b)[i][2]`).
  - **Quiet rooms:** collapse rooms with fewer than 2 people into "+3 quiet rooms". This also helps the list scale to 40.
  - **Small counts:** below a threshold, the hero shows "messages today", and labels show "last message 3 min ago" instead of "2 here".
- **Metric:** share of first visits whose first room had 5 or more messages in the last 10 min. First-message rate by how lively the room was.

---

## New ideas (only ones that clearly serve the goal)
1. **Claim your planet (builder loop, phase 1, M).**
   - **What:** a realm's deployer proves it with Adena (signer = deployer address) and gets the world. They name its rooms, pin messages, choose the main-CTA function, and get a share kit plus a "Talk about this realm on gnoworld" badge for their `Render()` or README.
   - **Why:** every builder brings their users here, and every badge is a backlink.
   - **Metric:** claimed worlds per week, visits arriving from badges.
2. **Realm feed in rooms (M).**
   - **What:** a read-only bot (tx-indexer or `chain.Emit` events) posts quiet, collapsible lines: "kaito booped pot 12 · tx ↗ · Do it too". "Do it too" becomes an Adena call in phase 1.
   - **Why:** using a realm becomes visible, which leads others to use it. This is the most direct path to "use the realms".
   - **Metric:** calls started from feed lines.
3. **Public profiles at `/@nym-name` (M).**
   - **What:** the person card as a page: stamps, badges, first to chart, the rooms where they help.
   - **Why:** gno names double as invite codes (`?via=`).
   - **Metric:** profile shares, new chatters who arrive from a profile.
4. **Weekly digest page (S–M).**
   - **What:** Jarvis drafts it and a person approves it, reusing the site-evolutions review pattern. It covers top threads, new realms and next week's events. Pinned in #general, published at `/digest/2026-42` (SEO), plus RSS.
   - **Metric:** digest visits that turn into flights.
5. **First on-chain call = claiming a badge (phase 1, S on the client).**
   - **What:** logbook quest badges are claimable on onyx with one Adena call (faucet-funded), and the claim is announced in the room.
   - **Why:** the first transaction comes with a reason and a social moment.
   - **Metric:** % of connected users who make a first call, and the time from first visit to first call.

## Measurement to wire first (needed by every experiment above)
- **Helper:** one `track(name, props)`, cookie-less and aggregate, with no fingerprinting.
- **Events:**
  - `land{src, via, deep}`, `reveal_ms`
  - `first_message`, `follow`
  - `share{moment, channel}`, `invite_landed`
  - `flight{from: label|rail|ticker|comet|plink|notif}`
  - `realm_card`, `call_signed{memo}`, `event_join`
- **North star:** weekly chatters who made at least one realm call.
