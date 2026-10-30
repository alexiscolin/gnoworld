const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

// What a tag is: its name when it opens or closes an element that has contents, none for a void or self-closed one.
function elementOf(tag: string): { name: string; closing: boolean } | undefined {
  const name = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag)?.[1]?.toLowerCase();
  if (name === undefined || VOID.has(name) || tag.endsWith("/>")) return undefined;
  return { name, closing: tag.startsWith("</") };
}

/** The text a reader of the page can reach: the markup's text outside every element that carries aria-hidden="true". */
export function readableText(html: string): string {
  const open: boolean[] = [];
  let hidden = 0;
  let text = "";
  for (const part of html.split(/(<[^>]*>)/)) {
    if (!part.startsWith("<")) {
      if (hidden === 0) text += part;
      continue;
    }
    const tag = elementOf(part);
    if (tag === undefined) continue;
    if (tag.closing) {
      if (open.pop() === true) hidden -= 1;
      continue;
    }
    const isHidden = /\saria-hidden="true"/.test(part);
    open.push(isHidden);
    if (isHidden) hidden += 1;
  }
  return text;
}
