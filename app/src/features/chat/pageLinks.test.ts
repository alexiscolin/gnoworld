import { markdown } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { capturedPath, previewIn } from "./pageLinks.ts";

// Which page a chat line's link shows the capture of (8f): a link to a realm's home on the default universe's gnoweb, and nothing else.
// The page never asks the address a line holds: it only looks it up among the captures the server's job wrote.
const GNOWEB = "https://onyx.testnets.gno.land";

describe("capturedPath", () => {
  it.each([
    ["https://onyx.testnets.gno.land/r/gov/dao", "gno.land/r/gov/dao"],
    ["https://onyx.testnets.gno.land/r/gov/dao/", "gno.land/r/gov/dao"],
    ["https://ONYX.testnets.gno.land/r/samcrew/memba_dao", "gno.land/r/samcrew/memba_dao"],
    ["https://onyx.testnets.gno.land:443/r/gov/dao", "gno.land/r/gov/dao"],
  ])("reads %s as the home of %s", (href, path) => {
    expect(capturedPath(href, GNOWEB)).toBe(path);
  });

  it("reads the same page against a gnoweb written with a trailing slash", () => {
    expect(capturedPath("https://onyx.testnets.gno.land/r/gov/dao", `${GNOWEB}/`)).toBe("gno.land/r/gov/dao");
  });

  it.each([
    ["mainnet's gnoweb, another chain's page", "https://gno.land/r/gov/dao"],
    ["plain http", "http://onyx.testnets.gno.land/r/gov/dao"],
    ["a look-alike host", "https://onyx.testnets.gno.land.evil.example/r/gov/dao"],
    ["a user in the address", "https://user@onyx.testnets.gno.land/r/gov/dao"],
    ["gnoweb's name as a user of another host", "https://onyx.testnets.gno.land@evil.example/r/gov/dao"],
    ["a backslash before another host", "https://onyx.testnets.gno.land\\@evil.example/r/gov/dao"],
    ["a host with a trailing dot", "https://onyx.testnets.gno.land./r/gov/dao"],
    ["another port", "https://onyx.testnets.gno.land:8443/r/gov/dao"],
    ["a sub-page", "https://onyx.testnets.gno.land/r/gov/dao:37"],
    ["a query", "https://onyx.testnets.gno.land/r/gov/dao?page=2"],
    ["a fragment", "https://onyx.testnets.gno.land/r/gov/dao#members"],
    ["the source", "https://onyx.testnets.gno.land/r/gov/dao$source"],
    ["a package", "https://onyx.testnets.gno.land/p/nt/avl/v0"],
    ["a user's page", "https://onyx.testnets.gno.land/u/aeddi"],
    ["no realm", "https://onyx.testnets.gno.land/r/"],
    ["a path that climbs", "https://onyx.testnets.gno.land/r/gov/../../etc"],
    ["a path spelled in percents", "https://onyx.testnets.gno.land/r/gov/%64ao"],
    ["a doubled slash", "https://onyx.testnets.gno.land/r//gov/dao"],
    ["a script", "javascript:alert(1)"],
    ["no address", "gov/dao"],
  ])("reads no page in %s", (_, href) => {
    expect(capturedPath(href, GNOWEB)).toBeUndefined();
  });

  it("reads no page when the universe's gnoweb is no https origin", () => {
    expect(capturedPath("http://gnoweb.example/r/gov/dao", "http://gnoweb.example")).toBeUndefined();
  });
});

describe("previewIn", () => {
  it("takes a line's first link to a captured page, in its own words or bare", () => {
    expect(previewIn(markdown("look https://onyx.testnets.gno.land/r/gov/dao"), GNOWEB)).toBe("gno.land/r/gov/dao");
    expect(
      previewIn(
        markdown("[the DAO](https://onyx.testnets.gno.land/r/gov/dao) or https://onyx.testnets.gno.land/r/b/c"),
        GNOWEB,
      ),
    ).toBe("gno.land/r/gov/dao");
    expect(previewIn(markdown("https://youtu.be/x then https://onyx.testnets.gno.land/r/b/c"), GNOWEB)).toBe(
      "gno.land/r/b/c",
    );
  });

  it("takes the page of a link a sentence's punctuation follows: the line's reader ends the link before it", () => {
    for (const text of [
      "see https://onyx.testnets.gno.land/r/gov/dao.",
      "(https://onyx.testnets.gno.land/r/gov/dao)",
      "https://onyx.testnets.gno.land/r/gov/dao, then",
    ]) {
      expect(previewIn(markdown(text), GNOWEB)).toBe("gno.land/r/gov/dao");
    }
  });

  it("takes none from a line with no such link, nor from words that only look like one", () => {
    expect(previewIn(markdown("gno.land/r/gov/dao is up"), GNOWEB)).toBeUndefined();
    expect(previewIn(markdown("`https://onyx.testnets.gno.land/r/gov/dao`"), GNOWEB)).toBeUndefined();
  });
});
