// Tier 1 (docs/REVIEW.md): gno's grammar for a realm's path and for a call's name, which app/src/lib/chain/evalCall.ts builds every
// `vm/qeval` from and re-exports. A module of its own: a route that checks a path (app/src/realmAt.ts) loads no builder with it, and
// neither the first screen nor the late chat pays for a builder's dependencies (budgets.spec.ts).

/** gno's grammar for a realm's path (mempackage.go:49-54,67-70,81-90 at v1.5.0), `_test` paths left out. */
export function isRealmPath(path: string): boolean {
  const word = "[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*";
  const realm = new RegExp(`^(?:[a-z0-9-]+\\.)+[a-z]{2,63}/r/${word}(?:/${word})*$`);
  return realm.test(path) && !path.endsWith("_test");
}

/** An exported Go identifier, narrowed to ASCII: qfuncs' own test looks at one byte, so `_helper` passes it (keeper.go:1782).
 * At most 128 characters: a realm's own list may hold a name of a megabyte, which would be a request of that size. */
export function isExportedName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_]{0,127}$/.test(name);
}
