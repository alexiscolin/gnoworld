// The verdicts' stream (ADR-0002 §6 and §7; slice 3's plan, 3j): server-sent events a page follows, so a
// link's preview shows only once its message is checked. Public, as guests read, but for the rooms a
// reader may not read (3m); bounded: 25 rooms a stream, 4 streams a visitor, a total, each room's last
// events kept for a late client or one coming back.
import { getConnInfo } from "@hono/node-server/conninfo";
import type { ApiError, StreamEvent } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { z } from "zod";
import { visitor } from "../visitor.ts";

export interface Stream {
  publish: (event: StreamEvent) => void;
  // visible and session as activity/routes.ts's (3m): a room the reader may not see sends it nothing.
  routes: (options: {
    proxy: string | undefined;
    visible?: Seeing["visible"] | undefined;
    session?: Seeing["session"] | undefined;
  }) => Hono;
  close: () => void;
  // What it holds, for the tests of its bounds: events kept, rooms kept, clients and visitors.
  size: () => { events: number; rooms: number; clients: number; visitors: number };
}

interface Seeing {
  visible: (room: string, who: string | undefined) => boolean;
  session: (token: string | undefined) => string | undefined;
}

interface Options {
  perVisitor?: number;
  total?: number;
  heartbeatMs?: number;
  // Events a client may leave unread before it is dropped, and each room's last events kept.
  pending?: number;
}

interface Client {
  rooms: ReadonlySet<string>;
  stream: SSEStreamingApi;
  unread: number;
}

// Hono's write never rejects (hono 4.13.13, utils/stream.js): a gone client ends by its abort, a slow one
// by the writes it leaves pending, beats included.
function writeTo(client: Client, text: string, pending: number): void {
  if (client.unread >= pending) {
    client.stream.abort();
    return;
  }
  client.unread += 1;
  const sent = (): void => {
    client.unread -= 1;
  };
  client.stream.write(text).then(sent, sent);
}

// The rooms a reader may see, by its session's account, read once at the start: live events and replay
// alike (3m).
function seenBy(c: Context, rooms: ReadonlySet<string>, { visible, session }: Seeing): Set<string> {
  const reader = session(getCookie(c, "__Host-session"));
  return new Set([...rooms].filter((room) => visible(room, reader)));
}

export function makeStream(options: Options = {}): Stream {
  const { perVisitor = 4, total = 1000, heartbeatMs = 15_000, pending = 64 } = options;
  const Rooms = z
    .string()
    .regex(/^#[^\s,#\0-\x1f\x7f]{1,63}(?:,#[^\s,#\0-\x1f\x7f]{1,63}){0,24}$/)
    .transform((list) => new Set(list.split(",")));
  const LastId = z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number)
    .optional();
  // From the clock, so the ids a server gave before a restart stay below the next one's.
  let sequence = Date.now();
  // Each room's last events, oldest first; a room past the cap of rooms is not kept.
  const rings = new Map<string, { id: number; event: StreamEvent }[]>();
  const clients = new Set<Client>();
  const byVisitor = new Map<string, number>();
  let admitted = 0;

  const write = (client: Client, text: string): void => {
    writeTo(client, text, pending);
  };
  const frame = (id: number, event: StreamEvent): string =>
    `id: ${String(id)}\nevent: verdict\ndata: ${JSON.stringify(event)}\n\n`;

  return {
    publish(event) {
      sequence += 1;
      const kept = rings.get(event.room) ?? [];
      kept.push({ id: sequence, event });
      if (kept.length > pending) kept.shift();
      if (kept.length === 1 && rings.size < 10_000) rings.set(event.room, kept);
      // One frame for every client that follows the room.
      // ponytail: every client is asked whether it follows; 1,000 at most, about 7 us an event. Index
      // the clients by room if the total grows.
      const text = frame(sequence, event);
      for (const client of clients) if (client.rooms.has(event.room)) write(client, text);
    },
    routes: ({ proxy, visible = () => true, session = () => undefined }) => {
      const app = new Hono();
      app.get("/", (c) => {
        const asked = c.req.queries("rooms") ?? [];
        const rooms = Rooms.safeParse(asked.length === 1 ? asked[0] : undefined);
        const last = LastId.safeParse(c.req.header("last-event-id"));
        if (!rooms.success || !last.success) return c.json({ error: "refused" } satisfies ApiError, 400);
        const who = visitor(getConnInfo(c).remote.address ?? "", c.req.header("x-real-ip"), proxy);
        const held = byVisitor.get(who) ?? 0;
        if (held >= perVisitor || admitted >= total) return c.json({ error: "too_many" } satisfies ApiError, 429);
        byVisitor.set(who, held + 1);
        admitted += 1;
        return streamSSE(c, async (stream) => {
          // Listened to first: an abort fires only the listeners it finds.
          const ended = new Promise<void>((resolve) => {
            stream.onAbort(resolve);
          });
          const client: Client = { rooms: seenBy(c, rooms.data, { visible, session }), stream, unread: 0 };
          clients.add(client);
          // The newest it missed, or the rooms' last events for a new client, as many as it may leave unread:
          // a client further behind loses the rest. An id past the last is none of ours (a clock set back).
          const after = (last.data ?? 0) > sequence ? 0 : (last.data ?? 0);
          const missed = [...client.rooms].flatMap((room) => rings.get(room) ?? []).filter(({ id }) => id > after);
          for (const { id, event } of missed.toSorted((a, b) => a.id - b.id).slice(-pending))
            write(client, frame(id, event));
          // A comment line, which keeps a proxy from closing a quiet stream.
          const beat = setInterval(() => {
            write(client, ": beat\n\n");
          }, heartbeatMs);
          await ended;
          clearInterval(beat);
          clients.delete(client);
          admitted -= 1;
          const left = (byVisitor.get(who) ?? 1) - 1;
          if (left > 0) byVisitor.set(who, left);
          else byVisitor.delete(who);
        });
      });
      return app;
    },
    close() {
      for (const client of clients) client.stream.abort();
    },
    size: () => ({
      events: [...rings.values()].reduce((sum, kept) => sum + kept.length, 0),
      rooms: rings.size,
      clients: clients.size,
      visitors: byVisitor.size,
    }),
  };
}
