import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type ToggleEvent } from "react";
import { buttonLook, iconLook } from "../Button/control.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { rove } from "../roving.ts";
import { floating, usePlaced } from "./floating.ts";
import styles from "./Popover.module.css";

// What a popover and a menu share: a trigger and the native popover it opens (light dismiss and Esc
// are the browser's), unseen until placed, as its toggle event comes after it shows; the focus back
// on the trigger when it closes with the focus inside, which a browser that never focused it drops.
function useAnchored(kind: "dialog" | "menu") {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const insideRef = useRef(false);
  usePlaced(triggerRef, panelRef, { open, side: "below", align: "start" });
  const trigger = {
    ref: triggerRef,
    ...buttonLook("outline", "neutral", "m"),
    popoverTarget: id,
    "aria-haspopup": kind,
  };
  const panel = {
    ref: panelRef,
    id,
    popover: "auto" as const,
    role: kind,
    className: floating(styles["panel"]),
    "data-kind": kind,
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
  return { open, panelRef, trigger, panel };
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
  const { trigger, panel } = useAnchored("dialog");
  return (
    <>
      <button type="button" {...trigger}>
        {words}
      </button>
      <div {...panel} aria-label={label}>
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
  /** The trigger's words; with an icon, its name, which assistive technology reads and its tooltip shows. */
  trigger: string;
  label: string;
  items: MenuItem[];
  /** An icon in place of the words: the trigger is then square, as an IconButton. */
  icon?: IconName;
  /** An icon trigger's look, as an IconButton's: outline unless plain. */
  emphasis?: "outline" | "plain";
}

/** A list of acts under its trigger, its first item focused as it opens; the arrows move among the
 * items, round the ends, Home and End go to the ends, and an act closes it first (WAI-ARIA's menu). */
export function Menu({ trigger: words, label, items, icon, emphasis = "outline" }: MenuProps) {
  const { open, panelRef, trigger, panel } = useAnchored("menu");
  // Its first item, once placed and so seen: a hidden item takes no focus.
  useLayoutEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, [open, panelRef]);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.currentTarget.hidePopover();
      return;
    }
    rove(event, "[role='menuitem']", ["ArrowUp", "ArrowDown"]);
  };
  return (
    <>
      {icon === undefined ? (
        <button type="button" {...trigger}>
          {words}
        </button>
      ) : (
        <Tooltip label={words}>
          <button type="button" {...trigger} aria-label={words} {...iconLook(emphasis, "m")}>
            <Icon name={icon} size="m" />
          </button>
        </Tooltip>
      )}
      <div {...panel} aria-label={label} onKeyDown={move}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={styles["item"]}
            onClick={() => {
              panelRef.current?.hidePopover();
              // The trigger holds the focus as the item acts, which a browser that never focused it does not give back
              // on hiding: a dialog the item opens returns the focus there as it closes, never to the page.
              trigger.ref.current?.focus();
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
