# Slice 11, the realm's half: the satellites' slot realm, local only

Backlog row 11, ADR-0002 §8 rows 7 and 11, §9 ("gnoworld's own keys"). Built on Alexis's MacBook the night of 2026-11-03 while slice 7 runs on the Mac Studio (`docs/decisions.md`). Every choice marked D is by Claude, for Alexis's review.

## 1. Done when

Row 11, word for word: "A rent without a valid approval, or with one for other text, another slot or past its expiry, is refused; a takedown refunds the days left; a second satellite on a world is refused; only the multisig rotates or pauses; the mutation check finds every guard and now also flips operators and shifts constants (`>=` and `>`, `==` and `!=`, `&&` and `||`, `+` and `-`, a number by one), every survivor killed or in `GAPS` with its reason; the same approval sent twice at once is accepted once". The plan adds: an approval for another payer, other days, another chain id or realm path, or used once already is refused; a rent past the per-address limit, with the wrong amount or denom, or while paused, is refused; an expired slot is rented again in place; only the owner sets the price, the approver's key and the operator, and withdraws, never the payments of live rentals; only the operator takes down; every rent, takedown and owner action emits its event; `Render` shows no unsanitised byte.

## 2. Out of scope

The app's half (the rent card, the slot on the plate, satellites in space, "Sponsored", "Testnet") and the server's (the approval signing, the name filter and moderation call, reports): later in slice 11 and slice 12. No deploy, no chain write: Alexis's, asked in the conversation. The `gnoworld` namespace is not registered on onyx-1 (`gno_packages @gnoworld` is empty, 2026-11-03; F062), so the deploy path is a question below.

## 3. Threat model

Assets: the payments the realm holds, the slot's text (shown as gnoworld's), the approver's and operator's power. Entry points: every exported function, `Render`'s path.
- **A forged or replayed approval:** ed25519 over `"gnoworld/satellite/v1|" chain id "|" realm path "|" world "|" hex(sha256(text)) "|" payer "|" days "|" expiry height`, every field from a fixed alphabet so no `|` is ambiguous; the realm checks the signature, then that expiry ≥ height and expiry ≤ height + 100 (D6), then that it is unused. Tests: one per field changed, expired, too long-lived, used once, and twice in one block.
- **A weak approver key** (a small-order point verifies forged signatures): refused when the owner sets it, with the blocklist seal uses, moved with seal's statement prefix into a pure package both import (D9). Test: each of the 8 small-order points refused.
- **Payment tricks:** `cur.Previous().IsUserCall()`, then one coin of `ugnot`, exactly price × days (D4); `GetCoin` for the realm's balance, the denom a constant. Tests: a code-realm caller, no coins, two coins, another denom, one ugnot less and more.
- **Draining refunds:** `Withdraw` sends at most the realm's balance minus the payments of rentals not yet closed, so every takedown can refund. Test: withdraw all, then a takedown still refunds.
- **Takeover:** owner, approver key and operator change only by the owner; ownership moves in two steps (the new owner accepts), so a typo cannot lock the realm (D14). Tests: each refused for any other caller.
- **Squatting and storage:** one rental per world, at most 3 live per payer (D5), the used-approval list per world pruned at each rent: storage is bounded by worlds × a few records.
- **Render injection:** the text is valid UTF-8, 1 to 40 code points, no control characters (D7), and goes through `sanitize.InlineText`; `Render` never echoes its path. Tests: markdown, HTML, a newline, bidi characters, a world that does not exist.

## 4. Cost

Each call is O(1) apart from lists bounded by D5 and D6; storage is one string per world and a short list per payer (A1:801-804: strings, not structs). A filetest pins `Rent`'s and `Takedown`'s gas and storage if gno's filetests report them at this toolchain; otherwise that is listed as a gap. The mutation check's new mutants are counted and timed before and after on the same tree: the gno lane stays inside the fast gate's budget (30 s scoped), or the part says by how much it does not and proposes shards, never a raised budget.

## 5. Scale

One slot per world: onyx-1 had 504 worlds (slice 7's plan), so at most a few hundred records. The first limit is the per-world slot itself (one advertiser at a time); the next step is several slots per world, a storage layout change (stop and ask).

## 6. Tests, by level

ADR-0002 §9's realm row: `gno test`, the mutation check, `gno-audit`. Failing first, in this order: the approval's binding (one vector per field), single use, expiry and lifetime, payment and denom, the per-address limit, one per world and reuse after expiry, takedown and its refund (whole days left, D12), pause, owner, operator and two-step ownership, withdraw's bound, events, `Render`. Vectors are signed by a Go tool beside seal's (`gno/tools/satvec`, test keys from fixed seeds, chain id `dev`), never by a key outside the tests.

## 7. Files and branches

Creates `gno/r/satellite/` (module `gno.land/r/gnoworld/satellite`, D1), `gno/p/signing/` (the statement prefix and the weak-key blocklist, D9), `gno/tools/satvec/` and a Go package it shares with `gno/tools/sealvec` (seeded test keys, the prefix, the vectors' decoding helpers). Changes `gno/r/seal/` (imports the shared package; its vectors regenerated, byte for byte what the gate compares) and `gno/tools/sealvec/`, `scripts/mutate.py` and its tests (Alexis, 2026-11-03). Tier 1: every file under `gno/r/` and `gno/p/`; the harness: `scripts/mutate.py`.
- **11a, the mutation check's flips** (`scripts/mutate.py`, its probe and harness tests): first failing tests that plant a surviving flip and a stale `GAPS` line; then the flips on every `.gno` source line, not only guards. Seal's new survivors are killed by seal tests when a vector exists, or listed in `GAPS` with their reason. First, because 11b's tests must face the flips.
- **11b, the realm** (`gno/r/satellite/`, `gno/p/signing/`, `gno/tools/`, seal's imports): from 11a's merge. What seal and sealvec share moves first, in a refactor commit of its own, seal's tests and mutation results unchanged: nothing of seal is copied.
They follow each other, one pane at a time: the account's usage limit is shared with the Mac Studio.

## 8. Dependencies

`gno.land/p/nt/markdown/sanitize/v0` (on onyx-1, read with gnomcp 2026-11-03; imports `chain/markdown`, `html`, `strings` only), allowed by Alexis 2026-11-03. Nothing else: `avl` is seal's already.

## 9. Questions for Alexis (decided for tonight, to confirm)

1. D1, the path: `gno.land/r/gnoworld/satellite`; the namespace to deploy under (`gnoworld` unregistered, or a `nym-` name, ADR-0001 question 13).
2. D3, the price: 1 GNOT a day (1,000,000 ugnot), the prototype's lowest sample.
3. D5, the limit: 3 live satellites per address at once.
4. D6, an approval lives 100 blocks at most (about 6 minutes: onyx-1 made 680 blocks in 2,515 s, 3.7 s each, read with gnomcp's `gno_status` at heights 867,181 and 867,861 on 2026-11-03; mainnet's is about 3.65 s).
5. D12, a takedown refunds the whole days not yet begun, at the price that rental paid.
