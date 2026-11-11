// What the team copies by hand for the home and the Earth (slice 8, 8i): what is on air, checked when the app builds
// as the other data files are (data.ts's rules: https links alone, capped strings, no duplicate).
import { byId, DATA_CAPS, Key, Link, text } from "./data.ts";
import { hasHidden } from "./hidden.ts";
import { z } from "./zod.ts";

/** A post of gno.land's blog as its realm's page lists it (D13931; the Earth's "Latest on X" card): the title, which holds no hidden character
 * (hidden.ts), its slug in the realm's address and its day. The page is the chain's, so every field is checked. */
export const BlogPost = z.strictObject({
  title: text(DATA_CAPS.title).check(z.refine((title) => !hasHidden(title), "hidden characters")),
  slug: z.string().check(z.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), z.maxLength(DATA_CAPS.key)),
  date: z.iso.date(),
});

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
