---
description: The dream, at a slice's end or at night — the read-only dreamer agent over the slice's evidence proposes rule and memory changes, each with its evidence; Alexis accepts each, reading every memory's full text first.
argument-hint: "<slice number> [the slice's shared folder, if not .claude/tmp/slice-<n>]"
---

Run the dream over slice $ARGUMENTS (Alexis, 2026-10-28, `docs/decisions.md`). It changes nothing by itself: it proposes,
Alexis decides, then Claude applies what he accepted.

1. **Keep the memory as it is.** Copy every file of this project's memory folder (the one MEMORY.md is in) to
   `.claude/tmp/dream/<today>/memory/`, so any change below can be undone.
2. **Read, never write.** Launch the `dreamer` agent (`.claude/agents/dreamer.md`: Read, Grep and Glob alone) with these
   inputs and nothing else, never a transcript: the slice's shared folder (by default `.claude/tmp/slice-<n>/`: its
   `learnings.md`, the branches' state files, `reports/`; for slice 4, `.claude/tmp/handoff-slice5/slice4-reports/`), the
   slice's rows of `docs/review-log.md` and `docs/review/findings.md`, `docs/decisions.md`'s rows of the slice, the slice's
   handoff (`.claude/tmp/handoff-slice<n+1>/HANDOFF.md`), `CLAUDE.md`, `.claude/rules/`, the memory files.
3. **Put it to Alexis**, in French, as a numbered list: one line each, its evidence and prevalence, and the recommendation
   (accept, change, drop). Save the agent's table to `.claude/tmp/dream/<today>/proposals.md`. A proposal whose evidence is
   only a `.claude/tmp/` line, not a committed row, is marked so (security review of slice-5-loop, 4).
4. **Apply what he accepts,** each in its own place:
   - a memory: show him its full text, as a diff against the copy of step 1, and write it once he has read it; one file
     each, and MEMORY.md's index line;
   - a rule, a test or a check: on a branch of its own, test first for a check, through `/pre-merge` and `merge.sh` like any
     harness change;
   - a decision: a row of `docs/decisions.md`, with its reason.
5. **Measure the dream itself** in `docs/review-log.md`: its tokens, proposals made, accepted, and those that later
   prevented a finding (the next slice's dream reads them).
