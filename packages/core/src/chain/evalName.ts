// Tier 1 (docs/REVIEW.md). The one widening of the `vm/qeval` builder (slice 7, 7c): the name registered for an address. It lives
// here so the app and the server build it from one function; app/src/lib/chain/evalCall.ts re-exports it beside its own builder.

/** A gno address: `g1` and 38 characters of bech32's alphabet, lower case (no b, i, o or 1), 40 in all. The checksum is not
 * checked: the pattern alone decides what may enter an expression. */
export function isAddress(address: string): boolean {
  return /^g1[023456789acdefghjklmnpqrstuvwxyz]{38}$/.test(address);
}

/** The data `vm/qeval` is asked for the name of one address, composed here and never from a path, or null. */
export function evalNameOf(address: string): string | null {
  return isAddress(address) ? `gno.land/r/sys/users.ResolveAddress(address("${address}")).Name()` : null;
}
