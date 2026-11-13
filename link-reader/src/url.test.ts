import { describe, expect, it } from "vitest";
import { readableUrl } from "./url.ts";

// The reader trusts nothing the server says: the rule is checked again here, on the same table as the page's `cardLinkOf` plus what
// only the reader sees (a redirect's target, an image's address).
describe("the URL rule", () => {
  it.each([
    "https://example.com/",
    "https://example.com",
    "https://example.com/a/b?c=d&e=f#frag",
    "https://EXAMPLE.com:443/x",
    "https://sub.example.co.uk/path",
    // A name that resolves private is the DNS check's: this rule reads names, and `*.nip.io` is a name (fetch.test.ts refuses it).
    "https://10.0.0.1.nip.io/",
  ])("accepts %s", (raw) => {
    expect(readableUrl(raw)?.protocol).toBe("https:");
  });

  it("hands back the parsed URL, its host in lower case", () => {
    expect(readableUrl("https://EXAMPLE.com:443/x")?.hostname).toBe("example.com");
  });

  it.each([
    ["http", "http://example.com/"],
    ["another port", "https://example.com:8443/"],
    ["port 80 over https", "https://example.com:80/"],
    ["userinfo", "https://user@example.com/"],
    ["userinfo with a password", "https://user:secret@example.com/"],
    ["an empty userinfo", "https://@example.com/"],
    ["an IPv4 literal", "https://127.0.0.1/"],
    ["a private IPv4 literal", "https://10.0.0.1/"],
    ["the metadata address", "https://169.254.169.254/latest/meta-data"],
    ["an IPv6 literal", "https://[::1]/"],
    ["a mapped IPv6 literal", "https://[::ffff:10.0.0.1]/"],
    ["a decimal IP", "https://2130706433/"],
    ["a hex IP", "https://0x7f.1/"],
    ["localhost", "https://localhost/"],
    ["a .local name", "https://printer.local/"],
    ["a .localhost name", "https://a.localhost/"],
    ["a .internal name", "https://db.internal/"],
    ["a .lan name", "https://nas.lan/"],
    ["a .onion name", "https://abcdefgh.onion/"],
    ["a .home.arpa name", "https://box.home.arpa/"],
    ["a name of one label", "https://intranet/"],
    ["a trailing dot", "https://example.com./"],
    ["a space in the name", "https://exa mple.com/"],
    ["ftp", "ftp://example.com/"],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:text/html,<b>x</b>"],
    ["a protocol-relative address", "//example.com/"],
    ["a path alone", "/card"],
    ["an octal IP", "https://0177.0.0.1/"],
    ["a short IP", "https://127.1/"],
    ["a hex IP in one number", "https://0x7f000001/"],
    ["a full-width IP", "https://\uff11\uff12\uff17.0.0.1/"],
    ["a full-width dot", "https://127\u30020\u30020\u30021/"],
    ["an IPv6 with a zone", "https://[fe80::1%25eth0]/"],
    ["an @ after the host name", "https://example.com@127.0.0.1/"],
    [".localdomain", "https://box.localdomain/"],
    [".corp", "https://wiki.corp/"],
    [".test", "https://a.test/"],
    [".invalid", "https://a.invalid/"],
    [".example", "https://a.example/"],
    ["nothing", ""],
    ["not a URL", "not a url"],
  ])("refuses %s", (_name, raw) => {
    expect(readableUrl(raw)).toBeUndefined();
  });

  it("hands back what the URL parser made of the text, never the text: tabs and newlines dropped, a backslash a slash", () => {
    expect(readableUrl("https://exa\tmple.com/")?.hostname).toBe("example.com");
    expect(readableUrl("https://example.com\n.evil.org/")?.hostname).toBe("example.com.evil.org");
    expect(readableUrl("https://example.com\\@127.0.0.1/")?.hostname).toBe("example.com");
    expect(readableUrl("https://example.com\\@127.0.0.1/")?.pathname).toBe("/@127.0.0.1/");
  });

  it("accepts 2,048 characters and refuses 2,049", () => {
    const base = "https://example.com/";
    expect(readableUrl(base + "a".repeat(2048 - base.length))).toBeDefined();
    expect(readableUrl(base + "a".repeat(2049 - base.length))).toBeUndefined();
  });

  it("reads an international name as its punycode, which the rule then holds to the same names-only shape", () => {
    expect(readableUrl("https://münchen.de/")?.hostname).toBe("xn--mnchen-3ya.de");
  });
});
