---
paths:
  - "gno/r/**"
  - "gno/p/**"
---

# Realms (gno), tier 1

Everything about gno, realms and pure packages alike, goes through gnomcp: what exists on a
chain (`gno_packages`), its source (`gno_read`), its state (`gno_render`, `gno_eval`), and every
write (`gno_call`, `gno_addpkg`, sessions). `scripts/guard.py` refuses `gnokey` by its name (a copy under
another name passes it: phase 3d locks the key stores), a raw call to a chain node (curl, wget, an interpreter's words) and a fetched
realm page; the sandbox's network list does not hold in every session. Load the gno skill and read the chain before writing a `.gno` file: the guard no longer checks it, as it read
text, not calls (D13174). Locally, `gno test`, `gno lint` and `gnodev` stay free.

`.gno` looks like Go and is not: no goroutines, channels, `unsafe`, `net` or `os`; imports
are `gno.land/p/...` or `gno.land/r/...`; the module file is `gnomod.toml`. Load the gno skill
before writing or reviewing a realm, and read gno's
[AI contract review guide](https://github.com/gnolang/gno/blob/master/docs/resources/gno-ai-contract-review.md)
before reviewing one. From gno's AGENTS.md (gnolang/gno at 90cebca0d, 2026-10-15):
- caller identity in a crossing function comes from `cur.Previous()`, with no `cur.IsCurrent()`
  guard on `cur` (always true); `IsCurrent()` belongs on a `rlm` passed as an argument;
- never `unsafe.PreviousRealm()` in a crossing function, nor a `PreviousRealm().PkgPath()`
  check in a non-crossing one;
- a payment through `unsafe.OriginSend()` (`chain/runtime/unsafe` at `chain/onyx`, where
  AGENTS.md's `banker.OriginSend()` does not exist, F5049) is guarded by
  `cur.Previous().IsUserCall()`, never `IsUser()`: a `maketx run` realm can spend the envelope first;
  and by `runtime.AssertOriginCall()` in the paid function's own body, as `OriginSend`'s doc asks,
  so a realm holding that function in a variable never gets its coins (F5056);
- one balance is `banker.GetCoin(addr, denom)`, never `GetCoins(addr).AmountOf(denom)`, whose
  cost a third party sets; validate the denom first, since `GetCoin` panics on a bad one;
- never return a pointer to a `/p/` value held in realm state whose type has exported
  mutators (`avl.Tree`): return values or read-only views;
- `Render(path)` takes attacker input: `sanitize.InlineText`
  (`gno.land/p/nt/markdown/sanitize/v0`) on anything written into the markdown.

Ours, besides: panic versus error, since an error does not revert; storage per object, and a
change to a realm's storage layout is a migration (stop and ask); a new entry in `GAPS`
(`scripts/mutate.py`) needs its reason.
