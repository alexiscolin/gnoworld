# Slice 13, the explorer additions: five additions and their data (D13023)

Draft of 2026-11-12, for the chief and Alexis (nothing is built). Findings and decisions of this plan take F13xxx and D13xxx from the range the chief hands it. Sources read: D13023, D567, D13020 and D13022 (`docs/decisions.md`), `docs/plans/slice-realm-plate.md`, `docs/REVIEW.md`'s tiers, the worlds job (`server/src/worlds/`), `packages/chain/src/{asks,indexer,tx}.ts`, the chat's person card (`app/src/features/chat/PersonCard.tsx`) and chain card (`ChainCard.tsx`), `app/src/features/search/`, `packages/ui/src/{ActivityChart,Sparkline,Figures}/`. Every number below was run on 2026-11-12 against onyx-1's indexer (`https://indexer.onyx.testnets.gno.land/graphql/query`, POSTed from the sandbox) or through gnomcp (`gno_status`, `gno_account`, `gno_eval`, `gno_read`); what was not run is named in section 9.

## 1. Done when
- A click on a name in the chat opens a card with, besides the face, country, Message and Follow it has today: the balance, the realms they deployed (their system), the realms they call most, their latest calls, the tokens they hold, and a small chart of their calls a day. A block with no data is absent, never zero-filled or invented.
- A click on a chain line in the chat (`ChainCard`) opens that call's detail: the function, its arguments, its cost (gas used, fee), its block and time, its result (success or the chain's error) and its events.
- A realm of a token world shows its holders (top 20 and the count), its supply, today's transfers and, only when there is something to draw, a chart of transfers a day.
- The palette's search finds a realm by a function it exports ("mint", "vote"), with the function shown on the hit.
- The home shows one line of network health: transactions today, accounts active today, a sparkline of the last 14 days; no dashboard.
- Nothing of the five weighs on the first screen (`budgets.spec.ts` holds, unchanged); every new request is made after it, from a chunk of its own.
- No visitor ever causes an eval (`vm/qeval`) on the public RPC; the most requests an hour each addition adds are in section 5.
- Every number shown is one a query returned, with its time or block; what was not read is absent (the worlds job's rule: a fact not read is null, never zero).

## 2. Out of scope
- Anything only gnoscope gives (storage, deposits, decoded realm state, full-text over source): D567 stands.
- A dashboard, a block explorer, a transaction list of the whole chain, an accounts page.
- The comet and the lights of D13021 (the call detail opens from a chat line; the light can open it later, same card).
- Mainnet (`gnoland-1`) beyond the probes of section 9: every universe is read through its own `indexer` and `rpc` (core's `universe`), the same code runs on it, but nothing here was measured on it.
- NFT (grc721) holders: the same event stream could feed them (section 4.2); not asked, not built.

## 3. What the chain and its indexer give, proven today
All on onyx-1, tip 1,075,171 at 04:10 UTC on 2026-11-12 (`gno_status`). The indexer's GraphQL is POSTed as the server's own reader does (`packages/chain/src/asks.ts`: variables, `typeUrl` to pick a message type). Times are curl's total for one request from the sandbox.

| # | Question | Query, in short | Answer's shape | Time |
|---|---|---|---|---|
| P1 | A call by its hash (the chain event's id is `<base64 hash>:<message index>`, `chainEvents.test.ts`) | `getTransactions(where:{hash:{eq:"ee2jB+mHq8SSTv19Z50gOsyXAJnhW2MqTn/JhkErVss="}})` | one row; with `hash index block_height success gas_wanted gas_used gas_fee{amount denom} memo messages{value{... on MsgCall{caller pkg_path func args send max_deposit}}} response{error events{... on GnoEvent{type pkg_path attrs{key value}}}}`: `gas_wanted 4072728, gas_used 3132928, gas_fee 8146 ugnot, memo "GnoPulse access quote", args ["422749053"], send "", max_deposit "1ugnot"`, one `SetQuote` event with three attrs | 0.30 s |
| P2 | A person's latest calls | `messages:{typeUrl:{eq:"exec"}, value:{MsgCall:{caller:{eq:$a}}}}`, `success:{eq:true}`, `order DESC`, `limit 20` | 20 rows of 5.8 KB; a person with calls stops early | 0.38 s |
| P3 | Same filter, an address that never called | as P2, no match | `null` (the indexer's empty page is null, as `history.ts` already knows) | 1.22 s: a full scan of the chain |
| P4 | The realms a person deployed | `typeUrl:{eq:"add_package"}, value:{MsgAddPackage:{creator:{eq:$a}}}` | one row, `package.path` | 1.20 s |
| P5 | A person's balance | `gno_account` (`auth/accounts`, a store read, not a VM eval) | `{"coins":"275208694ugnot","exists":true,"sequence":2083,"account_number":1225}`; an unknown address is `exists:false`, an answer, not an error | not timed (gnomcp gives none) |
| P6 | Every GRC20 transfer of the chain | `response:{events:{GnoEvent:{type:{eq:"Transfer"}, pkg_path:{eq:"gno.land/p/nt/grc20/v0"}}}}`, `order ASC`, `limit 1000` | 112 transactions (not 1000: that is all of them), 139 KB, heights 186,589 to 880,052, 22 distinct tokens; each event's attrs are `token` (`<realm path>.<SYMBOL>.<id>`), `from`, `to`, `value` (a decimal string); a mint has `from ""`, a burn `to ""` | 0.33 s |
| P7 | The newest GRC20 transfer | same, `DESC`, `limit 3` | block 880,052 = 2026-11-04T00:09:58Z: no token of the chain has moved in the 8 days since (195,000 blocks) | 0.38 s |
| P8 | Does a replay of P6 equal the chain? | `wugnot`'s 92 events replayed (mint adds, burn subtracts) against `gno_eval` | supply replayed 1,238,900,006 = `TotalSupply()` `(1238900006 int64)`; the top two balances 500,997,009 and 139,750,000 = `BalanceOf` of each, to the unit; 19 addresses hold more than zero | 3 evals, once, by hand |
| P9 | Transactions a day | `getBlocks(where:{height:{eq:H}}){time total_txs}` at heights 1,030,000 to 1,075,121 | `total_txs` 10,453 on 2026-11-10 07:17 UTC, 10,753 on 2026-11-12 04:07: 300 transactions in 44.8 h, about 160 a day; the whole chain holds 10,753 | 0.29 s |
| P10 | The transactions above a height | `getTransactions(where:{block_height:{gt:1069000}}, limit 2000){block_height success messages{typeUrl value{... on MsgCall{caller} ... on MsgAddPackage{creator} ... on BankMsgSend{from_address} ... on MsgRun{caller}}}}` | 38 rows in 6 KB, 5,995 blocks, message kinds `exec` 37 and `send` 1 | 0.29 s |
| P11 | A block's time by a time filter | `getBlocks(where:{time:{after:...}}, limit:1)` without a height | `QUERY_DEADLINE_EXCEEDED (30s); narrow the block height range`: unusable | 30.3 s |
| P12 | Filters | introspection of `FilterTransaction`, `FilterGnoEvent`, `NestedFilterGnoEventAttribute`, `FilterMsgCall`, `FilterString` | `FilterString` has `exists`, `eq`, `like`; `like:"x%"` on an event attr answered `null` where `eq` answered: only `eq` is used. `Transaction` carries `gas_wanted gas_used gas_fee memo content_raw`; `Block` carries `num_txs total_txs time` | 0.3 s each |

Findings from the table:
- **F13xxx-1 (onyx's tokens are dead).** No GRC20 token has moved since 2026-11-04 (P7); in all, 112 transactions in the chain's life (P6). "Today's transfers" is 0 for every token world today, and a chart of transfers a day is flat zero over any recent window. The addition still has value (holders and supply are real, P8), the chart does not: section 4.2 draws it only when the window holds at least 3 days with a transfer.
- **F13xxx-2 (the network is small).** About 160 transactions a day and 10,753 in all (P9): a day's figures are three digits, the sparkline's counts are small, and every pass is cheap. It also means "active accounts" is a few dozen: shown as it is.
- **F13xxx-3 (no time filter).** A day's first block cannot be found by a time filter (P11); the job already finds it by bisection on heights (`blockDays.ts`, 50 heights a request), which is reused.
- **F13xxx-4 (the token's identity is the chain's).** `gno.land/p/nt/grc20/v0`'s `NewToken` (read at `token.gno` through `gno_read`) binds the token's id to the calling realm with `rlm.IsCurrent()`: "origRealm is unforgeable", the id is `<realm path>.<symbol>.<id>`. An event whose `pkg_path` is that package cannot name another realm's token. The same source says a realm that announces one id twice makes its later events "ambiguous ... should be flagged or ignored wholesale": the replay does it (section 4.2). `validName` allows any Unicode but control characters, so a token's name may hold bidi controls: stripped.

## 4. The five additions

### 4.1 A richer person card (value high, risk medium, the biggest)
**What it shows, where.** `PersonCard.tsx` (a `Popover`, lazy, opened from a name on a line) keeps its face, name, country and Message / Follow, and gains under them, from the design system's parts (`Stack`, `Cluster`, `Figures`, `ActivityChart unit="day"`, `Row`, `Kicker`; no new part):
1. A line "Balance 275.2 GNOT" (`ugnot` over 1,000,000, grouped by `format.grouped`, the chain's denom named).
2. "Their system": the worlds whose realms they deployed (`worlds.json`'s `deployer`), at most 5 `Row`s, each a link to the world's plate (`realmRoute` / `worldRoute`); "and 3 more" past 5.
3. "Calls": three `Figures` cells (calls, realms called, first call date) and an `ActivityChart` of calls a day, 30 days, `figures={false}` (the plate's own words).
4. "Latest calls": at most 8 `Row`s: the function, the realm's short path, how long ago (`days.ts`), a mark when it failed.
5. "Tokens": at most 5 rows, the symbol and the amount (only once branch D is merged; absent until then).
A guest, or an address with no record, has none of 1 to 5 and shows what the card shows today. The card stays a Popover, no Tab stop (the card's existing rule); every block under a `Suspense`, so the card opens at once with what it knows.

**Where each number comes from.**
- Calls, realms called, calls a day, latest calls: the rollup's own state (`rollup_callers`, `rollup_day_callers`, `rollup_calls`, `rollupStore.ts`), no indexer query. Honest limit: the rollup counts calls to the realms of the worlds file (`known`), 100 latest calls a realm (`ROLLUP_CAPS.last`): a person who called only realms outside the file has none, and a person's latest calls are those inside each realm's kept 100. The card says "calls to worlds" for it. Two additions to the state, both additive and bounded: an index `rollup_callers (caller)` and `rollup_calls (caller, id)`, and a table `rollup_caller_days (caller, day, calls)` written in the same transaction as the day's rows and pruned to 30 days (the rollup's counter, `one()` in `rollupStore.ts`, already holds each call's caller and day). Size: one row per (person, day), about the order of `rollup_day_callers`; at 160 transactions a day, under 200 rows a day.
- Their system: `worlds.json`, held in memory by the job (the plate plan's rule: the author is the deployer the job reads). No query.
- Balance: one `auth/accounts/<addr>` read (P5), by the server with a 60 s cache (section 5). Not by the browser, so a card is one request with one schema, and one place caps the RPC.
- Tokens: branch D's replay tables (section 4.2), read by address. No eval.
- Why not the indexer per card: P3 shows a miss costs a full scan (1.22 s) and a stranger can name any address; P2's `DESC` stops early only for an address with history. An on-demand indexer read behind a public route is an amplifier. The rollup answers from sqlite in a few ms.

**What the server computes and caches.** A new route `GET /api/people/<address>` (new, tier 2; reviewed as a new server route). It reads the rollup's database and the worlds file already in memory, and one cached balance. The response is built per request from indexed rows: at most 8 latest calls, 5 realms deployed, 10 realms called, 30 days, 5 tokens; well under 6 KB. The balance is the one thing a request can ask the node for.

**Caps.** Response 6 KB; request: the address (`Address` schema, 43 characters) and nothing else (no query string read); per IP 30 a minute (`limit.ts`'s `limiter`) and 10 a second across all visitors (the search route's rule: one synchronous sqlite connection, per-visitor limits do not bound it, F13770); 8 s end to end; the node read 5 s with `readCapped` at 4 KB.

**Zod.** Server: the address (in) and the node's `auth/accounts` envelope (`packages/schemas`, new `Account`: `coins` as a string matched `^\d{1,20}ugnot(,\d{1,20}[a-z]+)*$`, other denoms listed by name only, 5 at most). The rollup's rows are parsed as `rollupStore.ts` does. Client: `PersonCardData` (new, strict) on the route's answer; a field past its cap fails the block, not the card.

**How it fails.** Per block, inline, never the whole card: a failed route shows the shared error view's inline size (D13022: kind `unavailable` or `too many requests`, its words and "Try again"), the face, name and buttons stay. An address with no record is not an error: the blocks are absent. The balance alone failing (`balance: null`) shows "Balance unavailable", not "0".

**What a stranger's data can do.** The address is validated before anything; the realm paths and function names that reach the card passed `RealmPath` and `ExportedName` when the rollup wrote them (strict regexes, so no markup and no bidi); a deployer's name passes `DeployerName`; the balance is two integers cut and grouped; an amount past 2^63 refuses the block. A person who calls a realm 10 million times costs one row (a counter). A person who spams calls to push others out of the "latest calls" of a realm is bounded by the rollup's 100-row cap per realm, and only their own card shows them. Everything is drawn as text (the existing card's rule).

**Tests (first, failing, then the red pass; server and stranger data).**
- Unit: the person's read (`peopleOf(db, worlds, address)`) over a fixture rollup: counts, caps (9 realms' worth at the cap edge and one past, 31 days), an address with nothing, a person whose only calls are to unknown realms; the day table's pruning; the balance's Zod (huge amounts, `exists:false`, a denom with markup).
- Route: bad addresses (empty, 42 and 44 characters, uppercase, `<script>`), a body or query string ignored, a 429, the node down (card with `balance:null`), the node slow (5 s cut), the cache (a second request within 60 s makes no node read; the 101st distinct address in the same second is refused the balance, not the card).
- Component: the card with each block absent, a failed block, an address with no record; hostile text in a function name is text; axe; the card is not a Tab stop.
- Mutation over the person read's caps and the balance's schema (`pnpm run mutate`).
- Bench: the person read at 1 million rollup rows (a `rollup.bench.ts` sibling): under 5 ms.

**Review.** `security-reviewer` (new route, a node read behind a public door, a cache), `reviewer`; the red pass first. Tier-1 files touched: none planned (`limit.ts` and `guard.ts` are used, not edited); if the limiter needs a new option, that edit is tier 1 and gets its own commit.

**Weight on the first screen:** none (the card is lazy already; the new blocks are in its chunk, about 3 KB estimated, to measure; the route is called only on open). Late chunk: `PersonCard` blocks, one `person-card` chunk.

### 4.2 Living token worlds (value low today, risk medium)
**What it shows, where.** On the realm's plate (`RealmPlate.tsx`) for a realm of a world whose nature is `token` (`worlds.json`'s `nature`, 27 worlds), a "Token" block after "who calls it": `Figures` cells Holders, Supply, Transfers today (value 0 is shown, with the sub "last on 4 Nov"); a `Row` list of the top 20 holders (the address short, the amount, the share as a `Progress`); a `Stat` line for each token the realm holds (a realm holds several: `pado` has ALPH and BETA). The chart of transfers a day (`ActivityChart unit="day"`) is drawn only when the 30-day window holds at least 3 days with a transfer, else a sentence "Last transfer 4 Nov 2026, block 880,052" (F13xxx-1: a flat line says nothing). A token whose events are unreliable (below) shows "Holders unknown", nothing computed.

**Where each number comes from.** The chain's own Transfer events, replayed by the job: P6. The replay equals the chain for `wugnot` (P8). Holders = addresses with a positive balance; supply = mints minus burns; today's transfers and the days = transactions with a Transfer of that token, grouped by the block's UTC day (the rollup's `daysOf`, bisection by heights, F13xxx-3). The token's name, symbol and decimals come from the package's `NewToken` event, same query with `type:{eq:"NewToken"}` (not run: its attrs are read from `token.gno`'s `chain.Emit(NewTokenEvent, "token", id, "name", name, "symbol", symbol, "decimals", ...)`; the probe is in section 9). No eval, ever: the alternative, `BalanceOf` for each holder of each of 27 tokens, is an eval each, and is refused.

**What the server computes and caches.** In the worlds job's pass, after the rollup: one more read of the transactions above the last height with a Transfer or NewToken event of `gno.land/p/nt/grc20/v0` (`block_height:{gt:$above}`, `order ASC`, a page of 500), folded into three tables (appended migration): `token_state (universe, height, anchor...)` like `rollup_state`; `token_balances (token, address, amount TEXT)`; `token_days (token, day, transfers)`; `tokens (token, symbol, name, decimals, ambiguous INTEGER)`. Amounts are decimal strings parsed to `BigInt` (int64 in the chain, past 2^53 in a JS number), kept as text or `INTEGER` read with `readBigInts`. A route `GET /api/tokens/<realm hash>` (the rollup's `rollupName` hash, so the path never travels) answers from sqlite: at most 3 tokens a realm, 20 holders each, 30 days; under 4 KB. Never per visitor to the node.

**Replay rules (so a hostile token cannot lie).** A balance never negative: if a replay goes below zero the token is marked `ambiguous` and shows no holders. A `NewToken` seen twice for one id marks it `ambiguous` (the package's own advice, F13xxx-4). Mint (`from ""`) and burn (`to ""`) move supply; a transfer from an address to itself cannot occur (`ErrCannotTransferToSelf`); an event not from `grc20/v0`'s `pkg_path` is ignored (a realm that emits its own `Transfer` has its own path). A token realm that never emitted (older tokens, another library) has no data, and the block is absent: unknowable which of the 27 (section 9).

**Caps.** A pass reads at most 20 pages (10,000 events) and 4 MB; past that the job keeps what it replayed and logs `token_read_capped`, the block says "partial". Per token: 20 holders and 30 days in the answer; 100,000 balance rows a token in the table, past it the token is `ambiguous`.

**Zod.** A new `TokenEvents` answer schema (`packages/chain`'s `asks` for the query, `packages/schemas` for the answer): `token` as `^gno\.land/r/[a-z0-9_/.\-]{1,200}\.[A-Za-z0-9_-]{1,32}\.[0-9a-z]{1,16}$` split on the last two dots; `from` and `to` an address or empty; `value` `^\d{1,19}$` and at most 2^63-1; `name` with control and bidi characters stripped and cut at 64 (the chain allows any Unicode); `symbol` `^[A-Za-z0-9_-]{1,32}$`; `decimals` 0 to 18. A row that fails is dropped and logged by kind, never its text (the job's rule). The route's answer has its own strict schema (client).

**How it fails.** Job: a failed read keeps the last tables (a stopped indexer leaves a token at rest, as a world); the plate's block is absent for a token never read and says "as of block N" otherwise. Route: unknown hash is a 404 which the plate reads as "no token block"; down, the shared error view inline.

**Stranger's data.** A token with `<script>` or a bidi override in its name: the name is stripped and cut before it is stored and again on drawing (`chainText.plain`). A token that mints 2^63-1 to a thousand addresses: counted once each, the rows capped, the amounts BigInt so no wrap-around. A realm that emits fake `Transfer` events under its own `pkg_path`: ignored. A flood of transfers to inflate "today's transfers": counted as they are, a counter per day (the chain's fees paid it).

**Tests.** Unit (first): the replay over recorded P6 events (a fixture of the 112 rows: supply 1,238,900,006 and the 19 holders of `wugnot`), a mint, a burn, a negative balance, a duplicate `NewToken`, `from == to`, an amount of 2^63-1 and of 2^63, a token id with a realm path that has dots, a bidi name; the day bucketing at UTC midnight (23:59:59.999 and 00:00:00); the pass resuming above its height; the cap (10,001 events). Contract: the answer's schema against the recorded P6 body. Route: unknown hash, huge hash, limits. Component: the block with 0 transfers today and a last transfer, with 3 active days (chart drawn) and with none (sentence), an ambiguous token. Bench: 100,000 events replay under 1 s. Mutation over the replay.

**Review.** `security-reviewer` (a new route and stranger data in sqlite), `reviewer`; red pass.

**Weight on the first screen:** none; the block is in the plate's chunk (the plate already loads after the first screen).

### 4.3 A call's detail (value high, risk low, no server)
**What it shows, where.** A click on a chain line (`ChainCard`, an item of a room's thread: "g1abc called MustVoteOnProposal on gov/dao, block 900030") opens a `Popover` (as the person card) on that card, later the same component from a light or a comet. Body, in design-system parts (`Card`, `Row`, `Figures`, a `Kicker`):
- Header: the function and the realm's short path (a link to its plate), "succeeded" or "failed" with the chain's error text.
- Arguments: one `Row` each, at most 10, index and value in mono; "and 3 more".
- Cost: "Gas 3,132,928 of 4,072,728 wanted; fee 8,146 ugnot".
- When: the block and its time ("block 1,075,087 · 2026-11-12 03:59 UTC", the time asked with `blockTimes`-style `getBlocks(where:{height:{eq:H}})`, 0.29 s in P9).
- Sent: the coins sent with the call, when any; the memo when any.
- Events: at most 5, type and its attrs (key: value), the realm's own words.
The card is the one place a call's arguments show; the chat card itself keeps its text (ADR-0002 §4: nothing before its event).

**Where each number comes from.** P1: one indexer query by hash, 0.30 s, one row. The event's id is `<hash>:<message index>`; the message shown is `messages[index]`, with `__typename === "MsgCall"` checked again (a bundle's other messages are not shown).

**What reads it.** The browser, directly, through a new `readCallDetail(indexer, id)` in `packages/chain` (beside `readLastCalls`/`readFacts`), cached under a `keys.call(indexer, hash)` TanStack key with `staleTime: Infinity` (a transaction never changes), `retry: false`. No server route, no server cache. Why: a call is immutable and content-addressed, the indexer's origin is already in the page's connect-src (`cspOrigins.ts` names each universe's indexer, as `useRealmFacts` uses it), and a route would add the second public door of this slice for a request a human makes at the pace of a click. The alternative, a server route that caches by hash forever (about 2 KB a call), is built only if Alexis prefers the indexer never to see a visitor (question 3).

**Caps.** One request in flight (the query key dedupes); 5 s timeout; the answer read up to 64 KB (`readChain`'s cap, the transaction's arguments may be large: a deploy carries a whole source, the call's args are strings of any length); the strings are cut when drawn: an argument at 200 characters (copy keeps the whole, up to the cap), the memo at 140, the error at 512, an event's attr at 100, at most 10 arguments and 5 events. The request asks no `content_raw` (the whole signed transaction).

**Zod.** `CallDetailAnswer` (new, in `packages/schemas`, strict where the query asks, like `RealmCallsAnswer`): `hash` base64 of 44 characters, `block_height` int, `gas_used` and `gas_wanted` ints (a number past 2^53 refuses), `gas_fee` `{amount, denom}` (`denom` `^[a-z]{2,16}$`), `memo` string at most 256 KB cut, `args` nullable list, `response.error` string, `events` union with the `TransferEvent` and other typed events left out (only `GnoEvent` is asked and read).

**How it fails.** The shared error view, inline size: no row for the hash (the indexer is behind the chain: "not indexed yet", kind `not found` with a retry in 5 s; the node's `readTransaction` of `packages/chain/src/tx.ts` could answer the value and log alone, but gives no args: not used), the indexer down (`unavailable`), a 429 (`too many requests`). The chat line and the rest of the card are unharmed.

**Stranger's data.** The caller of a call is a stranger and so are its arguments and memo: drawn only as text in a `<code>`/mono span, through `chainText.plain` (control and bidi stripped, `toWellFormed`), no markdown, no link, no `dangerouslySetInnerHTML`, no image; a long unbroken argument wraps by `overflow-wrap:anywhere`; an argument that looks like a URL is not a link. A 5 MB argument is cut at the 64 KB read. A realm path in the call is checked by `isRealmPath` before a link to its plate is made; a hash and index from the event pass `ChainEvent`'s schema first (the id is 140 characters at most there).

**Tests.** Unit (first): the id split (`hash:index`; a missing or non-numeric index, an index past the messages), the schema against the recorded P1 body and against hostile ones (a 10 MB arg, a bidi memo, `gas_used` as a string, `gas_fee` null, a message that is not a `MsgCall`), the cut lengths at the edge and one past. Component: each state (loading, ok, failed call with an error, a call with 0 args, 12 args, an event with markup, an unindexed hash, 429), keyboard (the line's action opens it, Escape closes), axe. The journey: no new one (not a critical flow).

**Review.** `reviewer` once (stranger's text on a page, packages/chain read); `security-reviewer` only if the CSP or a tier-1 path is touched (none planned, so none). Red pass: the test-auditor reads the hostile-text tests (a stranger's text is the security row of this branch).

**Weight on the first screen:** none; the card is a lazy chunk opened by the click (`lazy(import(...))` as the follow button), about 2 KB estimated, to measure.

### 4.4 Search a realm by what it does (value high for its cost, risk nil, no server)
**What it shows, where.** The palette (`SearchDialog`, `search/search.ts`, `searchIndex.ts`): a query that no realm's name answers ("vote", "mint") also matches the functions the realm exports; the hit is the realm's usual row with a second line "Vote, MustVoteOnProposal" (the functions that matched, at most 3). Names win over functions: a realm named `vote` ranks above one that has a `Vote` function (a rank constant, tested). A mark `fn:` is not added (the palette's marks `# @ /r/ >` stay). The function words are the identifier split on its capitals and `_` (`MustVoteOnProposal` is "must vote on proposal"), matched with the palette's own `wordsOf` and `fewestEdits` (a swap or a letter off for a long word, none for 3 letters).

**Where it comes from.** The worlds file the palette already holds: each realm row has `functions` (`Realm.functions`, exported names, at most 256, from `vm/qdoc`; read for `wugnot` today by `gno_read` as `Deposit Withdraw Render TotalSupply BalanceOf Allowance Transfer Approve TransferFrom`). No server work, no request, no RPC, no new file. The only new bytes in the client are the index entries built once per set of items (`buildIndex`'s rule: never per keystroke): about 743 realms on the 2026-11-04 list at a few dozen functions each, a few thousand words, to measure.

**Cost, and what full-text over source would cost instead.** The function-name search is free (the data is in the client). A search over the realms' source needs the source, which the job does not read (it reads `vm/qdoc`, one request a package, and `vm/qfile` for the 16 KB gnomod alone). Reading every realm's source: `vm/qfile` lists a package's files, then one request a file: with 3 files on average (`wugnot` has 3: `gnomod.toml`, `wugnot.gno` 2,756 B, `z0_filetest.gno` 2,042 B) about 2,200 RPC requests for the 743 realms of 2026-11-04, 9 to 10 minutes at the job's 250 ms pause, once; then only new realms (code does not change, the job's rule), so about 1 request per new file. Storage: a few MB of text (about 5 KB a realm, an estimate from one realm) into the search index's FTS5 table (it exists: `search/index.ts`), plus a new route with the chat search's guards (global rate, `snippet.ts`, `marks` as offsets), a retention story, and a hostile-source story (a source is the most stranger-written text of the chain: snippets as text only). About 3 days of work and a second public search door. Not now: names answer "what does it do" for the first words people type (question 4 asks whether it is enough).

**Zod.** Nothing new: `ExportedName` already bounds each name at the file's boundary.

**How it fails.** The palette's own states: a worlds file that did not load leaves the realm kind empty as today.

**Tests (a ranking, so one small test each).** `search.test.ts`: "vote" finds a realm by `MustVoteOnProposal` and a realm named `voting` ranks above it; "mint" finds `Mint`; a three-letter query does not match off by a letter; a realm with no functions is found by name only; a function named with markup cannot exist (`ExportedName`): a test that a hostile worlds file cannot add one. The index is built once: a keystroke makes no new allocation of entries (the existing performance test's style).

**Review.** `reviewer`; no security review (no server, no stranger text that is not already schema-bound).

**Weight on the first screen:** none (the palette is already a chunk opened by the key or the click; the index is built when it opens).

### 4.5 One line of network health on the home (value medium, risk low)
**What it shows, where.** One `Row`-sized line under the hero's count, in the hero's small type, like `LatestOnX`: "Onyx today: N transactions · M accounts" (the words; the figures are the pass's) with a `Sparkline from="zero"` of the transactions of the last 14 UTC days (`fills`, the proposal's 92/84 rule), and a `title` with the day's date and the tip's age when the tip is old ("last block 12 min ago"). When the tip is older than 10 minutes (a halted chain) it says so instead of "today". Nothing else: no fees, no chart, no link.

**Where each number comes from.** The job's pass, from the indexer, over the UTC day (`blockDays.ts`'s `daysOf`, F13xxx-3): the transactions of each day (P10: one row each, a page of 1,000 covers six days at the current rate) and the accounts that sent them: the first signer of each message, `MsgCall.caller`, `MsgRun.caller`, `MsgAddPackage.creator`, `BankMsgSend.from_address`. The cross-check, run by the job's test and the probe of section 9: the day's count must equal the difference of `total_txs` across the day's boundary blocks (P9 shows the pair, 10,453 to 10,753). Today so far, from the first block of the UTC day (bisection), 14 days kept.

**What the server computes and caches.** The worlds job's pass (every 30 min): one more step after the rollup: `network.ts`, which keeps `network_days (day, txs, accounts_count)` and `network_day_accounts (day, address)` (an appended migration; rows pruned past 30 days, accounts as a set so a person is one), reads the transactions above its own height (a new `txsAbove(above, limit)` in `packages/chain/src/asks.ts`, fields as P10, no `content_raw`, no events), and holds the answer in memory like `trending.ts`: `GET /api/network` (new, tier 2) answers a 14-day list and the tip's height and time; 2 KB at most, `max-age=60`, never per request work. First pass: 14 days, about 2,300 transactions at today's rate, 3 pages.

**Caps.** A pass reads at most 20 pages of 1,000 transactions and 4 MB (a chain 100 times busier is refused the whole 14 days and keeps the days it has, logged `network_read_capped`); 14 days in the answer; counts are integers and capped at 10^9 by the schema.

**Zod.** `NetworkAnswer` (new): `version`, `universe` (`Slug`), `updated` (`Moment`), `tip {height, time}`, `days` (at most 14 of `{day (Day), txs, accounts}`); the client refuses a day that is out of order or a future day. The indexer's rows go through a strict row schema (the job's `Page` pattern: a row that fails is dropped and logged by kind).

**How it fails.** The line is absent (not zero) until a pass has written its first answer, and absent on any failure of the route: a home does not carry an error view for a decoration (D13022's inline kind is for a block the person asked for); the failure is logged by the server and the next pass retries. A halted chain says "Last block 3 h ago" from the tip.

**Stranger's data.** Only integers and a time reach the page; the addresses of the day are counted and dropped at the pass (the table keeps them only 30 days, nothing serves them). A spammer sending 1,000 transactions makes "today" 1,000: that is what happened on the chain. "Active accounts" counts the signer of a transaction's messages, not other signers of a multisig (section 9, item 4); it is labelled "accounts" and not "people".

**Tests (first, failing, then the red pass; server).** The pass over recorded P10 pages: days from block times, a transaction at 23:59:59.999 and one at 00:00:00.000, an empty page (null), a bundle of 3 messages is 1 transaction and 1 account, a deploy and a send count, a failed transaction counts (it paid), the resume above the last height, the cap (20 pages), the prune (31 days), the cross-check with `total_txs`; the route: before the first pass (404, the home draws no line), the headers; the answer's schema. Component: the line with 14 days, with 1 day (no sparkline: `Sparkline` draws nothing under 2 values), with a stale tip, absent. Mutation over the day bucketing.

**Review.** `security-reviewer` (new server route), `reviewer`; red pass.

**Weight on the first screen:** none. The line is its own lazy component mounted after the hero's first paint (`requestIdleCallback`-after-load, the home's existing deferral for `LatestOnX`; confirm which) and its request is made after load; the home chunk grows by its import only, measured against `budgets.spec.ts` before merging.

## 5. The load these add (every request an hour at most)
| Addition | Indexer | RPC | Who asks | At most an hour |
|---|---|---|---|---|
| Network health | tip, blocks for the day boundaries (bisection, 50 heights a request, about 4 a day boundary of 14) and 1 page of transactions | 0 | the job, every 30 min | about 25 a pass, 50 an hour; the first pass 14 days, about 60 requests once |
| Tokens | 1 page of events above the last height, and the blocks' times for the days it dates | 0 | the job, every 30 min | about 6 a pass, 12 an hour; the first pass at most 20 pages once |
| Person card | 0 | 1 balance read (`auth/accounts`, no eval) per address, cached 60 s | a visitor opening a card, behind the route's limits | at most 1 a second across every visitor by a token bucket: 3,600 an hour worst case; a card past the bucket shows no balance, never an error. Expected: tens |
| Call detail | 1 query by hash (0.30 s), 1 for the block's time | 0 | the visitor's browser, on a click | one in flight and cached for good per hash, so a visitor's an hour is the calls they open, tens; the public indexer's own limits apply. No server load |
| Search by function | 0 | 0 | nobody | 0 |
The rollup's existing read is unchanged. No eval anywhere: the only `vm/qeval` this slice's server makes is none.

## 6. Order, size and branches
By value over risk: 1. search by function (4.4, 4 h, no risk), 2. network health (4.5, 7 h), 3. a call's detail (4.3, 6 h), 4. the person card (4.1, 16 h), 5. token worlds (4.2, 12 h). Total about 45 h of work. Tokens go last because onyx has no token activity to show (F13xxx-1): the block is true but quiet, and the person card's "Tokens" block waits for it.

Branches (a name `slice-13-explorer-<letter>`, one worktree each, two at a time, the chief integrates):
| Branch | Addition | Files owned | Hours | Round |
|---|---|---|---|---|
| X1 | search by function | `app/src/features/search/` (`searchIndex.ts`, `search.ts`, `items.ts`, `PlaceResults.tsx` or the realm row, the tests) | 4 | 1 |
| X2 | network health | `server/src/worlds/network.ts` (+test), `packages/schemas/src/network.ts`, `packages/chain/src/asks.ts` (`txsAbove`), `app/src/features/home/NetworkLine.tsx`, its hook and test | 7 | 1 (beside X1) |
| X3 | a call's detail | `packages/chain/src/callDetail.ts`, `packages/schemas/src/callDetail.ts`, `app/src/features/chat/ChainCard.tsx` and a new `CallDetail.tsx`, `app/src/lib/query/keys.ts` (one key) | 6 | 2 |
| X4 | the person card | `server/src/people/` (route, read), `server/src/worlds/rollupStore.ts` (the index and the day table), `packages/schemas/src/person.ts`, `packages/chain/src/account.ts`, `app/src/features/chat/PersonCard.tsx` and its blocks | 16 | 2 (beside X3) |
| X5 | token worlds | `server/src/worlds/tokens.ts` (+tables, +route), `packages/chain/src/tokenAsks.ts`, `packages/schemas/src/token.ts`, the plate's block (`app/src/routes/plate/`'s token block, a new file), and the person card's token rows (`PersonCard.tsx`'s one block) | 12 | 3 |
Two at a time with no shared file: X1 touches only `search/`, X2 only the worlds job's new file, the home and `asks.ts`; X3 the chat's card and `packages/chain/src/callDetail.ts`, X4 the server's people folder, `rollupStore.ts` and the person card; X5 comes alone after X4 because it adds a block to X4's card. Wall time about 26 h for the five over three rounds.

Known merge points, each a single line the chief writes at integration, never in a branch: `server/src/main.ts` (the three routes), `server/src/migrations.ts` (append-only and hashed: X2, X4 and X5 each append one entry, so the second to merge appends after the first and rebases its `migrations.test.ts` hash; no entry is ever edited), `packages/schemas/src/indexer.ts`'s export list, `packages/chain/src/asks.ts` (only X2 edits it: X3 and X5 put their asks in files of their own, so the file cannot conflict), `app/src/lib/query/keys.ts`.
Tiers: no new tier-1 path is planned (`server/src/guard.ts`, `limit.ts` and the CSP are used as they are; all three routes are tier 2, "the rest of the server"; the plate, search and card UI are tier 3 or tier 2). If a branch finds it must edit one, it stops and asks (a tier-1 change gets its own commit, the red pass and the `security-reviewer`). Per D13023, each branch writes its server and stranger-data tests first and sees them fail; the radical mode's "no test while it builds" does not apply to these (they are server and security parts); pure display (the home line's look, the card's blocks) writes none beyond the component states listed. Each branch ends with the `reviewer` and, for X2, X4 and X5, the `security-reviewer`; the merge needs `check.sh` green, the first-screen cap, and nothing in `deploy/` changed (so no `deploy/test.sh`).
Dependencies on slice 13's other work: the shared error view (D13022) must be merged before X3, X4 and X5 draw a failed state: if it is not, they show the existing `Failing.tsx` pattern and the swap is one import. The demo runs without whatever is not merged: each addition is absent, never half-drawn.

## 7. Charts: what an explorer has and what this app should add
Gnoscan's home (the brief names its charts: transactions a day, fees a day, storage and fee share by realm; its page was not re-read this session, so the list is the brief's).
| Chart | Add? | Why |
|---|---|---|
| Transactions a day | Yes, as the home line's sparkline (4.5) | The data is one count a day from the pass P10 already gives; 14 points, at 160 a day it reads as a living network; it fits the home as a line, which is what Alexis asked. A bigger chart would draw 14 small bars |
| Fees a day | Not drawn, not stored now (question 5) | `gas_fee{amount,denom}` is in P1's fields: the day's sum of `ugnot` would be one more column in `network_days` and no request, added by one migration when a chart is wanted. A chart of fees on a testnet whose fee is a flat 8,146 ugnot a call (P1) is the transaction chart in a second colour; draw it when the network has fees that mean something (mainnet) |
| Fee share by realm | Not now | It ranks realms by what their callers paid. It needs the fee attributed to a realm: a transaction with several messages has one fee for several realms, and the rollup file's schema (`RealmRollup`, in use) would have to grow: a change to a schema in use is a stop-and-ask. The plate's "calls" and trending already rank realms by use, which is the same order on a flat fee. Add it with mainnet |
| Storage by realm | No | Needs gnoscope's decoded state (D567); storage over time is out of the realm plate's scope already |
| Transfers a day (a token) | Only when there is something to draw (4.2) | On onyx the chart is flat for 8 days (F13xxx-1) |
| Calls a day for a person | Yes (4.1) | One bar chart of 30 days from a table the rollup already half has |
Not asked, worth a thought: "top accounts by calls" is the rollup's `top` on every realm plate already; "new realms a day" is the home's deploys counter's neighbour and costs one query a pass (`deploysQuery` exists): a candidate after this slice.

## 8. Threat model (the slice's, ADR-0002's form)
| Asset or entry | Abuse | Mitigation | Proving test |
|---|---|---|---|
| `GET /api/people/<address>` (public, new) | Amplify: any address asked, every time a node read | The answer is the rollup's sqlite and memory; the one node read is cached 60 s per address, a global token bucket of 1 a second, 5 s timeout, 4 KB read; the per-IP and global limits; no query string; no indexer read | route tests: the 101st distinct address in a second gets no balance and no error; a cached address makes 0 reads |
| `GET /api/tokens/<hash>`, `GET /api/network` (public, new) | Enumerate, flood | Both answer from memory or an indexed read, with the same limits; the token route's key is the rollup's hash of a path, an unknown one is a 404 with no timing difference (one indexed lookup) | route tests, the limiter's |
| The indexer's answers (events, transactions, a call's args and memo) | Hostile text, huge numbers, a deep row | Zod at each boundary; a row that fails is dropped and logged by kind; every read capped in bytes, rows, pages and time; amounts as BigInt, a value past int64 refused; names stripped of control and bidi characters and cut | schema tests with the hostile bodies listed in each branch; mutation |
| A hostile token (a name with bidi, a duplicate id, a mint of 2^63-1, a Transfer under another `pkg_path`) | Lie about holders or supply, spoof another realm's token | Only `gno.land/p/nt/grc20/v0`'s events (unforgeable id, F13xxx-4); a negative replay or a duplicate `NewToken` marks the token unreliable: no holders shown | replay tests with each |
| A call's arguments and memo drawn in the chat | XSS, a phishing link, a spoofed layout | Text only, mono, `plain()`, no markdown, no link; cut lengths; `overflow-wrap` | component test with `<img onerror>`, a bidi override and a 1 MB argument |
| The public RPC | Eval floods | No eval anywhere; one `auth/accounts` read behind a bucket; the job's reads after the 250 ms pause | the bucket and the cache's tests; section 5 |
| The job | A slow or huge answer starving the worlds pass | Each new step is last in the pass, after the worlds' file and the rollup are written, caps of 20 pages and 4 MB, a fault never undoes the pass (the rollup's rule); `QUERY_DEADLINE` (P11) answered by narrowing the height range, not by a time filter | job tests with a failing and a slow fake indexer |
| The sqlite database | Growth | Pruned tables (30 days) and capped rows (token balances 100,000 a token) | prune tests |

## 9. Unknowable today, and the smallest probe for each
1. **Whether the 27 token worlds all emit GRC20 events** (the 22 tokens of P6 are 22 tokens, not 27 worlds; some may use older code or another library). Probe: join P6's 22 realm paths with `worlds.json`'s `nature: "token"` worlds, then for each of the 22 compare the replayed supply with `TotalSupply()` (22 `gno_eval`, once, by hand). Settles whether the block can be drawn for all 27 and which are "no data".
2. **`NewToken` events' real shape** (name, symbol, decimals attrs), read from `token.gno` and not queried. Probe: one query `type:{eq:"NewToken"}, limit 3` on the indexer (a minute).
3. **Mainnet's scale**: the same event query from height 0 on `gnoland-1` (a chain with real volume) may pass the indexer's 30 s deadline (P11 shows what it says). Probe: run P6 and P9 against `https://indexer.gno.land/graphql/query` with `limit 1000` and time them; if it is over 10 s, the pass pages by height windows of 100,000. Not needed for onyx, needed before any mainnet universe.
4. **What "active account" is**: the signer of a transaction is the first message's sender in P10's fields; a multisig transaction or a bundle signed by two keys has more signers, which `Transaction` shows only in `content_raw`. Probe: over the last 14 days count transactions whose messages name different senders (one query of 2,300 rows); if zero, the definition holds on onyx.
5. **Whether `total_txs` equals the sum of the days' rows** (the pass's own cross-check, P9 shows the pair for one span). Probe: the pass's unit test with a recorded day, then the probe on the live 14 days when X2 is built.
6. **The first-screen weight of the home line and the card's blocks.** Probe: `budgets.spec.ts`'s measure before and after on X2 (the same page, the same count), both numbers in the review card.
7. **Whether an unknown address's balance read is cheap** (`auth/accounts` is a store read; no time was given by gnomcp). Probe: 20 reads of an unknown and a known address timed from the server's own sender at X4's red pass.
8. **How the indexer lags behind the node** (a call's detail asked right after the line appears): the chain event arrives at the node's tip, the indexer may not have the row (the `not indexed yet` state). Probe: at X3, time between a `chain` event and the row's first answer, five calls.

## 10. Questions for Alexis
1. **Token worlds on a chain where no token has moved for 8 days** (F13xxx-1): build X5 at all now, or build holders and supply only (no chart, no "today") and let the transfers chart wait for mainnet? Recommendation: holders and supply, the chart only when 3 days hold transfers (as drawn in 4.2), last in order, so the demo does not wait for it.
2. **Where the balance is read**: by the server with a cache and a bucket (the plan), or by the browser straight from the RPC like the realm page's reads? Recommendation: the server, for one request, one schema and one cap.
3. **Where a call's detail is read**: by the browser straight from the indexer (the plan: no new door, immutable, cached for good), or by a server route that caches by hash (a second public door to review, the indexer never sees a visitor)? Recommendation: the browser.
4. **Search by function**: enough as function names (free), or also full-text over source (about 3 days, 2,200 first-pass RPC requests, a second search door)? Recommendation: names now.
5. **Fees**: store the day's fee sum in the pass now (free, unseen) for a later chart, or leave it out until a chart is wanted? Recommendation: leave it out (a column nobody reads is dead code; adding it later is one migration).
