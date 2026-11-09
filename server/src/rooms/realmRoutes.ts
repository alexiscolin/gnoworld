// POST /api/rooms/realm {path} (D390, D413): a realm's chat room, for a visitor with or without an account. A listed Origin and JSON, a body of
// one realm path, then the room: one that exists (every listed realm's does, made ahead) is answered at once and costs nothing; a path the job
// lists is made, one it does not is looked up on the chain first (reads.ts), then made; making takes the visitor's hourly rate and the cap.
import { realmRoom } from "@gnoworld/core";
import { RealmRoomRequest, type MadeRoom } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import type { Log } from "@gnoworld/service/log";
import { guard, json, refuserOf, type Refusals, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import type { Rooms } from "./create.ts";
import type { OnChain } from "./onChain.ts";
import { makeReads } from "./reads.ts";

interface Options {
  rooms: Rooms;
  // Whether the worlds job lists a realm.
  known: (path: string) => boolean;
  hubs: readonly { readonly slug: string; readonly realms?: readonly string[] | undefined }[];
  origins: readonly string[];
  log: Log;
  now: () => number;
  // The visitor a limit counts (visitor.ts).
  visitor: (c: Context) => string;
  // The rooms a visitor makes an hour.
  perVisitor?: number;
  // Whether the chain holds a path the job does not list (D413); none: only a listed path has a room.
  onChain?: (path: string) => Promise<OnChain>;
  // The chain reads a visitor causes an hour, in flight at once, in all an hour, and the paths found missing that are remembered.
  perVisitorReads?: number;
  readsInFlight?: number;
  readsPerHour?: number;
  missingKeys?: number;
  // The realm rooms left for the rooms made ahead: an unlisted path is refused past the cap less this.
  realmReserve?: number;
}

// The realm rooms left for the rooms made ahead: visitors stop 1,000 short of the cap.
const REALM_RESERVE = 1_000;

interface Looked {
  path: string;
  room: string;
  key: string;
}

const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  body: ["refused", 400],
  not_found: ["not_found", 404],
  down: ["not_ready", 503],
  limit: ["too_many", 429],
  full: ["too_many", 429],
} as const satisfies Refusals;

export function realmRoutes({
  rooms,
  known,
  hubs,
  origins,
  log,
  now,
  visitor,
  perVisitor = 20,
  realmReserve = REALM_RESERVE,
  onChain,
  perVisitorReads,
  readsInFlight,
  readsPerHour,
  missingKeys,
}: Options): Hono<Guarded> {
  const reads =
    onChain === undefined
      ? undefined
      : makeReads({
          onChain,
          now,
          ...(perVisitorReads === undefined ? {} : { perVisitor: perVisitorReads }),
          ...(readsInFlight === undefined ? {} : { inFlight: readsInFlight }),
          ...(readsPerHour === undefined ? {} : { perHour: readsPerHour }),
          ...(missingKeys === undefined ? {} : { missingKeys }),
        });
  const made = limiter({ max: perVisitor, windowMs: 60 * 60_000, keys: 100_000 });
  const refuse = refuserOf(log, "room_refused", refusals);
  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));
  // An unlisted path is looked up on the chain, after the rate and the cap, which cost nothing; a refusal, or nothing when it is there.
  const lookup = async (c: Context, { path, room, key }: Looked): Promise<Response | undefined> => {
    if (reads === undefined) return refuse(c, "not_found");
    if (made.full(key, now())) return refuse(c, "limit");
    if (rooms.mayRealm(room, realmReserve) === "full") return refuse(c, "full");
    const found = await reads(path, key);
    if (found === "yes") return undefined;
    return refuse(c, { no: "not_found", down: "down", limit: "limit" }[found] as keyof typeof refusals);
  };
  app.post("/", async (c) => {
    const body = RealmRoomRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const { path } = body.data;
    const { room } = realmRoom(path, hubs);
    const key = visitor(c);
    // The room before the rate: asking for one that exists makes none.
    if (!rooms.exists(room)) {
      const refused = known(path) ? undefined : await lookup(c, { path, room, key });
      if (refused !== undefined) return refused;
      // No await from the check to the spend: asks in flight together cannot pass the rate together.
      if (made.full(key, now())) return refuse(c, "limit");
      // A listed realm may use the whole cap; a path found on the chain stops at the reserve, here too, after the await.
      const result = rooms.realm(room, known(path) ? 0 : realmReserve);
      if (result === "full") return refuse(c, "full");
      if (result !== "exists") {
        made.take(key, now());
        log("room_made", { room });
      }
    }
    return c.json({ room } satisfies MadeRoom);
  });
  return app;
}
