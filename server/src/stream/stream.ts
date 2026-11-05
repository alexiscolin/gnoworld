// The verdicts' stream (ADR-0002 §6 and §7; slice 3's plan, 3j): server-sent events a page follows, so a
// link's preview shows only once its message is checked. Public, as guests read, but for the rooms a
// reader may not read (3m); bounded: 25 rooms a stream, 4 streams a visitor, a total, each room's last
// events kept for a late client or one coming back.
import { getConnInfo } from "@hono/node-server/conninfo";
import type { ApiError, ChainEvent, RealmsDeployed, Signal, StreamEvent, StreamSince } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { z } from "zod";
import { worldOf } from "../rooms/rooms.ts";
import { visitor } from "../visitor.ts";
import { chainSide, EARTH } from "./chain.ts";
import { follows, signalRing } from "./signals.ts";

// A room's name as the stream and GET /api/verdicts take it: # and one word with no comma, 64 characters at most.
const ROOM = String.raw`#[^\s,#\0-\x1f\x7f]{1,63}`;
/** One room's name, as GET /api/verdicts takes it. */
export const RoomName = z.string().regex(new RegExp(`^${ROOM}$`));

/** A query parameter given exactly once, else none: one given twice is refused as one missing. */
export const once = (values: readonly string[] | undefined): string | undefined =>
  values?.length === 1 ? values[0] : undefined;

/** A line's state on the stream from the bot's action on it: an unchecked or pending line has none. */
export function stateOf(action: string): StreamEvent["state"] | undefined {
  if (action === "pass") return "checked";
  return action === "hide" ? "hidden" : undefined;
}

export interface Stream {
  publish: (event: StreamEvent) => void;
  // A first signal (slice 9h) to the readers of any room of its world they may read, in the verdicts' sequence of ids.
  signal: (signal: Signal) => void;
  // The chain's events (slice 9g): a call to the readers of its world, a deploy to the Earth's, live only.
  chain: (event: ChainEvent) => void;
  // A universe's realms deployed in 24 h, to the Earth's readers, the last of each universe replayed to one who comes after.
  realms: (count: RealmsDeployed) => void;
  // visible and session as activity/routes.ts's (3m): a room the reader may not see sends it nothing.
  routes: (options: {
    proxy: string | undefined;
    visible: Seeing["visible"];
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
  now?: () => number;
}

interface Client {
  rooms: ReadonlySet<string>;
  /** The worlds of its rooms, found once when its stream opens: an event is matched by a lookup, not by splitting every room. */
  worlds: ReadonlySet<string>;
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

// The time a connection began following (F890), taken in the same turn as it joins the clients, no event between: a
// line said from then on has its verdict on this stream. Said after its replay, so the page asks the server only of lines the replay did not answer;
// with no id, so a reconnection still names the last verdict; outside the unread count, which a full replay fills.
function tellSince(stream: SSEStreamingApi, time: number): void {
  const since: StreamSince = { time: new Date(time).toISOString() };
  const done = (): void => undefined;
  stream.write(`event: since\ndata: ${JSON.stringify(since)}\n\n`).then(done, done);
}

// The rooms a reader may see, by its session's account, read once at the start: live events and replay
// alike (3m).
function seenBy(c: Context, rooms: ReadonlySet<string>, { visible, session }: Seeing): Set<string> {
  const reader = session(getCookie(c, "__Host-session"));
  return new Set([...rooms].filter((room) => visible(room, reader)));
}

// Built at each read, not at import: StrykerJS mutates only what runs inside a test.
const Rooms = () =>
  z
    .string()
    .regex(new RegExp(`^${ROOM}(?:,${ROOM}){0,24}$`))
    .transform((list) => new Set(list.split(",")));
const LastId = () =>
  z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number)
    .optional();
const frame = (id: number, event: StreamEvent): string =>
  `id: ${String(id)}\nevent: verdict\ndata: ${JSON.stringify(event)}\n\n`;

interface Framed {
  id: number;
  text: string;
}

// What a stream replays, in id order, `pending` at most: the world's firsts whole (two a world, which the page reads nowhere
// else), then the newest verdicts in the room left.
function replay(verdicts: readonly Framed[], firsts: readonly Framed[], pending: number): string[] {
  const room = Math.max(0, pending - firsts.length);
  const newest = verdicts.toSorted((a, b) => a.id - b.id).slice(Math.max(0, verdicts.length - room));
  return [...newest, ...firsts].toSorted((a, b) => a.id - b.id).map(({ text }) => text);
}

// The streams open, by visitor and in all.
function slots(perVisitor: number, total: number) {
  const byVisitor = new Map<string, number>();
  let admitted = 0;
  return {
    free: (who: string): boolean => (byVisitor.get(who) ?? 0) < perVisitor && admitted < total,
    take(who: string): void {
      byVisitor.set(who, (byVisitor.get(who) ?? 0) + 1);
      admitted += 1;
    },
    release(who: string): void {
      admitted -= 1;
      const left = (byVisitor.get(who) ?? 1) - 1;
      if (left > 0) byVisitor.set(who, left);
      else byVisitor.delete(who);
    },
    visitors: (): number => byVisitor.size,
  };
}

export function makeStream(options: Options = {}): Stream {
  const { perVisitor = 4, total = 1000, heartbeatMs = 15_000, pending = 64, now = Date.now } = options;
  // From the clock, so the ids a server gave before a restart stay below the next one's.
  let sequence = Date.now();
  // Each room's last events, oldest first; a room past the cap of rooms is not kept.
  const rings = new Map<string, { id: number; event: StreamEvent }[]>();
  const ring = signalRing();
  const clients = new Set<Client>();
  const places = slots(perVisitor, total);

  const write = (client: Client, text: string): void => {
    writeTo(client, text, pending);
  };

  // An event with the next id, to the readers of any room of the world.
  const tell = (world: string, framed: (id: number) => string): void => {
    sequence += 1;
    const text = framed(sequence);
    for (const client of clients) if (client.worlds.has(world)) write(client, text);
  };

  const side = chainSide(tell, (rooms) => follows(rooms, EARTH));

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
    signal: (signal) => {
      tell(signal.world, (id) => ring.keep(id, signal));
    },
    chain: side.chain,
    realms: side.realms,
    routes: ({ proxy, visible, session = () => undefined }) => {
      return new Hono().get("/", (c) => {
        // Hono runs a HEAD through this handler: refused before any slot is taken, a stream no HEAD can read (F709).
        if (c.req.method !== "GET") return c.json({ error: "refused" } satisfies ApiError, 405, { allow: "GET" });
        const rooms = Rooms().safeParse(once(c.req.queries("rooms")));
        const last = LastId().safeParse(c.req.header("last-event-id"));
        if (!rooms.success || !last.success) return c.json({ error: "refused" } satisfies ApiError, 400);
        const who = visitor(getConnInfo(c).remote.address ?? "", c.req.header("x-real-ip"), proxy);
        if (!places.free(who)) return c.json({ error: "too_many" } satisfies ApiError, 429);
        // Read before a slot is taken: a session that fails (its renewal writes) is the app's 500, and inside
        // the stream it would end the stream with its slot held for good (F653).
        const seen = seenBy(c, rooms.data, { visible, session });
        places.take(who);
        return streamSSE(c, async (stream) => {
          // Listened to first: an abort fires only the listeners it finds.
          const ended = new Promise<void>((resolve) => {
            stream.onAbort(resolve);
          });
          const client: Client = { rooms: seen, worlds: new Set([...seen].map(worldOf)), stream, unread: 0 };
          clients.add(client);
          // The newest it missed, or the rooms' last events for a new client, as many as it may leave unread:
          // a client further behind loses the rest. An id past the last is none of ours (a clock set back).
          const after = (last.data ?? 0) > sequence ? 0 : (last.data ?? 0);
          const verdicts = [...client.rooms]
            .flatMap((room) => rings.get(room) ?? [])
            .filter(({ id }) => id > after)
            .map(({ id, event }) => ({ id, text: frame(id, event) }));
          for (const text of replay(
            verdicts,
            [...ring.missed(client.rooms, after), ...side.missed(client.rooms, after)],
            pending,
          ))
            write(client, text);
          tellSince(stream, now());
          // A comment line, which keeps a proxy from closing a quiet stream.
          const beat = setInterval(() => {
            write(client, ": beat\n\n");
          }, heartbeatMs);
          await ended;
          clearInterval(beat);
          clients.delete(client);
          places.release(who);
        });
      });
    },
    close() {
      for (const client of clients) client.stream.abort();
    },
    size: () => ({
      events: [...rings.values()].reduce((sum, kept) => sum + kept.length, 0),
      rooms: rings.size,
      clients: clients.size,
      visitors: places.visitors(),
    }),
  };
}
