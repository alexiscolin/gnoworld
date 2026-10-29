# Slice 5: data and the 2D interface

Plan of 2026-10-29, for Alexis's approval before any code. Sources: `docs/plans/backlog.md` row 5, "Slice 5, its head" (U3, U5), "Slice 4, after its reviews" (the chat's phone layout); the design system's rows that name slice 5 (F326, F304) or that its pages meet first (F336, F355, F376, F475); `docs/decisions.md` (row 151: the prices timer); ADR-0002 §1, §2, §4, §6, §8 row 10, §9; ADR-0001 §7, §12. Today `app/src` has three routes (`/`, `/w/:world`, the catch-all) over the one world in `worlds.ts`; `core/markdown` holds the chat's subset; nothing reads the chain; `csp.ts` sends one header for every page. The slice is the backlog's largest: it is cut in two parts, the second planned again once the first is merged (question 1).

## 1. Done when
Row 5, word for word: A malformed data file fails the build; every place has a page and a sitemap entry; Lighthouse SEO and accessibility at 100 on `/` and a world; a world with no capture shows no preview.
Added:
- U3: at 390 px, the conversation and its reply, edit and thread panels take the whole width inside the gutter; the rooms sit behind one control; Escape closes them and focus goes back to the control; direct messages the same.
- U5: no text within 16 px of the viewport's edge; the home link, the account and Log out on one header row; the approved pictures approved again.
- A realm page holding `<script>`, `<img onerror>`, a `javascript:` link and a hidden `<gno-form>` field shows them as text, every field visible, nothing outside the allowlist (ADR-0002 §4).
- A read function's answer comes from `vm/qeval`, labelled "read on chain, free, no signature"; nothing opens Adena.
- A testnet's pages are `noindex` (§2). The markets row shows its source and time, and leaves out a token with no price (§6). Typing in ⌘K sends no request.
- F304 the chart's hover tooltip; F326 a link to `/sitemap.xml` stays a plain anchor; F336 a thumb takes only the site's own paths and data URIs, no referrer; F376 `/W/bubble` refused; F475 only the expected inline scripts hashed; F355 the update notice covers nothing the keyboard reaches.

## 2. Out of scope
The 3D and "View in space" (7); bubbles (6); the passport, expedition, quests, calendar and "Go explore" (8: their data files are only checked here); calls, votes, write functions run from the app, the indexer's subscription, the ticker's chain events (9); Jarvis (10); satellites (11); `/n/`, `/r/`, `/p/` and Poll (phase 1); slice 4's leftovers with no slice (the verdict's pill, the gallery, Imgur); the Safari input-method check by hand.

## 3. Threat model
| Asset / entry | Abuse | Mitigation | Proving test |
|---|---|---|---|
| Data files (team pull requests) | A `javascript:` or `http:` link, an unlisted embed host, a huge or malformed file | Zod at build, https only, 4g's embed allowlist; the build stops | Each planted bad file fails `react-router build`; property test on the schemas |
| A realm's page (anyone's Markdown) | XSS, a tracking image, a phishing link, a page that freezes the tab, a hidden form field | `core/markdown` to an allowlisted tree, no raw HTML; gnoweb tags degraded to text; images from accepted hosts only; external links behind a warning; a size cap | Property: no input yields an element outside the list; fuzz; §1's journey; the cap's test |
| Read functions' fields | A field that injects a second expression into `vm/qeval` | Each argument encoded by its type in `core`, never pasted in | Property: any string becomes one literal; the expression parses to one call |
| RPC, indexer, CoinGecko answers | A wrong shape, a hostile string | Zod in `lib` and `server/src/prices`; on failure the last `markets.json` stays | Contract tests on recorded answers; fault journeys: RPC down, indexer down, no `markets.json` |
| The CSP | An injected inline script allowed by its hash; a header past a host's cap | Only the expected scripts hashed, JSON-LD included (F475); one policy per page | A planted script fails the build; the CSP journey watches for violations |
| Preview captures | An abusive picture captured from a site | Checked as a link preview (§6); no capture, no preview | The row's test; a refused capture never ships |
| `server`'s way out | The timer reaching other hosts | The egress proxy allows CoinGecko alone | `deploy/test.sh`: any other host refused |

## 4. Cost (proposed budgets, measured at n, 4n, 16n per ADR-0002 §9)
A place by its path: a Map built once, O(1) a navigation. ⌘K: one pass over the universe's places a keystroke, under 16 ms at 100× the data file. A realm page: linear in its bytes, benched at the cap. The chart's tooltip: O(1) a pointer move. The home page reads `markets.json` and the block height once a load; nothing polls. The build: pages × universes plus one image a world, its time printed at each merge. The places list counts against the 150 KB first-screen budget.

## 5. Scale
First limit: the one CSP header holds every page's hashes, about 12 worlds in a host's 2,000-character `_headers` line (`csp.ts`'s `ponytail:`); 5f moves to one policy a page. Next: the worker precaches every page and its data (question 9). Then: the places list in the bundle (next: each page's pre-rendered `.data`), the sitemap's cap of URLs per file (from memory, 50,000: to read in sitemaps.org's text before 5e), the build's time.

## 6. Tests, by level
Rows that apply: unit and property, component, feature, contract, end-to-end with axe at phone and computer widths, visual, faults, performance (Lighthouse, bundle), algorithms, scale (⌘K over synthetic universes), mutation, security (CSP). Not: load, realms, AI. First failing tests: `core/places` (canonical URLs, the `/net/:network` prefix, the Earth in every universe); the data schemas' build failures; `core/markdown`'s page blocks and the argument encoding (property, fuzz); the U3 and U5 journeys; the Lighthouse check.

## 7. Files and branches
New: `app/data/*`, `packages/core/src/places`, data, RPC, indexer and markets schemas in `packages/schemas`, `app/src/lib/chain`, `app/src/features/{world,realms,search,station,home}`, routes for `/earth`, `/e/:ecosystem`, `/list`, `/net/:network/…`, `server/src/prices`, `ui`'s `Breadcrumb`, `Combobox` and ⌘K palette. Changed: `root.tsx`, `routes.ts`, `meta.ts`, `react-router.config.ts`, `features/chat` (U3), `ui`'s `ActivityChart`, `PlanetThumb`, `link.tsx`, `deploy/`. Removed: `worlds.ts`. Tier 1: `csp.ts`, `core/markdown` and the realm-page renderer, the argument encoding, `deploy/`, `sw/*` if the precache changes.

Each branch runs as the Workflow `branch`, about 600 lines of product code at most (400 with a tier-1 file), two at once, each in its own session and worktree.

| Part | Branch | Delivers | Tests first | Waits on |
|---|---|---|---|---|
| 1 | 5a | The shell (U5, F355) | At 390 and 1280 px every box at x ≥ 16; link, account, Log out on one row; pictures | — |
| 1 | 5b | The room drawer and the chat's phone layout (U3) | Panels' width; open, Escape, focus back; DMs; axe | 5a |
| 1 | 5c | Data files, Zod at build, `core/places`, prerender from data, `worlds.ts` gone | Planted bad files fail the build; `core/places` properties | — |
| 1 | 5d | `/earth`, worlds from data, `/e/:ecosystem`, `/list` with genre filters, `/net/:network/…`, Breadcrumb, F376 | Every place has a page; `/W/bubble` refused; filters | 5c |
| 1 | 5e | Twitter Card, JSON-LD, testnet `noindex`, `sitemap.xml`, `robots.txt`, F326, Lighthouse in the gate | The row's sitemap and Lighthouse tests; testnet `noindex` | 5d |
| 1 | 5f (tier 1) | One CSP a page, F475, JSON-LD by hash | A planted script fails the build; each page's header size | 5e |
| 1 | 5n | ⌘K over the universe's places | No request while typing; keyboard; bench at 10× and 100× | 5d |
| 2 | 5g | `lib/chain`: `vm/qrender`, `qeval`, `qfuncs`, block height | Contract tests on recorded answers; RPC down | 5c |
| 2 | 5h (tier 1) | `core/markdown`'s page blocks, gnoweb tags degraded, the cap; realm card and view | Allowlist property and fuzz; §1's journey; the cap | 5f, 5g |
| 2 | 5i (tier 1) | Read functions as forms through `qeval`, typed argument encoding | Injection property; the answer's label; Adena never opened | 5h |
| 2 | 5j | World page: facts, activity with F304, connected worlds, talk box, quick actions, chat first on a phone | A component and a journey a block; the tooltip | 5b, 5d |
| 2 | 5k | Realm facts from the indexer, proposal cards (read), the status ring's data | Contract tests; indexer down | 5g, 5j |
| 2 | 5l (tier 1, `deploy/`) | The prices timer: CoinGecko to `markets.json` every 5 min; egress | Fake CoinGecko: a bad answer keeps the file, no price no token; egress | — |
| 2 | 5m | Hero, markets row, block height, ticker | Source and time shown; `markets.json` missing | 5l, 5g, 5d |
| 2 | 5o | Broadcast Moon: categories, generative pieces, embeds on a click | No embed request before the click; an unlisted host fails the build | 5d |
| 2 | 5p | An OG image a world, the capture job, the phone's places list, F336 | The row's no-capture test; a foreign `src` refused | 5e |

Side by side, part 1: 5a with 5c; 5b with 5d; 5e with 5n; then 5f.

## 8. Dependencies to ask for (npm not read here: each version and date checked before its branch)
`@tanstack/react-query` 5 (ADR-0001 §12) for 5g; `lighthouse` (asked in slice 1, put off in 1b-2) for 5e; `@gnolang/gno-js-client` and `@gnolang/tm2-js-client`, or none (question 6).

## 9. Questions for Alexis, each with Claude's recommendation
1. Cut the slice in two, part 2 planned again after part 1 merges? Recommended: yes.
2. U3: under 600 px (backlog) or 900 px (DESIGN-SYSTEM.md), a Rooms button or a `Dialog` drawer? Recommended: 900 px, the design system's one breakpoint, and a `Dialog` drawer (focus and Escape built in).
3. U5's header: the home link, account and Log out only, or also search, the universe switcher, "Testnet"? Recommended: the three now, a slot for search that 5n fills.
4. `/` on the demo: lead to `/net/onyx/`, or build with Onyx as the default? Recommended: Onyx as the build's default, `/net/onyx/` canonical.
5. The sitemap: mainnet only (§2 "indexed: mainnet only")? Recommended: yes; testnet pages exist, `noindex`, out of the sitemap.
6. The chain client: ADR-0001's two clients or `fetch` on the RPC's JSON? Recommended: `fetch` and Zod, no dependency (part 2).
7. Read functions with parameters (bring slice 9's `core/args` forward) or none? Recommended: none in part 2's first cut; write functions link to gnoweb until slice 9.
8. Realm pages' pictures: which accepted hosts? Recommended: none at first (a link instead); hosts asked when a realm needs one.
9. The worker's precache: every page, or the shell and the pages visited? Recommended: the shell and the pages visited.
10. OG images now from `PlanetThumb`, or after slice 7's generator? Preview captures: which page, where the job runs? Recommended: put to part 2's plan.
11. The data files' first content beyond `bubble`, and the hero's and Broadcast Moon's content: Alexis's or the team's to give before 5c.
