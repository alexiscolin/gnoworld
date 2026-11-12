// The words of the chain a page draws (slice 9g), the second wall after the stream's schemas: text and nothing else, an address by its two ends.

import { shortAddress } from "@gnoworld/schemas";

// Format characters (bidi overrides among them) and controls out.
const stripped = (text: string): string => text.replace(/[\p{Cf}\p{Cc}]/gu, "");

// Stripped, `max` characters at most, never a lone half of a surrogate pair.
export const cut = (text: string, max: number): string => stripped(text).slice(0, max).toWellFormed();

// Stripped, 64 characters at most.
export const plain = (text: string): string => cut(text, 64);

// An address by its two ends: never the whole of it, which a reader could take for a name.
export const short = (address: string): string => {
  const text = plain(address);
  return text.length <= 12 ? text : shortAddress(text);
};

const withCommas = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** An amount of `decimals` places as the reader writes it: grouped, its fraction without trailing zeros. */
export function amountText(amount: string, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const value = BigInt(amount);
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return withCommas((value / base).toString()) + (fraction === "" ? "" : `.${fraction}`);
}
