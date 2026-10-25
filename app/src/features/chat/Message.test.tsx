import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Message } from "./Message.tsx";

const html = (text: string) => renderToStaticMarkup(<Message text={text} />);
// The elements a message may hold, and the attributes each may carry.
const TAGS = new Set([
  "span",
  "div",
  "p",
  "strong",
  "em",
  "s",
  "code",
  "pre",
  "a",
  "br",
  "blockquote",
  "ul",
  "ol",
  "li",
]);
const LINK = /^<a href="https:\/\/[^"]+" title="https:\/\/[^"]+" target="_blank" rel="noopener noreferrer">$/;
const opening = (markup: string) =>
  [...markup.matchAll(/<([a-z]+)[^>]*>/g)].map((found) => ({ tag: found[1] ?? "", whole: found[0] }));

describe("Message", () => {
  it("shows a one-paragraph message on its line, its marks as elements", () => {
    expect(html("a **b** *c* ~~d~~ `e`")).toBe("<span>a <strong>b</strong> <em>c</em> <s>d</s> <code>e</code></span>");
  });

  it("links an https address in a new tab, with no opener or referrer, its whole address in its title", () => {
    expect(html("[docs](https://gno.land/docs)")).toBe(
      '<span><a href="https://gno.land/docs" title="https://gno.land/docs" target="_blank" rel="noopener noreferrer">docs</a></span>',
    );
  });

  it("shows blocks below the line: paragraphs, code, a quote and lists", () => {
    expect(html("a\nb\n\n```\n<i>x</i>\n```\n> q\n- l\n1. n")).toBe(
      "<div><p>a<br/>b</p><pre><code>&lt;i&gt;x&lt;/i&gt;</code></pre><blockquote><p>q</p></blockquote>" +
        "<ul><li>l</li></ul><ol><li>n</li></ol></div>",
    );
  });

  it("shows nothing for a blank message", () => {
    expect(html("  ")).toBe("<span></span>");
  });

  it.each([
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    "[x](javascript:alert(1))",
    "[x](data:text/html,<script>alert(1)</script>)",
    "&lt;script&gt;",
  ])("shows %j as its own text", (text) => {
    const markup = html(text);
    expect(opening(markup).map(({ tag }) => tag)).toStrictEqual(["span"]);
    expect(
      markup
        .replaceAll(/<[^>]+>/g, "")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&amp;", "&"),
    ).toBe(text);
  });

  it("makes, of anything, the allowed elements alone, each link https with no opener and no other attribute", () => {
    const pieces = fc.constantFrom(
      "**",
      "*",
      "~~",
      "`",
      "```\n",
      "\n",
      "> ",
      "- ",
      "1. ",
      "[x](https://a.example/y)",
      "[x](javascript:x)",
      "<b>",
      '" onclick="x',
      "https://a.example",
    );
    fc.assert(
      fc.property(
        fc.array(fc.oneof(pieces, fc.string({ unit: "binary", maxLength: 6 })), { maxLength: 40 }),
        (parts) => {
          for (const { tag, whole } of opening(html(parts.join("")))) {
            expect(TAGS.has(tag)).toBe(true);
            if (tag === "a") expect(whole).toMatch(LINK);
            else expect(whole).toMatch(/^<[a-z]+\/?>$/);
          }
        },
      ),
      { seed: 20261017, numRuns: 300 },
    );
  });
});
