// What the link joins (slice 4's 4b, moved out of link.ts): the rooms it follows, in JOIN and PART lines of 510
// bytes at most.
import { LINE_BYTES, nickOf, type IrcMessage } from "@gnoworld/core";

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

/** What a JOIN of `room` leaves to ask Ergo: an echoed JOIN brings its NAMES and its MARKREAD, a second tab's neither
 * (CR7); who is here while none is known, and an account's place while the store holds none. */
export function asksAfterJoin(
  room: string,
  held: { readonly members: readonly string[]; readonly read: string | undefined } | undefined,
  account: boolean,
): string[] {
  const unknown = { NAMES: (held?.members.length ?? 0) === 0, MARKREAD: account && held?.read === undefined };
  return Object.entries(unknown).flatMap(([command, ask]) => (ask ? [`${command} ${room}`] : []));
}

// Whether Ergo's line takes me out of its room: its KICK of me, or its PART of me, another session's PART taking every
// session out (channel.go:1078-1082, v2.19.1).
export const outOf = ({ source = "", command, params }: IrcMessage, me: string): boolean =>
  (command === "KICK" && params[1] === me) || (command === "PART" && nickOf(source) === me);
