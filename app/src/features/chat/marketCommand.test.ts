import { describe, expect, it } from "vitest";
import { marketAsked } from "./marketCommand.ts";
import { rangeOf } from "./marketFormat.ts";
import { suggestions } from "./composer/suggest.ts";

describe("/market in a draft", () => {
  it("asks the whole card, whatever the case and the spaces around", () => {
    expect(marketAsked("/market")).toEqual({ ok: true, symbols: [] });
    expect(marketAsked("  /MARKET  ")).toEqual({ ok: true, symbols: [] });
  });

  it("asks one token, whatever its case", () => {
    expect(marketAsked("/market gnot")).toEqual({ ok: true, symbols: ["GNOT"] });
    expect(marketAsked("/market Atone")).toEqual({ ok: true, symbols: ["ATONE"] });
    expect(marketAsked("/market BTC")).toEqual({ ok: true, symbols: ["BTC"] });
  });

  it("refuses an unknown token and more than one, saying which tokens there are", () => {
    for (const draft of ["/market eth", "/market gnot btc"]) {
      const asked = marketAsked(draft);
      expect(asked).toMatchObject({ ok: false });
      expect(asked && !asked.ok && asked.why).toMatch(/gnot, atone or btc/i);
    }
  });

  it("is none for another command, another word or a word glued to it", () => {
    expect(marketAsked("/marketing")).toBeUndefined();
    expect(marketAsked("market")).toBeUndefined();
    expect(marketAsked("hello /market")).toBeUndefined();
    expect(marketAsked("//market")).toBeUndefined();
  });
});

describe("the compact row's range", () => {
  it("writes the low and the high of the day as the card writes a price", () => {
    expect(rangeOf([1.3, 1.1, 1.2345])).toBe("Low 1.10 · High 1.30");
    expect(rangeOf([0.0578, 0.0615])).toBe("Low 0.0578 · High 0.0615");
  });
});

describe("the composer's suggestion of /market", () => {
  it("says what it does, and is offered as the letters narrow", () => {
    const choices = { commands: ["/me", "/poll", "/market"], rooms: [], people: [] };
    expect(suggestions("/ma", choices)).toEqual([
      { value: "/market", label: "/market", hint: "Show the prices here: /market gnot, atone or btc" },
    ]);
  });
});
