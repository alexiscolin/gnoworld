import { describe, expect, it } from "vitest";
import { familyOf, nameOf, realmName } from "./families.ts";

describe("familyOf", () => {
  it("puts a realm and its versions in one family", () => {
    const base = "gno.land/r/nym-mikecito001/connect4";
    expect(familyOf(base)).toBe(familyOf(`${base}_v2`));
    expect(familyOf(base)).toBe(familyOf(`${base}_v4`));
  });

  it("drops a version directory and a trailing number", () => {
    expect(familyOf("gno.land/r/gnoswap/pool/v1")).toBe("gno.land/r/gnoswap/pool");
    expect(familyOf("gno.land/r/gnoswap/pool/v12")).toBe(familyOf("gno.land/r/gnoswap/pool"));
    expect(familyOf("gno.land/r/me/game12")).toBe("gno.land/r/me/game");
  });

  it("keeps two realms of one author apart, and a name that is only digits", () => {
    expect(familyOf("gno.land/r/me/chess")).not.toBe(familyOf("gno.land/r/me/checkers"));
    expect(familyOf("gno.land/r/me/2048")).toBe("gno.land/r/me/2048");
    expect(familyOf("gno.land/r/me/v2")).toBe("gno.land/r/me");
  });
});

describe("nameOf", () => {
  it("is the last name, or the one before a version directory", () => {
    expect(nameOf("gno.land/r/gnoswap/pool/v1")).toBe("pool");
    expect(nameOf("gno.land/r/me/Fish_v2")).toBe("fish_v2");
  });
});

// Moved from app/src/features/realms/realmName.test.ts (the reviewer's M3: one short name for the page and Discover's card), its rows kept.
describe("realmName", () => {
  it.each([
    ["gno.land/r/gnops/valopers", "gnops", "valopers"],
    ["gno.land/r/gov/dao/v3/init", "gov", "init"],
    ["gno.land/r/demo/boards/v2", "demo", "boards"],
    ["gno.land/r/gnoland", "gnoland", "gnoland"],
  ])("%s is %s's %s, never its whole path", (path, namespace, name) => {
    expect(realmName(path)).toStrictEqual({ namespace, name });
  });
});
