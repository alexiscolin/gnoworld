// @vitest-environment jsdom
import { page, type Page } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { button, click, mount, one } from "../../../tests/mount.tsx";
import { drawing } from "../chat/index.ts";
import { DRAW_LIMIT, INLINE_LIMIT, RealmBlocks } from "./RealmBlocks.tsx";

const via = await drawing();
const PAGE_MAX = 256 * 1024;
const GNOWEB = "https://gno.land";

function draw(source: string): string {
  const read: Page = page(source, { origin: GNOWEB });
  if (read.kind !== "page") throw new Error("too big");
  return renderToStaticMarkup(<RealmBlocks via={via} origin={GNOWEB} blocks={read.blocks} />);
}

function blocksOf(source: string) {
  const read = page(source, { origin: GNOWEB });
  if (read.kind !== "page") throw new Error("too big");
  return read.blocks;
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

  test("draws a form's path, and a field's flags, in view (R-F7)", () => {
    const html = draw(
      '<gno-form path="balances">\n<gno-input name="a" required="true" readonly="true" />\n<gno-textarea name="b" rows="6" />\n</gno-form>',
    );
    expect(textOf(html)).toContain("path: balances");
    expect(textOf(html)).toContain("flags: required, readonly");
    expect(textOf(html)).toContain("flags: rows 6");
  });

  test("draws a name that is only blanks as no name, and every name, value and function left to right (S-F5)", () => {
    const html = draw(
      '<gno-form exec="\u202eSend">\n<gno-input name="\u3164" value="\u202ev" />\n<gno-input name="\u202eot" />\n</gno-form>',
    );
    expect(textOf(html)).toContain("(no name)");
    expect(html).toMatch(/<figcaption[^>]*dir="ltr"/);
    expect(html).toMatch(/<dt[^>]*dir="ltr"[^>]*>\u202eot/);
    expect(html).toMatch(/<code[^>]*dir="ltr"[^>]*>\u202ev<\/code>/);
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

  test("draws a link on gnoweb's own origin with no referrer and no opener, and its address as the tree holds it", () => {
    const html = draw("[docs](https://gno.land/docs) and [vote](/r/demo/dao:vote)");
    const anchors = [...html.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a).toMatch(/rel="[^"]*noopener[^"]*"/);
      expect(a).toMatch(/rel="[^"]*noreferrer[^"]*"/);
      expect(a).toMatch(/href="https:\/\/gno\.land\//);
    }
  });

  test("draws a quote as a blockquote, an alert's title and body in its notice", () => {
    expect(draw("> quoted")).toMatch(/<blockquote[^>]*>/);
    const html = draw("> [!WARNING] Careful\n> body");
    expect(html).toMatch(/<aside[^>]*>/);
    expect(html).toContain("Careful");
    expect(html).toContain("body");
  });
});

describe("RealmBlocks: rules, nested and task lists, images as cards (D382)", () => {
  const count = (html: string, tag: string) => html.split(`<${tag}`).length - 1;

  test("draws a rule as an hr, a setext title as a heading", () => {
    const html = draw("a\n\n---\n\nTitle\n===");
    expect(html).toMatch(/<hr\/?>/);
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
  });

  test("draws a nested list as a list inside its item, an ordered one under a bullet", () => {
    const html = draw("- a\n  - b\n  1. c\n- d");
    expect(html).toMatch(
      /<ul[^>]*><li[^>]*>a<ul[^>]*><li[^>]*>b<\/li><\/ul><ol[^>]*><li[^>]*>c<\/li><\/ol><\/li><li[^>]*>d<\/li><\/ul>/,
    );
    expect(draw("3. a\n   - b")).toMatch(/<ol[^>]*start="3"/);
  });

  test("draws a task as a read-only checkbox, checked when done, and nothing a click can change", () => {
    const html = draw("- [ ] open\n- [x] done");
    expect(count(html, "input")).toBe(2);
    expect(
      html.match(/<input[^>]*>/g)?.every((tag) => tag.includes('type="checkbox"') && tag.includes("disabled")),
    ).toBe(true);
    expect(html.match(/<input[^>]*checked/g)?.length).toBe(1);
    expect(textOf(html)).toContain("open");
    expect(html).not.toMatch(/<(form|button)\b/i);
  });

  test("draws an image as a card with its alt text and a way out, never as an img", () => {
    const html = draw("![the logo](https://x.test/a.png) ![](https://x.test/b.png)");
    expect(html).not.toMatch(/<img|<picture|<svg[^>]*src|srcset|src=/i);
    expect(html).toContain("the logo");
    expect(textOf(html)).toContain("Image");
    expect(html).toContain('title="https://x.test/a.png"');
    expect(html).toMatch(/data-image/);
  });

  test("sends an image off gnoweb through the warning button, never an anchor to that host", () => {
    const html = draw("![a](https://evil.example/a.png)");
    expect(html).toMatch(/<button/);
    expect(html).not.toMatch(/href="https:\/\/evil/);
  });

  test("draws an image inside a mark as the link it is, with no picture loaded", () => {
    const html = draw("**![a](https://x.test/a.png)** *![b](https://x.test/b.png)*");
    expect(html).not.toMatch(/data-image|<img|src=/i);
    expect(textOf(html)).toContain("a");
  });

  test("draws an image on gnoweb's own origin as an anchor that opens in a new tab, not loaded", () => {
    const html = draw("![a](https://gno.land/static/a.png)");
    expect(html).not.toMatch(/<img/i);
    expect(html).toMatch(/<a [^>]*href="https:\/\/gno.land\/static\/a.png"[^>]*target="_blank"[^>]*rel="[^"]*noopener/);
  });

  test("draws an image in a list item, a cell and a heading as a card too", () => {
    const html = draw(
      "- ![a](https://x.test/a.png)\n  - ![b](https://x.test/b.png)\n\n|h|\n|-|\n|![c](https://x.test/c.png)|\n\n# ![d](https://x.test/d.png)",
    );
    expect(html.split("data-image").length - 1).toBe(4);
  });

  test("counts rules, tasks and cards against the limit", () => {
    const rules = renderToStaticMarkup(<RealmBlocks via={via} blocks={blocksOf("---\n".repeat(DRAW_LIMIT + 500))} />);
    expect(rules.split("<hr").length - 1).toBeLessThan(DRAW_LIMIT + 1);
    expect(rules).toMatch(/not shown here/);
    const tasks = renderToStaticMarkup(
      <RealmBlocks via={via} blocks={blocksOf("- [ ] a\n".repeat(DRAW_LIMIT + 500))} />,
    );
    expect(tasks.split("<input").length - 1).toBeLessThan(DRAW_LIMIT);
    expect(tasks).toMatch(/not shown here/);
    const cards = renderToStaticMarkup(
      <RealmBlocks via={via} blocks={blocksOf("![a](https://x.test/a.png)\n\n".repeat(DRAW_LIMIT + 500))} />,
    );
    expect(cards.split("data-image").length - 1).toBeLessThan(DRAW_LIMIT + 1);
    expect(cards).toMatch(/not shown here/);
  });

  test("draws nothing of the items after one whose lists were cut", () => {
    const html = renderToStaticMarkup(
      <RealmBlocks via={via} blocks={blocksOf("- first\n" + "  - sub\n".repeat(DRAW_LIMIT + 5) + "- LATER")} />,
    );
    expect(html).toMatch(/not shown here/);
    expect(html).not.toContain("LATER");
  });

  test("counts nested items against the limit", () => {
    const html = renderToStaticMarkup(<RealmBlocks via={via} blocks={blocksOf("- a\n  - b\n".repeat(DRAW_LIMIT))} />);
    expect(html.split("<li").length - 1).toBeLessThan(DRAW_LIMIT);
    expect(html).toMatch(/not shown here/);
  });

  test("draws a hostile nested page as text", () => {
    const html = draw("- <script>x</script>\n  - [a](javascript:alert(1))\n  - [ ] <img src=x onerror=1>");
    expect(html).not.toMatch(/<script|<img|href="javascript:/i);
  });
});

describe("RealmBlocks: columns side by side, forms drawn under the text (D382)", () => {
  const FORM = '<gno-form exec="Vote">\n<gno-input name="who" type="text" />\n</gno-form>';

  test("draws columns as one block of columns, each column its own blocks, in order", () => {
    const html = draw("<gno-columns>\nleft\n<gno-columns-sep>\n# right\n</gno-columns>");
    expect(html).toMatch(
      /<div[^>]*data-block="columns"[^>]*><div[^>]*><p[^>]*>left<\/p><\/div><div[^>]*><h1[^>]*>right<\/h1><\/div><\/div>/,
    );
    expect(html).not.toMatch(/gno-columns/);
  });

  test("draws a column's lists, quotes and rules like the page's", () => {
    const html = draw("<gno-columns>\n- a\n<gno-columns-sep>\n> q\n<gno-columns-sep>\n---\n</gno-columns>");
    expect(html).toMatch(/<ul/);
    expect(html).toMatch(/<blockquote/);
    expect(html).toMatch(/<hr/);
  });

  test("counts a column's blocks against the limit, and draws none once it is spent", () => {
    const html = draw(
      "<gno-columns>\n" + "# a\n".repeat(DRAW_LIMIT + 10) + "<gno-columns-sep>\nZZLATER\n</gno-columns>",
    );
    expect(html.split("<h1").length - 1).toBeLessThan(DRAW_LIMIT);
    expect(html).not.toContain("ZZLATER");
    expect(html).toMatch(/not shown here/);
  });

  test("draws no column once the budget is spent, so thousands of columns are no thousands of divs", () => {
    const html = draw("<gno-columns>\n" + "a\n<gno-columns-sep>\n".repeat(DRAW_LIMIT + 500) + "</gno-columns>");
    expect(html.split("<div").length - 1).toBeLessThanOrEqual(DRAW_LIMIT + 1);
    expect(html).toMatch(/not shown here/);
  });

  test("takes a form out of the text: a line that points to it where it stood, the form under the page's text", () => {
    const html = draw(`before\n\n${FORM}\n\nafter`);
    const [, line] = /<a href="#([^"]+)"[^>]*>Form: Vote[^<]*<\/a>/.exec(html) ?? [];
    expect(line).toBeDefined();
    expect(html).toMatch(new RegExp(`id="${String(line)}"`));
    expect(html.indexOf("after")).toBeLessThan(html.indexOf("<figure"));
    expect(html.indexOf("before")).toBeLessThan(html.indexOf("Form: Vote"));
    expect(html.split("<figure").length - 1).toBe(1);
  });

  test("draws the forms in the order they stand, each with its own anchor, and none for a page with none", () => {
    const html = draw(`${FORM}\n\ntext\n\n<gno-form exec="Send">\n<gno-input name="to" />\n</gno-form>`);
    const hrefs = [...html.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toHaveLength(2);
    expect(new Set(hrefs).size).toBe(2);
    expect(html.lastIndexOf("Vote")).toBeLessThan(html.lastIndexOf("Send"));
    expect(draw("# a\n\ntext")).not.toMatch(/aria-label="Forms"|<figure/);
  });

  test("takes out a form in a quote and in a column too, and keeps it read only", () => {
    const html = draw(`> ${FORM.replaceAll("\n", "\n> ")}\n\n<gno-columns>\n${FORM}\n</gno-columns>`);
    expect(html.split("<figure").length - 1).toBe(2);
    expect(html).not.toMatch(/<(input|textarea|select|button|form)\b/i);
  });

  test("makes an anchor of nothing a page wrote: two forms of one function, a hostile function name, none", () => {
    const form = (open: string) => `${open}\n<gno-input name="a" />\n</gno-form>\n\n`;
    const html = draw(
      form('<gno-form exec="Same">') +
        form('<gno-form exec="Same">') +
        form("<gno-form exec='main a b&quot;onload=x'>") +
        form("<gno-form>"),
    );
    const ids = [...html.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
    const hrefs = [...html.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(hrefs).size).toBe(4);
    expect(hrefs.every((href) => ids.includes(href))).toBe(true);
    expect(/Same|main|onload/.exec([...ids, ...hrefs].join(""))).toBeNull();
    expect(html).toMatch(/>Form \u2193<\/a>/);
    expect(html).toMatch(/Form: Same \u2193<\/a>/);
  });

  test("counts forms against the limit: no more drawn than it allows, and no line points at one not drawn", () => {
    const html = draw('<gno-form exec="F">\n<gno-input name="a" />\n</gno-form>\n\n'.repeat(DRAW_LIMIT + 500));
    const figures = html.split("<figure").length - 1;
    const hrefs = [...html.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1]);
    expect(figures).toBeLessThanOrEqual(DRAW_LIMIT);
    expect(hrefs).toHaveLength(figures);
    expect(html).toMatch(/not shown here/);
  });

  test("draws no form once the text spent the budget, whatever column holds it", () => {
    const html = draw(
      "# a\n".repeat(DRAW_LIMIT) +
        '<gno-columns>\n<gno-form exec="F">\n<gno-input name="a" />\n</gno-form>\n</gno-columns>',
    );
    expect(html).not.toMatch(/<figure|aria-label="Forms"/);
  });

  test("gives two pages in one document anchors that differ", () => {
    const read = (source: string) => blocksOf(source);
    const html = renderToStaticMarkup(
      <>
        <RealmBlocks via={via} blocks={read(FORM)} />
        <RealmBlocks via={via} blocks={read(FORM)} />
      </>,
    );
    const hrefs = [...html.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(hrefs).size).toBe(2);
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

describe("RealmBlocks: a link that leaves gnoweb is behind a warning (R-F4, S-F2)", () => {
  const SOURCE =
    "[https://gno.land/r/demo](https://evil.example/x?a=1) [home](https://gno.land/r/demo) [path](/r/demo:vote)";

  test("draws a link off gnoweb's origin as a button, never as an anchor that goes there", () => {
    const html = draw(SOURCE);
    expect(html).not.toMatch(/<a\s[^>]*href="https:\/\/evil\.example/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>https:\/\/gno\.land\/r\/demo<\/button>/);
  });

  test("keeps a link on gnoweb's own origin, one written as a path included, an anchor", () => {
    const anchors = [...draw(SOURCE).matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toContain('href="https://gno.land/r/demo"');
    expect(anchors[1]).toContain('href="https://gno.land/r/demo:vote"');
  });

  test("draws every link as a button when it is given no origin", () => {
    const read = page("[a](https://gno.land/x)");
    if (read.kind !== "page") throw new Error("too big");
    const html = renderToStaticMarkup(<RealmBlocks via={via} blocks={read.blocks} />);
    expect(html).not.toMatch(/<a\s/);
    expect(html).toMatch(/<button/);
  });

  test("draws a lookalike origin as external: gno.land.evil.example is not gno.land", () => {
    const html = draw("[a](https://gno.land.evil.example/r/x) [b](https://gno.land:8443/r/x)");
    expect(html).not.toMatch(/<a\s/);
  });

  test("opens a dialog naming the real host and the whole address when the button is pressed", () => {
    // jsdom has no showModal: a stand-in opens the dialog, as ui's tests do.
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) {
        this.open = true;
      },
    });
    const read = page(SOURCE);
    if (read.kind !== "page") throw new Error("too big");
    const box = mount(<RealmBlocks via={via} origin={GNOWEB} blocks={read.blocks} />);
    expect(box.querySelector("dialog")).toBeNull();
    click(button(box, "https://gno.land/r/demo"));
    const dialog = one(box, "dialog");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.textContent).toContain("evil.example");
    expect(dialog.textContent).toContain("https://evil.example/x?a=1");
    expect(one(dialog, "a").getAttribute("href")).toBe("https://evil.example/x?a=1");
  });
});

describe("RealmBlocks: once the budget is spent, nothing more is drawn (R-F5, S-F4)", () => {
  const drawn = (source: string) => {
    const read = page(source);
    if (read.kind !== "page") throw new Error("too big");
    return renderToStaticMarkup(<RealmBlocks via={via} origin={GNOWEB} blocks={read.blocks} />);
  };
  const HEAVY = "`a` ".repeat(INLINE_LIMIT);

  test("draws no block after a list item too heavy to draw, and no empty list", () => {
    const html = drawn(`before\n\n- ${HEAVY}\n\nAFTER-THE-LIST\n\n# AFTER-HEADING`);
    expect(html).toContain("before");
    expect(html).not.toContain("AFTER");
    expect(html).not.toMatch(/<ul[^>]*><\/ul>/);
    expect(html).toMatch(/not shown here/);
  });

  test("draws no block after a quoted paragraph too heavy to draw, and no empty quote", () => {
    const html = drawn(`before\n\n> ${HEAVY}\n\nAFTER-THE-QUOTE\n\n# AFTER-HEADING`);
    expect(html).toContain("before");
    expect(html).not.toContain("AFTER");
    expect(html).not.toMatch(/<blockquote[^>]*><\/blockquote>/);
  });

  test("says how many fields of a form are left out, inside the form (S-F5)", () => {
    const html = drawn("<gno-form>\n" + '<gno-input name="a" />\n'.repeat(DRAW_LIMIT + 10) + "</gno-form>");
    expect(textOf(html)).toMatch(/11 more fields are not shown here/);
  });
});

describe("RealmBlocks: a table as a real table", () => {
  const TABLE =
    "| Question | Yes | Note |\n|:--|--:|:-:|\n| [Q1](https://gno.land/r/x) | 0.41 | **ok** |\n| Q2 | 0.59 |";

  test("draws a header, a body, and each column's alignment from its delimiter", () => {
    const html = draw(TABLE);
    expect(html).toMatch(/<table[^>]*><thead><tr><th[^>]*scope="col"[^>]*>Question<\/th>/);
    expect(html).toMatch(/<th[^>]*data-align="right"[^>]*>Yes<\/th>/);
    expect(html).toMatch(/<th[^>]*data-align="center"[^>]*>Note<\/th>/);
    expect(html).toMatch(/<td[^>]*data-align="right"[^>]*>0\.59<\/td>/);
    expect(html).toMatch(/<tbody>.*<strong>ok<\/strong>.*<\/tbody>/);
    expect(html).not.toContain("|");
  });

  test("draws a left column as left and an unaligned one with no alignment", () => {
    const html = draw("| a | b |\n|:--|--|\n| 1 | 2 |");
    expect(html).toMatch(/<th[^>]*data-align="left"[^>]*>a<\/th>/);
    expect(html).not.toMatch(/<th[^>]*data-align="(?!left)[^>]*>b</);
  });

  test("draws an external link in a header cell and a body cell as a button, never an anchor off gnoweb", () => {
    const html = draw("| [h](https://evil.example/h) |\n|--|\n| [b](https://evil.example/b) |");
    expect(html).toMatch(/<th[^>]*><button/);
    expect(html).toMatch(/<td[^>]*><button/);
    expect(html).not.toMatch(/href="https:\/\/evil/);
  });

  test("draws a table that is not cut with no note, and what follows it", () => {
    const html = draw("| a |\n|--|\n| 1 |\n\nAFTER");
    expect(html).toContain("AFTER");
    expect(html).not.toMatch(/not shown here/);
  });

  test("draws a short row padded to the header's width", () => {
    const rows = draw(TABLE).split("<tr").slice(1);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.split("<td").length + row.split("<th").length - 2).toBe(3);
  });

  test("puts the table in a focusable, named region that scrolls on its own", () => {
    expect(draw(TABLE)).toMatch(/<div[^>]*role="region"[^>]*aria-label="Table"[^>]*tabindex="0"/);
  });

  test("draws a link in a cell as the page's own link, and HTML in a cell as text", () => {
    const html = draw("| <b>x</b> |\n|--|\n| [a](https://gno.land/r/x) |");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toMatch(/<b>/);
    expect(html).toMatch(/<a[^>]*href="https:\/\/gno.land\/r\/x"/);
  });

  test("says a table cut at the caps was cut", () => {
    const rows = Array.from({ length: 2005 }, (_, i) => `| r${String(i)} |`).join("\n");
    const html = draw(`| a |\n|--|\n${rows}\n\nAFTER`);
    expect(textOf(html)).toMatch(/rest of this table is not shown here/);
    expect(html.match(/<tr/g)?.length).toBeGreaterThan(1000);
  });

  test("draws no more rows than the budget allows, and says so", () => {
    const heavy = "| `a` ".repeat(60) + "|";
    const head = "|--".repeat(60) + "|";
    const html = draw(`${heavy}\n${head}\n${Array.from({ length: 300 }, () => heavy).join("\n")}\n\nAFTER`);
    expect(html).not.toContain("AFTER");
    expect(html).toMatch(/not shown here/);
    const count = html.match(/<tr/g)?.length ?? 0;
    expect(count).toBeGreaterThan(1);
    expect(count).toBeLessThan(301);
  });

  test("charges a table's header: header-only tables of empty cells are cut by the budget", () => {
    const table = `${"|".repeat(65)}\n${"|-".repeat(64)}|\n\n`;
    const html = draw(table.repeat(Math.floor(PAGE_MAX / table.length)));
    expect(html.match(/<th[ >]/g)?.length ?? 0).toBeLessThanOrEqual(INLINE_LIMIT);
    expect(html).toMatch(/not shown here/);
  });

  test("draws no more cells than the budget allows when they are empty", () => {
    const head = "|a".repeat(64) + "|";
    const html = draw(`${head}\n${"|-".repeat(64)}|\n${Array.from({ length: 1999 }, () => "|".repeat(65)).join("\n")}`);
    expect(html.match(/<t[dh]/g)?.length ?? 0).toBeLessThanOrEqual(INLINE_LIMIT + 64);
  });

  test("charges a short row the cells it is drawn with, so rows of one cell under a wide head stay within the budget", () => {
    const head = "|a".repeat(64) + "|";
    const html = draw(`${head}\n${"|-".repeat(64)}|\n${Array.from({ length: 1999 }, () => "a").join("\n")}`);
    expect(html.match(/<t[dh]/g)?.length ?? 0).toBeLessThanOrEqual(INLINE_LIMIT + 64);
  });
});

describe("RealmBlocks: gnoweb's alerts are the design system's notices", () => {
  test("draws a note as a notice with the info icon and its title", () => {
    const html = draw("> [!NOTE] Heads up\n> Body.");
    expect(html).toMatch(/<aside[^>]*data-severity="notice"/);
    expect(html).toContain('data-icon="info"');
    expect(html).toContain("Heads up");
    expect(html).toContain("Body.");
    expect(html).not.toContain("<blockquote");
  });

  test("draws a warning as a caution with the warning icon", () => {
    const html = draw("> [!WARNING]\n> Body.");
    expect(html).toMatch(/<aside[^>]*data-severity="caution"/);
    expect(html).toContain('data-icon="warning"');
  });

  test("draws a plain quote as a blockquote", () => {
    expect(draw("> plain")).toMatch(/<blockquote/);
  });
});

describe("RealmBlocks: the headings keep a small scale", () => {
  test("draws all six levels as their own element", () => {
    const html = draw("# 1\n\n## 2\n\n### 3\n\n#### 4\n\n##### 5\n\n###### 6");
    for (const level of ["1", "2", "3", "4", "5", "6"])
      expect(html).toMatch(new RegExp(`<h${level}[^>]*>${level}</h${level}>`));
  });
});

describe("RealmBlocks: pages read from onyx-1 on 2026-11-07", () => {
  test("draws the market's table, its escaped hash and its testnet note", () => {
    const html = draw(
      [
        "# 67",
        "| Question | Yes, GNOT | No, GNOT | Status |",
        "| :--- | ---: | ---: | :--- |",
        "| [Will Bitcoin outperform Gold in 2026?](/r/nym-sixseven067/markets:btc-vs-gold-2026) | 0.41 | 0.59 | Open until 31 December 2026 |",
        "| [Will Morgan Wallen be the Billboard \\#1 top artist in 2026?](/r/nym-sixseven067/markets:billboard-wallen-2026) | 0.774 | 0.226 | Open |",
        "",
        "> [!NOTE] Testnet",
        "> This is onyx-1, a test network: test GNOT has no value.",
      ].join("\n"),
    );
    expect(html.match(/<tr/g)).toHaveLength(3);
    expect(html).toContain("Billboard #1 top artist");
    expect(html).toMatch(/<th[^>]*data-align="right"[^>]*>Yes, GNOT<\/th>/);
    expect(html).toMatch(/<aside[^>]*data-severity="notice"/);
    expect(html).not.toContain("|");
  });

  test("draws the leaderboard's headings and tables", () => {
    const html = draw(
      "# 🎧 Sonotone — Leaderboards\n\n## 🎵 Classic\n\n| # | Nickname |\n|---|--------|\n| 1 | John |",
    );
    expect(html).toMatch(/<h1[^>]*>🎧 Sonotone — Leaderboards<\/h1>/);
    expect(html).toMatch(/<h2[^>]*>🎵 Classic<\/h2>/);
    expect(html).toMatch(/<td[^>]*>John<\/td>/);
  });
});
