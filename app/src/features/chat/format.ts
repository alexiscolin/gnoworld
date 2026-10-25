// The format bar's edits (slice 4's 4c): a draft's selection wrapped in a Markdown mark, or unwrapped when it already
// is; a link made of it; a quote's or a list's start on the line, taken off, or one list's turned to the other's. A
// mark goes round whole words, the selection's spaces outside: Markdown reads a mark at a word's bounds alone.
import { inWord } from "@gnoworld/core";

export type Format = "bold" | "italic" | "strike" | "code" | "link" | "quote" | "bulleted" | "numbered";

/** A draft, and its selection from `start` to `end` (the caret, when they are one). */
export interface Edit {
  text: string;
  start: number;
  end: number;
}

const MARKS = { bold: "**", italic: "*", strike: "~~", code: "`" } as const;
const STARTS = { quote: "> ", bulleted: "- ", numbered: "1. " } as const;
// The starts the bar puts on a line, which it takes off or turns: a number other than 1 is the writer's own text.
const LIST = /^(?:[-*+]|1\.) /;
const SAME = { quote: /^> /, bulleted: /^[-*+] /, numbered: /^1\. / } as const;
const ADDRESS = "https://";

/** The draft once `format` is applied to its selection, and the selection after. */
export function formatted(edit: Edit, format: Format): Edit {
  if (format === "link") return linked(edit);
  if (format === "quote" || format === "bulleted" || format === "numbered") return started(edit, format);
  return marked(words(edit), MARKS[format]);
}

// The selection less its spaces; a selection of spaces alone, a caret at its end.
function trimmed({ text, start, end }: Edit): Edit {
  const selected = text.slice(start, end);
  if (selected !== "" && selected.trim() === "") return { text, start: end, end };
  return {
    text,
    start: start + selected.length - selected.trimStart().length,
    end: end - (selected.length - selected.trimEnd().length),
  };
}

// The words a mark goes round: the selection less its spaces, widened to whole words (a caret, to the word it
// touches); a selection of spaces alone stays a caret at its end.
function words(edit: Edit): Edit {
  const selected = edit.text.slice(edit.start, edit.end);
  let { start: from, end: to } = trimmed(edit);
  if (selected === "" || selected.trim() !== "") {
    while (inWord(edit.text[from - 1])) from -= 1;
    while (inWord(edit.text[to])) to += 1;
  }
  return { text: edit.text, start: from, end: to };
}

// The selection begins and ends with `mark`, and no more of its character inside: `*` is not in `**a**`.
function inside({ text, start: from, end: to }: Edit, mark: string): boolean {
  const size = mark.length;
  const ends = text.slice(from, from + size) === mark && text.slice(to - size, to) === mark;
  return to - from >= 2 * size && ends && text[from + size] !== mark[0] && text[to - size - 1] !== mark[0];
}

// `mark` sits just before the selection and just after it, and no more of its character beyond.
function around({ text, start: from, end: to }: Edit, mark: string): boolean {
  const size = mark.length;
  const ends = from >= size && text.slice(from - size, from) === mark && text.slice(to, to + size) === mark;
  return ends && text[from - size - 1] !== mark[0] && text[to + size] !== mark[0];
}

function marked(words: Edit, mark: string): Edit {
  const { text, start: from, end: to } = words;
  const size = mark.length;
  if (inside(words, mark)) {
    return {
      text: text.slice(0, from) + text.slice(from + size, to - size) + text.slice(to),
      start: from,
      end: to - 2 * size,
    };
  }
  if (around(words, mark)) {
    return {
      text: text.slice(0, from - size) + text.slice(from, to) + text.slice(to + size),
      start: from - size,
      end: to - size,
    };
  }
  return {
    text: text.slice(0, from) + mark + text.slice(from, to) + mark + text.slice(to),
    start: from + size,
    end: to + size,
  };
}

// The selection, less its spaces, as a link's label, the address after it selected to be typed; at a caret, the label
// to be typed.
function linked(edit: Edit): Edit {
  const { text, start, end } = trimmed(edit);
  // Escaped, its brackets and backslashes are the label's own: the reader closes it at the bar's `]` alone.
  const label = text.slice(start, end).replaceAll(/[[\]\\]/g, (char) => `\\${char}`);
  const result = `${text.slice(0, start)}[${label}](${ADDRESS})${text.slice(end)}`;
  if (label === "") return { text: result, start: start + 1, end: start + 1 };
  const address = start + label.length + "[](".length;
  return { text: result, start: address, end: address + ADDRESS.length };
}

// The line's start, put on or taken off, or a list's turned to the other kind; the selection on the same letters.
function started({ text, start, end }: Edit, format: keyof typeof STARTS): Edit {
  const existing = (format === "quote" ? /^> / : LIST).exec(text)?.[0] ?? "";
  // The line already starts as asked: the start comes off; another list's is turned to this one's.
  const prefix = SAME[format].test(existing) ? "" : STARTS[format];
  const moved = (at: number) => Math.max(at - existing.length, 0) + prefix.length;
  return { text: prefix + text.slice(existing.length), start: moved(start), end: moved(end) };
}
