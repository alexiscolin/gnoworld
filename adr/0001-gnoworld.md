# ADR-0001: gnoworld — a social, on-chain, graphical hub for gno.land

| | |
|---|---|
| Status | Proposed |
| Date | 2026-10-14 |
| Author | Alexis Colin |
| Verified against | `gnoland-1` (mainnet, `v1.5.1`, height 786,583) and `onyx-1` (`v1.5.1-rc.1`, height 385,528), both at commit `07e44776c`; source read at tag `v1.5.1`. Mainnet realms and names read on 2026-10-14 (gnoscope index height 789,357). |
| Prototype | [`r/seal`](../r/seal/seal.gno), [tests](../r/seal/seal_test.gno), [reference client](../tools/sealvec/main.go) |

## Summary

gnoworld is an alternative version of gno.world: a social app for gno.land, not a game.
It rests on four principles:

1. **Social first.** People, conversations and communities come first. Tokens and tools
   serve them.
2. **On chain and decentralized.** Everything that defines the social world lives on
   chain:
   - who you are: names and chat keys;
   - which hubs exist and who may enter them;
   - what was agreed: seals;
   - profiles and follows.

   Message traffic stays off chain, end-to-end encrypted with MLS (RFC 9420) through a
   maintained library. Putting it on chain was measured and ruled out. It moves through
   interchangeable relays that hold no truth. The client is a static site that anyone can
   host. No cryptographic protocol is invented here.
3. **Highly graphical.** One continuous 3D space:
   - gno.land is the sun;
   - hubs are planets, and their rooms are moons;
   - the Earth shows where people are;
   - the chat is docked on every view.

   Every move is a camera move, never a page load.
4. **Integrated with gno, for gno.** gnoworld is built from gno.land's own pieces: names,
   sessions, events, native crypto, gnoweb. It composes live realms (BUBBLE's governor,
   samcrew's DAO and escrow) instead of rebuilding them, so every gnoworld user is a
   gno.land user.

**The core primitive is the seal.** It is a 32-byte Merkle root of a conversation plus both
parties' signatures, verified by the realm. No message reaches the chain unless a user
explicitly publishes or archives it.

**A name is required only where accountability matters**, because names are free and prove
nothing about a person.

**Feasible on mainnet today, with no chain change.**
- A seal costs 3.3–3.8M gas (≈ 0.004 GNOT) and leaves nothing in storage.
- The seal realm is tested on the v1.5.1 toolchain and measured on a local chain built
  from that release.
- An independent audit found two blocking issues, both fixed and covered by tests
  (appendix).
- The hub realm (§8) and the client are not built yet.

## Context

### What is asked

A social app that is on chain and decentralized, highly graphical, and integrated with
gno.land in a way that serves gno.land. It is a place for work and community, with fluid,
"interplanetary" navigation. Explicitly not a game.

### gno.world today

gno.world and bubblerumble.net are the same app, reviewed on 2026-10-13:

- **Mostly server-side.** About 65 `/api/*` endpoints serve chat, rooms and DMs. On
  mainnet the app owns 13 realms under `gno.land/r/g1leu8d2vsplhehcfkjg50mwgdpxdkt8tztu95wr/`:
  - `bubble` (token and governance),
  - `bubblerumble` to `bubblerumble6`,
  - `bubbletreasury`,
  - `wbubble`, `vesting`, `guilds`, `guildsv3`, `kourtv3`.
- **The game has six live versions with different rules.** Together they held
  114,103 GNOT in pots on 2026-10-13. The product has drifted from a game to a chart.
- **The end-to-end encryption does not hold**:
  1. The key directory is on the server. It is looked up by nickname and no signature is
     checked, so the server can swap keys and read everything (man in the middle).
  2. The sender uses a fresh ephemeral key per message, so the sender is never
     authenticated.
  3. The secret key is derived from an Adena signature over the fixed phrase
     `gno.world e2e key v1`, then kept as hex in `sessionStorage`.
- **Other security issues.** The CSP is report-only. The site serves a Windows `gnokey`
  "workshop build".
- **UX issues:**
  - windows overlap on load;
  - French and English mixed under `lang="en"`;
  - jargon is never explained;
  - mobile loads 11.1 MB, with 552 buttons and about 3,000 DOM nodes;
  - the PWA shortcut `/pools` returns 404.

### What fully on-chain messaging costs

Measured on 2026-10-13 on gnodev built from `87f0357fe`, with mainnet gas and storage
prices:

| Message written as | Gas | Storage | Deposit locked |
|---|---|---|---|
| Event only, 216 B or 1,368 B | 1.12–1.13M | 0 | 0 |
| Realm state, 216 B | 3.53M | 2,217 B | 0.222 GNOT |
| Realm state, 1,368 B | 3.80M | 4,394 B | 0.439 GNOT |
| Realm state + base64 check looped in the VM | 15.6M | 4,392 B | 0.439 GNOT |

- **Events work but have structural costs.** Messages as events cost ≈ 0.0015 GNOT
  each, but:
  - the metadata (who, when, size) is public forever;
  - the ciphertext can never be deleted, so it can be stored now and decrypted later;
  - every message waits 4–8 s for a block;
  - every message is a transaction.
- **Storing messages in realm state is ruled out** by the deposit, about 0.3 GNOT per
  message.

### Constraints that shape the design

These are mainnet parameters, read live:

| Parameter | Value |
|---|---|
| Gas price | 1 ugnot per 1,000 gas |
| Storage | 100 ugnot per byte |
| Block | 3,000,000,000 max gas, about 3.65 s |
| `code_submission_policy` | `inert` (new packages wait for an approver) |
| `MsgRun` | allowlisted |
| `tx_index` on the public RPC | off (events are read through `indexer.gno.land`) |

### What already exists on mainnet

Read on 2026-10-14:

- **Names**, `r/sys/namereg/v0` over `r/sys/users`:
  - format `nym-` + 5 to 13 letters + 3 digits, one name per address;
  - confusable spellings blocked (`l/i/1`, `0/o`), reserved prefixes and role names refused;
  - a name grants the namespace `gno.land/{p,r}/nym-…/*`;
  - **price: 0 GNOT.** Series such as `nym-satoshi001` to `003` and `nym-propaganda100` to
    `102`, and names such as `nym-elonmusk000`, are registered. A name is neither Sybil
    resistance nor identity.
- **BUBBLE governance**, `r/g1leu8…/bubble/govern.gno`: `Offer`, `Propose`, `Vote`, `Settle`,
  `Execute`, with votes weighted by holdings.
- **samcrew (Memba):**
  - `memba_dao`, `memba_gov`;
  - `memba_dao_channels_v2`: on-chain, role-gated channels, with public `IsMember` and member
    sync from the DAO;
  - `memba_feed_v1`;
  - `escrow_v4`: milestones, disputes, timeouts, archive with deposit refund;
  - `gnobuilders_badges_v2`.

  Their channels store posts in realm state, so they are public and paid per post.
  gnoworld's rooms are private and off chain, and only sealed. The two complement each
  other.
- **Prior art for the crypto:**
  - `r/moul/x/wesh/v0`: an ed25519-verified identity directory;
  - `p/moul/x/merkle/v0`: the same Merkle tree;
  - `r/moul/agents/relay/v0`: sessions and a ring buffer.

### A reference for the navigation

Dmitriy Dintsen published a design concept for Bubble Rumble on 2026-10-11 (X, 55 s). It
already pairs a cosmos of bubbles with a `bubble | world` toggle that flies to an Earth
with a global chat. Reviewed frame by frame on 2026-10-14, it shows:

1. **One space, no pages.** Cosmos, then a group, then an object, then the Earth, each by
   an uncut camera move. The Earth is a body inside the cosmos.
2. **Semantic zoom.** A planet labelled "6 · Today" is a group; approaching it splits it
   into its members.
3. **Position carries meaning.** "The closer to the star, the sooner it ends."
4. **Context is never lost.** Detail opens in a left panel, the object stays in view, and
   a "‹ Cosmos" breadcrumb leads back.
5. **Chat docked right**, reachable from any view, with live cards of chain objects inside
   messages.
6. **Presence.** "44 people here now · in 24 countries", rooms pinned on the Earth with
   "N here", a flag beside each name, and an opt-in "Show me on Earth".
7. **Transactions inline.** A toast moves through "Approve in wallet", "Landing in a block"
   and the result, while the button turns into its own state. There is no modal.
8. **Creating is a birth.** Presets instead of free inputs; the new planet forms in place,
   then joins its orbit.
9. **A light trail** from an object to the balance chip when value moves.
10. **Restraint.** Filter pills at the bottom, one primary action at the bottom right, a dark
    field, very large thin numerals, one bright accent kept for actions, and the same space
    on mobile with a tab bar.

It is a third party's work: gnoworld takes its navigation patterns, not its visual
identity.

## Decision

### 1. On chain, and decentralized

| Concern | Where | Why |
|---|---|---|
| Identity: names, chat keys, device certificates | Chain: `r/sys/users`, `r/seal.Bind` (§3). The chat key certifies each device's MLS key, so the chain serves as MLS's Authentication Service | Nobody, the app included, can swap who someone is; only the key holder, signing with the address's master key, can bind |
| The map: hubs, with owner, kind, linked realm, place and relays | Chain: `r/gnoworld/hubs` (§8) | Every client, and gnoweb, draws the same cosmos |
| Who may enter a hub | Chain: the realm that defines membership (§8) | The relay enforces it but never owns it |
| Agreements | Chain: `r/seal.Seal` | Proof that two people agreed on a transcript at a block height, provable from block headers alone |
| Private timestamping | Chain: `r/seal.Anchor`; the app anchors a root of all roots, hourly or daily | One transaction for everyone; reveals no participant |
| Profiles and follows | Chain: a profile realm on `r/sys/users` names (phase 1) | Public social state, readable on gno.land without the app |
| Live globe beacons | Chain: a fixed ring buffer realm (phase 1) | Each post evicts the oldest in the same transaction, so storage stays flat (the `r/moul/agents/relay/v0` pattern) |
| Tips, stamps, beacon fees | Chain: the same transaction as the action (`MsgCall` + `MsgSend`) | Token utility with no separate step |
| End-to-end encryption | MLS (RFC 9420), through a maintained library (§12) | A standard with maintained implementations, built for groups; nothing home-made |
| Messages | Off chain, through relays acting as MLS Delivery Services | On chain they would cost 0.0015 GNOT per message as events, or 0.22–0.44 GNOT in state, with metadata public forever (Context) |
| Message authenticity | MLS signs every message with the sending device's key; transcript leaves are hash-chained | The relay can drop or delay messages, which the hash chain makes visible, but cannot forge them |
| Presence, typing, calls, push | Off chain | Ephemeral; no value in consensus |

How the rest stays decentralized:

- **Relays hold no truth and are interchangeable.**
  - MLS messages are end-to-end encrypted, so any relay can carry them.
  - A relay only sees ciphertext, and deletes it once delivered.
  - Each hub record names the relays that carry its rooms, so a DAO can run its own.
  - gnoworld runs the default relay.
  - A P2P transport (weshnet) is evaluated in phase 2.
- **The client is a static site.** Its only server is the Go binary (relay and sponsor,
  §13), so anyone can host it or pin it on IPFS, and point it at any relay.
- **gnoweb is the fallback client** for everything on chain: hubs, seals and profiles render
  as pages.
- **What stays centralized, said openly:**
  - the default relay;
  - `indexer.gno.land` as the live event feed;
  - mainnet's realm approval.

### 2. Transcript and signing format (normative)

All hashes are SHA-256. The tree is the Tendermint simple Merkle tree:
- a leaf hashes as `SHA256(0x00 ‖ leaf)`, an inner node as `SHA256(0x01 ‖ left ‖ right)`;
- the tree splits at the largest power of two below `n`.

This is the tree `crypto/merkle` implements in the VM, and the one `p/moul/x/merkle/v0`
wraps.

```
leaf_i    = salt_i(32 random bytes) ‖ sender_chat_key(32) ‖ i(uint64, big-endian) ‖ leafhash_{i-1}(32, zeros for i=0) ‖ plaintext
            plaintext = the MLS application message content, as delivered
root      = merkle_root(leaf_0 … leaf_{n-1})

bind statement   = "gnoworld/bind/v1|"   ‖ chain_id ‖ "|" ‖ realm_path ‖ "|" ‖ bech32(address)
seal statement   = "gnoworld/seal/v1|"   ‖ chain_id ‖ "|" ‖ realm_path ‖ "|" ‖ root(32) ‖ key_a(32) ‖ key_b(32) ‖ "|" ‖ decimal(n)
                   with key_a < key_b bytewise
device statement = "gnoworld/device/v1|" ‖ chain_id ‖ "|" ‖ realm_path ‖ "|" ‖ bech32(address) ‖ "|" ‖ device_mls_key(32)
                   off chain: carried in the device's MLS credential, checked by clients against KeyOf(address)
```

Per-message signatures come from MLS: each device signs its messages with its own MLS key.
The chat key never signs MLS content, only the three statements above. MLS authenticates
each message, and the seal authenticates the transcript.

Each part of this format closes one hole:

- **The action kind, the chain id and the realm path** keep a signature from being replayed
  as another action, on another network, or against another deployment.
- **Both keys, in a fixed order,** stop someone from pairing a real signature with their own
  key: without them, Carol could submit Alice's signature next to hers and appear as Alice's
  counterparty. The audit found this (R1). The order gives every seal exactly one valid
  encoding.
- **The address inside the bind statement** keeps anyone from publishing someone else's key
  as theirs. `r/moul/x/wesh/v0` uses the same construction.
- **The per-leaf salt** keeps a short message such as "yes" from being guessed from its leaf
  hash when a proof reveals sibling hashes.
- **The leaf hashes are computed over the plaintext**, so one message can be disclosed (to
  moderation, or in a dispute) with its salt and Merkle proof, without disclosing anything
  else.

### 3. Realm API (`r/seal`)

| Call | Effect | Cost (measured below) |
|---|---|---|
| `Bind(pub [32]byte, sig [64]byte)` | Proof of possession; ties the key to `cur.Previous().Address()`. Master key only (refused under a session). A new key retires the previous one. | 3.9M gas + 0.226 GNOT deposit, once |
| `Seal(root [32]byte, n int, a [32]byte, sigA [64]byte, b [32]byte, sigB [64]byte, keep bool)` | Requires `a < b`. Refuses weak and rotated-out keys. Verifies both signatures in the VM and emits `Seal`. With `keep`, stores one record per (root, a, b) and adds it to each key's count. | 3.3–3.8M gas, or 6.2M gas + 0.237 GNOT deposit with `keep` |
| `Anchor(root [32]byte)` | Emits `Anchor` with the submitter's address; names no participant | 1.28M gas |
| `Kept(root, a, b)`, `KeyOf(addr)`, `Seals(addr)`, `Render` | Free reads for gnoweb and other realms | none |

**Byte arguments are decoded by the chain, not the VM.** `MsgCall` decodes `[N]byte`
arguments from base64 natively and enforces their exact length
(`gno.land/pkg/sdk/vm/convert.go`). That removes the ~9,000 gas per character a hand-written
validation loop cost in the messaging prototype.

**Signature checks run in the VM.** `ed25519.Verify` is a native call in `crypto/ed25519`.

**Anyone holding both signatures may submit a seal.** One party pays, or a sponsor does.

**Binding is lazy.** A seal can name a key nobody has bound yet. It becomes attributable
the day its owner binds it: "register later". Until then, that user's devices are
trusted on first use, as with a new Signal contact.

**Binding a new key revokes the old one.** Seals refuse a key whose owner has bound a newer
one, so a stolen key stops working the moment the user rebinds. Device certificates signed
by the old key stop verifying at the same moment, since clients check them against
`KeyOf(address)`.

**One chat key per account, one MLS key per device.** The chat key is the account's
identity key, handed to a new device when it is linked, as Signal does with its identity
key. Each device signs MLS messages with its own key, certified by a device statement. A
shared MLS key is not an option: RFC 9420 §7.3 requires every member's signature key to be
unique within a group.

**Weak keys are refused.** Go's `ed25519.Verify`, which the VM calls natively, accepts the 7
small-order points of libsodium's blocklist. For those points, a signature can be forged
without any private key: we confirmed 10 to 64 forgeries out of 64 messages per point.
`Bind` and `Seal` reject them.

**The chat key signs nothing else.** It signs only the `gnoworld/*` statements of §2: no
MLS content, no data from another app (wesh, other dApps). Any other signer of
attacker-chosen bytes could otherwise be used to forge seals.

### 4. What a user can choose

| Mode | On chain | Publicly visible | Cost to the user |
|---|---|---|---|
| Nothing (default) | Nothing | Nothing | 0 |
| Private seal | Their root inside the app's batched `Anchor` | That the app anchored something | 0 (the app pays once per batch) |
| Signed seal | Root, both keys, both signatures (event) | The two keys, the payer, the time | ≈ 0.004 GNOT |
| Kept seal | The above + stored record + reputation count | Same, readable by realms | + 0.237 GNOT deposit |
| Encrypted archive | The ciphertext as an event (opt-in, permanent) | Payer, time, size | ≈ 1.1M gas per transaction |
| Public excerpt | Chosen plaintext, as a post | Everything | Same as a post |

**One rule for archives:** they are encrypted with HPKE (RFC 9180) under a hybrid
X25519 + ML-KEM KEM, such as X-Wing (IETF draft). The ciphertext lives on chain forever, so
an archive protected by X25519 alone is readable by a future quantum attacker.

The chat itself starts on MLS ciphersuite `0x0001` (X25519, AES-128-GCM, Ed25519) and moves
to a hybrid post-quantum ciphersuite once one is standardized. Its ciphertext never reaches
the chain, and the relay deletes it after delivery, so nothing permanent is left to harvest.

### 5. No wallet popups: session keys (ADR-002)

Sessions are part of v1.5.1 (`tm2/adr/adr-002-session-subaccounts.md`), and mainnet realms
already call `runtime.GetSessionInfo`.

The client creates one session per device:

- `AllowPaths` holds `vm/exec:gno.land/r/<ns>` (one entry covers every gnoworld sub-realm)
  and, if tips are on, `bank/send`;
- `SpendLimit` in `ugnot`;
- `SpendPeriod` of at most 30 days;
- `ExpiresAt`.

Limits are 8 `AllowPaths` entries and 16 sessions per account.

Realms see the master address. `GetSessionInfo` exposes the delegated key when a realm needs
it, a trap `r/moul/agents/relay/v0` documents.

`r/seal` uses it the other way round: `Bind` refuses session-signed calls, so a leaked
session key cannot swap the user's chat key (audit Y3). The one wallet popup at setup
signs a single transaction containing `MsgCreateSession`, `Bind` and, when the user picks a
name, `r/sys/namereg/v0.Register` (§10). Everything after that runs on the session.

### 6. Sponsored transactions

The first signer of a transaction pays its fees (`tm2/pkg/sdk/auth/ante.go`, Phase 2b).
ADR-002 anticipates the case: an empty `SpendLimit` is "useful when another signer pays
gas".

The app's fee account can therefore sign first, and the user's session sign its own
`MsgCall`. A new user then seals without holding GNOT. This is checked in the code only,
not yet exercised (see Phase 0).

### 7. One space, four levels

| Level | Shows | Encodes |
|---|---|---|
| Cosmos | gno.land as the sun, pulsing on each block; hubs as planets | Distance to the sun = public activity in the last hour; size = people present |
| Hub | The planet opens into its rooms (moons) and the people present (satellites) | Moon size = people in the room |
| Room | The room at the centre, its card on the left, its chat on the right | Live cards for the realms, proposals, contracts and seals the room links |
| Earth | A body of the same cosmos; public rooms pinned to places; "N here now · in X countries" | Presence by country, opt-in only |

Navigation rules:

- **Every change is a camera move.** There are no page loads and no cuts. Back is the
  breadcrumb or `Esc`.
- **Semantic zoom.** A planet splits into its rooms as the camera approaches.
- **The detail panel is on the left, and the object stays in view.**
- **The chat is docked on the right at every level.** A chain object pasted into a message
  becomes a live card.
- **A toggle at the top centre switches `Cosmos | Earth`.** These are two lenses on one
  space: switching flies the camera.
- **Filter pills at the bottom** (All, Active, Mine, Saved), and **one primary action at the
  bottom right** (open a hub or a room).
- **Transactions are inline:** sign, then "landing in a block", then the result. There are
  no modals and no optimistic chain effects.
- **Creating a hub is a birth:** presets, then the planet forms in place.
- **A sealed conversation leaves a light trail** to the user's logbook.
- **Mobile is the same space**, with a bottom tab bar.
- **Text lives on panels, never in 3D.** One accent colour is reserved for actions.

**Activity uses public signals only:**
- presence in public rooms;
- calls to the hub's realms;
- its public proposals.

Private-room traffic never moves a planet, or the orbit would show who is talking.

**The space is never the only way in.** The left panel always lists what the 3D shows.
`prefers-reduced-motion` replaces flights with crossfades. Every level is reachable from the
keyboard.

Dropped from the concept: pots, boops, timers, claims and payout bars (the game).

### 8. A hub is a chain identity

| Hub kind | Identified by | Membership read from |
|---|---|---|
| Namespace | A `nym-…` name or a `g1…` namespace | Its owner, plus the people they invite |
| Project | A realm path | Open; the namespace owner moderates |
| DAO | A DAO realm | That realm: `IsMember` (Memba), or token weight (BUBBLE) |
| Place | A city on the Earth | Open |

**The list of hubs is on chain.** `r/gnoworld/hubs` (new) holds one record per hub:
- its owner and kind;
- its reference: a namespace or a DAO realm;
- an optional place, a city-level cell;
- the `wss://` URLs of its relays.

How it works:
- **Creating a hub** is one call by a named user (tier 1, §10). Its storage deposit is the
  anti-spam cost. It is expected near a kept seal's 0.24–0.44 GNOT and will be measured in
  phase 1.
- **The record is an encoded string, not a struct**, the layout that saved 28% of storage
  for kept seals (Measurements).
- **`Render` lists the hubs on gnoweb**, and a `HubCreated` event lets clients grow the
  planet live.
- **Relay URLs are data, never links.** `Render` prints them as code.
- **Project hubs need no record.** They derive from the realm paths that already exist on
  chain, so every realm has a room from day one.

**The chain is the access list.** The relay checks membership with free reads
(`vm/qeval`) when someone joins, and again on membership events. It never keeps its own
list as the truth.

There is one adapter per hub kind. Phase 1 ships open hubs and the BUBBLE balance;
DAO adapters come in phase 2.

`ponytail:` adapters are pinned to a realm version (`escrow_v4`, `memba_dao_channels_v2`).
A new version means a new adapter.

### 9. Rooms

| Room | Encryption | Kept | Sealable |
|---|---|---|---|
| Public (a place, an open hub) | None: public by nature | Never; live only | No |
| Private (DMs, teams, DAO rooms) | MLS group (§1) | On members' devices only | Yes, by mutual opt-in |

Public rooms are moderated on the relay: rate limits, reports, and the name filter.

**Group seals** (k of n members signing one root, for a team decision) are a follow-up
`SealGroup` call. They cost one ed25519 verification per signer and are measured before
being built (phase 2).

### 10. Names, required where accountability matters

| Tier | Features | Requires |
|---|---|---|
| 0 | Browse, fly, read public rooms, DMs | Nothing, not even a wallet |
| 1 | Speak in a public room, create a hub or a team, appear on the Earth, a public seal profile | A name and a bound chat key |
| 2 | Votes, rewards, treasury-paid seals | More than a name: holdings (BUBBLE weight), account age, kept seals with distinct named counterparties, and per-address and global caps |

**Setup.** One Adena transaction holds `r/sys/namereg/v0.Register`, `MsgCreateSession` and
`r/seal.Bind` (§5). It is signed with the master key, as `Register` requires a direct user
call and `Bind` refuses sessions.

**Login has no popup.** The device signs the relay's challenge with its MLS key. The relay
then checks three things by free reads:
- the device statement is signed by the chat key;
- `seal.KeyOf(address)` is that chat key;
- `users.ResolveAddress(address)` returns a live name.

**Display.**
- A name is always shown with an identicon and a short address.
- There is never a "verified" badge.
- Names still pass a display filter, since the format accepts any stem.

**On chain**, only features that are themselves on chain call `users.ResolveAddress`.
`r/seal` stays permissionless: lazy binding is a core property (§3).

**Follow-up:** `r/seal`'s `Render` shows `@name` instead of the address. It is a free read.

### 11. Compose, do not rebuild

| Need | Use | Instead of |
|---|---|---|
| Votes | BUBBLE's governor; a hub's own DAO (Memba) | A gnoworld DAO |
| Paid work, missions | `samcrew/escrow_v4` (milestones, disputes); the negotiation's seal root goes in the contract description | A gnoworld escrow |
| Reputation | Kept seals (`Kept`), gnobuilders badges | gnoworld NFT badges |
| Names | `r/sys/namereg` | gnoworld display names |
| Notarization | `r/seal` | — |

A third-party realm is opened with explicit warnings:
- Adena signs a `MsgCall` on the user's behalf;
- gnoweb's Actions tab is the fallback, and it can attach coins;
- every free-text argument shows "This text goes to {realm} on gno.land, publicly and
  forever";
- every call shows "gnoworld does not check what this realm does".

gnoworld never holds user funds.

### 12. Client and stack

The client is a static TypeScript site and a PWA from day one. It has two layers kept
apart: one imperative three.js scene, and React panels and chat over the canvas. One
Zustand store joins them, so a bug is either in the scene or in the interface. The tooling
follows gnoradio and gnogolf. Every package below was checked on npm on 2026-10-14.

| Layer | Choice | Why |
|---|---|---|
| Language, build | TypeScript 6.0, Vite 8, npm; Node 24 LTS for tooling only (`.nvmrc`) | Static output, no Node in production. TypeScript 7 is out, but typescript-eslint 8.71 supports up to 6.0 |
| Interface | React 19.3 with the React Compiler 1.0 (`@vitejs/plugin-react` 6.1) | Modern React without hand-written `memo`, `useMemo` or `useCallback`. React never runs inside the render loop |
| 3D | three 0.186, used directly (`WebGPURenderer` with its built-in WebGL2 fallback; TSL for glow) | Lighter than React Three Fiber, and profiled directly |
| Camera flights | camera-controls 3.1 | One call per move |
| State | Zustand 5, the framework-free store | Read by the scene and by React |
| Chain data | TanStack Query 5 over `@gnolang/gno-js-client` 3.1 and `@gnolang/tm2-js-client` 3.3 | Cache, shared requests, refresh when an event arrives |
| Validation | Zod 4 (`zod/mini`), at trust boundaries only | Relay, indexer and realm data is checked before use |
| Animation | GSAP 3.15 core, loaded with the 3D | Sequences: a planet's birth, a light trail |
| Wallet | Adena through `@adena-wallet/sdk` 0.1 | Young (0.1.0): its session support is open question 2 |
| Live events | `graphql-ws` 6.4 against `indexer.gno.land` | Subscriptions without a GraphQL framework |
| Crypto | WebCrypto (Ed25519, SHA-256, X25519); ts-mls 1.6 in a Web Worker, behind a thin interface | Crypto never blocks the interface. npm's `openmls-wasm` is a 0.1.0 from 2025-10, not a product; the mainnet library is chosen before phase 3 (open question 7) |
| PWA | `vite-plugin-pwa` 2.0 | iOS delivers push only to an installed app, and an installed app keeps its storage |
| Earth | NASA Blue Marble and Black Marble textures (public domain), as KTX2 | Day and night with city lights; small on the wire |
| Tests | Vitest 5; Playwright 1.64 with `@axe-core/playwright`, desktop and mobile | As gnoradio |
| Lint | ESLint 10 with typescript-eslint 8.71 and `eslint-plugin-react-hooks` 7.1 | The react-hooks plugin carries the React Compiler's rules |

**Performance and debugging:**
- The scene renders on demand, never at 60 fps while nothing moves.
- Planets, moons and people are instanced, so thousands of hubs cost a few draw calls. The
  pixel ratio is capped at 2.
- Loading is staged:
  - the list and the chat first, usable at once;
  - then the 3D;
  - then the Earth's textures;
  - the MLS worker loads at the first private room.
- `?debug` shows frames per second, draw calls and memory. Source maps ship. There is one
  logger.
- Budgets, proposed and confirmed in phase 0, are checked by Playwright in the gate (§14):
  - at most 150 KB of compressed JavaScript before the first usable screen;
  - at most 3 MB in all on mobile, against gno.world's 11.1 MB;
  - 60 fps on a mid-range phone.

**PWA rules:**
- Precache only the app's hashed files; textures are cached on first use.
- Never cache chain reads or relay traffic: the truth is the chain.
- Updates are explicit: "new version, reload".
- The service worker is off in development; `?nosw` unregisters it.
- Push wake-ups carry no content and no sender.
- Offline, history stays readable and sends wait for the network.

Not used:
- React Three Fiber and drei: React stays out of the render loop.
- TanStack Start or any server framework: they need a Node server in production, and
  server rendering adds nothing to a WebGL canvas.
- TanStack Router, for now: there are few screens, and the URL holds the camera state.
- Preact: the React Compiler needs React.
- Apollo, and an i18n library.

### 13. Servers, data and hosting

Two pieces run: the static client and one Go binary.

| Piece | Host | Notes |
|---|---|---|
| Client (`dist/`) | Netlify (free plan); also publishable on IPFS | `_headers`: a strict CSP; hashed files cached forever; `index.html` and `sw.js` always revalidated |
| Go binary, relay role | A small always-on server | WebSockets, presence, membership reads, push, link previews for `/h/<hub>` |
| Go binary, sponsor role | The same binary, separable later | Co-signs app-paid fees and sends the daily `Anchor` |

The relay is Go: the stdlib, `github.com/coder/websocket`, and `gnoclient` for membership
reads.

The sponsor's app key lives in a hot wallet:
- a small balance, refilled from the treasury;
- per-user and daily caps.

That key never reaches the client.

Where each piece of data lives:

| Data | Where | Why |
|---|---|---|
| Names, keys, hubs, seals, profiles, follows | The chain | The public source of truth |
| Message history, private keys, MLS group state, drafts | The device (IndexedDB) | End-to-end encrypted: no server keeps history. A new device gets it device to device, encrypted |
| Messages waiting for an offline device | The relay, encrypted | Deleted on delivery or after a delay (for example 30 days) |
| MLS KeyPackages (one-time public keys) | The relay | Signed by the device; too many small one-time writes for the chain |
| Push subscriptions, sponsor counters, public-room reports and bans | The relay | Small operational state |
| Presence, typing | The relay's memory | Ephemeral |
| Chain events | `indexer.gno.land` | We run no indexer |

The relay's store is SQLite: one file, through the pure-Go `modernc.org/sqlite`. It is
inspected with `sqlite3` and backed up by copying the file. It never holds plaintext or
history.

`ponytail:` one relay instance holds thousands of connections. Several instances would move
SQLite to Postgres and join the instances through NATS or Redis pub/sub.

Hosting at 0 € for phase 0:
- the client on Netlify's free plan;
- the relay on the server that already runs gno.world, or on a laptop behind Cloudflare
  Tunnel;
- the chain on onyx, funded by its faucet.

Checked on 2026-10-14: no free tier gives an always-on server with a persistent disk.
- Render's free plan sleeps after 15 minutes and has no disk for new accounts.
- Fly.io has had no free tier since 2024-10.
- Koyeb needs a card and has no volume.
- Oracle's Always Free may stop idle VMs.

A public launch costs 2–5 $ a month.

### 14. Engineering practice

As in gnoradio and gnogolf:

- **Test first.** Every change starts with a failing test: a `gno test` or filetest for a
  realm, a Vitest test for the client or the relay, a Playwright step for a flow. `r/seal`'s
  mutation check is the bar: removing a guard fails a test.
- **One gate.** `scripts/check.sh` runs everything that must pass before a commit or a
  deploy, and CI runs the same script. It stops at the first failure:
  - realm lint and tests on the onyx-matched toolchain;
  - the gas and storage goldens;
  - the deployed packages, staged byte for byte;
  - typecheck, lint, and unit tests with a coverage floor;
  - the build and its budgets.

  `--smoke` adds the Playwright run against gnodev, which runs offline and fails on any
  console error.
- **Gas and storage goldens.** Filetests pin each call's gas and storage. A golden moves
  only when the change explains it.
- **Data apart from rules**, as gnoradio's `data` and gnogolf's `store` realms. A permanent
  store realm holds bindings, kept seals and hubs. Versioned rules realms (`seal/v1`,
  `hubs/v1`) write it, so a new release never moves data. Signatures stay bound to the rules
  realm's path, through the domain of §2.
- **The harness:**
  - `CLAUDE.md`;
  - `.claude/settings.json` with attribution off;
  - a `commit-msg` hook that refuses attribution lines;
  - `docs/DEVELOPMENT.md` and `docs/DEPLOY.md`.
- **Small slices.** The proof of concept moves one slice at a time: planned, tested,
  checked and reviewed before the next.
- **Strict TypeScript** (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  typescript-eslint's `strictTypeChecked`), with the working rules in `CLAUDE.md`.
- **Review by risk, and pairing:** `docs/REVIEW.md` and `CLAUDE.md`.

## Feasibility, verified

| Requirement | Mechanism | Evidence | Status |
|---|---|---|---|
| Ed25519 verification in a realm | `crypto/ed25519.Verify` | In the v1.5.1 stdlib; imported by live mainnet realms (`r/moul/x/wesh/v0`, `r/samcrew/memba_quest_attestation_v1`); `r/seal` tests and gnodev transactions | ✅ |
| Client tree = chain tree | Tendermint simple Merkle | `TestMerkleCompat`: the Go client's root equals `merkle.HashFromByteSlices` in the VM; `VerifySimpleProof` accepts leaf 1 and rejects a swapped leaf | ✅ |
| Binary arguments without VM parsing | Native base64 → `[N]byte` | `convert.go` at v1.5.1; used by every `r/seal` call | ✅ |
| Statement integrity | Every field inside the signed statement | A seal with `n` altered from 3 to 4 is refused: `bad signature` (simulation) | ✅ |
| Domain separation | `runtime.ChainID()`, `cur.PkgPath()` in the statement | By construction only: the vectors are signed for chain id `dev`. Phase 0 submits one on onyx and expects `bad signature` | ⏳ phase 0 |
| Proof of key possession | Bind statement includes the caller | `TestBind`: Alice's signature submitted by Bob is refused | ✅ |
| No splicing of signatures | Both keys in the seal statement | `TestSeal` and a gnodev simulation: Alice's signature paired with Carol's key → `bad signature` | ✅ |
| Weak keys refused | libsodium small-order blocklist | `TestWeakKeys`: all 7 points, plus a sign-bit variant, through `Bind` and `Seal` | ✅ |
| Revocation by rotation | `Seal` refuses rotated-out keys | `TestRotationRevokes` | ✅ |
| Bind refused under a session | `GetSessionInfo` | Code only: the `testing` stdlib cannot fake a session | ⏳ phase 0, on onyx |
| Replay of kept seals | Dedup by (root, a, b) | `TestSeal`: `already sealed` | ✅ |
| Every guard is tested | Mutation check, automated in the gate (`scripts/mutate.py`): every guard found in a realm, and each branch of an "or" condition, is removed in turn | Known gaps are listed there with their reason; slice 1 closes those a local test can reach | ⚠️ gaps listed |
| Popup-free signing | Sessions (ADR-002) | Code at v1.5.1; `GetSessionInfo` in use on mainnet | ✅ code, ⏳ not yet exercised by us |
| App-paid fees | First signer pays | `ante.go` Phase 2b; ADR-002 text | ⏳ code only |
| Reading events | `indexer.gno.land` GraphQL | Public RPC `tx_index` is off (checked 2026-10-13) | ✅, single provider |
| Proving a seal outside gno.land | The transaction in block H's `DataHash`; its result, events included, in block H+1's `LastResultsHash` | `tm2/pkg/bft/types/results.go`: `ABCIResult` holds `Error`, `Data` and `Events`; VM events carry their `pkg_path` (`gnovm/stdlibs/chain/emit_event.go`) | ✅ code, ⏳ no verifier built |
| End-to-end encryption | MLS (RFC 9420); ts-mls in phase 0 (§12) | Standard chosen; library on npm (1.6.4); not yet integrated | ⏳ phase 0 |
| Client stack | npm packages and their peer ranges | Checked 2026-10-14: Vite 8 with `vite-plugin-pwa` 2.0 and `@vitejs/plugin-react` 6.1 + React Compiler 1.0; typescript-eslint 8.71 caps TypeScript at 6.0 | ✅ on paper, ⏳ phase 0 |
| Hub list and membership reads | `r/gnoworld/hubs`; `vm/qeval` on membership getters | Realm not built; the getters exist on mainnet (`memba_dao_channels_v2.IsMember`, `users.ResolveAddress`) | ⏳ phase 1 |
| Deploying | `inert` policy | Mainnet needs an approver; onyx auto-approves in seconds | ⚠️ approval process on mainnet |
| Verifying a wallet (secp256k1) signature in a realm | none | No `crypto/secp256k1` in the v1.5.1 stdlib | ❌ worked around: ed25519 chat keys + `Bind` transaction |
| Paid actions from a gnoweb page | `<gno-form>` | No coin field in `gnoweb/markdown/ext_forms.go` at v1.5.1 | ❌ worked around: app UI, or gnoweb's Actions tab |

## Measurements

The setup:

- **Chain:** gnodev built from tag `v1.5.1` (`07e44776c`, the release mainnet runs).
- **Signer:** the built-in `test1` account, through gnomcp's `local` profile.
- **Fee at floor** = gas × 1 ugnot / 1,000 gas. Wallets add margin on top (gnomcp sets ×2).
- **Deposit** = bytes × 100 ugnot, read from each block's `StorageDepositEvent`.

Final code:

| Operation | Gas | Fee at floor | Storage | Deposit |
|---|---|---|---|---|
| `Bind` (first; creates the trees) | 3,881,549 | 0.0039 GNOT | 2,262 B | 0.226 GNOT |
| `Seal`, event only, keys not bound | 3,255,548 | 0.0033 GNOT | 0 | 0 |
| `Seal`, event only, one key bound | 3,756,488 | 0.0038 GNOT | 0 | 0 |
| `Anchor` | 1,275,544 | 0.0013 GNOT | 0 | 0 |
| `Seal`, kept (first; creates the trees) | 5,361,931 | 0.0054 GNOT | 4,357 B | 0.436 GNOT |
| `Seal`, kept (steady state) | 6,213,124 | 0.0062 GNOT | 2,373 B | 0.237 GNOT |
| `Seal` with an altered `n`, or with a spliced signature | rejected in simulation | 0 | 0 | 0 |

Variants measured on the way:

| Variant | Gas | Storage | Outcome |
|---|---|---|---|
| Pre-audit `Seal`, event only (no key checks, keys not in the statement) | 1,945,730 | 0 | Insecure (R1); the audit fixes cost +1.3–1.8M gas |
| Weak-key list built at call time (`hex` + `strings.Repeat`) | 6,177,538 | 0 | Replaced by constant byte strings: −2.4M gas |
| Kept record as a struct instead of a string | 5,486,045 | 3,115 B | Replaced by an encoded string: −873 B |

What the numbers say:

- **A signed seal costs ≈ $0.00026** (GNOT at $0.0691 on 2026-10-13). A daily `Anchor`
  covering every conversation costs the app 0.0013 GNOT a day, whatever the number of
  users.
- **Interpreted code costs far more than native calls.** Building seven 32-byte strings per
  call cost more than two ed25519 verifications. Constants are folded before execution, so
  lookup tables belong in `const`.
- **Storage is billed per object, not per byte.** Storing the record as an encoded string
  instead of a struct saved 873 B (−28%). This matches the ~780 B per live object that
  `r/moul/agents/relay/v0` reports.
- **Kept seals stay a paid extra.** The default seal never touches storage.
- **A seal is provable outside gno.land, its event included.** The transaction sits in
  block H's `DataHash`. Its result sits in block H+1's `LastResultsHash`: tm2's
  `ABCIResult` holds the error, the data and the events. A light client therefore proves
  inclusion *and* success, and reads the `Seal` event with the `pkg_path` of the realm that
  emitted it. That rules out a look-alike event from another realm. Realm state is not
  covered, as `p/moul/x/merkle/v0` documents, so the kept record serves realms, not outside
  proofs.

## Interest compared with gno.world

| gno.world today | gnoworld |
|---|---|
| Unsigned server key directory, so the server can read DMs | Keys bound by a signed transaction, or verified client-side against a wallet signature before binding; the server cannot swap them |
| Home-made encryption | MLS (RFC 9420) through a maintained library |
| No sender authentication | Every message signed by its device (MLS) and hash-chained; drops and reorders are visible |
| Key derived from a fixed-phrase wallet signature, hex in `sessionStorage` | Random keys generated on the device, never derived from a reusable signature |
| All history and metadata on the server | Off chain and deletable; the chain holds identity, hubs and the seals users chose |
| Overlapping windows, 552 buttons on mobile | One space, one panel, one chat, one primary action |
| On-chain activity is games with six rule sets | On-chain activity is identity, hubs, seals, social state and paid actions: utility, not speculation |
| A wallet popup per action | One session per device, then no popups |
| BUBBLE has governance and a treasury | BUBBLE's governor runs hub votes; BUBBLE and GNOT pay for stamps (cold DMs), tips and globe beacons, and open rooms gated by token balance or by kept seals with trusted members (never the raw count) |

**What to keep:** the globe, rooms, the PWA, the BUBBLE token and its holders. The
`bubbletreasury` (478 GNOT on 2026-10-13) is a natural sponsor budget for new users' first
seals.

## What gno.land gets

- **Every realm gets a community.** Each realm path has a room where its users and authors
  meet, and a realm's `Render` can link to it.
- **Discovery.** The cosmos shows which hubs and realms are active right now, from public
  on-chain activity.
- **Names in daily use.** `nym-` names become the handles people see all day. That gives
  `r/sys/namereg` a use beyond deploy namespaces.
- **On-chain traffic that is real use, not speculation:**
  - binds, seals and hub creations;
  - profile updates;
  - votes and escrow calls through existing realms.
- **A shared front door.** BUBBLE governance and samcrew's realms gain users without
  building their own social layer.
- **Platform features exercised together**, at the scale of real users. gnoworld would be
  the first consumer app to do so:

| Platform feature | Usage today | What gnoworld proves or breaks |
|---|---|---|
| Sessions (ADR-002) | A few mainnet realms | Device sessions, spend limits and expiry in a public app |
| `crypto/ed25519`, `crypto/merkle` | Few callers (`p/moul/x/merkle/v0` reports zero before it) | Native crypto in a hot path, with gas under load |
| Events + indexer | Explorers | Indexer latency and completeness as a product dependency |
| Sponsored multi-signer transactions | No known app | The onboarding path for users who hold no GNOT |
| `r/sys/users` names | Registrations | Names as social handles |
| Realm reads as access lists | None known | `vm/qeval` on third-party getters as an app's authorization path |
| Storage deposits | Developers | Social-state economics, ring buffers, refunds |
| Inert approval | Core team | The flow from a third-party team's side |
| gnoweb | Docs and demos | A fallback client: hubs, seals and profiles render as pages |

Each row becomes a measurement and, where something breaks, an upstream issue or ADR.
Metrics to collect from the first day:

- gas per action;
- session creations and revocations;
- sponsored transactions;
- indexer delay from block to client;
- approval delay.

There is also an ecosystem tie: `r/moul/x/wesh/v0` is an on-chain directory for
weshnet/Berty identities. Weshnet as a P2P transport (phase 2) would remove the need for
a relay and connect two gno-family projects.

## What the chain needs

Gaps found while building this. Each comes with what it costs gnoworld today.

1. **No secp256k1 verification in the VM.** A realm cannot check a wallet-signed off-chain
   statement, so every user needs a second key type and a `Bind` transaction. A native
   `crypto/secp256k1.Verify`, ideally with the sign-message envelope Adena uses, would make
   registration free and lazy all the way down.
2. **No tooling for sponsored transactions.** The protocol supports them (first signer
   pays). Phase 0 checks whether gnoclient or Adena can assemble and co-sign one. If they
   cannot, this is the single biggest onboarding gap for consumer apps.
3. **Events depend on one indexer.** The public RPC has `tx_index` off. A real-time app's
   read path depends on `indexer.gno.land`, so a documented, redundant event API is needed.
4. **Realm state cannot be proven outside gno.land.** Transactions and their results,
   events included, can be proven (`DataHash`, `LastResultsHash`). Every primitive that must
   be provable outside gno.land therefore has to surface as transaction arguments or
   events, as `Seal` does. A documented light-client proof format for events would make
   this usable by every app.
5. **Per-object storage overhead.** About 780–870 B per live object is invisible to authors
   until measured. Lint guidance or a cheaper object encoding would change what social
   realms can afford.
6. **The inert approval process on mainnet.** Third-party teams need a predictable path and
   delay to get a realm, and each new version of it, enabled.
7. **`<gno-form>` cannot attach coins.** Paid actions cannot start from a gnoweb page.
8. **`crypto/ed25519.Verify` accepts small-order keys.** It wraps Go's cofactorless
   verify with no small-order check, so a signature can be forged without any private key
   for those points (confirmed above). Every realm that treats a signature as proof of
   possession must ship its own blocklist; `r/moul/x/wesh/v0` is worth checking for the
   same gap. A `VerifyStrict`, or at least a warning in the stdlib doc, would close it for
   everyone.
9. **Session guards cannot be unit-tested.** The `testing` stdlib has no way to fake a
   session, so a realm's "not under a session" check only gets tested on a live chain.

## Alternatives considered

1. **Messages in realm state.** Rejected: 0.22–0.44 GNOT deposit per message.
2. **Messages as events.** Feasible at ≈ 0.0015 GNOT per message. Rejected as the default:
   permanent public metadata, ciphertext that can be decrypted later, 4–8 s latency, and a
   transaction per message. Kept as the opt-in archive.
3. **The current server-centric design with the encryption fixed.** Cheapest, but nothing
   becomes verifiable and gno gains nothing.
4. **Each party seals with its own transaction, without verifying signatures in the VM.**
   Two transactions, two payers, no sponsor. Rejected for UX.
5. **Weshnet P2P transport now.** No relay to trust. Deferred to phase 2 to keep phase 0 on
   a transport the team already runs.
6. **Kept seal record as a struct.** Measured at +873 B per seal. Rejected.
7. **Home-made end-to-end encryption.** This covers gno.world's current scheme and a custom
   X25519 + ML-KEM exchange. Rejected for MLS, a standard with maintained implementations.
   Also set aside:
   - libsignal: AGPL-3.0, and groups are built over pairwise sessions;
   - Matrix: Megolm, plus a homeserver that keeps room history;
   - XMTP: built on MLS, but ties identity to Ethereum-style accounts.
8. **The bound chat key as every device's MLS key.** Rejected: RFC 9420 requires unique
   signature keys within a group, and it would mix MLS signing with seal statements.
9. **gnoworld's own DAO, escrow and badges.** Rejected: BUBBLE's governor and samcrew's
   realms already run on mainnet (§11).
10. **Channels stored on chain, as Memba does.** Public and paid per post; kept for what
    must be public, not for conversation.
11. **An IRC gateway, as gno.world runs today** (port 6667, rooms reachable from any IRC
    client, bridges to Libera and others). Rejected:
    - it serves none of the four principles;
    - IRC nicknames are unverified, while identity here is anchored on chain;
    - it is a second protocol to moderate;
    - gno.world's version exposes "private" rooms in plaintext.

    It could return as a TLS gateway for public rooms only, if gno.world's logs show real
    IRC users.
12. **A server framework (TanStack Start, Next.js server mode).** Rejected: a Node server in
    production, against the static-client principle, and server rendering adds nothing to a
    WebGL canvas.
13. **React Three Fiber and drei.** Rejected: React would run inside the render loop, which
    makes the scene heavier and harder to profile.
14. **A managed realtime service (Ably, Pusher, Cloudflare).** Possible, since messages are
    end-to-end encrypted. Rejected: membership checks on the chain and the sponsor key cannot
    live there, it locks us in, and a DAO could no longer run its own relay.

## Security considerations

- **Relay.** It can drop, delay or reorder messages. Sequence numbers and hash chaining make
  each of these visible. It cannot read or forge messages. It does see metadata: who talks
  to whom, when, and from which IP. It deletes ciphertext once delivered.
- **Client.** Keys live in the browser, so an XSS on the app steals them. An enforced strict
  CSP is required; gno.world's is report-only today. A stolen device is handled by binding a
  new chat key, which revokes the old key and every device certificate it signed.
- **Chain observers.**
  - A signed seal reveals the two chat keys, the payer and the time.
  - A private seal reveals only that the app anchored a batch.
  - Nothing reveals content.
  - Planet positions use public signals only (§7), so the cosmos does not leak private
    activity.
- **Counterparty.** They can disclose messages they received, as with any messenger. With
  seals the disclosure is provable but limited to what they reveal.
- **Signature splicing is blocked.** The statement names both keys in a fixed order, so a
  signature only verifies next to the counterparty it was made for.
- **Roots cannot be squatted.** Kept seals are stored per (root, a, b). Someone who learns a
  root can only file their own pair under it, never block the real pair's record. `Render`
  lists at most 10 records per root and tells readers to check the pair they care about.
  Realms query the exact pair with `Kept`.
- **Weak keys are refused** in both `Bind` and `Seal`.
- **Seal counts and names are open to Sybil attacks.**
  - One person can seal between two of their own keys, at ≈ 0.24 GNOT per +1.
  - Names are free.
  - Neither is proof of humanity. Realms gate on `Kept` with counterparties they trust, never
    on the raw count. Tier 2 features never rely on a name alone (§10).
- **Event seals can be replayed.** They are stateless, so a replay only re-emits an event,
  and the indexer deduplicates by (root, a, b). Kept seals are deduplicated on chain.
- **Key rotation and revocation.** Only the address's master key can bind (sessions are
  refused), so neither a third party nor a leaked session can roll a binding back or swap
  the key. Binding a new key revokes the old one for future seals. Past seals stay
  attributed to it, which is historically correct.
- **Third-party realms.** gnoworld calls them on the user's signature and never holds funds;
  each call carries the warnings of §11.
- **Sponsor key.** It lives only on the server, in a hot wallet with a small balance and
  per-user and daily caps (§13). Stealing it costs at most that balance.
- **Push.** Wake-ups carry no content and no sender, so Apple and Google learn only that a
  device got something.
- **Post-quantum.** Archives use HPKE with a hybrid KEM (§4). The chat's MLS ciphersuite is
  classical for now, and its ciphertext is never stored on chain. An Ed25519 seal forged in
  the future could not be backdated before its block height.
- **Render** uses the path only as a lookup key and never echoes it. Relay URLs in hub
  records render as code, never as links.
- **Audit status.** `r/seal` is self-reviewed against the gno security classes and has had
  an independent `gno-auditor` pass. Every finding is fixed (see the appendix). It is not
  externally audited; that is required before mainnet. `r/gnoworld/hubs` gets the same
  treatment in phase 1.

## Consequences

**Positive:**
- Chat is free and instant, and private by default, on standard cryptography.
- One coherent place: the chain gives identity, access and proofs, and relays only move
  ciphertext.
- The chain gets a small set of verifiable primitives.
- Token utility attaches to real actions.
- It grows the ecosystem by composing it: names, BUBBLE governance, Memba DAOs and escrow
  get a shared front door.
- gno gets a consumer dogfood covering:
  - sessions, native crypto and sponsored transactions;
  - indexers;
  - names as handles;
  - realm reads as access lists.

**Negative:**
- One Go binary to operate (relay and sponsor), at least the default one, besides the static
  client.
- Three kinds of keys per user: the wallet, the chat key, and one MLS key per device. Only
  the wallet is visible to the user. The chat key would merge into the wallet once
  secp256k1 lands in the VM.
- An MLS library and a 3D scene in the client, both to be measured against
  gno.world's mobile budget. The list view is the fallback, and reduced motion is honoured.
- Third-party realms version by path, so each adapter is pinned and must follow new
  versions.
- Reliance on one indexer.
- Mainnet deploys wait for approval.
- Public rooms need moderation and carry legal exposure. Disputes are settled from
  user-disclosed proofs, never from server plaintext.
- Free names do not stop Sybils.

## Rollout

- **Phase 0, onyx.**
  - First the harness and the gate (§14), on 0 € hosting (§13).
  - Split `r/seal` into its store and `seal/v1` (§14), test first, then deploy it (onyx
    auto-approves).
  - Web client, a PWA from the first build:
    - chat key and device keys in the browser;
    - one Adena session per device;
    - MLS (ts-mls) over the existing relay;
    - hash-chained transcripts and a "Seal" button.
  - Navigation prototype (cosmos, hub, room, Earth) on placeholder data, with the chat
    docked and inline transaction states for `Bind` and `Seal`.
  - Prove a sponsored transaction end to end.
  - Submit a `dev` vector on onyx and expect `bad signature` (domain separation).
  - Exit criteria:
    - three people seal from three devices with no wallet popup after setup;
    - one seal is verified from block headers alone.
- **Phase 1, social.**
  - `r/gnoworld/hubs` on onyx: tested, audited and measured like `r/seal`.
  - Hubs from chain identities (namespaces, realm paths).
  - The static client, hostable by anyone, with the relay chosen per hub.
  - Name tier 1 and moderated public rooms.
  - Opt-in Earth presence.
  - Profile realm on `r/sys/users` names, with posts and follows.
  - Globe beacons as a ring buffer.
  - Tips and stamps in the same transaction.
- **Phase 2, depth.**
  - DAO adapters (BUBBLE, Memba), and rooms gated by BUBBLE balance or by kept seals with
    members the room trusts (`Kept`), never by the raw `Seals()` count.
  - Escrow cards.
  - Group seals, measured first.
  - Encrypted archives (HPKE, hybrid post-quantum KEM).
  - Evaluate weshnet as a P2P transport for the same MLS messages.
- **Phase 3, mainnet.**
  - External audit.
  - Register the `gnoworld` namespace so one session `AllowPaths` entry covers everything.
  - Submit for approval.
  - Migrate gno.world users, keeping BUBBLE.

## Open questions

1. Sponsor budget: `bubbletreasury`, a GovDAO grant, or a per-user cap?
2. Does Adena expose `MsgCreateSession` today, or does phase 0 need a gnokey or extension
   path?
3. Should `Seal` accept a tip in the same call (payable), or keep a separate `MsgSend` in the
   same transaction?
4. Should kept seals be deletable, to refund the deposit, and by whom?
5. Moderation and legal: who moderates public rooms, under which jurisdiction? Who receives
   reported proofs, and what is the retention policy on the relay?
6. Linking and backup: how does the chat key reach a new device (a QR code, then an
   MLS-encrypted transfer, as Signal does), and how is it backed up? Losing it loses the
   history, not funds.
7. Which MLS library ships to mainnet: ts-mls (used in phase 0) or OpenMLS built to
   WebAssembly? Audit status and weight decide. gno.world loads 11.1 MB on mobile today.
8. Should we contact the author of the design concept, to credit them or work together?
9. Which DAO adapter comes first: BUBBLE or Memba?
10. Who maintains the name display filter?
11. Should a hub be able to hide from the cosmos (unlisted), while staying reachable by link?
12. Where does the relay run in phase 0: on the server that runs gno.world, or on a laptop
    behind Cloudflare Tunnel?
13. Under which namespace do the onyx deploys go: the owner's `nym-` name (signed with the
    owner's key) or the agent key's own address?

## Reproduce

The toolchain that matches the chain is built as `docs/DEVELOPMENT.md` describes.

```bash
cd ~/Server/gnoworld
./scripts/check.sh                       # realm tests, mutation check, test vectors
"$GNO_TOOLCHAIN/gnodev" local -no-watch  # then call Bind, Seal and Anchor with r/seal/vectors_test.gno
```

## References

- `tm2/adr/adr-002-session-subaccounts.md`, `tm2/pkg/sdk/auth/ante.go` (v1.5.1)
- `gno.land/pkg/sdk/vm/convert.go`, `gno.land/adr/pr5888_phase2_inert_packages.md` (v1.5.1)
- `gnovm/stdlibs/crypto/ed25519`, `gnovm/stdlibs/crypto/merkle`, `gnovm/stdlibs/chain/runtime` (v1.5.1)
- `tm2/pkg/bft/types/results.go`, `gnovm/stdlibs/chain/emit_event.go` (v1.5.1)
- RFC 9420 (MLS), RFC 9180 (HPKE), X-Wing hybrid KEM (IETF draft), ts-mls, OpenMLS
- Mainnet:
  - `r/moul/x/wesh/v0`, `p/moul/x/merkle/v0`, `r/moul/agents/relay/v0`;
  - `r/sys/namereg/v0`, `r/sys/users`;
  - `r/g1leu8d2vsplhehcfkjg50mwgdpxdkt8tztu95wr/bubble`;
  - `r/samcrew/memba_dao_channels_v2`, `r/samcrew/escrow_v4`, `r/samcrew/memba_feed_v1`.
- Dmitriy Dintsen, Bubble Rumble design concept, X, 2026-10-11
- Prior study (private): gno.world on-chain feasibility, 2026-10-13

## Appendix: independent audit

The `gno-auditor` agent ran on 2026-10-14 against the pre-fix code. It is read-only and
uses the procedure in gnomcp's `references/audit.md`. Verdict: **BLOCK**, two RED and four
YELLOW findings. Each finding was confirmed before it was fixed: R1, R2 and Y4 by reading
the code, Y1 by forging signatures (see above). Each fix has a test.

| # | Finding | Fix | Test |
|---|---|---|---|
| R1 | The seal statement did not name the keys, so a real signature could be paired with any other key | Both keys in the statement, `a < b` enforced | `TestSeal` (spliced signature → `bad signature`), gnodev simulation |
| R2 | Kept seals deduplicated by root alone, so whoever learned a root first could block it for good | Records keyed by (root, a, b); `Render` bounded to 10 | `TestSeal` (`Kept(r, a, c)` absent, `already sealed` only for the same pair) |
| Y1 | Small-order public keys accept keyless forged signatures | libsodium blocklist, as constants, in `Bind` and `Seal` | `TestWeakKeys` (all 7 points + a sign-bit variant) |
| Y2 | `Seals()` can be farmed; realms had no way to weigh counterparties | `Kept(root, a, b)` getter; the ADR forbids gating on the raw count | `TestSeal` |
| Y3 | A session key could rebind the user's chat key | `Bind` refuses calls signed by a session | Not testable in `gno test`; phase 0 on onyx |
| Y4 | A stolen chat key could not be revoked | Binding a new key retires the old one in `Seal` | `TestRotationRevokes` |
| nit | `Anchor` did not name its submitter | `by` attribute on the event | — |

The auditor ran its false-positive filter in its own context, so its anchoring bias is not
eliminated. It suggests a fresh-context re-check of R2 and Y4 before mainnet. The external
audit in phase 3 covers that.
