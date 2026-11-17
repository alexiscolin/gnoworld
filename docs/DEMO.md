# Running the beta

How to run gnoworld for a few testers, on the host the runbook sets up. The stack, its secrets and its limits are in
[OPERATIONS.md](OPERATIONS.md): do its "Before the first start" once first. Nothing publishes the stack until the automatic
deploy's part adds its TLS front (D13172), so the address a tester opens comes from that part; the steps below hold whatever it is.

Run every command from the repository's root, in your own Terminal.

## Testers

- **Add a tester**: `htpasswd -B deploy/secrets/demo_htpasswd <name>`. It asks the password twice (never shown); choose it and send
  it to that person yourself, not in a shared channel. Then `docker compose -f deploy/compose.yaml restart web`, so the file is read.
  One line per tester, so one can be cut off alone.
- **Cut one off**: `htpasswd -D deploy/secrets/demo_htpasswd <name>`, then `restart web` as above. The shared `team` line stays until
  you remove it the same way.
- **What a tester needs**: a computer browser (Chrome, Firefox, Safari). Adena (the gno.land wallet extension) is optional: a
  guest can talk without it. To try a call on a realm they need testnet coins from the testnet's faucet; Adena is how they
  sign it.
- **How they report a problem**: by the channel you chose (a message to you); ask for what they did, what they saw, the time,
  and a screenshot. You match the time with `docker compose -f deploy/compose.yaml logs server`.
- **If something breaks**: `docker compose -f deploy/compose.yaml ps`, then `logs <service>`. Restarting `ergo` or `server` restarts
  `web` too: the site is silent for some seconds. If `/ws` or `/api/` answer 502 after a crash, `restart web`.
- **The chat lives in volumes** (`ergo`, `server`), which `down` keeps and `down -v` removes. There is no backup
  (OPERATIONS.md, "Known limits").

## Personal keys

The beta runs on your own Anthropic and OpenAI keys, never on production's, so spend is held down at three levels. Nothing in
the repository holds a key or names an account.

1. **Write each key yourself, from the clipboard**, never typed into a chat or onto a command line (the shell's history keeps
   those). Copy the key at the provider, then, from the repository:
   `pbpaste > deploy/secrets/anthropic_api_key`, `pbpaste > deploy/secrets/openai_api_key`, then `chmod 644` each
   (OPERATIONS.md, "Before the first start", step 4), and set `MODERATION=on` in `deploy/.env` (step 3). To change one
   later, write it the same way, then
   `docker compose -f deploy/compose.yaml restart server` (and `restart jarvis`).
   The OpenAI key is used for one thing here: the moderation check of each chat message, its text alone. The Anthropic key
   is used by Jarvis only.
2. **The app's own caps**, in `deploy/.env`: `JARVIS_BUDGET_USD=2` and `JARVIS_TRANSLATION_BUDGET_USD=1`
   (whole dollars a day; 1 is the lowest the app takes, and 2 leaves a few questions room while a stuck loop stops
   at two dollars). Jarvis answers logged-in accounts only, each with its own daily question cap. Jarvis can stay off:
   a start without `--profile jarvis` starts no Jarvis, and the Anthropic key is then never read. These two values are read at
   jarvis's first start and kept in its file after that: a `jarvis` volume that exists keeps its old budgets, whatever
   `.env` says. To change them then, use the admin API's budget change (the admin console, which joins the `admin`
   network, OPERATIONS.md), or, if the kept answers can go, `docker compose -f deploy/compose.yaml --profile jarvis down`,
   `docker volume rm gnoworld-demo_jarvis`, then `docker compose -f deploy/compose.yaml --profile jarvis up -d`: the volume is
   made again from `.env`.
3. **The providers' hard limits, set before the beta**: a spend limit on the Anthropic workspace the key belongs to, and a
   budget or usage limit on the OpenAI project the key belongs to. Those stop the spend even if the app's caps fail. Set
   them at the providers, read there; this runbook states no price.
4. **After the beta**: stop the stack, revoke both keys at the providers, delete the two files in `deploy/secrets/`.

## Known limits

- No Adena app on a phone: a phone is a guest.
- Jarvis answers logged-in accounts only, and each answer costs on Anthropic's key (a daily budget caps it).
- A realm's two-sentence explanation comes from the seed shipped with the commit (onyx's realms explained in advance, no key spent). A realm
  the seed lacks shows its own first line, or, with Jarvis on, gets a line at its first visit, on the Anthropic key, 30 new in any 24 hours at most
  (OPERATIONS.md, "The realms' explanations").
- The password and the burst limits (640 requests, 1,024 more for the hashed files) are the only walls: do not post the address in public.

## For testers (paste this)

> Hi! gnoworld is a social hub for gno.land: you walk around a map of the chain's realms and talk in a chat room for each
> one, with the people who are there. It is an early test, so things break.
>
> Open <ADDRESS> on a computer. A box asks for a name and password: use `<NAME>` and `<PASSWORD>`. Then pick a name and say
> hello in a room. If you have Adena you can log in with it; you do not need it to chat.
>
> Try: open a world and chat; log in with Adena; send a call from a realm's card (testnet coins from the testnet's faucet);
> ask Jarvis what a function does (logged in only); paste a link and see its card.
>
> If something breaks, write me: what you did, what you saw, the time, and a screenshot. Please keep the address and the
> password to yourself.
