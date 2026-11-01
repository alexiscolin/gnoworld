// How the chat names a room and an address, and which room a world's page shows.
import { firstGraphemes, type Line } from "@gnoworld/core";
import { Address, type RoomList } from "@gnoworld/schemas";
import type { AppState } from "../../store/index.ts";
import { withFull } from "./full.ts";

/** Whether a nick is an account's: an address, which a guest's cannot be (Ergo gives a guest 32 characters). */
export const isAccount = (nick: string): boolean => Address.safeParse(nick).success;

/** The first 80 graphemes of words, an ellipsis after them when more follow: what a dialog or a refusal quotes of a
 * line, never one cut in two (an emoji's parts). */
export function quoted(words: string): string {
  const first = firstGraphemes(words, 81);
  return first.length > 80 ? `${first.slice(0, 80).join("")}…` : words;
}

export { shortAddress } from "@gnoworld/schemas";

// The Earth is a page of its own, under no /w/, and its main room is the general chat (frames 37 to 55).
const EARTH = "earth";

/** A room by its own name: #games for #bubble/games, the world's main room by the world, the Earth's the general chat. */
export const roomLabel = (room: string): string => {
  const { world, name } = partsOf(room);
  return `#${name ?? (world === EARTH ? "general" : world)}`;
};

/** A room's address on the site: its world's page, and ?room=<name> for one that is not the main room. */
export function roomHref(room: string, full = false): string {
  const { world } = partsOf(room);
  return hrefOf(world, roomParams(room), full);
}

// A world's page at `params`, the full chat asked for or not.
function hrefOf(world: string, params: URLSearchParams, full: boolean): string {
  const search = withFull(params, full).toString();
  const page = world === EARTH ? "/earth" : `/w/${world}`;
  return search === "" ? page : `${page}?${search}`;
}

/** A direct message's address on the site: its world's page, and ?dm=<the partner's address> (4e). */
export const dmHref = (world: string, partner: string, full = false): string => hrefOf(world, dmParams(partner), full);

/** A direct message's search on its world's page: ?dm=<the partner's address> (4e). */
export const dmParams = (partner: string, full = false): URLSearchParams =>
  withFull(new URLSearchParams({ dm: partner }), full);

/** A room's search on its world's page: ?room=<name>, or none for the main room. */
export function roomParams(room: string, full = false): URLSearchParams {
  const { name } = partsOf(room);
  return withFull(new URLSearchParams(name === undefined ? {} : { room: name }), full);
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

/** The rooms where a mention of the whole room counts (4f-n): where Ergo's modes limit who speaks or who reads. */
export const groupRooms = (sections: RoomList["sections"]): string[] =>
  sections.flatMap(({ rooms }) =>
    rooms.filter(({ type }) => ["announcement", "members", "members-write"].includes(type)).map(({ room }) => room),
  );

/** Whether a mention of the whole room counts in `room`, one of the world's. */
export const groupsAt = (sections: RoomList["sections"], room: string | undefined): boolean =>
  room !== undefined && groupRooms(sections).includes(room);

/** Whom a mention may shorten (F812): the members, and the authors in view by their account tag, who proved their key as
 * a member did (F819). */
export const mentionable = (members: readonly string[], lines: readonly Line[]): Set<string> =>
  new Set([...members, ...lines.flatMap(({ account }) => (account === undefined ? [] : [account]))]);

/** The server's moderation bot (server/src/irc/lines.ts), in every room, never listed. */
export const BOT = "gnoworld";

/** How many are talking here: those in the room, the bot left out, once connected; none before (a count of none says nothing). */
export const talkingOf = (members: readonly string[] | undefined, connected: boolean): number | undefined =>
  connected && members !== undefined ? members.filter((nick) => nick !== BOT).length : undefined;
