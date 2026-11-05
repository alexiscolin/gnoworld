// A name in a path, apart from the data files' schemas: a page that checks one slug does not carry every data file's schema.
import { z } from "./zod.ts";

/** The longest slug, in characters: a data file's key (DATA_CAPS.key). */
export const SLUG_CAP = 40;

/** A name in a path, and the id of a universe: lower case, digits, single hyphens. */
export const Slug = z.string().check(z.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), z.maxLength(SLUG_CAP));
