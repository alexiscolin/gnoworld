// The colony's code, a chunk of its own (D13746): asked the first time the scene draws the colony as itself, so no first screen holds it;
// until it came, the colony is drawn as any world is while its maps come, as its quad.
import type { PlanetLook } from "@gnoworld/core";
import type { Planet as Drawn } from "../planet/planet.ts";

type Code = typeof import("./gnoshColony.ts");

let code: Code | undefined;
let asked: Promise<void> | undefined;

/** The colony's code, asked once; asked again after a failure (the network), on the next draw. */
export function colonyCame(): Promise<void> {
  asked ??= import("./gnoshColony.ts").then(
    (came) => {
      code = came;
    },
    (error: unknown) => {
      asked = undefined;
      throw error;
    },
  );
  return asked;
}

/** A colony drawn with `look`, or none while its code is on its way. */
export function colonyBody(look: PlanetLook): Drawn | undefined {
  if (code !== undefined) return new code.ColonyBody(look);
  // A chunk that cannot be fetched leaves the colony its quad, and the browser's error channel hears of it.
  colonyCame().catch((error: unknown) => {
    reportError(error);
  });
  return undefined;
}
