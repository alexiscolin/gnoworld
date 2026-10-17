---
description: Turn a backlog slice into its plan in docs/plans/, before any code. Writes the plan and stops.
argument-hint: "<slice number>"
---

Write `docs/plans/slice-$ARGUMENTS.md` from the slice's row in `docs/plans/backlog.md`, and
the ADR sections it names. Read only what the slice touches. At most 80 lines, in this order:

1. **Done when:** the row's acceptance tests, word for word, then any the plan adds.
2. **Out of scope:** what a reader might expect here and what goes later.
3. **Threat model** (ADR-0002 §9): assets, entry points, who could abuse it and how, each
   mitigation and the test that proves it.
4. **Cost:** every hot path it adds, and its bench budget.
5. **Scale:** the limit it hits first, and the next step.
6. **Tests, by level** (ADR-0002 §9's table): which rows apply, the failing tests to write
   first, and what is marked `test.fails` for Alexis (`.claude/rules/core.md`).
7. **Files:** what it creates or changes; the tier-1 files (`docs/REVIEW.md`); the parts
   Alexis writes.
8. **Dependencies to ask for,** each with its version and date read on npm today.
9. **Questions for Alexis.**

Then stop: Alexis approves the plan before any code.
