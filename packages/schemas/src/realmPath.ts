// A realm's path, a chain's id, a world's id and a chain's count (7c), which the worlds' file, the ticker's trends and every request
// that names a realm or a chain check: one grammar each, so no schema takes a realm or a chain another refuses on its way to a signature.
import { WORLDS_CAPS } from "./worldsHead.ts";
import { z } from "./zod.ts";

/** gno's test of a realm's path on any domain (gnovm/pkg/gnolang/mempackage.go:41-90 at v1.5.0): `/r/`, then names from a letter
 * whose `_` and `-` stand alone between letters and digits; no path a chain can deploy ends in `_test` or `_filetest`
 * (gno.land/pkg/sdk/vm/keeper.go:835), nor passes 256 characters (tm2/pkg/std/memfile.go:19). */
export function isRealmPath(path: string): boolean {
  if (path.length > WORLDS_CAPS.path) return false;
  const name = "[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*";
  const realm = new RegExp(`^(?:[a-z0-9-]+\\.)+[a-z]{2,63}/r/${name}(?:/${name})*$`);
  return realm.test(path) && !/_(?:file)?test$/.test(path);
}

/** A realm of gno.land as its chain names it: gno's grammar, a namespace of any length (an address's nested names). */
export const ChainRealmPath = z
  .string()
  .check(z.refine((path) => path.startsWith("gno.land/r/") && isRealmPath(path), { message: "a realm's path" }));

/** A realm of gno.land by its path, its namespace a world's: a Slug, at most 128 characters. */
export const RealmPath = ChainRealmPath.check(
  z.refine((path) => (path.split("/")[2] ?? "").length <= WORLDS_CAPS.name, { message: "a namespace of at most 128" }),
);

/** A chain by its id, as the universes' data spells it: lower case, digits, `_` and `-`, from a letter or a digit, at most 50
 * characters (tm2/pkg/bft/types/genesis.go:18). */
export const ChainId = z.string().check(z.regex(/^[a-z0-9][a-z0-9_-]{0,49}$/));

/** A chain's id as a wallet or a node may name one: 1 to 50 characters, any (tm2's own rule), to compare with a ChainId, never
 * taken for one: a wallet on `ONYX-1` is on another chain, not saying something malformed. */
export const AnyChainId = z.string().check(z.minLength(1), z.maxLength(50));

/** A world by its id: a namespace, and for most worlds the folders that name it. */
export const WorldId = z
  .string()
  .check(z.maxLength(WORLDS_CAPS.path), z.regex(/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/));

/** A count or a height read from a chain: a whole number from 0, at most 10^12. */
export const ChainCount = z
  .number()
  .check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.gte(0), z.lte(1e12));
