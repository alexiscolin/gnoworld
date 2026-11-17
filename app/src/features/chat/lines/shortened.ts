// A quote's mentions, shortened as a line shows them, apart from names.ts: reading a message's Markdown is a line's
// view's, never the first screen's (ADR-0001 §12).
import { markdown, mentions } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { shortAddress } from "../rooms/names.ts";

/** A message's text with each mention of an address `known` shortened as a line shows it: a quote cuts these
 * words, never an address in the middle. */
export function shortened(text: string, known: (address: string) => boolean): string {
  return mentions(markdown(text))
    .filter((address) => Address.safeParse(address).success && known(address))
    .reduce((out, address) => out.replaceAll(`@${address}`, `@${shortAddress(address)}`), text);
}
