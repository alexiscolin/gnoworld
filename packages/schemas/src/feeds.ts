// What the team copies by hand for the home and the Earth (slice 8, 8i): the latest posts on X and what is on air, checked when the app builds
// as the other data files are (data.ts's rules: https links alone, capped strings, no duplicate).
import { byId, DATA_CAPS, Key, Link, text } from "./data.ts";
import { z } from "./zod.ts";

/** A post's address on X: a handle's page, or one of its posts. */
const XLink = z.string().check(z.regex(/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}(?:\/status\/\d{1,20})?$/));

/** The latest posts on X the team copies by hand (slice 8, 8i; the Earth's "Latest on X" card, frame 40): who wrote it, its words, when, and
 * its address; a row the team wrote as an example says so (`sample`), and the card says it too. */
export const XPosts = byId(
  z.strictObject({
    id: text(DATA_CAPS.key),
    handle: z.string().check(z.regex(/^@[A-Za-z0-9_]{1,15}$/)),
    text: text(280),
    at: z.iso.datetime(),
    link: XLink,
    sample: z.optional(z.literal(true)),
  }),
);

/** What is on air (slice 8, 8i; the ticker's "ON AIR", frame 16: "Broadcast Moon · 6 screens, curated"): the team's live programme, a line
 * each, leading to a world of the file's universe by its slug or to another site, never both, and shown until `until` when it has one. */
export const OnAir = byId(
  z
    .strictObject({
      id: Key,
      universe: Key,
      title: text(DATA_CAPS.title),
      hub: z.optional(Key),
      link: z.optional(Link),
      until: z.optional(z.iso.datetime()),
    })
    .check(z.refine((row) => (row.hub === undefined) !== (row.link === undefined), "a hub or a link")),
);
