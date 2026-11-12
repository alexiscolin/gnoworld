// The loader that covers the whole page until the canvas says the dive started (data-dive, set by the scene when everything its first frame
// draws is ready, or past its 2.5 s wait): the black of space, the logo where the header's stands, and one thin bar filling with the share of
// what the first frame waits for. While it waits the page under it is inert, and its status holds the focus. It leaves by one fade, after the
// bar has finished its fill. The one seam of the loading screen: its look is this component and its CSS alone. It names no network.
import { Logo } from "@gnoworld/ui";
import { useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from "react";
import { holdChrome } from "./rise.ts";
import styles from "./SpaceLoader.module.css";

// The bar's fill, in quarters: a style attribute in the page's first HTML would be refused by its policy.
const STEPS = 4;

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

/** `waiting`: the canvas has not said its dive started; once it has, the bar finishes and the loader fades and is gone. `ready`: the share
 * of what the first frame waits for that is done, 0 to 1. */
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
  // Before the paint: the parts the loader covers are held out of the layout shifts the browser counts (what loads into them shifts nothing);
  // the commit that ends the wait shows them, under the loader's fade.
  useLayoutEffect(() => (waited && waiting ? holdChrome() : undefined), [waited, waiting]);
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
      <span className={styles["brand"]}>
        <Logo wordmark />
      </span>
      <span className={styles["bar"]} aria-hidden="true">
        <span className={styles["fill"]} data-step={Math.round((waiting ? Math.min(ready, 1) : 1) * STEPS)} />
      </span>
    </div>
  );
}
