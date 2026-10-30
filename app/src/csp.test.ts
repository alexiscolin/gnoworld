import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EMBED_PREFIXES } from "@gnoworld/schemas";
import { inlineScripts, outputs, pagePolicies, policy, sha256 } from "./csp.ts";
import { CLOSE, CONTEXT, ENQUEUE, MODULE, MODULE_LIST, page, SCROLL } from "./cspFixture.ts";

// The loader data of the list page: other bytes than a world's.
const ENQUEUE_LIST = String.raw`window.__reactRouterContext.streamController.enqueue("[{\"_1\":2},\"loaderData\",{\"_3\":-5}]\n");`;

// Written out, not built from the module: a directive that loosens must fail here.
const BASE = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  // 4g: the accepted services' players, each on a click (docs/decisions.md, 2026-10-26), by their players' paths
  // (F885); Imgur's not read yet.
  "frame-src https://www.youtube-nocookie.com/embed/ https://player.vimeo.com/video/ https://giphy.com/embed/",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

describe("policy", () => {
  it("names each directive, none unsafe, and adds no hash when there is no inline script", () => {
    expect(policy([])).toBe(BASE.join("; "));
  });

  it("allows each inline script by its hash, once, in code-unit order whatever order the pages gave", () => {
    const hash = (first: string): string => `'sha256-${first}${"A".repeat(42)}='`;
    // + before B before a before b: code units, not a locale's order, so every machine writes the same.
    const [plus, upper, lower, last] = [hash("+"), hash("B"), hash("a"), hash("b")];
    const expected = [...BASE];
    expected[1] = `script-src 'self' ${plus} ${upper} ${lower} ${last}`;
    expect(policy([last, lower, upper, plus, lower])).toBe(expected.join("; "));
  });

  // One well-formed source, so each case below fails on what it adds, not on a length or a quote.
  const ok = `'sha256-${"A".repeat(43)}='`;

  it.each([
    ["'unsafe-inline'"],
    ["'unsafe-eval'"],
    ["*"],
    [`${ok}; script-src *`],
    [`${ok} 'unsafe-inline'`],
    [`'unsafe-inline' ${ok}`],
    [`'sha256-${"A".repeat(42)}='`],
    [`'sha256-${"A".repeat(44)}='`],
    [`'sha384-${"A".repeat(64)}'`],
    [`'sha256-${"A".repeat(43)}=\n'`],
  ])("refuses %j, which is not one SHA-256 source", (source) => {
    expect(policy([ok])).toContain(ok);
    expect(() => policy([source])).toThrow(new RangeError(`csp: ${source} is no SHA-256 source`));
  });
});

describe("sha256", () => {
  // Vectors computed apart, by Python's hashlib on the UTF-8 bytes.
  it.each([
    ["", "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='"],
    ["alert(1)", "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='"],
    ["é", "'sha256-SplVfkAzw1Od4utlRyAXytX5VX96BiWgnxw/biumnEw='"],
  ])("writes %j as the source the policy names", async (text, expected) => {
    expect(await sha256(text)).toBe(expected);
  });
});

describe("inlineScripts", () => {
  it.each([
    ["an attribute that only ends in src", '<script data-src="x">a()</script>', ["a()"]],
    ["src as an attribute's value", '<script id="src">a()</script>', ["a()"]],
    ["SRC in capitals", '<script SRC="/x.js"></script>', []],
    ["a > in a quoted attribute", '<script data-x="a>b">a()</script>', ["a()"]],
    ["a single-quoted attribute", "<script id='ab'>a()</script>", ["a()"]],
    ["a > in a single-quoted attribute", "<script data-x='a>b'>a()</script>", ["a()"]],
    ["src with a space before its =", '<script src ="/x.js"></script>', []],
    ["src after a slash, which HTML reads as an attribute", '<script/src="/x.js"></script>', []],
    ["src glued to the quote before it", '<script type="module"src="/x.js"></script>', []],
    ["an attribute that only starts with src", '<script srcx="y">a()</script>', ["a()"]],
    ["a closing tag with a space", "<script>a()</script >b", ["a()"]],
    ["a closing tag with a newline", "<script>a()</script\n>b", ["a()"]],
    ["a tag that only starts like the closing one", "<script>a()</scripty>b()</script>", ["a()</scripty>b()"]],
    ["a start tag written self-closing, which HTML reads as open", "<script/>a()</script>", ["a()"]],
    [
      "JSON-LD, a data block the browser never runs and so leaves unhashed, and an import map, hashed",
      '<script type="application/ld+json">{"a":1}</script><script type="importmap">{}</script>',
      ["{}"],
    ],
    [
      "JSON-LD in capitals, with other attributes and a single quote",
      "<script id=x TYPE='Application/LD+JSON'>{}</script>",
      [],
    ],
    [
      "a first type that runs, then a JSON-LD one, which the parser ignores",
      '<script type="module" type="application/ld+json">a()</script>',
      ["a()"],
    ],
    ["JSON-LD with an unquoted type", "<script type=application/ld+json>{}</script>", []],
    [
      "JSON-LD with an unquoted type and an attribute after it",
      "<script type=application/ld+json async>{}</script>",
      [],
    ],
    ["a script of an unquoted type that runs", "<script type=module>a()</script>", ["a()"]],
    ["JSON-LD with spaces around the =", '<script type = "application/ld+json">{}</script>', []],
    ["JSON-LD with a newline around the =", '<script type\n=\n"application/ld+json">{}</script>', []],
    ["JSON-LD with a padded value", '<script type=" application/ld+json ">{}</script>', []],
    [
      "a type that is only the name of another attribute",
      '<script data-type="application/ld+json">a()</script>',
      ["a()"],
    ],
    [
      "a type inside another attribute's value, which is no type",
      '<script data-x=" type=application/ld+json">alert(1)</script>',
      ["alert(1)"],
    ],
    [
      "a type inside a single-quoted value, where it holds quotes of its own",
      `<script title='a type="application/ld+json"'>alert(1)</script>`,
      ["alert(1)"],
    ],
    ["a src inside another attribute's value, which loads nothing", '<script data-x=" src=y">a()</script>', ["a()"]],
    ["a type whose padding hides a different value", '<script type=" module ">a()</script>', ["a()"]],
    ["a type that only holds ld+json", '<script type="text/ld+json-x">a()</script>', ["a()"]],
    ["a script inside a comment, hashed: its text is ours", "<!-- <script>a()</script> -->", ["a()"]],
    ["CR LF and a lone CR, as the browser reads them: LF", "<script>a\r\nb\rc</script>", ["a\nb\nc"]],
  ])("reads %s", (_, html, scripts) => {
    expect(inlineScripts(html)).toEqual(scripts);
  });

  it("takes the text of each script the page holds, and none that loads a file", () => {
    const html = [
      "<html><head><script>a()</script>",
      '<script type="module" async="">import "/x.js";\n</script>',
      '<script src="/assets/y.js"></script>',
      "<SCRIPT>b()</SCRIPT><script></script>",
      '<script defer src="/z.js" type="module"></script>',
      "<p>no &lt;script&gt; here</p></head></html>",
    ].join("");
    expect(inlineScripts(html)).toEqual(["a()", 'import "/x.js";\n', "b()", ""]);
  });

  it("ends a script at its first closing tag, as the browser does", () => {
    expect(inlineScripts("<script>x = '</script>';</script>")).toEqual(["x = '"]);
  });
});

// One page of the build, as pagePolicies reads it (a key is the file's path under build/client).
const one = (html: string) => pagePolicies({ "index.html": html });

describe("pagePolicies", () => {
  it("gives each page a policy of its own: its scripts' hashes, none of another page's, whatever the order of the pages", async () => {
    const world = page(MODULE, ENQUEUE);
    const list = page(MODULE_LIST, ENQUEUE_LIST);
    const policies = await pagePolicies({ "w/bubble/index.html": world, "list/index.html": list });
    expect(Object.keys(policies).sort()).toEqual(["list/index.html", "w/bubble/index.html"]);
    const shared = [SCROLL, CONTEXT, CLOSE];
    const hashes = async (texts: string[]) => policy(await Promise.all(texts.map(sha256)));
    expect(policies["w/bubble/index.html"]).toBe(await hashes([...shared, MODULE, ENQUEUE]));
    expect(policies["list/index.html"]).toBe(await hashes([...shared, MODULE_LIST, ENQUEUE_LIST]));
    // The other's own script is no part of a page's policy.
    expect(policies["w/bubble/index.html"]).not.toContain(await sha256(MODULE_LIST));
    expect(policies["list/index.html"]).not.toContain(await sha256(MODULE));
    expect(await pagePolicies({ "list/index.html": list, "w/bubble/index.html": world })).toEqual(policies);
  });

  it("names five hashes for a page of React Router's, and none for its JSON-LD, a data block", async () => {
    const policies = await one(page());
    expect(policies["index.html"]?.match(/'sha256-/g)).toHaveLength(5);
    expect(policies["index.html"]).not.toContain(await sha256('{"@type":"WebPage"}'));
  });

  it("keeps every page's policy under a host's 2,000-character line, at 16 times a page", async () => {
    const pages = Object.fromEntries(
      Array.from({ length: 16 * 30 }, (_, n) => [
        `w/world-${String(n)}/index.html`,
        page(MODULE, `${ENQUEUE.slice(0, -3)}${String(n)}");`),
      ]),
    );
    const lengths = Object.values(await pagePolicies(pages)).map((each) => each.length);
    expect(lengths).toHaveLength(480);
    expect(Math.max(...lengths)).toBeLessThan(2000);
  });

  // F475: the build hashed any inline script it found, so a script planted in a page was allowed.
  it.each([
    ["a planted script", `<script>alert(1)</script>`],
    // F2360, tier 1: a type read inside another attribute's value made the script a data block, neither pinned nor hashed.
    [
      "a planted script hiding a JSON-LD type in an attribute's value",
      `<script data-x=" type=application/ld+json">alert(1)</script>`,
    ],
    [
      "a planted script hiding a JSON-LD type in a single-quoted value",
      `<script title='a type="application/ld+json"'>alert(1)</script>`,
    ],
    ["a planted script of a type named data-type", `<script data-type="application/ld+json">alert(1)</script>`],
    ["an empty script", "<script></script>"],
    [
      "a planted script that loads a file from another host",
      `<script type="module">import "https://evil.test/x.js";</script>`,
    ],
    ["a planted script after React Router's own, in its own tag", `<script>${CLOSE}alert(1)</script>`],
    ["a statement added to the stream's close", `<script>${CLOSE}alert(1);</script>`],
    ["a statement before the stream's close", `<script>alert(1);${CLOSE}</script>`],
    ["a statement added to the context", `<script>${CONTEXT};alert(1)</script>`],
    ["a context whose object is no JSON", `<script>${CONTEXT.replace('"ssr":false', "ssr:alert(1)")}</script>`],
    ["a statement added to the scroll restoration", `<script>${SCROLL};alert(1)</script>`],
    [
      "a scroll restoration whose body was changed",
      `<script>${SCROLL.replace("scrollTo(0, storedY)", "alert(1)")}</script>`,
    ],
    ["a loader string that ends early and runs code", `<script>${ENQUEUE.replace(/"\);$/, '");alert(1);("')}</script>`],
    ["a loader string joined to code", `<script>${ENQUEUE.replace(/"\);$/, '"+alert(1));')}</script>`],
    [
      "a module script that imports another host's file",
      `<script type="module" async="">${MODULE}\nimport "https://evil.test/x.js";</script>`,
    ],
    [
      "a module script that imports a file outside /assets/",
      `<script type="module" async="">import "/evil.js";</script>`,
    ],
    ["a module script with a statement of its own", `<script type="module" async="">${MODULE}\nalert(1);</script>`],
    [
      "a module script's dynamic import of another host",
      `<script type="module" async="">${MODULE.replace(/import\("\/assets[^)]*\);$/, 'import("https://evil.test/x.js");')}</script>`,
    ],
  ])("fails the build on %s, which is none of React Router's script forms", async (_, planted) => {
    const html = page().replace("</body>", `${planted}</body>`);
    await expect(one(html)).rejects.toThrow(/^csp: .*index\.html.*script/s);
    // Each form is refused alone too, not only beside the five that are allowed.
    await expect(one(`<html>${planted}</html>`)).rejects.toThrow(/^csp: /);
  });

  // F456 and F475, tier 1: a form is pinned at its anchors and its middle, not only its end. Every change of the text that is
  // fixed, a character deleted, replaced or a statement put before it, must fail the build; the payload (a JSON, a string,
  // an asset's name, the blank run between two statements) is free.
  const free = (text: string, patterns: RegExp[]): boolean[] => {
    const mask = Array.from({ length: text.length + 1 }, () => false);
    for (const pattern of patterns)
      for (const match of text.matchAll(pattern)) {
        const [from = 0, to = 0] = match.indices?.[1] ?? [];
        for (let at = from; at < to; at += 1) mask[at] = true;
      }
    return mask;
  };
  it.each([
    ["the scroll restoration", SCROLL, []],
    ["the stream's close", CLOSE, []],
    ["the context", CONTEXT, [/__reactRouterContext = (\{.*\});window/dg]],
    ["the loader data", ENQUEUE, [/enqueue\("(.*")\);$/dg]],
    [
      "the module script",
      MODULE,
      [/"\/assets\/([\w.-]+)\.js"/dg, /"([\w/.$-]+)":route/dg, /route\d+_(\w+)/dg, /;\n(\s*)window/dg],
    ],
  ] as [string, string, RegExp[]][])("refuses every change to the fixed text of %s", async (_, form, payload) => {
    await expect(one(`<script>${form}</script>`)).resolves.toBeDefined();
    const mask = free(form, payload);
    const accepted: string[] = [];
    let tried = 0;
    for (let at = 0; at <= form.length; at += 1) {
      if (mask[at]) continue;
      const mutants = [
        ["put a statement before", `${form.slice(0, at)}alert(1);${form.slice(at)}`],
        ...(at < form.length
          ? [
              ["delete", `${form.slice(0, at)}${form.slice(at + 1)}`],
              ["replace by #", `${form.slice(0, at)}#${form.slice(at + 1)}`],
            ]
          : []),
      ] as [string, string][];
      for (const [how, mutant] of mutants) {
        tried += 1;
        const refused = await one(`<script>${mutant}</script>`).then(
          () => false,
          () => true,
        );
        if (!refused)
          accepted.push(`${how} at ${String(at)} (${JSON.stringify(form.slice(Math.max(0, at - 8), at + 8))})`);
      }
    }
    expect(tried).toBeGreaterThan(100);
    expect(accepted).toEqual([]);
  });

  // F2450: the pin read each script alone, so a second well-formed one (another context, another loader data, a repeat of the
  // close) was hashed and allowed. A page holds React Router's scripts once each, in its order.
  const planted = (...texts: string[]): string =>
    page().replace("</body>", `${texts.map((text) => `<script>${text}</script>`).join("")}</body>`);
  it.each([
    ["a second context with other JSON", planted(CONTEXT.replace('"basename":"/"', '"basename":"/evil"'))],
    ["a second context, the same", planted(CONTEXT)],
    ["a second loader data", planted(ENQUEUE_LIST)],
    ["a second loader data, the same", planted(ENQUEUE)],
    ["a second close", planted(CLOSE)],
    ["a second scroll restoration", planted(SCROLL)],
    [
      "a second module script",
      page().replace("</body>", `<script type="module" async="">${MODULE_LIST}</script></body>`),
    ],
    [
      "the close before the loader data",
      [
        `<script>${CONTEXT}</script>`,
        `<script type="module" async="">${MODULE}</script>`,
        `<script>${CLOSE}</script>`,
        `<script>${ENQUEUE}</script>`,
      ].join(""),
    ],
    ["the context after the module script", `<script type="module">${MODULE}</script><script>${CONTEXT}</script>`],
  ])("fails the build on %s, a script of React Router's form that the page does not hold", async (_, html) => {
    await expect(one(html)).rejects.toThrow(/^csp: index\.html holds .* twice or out of order/s);
  });

  // The fallback page of a real build: no scroll restoration (read from a build, 2026-10-30).
  it("takes the fallback page's set: the context, the module script, the loader data and the close", async () => {
    const fallback = [CONTEXT, `<MODULE>`, ENQUEUE, CLOSE]
      .map((text) =>
        text === "<MODULE>" ? `<script type="module" async="">${MODULE}</script>` : `<script>${text}</script>`,
      )
      .join("");
    await expect(one(fallback)).resolves.toBeDefined();
  });

  // F2362: the text of a JSON-LD block closes it at the first closing tag; what follows is a script of the page.
  it("fails the build on a JSON-LD whose text closed its own tag and opened a script", async () => {
    const hostile = page(MODULE, ENQUEUE, `{"description":"</script><script>alert(1)</script>"}`);
    await expect(one(hostile)).rejects.toThrow(/^csp: .*script/s);
    // The same text as React Router writes it, escaped, is data: allowed.
    const escaped = page(
      MODULE,
      ENQUEUE,
      String.raw`{"description":"\u003c/script\u003e\u003cscript\u003ealert(1)\u003c/script\u003e"}`,
    );
    await expect(one(escaped)).resolves.toBeDefined();
  });

  it.each([
    ["an inline handler", ['<button onclick="a()">x</button>']],
    ["an inline handler in capitals, after a newline", ['<img\nONERROR="a()" src="x.png">']],
    ["a style element", ["<style>p{}</style>"]],
    ["a style attribute", ['<p style="color:red">x</p>']],
    ["a style attribute with spaces around its =", ['<p style = "x">x</p>']],
    ["a handler with a space before its =", ['<button onclick ="a()">x</button>']],
    ["a handler after a slash, which HTML reads as an attribute", ["<img/onerror=a()>"]],
    ["a handler glued to the quote before it", ['<img src="x"onerror=a()>']],
    ["a style glued to a single quote", ["<p id='a'style='color:red'>x</p>"]],
    ["a handler after a > in a quoted value", ['<img alt="a>b" onerror=x()>']],
    ["a style after a > in a quoted value", ['<p title="x>" style="color:red">t</p>']],
    ["a javascript: link", ['<a href="javascript:alert(1)">x</a>']],
    [
      "a javascript: link in capitals, after spaces, unquoted",
      ["<a href= JavaScript:x>x</a>", "<form action=javascript:x>"],
    ],
  ])("fails the build on %s, which the policy would refuse in the browser", async (_, markup) => {
    // The second page is good: one bad page stops the build.
    await expect(pagePolicies({ "good/index.html": page(), "bad/index.html": markup.join("") })).rejects.toThrow(
      /^csp: /,
    );
  });

  it("fails the build when it holds no page", async () => {
    await expect(pagePolicies({})).rejects.toThrow(new Error("csp: the build holds no page"));
  });

  it("names the tag it refuses, cut at 40 characters, and what the policy says of it", async () => {
    const tag = `<p style="${"x".repeat(60)}">`;
    await expect(one(tag)).rejects.toThrow(
      new Error(`csp: a page holds ${tag.slice(0, 40)}, which the policy refuses`),
    );
  });

  it("leaves text that only reads like a handler or a style alone", async () => {
    const good = (markup: string) => one(`${markup}<script>${CLOSE}</script>`);
    await expect(good("<p>onion=3; style=bold</p>")).resolves.toBeDefined();
    await expect(good('<p stylex="1">x</p>')).resolves.toBeDefined();
    await expect(good('<p title="<style>">x</p>')).resolves.toBeDefined();
    await expect(good('<a href="/javascript:x">x</a>')).resolves.toBeDefined();
  });
});

// The policies as a host takes them. A page is a file under build/client; its addresses are the ones a host answers it at.
describe("outputs", () => {
  // Built inside each test: a value a test asserts is computed there, never at collection time (F2356).
  const sample = () => {
    const ok = policy([`'sha256-${"A".repeat(43)}='`]);
    const other = policy([`'sha256-${"B".repeat(43)}='`]);
    const fallback = policy([`'sha256-${"C".repeat(43)}='`]);
    // What a path no page names gets (F2451): the home's scripts and the fallback's, so either document runs there.
    const any = policy([`'sha256-${"A".repeat(43)}='`, `'sha256-${"C".repeat(43)}='`]);
    return {
      ok,
      other,
      fallback,
      any,
      policies: { "index.html": ok, "w/bubble/index.html": other, "__spa-fallback.html": fallback },
    };
  };
  const NAME = new RangeError("csp: a page's name holds only a-z, 0-9, /, ., _ and -");

  it.each([['"'], ["$"], ["\\"], ["\n"], ["\r"]])(
    "refuses a policy holding %j, which a host would read otherwise",
    (char) => {
      expect(() => outputs({ "index.html": `default-src 'none'${char}` })).toThrow(
        new RangeError("csp: a policy holds no quote, $, backslash or line break"),
      );
    },
  );

  // Every character outside the file names the build writes: the nginx table reads a quote, $, space, ; or { otherwise, and
  // matches a key ignoring case, so two names that differ in case are one key.
  it.each([
    ['"'],
    ["$"],
    [" "],
    [";"],
    ["{"],
    ["}"],
    ["\n"],
    ["\\"],
    ["'"],
    ["#"],
    ["A"],
    ["é"],
    ["*"],
    ["%"],
    ["~"],
    ["\t"],
  ])("refuses a page whose file name holds %j, which the nginx table would read otherwise", (char) => {
    const { ok } = sample();
    expect(() => outputs({ [`a${char}b/index.html`]: ok })).toThrow(NAME);
    expect(() => outputs({ "index.html": ok }, [`a${char}b.js`])).toThrow(NAME);
  });

  it("takes every character a page's file name has in a real build", () => {
    const { ok } = sample();
    expect(() => outputs({ "net/onyx/w/a-b_c.d9/index.html": ok })).not.toThrow();
  });

  // _headers: a block is a path, then its indented headers.
  const blocks = (headers: string): [string, string[]][] =>
    headers
      .split(/\n(?=\S)/)
      .filter((block) => block.trim() !== "")
      .map((block) => {
        const [path = "", ...lines] = block.split("\n");
        return [path, lines.filter((line) => line.trim() !== "")];
      });
  const matches = (rule: string, path: string): boolean =>
    new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(path);
  // The policy a host sends for a path: every rule that matches adds its line, and a rule's `! Content-Security-Policy` first
  // detaches what the earlier ones added (Cloudflare Pages' syntax).
  const csp = (headers: string, path: string): string[] => {
    let found: string[] = [];
    for (const [rule, lines] of blocks(headers)) {
      if (!matches(rule, path)) continue;
      if (lines.includes("  ! Content-Security-Policy")) found = [];
      for (const line of lines)
        if (line.startsWith("  Content-Security-Policy: "))
          found.push(line.slice("  Content-Security-Policy: ".length));
    }
    return found;
  };

  it("writes each page's policy in _headers for its addresses, and one policy at any other path", () => {
    const { ok, other, fallback, any, policies } = sample();
    const { headers } = outputs(policies);
    // One policy to each address: a page's rule detaches the catch-all's before it sets its own, so a host sends one.
    for (const [path, expected] of [
      ["/", ok],
      ["/w/bubble", other],
      ["/w/bubble/", other],
      ["/__spa-fallback.html", fallback],
      // F2451: a path the build did not pre-render is served a document that runs the app, so it has a policy too.
      ["/w/other", any],
      ["/nowhere", any],
      ["/w/Bubble", any],
      ["/w/bubble/index.html", any],
    ] as const) {
      expect(csp(headers, path), path).toEqual([expected]);
    }
  });

  it("writes the catch-all first, and a detach in each other rule", () => {
    const { headers } = outputs(sample().policies, ["sw.js"]);
    const rules = blocks(headers);
    expect(rules[0]?.[0]).toBe("/*");
    expect(rules[0]?.[1]).toHaveLength(1);
    for (const [path, lines] of rules.slice(1)) {
      expect(lines[0], path).toBe("  ! Content-Security-Policy");
      expect(lines, path).toHaveLength(2);
    }
  });

  it("gives a path no page names the bare policy when the build holds neither the home nor the fallback", () => {
    const { other } = sample();
    const { headers } = outputs({ "w/bubble/index.html": other });
    expect(csp(headers, "/nowhere")).toEqual([policy([])]);
  });

  // Only a document or a worker obeys a policy. The worker's script is the one file of the build that is neither a page nor
  // inert: a _headers host gives it the policy with no hash (decisions, 2026-10-30); the manifest, the icons, the assets and
  // the data files run nowhere, and have none there. (nginx sends the bare policy on every other answer, below.)
  it("gives the service worker's script the bare policy in _headers, and any other file the catch-all's", () => {
    const { any, policies } = sample();
    const { headers } = outputs(policies, ["sw.js"]);
    expect(csp(headers, "/sw.js")).toEqual([policy([])]);
    // The manifest, the icons, the assets and the data files run nowhere: the catch-all's policy changes nothing for them.
    for (const path of ["/manifest.webmanifest", "/icon-192.png", "/assets/a-1.js", "/w/bubble.data"])
      expect(csp(headers, path), path).toEqual([any]);
    for (const path of ["/", "/w/bubble", "/w/bubble/", "/__spa-fallback.html"])
      expect(csp(headers, path), path).toHaveLength(1);
    expect(csp(outputs(policies).headers, "/sw.js")).toEqual([any]);
  });

  it("writes no _headers line past a host's 2,000 characters when each policy is under", () => {
    const { headers } = outputs(sample().policies);
    for (const line of headers.split("\n")) expect(line.length).toBeLessThan(2000);
  });

  // F2211: the cap was measured, never enforced. The line a host counts is "  Content-Security-Policy: " (27) and the policy.
  it.each([
    [1999, true],
    [2000, false],
    [2001, false],
  ])("a _headers line of %i characters is %s", (length, passes) => {
    const policy = "x".repeat(length - "  Content-Security-Policy: ".length);
    const build = () => outputs({ "w/long/index.html": policy });
    if (passes) expect(build).not.toThrow();
    else
      expect(build).toThrow(
        new RangeError(
          `csp: the policy of w/long/index.html makes a header of ${String(length)} characters, past a host's 2,000`,
        ),
      );
  });

  // F2452: Cloudflare Pages takes at most 100 header rules (developers.cloudflare.com/pages/configuration/headers). The
  // catch-all is one; a file that is no directory index is one rule.
  it.each([
    [99, true],
    [100, true],
    [101, false],
  ])("a _headers of %i rules is %s", (rules, passes) => {
    const { ok } = sample();
    const pages = Object.fromEntries(Array.from({ length: rules - 1 }, (_, n) => [`p${String(n)}.html`, ok]));
    const build = () => outputs(pages);
    if (passes) expect(build).not.toThrow();
    else expect(build).toThrow(new RangeError("csp: _headers holds 101 rules, past a host's 100"));
  });

  it("counts the worker's rule and a directory page's two", () => {
    const { ok } = sample();
    const dirs = Object.fromEntries(Array.from({ length: 49 }, (_, n) => [`d${String(n)}/index.html`, ok]));
    // 1 catch-all + 98 + the worker = 100; one page more is 102.
    expect(() => outputs(dirs, ["sw.js"])).not.toThrow();
    expect(() => outputs({ ...dirs, "d49/index.html": ok }, ["sw.js"])).toThrow(
      new RangeError("csp: _headers holds 102 rules, past a host's 100"),
    );
  });

  it("writes the same bytes whatever the order of the pages it is given", () => {
    const { policies } = sample();
    const forward = outputs(policies, ["sw.js", "a.json"]);
    const reversed = outputs(Object.fromEntries(Object.entries(policies).reverse()), ["a.json", "sw.js"]);
    expect(reversed.headers).toBe(forward.headers);
    expect(reversed.nginx).toBe(forward.nginx);
    // Sorted, not in the order given: the catch-all first, then the home's rule.
    expect(forward.headers.startsWith("/*\n")).toBe(true);
  });

  // nginx: a map of the decoded path, which the server's add_header reads ($csp). try_files serves a page at its directory
  // and at its file, so each page is keyed at both and at its slashless address.
  const table = (nginx: string): Map<string, string> =>
    new Map(
      [...nginx.matchAll(/^\s*("?)([^"\s]+)\1\s+"([^"]*)";$/gm)].map((match) => [match[2] ?? "", match[3] ?? ""]),
    );

  it("writes an nginx map from each address of a page to its policy, and a bare default", () => {
    const { ok, other, fallback, policies } = sample();
    const { nginx } = outputs(policies);
    expect(nginx).toMatch(/^map \$uri \$csp \{$/m);
    expect(nginx).not.toContain("add_header");
    // Every key quoted, as nginx reads it whatever its characters.
    expect(nginx).toContain(`    "/w/bubble/index.html" "${other}";\n`);
    const map = table(nginx);
    expect(map.get("default")).toBe(policy([]));
    for (const [key, expected] of [
      ["/", ok],
      ["/index.html", ok],
      ["/w/bubble", other],
      ["/w/bubble/", other],
      ["/w/bubble/index.html", other],
      ["/__spa-fallback.html", fallback],
    ] as const) {
      expect(map.get(key), key).toBe(expected);
    }
    // Nothing else: a key for each address, no more.
    expect([...map.keys()].sort()).toEqual(
      ["/", "/__spa-fallback.html", "/index.html", "/w/bubble", "/w/bubble/", "/w/bubble/index.html", "default"].sort(),
    );
  });

  // A key longer than nginx's bucket, or more keys than its table holds, and the web image does not start (nginx.org/en/docs/
  // hash.html). The directives come with the table, sized by its keys; a bucket holds a key, 8 + 2 bytes and a pointer (8).
  it.each([
    ["the home alone", 0, 0],
    ["480 pages of short names", 480, 3],
    ["480 pages of the longest names the data allows (40 characters in a 40-character universe)", 480, 40],
  ])("sets the map's hash sizes to what its keys need: %s", (_, count, slug) => {
    const { ok } = sample();
    const pages: Record<string, string> = { "index.html": ok };
    for (let n = 0; n < count; n += 1) {
      const name = String(n).padStart(slug, "s");
      pages[`net/${"u".repeat(slug)}/w/${name}/index.html`] = ok;
    }
    // Past a _headers host's 100 rules, which the table does not care about.
    const { nginx } = outputs(pages, [], Number.POSITIVE_INFINITY);
    const keys = [...table(nginx).keys()].filter((key) => key !== "default");
    const size = Number(/^map_hash_max_size (\d+);$/m.exec(nginx)?.[1]);
    const bucket = Number(/^map_hash_bucket_size (\d+);$/m.exec(nginx)?.[1]);
    const longest = Math.max(...keys.map((key) => key.length));
    expect(keys.length).toBeGreaterThanOrEqual(count === 0 ? 2 : count * 3);
    expect(size).toBeGreaterThanOrEqual(2048);
    expect(size).toBeGreaterThanOrEqual(keys.length + 1);
    expect(bucket).toBeGreaterThanOrEqual(64);
    expect(bucket).toBeGreaterThanOrEqual(longest + 8 + 2 + 8);
    // nginx rounds a bucket to a cache line: a power of two stays whole.
    expect(Math.log2(bucket) % 1).toBe(0);
    if (slug === 40) expect(longest).toBeGreaterThanOrEqual(99);
  });
});

// The demo's web image builds the app from the workspaces it imports; one it leaves out fails only in Docker, which
// the gate never runs (F2133: slice 4's runtime imports of core and schemas reached Alexis's deploy/test.sh alone).
// csp.ts writes the nginx file that image serves; the image is tested here, beside it.
it("the web image copies each workspace the app imports, its package.json before the install and its src", () => {
  const app = z
    .object({ dependencies: z.record(z.string(), z.string()) })
    .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")));
  const dockerfile = readFileSync(new URL("../../deploy/web/Dockerfile", import.meta.url), "utf8");
  const workspaces = Object.keys(app.dependencies)
    .filter((name) => name.startsWith("@gnoworld/"))
    .map((name) => name.slice("@gnoworld/".length));
  expect(workspaces).toContain("core");
  const install = dockerfile.indexOf("RUN pnpm install");
  for (const name of workspaces) {
    const manifest = dockerfile.indexOf(`COPY packages/${name}/package.json packages/${name}/\n`);
    expect(manifest, `packages/${name}/package.json`).toBeGreaterThan(-1);
    expect(manifest, `packages/${name}/package.json before the install`).toBeLessThan(install);
    expect(dockerfile, `packages/${name}/src`).toContain(`COPY packages/${name}/src packages/${name}/src\n`);
  }
});

// The data files' embed allowlist (packages/schemas) is a second copy of frame-src: one drifting from the other would let
// a page carry an embed the browser blocks, or the policy allow a player no file may name (F885).
describe("the policy's frame-src and the data files' embeds", () => {
  it("name the same player paths", () => {
    const frame = policy([])
      .split("; ")
      .find((directive) => directive.startsWith("frame-src "));
    expect(frame?.slice("frame-src ".length).split(" ").sort()).toEqual([...EMBED_PREFIXES].sort());
  });
});

// nginx reads the build's table (csp.conf) in its http block and sets the header of each answer from it: before this, one
// policy for all pages in the server block. The image keeps copying the build's csp.conf to /etc/nginx/csp.conf.
describe("the web image's nginx", () => {
  const conf = readFileSync(new URL("../../deploy/web/nginx.conf", import.meta.url), "utf8");
  const dockerfile = readFileSync(new URL("../../deploy/web/Dockerfile", import.meta.url), "utf8");

  it("reads the table in the http block, before any server, and sets the header from its variable on every answer", () => {
    const include = conf.indexOf("include /etc/nginx/csp.conf;");
    expect(include).toBeGreaterThan(conf.indexOf("http {"));
    expect(include).toBeLessThan(conf.indexOf("server {"));
    expect(conf).toContain("add_header Content-Security-Policy $csp always;");
    expect(conf.indexOf("add_header Content-Security-Policy $csp always;")).toBeGreaterThan(conf.indexOf("server {"));
    // One include of the table, not a second one in the server block, which would set one policy for all pages again.
    expect(conf.match(/include \/etc\/nginx\/csp\.conf;/g)).toHaveLength(1);
  });

  it("copies the build's csp.conf where the include reads it", () => {
    expect(dockerfile).toContain("--from=build /repo/app/build/csp.conf /etc/nginx/csp.conf");
  });
});
