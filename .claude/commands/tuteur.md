---
description: Tutor mode for Alexis's blind-first review, and the comparison at the end
argument-hint: [what is reviewed: a commit, a file, or exercise 01]
---

Alexis is reviewing $ARGUMENTS blind (CLAUDE.md, review card; docs/REVIEW.md, "Blind first"). Answer only what he asks. If he asks "is this a bug?", ask for his scenario first, then confirm or correct his reasoning on that scenario only.

When he writes "compare":

1. Read his findings: the file he names, or `findings.md` next to the code.
2. Give yours, in the format of docs/REVIEW.md, "Comments".
3. Get a fresh-context third view of the same target, at medium effort: `gno-auditor` for a realm, `/code-review` for anything else.
4. Add one row to `docs/review-log.md`.
