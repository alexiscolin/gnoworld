// IRCv3 lines: tags, source, command and parameters (modern.ircdocs.horse, "Message Format";
// ircv3.net/specs/extensions/message-tags). Over WebSocket, one message is one line.
// Pairing (.claude/rules/core.md): Claude wrote the contract and the tests; Alexis writes
// the bodies and removes each test's `fails` mark as it passes.

export interface IrcMessage {
  /** A missing value and an empty one are the same: "". The last of a repeated key wins. */
  readonly tags: ReadonlyMap<string, string>;
  /** `nick!user@host` or a server name, without its leading ":". An empty one reads as absent. */
  readonly source?: string;
  /** ASCII letters in upper case, or a three-digit numeric. parseLine folds the case. */
  readonly command: string;
  readonly params: readonly string[];
}

export type IrcParseError = "empty" | "bad-character" | "no-command" | "bad-command" | "tags-too-long" | "body-too-long";

export type IrcParsed = { readonly ok: true; readonly message: IrcMessage } | { readonly ok: false; readonly error: IrcParseError };

/** Reads one line from the relay, which is untrusted: it never throws. It refuses lines over the limits
 * (UTF-8 bytes: 8191 of tags with the @ and the space, 510 of the rest), NUL, and CR or LF but at the end. */
export function parseLine(line: string): IrcParsed {
  throw new Error(`parseLine(${String(line.length)} characters): not written yet (pairing: Alexis)`);
}

/** Writes one line, without CR LF, the last parameter's colon only when needed. Throws a RangeError
 * on a message no IRC line can carry, or one parseLine would read differently. */
export function formatLine(message: IrcMessage): string {
  throw new Error(`formatLine(${message.command}): not written yet (pairing: Alexis)`);
}

export function escapeTagValue(value: string): string {
  throw new Error(`escapeTagValue(${String(value.length)} characters): not written yet (pairing: Alexis)`);
}

export function unescapeTagValue(escaped: string): string {
  throw new Error(`unescapeTagValue(${String(escaped.length)} characters): not written yet (pairing: Alexis)`);
}
