// The worlds the home's first screen draws larger, each its own size (D549): up to three layers, the nearest the biggest. The shader reads
// `boosts` (a world's index, how many times larger, three times); a detailed planet reads `scaleOf` to stay in step with its quad.
const FEATURED = 3;

/** The featured worlds' index and boost, in pairs (-1: none), and the eased share of them shown (0 to 1: the frame's uBoost less 1). */
export const boosts = { value: new Float32Array(FEATURED * 2).fill(-1), gate: 0 };

/** How many times larger the world `index` is drawn now: 1 unless it is featured, its boost in the share the frame shows (`gate`). */
export function scaleOf(index: number, gate = boosts.gate): number {
  for (let at = 0; at < FEATURED; at += 1)
    if (boosts.value[at * 2] === index) return 1 + ((boosts.value[at * 2 + 1] ?? 1) - 1) * Math.max(gate, 0);
  return 1;
}
