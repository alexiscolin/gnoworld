// A name in a path (a world, a room, a universe's id): lower case, digits and single hyphens. Each use bounds its own length.
// Apart from the data files' schemas: a page that checks one slug does not carry every data file's schema.
import { z } from "./zod.ts";

/** The longest data-file key, in characters (DATA_CAPS.key). */
export const SLUG_CAP = 40;

export const Slug = z.string().check(z.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/));

/** A name in a path, and the id of a universe: a slug of at most SLUG_CAP characters. */
export const Key = Slug.check(z.maxLength(SLUG_CAP));

/** A hub's world as who is here names it (7h): its roles file's slug, at most 64 characters. */
export const HubSlug = Slug.check(z.maxLength(64));
