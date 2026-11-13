// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { recentPaths, rememberPath } from "./recents.ts";

describe("the recent places", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps none at first, and the newest first once, five at most", () => {
    expect(recentPaths()).toEqual([]);
    for (const path of ["/a", "/b", "/c", "/d", "/e", "/f", "/c"]) rememberPath(path);
    expect(recentPaths()).toEqual(["/c", "/f", "/e", "/d", "/b"]);
  });
});
