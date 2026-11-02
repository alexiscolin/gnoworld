import { describe, expect, it } from "vitest";
import { hubWorldOf } from "./hubWorld.ts";

// A hub's page draws the planet the cosmos draws for the same world.
describe("hubWorldOf", () => {
  it("names a hub's world as the worlds' job groups its first realm, and a hub with no realm by its slug", () => {
    expect(hubWorldOf({ slug: "govdao", realms: ["gno.land/r/gov/dao"] })).toBe("gov/dao");
    expect(hubWorldOf({ slug: "golf", realms: ["gno.land/r/gnogolf/golf_v2/v3"] })).toBe("gnogolf/golf");
    expect(hubWorldOf({ slug: "bubble" })).toBe("bubble");
  });
});
