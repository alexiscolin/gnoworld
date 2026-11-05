// Tier 1 (docs/REVIEW.md). The only place a `vm/qeval` expression is built. The chain runs ANY expression it is sent, so the
// defence is here: one `<realm>.<Name>()`, one of r/sys/users's two calls on a proved address (D283), or nothing. Each pattern is
// built inside its function (typescript.md, F412).
import { Address } from "@gnoworld/schemas";

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

/** The data `vm/qeval` is asked: the call of one exported name in one realm, or null. gno cuts it at the first dot after the
 * first slash (handler.go:289), which is why a realm path may hold no dot past its domain. */
export function evalCall(realm: string, name: string): string | null {
  return isRealmPath(realm) && isExportedName(name) ? `${realm}.${name}()` : null;
}

/** The data `vm/qeval` is asked for one of r/sys/users's two calls on the record of `account`, or null: the address goes in only
 * once the schema proved it, and `call` picks one of two whole strings, whatever it holds at run time. */
export function userCall(account: string, call: "IsDeleted" | "Name"): string | null {
  const proved = Address.safeParse(account);
  if (!proved.success) return null;
  return `gno.land/r/sys/users.ResolveAddress("${proved.data}").${call === "Name" ? "Name()" : "IsDeleted()"}`;
}
