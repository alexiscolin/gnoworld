// The browser's client of a world's rooms (server/src/rooms/list.ts, mounted at /api/rooms), through the one
// JSON call of lib/api/http.ts. The answer must name the world asked, and list its rooms alone.
import { MadeRoom, RoomList } from "@gnoworld/schemas";
import { pageFetch } from "../query/policy.ts";
import { rememberRealms } from "../roomRealms.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

// A room of this world: its main room, #<world>, or one of #<world>/<name>.
const ofWorld = (room: string, world: string): boolean => room === `#${world}` || room.startsWith(`#${world}/`);

export function roomsApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** A world's rooms a reader may see, by section. */
    rooms: async (world: string): Promise<Result<RoomList>> => {
      if (!RoomList.shape.world.safeParse(world).success) return { ok: false, reason: "malformed" };
      const result = await call({ path: `/api/rooms?world=${world}`, schema: RoomList });
      if (!result.ok) return result;
      const { value } = result;
      const own =
        value.world === world && value.sections.every(({ rooms }) => rooms.every(({ room }) => ofWorld(room, world)));
      if (!own) return { ok: false, reason: "malformed" };
      rememberRealms(value.sections);
      return result;
    },
    /** A room anyone signed in makes on the Earth (POST /api/rooms, D394): the server's refusal comes back as the reason. */
    make: (name: string): Promise<Result<MadeRoom>> =>
      call({ path: "/api/rooms", body: { world: "earth", name }, schema: MadeRoom }),
    /** A realm's room, made if the server has none yet (POST /api/rooms/realm); the room it answers is the one asked for. */
    realm: (path: string): Promise<Result<MadeRoom>> =>
      call({ path: "/api/rooms/realm", body: { path }, schema: MadeRoom }),
  };
}

/** The rooms' client of this page, on its own fetch. */
export const pageRoomsApi = () => roomsApi(pageFetch);
