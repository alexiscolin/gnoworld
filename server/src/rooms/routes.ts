// The rooms' HTTP face (slice 3's plan, 3l): a world's moderators and the team make and archive its
// rooms; on the Earth any signed-in account makes a public room too (D394), its name checked as a message is, and
// archives its own. Each call comes from a listed site in JSON (guard.ts), with the login's session; who may act is
// checked before any work, an account makes 10 rooms an hour, and each act and refusal goes to the log.
import { CreateRoom, RoomName, type Address, type MadeRoom } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { guard, json, refuserOf, type Refusals, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import type { Log } from "@gnoworld/service/log";
import { mayCreateRoom, type Roles } from "../roles/roles.ts";
import type { Rooms } from "./create.ts";
import { reservedOnEarth } from "./earth.ts";

interface Options {
  roles: Roles;
  rooms: Rooms;
  // The account of a session's token (login.ts's session).
  session: (token: string | undefined) => Address | undefined;
  // A room's name checked as a message of its world is (moderation/name.ts); none, and no public room is made.
  nameCheck?: ((world: string, name: string) => Promise<"pass" | "hide" | "unchecked">) | undefined;
  origins: readonly string[];
  log: Log;
  now: () => number;
}

const EARTH = "earth";

interface Made {
  who: Address;
  name: string;
  check: NonNullable<Options["nameCheck"]>;
}

const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  session: ["unauthenticated", 401],
  forbidden: ["forbidden", 403],
  body: ["refused", 400],
  exists: ["refused", 400],
  too_long: ["refused", 400],
  limit: ["too_many", 429],
  full: ["too_many", 429],
  not_found: ["not_found", 404],
  name: ["refused", 400],
  unchecked: ["not_ready", 503],
} as const satisfies Refusals;

export function roomsRoutes({ roles, rooms, session, nameCheck, origins, log, now }: Options): Hono<Guarded> {
  const made = limiter({ max: 10, windowMs: 60 * 60_000, keys: 100_000 });
  // The tries at a public room, a refused name too: each costs a check, which may be a paid call.
  const tries = limiter({ max: 10, windowMs: 60 * 60_000, keys: 100_000 });
  const refuse = refuserOf(log, "room_refused", refusals);
  const account = (c: Context): Address | undefined => session(getCookie(c, "__Host-session"));
  // Who acts, and whether on that world: a session and the right, before anything else is read.
  const allowed = (c: Context, world: string): Address | Response => {
    const who = account(c);
    if (who === undefined) return refuse(c, "session");
    return mayCreateRoom(roles, who, world) ? who : refuse(c, "forbidden");
  };
  // A name the roles file gives a place to, typed or in a section, is the file's even before anyone made the room.
  // A public room of the Earth: the cheap refusals first, the name's check once, then the room, which asks again as it makes it.
  const publicRoom = async (c: Context, { who, name, check }: Made) => {
    if (reservedOnEarth(roles, `#${EARTH}/${name}`)) return refuse(c, "exists");
    if (!tries.take(who, now())) return refuse(c, "limit");
    const may = rooms.mayEarth(who, name);
    if (may !== "ok") return refuse(c, may === "day" ? "limit" : may);
    const verdict = await check(EARTH, name).catch((): "unchecked" => "unchecked");
    if (verdict !== "pass") return refuse(c, verdict === "hide" ? "name" : "unchecked");
    const result = rooms.earth(who, name);
    if (typeof result === "string") return refuse(c, result === "day" ? "limit" : result);
    log("room_made", { room: result.made, account: who });
    return c.json({ room: result.made } satisfies MadeRoom, 201);
  };

  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));

  app.post("/", async (c) => {
    const body = CreateRoom.safeParse(await json(c));
    if (!body.success) return refuse(c, account(c) === undefined ? "session" : "body");
    const { world, name } = body.data;
    const asker = account(c);
    if (asker !== undefined && world === EARTH && nameCheck !== undefined && !mayCreateRoom(roles, asker, world))
      return publicRoom(c, { who: asker, name, check: nameCheck });
    const who = allowed(c, world);
    if (who instanceof Response) return who;
    if (made.full(who, now())) return refuse(c, "limit");
    const result = rooms.create(world, name);
    if (typeof result === "string") return refuse(c, result);
    made.take(who, now());
    log("room_made", { room: result.made, account: who });
    return c.json({ room: result.made } satisfies MadeRoom, 201);
  });

  app.delete("/:world/:name", (c) => {
    const { world, name } = c.req.param();
    const who = account(c);
    if (who === undefined) return refuse(c, "session");
    // The world's moderators and the team, and the maker of a room anyone made on the Earth.
    if (!mayCreateRoom(roles, who, world) && rooms.maker(`#${world}/${name}`) !== who) return refuse(c, "forbidden");
    if (!RoomName.safeParse(name).success) return refuse(c, "body");
    // A room the roles file types is the file's, not the API's: archived, it would stay so after a fixed file (F2050).
    if (roles.worlds.get(world)?.rooms?.has(`#${world}/${name}`) === true) return refuse(c, "forbidden");
    // A realm's room is the realm's, made ahead for every listed realm: a hub's moderators do not archive it.
    if (rooms.isRealm(`#${world}/${name}`)) return refuse(c, "forbidden");
    if (rooms.archive(world, name) === "not_found") return refuse(c, "not_found");
    log("room_archived", { room: `#${world}/${name}`, account: who });
    return c.body(null, 204);
  });

  return app;
}
