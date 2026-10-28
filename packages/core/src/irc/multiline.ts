// A message of several lines (IRCv3's draft/multiline; slice 4, docs/decisions.md row 255): Ergo relays it to a
// reader with the capability as one batch, its opening line holding the message's id, time and account, each line a
// PRIVMSG (or NOTICE) of the batch, a line continuing the one before marked draft/multiline-concat (irc/client.go,
// composeMultilineBatch, v2.19.1). Read as one message, its lines joined by breaks. The relay is untrusted: a batch
// past Ergo's caps, of mixed commands, targets or senders, or holding a CTCP is none.
import type { Batch } from "./batch.ts";
import { bytes, type IrcMessage } from "./irc.ts";

export const MULTILINE = "draft/multiline";
const CONCAT = "draft/multiline-concat";
/** The bytes of a message of several lines, its breaks counted, and its lines: Ergo's caps (ircd.yaml.tmpl). */
export const MULTILINE_BYTES = 4096;
export const MULTILINE_LINES = 40;

interface Shape {
  command: string;
  target: string;
  source: string | undefined;
}

// A part's text, when the part keeps its batch's shape: its command, sender and target, then one text with no CTCP's
// mark, not blank when it continues the line before.
function textOf({ command, source, params, tags }: IrcMessage, shape: Shape): string | undefined {
  const [target, said, ...more] = params;
  const kept = command === shape.command && source === shape.source && target === shape.target && more.length === 0;
  if (!kept || said === undefined || said.includes("\u0001") || (tags.has(CONCAT) && said === "")) return undefined;
  return said;
}

// The parts' text joined, a break before each but a concat one; none when a part leaves the batch's shape.
function joined(parts: readonly IrcMessage[], shape: Shape): string | undefined {
  let text = "";
  for (const [at, part] of parts.entries()) {
    const said = textOf(part, shape);
    if (said === undefined) return undefined;
    text += at === 0 || part.tags.has(CONCAT) ? said : `\n${said}`;
  }
  return text;
}

// A text Ergo sends as a message of several lines: one line at least not blank, within its bytes.
function sendable(text: string): boolean {
  return text.replaceAll("\n", "") !== "" && bytes(text) <= MULTILINE_BYTES;
}

/** The message a multiline batch holds, or none. */
export function foldMultiline({ type, params: [target], tags, source, messages }: Batch): IrcMessage | undefined {
  const command = messages[0]?.command;
  if (type !== MULTILINE || target === undefined || messages.length > MULTILINE_LINES) return undefined;
  if (command !== "PRIVMSG" && command !== "NOTICE") return undefined;
  const text = joined(messages, { command, target, source });
  if (text === undefined || !sendable(text)) return undefined;
  const own = new Map([...tags].filter(([key]) => key !== "batch"));
  return { tags: own, ...(source === undefined ? {} : { source }), command, params: [target, text] };
}
