import { describe, expect, it } from "vitest";
import { hubOf, nameOf } from "./placeName.ts";

describe("a hub's name", () => {
  it("names gnosh's colony by its hub's name: it stands on no realm, so the scene knows it by its slug", () => {
    expect(hubOf("gnosh-ai")).toMatchObject({ slug: "gnosh-ai", name: "gnosh.ai" });
    expect(nameOf("gnosh-ai")).toBe("gnosh.ai");
  });

  it("names a hub on a realm by its realm still", () => {
    expect(nameOf("gov/dao")).toBe("GovDAO");
  });
});
