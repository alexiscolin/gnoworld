import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { markdown } from "@gnoworld/core";
import { ANONYMOUS, block, Message } from "./Message.tsx";

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
// A mention: the account's whole address in its title, "me" when it is the reader's, and nothing else.
const MENTION = /^<span data-mention="(me)?" title="(g1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38})">$/;
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// A checksum-valid address ground to shorten as BOB's: g1jg8m…vsqf5 (F812's verifier, seven seconds).
const GROUND = "g1jg8m2vtwlmmyz8swgu76ug4tklwnays8yvsqf5";
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

  // 4c's UX review (U1): a line not the list's stop keeps its links out of the Tab order, in every block.
  it("keeps every link out of the Tab order when asked, and in it otherwise", () => {
    const text = "[a](https://gno.land/a)\n\n> [b](https://gno.land/b)\n\n- [c](https://gno.land/c)";
    const out = renderToStaticMarkup(<Message text={text} tabbable={false} />);
    expect([...out.matchAll(/<a [^>]*>/g)].map(([tag]) => tag.includes('tabindex="-1"'))).toEqual([true, true, true]);
    expect(html(text)).not.toContain("tabindex");
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

  it("shows a mention as its account's mark, its whole address in its title, in a list and a quote too", () => {
    const mention = (address: string) => new RegExp(`<span data-mention="" title="${address}">@g1[^<]+</span>`);
    expect(html(`hi @${ALICE}!`)).toMatch(new RegExp(`^<span>hi ${mention(ALICE).source}!</span>$`));
    expect(html(`> @${BOB}\n- @${ALICE}`)).toMatch(mention(BOB));
    expect(html(`> @${BOB}\n- @${ALICE}`)).toMatch(mention(ALICE));
    expect(html(`hi @${ALICE}`)).not.toContain('data-mention="me"');
  });

  // F812: an address of the right checksum can be ground to shorten as another's does (seven seconds found GROUND,
  // drawn as BOB's), but holds no key, so never joins a room: the short form is the reader's and the members' alone.
  it("shows a mention shortened only for the reader and the room's members, anyone else's address whole (F812)", () => {
    const markup = renderToStaticMarkup(
      <Message text={`@${ALICE} @${BOB} @${GROUND}`} me={BOB} members={new Set([ALICE, "guest-ab12cd"])} />,
    );
    expect(markup).toBe(
      `<span><span data-mention="" title="${ALICE}">@g10gh7…3y5tv</span> ` +
        `<span data-mention="me" title="${BOB}">@g1jg8m…vsqf5</span> ` +
        `<span data-mention="" title="${GROUND}">@${GROUND}</span></span>`,
    );
  });

  it("shows the same forms in a quote, a list, a mark and a message of several blocks (F812)", () => {
    const pair = `@${ALICE} @${GROUND}`;
    const markup = renderToStaticMarkup(
      <Message
        text={`> ${pair}\n- ${pair}\n\n**${pair}** ~~${pair}~~ *${pair}*`}
        me={BOB}
        members={new Set([ALICE])}
      />,
    );
    const shown = [...markup.matchAll(/<span data-mention="" title="(g1[^"]+)">@([^<]+)<\/span>/g)].map(
      ([, title = "", text = ""]) => [title === ALICE ? "ALICE" : "GROUND", text],
    );
    expect(shown).toEqual(
      Array.from({ length: 5 }, () => [
        ["ALICE", "g10gh7…3y5tv"],
        ["GROUND", GROUND],
      ]).flat(),
    );
  });

  it("shows a member's mention shortened to a guest too, who has no address of its own (F812)", () => {
    expect(renderToStaticMarkup(<Message text={`@${ALICE} @${GROUND}`} members={new Set([ALICE])} />)).toBe(
      `<span><span data-mention="" title="${ALICE}">@g10gh7…3y5tv</span> ` +
        `<span data-mention="" title="${GROUND}">@${GROUND}</span></span>`,
    );
  });

  it("shows every mention whole but the reader's when it is given no members, a guest's whole too (F812)", () => {
    expect(html(`@${ALICE}`)).toBe(`<span><span data-mention="" title="${ALICE}">@${ALICE}</span></span>`);
    expect(renderToStaticMarkup(<Message text={`@${ALICE} @${BOB}`} me={BOB} />)).toBe(
      `<span><span data-mention="" title="${ALICE}">@${ALICE}</span> ` +
        `<span data-mention="me" title="${BOB}">@g1jg8m…vsqf5</span></span>`,
    );
  });

  // F812's review: a line may type an account's short form itself; it reads as the words they are.
  it("draws a short form typed as text as text: no mark, no title", () => {
    expect(renderToStaticMarkup(<Message text="ask @g1jg8m…vsqf5" me={BOB} />)).toBe("<span>ask @g1jg8m…vsqf5</span>");
  });

  it("sets a mention of the reader apart, and no other", () => {
    const markup = renderToStaticMarkup(<Message text={`@${ALICE} and @${BOB}`} me={BOB} />);
    expect(markup).toContain(`<span data-mention="me" title="${BOB}">`);
    expect(markup).toContain(`<span data-mention="" title="${ALICE}">`);
    expect(markup.match(/data-mention="me"/g)).toHaveLength(1);
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
    expect(renderToStaticMarkup(<Message text={text} me={BOB} />)).not.toContain('data-mention="me"');
  });

  // A lookalike: an address of the right form whose checksum fails, written to shorten as BOB's does (F805).
  it("draws an address whose checksum fails whole, as text: no account's short form for it", () => {
    const lookalike = `g1jg8m${"q".repeat(29)}vsqf5`;
    const markup = renderToStaticMarkup(<Message text={`ask @${lookalike} or @${BOB}`} me={BOB} />);
    expect(markup).toBe(
      `<span>ask @${lookalike} or <span data-mention="me" title="${BOB}">@g1jg8m…vsqf5</span></span>`,
    );
  });

  it("sets no mention apart for a reader with no account, whatever its name", () => {
    for (const me of ["", "guest-ab12cd", undefined]) {
      expect(renderToStaticMarkup(<Message text={`@${BOB} and @ and @${ALICE}`} me={me} />)).not.toContain(
        'data-mention="me"',
      );
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
              const [, mine, title = ""] = MENTION.exec(whole) ?? [];
              expect(source).toContain(`@${title}`);
              expect(mine === "me").toBe(title === me);
            } else expect(whole).toMatch(/^<[a-z]+\/?>$/);
          }
        },
      ),
      { seed: 20261017, numRuns: 300 },
    );
  });
});

describe("a reader's own link", () => {
  const draw = (link: NonNullable<(typeof ANONYMOUS)["link"]>) =>
    markdown("[a **b**](https://a.example) and [c](https://c.example)").map((node) =>
      renderToStaticMarkup(<>{block(node, { ...ANONYMOUS, link })}</>),
    );

  it("hands each link's address and its drawn label to the reader, and draws what it gives", () => {
    const seen: string[] = [];
    const [out] = draw((href, label) => {
      seen.push(href);
      return (
        <button type="button" data-to={href}>
          {label}
        </button>
      );
    });
    expect(seen).toStrictEqual(["https://a.example", "https://c.example"]);
    expect(out).toBe(
      '<p><button type="button" data-to="https://a.example">a <strong>b</strong></button> and <button type="button" data-to="https://c.example">c</button></p>',
    );
  });

  it("draws the usual anchor for the link the reader gives nothing for", () => {
    const [out] = draw((href) => (href.includes("a.example") ? undefined : <i>{href}</i>));
    expect(out).toMatch(
      /^<p><a href="https:\/\/a\.example" title="https:\/\/a\.example" dir="ltr" target="_blank" rel="noopener noreferrer">a <strong>b<\/strong><\/a> and <i>https:\/\/c\.example<\/i><\/p>$/,
    );
  });
});
