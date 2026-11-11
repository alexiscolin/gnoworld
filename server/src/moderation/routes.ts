// An owner's moderation over HTTP (owners' moderation, part 4b, D13936): POST /api/moderation/hide takes a line out of a room and /mute mutes an
// account in the room's world, with the bot's own means (the link's REDACT, the mutes' table and SAMODE): no table, schema or Ergo right is new.
// Each comes from a listed Origin in JSON (guard.ts) with the login's session; the right (mayModerate), a mute's scope and its target are checked
// before the link is asked anything; an account makes 30 requests a minute; each act is logged with the acting account, the owner and `as`.
import { Address, PinRequest } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { baseRefusals, guard, json, refuserOf, sessionOf, type Guarded, type Refusals } from "../guard.ts";
import { limiter } from "../limit.ts";
import { asOf, type Right } from "../roles/mayModerate.ts";
import { worldOf } from "../rooms/rooms.ts";
import { visitorOf } from "../visitor.ts";

export interface ModerationOptions {
  /** The link's REDACT of a line, the words the server's own; false when not sent. */
  hide: (room: string, msgid: string) => boolean;
  /** The mute of an owner: the automatic mute's table and SAMODE, never ending a live mute to make room: "full" instead. */
  mute: (account: string, world: string) => "muted" | "already" | "full";
  /** Every room of a world the server holds: an owner mutes in a world only if each of them is the owner's to moderate. */
  roomsOf: (world: string) => readonly string[];
  mayModerate: (who: string, room: string, visitor: string) => Promise<Right | false>;
  /** The same right, "failed" when the owner read gave no answer: a target is refused on it, never guessed free. */
  judge: (who: string, room: string, visitor: string) => Promise<Right | false | "failed">;
  identityOf: (address: Address) => readonly Address[];
  /** The team and the trusted: never muted by an owner. */
  spared: (account: string) => boolean;
  session: (token: string | undefined) => Address | undefined;
  origins: readonly string[];
  proxy: string | undefined;
  log: Log;
  now: () => number;
}

// A line's id as a pin names it, and not a word an IRC line would read as its trailing part.
// One or two of them: the line shown and its last edit, both redacted in one request.
const Hide = z.strictObject({
  room: PinRequest.shape.room,
  msgids: z
    .array(PinRequest.shape.msgid.check(z.regex(/^[^:]/)))
    .min(1)
    .max(2)
    .refine((ids) => new Set(ids).size === ids.length),
});
const Mute = z.strictObject({ room: PinRequest.shape.room, account: Address });

const refusals = {
  ...baseRefusals,
  forbidden: ["forbidden", 403],
  refused: ["refused", 400],
  full: ["full", 409],
  unavailable: ["not_ready", 503],
} as const satisfies Refusals;

export function moderationRoutes(options: ModerationOptions): Hono<Guarded> {
  const { hide, mute, roomsOf, mayModerate, judge, identityOf, spared, session, origins, proxy, log, now } = options;
  const requests = limiter({ max: 30, windowMs: 60_000, keys: 100_000 });
  const refuse = refuserOf(log, "moderation_refused", refusals);
  // A POST's account, body and right: the guard has run; the session, the body, the right and the limit come in that order.
  async function request<T extends { room: string }>(c: Context, schema: z.ZodType<T>) {
    const who = sessionOf(c, session);
    if (who === undefined) return refuse(c, "session");
    const body = schema.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const visitor = visitorOf(c, proxy);
    const { room } = body.data;
    const right = await mayModerate(who, room, visitor);
    if (right === false) return refuse(c, "forbidden", { room });
    if (!requests.take(who, now())) return refuse(c, "limit", { room });
    return { who, body: body.data, right, visitor };
  }

  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));

  app.post("/hide", async (c) => {
    const asked = await request(c, Hide);
    if (asked instanceof Response) return asked;
    const { who, right, body } = asked;
    // Every id is sent, whatever the first said: one answer for the pair.
    const sent = body.msgids.map((msgid) => hide(body.room, msgid));
    if (!sent.every(Boolean)) return refuse(c, "unavailable", { room: body.room });
    log("line_hidden", { room: body.room, msgid: body.msgids.join(","), account: who, ...asOf(right) });
    return c.json({ ok: true });
  });

  app.post("/mute", async (c) => {
    const asked = await request(c, Mute);
    if (asked instanceof Response) return asked;
    const { who, right, visitor, body } = asked;
    const { room, account } = body;
    // Never the spared, an account of the actor's own identity, or one whose right could not be read.
    if (spared(account) || identityOf(who).includes(account)) return refuse(c, "forbidden", { room });
    const judged = await judge(account, room, visitor);
    if (judged === "failed") return refuse(c, "unavailable", { room });
    if (judged !== false) return refuse(c, "forbidden", { room });
    // The mute reaches every room of the room's world: whatever the right (an owner's, a maker's), it must reach each of them.
    const world = worldOf(room);
    const reach = await Promise.all(roomsOf(world).map((other) => mayModerate(who, other, visitor)));
    if (reach.some((each) => each === false)) return refuse(c, "refused", { room });
    const done = mute(account, world);
    if (done === "full") return refuse(c, "full", { room });
    if (done === "muted") log("account_muted", { room, account: who, subject: account, ...asOf(right) });
    return c.json({ ok: true });
  });

  return app;
}
