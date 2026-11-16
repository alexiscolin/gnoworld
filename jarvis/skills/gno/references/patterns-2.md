*Continues `patterns.md`.*
### Inbound payment without an exit

A realm that consumes `OriginSend()` but provides no `Withdraw` / auto-forward path locks funds at the realm address. Either implement a guarded withdraw, auto-forward to a treasury, or document burn-on-receipt intent. Audit checklist item.

### No ERC-20-style `transferFrom`

Gno banker is **push-only**: `banker.SendCoins(from, to, amt)` requires `from == pkgAddr` (your own realm's address). You cannot pull from a caller's address. Payment flow is the `-send` envelope + `OriginSend()` amount check + `IsUserCall()` guard.

## Events

Emit events for any state change off-chain consumers care about. They cost gas but are the canonical way to expose state changes to indexers, gnoweb activity views, and agentic-AI tools — without forcing them to diff full state snapshots.

```go
import "chain"

func ChangeOwner(cur realm, newOwner address) {
    if cur.Previous().Address() != owner { panic("not the owner") }
    owner = newOwner
    chain.Emit("OwnershipChange", "newOwner", newOwner.String())
}
```

The ABCI block envelope carries event type, the emitting `pkg_path`, the emitting `func`, and the key/value attrs — all indexable. Be generous; emit for any externally-observable state change.

## Access control idioms

Four common shapes:

### `cur.Previous().Address()` — generic caller identity

```go
func AdminOnly(cur realm) {
    if cur.Previous().Address() != admin { panic("permission denied") }
    // ...
}
```

Works for any caller (EOA or another realm). Use when the calling identity is what matters.

### `unsafe.OriginCaller()` — the tx-signing EOA

Returns the public address of the account that signed the transaction, regardless of intermediaries. Use when **the original user identity** is what matters (not whichever realm forwarded to you).

```go
import "chain/runtime/unsafe"

func SignedByEOA() address {
    return unsafe.OriginCaller()
}
```

### `runtime.AssertOriginCall()` — strict EOA-only gate

Panics if anything but a direct `MsgCall` from an EOA reaches this function. Stricter than `IsUserCall()`: rejects all `MsgRun` invocations. Use for governance-only or strictly-no-intermediary functions.

### Allowlist via `ownable` / `authz`

For multi-admin or rotateable ownership, use the canonical packages: `gno.land/p/nt/ownable/v0` (single-owner pattern) or `gno.land/p/moul/authz` (richer auth schemes).

## Cost-aware design

### Storage deposit drives state-shape decisions

Storing data locks GNOT tokens proportional to the bytes. Deleting refunds them. The price is a global parameter governed by GovDAO — the default is **100 ugnot per byte** (`storagePriceDefault` in `gno.land/pkg/sdk/vm/params.go`), but treat the live value as authoritative since GovDAO can change it.

Consequences for design:

- **Small structs over fat structs.** Each field costs.
- **Scalar where possible.** A single-key `avl.Tree` is over-typed (and over-paid); collapse to a scalar.
- **Schedule cleanup.** Expired listings, old proposals, dead sessions — implement removal. Refunded deposits cover storage cost; clean realms run cheaper.
- **Cleanup-as-revenue.** Deposits are tracked per-realm, not per-user; whoever deletes the data gains the released deposit. You can design realms where third parties profit from sweeping expired state.

The `-max-deposit` flag on `MsgCall` / `MsgRun` / `AddPkg` caps the GNOT the caller is willing to lock. Realms that overshoot may have their tx rejected.

### Gas drives execution-path decisions

Gas is a measure of computational and storage cost. Every read, write, allocation, and AVL traversal counts. Optimizations that matter:

- **Lazy AVL allocation** (see § Lazy initialization).
- **Bounded loops.** Loops over user-controlled inputs can spike gas; bound the iteration count.
- **Index over scan.** If you'll query by both "name" and "id," maintain two AVLs:
  ```go
  var (
      usersById   avl.Tree // map id   -> user
      usersByName avl.Tree // map name -> id
  )
  ```
- **Avoid cross-realm reads in hot paths.** Readonly taint forces copies that cost gas; cache the result.
- **Events instead of dynamic Render().** If consumers need to see "X happened," emit an event instead of rendering it on demand.

## Common library imports

Packages that survived the `examples/quarantined/` cull — the test-13 safe-list (PR #5726) that moved unaudited/personal-namespace packages to `examples/quarantined/`. Re-verify against the current master tree before relying on an import; the split moves over time, and the live testnet may not carry a listed package at all — neither `p/demo/tokens/grc721` nor `p/nt/commondao/v0` resolves on pearl or sapphire. Verify each import against the target chain, not just master:

| Need | Canonical import |
|---|---|
| AVL trees (ordered keyed state) | `gno.land/p/nt/avl/v0` |
| B+tree (alternative for ordered keyed state) | `gno.land/p/nt/bptree/v0` |
| Render-path routing (mux) | `gno.land/p/nt/mux/v0` |
| Realm-path parsing | `gno.land/p/moul/realmpath` |
| Ownership / single-owner pattern | `gno.land/p/nt/ownable/v0` |
| Authorization patterns | `gno.land/p/moul/authz` |
| Pagination | `gno.land/p/jeronimoalbi/pager` |
| DAO primitives | `gno.land/p/nt/commondao/v0` — **absent from both live testnets** |
| Fungible tokens (canonical safe example) | `gno.land/p/demo/tokens/grc20` |

Prefer these over re-implementation — they're reviewed, used, and stable.

There is no canonical GRC721/NFT package deployed on either live testnet — `gno.land/p/demo/tokens/grc721` does not resolve on-chain (verified on pearl and sapphire, `InvalidPackageError`). Sapphire does carry several community implementations under personal and `gnoswap` namespaces; pearl carries none. If you need NFTs, query the target chain for an available implementation rather than assuming a path.

**Don't** import `gno.land/r/tests/vm/test20` — deliberately insecure test fixture exporting `PrivateLedger`. Using it in production code = instant compromise (see `security.md` § Encapsulation pattern).

## Security fixture reference

Real examples of each major vulnerability class, with corrected versions. These are excerpts from executable fixtures in the audit pattern harness; see the gnolang/gno repo's `misc/audit-pattern-harness/` for the full test suite.

### Authorization: check secondary `rlm.IsCurrent()` before trusting helper realm parameters

Crossing functions receive a runtime-current first `cur realm`; do not add a redundant `cur.IsCurrent()` just to satisfy a pattern. The explicit check is needed when realm identity is threaded into a non-crossing helper as a secondary parameter.

**Wrong** — helper trusts caller-supplied `rlm`:

```go
func transferOwnership(_ int, rlm realm, next address) {
    if rlm.Previous().Address() != owner {  // BUG: caller can pass cur.Previous()
        panic("owner only")
    }
    owner = next
}
```

**Right** — verifies the helper realm value is live:

```go
func TransferOwnership(cur realm, next address) {
    transferOwnership(0, cur, next)
}

func transferOwnership(_ int, rlm realm, next address) {
    if !rlm.IsCurrent() {
        panic("invalid realm")
    }
    if rlm.Previous().Address() != owner {  // Now safe
        panic("owner only")
    }
    owner = next
}
```

**Why**: `rlm` is just a helper parameter. A caller can pass `cur.Previous()` or another realm value unless the helper proves the value is the current crossing frame.

### Payment: guard with `IsUserCall()`, not `IsUser()`

**Wrong** — uses `.IsUser()`:

```go
import "chain/runtime/unsafe"

func Buy(cur realm) {
    if !cur.Previous().IsUser() {
        panic("user only")
    }
    collected += unsafe.OriginSend().AmountOf("ugnot")
}
```

**Right** — uses `.IsUserCall()`:

```go
import "chain/runtime/unsafe"

func Buy(cur realm) {
    if !cur.Previous().IsUserCall() {
        panic("direct user call only")
    }
    collected += unsafe.OriginSend().AmountOf("ugnot")
}
```

**Why**: `.IsUser()` includes ephemeral `MsgRun` realms; they can consume the `OriginSend` envelope before your code runs. `.IsUserCall()` is EOA-only and safe.

### Caller identity in APIs: use address, not `OriginCaller()`

**Wrong** — uses the origin stack-walker for identity:

```go
import "chain/runtime/unsafe"

func SetPaused(cur realm, next bool) {
    if unsafe.OriginCaller() != owner {
        panic("owner only")
    }
    paused = next
}
```

**Right** — uses live realm crossing:

```go
func SetPaused(cur realm, next bool) {
    if cur.Previous().Address() != owner {
        panic("owner only")
    }
    paused = next
}
```

**Why**: `OriginCaller()` names the transaction's original signer; it does NOT identify the immediate caller when an intermediate realm crosses into this one. Use the crossing entrypoint's `cur.Previous().Address()`.

### Render output: sanitize untrusted content

**Wrong** — echoes path directly:

```go
func Render(path string) string {
    return "# Echo\n\n" + path  // raw markdown injection surface
}
```

**Right** — sanitize before output:

```go
import "gno.land/p/nt/markdown/sanitize/v0"

func Render(path string) string {
    return "# Echo\n\n" + sanitize.InlineText(path)
}
```

**Why**: `path` is user-controlled. Raw concatenation lets attackers inject links, blockquotes, and code fences. `sanitize.InlineText` (from `gno.land/p/nt/markdown/sanitize/v0`) escapes inline-active markdown punctuation; see `render.md` for the block/table/URL variants and the sanitizer's non-idempotence.

### Storage: use tree for ordered/paginated Render output

**Wrong** — map iteration order in Render:

```go
var scores = map[string]int{
    "alice": 10,
    "bob":   7,
    "carol": 12,
}

func Render(_ string) string {
    out := "# Scores\n\n"
    for name, score := range scores {  // Iteration order is not API-stable
        out += "- " + name + ": " + strconv.Itoa(score) + "\n"
    }
    return out
}
```

**Right** — tree with explicit iteration:

```go
import "gno.land/p/nt/avl/v0"

var scores avl.Tree

func init() {
    scores.Set("alice", 10)
    scores.Set("bob", 7)
    scores.Set("carol", 12)
}

func Render(_ string) string {
    out := "# Scores\n\n"
    scores.Iterate("", "", func(name string, value any) bool {
        out += "- " + name + ": " + strconv.Itoa(value.(int)) + "\n"
        return false
    })
    return out
}
```

**Why**: Maps iterate in insertion order (deterministic now), but that's not a stable public API contract. If storage changes or iteration order changes in a future Gno version, linked leaderboard pages break. Explicit sorted iteration is the contract.

## Naming and documentation

Exported names are part of the **on-chain ABI**. Renaming `func Buy` to `func Purchase` breaks every existing caller — same severity as a breaking API change. Pin names before deploy.

**Godoc is user-facing documentation**, not internal commentary. The gnoweb `:help` view and agent introspection both read godoc. Treat it as the API doc.

```go
// Buy purchases one widget for `price` ugnot.
//
// Sends the payment via OriginSend; reverts if the amount is incorrect
// or stock is depleted. EOA-only — `maketx run` callers are rejected.
func Buy(cur realm) { ... }
```

## `Render(path string) string` conventions

- **No state mutation.** Read-only by convention; not enforced by the chain.
- **Pick one routing pattern and stick with it** within a realm. Mixing mux and `realmpath.Parse` is confusing.
- **Return a useful 404** on unknown paths — `> [!WARNING]\n> Path not found` or similar, not panic.
- **Pre-render expensive paths into events** if the same view will be requested often.

See `render.md` for the markdown extension surface and `chain/markdown` sanitization.

## Testing — three flavors

| Flavor | Filename | Use for |
|---|---|---|
| Unit test | `*_test.gno` | Standard `testing.T` style — assert function-level behavior |
| File test | `*_filetest.gno` | Full file with a comment block declaring expected output. Best for spec-shaped tests |
| Integration | external (`gnodev`, txtar) | End-to-end against a real chain; catches `MsgCall` vs `MsgRun` semantic mismatches |

For payment-accepting realms, **always include a test that asserts the payment guard rejects `IsUserRun` callers**. Use `testing.NewCodeRealm()` to simulate an intermediate attacker realm.

See `build.md` for filetest layout and authoring patterns.

## Operational anti-patterns

Not security bugs, but audit-worthy patterns that should block deployment until resolved or explicitly documented. Mirror in `security.md` § Operational signals.

- **No exit for accumulated funds.** Implement guarded withdraw, auto-forward, or document burn-on-receipt.
- **No admin rotation.** Hardcoded `admin address` with no `TransferAdmin(cur realm, ...)`. Key loss = permanent loss of privileged operations.
- **Dead function-valued state.** A `var cb func(...)` writable but never invoked — Class 4 latent.
- **Silent type-assertion fallbacks.** `n, _ := current.(int)` swallows assertion failure; future state-shape changes corrupt the read silently. Panic on failure, or use a typed wrapper.
- **Over-typed state for single-key use.** Single-key `avl.Tree` is over-engineered — collapse to a scalar or expose multi-key API.
- **Unbounded admin inputs.** `Stock(cur realm, qty int)` accepting negative `qty` is an admin footgun. Bound at the function boundary.

## `gno fmt`

Required. Match surrounding style.

## Cross-references

- `interrealm.md` — the model these patterns work *with* (crossing functions, borrow rules, `cur` capability, readonly taint)
- `security.md` — the bug classes these idioms avoid (Classes 1a/1b/2/3/4, (A)/(B)/(C) safety hypothesis, encapsulation pattern)
- `stdlib.md` — APIs the patterns rely on (`chain.Emit`, `avl.Tree`, `unsafe.OriginSend`, `chain/runtime`)
- `render.md` — Render() and gnoweb-specific patterns
- `build.md` — project setup, testing flavors, Go-Gno compatibility
- `memory.md` — typed value model and persistence semantics

## Source

- `docs/resources/effective-gno.md` in the gnolang/gno repo — canonical best-practice doc.
- `docs/resources/gas-fees.md` and `docs/resources/storage-deposit.md` — cost model.
- `docs/resources/gno-interrealm-v2.md` § Guidelines — the spec author's mental model.
- `examples/gno.land/` — observed conventions in deployed realms (post-test-13 quarantine).
