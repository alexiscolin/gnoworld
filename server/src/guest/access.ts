// Where a guest may speak (D430): the server is the only gate, since Ergo delivers a RELAYMSG whatever a room's modes say
// (+m and an unvoiced bot included). A room the server made, spelt as it made it, of an open type, listed and not archived is
// written in; an announcement room is read; any other, a room that is not its own, or one that does not exist, is nothing.
import { listed, roomType, type Typed } from "../rooms/types.ts";

export type Access = "write" | "read" | undefined;

/** What a guest may do in a room. An Earth player room (#earth/<name>, D394) is typed by no file, so it is open: written in. */
export function guestAccess(
  roles: Typed,
  archived: (room: string) => boolean,
): (room: string, world: string | undefined) => Access {
  return (room, world) => {
    // `world` is the table's: the room as the server made it, spelt so; #EARTH is no room of it.
    if (world === undefined || archived(room) || !listed(roles, room, undefined)) return undefined;
    const type = roomType(roles, room);
    if (type === "open") return "write";
    return type === "announcement" ? "read" : undefined;
  };
}
