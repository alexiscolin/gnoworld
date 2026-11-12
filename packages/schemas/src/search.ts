// GET /api/search (slice 13, B2; D13917, D13924): what a reader asks and what the server answers. The query's words are
// measured after NFKC, the form the index matches; the server never sends HTML, a hit's `marks` are offsets (UTF-16 units)
// into its `text`, which the page draws as text.
import { Address } from "./address.ts";
import { RoomId } from "./rooms.ts";
import { Key } from "./slug.ts";
import { z } from "./zod.ts";

/** A page's hits at most, and a query's words' length range, after normalisation. */
export const SEARCH_PAGE = 20;
export const SEARCH_Q_MIN = 2;
export const SEARCH_Q_MAX = 100;
/** A snippet's length at most. */
export const SEARCH_SNIPPET = 240;

// Tab, newline and carriage return are spaces; any other control character (C0, DEL, C1) refuses the query.
const Words = z.pipe(
  z.pipe(
    z.string().check(z.maxLength(2000)),
    z.transform((text) =>
      text
        .normalize("NFKC")
        .replaceAll(/[\t\n\r]/g, " ")
        .trim(),
    ),
  ),
  z.string().check(z.minLength(SEARCH_Q_MIN), z.maxLength(SEARCH_Q_MAX), z.regex(/^[^\u0000-\u001f\u007f-\u009f]*$/)),
);

/** The request's parameters, each given once: the words, the world, and what narrows them. `before` is the last hit's `next`. Words may be left out only with a `from`: a world is never listed unfiltered. */
export const SearchQuery = z
  .object({
    q: z.optional(Words),
    world: Key,
    room: z.optional(RoomId),
    from: z.optional(Address),
    link: z.optional(z.literal("1")),
    since: z.optional(z.iso.datetime({ offset: true })),
    until: z.optional(z.iso.datetime({ offset: true })),
    before: z.optional(z.string().check(z.regex(/^\d{1,15}$/))),
  })
  .check(z.refine(({ q, from }) => q !== undefined || from !== undefined, "words or a sender"));
export type SearchQuery = z.infer<typeof SearchQuery>;

/** A hit: the line's snippet of 240 characters at most and the ranges of the words in it. */
export const SearchHit = z.strictObject({
  room: RoomId,
  msgid: z.string().check(z.minLength(1), z.maxLength(128)),
  account: z.string(),
  at: z.int().check(z.minimum(0)),
  text: z.string().check(z.maxLength(SEARCH_SNIPPET)),
  marks: z.array(z.tuple([z.int().check(z.minimum(0)), z.int().check(z.minimum(0))])),
  link: z.boolean(),
});
export type SearchHit = z.infer<typeof SearchHit>;

/** A page: 20 hits at most, the cursor of the next, and the match set's size, 1,000 at most (`capped`: there are more). */
export const SearchPage = z.strictObject({
  hits: z.array(SearchHit).check(z.maxLength(SEARCH_PAGE)),
  next: z.nullable(z.string()),
  total: z.int().check(z.minimum(0), z.maximum(1000)),
  capped: z.boolean(),
  partial: z.boolean(),
});
export type SearchPage = z.infer<typeof SearchPage>;
