import { describe, expect, it } from "vitest";
import * as core from "../index.ts";
import { asciiBytes, hexOf } from "./bytes.ts";

describe("hexOf", () => {
  it("writes each byte as two lower-case hex digits, a leading zero kept", () => {
    expect(hexOf(Uint8Array.from([0, 1, 15, 16, 171, 255]))).toBe("00010f10abff");
    expect(hexOf(new Uint8Array(0))).toBe("");
  });

  it("is the index's, with asciiBytes", () => {
    expect(core.hexOf).toBe(hexOf);
    expect(core.asciiBytes).toBe(asciiBytes);
  });
});
