// `/market`, `/trending` and `/proposals` in the composer: each sends the card's line (core's cardLine.ts), which every page that
// reads the room draws as the card. A direct message has no room for them, so there they are unknown commands.
import { cardText, compose, type CardLine, type Composed } from "@gnoworld/core";
import { MARKET_SYMBOLS } from "@gnoworld/schemas";

/** The card commands the composer completes in a room. */
export const CARD_COMMANDS: readonly string[] = ["/market", "/trending", "/proposals"];

/** What a draft asks of the cards: the line to send, or why it is not a command it knows; none when it is no card command. */
export type CardAsked = { ok: true; text: string } | { ok: false; why: string };

export function cardAsked(draft: string): CardAsked | undefined {
  const [word, ...args] = draft.trim().split(/\s+/u);
  const command = word?.toLowerCase();
  if (command === undefined || !CARD_COMMANDS.includes(command)) return undefined;
  if (command !== "/market") {
    const card: CardLine = { kind: command === "/trending" ? "trending" : "proposals" };
    return args.length === 0
      ? { ok: true, text: cardText(card) }
      : { ok: false, why: `${command} takes nothing more.` };
  }
  const symbols = args.map((arg) => arg.toUpperCase());
  const known = symbols.every((symbol) => MARKET_SYMBOLS.some((each) => each === symbol));
  if (symbols.length > 1 || !known) return { ok: false, why: "/market takes one token: gnot, atone or btc." };
  return { ok: true, text: cardText({ kind: "market", ...(symbols[0] === undefined ? {} : { symbol: symbols[0] }) }) };
}

/** The Market chart quick action's line, composed as a typed one is. */
export const marketLine = (room: string, nick: string): Composed => compose(room, cardText({ kind: "market" }), nick);
