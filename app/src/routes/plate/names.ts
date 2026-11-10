// The names the worlds' file holds for addresses (a deployer's), indexed once per file, for the callers a plate lists.
import { shortAddress } from "@gnoworld/schemas";
import type { Worlds } from "@gnoworld/schemas/indexer";

const named = new WeakMap<Worlds["worlds"], Map<string, string>>();

function namesOf(worlds: Worlds["worlds"]): Map<string, string> {
  const kept = named.get(worlds);
  if (kept !== undefined) return kept;
  const names = new Map<string, string>();
  for (const { realms } of worlds) {
    for (const { deployer, deployerName } of realms) {
      if (deployer !== null && deployerName !== null) names.set(deployer, deployerName);
    }
  }
  named.set(worlds, names);
  return names;
}

/** An address as the file names it, else short. */
export const callerName = (worlds: Worlds["worlds"] | undefined, address: string | null): string =>
  address === null
    ? "Unknown"
    : ((worlds === undefined ? undefined : namesOf(worlds).get(address)) ?? shortAddress(address));

/** A name's hue, so a name keeps its colour: the proposal's hue2. */
export function hueOf(name: string): number {
  let hue = 0;
  for (let at = 0; at < name.length; at += 1) hue = (hue * 31 + name.charCodeAt(at)) % 360;
  return hue;
}
