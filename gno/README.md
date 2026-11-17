# gno

The on-chain side of gnoworld: the realms written in gno.

## What is in it

- `r/satellite/`: the satellite realm. A world's satellite is a short text in space that anyone can
  rent for a few days by paying. The owner or its operator can take a satellite down after a
  report, and the days not yet begun are refunded. The folder holds `satellite.gno` (renting,
  closing, takedown), `owner.gno` (price, operator, pause, ownership, withdrawal), `render.gno`
  (the realm's page) and the tests.
- `gnowork.toml`: the workspace file.

## Status

Nothing is deployed. The satellite realm is tested locally (`gno test`, its guards checked by mutation in the
gate). Its module path, `gno.land/r/gnoworld/satellite`, cannot be registered on onyx-1 or gnoland-1: the open
registrar, `r/sys/namereg/v0`, takes only names shaped `nym-<5 to 13 letters><3 digits>` and refuses a stem that
starts with `gno`, and any other name needs a GovDAO vote (read through gnomcp, 2026-11-17). The realm moves to
its deployer's address namespace, `gno.land/r/<address>/satellite/v0`, at its first deploy, with `self` and the
filetests' `PKGPATH` changed with it.

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
