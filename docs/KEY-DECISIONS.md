# Key decisions

The decisions that shape gnoworld, in plain words, each with its reason and where it lives. The design is
[ADR-0001](../adr/0001-gnoworld.md), the approved prototype's scope [ADR-0002](../adr/0002-validated-prototype.md); the
day-to-day log of every decision, the review findings and the plans are the process journal, in [process/](process/README.md).

## The product

1. **A social hub, not a game.** Every realm on gno.land is a world, drawn as a planet in one continuous 3D space with the
   Earth at its center; each world has its rooms. *Why:* people and conversations come first, and the map shows where they
   are. *Where:* ADR-0001 summary, ADR-0002 summary.
2. **Phones get the chat first.** On a phone the chat is full screen and the places are a list with planet thumbnails; the
   3D is a computer's. *Why:* a phone is where people talk, and a 3D scene costs its battery. *Where:* ADR-0002 §8, row 10.
3. **Every place has a URL and a pre-rendered page,** with no rendering server in production (React Router's framework mode,
   static pages). *Why:* search engines and shared links reach any world. *Where:* ADR-0002 §2, `app/src/routes.ts`.
4. **The universe stays readable at any size.** One stable place per realm, a rank from real signals (calls, people, tokens),
   and a bounded level of detail; realms with no signal are dust. *Why:* gno.land will hold millions of realms. *Where:*
   ADR-0002 §3, `packages/core/src/space/`.
5. **What varies between worlds is generated from a seed:** a world's look, an avatar's nebula from its address. *Why:* no
   fixed set of pictures can cover every realm, and the same seed always draws the same thing. *Where:* ADR-0002 §8, row 9,
   `packages/core/src/planet/`.

## The chain

6. **gnoworld never signs for anyone.** Visitors sign their own calls in Adena, inline, from a card on the realm's page; Jarvis
   prepares calls and never signs. *Why:* the user's keys stay the user's. *Where:* ADR-0002 §4, `app/src/lib/adena/`.
7. **Reads of the chain are free and go through gno's own query surfaces** (`vm/qrender`, `vm/qeval`, `vm/qfuncs`, `vm/qfile`),
   the chain id checked first, every answer size-capped and schema-checked. *Why:* no indexer of our own to run, and a node's
   answer is untrusted input. *Where:* `packages/chain/src/read.ts`.
8. **Every `vm/qeval` expression is built by reviewed, tested builders,** from literals a pattern or a schema proved. *Why:* a
   node runs any expression it is sent, so the builder is the defence. *Where:* `app/src/lib/chain/evalCall.ts`,
   `packages/core/src/chain/`.
9. **Phase 0 writes nothing of its own on chain;** the satellite realm comes first, then the hubs, profiles and sessions of
   phase 1. *Why:* the simplest hub that works, before the chain holds social state. *Where:* ADR-0001 §1 and Rollout, the README's
   Status.
10. **A realm deploys to its deployer's address namespace** until a name is granted. *Why:* `gno.land/r/gnoworld/...` cannot be
    registered through `r/sys/namereg/v0`, whose names are `nym-` names. *Where:* `gno/README.md`.
11. **A name is required only where accountability matters.** *Why:* names are free on gno.land and prove nothing about a
    person. *Where:* ADR-0001 §10.

## Talking

12. **Public rooms run on IRC (Ergo),** reached over WebSocket, behind a login by one Adena signature. *Why:* a mature,
    open protocol any IRC client can join, with threads, reactions and history through IRCv3. *Where:* ADR-0001 §1,
    `packages/core/src/irc/`.
13. **Direct messages are plain in phase 0, labelled "not encrypted";** end-to-end encryption (MLS) and seals come in phase 2.
    *Why:* no home-made crypto, and MLS needs its own work. *Where:* ADR-0002 §8, row 5.
14. **Moderation is a bot checking each line after it is posted, with contests,** and a world's namespace owners moderate its
    rooms (hide, mute, pin). *Why:* rooms stay live, and the people who own a world look after it. *Where:* ADR-0002 §6,
    `server/src/moderation/`.
15. **No hosted media at first:** embeds from accepted services only, in a sandboxed frame. *Why:* hosting uploads needs abuse
    scanning first. *Where:* ADR-0002, question 16, `app/src/features/chat/embeds.ts`.
16. **Jarvis, the assistant, is its own service,** reaching the chain only through a read-only gnomcp, with a tool allowlist,
    a daily budget and evals against prompt injection. *Why:* a model reading untrusted realms must be boxed. *Where:*
    ADR-0002 §5, `jarvis/`.

## The stack

17. **One TypeScript server on Node** (Hono, `node:sqlite`) for the login, moderation, search, link cards and the worlds' data.
    *Why:* one language with the client and shared schemas, instead of ADR-0001's small Go program. *Where:* ADR-0002 §8, row 12,
    `server/`.
18. **Every piece of outside data goes through a Zod schema first** (the relay, the indexer, a realm, the wallet). *Why:* a
    type is a promise only when something checks it. *Where:* `packages/schemas/`, CLAUDE.md.
19. **Strict TypeScript:** no `any`, no `@ts-ignore`, no non-null assertion. *Why:* the compiler then catches what review would
    miss. *Where:* `tsconfig.base.json`, `eslint.config.ts`.
20. **CSS Modules with CUBE CSS and a design system of tokens and components;** no Tailwind. *Why:* shared layouts live in
    compositions, values in tokens, and one formatter settles style. *Where:* `docs/DESIGN-SYSTEM.md`, `packages/ui/`.
21. **The stack is hardened by default:** each service's way out goes through an egress allowlist, images are pinned by digest
    and distroless where they can be, with CPU and memory caps; the page's CSP runs the site's own scripts and, inline, only those whose hash it names.
    *Why:* nothing relies on the code being private. *Where:* `deploy/compose.yaml`, `docs/OPERATIONS.md`, `app/src/csp.ts`.
22. **Login is a signed one-time challenge;** the server keeps only a hash of each session token. *Why:* a stolen database
    gives no session. *Where:* `server/src/login/`.

## How it is built

23. **Test first,** and a bug fix starts with the test that reproduces it. *Why:* a test seen failing proves it can fail.
    *Where:* CLAUDE.md, `docs/HARNESS.md`.
24. **Review by risk.** Tier-1 code (realms, login, the wallet, the CSP, the chain-read builders, the edge's guards) gets a
    security review and mutation testing; the rest a combined review. *Why:* reading effort goes where a bug costs most.
    *Where:* `docs/REVIEW.md`.
25. **Every guard of the gate is proven by a planted bypass it must catch.** *Why:* a check nobody saw fail may check nothing.
    *Where:* `docs/HARNESS.md`, `docs/harness.png`.
26. **The safety net never shrinks quietly:** a removed test, a lowered floor or a changed baseline is declared in its commit,
    or the gate refuses the pull request. *Why:* regressions hide in deletions. *Where:* `scripts/check_regressions.py`.
27. **Decisions and findings are recorded in neutral English,** never as quotes and with no personal detail; the process journal
    lives in `docs/process/`. *Why:* the repository is public and read by people who were not in the conversation. *Where:*
    CLAUDE.md, [process/README.md](process/README.md).
