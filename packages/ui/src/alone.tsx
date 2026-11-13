// A card that opens alone (D13979): the plate holds which card is open, so two never are. A card asks `useAlone(id)` for its Expand button's state; the
// room around the cards (`Room`) swaps the plate for the opened card (flip.ts moves it: the others fade, the card grows from its cell), and puts the plate
// back as it was: scrolled where it was, the focus on the Expand button. With no motion (the reader asks for calm, or the browser cannot animate) the swap is
// at once. The sheet (utilities.css) hides what is not on the card's way.
import {
  createContext,
  use,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { holdsEscape } from "./escape.ts";
import {
  begin,
  cardOf,
  CLOSED,
  elsewhere,
  hide,
  measure,
  nameOf,
  OPENED,
  place,
  play,
  release,
  scrollerOf,
  type Back,
  type Move,
} from "./roomDom.ts";

// The room's toggle, one object for the room's life, and the open card's id apart: a context's value stays the same between draws.
interface Toggle {
  toggle: (id: string, from: HTMLElement | undefined) => void;
}
const ToggleContext = createContext<Toggle | undefined>(undefined);
const OpenContext = createContext<string | undefined>(undefined);

/** Whether the card `id` is open, whether its long lists show (`rows`) and the click that toggles it; with no `Room` around it the card opens in place by itself. */
export function useAlone(id: string) {
  const [own, setOwn] = useState(false);
  const room = use(ToggleContext);
  const current = use(OpenContext);
  const open = room === undefined ? own : current === id;
  // The rows a card opens to come a render after it opens, so a hundred of them are never in its first frame; at a close they go with it.
  const rows = useDeferredValue(open) && open;
  if (room === undefined) {
    return {
      open,
      rows,
      onToggle: () => {
        setOwn(!own);
      },
    };
  }
  return {
    open,
    rows,
    onToggle: (from?: HTMLElement) => {
      room.toggle(id, from);
    },
  };
}

// While a card is open: Escape closes it, a resize measures the room again, a block that comes is hidden as the others are.
function useWhileOpen(
  { rootRef, backRef }: { rootRef: RefObject<HTMLDivElement | null>; backRef: RefObject<Back | undefined> },
  open: string | undefined,
  toggle: (id: string, from: HTMLElement | undefined) => void,
) {
  const close = useEffectEvent((event: KeyboardEvent) => {
    const ours = event.key === "Escape" && open !== undefined && !holdsEscape(event) && !elsewhere(rootRef.current);
    if (!ours) return;
    // The key is the card's: space behind the page, which levels up on an Escape nobody took, must not take it too.
    event.preventDefault();
    toggle(open, backRef.current?.from);
  });
  const isOpen = open !== undefined;
  useEffect(() => {
    if (!isOpen) return undefined;
    const keys = (event: KeyboardEvent) => {
      close(event);
    };
    document.addEventListener("keydown", keys, true);
    const size = () => {
      measure(rootRef.current);
    };
    window.addEventListener("resize", size);
    return () => {
      document.removeEventListener("keydown", keys, true);
      window.removeEventListener("resize", size);
    };
  }, [isOpen, rootRef]);
  // A block that comes while the card is open (the rollup arriving, a chunk loading) is hidden as the others are; the watch ends in the close's own commit.
  useLayoutEffect(() => {
    const box = scrollerOf(rootRef.current);
    if (open === undefined || box === null) return undefined;
    const watch = new MutationObserver(() => {
      hide(box, open, backRef.current);
    });
    watch.observe(box, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
    };
  }, [open, rootRef, backRef]);
}

export interface RoomProps {
  children: ReactNode;
  [data: `data-${string}`]: string | undefined;
}

/** The element that holds the plate's cards: it decides which one is open, and its Escape closes it. */
export function Room({ children, ...rest }: RoomProps) {
  const [open, setOpen] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<Back>(undefined);
  const moveRef = useRef<Move>(undefined);
  const [said, setSaid] = useState("");
  // The room going (a new place, a route left) with a card open: its marks are off the page's, its fades stopped.
  useLayoutEffect(() => {
    const box = scrollerOf(rootRef.current);
    return () => {
      release(box, moveRef.current);
    };
  }, []);
  useLayoutEffect(() => {
    const box = scrollerOf(rootRef.current);
    place(box, open, backRef.current);
    if (moveRef.current !== undefined) play(box, open, moveRef.current);
    moveRef.current = undefined;
  }, [open]);
  const toggle = (id: string, from: HTMLElement | undefined) => {
    if (moveRef.current !== undefined) return;
    const box = scrollerOf(rootRef.current);
    const next = open === id ? undefined : id;
    const card = cardOf(from, backRef.current);
    if (next !== undefined) backRef.current = { scroll: box?.scrollTop ?? 0, page: window.scrollY, from, card };
    measure(rootRef.current);
    const move = begin(box, card, next === undefined ? "close" : open === undefined ? "open" : "switch");
    const name = nameOf(card);
    const swap = () => {
      setOpen(next);
      setSaid(next === undefined ? CLOSED : OPENED(name));
    };
    if (move === undefined) {
      swap();
      return;
    }
    moveRef.current = move;
    void Promise.all(move.fades.map((fade) => fade.finished)).then(swap, swap);
  };
  const toggleRef = useRef(toggle);
  useLayoutEffect(() => {
    toggleRef.current = toggle;
  });
  const [room] = useState<Toggle>(() => ({
    toggle: (id, from) => {
      toggleRef.current(id, from);
    },
  }));
  useWhileOpen({ rootRef, backRef }, open, toggle);
  return (
    <ToggleContext value={room}>
      <OpenContext value={open}>
        <div {...rest} ref={rootRef}>
          {children}
          <p role="status" className="visually-hidden">
            {said}
          </p>
        </div>
      </OpenContext>
    </ToggleContext>
  );
}
