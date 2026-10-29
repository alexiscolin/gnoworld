// The places of the data files: the same rows read at build time (the config, from the files it checked) and in the app
// (the bundle's copy), so the pages written and the pages known are one list.
import { placesOf, type Place } from "@gnoworld/core";

interface Row {
  slug: string;
  universe: string;
}

export function placesFrom(data: {
  universes: { id: string; default?: boolean | undefined }[];
  hubs: Row[];
  ecosystems: Row[];
  stations: Row[];
}): Place[] {
  const chosen = data.universes.find((universe) => universe.default === true);
  return placesOf({ ...data, defaultUniverse: chosen?.id ?? "" });
}
