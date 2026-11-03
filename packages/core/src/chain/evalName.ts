// Tier 1 (docs/REVIEW.md). The one widening of the `vm/qeval` builder (slice 7, 7c): the name registered for an address. It lives
// here so the app and the server build it from one function; app/src/lib/chain/evalCall.ts re-exports it beside its own builder.

/** bech32's alphabet, lower case: no b, i, o or 1. */
const BECH32 = "023456789acdefghjklmnpqrstuvwxyz";

/** A gno address: `g1` and 38 characters of bech32's alphabet, 40 in all. The checksum is not checked: the pattern alone decides
 * what may enter an expression. */
export function isAddress(address: string): boolean {
  return new RegExp(`^g1[${BECH32}]{38}$`).test(address);
}

/** Whether `text` holds an address or its look, a short or a split one too: `g1` and 8 or more of bech32's letters in a row, whatever
 * the case. Shown text refuses it; it decides nothing that reaches a chain. */
export function looksLikeAddress(text: string): boolean {
  return new RegExp(`g1[${BECH32}]{8,}`, "i").test(text);
}

/** The data `vm/qeval` is asked for the name of one address, composed here and never from a path, or null. */
export function evalNameOf(address: string): string | null {
  return isAddress(address) ? `gno.land/r/sys/users.ResolveAddress(address("${address}")).Name()` : null;
}
