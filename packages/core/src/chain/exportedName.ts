// Tier 1 (docs/REVIEW.md): gno's grammar for a call's name, which app/src/lib/chain/evalCall.ts checks before it builds a `vm/qeval`
// and args/help.ts before a page's `$help` link becomes an action. A realm's path is schemas' (`isRealmPath`), which core cannot import.

/** An exported Go identifier, narrowed to ASCII: qfuncs' own test looks at one byte, so `_helper` passes it (keeper.go:1782).
 * At most 128 characters: a realm's own list may hold a name of a megabyte, which would be a request of that size. */
export function isExportedName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_]{0,127}$/.test(name);
}
