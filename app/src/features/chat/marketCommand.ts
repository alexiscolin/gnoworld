// `/market` in the composer (D13997's card, asked by a word): the whole card, or one token's. The card is the reader's alone, added where
// the quick action adds it (jarvisHere.ts), never a second way.
import { MARKET_SYMBOLS } from "@gnoworld/schemas";
import { addJarvisItem } from "../../jarvisHere.ts";

/** The command, which a direct message has not: its cards need a room (QuickActions.tsx). */
export const MARKET = "/market";

/** What a draft asks of the market card: its tokens (none is all of them), or why it is not a command it knows; none when it is no `/market`. */
export type MarketAsked = { ok: true; symbols: readonly string[] } | { ok: false; why: string };

export function marketAsked(draft: string): MarketAsked | undefined {
  const [word, ...args] = draft.trim().split(/\s+/u);
  if (word?.toLowerCase() !== MARKET) return undefined;
  const symbols = args.map((arg) => arg.toUpperCase());
  const known = symbols.every((symbol) => MARKET_SYMBOLS.some((each) => each === symbol));
  if (symbols.length > 1 || !known) return { ok: false, why: "/market takes one token: gnot, atone or btc." };
  return { ok: true, symbols };
}

/** Adds the market card to `room` for `account`, with `symbols` alone when there are some; true, as a line that went. */
export const addMarketCard = (room: string, account: string | undefined, symbols: readonly string[] = []): true => {
  addJarvisItem({ room, account, market: true, ...(symbols.length > 0 ? { symbols } : {}) });
  return true;
};
