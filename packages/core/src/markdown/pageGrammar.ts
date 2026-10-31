// A realm page's dialect of the block reader (5h): headings, alerts (a quote that opens with its kind), stacked columns and
// forms (every field shown), read down to blocks the page may draw, never HTML (gnoweb at gno v1.5.0, ADR-0002 §4).
// Any other tag is text. Every pass over the lines is linear: a close or a mate is found once for all the lines.
import type { Dialect, Grammar, Read } from "./blocks.ts";
import { inline, type Options } from "./inline.ts";
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
}

/** What a page holds beyond the chat's blocks. */
export type PageExtra =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: "form"; exec: string; fields: FormField[] };

/** A page's tree. */
export type PageBlock = Tree<PageExtra>;

const HEADING = /^(#{1,6}) (.*)$/s;
const ALERT = /^\[!([A-Za-z]+)\](-)?(?:[ \t]+(.*))?$/s;
const LABELS: Readonly<Record<string, string>> = {
  note: "Note",
  tip: "Tip",
  caution: "Caution",
  warning: "Warning",
  success: "Success",
};
const FIELDS = { "gno-input": "input", "gno-textarea": "textarea", "gno-select": "select" } as const;
// The attributes a field shows; any other makes the line an `other` one, shown whole.
const SHOWN = ["name", "type", "placeholder", "description", "value"];

// A field of gnoweb's from a line, or, if the line is no tag of one or holds an attribute not shown, an `other` one.
function fieldOf(line: string): FormField {
  const tag = tagOf(line);
  const kind = tag === undefined || tag.closing ? undefined : FIELDS[tag.name as keyof typeof FIELDS];
  if (tag === undefined || kind === undefined || [...tag.attributes.keys()].some((key) => !SHOWN.includes(key))) {
    return { tag: "other", name: "", inputType: "", value: line.trim(), placeholder: "", description: "" };
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
  };
}

// A form's opening line: `<gno-form>`, its only attribute `exec`; its function, or none.
function opening(line: string): { exec: string } | undefined {
  const tag = tagOf(line);
  if (tag?.name !== "gno-form" || tag.closing || tag.selfClosing) return undefined;
  const keys = [...tag.attributes.keys()];
  return keys.every((key) => key === "exec") ? { exec: tag.attributes.get("exec") ?? "" } : undefined;
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

const SEPARATORS = ["<gno-columns-sep>", "<gno-columns-sep/>", "<gno-columns-sep />"];

// Which lines are a columns tag with a mate: an opener and its closer, and the separators between them. A stack pairs
// them in one pass; a closer with no opener, an opener never closed and a separator outside columns stay text.
function columns(lines: readonly string[]): Uint8Array {
  const dropped = new Uint8Array(lines.length);
  const open: number[] = [];
  const seps: number[] = [];
  const pair = (closer: number) => {
    const opener = open.pop();
    if (opener === undefined) return;
    dropped[opener] = 1;
    dropped[closer] = 1;
    for (let sep = seps.at(-1); sep !== undefined && sep > opener; sep = seps.at(-1)) {
      dropped[sep] = 1;
      seps.pop();
    }
  };
  for (const [at, line] of lines.entries()) {
    const body = line.trim();
    if (body === "<gno-columns>") open.push(at);
    else if (SEPARATORS.includes(body)) seps.push(at);
    else if (body === "</gno-columns>") pair(at);
  }
  return dropped;
}

type Level = 1 | 2 | 3 | 4 | 5 | 6;

// A page's lines, read as the dialect asks: the blocks of its own that a line starts, a quote's head, a fence's language.
class PageLines implements Grammar<PageExtra> {
  readonly #lines: readonly string[];
  readonly #options: Options;
  #closers: Int32Array | undefined;
  #dropped: Uint8Array | undefined;

  constructor(lines: readonly string[], options: Options) {
    this.#lines = lines;
    this.#options = options;
  }

  inline = (line: string): Inline[] => inline(line, this.#options);

  // A word, as ```go: anything else after the backticks would be dropped from view, so the line is text.
  // The blanks go first, with `trim`, then a pattern with one run: two `\s*` round an optional middle took half a minute
  // on a line of blanks and a mark (R-F1).
  fence = (language: string): boolean => /^[\w+#.-]*$/.test(language.trim());

  extra(at: number): (() => Read<PageExtra>) | undefined {
    const body = (this.#lines[at] ?? "").trim();
    if (body.startsWith("#")) return this.#heading(at, body);
    if (!/^<\/?gno-/i.test(body)) return undefined;
    this.#dropped ??= columns(this.#lines);
    return this.#dropped[at] === 1 ? () => ({ next: at + 1 }) : this.#form(at, body);
  }

  head(inner: readonly string[]): { block: PageBlock; rest: string[] } | undefined {
    const alert = ALERT.exec((inner[0] ?? "").trim());
    if (alert === null) return undefined;
    const label = LABELS[(alert[1] ?? "").toLowerCase()] ?? "Info";
    const title = (alert[3] ?? "").trim() || label;
    const strong: Inline = { type: "strong", children: [{ type: "text", text: title }] };
    return { block: { type: "paragraph", children: [strong] }, rest: inner.slice(1) };
  }

  #heading(at: number, body: string): (() => Read<PageExtra>) | undefined {
    const found = HEADING.exec(body);
    const text = (found?.[2] ?? "").trim();
    if (found === null || text === "") return undefined;
    const level = (found[1] ?? "#").length as Level;
    return () => ({ next: at + 1, block: { type: "heading", level, children: this.inline(text) } });
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
    return () => ({ next: end + 1, block: { type: "form", exec: form.exec, fields: fields() } });
  }
}

/** The dialect of a realm's page. */
export function pageDialect(options: Options): Dialect<PageExtra> {
  return (lines) => new PageLines(lines, options);
}
