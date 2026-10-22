# Slice 3: Ergo, the server, the login and moderation

Plan of 2026-10-21, rewritten after Alexis answered the first draft's 20 questions
(`docs/decisions.md:137-162`); for his approval before any code. Where a decision and the draft
differ, the decision wins. Merge 2g lands first: it brings F378, the import table and bans linted for
`app`'s folders and the lint config split into parts (`.claude/tmp/2g-decisions.md:5`), which 3a extends
for `server`. Read first: ADR-0002 §4 (Adena), §6 (moderation), §7 (the server, Ergo, where it runs), §9
(the bar); `docs/REVIEW.md` (tiers); `docs/plans/slice-1c.md` (what 1c left here).

Citations are `file:line` on branch `slice-2f`: `ADR2` is `adr/0002-validated-prototype.md`, `ADR1`
`adr/0001-gnoworld.md`, `dec` `docs/decisions.md`, `bl` `docs/plans/backlog.md`, `cf`
`docs/plans/chat-features.md`, which 3a commits (its rows keep
their ids). A claim about Ergo, Adena's SDK or OpenAI comes from one of those files or is marked
**unverified** (CLAUDE.md:33). `cf` read Ergo v2.19.1's manual, config and Go files through a summarising
fetch, not a checkout (cf:270), so every Ergo statement below is a claim until a test of 3b passes against
the real binary.

Slice 3 gives gnoworld its first server: the first code that holds a secret, takes connections from the
internet and calls out. Ergo, the IRC server, runs as an image we configure. `server`, a TypeScript
process, turns a wallet signature into a login (it writes the text to sign, keeps the token in an HttpOnly
cookie and hands Ergo a 60-second ticket), runs a moderation bot (simple rules, then OpenAI; it hides and
explains through IRC, says "checked" through a stream, mutes repeat offenders, checks every edit), keeps
the roles file and the rooms by role, counts activity, enforces retention with an alert at 80%, and a
strict CSP is set before the first token lives in a browser. The browser's half of the login is slice 4's
first merge (dec:139; section "What slice 3 hands to slice 4"). Why now: slice 4 cannot ship a composer
without a way to speak, a way to be refused and a moderated room (ADR1:1044 forbids a public launch
before moderation is settled).

## 1. What I found first

1. **`core/irc` has no body.** Its five functions throw (`packages/core/src/irc/irc.ts:26-47`) and the 15
   `test.fails` blocks of `irc.test.ts` wait for Alexis. The bot reads and writes IRC lines through it
   (ADR2:1084). Nothing before 3h needs it: Alexis writes it while 3a to 3g are reviewed.
2. **`server/` and `packages/schemas` are in no config.** `pnpm-workspace.yaml:1-3` lists `app` and
   `packages/*`; `vitest.config.ts:12,33`, `stryker.config.json:6-17`, `knip.json:5-12`, `tsconfig.json:3`,
   the `typecheck` script (`package.json:12`) and `eslint.config.ts` name no `server`. The package files, the
   workspace file and `pnpm add` are closed to Claude (`.claude/settings.json:18, 40-46`): dec:137 makes them
   one script for the whole slice. **Gap:** the deny lines name the root, `app` and `packages/*` package
   files (:40-42), not `server/package.json`, which pnpm will run with Alexis's rights like the others
   (finding F087). The settings file is closed to Claude: Alexis adds `Edit(/server/package.json)` or accepts it.
3. **What the sandbox reaches.** `proxy.golang.org`, `sum.golang.org`, `github.com` and npm
   (`settings.json:100`); Go caches and `~/.cache/gnoworld-tools` are writable (:105-108); Go 1.26.2 is
   installed; local ports bind (:99); Docker's socket is refused (slice-1c.md:47-48). **Unverified:** that
   Ergo's tag builds with this Go, and that a sandboxed process may bind a Unix socket (the auth-script's,
   ADR2:970-971). 3b answers both first; dec:138 says recorded exchanges stand in if either fails.
4. **Ergo and Adena are second-hand.** ADR1:248-250 says Ergo was "checked in its source on 2026-10-15" and
   ADR2:10 that the SDK was "read in its source and tested in Node"; no file, fixture or script of either is in
   the repository. The login needs no chain read (ADR2:83-84), so `server` reaches only OpenAI.
5. **The demo's front door.** `web` asks a password (`deploy/web/nginx.conf:50-51`), limits each visitor
   (:36, :52) by the PROXY-protocol address (:48), and Funnel forwards only `web:8080`
   (`deploy/tailscale/serve.json:4`). So Ergo's WebSocket and `server`'s API go through `web`, and the
   password's `Authorization` header must not travel on to them (3e).
6. **The way out.** `inside` is internal with no gateway (`deploy/compose.yaml:101-107`); the guard's rules
   allow only `web:8080` on `inside`, DNS and public 80/443/UDP, and refuse every private range
   (`deploy/guard/guard.sh:25-38`), with no rule for replies. 1c left the egress proxy here
   (slice-1c.md:22-23). My design: the proxy runs in the guard's namespace as Tailscale does
   (`compose.yaml:71`), so the kernel refuses private addresses whatever the proxy resolves; the guard gains
   a reply rule. **Unverified** until the operator's first run.
7. **The cookie changes the threat model.** The draft's "no cookie, no CSRF surface" is gone (dec:143):
   CSRF, login CSRF, session fixation and "script cannot read the token but can still use the session"
   are rows of 3c and 3d.
8. **Docs that disagree**, fixed by 3a: `bl:78` (the name shown from `r/sys/users` is the browser's:
   ARCHITECTURE.md:12; the prices timer is slice 5's), `bl:76` (lists `server` and `packages/schemas`
   workspaces that slice 1a deferred), `OPERATIONS.md:4` (gives Grafana and `jarvis` to slice 3; dec:151
   says Jarvis's slice), `slice-1c.md:23` (Grafana), `bl:79` and `bl:84` (the login's browser half), `bl:87`
   (roles exist from slice 3), `bl:132` (editing returns by convention). The slice's "Human: -" row ignored
   the pending `core/irc`.

## 2. Settled (not questions)

- Stack: TypeScript on Node 24.22.0, Hono, `node:sqlite` (`typeof DatabaseSync` is `function` on 24.22.0,
  run in this session), pnpm workspaces, one image for the server's code (ADR2:1071-1091).
- The verifier is the SDK's `verifyArbitrarySignature`, called with the signer, the chain id and the exact
  text (ADR2:524-528). Rate limits are about twenty lines of ours (ADR2:1082). `server` is a singleton with a
  lock (:968-969); secrets are `*_FILE` paths (:1028-1029); logs hash accounts with an HMAC pepper (:887-889).
- Review: the server's login and `lib/adena` are tier 1, Alexis reading every line (REVIEW.md:12); the
  rest of the server tier 2, tests first (:13); the CSP tier 1 (:10); `deploy/` is security-sensitive and
  its tests are the operator's (slice-1c.md:62). The decisions as they land: section 3.
- A merge carries about 400 lines of product code (REVIEW.md:78-79), tests apart; each is on its own
  branch, test first, the red run named on the commit's `Red-pass:` line (CLAUDE.md:21, dec:132); estimates
  below are mine, by analogy, and become counts when each merge starts.
- No Go and no realm is written here: Go in this repo is `gno/tools` only (`.claude/rules/go.md`); Ergo is
  built, never written.

## 3. The merges

The first draft's 8 merges become 14: the roles, the mute, the anti-spam rules, edits and the room types
added about 2,200 lines to a first estimate of 1,900. Each stays near 400. 3a to 3g wait on none of
Alexis's code (only on his running the script and the operator's tests); 3h to 3n wait on `core/irc`. Against
the first draft: its 3a, 3c and 3d keep their names; its 3b (the stack) is 3e, its recorded fixtures giving way
to 3b's real Ergo; its 3e (egress) joined 3e; its 3f (the bot) is 3h to 3k; its 3g (activity, prices, k6) is
3h and 3n, the prices going to slice 5; its 3h (the CSP) is 3f; 3g, 3l and 3m are new.

**Ten merges, not fourteen** (Alexis, 2026-10-22): a merge that touches no tier-1 file carries about
600 lines (`docs/REVIEW.md`, "Rounds converge"), so 3a, 3b and 3g land as one merge on `slice-3a` (3a came
to 238 lines), 3k with 3j and 3m with 3l, each pair on the first one's branch; 3c, 3d and 3f, tier 1, stay
alone. The parts keep their names below. The merges are stacked: while Alexis
reviews one, the next is built on a branch he makes from it, and what his review changes is rebased into it.

| Merge | Branch | Proves on its own | Tier | Est. lines | Waits on |
|---|---|---|---|---|---|
| 3a | `slice-3a` | `server` runs from Node-run TypeScript, refuses bad input and stops cleanly; the slice's one script installed the approved list and nothing else; every guard added to the gate fails its planted fault | 2, harness | ~380 | 2g, the dependency check |
| 3b | `slice-3a` (with 3a) | A real Ergo, built from a pinned source, runs in the gate; each unverified claim about it is a test, and the table of what was found is filled | 2, harness | ~200 | 3a |
| 3c | `slice-3c` | A forged, replayed, raced, expired or other-network proof is refused; a valid one sets an HttpOnly cookie; CSRF and a foreign origin are refused | **1** | ~380 | 3a |
| 3d | `slice-3d` | A ticket logs a person into real Ergo, a reconnect needs no signature, a guest reads but cannot speak, a replayed or other account's ticket is refused | **1** | ~300 | 3b, 3c |
| 3e | `slice-3e` | Through the demo's door a guest reads and cannot speak, no hand-made account exists, `server` reaches only the listed host, nothing reaches the host or the LAN | `deploy/` | ~250 + tests | 3b, 3d |
| 3f | `slice-3f` | Every response carries one strict CSP from one source, and each planted violation is refused | **1** | ~220 | 3a (after 3e: it names the real paths) |
| 3g | `slice-3a` (with 3a) | The roles file (team, trusted, world moderators, per-world rules) parses, fails closed and answers who may do what | 2, rights read whole | ~160 | 3a |
| 3h | `slice-3h` | The server's IRC link keeps the bot in every room of the file, creates no other, ignores DMs, counts activity; the activity API answers only for the worlds asked | 2 | ~380 | 3d, 3e, 3g, **`core/irc`** |
| 3i | `slice-3i` | A message is checked once, by the rules then by OpenAI; an unknown answer counts as not checked; the queue is fair and bounded | 2 | ~350 | 3h; 3e's egress for the live path |
| 3j | `slice-3j` | A flagged message is hidden and its author sees why; a preview never renders before its check; after an outage the bot checks what it missed | 2 | ~330 | 3i |
| 3k | `slice-3j` (with 3j) | Repeat offenders are muted by themselves and unmuted on time, the whitelist is spared, every edit is checked | 2 | ~250 | 3j |
| 3l | `slice-3l` | Only a world's moderators or the team create or archive its further rooms; rooms exist only because the server made them | 2, rights read whole | ~220 | 3g, 3h |
| 3m | `slice-3l` (with 3l) | Each of the five room types lets in, shows and lets speak exactly who it names, over any IRC client | 2, rights read whole | ~400 | 3k, 3l |
| 3n | `slice-3n` | Retention runs by days and size with an alert at 80%; the first load numbers exist and `web`'s connection limits are sized from them | 2, `deploy/` | ~300 | 3j, 3m |

Tier-1 merges, read line by line by Alexis: 3c, 3d, 3f. "Rights read whole" is my proposal, not a tier of
REVIEW.md: the files that decide who may moderate, create a room or enter one (3g's `can*` functions, 3l's
check, 3m's type-to-modes mapping) are small and a wrong line hands out power, so Alexis reads them whole
as he does the admin API's rights (REVIEW.md:12). `/pre-merge` adds `/security-review` where the range
touches a tier-1 file or the harness (dec:125): 3a, 3b, 3c, 3d, 3f; the `security-reviewer` agent reads
3e's `deploy/` and every tier-1 lot. The last merge, 3n, runs the workspace reviews (dec:125).

**Where each decision lands**

| Decisions | Merge |
|---|---|
| 137 (one script), 140 (the feature list), 152 (dependencies), 160 and 157 (no uploads, search later: recorded in the list and the backlog), 161 (comforts: slice 4) | 3a |
| 138 (Ergo from source, run by the gate) | 3b |
| 141 (text by the server, generated test signatures), 142 (chain list), 143 (cookie, cap), 144 (no name; limits by account and address) | 3c |
| 143 (ticket), 147 (nick by the server) | 3d |
| 151 (egress, logs only), 154 (Ergo's retention), 147 (rooms only by the server) | 3e |
| 150 (CSP) | 3f |
| 147, 149 (roles file) | 3g |
| 147 (main rooms), 148 (counters for levels later) | 3h |
| 153 (OpenAI key, Zod), 159 (anti-spam rules), 154 (records 180 days) | 3i |
| 145 (verdicts: IRC and the stream), 158 (the stream's union leaves "preview removed" to slice 4) | 3j |
| 146 (mute, whitelist), 156 (edits, the bot's part) | 3k |
| 147, 162 (rooms by moderators; earned rights later) | 3l |
| 155 (rooms by role) | 3m |
| 154 (days and size, 80% alert), 151 (k6) | 3n |
| 139 (browser half: slice 4's first merge) | section "What slice 3 hands to slice 4" |

**Human parts.** `packages/core/src/irc/`: Alexis writes the bodies and removes the 15 `test.fails`
marks of `irc.test.ts` (already written and committed); it is needed before 3h. The server's command
builders (`JOIN`, `REDACT`, `NOTICE`, `MODE`, `CHATHISTORY`) are plain calls of `formatLine` in
`server/src/irc/`; if Alexis wants them in `core`, they are pairing work (the test first, marked
`test.fails`, then stop: CLAUDE.md:26). Nothing else is human.

---

## 3a. `server/` in the gate, and the server's skeleton

**First, before the red tests: the slice's one script** (dec:137, :152).
1. Claude checks each approved package (section 6) on the registry: version, publish date, its own
   dependencies and install scripts, against `minimumReleaseAge` and `trustPolicy: no-downgrade`
   (`pnpm-workspace.yaml:8-9`). One that pulls in something doubtful (a pre-release fork, as `workbox-build`
   did: dec:67) stops the work and goes to Alexis. The result is written in the script's header and in
   section 6.
2. Claude writes `.claude/tmp/slice-3-setup.sh`; Alexis reads it and runs it once. It creates
   `server/package.json` and `packages/schemas/package.json` (exact versions, as `package.json:23-39`
   does), adds `server` to `pnpm-workspace.yaml:1-3`, extends the root `typecheck` script (`package.json:12`)
   with the two projects, installs the approved list with `pnpm add`, runs `pnpm install --frozen-lockfile`
   to prove the lockfile stands and prints `git diff --stat`. Later merges add no dependency; one that must
   stops and asks (CLAUDE.md:51).

**Done when**

| What changes | The test that fails first |
|---|---|
| `server/` and `packages/schemas` are in `tsc` (the server's own tsconfig, with Node's types: closes F105, findings.md:120), ESLint (F378's parts plus a server part: ARCHITECTURE.md:98 no React, scene, ui or features; `fetch` only in `server/src/net.ts`; `console` only through the logger: ARCHITECTURE.md:124-125), Vitest, coverage, StrykerJS, knip and jscpd | `scripts/probe.py` cases: a React import, a bare `fetch`, a `console.log`, a floating promise and a swallowing `catch` in `server/` each refused; `harness_mutate.py` sees one fail with each rule off (CLAUDE.md:35) |
| Settings from the environment, every secret only from a `*_FILE` path (ADR2:1028-1029), checked by Zod at start; a missing or malformed one stops the boot naming the setting, never a value | Each setting missing, empty and malformed; a planted secret never in the message |
| `GET /health` and `/ready`; body limit; request, header and idle timeouts; secure headers; an error handler that prints no stack (ADR2:1081, :1099-1103) | `app.request()` cases: 413 over the limit, generic 500, headers present |
| A JSON-lines logger on stdout (ADR2:1089); an account is logged only as an HMAC with the pepper (:887-889); tokens, tickets and signatures never | A planted token, ticket, signature and address never appear in the output |
| SQLite through `node:sqlite`: one connection, WAL, `STRICT`, expand-then-contract migrations at start (ADR2:1034, :1101) | A migration run twice is a no-op; a table without `STRICT` fails a test |
| One process: a second on the same database refuses to start (ADR2:968-969); the mechanism is chosen by this test (the docs give none) | A child-process test starts two |
| A limiter of about twenty lines, in memory, with a size cap (ADR2:1082); the visitor's key (the address the proxy sets, trusted only from the configured peer; an IPv6 address keyed by its /64, my proposal); the one outbound helper, with `AbortSignal.timeout` | Property: never more than N per window, never more keys than the cap over 100,000 distinct keys; a forged header from another peer is ignored; a stalled fake server is cut at the timeout |
| `SIGTERM` drains and exits 0; a rejection that escapes stops the process (ADR2:1102-1103); `--disallow-code-generation-from-strings` (:1099) | A child process gets `SIGTERM` mid-request; one started as the image starts it cannot run `new Function("return 1")` |
| The server's TypeScript runs as written and imports `@gnoworld/core` and `@gnoworld/schemas` through the workspace links (ADR2:1080 says Node refuses `.ts` inside `node_modules`) | A test spawns `node` on the entry file |
| Docs: `docs/plans/chat-features.md` is written from `cf`, with Alexis's choices recorded (below); the backlog, `OPERATIONS.md:4`, `slice-1c.md:23` and ARCHITECTURE.md's server folders follow the decisions (section 1, item 8) | `python3 scripts/check_docs.py` stays green (check.sh:104); no code |

**The feature list.** `docs/plans/chat-features.md` is `cf` with its header's "Nothing here is decided"
replaced by a table of what Alexis chose on 2026-10-21, each with its row in `dec` and its merge: rooms by
role (155, 3m); editing by our convention (156, 3k and slice 4); search after slice 4 (157, a backlog row);
previews removable (158, slice 4); simple anti-spam rules (159, 3i); no uploads (160); the four comforts
(161, slice 4); rooms earned later (162, 3l); the mute (146, 3k); roles (147, 149, 3g); verdicts (145, 3j).
Its `s3:` and `dec:` line cites are rewritten to this plan's sections (the draft file is not committed).
§2's six corrections to ADR-0002 (`+draft/reply` is `+reply`; Ergo serves history to members only, so the
telescope's fallback holds; nicklen 32; the specs that are still drafts; `TOPIC` is taken by the pin;
`operator-only-creation`) stay for Alexis to apply, the ADR being his.

**Held to the bare name.** The server's lint refuses `fetch` outside `net.ts` by its name only:
`globalThis.fetch`, a destructured `fetch` and `node:http` requests pass it. The boundary is 3e's egress
proxy, which lets `server` reach only the listed host; a list of names that leaks door by door is what
`docs/REVIEW.md` item 7 says to stop extending (the harness's findings rose over 2e, 2f and 2g). Settings
are capped: a host at 253 characters, the database's path at 1024.

**Out of scope.** Any route but health, Ergo, the login (3c), the image and compose (3e), OpenTelemetry
and Grafana (slice 10, dec:151), the prices timer (slice 5), the admin API (12).

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A huge or slow body ties the server up | Body limit, timeouts, bounded work per request | The 413 and timeout cases |
| A secret reaches an environment variable, a log or an error | `*_FILE` only, errors name the setting, redaction | The log and error cases |
| A map or queue grows with attacker input | Every collection has a cap (`.claude/rules/server.md`) | The limiter's property test; the review reads each map |
| The visitor's address is forged | Read only from the configured peer | The forged-header case |
| The process fails open after an error | Rejections stop it; a generic 500 | Fault cases |
| `eval` or code from strings | The Node flag and ESLint's `no-eval` | The `new Function` case |
| A dependency is hostile or young (the SDK is 0.1.x: ADR2:512-513) | The approved list only, exact versions, `--frozen-lockfile`, `minimumReleaseAge`, the check of step 1 | The script's diff, read by Alexis; the advisory check of the full gate (`scripts/audit.py`, check.sh:134) |

**Tests by level.** Unit, property (fast-check), feature (`app.request()`), child-process tests, mutation
(StrykerJS), harness (probe and mutation). No Go, no journey (no UI, no route to walk). **Cost and scale.** No
hot path; the limiter is O(1) per call over a bounded map; the first limit is the singleton (ADR2:1112).

**Files.** New: `server/` (`package.json`, `tsconfig.json`, `src/` `main`, `app`, `config`, `log`, `db`, `limit`,
`visitor`, `net`, migrations), `packages/schemas/`, `docs/plans/chat-features.md`. Changed by Claude:
`eslint.config.ts` and its parts, `vitest.config.ts`, `stryker.config.json`, `knip.json`,
`tsconfig.json`, `scripts/probe.py`, the docs above; commits declare `Harness-changed:` (dec:48). Changed
by Alexis's script: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, the two package files. No
tier-1 file, no human part. If the count passes 400 at the red tests, `net` and `visitor` move to 3c.

---

## 3b. Ergo, built and run by the gate

**Done when**

| What changes | The test that fails first |
|---|---|
| One file, `deploy/ergo/VERSION`, holds the pin: tag v2.19.1 (ADR1:226; `cf:41`, released 2026-08-05) and its commit; the gate, the image build (3e) and the runbook read it. A gate step builds Ergo into `~/.cache/gnoworld-tools` through the Go proxy and checksum database, or from a clone of the tag (both reachable: settings.json:100), only when the cached binary is missing or reports another version. **Unverified:** that the tag builds with Go 1.26.2 and by which route | The step with the binary missing builds it; with a changed pin rebuilds; with `go` missing, or the build failing, refuses and names why (the bypasses CLAUDE.md:35 asks for) |
| A test helper starts Ergo on a free local port (loopback only) from `deploy/ergo/ircd.yaml.tmpl`, one template with two renderers (this one and 3e's), waits until it listens, and stops it and removes its files | Two starts in parallel do not clash; a crash of Ergo fails the test and does not hang; the bind address is asserted loopback |
| A raw-line client helper (send a line, wait for a line matching a pattern; it parses nothing, a `ponytail:` comment says `core/irc` replaces it from 3h) | Unit |
| **The spike, as tests against the real binary**, one per claim `cf:271-273` and this plan leave **unverified** (listed below); each result goes into a table "Ergo, as found" in this file (claim, result, test name) | Each test is written first from the claim as `cf` or this plan states it; one that fails against the real binary is a finding, written in the table before any later merge relies on it |
| The tests that start a process or Ergo are their own Vitest project, in the fast gate if the measured time fits its 60 s budget (check.sh:112-115), else in the full gate only; StrykerJS mutates the others | Both numbers (cold build, cached start) are recorded here, before and after |
| If the build or the socket fails in the sandbox: Ergo's real exchanges are recorded once by the operator as fixtures in `deploy/ergo/fixtures/`, the contract tests read them, and 3d and 3h to 3m run their wiring in `deploy/test.sh` (dec:138) | The fixtures are committed; their contract tests pass |

The spike's questions (the table's rows): a guest joins, reads and is refused speaking in a `+M` room
(`cf:194`); native registration and password login are closed; `operator-only-creation` stops a normal
account creating a channel (`cf:201`); which privilege lets the bot `REDACT` (a channel op with
`allow-individual-delete`, or an oper with `history`: `cf:202`), and what members then see; the
auth-script's exchange (field names, what Ergo does on a failed, slow or absent script, whether the returned
account name may differ from the one in SASL, what Ergo logs of the passphrase) and whether a Unix socket
binds in the sandbox; the nick limit and what an account name may be (`limits.nicklen` 32 against a 40-character
address: `cf:93`); client tags on a `PRIVMSG` stored and replayed (`+reply`, the edit tag: `cf:271`) and whether
`+m` stops a reaction `TAGMSG` from a non-voiced person; that a client-sent `account` tag is dropped or
refused (which tags a client may send is in the message-tags spec, `cf` source I10, to be read then); the mute extban's syntax and the list size (`cf:108`,
`cf:197`); AMODE's list size and whether an oper with `chanreg` escapes the 15-channel limit (`cf:79`, `cf:271`);
whether an oper may log in on a public listener, and the allowed-origins key; PROXY or `X-Forwarded-For` on the
WebSocket listener; the retention keys (persistent history days, DMs, any size cap: `cf:71`); how the oper
password's hash reaches the config; whether Node's global `WebSocket` can send what Ergo needs (an `Origin`).

**Ergo, as found** (v2.19.1, the real binary; `server/src/testing/ergo.test.ts`, test names in quotes; the
spike's transcripts in `.claude/tmp/ergo-spike/`, not committed). Every row holds unless it says otherwise.

| Claim | Found | Test |
|---|---|---|
| A guest joins and reads, and cannot speak in `+M`; an account can | `404 ... (+M)` for the guest | "refuses a guest speaking in a +M room" |
| History: members only; it survives a restart, DMs included | non-member `FAIL CHATHISTORY INVALID_TARGET` | "lets a guest read the history...", "keeps a room's history... across a restart" |
| Native registration, `PASS` login, `NS PASSWD` and `SAREGISTER` are closed | as the spike | "refuses registering an account...", "ignores PASS...", "refuses a wrong or empty passphrase..." |
| `NS IDENTIFY` is another door to the auth script | holds, **and** a second client of a connected account is refused the nick (`433`, "try logging out and logging back in with SASL") | "logs a guest in through the script when it gives NS IDENTIFY..." |
| The script's input is one JSON line: `accountName`, `passphrase`, `ip` | as the spike | "sends the script one JSON line..." |
| A refusing, erroring, garbled or crashing script gives `904` | **partly**: "Invalid account credentials" for an account that exists, "Account does not exist" for a new one (the spike's accounts existed from earlier runs) | "answers 904 when the script says no..." |
| A slow script holds the client the whole timeout; an absent one locks every login out | as the spike | "makes the client wait...", "refuses a new account with 904 when the script file is absent..." |
| The script's account name wins over SASL's, and the nick follows it | as the spike | "lets the script return another account name..." |
| The passphrase stays out of the log at the default log types, and is in clear at `*` | as the spike | "keeps the passphrase out of the log...", "writes the passphrase..." |
| `@clientid` is cut from the SASL name; a 40-character address is a logged-in nick, a guest held to 32 | as the spike | "hands the script the SASL name...", "holds an address of 40 characters..." |
| Client tags are stored and replayed; reactions are stored, `+typing` is not; `+m` stops a reaction; server-owned tags a client sends are dropped | as the spike | "relays and replays client tags...", "stores reaction TAGMSGs...", "stops a non-voiced account...", "drops server-owned tags..." |
| `operator-only-creation`; who may `REDACT`; what members see; the mute extban; `+I`; the 100-entry list | as the spike | the "moderation" block |
| An oper with `chanreg` passes the 15 channels; an account stops at 15 | **now tested both ways**: the 16th by an account: "You have already registered the maximum number of channels" | "lets an oper with chanreg register 17 channels..." |
| An oper logs in on any listener; the oper hash may come from the environment | holds, **and** `OPER` is throttled for 10 s per client after a failure | "lets an oper log in...", "takes the oper password from the environment..." |
| Allowed origins; Node's `WebSocket` sends an `Origin` only through its `headers` option | as the spike | the three WebSocket tests |
| `X-Forwarded-For` and `PROXY` only from an allowed peer | as the spike; a `PROXY` line from another peer closes the connection with no line | the "operators and listeners" block |

Found writing the template (a config of only the keys gnoworld relies on, `deploy/ergo/ircd.yaml.tmpl`): a key left
out is Go's zero, not `default.yaml`'s value, and Ergo refuses some of them. It needs a hostname as the server's name,
`max-sendq`, `multiclient` (which `force-nick-equals-account` requires), and `allow-environment-overrides` for the oper
hash from the environment; `metadata` is on, set by opers alone (my choice, least privilege). **Times:** the cold build
5.4 s and a cached start about 0.05 s (the spike); the 44 Ergo tests add about 19 s to the fast gate, 32 s before and
51 s after, within its 60 s.

**Out of scope.** The stack's images (3e), the server's side of the auth-script (3d), anything over HTTP.

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A tampered Ergo source or binary runs in the gate | A pinned commit, Go's checksum database, the sandbox's network list; the binary's SHA-256 is kept beside it and checked at each run (a sandboxed command could replace both: the tool is for tests and is never shipped, the stack's image is built apart) | The version and hash cases |
| A test Ergo is reachable from outside or leaves a process behind | Loopback only; the helper kills it on exit and on a failed test | The bind and leftover-process cases |
| The test Ergo differs from the stack's | One template, two renderers; the keys a test depends on are listed in one place | 3e's read-back compares them |
| A guess about Ergo is built on | Each claim a test; a claim that fails is written in the table and the plan changes before any code | The table |

**Tests by level.** Feature (the real Ergo), unit (the helpers), harness (the step's probe). **Cost and scale.**
The cold build and the start time are the cost; the first limit is the 60 s budget.

**Files.** New: `deploy/ergo/{VERSION, ircd.yaml.tmpl}`, `server/src/testing/{ergo, rawClient}.ts`, a step and
its script under `scripts/`. Changed: `vitest.config.ts`, `scripts/check.sh`, `scripts/probe.py`, this plan's
table; commits declare `Harness-changed:`. Harness merge: `/security-review` runs. No human part.

---

## 3c. The login over HTTP (tier 1)

**Done when** (the backlog's tests, word for word, in bold: bl:78)

| What changes | The test that fails first |
|---|---|
| `POST /api/login/challenge {chainId}`: the chain must be in the server's list (dec:142; the demo's `onyx-1` and `gnoland-1`; an empty list refuses to boot). It returns a single-use nonce, the whole text to sign and its expiry. The server writes the text (plain words, a version prefix inside them for domain separation (mine), the domain, the nonce, issue and expiry, 4096 bytes at most: ADR2:524-526), stores it with the nonce and the chain, and the client signs it unchanged (dec:141) | Unit: every field; the list; an unlisted chain; the text's length; the stored text equals the one returned |
| `POST /api/login/verify {nonce, address, signature}` calls `verifyArbitrarySignature` through one wrapper whose signer, chain id and text are required parameters, the text being the stored one (ADR2:526-528) | Vectors: wrong signer, one byte of text changed, other chain, empty, truncated and oversize signature, an address that differs from the signer, a session or multisig account (ADR2:529) |
| **A forged or replayed signature is refused, also when the same proof arrives twice at once (a race test)** | Sequential replay; 2 and 50 concurrent verifies through a verifier that yields: exactly one login |
| **A spent or expired nonce is refused** | Clock injected: TTL less 1 ms, at TTL, plus 1 ms (the TTL is a setting, my default 5 minutes); an unknown nonce |
| **A proof made for another network is refused** | A generated signature made for `onyx-1` against a `gnoland-1` challenge, and the reverse |
| A valid proof sets the token: 256 bits from `crypto.randomBytes`, only its SHA-256 stored, in an HttpOnly, Secure, SameSite=Strict cookie; it renews on use for 30 days and ends 90 days after its signature whatever the use (dec:143). The body carries the address, never the token | Cookie flags asserted; the body never holds the token; clock cases at 29 d 23 h 59 min, 30 d, 89 d and 90 d with use in between; the database holds no token |
| `GET /api/login/me` answers the cookie's address or 401 (the page cannot read an HttpOnly cookie, so it must ask); `POST /api/login/logout` revokes the presented token, clears the cookie and answers the same for an unknown one | Unit |
| Every POST needs an `Origin` in the configured list and `application/json` (CSRF: ADR2:1081 says Hono has it built in; its API **unverified** until the installed types are read); a foreign or missing `Origin` changes no state. `me` is a GET with no effect: SameSite=Strict is its guard, and a browser sends no `Origin` on a same-origin GET | Foreign, missing and `null` `Origin` give 403 with no row written; a form content type gives 415 |
| A first verified login creates the account row (`accounts(address, first_seen)`); a visitor address may create at most N new accounts an hour (dec:144, N a setting) | N+1 from one address refused, another address unaffected |
| Limits by visitor address on challenge and verify before any work, a global cap on unspent nonces with a per-address share, a timer that purges expired rows | 100,000 challenges from one address leave at most the cap; another address still gets one |
| Every refusal has one status and one body; the cause goes to the log only | All refusals byte-identical |
| The test signer: signatures are generated with test keys, never made by Adena (dec:141), from what the installed SDK or its approved dependencies expose, **read from their types and source first** (CLAUDE.md:33). If that needs a library outside the approved list, the work stops and asks (CLAUDE.md:51) | The vectors above use it |

**Accepted risk (dec:141).** Nothing proves that Adena's `signArbitrary` produces what the generated
signatures are; it shows at slice 4's first merge, against the real extension.

**Out of scope.** Ergo and tickets (3d); names and any chain read; the browser (slice 4); a moderator's revoke
and the device list (slices 12 and 8); the admin cookie of slice 12 (ADR2:877).

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A signature forged, or made for another signer, text or chain, is accepted (with nothing to check the SDK says yes: ADR2:526-528) | Required parameters; the stored text, never the client's; the account is the verified signer | The vectors; StrykerJS: removing any of the three arguments or an equality check leaves a mutant a test must kill |
| The same proof used twice, in sequence or at once | One `UPDATE ... WHERE used_at IS NULL AND expires_at > ?` consumes the nonce before any `await`, the request goes on only if one row changed, and verification comes after: a nonce buys one attempt | The race tests; a mutant that moves the consume after the verification dies |
| An expired or unknown nonce | The server's clock only; the TTL set by the server | The boundary cases |
| A proof for another network | The chain fixed per nonce at challenge time and passed to the verifier; an unlisted chain refused at challenge | The cross-network cases |
| A relay: another site, or its server, asks our challenge, shows our words to the person on its own page and submits the signature itself, so the cookie lands with the attacker | Nothing server-side can tell (a server has no browser, so an `Origin` check does not apply to it). Only a wallet that shows the requesting site and refuses a text naming another domain would; whether Adena does is **unverified**. Residual risk, bounded by the 90-day cap, revocation and the limits | Alexis checks Adena's popup with the real extension in slice 4's first merge; the result goes in that review card |
| A script in the page steals the token | HttpOnly: the page cannot read it. It can still call the API with the cookie while the page is open (3d: tickets, limited), which only the CSP (3f) stops | Flags asserted here; 3f's violations |
| CSRF on a route that uses the cookie | SameSite=Strict, an `Origin` in the list on every POST, JSON only, no GET with effects | The foreign-origin and content-type cases |
| Login CSRF or session fixation: the victim's browser is logged in as the attacker, or the attacker's cookie is planted | Verify needs our `Origin`; a token is minted only by a verified proof, never chosen by a client; the cookie takes the `__Host-` prefix if MDN (read in the session) confirms what it requires, so a sibling site cannot set it; an unknown cookie never becomes valid | The foreign-origin case; an unknown cookie gives 401 |
| A token is read from the database, a log or the network | Hash only; never logged; TLS ends at Funnel in the demo, at ops in production | The log test; a database read |
| A token never ends | Sliding 30 days, a hard cap of 90 from the signature | The clock cases |
| The challenge endpoint is flooded (rows, memory) | The limits above | The 100,000-challenge case |
| Verification burns CPU | The same limits first; one attempt per nonce; a body limit; a worker thread if the bench puts one verification over a budget (proposal 2 ms; ADR2:1094) | The bench |
| A key flood resets windows: past the limiter's cap the window that started first goes and starts over (3a, F414) | The cap's value, and whether a ceiling per /48 or a global one sits above the per-visitor limit, decided here with the login's numbers; failing closed when full is refused (a flood would then lock every new visitor out) | The limiter's property tests with the chosen numbers |
| New accounts are free, so an address farm bypasses a ban | A per-address limit on new accounts only slows it; evasion is accepted and written in the known limits (dec:144) | `OPERATIONS.md` known limits |
| Which check failed leaks | The uniform refusal (timing is not equalised: the stage is not a secret) | The byte-identical case |
| An admin right is escalated | No role and no admin route exists; ADR2:881 keeps the admin API off the public host | A route-table test fails on any admin prefix on the public listener |

**Tests by level.** Unit and property (the text, the token, the clock); feature with the SDK for real and the
generated signatures; races; fuzz on every request parser (ADR2:1267); mutation; one Playwright API journey,
through `request` (no browser page: dec:151): challenge, sign, verify, `me`, logout, `me` again. **Cost.** Per
login: one limiter check, one SQLite write, one verification; the bench sets the budget from its first
measurement. **Scale.** The first limit is verification CPU, then a worker pool.

**Files.** New: `server/src/login/` (challenge, verify, token, cookie, routes), `packages/schemas/src/login.ts`, a
migration, `server/src/testing/signer.ts`, the gate's step for the server's journeys (declared
`Harness-changed:`). Changed: ARCHITECTURE.md (the server's folders and a checklist: nonce, token, verifier
arguments, races, cookie, ticket), and a patch to `.claude/rules/server.md` for Alexis to apply (the rules are
closed to Claude: settings.json:38; precedent dec:125). Tier 1, every line: all of `server/src/login/`. No
human part.

---

## 3d. Ergo logs people in through the server (tier 1)

**Done when**

| What changes | The test that fails first |
|---|---|
| `POST /api/login/ticket` (cookie and `Origin`): a ticket of 256 random bits, only its hash stored, **60 seconds, single use**, for the cookie's account; it also renews the token (at most one write a minute per token, the 90-day cap holding). **As built:** the cookie is not refreshed, its Max-Age being the 90-day cap already (3c) | Unit with the clock: use at 59 s and 61 s; renewal never passes the cap; a second mint within the limit |
| `server` answers Ergo's `auth-script` on a Unix socket on a volume only Ergo and `server` mount (ADR2:970-971): the passphrase is the ticket, consumed by the same single-use `UPDATE` as 3c's nonce, and the account must equal the ticket's address; one indexed read, no signature, no chain read. The exchange's shape is **unverified** and is 3b's table | Contract against real Ergo (or 3b's fixtures); unit: every answer |
| The nick is assigned by the server (dec:147): `nicks(address UNIQUE, nick UNIQUE)`, a pure function of the address that fits `nicklen` 32 (`cf:93`; the form, a reversible 32-character part or a hash prefix, is fixed by 3b's table), never chosen by a person; the account name Ergo holds is the nick. The app shows the account, never the nick (dec:147); if the nick is not reversible, `GET /api/accounts?nicks=` (at most 50) answers the addresses. **As built:** 3b found a logged-in nick of 40 characters held, so the nick is the address itself: no `nicks` table, no `/api/accounts` | Property over random addresses: same address same nick, distinct addresses distinct nicks, length within the limit, valid nick characters; an insert that collides refuses the login and raises an alert |
| **A reconnect needs no new signature** | Feature: one login, then three reconnects each with a fresh ticket from the cookie, no signature |
| **A guest can read but not speak**; a logged-in account speaks | Real Ergo, both halves |
| A used, expired, unknown, other-account or revoked-token ticket is refused; a revoked token mints no ticket | Unit, with the clock; two connections with the same ticket give exactly one success |
| A hostile frame (huge, truncated, not JSON, a non-canonical account) is refused and the server stays up | Fuzz; a property: any string that is not a canonical address never reaches a database read |
| With `server` stopped or slow, Ergo lets nobody in and guests still read (fails closed; what Ergo does on a failed script is **unverified**: 3b's table) | Real Ergo, `server` stopped |
| Failed script logins are counted per visitor address, with back-off, never per account: a per-account count would let anyone lock a victim out. If Ergo does not hand the script the address (**unverified**), one global count raises an alert instead | Unit |

**Out of scope.** Cutting a live connection when a token is revoked (a moderator's revoke is slice 12's): a
revoked token mints no new ticket at once, a live connection lasts until it drops, and the limit is written
in `OPERATIONS.md`. A plain IRC client has no cookie, so it reads and never speaks: by design (dec:143). Names,
the bot, the settings screen.

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A ticket is replayed or raced | Single use by the atomic `UPDATE`, 60 seconds, bound to the account; Ergo may log a passphrase (**unverified**), which a spent ticket makes useless | The race case; the expiry case |
| Account A's ticket logs in as B | The row's address must equal the SASL account, and the name returned comes from the row, never from the request | Unit |
| Ticket minting is abused | Needs the cookie and `Origin`; a limit per account and per visitor address | The limit cases |
| Tickets are guessed through Ergo | 256 random bits, hashed; failures counted per visitor address (whether the script is told the address is **unverified**) with back-off, never per account | Unit; k6 in 3n |
| Another container talks to the socket | A volume only Ergo and `server` mount, mode and owner set (both run as one uid) | The operator tries from a third container (3e) |
| Frames crash or stall the script server | A size cap, Zod, one answer per request, a socket error closes the connection | Fuzz |
| `server` down or slow opens the door | A timeout is a refusal | The stopped-`server` test |
| A reconnect storm after an Ergo restart | One indexed read per login; jittered client backoff is slice 4's duty (ADR2:973-974) | 3n's bench of 1,000 lookups a second |
| Renewal never ends | The 90-day cap | Unit with the clock |
| An account name that is not canonical (case, spaces, look-alikes) | Parse and re-encode, refuse any difference | The property test |
| Impersonation by nick | A nick is never chosen; Ergo's nick settings tie it to the account (`cf:93`, `cf:197`: **unverified** until 3b) | Real Ergo: a `NICK` to another's nick is refused |
| An Ergo account made outside the script | Registration and password login closed (3e proves it) | 3e's refusals |
| A script in the page mints tickets while it is open | Bounded by 60 s, single use, the limits, the CSP (3f); residual | The limit cases |
| A revoked token's live connection survives | New tickets refused; a known limit until slice 12 | `OPERATIONS.md` |

**Tests by level.** Unit, contract (3b's real Ergo or fixtures), feature against real Ergo, fuzz, mutation; an
API journey (`request` plus a raw WebSocket) that logs in with a generated key and reconnects. **Cost.** One indexed
read per login. **Scale.** The lookups are cheap; the first limit is Ergo's own login throughput.

**Files.** New: `server/src/ergo/` (script server, nick), `server/src/login/ticket.ts`, migrations (`nicks`,
tickets). Tier 1, every line: `server/src/ergo/` and `ticket.ts`. No human part.

---

## 3e. The stack and the way out (`deploy/`, operator-tested)

**Done when** (`sh deploy/test.sh`, run by Alexis; `--mutants` in `/pre-merge`: OPERATIONS.md:74-76)

| What changes | The test that fails first |
|---|---|
| Ergo's service: the official image by digest if one exists for the pinned tag, else built from the same pinned source in a multi-stage build (**unverified** that an official image exists); locked down like `web` (compose.yaml:7-15: read-only root, no capability, no new privilege, rotated logs), non-root, capped. Its config is 3b's template rendered by `deploy/ergo/render.sh` from the secret files: WebSocket, `+M` by default, `allow-individual-delete` (bl:78), account indexing (ADR2:891), `operator-only-creation` (`cf:201`), registration and password login closed, the channel cap raised for the bot (`cf:86`), the auth-script socket, retention of public history 90 days and DMs 30 (dec:154; keys from 3b's table), the oper's hash | `docker inspect` read-back; a guest connects, joins, reads history and is refused when speaking; a hand-made account (`NS REGISTER`, SASL with a self-set password) is refused |
| `server`'s service: a distroless Node 24 image by digest (ADR2:1091), non-root, the same uid as Ergo for the socket volume, `--disallow-code-generation-from-strings`, secrets as files (`openai_api_key`, `ergo_oper_password`, `pepper`; no session secret although ADR2:965 lists one: tokens are opaque rows, and the admin cookie that needs it is slice 12's) | The same hardening read-back; no secret in the image, `inspect` or the logs (1c's checks, extended) |
| `web` proxies `/ws` (Ergo) and `/api` (`server`, SSE included: no buffering, long read timeout) behind the password and its limit, a stricter zone for `/api/login`; it sets the visitor's address from `$proxy_protocol_addr` in `X-Real-IP`, overwriting any client header (`server` believes it only from `TRUSTED_PROXY`, `web`'s address: 3c), and never forwards `Authorization` | 401 without the password on both paths; a forged `X-Forwarded-For` is ignored; the real address reaches Ergo and `server`; the password is not in `server`'s logs |
| No plain IRC port is published; the bot's listener is on `inside` only and `web` does not route it; an operator login is refused on the public listener (**unverified** that Ergo can restrict it) | A probe from outside `inside` finds no IRC port; an `OPER` through `/ws` is refused |
| Egress: a proxy in the guard's namespace (`network_mode: service:guard`, as compose.yaml:71), so the kernel's refusal of private ranges (guard.sh:32-35) holds whatever the proxy resolves. smokescreen if its docs, read in the session, show a host allowlist and a refusal of private addresses after resolution; else a few lines of ours (dec:151). The allowed hosts are one file (OpenAI's API host, from its docs) read by the proxy and the test. The guard gains a rule for replies leaving through `inside` (guard.sh:25-36 has none: my reading, **unverified** until the run). `server` has `HTTPS_PROXY`, `NODE_USE_ENV_PROXY` and `NO_PROXY` for Ergo and the socket (ADR2:990-993). The demo profile only (the guard is demo-only: compose.yaml:43); ops brings its own proxy | From `server`'s network: the listed host answers through the proxy; a private address, the host, the LAN, another public host and a direct connection all fail; 1c's probes rerun from each new container; a mutant that adds a host is killed |
| Caps fit the ceiling (2 cores, 2 GB; 1.1 and 416 MB used today: OPERATIONS.md:83-84) | The test sums the caps |
| `OPERATIONS.md`: rows for Ergo, `server` and the proxy, the secrets, the known limits of section 8, and line 4 corrected; `deploy/.env.example` and `.dockerignore` | `check_docs.py` |

**Out of scope.** The login's code (3c, 3d), the bot (3h to 3k), Grafana, `jarvis` (slice 10), CoinGecko (slice 5), DMs'
product (slice 4: only Ergo's retention for them is set here).

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A guest speaks (a room made later, a default lost) | `+M` by default; rooms made only by the server (`operator-only-creation`) | Speak in a new room as a guest; a normal account tries to create one |
| A hand-made account takes the name of someone's address; clients treat the account tag as identity | Native registration and password login off; the script is the only authority | The registration refusals; a mutant that opens them is killed |
| The operator credential is guessed through the public listener | A second listener on `inside`; operator login refused on the public one | The `/ws` attempt |
| A cross-site WebSocket from another origin | Allowed origins fixed: `server.websockets.allowed-origins` (3b's table); an empty list lets every origin in, so the image's render of `deploy/ergo/ircd.yaml.tmpl` refuses an absent, empty or `*` ORIGINS (F422) | A handshake with a foreign `Origin`, and one with none, refused through `web` |
| The visitor's address is forged | `web` overwrites it; upstreams trust only `web` | The forged-header case |
| The demo password reaches `server` or Ergo | `Authorization` not forwarded | The log case |
| Ergo or `server` reaches the host or the LAN | `inside` stays internal with an isolated gateway; the proxy is the only exit and sits behind the kernel's rules | 1c's probes from each new container |
| The proxy resolves an allowed name to a private address, or becomes an open relay | The guard's kernel rules refuse the address; the proxy listens on `inside` only, port 443 only | A fake resolver answers `10.0.0.1`; a probe from another network |
| The guard drops the proxy's replies | The reply rule | The first run decides |
| History fills the disk (volumes have no quota: ADR2:996-997) | Retention set in days and size; the alert is 3n's | Config read back |
| A bad image, a floating tag, a missing workspace in the image | Digests; `--frozen-lockfile`; the image copies each workspace the server imports (F232) | The build check |
| A connection flood on `/ws` and the SSE stream (`worker_connections 256`: nginx.conf:9) | Sized from 3n's load run (F208); until then a known limit | OPERATIONS.md:116-117 |

**Tests by level.** Infrastructure only (the operator's script and its `--mutants`); the sandbox cannot run it.
semgrep's Dockerfile and Compose rules in `/pre-merge`. **Cost and scale.** Ergo holds about 10,000 clients and
2,000 per room, about 1,000 history writes a second (ADR1:243-246); the first limit for us is the 2 GB ceiling.

**Files.** New: `deploy/ergo/render.sh`, `deploy/server/Dockerfile`, `deploy/egress/`, `deploy/test.sh` sections.
Changed: `deploy/compose.yaml`, `deploy/guard/guard.sh`, `deploy/web/nginx.conf`, `deploy/.env.example`,
`docs/OPERATIONS.md`, `.dockerignore`. Security-sensitive: the security reviewer reads all of it. No human part.

---

## 3f. The strict CSP (tier 1)

The values below are proposals, to check against the CSP spec and MDN in the session; only the rows with a
source are the repository's.

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'none'` | Nothing is allowed unless named |
| `script-src` | `'self'`, plus what F341 decides for the five inline scripts of a built page (`app/build/client/index.html` holds five `<script`) | ADR2:1348 "no inline script and no `eval`"; JSON-LD by hash |
| `style-src`, `font-src`, `worker-src`, `manifest-src` | `'self'` | Self-hosted fonts; no inline `style=` |
| `img-src` | `'self' data:` | bl:53 |
| `connect-src` | `'self'` for `/api`; the WebSocket named explicitly (`wss://` host) unless the spec says `'self'` covers it (**unverified**); each universe's RPC and the indexer arrive with the slices that read them | ADR2:1035-1036 |
| `frame-src` | `'none'` until slice 4's embeds, then the accepted services only | ADR2:1349 |
| `object-src`, `base-uri`, `form-action`, `frame-ancestors` | `'none'`, `'none'`, `'self'`, `'none'` | Standard hardening, **unverified** here |

**Done when**

| What changes | The test that fails first |
|---|---|
| One module in `app/` writes the header for `deploy/web/nginx.conf`, a `_headers` file in the client's build (no such file exists today; a host reads it or not: ops decides, ADR2:1067) and `app/tests/e2e/serve.mjs` (dec:150; ADR2:1035) | A test compares the three outputs |
| No page, 404 fallback, 401, 429 or `/api` answer lacks it | The operator's per-path check; a journey per route |
| Planted violations are refused and reported: an inline script, `eval`, an image from another host (bl:53), a frame, a `connect` and a form to another host | Playwright listens for `securitypolicyviolation`; no journey sees one unplanted |
| F341's shape is built: the inline scripts move out of the page if React Router allows it (**unverified**), else each page carries their hashes, written at build | The build fails if a page's inline script is not covered |

**Out of scope.** Third-party hosts (PostHog, slice 12; embeds, slice 4); a report-only mode (ADR1:87-88 and
:955-957 call the old site's a flaw); a thumb's picture from data (F336); Adena's injected `window.adena` under
the policy, which only the real extension can show: slice 4's first merge, Alexis by hand.

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| XSS runs script in the page: it cannot read the cookie but can mint tickets and call the API (3c, 3d) | The policy refuses inline code, `eval` and foreign hosts | A planted violation per refusal |
| A page is served without it (an error path, a 401, a 404) | `always` in nginx; the same in the test host | The per-path check |
| The policy drifts between host, header file and test host | One module, three outputs | The comparison test |
| The policy is too loose | Each directive listed, none `unsafe-*`; `connect-src` names only our hosts | The planted-violation journeys |
| A policy that a real extension or a third party breaks | Checked by hand with the real extension in slice 4's first merge; no report-only mode | Slice 4's review card |

**Tests by level.** Unit (the module), Playwright browser journeys with a planted fault each (the only browser
journeys of the slice), the operator's test for `deploy/`. **Files.** New: the CSP module and its outputs; changed:
`deploy/web/nginx.conf`, `app/tests/e2e/serve.mjs`, `app/src/root.tsx` (the inline scripts), `scripts/probe.py` if a lint
rule is added. Tier 1, every line. No human part.

---

## 3g. The roles file

A file in the repo the server reads at start (ADR2:828: phase 0's roles are a file changed by a pull request
two admins approve). A change takes effect when `server` restarts: a `ponytail:` comment names the ceiling,
a watcher comes with slice 12's console.

**Done when**

| What changes | The test that fails first |
|---|---|
| `server/roles.json`, checked by Zod: `team` (addresses; moderator of every world and trusted by itself), `trusted` (spared the automatic mute and nothing more), and `worlds`, each by slug (worlds.ts:5-7) with `moderators`, a main room, and the anti-spam rules 3i reads (banned words, links and mentions per message, links for a new account: dec:159). The Earth is a world with its general room (dec:147) | Each field: an unknown key, a duplicate, a non-canonical or look-alike address, a slug that breaks the rule |
| A missing or invalid file stops the boot, naming the file and the place, never printing anything else (no last good one exists at boot) | Each fault |
| `can` functions answer from the file only: `isTeam`, `isTrusted`, `moderates(address, world)`, `mayCreateRoom(address, world)`; a moderator of one world moderates no other; the team moderates all | A matrix over every role and world, including an address absent from the file |

**Out of scope.** Groups and room types (3m), a console and its audit log (slice 12), levels earned by activity
(a later slice: dec:148, :162). The deployer as a world's moderator, by itself, comes once `server` reads the
indexer with the list of worlds (dec:149; the server's first signals are slice 9's: bl:84, my reading); until
then the file names the moderators.

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A wrong line hands out moderation, trust or room creation | One small file of functions, read whole by Alexis; Zod; canonical addresses | The matrix; StrykerJS on the functions |
| A malformed or tampered file | Boot refused; a change is a reviewed pull request (ADR2:828; `CODEOWNERS` waits for `main`'s protection: bl:27) | The fault cases |
| The team's power is too wide: a stolen team account gives everything | Least privilege: the team is moderator and trusted, nothing else; no admin route exists in slice 3 | The route-table test of 3c |

**Tests by level.** Unit, property (any address string either parses to its canonical form or is refused),
mutation. **Files.** New: `server/roles.json` (the demo's few entries), `server/src/roles/`, the schema in `server/`
(only the server reads it). Tier 2; the `can*` file is read whole, by my proposal. No human part.

---

## 3h. The bot's link, the rooms and the activity API

**Done when**

| What changes | The test that fails first |
|---|---|
| The server's IRC link: a WebSocket to Ergo's internal listener, as its operator account (a secret file; ADR2:965), through `core/irc`; it requests the capabilities it needs (names from 3b's table) and reconnects with jittered backoff and a ping watchdog | Real Ergo: kill it, restart, the bot is back and in its rooms; a fake Ergo built from 3b's table for hostile lines |
| Rooms: at start the server creates each world's main room and the Earth's general room (dec:147) and no other; a `rooms` table; the bot joins each. A room is `#<slug>/<room>` (a world's slug is a path-safe word: worlds.ts:5-7; rooms are "prefixed by their hub": ADR1:235; the exact form is my proposal) | A fresh Ergo gets exactly those rooms; a second start changes nothing; a normal account cannot create one; the bot joins 101 rooms (Ergo's default is 100: `cf:86`) |
| Intake: only a channel `PRIVMSG` carrying the server-added `account` tag and a `msgid` is read; a DM is never read or sent anywhere (ADR2:809); the bot's own lines are ignored | A private line is ignored; hostile lines (CR, LF, NUL, 600 bytes) never reach `formatLine`'s output; fuzz |
| Counters, in bounded structures: messages per room per minute, and per account per minute capped (dec:144; ADR2:793-794: counting calls no service) | A property: memory stays bounded over 100,000 distinct accounts; an account sending 1,000 lines counts as the cap |
| `GET /api/activity?worlds=a,b`: message rates per room, cached a few seconds (ADR2:940), at most 25 worlds a request (the rail's size: ADR2:136) | **The activity API answers only for the worlds asked**: unknown and private rooms are absent, not errors; the 26th world refused |

**Out of scope.** Checking messages (3i), acting (3j), mute and edits (3k), rooms made by moderators (3l), room
types (3m), the heat and storms drawing (slice 7).

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A command is injected into Ergo through a message, a nick or a room name | `formatLine` throws on CR, LF and NUL (once written); a closed list of commands leaves the bot; texts are built from enums | The hostile-line cases; fuzz |
| An `account` tag is forged by a client | Only the tag the server adds is trusted, which Ergo must drop or refuse from a client (**unverified**: 3b's table) | A raw client sends a forged tag |
| A DM or a private room's text leaves the server | The bot reads only channels of its rooms file | The DM case |
| The oper credential is leaked | A secret file in `server` only; an internal listener; the command allowlist | Config read back |
| Counters or rooms grow with attacker input | Every map capped; counts per account capped | The property test |
| Scraping or enumerating rooms through the API | A cap on `worlds`, a short cache, public rooms only | The cap and absence cases |
| A spammer fakes a storm | The per-account cap | The cap case |

**Tests by level.** Unit, property, fuzz, feature (real Ergo), mutation. **Cost.** Per message: one parse and a
few counter updates. **Scale.** The first limit is Ergo's cap of 100 channels a client, raised for the bot.

**Files.** New: `server/src/irc/` (link, command builders), `server/src/rooms/`, `server/src/activity/`,
`packages/schemas/src/activity.ts`, migrations. Tier 2. **Human: `packages/core/src/irc/` (the bodies, pending
since slice 1).**

---

## 3i. The check: rules, OpenAI, records

**Done when**

| What changes | The test that fails first |
|---|---|
| The rules run first, per world, from the roles file (dec:159): banned words (case-folded, Unicode-normalised), a cap on links and mentions per message, two links at most for a new account (under 24 hours since `first_seen`, a setting). A hit is a verdict with its reason, no provider call | Each rule and its boundary; a look-alike spelling; the cost: a rule hit makes no call |
| The provider client: `omni-moderation-latest` (ADR2:786-787; text and images, images only for sexual, violence and self-harm, "sexual/minors" text only: dec:145), through the proxy only, with `AbortSignal.timeout`, a body of exactly `{model, input}` (its shape **unverified** here: read in OpenAI's docs at this merge's start, before the red tests) with no account or address, the key from one file of `deploy/secrets` (dec:153) | A body-shape assertion; the key never in a log or an error |
| Every answer goes through Zod; one of an unknown shape, a missing field or a category the thresholds do not know counts as **not checked** (the text stays, previews wait) and raises the alert (dec:153) | The gate's tests replay the answers OpenAI's docs show; a malformed, a truncated and a new-category answer |
| The decision: thresholds per category as settings with the docs' defaults; it acts only on high scores and always on anything involving minors (ADR2:806-807); a pure function returns `hide(reason)`, `pass` or `unchecked`, the reason an enum | Boundary scores; the minors case; the pure function's property |
| A record per verdict (message id, room, HMAC'd account, categories, scores, the thresholds used, the action, the time; never the text), unique on the message id, so a message is checked once even in a live and catch-up race (dec:154: kept 180 days, the job is 3n's) | Schema test; a race case |
| The queue is bounded and fair per account, with a concurrency limit; over its cap a line is left unchecked with an alert; the backlog's age is logged every 30 s and an `alert` line follows at two minutes (ADR2:1045-1047) | 10,000 queued lines processed without growth; one account cannot starve another |
| Provider down, slow or limited (500, a timeout, 429): text stays up, previews wait, retries back off with a breaker | Fault cases |
| **Soak: the heap after collection stays flat over 100,000 messages** (a fake provider) | `--expose-gc`, 10 checkpoints, a slope inside a bound set from the first run and only tightened; the full gate only |

**Out of scope.** Acting on a verdict (3j), the mute (3k), contests and "restored after review" (slice 12: ADR2:803-805),
images (a link's picture is checked when previews arrive in slice 4, through an SSRF-guarded fetcher: dec:145),
a live nightly test (dec:153: the real messages are the test).

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A DM or a private room's text goes to OpenAI | Only the rooms of the file are read; the body is exactly `{model, input}` | The DM case; the body assertion |
| The key leaks (environment, `inspect`, a log) | One secret file, `*_FILE` only, redaction | The log and `inspect` checks (3e) |
| The provider's outage is a bypass | By design text stays up and previews fail closed (ADR2:795-800); an alert past two minutes | The fault cases |
| The provider changes its answer silently | Zod, with an unknown shape counted as not checked and alerted | The malformed-answer case |
| One account floods the queue (addresses are free) | Per-account fairness and caps | The fairness case |
| False positives hide real speech | Only high scores; every verdict stores its scores and thresholds; the author is always told why (3j) | Unit |
| A message is checked twice or never | A unique key on the message id; catch-up (3j) | The race case |
| Records keep personal data for ever | Ids, categories and HMAC'd accounts only; retention (3n) | The schema test |
| A message's text reaching a third party is not told | The privacy policy lists OpenAI (ADR2:815-816); it blocks a public launch, not slice 3 (dec:154) | `OPERATIONS.md` |

**Tests by level.** Unit and property, feature (fake provider, real Ergo for the intake), contract (the docs'
answers), faults, soak, mutation. **Cost.** Per message: a parse, a queue push, at most one provider call. The
Moderation API's rate limit is "measured in slice 3" (ADR2:1113): the first measurement goes in this plan. **Scale.**
The first limit is the provider's rate, then batching (ADR2:1113).

**Files.** New: `server/src/moderation/` (rules, provider, decide, records, queue), `packages/schemas/src/moderation.ts`
(what the browser reads), migrations. Tier 2. No human part.

---

## 3j. The bot acts: hide, reason, "checked", catch-up

**Done when**

| What changes | The test that fails first |
|---|---|
| A flagged line is hidden with `REDACT` on the id just scored (taken from Ergo's tag) and its author gets a `NOTICE` naming the reason in plain words and a link to the rules, built from the enum, never from a message or an answer (ADR2:801-802; dec:145). Which privilege the bot holds for `REDACT` comes from 3b's table | **A flagged message is hidden and its author sees why**: real Ergo, a fake provider; a member sees the redaction, the author the notice |
| Only a closed list of commands leaves the bot | Hostile lines never reach `formatLine`'s output |
| `GET /api/stream?rooms=...` (server-sent events: ADR2:1081; the API **unverified** until the installed types are read), public (guests need it), events `{msgid, room, state}` with `state` a Zod union of `checked` and `hidden` that slice 4 extends with "preview removed" (dec:158); never the text | **A preview never renders before its check**: no `checked` before the verdict; none for a flagged line, which gets `hidden`; none when the provider is down |
| The stream is bounded: rooms per request, connections per address and in all, a replay ring per room with `Last-Event-ID`, a slow client dropped (ADR2:1096), a heartbeat | Caps and drop cases; a late subscriber gets the ring |
| The last message checked in each room is kept (SQLite); after an outage the bot replays what it missed with `CHATHISTORY AFTER`, in pages, once each (ADR2:791-792) | **After an outage the bot checks what it missed**: kill the connection, post three, restart: three checks, none twice; 10,000 missed lines without growth |

**Out of scope.** The mute and edits (3k); a contest, a restore and the "why" button's UI (slice 12 and slice 4); a
mistaken hide stays until slice 12's console and is written in the known limits (dec:146).

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A user makes the bot hide someone else's line | The target is the id of the line just scored, from Ergo's tag | Unit |
| "Checked" is forged or shown early | Only the server writes the stream; an event follows the verdict and never precedes it | The three stream cases |
| The stream leaks hidden text | Events carry ids and states, never text | A schema test |
| Streams exhaust the server | Caps, drop, heartbeat | The cap cases |
| An injected reason | Texts come from an enum | Hostile cases |
| A line is checked twice or lost across a reconnect | A unique key; the last-checked id per room | The outage case |
| The bot's power is unaccountable | Each action has its record (3i), and the author sees the reason (ADR2:858) | Unit |

**Tests by level.** Unit, feature (real Ergo), faults, mutation; an API journey with a raw WebSocket and the stream.
**Cost.** One redaction at most per line. **Scale.** Stream clients are capped; the first limit is the
connection count.

**Files.** New: `server/src/moderation/{act, catchup}.ts`, `server/src/stream/`, `packages/schemas/src/stream.ts`,
migrations. Tier 2. No human part.

---

## 3k. The mute and the edits

**Done when**

| What changes | The test that fails first |
|---|---|
| An account hidden N times in M minutes is muted for K minutes, by itself (dec:146; the numbers are settings, my defaults 3 in 10 minutes for 5), through Ergo's mute extban (`cf:108`; its syntax and list size **unverified**: 3b's table) in the rooms of that world, lifted by a persisted timer (`mutes` table) that survives a restart | Real Ergo: a muted account cannot speak, speaks again after K; a restart lifts expired mutes and re-applies live ones |
| The whitelist: the team and the trusted accounts of the roles file are never muted automatically, and their lines are still checked and hidden (dec:146, :149). A world's moderator is not spared by that role alone: my reading of dec:149 | A whitelisted account hidden ten times is not muted |
| Strikes: each hide counts, a line over the per-account rate cap (3h) is hidden as "too fast" and counts | Unit with the clock; two hides at once give one mute (race) |
| Edits, the bot's part (dec:156): a correction is a new line tagged with the id it replaces; it goes through the rules and the provider like any line; it is valid only if its account is the original's (read with `CHATHISTORY AROUND`: `cf:56`), else it is hidden; an edit hidden leaves the original standing; the old text stays in Ergo's history for moderators; the tag's name and whether Ergo stores it are 3b's table | Each version checked; a mismatched author hidden; an edit flood counts against the rate |

**Out of scope.** The edit's display and "(edited)" mark (slice 4); the timed mute's hand-off to a person and contests
(slice 12); a room's slow mode (later: `cf:107`); cutting a live connection.

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| Someone gets another muted | Strikes count an account's own hidden lines only | Unit |
| A mute never lifts, or lifts early | A persisted timer, reconciled at start | The restart case |
| A false positive silences a trusted person | The whitelist | The whitelist case |
| Extban lists fill (about 100 entries: `cf:197`) | A cap on concurrent mutes, the oldest expiring first; a `ponytail:` comment names the ceiling | The cap case |
| An edit evades the check, or forges another's correction | Every version checked; the account must match | The edit cases |
| Mute evaded with a new address | Accepted and written in the known limits (dec:144) | `OPERATIONS.md` |

**Tests by level.** Unit, property, feature (real Ergo), races, mutation. **Cost.** One extban command per mute.
**Scale.** The list's size.

**Files.** New: `server/src/moderation/{strikes, mute, edits}.ts`, migrations. Tier 2. No human part.

---

## 3l. Rooms made by moderators

**Done when**

| What changes | The test that fails first |
|---|---|
| `POST /api/rooms {world, name}` (cookie, `Origin`): only the world's moderators and the team (`mayCreateRoom`, 3g), checked before any work; the name is a slug (`[a-z0-9]` and single hyphens, at most 32), never a main room's; a cap on rooms per world and a rate limit; the server creates the room through its link, sets the default type (open: `+M` and the defaults), joins the bot and records it in `rooms` (dec:147, :162) | The matrix: a guest, a logged-in stranger, another world's moderator, the world's moderator, the team; a slug with CR, LF, a slash or a space; the cap; two creates of one name at once |
| `DELETE /api/rooms/:world/:name`, the same people: it archives (read-only `+m` and unlisted), never destroys: whether Ergo can drop a channel is **unverified** and history keeps its retention; the main room is refused | Unit; the main room refused |
| A room missing from Ergo (its data lost) is made again at start; a channel the server did not make raises an alert | Real Ergo, both cases |

**Out of scope.** Rights earned by activity (dec:162: the counters exist, the rule is a later slice); room types and
groups (3m); a console (slice 12).

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A non-moderator creates or archives a room | `mayCreateRoom` before any work (`.claude/rules/server.md`); `operator-only-creation` so no other path exists | The matrix; a normal account tries through IRC |
| A room name injects a command | The slug rule; `formatLine` throws on CR, LF and NUL | The slug cases |
| CSRF on room routes | `Origin` and SameSite (3c) | The foreign-origin case |
| Spam rooms fill a world | A cap per world, a rate limit | The cap case |
| A moderator of one world acts on another | `moderates(address, world)` | The matrix |

**Tests by level.** Unit, feature (real Ergo), races, mutation; an API journey. **Cost and scale.** One command a
creation; the cap per world bounds the rooms. **Files.** New: `server/src/rooms/{create, archive}.ts`,
`packages/schemas/src/rooms.ts`. Tier 2; the check is read whole, by my proposal. No human part.

---

## 3m. Rooms by role

Groups of accounts per world and five room types, any of them hidden; `server` reconciles Ergo's state from
the roles file, so Ergo enforces it for every client, a plain IRC one included; no Discord-like permission
matrix (dec:155; `cf` §4). A group past 100 accounts goes through the server's invites at login.

**Done when**

| What changes | The test that fails first |
|---|---|
| The roles file gains `groups` per world (edited by its moderators, by pull request) and a `type` per room: open, announcement (moderators write), logged-in only, members, members read and some write (`cf:215-222`) | Zod cases: an unknown type, a group that does not exist, a room that names two worlds |
| The reconciler turns each room into Ergo state (modes, AMODE, invite lists: `cf:215-222`), compares with Ergo's and fixes drift, at start and on a timer; it holds founder and op, moderators get voice at most (`cf:204`) | Real Ergo, a matrix per type from four viewpoints (guest, logged-in stranger, member, moderator) and a plain raw client: who joins, who reads history, who speaks; the reconciler run twice sends no command the second time |
| Drift is undone: someone with op changes a mode in IRC and the next pass restores it | A raw client changes a mode |
| A group over 100 accounts: the ticket path (3d) asks Ergo to invite the account to its restricted rooms at each login (invites last 24 h: `cf:226`) | A group of 101 |
| A hidden room adds `+s` (`cf:198`: it hides from lists, it stops no join) | Unit; real Ergo |
| Members-only rooms are not sent to OpenAI (they are not public rooms: ADR2:784); the local rules and the mute still apply (my call; a room readable by every logged-in account stays checked) | A members room line makes no provider call |
| The activity API (3h) and the stream (3j) answer for a room only to someone who may read it: a members room's counts and events are not public | A guest and a stranger ask for a members room: absent; a member gets it |
| A type Ergo cannot carry natively (3b's table: AMODE's size, an oper's exemption, `+m` against a reaction `TAGMSG`) is dropped from this merge and written in the known limits, never faked by the app | The table decides |

**Out of scope.** Discord's overwrite matrix, per-person limits, finer rights than join and speak (`cf:228`),
reading a room's room but not its past (`cf:229`), a bridge's user-to-account link and `RELAYMSG` (`cf:230`, `cf:235`),
levels computed from activity, encrypted private rooms (phase 2).

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| A type's mapping lets the wrong people in, or silences the wrong ones | One small mapping file, read whole; a real-Ergo matrix per type | The matrix |
| A moderator with op opens a restricted room | The server holds op; the reconciler undoes drift | The drift case |
| A restricted room is mistaken for a private one | It is readable by the server, the operators and the bot and stored in Ergo's history: the app and `OPERATIONS.md` say "restricted, not encrypted" (`cf:81`, `cf:231`) | The doc check |
| A group list outgrows `+I` (100: `cf:197`) | Invites by the server | The 101 case |
| A stale group after a role change | The timer pass; a restart applies a file change | The idempotence case |

**Tests by level.** Unit, property (idempotence), feature against real Ergo, fuzz of the file, mutation. **Cost.** One
diff per room per pass; **scale** the number of rooms and the group sizes. **Files.** New:
`server/src/rooms/{types, reconcile}.ts`, schema changes to the roles file. Tier 2; `types.ts` is read whole, by my
proposal. No human part.

---

## 3n. Retention, the load numbers and `web`'s limits

**Done when**

| What changes | The test that fails first |
|---|---|
| A retention job for the server's stores, each with days and a size cap (dec:154: verdict records 180 days; the others from this merge's measurements), oldest first and in small batches. Every five minutes it measures rows and bytes against each cap; at 80% of either it logs one `alert` line (once per crossing, re-armed when it falls) | Clock cases: nothing older than the cap remains, the total stays within the size, one alert per crossing; batches bounded |
| Ergo's public history keeps 90 days and DMs 30 by Ergo's own keys (3e). The server measures Ergo's volume read-only and alerts at 80%; deleting by size is Ergo's if 3b's table finds a key, else the runbook's | The measure and alert case; the runbook's line |
| k6 scripts for Ergo logins, the login endpoints, the moderation queue and the stream, run by the operator against a local stack, never the demo (ADR2:1018, :1277) | The first numbers are recorded in this plan; `deploy/test.sh` checks the limits |
| F208's per-visitor connection limits and short timeouts at `web`, sized from the run (bl:50; findings.md:223); the known limit at OPERATIONS.md:116-117 goes | `deploy/test.sh` |
| Logs: a Docker log has a size and a count (compose.yaml:12-14) and **no age that I could verify**, so the 14 days of dec:154 hold only where ops' backend sets them; the demo's logs are capped by size alone, and `OPERATIONS.md` says so | The doc check |
| `docs/OPERATIONS.md`: the known limits of section 8, the alert lines ops matches, the privacy policy and the erasure path as launch blockers (dec:154) | `check_docs.py` |

**Out of scope.** Grafana and tracing (slice 10), the paging itself (ops), the erasure path's build (slice 12).

**Threat model.**

| Threat | Mitigation | Proof |
|---|---|---|
| The disk fills before the days run out | A size cap beside the days; the alert at 80% | The cap and alert cases |
| The job deletes the wrong rows or locks the database | Oldest first, small batches, indexed by time | The cases above |
| An alert storm | One line per crossing | The re-arm case |
| A load test hurts the demo | A separate local stack | The script's own check |

**Tests by level.** Unit with the clock, property, operator's load runs. **Cost and scale.** One indexed query a
tick. **Files.** New: `server/src/retention/`, `deploy/k6/`; changed: `deploy/web/nginx.conf`, `deploy/test.sh`,
`deploy/.env.example`, `docs/OPERATIONS.md`. Tier 2, `deploy/` security-sensitive. The last merge: the workspace
reviews run here. No human part.

---

## 4. What slice 3 hands to slice 4

The browser's half of the login is slice 4's first merge, the smallest `lib/adena` (dec:139; the rest stays in
slice 9): tier 1, read whole (REVIEW.md:12), with the real extension. It finds Adena, reads `GetAccount` and
`GetNetwork` (ADR2:517-519), asks the server's challenge, has Adena sign its text unchanged with `signArbitrary`,
posts the proof, then for each connection asks for a ticket and sends it as the SASL passphrase, with jittered
backoff (ADR2:973-974); phones read only ("To speak, log in on a computer": bl:79). Slice 3 gives it: the
routes and their Zod schemas in `packages/schemas`; a demo with Ergo and `server` running; a documented
sequence; a Node login client with a generated key (`server/src/testing`) for its journeys; and the open
checks it must close: whether `signArbitrary` matches what the generated signatures are (dec:141), whether
Adena's popup shows the requesting origin (3c), and whether `window.adena` works under the CSP (3f). The
backlog's rows 4 and 9 say so (3a).

## 5. Tests, by level

| Level | Where |
|---|---|
| Unit, property (fast-check) | Every merge |
| Feature against fakes (a fake provider, a fake Ergo for hostile lines) and the real Ergo in the gate | 3b to 3d, 3h to 3m |
| Contract: Ergo's real answers (3b's table, or its fixtures), OpenAI's documented answers | 3d, 3i |
| Races on every single-use proof and on mute and checks | 3c, 3d, 3i, 3k, 3l |
| Fuzz on request parsers, frames, IRC lines and the roles file | 3c, 3d, 3h, 3m |
| Faults: provider down, slow, 429, unknown shape; Ergo drops; `server` stopped | 3d, 3i, 3j |
| Soak and memory: heap flat over 100,000 messages | 3i, full gate only |
| API journeys (Playwright's `request`, a raw WebSocket; no axe: nothing to scan) and browser journeys for the CSP only (dec:151) | 3c, 3d, 3f, 3j, 3l |
| Mutation (StrykerJS) on each merge's changed lines | Every merge |
| Operator's `deploy/test.sh`, `--mutants`, k6 | 3e, 3f, 3n |

## 6. Dependencies (all approved, dec:152)

None is read here: the registry is a network call and the sandbox reaches it, so 3a's step 1 does it and
writes version, date and tree here.

- npm: `hono`, `@hono/node-server`, `@hono/zod-validator`, `zod` (a direct dependency; only transitive today,
  `pnpm-lock.yaml:3783`), `@types/node` (closes F105, findings.md:120), `@adena-wallet/sdk` (0.1.x and young:
  ADR2:512-513; `trustPolicy: no-downgrade` and `minimumReleaseAge` may refuse it at install; its tree is unread).
- Images and tools: a distroless Node 24 image by digest (ADR2:1091); Ergo built from source at the pinned tag,
  and its official image by digest if one exists (**unverified**); smokescreen if its docs hold (3e); k6, as a
  binary or an image, run by the operator.
- Not added, and each stops and asks if it turns out needed (CLAUDE.md:51): a WebSocket package (Node's global
  `WebSocket` is a `function` on 24.22.0, run in this session; whether it sends what Ergo needs is 3b's test;
  `ws` 8.22.0 is only transitive: `pnpm-lock.yaml:3738`), a YAML parser, any bech32, secp256k1 or ripemd library
  (the test signer must come from the SDK or its approved dependencies), `@gnolang/*`, OpenTelemetry (slice 10),
  PostHog (12).

## 7. What the docs do not say

Unverified, and each turned into a test or a read at the merge named:

1. **Ergo's protocol and keys** (3b's table): the auth-script's exchange and its failure behaviour; whether the
   returned account name may differ from the SASL one; the nick's form against `nicklen` 32; the privilege `REDACT`
   needs; the mute extban and list size; client tags stored and replayed; `+m` against reactions; AMODE's list size and
   an oper's exemption from 15 channels; operator login per listener; allowed origins; the registration switch; the
   retention keys and any size cap; how the oper hash reaches the config; the address by PROXY or by header on the
   WebSocket; whether the browser's Basic-auth password rides the WebSocket handshake; an official image; that the
   tag builds with Go 1.26.2; that the sandbox binds a Unix socket. `cf:270-273` lists the claims `cf` itself could
   not check.
2. **Adena's SDK 0.1.x**: the verifier's signature and fields, how a test signs, whether the popup shows the
   origin and refuses another domain, its size and dependencies (3c; accepted risk: dec:141).
3. **OpenAI's Moderation API**: request and response shapes, the category list, rate limits, retention, free use,
   EU transfer. What dec:145 records (text and images; images only for three categories; "sexual/minors" text only)
   stands; the rest is read at 3i's start.
4. **Hono's APIs** (CSRF, SSE, body limit) and `node:sqlite`'s behaviour: read from the installed types (3a, 3c,
   3j). **The single-process lock** (ADR2:968-969 says only "a lock at start"): 3a's test chooses one.
5. **Browser facts**: the `__Host-` prefix's rules, `Secure` cookies on `localhost`, whether a cross-site response
   can set a Strict cookie, whether CSP's `'self'` covers a WebSocket: read in MDN and the spec in 3c and 3f.
6. **smokescreen's docs** (3e); whether React Router lets the inline scripts move out (F341: findings.md:356).
7. **Docker's `json-file` has no age limit**: compose.yaml:12-14 uses a size and a count, and nothing in the repo
   says more (3n).
8. **Where the bot keeps its catch-up state** (ADR2:790-792 says "keeps the last message it checked"): this plan puts
   it in SQLite. **Whether the bot's actions go into a signed audit log from the first hide** (ADR2:855-857 is slice
   12's): plain append-only rows, which slice 12 chains from its first entry.
9. **Ergo's upgrade and backup**: ADR2:1032-1033 backs Ergo up before each upgrade and ADR2:1018 says the demo has no
   backups; the runbook (3e) says which holds for the demo.
10. **Docs to correct** (3a): the rows in section 1, item 8; ADR1 §1, §2, §10 and §13 still describe a Go program, a
    name required to speak and a 30-day signed document (ADR1:234, :273-285), which ADR2 replaced; ADR2:1277 puts load
    tests "before launch" and the backlog puts k6 here; ADR-0002's six lines in `cf` §2 are Alexis's to amend.
11. **Why guests who speak under a nickname were not followed**: `docs/prototype/reviews/growth.md:84` proposes it;
    ADR1:233-234 and the backlog's test settle "read but not speak", and no doc records why.

Answered by the decisions, no longer listed: who builds the browser half (dec:139), the login text (141), the chain
list (142), the token (143), names and free accounts (144), verdicts (145), the mute and the whitelist (146), rooms
and the nick (147, 155, 162), roles (149), CSP (150), egress and observability (151), dependencies (152), OpenAI's
key (153), retention numbers (154), where `markets.json` lives (the timer is slice 5's).

## 8. Known limits to write in `OPERATIONS.md`, each in the merge that creates it

A ban evaded with a new address (3c, 3k; dec:144); a revoked token's live connection lasts until it drops (3d); a
mistaken hide stays until slice 12's console (3j; dec:146); a provider outage leaves text unchecked and previews
waiting, by design (3i); members-only rooms are not sent to the provider (3m); restricted is not private (3m); logs
are capped by size alone in the demo (3n); Ergo's history is capped by days and alerted by size (3n); the privacy
policy and the erasure path block a public launch (3n; dec:154).

## 9. Calls this plan makes, and what needs Alexis's hands

Technical calls, recorded in `dec` when the plan is approved; each is one line to reverse:

1. 14 merges, the CSP before the bot, the roles file before `core/irc` is needed.
2. The whitelist is the roles file's `trusted` and `team` (dec:149 over dec:146's "settings"); a world's moderator is
   not spared by the role alone.
3. "Remove a room" archives it (`+m`, unlisted); Ergo's ability to drop a channel is unverified.
4. Members-only rooms are not checked by the provider.
5. The roles file is read at start; a change needs a restart until the console.
6. Rights files (3g, 3l, 3m) are read whole by Alexis, a proposal beyond REVIEW.md's tiers.
7. Numbers are settings with defaults of mine (nonce TTL 5 minutes, mute 3 hides in 10 minutes for 5, "new" under
   24 hours), listed in each review card and to be set from the first data.

Needs Alexis: the `Edit(/server/package.json)` deny line (section 1, item 2); `core/irc`'s bodies before 3h; the
operator's `deploy/test.sh` runs (3e, 3f, 3n); the real extension at slice 4's first merge; the OpenAI key file once
(dec:153); ADR-0002's amendments (`cf` §2).
