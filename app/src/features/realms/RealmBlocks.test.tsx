import { page, type Page } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { drawing } from "../chat/index.ts";
import { DRAW_LIMIT, INLINE_LIMIT, RealmBlocks } from "./RealmBlocks.tsx";

const via = await drawing();

function draw(source: string): string {
  const read: Page = page(source, { origin: "https://gno.land" });
  if (read.kind !== "page") throw new Error("too big");
  return renderToStaticMarkup(<RealmBlocks via={via} blocks={read.blocks} />);
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const HOSTILE = [
  "# Welcome",
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "[click me](javascript:alert(1))",
  "",
  '<gno-form exec="Drain">',
  '<gno-input name="amount" type="text" />',
  '<gno-input name="to" type="hidden" value="g1attacker" />',
  "</gno-form>",
].join("\n");

describe("RealmBlocks: a realm page drawn from its tree", () => {
  test("draws a heading at its level, a paragraph, a list and code", () => {
    const html = draw("# One\n\n## Two\n\ntext\n\n- a\n- b\n\n```\ncode\n```");
    expect(html).toMatch(/<h1[^>]*>One<\/h1>/);
    expect(html).toMatch(/<h2[^>]*>Two<\/h2>/);
    expect(html).toMatch(/<p[^>]*>text<\/p>/);
    expect(html).toMatch(/<ul[^>]*><li[^>]*>a<\/li><li[^>]*>b<\/li><\/ul>/);
    expect(html).toMatch(/<pre[^>]*><code[^>]*>code<\/code><\/pre>/);
  });

  test("draws the hostile page as text: no script, no image, no link to javascript, no hidden input", () => {
    const html = draw(HOSTILE);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toMatch(/type="hidden"/i);
    // An event attribute on a real tag: the escaped text of the page holds " onerror=" and is no tag.
    expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+=/i);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  test("draws every field of a form, a hidden one with its name and value in view", () => {
    const html = draw(HOSTILE);
    const visible = html.replace(/<[^>]+>/g, " ");
    for (const word of ["amount", "to", "hidden", "g1attacker", "Drain"]) expect(visible).toContain(word);
  });

  // Every kind of field a form holds, an 'other' line, a description and a placeholder.
  const ALL_FIELDS = [
    '<gno-form exec="Vote">',
    '<gno-input name="who" type="text" placeholder="Your name" description="Who votes" />',
    '<gno-input name="secret" type="hidden" value="g1hiddenvalue" />',
    '<gno-textarea name="why" placeholder="Reason here" />',
    '<gno-select name="pick" value="yes" />',
    "<script>x</script>",
    "</gno-form>",
  ].join("\n");

  test("draws a form as read only: no control of any kind, nothing here sends anything", () => {
    for (const source of [HOSTILE, ALL_FIELDS]) {
      const html = draw(source);
      expect(html).not.toMatch(/<(input|textarea|select|button|form|option)\b/i);
      expect(html).not.toMatch(/\b(contenteditable|formaction|action)=/i);
    }
  });

  test("draws each kind of field with its name beside its value, and the line that is no field as text", () => {
    const html = draw(ALL_FIELDS);
    expect(html).toMatch(/<dt[^>]*>who[\s\S]*?<\/dt><dd[^>]*>[\s\S]*?Who votes/);
    expect(html).toMatch(/<dt[^>]*>secret[\s\S]*?<\/dt><dd[^>]*>[\s\S]*?hidden[\s\S]*?g1hiddenvalue/);
    expect(html).toMatch(/<dt[^>]*>why[\s\S]*?<\/dt><dd[^>]*>[\s\S]*?Reason here/);
    expect(html).toMatch(/<dt[^>]*>pick[\s\S]*?<\/dt><dd[^>]*>[\s\S]*?yes/);
    expect(html).toContain("Your name");
    expect(html).toContain("Vote");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toMatch(/<script/i);
  });

  test("draws a field with no name as such, and a form with no function as a form", () => {
    const html = draw('<gno-form>\n<gno-input type="hidden" value="v" />\n</gno-form>');
    expect(textOf(html)).toContain("(no name)");
    expect(textOf(html)).toContain("Form");
  });

  test("draws marks, a break, a mention, every heading level, an ordered list from its number and a quote's blocks", () => {
    const html = draw(
      [
        "### h3",
        "#### h4",
        "##### h5",
        "###### h6",
        "**bold** _em_ ~~gone~~ `code`",
        "next line",
        "",
        "@g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv",
        "",
        "3. three",
        "4. four",
        "",
        "> # in a quote",
        "> - item",
      ].join("\n"),
    );
    for (const level of [3, 4, 5, 6])
      expect(html).toMatch(new RegExp(`<h${String(level)}[^>]*>h${String(level)}</h${String(level)}>`));
    expect(html).toMatch(/<strong>bold<\/strong> <em>em<\/em> <s>gone<\/s> <code>code<\/code><br\/>next line/);
    expect(html).toContain("@g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
    expect(html).toMatch(/<ol[^>]*start="3"/);
    expect(html).toMatch(/<blockquote[^>]*><h1[^>]*>in a quote<\/h1><ul/);
  });

  test("draws a link with no referrer and no opener, and its address as the tree holds it", () => {
    const html = draw("[docs](https://gno.land/docs) and [vote](/r/demo/dao:vote)");
    const anchors = [...html.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a).toMatch(/rel="[^"]*noopener[^"]*"/);
      expect(a).toMatch(/rel="[^"]*noreferrer[^"]*"/);
      expect(a).toMatch(/href="https:\/\/gno\.land\//);
    }
  });

  test("draws a quote, an alert too, as a blockquote", () => {
    const html = draw("> [!WARNING] Careful\n> body");
    expect(html).toMatch(/<blockquote[^>]*>/);
    expect(html).toContain("Careful");
    expect(html).toContain("body");
  });
});

describe("RealmBlocks: a page too long to draw", () => {
  const drawn = (source: string, more?: string) => {
    const read = page(source);
    if (read.kind !== "page") throw new Error("too big");
    return renderToStaticMarkup(
      <RealmBlocks via={via} blocks={read.blocks} {...(more === undefined ? {} : { more })} />,
    );
  };
  const count = (html: string, tag: string) => html.split(`<${tag}`).length - 1;

  test("draws no more than the limit of blocks, then says the rest is not shown, with the link", () => {
    const html = drawn("# a\n".repeat(DRAW_LIMIT + 500), "https://gno.land/r/demo/dao");
    expect(count(html, "h1")).toBe(DRAW_LIMIT);
    expect(html).toMatch(/not shown here/);
    expect(html).toContain('href="https://gno.land/r/demo/dao"');
  });

  test("draws exactly the limit with no notice", () => {
    const html = drawn("# a\n".repeat(DRAW_LIMIT));
    expect(count(html, "h1")).toBe(DRAW_LIMIT);
    expect(html).not.toMatch(/not shown here/);
  });

  test("counts a list's items, a form's fields and a quote's blocks", () => {
    const items = drawn("- a\n".repeat(DRAW_LIMIT + 10));
    expect(count(items, "li")).toBe(DRAW_LIMIT - 1);
    expect(items).toMatch(/not shown here/);
    const quoted = drawn("> # a\n".repeat(DRAW_LIMIT + 10));
    expect(count(quoted, "h1")).toBe(DRAW_LIMIT - 1);
    expect(quoted).toMatch(/not shown here/);
    const fields = drawn("<gno-form>\n" + '<gno-input name="a" />\n'.repeat(DRAW_LIMIT + 10) + "</gno-form>");
    expect(count(fields, "dt")).toBe(DRAW_LIMIT - 1);
    expect(fields).toMatch(/not shown here/);
  });

  test("draws a short page whole, with no notice", () => {
    expect(drawn("# a\n\n- b\n- c")).not.toMatch(/not shown here/);
  });

  test("draws a paragraph of marks up to the inline limit, and none of one past it", () => {
    // `a` then a space: a code node and a text node, two a repetition; the last space is trimmed.
    const fits = drawn("`a` ".repeat(INLINE_LIMIT / 2 - 1));
    expect(count(fits, "code")).toBe(INLINE_LIMIT / 2 - 1);
    expect(fits).not.toMatch(/not shown here/);
    const past = drawn("`a` ".repeat(INLINE_LIMIT));
    expect(count(past, "code")).toBe(0);
    expect(past).toMatch(/not shown here/);
  });

  test("draws the paragraphs before one that is too heavy, and none after it", () => {
    const html = drawn("first\n\n" + "`a` ".repeat(INLINE_LIMIT) + "\n\nlast");
    expect(html).toContain("first");
    expect(html).not.toContain("last");
    expect(html).toMatch(/not shown here/);
  });

  test("draws 65,000 marks in one paragraph as a notice, never a stack overflow", () => {
    const html = drawn("*a* ".repeat(60_000));
    expect(count(html, "em")).toBe(0);
    expect(html).toMatch(/not shown here/);
  });
});
