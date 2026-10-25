// How the chat names a room and an address, and which room a world's page shows.
import type { RoomList } from "@gnoworld/schemas";
import type { AppState } from "../../store/index.ts";

/** An address's first six and last five characters, as the login shows one's own. */
export const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-5)}`;

/** A room by its own name: #games for #bubble/games, the world's main room by the world. */
export const roomLabel = (room: string): string => {
  const { world, name } = partsOf(room);
  return `#${name ?? world}`;
};

/** A room's address on the site: its world's page, and ?room=<name> for one that is not the main room. */
export function roomHref(room: string): string {
  const { world, name } = partsOf(room);
  return name === undefined ? `/w/${world}` : `/w/${world}?room=${name}`;
}

// A room id's world and name: #<world>, or #<world>/<name>.
function partsOf(room: string): { world: string; name: string | undefined } {
  const [world = "", name] = room.slice(1).split("/");
  return { world, name };
}

/** The room the address names (?room=<name>) when the world lists it; else its main room when listed; else the
 * first listed. */
export function shownRoom(world: string, sections: RoomList["sections"], asked: string | null): string | undefined {
  const listed = roomIds(sections);
  const named = asked === null ? `#${world}` : `#${world}/${asked}`;
  return [named, `#${world}`].find((room) => listed.includes(room)) ?? listed[0];
}

/** Every room a world lists, in its order. */
export const roomIds = (sections: RoomList["sections"]): string[] =>
  sections.flatMap(({ rooms }) => rooms.map(({ room }) => room));

/** What a world's room list is asked for: the world, who reads it, the try; nothing while the session is unknown,
 * since the list is the reader's. */
export function roomsQuery(world: string, session: AppState["login"]["session"], attempt: number): string | undefined {
  if (session.kind === "unknown") return undefined;
  return `${world}|${session.kind === "in" ? session.address : "guest"}|${String(attempt)}`;
}
