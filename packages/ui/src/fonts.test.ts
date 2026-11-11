import { describe, expect, it } from "vitest";
import { LATIN_FONTS } from "./fonts.ts";

// P409 (D13978): a page's head preloads the two latin faces styles.css's @font-face asks for, and no other subset.
describe("the latin fonts a page preloads", () => {
  it("name the text's and the mono's latin variable faces, two files", () => {
    expect(LATIN_FONTS).toHaveLength(2);
    expect(LATIN_FONTS[0]).toMatch(/geist-latin-wght-normal[^/]*\.woff2$/);
    expect(LATIN_FONTS[1]).toMatch(/geist-mono-latin-wght-normal[^/]*\.woff2$/);
  });
});
