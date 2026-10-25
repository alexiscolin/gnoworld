---
paths:
  - "app/**"
  - "admin/**"
  - "packages/**"
  - "server/**"
---

# TypeScript and React

Check, in a change and in a review:
- promises that are not awaited;
- `as` on outside data (Zod first);
- effect dependencies, and stale closures;
- a new dependency (ask first);
- a helper that already exists: search the repo for its name and its shape before writing
  one; a second way to do the same thing is a finding;
- a loop's cost in big O: a lookup inside a loop goes through a Map or Set when its input
  can grow; a heavier cost kept on purpose says its ceiling in a `ponytail:` comment;
- a `catch` that cannot act (retry, fall back, show the error) has no reason to exist: let
  the error rise, rethrow with `{ cause }`, never log and carry on; boundaries return a
  result;
- every listener, timer, socket and subscription has its teardown (`AbortSignal`);
- a refactor is its own commit, and changes no test;
- a guard that matters (a schema, a pattern, a check) lives in the function that uses it, not at a
  module's top: StrykerJS ignores what runs outside a test (`ignoreStatic`, F412);
- comments say only what the code cannot (a constraint, a surprise, a reason): a file's
  header 6 lines at most, any other comment 3; no TODO, banner, numbered steps or emoji
  (`scripts/check_comments.mjs`).
