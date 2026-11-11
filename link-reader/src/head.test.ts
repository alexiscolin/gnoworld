import { ReaderCard } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { decodeHtml, parseHead } from "./head.ts";

const PAGE = new URL("https://example.com/blog/post");
const page = (head: string, body = "<p>hi</p>") =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const og = (property: string, content: string) => `<meta property="${property}" content="${content}">`;
const parse = (head: string) => parseHead(page(head), PAGE);
// What the schema holds a card to: the reader's output must always pass it.
const valid = (head: ReturnType<typeof parseHead>) =>
  ReaderCard.safeParse({ title: head?.title, description: head?.description, site: head?.site, picture: null }).success;

describe("what is read", () => {
  it("takes the Open Graph title, description, site and picture", () => {
    const got = parse(
      og("og:title", "A title") +
        og("og:description", "A text") +
        og("og:site_name", "A Site") +
        og("og:image", "https://cdn.example.com/p.jpg"),
    );
    expect(got).toEqual({
      title: "A title",
      description: "A text",
      site: "A Site",
      image: "https://cdn.example.com/p.jpg",
    });
  });

  it("falls back to <title> and name=description, and to nothing for the site and the picture", () => {
    expect(parse('<title>Plain</title><meta name="description" content="Plain text">')).toEqual({
      title: "Plain",
      description: "Plain text",
      site: "",
      image: undefined,
    });
  });

  it("prefers Open Graph to the plain tags", () => {
    expect(
      parse(
        "<title>Plain</title>" +
          og("og:title", "OG") +
          '<meta name="description" content="p">' +
          og("og:description", "o"),
      ),
    ).toMatchObject({ title: "OG", description: "o" });
  });

  it("takes an empty Open Graph title as no title, and falls back", () => {
    expect(parse("<title>Plain</title>" + og("og:title", "   "))?.title).toBe("Plain");
  });

  it("reads `name` as well as `property`, tags and attributes in any case, and an attribute order of any kind", () => {
    expect(parse('<META CONTENT="Loud" PROPERTY="OG:Title"><meta content="Named" name="og:site_name">')).toMatchObject({
      title: "Loud",
      site: "Named",
    });
  });

  it("keeps the first of two tags of one property", () => {
    expect(parse(og("og:title", "First") + og("og:title", "Second"))?.title).toBe("First");
  });

  it("has no card for a page with no title, or a title of spaces", () => {
    expect(parse(og("og:description", "only a text"))).toBeUndefined();
    expect(parse("<title>   \n </title>")).toBeUndefined();
    expect(parseHead("", PAGE)).toBeUndefined();
    expect(parseHead("not html at all", PAGE)).toBeUndefined();
  });

  it("collapses runs of whitespace, newlines included, to one space", () => {
    expect(parse("<title>  one\n\ttwo   three \r\n</title>")?.title).toBe("one two three");
  });
});

describe("text as text", () => {
  it("decodes entities once, in a tag's content and in <title>", () => {
    expect(parse(og("og:title", "Tom &amp; Jerry &#8217;s &eacute;t&#xe9;") + "<title>x</title>")?.title).toBe(
      "Tom & Jerry ’s été",
    );
    expect(parse("<title>A &amp; B</title>")?.title).toBe("A & B");
  });

  it("never decodes twice: a double-encoded tag stays text", () => {
    expect(parse(og("og:title", "&amp;lt;script&amp;gt;"))?.title).toBe("&lt;script&gt;");
  });

  it("keeps markup that came as entities as plain characters, never as a tag", () => {
    expect(parse(og("og:title", "&lt;img src=x onerror=alert(1)&gt;"))?.title).toBe("<img src=x onerror=alert(1)>");
  });

  it("removes control and format characters (Cc, Cf): bidi marks, zero-width, joiners, tags, escapes, NUL", () => {
    const hidden = "\u202e\u200b\u200d\u2066\ufeff\u00ad\u0007\u001b\u0000\u{e0041}";
    expect(
      parse(og("og:title", `a${hidden}b`) + og("og:description", `c${hidden}d`) + og("og:site_name", `e${hidden}f`)),
    ).toMatchObject({ title: "ab", description: "cd", site: "ef" });
  });

  it("removes them when they arrive as entities too", () => {
    expect(parse(og("og:title", "a&#x202e;b&#8203;c&#0;d"))?.title).toBe("abcd");
  });

  it("removes the C1 controls (U+0080 to U+009F) and turns the line and paragraph separators into spaces", () => {
    expect(parse(og("og:title", "a\u0085b\u009fc"))?.title).toBe("abc");
    expect(parse(og("og:title", "a\u2028b\u2029c"))?.title).toBe("a b c");
  });

  it("reads `</HEAD>` and a head with no `<head>` tag at all", () => {
    expect(parseHead('<title>One</title></HEAD><meta property="og:title" content="Evil">', PAGE)?.title).toBe("One");
    expect(parseHead("<html><title>Two</title><body>", PAGE)?.title).toBe("Two");
  });

  it("has no picture for an og:image of 3,000 characters", () => {
    expect(parse(og("og:title", "t") + og("og:image", `/${"a".repeat(3000)}`))?.image).toBeUndefined();
  });

  it("keeps what is not hidden: emoji, accents, other scripts, a ZWJ-free text", () => {
    expect(parse(og("og:title", "café 日本語 😀"))?.title).toBe("café 日本語 😀");
  });
});

describe("the caps", () => {
  it("cuts the title at 200, the description at 500 and the site at 100", () => {
    const got = parse(
      og("og:title", "t".repeat(201)) + og("og:description", "d".repeat(501)) + og("og:site_name", "s".repeat(101)),
    );
    expect([got?.title.length, got?.description.length, got?.site.length]).toEqual([200, 500, 100]);
  });

  it("keeps a text exactly at its cap whole", () => {
    expect(parse(og("og:title", "t".repeat(200)))?.title).toBe("t".repeat(200));
  });

  it("never cuts a character in two: the cut text is well formed", () => {
    const got = parse(og("og:title", "a".repeat(199) + "😀"));
    expect(got?.title.isWellFormed()).toBe(true);
    expect(got?.title.length).toBeLessThanOrEqual(200);
  });

  it("makes texts that pass the schema, whatever the page held", () => {
    const got = parse(
      og("og:title", "\u202e" + "x".repeat(900) + "\ud83d") + og("og:description", "&#xD800;" + "y".repeat(900)),
    );
    expect(got).toBeDefined();
    expect(valid(got)).toBe(true);
  });
});

describe("the picture's address", () => {
  const image = (value: string) => parse(og("og:title", "t") + og("og:image", value))?.image;

  it("resolves a relative address against the page's", () => {
    expect(image("/img/p.jpg")).toBe("https://example.com/img/p.jpg");
    expect(image("p.jpg")).toBe("https://example.com/blog/p.jpg");
    expect(image("//cdn.example.org/p.jpg")).toBe("https://cdn.example.org/p.jpg");
  });

  it.each([
    ["http://cdn.example.com/p.jpg"],
    ["data:image/png;base64,AAAA"],
    ["javascript:alert(1)"],
    ["https://127.0.0.1/p.jpg"],
    ["https://10.0.0.1/p.jpg"],
    ["https://localhost/p.jpg"],
    ["https://cdn.example.com:8443/p.jpg"],
    ["https://u@cdn.example.com/p.jpg"],
    [""],
  ])("has none for %j, which the URL rule refuses", (value) => {
    expect(image(value)).toBeUndefined();
  });

  it("takes the first og:image of several", () => {
    expect(parse(og("og:title", "t") + og("og:image", "/one.jpg") + og("og:image", "/two.jpg"))?.image).toBe(
      "https://example.com/one.jpg",
    );
  });
});

describe("a hostile page", () => {
  it("ignores a meta that is text inside a <script>", () => {
    const head = `<title>Real</title><script>document.write('<meta property="og:title" content="Evil"><title>Evil</title>')</script>`;
    expect(parse(head)?.title).toBe("Real");
  });

  it("ignores a meta in a comment, a conditional comment and a CDATA-looking block", () => {
    const head = `<title>Real</title><!-- ${og("og:title", "Evil")} --><!--[if IE]>${og("og:description", "Evil")}<![endif]--><![CDATA[${og("og:site_name", "Evil")}]]>`;
    expect(parse(head)).toMatchObject({ title: "Real", description: "", site: "" });
  });

  it("ignores a meta in <style>, <textarea>, <noscript> and <template>", () => {
    const head = `<title>Real</title><style>${og("og:site_name", "Evil")}</style><textarea>${og("og:site_name", "Evil")}</textarea><noscript>${og("og:site_name", "Evil")}</noscript><template>${og("og:site_name", "Evil")}</template>`;
    expect(parse(head)?.site).toBe("");
  });

  it("ignores everything after the head: a meta after </head> or in the body", () => {
    expect(
      parseHead(
        `<html><head><title>Real</title></head>${og("og:title", "Evil")}<body>${og("og:description", "Evil")}</body></html>`,
        PAGE,
      ),
    ).toMatchObject({ title: "Real", description: "" });
  });

  it("ignores a meta once <body> opens, with the head never closed", () => {
    expect(parseHead(`<html><head><title>Real</title><body>${og("og:title", "Evil")}`, PAGE)?.title).toBe("Real");
  });

  // The fetch hands the parser 256 KiB at most (fetch.test.ts), so these are the sizes it can be given; no clock is read: the work is bounded by the input.
  it("reads an unterminated title to the end of what it was given, capped", () => {
    expect(parseHead(`<title>${"a".repeat(262_144)}`, PAGE)?.title.length).toBe(200);
  });

  it("caps a huge attribute, a thousand metas and a run of entities", () => {
    expect(parseHead(page(`<meta property="og:title" content="${"b".repeat(262_000)}">`), PAGE)?.title.length).toBe(
      200,
    );
    expect(parseHead(page("<title>t</title>" + '<meta name="x" content="y">'.repeat(9_000)), PAGE)?.title).toBe("t");
    expect(parseHead(page(`<title>${"&amp;".repeat(40_000)}</title>`), PAGE)?.title.length).toBe(200);
  });

  it("is not thrown off by unclosed tags, broken attributes or binary text", () => {
    expect(() =>
      parseHead('<head><meta property="og:title" content="Closed later<title>T</title><meta ', PAGE),
    ).not.toThrow();
    expect(() => parseHead("\u0000\u0001<<<>>>&&&;;;<meta><meta property><meta content=", PAGE)).not.toThrow();
  });
});

describe("the page's bytes as text", () => {
  const bytes = (...codes: number[]) => Uint8Array.from(codes);
  const latin = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

  it("reads UTF-8 by default, and an invalid sequence as U+FFFD, never an error", () => {
    expect(decodeHtml(new TextEncoder().encode("<title>caf\u00e9</title>"), "text/html")).toBe(
      "<title>caf\u00e9</title>",
    );
    const bad = decodeHtml(bytes(0x3c, 0xff, 0xc0, 0x3e), "text/html");
    expect(bad).toContain("\ufffd");
    expect(bad.isWellFormed()).toBe(true);
  });

  it("reads the Content-Type's charset: iso-8859-1 and windows-1252 (where 0x92 is a right quote)", () => {
    expect(decodeHtml(latin("<title>caf\u00e9"), "text/html; charset=iso-8859-1")).toBe("<title>caf\u00e9");
    expect(decodeHtml(bytes(0x92), 'text/html; charset="windows-1252"')).toBe("\u2019");
  });

  it("reads a `<meta charset>` or an http-equiv declaration in the first bytes when the header says none", () => {
    expect(decodeHtml(latin('<meta charset="iso-8859-1"><title>caf\u00e9'), "text/html")).toBe(
      '<meta charset="iso-8859-1"><title>caf\u00e9',
    );
    expect(
      decodeHtml(
        latin('<meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><title>\u0092'),
        "text/html",
      ),
    ).toContain("\u2019");
  });

  it("lets a BOM decide over what the header and the page say", () => {
    expect(decodeHtml(bytes(0xef, 0xbb, 0xbf, 0x61), "text/html; charset=iso-8859-1")).toBe("a");
    expect(decodeHtml(bytes(0xff, 0xfe, 0x61, 0x00, 0x62, 0x00), "text/html")).toBe("ab");
    expect(decodeHtml(bytes(0xfe, 0xff, 0x00, 0x61), "text/html")).toBe("a");
  });

  it("takes an unknown label as UTF-8", () => {
    expect(decodeHtml(new TextEncoder().encode("ok"), "text/html; charset=nonsense-9")).toBe("ok");
  });

  it("is never thrown off by a charset that would inflate the text: UTF-16 from a header is not honoured over a page of one byte a character", () => {
    expect(decodeHtml(latin("<title>x</title>"), "text/html; charset=utf-16le").length).toBeLessThanOrEqual(16);
  });
});
