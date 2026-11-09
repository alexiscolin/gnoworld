// Tier 1 (docs/REVIEW.md). One of the two places a `vm/qeval` expression is built (the other, a name for an address, is
// packages/core/src/chain/evalName.ts; the server's door has its own, D92). The chain runs ANY expression it is sent, so the
// defence is here: one `<realm>.<Name>()`, one of r/sys/users's two calls on a proved address (D283), or nothing. Each pattern
// is built inside its function (typescript.md, F412). The path and name rules are core's (chain/realmPath.ts), re-exported here.
import { isExportedName, isRealmPath } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";

export { evalNameOf, isAddress, isExportedName, isRealmPath } from "@gnoworld/core";

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
