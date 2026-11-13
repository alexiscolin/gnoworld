# The owners' moderation, with linked accounts

Decisions: D391 (a deployer's claim is a later part: this is it), D13927, D13928, D13930 (first of the big parts), D13933
(`@cosmjs/crypto`), all in `docs/decisions.md`. The proposal Alexis approved (its security table and "Triple check" bind this
plan): https://claude.ai/artifact/2KjXggbZgsXp5muPP7kT8Q. Written 2026-11-11 by reading the code named below; nothing here is
built. A chain fact that is not read in this session is marked "to verify" with the way.

## 1. What is built, in one paragraph

A person links several addresses (a second Adena account, a command-line key) to one identity, each proven by a signature and
never by moving a key. A world's rooms are moderated by whoever holds the room's namespace on the chain, from any address of
that person's identity. The server reads the holder on the chain when it checks a right (cache 60 s at most, a failed read
refuses). A link grants moderation of worlds and nothing else: `isTeam`, the roles file and the admin console stay keyed by the
exact logged-in address.

## 2. What the code does today (read, with `file:line`-level places)

- **Login** (`server/src/login/login.ts`): `makeSigned` writes the text a wallet signs and keeps it in `nonces`
  (`nonce, chain, host, text, action, expires_at`). A login's nonce is spent by `DELETE ... WHERE action IS NULL RETURNING`, an
  admin change's by `... action IS NOT NULL`, both before the first `await`; the verifier gets the signer, the chain and the stored
  text (`verifyArbitrarySignature`). The cap of pending nonces is global (100,000); the TTL is a fixed 5 minutes.
  `Login.signedAt(token)` is the session's signing time (D13985): the "fresh proof" this plan needs already exists.
- **Rights** (`server/src/roles/roles.ts`, `roles.json`): read once at start. `moderates(roles, who, slug)` is `isTeam || world.moderators`
  and only for a world the file lists. Callers: `mayCreateRoom` (rooms routes: create, archive), `staffOf` in `rooms/types.ts`
  (hidden rooms in lists, Ergo invites and voices in the reconciler, `pins/wire.ts`'s `mayPin`). The Earth has no namespace.
- **What a person with rights can do today** (to find, not to invent): pin and unpin a line (`pins/routes.ts`), create and archive
  rooms of a roles-file world (`rooms/routes.ts`), see hidden rooms, speak in an announcement room (Ergo voice from the reconciler).
  Hiding a line and muting an account are the bot's, never a person's; no route names moderators (the file does).
- **Rooms and worlds**: a room's world is `worldOf(room)`; a realm's room is `#<world>[/<tail>-<hex>]` and the realm's path is in
  `realm_rooms.path` (`rooms/rooms.ts`'s `realmPaths`); a hub's world comes from `hubWorlds` (`prices/universes.ts`) and core's
  `worldIdOf`/`hubWorldOf` (`packages/core/src/cosmos/worldId.ts`: a world id is `namespace/folder`). Realm rooms are untyped, so open.
- **Chain read**: `chainHas` (`rooms/onChain.ts`) and `abciQuery` (`worlds/remote.ts`) give timeout, size cap and "down" vs "no";
  `packages/core/src/chain/evalName.ts` already builds `gno.land/r/sys/users.ResolveAddress(address("g1…")).Name()` (one builder,
  never a given expression) and `packages/chain/src/asks.ts`'s `nameAsk` wraps it. The default universe is **onyx-1, a testnet**
  (`app/data/universes.json`), not gnoland-1.
- **What a room shows of who moderated**: `PinnedLine` (`packages/schemas/src/pins.ts`) has the line's author only; `pinned_by` is
  stored, never sent. An archive shows no actor. So today no moderation action shows its actor in a room. The log lines
  (`pin_added`, `pin_removed`, `room_archived`) carry the acting `account`. Answer to the proposal's open question: **no, and the
  plan keeps it so** (a test pins it, section 8).
- `@cosmjs/crypto@0.39.0` is already in `pnpm-lock.yaml` (transitive); the server does not declare it.
- `gno.land/r/sys/users` on gnoland-1, read through gnomcp this session: `ResolveName(name string) (*UserData, isCurrent bool)`
  returns nothing for a deleted name and `isCurrent` is `name == data.username`; `ResolveAddress(addr)` gives the latest data.

## 3. The parts, in order

Each part is its own branch and session, at most two at once; 1 and 2 are independent, 3 needs 2, 4 needs 1 to 3, 5 needs 4.
Tier 1 is `docs/REVIEW.md`'s: login, roles, chain-read builders, the guard. Each tier-1 part gets its tests first, the red pass, the
`reviewer` and the `security-reviewer`. About 400 product lines a tier-1 part at most (the review's rule): the split follows.

| Part | What | Files | Tier |
|---|---|---|---|
| 0 | Alexis declares `@cosmjs/crypto` in `server/package.json` at a version two weeks old at least (0.39.0 is in the lock: check its date) and runs the install; package files are harness files | `server/package.json`, lockfile | harness |
| 1 | **The owner's read**: who holds a namespace, cached | `packages/core/src/chain/evalName.ts` (+ `evalOwner`), `packages/chain/src/asks.ts` (+ `ownerAsk`), new `server/src/roles/owners.ts` | 1 |
| 2 | **Links**: tables, the link nonce, the Adena proof, the fresh-proof rule | `server/src/login/links.ts`, `login/login.ts` (nonce statements), `migrations.ts` + its pinned hash | 1 |
| 3 | **The command-line proof**: the document rebuilt, the signature checked | `server/src/login/cliProof.ts`, a fixture test | 1 |
| 4 | **Routes and rights**: `/api/links`, owner rights into `mayPin`, the log | `server/src/login/linkRoutes.ts`, `server/src/main.ts`, `server/src/pins/wire.ts`, `server/src/roles/roles.ts` | 1 |
| 5 | **The screens**: Settings › Accounts, the dialog, the notice at a linked login, the owner's chip | `app/src/lib/api/links.ts` (client, treated as tier 1 like `lib/api/login.ts`), `app/src/features/settings/`, `app/src/features/chat/` (chip) | 1 for the client, 3 for the views |
| 6 | **Journeys, the real-key check, the hardening items** | `app/e2e` (the project's journey folder: to find), Alexis's one command | end |

### Part 1, the owner's read
- The chain, the namespace and the owner. A room's namespace: its `realm_rooms.path` segment 2 for a realm's room; for a hub's main
  room the namespace of the hub's first realm (`hubWorldOf`); none for the Earth or a room the server cannot place. A namespace that
  is an address (`g1…`): that address is the owner (to verify: `gno.land/r/sys/names`'s verifier, read with gnomcp, says what an
  address namespace is allowed to deploy). Otherwise `r/sys/users.ResolveName(<name>)`, current and not deleted (to verify with
  gnomcp on the default universe's chain: whether the namespace in a path is the exact string `ResolveName` takes, as the proposal
  wrote `nym-…`).
- One builder in `evalName.ts` next to `evalNameOf`, validating the namespace against `RealmPath`'s segment grammar before it
  composes an expression, never a given string. The answer is Zod-parsed to an address.
- `owners.ts`: `owner(namespace): Promise<Address | undefined>` with a 5 s timeout (the `abciQuery` limits), a 1 KiB answer cap, a
  cache of 60 s from the answer's time for a yes and for a no, no entry kept on a failed read (so a failure refuses at once, never a
  stale yes), at most 4 reads in flight and 120 an hour (the `realmRoutes` pattern: `readsInFlight`, `readsPerHour`), concurrent asks
  for one namespace sharing one read. Cache keys capped (100,000 like the limiters).
- Read on **the default universe's chain** (`defaultUniverse`'s rpc), see question 1.

### Part 2, links
- The identity and the nonce kinds. See section 4 for the tables. The link nonce is a **kind of its own** checked by its own spending
  statement; the two existing statements gain a condition so neither can spend it, and it cannot spend them.
- `startLink(by: A, kind, subject: B)`: requires A's session fresh (`signedAt` within 10 minutes), A's pending link nonces under 5,
  the identity under 10 members; issues the nonce (10 minutes, `kind` the link's way, `'adena'` or `'cli'`, `owner=A`, `subject=B`; a code issued for one way never
  finishes the other, chief 2026-11-11, F13821).
- `finishLink`: spends the nonce by one statement `WHERE nonce=? AND kind=? AND owner=? AND subject=? AND host=? AND expires_at>?`
  before the first `await`; then verifies; **only after the proof passes** checks the uniqueness (B already linked elsewhere is
  refused, B an identity with other members is refused, no merging) and the cap, then inserts in one transaction. The refusal causes
  are told to A only after B's proof passed, so the answer reveals nothing about an address whose key the caller did not control.
- The text for Adena says it in words, with the site: "Link B to A on <host>. A will moderate every world B owns, and B every world A
  owns. Nothing else is granted. Code …" (the wording is question 4).
- `unlink(by, address)`: A's session fresh; deletes the row; if the identity is left with one member its row goes with it (an
  identity of one is no link), which is the proposal's "the last one cannot unlink itself". A member may unlink itself.
- `identityOf(address): readonly Address[]` (the address alone when it has no link), one indexed statement.

### Part 3, the command-line proof
- The server writes, from its own constants only: one message `/bank.MsgSend` from = to = the key's address, `1ugnot`; fee `1ugnot`,
  gas 1; chain `gnoworld-link`; account 0; sequence 0; the stored memo. It shows the block to copy: the document without
  signatures, the `gnokey sign` line with `--chainid gnoworld-link --account-number 0 --account-sequence 0`, and `&& cat link.json`.
- Verify takes the pasted file (at most 4 KiB, Zod strict): exactly one `msg`, exactly one signature, `pub_key` of type
  `/tm.PubKeySecp256k1` with 33 bytes (no multisig, no other key type, no `session_addr`), a 64-byte signature, low-S. The server
  **ignores every other field of the paste**, rebuilds the sign bytes (sorted amino JSON of chain_id, account_number, sequence, fee,
  msgs, memo; `tm2/pkg/std/doc.go` at the `chain/onyx` tag) and checks ECDSA secp256k1 over SHA-256 with `@cosmjs/crypto` over those
  bytes. The address is RIPEMD160(SHA256(pubkey)), bech32 `g1`, derived, and compared with the address the nonce was issued for.
  The paste is never logged, never stored, never echoed in an error.
- **The fixture**: made once in a test from a throwaway key and the library, following `doc.go`'s rules exactly (the exact amino JSON
  of `bank.MsgSend` and of the file is read from the source, not from memory: part 3 begins by reading `tm2/pkg/std/doc.go`,
  `tm2/pkg/sdk/bank` and `tm2/pkg/crypto/keys/client/sign.go` at the tag). The command-line tool cannot be run from the sandbox (the
  guard refuses it), so the fixture proves the server agrees with its reading of the source, not with the tool: part 6 closes that gap
  with one real signature by Alexis (section 7).
- The library calls (names, byte order, low-S helper) come from the installed 0.39.0 types, not from memory.

### Part 4, routes and rights
- Routes in section 5. `server/src/main.ts` mounts them beside the login's.
- Rights: a new `mayModerate(who, room)` in `server/src/roles/` that is today's `mayPin` rule (`staffOf` plus the Earth's `maker`,
  unchanged; red pass M5) **or** the owner of the room's
  namespace is `who` or one of `identityOf(who)`. It is the single place that gives owner rights; `isTeam`, `spared`, the admin door
  and the reconciler's staff list never call it. It is async (the read); `pins/routes.ts`'s `mayPin` becomes `Promise<boolean>`, awaited
  after the session and the body and before any Ergo ask (the order its header comment states stays).
- Not in this part (see question 2): `mayCreateRoom`, the reconciler's invites and voices, hidden-room lists. They serve roles-file
  worlds, which are the team's and rarely have a chain namespace; widening them needs the roles file to learn a world's namespace
  (a schema change: stop and ask).
- Log: every pin, unpin and (later) action by an owner logs the acting `account` (the logged-in address), `owner` (the address that
  holds the namespace) and `as: "owner"`; the identity is never named in a room.

### Part 5, the screens
- Client `app/src/lib/api/links.ts`: Zod on every answer, the cookie only, no key anywhere; calls only what section 5 lists. No
  `@cosmjs` in the app (the crypto is the server's).
- **Settings › Accounts** (`SettingsView.tsx`, a new `AccountsSection` beside `Account`): a list of the identity's addresses (the one
  logged in marked), each with its kind ("Adena" or "Command line"), its link date, "Owner of N worlds" and Unlink; below it "Link an
  account". Nothing is listed for a person with no link except their own address and the button. The list is the person's alone.
- **The dialog** (`Dialog` of `@gnoworld/ui`), two tabs, "Adena" and "Command line":
  - Adena: "Switch to the account in Adena, then press Sign" (the text shown in words), states: idle, waiting for Adena, wrong account
    (`ACCOUNT_MISMATCH`: "Adena is on g1…, not the account you chose"), signed, linked.
  - Command line: the address field, then the block to copy (the proposal's), a paste area, Link. States: idle, code ready (countdown
    10 minutes), checking, linked, not this key ("This signature is from g1…, not g1…. Sign with the key of the address you gave."),
    expired or used (a new code at once, the commands refilled), already linked elsewhere, identity full, stale session ("Sign in again
    to confirm": re-runs the login, then retries).
  - The proposal's block is reproduced exactly (`build-to-the-proposal`: side-by-side crops per block, every control working). The block
    is shown from the server's answer, never composed by the page.
- **The notice at a linked login**: after a login, if `GET /api/links` says this address is a member, a flash once per login names the
  identity's other addresses (shortened) and has Unlink (fresh proof needed: the login just made it).
- **Owner's chip**: a chip "Owner" beside the room's title in `RoomView` when `GET /api/links`'s `worlds` includes the room's world;
  the Pin button already appears from `PinList.may`. No new field in `PinList`. A person with no link and no namespace sees nothing new.
- First screen untouched: the section and dialog are lazy chunks under the Settings dialog; the chip is one conditional in the room.

## 4. Data model (migrations expand-only, appended to `server/src/migrations.ts`, their hashes pinned in `migrations.test.ts`)

```
LINK_TABLES   identities (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL) STRICT
              links (address TEXT PRIMARY KEY,                     -- one identity per address
                     identity TEXT NOT NULL REFERENCES identities (id),
                     kind TEXT NOT NULL CHECK (kind IN ('adena','cli')),
                     linked_by TEXT NOT NULL, linked_at INTEGER NOT NULL) STRICT
              INDEX links_by_identity ON links (identity)
NONCE_LINK    ALTER TABLE nonces ADD COLUMN kind TEXT;    -- NULL for a login's and an admin change's, 'adena' or 'cli' for a link's
              ALTER TABLE nonces ADD COLUMN owner TEXT;   -- the session account that asked, for a link's
              ALTER TABLE nonces ADD COLUMN subject TEXT; -- the address to link
              INDEX nonces_by_owner ON nonces (owner) WHERE kind IS NOT NULL
```
- No `accounts` foreign key on `links.address`: a command-line key never logs in, so it has no `accounts` row.
- The first link writes both rows: A's with `kind = 'adena'` (a login is always Adena's), B's with the way used; both `linked_by = A`,
  `linked_at` the link's time (chief, 2026-11-11, red pass item 7).
- The ten-member cap is enforced by the inserting statement itself (`INSERT ... SELECT ... WHERE (SELECT count(*) ...) < 10`), not
  by a read before; the one-identity rule by the PRIMARY KEY.
- Old rows and the image before the change keep working: new columns are NULL; the existing spend statements gain `AND kind IS NULL`.
- The login's 100,000 cap counts `kind IS NULL` rows only, so no flood of link codes fills it; link codes have a cap of 5 a pending
  account and 20,000 pending in all.
- Nothing about links is written into the roles file or on chain.

## 5. Routes (`/api/links`, `server/src/login/linkRoutes.ts`)

Every route: the `guard` (a listed Origin, JSON for any non-GET, `cache-control: no-store`); the session read from `__Host-session`;
Zod strict bodies; one refusal shape (`refuserOf`, logged with the cause, no body echoed).

| Route | Body | Guard order | Answer |
|---|---|---|---|
| `GET /api/links` | - | session | the identity's members (address, kind, linked_at), `worlds` (the worlds whose namespace its members hold, by `ResolveAddress` per member and the known worlds' namespaces, cached 60 s; a display hint: the right itself is `mayModerate`'s forward read), whether this address is a link |
| `POST /api/links/challenge` | `{kind:"adena"\|"cli", address}` | Origin, JSON, limit (10 a minute a visitor, 30 an hour an account), session, **fresh** (`signedAt` ≤ 10 min, else `stale`), cap | Adena: `{nonce, text, expiresAt}` (the text with the grant in words). Command line: `{nonce, memo, block, expiresAt}`, `block` composed by the server |
| `POST /api/links/verify` | Adena: `{nonce, address, proof}` (the login's `Proof`). Command line: `{nonce, address, file}` (a string of at most 4 KiB, counted in bytes; the address is the nonce's subject, F13871) | same, then the nonce spent by its statement, then the proof, **then** the uniqueness and the cap | `{members}` |
| `POST /api/links/unlink` | `{address}` | same, **fresh** | `{members}` |

- **The nonce rule**: the link nonce is spent by `finishLink`'s statement alone (kind, owner = this session's account, subject,
  host, not expired). A login nonce does not spend there, a link nonce does not spend at `/api/login/verify` or the admin's change.
- A route's session must be a member of the nonce's `owner`: the nonce is bound to A's session account, so a code issued for A cannot
  finish a link for C.
- Limits are separate from the login's (own limiters), so a flood of link calls never locks logins out, and a flood of logins never
  locks links out. Body size: Hono's own body limit for this app's routes is to verify in part 4; the file is capped at 4 KiB by the
  schema either way.

## 6. Threat model, with the test that proves each row (all tests first, named after the fault)

| Threat | Guard | Proving test |
|---|---|---|
| Someone links your key to their account | the signed text names A, B, the site and a code bound to A's session; a proof for A never finishes a link to C | `links.test.ts`: a proof of B for a nonce issued to A finishes no link for C; a nonce of another session is refused |
| A replayed or stolen proof, a code reused | the nonce is spent by one statement before the first `await`; 10 minutes; the same proof twice at once is one success | `links.test.ts`: two concurrent verifies, one link; a second use refused; an expired nonce refused |
| A link code used as a login, or the reverse, or as an admin change | the nonce kinds are disjoint in their spending statements | `login.test.ts`: a link nonce at `prove` and `proveAction` is refused, a login nonce and an admin nonce at `finishLink` is refused |
| A flood of link codes locks logins out | a cap of its own, `kind IS NULL` counted for the login's | `links.test.ts`: 100,000 login nonces do not refuse a link, a link flood does not refuse a login |
| A stolen session of A makes a lasting link | link and unlink need `signedAt` ≤ 10 minutes, or A signs again | `linkRoutes.test.ts`: a session of 11 minutes gets `stale` on challenge, verify and unlink |
| A forged command-line proof | the server rebuilds the document from constants and verifies over those bytes, never the paste | `cliProof.test.ts`: the fixture passes; a tampered memo, amount, sequence, chain id, a second message, a second signature, a multisig, a non-secp256k1 key, a 65-byte signature, a high-S signature, a pub_key of another address, an extra field, a body of 5 KiB: each refused |
| A proof that spends money | the chain id `gnoworld-link` exists on no node; nothing is broadcast; the transaction is a send to the key itself | `cliProof.test.ts`: the same bytes with `onyx-1` or `gnoland-1` ids do not verify (the document's id is the server's constant); the tool's default id `dev` is refused |
| The paste leaked | never logged, stored or echoed | `linkRoutes.test.ts`: the log lines and every error body of a refused paste hold no byte of it |
| An address in two identities, a merge, a flood of members | PRIMARY KEY on `links.address`; the cap by the inserting statement; B an identity with members is refused | `links.test.ts`: link B to A then to C refused; an 11th member refused; two inserts at once keep the cap |
| Learning who is who | the uniqueness refusals come after B's proof; the list is the person's alone; no room shows an actor | `linkRoutes.test.ts`: refused-before-proof answers are identical for linked and free addresses; `GET /api/links` of C never names A; `pins` test: `PinList` JSON has no `pinned_by` and no identity |
| A stale ownership | the owner is read at the check, cache 60 s, no stale yes on a failed read | `owners.test.ts`: a namespace that moved is lost after 60 s; a timeout, an oversize answer and a bad answer each refuse and are not cached |
| A name registered on a cheap chain | the owner is read on the default universe's chain, fixed by the server, never by the visitor's view | `owners.test.ts`: the read goes to the configured RPC only; no request field chooses it; see question 1 |
| A weak linked key opens the console | team, admin and `spared` are keyed by the exact logged-in address and never call `mayModerate`; a link grants no role | `roles.test.ts`: a linked address of the team is not `isTeam`; `door/admin.test.ts`: the console refuses a linked address; `spared` ignores links |
| A phishing page asks B to sign | the text says what it grants, with the site and the account; the login of a linked address shows its identity and Unlink | `LoginControl`/notice test: a linked login shows the notice with the other addresses; a text without the grant words is never produced by the server (a text-shape test) |
| An owner's rights outlive an unlink | rights are computed at each check from `identityOf` | `mayModerate.test.ts`: after unlink the formerly linked address no longer pins in the other's worlds |
| A flood of rights reads at the chain | in-flight and hourly caps, shared reads | `owners.test.ts`: 1,000 pins in 1,000 rooms make at most the cap of reads |
| Rights stuck on a reused `who` type | `Address` is Zod-parsed at every boundary; a `who` that is no address owns nothing | `mayModerate.test.ts` |
| What a linked address did stays | the log keeps the acting `account` and `owner` | `linkRoutes.test.ts`/`pins` test: the `pin_added` line has both |

## 7. Tests first, per part

Each part writes its failing tests, runs them, sees them fail, then the `test-auditor` red pass (tier 1), then the code. Mutation:
`pnpm run mutate` for the new files, each guard above caught or put in `GAPS` with its reason.
- Part 1: `evalOwner` builder (a namespace with a quote, a slash, an uppercase letter, 129 characters: refused); `owners.test.ts` with a
  fake chain (`server/src/testing/fakeWorldsChain.ts` is the pattern): yes, no, deleted name, a non-current name, timeout, 2 MiB
  answer, junk, cache expiry at 60 s, no cache after failure, concurrent asks sharing one read, the caps.
- Part 2: `links.test.ts`: the whole of section 6's first, second, fourth and ninth rows, plus the migration test (the pinned hashes,
  an old database taking the new migrations, an old-image nonce row spent by the new statements).
- Part 3: the fixture and every tamper of the sixth row; the fixture is generated by a helper in `server/src/testing/` with a throwaway
  key from the library's own random, never a key written in a file.
- Part 4: route tests (`linkRoutes.test.ts`) for every row of section 5 (no session, bad Origin, bad type, bad body, stale, limit,
  cap, replay); `mayModerate.test.ts`; `pins/routes.test.ts` gains an owner pinning in a realm room, an owner of another namespace
  refused, and the 5-second chain outage refusing.
- Part 5: component tests for each state of the dialog and the section (no hook test; the views of tier 3 take none), the client's Zod
  tests. Journeys (Playwright, by the session that writes them, once the screen is validated by Alexis): **link** (a second Adena
  account through the fake wallet already used by `logIn` journeys: challenge, sign as B, linked, listed, unlink) and **moderate**
  (log in as B, a fake chain says B holds the namespace of a realm's room, pin a line, the pin shows; unlink, the Pin button is gone
  after the 60 s cache, which the test shortens by the cache's injected clock). The command-line flow's journey pastes a file made by
  the part 3 helper.
- Part 6, the one thing no test of ours can prove: **the real tool's file**. Alexis (or the chief for him, on his machine, the guard
  refusing it here) runs the block the dialog shows with a throwaway key, `gnokey sign --chainid gnoworld-link ...`, pastes the file,
  and the server must link it. If it does not, the fixture's reading of `doc.go` is wrong and part 3 is reopened.

## 8. Weights and cost

- First screen: untouched (section 3, part 5). The app gains no dependency; `@cosmjs/crypto` is the server's only, so the app's bundle
  and the first screen's size cap do not move. Measured by `size` before and after, both numbers shown.
- The server image gains the library: the lockfile has it at 0.39.0 already (transitive), so the install's size change is to be
  measured (image or `node_modules` before and after) and told; its weight is not claimed here.
- Per check: `mayModerate` is one SQL read of `links` plus, past the cache, one chain read; the realm rooms' hot paths (lines in,
  streams) never call it, only the pin route and the lists of part 4. Per link: a few SQL statements and one signature verification
  (a few ms of CPU: to measure, not claimed).
- Storage: at most 10 rows a person, one nonce row of about 600 bytes pending 10 minutes.

## 9. What Alexis must decide

1. **Which chain the owner is read on.** The brief says the main chain the world belongs to, and the code's default universe is onyx-1,
   a testnet where a namespace may be cheap or free. Moderating a world is a right worth squatting for if the namespace costs nothing.
   Options: read the default universe's chain (what the plan does, fits every world the app lists), or also require the world's
   chain to be gnoland-1 for rights (no owners on onyx until it matters). Recommendation: the default universe's chain now, and
   say so in Settings (the chain's name beside "Owner of N worlds").
2. **Which actions an owner gets.** Today a person can pin and unpin, and (roles-file worlds) make and archive rooms, see hidden rooms
   and speak in announcements. Hiding a line, muting an account and naming moderators are not person's actions anywhere in the code
   (the bot does the first two, the file the third). Recommendation for this part: pin and unpin in the owner's realm rooms only,
   one function (`mayModerate`) so the others plug into it later; hide, mute and naming moderators each a part of its own with its
   own plan, since each is a new route and a new tier-1 right.
3. **Symmetric or one-way.** The proposal says "from any linked account". As planned, every member moderates the worlds any
   member owns (A gets B's, B gets A's). One-way (the identity's root only) is smaller in effect but the root has no meaning once
   an unlink happens. Recommendation: symmetric, said in the signed text.
4. **The words of the grant** in the Adena text and the command-line memo (section 3, part 2). Alexis chooses them: they are the
   page's phishing defence. Draft: "Link g1B… to g1A… on <host>. From now on each of them moderates the rooms of every world the other
   owns on <chain>. Nothing else is granted. Code …".
5. **A world with realms in several namespaces** (a hub): the plan decides rights per room by the room's own realm's namespace, and a
   hub's main room by its first realm's. Say if a hub's owner should be a different rule.
6. **Who runs the real-key check** (part 6) and when: it needs `gnokey` on Alexis's machine and costs nothing.
7. **The limits**: 10 addresses an identity, 10 minutes of freshness, 60 s of cache, 5 pending link codes: the proposal's numbers,
   taken as given.

Stop and ask before: the dependency (part 0); any change to `PinList`, `Me` or another committed public schema (the plan avoids
all); the roles file learning a world's namespace; any widening of `isTeam` or the console; a limit larger than listed; the
nonces table change running on the live database (an expand-only migration, but a schema already in use).

## 10. Not verified here, and where to verify

- The exact amino JSON of `MsgSend`, the fee and the file, and what `gnokey sign` does with `--chainid gnoworld-link` offline
  (`tm2/pkg/std/doc.go`, `tm2/pkg/sdk/bank`, `tm2/pkg/crypto/keys/client/sign.go` at `chain/onyx`): part 3, and the real file of part 6.
- That a namespace in a realm path is the string `ResolveName` takes, and what an address namespace is (`r/sys/names`): part 1, gnomcp.
- `@cosmjs/crypto@0.39.0`'s names and the release date: the installed types; `npm view` by Alexis.
- That Adena signs a link text for a second account exactly as for a login (the brief's source: `signArbitrary`, `ACCOUNT_MISMATCH`):
  part 2's test with the SDK's verifier, and part 6's journey.
- The project's Playwright folder and the fake wallet's name: found by the part 5 session.

Undo (chief, 2026-11-11, rights review): no unmute route in this part: an owner's mute expires after `MUTE_MINUTES`, as the bot's; a
hide is a REDACT, final, as the bot's; the log keeps the acting account and the owner, so the operator can trace it.

## Alexis's answers (2026-11-11, D13936)
Rights: an owner pins, hides a line and mutes an account in its worlds' rooms in this part (more than §9's pin alone); naming
moderators comes next. Chain: the world's own chain (onyx today, mainnet when gnoworld moves there), said in Settings. Links are
symmetric: any linked account moderates the worlds any of them owns, written in the signed text. The plan's other values as proposed
(10 addresses, 10 minutes, 60 s, 5 pending codes, §9's text, a room judged by its own realm's namespace, Alexis's final check with a
throwaway key). `@cosmjs/crypto` 0.39.0 (published 2026-05-04) declared by the server, installed by Alexis.
