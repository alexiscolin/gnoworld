import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EMBED_PREFIXES } from "@gnoworld/schemas";
import { inlineScripts, outputs, pagesPolicy, policy, sha256 } from "./csp.ts";

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

describe("pagesPolicy", () => {
  it("allows every inline script of every page, by its hash", async () => {
    const expected = [...BASE];
    expected[1] = `script-src 'self' ${[await sha256("a()"), await sha256("b()")].sort().join(" ")}`;
    expect(await pagesPolicy(["<script>a()</script>", '<script src="/x.js"></script><script>b()</script>'])).toBe(
      expected.join("; "),
    );
  });

  it.each([
    ["no page at all", []],
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
  ])("fails the build on %s, which the policy would refuse in the browser", async (_, pages) => {
    await expect(pagesPolicy(pages)).rejects.toThrow(/^csp: /);
  });

  it("names the tag it refuses, cut at 40 characters, and what the policy says of it", async () => {
    const tag = `<p style="${"x".repeat(60)}">`;
    await expect(pagesPolicy([tag])).rejects.toThrow(
      new Error(`csp: a page holds ${tag.slice(0, 40)}, which the policy refuses`),
    );
  });

  it("leaves text that only reads like a handler or a style alone", async () => {
    await expect(pagesPolicy(["<p>onion=3; style=bold</p><script>a()</script>"])).resolves.toContain("'sha256-");
    await expect(pagesPolicy(['<p stylex="1">x</p><script>a()</script>'])).resolves.toContain("'sha256-");
    await expect(pagesPolicy(['<p title="<style>">x</p><script>a()</script>'])).resolves.toContain("'sha256-");
    await expect(pagesPolicy(['<script>const s = "<a onclick=";</script>'])).resolves.toContain("'sha256-");
    await expect(pagesPolicy(['<a href="/javascript:x">x</a><script>a()</script>'])).resolves.toContain("'sha256-");
  });
});

describe("outputs", () => {
  it.each([['"'], ["$"], ["\\"], ["\n"], ["\r"]])(
    "refuses a policy holding %j, which a host would read otherwise",
    (char) => {
      expect(() => outputs(`default-src 'none'${char}`)).toThrow(
        new RangeError("csp: a policy holds no quote, $, backslash or line break"),
      );
    },
  );

  it("writes the same policy for a host's _headers file and for nginx, on every answer", () => {
    expect(outputs("default-src 'none'")).toEqual({
      headers: "/*\n  Content-Security-Policy: default-src 'none'\n",
      nginx: `add_header Content-Security-Policy "default-src 'none'" always;\n`,
    });
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
