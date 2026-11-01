// The file the server's worlds job writes and every client reads (slice 7, 7c): the chain's realms grouped into worlds, each realm
// with what was read of its package and its history. All of it came from a chain or an indexer, so every text is capped and
// checked, every count is a whole number, and a null is a fact not read, never a zero.
import { z } from "./zod.ts";

/** What one file may hold. A world's name and a text are at most `name` characters. */
export const WORLDS_CAPS = { worlds: 20_000, realms: 512, functions: 256, imports: 256, name: 128, path: 256 } as const;

/** The most bytes the job writes and a client accepts: 4 MiB, a few times the recorded chain's file. */
export const WORLDS_MAX_BYTES = 4 * 1024 * 1024;

/** A realm of gno.land by its path: gno's grammar for a segment (`[a-z][a-z0-9]*` joined by `_` or `-`, mempackage.go at v1.5.0), `_test` left out, at most 256 characters. */
export const RealmPath = z.string().check(
  z.maxLength(WORLDS_CAPS.path),
  z.regex(/^gno\.land\/r\/[a-z0-9][a-z0-9]*(?:[_-][a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*)*$/),
  z.refine((path) => !path.endsWith("_test"), { message: "no test path" }),
);

const Slug = z.string().check(z.minLength(1), z.maxLength(WORLDS_CAPS.name), z.regex(/^[a-z0-9][a-z0-9_-]*$/));
const Count = z.number().check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.gte(0), z.lte(1e12));
const Moment = z.iso.datetime({ offset: true }).check(z.maxLength(40));

const Realm = z.strictObject({
  path: RealmPath,
  deployer: z.nullable(z.string().check(z.regex(/^g1[023456789acdefghjklmnpqrstuvwxyz]{38}$/))),
  deployerName: z.nullable(
    z.string().check(z.minLength(1), z.maxLength(WORLDS_CAPS.name), z.regex(/^[A-Za-z0-9_.-]+$/)),
  ),
  functions: z.array(z.string().check(z.regex(/^[A-Z][A-Za-z0-9_]{0,127}$/))).check(z.maxLength(WORLDS_CAPS.functions)),
  imports: z
    .array(
      z.string().check(
        z.maxLength(WORLDS_CAPS.path),
        z.regex(/^gno\.land\/[pr]\/[a-z0-9][a-z0-9_/-]*$/),
        z.refine((path) => !path.includes("//")),
      ),
    )
    .check(z.maxLength(WORLDS_CAPS.imports)),
  calls: z.nullable(Count),
  callers: z.nullable(Count),
  lastHeight: z.nullable(Count),
});

const World = z.strictObject({
  id: z.string().check(z.maxLength(WORLDS_CAPS.path), z.regex(/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/)),
  namespace: Slug,
  realms: z.array(Realm).check(z.maxLength(WORLDS_CAPS.realms)),
  // The time the world was first seen on the list (null on a first pass), and whether it joined in a batch.
  seen: z.optional(z.nullable(Moment)),
  batch: z.optional(z.boolean()),
});

/** worlds.json: the universe it was read from, the time of the read, and the worlds, sorted by id. */
export const Worlds = z.strictObject({
  version: z.literal(1),
  universe: Slug,
  updated: Moment,
  worlds: z.array(World).check(z.maxLength(WORLDS_CAPS.worlds)),
});
export type Worlds = z.infer<typeof Worlds>;
