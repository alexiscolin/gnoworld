// The real Ergo's tests of an owner's hide: the chat as main starts it, and the moderation routes on its own line read and
// REDACT, as roles/wire.ts mounts them. The moderator holds a right in #bubble/games alone, as an account holds one in the Earth room it
// made: none over the lines of #bubble.
import type { Address } from "@gnoworld/schemas";
import { logger } from "@gnoworld/service/log";
import { makeApp } from "../app.ts";
import { moderationRoutes } from "../moderation/routes.ts";
import type { Right } from "../roles/mayModerate.ts";
import { MOD, pinsFor } from "./ergoPins.ts";
import type { start } from "./ergoKit.ts";

const ORIGIN = "https://gnoworld.test";
const log = logger("a-pepper-of-forty-characters-0123456789", () => true);

// The chat as main starts it on `e`, the moderation routes as main mounts them, and the moderator's hide.
export async function hideFor(e: Awaited<ReturnType<typeof start>>) {
  const started = await pinsFor(e);
  const right = (who: string, room: string): Promise<Right | false> =>
    Promise.resolve(who === MOD && room === "#bubble/games" ? { as: "maker" } : false);
  const app = makeApp(log, () => true);
  app.route(
    "/api/moderation",
    moderationRoutes({
      line: started.chat.line,
      hide: started.chat.hide,
      mute: started.chat.muteKeeping,
      roomsOf: started.chat.roomsOf,
      mayModerate: right,
      judge: right,
      identityOf: (who: Address) => [who],
      spared: () => false,
      session: (token) => (token === "mod" ? MOD : undefined),
      origins: [ORIGIN],
      proxy: undefined,
      log,
      now: Date.now,
    }),
  );
  const hide = (room: string, msgids: string[]) =>
    app.request(
      "/api/moderation/hide",
      {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json", cookie: "__Host-session=mod" },
        body: JSON.stringify({ room, msgids }),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
  return { ...started, hide };
}
