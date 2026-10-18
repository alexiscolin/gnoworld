# Review log

One entry per review: what Alexis caught, what was missed, and why. The point is to see,
over a few slices, where the eye is sharp and where it does not look.

| Date | Review | Caught | Missed | Why missed | False alarms |
|---|---|---|---|---|---|
| 2026-10-17 | slice-1a, /pre-merge: 5 reviewers, 4 Opus verifications | 30 findings, 28 reproduced (F032-F061); Alexis's /code-review caught F028, F029 | Alexis had not read the diff in revdiff yet: blind-first not done for this merge | The slice grew to 8,456 lines, far past the 400 a review reads well | 2 refuted (F055, part of F060), 2 lowered (F058, F059) |
| 2026-10-17 | slice-1-ci, /pre-merge: code review, security review, green pass | 11 findings, all reproduced and fixed (F066-F076); the second security review found that the git hooks run the gate with Alexis's access at his push, so the six-file ask set was short (F076); the green pass found the CI's checks let 14 of 15 broken workflows through (F071); harness_mutate then caught a check of mine that missed `- if:` | Alexis's /code-review found F074 and F075 | The first security review checked what runs outside the sandbox in Claude's session, not in Alexis's shell | None; the code review's IRC host remark became a test comment |
| 2026-10-18 | slice-1b, /pre-merge: test-auditor (red and green), security review, Alexis's /code-review, a code review (stopped after 35 min, its findings asked for), /simplify (4 angles), 5 Opus verifications, the full gate | 35 findings (F077-F111): 31 fixed, 1 rejected (F110, Vitest's defaults), 1 claimed (F109), 2 left for Alexis's files (F104, F107); the verifier confirmed all 5 security findings (F087-F090 and the private scan), downgrading two to medium; the full gate caught F111, which the pre-commit's staged copy cannot see | Alexis caught F085 (a test beside no file of its name) and asked for the end of permission prompts | F085: no rule held the naming; it does now. F111: a deny rule was not checked against the gate's own writes | F110 (Vitest's default excludes are empty); the stopped review's time |
| 2026-10-18 | slice-1b, round 3: /simplify (4 angles), Alexis's /code-review, 1 Opus verification of its 13 findings, Alexis's revdiff on worlds.ts, the full gate three times | 16 findings (F112-F127): 14 fixed, F119 kept with a comment, F122 asked (the system's git in `prepare`). The full gate caught F126 (prove_fix knew no journey) and harness_mutate F127 (a hook case's variable leaked, three cases proved nothing). Alexis's revdiff asked how a slug stays unique and fit for a URL: tested, but nothing in worlds.ts said where | F113, F116, F117, F120, F124 sat in round 2's own fixes (F089, F090), which only the gate and the mutants re-checked; F127 came from round 3's /simplify refactor | A fix of a guard was tested for what it refuses, not for its bypasses (an allow comment, a command that fails); two rounds in a row, so a rule is proposed: a guard's test plants its bypasses too | 0 refuted; 3 partly right (F115, F122, F124) |

## The harness, measured

Verified findings in the harness itself per `/pre-merge` (docs/REVIEW.md, "AI review before a
merge", item 7). Falling means solid; flat over three merges means simplify, not extend.

| Date | Branch | Harness lines read | Verified findings in the harness | Of them blocking |
|---|---|---|---|---|
| 2026-10-17 | slice-1a | 2,597 | 13 (F032-F044) | 5 (F038 high; F037, F041, F042, F043 medium) |
| 2026-10-17 | slice-1-ci | 200 | 11 (F066-F076) | 3 (F067, F068, F076 medium) |
| 2026-10-18 | slice-1b | 605 | 22 (F077-F079, F081-F090, F097-F104, F111) | 5 (F087, F088, F089, F090, F111 medium) |
| 2026-10-18 | slice-1b, round 3 | 203 | 14 (F112-F118, F120, F122-F127) | 0 |
