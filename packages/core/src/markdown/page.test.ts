import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { MAX_QUOTE_DEPTH, markdown, type Inline } from "./markdown.ts";
import { originOf } from "./address.ts";
import { PAGE_MAX_BYTES, page, type FormField, type Page, type PageBlock } from "./page.ts";

// The same seed as core's other properties, so the gate never flaps on one.
const PROPERTY = { seed: 20261017, numRuns: 300 };
const text = (value: string): Inline => ({ type: "text", text: value });
const strong = (...children: Inline[]): Inline => ({ type: "strong", children });
const link = (href: string, label = href): Inline => ({ type: "link", href, children: [text(label)] });
const paragraph = (...children: Inline[]): PageBlock => ({ type: "paragraph", children });
const heading = (level: 1 | 2 | 3 | 4 | 5 | 6, ...children: Inline[]): PageBlock => ({
  type: "heading",
  level,
  children,
});
const br: Inline = { type: "break" };
const field = (tag: FormField["tag"], name: string, rest: Partial<FormField> = {}): FormField => ({
  tag,
  name,
  inputType: "",
  value: "",
  placeholder: "",
  description: "",
  flags: "",
  ...rest,
});

// The blocks of a page that fits the cap; a page past it is a test's failure here.
function blocksOf(source: string, origin?: string): PageBlock[] {
  const read = origin === undefined ? page(source) : page(source, { origin });
  if (read.kind !== "page") throw new Error("the page was read as too big");
  return read.blocks;
}
const reads = (source: string, ...blocks: PageBlock[]) => {
  expect(blocksOf(source)).toStrictEqual(blocks);
};

// Each inline node of a tree, and each block, in order.
function* inlinesOf(blocks: readonly PageBlock[]): Generator<Inline> {
  const within = function* (nodes: readonly Inline[]): Generator<Inline> {
    for (const node of nodes) {
      yield node;
      if ("children" in node) yield* within(node.children);
    }
  };
  for (const block of blocks) {
    if (block.type === "quote") yield* inlinesOf(block.children);
    else if (block.type === "list") for (const item of block.items) yield* within(item);
    else if (block.type === "paragraph" || block.type === "heading") yield* within(block.children);
  }
}
function* blocksIn(blocks: readonly PageBlock[]): Generator<PageBlock> {
  for (const block of blocks) {
    yield block;
    if (block.type === "quote") yield* blocksIn(block.children);
  }
}
// Everything a reader sees of a page, as one string: text, code, a form's every field.
function shown(blocks: readonly PageBlock[]): string {
  const parts: string[] = [];
  for (const block of blocksIn(blocks)) {
    if (block.type === "codeBlock") parts.push(block.text);
    if (block.type === "form") {
      parts.push(block.exec, block.path);
      for (const f of block.fields)
        parts.push(f.tag, f.name, f.inputType, f.value, f.placeholder, f.description, f.flags);
    }
  }
  for (const node of inlinesOf(blocks)) {
    if (node.type === "text" || node.type === "code") parts.push(node.text);
    if (node.type === "link") parts.push(node.href);
  }
  return parts.join("\n");
}
const quoteDepth = (blocks: readonly PageBlock[]): number =>
  Math.max(0, ...blocks.map((b) => (b.type === "quote" ? 1 + quoteDepth(b.children) : 0)));

// The keys each node holds, and no other: a renderer draws these and nothing else.
const KEYS: Readonly<Record<string, string>> = {
  text: "text,type",
  strong: "children,type",
  em: "children,type",
  strike: "children,type",
  code: "text,type",
  link: "children,href,type",
  mention: "address,type",
  break: "type",
  paragraph: "children,type",
  heading: "children,level,type",
  codeBlock: "text,type",
  quote: "children,type",
  form: "exec,fields,path,type",
};
const FIELD_KEYS = "description,flags,inputType,name,placeholder,tag,value";
const FORM_TAGS = new Set(["input", "textarea", "select", "other"]);
// An address a link may name: the chat's own rule (markdown.test.ts): https, a plain ASCII host, a port, then a path with no
// space, backslash, quote, angle, backtick or control or format character; never a user before an @.
const HREF = /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(:\d{1,5})?([/?#][^\s\\<>"`\p{C}]*)?$/u;
const ACCOUNT = /^g1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/;
const keysOf = (node: object) => Object.keys(node).sort().join(",");

function leafAllowed(node: Inline, inLink: boolean): boolean {
  if (node.type === "text" || node.type === "code") return node.text !== "";
  if (node.type === "mention") return !inLink && ACCOUNT.test(node.address);
  return node.type === "break";
}
function inlineAllowed(node: Inline, inLink: boolean): boolean {
  if (KEYS[node.type] !== keysOf(node)) return false;
  if (!("children" in node)) return leafAllowed(node, inLink);
  if (node.type === "link" && (inLink || !HREF.test(node.href))) return false;
  return node.children.length > 0 && inlinesAllowed(node.children, inLink || node.type === "link");
}
// Nodes side by side, each allowed, no two texts in a row.
function inlinesAllowed(nodes: readonly Inline[], inLink: boolean): boolean {
  return nodes.every(
    (node, n) => inlineAllowed(node, inLink) && !(node.type === "text" && nodes[n - 1]?.type === "text"),
  );
}
// A paragraph's lines, split at its breaks.
function linesOf(children: readonly Inline[]): Inline[][] {
  const lines: Inline[][] = [[]];
  for (const child of children) {
    if (child.type === "break") lines.push([]);
    else lines.at(-1)?.push(child);
  }
  return lines;
}
const fieldAllowed = (f: FormField): boolean =>
  keysOf(f) === FIELD_KEYS && FORM_TAGS.has(f.tag) && Object.values(f).every((v) => typeof v === "string");
const keysAllowed = (block: PageBlock): boolean =>
  (block.type === "list" && block.ordered ? "items,ordered,start,type" : (KEYS[block.type] ?? "items,ordered,type")) ===
  keysOf(block);
const BLOCKS: Readonly<Record<string, (block: PageBlock) => boolean>> = {
  paragraph: (b) =>
    b.type === "paragraph" && linesOf(b.children).every((line) => line.length > 0 && inlinesAllowed(line, false)),
  heading: (b) =>
    b.type === "heading" && b.level >= 1 && b.level <= 6 && b.children.length > 0 && inlinesAllowed(b.children, false),
  quote: (b) => b.type === "quote" && b.children.length > 0 && b.children.every(blockAllowed),
  list: (b) => b.type === "list" && b.items.length > 0 && b.items.every((item) => inlinesAllowed(item, false)),
  form: (b) => b.type === "form" && b.fields.every(fieldAllowed),
  codeBlock: (b) => b.type === "codeBlock",
};
const blockAllowed = (block: PageBlock): boolean => keysAllowed(block) && (BLOCKS[block.type]?.(block) ?? false);

/** Every node of the tree is on the allowlist, with its own keys alone, and every link is a plain https address that is
 * never inside a link: the property the plan's threat model asks of the reader (docs/plans/slice-5-part-2.md §3). */
function expectAllowlisted(blocks: readonly PageBlock[]): void {
  expect(blocks.every(blockAllowed)).toBe(true);
}

describe("page: the blocks a realm's Markdown reads into", () => {
  test("reads nothing as no blocks", () => {
    reads("");
    reads("  \n\n ");
  });

  test.each([1, 2, 3, 4, 5, 6] as const)("reads %i hashes and a space as a heading of that level", (level) => {
    reads(`${"#".repeat(level)} Title`, heading(level, text("Title")));
  });

  test("keeps marks and links in a heading", () => {
    reads("## The **big** one", heading(2, text("The "), strong(text("big")), text(" one")));
    reads("# [docs](https://gno.land/docs)", heading(1, link("https://gno.land/docs", "docs")));
  });

  test.each(["####### seven", "#no-space", "\\# escaped", "# "])("keeps %j as text, not a heading", (source) => {
    const [block, ...rest] = blocksOf(source);
    expect(rest).toStrictEqual([]);
    expect(block?.type).toBe("paragraph");
  });

  test("reads the chat's blocks as the chat does: paragraphs, code, quotes, lists", () => {
    reads("one\ntwo", paragraph(text("one"), br, text("two")));
    reads("```\ncode **kept**\n```", { type: "codeBlock", text: "code **kept**" });
    reads("> quoted", { type: "quote", children: [paragraph(text("quoted"))] });
    reads("- a\n- b", { type: "list", ordered: false, items: [[text("a")], [text("b")]] });
    reads("3. a\n4. b", { type: "list", ordered: true, start: 3, items: [[text("a")], [text("b")]] });
  });

  test("reads a whole page: a heading, its paragraph, a list, in order", () => {
    reads(
      "# Realm\n\nWhat it does.\n\n## Use\n\n- one\n- two",
      heading(1, text("Realm")),
      paragraph(text("What it does.")),
      heading(2, text("Use")),
      { type: "list", ordered: false, items: [[text("one")], [text("two")]] },
    );
  });

  test("reads a CRLF page as an LF one", () => {
    expect(blocksOf("# A\r\n\r\ntext\r\n- x")).toStrictEqual(blocksOf("# A\n\ntext\n- x"));
  });
});

// 8k: the chat's underline is the chat's alone. gnoweb reads no `++` (goldmark with GFM's extensions), so a page shows it
// as written, and a bare address keeps GFM's bounds: a `+` neither starts one nor is left out of its end.
describe("page: no underline, as gnoweb", () => {
  test("keeps `++` as text, in a heading and a list too", () => {
    reads("++x++ and ++y z++", paragraph(text("++x++ and ++y z++")));
    reads("## ++x++", heading(2, text("++x++")));
    reads("- ++x++", { type: "list", ordered: false, items: [[text("++x++")]] });
  });

  test("links a bare address with its `+` at the end, and none after a `+`", () => {
    reads("see https://a.test/c++", paragraph(text("see "), link("https://a.test/c++")));
    reads("a+https://a.test/x", paragraph(text("a+https://a.test/x")));
  });
});

describe("page: links and images", () => {
  test.each([
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](data:text/html,<script>alert(1)</script>)",
    "[click](http://plain.test)",
    "[click](//evil.test/x)",
    "[click](vbscript:x)",
  ])("shows %j as text, with no link", (source) => {
    reads(source, paragraph(text(source)));
  });

  test("turns an image into a link to it, labelled by its alt text", () => {
    reads("![logo](https://x.test/a.png)", paragraph(link("https://x.test/a.png", "logo")));
    reads("see ![](https://x.test/a.png) here", paragraph(text("see "), link("https://x.test/a.png"), text(" here")));
  });

  test("shows an image that is not an https one as text", () => {
    reads("![a](javascript:alert(1))", paragraph(text("![a](javascript:alert(1))")));
    reads("![a](data:image/png;base64,AAAA)", paragraph(text("![a](data:image/png;base64,AAAA)")));
  });

  // Past the inline depth an image's opener is text, as a link's is: no node deeper than the cap, and its address still no image.
  test("keeps an image opened past the inline depth as text", () => {
    const deep = "*a ".repeat(8) + "![x](https://x.test/a.png)";
    const words = [...inlinesOf(blocksOf(deep))].flatMap((node) => (node.type === "text" ? [node.text] : []));
    expect(words.join("")).toContain("![");
  });

  test("makes no image node of any kind", () => {
    const nodes = [...inlinesOf(blocksOf("![a](https://x.test/a.png) ![b](https://x.test/b.svg)"))];
    expect(nodes.every((node) => node.type !== ("image" as string))).toBe(true);
  });

  test("resolves a link to a path against gnoweb's origin, when given one", () => {
    expect(blocksOf("[Vote](/r/demo/dao:vote)", "https://gno.land")).toStrictEqual([
      paragraph(link("https://gno.land/r/demo/dao:vote", "Vote")),
    ]);
  });

  test("leaves a link to a path as text with no origin", () => {
    reads("[Vote](/r/demo/dao)", paragraph(text("[Vote](/r/demo/dao)")));
  });

  test.each(["[a](//evil.test/x)", "[a](/\\evil.test)", "[a](/%2f%2fevil.test)"])(
    "never lets %j leave gnoweb's origin",
    (source) => {
      const hrefs = [...inlinesOf(blocksOf(source, "https://gno.land"))].flatMap((n) =>
        n.type === "link" ? [n.href] : [],
      );
      expect(hrefs.every((href) => /^https:\/\/gno\.land(\/|$)/.test(href))).toBe(true);
    },
  );

  test("keeps no link inside a link: a badge, an image in a link, leaves the link a text", () => {
    const blocks = blocksOf("[![logo](https://x.test/a.png)](https://y.test)");
    expectAllowlisted(blocks);
    const links = [...inlinesOf(blocks)].flatMap((n) => (n.type === "link" ? [n.href] : []));
    expect(links).toStrictEqual(["https://x.test/a.png", "https://y.test"]);
    expect(shown(blocks)).toContain("logo");
  });

  test.each([
    "![x](https://gno.land@evil.example/a.png)",
    "![x](https://user:pw@evil.example/a.png)",
    "[x](https://gno.land@evil.example/)",
    "[x](https://a.test/p\\q)",
  ])("never makes a link of %j: an address with a user or a backslash stays text", (source) => {
    reads(source, paragraph(text(source)));
  });

  // What a path link becomes, for each form gnoweb's realms write; with an origin, it is a link under it, or text.
  test.each([
    ["[a](/)", "https://gno.land/"],
    ["[a](/r/demo/dao)", "https://gno.land/r/demo/dao"],
    ["[a](/r/demo/dao:vote)", "https://gno.land/r/demo/dao:vote"],
    ["[a](/r/demo/dao$help&x=1)", "https://gno.land/r/demo/dao$help&x=1"],
    ["[a](/r/demo/dao?q=1#top)", "https://gno.land/r/demo/dao?q=1#top"],
    ["![a](/static/a.png)", "https://gno.land/static/a.png"],
  ])("resolves %s to %s under the origin", (source, href) => {
    expect(blocksOf(source, "https://gno.land")).toStrictEqual([paragraph(link(href, "a"))]);
  });

  // The forms a realm writes that name no path of the origin: no base to resolve them against, so text.
  test.each([
    "[a](./x)",
    "[a](../x)",
    "[a](:vote)",
    "[a]($help)",
    "[a](#top)",
    "[a](?q=1)",
    "[a](u/alice)",
    "[a](//x.test)",
    "[a](/\\x)",
    '[a](/r/x"y)',
    "[a](/r/x y)",
    "[a](/r/x<)",
    "[a](/r/x\\y)",
    "[a](/r/x`y)",
    "[a](/r/x\u202ey)",
    "[a](/r/x\u0007y)",
  ])("leaves %j as text, with or without an origin", (source) => {
    reads(source, paragraph(text(source)));
    expect(blocksOf(source, "https://gno.land")).toStrictEqual([paragraph(text(source))]);
  });

  test.each([
    ["https://gno.land/", "https://gno.land"],
    ["https://gno.land:8888", "https://gno.land:8888"],
  ])("takes the origin %j as %j", (origin, base) => {
    expect(blocksOf("[a](/r/x)", origin)).toStrictEqual([paragraph(link(`${base}/r/x`, "a"))]);
  });

  // An origin that is no https host: a path link stays text, an https link still comes out.
  test.each([
    "https://gno.land/r/x",
    "http://gno.land",
    "",
    "gno.land",
    "https://user@gno.land",
    "https://gno.land?x=1",
    "//gno.land",
  ])("ignores the origin %j: a path stays text, an https link stays a link", (origin) => {
    expect(blocksOf("[a](/r/x) [b](https://b.test)", origin)).toStrictEqual([
      paragraph(text("[a](/r/x) "), link("https://b.test", "b")),
    ]);
  });
});

describe("page: gnoweb's tags, degraded (ADR-0002 §4; gnoweb at gno v1.5.0)", () => {
  test("turns an alert into a quote that opens with its kind in bold", () => {
    reads("> [!NOTE]\n> Be careful.", {
      type: "quote",
      children: [paragraph(strong(text("Note"))), paragraph(text("Be careful."))],
    });
  });

  test("opens an alert with its title when it has one, whatever its kind", () => {
    reads("> [!WARNING] Heads up\n> Read this.", {
      type: "quote",
      children: [paragraph(strong(text("Heads up"))), paragraph(text("Read this."))],
    });
  });

  test.each([
    ["[!TIP]", "Tip"],
    ["[!caution]", "Caution"],
    ["[!SUCCESS]", "Success"],
    ["[!INFO]", "Info"],
    ["[!MYSTERY]", "Info"],
    ["[!NOTE]-", "Note"],
  ])("labels the alert %s as %s", (mark, label) => {
    reads(`> ${mark}\n> body`, {
      type: "quote",
      children: [paragraph(strong(text(label))), paragraph(text("body"))],
    });
  });

  test("keeps an alert's title as text, whatever it holds", () => {
    const [block] = blocksOf("> [!NOTE] <script>alert(1)</script>\n> x");
    expect(shown([block ?? paragraph()])).toContain("<script>alert(1)</script>");
  });

  test("stacks columns: each column's blocks follow the one before, no tag shown", () => {
    reads(
      "<gno-columns>\nleft\n<gno-columns-sep>\n# right\n- r1\n</gno-columns>",
      paragraph(text("left")),
      heading(1, text("right")),
      { type: "list", ordered: false, items: [[text("r1")]] },
    );
  });

  test("accepts the self-closing separator too", () => {
    reads("<gno-columns>\na\n<gno-columns-sep/>\nb\n</gno-columns>", paragraph(text("a")), paragraph(text("b")));
  });

  test("keeps a separator outside columns as text", () => {
    reads("<gno-columns-sep>", paragraph(text("<gno-columns-sep>")));
  });

  test("turns a form into a Form block, one field a line, in order", () => {
    reads(
      [
        '<gno-form exec="Vote">',
        '  <gno-input name="who" type="text" placeholder="Your name" description="Who votes" />',
        '  <gno-textarea name="why" placeholder="Reason" />',
        '  <gno-select name="pick" value="yes" />',
        "</gno-form>",
      ].join("\n"),
      {
        type: "form",
        exec: "Vote",
        path: "",
        fields: [
          field("input", "who", { inputType: "text", placeholder: "Your name", description: "Who votes" }),
          field("textarea", "why", { placeholder: "Reason" }),
          field("select", "pick", { value: "yes" }),
        ],
      },
    );
  });

  // A form's opening on the page's last line has no line after it to close it: no form, and no field taken from past the page.
  test("makes no form of an opening on the page's last line", () => {
    const blocks = blocksOf('Vote below.\n<gno-form exec="Vote">');
    expect(blocks.some((block) => block.type === "form")).toBe(false);
  });

  test("gives a form with no exec an empty one, and an input with no type gnoweb's default, text", () => {
    reads('<gno-form>\n<gno-input name="a" />\n</gno-form>', {
      type: "form",
      exec: "",
      path: "",
      fields: [field("input", "a", { inputType: "text" })],
    });
  });

  test("shows a hidden field: its name and its value, with the type that says it is hidden", () => {
    reads('<gno-form exec="Send">\n<gno-input name="to" type="hidden" value="g1evil" />\n</gno-form>', {
      type: "form",
      exec: "Send",
      path: "",
      fields: [field("input", "to", { inputType: "hidden", value: "g1evil" })],
    });
  });

  test("shows a line of a form that is no field as an 'other' field holding that line", () => {
    reads('<gno-form>\n<script>alert(1)</script>\n<gno-input name="a" />\n</gno-form>', {
      type: "form",
      exec: "",
      path: "",
      fields: [field("other", "", { value: "<script>alert(1)</script>" }), field("input", "a", { inputType: "text" })],
    });
  });

  test("shows a line of two tags whole, so a hidden value after the first is still seen", () => {
    const line = '<gno-input name="a" /><gno-input name="b" type="hidden" value="x" />';
    reads(`<gno-form>\n${line}\n</gno-form>`, {
      type: "form",
      exec: "",
      path: "",
      fields: [field("other", "", { value: line })],
    });
  });

  test("shows a field with text after its tag, or a tag split over lines, whole", () => {
    const after = '<gno-input name="a" type="hidden" value="v" /> trailing';
    const split = '<gno-input name="a"\ntype="hidden" value="v" />';
    const [one, two] = ["<gno-form>\n" + after + "\n</gno-form>", "<gno-form>\n" + split + "\n</gno-form>"].map(
      (s) => blocksOf(s)[0],
    );
    expect(one).toMatchObject({ fields: [{ tag: "other", value: after }] });
    expect(two).toMatchObject({
      fields: [
        { tag: "other", value: '<gno-input name="a"' },
        { tag: "other", value: 'type="hidden" value="v" />' },
      ],
    });
  });

  test("gives an input with no name an empty name, and shows it", () => {
    reads('<gno-form>\n<gno-input type="hidden" value="v" />\n</gno-form>', {
      type: "form",
      exec: "",
      path: "",
      fields: [field("input", "", { inputType: "hidden", value: "v" })],
    });
  });

  test("reads upper-case tags and types, and unquoted values", () => {
    reads("<GNO-FORM EXEC=Go>\n<GNO-INPUT NAME=a TYPE=HIDDEN VALUE=v1/>\n</GNO-FORM>", {
      type: "form",
      exec: "Go",
      path: "",
      fields: [field("input", "a", { inputType: "hidden", value: "v1/" })],
    });
  });

  test("shows an attribute that no field shows, or one given twice, as a line whole", () => {
    for (const line of [
      '<gno-input name="a" selected="true" />',
      '<gno-input name="a" name="b" />',
      '<gno-input name="a" onclick="x" />',
    ]) {
      reads(`<gno-form>\n${line}\n</gno-form>`, {
        type: "form",
        exec: "",
        path: "",
        fields: [field("other", "", { value: line })],
      });
    }
  });

  test("reads a form whose opener has an attribute no form shows as text", () => {
    const opener = '<gno-form exec="X" onclick="y">';
    reads(`${opener}\n</gno-form>`, paragraph(text(opener), br, text("</gno-form>")));
  });

  test("ends a form at its first closer: a second opener inside is a line of it", () => {
    reads(
      '<gno-form exec="A">\n<gno-form exec="B">\n<gno-input name="x" />\n</gno-form>\ntail',
      {
        type: "form",
        exec: "A",
        path: "",
        fields: [field("other", "", { value: '<gno-form exec="B">' }), field("input", "x", { inputType: "text" })],
      },
      paragraph(text("tail")),
    );
  });

  test("reads a form's path, gnoweb's own attribute, and shows it (R-F7)", () => {
    reads('<gno-form path="balances">\n<gno-input name="a" />\n</gno-form>', {
      type: "form",
      exec: "",
      path: "balances",
      fields: [field("input", "a", { inputType: "text" })],
    });
    reads('<gno-form exec="Send" path="/r/other?x=1">\n</gno-form>', {
      type: "form",
      exec: "Send",
      path: "/r/other?x=1",
      fields: [],
    });
  });

  test("shows gnoweb's required, readonly, checked and rows on a field, not as a line unread (R-F7)", () => {
    const lines = [
      '<gno-input name="a" required="true" readonly="true" checked="true" type="checkbox" value="y" />',
      '<gno-textarea name="b" rows="6" required="true" />',
      '<gno-select name="c" readonly="true" />',
      '<gno-input name="d" required="false" />',
    ];
    reads(`<gno-form>\n${lines.join("\n")}\n</gno-form>`, {
      type: "form",
      exec: "",
      path: "",
      fields: [
        field("input", "a", { inputType: "checkbox", value: "y", flags: "required, readonly, checked" }),
        field("textarea", "b", { flags: "required, rows 6" }),
        field("select", "c", { flags: "readonly" }),
        field("input", "d", { inputType: "text" }),
      ],
    });
  });

  test("does not read a tag of the form's own names that is an object's key (S-F3)", () => {
    for (const name of ["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"]) {
      const line = `<${name} name="to">`;
      const [form] = blocksOf(`<gno-form>\n${line}\n</gno-form>`);
      expect(form).toMatchObject({ fields: [{ tag: "other", value: line }] });
      expectAllowlisted(blocksOf(`<gno-form>\n${line}\n</gno-form>`));
    }
  });

  test("shows an alert of an object's key as an Info, with a string for its title (S-F3)", () => {
    for (const name of ["constructor", "toString", "hasOwnProperty"]) {
      reads(`> [!${name}]\n> body`, {
        type: "quote",
        children: [paragraph(strong(text("Info"))), paragraph(text("body"))],
      });
    }
  });

  test("reads a closing tag as no field, whatever it holds (R-F8)", () => {
    const line = '</gno-input name="a">';
    reads(`<gno-form>\n${line}\n</gno-form>`, {
      type: "form",
      exec: "",
      path: "",
      fields: [field("other", "", { value: line })],
    });
  });

  test("opens a form only with an opening tag that does not close itself (R-F8)", () => {
    for (const opener of ['</gno-form exec="x">', '<gno-form exec="x" />']) {
      reads(`${opener}\n</gno-form>`, paragraph(text(opener), br, text("</gno-form>")));
    }
  });

  test("closes a form only with a bare </gno-form>: not with an attribute, not self-closing (R-F8)", () => {
    for (const closer of ['</gno-form value="x">', "</gno-form/>"]) {
      reads(`<gno-form>\n${closer}`, paragraph(text("<gno-form>"), br, text(closer)));
    }
  });

  test("drops the blank lines of a form, they are no field (R-F8)", () => {
    reads('<gno-form>\n\n<gno-input name="a" />\n  \t\n</gno-form>', {
      type: "form",
      exec: "",
      path: "",
      fields: [field("input", "a", { inputType: "text" })],
    });
  });

  test("keeps a separator before its columns' opener as text (R-F8)", () => {
    reads(
      "<gno-columns-sep>\n<gno-columns>\na\n</gno-columns>",
      paragraph(text("<gno-columns-sep>")),
      paragraph(text("a")),
    );
  });

  test("takes an indented tag of columns, and each spelling of the separator, as a tag (R-F8)", () => {
    for (const sep of ["<gno-columns-sep>", "<gno-columns-sep/>", "<gno-columns-sep />", "  <gno-columns-sep /> "]) {
      reads(`  <gno-columns> \na\n${sep}\nb\n  </gno-columns>\t`, paragraph(text("a")), paragraph(text("b")));
    }
  });

  test("resolves a path against the origin and leaves an https address as it is (R-F8)", () => {
    expect(blocksOf("[a](https://other.test/x) [b](/r/demo)", "https://gno.land")).toStrictEqual([
      paragraph(link("https://other.test/x", "a"), text(" "), link("https://gno.land/r/demo", "b")),
    ]);
  });

  test("keeps markup in an attribute as a string", () => {
    const [form] = blocksOf('<gno-form>\n<gno-input name=\'"><script>alert(1)</script>\' value="x" />\n</gno-form>');
    expect(form).toMatchObject({ type: "form", fields: [{ name: '"><script>alert(1)</script>', value: "x" }] });
  });

  test("reads a form never closed as text, never as a form that swallows the page", () => {
    reads('<gno-form>\n<gno-input name="a" />', paragraph(text("<gno-form>"), br, text('<gno-input name="a" />')));
  });

  test.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<iframe src="https://evil.test"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    "<svg onload=alert(1)>",
    "<style>*{display:none}</style>",
    "<!-- hidden -->",
    "<gno-unknown>",
    '<gno-input name="a" />',
  ])("shows %s as text, whole", (tag) => {
    const blocks = blocksOf(tag);
    expect(blocks).toStrictEqual([paragraph(text(tag))]);
  });

  test("shows a tag inside a line as text, the line's marks still read", () => {
    reads("a <b>**x**</b> c", paragraph(text("a <b>"), strong(text("x")), text("</b> c")));
  });

  test("shows a columns tag with no mate as text: a closer alone, an opener never closed", () => {
    reads("a\n</gno-columns>", paragraph(text("a"), br, text("</gno-columns>")));
    reads("<gno-columns>\na", paragraph(text("<gno-columns>"), br, text("a")));
    reads(
      "<gno-columns>\na\n<gno-columns-sep>\nb",
      paragraph(text("<gno-columns>"), br, text("a"), br, text("<gno-columns-sep>"), br, text("b")),
    );
  });

  test("stacks columns inside columns, each tag gone", () => {
    reads(
      "<gno-columns>\na\n<gno-columns>\nb\n<gno-columns-sep>\nc\n</gno-columns>\n<gno-columns-sep>\nd\n</gno-columns>",
      paragraph(text("a")),
      paragraph(text("b")),
      paragraph(text("c")),
      paragraph(text("d")),
    );
  });

  test("shows gnoweb's other tags as text: foreign, a closer, a form's field outside a form", () => {
    for (const tag of ['<gno-foreign src="x">', "</gno-foreign>", "</gno-form>", "<gno-columns-sep/x>"]) {
      reads(tag, paragraph(text(tag)));
    }
  });

  test.each([
    ["a heading", "```\n# not a heading\n```", "# not a heading"],
    [
      "a form",
      '```\n<gno-form>\n<gno-input name="a" />\n</gno-form>\n```',
      '<gno-form>\n<gno-input name="a" />\n</gno-form>',
    ],
    ["columns", "```\n<gno-columns>\nx\n</gno-columns>\n```", "<gno-columns>\nx\n</gno-columns>"],
    ["an alert", "```\n> [!NOTE]\n```", "> [!NOTE]"],
  ])("keeps %s in a code fence as code", (_name, source, code) => {
    reads(source, { type: "codeBlock", text: code });
  });

  test("keeps a fence's language word out of view, and shows any other text after the backticks", () => {
    reads("```go\ncode\n```", { type: "codeBlock", text: "code" });
    const hidden = '```<gno-input name="a" type="hidden" value="v" />';
    expect(shown(blocksOf(`${hidden}\ncode\n\`\`\``))).toContain('value="v"');
    reads("```a b\nx\n```", paragraph(text("```a b"), br, text("x")), paragraph(text("```")));
  });

  test.each([
    ["a rule", "---"],
    ["a table", "| a | b |\n|---|---|\n| 1 | 2 |"],
    ["an entity", "&#106;avascript:alert(1)"],
    ["a setext heading", "Title\n====="],
    ["a reference definition", "[a]: https://a.test"],
  ])("keeps %s as text, as the chat does", (_name, source) => {
    const blocks = blocksOf(source);
    expect(blocks.every((b) => b.type === "paragraph")).toBe(true);
    expect(shown(blocks).replace(/\n/g, "")).toContain(source.split("\n")[0]);
    expect(blocks).toStrictEqual(markdown(source));
  });

  test("reads a form inside a quote, from the quote's own lines", () => {
    reads('> <gno-form>\n> <gno-input name="a" type="hidden" value="v" />\n> </gno-form>', {
      type: "quote",
      children: [
        { type: "form", exec: "", path: "", fields: [field("input", "a", { inputType: "hidden", value: "v" })] },
      ],
    });
  });

  test("shows a block of HTML as the text of its lines", () => {
    reads("<div>\nhi\n</div>", paragraph(text("<div>"), br, text("hi"), br, text("</div>")));
  });
});

describe("page: the hostile page of the plan's journey", () => {
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

  test("shows the script, the image, the link and every field of the form, as text", () => {
    const blocks = blocksOf(HOSTILE);
    const seen = shown(blocks);
    for (const part of [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "[click me](javascript:alert(1))",
      "amount",
      "hidden",
      "g1attacker",
    ]) {
      expect(seen).toContain(part);
    }
    expectAllowlisted(blocks);
    expect(blocks.filter((b) => b.type === "form")).toHaveLength(1);
  });
});

describe("page: the caps", () => {
  test("is 256 KB", () => {
    expect(PAGE_MAX_BYTES).toBe(256 * 1024);
  });

  test("reads a page of exactly the cap", () => {
    const read = page("a".repeat(PAGE_MAX_BYTES));
    expect(read.kind).toBe("page");
  });

  test("answers a page one byte past the cap with the cap's state, and no blocks", () => {
    const read: Page = page("a".repeat(PAGE_MAX_BYTES + 1));
    expect(read).toStrictEqual({ kind: "too-big", bytes: PAGE_MAX_BYTES + 1, cap: PAGE_MAX_BYTES });
    expect("blocks" in read).toBe(false);
  });

  test.each([
    ["a two-byte letter", "é", 2],
    ["a three-byte sign", "€", 3],
    ["a four-byte emoji, two units", "😀", 4],
    ["a lone half of a pair, which UTF-8 writes as U+FFFD, three", "\ud83d", 3],
    ["a lone low half", "\ude00", 3],
  ])("counts %s as its UTF-8 bytes", (_name, unit, size) => {
    const read = page(unit.repeat(Math.floor(PAGE_MAX_BYTES / size) + 1));
    expect(read).toStrictEqual({
      kind: "too-big",
      bytes: (Math.floor(PAGE_MAX_BYTES / size) + 1) * size,
      cap: PAGE_MAX_BYTES,
    });
    expect(page(unit.repeat(Math.floor(PAGE_MAX_BYTES / size))).kind).toBe("page");
  });

  test("counts bytes, not characters", () => {
    const read = page("é".repeat(PAGE_MAX_BYTES / 2 + 1));
    expect(read).toStrictEqual({ kind: "too-big", bytes: PAGE_MAX_BYTES + 2, cap: PAGE_MAX_BYTES });
    expect(page("é".repeat(PAGE_MAX_BYTES / 2)).kind).toBe("page");
  });

  // `> [!NOTE]`, `> > [!NOTE]`, … : each line opens one more quote, each an alert.
  const nested = (levels: number, mark: string, tail: string) =>
    Array.from({ length: levels }, (_, n) => `${"> ".repeat(n + 1)}${mark}`).join("\n") +
    `\n${"> ".repeat(levels)}${tail}`;

  test.each([
    ["alerts", nested(12, "[!NOTE]", "deep")],
    ["quotes", "> ".repeat(12) + "deep"],
    ["alerts and plain quotes", nested(12, "text", "deep").replace(/\[!NOTE\]/g, "[!TIP]")],
  ])("nests %s to the quote cap exactly, and shows what is past it as text", (_name, source) => {
    const blocks = blocksOf(source);
    expect(quoteDepth(blocks)).toBe(MAX_QUOTE_DEPTH);
    expect(shown(blocks)).toContain("deep");
    expectAllowlisted(blocks);
  });

  test("shows the `>` past the cap as text", () => {
    const blocks = blocksOf("> ".repeat(MAX_QUOTE_DEPTH + 3) + "deep");
    expect(shown(blocks)).toContain("> > > deep");
  });

  test("stacks columns nested to the byte cap, without a stack of its own", () => {
    const levels = Math.floor(PAGE_MAX_BYTES / ("<gno-columns>\n</gno-columns>\n".length + 1));
    const source = "<gno-columns>\n".repeat(levels) + "deep\n" + "</gno-columns>\n".repeat(levels);
    const blocks = blocksOf(source.slice(0, PAGE_MAX_BYTES));
    expect(blocks).toStrictEqual([paragraph(text("deep"))]);
  });

  test("stacks columns forty deep, flat", () => {
    const source = "<gno-columns>\n".repeat(40) + "deep\n" + "</gno-columns>\n".repeat(40);
    expect(blocksOf(source)).toStrictEqual([paragraph(text("deep"))]);
  });
});

describe("page: the allowlist, for any input", () => {
  // Pieces that exercise every reader: gnoweb's tags, marks, links, fences, quotes, headings, hostile HTML.
  const PIECES = [
    "<gno-columns>",
    "</gno-columns>",
    "<gno-columns-sep>",
    '<gno-form exec="X">',
    "</gno-form>",
    '<gno-input name="a" type="hidden" value="v" />',
    "<gno-textarea name='t'/>",
    "<gno-select name=s />",
    "> [!NOTE]",
    "> [!WARNING] t",
    ">",
    "# ",
    "###### ",
    "- ",
    "1. ",
    "```",
    "~~~",
    "**",
    "_",
    "~~",
    "++",
    "`",
    "[",
    "](",
    ")",
    "![",
    "https://a.test/x",
    "/r/demo/dao:vote",
    "/",
    "//x.test",
    "/\\x",
    "./x",
    ":vote",
    "$help",
    "https://gno.land@evil.example/",
    "javascript:alert(1)",
    "<script>",
    "</script>",
    "<img onerror=x>",
    "@g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv",
    "\n",
    "\n\n",
    "\r\n",
    " ",
    "\t",
    "word",
    "é",
    "😀",
    "\u202e",
    "\0",
  ];
  const source = fc
    .array(fc.oneof(fc.constantFrom(...PIECES), fc.string({ maxLength: 12 })), { maxLength: 60 })
    .map((parts) => parts.join(""));

  test("every node is on the list and every link is https, whatever the page", () => {
    fc.assert(
      fc.property(source, (page_) => {
        expectAllowlisted(blocksOf(page_));
        expectAllowlisted(blocksOf(page_, "https://gno.land"));
      }),
      PROPERTY,
    );
  });

  test("holds on any text at all, not only the pieces above", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 300 }), (page_) => {
        expectAllowlisted(blocksOf(page_));
      }),
      PROPERTY,
    );
  });

  test("never throws and is deterministic", () => {
    fc.assert(
      fc.property(source, (page_) => {
        expect(page(page_)).toStrictEqual(page(page_));
      }),
      PROPERTY,
    );
  });

  test("shows every tag it does not know, as text, in the page's order", () => {
    const tags = ["<script>x</script>", "<img src=x onerror=y>", "<iframe src=z>", "<gno-evil>", "<!-- c -->"];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...tags), { minLength: 1, maxLength: 6 }), (picked) => {
        const seen = shown(blocksOf(picked.join("\n\n")));
        let at = 0;
        for (const tag of picked) {
          at = seen.indexOf(tag, at);
          expect(at).toBeGreaterThanOrEqual(0);
          at += tag.length;
        }
      }),
      PROPERTY,
    );
  });

  test("never makes a form field vanish: each gno-input line of a closed form is a field", () => {
    const types = ["text", "hidden", "password", "radio", "bogus", ""];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...types), { minLength: 1, maxLength: 8 }), (picked) => {
        const lines = picked.map((t, n) => `<gno-input name="f${String(n)}" type="${t}" value="v${String(n)}" />`);
        const [form] = blocksOf(`<gno-form>\n${lines.join("\n")}\n</gno-form>`);
        expect(form?.type).toBe("form");
        if (form?.type === "form")
          expect(form.fields.map((f) => f.name)).toStrictEqual(picked.map((_, n) => `f${String(n)}`));
      }),
      PROPERTY,
    );
  });
});

describe("page: nothing a field holds is left unseen", () => {
  // Hidden inputs dropped among the pieces of a page: in a form, a quote, a column, a fence, a paragraph, an unclosed form.
  const WRAPS: readonly ((input: string) => string)[] = [
    (input) => input,
    (input) => `<gno-form>\n${input}\n</gno-form>`,
    (input) => `<gno-form>\n${input}`,
    (input) => `> ${input}`,
    (input) => `> [!NOTE]\n> ${input}`,
    (input) => `<gno-columns>\n${input}\n<gno-columns-sep>\nx\n</gno-columns>`,
    (input) => `<gno-columns>\n${input}`,
    (input) => `text ${input} text`,
    (input) => `- ${input}`,
    (input) => `\`\`\`\n${input}\n\`\`\``,
    (input) => `<gno-form>\n<gno-form>\n${input}\n</gno-form>`,
    (input) => `<gno-form>\n${input} ${input}\n</gno-form>`,
    (input) => `${input}</gno-form>`,
    (input) => `# ${input}`,
  ];
  const NOISE = [
    "",
    "\n",
    "\n\n",
    "<gno-form>",
    "</gno-form>",
    "<gno-columns>",
    "</gno-columns>",
    "```",
    "> ",
    "- ",
    "# ",
  ];

  test("each hidden value put among the page's pieces shows in the tree", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...WRAPS), fc.constantFrom(...NOISE), fc.constantFrom(...NOISE)), {
          minLength: 1,
          maxLength: 8,
        }),
        (picked) => {
          const values = picked.map((_, n) => `v${String(n)}x`);
          const page_ = picked
            .map(
              ([wrap, before, after], n) =>
                `${before}${wrap(`<gno-input name="f${String(n)}" type="hidden" value="${values[n] ?? ""}" />`)}${after}`,
            )
            .join("\n");
          const seen = shown(blocksOf(page_));
          for (const value of values) expect(seen).toContain(value);
        },
      ),
      PROPERTY,
    );
  });

  test("shows the hidden input of a fence never closed", () => {
    expect(shown(blocksOf('```\n<gno-input name="a" type="hidden" value="v1" />'))).toContain("v1");
  });
});

describe("page: linear in bytes (a guard against quadratic input; the bench measures the budget)", () => {
  const fill = (unit: string, bytes = PAGE_MAX_BYTES) => unit.repeat(Math.floor(bytes / unit.length));
  const STARTS = [
    "",
    "#",
    "# ",
    "> ",
    "> [!NOTE]",
    "- ",
    "1. ",
    "```",
    "``` go",
    "<gno-form>\n",
    "<gno-form ",
    "<gno-input ",
    "<gno-input name=",
    "</gno-form",
    "<gno-columns",
    "[a](",
    "![a](",
    "**",
    "https://a.test",
    "https://a.test/",
  ];
  const BLANKS_THEN_MARK: [string, (bytes: number) => string][] = STARTS.flatMap((start) =>
    // Each blank with its bytes in UTF-8: a no-break space is two, an em space three.
    (
      [
        [" ", 1],
        ["\t", 1],
        ["\u00a0", 2],
        ["\u2003", 3],
      ] as const
    ).map(([blank, size]): [string, (bytes: number) => string] => [
      `${JSON.stringify(start)}, ${JSON.stringify(blank)} and a mark (R-F1)`,
      (n) => start + blank.repeat(Math.floor(n / size) - 16) + "!",
    ]),
  );
  // A page of `bytes` of a shape: how it grows with the size is what a quadratic reader shows.
  const HOSTILE_PAGES: [string, (bytes: number) => string][] = [
    ["forms never closed", (n) => fill("<gno-form>\n", n)],
    ["forms opened and one closer at the end", (n) => fill("<gno-form>\n", n) + "</gno-form>"],
    ["columns never closed", (n) => fill("<gno-columns>\n", n)],
    ["separators with no columns", (n) => fill("<gno-columns-sep>\n", n)],
    ["alerts in a row", (n) => fill("> [!NOTE]\n", n)],
    ["fences opened in pairs", (n) => fill("```\n", n)],
    ["a fence longer than any closer after it", (n) => "``````\n" + fill("```\n`\n``\n", n)],
    ["openers of links", (n) => fill("[a](", n)],
    ["openers of images", (n) => fill("![a](", n)],
    ["stars", (n) => fill("*a ", n)],
    ["headings", (n) => fill("# a\n", n)],
    ["form lines", (n) => `<gno-form>\n${fill('<gno-input name="a" />\n', n)}</gno-form>`],
    ["form lines, none a field", (n) => `<gno-form>\n${fill("<gno-input name=\n", n)}</gno-form>`],
    ["tags with attributes never ending", (n) => `<gno-form>\n<gno-input ${fill("a=b ", n)}`],
    ["a fence's line of blanks and a mark (R-F1)", (n) => "```" + " ".repeat(n) + "!"],
    ["a fence's line of tabs and a mark (R-F1)", (n) => "```" + "\t".repeat(n) + "!"],
    // Every line start a page reads, then blanks and a mark nothing reads: a regex with two `\s*` round an optional
    // middle is quadratic on this and nothing else (F1711, R-F1).
    ...BLANKS_THEN_MARK,
  ];

  // The fastest of seven reads: a pause of the engine's collector, which the largest page draws, is not the reader's time.
  const timeOf = (source: string): number => {
    expect(page(source).kind).toBe("page"); // and warms up the engine's tiers on this shape
    return Math.min(
      ...Array.from({ length: 7 }, () => {
        const start = Date.now();
        page(source);
        return Date.now() - start;
      }),
    );
  };

  // StrykerJS's instrumented code (its `__stryker__` global) times nothing of the algorithm: there the comparison gives
  // way, and runs in the gate and the coverage run, on the code itself (F831, as markdown.test.ts).
  const instrumented = "__stryker__" in globalThis;
  // 8 times the bytes may take 32 times as long, for noise and the engine's tiers (coverage's counters double it), never
  // the 64 times of a quadratic reader; no growth is read under 300 ms, where a quadratic one takes seconds. A noisy
  // machine can fail one try, never three: a quadratic reader fails each.
  test.each(HOSTILE_PAGES)("reads %s in time that grows with its size, not its square", (_name, make) => {
    const small = make(32 * 1024).slice(0, 32 * 1024);
    const big = make(PAGE_MAX_BYTES).slice(0, PAGE_MAX_BYTES);
    const linear = () => timeOf(big) < Math.max(32 * timeOf(small), 300);
    expect(instrumented || linear() || linear() || linear()).toBe(true);
  });

  test.each(HOSTILE_PAGES)("reads %s at the cap in seconds, not minutes", (_name, make) => {
    const start = Date.now();
    expect(page(make(PAGE_MAX_BYTES).slice(0, PAGE_MAX_BYTES)).kind).toBe("page");
    expect(Date.now() - start).toBeLessThan(5000); // the bench holds the budget; a quadratic regex takes half a minute
  });
});

describe("originOf: the origin a page's links resolve against", () => {
  test("keeps https://host[:port] and drops one closing slash", () => {
    expect(originOf("https://gno.land")).toBe("https://gno.land");
    expect(originOf("https://gno.land/")).toBe("https://gno.land");
    expect(originOf("https://onyx.testnets.gno.land:8443")).toBe("https://onyx.testnets.gno.land:8443");
  });

  test("refuses anything else: a path, a user, a scheme, a look-alike letter, a port past 65535", () => {
    for (const origin of [
      "https://gno.land/r",
      "https://a@gno.land",
      "http://gno.land",
      "https://gn\u043e.land",
      "https://gno.land:70000",
      "https://gno.land//",
      "",
    ])
      expect(originOf(origin)).toBeUndefined();
  });
});
