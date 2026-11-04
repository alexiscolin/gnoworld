import { describe, expect, it } from "vitest";
import { site } from "../../places.ts";
import { platePreview } from "./plate.ts";

// The plate's wiring (R22): a world shows its first realm's capture, in the default universe alone, whose pages the job captures.
describe("platePreview", () => {
  it("names GovDAO's realm, a world of the default universe with a realm", () => {
    const govdao = site.world(new Request("https://gno.world/w/govdao"));
    expect(platePreview(govdao.realms, site.home(govdao))).toBe("gno.land/r/gov/dao");
  });

  it("names none for a world with no realm, nor for one in another universe", () => {
    const bubble = site.world(new Request("https://gno.world/w/bubble"));
    expect(platePreview(bubble.realms, site.home(bubble))).toBeUndefined();
    expect(platePreview(["gno.land/r/gov/dao"], { isDefault: false })).toBeUndefined();
  });
});
