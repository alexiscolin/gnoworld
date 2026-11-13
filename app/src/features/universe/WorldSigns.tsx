// The bubbles over a world that is not the Earth (D565): the rooms its page follows, each speaker on a spot of their own (spot.ts). The code of the
// Earth's signs, which they are, comes in its own chunk once the page has one to show.
import { lazy, Suspense } from "react";
import { useNavigate } from "react-router";
import { useAppStore } from "../../storeContext.tsx";

// Asked as this module runs, not as the first render does: the plate's chunk, asked at the page's load, would hold the signs' code behind it
// (the chat's budget counted it then, as the page's first screen no longer held it).
const earth = import("../../EarthSigns.tsx");
const Signs = lazy(async () => ({ default: (await earth).PageSigns }));

/** The newest words of the rooms the page follows as bubbles on the planet `world`, the page's; the Earth's, with none. */
export function WorldSigns({ world }: { world?: string }) {
  const store = useAppStore();
  const navigate = useNavigate();
  return (
    <Suspense fallback={null}>
      <Signs
        store={store}
        open={(href) => {
          Promise.resolve(navigate(href)).catch(reportError);
        }}
        {...(world === undefined ? {} : { world: { id: world } })}
      />
    </Suspense>
  );
}
