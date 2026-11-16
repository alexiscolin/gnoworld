import { describe, expect, it } from "vitest";
import { sectionId } from "./sectionId.ts";

describe("sectionId", () => {
  it("reads the section an address's hash names, decoded", () => {
    expect(sectionId("#page")).toBe("page");
    expect(sectionId("#caf%C3%A9")).toBe("café");
  });

  it("names none for an empty hash or one that does not decode (a crafted #%E0 leaves the sheet whole)", () => {
    expect(sectionId("")).toBeUndefined();
    expect(sectionId("#")).toBeUndefined();
    expect(sectionId("#%E0")).toBeUndefined();
  });
});
