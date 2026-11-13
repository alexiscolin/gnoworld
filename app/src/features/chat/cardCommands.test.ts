import { describe, expect, it } from "vitest";
import { cardAsked } from "./cardCommands.ts";
import { rangeOf } from "./marketFormat.ts";
import { suggestions } from "./composer/suggest.ts";

describe("a card command in a draft", () => {
  it("asks the line of each card, whatever the case and the spaces around", () => {
    expect(cardAsked("  /MARKET  ")).toEqual({ ok: true, text: "💹 Market prices" });
    expect(cardAsked("/trending")).toEqual({ ok: true, text: "📈 Most called worlds this week" });
    expect(cardAsked("/Proposals")).toEqual({ ok: true, text: "🏛️ GovDAO proposals" });
  });

  it("asks one market token, whatever its case", () => {
    expect(cardAsked("/market gnot")).toEqual({ ok: true, text: "💹 Market prices GNOT" });
    expect(cardAsked("/market Atone")).toEqual({ ok: true, text: "💹 Market prices ATONE" });
  });

  it("refuses an unknown token, more than one, and a word after /trending", () => {
    for (const draft of ["/market eth", "/market gnot btc"])
      expect(cardAsked(draft)).toEqual({ ok: false, why: "/market takes one token: gnot, atone or btc." });
    expect(cardAsked("/trending now")).toMatchObject({ ok: false });
  });

  it("is none for another command, another word or a word glued to it", () => {
    for (const draft of ["/marketing", "market", "hello /market", "//market", "/trendings"])
      expect(cardAsked(draft)).toBeUndefined();
  });
});

describe("the compact row's range", () => {
  it("writes the low and the high of the day as the card writes a price", () => {
    expect(rangeOf([1.3, 1.1, 1.2345])).toBe("Low 1.10 · High 1.30");
    expect(rangeOf([0.0578, 0.0615])).toBe("Low 0.0578 · High 0.0615");
  });
});

describe("the composer's suggestions of the card commands", () => {
  it("say what each does, and are offered as the letters narrow", () => {
    const choices = { commands: ["/me", "/market", "/trending", "/proposals"], rooms: [], people: [] };
    expect(suggestions("/tr", choices)).toEqual([
      { value: "/trending", label: "/trending", hint: "Show the most called worlds this week" },
    ]);
    expect(suggestions("/pr", choices)[0]?.hint).toMatch(/GovDAO/);
  });
});
