// Reading and writing IRCv3 lines, which have tags, a source, a command and parameters (modern.ircdocs.horse,
// "Message Format"; ircv3.net/specs/extensions/message-tags). Over WebSocket, one message is one line.
import { utf8Bytes } from "../text/utf8.ts";

/** Upper-case ASCII letters, or a three-digit number. Only toIrcCommand and parseLine create these. */
export type IrcCommand = string & { readonly __brand: "IrcCommand" };

export interface IrcMessage {
  /** A missing value and an empty value are the same thing: "". If a key is repeated, the last one wins. */
  readonly tags: ReadonlyMap<string, string>;
  /** `nick!user@host` or a server name, without the leading ":". An empty source counts as absent. */
  readonly source?: string;
  readonly command: IrcCommand;
  readonly params: readonly string[];
}

type IrcParseError =
  "empty" | "bad-character" | "empty-source" | "no-command" | "bad-command" | "tags-too-long" | "body-too-long";

export type IrcParsed =
  { readonly ok: true; readonly message: IrcMessage } | { readonly ok: false; readonly error: IrcParseError };

// A line from a server may have 8191 bytes of tags (counting the @ and the space) and 510 bytes for the rest.
// A client may send at most 4094 bytes of tag data, not counting the @ and the space (IRCv3 message-tags).
const TAGS_MAX = 8191;
/** The most bytes an IRC line may have after its tags: the 512 of RFC 1459, minus the 2 bytes of CR LF. */
export const LINE_BYTES = 510;
const CLIENT_TAGS_MAX = 4094;

// A tag key looks like [+][vendor/]name. The name holds letters, digits and hyphens, and the vendor is a DNS
// host name. IRCv3 only says "a host", so we accept no IPv6 literal, because its colons would end the key.
function isTagKey(key: string): boolean {
  const label = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
  return new RegExp(`^\\+?(?:${label}(?:\\.${label})*/)?[A-Za-z0-9-]+$`).test(key);
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

/** Returns the command that a string names, with its letters in upper case, or undefined if it names no command. */
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

// Splits a text into its first word and the rest, dropping the spaces between them.
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

// Reads the rest of a line after its tags and the one space that follows them: the source, command and
// parameters. The length limit applies to all of it, including any spaces before the command. A source is
// never empty, because formatLine never writes an empty one.
function readBody(whole: string, tags: Map<string, string>): IrcParsed {
  if (utf8Bytes(whole) > LINE_BYTES) return { ok: false, error: "body-too-long" };
  const body = whole.replace(/^ +/, "");
  const [source, afterSource] = body.startsWith(":") ? split(body.slice(1)) : ["", body];
  if (body.startsWith(":") && source === "") return { ok: false, error: "empty-source" };
  const [word, rest] = split(afterSource);
  if (word === "") return { ok: false, error: "no-command" };
  const command = toIrcCommand(word);
  if (command === undefined) return { ok: false, error: "bad-command" };
  return { ok: true, message: { tags, command, params: readParams(rest), ...(source === "" ? {} : { source }) } };
}

// A line may hold no NUL, CR or LF, and no lone surrogate, whether it is read or written.
const clean = (text: string): boolean => !/[\0\r\n]/.test(text) && text.isWellFormed();

/** Reads one line from the relay, which is untrusted, and never throws. It refuses a line that is over the limits
 * (in UTF-8 bytes: 8191 for tags, counting the @ and the space, and 510 for the rest), or that has a NUL,
 * or has a CR or LF anywhere but the end. */
export function parseLine(line: string): IrcParsed {
  const text = line.replace(/\r\n$|\r$|\n$/, "");
  if (!clean(text)) return { ok: false, error: "bad-character" };
  // IRC splits only on spaces, so a tab is part of a word.
  if (/^ *$/.test(text)) return { ok: false, error: "empty" };
  if (!text.startsWith("@")) return readBody(text, new Map<string, string>());
  const space = text.indexOf(" ");
  const tags = space === -1 ? text : text.slice(0, space);
  // Count the @ and one space. IRCv3 counts just one space, and any spaces after it are not part of the tags.
  if (utf8Bytes(tags) + 1 > TAGS_MAX) return { ok: false, error: "tags-too-long" };
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
  if (utf8Bytes(data) > CLIENT_TAGS_MAX) refuse("a client sends 4094 bytes of tag data at most");
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

/** Writes one line without the CR LF, and puts a colon before the last parameter only when it is needed.
 * Throws a RangeError for a message that no IRC line can carry, or that parseLine would read differently.
 * A client may send at most 4094 UTF-8 bytes of tag data (IRCv3 message-tags), not the 8191 that a server may send. */
export function formatLine(message: IrcMessage): string {
  const { tags, source, command, params } = message;
  if (toIrcCommand(command) !== command) refuse("a command is ASCII letters in upper case or three digits");
  const data = formatTags(tags);
  if (source !== undefined && (source === "" || source.includes(" ") || !clean(source))) {
    refuse("a source is a word with no NUL, CR or LF");
  }
  const body = [...(source === undefined ? [] : [`:${source}`]), command, ...formatParams(params)].join(" ");
  if (utf8Bytes(body) > LINE_BYTES) refuse("a line holds 510 bytes after its tags");
  return data === "" ? body : `@${data} ${body}`;
}
