// The rooms' part of the chat (slice 3's plan, 3l, 3m): the roles file's typed rooms, the reconciler that
// keeps each room as its type says, and the rooms' keeper as the routes use it.
import type { DatabaseSync } from "node:sqlite";
import type { Mutes } from "../moderation/mute.ts";
import type { Rooms } from "./create.ts";
import { reservedOnEarth, sweepIdle } from "./earth.ts";
import { makeReconciler, type Reconciler } from "./reconcile.ts";
import { listRooms, mainRoom, worldOf } from "./rooms.ts";
import { desired, type Typed, type World } from "./types.ts";

// The roles file's typed rooms, each with its world (3m).
export const typedRooms = (worlds: ReadonlyMap<string, World>) =>
  [...worlds].flatMap(([world, { rooms }]) => [...(rooms?.keys() ?? [])].map((name) => ({ name, world })));

// Each room kept as its type says (3m), from what Ergo says it is: an archived room read-only and unlisted.
export function reconcilerFor(
  db: DatabaseSync,
  roles: Typed,
  parts: Pick<Parameters<typeof makeReconciler>[0], "send" | "state" | "log" | "seen"> & { keeper: Rooms },
) {
  const { keeper, send, state, log, seen } = parts;
  return makeReconciler({
    rooms: () => listRooms(db).map(({ name }) => name),
    desired: (room) => desired(roles, room, { archived: keeper.archived(room) }),
    state,
    send,
    log,
    seen,
  });
}

// The rooms as the routes make and archive them (3l): a room made gets the live mutes; a room archived is
// put as its type says at once, its voices taken, not at the next minute's pass (F580).
export function keeping(keeper: Rooms, { mutes, reconciler }: { mutes: Mutes; reconciler: Reconciler }): Rooms {
  return {
    ...keeper,
    create: (world, name) => {
      const made = keeper.create(world, name);
      if (typeof made !== "string") mutes.putOn(made.made, world);
      return made;
    },
    earth: (maker, name) => {
      const made = keeper.earth(maker, name);
      if (typeof made !== "string") mutes.putOn(made.made, "earth");
      return made;
    },
    realm: (room, reserve) => {
      const made = keeper.realm(room, reserve);
      if (typeof made !== "string") mutes.putOn(made.made, worldOf(room));
      return made;
    },
    archive: (world, name) => {
      const done = keeper.archive(world, name);
      if (done === "archived") reconciler.ask(`${mainRoom(world)}/${name}`);
      return done;
    },
  };
}

/** The Earth's public rooms nobody writes in are archived once an hour and at start (D394). The archive is a decision on the lines the
 * verdicts hold, which the reconciler does not read: it only puts Ergo as the database says, at once for each room swept (keeping's archive). */
export function sweeping(
  db: DatabaseSync,
  rooms: Rooms,
  { now, ms, roles }: { now: () => number; ms: number; roles: Typed },
): () => void {
  const sweep = (): void => {
    sweepIdle(db, rooms, { now: now(), reserved: (room) => reservedOnEarth(roles, room) });
  };
  sweep();
  const timer = setInterval(sweep, ms);
  return () => {
    clearInterval(timer);
  };
}
