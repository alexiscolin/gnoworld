import { useEffect } from "react";
import { motionWelcome } from "../motion.ts";

// A track change is no CSS transition (grid-column is not animatable): a card that spans 4 then 12 columns would send the cells around it to their new
// places in one frame. This eases them (FLIP): where each child stood before the change and where it stands after, it slides the one to the other.

/** A twelve-column grid's children glide to their new places when a span (data-span) or the children themselves change. */
export function useEase(root: HTMLElement | null, on: boolean) {
  useEffect(() => {
    if (!on || root === null || typeof root.animate !== "function" || typeof ResizeObserver !== "function") return;
    const grid = root;
    const places = new Map<Element, { x: number; y: number }>();
    const resizes = new ResizeObserver(() => {
      snap();
    });
    // The layout place, offsets: a getBoundingClientRect would hold a glide still running (its translate) and take it for where the child stands.
    const at = (child: HTMLElement) => {
      const own = child.offsetParent === root;
      return { x: child.offsetLeft - (own ? 0 : root.offsetLeft), y: child.offsetTop - (own ? 0 : root.offsetTop) };
    };
    function snap() {
      places.clear();
      for (const child of root?.children ?? []) if (child instanceof HTMLElement) places.set(child, at(child));
    }
    // Only the grid's own children and their `data-span` are watched, not the subtree: a card's inside changing (a chart redrawn at every frame of its
    // growth) would make this run at every frame, each time forcing a style and a layout.
    const sized = new Set<Element>();
    const moved = new MutationObserver(() => {
      const before = new Map(places);
      const slid: { child: HTMLElement; dx: number; dy: number }[] = [];
      for (const child of root.children) {
        const was = before.get(child);
        if (was === undefined || !(child instanceof HTMLElement)) continue;
        const now = at(child);
        const dx = was.x - now.x;
        const dy = was.y - now.y;
        if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) slid.push({ child, dx, dy });
      }
      // The design system's own glide (tokens.css), 0 s under reduced motion: read only when a child did move.
      if (slid.length > 0) {
        const tokens = getComputedStyle(root);
        const duration = parseFloat(tokens.getPropertyValue("--motion-slow"));
        const still = !(duration > 0) || !motionWelcome();
        if (!still) {
          const easing = tokens.getPropertyValue("--ease-standard").trim();
          for (const { child, dx, dy } of slid) {
            child.animate([{ translate: `${String(dx)}px ${String(dy)}px` }, { translate: "0 0" }], {
              duration,
              easing,
            });
          }
        }
      }
      snap();
      watch();
    });
    // What is already watched is left as it is (observing a node again would send its size once more).
    function watch() {
      moved.observe(grid, { childList: true });
      const here = new Set<Element>(grid.children);
      for (const child of here) {
        if (sized.has(child)) continue;
        sized.add(child);
        resizes.observe(child);
        moved.observe(child, { attributes: true, attributeFilter: ["data-span"] });
      }
      for (const child of sized) {
        if (here.has(child)) continue;
        sized.delete(child);
        resizes.unobserve(child);
      }
    }
    resizes.observe(root);
    snap();
    watch();
    return () => {
      moved.disconnect();
      resizes.disconnect();
    };
  }, [root, on]);
}
