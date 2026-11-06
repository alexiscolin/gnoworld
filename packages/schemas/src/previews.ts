// The file the server's preview job writes and every client reads (8f, slice 7's 7l): each captured page by its realm's path, the time it
// was captured, and its first part as the chain rendered it, which the moderation check read before it was written. All of it came from a
// chain, so every text is capped and every path is a realm's. Behind the indexer's door (indexer.ts): only a page that draws a preview reads it.
import { RealmPath } from "./realmPath.ts";
import { Moment, Slug } from "./worldsHead.ts";
import { z } from "./zod.ts";

/** The most UTF-8 bytes of a page a capture keeps; a text holds no more UTF-16 units than its bytes. */
export const CAPTURE_MAX_BYTES = 4096;
/** The most pages a file holds: the team's data lists a few. */
export const PREVIEWS_MAX = 32;
/** The most bytes the job writes and a client reads: 32 captures with every byte escaped weigh some 800 KB. */
export const PREVIEWS_MAX_BYTES = 1024 * 1024;

/** A page's capture: its realm's path, when it was read, and its first part. */
export const Capture = z.strictObject({
  path: RealmPath,
  captured: Moment,
  text: z.string().check(z.minLength(1), z.maxLength(CAPTURE_MAX_BYTES)),
});
export type Capture = z.infer<typeof Capture>;

/** previews.json: the universe it was read from, the time of the pass, and the captures by their paths, each once, in sort()'s order. */
export const Previews = z.strictObject({
  version: z.literal(1),
  universe: Slug,
  updated: Moment,
  previews: z.array(Capture).check(
    z.maxLength(PREVIEWS_MAX),
    z.refine((captures) => captures.every((capture, at) => at === 0 || (captures[at - 1]?.path ?? "") < capture.path), {
      message: "by their paths, each once",
    }),
  ),
});
export type Previews = z.infer<typeof Previews>;
