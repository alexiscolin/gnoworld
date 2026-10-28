// IRCv3 lines: tags, source, command and parameters (modern.ircdocs.horse, "Message Format";
// ircv3.net/specs/extensions/message-tags). Over WebSocket, one message is one line.
// Written by Claude against the pairing's tests, Alexis away (docs/decisions.md, 2026-10-22).

/** ASCII letters in upper case, or a three-digit numeric: made only by toIrcCommand and parseLine. */
export type IrcCommand = string & { readonly __brand: "IrcCommand" };

export interface IrcMessage {
  /** A missing value and an empty one are the same: "". The last of a repeated key wins. */
  readonly tags: ReadonlyMap<string, string>;
  /** `nick!user@host` or a server name, without its leading ":". An empty one reads as absent. */
  readonly source?: string;
  readonly command: IrcCommand;
  readonly params: readonly string[];
}

export type IrcParseError =
  "empty" | "bad-character" | "empty-source" | "no-command" | "bad-command" | "tags-too-long" | "body-too-long";

export type IrcParsed =
  { readonly ok: true; readonly message: IrcMessage } | { readonly ok: false; readonly error: IrcParseError };

// Lines from a server: 8191 bytes of tags with the @ and the space, 510 of the rest. A client sends at
// most 4094 bytes of tag data, without them (IRCv3 message-tags).
const TAGS_MAX = 8191;
/** The bytes of an IRC line after its tags: RFC 1459's 512, less CR LF. */
export const LINE_BYTES = 510;
const CLIENT_TAGS_MAX = 4094;

// A key is [+][vendor/]name: name is letters, digits and hyphens; vendor a DNS host name (IRCv3 says a
// host; we read it as one with no IPv6 literal, whose colons would end the key).
function isTagKey(key: string): boolean {
  const label = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
  return new RegExp(`^\\+?(?:${label}(?:\\.${label})*/)?[A-Za-z0-9-]+$`).test(key);
}

/** The UTF-8 length of a string, without encoding it; a lone surrogate counts three, as the character replacing it. */
export function bytes(text: string): number {
  let size = 0;
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    size += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return size;
}

const ESCAPES: Readonly<Record<string, string>> = { ";": "\\:", " ": "\\s", "\\": "\\\\", "\r": "\\r", "\n": "\\n" };
const UNESCAPES: Readonly<Record<string, string>> = { ":": ";", s: " ", "\\": "\\", r: "\r", n: "\n" };

export function escapeTagValue(value: string): string {
  return value.replace(/[; \\\r\n]/g, (char) => ESCAPES[char] ?? char);
}

export function unescapeTagValue(escaped: string): string {
  let out = "";
  let pending = false;
  for (const char of escaped) {
    if (pending) out += UNESCAPES[char] ?? char;
    else if (char !== "\\") out += char;
    pending = !pending && char === "\\";
  }
  return out;
}

/** The command a string names, its letters folded to upper case; undefined when it names none. */
export function toIrcCommand(raw: string): IrcCommand | undefined {
  if (/^[A-Za-z]+$/.test(raw)) return raw.toUpperCase() as IrcCommand;
  return /^\d{3}$/.test(raw) ? (raw as IrcCommand) : undefined;
}

function readTags(text: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const item of text.split(";")) {
    const equals = item.indexOf("=");
    const [key, value] = equals === -1 ? [item, ""] : [item.slice(0, equals), item.slice(equals + 1)];
    if (isTagKey(key)) tags.set(key, unescapeTagValue(value));
  }
  return tags;
}

// The first word of a text and what follows it, the spaces between left out.
function split(text: string): [string, string] {
  const space = text.indexOf(" ");
  return space === -1 ? [text, ""] : [text.slice(0, space), text.slice(space + 1).replace(/^ +/, "")];
}

function readParams(text: string): string[] {
  const params: string[] = [];
  let rest = text;
  while (rest !== "") {
    if (rest.startsWith(":")) return [...params, rest.slice(1)];
    const [word, after] = split(rest);
    params.push(word);
    rest = after;
  }
  return params;
}

// The rest of a line once its tags and their one space are read: source, command, parameters. It counts
// whole, the spaces before its command too (F667); a source is never empty, as formatLine writes none (F669).
function readBody(whole: string, tags: Map<string, string>): IrcParsed {
  if (bytes(whole) > LINE_BYTES) return { ok: false, error: "body-too-long" };
  const body = whole.replace(/^ +/, "");
  const [source, afterSource] = body.startsWith(":") ? split(body.slice(1)) : ["", body];
  if (body.startsWith(":") && source === "") return { ok: false, error: "empty-source" };
  const [word, rest] = split(afterSource);
  if (word === "") return { ok: false, error: "no-command" };
  const command = toIrcCommand(word);
  if (command === undefined) return { ok: false, error: "bad-command" };
  return { ok: true, message: { tags, command, params: readParams(rest), ...(source === "" ? {} : { source }) } };
}

// No NUL, CR or LF, and no lone surrogate: what a line may hold, read or written.
const clean = (text: string): boolean => !/[\0\r\n]/.test(text) && text.isWellFormed();

/** Reads one line from the relay, which is untrusted: it never throws. It refuses lines over the limits
 * (UTF-8 bytes: 8191 of tags with the @ and the space, 510 of the rest), NUL, and CR or LF but at the end. */
export function parseLine(line: string): IrcParsed {
  const text = line.replace(/\r\n$|\r$|\n$/, "");
  if (!clean(text)) return { ok: false, error: "bad-character" };
  // IRC splits on spaces alone: a tab is part of a word.
  if (/^ *$/.test(text)) return { ok: false, error: "empty" };
  if (!text.startsWith("@")) return readBody(text, new Map<string, string>());
  const space = text.indexOf(" ");
  const tags = space === -1 ? text : text.slice(0, space);
  // The @ and one space: IRCv3 counts one, and the spaces after it are not tags.
  if (bytes(tags) + 1 > TAGS_MAX) return { ok: false, error: "tags-too-long" };
  if (space === -1) return { ok: false, error: "no-command" };
  return readBody(text.slice(space + 1), readTags(tags.slice(1)));
}

function refuse(what: string): never {
  throw new RangeError(`formatLine: ${what}`);
}

function formatTags(tags: ReadonlyMap<string, string>): string {
  const written: string[] = [];
  for (const [key, value] of tags) {
    if (!isTagKey(key)) refuse("a tag key is [+][vendor/]name");
    if (value.includes("\0") || !value.isWellFormed()) refuse("a tag value holds no NUL and no lone surrogate");
    written.push(value === "" ? key : `${key}=${escapeTagValue(value)}`);
  }
  const data = written.join(";");
  if (bytes(data) > CLIENT_TAGS_MAX) refuse("a client sends 4094 bytes of tag data at most");
  return data;
}

function formatParams(params: readonly string[]): string[] {
  return params.map((param, index) => {
    if (!clean(param)) refuse("a parameter holds no NUL, CR or LF");
    const bare = param !== "" && !param.includes(" ") && !param.startsWith(":");
    if (!bare && index < params.length - 1) refuse("a middle parameter is a word that does not start with a colon");
    return bare ? param : `:${param}`;
  });
}

/** Writes one line, without CR LF, the last parameter's colon only when needed. Throws a RangeError
 * on a message no IRC line can carry, or one parseLine would read differently. A client sends at
 * most 4094 UTF-8 bytes of tag data (IRCv3 message-tags), not the 8191 a server may send. */
export function formatLine(message: IrcMessage): string {
  const { tags, source, command, params } = message;
  if (toIrcCommand(command) !== command) refuse("a command is ASCII letters in upper case or three digits");
  const data = formatTags(tags);
  if (source !== undefined && (source === "" || source.includes(" ") || !clean(source))) {
    refuse("a source is a word with no NUL, CR or LF");
  }
  const body = [...(source === undefined ? [] : [`:${source}`]), command, ...formatParams(params)].join(" ");
  if (bytes(body) > LINE_BYTES) refuse("a line holds 510 bytes after its tags");
  return data === "" ? body : `@${data} ${body}`;
}
