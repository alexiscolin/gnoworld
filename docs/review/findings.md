# Findings

Every finding a review raised, kept whatever became of it (docs/REVIEW.md, "AI review before a merge"). A
review reads this first: it does not raise a rejected claim again without new evidence, and
a fixed finding that comes back is a regression, filed as one. `scripts/check_docs.py`
checks each row.

- **Status:** `claimed` (not reproduced yet), `reproduced` (the evidence names the command
  or test that shows it), `fixed` (the evidence names the commit, in backticks, and its
  test), `rejected` (the evidence says why), `asked` (put to Alexis, who decides).
- **By:** who found it: a review agent, a tool (`harness_mutate`, the probe), Alexis, or
  Claude while working.

| Id | Found | By | Where | Claim | Status | Evidence |
|---|---|---|---|---|---|---|
| F001 | 2026-10-17 | deep review | `.claude/settings.json` | Claude Code's project layer (guard, Stop gate, format hook, sandbox, permission rules) never ran: the session started in the home folder, not in the repo | asked | `git -c core.hooksPath=/dev/null rev-parse HEAD` ran, which the guard refuses; Alexis moves the session with `/cd`, then the session-liveness check lands |
| F002 | 2026-10-17 | deep review | `.claude/settings.json` | The hooks run outside the sandbox, and a sandboxed command could rewrite their scripts unprompted | fixed | `c1450c8`: the shell cannot write `scripts`, `.githooks` or the configs, and an edit of them asks; test_hooks "settings.json dropped a boundary" |
| F003 | 2026-10-17 | deep review | `.claude/settings.json` | The sandbox's escape hatches were open: an unsandboxed retry with no prompt, credentials readable, the GitHub API reachable | fixed | `c1450c8`: `allowUnsandboxedCommands: false`, `denyRead` for `~/.ssh`, `~/.config/gh`, `~/.npmrc`, `~/.aws`; test_hooks wiring section |
| F004 | 2026-10-17 | deep review | `.claude/settings.json` | `git -C . push` escaped the push rule, and chain writes through gnomcp asked no one | fixed | `c1450c8`: the guard asks before any push, in any form; ask rules on `gno_addpkg`, `gno_call`, `gno_run`, `gno_key_send`, `gno_cla_sign` |
| F005 | 2026-10-17 | deep review | `scripts/guard.py` | The guard let through `--no-veri`, `HUSKY=0` or `env` before git, a lower-case hookspath, GIT_CONFIG variables, `eval`, `xargs`, `$(gnokey ...)`, `commit-tree`, an interpreter writing a `.gno` | fixed | Reproduced (exit 0 for each); `c1450c8`, 25 guard cases in test_hooks |
| F006 | 2026-10-17 | deep review | `scripts/stop_gate.sh` | When Alexis's core code is red, the Stop gate pushes Claude to edit code that pairing reserves for him | fixed | `c1450c8`: an edit under `packages/core/` asks Alexis first |
| F007 | 2026-10-17 | deep review | `scripts/check_regressions.py` | Any commit sentence naming a floor excused lowering it; a new GAPS entry, ignore or `.fails`, and gno or Go tests, were not watched | fixed | Reproduced (three doors); `1c9589f`, its self-test |
| F008 | 2026-10-17 | deep review | `scripts/check.sh` | The gate linted, tested and mutated `gno/r` only, and patch coverage skipped a changed file the report did not measure | fixed | `5112d57`; a planted `gno/p` package failed the gate, and its untested guard failed the mutation step |
| F009 | 2026-10-17 | deep review | the repository | Nothing is enforced on the server: no CI, and the review pass is recorded by the agent itself | asked | GitHub refuses branch protection on this private repo's plan; ADR-0002 §9 says "CI first" |
| F010 | 2026-10-17 | deep review | `.githooks/pre-push` | The full gate ran on every push, and the harness mutation took minutes per mutant set | fixed | `c2f4ab6` (a work branch gets the fast gate and the secret scan), `00f5e17` (each mutant runs its own tests: 384 s for 127 mutants, then 112 s for 138) |
| F011 | 2026-10-17 | deep review | `.claude/settings.json` | A second person would get no gnomcp (the marketplace is in Alexis's user settings only) and macOS-only sandbox paths | reproduced | No `extraKnownMarketplaces` in the project settings; Linux cache paths added in `c1450c8` |
| F012 | 2026-10-17 | deep review | `.claude/agents/test-auditor.md` | The red pass leaves no anchor, so the green pass cannot check drift since it | claimed | — |
| F013 | 2026-10-17 | deep review | `docs/DEVELOPMENT.md` | It says changes under `.claude/` skip the gate; `code_changed.sh` gates `settings.json` | reproduced | `docs/DEVELOPMENT.md` line 38 against `scripts/code_changed.sh` |
| F014 | 2026-10-17 | deep review | `CLAUDE.md` | It describes the gate's benches, which do not exist yet | reproduced | No bench in `scripts/check.sh` |
| F015 | 2026-10-17 | deep review | `.claude/tmp/irc-ref/` | Claude's reference parser sits next to the code Alexis is to write | asked | Kept out of git (`.claude/tmp/`); Alexis decides whether it moves out of the repo |
| F016 | 2026-10-17 | deep review | `scripts/guard.py` | Any gnomcp call, `gno_status` included, unlocked writing `.gno` files | fixed | Reproduced (exit 0); `c1450c8`: the gno skill must be loaded too |
| F017 | 2026-10-17 | harness_mutate | `eslint.config.ts` | The selector for a catch that logs then returns a default never matched (esquery's `:has` with two steps) | fixed | `feb6f61`, probe case `log_return.ts` checked by its message |
| F018 | 2026-10-17 | harness_mutate | `scripts/probe.py` | The probe checked only a rule's name, so one selector could hide another's absence | fixed | `feb6f61` (each selector checked by its message), `554202d` (each alternative mutated) |
| F019 | 2026-10-17 | harness_mutate | `scripts/test_hooks.sh` | Under macOS's sh, an EXIT trap turned a crash on an unbound variable into exit 0 | fixed | `d1f23a7`: an unbound variable injected into each script now fails it |
| F020 | 2026-10-17 | Claude | the session | A GitHub token was printed into a review agent's transcript: RTK rewrote its `grep -c` into a grep that prints lines | asked | 4 token-shaped strings in that transcript, counted without printing; Alexis revokes the token and logs in again |
| F021 | 2026-10-17 | deep review | `CLAUDE.md` | The harness is described in six places, each a little differently | claimed | — |
| F022 | 2026-10-17 | deep review | `docs/plans/slice-1.md` | Promised and not done: gitleaks on each staged change, the gate run inside the sandbox, a dependency audit | reproduced | No gitleaks in `.githooks/pre-commit`; no audit step in `scripts/check.sh` |
| F023 | 2026-10-17 | deep review | Claude Code's docs | "Hooks are best-effort" | rejected | The docs never say so; they say a crashed or timed-out hook lets the call proceed, which `onFailure: block` covers (`c1450c8`) |
| F024 | 2026-10-17 | deep review | Claude Code's docs | Moving the hooks into `.claude/hooks/` protects them | rejected | In bypass mode, edits there are allowed; only ask rules hold in every mode, so they carry the protection |
