import { describe, expect, it } from "vitest";
import { completed, completions, type Choices } from "./complete.ts";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const CHOICES: Choices = {
  commands: ["/me"],
  rooms: ["#games", "#bubble", "#gnogolf", "#news"],
  people: [ALICE, BOB],
};

describe("what the word being typed completes to", () => {
  it.each([
    ["/", ["/me"]],
    ["/M", ["/me"]],
    ["#g", ["#games", "#gnogolf"]],
    ["see #GN", ["#gnogolf"]],
    ["#", ["#games", "#bubble", "#gnogolf", "#news"]],
    ["hi @g10", [`@${ALICE}`]],
    ["@g1", [`@${ALICE}`, `@${BOB}`]],
  ])("offers, for %j, %j", (text, options) => {
    expect(completions(text, CHOICES)?.options).toStrictEqual(options);
  });

  it.each(["", "hello", "hello ", "/me ", "say /me", "#zz", "@g2", "a#g", "x@g1", "/me waves"])(
    "offers nothing for %j",
    (text) => {
      expect(completions(text, CHOICES)).toBeUndefined();
    },
  );

  it("offers five at most, in the order given, of those that match", () => {
    const rooms = ["#a1", "#a2", "#a3", "#a4", "#a5", "#a6"];
    expect(completions("#a", { ...CHOICES, rooms })?.options).toStrictEqual(rooms.slice(0, 5));
    expect(completions("#a", { ...CHOICES, rooms: ["#b1", "#b2", "#b3", "#b4", "#b5", "#a1"] })?.options).toStrictEqual(
      ["#a1"],
    );
  });

  it("offers a command after spaces alone, as compose reads it", () => {
    expect(completions("  /", CHOICES)?.options).toStrictEqual(["/me"]);
  });

  it("offers nothing that is already whole, in any case: the word is the only match", () => {
    expect(completions("#games", { ...CHOICES, rooms: ["#games"] })).toBeUndefined();
    expect(completions("#GAMES", { ...CHOICES, rooms: ["#games"] })).toBeUndefined();
    expect(completions("/me", CHOICES)).toBeUndefined();
    expect(completions("#gno", { ...CHOICES, rooms: ["#gno", "#gnogolf"] })?.options).toStrictEqual([
      "#gno",
      "#gnogolf",
    ]);
  });
});

describe("a completed draft", () => {
  it("replaces the word with the first option and a space, the caret after it", () => {
    const completion = completions("see #gno", CHOICES);
    expect(completion === undefined ? undefined : completed("see #gno", completion)).toStrictEqual({
      text: "see #gnogolf ",
      start: 13,
      end: 13,
    });
  });

  it("completes a mention to the whole address", () => {
    const completion = completions("hi @g1jg", CHOICES);
    expect(completion === undefined ? undefined : completed("hi @g1jg", completion).text).toBe(`hi @${BOB} `);
  });
});
