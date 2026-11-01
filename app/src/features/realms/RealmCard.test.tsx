import { PAGE_MAX_BYTES, page } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { bigLine, CARD_HEADING, CARD_PARAGRAPH, RealmCard } from "./RealmCard.tsx";

const GNOWEB = "https://gno.land";
const draw = (source: string, height = 1_187_469, path = "/r/demo/dao") =>
  renderToStaticMarkup(
    <RealmCard path={path} gnoweb={GNOWEB} height={height} page={page(source, { origin: GNOWEB })} />,
  );
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const scriptUrl = (): string => ["java", "script:alert(1)"].join("");

describe("RealmCard: a realm in the chat", () => {
  test("shows the page's first heading and first paragraph, and nothing after them", () => {
    const html = draw("# The DAO\n\nA place to vote.\n\n## Later\n\nSecond paragraph.");
    const text = textOf(html);
    expect(text).toContain("The DAO");
    expect(text).toContain("A place to vote.");
    expect(text).not.toContain("Later");
    expect(text).not.toContain("Second paragraph.");
  });

  test("links to the realm on gnoweb, whatever the page holds", () => {
    for (const source of ["# T\n\np", "", "<script>x</script>"]) {
      expect(draw(source)).toContain('href="https://gno.land/r/demo/dao"');
    }
  });

  test("names the block height it was read at, as a block", () => {
    expect(textOf(draw("# T\n\np"))).toMatch(/block 1,187,469/);
  });

  test("links to gnoweb with no referrer and no opener", () => {
    const anchor = /<a\s[^>]*>/.exec(draw("# T"))?.[0] ?? "";
    expect(anchor).toMatch(/rel="[^"]*noopener[^"]*"/);
    expect(anchor).toMatch(/rel="[^"]*noreferrer[^"]*"/);
  });

  test.each(["//evil.test/r/x", "https://evil.test/r/x", "/\\evil.test"])(
    "links to nothing off gnoweb for the path %j",
    (path) => {
      const html = draw("# T", 1, path);
      expect(html).not.toMatch(/href="https:\/\/evil\.test/);
    },
  );

  test("links to nothing when gnoweb is not an https address", () => {
    const html = renderToStaticMarkup(<RealmCard path="/r/x" gnoweb={scriptUrl()} height={1} page={page("# T")} />);
    expect(html).not.toMatch(/<a\s/);
    expect(textOf(html)).toContain("/r/x");
  });

  test("cuts a first paragraph of 200 KB and a heading of one 100 KB word, an ellipsis at the cut", () => {
    const longParagraph = textOf(draw("# T\n\n" + "word ".repeat(40_000)));
    expect(longParagraph.length).toBeLessThan(CARD_PARAGRAPH + 200);
    expect(longParagraph).toContain("…");
    const longHeading = textOf(draw("# " + "x".repeat(100_000)));
    expect(longHeading.length).toBeLessThan(CARD_HEADING + 200);
    expect(longHeading).toContain("…");
  });

  test("cuts between graphemes: a flag or a family is kept whole", () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    const text = textOf(draw("# " + family.repeat(CARD_HEADING + 5)));
    expect(text).toContain(family + "…");
  });

  test("shows a paragraph that comes before the heading, and skips a quote or a form that opens the page", () => {
    const text = textOf(draw("before\n\n# Title\n\nafter"));
    expect(text).toContain("before");
    expect(text).toContain("Title");
    expect(text).not.toContain("after");
    const opened = textOf(draw('> quoted\n\n<gno-form>\n<gno-input name="a" />\n</gno-form>\n\n# Title\n\nthe text'));
    expect(opened).toContain("Title");
    expect(opened).toContain("the text");
    expect(opened).not.toContain("quoted");
  });

  test("is the design system's compact card, named by its title (R-F11)", () => {
    const html = draw("# The DAO\n\nWords.");
    expect(html).toMatch(/<article[^>]*aria-labelledby="[^"]+"[^>]*data-density="compact"/);
    expect(html).toMatch(/<h3 id="[^"]+"[^>]*>The DAO<\/h3>/);
  });

  test("shows the path and the link, and no text of the page, for an empty page", () => {
    const html = draw("");
    expect(textOf(html)).toContain("/r/demo/dao");
    expect(html).toContain('href="https://gno.land/r/demo/dao"');
    expect(html).toMatch(/<h3[^>]*>\/r\/demo\/dao<\/h3>/);
    expect(html).not.toMatch(/<p>\s*<\/p>/);
  });

  test("falls back to the realm's path when the page has no heading", () => {
    expect(textOf(draw("just words"))).toContain("/r/demo/dao");
  });

  test("draws the first lines as text: a script in them is not one", () => {
    const html = draw("# <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
  });

  test("a page past the cap shows the cap's state and the link, never a part of the page", () => {
    const html = renderToStaticMarkup(
      <RealmCard path="/r/demo/dao" gnoweb={GNOWEB} height={5} page={page("# Big\n" + "x".repeat(300_000))} />,
    );
    const text = textOf(html);
    expect(text).not.toContain("Big");
    expect(text).toContain("This page is too large to show here (over 256 KB).");
    expect(bigLine(PAGE_MAX_BYTES)).toBe("This page is too large to show here (over 256 KB).");
    expect(html).toContain('href="https://gno.land/r/demo/dao"');
  });
});
