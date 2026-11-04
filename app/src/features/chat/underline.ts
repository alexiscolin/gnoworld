// The format bar's underline (8k): the words between two `++`, written so the room reads them as the writer sees them.
// The reader decides: of the ways to write it, the first that reads as the draft did with one underline more is kept
// (F5380, F5387 to F5389): as written; the writer's `+` beside the bar's runs escaped, as they would join them; each
// address ending in `+` written as a link to itself, as an underline's run would end it there; else every `+` escaped.
import { inlines, markdown, type Block, type Inline } from "@gnoworld/core";

/** A draft and its selection. */
interface Span {
  text: string;
  start: number;
  end: number;
}

const RUN = "++";

/** Whether the character at `at` is escaped: an odd run of backslashes before it. */
export function isEscaped(text: string, at: number): boolean {
  let backslashes = 0;
  while (text[at - 1 - backslashes] === "\\") backslashes += 1;
  return backslashes % 2 === 1;
}

// `part`, each `+` that `picked` names by its place escaped, but one a backslash escapes already (`prior`'s count too).
function escaped(part: string, picked: (at: number) => boolean, prior = ""): string {
  const whole = prior + part;
  let out = "";
  for (let at = 0; at < part.length; at += 1) {
    const char = part.charAt(at);
    out += char === "+" && picked(at) && !isEscaped(whole, prior.length + at) ? "\\+" : char;
  }
  return out;
}

// The draft with `inner` standing for the selection between the bar's runs; the writer's `+` beside the runs (just before
// and after the selection, and the selection's own at its ends) escaped when `beside`, and every one of them when `all`.
function written({ text, start, end }: Span, inner: string, escapes: "none" | "beside" | "all"): Span {
  let before = start;
  while (text[before - 1] === "+") before -= 1;
  let after = end;
  while (text[after] === "+") after += 1;
  const all = () => true;
  const outside = (part: string, prior: string) => (escapes === "none" ? part : escaped(part, all, prior));
  const lead = inner.length - inner.replace(/^\++/, "").length;
  const trail = inner.length - inner.replace(/\++$/, "").length;
  const ends = (at: number) => escapes === "all" || at < lead || at >= inner.length - trail;
  const own = escapes === "none" ? inner : escaped(inner, ends);
  const opened = `${text.slice(0, before)}${outside(text.slice(before, start), text.slice(0, before))}${RUN}`;
  return {
    text: `${opened}${own}${RUN}${outside(text.slice(end, after), "")}${text.slice(after)}`,
    start: opened.length,
    end: opened.length + own.length,
  };
}

// The selection with each https address ending in `+` written as a link to itself, which keeps its `+`.
const addressed = (inner: string) =>
  inner.replaceAll(/https:\/\/\S*\+(?=\s|$)/g, (address) => `[${address}](${address})`);

// Nodes with their underlines taken off, what each held in its place and texts joined: what one more underline leaves.
function unlined(nodes: readonly Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    const parts =
      node.type === "underline"
        ? unlined(node.children)
        : ["children" in node ? { ...node, children: unlined(node.children) } : node];
    for (const part of parts) {
      const last = out.at(-1);
      if (part.type === "text" && last?.type === "text")
        out[out.length - 1] = { type: "text", text: last.text + part.text };
      else out.push(part);
    }
  }
  return out;
}

function unlinedBlock(block: Block): Block {
  if (block.type === "paragraph") return { type: "paragraph", children: unlined(block.children) };
  if (block.type === "quote") return { type: "quote", children: block.children.map(unlinedBlock) };
  if (block.type === "list") return { ...block, items: block.items.map(unlined) };
  return block;
}

const underlines = (blocks: readonly Block[]) =>
  [...inlines(blocks)].filter((node) => node.type === "underline").length;

// Whether `now` reads as `was` did, with one underline more.
function oneMore(was: readonly Block[], now: string): boolean {
  const read = markdown(now);
  const same = JSON.stringify(read.map(unlinedBlock)) === JSON.stringify(was.map(unlinedBlock));
  return same && underlines(read) === underlines(was) + 1;
}

/** Whether `after` reads as `before` does with one underline more: what taking one off must undo alone. */
export const readsOneMore = (before: string, after: string): boolean => oneMore(markdown(before), after);

/** The draft with its selection's words underlined, the selection on them: the first way of writing it that reads as
 * the draft did with one underline more, else every `+` escaped. */
export function underlined(span: Span): Span {
  const was = markdown(span.text);
  const inner = span.text.slice(span.start, span.end);
  const ways = [
    written(span, inner, "none"),
    written(span, inner, "beside"),
    written(span, addressed(inner), "beside"),
  ];
  return ways.find((way) => oneMore(was, way.text)) ?? written(span, inner, "all");
}
