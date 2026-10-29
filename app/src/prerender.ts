// The pages the build writes ahead (ADR-0002 §2: no rendering server): the home and each world of the default universe,
// read from the places of the data files. The other universes' and the Earth's pages come with 5d.
import type { Place } from "@gnoworld/core";

export function prerenderPaths(places: readonly Place[]): string[] {
  const home = places.find((place) => place.kind === "cosmos" && place.path === "/");
  return home === undefined
    ? []
    : [
        "/",
        ...places
          .filter((place) => place.kind === "world" && !place.path.startsWith("/net/"))
          .map((place) => place.path),
      ];
}
