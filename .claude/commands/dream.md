---
description: The dream, at a slice's end or at night — one read-only agent over the slice's reports, learnings, review log and ledger proposes rule and memory changes, each with its evidence; Alexis accepts each.
argument-hint: "<slice number>"
---

Run the dream over slice $ARGUMENTS (Alexis, 2026-10-28, `docs/decisions.md`). It changes nothing by itself: it proposes,
Alexis decides, then Claude applies what he accepted.

1. **Keep the memory as it is.** Copy every file of this project's memory folder (the one MEMORY.md is in) to
   `.claude/tmp/dream/<today>/memory/`, so any change below can be undone.
2. **Read, never write.** Launch one fresh agent, read-only, with these inputs and nothing else (never a transcript):
   the slice's shared folder (`.claude/tmp/slice-$ARGUMENTS/`: `learnings.md`, the branches' state files, `reports/`),
   the slice's rows of `docs/review-log.md` and `docs/review/findings.md`, `docs/decisions.md`'s rows of the slice, the
   slice's handoff, `CLAUDE.md`, `.claude/rules/`, the memory files. Ask it, steered by what matters most here (security,
   then cost and speed, then the rest), for one table of proposals, each:
   - the change: a rule (CLAUDE.md, `.claude/rules/`, an agent's brief), a memory (new, changed or removed), a test, a
     lint or a check, or a line of the harness to remove;
   - its evidence: the rows, reports or lines that show the need, with their ids;
   - its prevalence: how often it happened in the slice, and in earlier slices when the ledger says;
   - its cost: what it adds to every session or every gate run, so a rule that costs more than it saves is said so.
   A proposal seen once, with no harm done, is dropped unless it is a security one.
3. **Put it to Alexis**, in French, as a numbered list: one line each, its evidence and prevalence, and the
   recommendation (accept, change, drop). Save the agent's table to `.claude/tmp/dream/<today>/proposals.md`.
4. **Apply what he accepts,** each in its own place: a memory at once (one file each, MEMORY.md's index line); a rule,
   a test or a check on a branch of its own, test first for a check, through `/pre-merge` and `merge.sh` like any harness
   change. A decision goes to `docs/decisions.md` with its reason.
5. **Measure the dream itself** in `docs/review-log.md`: its tokens, proposals made, accepted, and those that later
   prevented a finding (the next slice's dream reads them).
