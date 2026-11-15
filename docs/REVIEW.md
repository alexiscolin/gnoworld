# Review

Review by risk, not line by line everywhere.

## What to read, and how

| Tier | What | Written by | How it is reviewed |
|---|---|---|---|
| 1 | Realms (`gno/r/`, `gno/p/`), the sponsor, relay authorization (`server/src/ergo/`) | Claude | Claude and a fresh-context `gno-auditor` read every line. Alexis reviews the function cards and the attack scenarios. External audit before mainnet |
| 1 | Client crypto (keys, signed statements, Merkle, the MLS boundary), the CSP (`app/src/csp.ts`, and `app/src/cspOrigins.ts` and `app/src/cspForms.ts`, where its connect-src origins and inline-script forms are decided), the chain reads' qeval builders (`app/src/lib/chain/evalCall.ts`, for a realm's call, and core's chain folder, `packages/core/src/chain/`, where the name read's builder and the CSP's host rule live, F3535) | Alexis for the core, Claude elsewhere | Alexis reads every line |
| 2 | Other TypeScript (state, queries, views) | Alexis for the core, Claude elsewhere | Alexis reads the tests first, then every line |
| 1 | The server's login (`server/src/login/`) and the client's (`app/src/features/login/`, `app/src/lib/api/login.ts`, `app/src/lib/ergo/`), the admin API's rights (`server/src/roles/`, `server/roles.json`), the approval signing, the admin console, Jarvis's tool-allowlist loop and its egress (`jarvis/src/`, whose allowlist.ts and gnomcp.ts decide them), Adena (`app/src/lib/adena/`) | Claude | Alexis reads every line |
| 1 | What decides who may do what at the edge: the deploy folder (`deploy/`), the markdown scanner (`packages/core/src/markdown/`), a call's arguments (`packages/core/src/args/`), the service worker (`app/src/sw/`), the server's guard of every route that changes something, its rate limits and its settings (`server/src/guard.ts`, `server/src/limit.ts`, `server/src/config.ts`, and the service's two guards, `packages/service/src/net.ts` for publicUrl and `packages/service/src/settings.ts` for absolute, T2), the chat's players (the embed host list, `app/src/features/chat/embeds.ts`, and its frame's sandbox, `app/src/features/chat/Embed.tsx`), the warning before a realm page's link leaves (`app/src/features/realms/useExternalLinks.tsx`, and `app/src/leaving.tsx`, where 8c moved it for the calendar and the bell too), the link that stops another host's address before the router (`app/src/pagePath.ts`) | Claude | Alexis reads every line |
| 2 | The rest of the server (TypeScript on Node) | Claude | Alexis reads the tests first, then every line |
| 2 | Go (the seal reference client) | Claude | Behaviour and tests |
| 3 | Interface, 3D, motion: `app/src/features/errors/`, `app/src/features/home/`, `app/src/features/list/`, `app/src/features/search/`, `app/src/features/update/`, `app/src/features/world/`, and the design system's folders `packages/ui/src/ActivityChart/`, `packages/ui/src/Avatar/`, `packages/ui/src/Breadcrumb/`, `packages/ui/src/Button/`, `packages/ui/src/Card/`, `packages/ui/src/ChatLayout/`, `packages/ui/src/Chip/`, `packages/ui/src/compositions/`, `packages/ui/src/Dialog/`, `packages/ui/src/EmptyState/`, `packages/ui/src/Field/`, `packages/ui/src/Flash/`, `packages/ui/src/icons/`, `packages/ui/src/Kicker/`, `packages/ui/src/Logo/`, `packages/ui/src/NavItem/`, `packages/ui/src/Overview/`, `packages/ui/src/Panel/`, `packages/ui/src/PlanetThumb/`, `packages/ui/src/Popover/`, `packages/ui/src/Row/`, `packages/ui/src/Skeleton/`, `packages/ui/src/Stat/`, `packages/ui/src/Tabs/`, `packages/ui/src/TokensPage/`, `packages/ui/src/Tooltip/`, each named one by one | Either | Run it; read the budgets the gate prints |

The backticked tier-1 paths of this table are read by machines: by `.claude/workflows/branch.js` (its security lens), by
`scripts/speeds.py --tier1`, which GitHub's detector runs from the base (a change with none of them skips the tier-1 jobs), and by
`scripts/check_docs.py`. The tier-3 row is the reader's (since D13168 no machine reads it): it fails closed, folder by folder: a feature
or design-system folder is interface only once this row names it, so a folder added tomorrow, and the files in `packages/ui/src/`'s own root,
are read as tier 2. The `chat` and `realms` features are not listed: the guards they hold or use are tier-1 rows (the embed host list and
its frame's sandbox, the warning before a realm page's link leaves, the link that stops `//host`), and the rest of them is read as
tier 2 (state, queries, views) with the rest of the TypeScript this row does not list. A state or query file in a listed folder is tier 3 for the
mutation check and is still read by its tests first. A folder is written with its slash. Add a security path here and both follow.

## Order

Most important first:

1. **Intent:** does it do what the plan says, and only that?
2. **Tests:** do they check the right thing? Would they fail if the code were wrong? The mutation check answers this for realms.
3. **Boundaries:** is untrusted input validated? Who may call this?
4. **Errors:** surfaced or swallowed?
5. **State and ordering:** races, stale state, cleanup.
6. **Security and costs:** secrets, gas, storage, render loops.
7. **Readability:** last.

## What to look for, by technology

The checklists live in `.claude/rules/`, one file per area (realms, TypeScript, the server,
Go, `packages/core`). Claude Code loads each one when a change or a review touches its files.

## Warning signs

- A test changed to pass, or skipped (`.skip`, `.only`).
- A mock that hides the real behaviour.
- A `catch` that swallows the error.
- A lint rule switched off.
- Hand-written crypto.
- A `TODO` in tier-1 code.

## Comments

Use [Conventional Comments](https://conventionalcomments.org): `issue:` (blocks the merge), `question:`, `suggestion:`, `nit:`. For an `issue:`, write the scenario: who calls what, with which arguments, and what they get.

## AI review before a merge

Code written by an agent gets the same reading as anyone's, plus this. `/pre-merge`
(`.claude/commands/pre-merge.md`) runs it, with the agents of `.claude/agents/`; from slice 5 a
branch's Workflow loop runs it (Alexis, 2026-10-28, `docs/decisions.md`); GitHub's gate judges the pull request (`docs/HARNESS.md`,
"The gate"):

1. **No tokens first.** check.sh on the committed tree, then GitHub's gate, StrykerJS on the changed tier-1 lines among
   its jobs: a surviving mutant is a missing test, found without a model (in its job's log until F13184).
2. **The red pass, once per branch.** Before any code, the `test-auditor` reviews the branch's
   failing tests against the plan: complete, relevant, riskiest paths first, the threat model's
   abuse cases present. Tier-1 and harness code alone (the speed plan, 2026-11-06). A fixer's tests get none.
3. **One combined review.** The `reviewer` agent reads the branch once: the tests' green pass on the
   mutation survivors (tautologies, mocks of the thing under test, empty assertions, timing
   guesses, a test weakened since its red pass), correctness, security, cost in big O against the
   size each input reaches, and simplification. Where StrykerJS runs on the files it reads its
   survivors and writes no mutant by hand. A tier-1 file or the harness adds the `security-reviewer`
   (Opus, the threat model), a realm the `gno-auditor`. A changed screen is the `reviewer`'s too, read
   with the video's frames (`docs/design/video-screens.md`) in the same pass; the `design-reviewer`
   runs apart only when the change alters how space looks (the scene, the planets, the cosmos) or the
   `reviewer` asks for it, once, and again only on the screens of a high finding a fix changed (frames
   missing fail the step). One review a pull request, before Alexis's merge (D13181). Each finding names its
   class, and its fix covers every instance; one only about style is dropped. A merge carries
   about 400 lines of product code at most when it touches a tier-1 file, and about 600 otherwise
   (DORA's small batches; Alexis, 2026-10-22).
4. **Reproduced before it is fixed:** a command, or a test seen failing, by the session (no agent
   verifies the reviewers' findings: the `finding-verifier` gave 5 ledger rows in November, none high,
   Alexis 2026-11-04; a fixer's rejection excepted, which a fresh reviewer checks, F5542). One nobody could reproduce stays `claimed`; a false positive
   is `rejected`, a true one whose behaviour is wanted `intended`, a true one of no matter `moot`,
   each with its reason. A speed claim names the call it timed, its input, Node's version and what
   the call answered. A fix of the product proves itself: its tests, run on the commit before it,
   must fail (F345; the reviewer reads it, since `prove_fix.py` left with check.sh's old lanes, D13168).
5. **High and medium fixed, low listed.** High and medium findings are fixed, test first. Low ones
   and anything beyond the plan go to one list for Alexis with a recommendation (fix now, a backlog
   row, or moot). A second round runs only for a high finding fixed in a tier-1 file, only its
   lens, on the diff since the first; after three rounds the review stops and Claude and Alexis
   reconsider the approach.
6. **Learn from it.** Every finding goes into [the findings ledger](review/findings.md), with its
   status and evidence, numbered in its slice's range from slice 12 (slice N: F N000 to N999, a hundred a
   part, `CLAUDE.md`). An agent greps it for its diff's paths and the ids it is given and reads those
   rows, never the file whole (1.2 MB, more than its run): no rejected claim raised again without new
   evidence, and a fixed one that comes back filed as a regression. A flaky test that passed on its
   second run is no ledger row; nothing records one that GitHub's retry passed (D13168). What Alexis caught and missed
   goes into the review log, with each branch's rounds, tokens and hours (measured against slice
   4's). At each slice's end, the dream (`CLAUDE.md`) reads the agents' reports, the learnings, the
   log and the ledger, and proposes the rules and memories a repeated miss calls for, and the
   rules, tests and checks to remove, each with what it costs and what it caught; Alexis accepts each.
7. **Measure the harness by its findings.** Each `/pre-merge` writes to the review log how many
   verified findings it found in the harness itself (`scripts/`, `.githooks/`, `.claude/`). If
   that number does not fall over three merges, the harness is simplified, not extended: a guard
   that keeps leaking is replaced by a boundary the system enforces (the sandbox, a server
   check), or removed.
8. **Keep it cheap.** Each branch runs in a new session of its own, in its own worktree, two at
   most at once; the chief session plans, integrates and reads GitHub's gate. Agents are fresh,
   briefed from files, four at most at once, each asked for a short report: its findings, one row
   each with its evidence. Before asking for a push, the session runs once every job GitHub will run on the change,
   `sh scripts/check.sh` whole among them (D13178, D13186); GitHub's gate runs them again on the pull request
   (`docs/HARNESS.md`, "The gate"). A fix of about 20
   product lines or fewer that touches no tier-1 or harness file takes the fast lane: its test seen
   failing, the gate, the journeys that watch what it changes and one `reviewer`; no red pass and no
   design pass unless it moves an approved picture. Design still being tried goes to the workshop
   (`docs/DEVELOPMENT.md`, "The workshop") and lands later, in one tested batch. A part may raise one
   chunk's size cap by up to 256 B without asking, never the first screen's: the new cap, its size
   and no more, in a commit of its own with a `Lowered-floor:` line, both numbers in its report
   (Alexis, 2026-11-04).

### A part's weight by its kind (Alexis, 2026-11-04)

| Kind | For | What runs |
|---|---|---|
| Retouch | a look tried live in the workshop (ping-pong) | at the batch's end: the gate, the pictures of the screens it touches, one `reviewer` |
| Small fix | about 20 product lines, no tier-1 or harness file | its test seen failing, the gate, the journeys that watch it, one `reviewer` |
| Feature | product code with no tier-1 or harness file | new logic a small test, one combined review a pull request (D13181; the design apart only for how space looks), two lots at most |
| Light harness (D13193) | a harness change under about 50 lines that removes, narrows or weakens no guard and touches no secret, right or sandbox | its test seen failing, one combined review |
| Sensitive | a tier-1 file or the harness | all of the above, the `security-reviewer` (and the `gno-auditor` for a realm), up to three rounds, effort xhigh |

The `security-reviewer` weighs what harms people or the system: injection, who may call what, secrets, overload, leaks.
A way to game a display's ranking or count (a ticker, a trend) is a low, kept for after the demo, never a round of its own.

## Before a push

Each merge lives on its branch. A push scans the whole history for secrets, and `main` is refused: it takes pull requests alone,
merged by Alexis on GitHub once `gate-ok` is green (`.githooks/pre-push`, D13165). In Alexis's shell the hooks run nothing of the
repository but that scan (F076); GitHub's gate runs the checks again on the pull request, from the base's scripts, and its changes
job refuses a harness file no commit declares on a line `Harness-changed: <path> - why` (D13173).

## Blind first

Alexis reads the diff in revdiff, beside the session, from the main checkout: `revdiff -o .claude/tmp/revdiff.md <base> <branch>` (the previous merge's branch, then this one). His notes land in that file, which git ignores; "read the review" asks Claude to read them and answer each one.

In the first slices, the author gives only the review card's items 1–3, 7 and 8: what to read, what to skim, what to try, each realm function's card, the risk and its undo. Alexis reviews and writes findings, then compares them with the author's and with a fresh-context reviewer's. Each comparison goes into [review-log.md](review-log.md): what was caught, what was missed, and why.
