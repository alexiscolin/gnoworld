# gnokey — the gno.land CLI, and the tx machinery gnomcp wraps

> **Category: gno.land tooling.** `gnokey` is gno.land's key manager + transaction tool. This
> reference teaches the **tx model behind every write** — the gas/fee/deposit knobs, the
> sign→broadcast pipeline, the failure modes — so you can reason about what a write actually costs
> and why it fails, and explain or display the equivalent command. It is **not** a license to shell
> out: when a gnomcp server is connected, gnomcp signs for you and raw `gnokey` for a write is a
> wrong turn (see "The discipline"). The flag surface is concrete (state it), but it is
> **version-bound** — the gnokey UX is actively being reworked (gnolang/gno #3703); when in doubt,
> `gnokey <cmd> -help`.

## Why this matters

Every on-chain write — a realm call, a deploy, a send — is a transaction carrying a **fee** and a
**gas limit**. Get the mental model wrong and you either overpay real money on every tx or hit
opaque "out of gas" / "insufficient fee" failures. The single most expensive misconception:
**the chain deducts the *full fee you offer*, not the gas you actually use.** gnomcp keeps the offer
tight for exactly this reason — it sizes gas from a dry run and offers 2× the live price floor, not a
fixed constant; understand the model and you understand both tools.

## The mapping — gnomcp tool ↔ gnokey command

gnomcp does not call gnokey. It has its own keystore (`~/.local/share/gnomcp/agent-keys/<profile>/`, overridable with
`GNOMCP_AGENT_KEYS_PATH`, **separate** from gnokey's
`~/.gnokey/` — a `gno_key_generate` key is invisible to `gnokey list`, and vice-versa) and builds,
signs, and broadcasts each tx atomically in one tool call. gnokey splits the same work into
`maketx` → `sign` → `broadcast`. Same messages underneath:

| gnomcp tool | gnokey command | Message built | What it is |
|---|---|---|---|
| `gno_call` | `gnokey maketx call` | `vm.MsgCall` | Call a realm's crossing function |
| `gno_addpkg` | `gnokey maketx addpkg` | `vm.MsgAddPackage` | Deploy a package/realm |
| `gno_run` | `gnokey maketx run` | `vm.MsgRun` | Run ephemeral `main()` code |
| `gno_key_send` | `gnokey maketx send` | `bank.MsgSend` | Transfer ugnot |
| `gno_session_propose` | `gnokey maketx session create` | `auth.MsgCreateSession` | Open a user-authorized session |
| `gno_session_revoke` | `gnokey maketx session revoke` | `auth.MsgRevokeSession` | Close a session |
| `gno_key_generate` | `gnokey add` / `add --recover` | — | Create / recover a key |
| `gno_key_list` · `gno_key_delete` · `gno_key_address` | `gnokey list` · `delete` · (address of) | — | Manage the gnomcp keystore |
| `gno_eval` · `gno_render` · `gno_packages` · `gno_account` | `gnokey query vm/qeval` · `vm/qrender` · `vm/qpaths` · `auth/accounts/<addr>` | — | Reads (ABCI queries) |

Reads have no key, fee, or signature — `gnokey query` and `gno_eval`/`gno_render` are the same ABCI
paths (see `mcp.md`, `sysrealms.md`). Everything below is about the **write** path.

## The tx model — `Fee = {GasWanted, GasFee}`, two independent knobs

A signed tx carries `std.Fee{ GasWanted int64; GasFee Coin }`. These are **not** derived from each
other — they are two separate dials, and conflating them is the root of most gas confusion.

- **`GasFee`** (`--gas-fee`, e.g. `10000ugnot`) — a **flat total amount you offer for the whole tx**.
  The ante handler deducts it **in full, regardless of how much gas the tx actually burns.** There is
  **no refund** of the difference. Offering more than the floor is money burned for nothing.
- **`GasWanted`** (`--gas-wanted`, e.g. `10000000`) — the **execution ceiling** in gas units. If the
  tx consumes more than this, it aborts with **out of gas**. It is *not* a cost; it only caps work.
  It must also stay under the chain's **block max gas** (else `invalid gas-wanted`).

The effective per-unit price the chain sees is `GasFee / GasWanted`. A tx is admitted only if that
ratio clears the chain's minimum (next section). So the two knobs interact only through their ratio:
raise `GasWanted` and you must raise `GasFee` to keep the ratio above the floor.

**The floor.** The minimum acceptable fee is `GasWanted × minGasPrice`. The genesis price is
**1 ugnot per 1000 gas** — pearl and sapphire both run at that floor (`1ugnot/1000gas`); earlier testnets had drifted
to `10ugnot/1000gas`. Re-query `auth/gasprice` live; the floor moves per chain. At the genesis
price, `GasWanted = 10_000_000` puts the floor at **10,000 ugnot (0.01 GNOT)**. gnomcp does not offer a fixed pair: every write **dry-runs first at a
1B-gas measuring ceiling**, then broadcasts at `GasWanted = measured × 1.5` floored at
`DefaultGasWanted = 10_000_000` (a realm call burns ~1–2M gas, a deploy ~5M — light writes stay on
the floor; a heavy write sizes itself), and offers a fee priced for that GasWanted at the **live
chain gas price × 2** (congestion insurance), floored at `DefaultGasFeeUgnot = 10_000ugnot`.

> **The footgun:** the chain takes the **full offered fee**, not the gas used — an oversized
> `--gas-fee` is real money silently lost on every tx, and under a session it drains the spend
> limit at the same rate. (gnolang/gno #3805, from the maintainers: *"`--gas-fee` is the total for
> the whole tx, deducted in full; overpaying is real money lost."*) Price the fee for the gas the
> tx actually reserves — a small live-price margin is fine, a flat ceiling-sized fee is not.

### Where the price actually lives

`minGasPrice` is **node config** (`min_gas_prices`, grammar `"<amount><denom>/<gas>gas"`, e.g.
`1ugnot/1000gas`), not a constant in the binary — so a different target chain can set a different
price, and the floor moves with it (gnomcp queries the live price per write rather than assuming
the config). gnomcp mirrors the genesis ratio as `minGasPriceDivisor`
and its comment flags that it must change for a chain with a different `min_gas_prices`. Two price
gates exist and BOTH run, in this order: the adaptive EIP-1559-style **block price** first (skipped
only when it is zero or invalid), then the node's static config floor. What `auth/gasprice` returns
is the *block* price — `LastGasPrice`, the price of the last block — not `min_gas_prices`. On both
live testnets it reads `1ugnot/1000gas`, i.e. nonzero, so the block-price gate is active and is the
one a tx hits first; the two happen to coincide there, which is why the numbers agree even though
the mechanism differs.

## Failure modes — tell them apart

Both of these still **cost you the fee** (ante deductions are committed even on a failed DeliverTx),
so distinguishing them matters:

| Symptom | Real cause | When | Fix |
|---|---|---|---|
| `insufficient fees; got {Gas-Wanted:N, Gas-Fee:Mugnot}, fee required {Gas:1000 Price:1ugnot}` | `GasFee/GasWanted` below the price floor | **CheckTx** — rejected before execution, no state touched | Raise `GasFee` to ≥ `GasWanted × price` (or lower `GasWanted`) |
| `out of gas in location: …; gasWanted: N, gasUsed: M` | tx burned more gas than `GasWanted` | **DeliverTx** — executed then aborted; fee gone | Raise `GasWanted` **well** above M — see note |
| `invalid gas-wanted; got: N block-max-gas: 3000000000` | `GasWanted` exceeds the block gas cap | CheckTx | Keep `GasWanted` under the chain's block max (~3B) |
| `insufficient funds to pay for fees` | balance < `GasFee` | CheckTx/DeliverTx | Fund the key, or lower `GasFee` toward the floor |
| `not enough deposit to cover the storage usage: requires D … for B bytes` | storage deposit cap < bytes × storage price | DeliverTx | Raise `--max-deposit` (see Storage deposit) |

**Out-of-gas reports gas-used-*so-far*, not the right limit** (gnolang/gno #3704). Bumping
`--gas-wanted` to just above the reported number fails again — bump comfortably above it, or
simulate to get the real figure.

## Storage deposit — `--max-deposit` (a cap, not a charge)

Persisting bytes on-chain **locks** a deposit = `bytes × storage_price` (default **100 ugnot/byte**,
"1 GNOT per 10 KB"). `--max-deposit` / gnomcp's `DefaultMaxDepositUgnot` is the **maximum you'll let
the tx lock**, not an amount spent. Key facts:

- An **empty** `--max-deposit` does *not* mean unbounded — it falls back to the `DefaultDeposit`
  chain param (**600 GNOT** cap), so a deploy can lock far more than you expect if the realm is large.
- The deposit is **refundable**: when a realm frees storage (state deleted), the proportional locked
  amount is returned. It's a deposit, not a fee.
- gnomcp pins `DefaultMaxDepositUgnot = 10_000_000` (10 GNOT) on **`gno_addpkg` only**; `gno_call`
  and `gno_run` leave it unset (the 600 GNOT param cap applies). A deploy rejected for
  `not enough deposit` is the signal to raise the cap.
- This is distinct from the gas fee and goes to a **different collector** (`vm:p:storage_fee_collector`,
  not the gas `auth:p:fee_collector`). The "insufficient coins" you hit on a starved account is the
  deposit failing *after* the gas fee already drained the balance.

*Continued in `gnokey-2.md`.*
