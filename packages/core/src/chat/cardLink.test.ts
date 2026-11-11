import { describe, expect, it } from "vitest";
import { cardLinkOf, normalisedUrl } from "./cardLink.ts";

// L2 (docs/plans/link-previews.md §3 step 1, §4): the link a line's card is for. The page and the server call this one function, and
// the Markdown's own reading of the line decides what a link is (markdown/inline.ts), so a card never exists for a link the line does not show.
const LONG = (length: number): string => `https://example.com/${"a".repeat(length - "https://example.com/".length)}`;

describe("cardLinkOf", () => {
  it.each([
    ["a bare URL", "https://example.com/page", "https://example.com/page"],
    [
      "a bare URL in a sentence, its closing dot left out",
      "look: https://example.com/page.",
      "https://example.com/page",
    ],
    ["a Markdown link", "see [the page](https://example.com/page) now", "https://example.com/page"],
    [
      "a Markdown link whose label is another address",
      "[https://other.example](https://example.com/a)",
      "https://example.com/a",
    ],
    ["a link with a query", "https://example.com/p?a=1&b=2", "https://example.com/p?a=1&b=2"],
    ["the port 443 written out", "https://example.com:443/p", "https://example.com:443/p"],
    ["a sub-domain", "https://news.example.co.uk/", "https://news.example.co.uk/"],
    ["the first of two links", "https://one.example/a https://two.example/b", "https://one.example/a"],
    ["a code span before the link", "`https://code.example/` and https://real.example/", "https://real.example/"],
    [
      "an http address before an https one: only an https address is a link in a line",
      "http://old.example/ https://new.example/",
      "https://new.example/",
    ],
  ])("takes %s", (_name, text, link) => {
    expect(cardLinkOf(text)).toBe(link);
  });

  it.each([
    ["a line with no link", "just words"],
    ["an empty line", ""],
    ["an address in a code span", "`https://example.com/`"],
    ["an address in a fenced block", "```\nhttps://example.com/\n```"],
    ["an http address", "http://example.com/"],
    ["another scheme", "ftp://example.com/ javascript:alert(1) data:text/html,x"],
    ["a port other than 443", "https://example.com:8443/"],
    ["a port 80", "https://example.com:80/"],
    ["userinfo", "https://user:pass@example.com/"],
    ["a user without a password", "https://user@example.com/"],
    ["an IPv4 address", "https://10.0.0.1/"],
    ["a public-looking IPv4 address", "https://93.184.216.34/"],
    ["an IPv6 address", "https://[::1]/"],
    ["localhost", "https://localhost/"],
    ["a name with no dot", "https://intranet/"],
    ["a .internal name", "https://db.internal/"],
    ["a .local name", "https://printer.local/"],
    ["a .onion name", "https://abc.onion/"],
    ["a short IPv4 form", "https://127.1/"],
    ["a hex IPv4 form", "https://0x7f.1/"],
    ["a decimal IPv4 form", "https://2130706433/"],
    ["a sub-domain of localhost", "https://foo.localhost/"],
    ["localhost with a final dot", "https://localhost./"],
    ["a name with a final dot", "https://example.com./"],
    ["an address in angle brackets", "<https://example.com/a>"],
    ["a look-alike letter in the host", "https://exаmple.com/"],
  ])("takes none for %s", (_name, text) => {
    expect(cardLinkOf(text)).toBeUndefined();
  });

  it("looks at the first link only: when it is refused, a later good one does not stand in for it", () => {
    expect(cardLinkOf("https://10.0.0.1/ https://example.com/")).toBeUndefined();
    expect(cardLinkOf("https://example.com:8443/ https://example.com/")).toBeUndefined();
  });

  it("takes a link of 2,048 characters and none of 2,049", () => {
    expect(cardLinkOf(LONG(2048))).toBe(LONG(2048));
    expect(cardLinkOf(LONG(2049))).toBeUndefined();
    expect(cardLinkOf(`[x](${LONG(2049)})`)).toBeUndefined();
  });

  it("finds nothing in text of one repeated bracket or scheme, and ends (the test's own timeout holds a quadratic read)", () => {
    expect(cardLinkOf("[".repeat(100_000))).toBeUndefined();
    expect(cardLinkOf("https://".repeat(10_000))).toBeUndefined();
  });

  it("reads the host of a link whose fragment looks like an address as the page's host", () => {
    expect(cardLinkOf("https://example.com/#@10.0.0.1")).toBe("https://example.com/#@10.0.0.1");
  });
});

describe("cardLinkOf, where the Markdown holds the link", () => {
  it.each([
    ["a link in emphasis", "**[x](https://bold.example/p)**", "https://bold.example/p"],
    ["a link after an emphasis with none", "*plain* https://later.example/p", "https://later.example/p"],
    ["a link in a quote", "> https://quoted.example/p", "https://quoted.example/p"],
    ["a link in a list", "- one\n- https://listed.example/p", "https://listed.example/p"],
    [
      "a link in a paragraph after a quote with none",
      "> nothing here\n\nhttps://after.example/p",
      "https://after.example/p",
    ],
    ["a link after a block with none", "```\ncode\n```\n\nhttps://after.example/p", "https://after.example/p"],
  ])("takes %s", (_name, text, link) => {
    expect(cardLinkOf(text)).toBe(link);
  });
});

describe("normalisedUrl", () => {
  it("keeps a port other than 443", () => {
    expect(normalisedUrl("https://example.com:8443/p")).toBe("https://example.com:8443/p");
  });

  it("reads an address from its start only: a scheme in the middle is no address", () => {
    expect(normalisedUrl("xhttps://example.com/p")).toBe("https:///");
  });

  it.each([
    ["lower-cases the host", "https://EXAMPLE.Com/Path", "https://example.com/Path"],
    ["leaves the path's case", "https://example.com/A/b", "https://example.com/A/b"],
    ["drops the fragment", "https://example.com/p#section", "https://example.com/p"],
    ["drops the default port", "https://example.com:443/p", "https://example.com/p"],
    ["gives an empty path a slash", "https://example.com", "https://example.com/"],
    ["keeps the query", "https://example.com/p?a=1#x", "https://example.com/p?a=1"],
    ["keeps a sub-domain", "https://www.example.com/", "https://www.example.com/"],
  ])("%s", (_name, url, normal) => {
    expect(normalisedUrl(url)).toBe(normal);
  });

  it("is the same for the spellings of one page, so they share one card", () => {
    const spellings = ["https://Example.com:443/p#a", "https://example.com/p", "HTTPS://EXAMPLE.COM/p#b"];
    expect(new Set(spellings.map(normalisedUrl)).size).toBe(1);
  });

  it("is idempotent", () => {
    const once = normalisedUrl("https://EXAMPLE.com:443/a?b=1#c");
    expect(normalisedUrl(once)).toBe(once);
  });
});
