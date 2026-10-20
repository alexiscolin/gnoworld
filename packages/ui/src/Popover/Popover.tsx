import {
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type ToggleEvent,
} from "react";
import { buttonLook } from "../Button/control.ts";
import { usePlaced } from "./floating.ts";
import styles from "./Popover.module.css";
import shared from "./surface.module.css";

/** A floating surface's classes, with a box's own. */
export function floating(own: string | undefined) {
  return [shared["surface"], shared["floating"], own].join(" ");
}

// What a popover and a menu share: the native popover (light dismiss and Esc are the browser's),
// unseen until placed, as its toggle event comes after it shows; the focus back on the trigger when
// it closes with the focus inside, which a browser that never focused the trigger would drop.
function useAnchored(onOpen?: (panel: HTMLElement) => void) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const insideRef = useRef(false);
  usePlaced(triggerRef, panelRef, { open, side: "below", align: "start" });
  const opened = useEffectEvent((panel: HTMLElement) => onOpen?.(panel));
  // Once placed, and so seen: a hidden item takes no focus.
  useLayoutEffect(() => {
    if (open && panelRef.current !== null) opened(panelRef.current);
  }, [open]);
  const events = {
    onBeforeToggle: (event: ToggleEvent<HTMLDivElement>) => {
      if (event.newState === "open") event.currentTarget.style.visibility = "hidden";
      else insideRef.current = event.currentTarget.contains(document.activeElement);
    },
    onToggle: (event: ToggleEvent<HTMLDivElement>) => {
      setOpen(event.newState === "open");
      if (event.newState === "open") return;
      const now = document.activeElement;
      if (insideRef.current && (now === null || now === document.body || event.currentTarget.contains(now)))
        triggerRef.current?.focus();
    },
  };
  return { id, triggerRef, panelRef, events };
}

export interface PopoverProps {
  /** The trigger's words. */
  trigger: string;
  /** What the panel is, for assistive technology. */
  label: string;
  children: ReactNode;
}

/** A panel under its trigger, closed by a click outside or Esc. */
export function Popover({ trigger: words, label, children }: PopoverProps) {
  const { id, triggerRef, panelRef, events } = useAnchored();
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        {...buttonLook("outline", "neutral", "m")}
        popoverTarget={id}
        aria-haspopup="dialog"
      >
        {words}
      </button>
      <div
        ref={panelRef}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={label}
        className={floating(styles["panel"])}
        {...events}
      >
        {children}
      </div>
    </>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
}

export interface MenuProps {
  trigger: string;
  label: string;
  items: MenuItem[];
}

// The keys a menu takes, as the item they go to from the focused one, of so many.
const MOVES: Record<string, (at: number, count: number) => number> = {
  ArrowDown: (at, count) => (at + 1) % count,
  ArrowUp: (at, count) => (at - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

/** A list of acts under its trigger, its first item focused as it opens; the arrows move among the
 * items, round the ends, Home and End go to the ends, and an act closes it first (WAI-ARIA's menu). */
export function Menu({ trigger: words, label, items }: MenuProps) {
  const { id, triggerRef, panelRef, events } = useAnchored((opened) => {
    opened.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  });
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.currentTarget.hidePopover();
      return;
    }
    const go = MOVES[event.key];
    const all = [...event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']")];
    const at = all.indexOf(event.target as HTMLElement);
    if (go === undefined || at === -1) return;
    event.preventDefault();
    all[go(at, all.length)]?.focus();
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        {...buttonLook("outline", "neutral", "m")}
        popoverTarget={id}
        aria-haspopup="menu"
      >
        {words}
      </button>
      <div
        ref={panelRef}
        id={id}
        popover="auto"
        role="menu"
        aria-label={label}
        className={floating(styles["panel"])}
        data-kind="menu"
        onKeyDown={move}
        {...events}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={styles["item"]}
            onClick={() => {
              panelRef.current?.hidePopover();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
