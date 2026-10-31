import { describe, expect, test } from "vitest";
import { realmAt } from "./realmAt.ts";

describe("realmAt: the realm a path names", () => {
  test("reads /r/<path> in the default universe, Onyx, with its chain and its home", () => {
    expect(realmAt("/r/gnoland/coins")).toStrictEqual({
      realm: "gno.land/r/gnoland/coins",
      chain: { name: "Onyx", chainId: "onyx-1", rpc: "https://rpc.onyx.testnets.gno.land:443" },
      home: "/",
    });
  });

  test("reads /net/<id>/r/<path> in that universe, with its own chain", () => {
    const found = realmAt("/net/gnoland/r/gnoland/wugnot");
    expect(found?.realm).toBe("gno.land/r/gnoland/wugnot");
    expect(found?.chain).toStrictEqual({ name: "gno.land", chainId: "gnoland-1", rpc: "https://rpc.gno.land:443" });
    expect(found?.home).toBe("/net/gnoland/");
  });

  test("drops one trailing slash", () => {
    expect(realmAt("/r/demo/dao/")?.realm).toBe("gno.land/r/demo/dao");
  });

  test.each([
    "/r/",
    "/r",
    "/net/nowhere/r/demo/dao",
    "/r/Demo/dao",
    "/r/demo/dao_test",
    "/r/demo//dao",
    "/r/demo/../dao",
    "/r/demo/dao:vote",
    "/w/bubble",
    "/x/r/demo/dao",
    "/net/gnoland/x/r/demo/dao",
  ])("names no realm for %s", (path) => {
    expect(realmAt(path)).toBeUndefined();
  });
});
