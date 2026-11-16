*Continues `security-2.md`.*
### Storage-construction-time check

Allocating a foreign `/r/`-declared type with a composite literal, `new()`, or `make()` panics: `cannot allocate <type> in realm <m.Realm>`. Attackers cannot fabricate impostor instances. Construction must go through constructors declared in the type's home realm.

## Audit signals (Phase-1 triage)

Quick-reference grep checklist. Run these from the realm root.

| Pattern | Signal | Class |
|---|---|---|
| `IsUser()` co-occurring with `OriginSend` | RED | payment-bypass via MsgRun |
| Helper/secondary `rlm.Previous()` / `rlm.Address()` without prior `rlm.IsCurrent()` check | RED | Class 2 — designation-forgery |
| Public method takes `caller address` / `pkgPath string` as identity parameter | RED | Class 2 — designation-forgery |
| `unsafe.PreviousRealm()` inside a non-crossing function used as caller identity | RED | Class 2 — does not identify the immediate caller |
| `interface { ... }` with `cur realm` parameter declared anywhere | YELLOW | Class 1a/1b — cur-disclosure surface |
| `interface { ... }` accepted as parameter and methods invoked without canonical-type assert | YELLOW | Class 3 — impl-substitution |
| `func(...)` parameters or function-typed state fields used in permission-gated paths | YELLOW | Class 4 — closed-over-authority |
| Function-valued state variable writable but never invoked | YELLOW | Class 4 — latent; wire-and-document-or-delete |
| Embedded `/p/`-type with `Iterate(cb func(*T))` / `Apply(fn func(*T))` shape on `/r/V`-data | YELLOW | (B) violation — no-anchor laundering surface |
| Exported field is a `/p/`-pointer or embedded `/p/`-type | YELLOW | (B) violation candidate |
| Exported function/var returns a pointer aliasing internal mutable state | YELLOW | mutator surface for D2 borrow back |
| Storing a `realm`-typed value in struct field / map / package var | RED | will panic at finalize; usually a Class 2 misunderstanding |
| Slice element mutation after round-trip through external realm | YELLOW | readonly-taint round-trip surprise (open issue #4765) |
| `crossing()` as a statement (pre-0.9 body marker) | RED | won't compile — migrate to `func F(cur realm, ...)` |

## Operational audit signals

Not Gno-language bug classes, but real audit signals an auditor should catch alongside the bug catalog.

| Pattern | Signal | Action |
|---|---|---|
| `unsafe.OriginSend()` consumed with no `SendCoins` / `Withdraw` / auto-forward elsewhere in the realm | RED | Funds lock in realm address. Either implement guarded withdraw, auto-forward to a treasury, or document burn-on-receipt intent. |
| Hardcoded `admin address` with no `TransferAdmin(cur realm, ...)` | YELLOW | Key loss = permanent loss of privileged ops. Ship rotation or document trade-off. |
| `_ := someAvl.Get(k)` / `n, _ := v.(int)` swallowing the second return | YELLOW | Silent fallback on missing key or wrong type. Future state-shape change corrupts the read invisibly. |
| `avl.Tree` storing only a single statically-named key | YELLOW | Over-typed; collapse to a scalar or expose multi-key API. Don't ship the middle. |
| Admin/privileged inputs with no bound check (negative `qty`, oversized strings) | YELLOW | Admin footgun; bound at the function boundary. |
| Exported `ErrXxx` declared but never returned anywhere in the package | YELLOW | Intent inconsistent with behavior — either wire the error or remove it. |
| Map iteration order surfaced as output ordering (`for k, v := range m` feeding `Render`, pagination, or a ranked list) | YELLOW | Gno map iteration is insertion-order and deterministic (the VM iterates an insertion-ordered list, not the Go map) — **not** a consensus risk. But insertion order is an unspecified impl detail, rarely the order users want, and unstable under delete+reinsert (a re-added key jumps to the tail). Store explicit sortable keys in an `avl.Tree`/`bptree` for any order users observe. |
| `math.MinInt` / `math.MaxInt` / `unsafe.Sizeof` / architecture-dependent ints | RED | Platform-dependent values; nodes on different architectures diverge. Use explicit-width types (`int64`, `uint32`). |
| `append` whose growth capacity is observed (`cap(s)` checked after append) | YELLOW | Go's append capacity-growth is version-dependent; code branching on `cap()` can diverge across Go versions. |
| Floating-point arithmetic in deterministic paths | YELLOW | Float formatting has platform edge cases. Prefer integer math; if floats are necessary, format with explicit precision. |
| Delete-and-recreate the same object identity within a tx | YELLOW | Realm finalization assigns object IDs by reachability. Refcount accounting can produce "unexpected object with id" / "unexpected zero object id" runtime errors. |

## Severity calibration

`RED` = exploitable today on current master, OR a block-worthy operational concern. Block deploy / send / interact.
`YELLOW` = exploitable depending on context (caller trust, CEI ordering, documentation). Investigate before clearing.
`GREEN` (implicit) = pattern matched but trust assumption is explicit and reasonable. Record so the next audit is faster.

Always cite the class number when reporting (`Class 1a`, `Class 4`, etc.) so the realm author can cross-reference back to this file. For operational signals, cite `security.md § operational`.

### `/p/` vs `/r/` audit lens

The catalog above is realm-audit-flavored. When auditing a `/p/` **package**:

| Severity | `/r/` realm | `/p/` package |
|---|---|---|
| **RED** | Exploitable today on master | Any naive importer ships a vulnerability (the library hands callers a footgun) |
| **YELLOW** | Exploitable depending on context | Importer must actively misuse it; library exposes the surface but doesn't force it |
| **GREEN** | Pattern matched, trust assumption explicit | Safe regardless of importer behavior |

A `/p/` package has no state of its own; its risk is **what every importing realm fails to wrap**. The same `ExecFunc func(realm) error` pattern that's RED in a deployed realm is YELLOW in a `/p/` library that documents the trust requirement and exposes the option only through a `With*` setter the importer can choose not to expose.

When auditing `/p/`, look for:
- Documentation honesty (`"v0 — Unaudited"` is honest calibration; raise it to the verdict).
- Whether dangerous shapes are necessary for the library's purpose or are convenience footguns.
- Whether the package documents the trust requirement on each callback/interface field.

Cite findings as `YELLOW (RED in any realm that exposes <surface> to public input)` when the shape is structurally necessary but importer-conditional.

## Verification checklist for realm authors

Before deploying a realm, verify:

- [ ] All logic-data types are declared in this package, OR `/p/`-declared types are stored in **unexported** package vars.
- [ ] Every exported function/method does one of: pure read (returns primitives or values, no internal pointers); is a crossing function whose first `cur realm` is used for caller identity; is a non-crossing helper that checks secondary `rlm.IsCurrent()` before trusting realm identity; documented intentionally permissive (faucet, public mint).
- [ ] No exported var or function returns a pointer aliasing internal mutable state.
- [ ] Every interface parameter from external callers is gated with a canonical-type assert before invoking methods.
- [ ] No method takes a `func(*MyPType)` callback (where `MyPType` is `/p/`-declared) and invokes it from within. If yes, retype the callback to use your own `/r/V`-typed parameter.
- [ ] No exported field is a `/p/`-pointer or embedded `/p/`-type with concretely-typed callback methods.
- [ ] Payment-guarded entry points use `cur.Previous().IsUserCall()`, not `IsUser()`.
- [ ] No `realm`-typed value is stored in package state, struct fields, maps, slices, or closure captures.
- [ ] Not imported `gno.land/r/tests/vm/test20` (deliberately insecure test fixture).

## Worked example — a secure counter realm

```go
// gno.land/r/example/counter
package counter

// /r/-declared data type. (A) satisfied.
type Counter struct {
    value int
    owner address
}

var gCounter *Counter   // unexported — only reachable through methods below

func init() {
    gCounter = &Counter{value: 0, owner: address("")}
}

// Public read. Returns a value, not a pointer.
func Value() int {
    return gCounter.value
}

// Authenticated mutator.
func Increment(cur realm) {
    gCounter.value++
}

// Authenticated owner-gated mutator.
func SetOwner(cur realm, newOwner address) {
    if gCounter.owner != "" && cur.Previous().Address() != gCounter.owner {
        panic("not the owner")
    }
    gCounter.owner = newOwner
}

// NO method like ApplyHook(fn func(*Counter)) — violates (C).
// NO method like GetCounter() *Counter — aliased-pointer leak.
```

Attackers can read `Value()` (returns a copy), call `Increment(cur)` (D1 keeps `m.Realm = counter`), call `SetOwner(cur, ...)` (owner check). They cannot write `gCounter.value` (unexported), Apply-launder it (no Apply method, no exported pointer), or spoof `cur.Previous().Address()` at the crossing entrypoint because the runtime supplies the live first `cur realm`.

## Cross-references

- `interrealm.md` — the spec model these violations build on (two contexts, three borrow rules, capability token semantics, readonly taint, conversion guards)
- `patterns.md` — preferred shapes that avoid these classes
- `stdlib.md` — `chain/banker`, `chain/runtime`, payment primitives
- `render.md` — XSS / untrusted-content posture for `Render()` output (separate trust axis)

## Source

- `docs/resources/gno-security.md` — five-class taxonomy (class numbers used in chain code comments).
- `docs/resources/gno-security-guide.md` — four structural defenses, safety hypothesis (A/B/C), encapsulation pattern, anti-patterns, surprising properties, checklist.
- `gnovm/tests/files/zrealm_launder_*.gno` — ~64 exploit-attempt filetests, each annotated with mechanism and outcome.
- `examples/quarantined/gno.land/p/test/seal/filetests/z_seal_*_filetest.gno` — four bypass tests showing why sealing is documentation, not defense.
