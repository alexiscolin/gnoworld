# Agent reports, 2026-10-15 (gnoworld prototype review)

Kept so the ADR update can use them. Full texts: game design in scratchpad/gd.txt; UI/UX screenshots in scratchpad/uiux/.

## Product manager (ADR-ready, summary)
- Goals: a newcomer sees the ecosystem and who is there within a minute, without a wallet; every hub/project/DAO has rooms reached by flying or from a list; reading needs nothing, speaking needs a gno name; people bring others by sharing; places are discovered, not bought.
- Non-goals: a game; prices or trading; a wallet; our own DAO/escrow/badges; private messages before MLS; copying a reference UI.
- Personas: newcomer, builder/project owner, community regular, DAO member/moderator.
- Feature map: keep 3D universe, generated planets, Earth text rooms + bubbles, views, focus view, chat drawer/full chat, comets, telemetry, share links. Change: topics (need a hub kind, Q14), signals (= new since last visit, local, no reward), Guide (scripted first, labelled bot, public rooms, consent for introductions), quizzes (no value), ticker (no prices), notifications, Adena connect (must be the §2 signed login, not GetAccount). Later: Onyx system (phase 1), voice (2+, SFU), DMs (2, MLS), polls (1), satellites (2 on onyx, 3 with real GNOT), hub creation (1, drop the word "mint"). Cut: Creators/Builders systems, boosts, GNOT price/pots/"Boop a bubble".
- Conflicts with the ADR: satellites rentable by tier 1 vs tier 2; pots/prices/fixed orbits vs §7; boosts vs §7 public signals; DM inbox before phase 2; voice has no transport in §12.
- Phase 0 stories: guest reads #general on a phone or IRC client; named user signs once (§2 checks); fly to any hub (keyboard, list, reduced motion); hub card with description, rooms and links, no sample numbers; country bubbles only after declaring; shared link opens the hub; operators moderate (bans, +m, rate limits, Q5); Guide answers /help /go /find @guide from hub data.
- Metrics: phase 0 guests who sign in within 7 days, weekly named speakers, time to first message, share of visits using the list; phase 1 hubs with ≥3 weekly speakers, setup without GNOT, 0 wallet popups after setup; phase 2 weekly private rooms, seals/week; phase 3 migrated users, clean external audit.
- New open questions 14–24: topic hub kind; plain IRC DMs through Ergo; Guide model/cost/data/consent; points leaving the device; satellites tier/approval/refunds/realm; voice SFU/recording/moderation; hubs realm on mainnet in phase 1 vs audit in phase 3; country hiding threshold; who writes hub descriptions; onyx shown beside mainnet; §10 tier table needs a phase 0 column.

## Game designer (summary)
- Core loop: see life → fly there → talk → your words become visible (mention comets). Minute: chat, Guide quiz/poll, comets, Earth bubbles. Session: home shows what is live; chart a signal or join a launch; share. Week: realms deployed this week refill the frontier; Monday "frontier report".
- Honest progression: no XP, no levels, no leaderboards; local logbook; "First words" credits from public history; phase 1 follows on chain; gnobuilders badges, not ours.
- Hype drawn on planets, never moving them (§7): countdown rings, flares on live moments, new realms as signals, ticker with real items only.
- Games: name-that-planet, weekly signal hunt, /duel @name (public 3-question quiz) in phase 0; Guide questions from chain data.
- Warning: the Guide in MLS rooms sends plaintext to an AI service; opt-in per room, labelled.
- Cut: boosts, points, Surprise me, sponsored satellites in phase 0, pot ticker and GNOT price, invented systems, sample DMs, voice, random comet targets, "X/18 explored".
- Keep, ranked: signals (realms deployed < 7 days, from the indexer), mention comets (rate-limited), live moments (topic countdown, DAO deadlines, presence spikes), Guide quizzes and polls (one vote per account via TAGMSG), share (#h/<hub>, 1200×630 card, navigator.share).

## UI/UX (summary; most items applied in prototype version 13)
- Broken: #hnav .center clash; full chat unusable on phones; Esc while typing; search dead in List view. Fixed.
- Duplicates: live counts ×4 on the plate; identity repeated in plate/Insights/chat side/list detail; 7 chat triggers; rooms in 5 places; world lists ×7; nav duplicated (Universe ×7, Earth ×6, Find ×5); Guide ×7; follow ×3; alerts ×2; explore ×3; dead UI still updated by code (#topbar, #bottombar, #lens, #crumb, #guideBtn, #guide, #card).
- IA: one global bar everywhere; landing = one live number, one sentence, Explore, Join #general, ticker; focus = kicker, name, one line, 4 facts + activity sparkline, one main button, Follow/Boost/Share, links, 3-message preview, "Open #room"; satellites = Rent + rules, no chat; list = cards + detail; Insights removed.
- Coherence: Cosmos→Universe, Map→Top view, Alerts→bell, one Guide name; three button styles (filled pill, outline pill, text link); ↗ only for external links; counts must agree.
- Accessibility: share dialog focus/trap/Esc; full chat inert background; announce arrival once; no live region on cloned messages or per-frame telemetry; ticker pause and single copy for AT; min text size; slider/tab semantics; show the CC BY credit.

## Second round (v20, 18:20) — personas and chat benchmark (summaries)

### Lambda user
- Can't tell what the site is for in 30 s; "Connect Adena" reads as the main CTA and feels risky; prices (BTC/ATOM/GNOT) and "pots" make it look like trading or gambling.
- Jargon: realm, DAO, dapp, hub, world, topic, system, gas giant, rooms·moons, block, calls, deployed by g1…, faucet, escrow, gnoweb, MLS, phase 2.
- Fake-feeling chat: same sample messages in every room, Jarvis says "Quiet right now?" in a 134-people room, counts disagree (place vs room, topic < its project).
- Asks: one plain sentence above "671", "Sign in with Adena · free" + "chatting as guest", social numbers instead of prices, tap-to-explain jargon, developer card collapsed, three user-facing words (Topic, Project, Community), safe zones for 3D labels, mobile chat entry.

### Degen
- Wants the BUBBLE pot + countdown as hero, a "happening now" stack (biggest pot, next vote closing, newest realm), new-realm radar, whale alerts, on-chain leaderboards (gnogolf scores, BUBBLE winners, top realms by calls), alerts instead of Follow, share cards with the hook (pot, time left, vote split).
- Red flags: canned chat, proposal 14 vs 15 mismatch, GNOT red next to BTC, dead "Rent" CTA, Faucet world without a faucet, "0/18 explored" with no reward.
- Conflicts with constraints: points/quests/raids/trading/own token.

### Chat benchmark (Discord + DAO)
- On chain (2026-10-15): GovDAO vote = MustVoteOnProposalSimple(pid, YES|NO|ABSTAIN), direct calls only (no relay), no deadline (2/3 of power), 3 T1 members today, only ProposalCreated event. Memba: 7 members, 7-day window. Adena: DoContract /vm.m_call.
- Missing basics: reply, reactions, permalinks, unread/mentions, per-room notifications, delete own message, report + moderation kit (launch blocker), slowmode, pins in the room.
- DAO in chat: proposal cards (status pill, YES/NO bar with 66.66% ticks, power, who voted), phase 0 = "Vote on gnoweb" link, phase 1 = Adena DoContract from the card (master key, never a session key); suggests moving direct DAO votes to phase 1 in the ADR.
- Avoid: signing prompts in chat, random comet targets, random poll seeds, voice headcounts without a plan, price bots, message-count leaderboards.
