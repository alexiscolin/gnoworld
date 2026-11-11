import type { Space } from "../../space/scene.ts";
import { savesData } from "../../lib/saveData.ts";

// The test hook `__gnoworldSpace`: the journeys, the probes and the capture tool read the engine through it. Set in a dev or a test-GPU build
// only; a production build holds no trace of it. It carries `portraits`, the capture tool's entry (tests/tools/planetPictures.spec.ts): the
// world pictures at `size` px on the engine's renderer, as the rail draws them.
export function exposeSpace(engine: Space): void {
  if (import.meta.env.MODE !== "development" && import.meta.env.VITE_GNOWORLD_TEST_GPU !== "1") return;
  const portraits = async (ids: readonly string[], size: number) =>
    (await import("../../space/portraits.ts")).portraitsOf(
      {
        renderer: engine.renderer,
        base: import.meta.env.BASE_URL,
        halved: savesData,
        lend: (draw) => {
          requestAnimationFrame(draw);
        },
        signal: new AbortController().signal,
      },
      ids,
      size,
    );
  Reflect.set(globalThis, "__gnoworldSpace", Object.assign(engine, { portraits }));
}
