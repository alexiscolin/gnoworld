import { describe, expect, it } from "vitest";
import { fold, mentionList, mentionsOf } from "./fold.ts";

describe("fold", () => {
  it("drops marks and format characters, folds compatibility forms, lower-cases", () => {
    expect(fold("ÉA\u200bＡ")).toBe("eaa");
  });
});

describe("mentionsOf", () => {
  it("reads the names a text mentions, folded, each with its at sign", () => {
    expect(mentionsOf("Hi @Bob and @alice_2")).toEqual(new Set(["@bob", "@alice_2"]));
  });

  it("folds a fullwidth at sign and a hidden character into the name they make", () => {
    expect(mentionsOf("Salut ＠a\u200blice")).toEqual(new Set(["@alice"]));
  });

  it("takes any letter in a name, so a lookalike is a name of its own", () => {
    expect(mentionsOf("Hi @аlice")).toEqual(new Set(["@аlice"]));
  });

  it("takes an at sign after no letter, digit or underscore alone: an email holds none", () => {
    expect(mentionsOf("a@example.org")).toEqual(new Set());
    expect(mentionsOf("a @example.org")).toEqual(new Set(["@example"]));
    expect(mentionsOf("(@x) **@y**\n@z")).toEqual(new Set(["@x", "@y", "@z"]));
  });

  it("holds none for a text with no mention", () => {
    expect(mentionsOf("")).toEqual(new Set());
  });
});

describe("mentionList", () => {
  it("gives every mention in its order, a repeat each time, as moderation counts them", () => {
    expect(mentionList("@a @a @A, then @b")).toEqual(["@a", "@a", "@a", "@b"]);
    expect(mentionList("no one here, mail a@b.test")).toEqual([]);
  });
});
