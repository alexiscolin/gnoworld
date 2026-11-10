// The loader that covers the whole page until the canvas says the dive started (data-dive, set by the scene when everything its first frame
// draws is ready, or past its 2.5 s wait): the logo's mark, its moons turning, its ring filling with `ready`, the share of what the first
// frame waits for, and what gnoworld is. While it waits the page under it is inert, and its status holds the focus. It leaves in one
// moment: the arc completes, the mark opens outward and thins, the loader fades while the canvas opens as an iris (Universe.module.css),
// and the header and the hero rise in one after the other. The one seam of the loading screen: its look is this component and its CSS
// alone. It names no network.
import { Logo, Stack } from "@gnoworld/ui";
import { useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from "react";
import { holdChrome, riseChrome } from "./rise.ts";
import styles from "./SpaceLoader.module.css";

/** What gnoworld is, in the loader's words. */
const OPENING_TITLE = "The living map of gno.land.";
const OPENING_LINE =
  "Every realm is a world. Discover what's being built, follow what's trending, and talk with the people building it.";

// The rise starts as the iris is a third open: one clock with the loader's fade and the dive's (Universe.module.css, --motion-iris).
const RISE_AFTER = 280;

// Everything in the page but the loader and what holds it is inert (and so hidden from assistive technology); gives how to undo it.
function shield(own: HTMLElement): () => void {
  const held: Element[] = [];
  for (let node: Element | null = own; node !== null && node !== document.body; node = node.parentElement)
    for (const sibling of node.parentElement?.children ?? [])
      if (sibling !== node && !sibling.hasAttribute("inert")) {
        sibling.setAttribute("inert", "");
        held.push(sibling);
      }
  return () => {
    for (const each of held) each.removeAttribute("inert");
  };
}

/** `waiting`: the canvas has not said its dive started; once it has, the loader leaves and is gone. */
export function SpaceLoader({ waiting, ready }: { waiting: boolean; ready: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  // It stands only where it began by waiting: a return to the cosmos, its dive started, finds no loader.
  const [waited] = useState(waiting);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const own = boxRef.current;
    if (own === null || !waiting) return undefined;
    own.focus();
    return shield(own);
  }, [waiting]);
  // Before the paint: the parts that rise stay hidden under the loader (their layout is never drawn), and the commit that ends the wait
  // releases and rises them in one go, so no frame shows them between.
  useLayoutEffect(() => {
    if (!waited) return undefined;
    if (waiting) return holdChrome();
    riseChrome(RISE_AFTER);
    return undefined;
  }, [waited, waiting]);
  if (gone || !waited) return null;
  const left = (event: TransitionEvent) => {
    if (!waiting && event.target === event.currentTarget && event.propertyName === "opacity") setGone(true);
  };
  return (
    <div
      ref={boxRef}
      role="status"
      aria-label="Loading space"
      tabIndex={-1}
      className={styles["loader"]}
      data-leaving={waiting ? undefined : ""}
      onTransitionEnd={left}
    >
      <Stack>
        <span className={styles["mark"]}>
          <Logo progress={waiting ? ready : 1} />
        </span>
        <p className={styles["title"]}>{OPENING_TITLE}</p>
        <p className={styles["line"]}>{OPENING_LINE}</p>
      </Stack>
    </div>
  );
}
