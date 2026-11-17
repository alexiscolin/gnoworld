// What phoneAway.ts asks once a phone is known: where it lands in the universe whose home is `home`.
import { landingPaths } from "../lib/recents.ts";
import { phoneLanding } from "../phoneLanding.ts";
import { site } from "../places.ts";

export const landingOf = (home: string): string => phoneLanding(site.universeAt(home), landingPaths());
