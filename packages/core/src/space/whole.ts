// Where the whole cosmos takes the view (ADR-0002 §10; Alexis, 2026-11-02), apart from the nebulae: the cosmos's chunk hands the view over,
// and the nebulae's code comes in a chunk of its own (7d6), which this keeps out of it.
import { MOOD_SCALE } from "./mood.ts";
import { smoothstep } from "./smooth.ts";

// The eye's distance to what it looks at where the whole cosmos starts to take over, a cluster's, and from where it holds the whole view.
const CLUSTER = MOOD_SCALE;
const GONE = 2 * MOOD_SCALE;

/** How much of the view the whole cosmos takes with the eye `distance` from what it looks at: none to a cluster's distance, all from twice
 * it. The nebulae, the suns and the bodies give up what it takes, so no frame shows both whole. */
export const wholeShare = (distance: number): number => smoothstep(CLUSTER, GONE, distance);
