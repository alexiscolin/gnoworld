// The real Ergo's tests of the pins (slice 4's 4d): the chat as main starts it on a database, and the pins' routes as main
// mounts them, a moderator and an author as the session's accounts, and a check held back until a test lets it go.
import { Address, PinList } from "@gnoworld/schemas";
import { makeApp } from "../app.ts";
import { logger } from "../log.ts";
import { pinsRoutes } from "../pins/routes.ts";
import type { World } from "../rooms/types.ts";
import { chatFor, RULES } from "./ergoChat.ts";
import type { start } from "./ergoKit.ts";

const ORIGIN = "https://gnoworld.test";
export const AUTHOR = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
export const MOD = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
// Bubble, its moderator and a room beside its main one.
const worlds = () =>
  new Map<string, World>([
    [
      "bubble",
      {
        rules: RULES,
        moderators: new Set([MOD]),
        rooms: new Map([["#bubble/games", { type: "open", hidden: false }]]),
      },
    ],
  ]);
const log = logger("a-pepper-of-forty-characters-0123456789", () => true);

// A check held until the test lets it go.
export const gate = () => {
  let release: () => void = () => undefined;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { open, release };
};

// The chat as main starts it on `db`, and the pins' routes as main mounts them.
export async function pinsFor(e: Awaited<ReturnType<typeof start>>, more: Parameters<typeof chatFor>[2] = {}) {
  const tokens = new Map([
    ["mod", MOD],
    ["author", AUTHOR],
  ]);
  const session = (token: string | undefined) => tokens.get(token ?? "");
  const started = await chatFor(e, [], { worlds: worlds(), session, ...more });
  const app = makeApp(log, () => true);
  app.route(
    "/api/pins",
    pinsRoutes({
      pins: started.chat.pins,
      mayPin: started.chat.mayPin,
      readable: started.chat.mayRead,
      session,
      origins: [ORIGIN],
      log,
      now: Date.now,
    }),
  );
  const call = (method: string, path: string, { who, body }: { who?: string; body?: unknown } = {}) =>
    app.request(
      `/api/pins${path}`,
      {
        method,
        headers: {
          origin: ORIGIN,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(who === undefined ? {} : { cookie: `__Host-session=${who}` }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
  const list = async (room: string, who?: string) =>
    PinList.parse(
      await (await call("GET", `?room=${encodeURIComponent(room)}`, who === undefined ? {} : { who })).json(),
    );
  const pin = (room: string, msgid: string, who = "mod") => call("POST", "", { who, body: { room, msgid } });
  return { ...started, list, pin, call };
}
