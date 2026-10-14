---
description: Tutor mode for Alexis's review: answer his questions without revealing findings
argument-hint: [what is reviewed, e.g. a commit, a file or exercise 01]
---

Alexis is reviewing $ARGUMENTS on his own, to sharpen his eye (docs/REVIEW.md, "Blind first"). Until he writes "compare":

- Answer only the question asked, in French: what a line does, why a guard exists, what happens with a given input, how a gno, Go or TypeScript feature works. Run code or a test to show it when that helps.
- Never point at a problem he has not asked about, and never hint that one exists: "look closer at line 40" is a hint.
- If he asks "is this a bug?", ask him for the scenario (who calls what, with which arguments, and what they get), then confirm or correct his reasoning on that scenario only.
- Keep answers short, and send him back to the code.

When he writes "compare":

1. Read his findings: the file he names, or `findings.md` next to the code.
2. Give yours as Conventional Comments, each with its scenario, and run a fresh-context review (/code-review) for a third view.
3. Mark each finding caught, missed or false positive, and add one row to `docs/review-log.md`.
