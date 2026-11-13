// The guest chat's API (D430): a name and a cookie, then a line the server judges before the bot says it.
import { RoomId } from "./rooms.ts";
import { z } from "./zod.ts";

/** POST /api/guest's answer: the guest's name, which its nick "anon/<name>" is made from. */
export const Guest = z.strictObject({ name: z.string().check(z.regex(/^[a-z]{2,10}-[a-z]{2,10}-[a-z2-7]{4}$/)) });
export type Guest = z.infer<typeof Guest>;

/** POST /api/guest/say's body: a room and one line; the server holds every other rule. */
export const GuestSayRequest = z.strictObject({ room: RoomId, text: z.string().check(z.maxLength(8192)) });
export type GuestSayRequest = z.infer<typeof GuestSayRequest>;

/** POST /api/guest/say's answer once Ergo took the line. */
export const GuestSaid = z.strictObject({ ok: z.literal(true) });
export type GuestSaid = z.infer<typeof GuestSaid>;

/** Why a line did not leave: a rule it broke, the provider's verdict or no verdict, a mute, or the bot's relay. */
export const GuestCause = z.enum([
  "empty",
  "control",
  "multiline",
  "too_long",
  "banned_word",
  "links",
  "mentions",
  "moderation",
  "muted",
  "unchecked",
  "relay",
  "unsure",
]);
export type GuestCause = z.infer<typeof GuestCause>;

/** What /api/guest and /api/guest/say answer when they refuse: a code, and a cause where the page can show one. */
export const GuestRefusal = z.object({
  error: z.enum(["refused", "forbidden", "not_found", "not_ready", "too_many", "unauthenticated"]),
  cause: z.optional(GuestCause),
});
export type GuestRefusal = z.infer<typeof GuestRefusal>;
