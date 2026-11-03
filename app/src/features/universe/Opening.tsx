// The home's opening (ADR-0003 §1): what gnoworld is, over the dive, with no click asked. The words stay while the 3D loads and leave as the
// camera lands, which the scene's canvas says (data-dive), or once the scene ran its longest wait; a press, the wheel or a key shortens them,
// but Tab, which may be on its way to "What is gno.land?", and the focus in them holds them. Shown, the device keeps it: nothing shows twice.
import { Kicker } from "@gnoworld/ui";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createStore } from "zustand/vanilla";
import { isNewcomer, openingShown, openingShows } from "../../lib/newcomer.ts";
import type { SceneHost, SceneStatus, Shown } from "./host.ts";
import styles from "./Opening.module.css";

/** The longest the words wait for the camera to land once the scene runs: the dive's own, its 4 s wait for the whole cosmos and its 5.5 s
 * way down (core's DIVE), and a second. A number here, for core's dive would bring its code to the first screen; the opening's test ties
 * the two. */
export const OPENING_MOST = 10_500;
const GNO_LAND = "https://gno.land";
// Tab moves the focus, and a modifier comes down alone before the key it changes, Shift before a Tab going back: none shortens the words.
const HOLDING = new Set(["Tab", "Shift", "Control", "Alt", "Meta"]);

interface Ends {
  readonly words: HTMLElement;
  readonly scene: HTMLCanvasElement | null;
  /** Asks the words to go; they wait for the focus to leave them. */
  readonly leave: () => void;
  /** They go, once asked and the focus left them. */
  readonly gone: () => void;
}

// What ends the words, heard while they show: a press outside them, a key but Tab, the wheel, the camera landing, the focus leaving them.
function hearEnds({ words, scene, leave, gone }: Ends, signal: AbortSignal): void {
  const listening = { capture: true, signal };
  window.addEventListener(
    "pointerdown",
    ({ target }) => {
      if (!(target instanceof Node && words.contains(target))) leave();
    },
    listening,
  );
  window.addEventListener(
    "keydown",
    ({ key }) => {
      if (!HOLDING.has(key)) leave();
    },
    listening,
  );
  window.addEventListener("wheel", leave, { ...listening, passive: true });
  words.addEventListener(
    "focusout",
    ({ relatedTarget }) => {
      if (!(relatedTarget instanceof Node && words.contains(relatedTarget))) gone();
    },
    { signal },
  );
  if (scene === null) return;
  const landed = () => {
    if (scene.dataset["dive"] === "landed") leave();
  };
  const watching = new MutationObserver(landed);
  watching.observe(scene, { attributes: true, attributeFilter: ["data-dive"] });
  signal.addEventListener("abort", () => {
    watching.disconnect();
  });
  landed();
}

export function Opening({ canvas, status }: { canvas: RefObject<HTMLCanvasElement | null>; status: SceneStatus }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const askedRef = useRef(false);
  const [left, setLeft] = useState(false);
  useEffect(() => {
    openingShows();
  }, []);
  useEffect(() => {
    const words = boxRef.current;
    if (left || words === null) return undefined;
    const ending = new AbortController();
    const leave = () => {
      askedRef.current = true;
      if (!words.contains(document.activeElement)) setLeft(true);
    };
    const gone = () => {
      if (askedRef.current) setLeft(true);
    };
    hearEnds({ words, scene: canvas.current, leave, gone }, ending.signal);
    const timer = status === "on" ? setTimeout(leave, OPENING_MOST) : undefined;
    return () => {
      ending.abort();
      clearTimeout(timer);
    };
  }, [left, status, canvas]);
  return (
    <div ref={boxRef} className={styles["opening"]} data-opening="" data-left={left ? "" : undefined} inert={left}>
      <Kicker>gno.world</Kicker>
      <p className={styles["title"]}>The living map of gno.land.</p>
      <p className={styles["line"]}>
        Every realm is a world. Discover what&apos;s being built, follow what&apos;s trending, and talk with the people
        building it.
      </p>
      <a href={GNO_LAND} target="_blank" rel="noreferrer noopener" className={styles["about"]}>
        What is gno.land?
      </a>
    </div>
  );
}

/** Where the home's opening may show: decided at the first place the page shows, a newcomer's arrival on the cosmos alone, never a return
 * nor a shared link to another place; gone for good once the page leaves the cosmos. */
export function firstArrival() {
  const arrived = createStore<boolean | undefined>(() => undefined);
  return {
    subscribe: arrived.subscribe,
    opening: () => arrived.getState() === true,
    /** The page shows `shown` next. */
    at(shown: Shown): void {
      const was = arrived.getState();
      arrived.setState(
        was === undefined ? shown === "cosmos" && isNewcomer() && !openingShown() : was && shown === "cosmos",
        true,
      );
    },
  };
}

// Where the home dives: the scene loads or runs. Offered, refused or failed, no dive comes.
const dives = (status: SceneStatus) => status === "loading" || status === "asked" || status === "on";

/** The opening on the page's first arrival, while the home dives. */
export function HomeOpening({
  first,
  host,
  canvas,
}: {
  first: ReturnType<typeof firstArrival>;
  host: Pick<SceneHost, "subscribe" | "status">;
  canvas: RefObject<HTMLCanvasElement | null>;
}) {
  const opening = useSyncExternalStore(first.subscribe, first.opening);
  const status = useSyncExternalStore(host.subscribe, host.status);
  return opening && dives(status) ? <Opening canvas={canvas} status={status} /> : null;
}
