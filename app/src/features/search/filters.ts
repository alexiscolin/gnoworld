// What the chips and the namespace keep of the places: the kinds add to each other, the rest narrow.
import type { SearchFilter, SearchItem } from "./types.ts";

const KIND_FILTERS: Readonly<Record<string, (item: SearchItem) => boolean>> = {
  worlds: (item) => item.kind === "world" && item.tag !== "DAO",
  dao: (item) => item.tag === "DAO",
  stations: (item) => item.kind === "station",
  systems: (item) => item.kind === "system",
};
const NARROWS: Readonly<Record<string, (item: SearchItem) => boolean>> = {
  here: (item) => (item.here ?? 0) > 0,
  active: (item) => item.active === true,
  new: (item) => item.fresh === true,
  unseen: (item) => (item.kind === "world" || item.kind === "station") && item.visited === false,
};

// The test of the chips and the namespace, made once for a search: kinds add to each other, the rest narrow.
export function keeping(
  filters: ReadonlySet<SearchFilter>,
  namespace: string | undefined,
): (item: SearchItem) => boolean {
  const kinds = [...filters].flatMap((each) => KIND_FILTERS[each] ?? []);
  const narrows = [...filters].flatMap((each) => NARROWS[each] ?? []);
  return (item) =>
    (kinds.length === 0 || kinds.some((test) => test(item))) &&
    narrows.every((test) => test(item)) &&
    (namespace === undefined || item.namespace === namespace);
}
