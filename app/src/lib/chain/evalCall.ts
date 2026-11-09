// Tier 1 (docs/REVIEW.md). One of the two places a `vm/qeval` expression is built (the other, a name for an address, is
// packages/core/src/chain/evalName.ts; the server's door has its own, D92). The chain runs ANY expression it is sent, so the
// defence is here: one `<realm>.<Name>(<literals>)`, its arguments written by core's readArgs alone (D13301), one of r/sys/users's
// two calls on a proved address (D283), or nothing. Each pattern is built inside its function (typescript.md, F412). The path and
// name rules are core's (chain/realmPath.ts), re-exported here.
import { isExportedName, isRealmPath, readArgs, type Param } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";

export { evalNameOf, isAddress, isExportedName, isRealmPath } from "@gnoworld/core";

/** A read's parameters (vm/qfuncs's) and the texts typed for them, in order; none for a read that takes nothing. */
export interface Read {
  params?: readonly Param[] | null | undefined;
  texts?: readonly string[] | undefined;
}

/** The data `vm/qeval` is asked: one exported name's call in one realm, its texts as readArgs's literals, or null (gno cuts it at the
 * first dot after the first slash, handler.go:289). Null too for what readArgs refuses, a count of texts unlike the parameters' (a
 * caller's bug, a failure rather than a throw), or past 3,072 UTF-8 bytes: its hex travels in a GET's address. */
export function evalCall(realm: string, name: string, read: Read = {}): string | null {
  const { params = [], texts = [] } = read;
  if (!isRealmPath(realm) || !isExportedName(name) || (params ?? []).length !== texts.length) return null;
  const written = readArgs(params, texts);
  if (!written.ok) return null;
  const call = `${realm}.${name}(${written.literals.join(", ")})`;
  return new TextEncoder().encode(call).length <= 3072 ? call : null;
}

/** The data `vm/qeval` is asked for one of r/sys/users's two calls on the record of `account`, or null: the address goes in only
 * once the schema proved it, and `call` picks one of two whole strings, whatever it holds at run time. */
export function userCall(account: string, call: "IsDeleted" | "Name"): string | null {
  const proved = Address.safeParse(account);
  if (!proved.success) return null;
  return `gno.land/r/sys/users.ResolveAddress("${proved.data}").${call === "Name" ? "Name()" : "IsDeleted()"}`;
}
