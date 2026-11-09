// The bubbles over a world that is not the Earth (D565): its page's own room, each speaker on a spot of their own (spot.ts). The code of the
// Earth's signs, which they are, comes in its own chunk once the page has one to show.
import { lazy, Suspense } from "react";
import { useAppStore } from "../../storeContext.tsx";

const Signs = lazy(async () => ({ default: (await import("../../EarthSigns.tsx")).PageSigns }));
const nothing = () => undefined;

/** `room`'s newest words as bubbles on the planet `world`, the page's. */
export function WorldSigns({ world, room }: { world: string; room: string }) {
  const store = useAppStore();
  return (
    <Suspense fallback={null}>
      <Signs store={store} open={nothing} world={{ id: world, room }} />
    </Suspense>
  );
}
