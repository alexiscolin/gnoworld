// A line that is one gnoweb tag and nothing else (5h): `<gno-input name="a" type='text' />`, read once left to right, an
// attribute's value quoted either way or bare. Anything else about the line, an attribute twice, a quote never closed, a
// word after the tag, is none: the page shows that line as text, so no attribute, however it is written, stays out of view.

/** A tag: its name and attributes in lower case, whether it closes (`</…>`) or closes itself (`…/>`). */
export interface Tag {
  readonly name: string;
  readonly closing: boolean;
  readonly selfClosing: boolean;
  readonly attributes: ReadonlyMap<string, string>;
}

const NAME = /<(\/?)([A-Za-z][A-Za-z0-9-]*)\s*/y;
const KEY = /([^\s"'<>/=]+)\s*/y;
const EQUALS = /=\s*/y;
const QUOTED = /"([^"]*)"\s*|'([^']*)'\s*/y;
const BARE = /([^\s"'<>`=]+)\s*/y;

function match(pattern: RegExp, source: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(source);
}

// An attribute's value from `at`, after its `=`: quoted either way or bare; and where the next thing starts.
function valueAt(source: string, at: number): { value: string; end: number } | undefined {
  const found = match(QUOTED, source, at) ?? match(BARE, source, at);
  if (found === null) return undefined;
  return { value: found[1] ?? found[2] ?? "", end: at + found[0].length };
}

// An attribute from `at`: its name, its value if it has one, and where the next thing starts.
function attributeAt(source: string, at: number): { key: string; value: string; end: number } | undefined {
  const key = match(KEY, source, at);
  if (key === null) return undefined;
  const key_ = (key[1] ?? "").toLowerCase();
  const next = at + key[0].length;
  const equals = match(EQUALS, source, next);
  if (equals === null) return { key: key_, value: "", end: next };
  const value = valueAt(source, next + equals[0].length);
  return value === undefined ? undefined : { key: key_, ...value };
}

/** The tag a line is, or none. */
export function tagOf(line: string): Tag | undefined {
  const source = line.trim();
  const open = match(NAME, source, 0);
  if (open === null) return undefined;
  const attributes = new Map<string, string>();
  let at = open[0].length;
  while (!source.startsWith(">", at) && !source.startsWith("/>", at)) {
    const attribute = attributeAt(source, at);
    if (attribute === undefined || attributes.has(attribute.key)) return undefined;
    attributes.set(attribute.key, attribute.value);
    at = attribute.end;
  }
  const selfClosing = source.startsWith("/>", at);
  if (at + (selfClosing ? 2 : 1) !== source.length) return undefined;
  return { name: (open[2] ?? "").toLowerCase(), closing: open[1] === "/", selfClosing, attributes };
}
