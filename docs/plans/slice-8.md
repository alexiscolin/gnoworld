# Slice 8: discovery on the device

Draft of 2026-11-04, for Alexis's approval (nothing is built). Sources: backlog row 8 and "From the video's audit", ADR-0002 §1 (Menu and settings, Passport, "You charted it", Daily expedition, Quests, "Go explore", Follow, Share, Events), §3 (never the total), §9; frames 1, 6, 86, 93, 95 read. Radical mode (decisions, 2026-11-04): parts write no test while they build; one hardening branch writes them all before main.

## 1. Done when
Row 8, word for word: The expedition is the same for everyone on a given day; a stamp survives a reload; streaks count UTC days; a reminder survives a reload; every setting survives a reload and takes effect without one.
Added: progress is shown per constellation, never against the universe's total (§3; see question 1); a device that cannot be read is never written over (`lib/keep`'s rule); quests end on a realm action that waits for slice 9 and says so in place; no stamp, follow or quest leaves the device.

## 2. Out of scope
The server's shared "first to chart" (only the device's "you charted it" and the moment); friends on the map, follows on chain, the published stamp count (phase 1); push reminders (phase 1, Push); events added by moderators; the notifications panel (question 5); the settings of features not built yet (language and translation: 10; the DM filter: 5q's follow-up): each feature adds its row when it lands; NFT badges (ADR-0001 §11); a calendar widget (DESIGN-SYSTEM: the calendar is an agenda of Rows).

## 3. Threat model (ADR-0002 §9)
| Asset / entry | Abuse | Mitigation | Proving test |
|---|---|---|---|
| Device store (settings, passport, follows, reminders, streak) | Corrupt or hostile stored data, or an imported file, crashes or lies | Zod on every read; an import is size-capped, parsed, never merged field by field; unreadable = never overwritten | Garbage, huge and wrong-version files; export then import is the identity |
| The clock | A clock set back or forward farms a streak or fires every reminder | Streak by UTC day, one step a day, never past today; a reminder fires once, never for a past event after a gap | Clock jumps, DST, 23:59:59 and 00:00:00 UTC |
| Reminder timers | `setTimeout` over 2^31 ms fires at once (the sample events sit in 2099) | Timers armed only inside a window; the rest re-armed on open | An event 40 days ahead arms nothing and fires nothing |
| Share (link, snapshot) | A snapshot of a private room or DM, a link with a name, address or token | A snapshot is the 3D view alone, never the chat, a DM or a person card; a link is the place's public URL | A DM docked: the snapshot has none of it; the link is exactly the place URL |
| Calendar links, quest data files | A `javascript:` or tracking link; a quest of 10,000 steps | `https` only through the exit warning; Zod bounds on both files, build fails | A bad scheme; a file one past each bound |
| Settings applied at once | A setting that hides a safety notice (the exit warning, "Testnet") | A setting only changes quality, motion or choices; no safety text has a switch | The notices show with every setting |

## 4. Cost
Hot paths: a stamp is written at a first visit only; the header's counter reads one derived number; the expedition is a pure function of (UTC day, data file), computed once a day; reminders are one timer, the nearest. Settings apply by a store subscription, no reload and no per-frame read. Budget: the first screen's bundle grows by at most the header's counter (the rest are chunks opened on click, as `GoExplore`); the gate's bundle budget holds.

## 5. Scale
First limit: IndexedDB writes. Stamps are one record per world, written at a first visit, so a person with 5,000 stamps costs what one costs; the passport lists windowed by constellation. Next step: the published count on chain (phase 1).

## 6. What the hardening must test
Row 8's five sentences (section 1), each as a unit test and, for a reload, a journey. Added: every threat row; the passport per constellation (a world in two ecosystems counts once; an empty constellation shows no 0%); "Stamped" and the scan once per world; streaks on a 1-day gap, a 2-day gap, and a month end; "Go explore" picks the live moment, else the expedition, and stays slice 5's answer when the server says nothing; follow puts the world first in the rail; each setting takes effect with no reload (display, privacy, this device); "clear" removes what it names and nothing else; the menu by keyboard; reduced motion; a phone's menu. Journeys with pictures for the menu, settings, passport, expedition pill, first visit, share and calendar. Mutation over `core/expedition`, `core/passport`, the streak and the reminder window (a survivor goes into `GAPS` with its reason).

## 7. Files and branches
New: `packages/core/src/{expedition,passport}/`, `app/src/features/{settings,passport,expedition,quests,events}/`, `app/data/{expedition,quests}.json` filled with real curated stops and steps (their Zod in `packages/schemas`), the device store's new fields in `lib/keep` and `store/keep.ts` (fields are only added). Changed: the header (account menu, counter), the plate's Follow and Share, the rail's order, `features/home/explore.ts`. Tier 1: none planned; core is tier 2, interface folders tier 3. Sensitive: none, unless question 3 is answered "background".
| Part | Delivers (frames) | Kind | Waits on |
|---|---|---|---|
| 8a | The device store's fields, the account menu, the settings screen (header right, 86; no frame for the screen: design system) | Feature, radical | nothing |
| 8b | `core/passport`, the passport dialog, the header counter, the first-visit scan, "Stamped", "First to chart" pill (1, 6, 93, 95) | Feature, radical | 8a |
| 8c | `core/expedition`, the streak, the expedition pill, quests, "Go explore" (6) | Feature, radical | 8a |
| 8d | Follow, share (sheet, link, snapshot), the calendar and reminders (the plate's buttons, 93, 95) | Feature, radical | 8a |
| 8h | The hardening: section 6, the red pass, one combined review, the merge check | Hardening | 8a to 8d |
8a alone first (it holds the store everyone adds to); then 8b, 8c and 8d side by side, four sessions at most with the chief, each in its own worktree. 8b and 8d meet at the plate's buttons and 8c and 8b at the header: the chief names one owner per file in each brief.

## 8. Dependencies to ask for
None. Web Share, IndexedDB and canvas capture are the browser's; the reminder is a timer plus the page's own notice. Nothing read on npm.

## Questions for Alexis
1. The video's header shows "2/18" then "3/19" (frames 6, 86, 93), a stamp count against the total of worlds, while ADR-0002 §3 says never the total. Recommendation: show the video's counter (the end state is the video) but count only the worlds the person's own view lists, and keep the dialog per constellation; this edits ADR-0002's line, so you decide.
2. No frame shows the menu, the settings, the passport dialog, the quests or the expedition pill. Recommendation: build them from the design system alone (Dialog wide, `--font-title-l`, Progress) and have you retouch them in the ping-pong; no prototype code copied.
3. Reminders: only while the page is open and at next open (no tier-1 file), or in the background through the service worker (`app/src/sw/`, tier 1, security review, xhigh)? Recommendation: the page only; the background is the Push slice.
4. The settings screen: ship only the settings whose feature exists (display, privacy's country tag and presence if 7j has landed, account, this device), each later feature adding its row? Recommendation: yes; a switch for nothing is dead code.
5. The notifications panel (frames 86, 87) is the bell's dropdown, over the dock, by kind (All, Messages, Worlds, News) and by world, fed by follows, mentions, events and the news. Slice 7's plan already lists it as 7k, while video-screens says "not placed yet". Recommendation: if 7k is not merged, take it as a fifth part, 8e, here: it reads what 8d stores (follows, reminders) and sits on the same header, and nothing in slice 7's space needs it. If 7k is merged, only fix video-screens.
6. Quests: steps that call need slice 9. Recommendation: build the card and the steps now, the call step showing "needs a wallet, soon" in place, so slice 9 only plugs the call in.

## Alexis's answers (2026-11-04, by questions)
1. The passport counter as the video ("3/19"), counted on the worlds the reader's own view lists; ADR-0002 §3's "never the total" line is edited by the slice's first commit ("Comme la vidéo").
2. The screens no frame shows: built with the design system, after a mock-up artifact made with it for Alexis, which may wait a little ("les 2, un artifact avec le design system, qui attendra un peu").
3. Reminders only while the page is open and at the next open; the background is a later Push slice ("Page ouverte seule").
4. Settings only for the features that exist ("Oui").
5. The notifications panel (frames 86, 87) moves here as a fifth part, 8e, from slice 7's 7k ("Dans la tranche 8").
6. Quests: the whole card now, the call step "needs a wallet, soon" until slice 9 ("Carte complète, appel à venir").
