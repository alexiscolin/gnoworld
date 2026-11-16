*Continues `security.md`.*
### Class 3 — impl-substitution

**Shape**:

```go
type Voter interface { Cast(p ProposalID) bool }

func Vote(cur realm, v Voter, p ProposalID) {
    requirePermission()
    if v.Cast(p) {          // external call into UNKNOWN realm
        markVoted(p)         // state mutation AFTER external call
    }
}
```

**Why wrong**: `v` is caller-supplied. The implementation can lie on read (DoS or silent escalation), or invoke other `/r/V` methods to interleave state changes. Classic re-entrancy variant; Gno has no implicit `nonReentrant` guard.

**Detection**: public functions accepting an open interface (not gated by canonical-type check); functions that call an interface method AND mutate state on the same path without a generation counter or in-flight flag; embedded-marker "seal" patterns (which are bypassable — see Sealing below).

**Fix**: at every public entry point that accepts an interface from external callers, gate with a canonical-type assert:

```go
if _, ok := t.(*ConcreteImpl); !ok {
    panic("not a canonical impl")
}
```

Or use the package-provided predicate (`grc20.IsCanonicalTeller(t)`). Then apply checks-effects-interactions or an in-flight flag.

**Status**: ACTIVE. Common shape: a DAO/permission framework that lets governance code accept a caller-supplied `Permissions`/`Voter`/`Executor` interface and performs state writes after invoking one of its methods.

### Class 4 — closed-over-authority

**Shape**:

```go
type ExecFunc func(realm) error

func WithExecutor(cb ExecFunc) Option {
    return func(d *Definition) { d.executeCb = cb }
}

// Later, during proposal execution:
func (d *Definition) Execute(cur realm) error {
    return d.executeCb(cur)   // runs caller-supplied code with DAO authority
}
```

**Why wrong**: `cb` is captured from the caller's realm at config time. When invoked later under DAO authority, the function body executes with the storing realm's privileges. PR #4890 hardened the readonly-taint side; the caller-trust requirement remains by design.

**Detection**: function signatures containing `func(...)` or function-typed parameters; realm-stored function values (`var cb func(...)`); `SetXxx(cur realm, fn func(...))` style setters. **Also flag latent cases** — a function-valued state variable that's writable but currently never invoked. Today it's harmless; one future commit wiring it into a gated path turns it into an active Class 4 hazard. Mark YELLOW with a "wire-and-document-or-delete" recommendation.

**Fix**: prefer typed interfaces with known implementations over `func()` parameters. Where callbacks are unavoidable, document the trust assumption loudly. The constructor itself is the trust boundary — *the caller IS the authority for the lifetime of the constructed value*.

**Status**: ACTIVE. Typical shapes: `WithExecutor`-style option constructors.

## Payment-guard canonical pattern

The single most common security-relevant operation in `/r/` code:

```go
func Buy(cur realm) {
    if !cur.Previous().IsUserCall() {
        panic("only EOA via MsgCall can fund this")
    }
    coins := unsafe.OriginSend()
    if coins.AmountOf("ugnot") != price {
        panic("incorrect amount")
    }
    // mutate state
}
```

Three predicates that look interchangeable but aren't:

| Predicate | EOA via `MsgCall` | EOA via `MsgRun` (ephemeral) | Realm via `MsgCall` |
|---|---|---|---|
| `IsUserCall()` | ✓ | ✗ | ✗ |
| `IsUserRun()` | ✗ | ✓ | ✗ |
| `IsUser()` | ✓ | ✓ | ✗ |

`IsUser()` accepts both EOAs and the user's ephemeral `gno.land/e/g1<user>/run` realm created by `MsgRun`. The ephemeral can consume the `OriginSend` envelope **before** forwarding control, bypassing the receipt invariant. Use `IsUserCall()` for payment-gated paths.

**Detection**: file contains `unsafe.OriginSend(` AND `IsUser(` (no `Call` suffix). Both in the same function = high severity. `OriginSend` purely read-for-display = low severity.

**Status**: HISTORIC. No genuine example realm guards an `OriginSend` payment with `IsUser()` in the same function on current master; the only files referencing both predicates are deliberate test fixtures under `r/tests/vm/`, and there each predicate sits in a separate helper. The dangerous pattern still appears in older deployed realms and external code, so the auditor agent should expect to find it in user-supplied input.

## The encapsulation pattern (GRC20 reference)

`gno.land/p/demo/tokens/grc20` is the canonical example of *safe* `/p/`-declared data. It violates (A) — `Token`, `PrivateLedger`, and `fnTeller` are all `/p/`-declared — but compensates with airtight encapsulation:

| Defense | How |
|---|---|
| All sensitive fields are unexported | `Token.ledger`, `PrivateLedger.balances`, `PrivateLedger.allowances`, `fnTeller.accountFn` all lowercase. Foreign packages cannot access them. |
| No exported method leaks an interior pointer | No `Token` method returns `*PrivateLedger`, `*avl.Tree`, or `*avl.Node`. |
| Authority transitions gated at the right boundary | Crossing entrypoints use their runtime-current first `cur`; non-crossing helper methods that accept `_ int, rlm realm` check `rlm.IsCurrent()` before resolving realm identity. |
| Forgery defended by nominal type assertion | `IsCanonicalTeller(t)` checks `_, ok := t.(*fnTeller)`. Embedding wrappers fail this. |
| `*PrivateLedger`'s unauthenticated mutators isolated by package privacy | `Mint`/`Burn`/etc. have no `cur` check. They're safe only because no realm exports the `*PrivateLedger` pointer. |
| Frame-relative tellers confined to their home realm | The `CallerTeller()` write path checks that the invoking realm is the token's own, sub-realms included, so a teller a realm builds and then exports is inert anywhere else. **pearl only.** |

**`CallerTeller()` differs by chain** — `(*PrivateLedger)` on pearl, `(*Token)` on sapphire; it is
the sole difference in grc20's 26-function exported surface. The receiver matters to the argument
above: on pearl only the creating realm holds the ledger, so a foreign realm cannot mint a
frame-relative teller at all, and the home-realm check makes a leaked one useless. On sapphire any
holder of the published `*Token` can construct one, and construction privacy is the only barrier —
which is why code that passes tellers between realms may pass review on sapphire and break on pearl.
`networks.md` carries the full cross-chain drift surface.

Realm authors using GRC20 must:

1. Store `*PrivateLedger` in a **lowercase** package-level variable.
2. Expose only authenticated entry points (`Transfer(cur realm, to address, amount int64)` calling `userTeller.Transfer(...)`), taking the caller teller off whichever receiver the target chain declares it on.
3. If accepting a `Teller` from external callers, gate with `IsCanonicalTeller(t)` before dispatching its methods.
4. **Never import `gno.land/r/tests/vm/test20`** — its `PrivateLedger` is deliberately exported for tests; using it in production = instant compromise.

## Anti-patterns (footguns)

### Exposing a pointer to mutable state

```go
var users []*User
func Users() []*User { return users }   // attacker gets aliased slice
```

The readonly taint protects you from direct field writes, but if `*User` has any method whose body writes the receiver, calling that method on the returned pointer succeeds — D2 borrows `m.Realm` back to `/r/V` and the write commits.

**Rule**: getters return values (copies), unexported method results, or read-only views. Never a pointer to internal mutable state.

### Embedding a `/p/`-type with concrete-callback higher-order methods

The (B)-class vector. When embedding/fielding a `/p/`-type, audit its method set. If it has any `func(...) func(*PType)`-shaped method, treat embedding as **publishing a mutator API** to the world.

**Rule**: either don't embed, or keep the field unexported AND don't return aliased pointers to it.

### Accepting an attacker callback under your own authority

The (C)-class vector. Even `func()` is dangerous — the callback body can call back into your own state-mutating methods.

**Rule**: never invoke a caller-supplied function/interface value while holding your own `m.Realm`. Either:
- Type the callback parameter with one of your own `/r/V`-declared types so attackers can't supply a matching `/p/`-callback, OR
- Don't invoke caller callbacks at all; design synchronous APIs.

### Sealing is not a security boundary

Unexported marker methods on an interface (`isCanonical()` etc.) are **bypassable via embedding** in Gno. See `examples/quarantined/gno.land/p/test/seal/filetests/z_seal_*_filetest.gno` for the four working bypass tests.

**Rule**: sealing is documentation, not defense. For real allowlists, use a concrete-type switch (`switch v.(type) { case *MyImpl: ... }`) at the boundary function.

### Stored `realm`-typed values

Storing a `realm` value (whether `cur` or `cur.Previous()`) panics at attachment time or transaction finalize: `cannot persist realm value: realm values are ephemeral and tied to a call frame`.

**Rule**: if you need to remember a caller across transactions, store `cur.Previous().Address()` or `cur.Previous().PkgPath()` (plain strings), not the realm value.

## Properties that strengthen the boundary

### Cross-realm panic aborts the transaction

A panic raised inside a realm-borrowed frame **cannot be caught by `recover()` in any other realm**. The transaction aborts entirely. A write that would have panicked at the readonly check takes the whole transaction with it — no half-mutated state, no recover-and-retry under a different guise. (The test-only `revive(fn)` builtin is the documented exception.)

### Readonly taint propagates through value copy

Reading a foreign struct value into a local variable preserves the readonly bit. Writing the local copy still panics. Go-semantics-divergent but closes a class of subtle attacks where attacker might "extract" victim data into their own context.

### Bound method values carry the receiver's PkgID

`mv := victim.Apply` is a function value that remembers its receiver. When invoked later — even stored in attacker state — D2 (borrow #2) fires based on the receiver's PkgID. Method *expressions* (unbound: `(*T).Apply`) do not carry the receiver stamp.

**Implication**: returning a bound method value of a `/p/`-type pointing into your state is equivalent to publishing the method to any holder. Don't return bound method values of `/p/`-types unless the method body is safe under attacker invocation.

### Conversion-time panic is not Gno-recoverable

`doOpConvert` Case 1 (foreign-readonly source conversion refused) uses raw Go `panic(...)`, **not** catchable by Gno `defer { recover() }`. The write-time readonly check is catchable. This is an implementation inconsistency, not a bug.

*Continued in `security-3.md`.*
