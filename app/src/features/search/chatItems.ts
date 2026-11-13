// The rooms and the people the chat already knows, as items the palette searches: the rooms the server lists to the reader, and the
// people in the rooms the page follows or written to. They come from the page's state, so typing asks for nothing.
import type { RoomList } from "@gnoworld/schemas";
import { BOT, dmHref, isAccount, roomHref, roomLabel, roomWorld, whoIs } from "../chat/index.ts";
import type { SearchItem } from "./types.ts";

const hereOf = (members: readonly string[]): number => members.filter((nick) => nick !== BOT).length;

type Followed = Readonly<Record<string, { members: readonly string[]; topic: string | undefined }>>;

// The people in a room: as the server lists them, else as the page's own members say, where it follows the room.
function peopleIn(room: string, here: number | undefined, followed: Followed): number | undefined {
  const own = followed[room];
  return here ?? (own === undefined ? undefined : hereOf(own.members));
}

/** Each room of the sections that has a page, with its people and lines now, and its world and topic in words; a world's main room is
 * its place's, which the index keeps once. */
export function roomItemsOf(
  sections: RoomList["sections"] | undefined,
  followed: Followed,
  worldName: (world: string) => string | undefined,
): SearchItem[] {
  return (sections ?? []).flatMap(({ rooms }) =>
    rooms.flatMap(({ room, here, messages }): SearchItem[] => {
      const path = roomHref(room);
      if (path === undefined) return [];
      const world = roomWorld(room);
      const place = worldName(world) ?? world;
      const topic = followed[room]?.topic ?? "";
      const people = peopleIn(room, here, followed);
      const item: SearchItem = {
        name: room.slice(1),
        kind: "room",
        universe: "",
        path,
        world,
        place,
        description: topic === "" ? `in ${place}` : `in ${place} · ${topic}`,
        ...(topic === "" ? {} : { topic }),
        ...(people === undefined ? {} : { here: people }),
      };
      return [messages === undefined ? item : { ...item, messages }];
    }),
  );
}

/** Each person once: those in the followed rooms, then those the reader wrote to. An account opens a direct message when the reader
 * is signed in; any other opens the room they are in. The bot and the reader are left out. */
export function peopleItemsOf(
  rooms: Readonly<Record<string, { members: readonly string[] }>>,
  partners: readonly string[],
  me: string | undefined,
): SearchItem[] {
  const found = new Map<string, SearchItem>();
  const message = (nick: string) => (me !== undefined && isAccount(nick) ? dmHref("earth", nick) : undefined);
  const person = (nick: string, path: string | undefined, description: string) => {
    if (path === undefined || nick === BOT || nick === me || found.has(nick)) return;
    const item: SearchItem = { name: whoIs(nick), kind: "person", universe: "", path, description, nick };
    found.set(nick, path === message(nick) ? { ...item, message: true } : item);
  };
  for (const [room, { members }] of Object.entries(rooms))
    for (const nick of members) person(nick, message(nick) ?? roomHref(room), `in ${roomLabel(room)} now`);
  for (const nick of partners) if (isAccount(nick)) person(nick, message(nick), "direct messages");
  return [...found.values()];
}
