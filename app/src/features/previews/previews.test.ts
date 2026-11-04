import { describe, expect, it } from "vitest";
import { shortPath } from "./previews.ts";

// A realm's path as the video writes it under a capture (8f): whole on frame 26's plate, its middle cut on frame 104's.
describe("shortPath", () => {
  it("writes a path of 20 characters or fewer whole, as frame 26 does", () => {
    expect(shortPath("gno.land/r/gov/dao")).toBe("gno.land/r/gov/dao");
    expect(shortPath("gno.land/r/abc/defgh")).toBe("gno.land/r/abc/defgh");
  });

  it("cuts a longer one's middle folders, its last kept, as frame 104 does", () => {
    expect(shortPath("gno.land/r/abc/defghi")).toBe("gno.land/r/…/defghi");
    expect(shortPath("gno.land/r/sample/bubble")).toBe("gno.land/r/…/bubble");
    expect(shortPath("gno.land/r/gov/dao/v3/impl")).toBe("gno.land/r/…/impl");
    expect(shortPath(`gno.land/r/a/${"x".repeat(200)}`)).toBe(`gno.land/r/…/${"x".repeat(200)}`);
  });

  it("writes a long path with no middle folder whole: there is nothing to cut", () => {
    const solo = `gno.land/r/${"n".repeat(30)}`;
    expect(shortPath(solo)).toBe(solo);
  });
});
