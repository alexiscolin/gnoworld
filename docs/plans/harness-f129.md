# F129: hooks no branch can bring

Status: built, 2026-10-18 (`7117336`). Alexis asked for it ("corrige ça"): the hooks run from a folder
outside the repository that only he updates. It touches the hooks and the permissions; his
script applies the files Claude cannot edit.

## The problem

Git runs the hooks from `.githooks/`, a folder of the working tree (`prepare` points git there).
From the sandbox, git's plumbing makes a commit that changes them, or the scripts they run,
without touching a file on disk. Alexis's merge writes that commit's files, then runs its
`pre-merge-commit` with his access (F129, reproduced). The same merge writes whatever else the
branch changed, among them what Claude Code runs outside the sandbox (`.claude/settings.json`,
`scripts/guard.py`, `scripts/stop_gate.sh`) and what pnpm runs at his install.

## The design

**The hooks live in `.git/hooks`.** No merge, checkout or pull writes there, and the sandbox
refuses a command that does (probed: `Operation not permitted` for `.git/hooks` and
`.git/config`). Claude's file tools are denied both too: in bypass mode they may otherwise
write `.git` (code.claude.com/docs/en/permissions, "Protected paths").

- `scripts/install_hooks.sh [<commit>]` copies the hooks of a commit, `main` by default, with
  the scripts they run (`records.sh`, `scan_secrets.sh`, `code_changed.sh`, gitleaks's two rule
  files and their ignore file, itself), into `.git/hooks`, and removes git's override of that
  folder. Alexis runs main's copy, never the working tree's:
  `git show main:scripts/install_hooks.sh | sh`. With `--check` it changes nothing and fails
  when `.git/hooks` does not hold exactly that commit's files. (Added at the red pass: it
  refuses a commit missing a hook, removes any other hook and any link there, removes every
  override, fails when one it cannot change remains, and turns off fast-forward merges, which
  run no hook.)
- The hooks run their scripts from their own folder (`$(dirname "$0")`), never from the working
  tree. In the sandbox, pre-commit still runs the staged gate, as before (F067).
- `prepare` goes: `pnpm install` would point git back at `.githooks`.
- pre-push wants, before `main` leaves, `.git/hooks` to hold that `main`'s hooks: a merge that
  changed them is installed before it is pushed, so what runs is what was reviewed.
- check.sh fails if git's hooks are elsewhere than `.git/hooks`, and, in the sandbox, if it can
  write there or to `.git/config`, or if the hooks are missing: the boundary stays proven.
- jscpd skips `.git`, where the installed hooks are copies of the repository's (found by the
  gate).

**A merge shows the harness first.** A merge writes the branch's files before any hook runs, so
the check comes before it. `merge.sh <branch>`, installed beside the hooks, shows every harness
file the branch changes, with the diff, and merges only once Alexis types the branch's name.
In his shell, pre-merge-commit refuses a merge that changes the harness and did not come
through merge.sh, and says to abort it. (Changed at the red pass: git writes `MERGE_HEAD` only
after pre-merge-commit, so merge.sh's mark is the commit it showed, and the hook checks that
merging it gives exactly the tree being committed.) What it shows is text, its control bytes
visible. The harness list, today written twice (check.sh and
pre-push), is defined once in `records.sh` and gains `.mcp.json`, whose servers Claude Code
starts.

## Tests first (`scripts/test_hooks.sh`, a section `installed`)

1. install_hooks.sh from a commit puts each hook and script there, executable, equal to the
   commit's, and removes the override; `--check` passes then, and fails on one file changed or
   missing.
2. A branch that plants a hook, `scan_secrets.sh`, `code_changed.sh`, `records.sh` and a
   gitleaks rule file that allows everything, merged through merge.sh in Alexis's shell: none
   of the planted code runs, and a staged secret is still refused.
3. merge.sh shows the changed harness files; a wrong name merges nothing; the right one merges;
   it refuses off `main` or with a dirty tree.
4. pre-merge-commit, outside: a merge changing the harness without merge.sh is refused, with
   merge.sh it passes (given its gate's record); a merge without harness changes passes; an
   empty or foreign mark is refused.
5. pre-push, outside, refuses `main` when `.git/hooks` differs from it, and passes once
   installed.
6. check.sh refuses git's override of the hooks folder.

`harness_mutate.py` gets a mutant for each new line.

## What it removes

`prepare`, the second copy of the harness list, and the hooks' runs of working-tree scripts.

## Limits left

- A merge made without merge.sh has written its files before pre-merge-commit refuses it;
  `git merge --abort` must follow at once, before Claude Code reads a planted setting.
- A checkout of Claude's branch in Alexis's shell writes its files unseen. Claude works in the
  same folder, so this is not needed; the review card names the harness files to read.
- `pnpm install` and anything Alexis runs himself still run repository code with his access.
- A fresh clone has no hooks until its owner runs the install.
