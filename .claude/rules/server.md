---
paths:
  - "server/**"
---

# The server (Node)

Check, in a change and in a review:
- work that blocks the event loop;
- a promise left floating, or a rejection swallowed;
- an outbound call without a timeout;
- a map, a queue or a cache without a bound;
- authorization checked before any work;
- a clean stop on `SIGTERM`.
