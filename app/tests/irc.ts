// An IRC line read as the page reads it, for the tests that hand the store a message.
import { parseLine, type IrcMessage } from "@gnoworld/core";

/** `line` as a message, or a failure naming it. */
export function ircOf(line: string): IrcMessage {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
}
