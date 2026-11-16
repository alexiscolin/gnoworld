*Continues `SKILL.md`.*
### Task hints (multi-reference loads)

- *Writing a realm from scratch* → start with `patterns.md` (idioms) + `interrealm.md` (spec), then `stdlib.md` for API, `security.md` to avoid known footguns, `render.md` if it exposes a `Render()`, `memory.md` for state-shape decisions, `build.md` for testing and shipping.
- *Designing the public API of a realm* → `interrealm.md` (crossing functions, secondary `rlm.IsCurrent()` guards) + `security.md` (the verification checklist + (A)/(B)/(C) safety hypothesis) + `patterns.md` (realm-as-public-API mindset).
- *Debugging a panic* → `interrealm.md` (readonly taint, conversion guards, cross-realm panic semantics) + `memory.md` (heap-item and pointer model) + `security.md` (the operational signals — non-determinism, platform divergence).
- *Reviewing someone else's realm casually* → `security.md` + `interrealm.md` are always relevant; `patterns.md` for idiom checks; `render.md` if it has a `Render()`. Skip the formal procedure unless asked.
- *Auditing a realm formally* → `audit.md` is the procedure; it pulls in `security.md` + `interrealm.md` + `patterns.md` + `render.md` (if relevant) + `memory.md` (if persistence semantics are in play) as it runs.
- *Auditing under gates (read-only, structured report, FP-filtered)* → dispatch the `gno-auditor` agent **by name** via the Task tool (it's a registered agent, defined at the plugin's top-level `agents/auditor.md`). It wraps `audit.md` with a read-only tool allowlist and a two-pass Task-tool dispatch for false-positive filtering.
- *Setting up a new project* → `build.md` (scaffold, gnomod.toml, testing flavors) + `patterns.md` (package organization, `/r/` vs `/p/` vs `/e/`).
- *Answering "what does X actually do?"* → `interrealm.md` for spec questions; `stdlib.md` for API questions; `render.md` for gnoweb markdown behavior; `memory.md` for persistence behavior; `build.md` for tooling behavior.
- *Answering "how do I register a name / who are the validators / is enforcement on?" for a specific chain* → `sysrealms.md` (the sys-realm model + the trust-the-chain query discipline) + `mcp.md` (the query tools). The answer is a live query, not a recital.
- *Answering "what does this write cost / why did my tx fail with gas/fee/sequence?" or "what's the gnokey equivalent?"* → `gnokey.md` (the `Fee = {GasWanted, GasFee}` model, the price floor, the failure-mode table, the gnomcp↔gnokey mapping) + `debug.md` for triaging a specific failed call.

## Quick reference

| Symbol / phrase | Meaning |
|---|---|
| `func F(cur realm, ...)` | **Crossing function** — caller invokes with `F(cross(cur), ...)` for a cross-call, `F(cur, ...)` for a same-realm non-crossing call. Only `/r/` packages may declare crossing functions. `MsgCall` only dispatches to crossing functions. |
| `cross(rlm)` | Uverse function marking a cross-call. `cross(cur)` is the canonical form; `cross(otherRealm)` names an explicit target. The bare `cross` keyword that existed during the 0.9 migration is gone. |
| `cur.IsCurrent()` / `rlm.IsCurrent()` | Returns true only when that realm value matches the topmost live crossing frame. The first `cur realm` of a crossing function is runtime-current by construction; secondary/helper `rlm realm` parameters need an explicit check before authority use. |
| `cur.Previous()` | Captured realm that was current before this crossing. In a crossing entrypoint, use `cur.Previous().Address()` to identify the caller. In a helper that accepts `rlm realm`, first prove `rlm.IsCurrent()`. |
| `unsafe.PreviousRealm()` | Imported from `chain/runtime/unsafe`. **Stack-walker** — returns the realm prior to the most recent boundary regardless of which function you're in. Prefer `cur` in crossing functions; reach for this only when you need stack-walking semantics. |
| `IsUserCall()` | True only if caller is an EOA via `MsgCall`. Use this when guarding `OriginSend`. |
| `IsUserRun()` | True only if caller is an EOA via `MsgRun` (in the ephemeral `/e/g1<user>/run` realm). |
| `IsUser()` | True if `IsUserCall()` OR `IsUserRun()`. **Insufficient for payment guards** — the `MsgRun` ephemeral can consume the `OriginSend` envelope before forwarding control. |
| `unsafe.OriginSend()` | Coins included with the originating transaction (from `chain/runtime/unsafe`). Pair with `cur.Previous().IsUserCall()` and an amount check. |
| Readonly taint | When code reads a value across a realm-storage boundary, the value is tainted read-only. The taint is sticky and propagates through field access, indexing, slicing, copies, and conversions. Mutation panics. |
| Borrow rules | Three implicit rules that set `m.Realm` per call: declaring-realm (#1, `/r/`-callables), storage-realm (#2, `/p/`/stdlib methods on real foreign-stamped receivers), closure-capability (#3, `/p/`-declared closures carry creator-realm authority). |
| PkgID | Stamped on every object at allocation time. **Storage = Authority** — the realm that allocated an object owns it. |
| `panic` | Use for unrecoverable contract state — aborts the transaction cleanly, reverts all state. `error` does NOT revert state. |

## Security patterns quick check

Before writing or reviewing crossing functions, check these common mistakes:

| Trigger | What to look for | Fix |
|---|---|---|
| **Authorization check** | Helper/secondary `rlm realm` trusted without `rlm.IsCurrent()` | Check the same `rlm` first |
| **Payment handling** | `OriginSend` without `cur.Previous().IsUserCall()` | Guard with `.IsUserCall()`, not `.IsUser()` |
| **Caller identity** | Using `OriginCaller()` in crossing function | Use the crossing entrypoint's runtime-current `cur.Previous().Address()` |
| **Render output** | Raw `path` concatenated into markdown | Sanitize with `sanitize.InlineText` (`gno.land/p/nt/markdown/sanitize/v0`); see `render.md` |
| **Callback params** | Function accepts `func()` from caller | Replace with explicit state-mutation methods |
| **Interface methods** | Interface signature contains `cur realm` | Take `address` instead; caller derives from `cur.Previous()` |
| **Pointer getters** | Exported function returns `*privateState` | Return values, not pointers |
| **Render storage** | `Render` iterates over `map` | Use `avl.Tree` with `.Iterate()` for deterministic order |

Load `security.md` for detailed threat model and exploitation mechanics.

## Anti-pattern reflex

If you find yourself thinking *"this is just like Solidity's `msg.sender`…"* — **stop**. Gno's caller-identity model is not stack-walking by default. Specifically:

- `cur.Previous()` is meaningful for the runtime-current first `cur realm` of a crossing function. Crossing functions do not need to re-check that first `cur`; helper parameters such as `_ int, rlm realm` do.
- `unsafe.PreviousRealm()` (from `chain/runtime/unsafe`) is a stack-walker — inside a non-crossing function it returns whatever was previous at the last realm boundary, possibly an unrelated frame upstream. It does NOT identify the immediate caller.
- A `unsafe.PreviousRealm().PkgPath() == "..."` check inside a non-crossing function is a **security bug** (security.md Class 2).

Load `interrealm.md` § The `cur` capability token before emitting any caller-identity check.

## Known limits of this skill

- **The interrealm spec is the youngest part of the chain.** Treat patterns as version-bound to the master HEAD this skill was distilled against; verify against upstream when emitting security-critical code.
- **No compiler protection for attached-method privilege escalation** (the (A)-class violation when a `/p/`-type with concrete-callback higher-order methods gets embedded in `/r/`-data). Receiver attachment is a privilege grant — the audit is the only line of defense. See `references/security.md` Safety hypothesis (B).
- **Quarantine snapshot (frozen at the test-13 cut).** The kept-in-`examples/` set was frozen at scaffold time; packages added/removed since are not reflected, and the live testnet may not carry a listed package at all — e.g. `p/demo/tokens/grc721` is in the tables but is deployed on neither pearl nor sapphire. Verify each import against the target chain, not just master.
- **gno.land docs are evolving.** When upstream docs disagree, prefer the more specific interrealm source for the exact shape in question: `docs/resources/gno-interrealm-v2.md` gives the broad public-API checklist, while `gnovm/adr/interrealm_v2.md` is the sharper source for the crossing-entrypoint vs secondary-helper `realm` distinction.

## Source

Distilled from the `gnolang/gno` repo, especially `gnovm/adr/interrealm_v2.md` (the `rlm.IsCurrent()` note for secondary realm parameters) and `docs/resources/`: `gno-interrealm-v2.md`, `gno-security.md`, `gno-security-guide.md`, `effective-gno.md`, `gno-stdlibs.md`, `gno-memory-model.md`, `gno-data-structures.md`, `gno-testing.md`, `configuring-gno-projects.md`, `go-gno-compatibility.md`, plus observed conventions in `examples/gno.land` (post-test-13 quarantine).
