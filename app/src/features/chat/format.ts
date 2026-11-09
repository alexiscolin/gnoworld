// The format bar's edits (slice 4's 4c): a draft's selection wrapped in a Markdown mark, or unwrapped when it already
// is; a link made of it; a quote's or a list's start on the line, taken off, or one list's turned to the other's. A
// mark goes round whole words, the selection's spaces outside: Markdown reads a mark at a word's bounds alone.
import { inWord } from "@gnoworld/core";
import { isEscaped, readsOneMore, underlined } from "./underline.ts";

export type Format = "bold" | "italic" | "underline" | "strike" | "code" | "link" | "quote" | "bulleted" | "numbered";

/** A draft, and its selection from `start` to `end` (the caret, when they are one). */
export interface Edit {
  text: string;
  start: number;
  end: number;
}

const MARKS = { bold: "**", italic: "*", underline: "++", strike: "~~", code: "`" } as const;
const STARTS = { quote: "> ", bulleted: "- ", numbered: "1. " } as const;
// The starts the bar puts on a line, which it takes off or turns: a number other than 1 is the writer's own text.
const LIST = /^(?:[-*+]|1\.) /;
const SAME = { quote: /^> /, bulleted: /^[-*+] /, numbered: /^1\. / } as const;
const ADDRESS = "https://";

/** The draft once `format` is applied to its selection, and the selection after. */
export function formatted(edit: Edit, format: Format): Edit {
  if (format === "link") return linked(edit);
  if (format === "quote" || format === "bulleted" || format === "numbered") return started(edit, format);
  const chosen = words(edit);
  return format === "underline" ? underlineOf(chosen) : marked(chosen, MARKS[format]);
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

// Whether the character at `at` is `mark`'s own: one a backslash escapes is the writer's text (F5387a).
const own = (text: string, at: number, mark: string) => text[at] === mark[0] && !isEscaped(text, at);

// The selection begins and ends with `mark`, and no more of its character inside: `*` is not in `**a**`.
function inside({ text, start: from, end: to }: Edit, mark: string): boolean {
  const size = mark.length;
  const ends = text.slice(from, from + size) === mark && text.slice(to - size, to) === mark;
  return to - from >= 2 * size && ends && !own(text, from + size, mark) && !own(text, to - size - 1, mark);
}

// `mark` sits just before the selection and just after it, and no more of its character beyond.
function around({ text, start: from, end: to }: Edit, mark: string): boolean {
  const size = mark.length;
  const ends = from >= size && text.slice(from - size, from) === mark && text.slice(to, to + size) === mark;
  return ends && !own(text, from - size - 1, mark) && !own(text, to + size, mark);
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

// The underline taken off where the reader reads one there, or round a caret (the bar's empty pair); else written as the
// reader reads one (underline.ts).
function underlineOf(chosen: Edit): Edit {
  const mark = MARKS.underline;
  const off = inside(chosen, mark) || around(chosen, mark) ? marked(chosen, mark) : undefined;
  if (off !== undefined && (chosen.start === chosen.end || readsOneMore(off.text, chosen.text))) return off;
  return underlined(chosen);
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

// The start of each line the selection touches (the caret's line, for a caret; a selection ending at a line's very
// start leaves that line out), put on, taken off or turned to another list's; the selection on the same letters. It
// comes off when every line with text has it. A blank line is bare in a list, marked in a quote, which a bare one ends.
function started({ text, start, end }: Edit, format: keyof typeof STARTS): Edit {
  const from = text.slice(0, start).lastIndexOf("\n") + 1;
  const last = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const found = text.indexOf("\n", last);
  const to = found === -1 ? text.length : found;
  const lines = text.slice(from, to).split("\n");
  const existing = lines.map((line) => (format === "quote" ? /^> / : LIST).exec(line)?.[0] ?? "");
  // A caret on a blank line alone starts it: it is the only line there is.
  const hasText = lines.some((line) => line.trim() !== "");
  const blank = (n: number) => hasText && lines[n]?.trim() === "";
  const prefix = existing.every((mark, n) => blank(n) || SAME[format].test(mark)) ? "" : STARTS[format];
  const given = (n: number) => (blank(n) && format !== "quote" ? "" : prefix);
  // A position stays on its letter: after the line's new start when it was within the old one, and past the lines above
  // by what they gained or lost.
  const moved = (at: number): number => {
    let before = from;
    let shift = 0;
    for (const [n, line] of lines.entries()) {
      const mark = existing[n]?.length ?? 0;
      if (at <= before + line.length) return before + shift + Math.max(at - before - mark, 0) + given(n).length;
      before += line.length + 1;
      shift += given(n).length - mark;
    }
    return at + shift;
  };
  const changed = lines.map((line, n) => given(n) + line.slice(existing[n]?.length ?? 0)).join("\n");
  return { text: text.slice(0, from) + changed + text.slice(to), start: moved(start), end: moved(end) };
}
