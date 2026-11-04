// The rooms' HTTP face (slice 3's plan, 3l): a world's moderators and the team make and archive its
// rooms. Each call comes from a listed site in JSON (guard.ts), with the login's session; who may act is
// checked before any work, an account makes 10 rooms an hour, and each act and refusal goes to the log.
import { CreateRoom, RoomName, type Address, type ApiError, type MadeRoom } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { routePath } from "hono/route";
import { guard, json, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import type { Log } from "@gnoworld/service/log";
import { mayCreateRoom, type Roles } from "../roles/roles.ts";
import type { Rooms } from "./create.ts";

interface Options {
  roles: Roles;
  rooms: Rooms;
  // The account of a session's token (login.ts's session).
  session: (token: string | undefined) => Address | undefined;
  origins: readonly string[];
  log: Log;
  now: () => number;
}

type Status = 400 | 401 | 403 | 404 | 415 | 429;

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
} as const satisfies Record<string, readonly [ApiError["error"], Status]>;

export function roomsRoutes({ roles, rooms, session, origins, log, now }: Options): Hono<Guarded> {
  const made = limiter({ max: 10, windowMs: 60 * 60_000, keys: 100_000 });
  const refuse = (c: Context, cause: keyof typeof refusals): Response => {
    const [error, status] = refusals[cause];
    log("room_refused", { route: routePath(c), status, error: cause });
    return c.json({ error } satisfies ApiError, status);
  };
  const account = (c: Context): Address | undefined => session(getCookie(c, "__Host-session"));
  // Who acts, and whether on that world: a session and the right, before anything else is read.
  const allowed = (c: Context, world: string): Address | Response => {
    const who = account(c);
    if (who === undefined) return refuse(c, "session");
    return mayCreateRoom(roles, who, world) ? who : refuse(c, "forbidden");
  };

  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));

  app.post("/", async (c) => {
    const body = CreateRoom.safeParse(await json(c));
    if (!body.success) return refuse(c, account(c) === undefined ? "session" : "body");
    const { world, name } = body.data;
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
    const who = allowed(c, world);
    if (who instanceof Response) return who;
    if (!RoomName.safeParse(name).success) return refuse(c, "body");
    // A room the roles file types is the file's, not the API's: archived, it would stay so after a fixed file (F2050).
    if (roles.worlds.get(world)?.rooms?.has(`#${world}/${name}`) === true) return refuse(c, "forbidden");
    if (rooms.archive(world, name) === "not_found") return refuse(c, "not_found");
    log("room_archived", { room: `#${world}/${name}`, account: who });
    return c.body(null, 204);
  });

  return app;
}
