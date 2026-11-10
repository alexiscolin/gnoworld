import { useEffect, useRef, useState } from "react";

// The plate's cards rise as they are seen (the proposal's score): those in view as the plate comes, 0.9 s on and 0.05 s apart; the rest as they
// scroll in, at once. The plate's scroll body is the observer's root, and holds the count of the cards that came with it. Without motion nothing waits
// (the sheet hides a card only where motion is welcome), so nothing here asks for it.
const FIRST_AT = 0.9;
const STEP = 0.05;
// A card seen within this long of the first one's coming is of the plate's own arrival.
const ARRIVAL_MS = 1500;

// The delay a card waits once seen: its place among those that came with the plate, or none for one that scrolls in later.
function delayOf(root: HTMLElement | null): string {
  if (root === null) return "0s";
  const now = performance.now();
  const since = now - Number(root.dataset["riseAt"] ?? (root.dataset["riseAt"] = String(now)));
  const count = Number(root.dataset["risen"] ?? 0);
  root.dataset["risen"] = String(count + 1);
  return since < ARRIVAL_MS ? `${(FIRST_AT + STEP * count).toFixed(2)}s` : "0s";
}

/** Whether a card has come into view, and the delay (`--d`) its entrance waits: the ref goes on its element. */
export function useRise(on: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<{ delay: string }>();
  useEffect(() => {
    const node = ref.current;
    if (!on || node === null) return;
    const root = node.closest<HTMLElement>("[data-content]");
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watch.disconnect();
        setState({ delay: delayOf(root) });
      },
      { root, threshold: 0.1 },
    );
    watch.observe(node);
    return () => {
      watch.disconnect();
    };
  }, [on]);
  return { ref, state };
}
