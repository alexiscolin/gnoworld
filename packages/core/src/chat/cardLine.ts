// A card in a room: `/market`, `/trending` and `/proposals` send a line any IRC client reads as plain words, a mark then a short
// sentence, as a poll does (poll.ts); every page that reads the room draws it as the card and reads the card's data itself.
export type CardLine = { kind: "market"; symbol?: string } | { kind: "trending" } | { kind: "proposals" };

const MARKET = "💹 Market prices";
const TRENDING = "📈 Most called worlds this week";
const PROPOSALS = "🏛️ GovDAO proposals";
const SYMBOL = /^[A-Z0-9]{1,10}$/u;

/** The text a card sends. */
export function cardText(card: CardLine): string {
  if (card.kind === "trending") return TRENDING;
  if (card.kind === "proposals") return PROPOSALS;
  return card.symbol === undefined ? MARKET : `${MARKET} ${card.symbol}`;
}

/** The card a line's text is, or none: the words alone, nothing before or after them. */
export function cardOf(text: string): CardLine | undefined {
  if (text === TRENDING) return { kind: "trending" };
  if (text === PROPOSALS) return { kind: "proposals" };
  if (text === MARKET) return { kind: "market" };
  const symbol = text.startsWith(`${MARKET} `) ? text.slice(MARKET.length + 1) : "";
  return SYMBOL.test(symbol) ? { kind: "market", symbol } : undefined;
}
