# Slice 5, part 2: the harness, chain reads, realm pages, world pages and prices

Plan of 2026-10-30, planned again once part 1 (5a to 5f, 5n) was integrated, as `docs/plans/slice-5.md`'s question 1 asked; approved by Alexis the same day with every recommendation of section 9 ("go hein", `docs/decisions.md`). Sources: that plan (§1, §3, the part-2 rows of §7, the answers to §9), backlog row 5 and "The fast gate's journeys scoped to the change", the chief's harness list (handoff of 2026-10-30, §5), part 1's reports (`.claude/tmp/slice-5/reports/`), ADR-0002 §4, §6 ("Media", "Prices"), §9, ADR-0001 §12. Today nothing reads the chain (`connect-src 'self'`), `core/markdown` holds the chat's subset, a world's page shows its name, description and chat, no data file names a world's realms, and the build stops past 100 `_headers` rules, about 20 worlds (5f).

## 1. Done when
Row 5's test part 1 left, word for word: a world with no capture shows no preview. (Part 1 met the others; Lighthouse's by axe and direct tests, decision of 2026-10-30.)
Carried from part 1's plan, word for word:
- A realm page holding `<script>`, `<img onerror>`, a `javascript:` link and a hidden `<gno-form>` field shows them as text, every field visible, nothing outside the allowlist (ADR-0002 §4).
- A read function's answer comes from `vm/qeval`, labelled "read on chain, free, no signature"; nothing opens Adena.
- The markets row shows its source and time, and leaves out a token with no price (§6).
- F304 the chart's hover tooltip; F336 a thumb takes only the site's own paths and data URIs, no referrer.
Added:
- The harness first (decision of 2026-10-29): a commit of the app runs only the journeys its change reaches, the merge check every one, measured before and after on the same commits; the loop starts the security lens by itself on every tier-1 file of `docs/REVIEW.md`.
- Every answer from the RPC, the indexer or CoinGecko passes Zod; a wrong shape or a service down shows a state with its next step, never a number without its source and age.
- No new pre-rendered page: a realm view is a client route, under the catch-all's policy.

## 2. Out of scope
Write functions and read functions with parameters (gnoweb's link until slice 9, decision of 2026-10-29); Jarvis's digests (10: cards show first lines, pinned actions, the link); pictures in realm pages (a link instead); the ticker's chain events and the indexer's subscription (9); the 3D (7), bubbles (6), the passport and quests (8); the worker's precache of the pages visited (§5).

## 3. Threat model
| Asset / entry | Abuse | Mitigation | Proving test |
|---|---|---|---|
| A realm's page (`vm/qrender`, anyone's Markdown) | XSS, a tracking image, a phishing link, a hidden form field, a page that freezes the tab | `core/markdown` to an allowlisted tree, no raw HTML; gnoweb's tags degraded (an alert a quote, columns stacked, `<gno-form>` a Form block with every field, any other tag text); no image; external links behind a warning; a byte cap and a depth cap | Property: no input yields an element outside the list; fuzz; §1's journey; each cap at its bound |
| Names from `vm/qfuncs` | A function name that closes the call and adds a second expression to `vm/qeval` | Parameterless functions only; a name kept only if gno's grammar reads it as one exported identifier (gno's source read before 5i) | Property: any `qfuncs` answer gives one call of one identifier, or nothing |
| RPC, indexer, CoinGecko answers | A wrong shape, a hostile string, a huge answer | Zod in `lib/chain` and `server/src/prices`; a size cap an answer; on failure the last `markets.json` stays | Contract tests on recorded answers; faults: RPC down, indexer down, no `markets.json` |
| The CSP's `connect-src` | A data file's `rpc` naming a host that reads visitors | `connect-src` is the universes' https RPC origins, from the data, printed at build | Build test: the directive equals the data's origins; an `http:` RPC fails the build |
| Broadcast Moon's embeds | An unlisted host | 4g's allowlist at build; an embed loads on a click | A planted host fails the build; no request before the click |
| `server`'s way out | The timer reaching other hosts | The egress proxy allows CoinGecko alone | `deploy/test.sh`: any other host refused |
| The harness | A branch switching off a guard it relies on | The security lens on the harness; `harness_mutate` on each changed guard | Each new guard's mutant killed |

## 4. Cost (budgets proposed, measured at n, 4n, 16n per ADR-0002 §9)
Chain reads: one request a view, nothing polls; the block height once a load, a realm page once a view, `qeval` on a click. `core/markdown`'s page reader linear in bytes: under 50 ms at a 256 KB cap (benched at 16, 64, 256 KB). The tooltip O(1) a pointer move. The timer: one CoinGecko request every 5 minutes. The realm view and its reader a lazy chunk, out of the 150 KB first screen. The fast gate: an app commit's time before and after harness-b, same commits, both numbers shown.

## 5. Scale
First limit: Cloudflare Pages' 100 `_headers` rules, about 20 worlds in the default universe; part 2 adds no page, and the next step waits for Alexis's answer in part 1's review (F2461). Next: the worker precaches every page and its data; the answer of 2026-10-29 (the shell and the pages visited) is built when pages pass a hundred. Then: one RPC host a universe, whose rate limit is to be read in its docs before 5g (not verified).

## 6. Tests, by level
Rows that apply: unit and property, component, feature, contract (answers recorded through gnomcp), end-to-end with axe at 390 and 1280 px, visual, faults, performance (the reader's bench, the bundle), security (the allowlist, fuzz, the CSP), mutation, the harness's mutation. Not: load, realms (none written), AI (slice 10). First failing tests: `test_hooks.sh`'s cases (a route's change runs its journeys only, the merge check all; a `csp.ts` change starts the security lens); `lib/chain`'s contract tests; the reader's property and fuzz; the `qfuncs` names' property; the timer against a fake CoinGecko; §1's realm-page journey.

## 7. Files and branches
New: `app/src/lib/chain`, the RPC, indexer and markets schemas in `packages/schemas`, `app/src/features/{world,realms,home,station}`, a realm-view route, `server/src/prices`. Changed: `core/markdown`, `csp.ts`, `packages/schemas/src/data.ts` (a world's realms, question 3), `ActivityChart`, `PlanetThumb`, `routes.ts`, `deploy/` (egress, the timer's service), `scripts/check.sh`, `test_hooks.sh`, `branch.js`, `deploy/test.sh`. Tier 1: `csp.ts`, `core/markdown` and the realm-page renderer, the `qeval` call builder, `deploy/`, the harness.

| Branch | Delivers | Tests first | Waits on |
|---|---|---|---|
| harness-a | `branch.js`'s TIER1 from `docs/REVIEW.md`'s table and the integration branch as the loop's base (5f's report); `deploy/test.sh` refuses a run while another holds its project; StrykerJS's survivors reach the reviewer (F2359, F2409) | `workflow_branch`: a `csp.ts` change starts the lens, the base is the slice's; a second deploy run refused | — |
| harness-c (`deploy/`) | `nginx -t` on the image's config and the build's table, and the per-page policies checked on a served build, in the merge check (question 7) | F2459's and F2460's faults planted: each fails the merge check | harness-a |
| harness-b | Journeys scoped to the change (backlog row); `check_regressions` when a commit touches a test; the audit when the lockfile changes; Vitest ignores `.stryker-tmp`, emptied before StrykerJS; heavy sections split so a mutant reruns its own case; the lint's "14683 problems" (F2414) found | `gate_scope`: a route's change runs its journeys only; a renamed test refused at commit; times before and after | — |
| fix-redact | F2462: the bot's REDACT of a folded batch came in 0.5 to 0.7 s, or not in 10 s (the full gate of 2026-10-30, 1 in 3 under load): its cause found and fixed, test first | A test that makes the lost REDACT happen at will | — |
| 5g (tier 1, `csp.ts`) | `lib/chain` with `fetch` and Zod: `vm/qrender`, `qeval`, `qfuncs`, the block height; `connect-src` from the data | Contract tests; RPC down; an `http:` RPC fails the build | harness-a |
| 5l (tier 1, `deploy/`) | The prices timer: CoinGecko to `markets.json` every 5 minutes; egress | Fake CoinGecko: a bad answer keeps the file, no price no token; egress | harness-a |
| 5h (tier 1) | `core/markdown`'s page blocks, gnoweb's tags degraded, the caps; realm card and view | Allowlist property and fuzz; §1's journey; the caps | 5g |
| 5j | World page: facts, activity with F304, connected worlds, talk box, quick actions, chat first on a phone | A component and a journey a block; the tooltip | harness-b |
| 5i (tier 1) | Parameterless read functions through `qeval`, the label, Adena never opened | The names' property; the label; no Adena | 5h |
| 5k | Realm facts from the indexer, proposal cards (read), the status ring's data | Contract tests; indexer down | 5g, 5j, question 4 |
| 5m | Hero, markets row, block height, ticker (the data's news and events) | Source and time shown; `markets.json` missing | 5l, 5g, question 6 |
| 5o | Broadcast Moon: categories, generative pieces, embeds on a click | No request before the click; an unlisted host fails the build | question 6 |
| 5p | The phone's places list, F336, "no capture, no preview" | The row's test; a foreign `src` refused | question 5 |

Branches `slice-5-harness-a`, `slice-5g` and so on, integrated on `slice-5-p2`, cut from `main` once part 1 is merged; a branch is cut from `slice-5-p2` as the branches it waits on left it. Side by side, two at most: harness-a with harness-b (other sections of `test_hooks.sh`); harness-c with fix-redact; 5g with 5l; 5h with 5j; 5i with 5k; 5m with 5o; then 5p. fix-redact, added after the approval (the full gate's find), comes first because a message the bot should hide may stay seen.

## 8. Dependencies to ask for (read on npm on 2026-10-30)
`@tanstack/react-query` 5.105.0, published 2026-10-26, one dependency (`@tanstack/query-core` 5.105.0), ADR-0001 §12's chain cache, or none (question 1). A tool: an nginx binary at the image's 1.30.6 for `nginx -t` in the merge check (question 7).

## 9. Questions for Alexis, each with Claude's recommendation
1. TanStack Query now? Recommended: not in part 2; each read is one request a view with no refresh; its cache earns its place with slice 9's chain events (ADR-0001 §12 keeps it).
2. Chain reads from the browser or through `server`? Recommended: the browser (ADR-0001 §12, ADR-0002 §4); `connect-src` built from the data's RPC origins, so a data file adding a host shows in the CSP.
3. A world's realms in `hubs.json` (a schema in use): an optional `realms` list of paths; pinned actions as gnoweb links until slice 9? Recommended: yes.
4. Which public indexer, at which address? Recommended: yours to give; its answers read and recorded before 5k, which waits for it.
5. OG images and the capture job (part 1's question 10): Recommended: part 2 ships the rule and its test (no capture, no preview, so no world has one yet); the job and the images move to slice 7, with the generator.
6. The data's content (part 1's question 11: no ecosystem yet, one world), the hero's and Broadcast Moon's: Recommended: 5m and 5o wait for it; without it before 5h ends, 5o leaves part 2.
7. `nginx -t` and a served build in the merge check (5f: two high findings no lane could see)? Recommended: yes, a pinned binary in `~/.cache/gnoworld-tools`, checksum checked.
