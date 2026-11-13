# Slice 13: the realm plate (D566, D567)

The proposal's v7 (`.claude/tmp/design/realm-explorer/`, sections 6 and 8) built in the app; the feasibility review's numbers are in its section 6.

## 1. Done when
- A realm's plate shows, in this order: the hero (title, a sentence from its Render, kind, status, rank), the talk bar, the figures, calls per day with its calls, who calls it, what it can do, its page, Try it, around it, the detail widgets; no tab strip. A block with no data is absent, never invented.
- Calls and callers per day come from the server's rollup of that realm: days are UTC days read from block times, never a height-to-date line. A realm with 25,000 calls opens its plate with one rollup file of at most 8 KB gzip and no indexer query from the browser.
- Every list holds at most 100 entries in the browser; its filter takes 64 characters at most from a fixed set; its sorts come from a closed list; past 100, "more" leaves for the explorer.
- Try it runs a read with typed arguments (string, bool, int); a function whose first parameter is `realm` is refused; a value out of type or length is refused in the field's words; one eval in flight per card, 10 s timeout, a 64 KB result cap.
- A `$help&func=` link in Render opens that function's call card in place, its arguments prefilled only through `packages/core/src/args`; a send amount is never prefilled; an unknown function does nothing.
- A write opens the existing call card; signing is unchanged.
- One plate, many kinds (Alexis: the Earth and the future satellites get their own view "avec le même code"): the blocks take their data from one adapter per kind. A realm reads the chain and its rollup; the Earth and a hub world read the chat (who is here, countries, messages per hour, the 24 h chart, the latest on X) with no chain block; a satellite (slice 11) plugs in its own adapter later, no new block.
- The plate's code loads after the first screen: `budgets.spec.ts`'s first-screen cap holds.
- Only the effects the app already uses (the proposal's section 8 inventory); CSS by CUBE; `check_css`, `knip` and `check_comments` pass; what the plate replaces is deleted (RealmStanding's figures, Activity on realms, the old function list).
- Reduced motion: no arrival, values shown at once. At 390 px: one column, widgets two per row, no overflow.

## 2. Out of scope
- Explorer mode (the 1096 px plate): later, if Alexis keeps it.
- A library's own plate (`/p/` packages are not worlds today).
- Server-paged lists past 100 entries, storage over time, an app's website field.
- What only gnoscope gives (capability lines, the author's packages, storage and deposit), until question 1 is answered.

## 3. Threat model
| Asset or entry point | Abuse | Mitigation | Proving test |
|---|---|---|---|
| Render text (third party) into the visitor's page | XSS, a link that leaves | The tier-1 scanner, unchanged; `$help` links become an action, never an href | markdown.test: a `$help` link yields an action; `javascript:` and HTML stay text |
| A `$help` link's prefill | A phishing call: a transfer prefilled to the attacker | Fields shown, never signed alone; no send amount from a link; the call card's warnings unchanged | args test: `send=` ignored; feature test: the card opens unsigned |
| Try-it arguments into a qeval expression | Injection | One serializer writing quoted literals only; string, bool, int; length cap | Unit and property: quotes, backslashes, newlines and `)` round-trip; other types refused; mutation |
| A write run through qeval | A faked success | Refuse a first `realm` parameter (`realmType()`) | evalCall test |
| The public RPC | Eval floods | One in flight per card, a 10 s timeout, a 64 KB cap, a 400 ms debounce | Feature test with a fake transport |
| The worlds job | A huge realm exhausting it | Rollup bounds: 400 days, top 20 callers, last 100 calls, 100 importers, a file cap; incremental sweep | history.test at 250,000 synthetic calls: bounded file and memory |
| Names, paths, function names | Markup injection | Text only, escaped | Component test with `<script>` in a path |

## 4. Cost
- Per page view: one rollup file (≤ 8 KB gzip, `max-age=60` as worlds.json), a chart of ≤ 400 bars, a network of ≤ 60 dots, list filters in O(n) over ≤ 100. Bench: the chart at 400 days < 4 ms; the rollup parse < 1 ms.
- Per job pass: O(new calls) above the last height, plus O(realms) file writes. Bench at n, 4n, 16n calls: linear.

## 5. Scale
- First limit: the whole-chain read cap (`HISTORY_READ_BYTES`, 32 MiB, about 150,000 txs). The rollup reads incrementally above the last height and keeps its state in sqlite.
- Next: per-realm files (about 3 KB each, 30 MB per 10,000 active realms per year of days, estimated); shard the folder by hash prefix past 10,000 files.

## 6. Tests, by level
- **Unit (first, failing):**
  - `packages/core/src/args`: the literal serializer and the refusal of `realm`;
  - `packages/core/src/markdown`: `$help` actions;
  - the job's day bucketing and its boundaries from block times;
  - the rollup's bounds.
- **Contract:** the indexer's `getBlocks{height time}` and the rollup file's Zod schema, against recorded answers.
- **Feature:** the plate's order, its empty states, its error states and the Try-it states, all from recorded rollups.
- **Component:** widgets, list controls, the expand button; keyboard and axe.
- **End-to-end:** one journey, a realm world shows its chart and runs a read with an argument (run by its session).
- **Faults:** no rollup file, and the RPC down.
- **Performance:** the first-screen budget, and the two benches.
- **Mutation:** args, `$help` and the rollup's bounds.

## 7. Files and branches
- **Tier 1:**
  - `packages/core/src/args/`;
  - `packages/core/src/markdown/`;
  - `app/src/lib/chain/evalCall.ts`;
  - `deploy/web/nginx.conf` (a `location` for the rollup files; then `deploy/test.sh` in Alexis's Terminal).
- **A, the rollup:**
  - `server/src/worlds/` (history.ts incremental, a new rollup.ts, the writer);
  - `packages/schemas/src/realmRollup.ts`;
  - the nginx location.
- **B, tier 1:** args, evalCall and the `$help` actions. Tests first, the red pass, the security review.
- **C, the plate:** app/src/features/realms/ and world/ (Hero, TalkBar, Figures, the hub Card look with Expand, the day chart, PagedList, Widget, Network). It replaces RealmStanding's figures, the old lists and Activity on realms, with no copies left.
- **Order:** A and B run side by side, each in its own session and worktree. C starts from A's schema with recorded fixtures, and integrates B last.

## 8. Dependencies
- None.

## 9. Questions for Alexis
1. **gnoscope on the server**, yes or no? Without it:
   - capabilities from imports only (grc20 gives token, grc721 gives NFT, r/gov/dao gives governed);
   - ranks from worlds.json;
   - the author from the deployer the job already reads (`job.ts:3`);
   - storage and deposit hidden.
2. **Explorer mode**: later, or in this slice?
3. **The Earth's and a hub's plate** in this slice (their adapter, mocked first in the proposal), or right after it?
