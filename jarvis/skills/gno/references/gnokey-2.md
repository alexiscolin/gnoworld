*Continues `gnokey.md`.*
## Simulate before you broadcast

Simulation runs the **full ante handler + full message execution** against a throwaway cache: it
charges nothing, commits nothing, **skips signature verification** (so you can simulate *unsigned* —
only the public key is needed, no password; gnolang/gno #4279), and returns the **real `GasUsed`**.
This is how you size `GasWanted` honestly instead of guessing.

- gnokey: `--simulate` is `test` (simulate, then broadcast if it passes — the default), `skip`
  (broadcast directly), or `only` (dry-run; also prints a suggested fee with a `--gas-fee-margin`,
  default 5%). `--broadcast` defaults true. **Estimation advises but does not auto-fill** —
  `maketx` still errors if you don't pass `--gas-wanted` and `--gas-fee` yourself.
- gnomcp: the `simulate` parameter on `gno_call`/`gno_addpkg`/`gno_run` does the same dry-run; the
  write tools also **simulate before broadcasting** so a type error or an unmet deploy gate
  (CLA/namespace) fails at **zero gas** instead of stranding a freshly-funded key.

Best practice (gnokey or gnomcp): **simulate → read `GasUsed` → set `GasWanted` a margin above it →
price `GasFee` for that `GasWanted` at the live gas price** (a small margin over the minimum — gnomcp
uses ×2 — insures against a price rise before inclusion; the chain bills the full offered fee, so
keep margins small). This is exactly what gnomcp's write pipeline does automatically.

## Flag reference

**tx-build** (`maketx <call|addpkg|run|send>`):

| Flag | Purpose | gnomcp stance |
|---|---|---|
| `--gas-wanted` | execution ceiling (gas units); required, no default | measured × 1.5, floored at `10_000_000` |
| `--gas-fee` | flat total fee offered (e.g. `10000ugnot`); required | live price × 2 for the offered gas-wanted, floored at `10_000ugnot` |
| `--send` | coins attached to the msg (→ realm as `OriginSend`), separate from the fee | user-supplied (`send` arg) |
| `--max-deposit` | cap on storage deposit locked (empty → 600 GNOT param) | pinned `10_000_000` on addpkg only |
| `--memo` | free text in the signed tx (≤ 64 KB; costs gas by size) | not set |
| `--pkgpath` `--func` `--args` (call) · `--pkgdir` (addpkg) · `--to` (send) | the message payload | the tool's own params |

**broadcast / signing** (base flags + `sign`/`broadcast`):

| Flag | Purpose | gnomcp stance |
|---|---|---|
| `--remote` | node RPC URL (default `127.0.0.1:26657`) | fixed at profile/connection (`NewReal(rpcURL,…)`) |
| `--chainid` | chain id mixed into the **signature** (default `dev`); wrong value → opaque sig failure | fixed at profile |
| `--simulate` / `--broadcast` | dry-run vs send (above) | the `simulate` param; gnomcp always broadcasts otherwise |
| `--account-number` / `--account-sequence` | replay/identity counters in the SignDoc | **auto** (queried from `auth/accounts/<addr>`); gnomcp passes 0,0 to force the query |

**keys** (`add` `generate` `list` `delete` `export` `import` `rotate`, sub-modes `add multisig|ledger|bech32`):
create/recover/inspect keys in `~/.gnokey/`. gnomcp manages its own keystore via
`gno_key_generate` / `gno_key_list` / `gno_key_delete` (no export/import/rotate). **Don't mix the
two stores** — they don't see each other's keys.

## Best practices & footguns (from the gnolang/gno issue tracker)

| Footgun | Right way | Source |
|---|---|---|
| Overpaying `--gas-fee` (full fee is taken) | Price the fee for the actual `GasWanted` at the live price (small margin only) — never a flat ceiling-sized fee | #3805, #5086 |
| `--gas-fee 1gnot` → "insufficient funds" | Use ugnot: `--gas-fee 10000ugnot` (denominations don't mix in the fee field) | #329 |
| `--gas-wanted 4000000000` → "invalid gas-wanted" | Keep under block-max-gas (~3B) | #329 |
| Empty `--send ""` to a payable realm → "payment must not be less than …" | A required deposit must ride in `--send`; empty sends nothing | #329 |
| `out of gas` → bump to just above the reported number, fails again | The number is gas-used-so-far; bump well above, or simulate | #3704 |
| `signature verification failed; verify correct account, sequence, and chain-id` | First suspect a **stale gnokey binary** (a known cause); then check `--chainid`, and `--account-number`/`--sequence` from `gnokey query auth/accounts/<addr>` | #2109 |
| `gnokey add --derivation-path …` prints derived addrs but may save an **un-derived** key | Verify the stored key's `path:` before signing | #5122 |
| Tx "succeeds" at CheckTx then fails at DeliverTx | The real cause is one line buried in a large `Log` stack dump — grep the deliver-tx log; typed realm errors aren't here yet | #203, #416 |
| Mismatched / missing `--remote` + `--chainid` | Both must be set and match the target chain (the UX may collapse to one `-chain` flag later) | #3703 |

## The discipline — when gnomcp is connected, it signs for you

With a gnomcp server connected, an agent does writes through `gno_call` / `gno_addpkg` / `gno_run` /
`gno_key_send` / sessions — **never** raw `gnokey`, and never by reading, asking for, or importing a
key or mnemonic. Reaching for `gnokey` for a write means you took a wrong turn, because:

- **Separate keystore.** gnomcp keys live under `~/.local/share/gnomcp/agent-keys/<profile>/`; `gnokey` can't see or sign with them.
- **Atomic + safe defaults.** gnomcp builds-signs-broadcasts in one step, simulates first, and offers
  2× the live price floor off right-sized gas — you can't accidentally overpay or strand a key.
- **It's a hard rule here.** The gno-build skill forbids it, and the e2e flows fail any run where the
  agent shells out to `gnokey`.

gnokey understanding is for three things: **reasoning** about what a write costs and why it fails;
**reading chain params** that gnomcp may not wrap (the `gnokey query params/<module>:p:<name>`
fallback — see `sysrealms.md`); and **showing** a user the equivalent command (next).

## Showing the equivalent gnokey command (transparency)

Any gnomcp write maps mechanically to the `gnokey maketx` command it stands in for — useful to teach
a user what just happened or to hand them a reproducible line. The pieces all come from the tool call
plus the profile (rpc, chain-id) and the gas the write actually offered (measured gas-wanted, live
fee — every gnomcp write result echoes the real values):

```
# gno_call{realm:"gno.land/r/demo/foo", func:"Bump", args:["1"], send:"", key:"alice"}
# (light call on pearl: gas-wanted floors at 10M; live price 1ugnot/1000gas → fee = 10M × 1ugnot/1000gas × 2)
gnokey maketx call \
  -pkgpath gno.land/r/demo/foo -func Bump -args 1 \
  -gas-wanted 10000000 -gas-fee 20000ugnot \
  -remote https://rpc.pearl.testnets.gno.land:443 -chainid pearl-1 \
  -broadcast alice
```

Template: `gnokey maketx <call|addpkg|run|send> <msg flags> -gas-wanted <GasWanted> -gas-fee
<GasFee>ugnot [-send <amt>] [-max-deposit <amt>] -remote <rpc> -chainid <id> -broadcast <key>`.
Show it as *equivalent*, not as something to run instead — the agent already did the write via gnomcp.

If the gnomcp write result already carries a `gnokey_command` field (some servers emit it), that is
exactly this string — surface it directly rather than re-deriving. It's a convenience, not a
dependency: this reference renders the same command from first principles when the field is absent.

## See also

- `mcp.md` — the gno-mcp read tools and the no-MCP ABCI fallbacks; the read half of the table above.
- `sysrealms.md` — the deploy gates (`r/sys/names`, `r/sys/cla`) a write must clear, and the
  `gnokey query params/…` recipe for raw chain params; "trust the chain" discipline for live values.
- `build.md` — authoring/testing/deploying realms; "Never touch keys" — the deploy-side companion to
  the discipline here.
- `debug.md` — failure-signature triage; the gas/sequence/deposit errors above feed its table.

## Source

Distilled from `gnokey` (`tm2/pkg/crypto/keys/client`, `gno.land/pkg/keyscli`), the auth ante handler
and fee/gas-price logic (`tm2/pkg/sdk/auth`, `tm2/pkg/std`), and the vm storage-deposit keeper
(`gno.land/pkg/sdk/vm`) in gnolang/gno at the commit pinned in this repo's go.mod; the gnomcp write
path (`internal/chain/real.go`, `internal/tools/write`); and the gnolang/gno issue tracker (#3805,
#5086, #3704, #329, #2109, #4279, #5122, #203, #416, #3703). Mechanics verified against the live
pearl and sapphire deploy-gate flows (note: the CLA gate is currently disabled on both live
chains — see sysrealms.md). Flag surface is version-bound — confirm with `gnokey <cmd> -help`.
