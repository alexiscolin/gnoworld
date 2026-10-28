# Slice 5, its first branch: the clean-up

Alexis, 2026-10-28 (`docs/decisions.md`, "Slice 5 opens with a clean-up"). Branch `slice-5-cleanup`, before any
feature of slice 5. No product code.

## Done when

1. No rule, doc, agent or command describes a way of working slice 4 ended: fork agents, per-branch owed red passes
   (`Red-pass: none`), separate review lenses (`/simplify`, `/code-review`, `/security-review` and the
   `complexity-reviewer` side by side), `core`'s pairing (`test.fails` for Alexis), old agent caps, stale budgets.
2. `CLAUDE.md`, `docs/REVIEW.md`, `docs/HARNESS.md`, `docs/DEVELOPMENT.md` and `/pre-merge` describe slice 5's way
   (`docs/decisions.md`, 2026-10-28, "From slice 5"): a chief session per slice, a session per branch in its own
   worktree, a Workflow loop per branch, one combined review, a dream per slice. HARNESS.md says what runs, not
   its history: dated measures and finding stories stay in the ledger, the review log and the decisions.
3. One combined `reviewer` agent replaces the `complexity-reviewer` and the `test-auditor`'s green pass; the
   `test-auditor` keeps the red pass.
4. One picture of how the AI works (sessions, Workflow loops, agents, the gates, reviews, the dream, Alexis's
   approvals), `docs/harness.png` rendered from `docs/harness.html`, linked from CLAUDE.md.
5. The harness edits moved out of slice 4 are in: records.sh's list (the pictures spec in, the deleted toolchain files
   out) with harness_mutate's mutants for the spec; `/pre-merge` reads `.claude/tmp/unsteady.log`.
6. One script gives a worktree its packages (F2127): `scripts/worktree.sh`, for the chief and every agent; probe.py
   never deletes through a linked `.bin`, a test_hooks case planting one.
7. harness_mutate's controls run in small groups, each within its 600 s limit (F2138).
8. Each branch's merge asks Alexis for `deploy/test.sh` once, in the background, not only a branch that changes
   `deploy/` (F2133-F2136: an app change broke the web image, found days later). Its static checks are not moved
   into the gate: none of the four bugs was static (an image's build, a burst, a variable's order, a renamed nick).
9. `.fails` is refused in every test, core's too: no pairing is left (no `test.fails` in the repository).
10. F1907's ledger row, left on `slice-4d-dm-bar`, reaches main.

## Out of scope

F2126 (check_migrations in the fast gate): `--merge` runs it, and a staged copy has no repository to read main's list
from. The Workflow script per branch and the first dream over slice 4: the next steps, once this branch is merged (the
script needs the agents this branch writes). Slice 5's features (the phone drawer U3, the page shell U5).

## Threat model

Assets: the harness itself (what refuses a bad commit or push). A doc change cannot weaken a check; a script change
can. Each guard changed keeps its planted fault and its mutant (`probe.py`, `test_hooks.sh`, `harness_mutate.py`);
`check_docs.py` keeps naming every review agent. The security reviewer reads the harness diff.

## Tests, by level

Seen failing first, then red-passed once: `test_hooks.sh` cases for 6 (a `.bin` reached through a link is borrowed as a
folder of its own; a tool deleted in the copy survives where the link led) and 7 (two controls at once at most, each
still run); `probe.py`'s `pending.test.ts` refused in core and outside it (9).

## Files

Docs: `CLAUDE.md`, `docs/{HARNESS,REVIEW,DEVELOPMENT}.md`, `docs/harness.{html,png}`, `docs/review/findings.md`.
Harness (tier 1 for review): `.claude/agents/*`, `.claude/commands/*`, `.claude/rules/core.md`, `.githooks/records.sh`,
`scripts/{check_docs.py,harness_mutate.py,probe.py,test_hooks.sh,borrow_node_modules.sh}`, `eslint.config.ts` and
`lint/shared.config.ts` (the pairing exception goes), `docs/plans/slice-5-cleanup.md`.
