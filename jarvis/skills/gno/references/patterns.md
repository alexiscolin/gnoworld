# Patterns and idioms

> **Category: conventions / how to write Gno.** Update when a recommended pattern becomes the community standard or is deprecated. Anti-patterns are catalogued in `security.md`; this file is the "do this" companion.
> **Authoritative spec**: `docs/resources/effective-gno.md` in the `gnolang/gno` repo. When this reference and the upstream disagree, the upstream wins — file an update.

## Purpose

Idiomatic shapes that fit Gno's grain. Most idioms here are not stylistic preferences — they are responses to constraints vanilla Go programmers don't face. Knowing the **why** lets an agent generalize patterns to novel situations rather than match them blindly.

## Why these patterns — the chain-context drivers

| Force | Constraint it imposes | Patterns it drives |
|---|---|---|
| **Determinism** | Every node must produce the same result. Diverging on a single byte halts consensus. | avoid `math.MinInt` / `MaxInt` (architecture-dependent); avoid float-format reliance; don't branch on observed `append` capacity growth. (Map iteration is insertion-order deterministic — not a determinism hazard; see Gas metering for why to still prefer trees.) |
| **Gas metering** | Every read, allocation, and store op costs gas the caller pays. | Lazy allocation — don't create state until needed; `avl.Tree`/`bptree` over `map` for growing keyed state (lazy load vs whole-map rewrite); minimize cross-realm reads (readonly taint forces copies); single top-level struct for state (one root pointer instead of many globals); avoid unnecessary AVL traversals. |
| **Storage deposit** | Persisting bytes locks GNOT tokens; deleting refunds them. | Small structs, scalar types where possible, scheduled cleanup of expired data — refund-on-delete enables cleanup-as-revenue. |
| **Refcount persistence** | Realm finalization assigns object IDs and refcounts to every reachable object. | Avoid cyclic references in persisted state; don't delete-and-recreate the same object identity within a tx (refcount accounting); prefer composition with `/p/` types over `/r/` types in state. |
| **Cross-realm authority** | Realm boundaries are security boundaries. | Prefer non-crossing methods; never accept caller-supplied `func()` or `interface{}` in permission-gated paths; explicit `cross(cur)` for every external state mutation. |
| **Verifiability** | Source is on-chain. Humans and agents read it. There is no off-chain doc to drift. | Godoc as user-facing API doc; explicit guards over clever invariants; simple type signatures; one obvious way to do each thing. |
| **Tx atomicity** | A transaction either fully succeeds or fully reverts. | `panic` for unrecoverable conditions; CEI ordering (checks → effects → interactions); `Must*` panic-wrappers are safe. |
| **No host access** | The Gno VM has no `os`, `net`, `time.Now()` (deterministically), `syscall`. | No external API calls; events (`chain.Emit`) for off-chain consumers; off-chain tooling reads events + state, doesn't poll. |

Cross-reference: `interrealm.md` for the spec mechanics behind cross-realm authority and readonly taint; `security.md` for what goes wrong when these drivers are ignored.

## Counter-intuitive idioms (vs vanilla Go)

### Embrace global variables in realms

Globals in `/r/` are not the Go anti-pattern. They ARE the persistence layer. Every `var X = ...` is a root in the persistence graph; new and modified objects under the realm-storage-context are persisted at transaction finalization. Treat globals as fields on a singleton.

```go
package shop

import "gno.land/p/nt/avl/v0"

var (
    inventory = avl.NewTree()
    admin     address
)
```

**Do not export globals.** An exported variable is readable AND writable by anyone with the import. Use lowercase + getter/setter functions to control access.

In `/p/` packages, globals are different — `/p/`-immutability gate freezes them post-init. Use `const` for shared values; `var` is restricted to init-time setup.

### Embrace `panic`

Gno departs from Go's "don't panic" advice. Panic is a **control-flow primitive** here — when something goes wrong (invalid input, failed precondition, unmet payment), panic to abort the transaction cleanly. The chain rolls back state; the user sees the panic message.

```go
if !cur.Previous().IsUserCall() { panic("must be an EOA call") }
if amount <= 0 { panic("amount must be positive") }
```

The state-revert guarantee is `panic`-specific. **Returning an `error` does NOT revert state**; the caller has to choose to revert. For unrecoverable conditions where you want fail-and-revert, panic is the only correct choice.

`error`-return remains right for caller-checkable conditions with a meaningful recovery path: `Get(id)` returning `(Item, error)` when the item may legitimately not exist.

Reusable `/p/` packages should avoid `panic()` except in `Must*` / `Assert*` wrappers (which are explicit about their behavior). The caller picks: error-returning for branching, `Must*` for "succeed or kill the tx."

### `init()` is the constructor

`init()` runs once during deploy (`MsgAddPackage`) and never again. It's the only chance the realm has to:

1. Set up initial state (`admin = cur.Previous().Address()` — but in init the modern form is `unsafe.OriginCaller()`).
2. Register with other realms (`registry.Register(cross(cur), "myID", ...)`).

```go
import "chain/runtime/unsafe"

var admin address

func init() {
    admin = unsafe.OriginCaller()   // the deployer
}
```

After deploy, the deployer is no longer accessible. If you need them, capture during init.

### A little dependency beats a little copying

Vanilla Go: "a little copying is better than a little dependency." Gno inverts this for `/p/` packages, more like the NPM model: small, focused modules; many small dependencies. Reasons:

- Contracts are user-readable; explicit imports give users transparency about what code runs.
- Gno's permission rules mean a published package can never be silently overwritten — `gno.land/p/X` is fixed.
- A reviewed, audited, high-usage `/p/` package is a smaller audit footprint than re-implementation.

Trust assumptions still apply — vet what you import — but the supply-chain attack surface differs from generic open-source. Prefer existing well-used `/p/` libraries.

## Package organization

- **Last path element matches the package name.** `gno.land/p/myorg/dao` should declare `package dao`. The `/vN` version suffix is ignored when matching. Avoid abbreviations unless they're widely known.
- **Realm namespace**: `gno.land/r/NAMESPACE/DAPP` is the primary location, similar to GitHub paths.
- **Internal packages**: a package with `internal` in its path can only be imported by packages sharing the same root.

  ```
  gno.land/p/demo/mypackage
  ├── utils
  └── internal/
      ├── helpers
      └── crypto
  ```

  Here `mypackage/internal/...` is importable only by `mypackage` and `mypackage/utils`. Use this to restrict reach.

### Types and interfaces belong in `/p/`

For any concept you expect other realms or packages to import, define types and interfaces in `/p/`, runtime in `/r/`:

- `/p/myorg/dao` — the `DAO` and `Vote` interfaces; the `Proposal` type
- `/r/myorg/dao` — the actual running DAO instance

This works because `/p/` can only import `/p/`, while `/r/` can import anything. Standards must be expressible in `/p/` so any realm can compose with them.

If you're writing a one-off app, you can do everything in `/r/`. The `/p/` separation matters when a concept is reusable.

## Realm as public API

A `/r/` realm is not a Go program. It's a **public API**. Anything exported can be called by any other realm; assume hostile callers and bound every input.

```go
func PublicMethod(cur realm, nb int) {
    if nb <= 0 || nb > MaxBatch { panic("nb out of range") }
    privateMethod(cur.Previous().Address(), nb)
}

func privateMethod(caller address, nb int) { /* ... */ }
```

Public functions gate (caller checks, payment validation, input bounds) and then delegate to private helpers. Helpers don't repeat gates; they trust their inputs.

## Crossing-function discipline

```go
// Public, called by users via MsgCall. Crossing function — first param is cur realm.
func Buy(cur realm, sku string) {
    if !cur.Previous().IsUserCall() { panic("EOA call only") }
    requirePayment()
    buy(sku)
}

// Internal helper. Non-crossing.
func buy(sku string) { /* ... */ }
```

Conventions:

- **`MsgCall` only dispatches to crossing functions.** Functions meant to be called externally MUST take `cur realm` first.
- **Methods should generally be non-crossing.** Per the spec author: methods are "pre-bound to an object — a quasi-realm." A method that crosses is "intrusive, but sometimes desired."
- **Authority lives in the crossing-function wrapper, not the helper.** Crossing function gates; helpers do work.
- **`/p/` packages can't declare crossing functions** (compiler-enforced).

### `cross(cur)` for explicit cross-calls

When calling a crossing function in another realm, use `cross(cur)` as the first argument:

```go
import "gno.land/r/some/registry"

func Register(cur realm, ...) {
    registry.Register(cross(cur), "myID", myCallback)
}
```

Inside the same realm, you can also call crossing functions non-crossing via `fn(cur, ...)` — no boundary, no finalization, no realm-context change. Use the non-crossing form when you don't want to spend the boundary cost.

## State shape

### `avl.Tree` over `map` for persisted keyed state

```go
// AVL (right for persisted state)
import "gno.land/p/nt/avl/v0"
var users avl.Tree
users.Set("alice", &User{...})
users.Iterate("", "", func(key string, value any) bool {
    user := value.(*User)
    return false   // continue
})

// map (wrong for persisted state)
users := make(map[string]User)
```

**AVL Trees**: O(log n) lookup, **lazy loading** (only the search path loads), **sorted iteration** (a stable, semantically meaningful order you can paginate). Required for any keyed state that grows or that you iterate.

**Maps**: O(1) lookup, type-safe values. Use only for **small bounded** in-memory state (e.g. config values). Never for persisted growth state — a persisted map rewrites wholesale on every mutation (gas/storage), and its insertion-order iteration is an impl detail you shouldn't expose as output ordering. (Iteration is deterministic, so this is a gas/design issue, not a consensus risk.)

`gno.land/p/nt/bptree/v0` (B+tree) is an accepted alternative for ordered keyed state — used by `commondao` (in the examples tree, deployed on neither live testnet) and others. Either is fine; pick one and stay consistent.

### Lazy initialization for heavy state

If a sub-collection is expensive to create and not always needed, allocate on first use:

```go
var members *avl.Tree

func ensureMembers() *avl.Tree {
    if members == nil {
        members = avl.NewTree()
    }
    return members
}
```

Saves both deploy gas and steady-state read costs.

### Single top-level struct for upgradability

Proxy + Implementation patterns serialize cleanly from a single struct; scattered globals make migration harder. If you anticipate an upgrade, wrap state:

```go
type State struct {
    Inventory *avl.Tree
    Admin     address
    Counters  *Counters
}

var state = &State{...}
```

### Compose with `/p/` types, not `/r/` types

Storing a value of an `/r/` type in your realm's state grants that realm's code execution privileges over your storage (via D2 — the storage-site borrow rule). See `security.md` for the (A) safety hypothesis.

```go
// Risky: importing /r/widget and storing one of its types in our state
import "gno.land/r/widget"
var item *widget.Widget   // every widget method now runs with our authority via D2
```

When you must use a `/p/`-declared type, follow the **encapsulation pattern** from `security.md`: lowercase fields, no exported method returning interior pointers, and authority transitions gated at the crossing/helper boundary. The `grc20` package is the canonical example.

## Safe-object pattern

A safe object is designed to be tamper-proof: instantiated by `/r/V`, exported as a value other realms can link to, but with airtight access control:

```go
type MySafeStruct struct {
    counter int
    admin   address
}

func NewSafeStruct(cur realm) *MySafeStruct {
    return &MySafeStruct{
        counter: 0,
        admin:   cur.Previous().Address(),
    }
}

func (s *MySafeStruct) Counter() int { return s.counter }

func (s *MySafeStruct) Inc(cur realm) {
    if cur.Previous().Address() != s.admin { panic("permission denied") }
    s.counter++
}
```

Other realms can register the object but cannot bypass its mutation gates. Note: returning a pointer to internal mutable state is generally a red flag — only do it when the methods on the pointer enforce sufficient guards.

## Payment handling

### Coins vs GRC20 — which to pick

| Need | Use |
|---|---|
| Native chain currency, IBC-ready, strict semantics, off-chain transferable | **Coins** (via `chain/banker`) |
| Programmable balance logic, allowance/approve patterns, contract-owned tokens | **GRC20** (`gno.land/p/demo/tokens/grc20`) |

Coins are simpler and more constrained. GRC20 is the right choice when you need ERC20-style behaviors.

### Payment-guard canonical pattern

```go
import (
    "chain/runtime/unsafe"
)

func Buy(cur realm) {
    if !cur.Previous().IsUserCall() {
        panic("only EOA via MsgCall can fund this")
    }
    if unsafe.OriginSend().AmountOf("ugnot") != price {
        panic("incorrect amount")
    }
    // mutate state
}
```

**Always pair `IsUserCall()` with the `OriginSend()` amount check.** Either alone is unsafe — `OriginSend()` without the EOA guard is lying about receipt (an intermediate realm could have consumed the coins); the EOA guard without the amount check lets users pay nothing.

Why **`IsUserCall()` and not `IsUser()`**: `IsUser()` accepts `IsUserCall()` AND `IsUserRun()`. The ephemeral `MsgRun` realm can consume the origin-send envelope and forward control, bypassing the receipt invariant. See `security.md` § Payment-guard.

*Continued in `patterns-2.md`.*
