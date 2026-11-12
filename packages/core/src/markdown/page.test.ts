import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { MAX_QUOTE_DEPTH, markdown, type Inline } from "./markdown.ts";
import { originOf } from "./address.ts";
import {
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MAX_LIST_DEPTH,
  PAGE_MAX_BYTES,
  page,
  type Align,
  type FormField,
  type Outline,
  type OutlineItem,
  type Page,
  type PageBlock,
} from "./page.ts";

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
const picture = (href: string, label = "Image"): Inline => ({
  type: "link",
  href,
  children: [text(label)],
  image: true,
});
const rule: PageBlock = { type: "rule" };
const columns = (...cols: PageBlock[][]): PageBlock => ({ type: "columns", columns: cols });
const item = (children: Inline[], sub: PageBlock[] = [], task: OutlineItem["task"] = "none"): OutlineItem => ({
  children,
  task,
  sub: sub as OutlineItem["sub"],
});
const outline = (ordered: boolean, items: OutlineItem[], start = 1): PageBlock => ({
  type: "outline",
  ordered,
  start,
  items,
});
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
function* within(nodes: readonly Inline[]): Generator<Inline> {
  for (const node of nodes) {
    yield node;
    if ("children" in node) yield* within(node.children);
  }
}
function* inlinesOf(blocks: readonly PageBlock[]): Generator<Inline> {
  for (const block of blocks) {
    if (block.type === "quote") yield* inlinesOf(block.children);
    else if (block.type === "list") for (const item of block.items) yield* within(item);
    else if (block.type === "paragraph" || block.type === "heading") yield* within(block.children);
    else yield* inlinesOfRest(block);
  }
}
function* inlinesOfRest(block: PageBlock): Generator<Inline> {
  if (block.type === "table") for (const cell of [...block.head, ...block.rows.flat()]) yield* within(cell);
  else if (block.type === "outline") yield* inlinesOfOutline(block);
  else if (block.type === "columns") for (const column of block.columns) yield* inlinesOf(column);
}
function* inlinesOfOutline(block: Outline): Generator<Inline> {
  for (const it of block.items) {
    yield* within(it.children);
    yield* inlinesOf(it.sub);
  }
}
function* blocksIn(blocks: readonly PageBlock[]): Generator<PageBlock> {
  for (const block of blocks) {
    yield block;
    if (block.type === "quote") yield* blocksIn(block.children);
    if (block.type === "outline") for (const it of block.items) yield* blocksIn(it.sub);
    if (block.type === "columns") for (const column of block.columns) yield* blocksIn(column);
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
  table: "align,cut,head,rows,type",
  form: "exec,fields,path,type",
  rule: "type",
  columns: "columns,type",
  outline: "items,ordered,start,type",
};
const IMAGE_KEYS = "children,href,image,type";
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
  if ((node.type === "link" && "image" in node ? IMAGE_KEYS : KEYS[node.type]) !== keysOf(node)) return false;
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
const cellAllowed = (cell: readonly Inline[]): boolean =>
  cell.every((node) => node.type !== "break") && inlinesAllowed(cell, false);
const fieldAllowed = (f: FormField): boolean =>
  keysOf(f) === FIELD_KEYS && FORM_TAGS.has(f.tag) && Object.values(f).every((v) => typeof v === "string");
const keysAllowed = (block: PageBlock): boolean =>
  (block.type === "list" && block.ordered
    ? "items,ordered,start,type"
    : block.type === "quote" && block.severity !== undefined
      ? "children,severity,type"
      : (KEYS[block.type] ?? "items,ordered,type")) === keysOf(block);
const BLOCKS: Readonly<Record<string, (block: PageBlock) => boolean>> = {
  paragraph: (b) =>
    b.type === "paragraph" && linesOf(b.children).every((line) => line.length > 0 && inlinesAllowed(line, false)),
  heading: (b) =>
    b.type === "heading" && b.level >= 1 && b.level <= 6 && b.children.length > 0 && inlinesAllowed(b.children, false),
  quote: (b) =>
    b.type === "quote" &&
    (b.severity === undefined || ["notice", "caution"].includes(b.severity)) &&
    b.children.length > 0 &&
    b.children.every(blockAllowed),
  list: (b) => b.type === "list" && b.items.length > 0 && b.items.every((item) => inlinesAllowed(item, false)),
  form: (b) => b.type === "form" && b.fields.every(fieldAllowed),
  table: (b) =>
    b.type === "table" &&
    b.head.length >= 1 &&
    b.align.length === b.head.length &&
    b.align.every((a) => ["left", "right", "center", "none"].includes(a)) &&
    typeof b.cut === "boolean" &&
    b.head.length <= MAX_TABLE_COLUMNS &&
    b.rows.length <= MAX_TABLE_ROWS &&
    [b.head, ...b.rows].every((row) => row.length <= b.head.length && row.every((c) => cellAllowed(c))),
  codeBlock: (b) => b.type === "codeBlock",
  rule: (b) => b.type === "rule",
  columns: (b) =>
    b.type === "columns" &&
    b.columns.length > 0 &&
    b.columns.every((column) => column.length > 0 && column.every(blockAllowed)),
  outline: (b) =>
    b.type === "outline" &&
    b.items.length > 0 &&
    Number.isInteger(b.start) &&
    b.items.every(
      (it) =>
        keysOf(it) === "children,sub,task" &&
        ["none", "open", "done"].includes(it.task) &&
        inlinesAllowed(it.children, false) &&
        it.sub.every(blockAllowed),
    ),
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
    reads("![logo](https://x.test/a.png)", paragraph(picture("https://x.test/a.png", "logo")));
    reads(
      "see ![](https://x.test/a.png) here",
      paragraph(text("see "), picture("https://x.test/a.png"), text(" here")),
    );
    reads("[logo](https://x.test/a.png)", paragraph(link("https://x.test/a.png", "logo")));
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
  ])("resolves %s to %s under the origin", (source, href) => {
    expect(blocksOf(source, "https://gno.land")).toStrictEqual([paragraph(link(href, "a"))]);
  });

  test("resolves an image's path under the origin, flagged", () => {
    expect(blocksOf("![a](/static/a.png)", "https://gno.land")).toStrictEqual([
      paragraph(picture("https://gno.land/static/a.png", "a")),
    ]);
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
      severity: "notice",
      children: [paragraph(strong(text("Note"))), paragraph(text("Be careful."))],
    });
  });

  test("opens an alert with its title when it has one, whatever its kind", () => {
    reads("> [!WARNING] Heads up\n> Read this.", {
      type: "quote",
      severity: "caution",
      children: [paragraph(strong(text("Heads up"))), paragraph(text("Read this."))],
    });
  });

  test.each([
    ["[!TIP]", "Tip", "notice"],
    ["[!caution]", "Caution", "caution"],
    ["[!WARNING]", "Warning", "caution"],
    ["[!SUCCESS]", "Success", "notice"],
    ["[!INFO]", "Info", "notice"],
    ["[!MYSTERY]", "Info", "notice"],
    ["[!NOTE]-", "Note", "notice"],
  ] as const)("labels the alert %s as %s, a %s", (mark, label, severity) => {
    reads(`> ${mark}\n> body`, {
      type: "quote",
      severity,
      children: [paragraph(strong(text(label))), paragraph(text("body"))],
    });
  });

  test("keeps an alert's title as text, whatever it holds", () => {
    const [block] = blocksOf("> [!NOTE] <script>alert(1)</script>\n> x");
    expect(shown([block ?? paragraph()])).toContain("<script>alert(1)</script>");
  });

  test("reads columns side by side: a block of the columns, each column its own blocks, no tag shown", () => {
    reads(
      "<gno-columns>\nleft\n<gno-columns-sep>\n# right\n- r1\n</gno-columns>",
      columns(
        [paragraph(text("left"))],
        [heading(1, text("right")), { type: "list", ordered: false, items: [[text("r1")]] }],
      ),
    );
  });

  test("reads a column's blocks like a page's: a form, a rule, a table, a quote", () => {
    const [block] = blocksOf(
      '<gno-columns>\n---\n<gno-columns-sep>\n> q\n<gno-columns-sep>\n<gno-form exec="X">\n<gno-input name="a" />\n</gno-form>\n</gno-columns>',
    );
    expect(block?.type === "columns" && block.columns.map((column) => column.map((b) => b.type))).toStrictEqual([
      ["rule"],
      ["quote"],
      ["form"],
    ]);
  });

  test("draws no column that is empty, and no columns holding nothing", () => {
    reads("<gno-columns>\n</gno-columns>");
    reads("<gno-columns>\n<gno-columns-sep>\n</gno-columns>");
    reads(
      "<gno-columns>\n\n<gno-columns-sep>\na\n<gno-columns-sep>\n  \n</gno-columns>",
      columns([paragraph(text("a"))]),
    );
  });

  test("accepts the self-closing separator too", () => {
    reads(
      "<gno-columns>\na\n<gno-columns-sep/>\nb\n</gno-columns>",
      columns([paragraph(text("a"))], [paragraph(text("b"))]),
    );
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
        severity: "notice",
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
      columns([paragraph(text("a"))]),
    );
  });

  test("takes an indented tag of columns, and each spelling of the separator, as a tag (R-F8)", () => {
    for (const sep of ["<gno-columns-sep>", "<gno-columns-sep/>", "<gno-columns-sep />", "  <gno-columns-sep /> "]) {
      reads(
        `  <gno-columns> \na\n${sep}\nb\n  </gno-columns>\t`,
        columns([paragraph(text("a"))], [paragraph(text("b"))]),
      );
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

  test("reads columns inside columns: the separators belong to the nearest pair", () => {
    reads(
      "<gno-columns>\na\n<gno-columns>\nb\n<gno-columns-sep>\nc\n</gno-columns>\n<gno-columns-sep>\nd\n</gno-columns>",
      columns([paragraph(text("a")), columns([paragraph(text("b"))], [paragraph(text("c"))])], [paragraph(text("d"))]),
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
    ["an entity", "&#106;avascript:alert(1)"],
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

  // gnoweb's cap on gno-* blocks nested, 4 (nestdepth.go): a fifth opener is no columns, and stays text.
  const columnsDepth = (blocks: readonly PageBlock[]): number =>
    Math.max(0, ...blocks.map((b) => (b.type === "columns" ? 1 + Math.max(0, ...b.columns.map(columnsDepth)) : 0)));

  test("reads columns nested to the byte cap four deep at most, without a stack of its own", () => {
    const levels = Math.floor(PAGE_MAX_BYTES / ("<gno-columns>\n</gno-columns>\n".length + 1));
    const source = "<gno-columns>\n".repeat(levels) + "deep\n" + "</gno-columns>\n".repeat(levels);
    const blocks = blocksOf(source.slice(0, PAGE_MAX_BYTES));
    expect(columnsDepth(blocks)).toBe(4);
    expect(shown(blocks)).toContain("deep");
  });

  test("keeps the cap through quotes: columns opened under growing quotes stay bounded and lose nothing", () => {
    const quoted = (n: number, tag: string) => `${"> ".repeat(Math.min(n, 3))}${tag}`;
    const opens = Array.from({ length: 12 }, (_, n) => quoted(n, "<gno-columns>"));
    const closes = Array.from({ length: 12 }, (_, n) => quoted(11 - n, "</gno-columns>"));
    const source = [...opens, "> > > deep", ...closes].join("\n");
    const deep = (blocks: readonly PageBlock[]): number =>
      Math.max(0, ...blocks.map((b) => (b.type === "quote" ? deep(b.children) : columnsDepth([b]))));
    expect(deep(blocksOf(source))).toBeLessThanOrEqual(16);
    expect(shown(blocksOf(source))).toContain("deep");
  });

  test("makes the outermost four of forty openers the columns, the innermost holds the text", () => {
    const source = "<gno-columns>\n".repeat(40) + "deep\n" + "</gno-columns>\n".repeat(40);
    let block: PageBlock | undefined = blocksOf(source)[0];
    for (let level = 0; level < 4; level += 1) {
      expect(block?.type).toBe("columns");
      block = block?.type === "columns" ? block.columns[0]?.[0] : undefined;
    }
    expect(block?.type).toBe("paragraph");
    expect(shown(block === undefined ? [] : [block])).toContain("deep");
  });

  test("keeps a separator in a text opener with the column around it", () => {
    const source = "<gno-columns>\n".repeat(5) + "a\n<gno-columns-sep>\nb\n" + "</gno-columns>\n".repeat(5);
    const blocks = blocksOf(source);
    expect(columnsDepth(blocks)).toBe(4);
    expect(shown(blocks)).toContain("a");
    expect(shown(blocks)).toContain("b");
  });

  test("keeps an empty middle column out, as the first and last", () => {
    reads(
      "<gno-columns>\na\n<gno-columns-sep>\n<gno-columns-sep>\nb\n</gno-columns>",
      columns([paragraph(text("a"))], [paragraph(text("b"))]),
    );
  });

  test("reads columns forty deep as four, the other openers and closers text, nothing lost", () => {
    const source = "<gno-columns>\n".repeat(40) + "deep\n" + "</gno-columns>\n".repeat(40);
    const blocks = blocksOf(source);
    expect(columnsDepth(blocks)).toBe(4);
    expect(shown(blocks)).toContain("deep");
    expect(shown(blocks).split("<gno-columns>").length - 1).toBe(36);
    expect(shown(blocks).split("</gno-columns>").length - 1).toBe(36);
  });

  test("reads rows of a textarea as gnoweb clamps them: 2 to 10, 4 when not a number", () => {
    const flags = (rows: string) => {
      const [form] = blocksOf(`<gno-form>\n<gno-textarea name="a" rows="${rows}" />\n</gno-form>`);
      return form?.type === "form" ? form.fields[0]?.flags : undefined;
    };
    const written = ["1", "2", "10", "50", "-3", "x", "7 lines", " 7", "+5", "99999999999999999999"];
    expect(written.map(flags)).toStrictEqual([
      "rows 2",
      "rows 2",
      "rows 10",
      "rows 10",
      "rows 2",
      "rows 4",
      "rows 7",
      "rows 7",
      "rows 5",
      "rows 4",
    ]);
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
    "|",
    "\n| a | b |\n|:--|--:|\n| 1 |\n| `x|y` | [l](https://a.test) | 3 |\n",
    "\n> | a |\n> |---|\n> | <b> |\n",
    "\na|b\n-|-\n",
    "| a | b |",
    "|:--|--:|",
    "\\|",
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

describe("page: thematic breaks", () => {
  test.each(["---", "***", "___", "- - -", "* * *", "_ _ _", "-----", "  ---", "---  ", "- - - - -"])(
    "reads %j as a rule",
    (source) => {
      reads(source, rule);
    },
  );

  test.each(["--", "**", "__", "---a", "-*-", "- -", "--- x", "\\---"])("keeps %j as text, not a rule", (source) => {
    expect(blocksOf(source).some((block) => block.type === "rule")).toBe(false);
  });

  test("reads a rule between blocks, with or without blank lines round it", () => {
    reads("a\n\n---\n\nb", paragraph(text("a")), rule, paragraph(text("b")));
    reads("# T\n---\ntext", heading(1, text("T")), rule, paragraph(text("text")));
    reads("```\nx\n```\n***\nb", { type: "codeBlock", text: "x" }, rule, paragraph(text("b")));
  });

  test("ends a list, and a quote's lines, as its own block", () => {
    reads("- a\n* * *\n- b", { type: "list", ordered: false, items: [[text("a")]] }, rule, {
      type: "list",
      ordered: false,
      items: [[text("b")]],
    });
    reads("> ---", { type: "quote", children: [rule] });
  });

  test("ends a table's rows", () => {
    const [table, ...rest] = blocksOf("|a|\n|-|\n|1|\n---\nx");
    expect(table?.type === "table" && table.rows.length).toBe(1);
    expect(rest).toStrictEqual([rule, paragraph(text("x"))]);
  });
});

describe("page: setext headings, and a rule after a paragraph", () => {
  test("reads a line over equals signs as a title, over hyphens as a subtitle", () => {
    reads("Title\n=====", heading(1, text("Title")));
    reads("Title\n-----", heading(2, text("Title")));
    reads("Title\n=", heading(1, text("Title")));
    reads("Title\n--  ", heading(2, text("Title")));
    reads("**Big** one\n---", heading(2, strong(text("Big")), text(" one")));
  });

  test("makes one title of a paragraph's lines, joined by a space", () => {
    reads("a\nb\n---\nc", heading(2, text("a b")), paragraph(text("c")));
  });

  test("keeps a rule after a blank line, and after a block that is no paragraph", () => {
    reads("a\n\n---", paragraph(text("a")), rule);
    reads("- a\n---", { type: "list", ordered: false, items: [[text("a")]] }, rule);
    reads("> a\n\n---", { type: "quote", children: [paragraph(text("a"))] }, rule);
  });

  test("reads one inside a quote", () => {
    reads("> a\n> ---", { type: "quote", children: [heading(2, text("a"))] });
  });

  test("keeps a rule of its own after a paragraph, a title only over `=` or hyphens", () => {
    for (const under of ["* * *", "___", "- - -"]) reads(`a\n${under}`, paragraph(text("a")), rule);
    reads("> a\n---", { type: "quote", children: [paragraph(text("a"))] }, rule);
    reads("- a\n===", { type: "list", ordered: false, items: [[text("a")]] }, paragraph(text("===")));
    reads("# h\n===", heading(1, text("h")), paragraph(text("===")));
    reads("```\nx\n```\n===", { type: "codeBlock", text: "x" }, paragraph(text("===")));
    reads("+ + +", { type: "list", ordered: false, items: [[text("+ +")]] });
    const [alert] = blocksOf("> [!NOTE]\n> ---");
    expect(alert).toMatchObject({ type: "quote", severity: "notice" });
    expect(alert?.type === "quote" && alert.children.map((child) => child.type)).toStrictEqual(["paragraph", "rule"]);
  });

  test("leaves a line of equals signs alone with no paragraph over it, and a table as a table", () => {
    reads("===", paragraph(text("===")));
    reads("a\n\\===", paragraph(text("a"), br, text("===")));
    expect(blocksOf("a|b\n-|-").map((block) => block.type)).toStrictEqual(["table"]);
  });

  test("leaves the chat's reader as it was: no title, no rule", () => {
    expect(markdown("a\n---").map((block) => block.type)).toStrictEqual(["paragraph"]);
  });
});

describe("page: nested, mixed and task lists", () => {
  test("nests a list under an item by its indentation", () => {
    reads(
      "- a\n  - b\n  - c\n- d",
      outline(false, [item([text("a")], [outline(false, [item([text("b")]), item([text("c")])])]), item([text("d")])]),
    );
    reads("- a\n    - b", outline(false, [item([text("a")], [outline(false, [item([text("b")])])])]));
    reads("- a\n\t- b", outline(false, [item([text("a")], [outline(false, [item([text("b")])])])]));
  });

  test("mixes ordered and unordered lists, each under an item", () => {
    reads(
      "1. a\n   - b\n2. c",
      outline(true, [item([text("a")], [outline(false, [item([text("b")])])]), item([text("c")])]),
    );
    reads(
      "- a\n  1. x\n  - y",
      outline(false, [item([text("a")], [outline(true, [item([text("x")])]), outline(false, [item([text("y")])])])]),
    );
    reads("3. a\n   1. x", outline(true, [item([text("a")], [outline(true, [item([text("x")])])])], 3));
  });

  test("leaves a flat list the chat's list, and one space of indent a sibling", () => {
    reads("- a\n - b", { type: "list", ordered: false, items: [[text("a")], [text("b")]] });
    reads(
      "- a\n1. b",
      { type: "list", ordered: false, items: [[text("a")]] },
      {
        type: "list",
        ordered: true,
        start: 1,
        items: [[text("b")]],
      },
    );
  });

  test("closes a nested list at a line less indented, back to the level it belongs to", () => {
    reads(
      "- a\n  - b\n    - c\n  - d\n- e",
      outline(false, [
        item(
          [text("a")],
          [outline(false, [item([text("b")], [outline(false, [item([text("c")])])]), item([text("d")])])],
        ),
        item([text("e")]),
      ]),
    );
  });

  test("reads a task as an item with its box, open or done; else the brackets are text", () => {
    reads(
      "- [ ] a\n- [x] b\n- [X] c",
      outline(false, [item([text("a")], [], "open"), item([text("b")], [], "done"), item([text("c")], [], "done")]),
    );
    reads("1. [ ] a", outline(true, [item([text("a")], [], "open")]));
    reads(
      "- [ ] a\n  - [x] b",
      outline(false, [item([text("a")], [outline(false, [item([text("b")], [], "done")])], "open")]),
    );
    for (const source of ["- [ ]", "- [x]no", "- [] a", "- [y] a"]) {
      expect(blocksOf(source).some((block) => block.type === "outline")).toBe(false);
    }
    reads("- [x]no", { type: "list", ordered: false, items: [[text("[x]no")]] });
  });

  test("continues an item on the lines indented under it", () => {
    reads("- a\n  more\n- b", outline(false, [item([text("a"), br, text("more")]), item([text("b")])]));
    reads("- a\nmore", { type: "list", ordered: false, items: [[text("a")]] }, paragraph(text("more")));
  });

  test("ends the list at a block of its own, however indented", () => {
    reads(
      "- a\n  - b\n  # h",
      outline(false, [item([text("a")], [outline(false, [item([text("b")])])])]),
      heading(1, text("h")),
    );
    reads(
      "- a\n  - b\n\n  text",
      outline(false, [item([text("a")], [outline(false, [item([text("b")])])])]),
      paragraph(text("text")),
    );
    expect(blocksOf("- a\n  - b\n  > q").map((block) => block.type)).toStrictEqual(["outline", "quote"]);
  });

  test("reads one inside a quote and keeps marks and links in its items", () => {
    reads("> - a\n>   - b", {
      type: "quote",
      children: [outline(false, [item([text("a")], [outline(false, [item([text("b")])])])])],
    });
    reads(
      "- **a** [x](https://x.test)\n  - b",
      outline(false, [
        item([strong(text("a")), text(" "), link("https://x.test", "x")], [outline(false, [item([text("b")])])]),
      ]),
    );
  });

  test("nests no deeper than the cap: deeper items stay on the last level, nothing lost", () => {
    const deep = Array.from({ length: MAX_LIST_DEPTH + 5 }, (_, n) => `${"  ".repeat(n)}- n${String(n)}`).join("\n");
    const blocks = blocksOf(deep);
    const depthOf = (block: PageBlock): number =>
      block.type === "outline" ? 1 + Math.max(0, ...block.items.flatMap((it) => it.sub.map(depthOf))) : 0;
    expect(Math.max(...blocks.map(depthOf))).toBe(MAX_LIST_DEPTH);
    // The items past the cap are siblings on the last level, the first of them n(cap - 1).
    const last = (block: PageBlock | undefined): Outline | undefined =>
      block?.type === "outline" && block.items[0]?.sub[0]
        ? last(block.items[0].sub[0])
        : block?.type === "outline"
          ? block
          : undefined;
    expect(last(blocks[0])?.items.length).toBe(6);
    for (let n = 0; n < MAX_LIST_DEPTH + 5; n += 1) expect(shown(blocks)).toContain(`n${String(n)}`);
    expectAllowlisted(blocks);
  });

  test("closes a list at the first line indented less than its owner's text, as CommonMark's content offset does", () => {
    const one = outline(false, [item([text("a")], [outline(false, [item([text("b")]), item([text("c")])])])]);
    reads("- a\n    - b\n  - c", one);
    reads("- a\n\t\t- b\n\t- c", one);
    reads("- a\n      - b\n  - c", one);
    reads(
      "- a\n  - b\n - c",
      outline(false, [item([text("a")], [outline(false, [item([text("b")])])]), item([text("c")])]),
    );
  });

  test("nests under an ordered item from its text's column, and under a bullet from the third", () => {
    expect(blocksOf("- a\n   - b").map((block) => block.type)).toStrictEqual(["outline"]);
    expect(blocksOf("1. a\n  - b").map((block) => block.type)).toStrictEqual(["list", "list"]);
    expect(blocksOf("10. a\n   - b").map((block) => block.type)).toStrictEqual(["list", "list"]);
    expect(blocksOf("10. a\n    - b").map((block) => block.type)).toStrictEqual(["outline"]);
  });

  test("keeps a continuation to the item it is indented under, and a blank line ends the list", () => {
    reads(
      "- a\n  - b\n    more",
      outline(false, [item([text("a")], [outline(false, [item([text("b"), br, text("more")])])])]),
    );
    reads("- [x] a\n  more", outline(false, [item([text("a"), br, text("more")], [], "done")]));
    reads(
      "- a\n  - b\n  more",
      outline(false, [item([text("a")], [outline(false, [item([text("b")])])])]),
      paragraph(text("more")),
    );
    expect(blocksOf("- a\n  - b\n\n- c").map((block) => block.type)).toStrictEqual(["outline", "list"]);
  });

  test("shows the brackets of a task with no words, mixes tasks and plain items, and ticks an ordered one", () => {
    expect(shown(blocksOf("- [ ]"))).toContain("[ ]");
    expect(shown(blocksOf("- [x]no"))).toContain("[x]no");
    reads("- [ ] a\n- b", outline(false, [item([text("a")], [], "open"), item([text("b")])]));
    reads("1. [x] a", outline(true, [item([text("a")], [], "done")]));
  });

  test("leaves the chat's lists as they were: nested and task lines are flat items", () => {
    expect(markdown("- a\n  - b")).toStrictEqual([{ type: "list", ordered: false, items: [[text("a")], [text("b")]] }]);
    expect(markdown("- [ ] a")).toStrictEqual([{ type: "list", ordered: false, items: [[text("[ ] a")]] }]);
  });

  test("shows no HTML and no link that is not https, in an item", () => {
    const blocks = blocksOf("- <img src=x onerror=1>\n  - [a](javascript:alert(1))");
    expectAllowlisted(blocks);
    expect(shown(blocks)).toContain("<img src=x onerror=1>");
    expect([...inlinesOf(blocks)].some((node) => node.type === "link")).toBe(false);
  });
});

describe("page: images stay links to them, flagged", () => {
  test("flags an image and no other link", () => {
    const [block] = blocksOf("![a](https://x.test/a.png) [b](https://x.test/b)");
    const links = [...inlinesOf(block === undefined ? [] : [block])].flatMap((node) =>
      node.type === "link" ? [["image" in node, node.href]] : [],
    );
    expect(links).toStrictEqual([
      [true, "https://x.test/a.png"],
      [false, "https://x.test/b"],
    ]);
  });

  test("labels an image with no alt text Image, not its address", () => {
    reads("![](https://x.test/a.png)", paragraph(picture("https://x.test/a.png")));
    reads("![ ](https://x.test/a.png)", paragraph(picture("https://x.test/a.png")));
  });

  test("keeps an image in a list item and in a cell flagged", () => {
    reads("- ![a](https://x.test/a.png)", {
      type: "list",
      ordered: false,
      items: [[picture("https://x.test/a.png", "a")]],
    });
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
    ["rules", (n) => fill("---\n", n)],
    [
      "columns each opened under four quotes",
      (n) => fill("> > > > <gno-columns>\n> > > > a\n> > > > <gno-columns-sep>\n", n),
    ],
    [
      "columns each holding a table",
      (n) => "<gno-columns>\n" + fill("| a |\n|---|\n| 1 |\n<gno-columns-sep>\n", n) + "</gno-columns>",
    ],
    ["columns each with a separator", (n) => fill("<gno-columns>\na\n<gno-columns-sep>\nb\n</gno-columns>\n", n)],
    [
      "columns nested in a stair",
      (n) => fill("<gno-columns>\na\n<gno-columns-sep>\n", n / 2) + fill("</gno-columns>\n", n / 2),
    ],
    [
      "one columns of a thousand separators",
      (n) => "<gno-columns>\n" + fill("a\n<gno-columns-sep>\n", n) + "</gno-columns>",
    ],
    ["spaced rules", (n) => fill("* * *\n", n)],
    ["lines over a rule", (n) => fill("a\n---\n", n)],
    ["a paragraph, then its underline", (n) => fill("a\n", n) + "---"],
    ["lines of equals signs", (n) => fill("a\n===\n", n)],
    ["a flat list", (n) => fill("- a\n", n)],
    ["a flat list, then a nested item", (n) => fill("- a\n", n) + "  - b"],
    ["items each nested", (n) => fill("- a\n  - b\n", n)],
    [
      "a staircase of items",
      (n) => Array.from({ length: Math.floor(n / 40) }, (_, k) => `${" ".repeat(k % 40)}- a`).join("\n"),
    ],
    ["tasks", (n) => fill("- [ ] a\n", n)],
    ["items with continuations", (n) => fill("- a\n  b\n", n)],
    ["ordered items nested", (n) => fill("1. a\n   1. b\n", n)],
    ["a list of rules", (n) => fill("- a\n---\n", n)],
    ["pipes alone", (n) => fill("|", n)],
    ["lines that could each head a table", (n) => fill("a|b\n", n)],
    ["headers each with a delimiter", (n) => fill("a|b\n-|-\n", n)],
    ["a table's rows", (n) => "| a | b | c |\n|---|---|---|\n" + fill("| 1 | [x](https://x.test) | `c` |\n", n)],
    ["a table of empty cells", (n) => "|a|\n|-|\n" + fill("||||||||||||||||\n", n)],
    ["a table's columns", (n) => `${fill("|a", n / 2)}\n${fill("|-", n / 2)}\n`],
    ["code spans in cells", (n) => "| a |\n|---|\n" + fill("| `|`|`|`|\n", n)],
    ["link openers in cells", (n) => "| a |\n|---|\n" + fill("| [a](| **| ![a](|\n", n)],
    ["a table in four quotes", (n) => "> > > > | a |\n> > > > |---|\n" + fill("> > > > | 1 |\n", n)],
    ["one cell as big as the page", (n) => "| a |\n|---|\n| " + fill("x ", n)],
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

describe("page: tables, as GFM reads them", () => {
  const table = (align: Align[], head: Inline[][], rows: Inline[][][]): PageBlock => ({
    type: "table",
    align,
    head,
    rows,
    cut: false,
  });

  test("reads a header, its delimiter row's alignments and the body rows", () => {
    reads(
      "| Name | Yes | No | Both |\n| :--- | ---: | :---: | --- |\n| a | 1 | 2 | 3 |\n| b | 4 | 5 | 6 |",
      table(
        ["left", "right", "center", "none"],
        [[text("Name")], [text("Yes")], [text("No")], [text("Both")]],
        [
          [[text("a")], [text("1")], [text("2")], [text("3")]],
          [[text("b")], [text("4")], [text("5")], [text("6")]],
        ],
      ),
    );
  });

  test("needs no outer pipes, and a table with a header alone has no rows", () => {
    reads("a | b\n-|-", table(["none", "none"], [[text("a")], [text("b")]], []));
  });

  test("reads one column when the pipes are outside", () => {
    reads("| a |\n|---|\n| 1 |", table(["none"], [[text("a")]], [[[text("1")]]]));
  });

  test("reads each cell as inline Markdown: links, marks, code", () => {
    const [block] = blocksOf("| a | b |\n|---|---|\n| [x](https://x.test) **s** | `c` |");
    expect(block).toMatchObject({
      rows: [[[link("https://x.test", "x"), text(" "), strong(text("s"))], [{ type: "code", text: "c" }]]],
    });
  });

  test("keeps an escaped pipe in its cell, in code too", () => {
    reads(
      "| a \\| b | c |\n|---|---|\n| `x \\| y` | z |",
      table(["none", "none"], [[text("a | b")], [text("c")]], [[[{ type: "code", text: "x | y" }], [text("z")]]]),
    );
  });

  test("keeps a short row's own cells, never padded, and cuts a long one to the header's width", () => {
    reads(
      "| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 | 4 |",
      table(["none", "none"], [[text("a")], [text("b")]], [[[text("1")]], [[text("1")], [text("2")]]]),
    );
  });

  test("an empty cell is an empty list of nodes", () => {
    reads("| a | b |\n|---|---|\n|  | x |", table(["none", "none"], [[text("a")], [text("b")]], [[[], [text("x")]]]));
  });

  test("ends at a blank line, and the text after it is a paragraph", () => {
    reads("| a |\n|---|\n| 1 |\n\nafter", table(["none"], [[text("a")]], [[[text("1")]]]), paragraph(text("after")));
  });

  test.each([
    ["a heading", "# h", heading(1, text("h"))],
    ["a quote", "> q", { type: "quote", children: [paragraph(text("q"))] } satisfies PageBlock],
    ["a fence", "```\ncode\n```", { type: "codeBlock", text: "code" } satisfies PageBlock],
  ])("ends at %s", (_name, after, block) => {
    reads(`| a |\n|---|\n| 1 |\n${after}`, table(["none"], [[text("a")]], [[[text("1")]]]), block);
  });

  test("interrupts a paragraph, as GFM does, and sits in a quote", () => {
    reads("intro\n| a |\n|---|", paragraph(text("intro")), table(["none"], [[text("a")]], []));
    const [quote] = blocksOf("> | a |\n> |---|\n> | 1 |");
    expect(quote).toMatchObject({ type: "quote", children: [{ type: "table" }] });
  });

  test.each([
    ["a header with more cells than the delimiter", "| a | b |\n|---|"],
    ["a header with fewer cells than the delimiter", "| a |\n|---|---|"],
    ["a delimiter that is not hyphens", "| a | b |\n|---|-x-|"],
    ["a delimiter of colons alone", "| a | b |\n|---|:|"],
    ["a header with no pipe", "ab\n|---|"],
    ["no delimiter at all", "| a | b |\n| c | d |"],
    ["a delimiter first", "|---|---|\n| a | b |"],
  ])("leaves %s as plain paragraphs", (_name, source) => {
    const lines = source.split("\n");
    const blocks = blocksOf(source);
    expect(blocks.every((block) => block.type === "paragraph")).toBe(true);
    expect(shown(blocks).split("\n").join("")).toBe(lines.join("").replace(/\*/g, ""));
  });

  test("counts an escaped pipe as no cell border, in the header too", () => {
    reads("| a \\| b |\n|---|", table(["none"], [[text("a | b")]], []));
  });

  test("splits at a pipe inside a code span, as GFM does", () => {
    reads("| `a|b` |\n|---|---|", table(["none", "none"], [[text("`a")], [text("b`")]], []));
  });

  test.each([
    ["| - | - |", ["none", "none"]],
    ["|:-:|:--|", ["center", "left"]],
    ["|  ---  |---:  |", ["none", "right"]],
  ] as const)("reads the delimiter row %j", (delimiter, align) => {
    expect(blocksOf(`| a | b |\n${delimiter}`)[0]).toMatchObject({ type: "table", align });
  });

  test.each(["|::|--|", "|:|--|", "| -x |--|"])("refuses the delimiter row %j", (delimiter) => {
    expect(blocksOf(`| a | b |\n${delimiter}`).every((block) => block.type === "paragraph")).toBe(true);
  });

  test("reads an empty header cell", () => {
    reads("| | b |\n|--|--|", table(["none", "none"], [[], [text("b")]], []));
  });

  test("takes a line with no pipe as a row of one cell, as GFM does", () => {
    reads("| a | b |\n|--|--|\nplain", table(["none", "none"], [[text("a")], [text("b")]], [[[text("plain")]]]));
  });

  test("ends at a list item, and the item is a list", () => {
    const blocks = blocksOf("| a |\n|--|\n| 1 |\n- x");
    expect(blocks.map((block) => block.type)).toEqual(["table", "list"]);
  });

  test("ends at a columns tag, and the rows after it are a column's text", () => {
    const blocks = blocksOf("| a |\n|--|\n| 1 |\n<gno-columns>\n| 2 |\n</gno-columns>");
    expect(blocks).toMatchObject([{ type: "table", rows: [[[text("1")]]] }, columns([paragraph(text("| 2 |"))])]);
  });

  test("a table inside a quote is a table, and an alert is a notice with a table in it", () => {
    const [alert] = blocksOf("> [!NOTE]\n> | a |\n> |--|\n> | 1 |");
    expect(alert).toMatchObject({ severity: "notice", children: [expect.anything(), { type: "table" }] });
  });

  test("gives an alert inside a quote its severity, and a quote inside an alert none", () => {
    const [outer] = blocksOf("> text\n> > [!WARNING]\n> > x");
    expect(outer).toMatchObject({ children: [expect.anything(), { severity: "caution" }] });
    expect(outer).not.toHaveProperty("severity");
    const [alert] = blocksOf("> [!NOTE]\n> > inner");
    expect(alert).toMatchObject({ severity: "notice", children: [expect.anything(), { type: "quote" }] });
    const inner = alert?.type === "quote" ? alert.children[1] : undefined;
    expect(inner).not.toHaveProperty("severity");
  });

  test("keeps HTML in a cell as its text, never a tag", () => {
    const source = "| <script>alert(1)</script> | <img src=x onerror=1> |\n|---|---|\n| <b>x</b> | [a](javascript:1) |";
    const blocks = blocksOf(source);
    expectAllowlisted(blocks);
    expect(shown(blocks)).toContain("<script>alert(1)</script>");
    expect(shown(blocks)).toContain("<img src=x onerror=1>");
    expect(blocks[0]).toMatchObject({ type: "table", rows: [[[text("<b>x</b>")], [text("[a](javascript:1)")]]] });
  });

  test("shows a gnoweb tag in a row as text, and a form ends the table", () => {
    const blocks = blocksOf('| a |\n|---|\n<gno-form exec="X">\n<gno-input name="n" />\n</gno-form>');
    expect(blocks.map((b) => b.type)).toEqual(["table", "form"]);
  });

  test("cuts a header of 40 thousand columns, keeping the first 64", () => {
    const n = 40_000;
    const [block] = blocksOf(`${"|a".repeat(n)}\n${"|-".repeat(n)}\n${"|b".repeat(n)}`);
    expect(block).toMatchObject({ type: "table", cut: true });
    if (block?.type !== "table") throw new Error("no table");
    expect(block.head).toHaveLength(MAX_TABLE_COLUMNS);
    expect(block.rows[0]).toHaveLength(MAX_TABLE_COLUMNS);
  });

  test("holds as many cells as the page has bytes, whatever the shape of its tables", () => {
    const table64 = `${"|a".repeat(64)}|\n${"|-".repeat(64)}|\n${"|x\n".repeat(MAX_TABLE_ROWS)}\n`;
    const source = table64.repeat(Math.floor(PAGE_MAX_BYTES / table64.length));
    const cells = blocksOf(source).reduce(
      (sum, block) => sum + (block.type === "table" ? block.head.length + block.rows.flat().length : 0),
      0,
    );
    expect(cells).toBeLessThanOrEqual(source.length);
  });

  test("cuts a header at the column cap and says so", () => {
    const wide = (n: number) => Array.from({ length: n }, (_, i) => "c" + String(i)).join(" | ");
    const dash = (n: number) => Array.from({ length: n }, () => "---").join("|");
    const [block] = blocksOf(
      `${wide(MAX_TABLE_COLUMNS + 5)}\n${dash(MAX_TABLE_COLUMNS + 5)}\n${wide(MAX_TABLE_COLUMNS + 9)}`,
    );
    expect(block).toMatchObject({ type: "table", cut: true });
    if (block?.type !== "table") throw new Error("no table");
    expect(block.head).toHaveLength(MAX_TABLE_COLUMNS);
    expect(block.align).toHaveLength(MAX_TABLE_COLUMNS);
    expect(block.rows[0]).toHaveLength(MAX_TABLE_COLUMNS);
    const exact = blocksOf(`${wide(MAX_TABLE_COLUMNS)}\n${dash(MAX_TABLE_COLUMNS)}`)[0];
    expect(exact).toMatchObject({ type: "table", cut: false });
  });

  test("keeps the rows to the row cap, says so, and reads the text after the table", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => "| r" + String(i) + " |").join("\n");
    const over = blocksOf(`| a |\n|---|\n${rows(MAX_TABLE_ROWS + 3)}\n\nafter`);
    expect(over[0]).toMatchObject({ type: "table", cut: true });
    if (over[0]?.type !== "table") throw new Error("no table");
    expect(over[0].rows).toHaveLength(MAX_TABLE_ROWS);
    expect(over[0].rows.at(-1)).toStrictEqual([[text("r" + String(MAX_TABLE_ROWS - 1))]]);
    expect(over[1]).toStrictEqual(paragraph(text("after")));
    const exact = blocksOf(`| a |\n|---|\n${rows(MAX_TABLE_ROWS)}`)[0];
    expect(exact).toMatchObject({ type: "table", cut: false });
  });

  test("states the caps", () => {
    expect([MAX_TABLE_COLUMNS, MAX_TABLE_ROWS]).toStrictEqual([64, 2000]);
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

// Slice 13's mutation pass: each case kills a StrykerJS survivor the tests above let live.
describe("page: the edges StrykerJS found in the page reader", () => {
  const countColumns = (blocks: readonly PageBlock[]): number =>
    [...blocksIn(blocks)].filter((block) => block.type === "columns").length;

  test.each([
    ["a two-byte letter at U+0080", "\u0080", 2],
    ["the last two-byte letter", "߿", 2],
    ["the first three-byte sign", "ࠀ", 3],
    ["a sign below the surrogates followed by a low half alone", "€\udc00", 6],
    ["a low half followed by a low half", "\udc00\udc00", 6],
    ["a high half followed by a sign past the low halves", "\ud800", 6],
    ["the first high half with the first low half", "𐀀", 4],
    ["the last high half with the last low half", "􏿿", 4],
  ])("counts %s as its UTF-8 bytes", (_name, unit, size) => {
    const count = Math.floor(PAGE_MAX_BYTES / size);
    expect(page(unit.repeat(count + 1))).toStrictEqual({
      kind: "too-big",
      bytes: (count + 1) * size,
      cap: PAGE_MAX_BYTES,
    });
    expect(page(unit.repeat(count)).kind).toBe("page");
  });

  test("reads every one of six columns in a row: a closed pair gives its depth back", () => {
    const source = Array.from({ length: 6 }, () => "<gno-columns>\nx\n</gno-columns>").join("\n");
    expect(blocksOf(source).map((block) => block.type)).toStrictEqual(Array<string>(6).fill("columns"));
  });

  test("reads the columns after a deeper stack was closed, the dead openers not counted", () => {
    const deep = "<gno-columns>\n".repeat(8) + "x\n" + "</gno-columns>\n".repeat(8);
    const blocks = blocksOf(`${deep}<gno-columns>\ny\n</gno-columns>`);
    expect(blocks.map((block) => block.type)).toStrictEqual(["columns", "columns"]);
  });

  test("makes no columns of a fifth opener whose only mate is the one closer there is", () => {
    // The first four openers never close, so the fifth stands at depth five: past the cap, it and its closer stay text.
    const source = `${"<gno-columns>\n".repeat(5)}x\n</gno-columns>`;
    expect(countColumns(blocksOf(source))).toBe(0);
    expect(shown(blocksOf(source)).split("<gno-columns>").length - 1).toBe(5);
  });

  test("makes a form's line holding a tag it does not know a line, trimmed", () => {
    const [form] = blocksOf('<gno-form>\n   <gno-other bogus="1" />   \n</gno-form>');
    expect(form).toMatchObject({ type: "form", fields: [{ tag: "other", value: '<gno-other bogus="1" />' }] });
  });

  test("counts a flag whose value has blanks round `true`, as gnoweb trims it (ext_forms.go:301)", () => {
    reads('<gno-form>\n<gno-input name="a" required=" true " />\n</gno-form>', {
      type: "form",
      exec: "",
      path: "",
      fields: [field("input", "a", { inputType: "text", flags: "required" })],
    });
  });

  test("opens fenced code whose language has blanks round it", () => {
    reads("``` go \ncode\n```", { type: "codeBlock", text: "code" });
    reads("```  go\ncode\n```", { type: "codeBlock", text: "code" });
  });

  test("makes one title of lines indented or not, each trimmed", () => {
    reads("Title\n   second   \n=====", heading(1, text("Title second")));
  });

  test("reads a table whose line holds a gno tag after other text", () => {
    const [table] = blocksOf("| a <gno-x> | b |\n|---|---|\n| 1 | 2 |");
    expect(table?.type).toBe("table");
  });

  test("opens an alert whatever blanks lead or trail its head, and trims its title", () => {
    reads(">  [!NOTE]\n> body", {
      type: "quote",
      severity: "notice",
      children: [paragraph(strong(text("Note"))), paragraph(text("body"))],
    });
    reads("> [!NOTE] Title  \n> body", {
      type: "quote",
      severity: "notice",
      children: [paragraph(strong(text("Title"))), paragraph(text("body"))],
    });
  });

  test("trims a heading's text", () => {
    reads("#  Title", heading(1, text("Title")));
  });

  test("ends a list item's lines at a blank line holding blanks", () => {
    const blocks = blocksOf("- [ ] a\n    \n  b");
    expect(blocks.map((block) => block.type)).toStrictEqual(["outline", "paragraph"]);
  });

  test("keeps an item with nothing in it out of a list that has tasks", () => {
    const blocks = blocksOf("- [ ] a\n-    \n- b");
    expect(blocks.map((block) => block.type)).toStrictEqual(["outline", "paragraph", "list"]);
  });

  test("reads a table whose rows are indented, and ends it at an indented block's start", () => {
    const [table, ...rest] = blocksOf("  | a | b |\n  |---|---|\n  | 1 | 2 |\n  > q");
    expect(table).toMatchObject({ type: "table", cut: false, rows: [[[text("1")], [text("2")]]] });
    expect(rest.map((block) => block.type)).toStrictEqual(["quote"]);
  });

  test("ends a table at a line of blanks", () => {
    const [table, ...rest] = blocksOf("|a|\n|-|\n|1|\n   \nx");
    expect(table).toMatchObject({ type: "table", rows: [[[text("1")]]] });
    expect(rest).toStrictEqual([paragraph(text("x"))]);
  });

  test("reads a table of one column whose rows have no closing pipe", () => {
    const [table] = blocksOf("|a\n|-\n|1");
    expect(table).toMatchObject({ type: "table", head: [[text("a")]], rows: [[[text("1")]]] });
  });

  test("leaves an indented item holding a pipe a list, not a table", () => {
    const blocks = blocksOf("  - a | b\n  --|--");
    expect(blocks.map((block) => block.type)).not.toContain("table");
  });
});
