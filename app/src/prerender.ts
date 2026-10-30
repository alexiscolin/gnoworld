// The pages the build writes ahead (ADR-0002 §2: no rendering server): each place of the data files at its path and at
// its canonical address, and the list. A page found at neither is not written, and the host answers 404.
import type { Place } from "@gnoworld/core";

export function prerenderPaths(places: readonly Place[]): string[] {
  const home = places.find((place) => place.kind === "cosmos" && place.path === "/");
  return home === undefined ? [] : [...new Set([...places.flatMap((place) => [place.path, place.canonical]), "/list"])];
}
