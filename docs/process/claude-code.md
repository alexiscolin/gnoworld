# Working with Claude Code

How gnoworld is built with Claude Code: where a session starts, how a branch gets its worktree, how a change reaches GitHub,
and the workshop's ping-pong. The gate, the hooks and the permissions themselves are in [HARNESS.md](../HARNESS.md); the
human path is [DEVELOPMENT.md](../DEVELOPMENT.md).

## A session

Start Claude Code in this folder, so it reads the project's settings, hooks and sandbox, and
accept the folder's trust prompt. The project's plugins are enabled for everyone but each
person installs them once:

```bash
claude plugin install typescript-lsp@claude-plugins-official --scope project
claude plugin install context7@claude-plugins-official --scope project
claude plugin install gnomcp@gnoverse --scope project   # its marketplace is declared in .claude/settings.json
```

A branch reaches `main` as a pull request, merged on GitHub (D13165): `main` takes no push, and pre-push refuses one. A session's
branch reaches GitHub through `land`, the owner's one command (D13211, D13213; `docs/HARNESS.md`, "A change, from plan to merge").

## A branch's worktree

Each branch works in a worktree of its own, made from the root of a checkout whose packages are
installed (the main checkout, or the worktree a part is cut from) by one script, never by hand:
`sh scripts/worktree.sh <name> <branch> <base>`, `<name>` (a-z, 0-9 and -) a folder of
the worktrees' folder, `<main checkout>-wt` beside the main checkout in your home (made once, in your shell, D13415), where no session's shell writes but its own
folder (its file tools still can), which it may also be given in full.
Whatever the spelling (a `..`, a link, another path) it refuses any other folder, as it may run
outside the sandbox and must touch no other, and a base whose harness,
`CLAUDE.md` or package files are not its tree's. No part's session writes a sibling there, moves
one or plants one; the chief's session writes the folder by `--add-dir` (docs/HARNESS.md, "Who does
what"). It makes the branch, links the main tree's
installed packages one by one (one store), and copies each workspace's `node_modules` with its
relative links and a `.bin` of its own, through no link it did not make. Hand-made
links loaded React twice in Storybook and let the probe delete main's own `.bin/storybook`.
`sh scripts/worktree.sh remove <name>`, from another tree,
removes a worktree of that root that holds no change, staged file or untracked file (git's own
check: its ignored files go with it, never what a link in it leads to) with its record, and keeps
its branch. It prunes no other record, which a session can point at nothing: `git worktree prune`
is run in your shell. In Claude Code it runs outside the sandbox: write the call alone, from the
checkout's root, with plain words (a bare `<name>`); the guard refuses any other form (a `cd`, a
`$(...)`, a `~`, an assignment, a redirect or another command in the call).
A branch with an upstream is deleted in your shell: in a session `git branch -D` cannot write
`.git/config`, so it deletes the branch but keeps its `branch.<name>` section, which a new branch
of that name would inherit. A branch `worktree.sh` made has no such section.
After a merge that changes the lockfile, install in the main checkout
(`pnpm install --frozen-lockfile`, with `.node-version`'s Node first on the PATH).

A session writes its own worktree only: never another session's, by any tool, nor runs a command
that writes there. So a merge into a part's branch that changes the harness is the owner's, in
the owner's terminal: the part's own sandbox refuses those files, and the chief writing them for it
from its own session would write another session's worktree.

## The ping-pong

While your own `pnpm workshop` serves a checkout, each retouch of Claude's shows live in a
couple of minutes; no gate runs at a turn's end, and a commit takes seconds (the secret scan, Prettier, the docs check); the
gate, the tests and the review come once the batch is accepted. The code the workshop runs is outside Claude's sandbox, under a profile of its
own (`scripts/workshop.sb`): it writes its own folders and caches alone, reads nothing of the home folder but the code it runs, reaches
no keychain, no other app and no Unix socket but the system's. It cannot hold where that code listens, and its outbound network
stays open (HARNESS.md's known limits): the servers listen on 127.0.0.1 because their configs say so, and macOS's
firewall is the wall against the LAN. Stop the workshop (Ctrl+C) when the ping-pong ends.

**Landing a batch (« pose »):** when the owner says « pose » and names the commits validated, `/pose <commits>`
(`.claude/commands/pose.md`) lands them alone: tests by risk, the gate's jobs run once, one review a pull request, pull requests of
about 600 product lines, and a one-line push script each for the owner (D13192).

## Slices

One slice is worked at a time, each with its plan in `docs/process/plans/` (ADR-0001 §14, CLAUDE.md): a chief session
plans it and cuts it into branches, each run in a session and a worktree of its own, two at once at
most (`docs/HARNESS.md`, "Who does what").

The order of work is in [plans/backlog.md](plans/backlog.md), with the
concepts of ADR-0002 placed in it. Each slice gets its plan before it starts.

## The workshop on the owner's network

The workshop's dev servers, with hot reload, are opened from another computer or a phone over Tailscale. `scripts/workshop.sh` and `app/lab.config.ts` also start a lab server that has no page to serve (`app/lab/` does not exist).

**Start it** with `pnpm workshop`, in your own terminal, from a worktree or the main checkout (the sandbox reaches neither
Tailscale's socket nor a server it could stop). `scripts/workshop.sh` serves the checkout it sits in, two dev servers of its app,
each started by its function `start` and put on the tailnet by `share`: the app's (`react-router dev`) on 127.0.0.1:5198 and the
lab's (`vite --config lab.config.ts`) on 5199, with `WORKSHOP_HOSTS` set to this machine's tailnet name and address; then, when
the `tailnet-preview` skill's script is installed, each on the tailnet under its own name, `workshop-app` and `workshop-lab`;
without it, the local addresses. It stops only processes it started itself (their pids and ports in `.claude/tmp/workshop.pid`):
a port held by anything else is said, never taken. Ctrl+C stops all three, the servers and the backend (below), and takes them
off the tailnet, and so does any of them that stops; a second `pnpm workshop` in the same checkout replaces the first, the
backend a run killed hard left included, and that run's names stay on the tailnet until the next one, or
`tailnet-preview.sh down workshop-app` and `down workshop-lab`.


Each dev server listens on 127.0.0.1 alone and answers only the names `WORKSHOP_HOSTS` lists, exactly. By path it serves the app,
the packages and their store, never the repository's root, whose `deploy/` holds secrets (`app/vite.config.ts`'s `workshopServer`,
which both configs use). The `tailnet-preview` skill's script prints two links for each name, and the workshop says which is
which. On the other computer or the phone, open the https ones:
- **`workshop-app`, the app's screens:** `https://<host>:<port>/` for the home, then `/earth`, `/w/<world>` and every route,
  the chat with them: the app's dev server alone proxies `/api` and `/ws` to the workshop's backend (below).
- **`workshop-lab`:** the second name the script puts on the tailnet; with `app/lab/` gone, no page answers there.

The http link on the Tailscale IP is the fallback for a device without Tailscale's DNS. It is not a secure context, so Copy
cannot reach the clipboard there; select the list instead.
