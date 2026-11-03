# Slice 11, the realm's half: the satellites' slot realm, local only

Backlog row 11, ADR-0002 §8 rows 7 and 11 and §9 ("The slot realm's roles"), all three amended 2026-11-03. Built on Alexis's MacBook the night of 2026-11-03 while slice 7 runs on the Mac Studio (`docs/decisions.md`). That night Alexis chose a simple realm with no server and no multisig ("un truc simple mais sécure"): anyone rents by paying, the owner or its operator takes a satellite down after a report, and the app shows one only once the chat's moderation passed it. Every choice marked D is by Claude, for Alexis's review, unless the row says Alexis.

## 1. Done when

Row 11's acceptance, word for word (amended 2026-11-03): "A rent while paused, with the wrong amount or denom, past the per-address limit, or on a world already rented is refused; two rents of one world in one block give one rental; a takedown refunds the days left; only the owner or the operator takes down, only the owner pauses, sets the price or withdraws, never the payments of live rentals; the mutation check finds every guard and now also flips operators and shifts constants (`>=` and `>`, `==` and `!=`, `&&` and `||`, `+` and `-`, a number by one), every survivor killed or in `GAPS` with its reason; the app shows no satellite its moderation has not passed" (the last clause is the app's half). The plan adds: a rent is refused by a code realm, for other days than 1, 3 or 7, for a text outside D7 or a slug outside D2; an ended rental is closed and its slot rented again, its record gone; the takedown refunds the whole days not yet begun (D12); ownership moves in two steps (D14); every rent, close, takedown and owner action emits its event; `Render` shows no unsanitised byte and pages its list.

## 2. Out of scope

The app's half (the rent card, the slot on the plate, satellites in space, "Sponsored", "Testnet", and showing a satellite only once the chat's moderation passed it) and reports (slice 12). No deploy, no chain write: Alexis's, asked in the conversation. The `gnoworld` namespace is not registered on onyx-1 (`gno_packages @gnoworld` is empty, 2026-11-03; F062), so the deploy path is a question below. ADR-0002 §8 row 7, §9 and backlog row 11 were amended to the simple realm the same night (Alexis: "corrige tout sans rien laisser").

## 3. Threat model

Assets: the payments the realm holds, the slot's text (shown as gnoworld's), the owner's and operator's power. Entry points: every exported function, `Render`'s path.
- **A harmful text:** nothing checks it before it shows, by Alexis's choice. Mitigations: the takedown by the owner or the operator, with its event naming the report; the app's moderation before it shows one (later); `Pause`. Tests: a takedown by each, refused by anyone else.
- **Payment tricks:** `cur.Previous().IsUserCall()`, then one coin of `ugnot`, exactly price × days (D4), then `runtime.AssertOriginCall()`, so a realm holding `Rent` in a variable never gets the coins of a rent (F5056); `GetCoin` for the realm's balance, the denom a constant. Tests: a code-realm caller, no coins, two coins, another denom, one ugnot less and more.
- **Draining refunds:** `Withdraw` sends at most the realm's balance minus the payments of rentals not yet closed, so every takedown can refund. Test: withdraw all, then a takedown still refunds.
- **Takeover:** price, operator, pause and withdraw by the owner only; ownership moves in two steps (D14); the operator may only take down, and its refunds go to the payers. Tests: each refused for any other caller, and for the operator.
- **Squatting and storage:** one rental per world, at most 3 live per payer (D5); a slug nobody checks leaves no record once its rental is closed (D2), so storage holds paid, live rentals only. Tests: a fourth rental refused, a closed world's record gone.
- **Render injection:** the text is valid UTF-8, 1 to 40 code points, no control character (D7), and goes through `sanitize.InlineText` once; `Render` never echoes its path. Tests: markdown, HTML, a newline, bidi characters, a world that does not exist.

## 4. Cost

Each call is O(1) apart from the payer's list, bounded by D5; storage is one string per live rental and a short list per payer (A1:801-804: strings, not structs). A filetest pins `Rent`'s and `Takedown`'s gas and storage (`Gas:` and `Storage:` directives exist at this toolchain, `gnovm/pkg/test/filetest.go:526-527`). `Render`'s list of live satellites is paged. The mutation check's new mutants are counted and timed before and after on the same tree: the gno lane stays inside the fast gate's budget (30 s scoped), or the part says by how much it does not and proposes shards, never a raised budget.

## 5. Scale

One slot per world: onyx-1 had 504 worlds (slice 7's plan). The first limit is the per-world slot itself (one advertiser at a time); the next step is several slots per world, a storage layout change (stop and ask).

## 6. Tests, by level

ADR-0002 §9's realm row: `gno test`, filetests, the mutation check, `gno-audit`. Failing first, in this order: payment and denom, days, text and slug, pause, the per-address limit, one per world, two rents in one block, close and reuse after expiry, takedown by each role and its refund (D12), owner, operator and two-step ownership, withdraw's bound, events, `Render` and its pages.

## 7. Files and branches

Creates `gno/r/satellite/` (module `gno.land/r/gnoworld/satellite`, D1). Changes `scripts/mutate.py` and its tests (Alexis, 2026-11-03). Tier 1: every file under `gno/r/`; the harness: `scripts/mutate.py`.
- **11a, the mutation check's flips** (`scripts/mutate.py`, its probe and harness tests, seal's tests for its new survivors).
- **11c, the realm** (`gno/r/satellite/` alone, its `GAPS` lines after 11a's merge): beside 11a, writing only new files; it merges 11a's work once the chief has merged it, then faces the flips. 11b, cut for the approval's signing and vectors, is not merged.
They run side by side in two herdr panes (Alexis, 2026-11-03); two agents at most at once, as the account's usage limit is shared with the Mac Studio.

## 8. Dependencies

`gno.land/p/nt/markdown/sanitize/v0` (on onyx-1, read with gnomcp 2026-11-03; imports `chain/markdown`, `html`, `strings` only), allowed by Alexis 2026-11-03. Nothing else: `avl` is seal's already.

## 9. Questions for Alexis (decided for tonight, to confirm)

1. D1, the path: `gno.land/r/gnoworld/satellite`; the namespace to deploy under (`gnoworld` unregistered, or a `nym-` name, ADR-0001 question 13).
2. D3, the price: 1 GNOT a day (1,000,000 ugnot), the prototype's lowest sample.
3. D5, the limit: 3 live satellites per address at once.
4. D12, a takedown refunds the whole days not yet begun, at the price that rental paid.
5. The realm holds the payments until they are earned, to refund takedowns, while ADR-0001 says "gnoworld never holds user funds" (A1:584): keep, or refund nothing?
