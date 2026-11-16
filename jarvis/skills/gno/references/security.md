# Security

> **Category: security / audit.** Update when a new bug class is identified or a fix changes the canonical pattern.
> **Authoritative spec**: `docs/resources/gno-security.md` (threat-class taxonomy) and `docs/resources/gno-security-guide.md` (long-form patterns) in the `gnolang/gno` repo. This reference is a load-bearing summary plus auditor-oriented detection signals; the upstream docs are the source of truth.

## Purpose

Catalog of bug classes with concrete code shapes, grep signals, and fix patterns. Loaded by an agent reviewing a Gno realm for safety or guarding against known footguns while authoring one.

## Threat model

A **victim** realm `/r/V` holds state and exposes APIs. An **attacker** is any actor — end user, another realm `/r/A`, or a pure package `/p/A` — that can call into `/r/V`'s exposed surface. The attacker's goal is **write authority laundering**: causing a write to `/r/V`-stamped data while `m.Realm` is `/r/V` and the writing code path is attacker-controlled.

Assumptions:
- Attacker can deploy `/r/A` or `/p/A` and import `/r/V`.
- Attacker can call any exported function or method `/r/V` exposes and hold any pointer it returns.
- Attacker cannot use `reflect`, `unsafe`, goroutines, or any other escape hatch — these do not exist in Gno.
- Attacker cannot read `/r/V`'s unexported fields (Go's package-scoped identifier rule applies).

## How to use this reference

Each class follows the same template:

- **Shape** — minimal code example showing the bug.
- **Why wrong** — one or two lines naming the invariant violated.
- **Detection** — grep / search pattern an auditor agent can run.
- **Fix** — minimal code example showing the correction.
- **Status** — `ACTIVE` (still appears in master), `HISTORIC` (swept out of master but appears in deployed realms or imported code), `OPEN` (known bug not yet fixed).

Cross-link to `interrealm.md` for the spec model these violations build on.

## The five threat classes

Upstream taxonomy from `gno-security.md`. Code comments in the gno repo reference these class numbers (`// SECURITY (Class-4 captured callback)`).

| Class | Name | Mechanism |
|---|---|---|
| **1a** | cur-disclosure / impersonate-self | Hostile interface implementation captures `cur.Address()` / `cur.PkgPath()` from a `cur realm` parameter and later acts AS the realm that handed it the cur. |
| **1b** | cur-disclosure / impersonate-caller | Hostile implementation captures `cur.Previous()` and acts AS that realm's caller. |
| **2** | designation-forgery | Public method takes `(caller address, ...)` or `(pkgPath string, ...)`; any attacker calls it with the victim's identity. Also: non-crossing helpers that accept a secondary `realm` value and skip `rlm.IsCurrent()` before trusting it — a stale or previous realm value's `.Address()` still resolves but no longer refers to the live caller. |
| **3** | impl-substitution | Public function accepts an open interface; attacker supplies an implementation that lies on read (DoS or silent escalation). **Fires even when the interface has no realm-typed methods** — it's a read/behavior-integrity class, not a cur-leak class. |
| **4** | closed-over-authority | A canonical-typed value's constructor (or post-construction setter) takes attacker-controllable callback/data; the value passes an `IsCanonicalX` type check but carries hostile state. When Class 3 and Class 4 both apply, file as Class 4 — the allowlist passed; residual harm is captured-state. |

## Four structural defenses

The VM provides four independent defenses. A realm becomes exploitable when an API design defeats all of them at once.

| # | Defense | One-line summary |
|---|---|---|
| D1 | **Declaration-site rule** (borrow #1) | `/r/`-declared callables run with `m.Realm` borrowed to declaring `/r/`. Attacker code never gets victim authority just by being called by victim. |
| D2 | **Storage-site rule** (borrow #2) | `/p/` or stdlib methods on a real foreign-stamped receiver borrow `m.Realm` to the receiver's storage realm. Generic library helpers mutate caller-owned state only. |
| D3 | **Closure-capability rule** (borrow #3) | A closure carries the authority of its creator-realm forever. Cannot gain authority by changing hands. |
| D4 | **Readonly taint** | Foreign-realm reads are tainted; the taint propagates through copy, conversion, indexing. Mutations panic. No write path bypasses the check. |

## The safety hypothesis (A/B/C)

A victim realm `/r/V` is safe from external state mutation if **all three** of the following hold:

### (A) All logic-data types are `/r/`-declared.

Define `type User struct{...}`, `type Order struct{...}` in your own `/r/V` package, not in a shared `/p/`. Two reasons:

1. `/p/`-attackers cannot reference `/r/V` types in their signatures (`/p/ → /r/` imports are forbidden).
2. Any `/r/`-attacker impl of an interface taking `*v.User` runs with `m.Realm = /r/A` by D1 (borrow #1), so writes hit readonly.

The escape valve is the **encapsulation pattern** (GRC20 reference, below) — `/p/`-declared types with airtight encapsulation.

### (B) No `/p/`-type embedded in `/r/V`-data has higher-order methods with concretely-`/p/`-typed callbacks.

The subtle one. If `/r/V` has

```go
type Wrapper struct {
    Inner *somelib.Node
}
```

then attackers reach `Inner`, and `somelib.Node` may have `Iterate(cb func(*Node) bool)`. Inside `Apply`'s body, `m.Realm` is borrowed to `/r/V` by D2 (the `*Node`'s PkgID is `/r/V`). The body invokes `fn`. If `fn` is a top-level `/p/A.Evil` function with signature `func(*somelib.Node)`, **neither borrow rule fires** — top-level `/p/`-functions have no `/r/` declaring realm and no receiver. `m.Realm` stays at `/r/V` for the entire callback. Writes through the parameter commit under victim authority.

This is the **no-anchor case** — see `interrealm.md` § Three borrow rules.

Real-world `/p/`-types with this shape include `nt/avl/v0/node.Iterate`, `moul/cow/node.Iterate`, `onbloc/json/builder.WriteObject`.

### (C) Victim does not invoke caller-supplied function/interface values while holding its own authority.

The mirror of (B), viewed from `/r/V`'s API:

```go
func ApplyHook(fn func(any)) {
    fn(internalState)   // /r/V's m.Realm; attacker fn can launder
}
```

Closures handed in by an attacker are safe — D3 (borrow #3) borrows `m.Realm` back to the attacker for the body. The gap is narrower than it looks: it applies only to top-level `/p/` `FuncDecl` values, not arbitrary `func()` parameters.

**Defense in depth**: type the callback parameter with one of your own `/r/V`-declared types — `fn func(*v.User)`. `/p/` code can't name `v.User`, and any `/r/A` implementation runs under `/r/A`'s authority by D1.

Empirically verified across the `gnovm/tests/files/zrealm_launder_*.gno` probe corpus (~64 filetests, ~50 of them the `_rdata_` subset), each annotated with its attack mechanism and outcome.

## Bug class details (auditor mode)

### Class 1a/1b — cur-disclosure

**Shape**:

```go
// In /r/V, public crossing function:
func F(cur realm) {
    thirdParty.Hook(cur)   // forwarding cur to untrusted code
}

// thirdParty (attacker), declared as:
type Hooker interface { Hook(cur realm) }
```

**Why wrong**: `cur realm` is a capability token for the immediately-preceding crossing into `/r/V`. Forwarding it to attacker code lets the attacker capture `cur.Address()` (1a) or `cur.Previous()` (1b) and later impersonate `/r/V` or its caller.

**Detection**: interface methods declared with `cur realm` parameters; functions that pass `cur` (not `cross(cur)`) to subsequent cross-realm calls. The interface-with-`cur realm` shape is the primary tell.

**Fix**: never declare an interface method that takes `cur realm`. Take `caller address` instead, and let the crossing call site derive the address from its runtime-current `cur.Previous().Address()`.

**Status**: ACTIVE class (defensive lint). The compiler today rejects most expressions; the lint catches the cases it doesn't.

### Class 2 — designation-forgery

**Shape**:

```go
func DoThing(addr address) {
    log[addr] = ...   // anyone can call with any address
}
```

Or:

```go
func DoThing(_ int, rlm realm) {
    // missing IsCurrent() check
    addr := rlm.Previous().Address()   // cur.Previous() or a stale realm value still resolves
    log[addr] = ...
}
```

**Why wrong**: an `address` or `pkgPath` parameter is attacker-controlled. To identify the actual caller at an entrypoint, use the crossing function's first `cur realm` and derive the address inside. For non-crossing helpers that intentionally accept a secondary `rlm realm`, first prove `rlm.IsCurrent()`; otherwise the caller can pass `cur.Previous()` or another realm value. A stale or previous realm value can still resolve `.Address()` numerically — it just no longer refers to the live caller.

**Detection**: function signatures with `caller address` or `pkgPath string` as identity parameters; non-crossing helper signatures like `_ int, rlm realm` where `rlm` is used for authority without an `rlm.IsCurrent()` guard. Do not flag the first `cur realm` of a crossing function solely for lacking `cur.IsCurrent()`; the runtime guarantees it is current.

When reconciling upstream docs, treat `docs/resources/gno-interrealm-v2.md`'s public-API checklist as a broad prompt to inspect caller-identity use, not as an automatic finding against every crossing entrypoint. For the `_ int, rlm realm` migration shape, apply `gnovm/adr/interrealm_v2.md`: guard the helper's secondary `rlm`, not the crossing function's first `cur`.

**Fix**:

```go
func DoThing(_ int, rlm realm) {
    if !rlm.IsCurrent() { panic("spoofed realm") }
    addr := rlm.Previous().Address()
    log[addr] = ...
}
```

**Status**: ACTIVE. Most common LLM-generated bug shape — pattern-matching from Solidity's `msg.sender` produces wrong answers here.

*Continued in `security-2.md`.*
