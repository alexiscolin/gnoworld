// The file the server's worlds job writes and every client reads (slice 7, 7c): the chain's realms grouped into worlds, each realm
// with what was read of its package and its history. All of it came from a chain or an indexer, so every text is capped and
// checked, every count is a whole number, and a null is a fact not read, never a zero.
import { RealmPath, WorldId } from "./realmPath.ts";
import { Moment, Slug, WORLDS_CAPS } from "./worldsHead.ts";
import { z } from "./zod.ts";

export { RealmPath, WorldId } from "./realmPath.ts";
export { WORLDS_CAPS } from "./worldsHead.ts";

/** The most bytes the job writes and a client accepts: 4 MiB, a few times the recorded chain's file. */
export const WORLDS_MAX_BYTES = 4 * 1024 * 1024;

/** A count or a height read from a chain: a whole number from 0, at most 10^12. */
export const ChainCount = z
  .number()
  .check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.gte(0), z.lte(1e12));

/** An exported Go identifier, at most 128 characters. */
export const ExportedName = z.string().check(z.regex(/^[A-Z][A-Za-z0-9_]{0,127}$/));

/** A package or realm a realm imports, by its path on gno.land. */
export const ImportPath = z.string().check(
  z.maxLength(WORLDS_CAPS.path),
  z.regex(/^gno\.land\/[pr]\/[a-z0-9][a-z0-9_/-]*$/),
  z.refine((path) => !path.includes("//")),
);

/** A gno address as the chain writes it: `g1` and 38 characters of bech32's alphabet, the checksum not checked. */
const DeployerAddress = z.string().check(z.regex(/^g1[023456789acdefghjklmnpqrstuvwxyz]{38}$/));

/** The name registered for an address: letters, digits, `_`, `.` and `-`, 1 to 128 characters. */
export const DeployerName = z
  .string()
  .check(z.minLength(1), z.maxLength(WORLDS_CAPS.name), z.regex(/^[A-Za-z0-9_.-]+$/));

const Realm = z.strictObject({
  path: RealmPath,
  deployer: z.nullable(DeployerAddress),
  deployerName: z.nullable(DeployerName),
  functions: z.array(ExportedName).check(z.maxLength(WORLDS_CAPS.functions)),
  imports: z.array(ImportPath).check(z.maxLength(WORLDS_CAPS.imports)),
  calls: z.nullable(ChainCount),
  callers: z.nullable(ChainCount),
  lastHeight: z.nullable(ChainCount),
});

/** What a world's realms say it is, read once by the job (F4109): core's `NATURES`, which only leans a look and is never shown. */
export const WORLD_NATURES = ["nft", "token", "exchange", "dao", "game"] as const;

// A key it does not know is dropped, never kept nor refused: a reader older than the job that wrote the file, an open tab or a server
// rolled back, still reads every world, and nothing it cannot check reaches the app.
const World = z.object({
  id: WorldId,
  namespace: Slug,
  realms: z.array(Realm).check(z.maxLength(WORLDS_CAPS.realms)),
  // The time the world was first seen on the list (null on a first pass), and whether it joined in a batch.
  seen: z.optional(z.nullable(Moment)),
  batch: z.optional(z.boolean()),
  // Its nature, kept from the pass that first read every realm of it (null: no rule reads it); absent until then. A nature this reader
  // does not know reads as absent, so the job reads it again: a newer job's, or one a later part drops, never refuses the file.
  nature: z.optional(z.catch(z.optional(z.nullable(z.enum(WORLD_NATURES))), undefined)),
});

/** worlds.json: the universe it was read from, the time of the read, and the worlds, sorted by id. */
export const Worlds = z.strictObject({
  version: z.literal(1),
  universe: Slug,
  updated: Moment,
  worlds: z.array(World).check(z.maxLength(WORLDS_CAPS.worlds)),
});
export type Worlds = z.infer<typeof Worlds>;
