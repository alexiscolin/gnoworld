// The worlds a reader follows, as the rail reads them (slice 8), apart from the button: the rail's chunk holds this alone.
import type { DeviceFields } from "../../lib/keep/fields.ts";

/** The worlds of `universe` followed, by their ids, the last followed first. */
export function worldsFollowedIn(follows: DeviceFields["follows"], universe: string): string[] {
  const prefix = `${universe}:`;
  return follows.worlds.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
}
