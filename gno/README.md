# gno

The on-chain side of gnoworld: the realms written in gno.

## What is in it

- `r/satellite/`: the satellite realm. A world's satellite is a short text in space that anyone can
  rent for a few days by paying. The owner or its operator can take a satellite down after a
  report, and the days not yet begun are refunded. The folder holds `satellite.gno` (renting,
  closing, takedown), `owner.gno` (price, operator, pause, ownership, withdrawal), `render.gno`
  (the realm's page) and the tests.
- `gnowork.toml`: the workspace file.

## Test

The realm's tests and lint need a gno toolchain that matches the chain. How to build one is in
[docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md), "Toolchain". From the repository root,
`./scripts/check.sh` runs `gno lint ./...` and `gno test ./...` in this folder when a change
touches it.

Reading, writing or deploying on a chain goes through gnomcp, not through `gnokey` or raw RPC.

## Rules

- [.claude/rules/gno.md](../.claude/rules/gno.md): realms are held to the strictest review tier
  ([docs/REVIEW.md](../docs/REVIEW.md)).
- A change to a realm's storage layout is a migration, not an edit.
- See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for how the realms fit the rest.
