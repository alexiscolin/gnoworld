import { useEffect, useRef, useState } from "react";
import { whenArrived } from "../arrived.ts";

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
  // `data-rise` is "when the first card came/how many have come": arrival.ts clears it as a new page begins.
  const [at = now, count = 0] = (root.dataset["rise"] ?? `${String(now)}/0`).split("/").map(Number);
  root.dataset["rise"] = `${String(at)}/${String(count + 1)}`;
  const since = now - at;
  // The delay counts from the arrival's own start (the page's one clock, arrival.ts sets `arrivedAt` on the root), not from when this card was
  // seen: a card seen late in a slow frame is a little further on, so it still lands in step with the title and the figures.
  const lag = (now - Number(document.documentElement.dataset["arrivedAt"] ?? now)) / 1000;
  return since < ARRIVAL_MS ? `${(FIRST_AT + STEP * count - lag).toFixed(2)}s` : "0s";
}

/** Whether a card has come into view, and the delay (`--d`) its entrance waits: the ref goes on its element. */
export function useRise(on: boolean) {
  const ref = useRef<HTMLElement>(null);
  // No observer to ask (a test's DOM): the card is as seen, with no wait.
  const [state, setState] = useState<{ delay: string } | undefined>(() =>
    on && typeof IntersectionObserver === "undefined" ? { delay: "0s" } : undefined,
  );
  useEffect(() => {
    const node = ref.current;
    if (!on || node === null) return;
    if (typeof IntersectionObserver === "undefined") return;
    const root = node.closest<HTMLElement>("[data-content]");
    // A card seen while the arrival's box still waits for the scene waits too: one clock (arrived.ts).
    let unwait = (): void => undefined;
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watch.disconnect();
        unwait = whenArrived(() => {
          setState({ delay: delayOf(root) });
        });
      },
      { root, threshold: 0.1 },
    );
    watch.observe(node);
    return () => {
      watch.disconnect();
      unwait();
    };
  }, [on]);
  return { ref, state };
}
