// The colony's code, a chunk of its own (D13746): asked the first time the scene draws the colony as itself, so no first screen holds it;
// until it came, the colony is drawn as any world is while its maps come, as its quad.
import type { PlanetLook } from "@gnoworld/core";
import type { Planet as Drawn } from "../planet/planet.ts";

type Code = typeof import("./gnoshColony.ts");

let code: Code | undefined;
let asked: Promise<void> | undefined;
// A chunk that could not be fetched (a new deploy renamed it) is asked no more till the page is loaded again: reported once.
let failed = false;

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

// A colony, wider than its sphere, drawn at this share of it in its picture: whole, a margin round it, where a planet's disc fills it.
const IN_PICTURE = 0.72;

/** A colony drawn with `look` at `size` of its sphere, or none while its code is on its way. */
export function colonyBody(look: PlanetLook, size = 1): Drawn | undefined {
  if (failed) return undefined;
  if (code !== undefined) {
    const body = new code.ColonyBody(look);
    body.group.scale.setScalar(size);
    return body;
  }
  // A chunk that cannot be fetched leaves the colony its quad, and the browser's error channel hears of it.
  colonyCame().catch((error: unknown) => {
    if (failed) return;
    failed = true;
    reportError(error);
  });
  return undefined;
}

/** A colony for its picture: whole in it, with a margin. */
export const colonyPicture = (look: PlanetLook): Drawn | undefined => colonyBody(look, IN_PICTURE);
