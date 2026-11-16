*Continues `interrealm.md`.*
## Storage = Authority (PkgID stamped at allocation)

Every object's `ObjectID.PkgID` is set to the active **realm-storage-context at allocation time**. The realm that holds authority over an object is the same realm that allocated it — there is no separate "owner" or "linked-from" concept.

Two practical consequences:

1. **Borrow rules fire on unreal receivers too**: an unreal value just returned from a foreign realm's constructor already carries its allocating realm's PkgID, so borrow rule #2 follows immediately.
2. **Construction-time check**: composite literals, `new()`, and `make()` of a foreign `/r/`-declared type panic when invoked outside the declaring realm:

   ```
   cannot allocate gno.land/r/v.UserT in realm gno.land/r/a
   ```

   Authority cannot be forged by constructing impostor instances. Construction must go through a constructor declared in the type's home realm.

## Readonly taint

Values read across a realm-storage boundary are tainted read-only. Mutation attempts panic with `cannot directly modify readonly tainted object`. The taint is **sticky**: it propagates through field access, indexing, slicing, copies, interface boxing/unboxing, and conversion.

| Tainted | Not tainted |
|---|---|
| `externalrealm.Foo` direct read | Values returned by a foreign function/method (fresh, no underlying object) |
| `externalobject.FieldA[0]` (entire reference chain) | Primitive values copied out (an int extracted from a foreign struct is just an int) |
| Local copy of a foreign value (`b := foreign.Slice[0]`) | |

Write paths that route through the readonly check: `=`, `+=` family, `++`, `--`, `*p = v`, `s[i] = v`, `m[k] = v`, `append`, `copy`, `delete`, range-loop bindings used for writes. No write path bypasses the check.

## Conversion guards

Two cross-realm invariants enforced at `doOpConvert`:

1. **Refuse foreign-readonly source.** Converting a tainted value to a type the current realm doesn't declare panics with `illegal conversion of readonly or externally stored value`. Without this, an attacker could declare a parallel `/p/`-type with the same struct layout plus a mutator method, convert the victim's pointer to the parallel type, and invoke the mutator under victim authority via borrow rule #2.

2. **Refuse conversion to foreign `/r/`-declared type.** A realm cannot forge values of `/r/`-declared types it doesn't declare. Combined with the construction-time check, this ensures every real instance of a `/r/`-declared type traces back to its home realm's allocator.

**Implementation note**: case 1 uses a raw Go `panic(...)` rather than `m.Panic(...)`, which means it is **not catchable** by Gno `defer { recover() }`. This is asymmetric with the write-time readonly panic (catchable). Realm code cannot recover from conversion panics.

## Realm boundaries and finalization

A **realm boundary** is a transition where `m.Realm` (or `unsafe.CurrentRealm()`) changes:

- Every `fn(cross(cur), ...)` is a boundary, even into the same realm.
- Every borrow rule firing that changes storage-context is a boundary.
- Non-crossing calls within the same storage-context are not boundaries.

Boundaries control two things:

1. **Realm-transaction finalization** runs at boundary exit: newly-reachable unreal objects are persisted under their PkgID, zero-refcount objects are GC'd, Merkle hashes recompute.
2. **Cross-realm panic abort**: panics that cross a boundary on their unwind path abort the transaction. A `defer { recover() }` in the boundary-crossing caller does **not** catch a cross-boundary panic — only explicit `revive()` frames can. `revive(fn)` is currently test-only; future releases will give it transactional memory semantics.

## `PreviousRealm()` — stack-walker

`unsafe.PreviousRealm()` (from `chain/runtime/unsafe`) returns the realm prior to the most recent **realm boundary**. A non-crossing function call does NOT create a boundary — so `PreviousRealm()` inside a non-crossing function returns whatever the caller's `PreviousRealm()` was, not the immediate caller.

```go
import "chain/runtime/unsafe"

func F(args ...) {                                // non-crossing — no cur realm param
    if unsafe.PreviousRealm().PkgPath() != "gno.land/r/trusted/admin" {
        panic("admin only")
    }
}
```

This is **insecure**. If a non-crossing function in some other realm calls `F(...)`, `PreviousRealm()` is whatever was previous *before that other call* — possibly the admin realm two frames back. Prefer caller-identity checks inside **crossing functions** (`func F(cur realm, ...)`) using the runtime-current `cur.Previous()`. If identity must flow into a non-crossing helper, use the `_ int, rlm realm` secondary-parameter pattern and check `rlm.IsCurrent()` before trusting `rlm.Address()`, `rlm.PkgPath()`, or `rlm.Previous()`.

The `unsafe` in the import path is intentional: this is the unconditional stack-walking primitive. Modern code uses `cur`.

## `CurrentRealm()` and stage

`unsafe.CurrentRealm()` returns the active realm-context; its value depends on which **stage** the VM is in:

| Stage | Triggered by | `CurrentRealm()` | `PreviousRealm()` |
|---|---|---|---|
| `StageAdd` | `MsgAddPackage` (deploy) | the package being deployed (incl. `/p/` — "mutating for a moment") | the deploying user |
| `StageRun` via `MsgCall` | a user calling a crossing function | the called realm | the user with `PkgPath: ""` |
| `StageRun` via `MsgRun` | a user running an ephemeral realm | `gno.land/e/g1<user>/run` | the user with `PkgPath: ""` |

**Therefore**: code in an `init()` block sees deploy-time context, not call-time context. Code that runs under both `MsgCall` and `MsgRun` must distinguish via `IsUserCall()` vs `IsUserRun()`.

## Caller-identity predicates

`realm` exposes three predicates that look interchangeable but aren't:

| Predicate | EOA via `MsgCall` | EOA via `MsgRun` (ephemeral realm) | Realm via `MsgCall` |
|---|---|---|---|
| `IsUserCall()` | ✓ | ✗ | ✗ |
| `IsUserRun()` | ✗ | ✓ | ✗ |
| `IsUser()` | ✓ | ✓ | ✗ |

The `MsgRun` ephemeral realm can consume `unsafe.OriginSend()` and forward control — so `IsUser()` is the wrong guard for payment-gated paths. Use `IsUserCall()` (or `cur.Previous().IsUserCall()` in modern style). See `security.md` § payment-guard.

## Method values

A bound method value `mv := recv.M` is a function value that remembers its receiver. When invoked later, the VM applies borrow rules at **invocation time** based on `M`'s declaring package and `recv`'s PkgID — **not** at binding time.

Two consequences:

1. **Storing a bound method value isn't a safety boundary.** A `/p/`-method bound to a victim-stamped receiver, stored anywhere, still borrows to victim when invoked. Returning such a method value is equivalent to publishing the underlying method to any holder — a setter closure under another name.
2. **Method expressions are different.** `me := (*T).M` is an *unbound* method value with the receiver as an explicit first argument. The unbound form does not anchor on the receiver the same way bound calls do.

## Message types — entry points

### `MsgCall`

Invokes a single exported crossing function on a target realm. **Rejects** non-crossing functions and `/p/` functions — only crossing functions of `/r/` packages can be invoked directly. This prevents accidental non-crossing calls that would inherit the caller's realm-context.

Inside the called function: `unsafe.PreviousRealm()` is the origin user (pkgpath `""`); `unsafe.CurrentRealm()` is the called realm.

### `MsgRun`

Deploys an ephemeral `/e/g1<user>/run` package and invokes its `main()`. Inside `main`, the user is both the previous-realm (at the chain root) and shares the address with the ephemeral realm. The ephemeral can `realmA.PublicCrossing(cross)` to enter `realmA` properly.

The address derivation makes coins sent to the ephemeral flow back to the user. The ephemeral can also consume `unsafe.OriginSend()` and forward control — which is why `IsUser()` (broad) is unsafe for payment guards.

### `MsgAddPackage`

A new realm's `init()` and global-var declarations run with `PreviousRealm()` = the deployer (only available during init — save its `Address()` as a string if you need it later) and `CurrentRealm()` = the new realm.

## Public API checklist (for `/r/` realms)

For every exported function or method:

- Is this a crossing function's first `cur realm`? The runtime guarantees it is current.
- Is this a helper/secondary `rlm realm` parameter? Check `rlm.IsCurrent()` before using `rlm.Previous()`, `rlm.Address()`, or `rlm.PkgPath()` for authority.
- Does it return a pointer that aliases internal mutable state? If yes, expect attackers to invoke any method on the returned pointer type that borrow rule #2 routes back to you.
- Does it accept an interface or function-value parameter? If yes, gate with a canonical-type check (`t.(*MyConcrete)` or an `IsCanonicalX` predicate). Embedding-based seal patterns are bypassable.
- Does it accept a `func(*MyPType)` callback for any `/p/`-declared `MyPType`? Retype to use one of your own `/r/`-declared types as the parameter — otherwise `/p/`-attackers can launder authority through the no-anchor case.

See `security.md` for worked examples.

## Cross-references

- `security.md` — bug classes built on each of the above primitives (designation-forgery, callback substitution, attached-method privilege, payment-bypass, slice taint, the no-anchor laundering vector)
- `patterns.md` — idioms that work *with* the model (crossing-function discipline, state shape, `/p/` vs `/r/`)
- `stdlib.md` — `chain/runtime`, `chain/runtime/unsafe`, `chain/banker`, `chain` API surface
- `render.md` — `Render(path string) string` is **not** a crossing function (no `cur realm` parameter)

## Source

- `docs/resources/gno-interrealm-v2.md` in the gnolang/gno repo — canonical spec.
- `gnovm/adr/interrealm_v2.md` — comparison and migration guide from v1.
