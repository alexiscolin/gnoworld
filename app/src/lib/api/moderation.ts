// The browser's client of an owner's moderation (server/src/moderation/routes.ts, mounted at /api/moderation; owners' moderation, part 4b): hide a
// line of a room, mute an account in the room's world. The room, the line and the account are checked before any is sent.
import { Address, PinId, RoomId } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";
import { pageFetch } from "../query/policy.ts";

const Done = z.object({ ok: z.literal(true) });

// One or two distinct line ids.
const sound = (ids: readonly string[]) =>
  ids.length >= 1 &&
  ids.length <= 2 &&
  new Set(ids).size === ids.length &&
  ids.every((id) => PinId.safeParse(id).success);

export function moderationApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  const refused = { ok: false, reason: "refused" } as const;
  const send = async (path: string, body: object): Promise<Result<{ ok: true }>> =>
    call({ path: `/api/moderation/${path}`, body, schema: Done });
  return {
    /** Takes a line out of the room: its id, and its last edit's when it has one; one request. */
    hide: async (room: string, msgids: readonly string[]) =>
      RoomId.safeParse(room).success && sound(msgids) ? send("hide", { room, msgids }) : refused,
    /** Mutes an account in the room's world. */
    mute: async (room: string, account: string) =>
      RoomId.safeParse(room).success && Address.safeParse(account).success ? send("mute", { room, account }) : refused,
  };
}

/** The moderation's client of this page, on its own fetch. */
export const pageModerationApi = () => moderationApi(pageFetch);
