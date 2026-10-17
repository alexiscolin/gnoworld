---
paths:
  - "r/**"
  - "p/**"
---

# Realms (gno), tier 1

`.gno` looks like Go and is not: no goroutines, channels, `unsafe`, `net` or `os`; imports
are `gno.land/p/...` or `gno.land/r/...`; the module file is `gnomod.toml`. Load the gno skill
before writing or reviewing a realm, and read gno's
[AI contract review guide](https://github.com/gnolang/gno/blob/master/docs/resources/gno-ai-contract-review.md)
before reviewing one. From gno's AGENTS.md (gnolang/gno at 90cebca0d, 2026-10-15):
- caller identity in a crossing function comes from `cur.Previous()`, with no `cur.IsCurrent()`
  guard on `cur` (always true); `IsCurrent()` belongs on a `rlm` passed as an argument;
- never `unsafe.PreviousRealm()` in a crossing function, nor a `PreviousRealm().PkgPath()`
  check in a non-crossing one;
- a payment through `banker.OriginSend()` is guarded by `cur.Previous().IsUserCall()`, never
  `IsUser()`: a `maketx run` realm can spend the envelope first;
- one balance is `banker.GetCoin(addr, denom)`, never `GetCoins(addr).AmountOf(denom)`, whose
  cost a third party sets; validate the denom first, since `GetCoin` panics on a bad one;
- never return a pointer to a `/p/` value held in realm state whose type has exported
  mutators (`avl.Tree`): return values or read-only views;
- `Render(path)` takes attacker input: `sanitize.InlineText`
  (`gno.land/p/nt/markdown/sanitize/v0`) on anything written into the markdown.

Ours, besides: panic versus error, since an error does not revert; storage per object, and a
change to a realm's storage layout is a migration (stop and ask); a new entry in `GAPS`
(`scripts/mutate.py`) needs its reason.
