// The rooms' part of the chat (slice 3's plan, 3l, 3m): the roles file's typed rooms, the reconciler that
// keeps each room as its type says, and the rooms' keeper as the routes use it.
import type { DatabaseSync } from "node:sqlite";
import type { Mutes } from "../moderation/mute.ts";
import type { Rooms } from "./create.ts";
import { makeReconciler } from "./reconcile.ts";
import { listRooms } from "./rooms.ts";
import { desired, type Typed, type World } from "./types.ts";

// The roles file's typed rooms, each with its world (3m).
export const typedRooms = (worlds: ReadonlyMap<string, World>) =>
  [...worlds].flatMap(([world, { rooms }]) => [...(rooms?.keys() ?? [])].map((name) => ({ name, world })));

// Each room kept as its type says (3m), from what Ergo says it is: an archived room read-only and unlisted.
export function reconcilerFor(
  db: DatabaseSync,
  roles: Typed,
  parts: Pick<Parameters<typeof makeReconciler>[0], "send" | "state" | "log"> & { keeper: Rooms },
) {
  const { keeper, send, state, log } = parts;
  return makeReconciler({
    rooms: () => listRooms(db).map(({ name }) => name),
    desired: (room) => desired(roles, room, { archived: keeper.archived(room) }),
    state,
    send,
    log,
  });
}

// The rooms as the routes make and archive them (3l): a room made gets the live mutes.
export function keeping(keeper: Rooms, mutes: Mutes): Rooms {
  return {
    ...keeper,
    create: (world, name) => {
      const made = keeper.create(world, name);
      if (typeof made !== "string") mutes.reapply();
      return made;
    },
  };
}
