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
    expect(familyOf("gno.land/r/me/game_v12")).toBe("gno.land/r/me/game");
  });

  // F13523: bare trailing digits are part of the name; only a `/vN` directory or a `_vN` suffix is a version (a bare `vN`
  // suffix, as in `gov2`, is not: no realm name of the store's tests or fixtures needs it).
  it("keeps gov2, grc20 and grc721 in families of their own, and the versions of connect4 in one", () => {
    expect(familyOf("gno.land/r/me/gov2")).toBe("gno.land/r/me/gov2");
    expect(familyOf("gno.land/r/me/grc20")).toBe("gno.land/r/me/grc20");
    expect(familyOf("gno.land/r/me/grc721")).toBe("gno.land/r/me/grc721");
    expect(familyOf("gno.land/r/me/game12")).toBe("gno.land/r/me/game12");
    expect(familyOf("gno.land/r/me/gov2")).not.toBe(familyOf("gno.land/r/me/go"));
    expect(familyOf("gno.land/r/me/grc20")).not.toBe(familyOf("gno.land/r/me/grc721"));
    expect(familyOf("gno.land/r/me/connect4_v2")).toBe("gno.land/r/me/connect4");
    expect(familyOf("gno.land/r/me/grc20_v2")).toBe("gno.land/r/me/grc20");
    expect(familyOf("gno.land/r/me/pool_v")).toBe("gno.land/r/me/pool_v");
    expect(familyOf("gno.land/r/me/foov3")).toBe("gno.land/r/me/foov3");
    expect(familyOf("gno.land/r/me/pool/v1")).toBe("gno.land/r/me/pool");
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

// One short name for the page and Discover's card.
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
