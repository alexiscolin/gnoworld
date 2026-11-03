// A name in a path (a world, a room, a universe's id): lower case, digits and single hyphens. Each use bounds its own length.
import { z } from "./zod.ts";

export const Slug = z.string().check(z.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/));
