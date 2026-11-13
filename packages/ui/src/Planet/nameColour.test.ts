import { describe, expect, it } from "vitest";
import { nameColour } from "./nameColour.ts";

describe("nameColour", () => {
  it("is the hsl of the name's hash, the same for the same name", () => {
    let hue = 0;
    for (const letter of "bubble") hue = (hue * 31 + letter.charCodeAt(0)) % 360;
    expect(nameColour("bubble")).toBe(`hsl(${String(hue)} 55% 68%)`);
    expect(nameColour("bubble")).toBe(nameColour("bubble"));
    expect(nameColour("bubble")).not.toBe(nameColour("gno"));
  });
});
