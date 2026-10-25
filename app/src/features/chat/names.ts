// How the chat names a room and an address.

/** An address's first six and last five characters, as the login shows one's own. */
export const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-5)}`;

/** A room by its own name: #games for #bubble/games, the world's main room by the world. */
export const roomLabel = (room: string): string => `#${room.slice(room.indexOf("/") + 1).replace(/^#/, "")}`;

/** A room's address on the site: its world's page, and ?room=<name> for one that is not the main room. */
export function roomHref(room: string): string {
  const [world = "", name] = room.slice(1).split("/");
  return name === undefined ? `/w/${world}` : `/w/${world}?room=${name}`;
}
