// What the link sends. The lines to send for a message of several lines (slice 4's multiline, docs/decisions.md row 255): one
// draft/multiline batch, each line a PRIVMSG of it; or, to an Ergo that never granted the capability, the lines one
// at a time, the blank ones left out (Ergo refuses a PRIVMSG with no text). None when a line is not the room's, or
// one the connection would refuse (a lone surrogate): nothing is opened for a message that cannot go whole.
import { LINE_BYTES, MULTILINE, type Composed } from "@gnoworld/core";

export function outgoing(
  room: string,
  composed: Composed,
  { multiline, ref }: { multiline: boolean; ref: string },
): string[] | undefined {
  const lines = composed.kind === "line" ? [composed.line] : composed.kind === "lines" ? composed.lines : [];
  if (lines.length === 0 || !lines.every((line) => line.startsWith(`PRIVMSG ${room} :`) && line.isWellFormed())) {
    return undefined;
  }
  if (composed.kind === "line") return lines;
  if (!multiline) return lines.filter((line) => !line.endsWith(" :"));
  return [`BATCH +${ref} ${MULTILINE} ${room}`, ...lines.map((line) => `@batch=${ref} ${line}`), `BATCH -${ref}`];
}

// Rooms in groups whose command line holds 510 bytes at most; a room id is ASCII, a character a byte.
export function groupsOf(command: "JOIN" | "PART", rooms: readonly string[]): string[][] {
  const groups: string[][] = [];
  let size = 0;
  for (const room of rooms) {
    const last = groups.at(-1);
    if (last === undefined || size + 1 + room.length > LINE_BYTES) {
      groups.push([room]);
      size = command.length + 1 + room.length;
    } else {
      last.push(room);
      size += 1 + room.length;
    }
  }
  return groups;
}
