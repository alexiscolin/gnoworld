// Follows the Earth's room for a page without a chat (the home, the Earth): after the page has hydrated, in a chunk of its own, so the first screen
// does not pay for the stream's client. Stops with the page.
import { useEffect } from "react";
import { useAppStore } from "../../storeContext.tsx";

// Outside the hook, which the React Compiler cannot lower an import() in.
const loadEarth = () => import("./followEarth.ts");

export function useEarthChain(): void {
  const store = useAppStore();
  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    void loadEarth().then(
      ({ followEarth }) => {
        if (live) stop = followEarth(store);
      },
      () => undefined,
    );
    return () => {
      live = false;
      stop?.();
    };
  }, [store]);
}
