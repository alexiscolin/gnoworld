# Review log

One entry per review: what Alexis caught, what was missed, and why. The point is to see,
over a few slices, where the eye is sharp and where it does not look.

| Date | Review | Caught | Missed | Why missed | False alarms |
|---|---|---|---|---|---|
| 2026-10-17 | slice-1a, /pre-merge: 5 reviewers, 4 Opus verifications | 30 findings, 28 reproduced (F032-F061); Alexis's /code-review caught F028, F029 | Alexis had not read the diff in revdiff yet: blind-first not done for this merge | The slice grew to 8,456 lines, far past the 400 a review reads well | 2 refuted (F055, part of F060), 2 lowered (F058, F059) |
| 2026-10-17 | slice-1-ci, /pre-merge: code review, security review, green pass | 11 findings, all reproduced and fixed (F066-F076); the second security review found that the git hooks run the gate with Alexis's access at his push, so the six-file ask set was short (F076); the green pass found the CI's checks let 14 of 15 broken workflows through (F071); harness_mutate then caught a check of mine that missed `- if:` | Alexis's /code-review found F074 and F075 | The first security review checked what runs outside the sandbox in Claude's session, not in Alexis's shell | None; the code review's IRC host remark became a test comment |

## The harness, measured

Verified findings in the harness itself per `/pre-merge` (docs/REVIEW.md, "AI review before a
merge", item 7). Falling means solid; flat over three merges means simplify, not extend.

| Date | Branch | Harness lines read | Verified findings in the harness | Of them blocking |
|---|---|---|---|---|
| 2026-10-17 | slice-1a | 2,597 | 13 (F032-F044) | 5 (F038 high; F037, F041, F042, F043 medium) |
| 2026-10-17 | slice-1-ci | 200 | 11 (F066-F076) | 3 (F067, F068, F076 medium) |
