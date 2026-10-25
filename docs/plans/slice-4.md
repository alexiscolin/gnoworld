# Slice 4: public rooms in the browser

Plan of 2026-10-25, for Alexis's approval before any code. Source: `docs/plans/backlog.md` row 4, `docs/decisions.md`
(139-161, 2026-10-23 and 2026-10-25), ADR-0002 §1 (phase 0), §4 (Adena), §9 (the bar), `docs/plans/slice-3.md` §4.
Opened by the harness merge (`slice-4-harness`, dec 2026-10-25). Today `app/src` has three routes and the worker,
no `lib/`; `@adena-wallet/sdk` is in `server` only; `core` holds `irc` alone.

## 1. Done when
Row 4, word for word: Markdown never produces HTML from data; a 100-room list stays usable; a reconnect resumes
history with no duplicates; the chat history is windowed; only embeds from the accepted services render, and only
after the moderation check; every DM shows "not encrypted"; a DM from someone you never talked with is refused when
that setting is on; the login's text reaches Adena unchanged and the server accepts the proof.
Added: the three open checks of slice 3 closed with the real extension (signArbitrary's bytes, the popup's origin,
`window.adena` under the CSP); a stream event of an unknown state is ignored, logged once (F675); slice 3's put-off
findings fixed (F706 to F711, F718, F720, F722 to F724, the twenty smaller ones), each with its kept test.

## 2. Out of scope
Uploads (4b), search (4c), the Discord bridge (4d), the rest of `lib/adena` (slice 9), the 3D scene, a contest of a
hide (slice 12), slow mode, encrypted DMs. On a phone: reading only.

## 3. Threat model
| Asset / entry | Abuse | Mitigation | Proving test |
|---|---|---|---|
| The page (a line, a topic, a name from Ergo) | XSS through Markdown, a link, an embed | `core/markdown`: text to an allowlisted tree, React renders it, no raw HTML; links `https:` only, `rel=noopener noreferrer`; the strict CSP | property: no input yields an element outside the list; journey: a line of `<script>` and `javascript:` shows as text |
| The login | a site gets a signature for gnoworld; altered text | Adena signs the server's text unchanged; the challenge names chain and origin | real-extension check (Alexis); journey with the Node signer; a byte-compare test |
| The session | a script uses the cookie, a ticket replayed | HttpOnly cookie; one 60 s ticket a connection (slice 3) | journeys: a ticket used twice refused |
| Embeds | tracking, a hostile picture before the check | accepted services only, after the "checked" event; no request before | journey: no embed request before the stream's verdict |
| DMs | spam from strangers, a belief they are private | "only from people I have talked with"; "not encrypted" on each DM | feature tests on the fake Ergo; axe and text journeys |
| The client | a 10,000-line flood, 100 rooms, a hostile line | windowed history; `parseLine`'s caps (F667, F669) | bench; fuzz of `parseLine` |

## 4. Cost (budgets proposed, measured in its merge)
Per line: parse and Markdown under 0.2 ms for a 510-byte line; render: the window holds 200 lines at most; a room
switch under 100 ms with 100 rooms; a reconnect fetches one CHATHISTORY page a room in view. Each a bench in `/pre-merge`.

## 5. Scale
First limit: `max-channels-per-client` 100 (dec 2026-10-25), so one session joins 100 rooms at most; next, join
only the rooms in view. Then Ergo's history page size on a reconnect over many rooms.

## 6. Tests, by level
Unit and property (fast-check) on `core/markdown` and the client's IRC state; feature tests against `fakeErgo`
and the real Ergo (the gate's); contract: the server's schemas (F671, F673, F674); faults: Ergo drops, the stream
cut, the network gone (offline); journeys with the Node login client and axe, phone width; mutation on each merge.
`test.fails`, written by Claude, code by Alexis: `core/markdown` (all of it), F667 and F669 in `core/irc`.

## 7. Merges, and which waits on which
Three chains, each merge on its own branch and worktree; a chain's merges in order, the chains side by side.
- **Chain A, the client** (tier 1 first): **4a** login and connection (`lib/adena`, `lib/irc`, F673, F674, F681);
  → **4b** rooms, sections, room switcher, history windowed, Who's here, topic (F671, F675);
  → **4c** composer and Markdown (`core/markdown` paired), format bar, emoji, slash commands, message menu;
  → then side by side: **4d** replies, reactions, mentions, threads, pins, edits shown (F664), unread, saved,
  drafts; **4e** DMs; **4f** notifications, typing, read marker; **4g** embeds, gallery, the verdict's pill (F683).
- **Chain B, the server's put-off findings**: **4s** F706-F711, F718, F720, F722-F724 and the twenty, from the kept
  tests (re-derived on main), and F692 (moderation lines in batches). Waits on nothing; starts with 4a.
- **Chain C, the worker**: **4w** offline shell, precache with digest (F175), previous version kept (F172), Reload
  resends SKIP_WAITING (F679), CSP in the worker (F468); its room cache waits on 4b.

## 8. Files
New: `app/src/lib/adena`, `app/src/lib/irc`, `app/src/features/{login,rooms,chat,composer,dm,notifications}`,
`packages/core/src/markdown` (Alexis). Changed: `packages/schemas`, `app/src/csp.ts`, `app/src/sw/*`, `server/src/*`
(4s), `deploy/*` (4s: F706, F711). Tier 1: `lib/adena`, `lib/irc`, the login feature, `core/markdown` and its
renderer, embeds, `csp.ts`, `sw/*`, `server/src/login`, `deploy/`.

## 9. Dependencies to ask for (npm, read 2026-10-25)
- `@adena-wallet/sdk` in `app` (already approved for `server`, dec:152), or `window.adena` alone: 4a decides.
- `@tanstack/react-virtual` 3.14.22 (2026-10-22, one dependency, no install script): the window of 4b, or our own
  window (taken: no new dependency; `minimumReleaseAge` is one day, so its age was no obstacle).
- `zustand` 5.0.16 (2026-10-22, no dependency), the store ARCHITECTURE.md names: approved, 4a.
- `emojibase-data` 18.0.0 (2026-10-16, no dependency): the emoji picker's data, 4c.

## 10. Answered (docs/decisions.md, 2026-10-25)
No pairing: Claude writes `core/markdown` and F667, F669. The three chains run side by side. `window.adena` alone;
our own history window; the Markdown subset of §3; Docker on Alexis's host; the emoji data asked in 4c; the row kept
whole.
