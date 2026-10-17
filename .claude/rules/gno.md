---
paths:
  - "r/**"
  - "p/**"
---

# Realms (gno), tier 1

Load the gno skill before writing or reviewing a realm. Check, in a change and in a review:
- caller identity: `cur.Previous()`, never `OriginCaller` for authority;
- panic versus error, since an error does not revert;
- storage per object;
- escaping in `Render`;
- cross-realm calls;
- a new entry in `GAPS` (`scripts/mutate.py`), which needs its reason.
