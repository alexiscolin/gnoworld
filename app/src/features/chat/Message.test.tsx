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
const LINK = /^<a href="https:\/\/[^"]+" title="https:\/\/[^"]+" dir="ltr" target="_blank" rel="noopener noreferrer">$/;
// A mention: its class, the account's whole address in its title, and nothing else.
const MENTION = /^<span class="([^"]*)" title="(g1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38})">$/;
// A class attribute's value holding each of `names`, in any order.
const classes = (...names: string[]) => `${names.map((name) => `(?=[^"]*${name})`).join("")}[^"]*`;
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const opening = (markup: string) =>
  [...markup.matchAll(/<([a-z]+)[^>]*>/g)].map((found) => ({ tag: found[1] ?? "", whole: found[0] }));

describe("Message", () => {
  it("shows a one-paragraph message on its line, its marks as elements", () => {
    expect(html("a **b** *c* ~~d~~ `e`")).toBe("<span>a <strong>b</strong> <em>c</em> <s>d</s> <code>e</code></span>");
  });

  it("links an https address in a new tab, with no opener or referrer, its whole address in its title", () => {
    expect(html("[docs](https://gno.land/docs)")).toBe(
      '<span><a href="https://gno.land/docs" title="https://gno.land/docs" dir="ltr" target="_blank" rel="noopener noreferrer">docs</a></span>',
    );
  });

  it("shows blocks below the line: paragraphs, code, a quote and lists", () => {
    expect(html("a\nb\n\n```\n<i>x</i>\n```\n> q\n- l\n1. n")).toBe(
      "<div><p>a<br/>b</p><pre><code>&lt;i&gt;x&lt;/i&gt;</code></pre><blockquote><p>q</p></blockquote>" +
        "<ul><li>l</li></ul><ol><li>n</li></ol></div>",
    );
  });

  it("gives its box the class asked, a span or a div", () => {
    const boxed = (text: string) => renderToStaticMarkup(<Message text={text} className="x" />);
    expect(boxed("")).toBe('<span class="x"></span>');
    expect(boxed("a")).toBe('<span class="x">a</span>');
    expect(boxed("a\n\nb")).toBe('<div class="x"><p>a</p><p>b</p></div>');
  });

  it("shows a mention as the account's address shortened, its whole address in its title, in a list and a quote too", () => {
    const mention = (address: string, short: string) =>
      new RegExp(`<span class="${classes("mention")}" title="${address}">@${short}</span>`);
    expect(html(`hi @${ALICE}!`)).toMatch(new RegExp(`^<span>hi ${mention(ALICE, "g10gh7…3y5tv").source}!</span>$`));
    expect(html(`> @${BOB}\n- @${ALICE}`)).toMatch(mention(BOB, "g1jg8m…vsqf5"));
    expect(html(`> @${BOB}\n- @${ALICE}`)).toMatch(mention(ALICE, "g10gh7…3y5tv"));
    expect(html(`hi @${ALICE}`)).not.toContain("aboutMe");
  });

  it("sets a mention of the reader apart, and no other", () => {
    const markup = renderToStaticMarkup(<Message text={`@${ALICE} and @${BOB}`} me={BOB} />);
    expect(markup).toMatch(new RegExp(`<span class="${classes("mention", "aboutMe")}" title="${BOB}">`));
    expect(markup).toMatch(new RegExp(`<span class="${classes("mention")}" title="${ALICE}">`));
    expect(markup).not.toMatch(new RegExp(`aboutMe[^"]*" title="${ALICE}"`));
    expect(markup.match(/aboutMe/g)).toHaveLength(1);
  });

  // The threat model's lookalike: the reader's address where it is no mention, or an address one character off.
  it.each([
    [`[@${BOB}](https://a.example)`, "in a link's label"],
    [`\`@${BOB}\``, "in code"],
    [`\\@${BOB}`, "escaped"],
    ["```\n@" + BOB + "\n```", "in a code block"],
    [`@${BOB.slice(0, -1)}q`, "one character off"],
    [`x@${BOB}`, "inside a word"],
  ])("sets no mention of the reader apart where %j names it: %s", (text) => {
    expect(renderToStaticMarkup(<Message text={text} me={BOB} />)).not.toContain("aboutMe");
  });

  it("sets no mention apart for a reader with no account, whatever its name", () => {
    for (const me of ["", "guest-ab12cd", undefined]) {
      expect(renderToStaticMarkup(<Message text={`@${BOB} and @ and @${ALICE}`} me={me} />)).not.toContain("aboutMe");
    }
  });

  it("numbers an ordered list from its first number", () => {
    expect(html("3. third point")).toBe('<div><ol start="3"><li>third point</li></ol></div>');
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

  it("makes, of anything, the allowed elements alone, each link https with no opener, each mention an account's, and no other attribute", () => {
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
      `@${ALICE}`,
      `x@${BOB}`,
      `[@${BOB}](https://a.example)`,
      `@${ALICE}" onclick="x`,
      `@${BOB}`,
    );
    fc.assert(
      fc.property(
        fc.array(fc.oneof(pieces, fc.string({ unit: "binary", maxLength: 6 })), { maxLength: 40 }),
        fc.constantFrom(BOB, undefined),
        (parts, me) => {
          const source = parts.join("");
          for (const { tag, whole } of opening(renderToStaticMarkup(<Message text={source} me={me} />))) {
            expect(TAGS.has(tag)).toBe(true);
            if (tag === "a") expect(whole).toMatch(LINK);
            else if (whole.startsWith("<span ")) {
              // A mention names an account the message names, and is the reader's own only when it is.
              const [, names = "", title = ""] = MENTION.exec(whole) ?? [];
              expect(source).toContain(`@${title}`);
              expect(names.split(" ").filter((name) => /mention|aboutMe/.test(name))).toHaveLength(
                title === me ? 2 : 1,
              );
            } else expect(whole).toMatch(/^<[a-z]+\/?>$/);
          }
        },
      ),
      { seed: 20261017, numRuns: 300 },
    );
  });
});
