import { describe, expect, it } from "vitest";
import { gnowebLink, gnowebOrigin } from "./gnoweb.ts";

describe("gnowebOrigin: where a chain's gnoweb is", () => {
  it("names the two hosts of the recorded answers", () => {
    expect(gnowebOrigin("gnoland-1")).toBe("https://gno.land");
    expect(gnowebOrigin("onyx-1")).toBe("https://onyx.testnets.gno.land");
  });

  it("names none for any other chain, an object's key included", () => {
    for (const id of ["", "gnoland-2", "constructor", "toString", "__proto__"])
      expect(gnowebOrigin(id)).toBeUndefined();
  });
});

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
