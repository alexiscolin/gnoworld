# F076: hooks that run no repository code

Status: proposed, 2026-10-18. The backlog's first harness item; it touches the hooks and the
permissions, so Alexis approves it before any code (CLAUDE.md, "Stop and ask").

## The problem

The gate runs in two places. In Claude Code's sandbox, it can harm nothing outside the
project. In Alexis's own shell, where `pre-commit`, `pre-merge-commit` and `pre-push` run it at
his commit, merge and push, it runs with all his access: `check.sh`, every script it calls,
every config and test it loads, `review_pass.py`, `scan_secrets.sh`. Claude may edit most of
those files, so a careless or injected edit runs outside the sandbox at Alexis's next push
(F076). The `Harness-changed:` declarations and the Edit denies only narrow it.

## The design

**Outside the sandbox, a hook runs only its own lines, git, and gitleaks.** It checks records
the sandboxed gate wrote; it runs no script, config or test of the repository.

| Hook | In the sandbox (`SANDBOX_RUNTIME` set): Claude's commits | In Alexis's shell |
|---|---|---|
| `commit-msg` | as today | as today: its own lines, gitleaks with the repository's two rule files (data, not code) |
| `pre-commit`, `pre-merge-commit` | as today: the fast gate on the staged copy | the staged tree's secret scan by gitleaks; the tree must be one the sandboxed gate passed (below) |
| `pre-push`, a work branch | as today | the pushed tree passed the fast gate; gitleaks over the history |
| `pre-push`, `main` | as today | the pushed tree passed the full gate; a review pass for it; each harness change declared |

**The records.** When `check.sh` passes on a clean tree, it appends that tree's hash
(`git rev-parse HEAD^{tree}`) to `.claude/tmp/green-fast` or, with `--full`, to
`.claude/tmp/green-full`. The hooks compare with `git rev-parse <commit>^{tree}`. The review
pass's fingerprint (the tree without the review's own files) is computed by the hook's own
lines, the way `review_pass.py` does, so the hook does not run that script.

**What a record proves, and what it does not.** Code in the sandbox can write a record without
running the gate. So a record proves nothing on its own: it moves the integrity check to the
CI, which runs the full gate again on GitHub's machines, with no secret and no access to this
Mac. The CI reports today and blocks once `main` is protected (the backlog's second item). Until
then, a forged record lets a broken tree reach `main` until the CI's red report; it cannot run
code on Alexis's machine.

## Tests first (`scripts/test_hooks.sh`, a section `outside`)

1. Each hook, run with no `SANDBOX_RUNTIME`, in a throwaway repository whose `check.sh`,
   `scan_secrets.sh`, `review_pass.py`, `vitest.config.ts` and a test each write a marker:
   no marker appears.
2. Outside the sandbox: `pre-push` refuses a work branch whose tree is not in `green-fast`, and
   `main` whose tree is not in `green-full` or has no review pass; it takes both once recorded.
3. `pre-merge-commit` refuses a merged tree the full gate never passed. A merge of a branch
   onto the `main` it left gives the branch's tree, which the full gate passed.
4. `check.sh` writes no record on a failure or on a dirty tree.
5. Each still refuses a secret, a home folder's path and an undeclared harness change.

`harness_mutate.py` gets a mutant for each new line of the hooks and of `check.sh`.

## Who does what

- Claude writes the tests and `check.sh`'s records, and writes the hooks' new text as a script.
- Alexis applies the hooks (Claude cannot edit them), then reviews.
- Once merged, the Edit denies that F068 and F087 added for files run outside the sandbox
  shrink to the hooks, the guard, the Stop hook and what pnpm loads: the other scripts and
  configs no longer run there. That change is Alexis's too (`settings.json`).

## What it removes

`check.sh`, `review_pass.py` and `scan_secrets.sh` runs from the hooks in Alexis's shell; the
need to deny Claude's edits of the other scripts and configs. What it adds: two record files
and about twenty lines of hook.

## Limits left

- The CI blocks nothing until `main` is protected.
- `pnpm install` and anything Alexis runs himself still run repository code with his access,
  by his choice.
