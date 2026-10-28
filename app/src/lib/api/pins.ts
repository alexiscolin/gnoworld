// The browser's client of a room's pins (server/src/pins/routes.ts, mounted at /api/pins; slice 4's 4d), through the
// one JSON call of lib/api/http.ts: GET for the pins, POST to pin and to unpin. Each answer must name the room asked.
import { PinId, PinList, RoomId } from "@gnoworld/schemas";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

export function pinsApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  // A call for a room: its words checked before any is sent, its answer for that room alone.
  const ask = async (room: string, path: string, body?: { msgid: string }): Promise<Result<PinList>> => {
    const sound = RoomId.safeParse(room).success && (body === undefined || PinId.safeParse(body.msgid).success);
    if (!sound) return { ok: false, reason: "refused" };
    const result = await call({ path, schema: PinList, ...(body === undefined ? {} : { body: { room, ...body } }) });
    return result.ok && result.value.room !== room ? { ok: false, reason: "malformed" } : result;
  };
  return {
    /** A room's pins, and whether the reader may pin there. */
    pins: (room: string) => ask(room, `/api/pins?room=${encodeURIComponent(room)}`),
    /** Pins a line of the room, by its id alone; the room's pins as they now are. */
    pin: (room: string, msgid: string) => ask(room, "/api/pins", { msgid }),
    /** Unpins a line; the room's pins as they now are. */
    unpin: (room: string, msgid: string) => ask(room, "/api/pins/unpin", { msgid }),
  };
}

/** The pins' client of this page, on its own fetch. */
export const pagePinsApi = () => pinsApi((url, init) => fetch(url, init));
