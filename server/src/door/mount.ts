// The door's routes in the app (10g, 10k, 10u-g): a question, a line's translation and a realm's digest, each its own path
// and rate, under /api/jarvis; one memory of the accounts' mainnet names serves the question's quota and the digest's.
import type { Hono } from "hono";
import type { Log } from "@gnoworld/service/log";
import type { Chat } from "../chat.ts";
import type { Address } from "@gnoworld/schemas";
import { askRoutes } from "./ask.ts";
import { digestRoutes } from "./digest.ts";
import type { Jarvis } from "./jarvis.ts";
import { makeNames } from "./names.ts";
import type { doorMemory } from "./memory.ts";
import type { Quota } from "./quota.ts";
import type { DoorConfig } from "./settings.ts";
import { translateRoutes } from "./translate.ts";

interface Door {
  settings: DoorConfig;
  quota: Quota;
  jarvis: Jarvis;
}

interface Parts {
  door: Door;
  chat: Pick<Chat, "mayRead" | "recent" | "last" | "line">;
  memory: ReturnType<typeof doorMemory>["ask"];
  session: (token: string | undefined) => Address | undefined;
  signedAt: (token: string | undefined) => number | undefined;
  origins: readonly string[];
  log: Log;
}

export function mountDoor(app: Hono, { door, chat, memory, session, signedAt, origins, log }: Parts): void {
  const front = { session, origins, on: door.settings.on, log, now: Date.now };
  const named = makeNames({ rpc: door.settings.namesRpc, chainId: door.settings.namesChain, now: Date.now, log });
  const { mayRead, recent, last, line } = chat;
  const { quota, jarvis } = door;
  const asked = { ...front, ...memory, mayRead, recent, last, signedAt, named, quota, jarvis };
  app.route("/api/jarvis", askRoutes({ ...asked, questionChars: door.settings.questionChars }));
  app.route("/api/jarvis", translateRoutes({ ...front, mayRead, line, jarvis }));
  app.route("/api/jarvis", digestRoutes({ ...front, jarvis, quota, named }));
}
