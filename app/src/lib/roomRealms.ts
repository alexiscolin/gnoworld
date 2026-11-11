// The realm each realm's room is for, from the rooms lists the server answers (a room's name holds only a hash of its realm): what links a
// realm's room to its page (chat/names.ts roomHref). Filled by the rooms client; the server caps the realm rooms at 5,000, so it stays small.
import type { RoomList } from "@gnoworld/schemas";

const realms = new Map<string, string>();

/** Keeps the realm of each room of `sections` that names one. */
export function rememberRealms(sections: RoomList["sections"]): void {
  for (const { rooms } of sections)
    for (const { room, realm } of rooms) if (realm !== undefined) realms.set(room, realm);
}

/** The realm a room is for, none for a room that is not a realm's or was not listed yet. */
export const realmOfRoom = (room: string): string | undefined => realms.get(room);
