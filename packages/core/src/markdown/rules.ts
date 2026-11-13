// The lines that are no text on a page (CommonMark): a thematic break (three or more of one of `-`, `*` and `_`,
// blanks between them allowed) and a setext heading's underline (`=` or `-`, as many as written).

const RULE = /^(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const UNDERLINE = /^(?:=+|-+)$/;

/** Whether a line is a thematic break. */
export const isRule = (line: string): boolean => RULE.test(line.trim());

/** The level of the title a line underlines: 1 for `=`, 2 for `-`; none for any other line. */
export const underlineOf = (line: string): 1 | 2 | undefined => {
  const body = line.trim();
  if (!UNDERLINE.test(body)) return undefined;
  return body.startsWith("=") ? 1 : 2;
};
