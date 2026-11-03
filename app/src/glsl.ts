// The shaders' spaces stripped at build (Alexis, 2026-11-03): a GLSL compiler skips the spaces round its operators and the indentation, and a
// built chunk ships them, three's shader library most (about 550 B of the scene's gzip). Each built chunk is parsed; a string or template
// that reads as GLSL loses them, every token kept in order and every preprocessor line whole; nothing else of the chunk changes.

// Two characters that would read as one operator, or a comment, if the space between them went.
const JOINED = new Set([
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "<<",
  ">>",
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "^^",
  "&=",
]);
const MORE = new Set(["|=", "^=", "//", "/*", "*/"]);
const WORD = /[A-Za-z0-9_.]/;
// What makes a text GLSL: a statement's end and a word only a shader holds (a vector, a matrix, a sampler, a qualifier, gl_), or a line the
// preprocessor reads; prose and a template of the page's words hold neither.
const SHADER_WORD =
  /\b(?:[iub]?vec[234]|mat[234](?:x[234])?|sampler(?:2D|3D|Cube)\w*|uniform|varying|attribute|precision|gl_\w+|void\s+main)\b/;
const PREPROCESSOR = /^[ \t]*#(?:include|ifdef|ifndef|if|elif|else|endif|define|undef|version|pragma|extension)\b/m;
const isShader = (text: string) => (text.includes(";") && SHADER_WORD.test(text)) || PREPROCESSOR.test(text);

// Whether the space between `left` and `right` may go: not between two words, nor where the two would join.
const keeps = (left: string, right: string) =>
  (WORD.test(left) && WORD.test(right)) || JOINED.has(left + right) || MORE.has(left + right);

// One line of code, its spaces gone where nothing reads them.
function stripLine(line: string): string {
  const parts = line.trim().split(/\s+/);
  let out = parts[0] ?? "";
  for (const part of parts.slice(1)) out += keeps(out.at(-1) ?? "", part.charAt(0)) ? ` ${part}` : part;
  return out;
}

// A text's edge kept as what it was, for what is set in beside it: a line break as one, spaces as one space, nothing as nothing.
const edgeOf = (space: string) => (space === "" ? "" : space.includes("\n") ? "\n" : " ");

/** `glsl` with the spaces a compiler skips gone: comments, indentation, empty lines and the spaces round operators; a line the preprocessor
 * reads kept whole on its own line. Its edges are kept as they were, a line break as one and spaces as one space: code joins a string to
 * what stands beside it, a value set in or another string (three's `'#define ' + name`; 7v's security review, F4450). */
export function stripGlsl(glsl: string): string {
  // Whichever comment starts first: `// x /* y` is a line's comment, and the next line is code.
  const uncommented = glsl.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (comment) => (comment.startsWith("//") ? "" : " "));
  const lead = /^\s*/.exec(uncommented)?.[0] ?? "";
  const trail = /\s*$/.exec(uncommented.slice(lead.length))?.[0] ?? "";
  const body = linesOf(uncommented.slice(lead.length, uncommented.length - trail.length));
  return body === "" ? edgeOf(lead + trail) : edgeOf(lead) + body + edgeOf(trail);
}

// Each line stripped, a preprocessor's whole, the empty ones gone.
const linesOf = (text: string) =>
  text
    .split("\n")
    .map((line) => (line.trim().startsWith("#") ? line.trim().replace(/\s+/g, " ") : stripLine(line)))
    .filter((line) => line !== "")
    .join("\n");

interface Span {
  readonly start: number;
  readonly end: number;
}
interface Quasi extends Span {
  readonly value: { readonly raw: string };
}
type Node = Span & { readonly type: string; readonly [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";

// Whether `node` is a string or a template that reads as GLSL. A template that holds an escape is left whole: its lines are not all its
// text's, and a comment's end could be misread.
function readsAsShader(node: Node): boolean {
  if (node.type === "Literal") return typeof node["value"] === "string" && isShader(node["value"]);
  if (node.type !== "TemplateLiteral") return false;
  const raw = (node["quasis"] as readonly Quasi[]).map(({ value }) => value.raw).join(" ");
  return isShader(raw) && !raw.includes("\\");
}

// The strings and templates of `node`'s tree that read as GLSL, the outermost first: none inside one is taken again.
function shadersIn(node: Node, found: Node[]): void {
  if (readsAsShader(node)) {
    found.push(node);
    return;
  }
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value]) if (isNode(child)) shadersIn(child, found);
}

// A template's text, each part stripped, what is set in between left as it was.
function templateOf(code: string, node: Node): string {
  const quasis = node["quasis"] as readonly Quasi[];
  const expressions = node["expressions"] as readonly Span[];
  const parts = quasis.map(({ value }, at) => {
    const set = expressions[at];
    return stripGlsl(value.raw) + (set === undefined ? "" : `\${${code.slice(set.start, set.end)}}`);
  });
  return `\`${parts.join("")}\``;
}

/** A parser of a built chunk to its ESTree program, positions in UTF-16 units (Vite's `parseSync`, handed by the build's configs). */
export type Parse = (code: string) => unknown;

/** A built chunk with its shaders' spaces gone, each string or template that reads as GLSL; the rest as it was, to the byte. */
export function stripChunk(code: string, parse: Parse): string {
  const program = parse(code);
  const found: Node[] = [];
  if (isNode(program)) shadersIn(program, found);
  let out = "";
  let from = 0;
  for (const node of [...found].sort((a, b) => a.start - b.start)) {
    const text = node.type === "Literal" ? JSON.stringify(stripGlsl(String(node["value"]))) : templateOf(code, node);
    out += code.slice(from, node.start) + text;
    from = node.end;
  }
  return out + code.slice(from);
}

/** The build's plugin: each chunk the browser downloads with its shaders' spaces gone, a chunk with none left as it was. */
export const glslSpaces = (parse: Parse) => ({
  name: "gnoworld:glsl-spaces",
  apply: "build" as const,
  renderChunk(code: string) {
    const stripped = stripChunk(code, parse);
    return stripped === code ? null : { code: stripped, map: null };
  },
});
