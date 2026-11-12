// Mounts each world's unread count at /api/unread, as main starts it.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import { roomWorld } from "../rooms/rooms.ts";
import type { Typed } from "../rooms/types.ts";
import { unreadRoutes, type UnreadRoutesOptions } from "./routes.ts";
import { makeUnread, type Unread } from "./store.ts";

// The retention starts before the chat these routes read: it holds this expiry, which calls the store's once the routes stand.
const bound: { expire: (limit: number) => number } = { expire: () => 0 };
export const unreadExpiry = { expire: (limit: number): number => bound.expire(limit) };

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
): Pick<Unread, "expire"> {
  const unread = makeUnread(db, {
    roles,
    archived,
    exists: (room) => roomWorld(db, room) !== undefined,
    now: routes.now,
  });
  app.route("/api/unread", unreadRoutes({ ...routes, unread }));
  bound.expire = unread.expire;
  return { expire: unread.expire };
}
