import { describe, expect, it } from "vitest";
import { cardOf, cardText, type CardLine } from "./cardLine.ts";

describe("a card's line", () => {
  it("is read back as the card that was sent, each one", () => {
    const cards: CardLine[] = [
      { kind: "market" },
      { kind: "market", symbol: "GNOT" },
      { kind: "trending" },
      { kind: "proposals" },
    ];
    for (const card of cards) expect(cardOf(cardText(card))).toEqual(card);
  });

  it("is plain words after a mark", () => {
    expect(cardText({ kind: "trending" })).toBe("📈 Most called worlds this week");
  });

  it("is none for another line, a word added or a lowercase token", () => {
    for (const text of [
      "",
      "hello",
      "📈 Most called worlds this week!",
      "📈 Most called worlds this week\nmore",
      " 🏛️ GovDAO proposals",
      "💹 Market prices gnot",
      "💹 Market prices GNOT BTC",
      "💹 Market prices ",
    ])
      expect(cardOf(text)).toBeUndefined();
  });
});
