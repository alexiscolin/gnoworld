import { describe, expect, it } from "vitest";
import { cardPath, shortPath } from "./shortPath.ts";

// The two looks of a realm's path (D13015): the plate's rows and the link card's caption (the previews' test cases, moved here).
describe("cardPath", () => {
  it("writes a path of 20 characters or fewer whole", () => {
    expect(cardPath("gno.land/r/gov/dao")).toBe("gno.land/r/gov/dao");
    expect(cardPath("gno.land/r/abc/defgh")).toBe("gno.land/r/abc/defgh");
  });

  it("cuts a longer one's middle folders, its last kept", () => {
    expect(cardPath("gno.land/r/abc/defghi")).toBe("gno.land/r/…/defghi");
    expect(cardPath("gno.land/r/gov/dao/v3/impl")).toBe("gno.land/r/…/impl");
  });

  it("writes a long path with no middle folder whole", () => {
    const solo = `gno.land/r/${"n".repeat(30)}`;
    expect(cardPath(solo)).toBe(solo);
  });
});

describe("shortPath", () => {
  it("cuts a path of more than four folders to its first two and last two", () => {
    expect(shortPath("r/a/b/c/d")).toBe("r/a/…/c/d");
    expect(shortPath("r/a/b/c")).toBe("r/a/b/c");
  });
});
