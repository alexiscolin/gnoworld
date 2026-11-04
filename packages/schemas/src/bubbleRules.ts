// The rules of the Earth's bubbles (ADR-0001 §7), apart from the data's other files so data.ts stays within its lines.
import { z } from "./zod.ts";

const rule = (low: number, high: number) => z.int().check(z.gte(low), z.lte(high));

/** The rules of the Earth's bubbles (ADR-0001 §7), one object; each bound keeps a rule from drowning the globe. */
export const BubbleRules = z.strictObject({
  maxOnScreen: rule(1, 12),
  showSeconds: rule(1, 15),
  speakerDelaySeconds: rule(1, 120),
  maxChars: rule(20, 160),
  readLast: rule(1, 2000),
  maxAgeSeconds: rule(30, 86_400),
});
