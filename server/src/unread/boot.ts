// Mounts each world's unread count at /api/unread, as main starts it.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import type { Typed } from "../rooms/types.ts";
import { unreadRoutes, type UnreadRoutesOptions } from "./routes.ts";
import { makeUnread } from "./store.ts";

export function unreadBoot(
  app: Hono,
  {
    db,
    roles,
    archived,
    ...routes
  }: Omit<UnreadRoutesOptions, "unread"> & {
    db: DatabaseSync;
    roles: Typed;
    archived: (room: string) => boolean;
  },
): void {
  app.route("/api/unread", unreadRoutes({ ...routes, unread: makeUnread(db, { roles, archived, now: routes.now }) }));
}
