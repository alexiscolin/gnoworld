// What the link joins (slice 4's 4b, moved out of link.ts): the rooms it follows, in JOIN and PART lines of 510
// bytes at most.
import { LINE_BYTES } from "@gnoworld/core";

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

/** The rooms a connection follows: the first `max` listed, the room in view among them though listed past them (in
 * place of the last). */
export function followed(listed: readonly string[], shown: string | undefined, max: number): readonly string[] {
  const first = listed.slice(0, max);
  const late = shown !== undefined && listed.includes(shown) && !first.includes(shown);
  return late ? [...first.slice(0, max - 1), shown] : first;
}
