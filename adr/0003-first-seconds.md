# ADR-0003: The first seconds — how a newcomer understands gnoworld

| | |
|---|---|
| Status | Accepted by Alexis, 2026-11-03 |
| Date | 2026-11-03 |
| Author | Alexis Colin; drafted by Claude, slice 7's chief, and written into the repository by branch 7o |
| Builds on | [ADR-0001](0001-gnoworld.md) §6 (presence) and §7 (levels and navigation); [ADR-0002](0002-validated-prototype.md) §1 (the concepts: "Go explore", the daily expedition, the passport). Decisions of 2026-10-19 (the view "Cosmos"), 2026-10-21 (every world has its main room), 2026-11-01 (a world is a product), 2026-11-02 (the arrival) |
| Evidence | The review page with four proposals, a newcomer panel and a playable demo: claude.ai/artifact/1LwVAoNA7rjSxusA1qog39; the draft ADR, version 6: claude.ai/artifact/Szj5G7uct5pgMrnVuXKEL7 |
| Verified | **2026-11-03, by the chief:** `app/src/routes/home.tsx:15`; `app/src/features/home/Hero.tsx:1-2` and `:23`; `app/src/features/universe/signals.ts:13-25`; `packages/schemas/src/presence.ts:22`; `docs/decisions.md` lines 85, 147, 530, 559; ADR-0002 lines 124 and 210–212; the prototype's `app.js:4189` and `:4198`; the video's frames 1 and 4.<br>**2026-11-03, by 7o, at `6585eba6`:** the home is the cosmos page (`home.tsx:15`); its two actions are "Go explore" to the Earth and "See the list" (`Hero.tsx:46`, `:50`); a page's change between two places in space asks the scene to fly there (`features/universe/flown.ts:52`), so a link is the one call a flight needs; the device keeps a world's visit only when a seed wakes (`scene/world/feed.ts:96`, `scene/world/reading.ts:113`), and the Earth's page keeps none; the labels' layer is hidden from readers and takes no pointer (`scene/cosmos/labels.ts:67`, `labels.module.css:23`); presence names a world by its roles file's slug (`packages/schemas/src/presence.ts:16`); frames 2 and 4 show the hero through the opening, with "Go explore" filled and "Join the chat" beside it |

## Summary

A newcomer lands on a superb cosmos and does not know what it is or what to do. This ADR decides how gnoworld tells them, without a
tutorial:

- **an opening line,** one promise shown over the dive's opening, on the first visit only;
- **five small aids** on the arrival;
- **a "Go explore" with its own job:** it no longer leads where "Join the chat" leads.

Every word is true, lives in the page, and is shown once where it would repeat.

## Context

### What gnoworld is (Alexis, 2026-11-03)

Every realm is a world. gnoworld is where the gno.land ecosystem is discovered, followed and steered as a whole. You see its trends and what
is moving, at a glance, and you talk with the people who live in it.

It replaces a project's Discord, with much more: the chain sits inside the conversation. Today a room can read its realm and show its
proposals; calls signed from a room come with slice 9 (backlog, line 152).

The first seconds must say that, not only "a planet is a room".

### The arrival before this ADR

- **Home is the Cosmos tab, seen close.** `/` renders the universe's "cosmos" page. The camera dives for 5.5 s from the whole cosmos to the
  Earth at the canvas centre, with a close world cut by the left edge (decision of 2026-11-02). It reads as a close-up, not a map, so even
  its author asked whether it was the Cosmos view.
- **The hero counts worlds:** "534 worlds in Onyx". It counts no people while no source says so.
- **Two buttons.** "Go explore" links to the Earth; "See the list" repeats the List tab.
- **Labels with real presence.** Since 7h, labels read the server's presence per world. The server gives no total that counts each person
  once.

### The model, as already decided

- A world is a gno.land product shown as a planet, with its main room by itself (decisions 147 and 559).
- Its moons are its further rooms, four at most.
- The Earth is everyone's room. Its Moon carries its busiest room after the general one (ADR-0002, line 124).

So "a planet is a room" holds; its moons are more rooms.

### What the video and the prototype do

- The video has no help text. It teaches by life: "N here" on every world, "671 online · People in 31 countries, across 18 worlds", "Join
  the chat" (frame 4).
- The video opens with an iris on the cosmos, with no title card (frame 1), and its hero stands through it (frame 2).
- The prototype's "Go explore" ran the live moment if one was near, otherwise the daily expedition: three stops, the first where something
  is live (`app.js:4198`; ADR-0002, lines 210–212; backlog slice 8).
- "Join the chat" opened the Earth with its chat (`app.js:4189`).

With our "Go explore", both buttons would lead to the Earth.

### What a newcomer must grasp in ten seconds

Where am I? What is a planet? Where do I start? What can I do? Why come here at all?

### Why the arrival feels empty beside the video

| Element | Video, frame 4 | Ours at the demo | Why |
|---|---|---|---|
| Bodies in view | About twenty, eight labels | About seven, up to eight labels | The arrival decided on 2026-11-02: the close world and two or three postcards |
| People on labels | "N here" on every world | "N here" where people are | Real presence (7h); few people on a testnet |
| Live badges | "AMA in 11 h", "noor is here", "Uncharted signal" | Heat, rising and "Uncharted" (7h) | Events have no dates; friends come later |
| The rail of worlds | Eight worlds on the right | The rail (7i) | Filled from the worlds' file and presence |
| Header | Jarvis, Chat, passport 0/18, bell | Log in only | Bell 7k, passport slice 8, Jarvis slice 10 |
| Stations | Three, "Built and curated by the gno.land team" | None | `app/data/stations.json` is empty, and their bodies are outside slice 7 |
| Hero | 671 online, people in 31 countries, across 18 worlds | 534 worlds | No total of people (`presence.ts:22`) |
| Prices | GNOT, ATONE, BTC with sparklines | "No price to show" | CoinGecko gives nothing here; cause not checked |
| Ticker | "TRENDING DeFi +34% this hour", an AMA | "Event … date to be confirmed" | `events.json` and `news.json` are placeholders |

Three causes, in order of weight: the video's busiest features come after the demo (the header's buttons, the stations); the team's
content files are empty or placeholders; a testnet has few people. None of it is the renderer.

## Constraints

- No tutorial: no modal, no steps, nothing that blocks the scene.
- Nothing fake; a sentence about people only when they are there.
- Text in the DOM, never drawn into the 3D; reduced motion keeps the meaning.
- The video is the floor.
- The first screen's scripts stay under 177,152 B.

## How the options were found

Four designers (agents), one angle each: the scene teaches, the right words, the first action, question the structure. A fifth, as a
judge, played five newcomers: a gno.land developer, a crypto-curious person, a designer without crypto, a phone user, a screen-reader user.
The chief checked every claim against the code, the decisions and the frames.

## Decision

### 1. The opening, on the first visit only

- **The words,** over the dive's opening, with no click:
  - "gno.world"
  - "The living map of gno.land."
  - "Every realm is a world. Discover what's being built, follow what's trending, and talk with the people building it."
- **How long.** The words stay while the 3D loads and fade as the camera lands. A click, a key or the wheel shortens them.
- **Reduced motion.** They show, then give way to the dissolve.
- **Where it never shows.** On a return, or on a shared link to a world.
- **The audience is both** the gno.land community and the general public (Alexis, 2026-11-03). So a discreet "What is gno.land?" stands by
  the opening's words, to gno.land's own site (https://gno.land), opened in a new tab with `rel="noopener"`. It shows with the opening, on
  the first visit.

### 2. The arrival's aids, all of them

- **2a, the hero's line:** "<N> worlds in <universe>. Each one is a place to talk."
- **2b, "Start here →" inside the Earth's label,** in place of its heat badge: "Earth · 184 here · Start here →". The label is larger, and
  the call is the design system's amber with a glow (heat, the sun, live moments: `docs/DESIGN-SYSTEM.md`, palette). Cream stays the hero's
  primary button, one per region. It stays until a first place is entered; then the label takes back its size and its badge. A click on it
  enters the Earth at once.
- **2c, the view tabs describe themselves to screen readers only,** as `aria-description`: Earth, "where everyone talks"; Cosmos, "every
  world"; List, "every world, as text". Nothing is drawn under the tabs.
- **2d, a "Worlds" kicker** over the page's list of worlds, where that list shows: the rail (7i) stands for it from 900 px wide with the
  cosmos on.
- **2e, a world's label opens** to "<name> · Enter →" on hover, on focus or at a first tap; a second tap enters.
- **The labels are larger:** names at 16 px, figures at 15 px, in the video's amber.

### 3. The two buttons

- **The order** is the video's: "Go explore" (solid), then "Join the chat".
- **"Join the chat"** opens the Earth's general room, read without an account.
- **One filled call at a time.** On a first visit, "Start here" is the one filled call: "Go explore" stands as an outline, and "Join the
  chat", which leads to the same room as "Start here", waits for the return. On a return, the video's pair is back, with "Go explore"
  filled.
- **"Go explore"** flies to the world with the most people now: the presence is 7h's, the flight 7g's. When nobody is anywhere, it flies to
  the Earth.
- **Later.** The daily expedition of ADR-0002 §1 takes its place in slice 8.

### 4. How it is built (7o, for Alexis's review)

Where the decision left a choice, 7o made it as follows; each can be changed on its own.

- **The newcomer.** The draft said "Start here" would use the visits the labels already read. They cannot: the device keeps a world's visit
  only when a seed wakes, so a world older than seven days is never kept, and the Earth's page keeps none (Verified). The device keeps
  instead, per universe, the first place the reader entered: the Earth's page, a world's or a realm's. Until then the reader is new: the
  Earth's label says "Start here" and the buttons are the first visit's. A device that keeps nothing (storage refused) reads every visit as a
  first.
- **The opening's memory** is one more word on the device, kept as the opening shows: a reload while it shows does not show it again. It
  shows only to a newcomer, so a reader who entered a world from a shared link never sees it.
- **Where the opening shows.** Over the home's dive, which runs where the scene loads by itself (a computer) or once a phone pressed "View in
  space". Where no dive runs (space refused, a weak device, a phone that did not ask) nothing shows, and the device keeps its first visit
  for the next dive. The hero stays through it, as frame 2's does.
- **The first visit's buttons** stand where "Start here" can: on the default universe's home, from 900 px wide. Under 900 px, where the
  cosmos waits for "View in space", the video's pair stays, so a phone always has its filled call.
- **"Go explore"'s world** is the busiest world but the Earth, by the server's presence read as the click comes; the Earth when no world has
  anyone, or when the server does not answer. Its link's address is the Earth's, which a new tab opens.
- **"On focus"** is the focus of that world's link: the labels take no focus, for they are hidden from readers and the page's links say
  every place. A world's label opens while the keyboard is on its link, in the rail or in the list.
- **A label that opens** grows to its right over its neighbours, and goes back as the pointer, the focus or the tap leaves.

### 5. What stays

- The word "Cosmos" (decisions of 2026-10-19 and 2026-10-31).
- The arrival's framing (2026-11-02).
- The Earth label's real count.

### 6. Later, when the data exists

- The big number counts the people online, as the video does, once the server gives a total that counts each person once.
- The Earth's Moon is labelled with its real room.
- Filling the arrival (question 5) is 7i's rail and the team's content files, not this ADR's code.

## Rejected

- **A breadcrumb and "You are here".** They repeat the hero's line and "Start here". The UX review already found the first screen loaded
  (`docs/prototype/reviews/ux.md` §12).
- **A card on the Earth with the last message.** A stranger's words on the home need the moderation verdicts first.
- **Renaming the tab "Universe", no world cut by the edge, five to seven labelled worlds, a "Zoom out" button.** Each goes against a
  decision, and the set costs the most.
- **The Moon labelled "#general".** False: the Moon carries the busiest room after the general one.
- **Three calls on the first screen:** two filled buttons, and two calls leading to the same room (Alexis, 2026-11-03).
- **A description drawn under the tabs:** two pills stacked one over the other (Alexis, 2026-11-03).
- **"Start here" as a chip beside the Earth's label:** one pill beside another; inside the label it is one call to action (Alexis,
  2026-11-03).
- **A title screen with "Enter":** a gate before the spectacle, and the video has none.

## Consequences

- **Work.** One part after 7h, 7g and 7i: the hero, the labels, the header's tabs, the opening and a newcomer's memory on the device.
- **Weight.** The first screen pays for the hero's rules and the opening; the labels' chunk for "Start here" and the doors' marks.
- **Tests.** Unit tests for the hero, the home, the labels, the opening and the newcomer's memory; a journey for a first visit and a return;
  the arrival's approved pictures change, each with an `Updated-baseline:` line.
- **What a newcomer still misses.** On a phone, nothing hovers; the first tap stands in for it.
- **Risks.** Words over the 3D during the opening. One more thing on the arrival per aid. The first visit's memory is per browser: a new
  device sees the opening again.
- **Undo.** Each aid is one element. Removing it removes its test and its line.

## Questions answered

Alexis answered them on 2026-11-03 ("Oui, tes recos", then "Les deux" for the audience).

| # | Question | Answer |
|---|---|---|
| 1 | The opening, and its words | The words during the dive, with no click: "The living map" (§1) |
| 2 | The buttons | The video's order, "Go explore" filled and flying to the liveliest world, "Join the chat" to the Earth's general room (§3) |
| 3 | The demo's audience | Both, the gno.land community and the general public: a discreet "What is gno.land?" (§1) |
| 4 | The aids | All of them, 2a to 2e, with larger labels (§2) |
| 5 | Filling the arrival before the demo | 7i's rail and the team's content files; not this ADR's code (§6) |
| 6 | Start here's colour | Amber with a glow (§2) |

## References

- [ADR-0001](0001-gnoworld.md) §6 and §7; [ADR-0002](0002-validated-prototype.md) §1, lines 124 and 210–212
- [docs/decisions.md](../docs/decisions.md), lines 85, 147, 530 and 559
- The video's frames 1, 2 and 4; the prototype's `docs/prototype/source/app.js:4189` and `:4198`
- The review page and its demo: claude.ai/artifact/1LwVAoNA7rjSxusA1qog39
- The design system: [docs/DESIGN-SYSTEM.md](../docs/DESIGN-SYSTEM.md)
