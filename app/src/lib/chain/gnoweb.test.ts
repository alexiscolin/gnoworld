import { describe, expect, it } from "vitest";
import { gnowebLink } from "./gnoweb.ts";

describe("gnowebLink: a realm's address on gnoweb", () => {
  it("puts the realm's path under the origin, whether it is written with its domain or without", () => {
    expect(gnowebLink("https://gno.land", "gno.land/r/gnoland/coins")).toBe("https://gno.land/r/gnoland/coins");
    expect(gnowebLink("https://gno.land/", "/r/demo/dao")).toBe("https://gno.land/r/demo/dao");
    expect(gnowebLink("https://onyx.testnets.gno.land", "gno.land/r/demo/foo_bar")).toBe(
      "https://onyx.testnets.gno.land/r/demo/foo_bar",
    );
  });

  it.each([
    "//evil.test/r/x",
    "https://evil.test/r/x",
    "/\\evil.test",
    "/r/a//b",
    "/r/a/../b",
    "gno.land/p/demo/x",
    "",
    "/r/",
  ])("leads nowhere for the path %j", (path) => {
    expect(gnowebLink("https://gno.land", path)).toBeUndefined();
  });

  it.each(["", "http://gno.land", "https://gno.land/x", "https://u@gno.land", "javascript:alert(1)"])(
    "leads nowhere for the origin %j",
    (origin) => {
      expect(gnowebLink(origin, "/r/demo/dao")).toBeUndefined();
    },
  );
});

describe("gnowebLink with a page of the realm: `realm:15`", () => {
  it("adds the page after the realm's path, on either origin", () => {
    expect(gnowebLink("https://gno.land", "gno.land/r/gov/dao", 15)).toBe("https://gno.land/r/gov/dao:15");
    expect(gnowebLink("https://onyx.testnets.gno.land", "/r/gov/dao", 0)).toBe(
      "https://onyx.testnets.gno.land/r/gov/dao:0",
    );
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "leads nowhere for the page %j",
    (page) => {
      expect(gnowebLink("https://gno.land", "/r/gov/dao", page)).toBeUndefined();
    },
  );

  it("still leads nowhere for a path that leaves the realm's, with a page or without", () => {
    for (const path of ["/r/../../evil", "/r/a/./b", "/r/a/.."]) {
      expect(gnowebLink("https://gno.land", path, 1)).toBeUndefined();
      expect(gnowebLink("https://gno.land", path)).toBeUndefined();
    }
  });
});
