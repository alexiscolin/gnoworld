import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EMBED_PREFIXES } from "@gnoworld/schemas";
import { inlineScripts, outputs, pagePolicies, policy, sha256 } from "./csp.ts";
import { headerBlocks, headerRules, isDetach, nginxTable, policyLine } from "../tests/e2e/cspFiles.mjs";
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
    ["a bare src, with no value", "<script src>x</script>", []],
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

  // F2455: the shapes a tag's attributes take, as the HTML parser reads them: an empty quoted value is a value.
  it.each([
    ["an empty double-quoted attribute", `<script data-a="">x</script>`, ["x"]],
    ["an empty single-quoted attribute", `<script data-a=''>x</script>`, ["x"]],
    ["a > in a single-quoted attribute", `<script data-a='>'>x</script>`, ["x"]],
    // A name does not run on into a tag opener: `a<src` reads as `a` and `src`, so the script has a source and is not hashed,
    // the side that stays shut (the browser, which hashes nothing here, runs it under no hash and blocks it).
    ["a name that holds a <, which names a src after it", `<script a<src=x>alert(1)</script>`, []],
    ["a tag whose name only starts like script", `<scripty>x</script>`, []],
    ["a tag named script2", `<script2>x</script>`, []],
  ])("reads %s", (_, html, expected) => {
    expect(inlineScripts(html)).toEqual(expected);
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
    // One tag a page: the build stops at the first it refuses, so two in a page would each hide the other.
    ["a javascript: link in capitals", ["<a href=JAVASCRIPT:x>x</a>"]],
    ["a javascript: link with spaces around its =", ["<a href = javascript:x>x</a>"]],
    ["a javascript: link unquoted after a space", ["<a href= JavaScript:x>x</a>"]],
    ["a javascript: link with a space after its quote", ['<a href=" javascript:x">x</a>']],
    ["a javascript: link in single quotes", ["<a href='javascript:x'>x</a>"]],
    ["a javascript: form action", ["<form action=javascript:x>"]],
    ["a javascript: button formaction", ["<button formaction=javascript:x>x</button>"]],
    ["a javascript: frame source", ["<iframe src=javascript:x></iframe>"]],
    // The tag scan and the checks are blind to case, in every tag.
    ["a style element in capitals", ["<STYLE>p{}</STYLE>"]],
    ["a style attribute in capitals", ['<P STYLE="x">x</P>']],
    ["a javascript: link in capitals, in a tag in capitals", ['<A HREF="javascript:x">x</A>']],
    ["an inline handler in a tag with capitals", ["<Img OnError=a()>"]],
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
    // A comment is no tag: the scan starts at a letter, not at a bang.
    await expect(good("<!-- the style=bold rule -->")).resolves.toBeDefined();
  });

  // F2455: the pages are read in code-unit order, so the tag named in the error is the same on every machine.
  it("stops on the first bad page in code-unit order, whatever order the pages came in", async () => {
    const bad = (mark: string) => page().replace("</body>", `<p style="${mark}">x</p></body>`);
    const first = { "z/index.html": bad("z"), "a/index.html": bad("a") };
    await expect(pagePolicies(first)).rejects.toThrow(/<p style="a">/);
    const second = { "a/index.html": bad("a"), "z/index.html": bad("z") };
    await expect(pagePolicies(second)).rejects.toThrow(/<p style="a">/);
  });

  // F2455: what a module script may hold: a route id with a $ (`routes/w.$slug`), a route of several files, and at least one
  // import before the routes' table.
  it.each([
    ["a route id with a dollar", MODULE.replace('"routes/world"', '"routes/w.$slug"')],
    [
      "a route of three files",
      MODULE.replace(
        "{...route1_clientLoader,...route1_main}",
        "{...route1_clientLoader,...route1_main,...route1_action}",
      ),
    ],
  ])("builds a page whose module script has %s", async (_, module) => {
    expect(module).not.toBe(MODULE);
    await expect(one(page(module))).resolves.toBeDefined();
  });

  it.each([
    ["no import before its table", MODULE.slice(MODULE.indexOf("  \n  window"))],
    ["a route made of no file", MODULE.replace("{...route1_clientLoader,...route1_main}", "{}")],
    ["a route id with a space", MODULE.replace('"routes/world"', '"routes/a b"')],
  ])("fails the build on a module script with %s", async (_, module) => {
    expect(module).not.toBe(MODULE);
    await expect(one(page(module))).rejects.toThrow(/^csp: index\.html holds a script that is none of React Router's/);
  });

  // F2455: the context's JSON is an object; a string, a number, null or a boolean is none of React Router's.
  it.each([['"text"'], ["5"], ["null"], ["true"]])(
    "fails the build on a context script whose JSON is %s, not an object",
    async (json) => {
      const planted = CONTEXT.replace(
        /^(window\.__reactRouterContext = ).*?(;window\.__reactRouterContext\.stream = )/s,
        `$1${json}$2`,
      );
      expect(planted).not.toBe(CONTEXT);
      await expect(one(page().replace(CONTEXT, planted))).rejects.toThrow(
        /^csp: index\.html holds a script that is none of React Router's/,
      );
    },
  );

  // F2455: the loader data is a string literal of JSON, handed to the stream, and nothing else.
  it.each([
    ["a JSON object", 'window.__reactRouterContext.streamController.enqueue({"a":1});'],
    ["a number", "window.__reactRouterContext.streamController.enqueue(5);"],
    ["a string joined to code", 'window.__reactRouterContext.streamController.enqueue("a"+alert(1)+"b");'],
    ["a string with a raw line break", 'window.__reactRouterContext.streamController.enqueue("a\nb");'],
    ["a string left open", 'window.__reactRouterContext.streamController.enqueue("a);'],
  ])("fails the build on loader data that is %s, not a string literal", async (_, text) => {
    await expect(one(page(MODULE, text))).rejects.toThrow(
      /^csp: index\.html holds a script that is none of React Router's/,
    );
  });

  // F2455: the message cuts the script's text at 40 characters, not 39 or 41, and says whether it is none of React Router's or a second.
  it("names a planted script cut at 40 characters, and a second form likewise", async () => {
    const text = `alert(${"1".repeat(60)})`;
    await expect(one(`<script>${text}</script>`)).rejects.toThrow(
      new Error(`csp: index.html holds a script that is none of React Router's: ${JSON.stringify(text.slice(0, 40))}`),
    );
    const twice = CLOSE;
    await expect(one(`<script>${twice}</script><script>${twice}</script>`)).rejects.toThrow(
      new Error(
        `csp: index.html holds a React Router script twice or out of order: ${JSON.stringify(twice.slice(0, 40))}`,
      ),
    );
  });

  // F2455: a data block's text is no markup, whatever the case of its tag and however many blocks there are: the markup check
  // strips every script, in capitals too, before it reads a tag.
  it.each([
    ["one JSON-LD block", [`<script type="application/ld+json">{"a":"<a onclick=x>"}</script>`]],
    [
      "two JSON-LD blocks",
      [
        `<script type="application/ld+json">{"a":"<a onclick=x>"}</script>`,
        `<script type="application/ld+json">{"b":"<p style=x>"}</script>`,
      ],
    ],
    ["a JSON-LD block in capitals", [`<SCRIPT TYPE="APPLICATION/LD+JSON">{"a":"<a onclick=x>"}</SCRIPT>`]],
  ])("builds a page whose %s holds text that reads like a handler", async (_, blocks) => {
    await expect(one(`${blocks.join("")}<script>${CLOSE}</script>`)).resolves.toBeDefined();
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

  // _headers: a block is a path, then its indented headers (the build's one reader, tests/e2e/cspFiles.mjs).
  const blocks = headerBlocks;
  const matches = (rule: string, path: string): boolean =>
    new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(path);
  // The policy a host sends for a path: every rule that matches adds its line, and a rule's `! Content-Security-Policy` first
  // detaches what the earlier ones added (Cloudflare Pages' syntax).
  const csp = (headers: string, path: string): string[] => {
    let found: string[] = [];
    for (const [rule, lines] of blocks(headers)) {
      if (!matches(rule, path)) continue;
      if (lines.some(isDetach)) found = [];
      for (const line of lines) {
        const set = policyLine(line);
        if (set !== undefined) found.push(set);
      }
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

  // F2705: the catch-all `/*` names the scripts of both documents, so it can pass the cap where each page does; its error names it.
  it("names /* when the catch-all's header, made of both documents' hashes, passes in each page but not together", () => {
    const hashes = (letter: string, count: number) =>
      Array.from({ length: count }, (_, n) => `'sha256-${letter.repeat(42)}${String.fromCharCode(65 + n)}='`);
    const page = (letter: string) => `script-src 'self' ${hashes(letter, 20).join(" ")}`;
    const pages = { "index.html": page("a"), "__spa-fallback.html": page("b") };
    expect(() => outputs(pages)).toThrow(/^csp: the policy of \/\* makes a header of \d+ characters/);
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

  // nginx: a map of the decoded path, which the server's add_header reads ($csp). Each page is keyed at the paths a visitor
  // asks (a 401 answers before try_files) and at the $uri try_files leaves: its file, and for a slashed address the file
  // joined without merging slashes (F2460).
  const table = nginxTable;

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
      ["//index.html", ok],
      ["/index.html", ok],
      ["/w/bubble", other],
      ["/w/bubble/", other],
      ["/w/bubble//index.html", other],
      ["/w/bubble/index.html", other],
      ["/__spa-fallback.html", fallback],
    ] as const) {
      expect(map.get(key), key).toBe(expected);
    }
    // Nothing else: a key for each address, no more.
    expect([...map.keys()].sort()).toEqual(
      [
        "/",
        "//index.html",
        "/__spa-fallback.html",
        "/index.html",
        "/w/bubble",
        "/w/bubble/",
        "/w/bubble//index.html",
        "/w/bubble/index.html",
        "default",
      ].sort(),
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

  // F2454: a bucket of one element leaves no size free of collisions past a few dozen keys, so nginx warned 'could not build
  // optimal map_hash' at every start (48 worlds). The port is ngx_hash_init of nginx 1.30 (ngx_hash.c); until harness-c's `nginx -t`, it judges.
  describe("nginx's hash for the table (ngx_hash_init)", () => {
    const POINTER = 8;
    const MASK = (1n << 64n) - 1n;
    // ngx_hash_key_lc: key = key * 31 + c over the lower-cased bytes, in a 64-bit unsigned.
    const hashOf = (key: string): bigint => {
      let hash = 0n;
      for (const char of key.toLowerCase()) hash = (hash * 31n + BigInt(char.charCodeAt(0))) & MASK;
      return hash;
    };
    // NGX_HASH_ELT_SIZE: a pointer and the key and its length, rounded up to a pointer.
    const eltSize = (key: string): number => POINTER + Math.ceil((key.length + 2) / POINTER) * POINTER;

    interface Hashed {
      keys: string[];
      hashes: (readonly [number, number])[];
      room: number;
      maxSize: number;
    }
    // The table and the two sizes as nginx reads them, or undefined when it stops on them (a size of 0, a bucket under a key).
    function hashed(nginx: string): Hashed | undefined {
      const keys = [...table(nginx).keys()].filter((key) => key !== "default");
      const maxSize = Number(/^map_hash_max_size (\d+);$/m.exec(nginx)?.[1]);
      const bucketSize = Number(/^map_hash_bucket_size (\d+);$/m.exec(nginx)?.[1]);
      if (!(maxSize > 0) || !(bucketSize > 0)) return undefined;
      if (keys.some((key) => bucketSize < eltSize(key) + POINTER)) return undefined;
      const hashes = keys.map((key) => {
        const hash = hashOf(key);
        return [Number(hash >> 32n), Number(hash & 0xffffffffn)] as const;
      });
      return { keys, hashes, room: bucketSize - POINTER, maxSize };
    }

    // Whether the keys fit the buckets at this table size, as ngx_hash_init tests it.
    const fits = ({ keys, hashes, room }: Hashed, size: number): boolean => {
      const used = new Uint32Array(size);
      const high = 2 ** 32 % size;
      return keys.every((key, n) => {
        const [hi = 0, lo = 0] = hashes[n] ?? [];
        // (hi * 2^32 + lo) % size, kept under 2^53.
        const slot = ((((hi % size) * high) % size) + (lo % size)) % size;
        used[slot] = (used[slot] ?? 0) + eltSize(key);
        return (used[slot] ?? 0) <= room;
      });
    };

    // The size nginx starts its search at.
    const startOf = ({ keys, room, maxSize }: Hashed): number => {
      if (maxSize > 10000 && keys.length > 0 && Math.floor(maxSize / keys.length) < 100) return maxSize - 1000;
      return Math.floor(keys.length / Math.floor(room / (2 * POINTER))) || 1;
    };

    // What nginx does with the table at start: "fine", "warns" (the EMERG-free 'could not build optimal map_hash') or "stops".
    function nginxVerdict(nginx: string): "fine" | "warns" | "stops" {
      const read = hashed(nginx);
      if (read === undefined) return "stops";
      for (let size = startOf(read); size <= read.maxSize; size += 1) if (fits(read, size)) return "fine";
      return "warns";
    }

    // The pages of a build of `worlds` worlds: each at /w/ and at its canonical address, the way slice 5's 5d writes them.
    const build = (worlds: number, width: number) => {
      const { ok } = sample();
      const pages: Record<string, string> = { "index.html": ok, "__spa-fallback.html": ok, "net/onyx/index.html": ok };
      for (let n = 0; n < worlds; n += 1) {
        const slug = String(n).padStart(width, "s");
        pages[`w/${slug}/index.html`] = ok;
        pages[`net/onyx/w/${slug}/index.html`] = ok;
      }
      return outputs(pages, ["sw.js"], Number.POSITIVE_INFINITY).nginx;
    };

    it("judges a table it cannot hold: a bucket under its longest key stops nginx, a lone bucket for many keys warns", () => {
      const keys = (count: number) => Array.from({ length: count }, (_, n) => `    "/k${String(n)}" "x";\n`).join("");
      const conf = (size: number, bucket: number, count: number) =>
        `map_hash_max_size ${String(size)};\nmap_hash_bucket_size ${String(bucket)};\nmap $uri $csp {\n    default "x";\n${keys(count)}}\n`;
      expect(nginxVerdict(conf(2048, 64, 3))).toBe("fine");
      expect(nginxVerdict(conf(2048, 16, 3))).toBe("stops");
      // Five keys of one hash bucket's worth cannot all fit when only one bucket exists.
      expect(nginxVerdict(conf(1, 64, 40))).toBe("warns");
    });

    it.each([
      [48, 3],
      [48, 40],
      [1000, 3],
      [1000, 40],
    ])(
      "starts with no 'could not build optimal map_hash' warning at %i worlds named by %i characters",
      (worlds, width) => {
        expect(nginxVerdict(build(worlds, width))).toBe("fine");
      },
    );

    // A build of `pages` worlds' pages, plus the home (3 keys), the fallback (1) and `files` other files of 1 key each: the number of keys
    // is counted here, so a row at the edge of a size sits on it.
    const keysOf = (pages: number, width: number, files = 0) => {
      const { ok } = sample();
      const built: Record<string, string> = { "index.html": ok, "__spa-fallback.html": ok };
      for (let n = 0; n < pages; n += 1) built[`w/${String(n).padStart(width, "s")}/index.html`] = ok;
      for (let n = 0; n < files; n += 1) built[`f${String(n)}.html`] = ok;
      return outputs(built, [], Number.POSITIVE_INFINITY).nginx;
    };
    const sizesOf = (nginx: string) => ({
      size: Number(/^map_hash_max_size (\d+);$/m.exec(nginx)?.[1]),
      bucket: Number(/^map_hash_bucket_size (\d+);$/m.exec(nginx)?.[1]),
    });

    it.each([
      // 4 slots a key, from 2,048 (512 keys), doubling: the edge of a size is a key count of exactly a quarter of it.
      { pages: 127, files: 0, keys: 512, slots: 2048 },
      { pages: 127, files: 1, keys: 513, slots: 4096 },
      { pages: 255, files: 0, keys: 1024, slots: 4096 },
      { pages: 255, files: 1, keys: 1025, slots: 8192 },
      { pages: 511, files: 0, keys: 2048, slots: 8192 },
      { pages: 511, files: 1, keys: 2049, slots: 16384 },
      // Under the floor.
      { pages: 0, files: 0, keys: 4, slots: 2048 },
      { pages: 10, files: 0, keys: 44, slots: 2048 },
    ])("sizes the table for four slots a key: $pages pages and $files files make $keys keys, $slots slots", (row) => {
      const nginx = keysOf(row.pages, 3, row.files);
      expect([...table(nginx).keys()].filter((key) => key !== "default")).toHaveLength(row.keys);
      expect(sizesOf(nginx).size).toBe(row.slots);
    });

    it.each([
      // The longest key is /w/<name>//index.html: 31 characters of name make 46 of key and 232 bytes of bucket; 32 make 512.
      [3, 31, 256],
      [3, 32, 512],
      [3, 1, 256],
    ])("sizes a bucket of four keys: %i pages named by %i characters make a bucket of %i", (pages, width, bucket) => {
      const nginx = keysOf(pages, width);
      const longest = Math.max(...[...table(nginx).keys()].map((key) => eltSize(key)));
      expect(longest * 4 + POINTER).toBeLessThanOrEqual(bucket);
      expect(longest * 4 + POINTER).toBeGreaterThan(bucket / 2);
      expect(sizesOf(nginx).bucket).toBe(bucket);
    });

    // Names that differ in their letters, not only in a number: the hash spreads them otherwise.
    it("starts with no warning at 48 and at 1,000 worlds whose names differ in their letters", () => {
      const { ok } = sample();
      for (const worlds of [48, 1000]) {
        const built: Record<string, string> = { "index.html": ok, "__spa-fallback.html": ok };
        for (let n = 0; n < worlds; n += 1) {
          const name = `${(n * 7919).toString(36)}-${(n * 104729 + 13).toString(36)}`;
          built[`w/${name}/index.html`] = ok;
          built[`net/onyx/w/${name}/index.html`] = ok;
        }
        expect(nginxVerdict(outputs(built, ["sw.js"], Number.POSITIVE_INFINITY).nginx), String(worlds)).toBe("fine");
      }
    });
  });

  // F2455: the cases the mutants of csp.ts left alive.
  it("writes nginx's csp.conf whole: the two sizes, the default, then each key in code-unit order", () => {
    const { ok, other, fallback, policies } = sample();
    const bare = policy([]);
    expect(outputs(policies, ["sw.js"]).nginx).toBe(
      [
        "map_hash_max_size 2048;\nmap_hash_bucket_size 256;\nmap $uri $csp {\n",
        `    default "${bare}";\n`,
        `    "/" "${ok}";\n`,
        `    "//index.html" "${ok}";\n`,
        `    "/__spa-fallback.html" "${fallback}";\n`,
        `    "/index.html" "${ok}";\n`,
        `    "/w/bubble" "${other}";\n`,
        `    "/w/bubble/" "${other}";\n`,
        `    "/w/bubble//index.html" "${other}";\n`,
        `    "/w/bubble/index.html" "${other}";\n`,
        "}\n",
      ].join(""),
    );
  });

  it("names every hash of the home's and the fallback's scripts in the catch-all, not the first of each", () => {
    const five = (mark: string) =>
      policy(Array.from({ length: 5 }, (_, n) => `'sha256-${mark}${String(n).repeat(42)}='`));
    const home = five("H");
    const fallback = five("F");
    const hashes = [...home.matchAll(/'sha256-[^']+'/g), ...fallback.matchAll(/'sha256-[^']+'/g)].map(([hash]) => hash);
    expect(hashes).toHaveLength(10);
    const { headers } = outputs({ "index.html": home, "__spa-fallback.html": fallback });
    expect(csp(headers, "/nowhere")).toEqual([policy(hashes)]);
  });

  it("writes _headers whole: the catch-all, then each rule in code-unit order, each with its detach", () => {
    const { ok, other, fallback, any, policies } = sample();
    const bare = policy([]);
    expect(outputs(policies, ["sw.js"]).headers).toBe(
      [
        `/*\n  Content-Security-Policy: ${any}\n`,
        `/\n  ! Content-Security-Policy\n  Content-Security-Policy: ${ok}\n`,
        `/__spa-fallback.html\n  ! Content-Security-Policy\n  Content-Security-Policy: ${fallback}\n`,
        `/sw.js\n  ! Content-Security-Policy\n  Content-Security-Policy: ${bare}\n`,
        `/w/bubble\n  ! Content-Security-Policy\n  Content-Security-Policy: ${other}\n`,
        `/w/bubble/\n  ! Content-Security-Policy\n  Content-Security-Policy: ${other}\n`,
      ].join(""),
    );
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

  // F2459: the http block's first map sets the map module's hash sizes to their defaults (ngx_http_map_module.c:190-200),
  // so the table's own map_hash_max_size after it was a duplicate, and nginx did not start.
  it("reads the table before any other map, which would set the hash sizes first", () => {
    expect(conf.search(/^\s*map /m)).toBeGreaterThan(conf.indexOf("include /etc/nginx/csp.conf;"));
  });

  // F2460: try_files joins `$uri/index.html` without merging slashes (ngx_http_try_files_module.c:270-271), so `/w/bubble/`,
  // a directory, is served from `/w/bubble//index.html`, the $uri the table is read with: without that key the page got
  // the bare policy, and none of its scripts ran.
  it("keys each address of a page at the $uri that the root location's try_files leaves", () => {
    // The table is keyed for this line: a change to it changes the keys.
    expect(/location \/ \{\s*try_files ([^;]+);/.exec(conf)?.[1]).toBe("$uri $uri/index.html =404");
    // nginx tries `$uri`, then `$uri/index.html`, as files, and keeps the first the disk holds (which reads a doubled slash
    // as one), its $uri as joined.
    const files = ["index.html", "w/bubble/index.html", "__spa-fallback.html"];
    const served = (uri: string) =>
      [uri, `${uri}/index.html`].find((path) => files.includes(path.replace(/\/+/g, "/").slice(1))) ?? "(no file)";
    const home = policy([`'sha256-${"A".repeat(43)}='`]);
    const world = policy([`'sha256-${"B".repeat(43)}='`]);
    const fallback = policy([`'sha256-${"C".repeat(43)}='`]);
    const { nginx } = outputs({ "index.html": home, "w/bubble/index.html": world, "__spa-fallback.html": fallback });
    for (const [address, expected] of [
      ["/", home],
      ["/index.html", home],
      ["/w/bubble", world],
      ["/w/bubble/", world],
      ["/w/bubble/index.html", world],
      ["/__spa-fallback.html", fallback],
    ] as const) {
      expect(nginx, address).toContain(`    "${served(address)}" "${expected}";\n`);
    }
  });
});

describe("headerBlocks, policyLine and isDetach", () => {
  it("cut a file into its rules, each with its indented lines, and tell a policy from a detach", () => {
    const text = "/*\n  Content-Security-Policy: a\n/w\n  ! Content-Security-Policy\n  Content-Security-Policy: b\n\n";
    expect(headerBlocks(text)).toEqual([
      ["/*", ["  Content-Security-Policy: a"]],
      ["/w", ["  ! Content-Security-Policy", "  Content-Security-Policy: b"]],
    ]);
    expect(policyLine("  Content-Security-Policy: b")).toBe("b");
    expect(policyLine("  ! Content-Security-Policy")).toBeUndefined();
    expect(policyLine("/w")).toBeUndefined();
    expect(policyLine("  X-Other: c")).toBeUndefined();
    expect(isDetach("  ! Content-Security-Policy")).toBe(true);
    expect(isDetach("  Content-Security-Policy: b")).toBe(false);
  });
});

describe("headerRules", () => {
  it("reads each rule's address and its Content-Security-Policy line, and none of a detach", () => {
    const text = [
      "/*",
      "  Content-Security-Policy: catch all; script-src 'self'",
      "/w/bubble",
      "  ! Content-Security-Policy",
      "  Content-Security-Policy: bubble's",
      "/sw.js",
      "  ! Content-Security-Policy",
      "  X-Other: not a policy",
      "",
    ].join("\n");
    expect(headerRules(text)).toEqual(
      new Map([
        ["/*", "catch all; script-src 'self'"],
        ["/w/bubble", "bubble's"],
      ]),
    );
  });

  it("reads what the build writes: each address of a page to its policy, the worker's to the bare one", () => {
    const ok = policy([`'sha256-${"A".repeat(43)}='`]);
    const other = policy([`'sha256-${"B".repeat(43)}='`]);
    const rules = headerRules(outputs({ "index.html": ok, "w/bubble/index.html": other }, ["sw.js"]).headers);
    expect([...rules.keys()].sort()).toEqual(["/", "/*", "/sw.js", "/w/bubble", "/w/bubble/"]);
    expect(rules.get("/")).toBe(ok);
    expect(rules.get("/w/bubble/")).toBe(other);
    expect(rules.get("/sw.js")).toBe(policy([]));
  });
});

describe("nginxTable", () => {
  it("reads each key, quoted or not, to its value, the default included, and no directive", () => {
    const text = [
      "map_hash_max_size 2048;",
      "map_hash_bucket_size 64;",
      "map $uri $csp {",
      '    default "bare";',
      '    "/" "home";',
      '    "/w/bubble//index.html" "a; b";',
      "}",
      "",
    ].join("\n");
    expect(nginxTable(text)).toEqual(
      new Map([
        ["default", "bare"],
        ["/", "home"],
        ["/w/bubble//index.html", "a; b"],
      ]),
    );
  });

  it("reads what the build writes", () => {
    const ok = policy([`'sha256-${"A".repeat(43)}='`]);
    const table = nginxTable(outputs({ "index.html": ok }).nginx);
    expect([...table.keys()].sort()).toEqual(["//index.html", "/", "/index.html", "default"].sort());
    expect(table.get("/")).toBe(ok);
    expect(table.get("default")).toBe(policy([]));
  });
});

// StrykerJS runs the tests in a sandbox whose sources it has instrumented (every string reads as a mutant switch): a test that
// reads a source file reads the real one, outside the sandbox (F2703).
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url.replace(/\/\.stryker-tmp\/sandbox-[^/]+\//, "/")), "utf8");

// F2457, DRY (Alexis's explicit rule): nothing is written twice. The parsers are read in one file (tests/e2e/cspFiles.mjs);
// the files that read the build's output import them, and hold no reading of their own, in any shape.
describe("the readers of the build's output", () => {
  const OWN_READERS = [
    // A policy line or a rule's address cut out by hand.
    /Content-Security-Policy: \(\.\+\)/,
    /startsWith\("\s*Content-Security-Policy: "\)/,
    /split\(\/\\n\(\?=\\S\)\/\)/,
    // A key and its value cut out of nginx's table, quoted or not.
    /\(\[\^"\\s\]\+\)/,
  ];
  it.each([
    ["app/tests/e2e/serve.mjs", "../tests/e2e/serve.mjs"],
    ["app/tests/e2e/csp.spec.ts", "../tests/e2e/csp.spec.ts"],
    ["app/src/dataFiles.test.ts", "./dataFiles.test.ts"],
    ["app/src/csp.test.ts", "./csp.test.ts"],
  ])("%s imports them and holds no reader of _headers or of nginx's table of its own", (_, path) => {
    const source = read(path);
    for (const reader of OWN_READERS) expect(source).not.toMatch(reader);
    // An import line of the shared file, not a mention of it.
    expect(source).toMatch(/^import \{[^}]*\} from "[^"]*cspFiles\.mjs";$/m);
  });
});

// F2457: serve.mjs rewrote the inline scripts of a release with a looser rule (/ld\+json/i): a script whose data-type said
// application/ld+json went unhashed there, and ran in the journeys where the build's policy refuses it (F2360's class). It
// also wrote the policy a second time (`script-src 'self'`): it takes both from csp.ts.
describe("serve.mjs's policy of a release", () => {
  const source = read("../tests/e2e/serve.mjs");
  it("takes the scripts to hash, their hashes and the policy from csp.ts: inlineScripts, sha256 and policy", () => {
    expect(source).toMatch(
      /^import \{(?=[^}]*\binlineScripts\b)(?=[^}]*\bsha256\b)(?=[^}]*\bpolicy\b)[^}]*\} from "\.\.\/\.\.\/src\/csp\.ts";$/m,
    );
    expect(source).toMatch(/inlineScripts\(/);
    expect(source).toMatch(/sha256\b/);
    expect(source).toMatch(/\bpolicy\(/);
  });
  it("holds no rule of its own on a script's type or source, and no policy text", () => {
    expect(source).not.toMatch(/ld\\\+json/i);
    expect(source).not.toMatch(/<script\\b/i);
    expect(source).not.toContain("script-src");
    expect(source).not.toContain("sha256-");
  });
});

// F2456: StrykerJS never mutates a module-level constant (ignoreStatic), so a guard built at the top of csp.ts is a guard no
// test is measured against (.claude/rules/typescript.md, F412). Each is built inside the function that applies it: a top-level
// constant is one string, one number, a list of strings or a function, nothing else (a pattern, however it is written, a joined text too).
describe("csp.ts's guards", () => {
  const source = read("./csp.ts");
  const constants = source
    .split(/\n(?=(?:export )?(?:const|let|var|function|async function|class|type|interface)\b)/)
    .filter((chunk) => /^(?:export )?(?:const|let|var)\b/.test(chunk))
    .map((chunk) => {
      const [head = "", ...rest] = chunk.split(/ =(?!>)\s*/);
      const name = /(?:const|let|var) ([A-Za-z_]+)/.exec(head)?.[1] ?? head;
      // The comment lines that precede the next statement are no part of the value.
      const value = rest.join(" = ").replace(/^\s*\/\/.*$/gm, "");
      return [name, value.trim()] as const;
    });
  // A list of strings, or of the names of the constants that are (the policy's directives name SCRIPT_SRC).
  const listOfStrings = /^\[\s*(?:(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|[A-Z_]+)\s*,\s*)*\]/;
  const simple = (value: string): boolean =>
    /^(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\d[\d_]*)\s*;/.test(value) ||
    /^(?:async\s*)?(?:\([^)]*\)\s*(?::[^=>]+)?=>|function\b)/.test(value) ||
    listOfStrings.test(value);

  it("reads the constants it checks: the policy's words, the forms' texts and the caps", () => {
    const names = constants.map(([name]) => name);
    for (const name of ["SCRIPT_SRC", "DIRECTIVES", "SCROLL_RESTORATION", "HEADER_CAP", "RULE_CAP"])
      expect(names).toContain(name);
    expect(names.length).toBeGreaterThan(8);
  });

  it("are built inside their functions: a module-level constant is a string, a number, a list of strings or a function", () => {
    expect(constants.filter(([, value]) => !simple(value)).map(([name]) => name)).toEqual([]);
  });
});
