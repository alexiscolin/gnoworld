// How the chat names a room and an address, and which room a world's page shows.
import { Address, type RoomList } from "@gnoworld/schemas";
import type { AppState } from "../../store/index.ts";

/** Whether a nick is an account's: an address, which a guest's cannot be (Ergo gives a guest 32 characters). */
export const isAccount = (nick: string): boolean => Address.safeParse(nick).success;

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

/** A direct message's address on the site: its world's page, and ?dm=<the partner's address> (4e). */
export const dmHref = (world: string, partner: string): string => `/w/${world}?dm=${partner}`;

/** A direct message's search on its world's page: ?dm=<the partner's address> (4e). */
export const dmParams = (partner: string): URLSearchParams => new URLSearchParams({ dm: partner });

/** A room's search on its world's page: ?room=<name>, or none for the main room. */
export function roomParams(room: string): URLSearchParams {
  const { name } = partsOf(room);
  return new URLSearchParams(name === undefined ? {} : { room: name });
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

/** The room `step` rooms from `room` in the list, Alt+Up and Alt+Down's; none past an end, or for a room not in it. */
export function neighbour(rooms: readonly string[], room: string, step: number): string | undefined {
  const at = rooms.indexOf(room);
  return at === -1 ? undefined : rooms[at + step];
}

/** The accounts a mention completes to: the room's members that are addresses, each once, oneself left out. */
export const peopleOf = (members: readonly string[], self: string): string[] => [
  ...new Set(members.filter((member) => member !== self && isAccount(member))),
];

/** Every room a world lists, in its order. */
export const roomIds = (sections: RoomList["sections"]): string[] =>
  sections.flatMap(({ rooms }) => rooms.map(({ room }) => room));

/** What a world's room list is asked for: the world, who reads it, the try; nothing while the session is unknown,
 * since the list is the reader's. */
export function roomsQuery(world: string, session: AppState["login"]["session"], attempt: number): string | undefined {
  if (session.kind === "unknown") return undefined;
  return `${world}|${session.kind === "in" ? session.address : "guest"}|${String(attempt)}`;
}
