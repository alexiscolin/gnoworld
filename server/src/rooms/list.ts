// GET /api/rooms?world=<slug> (slice 4's plan, 4b; decisions of 2026-10-25): a world's rooms a reader may
// see, in the sections its moderators set in the roles file, a section named null holding the others. A
// room is listed to whom `visible` lets see it, by the login's session, as the activity route lists it:
// the answer to a session is private, and a section with no room to show is left out, its name with it. Each room carries
// the people here now and its lines of the last 24 hours when there are any (D394); on the Earth the rooms anyone made
// follow the moderators' own, by people here, then lines, then the newest.
import type { DatabaseSync } from "node:sqlite";
import { RoomList, type ApiError } from "@gnoworld/schemas";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { roomCounts } from "./earth.ts";
import { realmPaths, worldRooms } from "./rooms.ts";
import { roomType, type Typed } from "./types.ts";

// The Earth's thousand public rooms and the moderators' 20, as RoomList takes.
const SECTION_ROOMS = 1_100;
const DAY_MS = 24 * 60 * 60_000;
// The lines of a day are counted again at most this often: one pass over the verdicts serves every ask.
const COUNTS_MS = 30_000;

interface Options {
  db: DatabaseSync;
  roles: Typed;
  // Whether an account, or a guest (undefined), sees a room listed: no default, so none is open by mistake.
  visible: (room: string, who: string | undefined) => boolean;
  // The account of a session's token (login.ts's session).
  session?: ((token: string | undefined) => string | undefined) | undefined;
  // The people in a room now, none when it was not read lately (the presence's `here`).
  here?: ((room: string) => number | undefined) | undefined;
  now?: (() => number) | undefined;
}

interface Counts {
  here: (room: string) => number | undefined;
  messages: ReadonlyMap<string, number>;
}

// The rooms a reader sees, in sections: the file's, each in its own order, then the others by name, 500 a
// section as RoomList takes. The world's main room is the first of the others: #<world> is a prefix of
// every #<world>/<name>.
function sectionsOf(
  roles: Typed,
  world: string,
  listed: { seen: readonly string[]; counts: Counts; realms: ReadonlyMap<string, string> },
): RoomList["sections"] {
  const { seen, counts, realms } = listed;
  const shown = new Set(seen);
  const named = roles.worlds.get(world)?.sections ?? [];
  const placed = new Set(named.flatMap(({ rooms }) => rooms));
  return [
    ...named.map(({ name, rooms }) => ({ name, rooms: rooms.filter((room) => shown.has(room)) })),
    { name: null, rooms: seen.filter((room) => !placed.has(room)) },
  ]
    .filter(({ rooms }) => rooms.length > 0)
    .map(({ name, rooms }) => ({
      name,
      rooms: rooms.slice(0, SECTION_ROOMS).map((room) => {
        const here = counts.here(room) ?? 0;
        const messages = counts.messages.get(room) ?? 0;
        const realm = realms.get(room);
        return {
          room,
          type: roomType(roles, room),
          ...(here > 0 ? { here } : {}),
          ...(messages > 0 ? { messages } : {}),
          ...(realm === undefined ? {} : { realm }),
        };
      }),
    }));
}

// The Earth's rooms in the order of use: the rooms no account made (the main room, the moderators' and the file's) first as
// they were, then the public rooms by people here, lines in 24 hours, the newest, then name.
function byUse(db: DatabaseSync, seen: readonly string[], counts: Counts): string[] {
  const Made = z.array(z.object({ name: z.string(), created_at: z.number() }));
  const made = new Map(
    Made.parse(db.prepare("SELECT name, created_at FROM earth_rooms").all()).map((row) => [row.name, row.created_at]),
  );
  const use = (room: string) => [counts.here(room) ?? 0, counts.messages.get(room) ?? 0, made.get(room) ?? 0] as const;
  const [first, rest] = [seen.filter((room) => !made.has(room)), seen.filter((room) => made.has(room))];
  return [
    ...first,
    ...rest.toSorted((a, b) => {
      const [x, y] = [use(a), use(b)];
      return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || (a < b ? -1 : 1);
    }),
  ];
}

// A world's slug, 64 characters at most, as the activity route asks.
const World = RoomList.shape.world.check(z.maxLength(64));

export function listRoutes({
  db,
  roles,
  visible,
  session = () => undefined,
  here = () => undefined,
  now = Date.now,
}: Options): Hono {
  const app = new Hono();
  let counted: { at: number; lines: ReadonlyMap<string, number> } | undefined;
  const lines = (): ReadonlyMap<string, number> => {
    const at = now();
    if (counted === undefined || at - counted.at >= COUNTS_MS) counted = { at, lines: roomCounts(db, at - DAY_MS) };
    return counted.lines;
  };
  app.get("/", (c) => {
    const asked = c.req.queries("world");
    const parsed = World.safeParse(asked?.length === 1 ? asked[0] : undefined);
    if (!parsed.success) return c.json({ error: "refused" } satisfies ApiError, 400);
    const world = parsed.data;
    const who = session(getCookie(c, "__Host-session"));
    const counts = { here, messages: lines() };
    const listed = worldRooms(db, world).filter((room) => visible(room, who));
    const seen = world === "earth" ? byUse(db, listed, counts) : listed;
    // The answer depends on the session: a shared cache keeps each cookie's apart (F585).
    c.header("cache-control", `${who === undefined ? "public" : "private"}, max-age=5`);
    c.header("vary", "cookie");
    return c.json({
      world,
      sections: sectionsOf(roles, world, { seen, counts, realms: realmPaths(db, world) }),
    } satisfies RoomList);
  });
  return app;
}
