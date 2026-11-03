import type { Page } from "./fixtures.ts";
import type { Circle } from "./lab.ts";
import { READ, type added, type gridOf } from "./coasts.ts";
import { reading, type Tools } from "./pixels.ts";

// A world's sea on its lit half (7b8; the chief, 2026-11-04: "the seas are near black"), on coasts.ts's grid, its day side right of its
// centre as the day box reads it: the mean L*, a* and b* of every pixel read as sea there, dark ones too, where facesOn reads lit ones only.
export type SeaLight = readonly [number, number, number] | null;
// The helpers the reading page declares, as it holds them: an imported function is a property of the import's binding once compiled.
interface Held {
  readonly gridOf: typeof gridOf;
  readonly added: typeof added;
}
const held = (): Held => globalThis as unknown as Held;

// Each disc's lit sea, or null under 30 pixels of it.
function seaLightsOf(discs: readonly Circle[]): SeaLight[] {
  const { image, labAt } = Reflect.get(globalThis, "__pixels") as Tools;
  return discs.map((disc) => {
    const { kinds, w, x0, y0 } = held().gridOf(disc);
    const sum = [0, 0, 0, 0];
    for (const [at, kind] of kinds.entries()) {
      const x = x0 + (at % w);
      if (kind === 1 && x > disc.x) held().added(sum, [1, ...labAt(image, x, y0 + Math.floor(at / w))], 1);
    }
    const [n = 0, l = 0, a = 0, b = 0] = sum;
    return n < 30 ? null : [l / n, a / n, b / n];
  });
}

const SEAS = [READ, `const held = ${String(held)};`].join("\n");

export const seaLightsOn = (page: Page, picture: Buffer, discs: readonly Circle[]): Promise<SeaLight[]> =>
  reading(page, [picture], [seaLightsOf, discs, SEAS]);
