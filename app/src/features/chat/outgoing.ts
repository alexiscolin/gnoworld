// The page's side of draft/multiline (docs/decisions.md row 255): what the link hears of a batch, and what it sends.
import { foldMultiline, MULTILINE, type Batch, type Composed, type IrcMessage } from "@gnoworld/core";
import type { Ergo } from "../../lib/ergo/ergo.ts";

// What the link hears of a batch that is no history page: its lines, or a message of several lines as one line of its
// room, none when its batch is not one.
export const heardIn = (batch: Batch): readonly IrcMessage[] =>
  batch.type === MULTILINE ? [foldMultiline(batch) ?? []].flat() : batch.messages;

// What the link sends: `tags` (a reply's `+reply=id`, a direct message's `label=n`, or none) ride on a line, or on the
// batch's opening line; `ref` names the batch.
export function send(
  ergo: Pick<Ergo, "multiline" | "send">,
  { room, composed, tags, ref }: { room: string; composed: Composed; tags: string; ref: string },
): boolean {
  const lines = outgoing(room, composed, { multiline: ergo.multiline(), ref, tags });
  return lines?.every((line) => ergo.send(line)) === true;
}

// The lines of a message of several lines (decisions row 255): one draft/multiline batch, or, to an Ergo without it, a
// line at a time, the blank ones left out (Ergo refuses a PRIVMSG with no text). None when a line is not the room's or
// one the connection would refuse (a lone surrogate).
function outgoing(
  room: string,
  composed: Composed,
  { multiline, ref, tags }: { multiline: boolean; ref: string; tags: string },
): string[] | undefined {
  const lines = composed.kind === "line" ? [composed.line] : composed.kind === "lines" ? composed.lines : [];
  if (lines.length === 0 || !lines.every((line) => line.startsWith(`PRIVMSG ${room} :`) && line.isWellFormed())) {
    return undefined;
  }
  const tagged = (line: string) => (tags === "" ? line : `@${tags} ${line}`);
  if (composed.kind === "line") return [tagged(lines[0] ?? "")];
  if (!multiline) {
    const blank = `PRIVMSG ${room} :`;
    return lines.filter((line) => line !== blank).map((line, at) => (at === 0 ? tagged(line) : line));
  }
  return [
    tagged(`BATCH +${ref} ${MULTILINE} ${room}`),
    ...lines.map((line) => `@batch=${ref} ${line}`),
    `BATCH -${ref}`,
  ];
}
