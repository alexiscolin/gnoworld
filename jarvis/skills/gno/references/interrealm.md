# Interrealm semantics

> **Category: spec / model.** Update when the interrealm specification changes in master.
> **Authoritative spec**: `gnovm/adr/interrealm_v2.md` and `docs/resources/gno-interrealm-v2.md` in the `gnolang/gno` repo. This reference is a load-bearing summary, not a replacement. When an audit hinges on exact semantics or a subtle invariant, load the spec.
> **Source nuance**: `docs/resources/gno-interrealm-v2.md` phrases the public API checklist broadly ("does it check `cur.IsCurrent()` before using `cur.Previous()`?"). For the specific `_ int, rlm realm` helper pattern, `gnovm/adr/interrealm_v2.md` is more precise: crossing functions do not require `cur.IsCurrent()` on their first `cur realm`, while secondary/helper `rlm realm` values often require `rlm.IsCurrent()`.

## Why this reference exists

Gno extends Go to a multi-user runtime. Realms are independent agents that own state and authority; calling between realms is the central design problem. The interrealm specification is the youngest part of the chain — most LLM training data predates it, and pattern-matching from Solidity or Cosmos produces wrong answers. Read this before generating *any* caller-authentication, access-control, or cross-realm code.

## The two contexts

Every executing frame in Gno carries **two pieces of state**:

| Context | Determines | Changes on… | Surfaced by |
|---|---|---|---|
| **Realm-context** | identity / agency: who is the actor, who called them. Has an associated address that can send / receive coins. | explicit `fn(cross(cur), ...)` cross-calls into crossing functions | `cur` parameter (preferred), `unsafe.CurrentRealm()` / `unsafe.PreviousRealm()` (stack-walking, imported from `chain/runtime/unsafe`) |
| **Realm-storage-context** (`m.Realm` in VM internals) | who has write authority right now; determines which realm pays storage rent and which realm a mutation attributes to | explicit cross-calls AND implicit borrows (§ Borrow rules) | not directly accessible at runtime |

The two diverge whenever a borrow is active. They re-align on the next cross-call.

### Summary table

| Call shape | Realm-ctx | Storage-ctx | Boundary | Finalizes |
|---|---|---|---|---|
| `fn(cross(cur), ...)` into same realm | shifts† | unchanged | yes | yes |
| `fn(cross(cur), ...)` into different realm | shifts | shifts | yes | yes |
| `fn(cur, ...)` non-crossing call (same realm) | unchanged | unchanged | no | no |
| Non-crossing call of `/r/X`-declared callable from `/r/Y` | unchanged | shifts to `/r/X` (borrow #1) | yes | yes |
| Stdlib/`/p/` method on real foreign-stamped receiver | unchanged | shifts to receiver's stamp (borrow #2) | yes | yes |
| Stdlib/`/p/` method on primitive/nil/unstamped receiver | unchanged | unchanged (no-anchor) | no | no |
| Stdlib/`/p/` top-level function | unchanged | unchanged | no | no |

† `unsafe.CurrentRealm()` returns the same realm, but `unsafe.PreviousRealm()` shifts — what was current becomes previous.

## Package types

Three flavors. Every code unit in Gno is a package; the prefix letter is the **kind** (`r` = realm, `p` = pure, `e` = ephemeral).

| Path | Kind | Stateful? | Can declare crossing functions? | Can import `/r/`? |
|---|---|---|---|---|
| `/r/...` | Realm | yes (persistent) | yes | yes |
| `/p/...` | Pure | post-init frozen | **no** | **no** (only `/p/` imports) |
| `/e/...` | Ephemeral | yes (per-tx, discarded) | n/a (created by `MsgRun`) | yes |

Hard constraints:

- A `/p/` package's behavior must be identical regardless of which realm calls it. If a `/p/` package smuggles state-dependent behavior it's a bug.
- A `/p/` package **cannot** import a `/r/` or `/e/` package. Structural; the linker enforces it.
- **`/p/`-immutability**: after deployment, mutations to real `/p/`-stamped objects from outside their own init panic with `cannot mutate <pkgpath>: package is immutable post-init`. This is the gate that prevents `/p/`-attacker-via-interface (see `security.md` § Safety hypothesis (B)).
- An `/e/` package is what `MsgRun` runs in. Path is `gno.land/e/g1<user>/run`, created on-the-fly and discarded after the transaction; the ephemeral realm's address derives from the user's, so coins sent to it flow back.

## Crossing functions

A **crossing function** declares `cur realm` as its first parameter. Realm-context changes occur only through explicit `cross(cur)` calls into crossing functions.

```go
// Declaration: only valid in /r/ packages.
func MakeBread(cur realm, ingredients ...string) *Bread { ... }
```

Two valid call forms:

```go
// (1) Cross-call — shifts realm-context and storage-context to the
// callee's declaring realm. Returns via a realm boundary, finalizing.
loaf := bakery.MakeBread(cross(cur), "flour", "water")

// (2) Non-crossing call — same realm only. No realm-context or
// storage-context change, no boundary, no finalization.
loaf := bakery.MakeBread(cur, "flour", "water")
```

A non-crossing call from `/r/B` of a crossing function declared in `/r/A` is rejected — at preprocess if statically detectable, otherwise at runtime. The bare `cross` keyword that existed during the 0.9 migration is gone; the canonical form is `cross(rlm)` universally.

## The `cur` capability token

Inside a crossing function body, the `cur realm` parameter is a **typed capability handle** on the realm-context at the moment of the call. The runtime mints one per crossing frame, refuses to persist it, and validates each use.

`realm` is the uverse interface with these methods:

| Method | Returns |
|---|---|
| `Address() address` | bech32 address derived from the realm's pkgpath |
| `PkgPath() string` | pkgpath, or `""` at chain root (EOA) |
| `Previous() realm` | the captured realm that was current before this crossing |
| `IsCurrent() bool` | **true only when this realm value matches the topmost live crossing frame's identity**. The first `cur realm` of a crossing function is current by runtime construction, and stays current when forwarded through non-crossing calls -- that is what admits legitimate callers through a helper's `rlm.IsCurrent()` guard. Stale, stored, or `Previous()` realm values return `false` |
| `IsCode() / IsUser() / IsUserCall() / IsUserRun() / IsEphemeral()` | classification by address and pkgpath |
| `String() string` | debug representation |

**`IsCurrent()` is the guard for secondary realm parameters.** The resources guide describes `IsCurrent()` as the authentication primitive for public APIs that derive caller identity from `cur`; read that as broad checklist guidance, then apply the ADR distinction at the exact call shape. The official ADR notes that `rlm.IsCurrent()` is often required when a non-crossing helper accepts `_ int, rlm realm`; otherwise the caller can pass `cur.Previous()` or another realm value and change the meaning. Crossing functions do **not** require `cur.IsCurrent()` for their first `cur realm` because the runtime ensures that value is current. Without the check on secondary/helper realm parameters, a stale or attacker-supplied realm value's `Address()` and `PkgPath()` still resolve numerically — they just no longer refer to the live caller. This is the **designation-forgery** class (see `security.md`).

### Realm values are ephemeral

Captured realm values must not survive past the transaction. Storing a `realm`-typed value in a top-level var, struct field, map value, slice element, or closure capture panics:

```
cannot persist realm value: realm values are ephemeral and tied to a call frame
```

`realm`-typed *parameter* and *return type* declarations are fine — the rule applies to **values**, not **types**. To remember a caller across transactions, capture `cur.Address()` or `cur.PkgPath()` (plain strings).

### Parity with `unsafe.{Current,Previous}Realm()`

At every comparable position:

- `cur.Address()` ≡ `unsafe.CurrentRealm().Address()`
- `cur.PkgPath()` ≡ `unsafe.CurrentRealm().PkgPath()`
- `cur.Previous().Address()` ≡ `unsafe.PreviousRealm().Address()`
- `cur.Previous().PkgPath()` ≡ `unsafe.PreviousRealm().PkgPath()`

The two APIs differ only in shape: `unsafe.*` returns a struct (`runtime.Realm`), `cur realm` is the interface. They are **distinct types** — not assignable to each other — but surface the same identity. `unsafe.PreviousRealm()` is imported from `chain/runtime/unsafe`; the rename signals the danger when using the stack-walking form outside a crossing-function frame.

## The three borrow rules

On every function or method call, the VM applies at most one implicit borrow rule. These determine the storage-context (`m.Realm`) for the call's body.

### Borrow rule #1 — Declaring-realm borrow (`/r/`-declared callables)

Any function, method, or closure **declared in** a realm package `/r/X` runs its body with `m.Realm = /r/X`. Symmetric and unforgeable: calling attacker-declared code from victim's frame runs that code under attacker's authority. Direct field writes to victim-owned state inside the attacker's body fail the readonly check.

### Borrow rule #2 — Storage-realm borrow (stdlib / `/p/` methods)

A non-`/r/`-declared method (stdlib or `/p/`) called on a **defined receiver whose `PkgID` differs from `m.Realm.ID`** shifts `m.Realm` to the receiver's allocating realm for the call duration. This lets generic library helpers mutate caller-owned state — `bptree.Set(...)`, `*grc20.fnTeller` methods.

**Does NOT fire when** the receiver has no object identity:
- Primitive-underlying defined types (`type Mutator int`)
- Nil-pointer receivers
- Nil-valued slice/map/func defined types

This is the **no-anchor case**: `m.Realm` inherits the caller's value. If the caller was already borrowed to a victim, the no-anchor body runs under victim authority. This is the open laundering vector — see `security.md` § Safety hypothesis (B).

### Borrow rule #3 — Closure-capability borrow (`/p/`-declared closures)

A closure created by code in `/p/` (or in any package with no realm of its own) remembers the realm that was current at closure-construction time. When invoked later — regardless of who calls it or where it was stored — `m.Realm` is set to that creator-realm.

**"Closure = capability"**: a closure carries its creator's authority and nothing can give it more. Attacker `/r/M` cannot build a closure that writes `/r/V`'s data, even if `/r/V` accepts and runs it.

If the closure's source file lives in `/r/X`, rule #1 has already borrowed to `/r/X` and rule #3 is a no-op.

*Continued in `interrealm-2.md`.*
