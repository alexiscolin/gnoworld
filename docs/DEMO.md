# Running the demo and the beta

How to run gnoworld from one Mac for a live demo, then for a few testers. The script is `deploy/demo.sh`; it
starts the stack only from `~/gnoworld-demo`, a copy of one commit that it checks against the commit's name.
The stack, its secrets and its limits are in [OPERATIONS.md](OPERATIONS.md); do its "Before the first start" once
first (the tailnet, the auth key, the password, the secrets, `deploy/.env` with `ORIGINS`).

Run every command in your own Terminal, from the repository (`~/Server/gnoworld`). Each subcommand says what it will do first.

## Tonight

1. Freeze the commit you will show: `sha=$(git rev-parse <the commit>)`.
2. `sh deploy/demo.sh prepare $sha`. It makes the copy, checks it, and copies `deploy/secrets/` and `deploy/.env` into it
   once. The copy's own are the live ones from then on (edit `~/gnoworld-demo/deploy/.env`, not the original).
3. `sh deploy/demo.sh up`, with `--jarvis` and `--links` only if `JARVIS=on` and `LINK_CARDS=1` are set in the copy's `.env`
   (see "Switching Jarvis on" and "Switching the link cards on" in OPERATIONS.md). The first build takes minutes. It ends by
   printing the public address once every container is healthy.
4. `caffeinate -dims` in a second Terminal tab (Ctrl+C ends it): the Mac must not sleep. Keep it plugged in.
5. Check from a phone on mobile data, Wi-Fi off: open the address, log in as `team` with the demo password, send a line.
   `sh deploy/demo.sh test` does the same checks from the Mac (it asks the password).
6. Give the other person the address and a login: the shared `team` one, or their own (`tester add`, below).

If something breaks:

- `sh deploy/demo.sh status`, then `sh deploy/demo.sh logs <service>` (`web`, `server`, `ergo`, `tailscale`, and with their profiles `jarvis`, `jarvis_reader` and `link_reader`).
- A service misbehaves: `sh deploy/demo.sh restart <service>`. Restarting `ergo` or `server` restarts `web` too: the site is
  silent for some seconds. If `/ws` or `/api/` answer 502 after a crash, `restart web`.
- The public address answers nothing but the stack is healthy: `restart tailscale`.
- A bad version: go back to the previous commit with `sh deploy/demo.sh prepare <previous sha>`, then `sh deploy/demo.sh up`.
  `up` backs up first, and the chat stays (it lives in volumes, not in the copy).
- To cut the public address at once: `docker compose -f ~/gnoworld-demo/deploy/compose.yaml --profile demo stop tailscale`
  (back with `start tailscale`), or Remove the machine in Tailscale's admin console from a phone.

## The beta

- **Add a tester**: `sh deploy/demo.sh tester add <name>`. It asks the password twice (never shown); choose it and send it
  to that person yourself, not in a shared channel. It restarts `web` so the file is read. One line per tester, so one can be
  cut off alone.
- **Cut one off**: `sh deploy/demo.sh tester remove <name>`. The shared `team` line stays until you remove it by hand
  from `~/gnoworld-demo/deploy/secrets/demo_htpasswd` (`htpasswd -D`), then `restart web`.
- **What a tester needs**: a computer browser (Chrome, Firefox, Safari). Adena (the gno.land wallet extension) is optional: a
  guest can talk without it. To try a call on a realm they need testnet coins from the testnet's faucet; Adena is how they
  sign it.
- **How they report a problem**: by the channel you chose (a message to you); ask for what they did, what they saw, the time,
  and a screenshot. You match the time with `sh deploy/demo.sh logs server`.
- **Update the beta to a new commit without losing the chat**: `sh deploy/demo.sh backup`, then `prepare <new sha>`, then `up`
  (`up` also backs up first). The backup stops the server and Ergo for the copy and starts them again: the site is silent for some seconds. Backups go to `~/gnoworld-demo-backups/<time>/` (the server's database and
  Ergo's history). The chat is in volumes that `down` keeps; only `wipe` removes them, after you type the word.
- **Restore a backup**: `sh deploy/demo.sh restore <backup folder>` (for example `~/gnoworld-demo-backups/20261112-101500`).
  It refuses a folder that is not what `backup` writes (`server/gnoworld.db`, and files in `ergo/`), says what it will replace, and
  asks you to type the word `restore`. It then takes a backup of the current volumes (so a wrong restore is undone by restoring
  that newest folder), stops `server` and `ergo`, empties the two volumes, copies the backup in, sets the owner the containers
  run as (65532), and starts them again, even if the copy failed; a failed copy then stops the script with an error.
- **Move the data to another machine**: copy the backup folder there (`scp -r`, or a disk), do "Tonight" steps 1 and 2 (`prepare`),
  then `sh deploy/demo.sh up`, then `sh deploy/demo.sh restore <the copied folder>`. Restore only after `up`, so the
  volumes and containers exist.
- **Try restore once, before you need it, on a scratch copy**: `DEMO_DIR=$HOME/gnoworld-scratch DEMO_BACKUPS=$HOME/gnoworld-scratch-backups`
  gives a second copy, but its volumes would still be named `gnoworld-demo_*` (compose.yaml's `name:`), so do this on a machine
  with no demo data instead: `prepare`, `up`, send a line in the chat, `backup`, send another line, `restore <that backup>`.
  Expected: the second line is gone and the first stays; `sh deploy/demo.sh status` shows everything healthy; a login still works.
  Also try `restore` with an empty folder (must refuse) and say anything but `restore` at the prompt (must change nothing).

## Personal keys

The demo and the beta run on your own Anthropic and OpenAI keys, never on production's, so spend is held down at three
levels. Nothing in the repository holds a key or names an account.

1. **Write each key yourself, from the clipboard**, never typed into a chat or onto a command line (the shell's history keeps
   those). Copy the key at the provider, then, from the repository:
   `pbpaste > deploy/secrets/anthropic_api_key`, `pbpaste > deploy/secrets/openai_api_key`, then `chmod 644` each
   (OPERATIONS.md, "Before the first start", step 6), before `prepare` copies them. After `prepare`, to change one, write it
   into `~/gnoworld-demo/deploy/secrets/` the same way, then `sh deploy/demo.sh restart server` (and `restart jarvis`).
   The OpenAI key is used for one thing here: the moderation check of each chat message, its text alone. The Anthropic key
   is used by Jarvis only.
2. **The app's own caps**, in `~/gnoworld-demo/deploy/.env`: `JARVIS_BUDGET_USD=2` and `JARVIS_TRANSLATION_BUDGET_USD=1`
   (whole dollars a day; 1 is the lowest the app takes, and 2 leaves a demo's few questions room while a stuck loop stops
   at two dollars). Jarvis answers logged-in accounts only, each with its own daily question cap. Jarvis can stay off:
   `up` without `--jarvis` starts no Jarvis, and the Anthropic key is then never read. These two values are read at
   jarvis's first start and kept in its file after that: a `jarvis` volume that exists keeps its old budgets, whatever
   `.env` says. To change them then, use the admin API's budget change (the admin console, which joins the `admin`
   network, OPERATIONS.md), or, if the kept answers can go, `sh deploy/demo.sh down`, `docker volume rm gnoworld-demo_jarvis`,
   then `up --jarvis`: the volume is made again from `.env`.
3. **The providers' hard limits, set before the demo**: a spend limit on the Anthropic workspace the key belongs to, and a
   budget or usage limit on the OpenAI project the key belongs to. Those stop the spend even if the app's caps fail. Set
   them at the providers, read there; this runbook states no price.
4. **After the beta**: `sh deploy/demo.sh keys forget` prints the steps (stop, revoke both keys at the providers, delete the
   two files in the copy and in the repository). It never reads or prints a key.

## Known limits

- No Adena app on a phone yet: a phone is a guest.
- Jarvis answers logged-in accounts only, and each answer costs on Anthropic's key (a daily budget caps it).
- A realm's two-sentence explanation comes from the seed shipped with the commit (onyx's realms explained in advance, no key spent). A realm
  the seed lacks shows its own first line, or, with Jarvis on, gets a line at its first visit, on the Anthropic key, 30 new in any 24 hours at most
  (OPERATIONS.md, "The realms' explanations").
- The Mac must stay on, awake, plugged in and online (`caffeinate`, above). If it sleeps, the address is dead.
- The demo password and the 640-request burst limit are the only walls: do not post the address in public.
- A backup stops the server and Ergo while it copies, so the database and its journal are a consistent pair; it is not
  tested by a restore until you try `restore` once (above). `wipe` always backs up first, even when the stack is stopped, and removes nothing if the copy fails.
- The copy is a checked commit: a fix means a new commit, `prepare` and `up`, not an edit in `~/gnoworld-demo`.

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
