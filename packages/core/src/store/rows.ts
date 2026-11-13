// The store's rows (D373): each realm of the worlds' file with what Discover reads of it, built once per file, never per keystroke.
// `firstHeight` and `rise` are what the server adds in phase 2 (the first block, the calls' rise); the file gives neither today, and every
// rule that reads them is quiet till it does.
import { BLOCK_MS } from "../planet/activity.ts";
import { familyOf, nameOf } from "./families.ts";
import { styleOf, type StyleId } from "./styles.ts";

/** A day and a week, in blocks. */
export const DAY_BLOCKS = 86_400_000 / BLOCK_MS;
export const WEEK_BLOCKS = 7 * DAY_BLOCKS;

/** A realm as the worlds' file gives it, plus the world it is in. */
export interface StoreRealm {
  path: string;
  namespace: string;
  /** The name its deployer registered. */
  author: string | null;
  functions: readonly string[];
  imports: readonly string[];
  calls: number;
  callers: number;
  /** The block of its last call; null where the file did not read it. */
  lastHeight: number | null;
  firstHeight: number | null;
  /** How much its calls rose, in percent; null until the server reads the history. */
  rise: number | null;
  world: string;
}

export interface StoreRow extends StoreRealm {
  /** Its place in the store: a stable key. */
  id: number;
  name: string;
  styles: readonly StyleId[];
  family: string;
  /** The newest version of its family. */
  head: boolean;
  /** Whether it has a Render, which is its page. */
  page: boolean;
  known: boolean;
  lab: boolean;
  /** Blocks since the newest last call of the file; null where it has none. */
  age: number | null;
  /** Last called within a day of the newest, or within a week. */
  active: boolean;
  recent: boolean;
  /** First seen within a week of the newest block. */
  fresh: boolean;
}

export interface Store {
  rows: readonly StoreRow[];
  /** The newest last block of the file, which stands for the chain's head. */
  newest: number | null;
  /** Whether any realm has a first block, so "New" can be told. */
  hasFirst: boolean;
}

const ageOf = (height: number | null, newest: number | null) =>
  height === null || newest === null ? null : newest - height;
const within = (age: number | null, blocks: number) => age !== null && age < blocks;

function rowOf(realm: StoreRealm, id: number, newest: number | null): StoreRow {
  const age = ageOf(realm.lastHeight, newest);
  const styles = styleOf(realm);
  return {
    ...realm,
    id,
    name: nameOf(realm.path),
    styles,
    family: familyOf(realm.path),
    head: false,
    page: realm.functions.includes("Render"),
    known: realm.author !== null,
    lab: styles.includes("lab"),
    age,
    active: within(age, DAY_BLOCKS),
    recent: within(age, WEEK_BLOCKS),
    fresh: within(ageOf(realm.firstHeight, newest), WEEK_BLOCKS),
  };
}

export function storeOf(realms: readonly StoreRealm[]): Store {
  const heights = realms.flatMap(({ lastHeight }) => (lastHeight === null ? [] : [lastHeight]));
  const newest = heights.length === 0 ? null : Math.max(...heights);
  const rows = realms.map((realm, id) => rowOf(realm, id, newest));
  // The newest last block of a family stands for it; a family none of whose versions has one keeps its first.
  const standing = new Map<string, StoreRow>();
  for (const row of rows) {
    const held = standing.get(row.family);
    if (held === undefined || (row.lastHeight ?? -1) > (held.lastHeight ?? -1)) standing.set(row.family, row);
  }
  const heads = new Set([...standing.values()].map(({ id }) => id));
  return {
    rows: rows.map((row) => ({ ...row, head: heads.has(row.id) })),
    newest,
    hasFirst: realms.some(({ firstHeight }) => firstHeight !== null),
  };
}
