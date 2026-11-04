---
paths:
  - "server/**"
  - "jarvis/**"
  - "packages/service/**"
---

# The server (Node)

Check, in a change and in a review:
- work that blocks the event loop;
- a promise left floating, or a rejection swallowed;
- an outbound call without a timeout;
- a map, a queue or a cache without a bound;
- authorization checked before any work;
- a clean stop on `SIGTERM`.
- in the login (tier 1): a nonce or ticket spent by one statement before any `await`, the verifier
  given the signer, the chain and the stored text, a secret kept as its hash only, and on every
  POST a listed `Origin` and JSON (docs/ARCHITECTURE.md, "Security: the checklist").
