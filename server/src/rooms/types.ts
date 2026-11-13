// A room's type in Ergo (slice 3's plan, 3m): the flags it carries, who is on its invite list and who is
// voiced, from the roles file; who reads it and who sees it listed. Ergo holds the line (+i, +R, +m): the
// server only asks for it. A room the file does not type is open; an archived one is read-only and
// unlisted whatever its type. Read whole in review: a wrong answer here opens a room.
import type { Room, Rules, Section } from "../roles/roles.ts";
import { worldOf } from "./rooms.ts";

/** The roles file's part the rooms read: an account by its address, a world as the file lists it. */
export interface Typed {
  team?: ReadonlySet<string> | undefined;
  worlds: ReadonlyMap<string, World>;
}

export interface World {
  rules: Rules;
  moderators?: ReadonlySet<string>;
  groups?: ReadonlyMap<string, ReadonlySet<string>>;
  rooms?: ReadonlyMap<string, Room>;
  sections?: readonly Section[];
}

/** What a room is to be in Ergo: its flags among M, m, i, s and R, its invites and its voiced, sorted. */
export interface Desired {
  modes: string;
  invites: string[];
  voiced: string[];
}

const typeOf = (roles: Typed, room: string): Room =>
  roles.worlds.get(worldOf(room))?.rooms?.get(room) ?? { type: "open", hidden: false };

/** A room's type: the file's, open for a room it does not type. */
export const roomType = (roles: Typed, room: string): Room["type"] => typeOf(roles, room).type;

// The world's moderators and the team: they moderate, so they enter and speak everywhere.
const staff = (roles: Typed, world: string): string[] => [
  ...(roles.team ?? []),
  ...(roles.worlds.get(world)?.moderators ?? []),
];

const group = (roles: Typed, world: string, name: string): string[] => [
  ...(roles.worlds.get(world)?.groups?.get(name) ?? []),
];

const sorted = (list: readonly string[]): string[] => [...new Set(list)].toSorted();

// Who is invited and who is voiced: a members room's readers and a members-write room's writers, with
// the staff; the staff alone speak in an announcement room.
function people(roles: Typed, world: string, type: Room): { invites: string[]; speakers: string[] } {
  const all = staff(roles, world);
  if (type.type === "announcement") return { invites: [], speakers: all };
  if (type.type === "members") return { invites: [...all, ...group(roles, world, type.readers)], speakers: [] };
  if (type.type !== "members-write") return { invites: [], speakers: [] };
  const writers = group(roles, world, type.writers);
  return { invites: [...all, ...group(roles, world, type.readers), ...writers], speakers: [...all, ...writers] };
}

/** What a room is to be in Ergo, its world read from its name (#<world> or #<world>/<name>). */
export function desired(roles: Typed, room: string, { archived }: { archived: boolean }): Desired {
  const type = typeOf(roles, room);
  // +M open to accounts; +m only the voiced speak; +R only accounts join; +i only the invited join.
  const flags = { open: "M", announcement: "Mm", accounts: "MR", members: "Mi", "members-write": "Mim" }[type.type];
  const modes = flags + (archived && !flags.includes("m") ? "m" : "") + (archived || type.hidden ? "s" : "");
  const { invites, speakers } = people(roles, worldOf(room), type);
  return { modes, invites: sorted(invites), voiced: archived ? [] : sorted(speakers) };
}

/** Who reads a room: anyone in an open or announcement room, an account in an accounts room, its
 * invited in a members room. A guest is undefined. */
export function mayRead(roles: Typed, room: string, who: string | undefined): boolean {
  const type = typeOf(roles, room);
  if (type.type === "open" || type.type === "announcement") return true;
  if (type.type === "accounts") return who !== undefined;
  return who !== undefined && people(roles, worldOf(room), type).invites.includes(who);
}

/** A room whose lines may go to OpenAI: any but a members room, whose lines stay between its members. */
export const publicRoom = (roles: Typed, room: string): boolean =>
  !["members", "members-write"].includes(typeOf(roles, room).type);

/** A room whose lines may be a world's first words (slice 9h, D214): open to everyone to read and write, and listed. A
 * first words' author is served to anyone and drawn on a banner, so no members, announcement, accounts or hidden room. */
export const openRoom = (roles: Typed, room: string): boolean => {
  const { type, hidden } = typeOf(roles, room);
  return type === "open" && !hidden;
};

/** One of the room's world's moderators or the team: they see a hidden or archived room in the lists. */
export const staffOf = (roles: Typed, room: string, who: string | undefined): boolean =>
  who !== undefined && staff(roles, worldOf(room)).includes(who);

/** Who sees a room in the lists: a hidden one its world's moderators and the team alone, another whoever
 * may read it. */
export function listed(roles: Typed, room: string, who: string | undefined): boolean {
  if (!typeOf(roles, room).hidden) return mayRead(roles, room, who);
  return staffOf(roles, room, who);
}

/** Whether the file hides the room: only its world's moderators and the team see it in the lists. */
export const hiddenRoom = (roles: Typed, room: string): boolean => typeOf(roles, room).hidden;

/** A room whose lines the search index holds (D13924): any a reader may open that is not hidden, so open, announcement and
 * accounts rooms; never a members room. Who reads a hit is asked again at query time (`mayRead`). */
export const searchable = (roles: Typed, room: string): boolean => {
  const { type, hidden } = typeOf(roles, room);
  return !hidden && (type === "open" || type === "announcement" || type === "accounts");
};
