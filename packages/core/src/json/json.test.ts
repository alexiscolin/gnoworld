import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { jsonOf, placeIn } from "./json.ts";

// The one JSON-or-nothing reader (D121), which the boundaries' near-copies share: a value, or undefined for text that is no JSON.
describe("jsonOf", () => {
  it.each([
    ['{"a":[1,"b",null]}', { a: [1, "b", null] }],
    ["[]", []],
    ['"text"', "text"],
    ["-12.5e3", -12500],
    ["null", null],
    ["true", true],
    ["  \n false \t", false],
  ])("reads %j as the value it writes", (text, value) => {
    expect(jsonOf(text)).toEqual(value);
  });

  it.each(["", " ", "{", "[1,]", "undefined", "NaN", "'a'", '{"a":1} x', '{"a":1}{"b":2}', "0x10", "01"])(
    "gives undefined for %j, which is no JSON",
    (text) => {
      expect(jsonOf(text)).toBeUndefined();
    },
  );

  it("reads back what JSON writes, as JSON.parse reads it", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const text = JSON.stringify(value);
        expect(jsonOf(text)).toEqual(JSON.parse(text));
      }),
    );
  });

  it("never throws, whatever the text", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (text) => {
        expect(() => jsonOf(text)).not.toThrow();
      }),
    );
  });

  it("never throws on a text nested two million deep, whole or cut off", () => {
    const deep = `${"[".repeat(2_000_000)}${"]".repeat(2_000_000)}`;
    expect(() => jsonOf(deep)).not.toThrow();
    expect(jsonOf("[".repeat(2_000_000))).toBeUndefined();
  });

  it("keeps a key named __proto__ as the value's own, polluting nothing", () => {
    const value = jsonOf('{"__proto__":{"polluted":1}}');
    expect(typeof value === "object" && value !== null && Object.hasOwn(value, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain("polluted");
  });
});

// Where a fault sits in a data file (D122): the app's build and Jarvis's places name it the same way, never by its value.
describe("placeIn", () => {
  it.each([
    [[], "(file)"],
    [[0], "[0]"],
    [[0, "slug"], "[0].slug"],
    [["hubs", 2, "universe"], "hubs[2].universe"],
    [[1, "embeds", 0, "url"], "[1].embeds[0].url"],
  ])("writes %j as %j", (path, place) => {
    expect(placeIn(path)).toBe(place);
  });
});
