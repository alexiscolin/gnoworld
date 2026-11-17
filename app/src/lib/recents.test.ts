// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { landingPaths, recentPaths, rememberLanding, rememberPath } from "./recents.ts";

describe("the recent places", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps none at first, and the newest first once, five at most", () => {
    expect(recentPaths()).toEqual([]);
    for (const path of ["/a", "/b", "/c", "/d", "/e", "/f", "/c"]) rememberPath(path);
    expect(recentPaths()).toEqual(["/c", "/f", "/e", "/d", "/b"]);
  });

  it("keeps the phone's landing apart: five realms opened from the search leave the last world", () => {
    expect(landingPaths()).toEqual([]);
    rememberLanding("/w/govdao");
    for (const path of ["/r/a", "/r/b", "/r/c", "/r/d", "/r/e"]) rememberPath(path);
    expect(landingPaths()).toEqual(["/w/govdao"]);
    rememberLanding("/earth");
    expect(landingPaths()).toEqual(["/earth"]);
  });
});
