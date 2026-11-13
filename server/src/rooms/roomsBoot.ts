// The rooms' routes as the process wires them: a realm's (D390, D413), from the realms the worlds job lists, the default universe's hubs and
// the visitor by the proxy's header, none without the job's file, with the chain read for an unlisted path on the universe's own RPC;
// the rooms made ahead from the same file and the hubs, checked each minute; then a world's moderators' (3l).
import type { Hono } from "hono";
import type { Send } from "@gnoworld/service/net";
import { send as netSend } from "@gnoworld/service/net";
import type { Config } from "../config.ts";
import { defaultHubs, defaultUniverse } from "../prices/universes.ts";
import { visitorOf } from "../visitor.ts";
import { worldsListing, type Listing } from "../worlds/known.ts";
import { aheadRooms } from "./ahead.ts";
import { chainHas } from "./onChain.ts";
import { realmRoutes } from "./realmRoutes.ts";
import { roomsRoutes } from "./routes.ts";

// `send` is the way out the chain read goes through, and `everyMs` the pause between two checks, a test's to set.
type Parts = Pick<Parameters<typeof roomsRoutes>[0], "roles" | "rooms" | "session" | "log" | "nameCheck"> & {
  /** The worlds file's reader the other routes share; one of its own for the file when none. */
  listing?: Listing | undefined;
  send?: Send;
  everyMs?: number;
};

const CHECK_MS = 60_000;

export function roomsBoot(app: Hono, config: Config, parts: Parts): { stop: () => void } {
  const { origins, trustedProxy } = config;
  let stop = (): void => undefined;
  // The realm's route first: the moderators' routes answer every path under /api/rooms.
  if (config.worlds !== undefined && config.universes !== undefined) {
    const hubs = defaultHubs(config.universes);
    const listing = parts.listing ?? worldsListing(config.worlds);
    app.route(
      "/api/rooms/realm",
      realmRoutes({
        rooms: parts.rooms,
        known: listing.known,
        onChain: chainHas({ send: parts.send ?? netSend, rpc: defaultUniverse(config.universes).rpc }),
        hubs,
        origins,
        log: parts.log,
        now: Date.now,
        visitor: (c) => visitorOf(c, trustedProxy),
      }),
    );
    const ahead = aheadRooms({ file: config.worlds, listing, rooms: parts.rooms, hubs, log: parts.log });
    // `check` logs its own faults and never rejects; this is the last net.
    const check = (): void => {
      ahead.check().catch(() => {
        parts.log("rooms_ahead_failed", { error: "internal" });
      });
    };
    check();
    const timer = setInterval(check, parts.everyMs ?? CHECK_MS);
    timer.unref();
    stop = () => {
      clearInterval(timer);
      ahead.stop();
    };
  }
  app.route(
    "/api/rooms",
    roomsRoutes({
      roles: parts.roles,
      rooms: parts.rooms,
      session: parts.session,
      log: parts.log,
      nameCheck: parts.nameCheck,
      origins,
      now: Date.now,
    }),
  );
  return { stop };
}
