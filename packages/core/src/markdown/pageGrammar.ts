// A realm page's dialect of the block reader (5h): headings, tables, alerts (a quote that opens with its kind and its severity), stacked columns and
// forms (every field shown), read down to blocks the page may draw, never HTML (gnoweb at gno v1.5.0, ADR-0002 §4).
// Any other tag is text. Every pass over the lines is linear: a close or a mate is found once for all the lines.
import { Blocks, type Dialect, type Grammar, type Read } from "./blocks.ts";
import { inline, type Options } from "./inline.ts";
import { listAt, type Listed, type Outline } from "./outline.ts";
import { isRule, underlineOf } from "./rules.ts";
import { columnPairs, type Pair } from "./columns.ts";
import { tableAt, type Table } from "./tables.ts";
import { tagOf } from "./tags.ts";
import type { Inline, Tree } from "./types.ts";

/** A line of a form: a field of gnoweb's or, `other`, a line that is none, held in `value` whole. */
export interface FormField {
  tag: "input" | "textarea" | "select" | "other";
  name: string;
  inputType: string;
  value: string;
  placeholder: string;
  description: string;
  /** gnoweb's flags the field carries, as the page wrote them: `required, readonly, checked, rows 4`. */
  flags: string;
}

export { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, type Align } from "./tables.ts";
export { MAX_LIST_DEPTH, type Outline, type OutlineItem } from "./outline.ts";

/** What a page holds beyond the chat's blocks. */
export type PageExtra =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | Table
  | Outline
  | { type: "rule" }
  | { type: "columns"; columns: PageBlock[][] }
  | { type: "form"; exec: string; path: string; fields: FormField[] };

/** A page's tree. */
export type PageBlock = Tree<PageExtra>;

const HEADING = /^(#{1,6}) (.*)$/s;
const ALERT = /^\[!([A-Za-z]+)\](-)?(?:[ \t]+(.*))?$/s;
// Looked up in Maps, never in objects: a page's word (`constructor`) must find nothing on an object's own keys (S-F3). Each
// is made where it is used, as the tests see it.

const alertLabel = (kind: string): string | undefined =>
  new Map([
    ["note", "Note"],
    ["tip", "Tip"],
    ["caution", "Caution"],
    ["warning", "Warning"],
    ["success", "Success"],
  ]).get(kind);
const fieldKind = (name: string): "input" | "textarea" | "select" | undefined =>
  new Map<string, "input" | "textarea" | "select">([
    ["gno-input", "input"],
    ["gno-textarea", "textarea"],
    ["gno-select", "select"],
  ]).get(name);
// The attributes a field shows; any other makes the line an `other` one, shown whole. The last four are gnoweb's flags
// (ext_forms.go at v1.5.0: `required`, `readonly`, `checked` count only as "true"; `rows` is a number of lines).
const SHOWN = ["name", "type", "placeholder", "description", "value", "required", "readonly", "checked", "rows"];
const FLAGS = ["required", "readonly", "checked"];

// A textarea's rows as gnoweb reads them: the number written, 4 when it is none or too large for an integer, kept between 2 and 10.
function rowsOf(written: string): number {
  const rows = Number.parseInt(written, 10);
  return Number.isSafeInteger(rows) ? Math.min(10, Math.max(2, rows)) : 4;
}

// The flags a field carries as gnoweb reads them, in one line.
function flagsOf(attributes: ReadonlyMap<string, string>): string {
  const flags = FLAGS.filter((flag) => attributes.get(flag)?.trim() === "true");
  const rows = attributes.get("rows");
  return (rows === undefined ? flags : [...flags, `rows ${String(rowsOf(rows))}`]).join(", ");
}

// A field of gnoweb's from a line, or, if the line is no tag of one or holds an attribute not shown, an `other` one.
function fieldOf(line: string): FormField {
  const tag = tagOf(line);
  const kind = tag === undefined || tag.closing ? undefined : fieldKind(tag.name);
  if (tag === undefined || kind === undefined || [...tag.attributes.keys()].some((key) => !SHOWN.includes(key))) {
    return { tag: "other", name: "", inputType: "", value: line.trim(), placeholder: "", description: "", flags: "" };
  }
  const get = (key: string) => tag.attributes.get(key) ?? "";
  const type = get("type").toLowerCase();
  return {
    tag: kind,
    name: get("name"),
    inputType: kind === "input" && type === "" ? "text" : type,
    value: get("value"),
    placeholder: get("placeholder"),
    description: get("description"),
    flags: flagsOf(tag.attributes),
  };
}

// A form's opening line: `<gno-form>`, its attributes `exec` and `path` (gnoweb's own) and no other; those, or none.
function opening(line: string): { exec: string; path: string } | undefined {
  const tag = tagOf(line);
  if (tag?.name !== "gno-form" || tag.closing || tag.selfClosing) return undefined;
  const keys = [...tag.attributes.keys()];
  if (!keys.every((key) => key === "exec" || key === "path")) return undefined;
  return { exec: tag.attributes.get("exec") ?? "", path: tag.attributes.get("path") ?? "" };
}
const closing = (line: string): boolean => {
  const tag = tagOf(line);
  return tag?.name === "gno-form" && tag.closing && !tag.selfClosing && tag.attributes.size === 0;
};

// For each line, the first `</gno-form>` from it to the end, or -1.
function closes(lines: readonly string[]): Int32Array {
  const next = new Int32Array(lines.length + 1).fill(-1);
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    next[at] = (lines[at] ?? "").includes("</") && closing(lines[at] ?? "") ? at : (next[at + 1] ?? -1);
  }
  return next;
}

type Level = 1 | 2 | 3 | 4 | 5 | 6;

// A page's lines, read as the dialect asks: the blocks of its own that a line starts, a quote's head, a fence's language.
class PageLines implements Grammar<PageExtra> {
  readonly #lines: readonly string[];
  readonly #options: Options;
  #closers: Int32Array | undefined;
  #pairs: Map<number, Pair> | undefined;
  readonly #base: number;
  readonly #lists = new Map<number, Listed | undefined>();
  // The lines of the last flat list read, which the chat's list holds: no item in it starts a richer one.
  #flat = { from: 0, to: 0 };

  constructor(lines: readonly string[], options: Options, base: number) {
    this.#lines = lines;
    this.#options = options;
    this.#base = base;
  }

  inline = (line: string): Inline[] => inline(line, this.#options);

  // A word, as ```go: anything else after the backticks would be dropped from view, so the line is text.
  // The blanks go first, with `trim`, then a pattern with one run: two `\s*` round an optional middle took half a minute
  // on a line of blanks and a mark (R-F1).
  fence = (language: string): boolean => /^[\w+#.-]*$/.test(language.trim());

  extra(at: number): (() => Read<PageExtra>) | undefined {
    const body = (this.#lines[at] ?? "").trim();
    if (body.startsWith("#")) return this.#heading(at, body);
    if (isRule(body)) return () => ({ next: at + 1, block: { type: "rule" } });
    if (!/^<\/?gno-/i.test(body)) return this.#outline(at) ?? tableAt(this.#lines, at, this.inline);
    this.#pairs ??= columnPairs(this.#lines, this.#base);
    const pair = this.#pairs.get(at);
    return pair === undefined ? this.#form(at, body) : () => this.#columns(at, pair);
  }

  setext = {
    under: (line: string) => underlineOf(line),
    title: (level: 1 | 2, lines: string[]): PageBlock => ({
      type: "heading",
      level,
      children: this.inline(lines.map((line) => line.trim()).join(" ")),
    }),
  };

  // A list with a list in an item, a task or a continued item; the chat's list reads any other.
  #outline(at: number): (() => Read<PageExtra>) | undefined {
    if (at >= this.#flat.from && at < this.#flat.to) return undefined;
    if (!this.#lists.has(at)) this.#lists.set(at, listAt(this.#lines, at, this.inline));
    const listed = this.#lists.get(at);
    if (listed === undefined) return undefined;
    if (!listed.rich) {
      this.#flat = { from: at, to: listed.next };
      return undefined;
    }
    return () => ({ next: listed.next, block: listed.list });
  }

  head(inner: readonly string[]): { block: PageBlock; severity: "notice" | "caution"; rest: string[] } | undefined {
    const alert = ALERT.exec((inner[0] ?? "").trim());
    if (alert === null) return undefined;
    const label = alertLabel((alert[1] ?? "").toLowerCase()) ?? "Info";
    const title = (alert[3] ?? "").trim() || label;
    const strong: Inline = { type: "strong", children: [{ type: "text", text: title }] };
    const severity = ["caution", "warning"].includes((alert[1] ?? "").toLowerCase()) ? "caution" : "notice";
    return { block: { type: "paragraph", children: [strong] }, severity, rest: inner.slice(1) };
  }

  #heading(at: number, body: string): (() => Read<PageExtra>) | undefined {
    const found = HEADING.exec(body);
    const text = (found?.[2] ?? "").trim();
    if (found === null) return undefined;
    const level = (found[1] ?? "#").length as Level;
    return () => ({ next: at + 1, block: { type: "heading", level, children: this.inline(text) } });
  }

  // Columns: each column's lines read as a page, one column deeper; a column with nothing in it is none.
  #columns(at: number, pair: Pair): Read<PageExtra> {
    const edges = [at, ...pair.seps, pair.end];
    const nested: Dialect<PageExtra> = (lines) => new PageLines(lines, this.#options, this.#base + 1);
    const read: PageBlock[][] = [];
    for (let n = 0; n + 1 < edges.length; n += 1) {
      const lines = this.#lines.slice((edges[n] ?? 0) + 1, edges[n + 1]);
      const blocks = new Blocks<PageExtra>(lines, 0, nested).read();
      if (blocks.length > 0) read.push(blocks);
    }
    const next = pair.end + 1;
    return read.length === 0 ? { next } : { next, block: { type: "columns", columns: read } };
  }

  #form(at: number, body: string): (() => Read<PageExtra>) | undefined {
    const form = opening(body);
    this.#closers ??= closes(this.#lines);
    const end = this.#closers[at + 1] ?? -1;
    if (form === undefined || end === -1) return undefined;
    const fields = () =>
      this.#lines
        .slice(at + 1, end)
        .filter((line) => line.trim() !== "")
        .map(fieldOf);
    return () => ({ next: end + 1, block: { type: "form", exec: form.exec, path: form.path, fields: fields() } });
  }
}

/** The dialect of a realm's page. */
export function pageDialect(options: Options): Dialect<PageExtra> {
  return (lines) => new PageLines(lines, options, 0);
}
